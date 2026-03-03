/**
 * HL MOMENTUM SCALPER v2
 *
 * Improvements over v1:
 *   - Multi-timeframe confirmation: 5m momentum + 15m trend alignment
 *   - RSI(14) filter from 1m candles: avoids chasing overbought/oversold
 *   - ATR(14) dynamic TP/SL: adapts stops to current volatility
 *   - Volume confirmation: momentum must be on above-avg volume
 *   - Funding rate filter: avoids crowded/expensive funding-side trades
 *   - Composite signal score (0-93): only trade when score ≥ MIN_SCORE
 *   - Faster position monitoring: 3s (was 8s)
 *   - 5 coins: BTC, ETH, SOL, AVAX, DOGE (was 3)
 *   - Best-score coin selection: picks coin with highest composite score
 *
 * Signal score breakdown (max 93):
 *   5m momentum strength:    10-30 pts
 *   15m trend alignment:    -15 to +20 pts
 *   RSI confirmation:       -30 to +20 pts
 *   Volume spike:              0 to +15 pts
 *   Funding rate:            -20 to  +8 pts
 *
 * Usage: npm run hl:scalper
 */

import WebSocket from 'ws';
(globalThis as any).WebSocket = WebSocket;

import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { createAuthenticatedSession, GDEXSession } from './auth';

// ─── Config ───────────────────────────────────────────────────────────────────

const COINS         = ['BTC', 'ETH', 'SOL', 'AVAX', 'DOGE'];
const TRADE_USD     = 11.5;    // ~$11.50 notional per trade
const TP_PCT        = 0.03;    // fallback TP if ATR unavailable
const SL_PCT        = 0.015;   // fallback SL if ATR unavailable
const CRASH_SL_PCT  = 0.025;   // exchange-level crash protection SL
const TRAIL_TRIGGER = 0.015;   // start trailing after +1.5% profit
const TRAIL_DIST    = 0.010;   // trail SL 1% behind peak
const MOMENTUM_PCT  = 1.2;     // 5-min % change required to enter scan pool
const MOMENTUM_WIN  = 5 * 60_000;
const POLL_MS       = 30_000;  // 30s price + candle poll
const MONITOR_MS    = 3_000;   // 3s position check (v1 was 8s)
const MAX_HOLD_MS   = 10 * 60_000;
const COOLDOWN_MS   = 90_000;
const ENTRY_SLIP    = 0.002;
const CLOSE_SLIP    = 0.004;

// Signal scoring
const MIN_SCORE     = 52;      // minimum composite score to enter

// ATR-based dynamic TP/SL
const ATR_PERIOD    = 14;
const ATR_TP_MULT   = 2.5;    // TP = 2.5x ATR (risk:reward ~2.5:1)
const ATR_SL_MULT   = 1.0;    // SL = 1.0x ATR

// RSI filter thresholds
const RSI_PERIOD    = 14;      // RSI lookback period
const RSI_OB        = 70;      // overbought — avoid longs
const RSI_OS        = 30;      // oversold — avoid shorts

// Volume confirmation
const VOL_SPIKE_MULT = 1.2;   // last candle volume must be ≥ 1.2x rolling avg

// Funding rate filter (basis points per 8h)
const MAX_FUND_BPS  = 2.5;    // 2.5 bps = 0.025% per 8h

const HL_CUSTODIAL  = '0x886e83feb8d1774afab4a32047a083434354c6f0';
const HL_INFO_URL   = 'https://api.hyperliquid.xyz/info';

const DATA_DIR      = path.join(__dirname, '../data');
const LOG_FILE      = path.join(DATA_DIR, 'scalper-trades.json');
const STATE_FILE    = path.join(DATA_DIR, 'scalper-state.json');

// ─── Types ────────────────────────────────────────────────────────────────────

interface PricePoint { price: number; ts: number; }

interface Position {
  coin: string;
  isLong: boolean;
  size: string;
  entryPrice: number;
  tpPrice: number;
  slPrice: number;
  openedAt: number;
  trailPeak: number;
  trailActive: boolean;
  isResumed: boolean;
}

interface TradeRecord {
  coin: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  pnlUsd: number;
  pnlPct: number;
  exitReason: 'TP' | 'SL' | 'TRAIL' | 'TIMEOUT';
  duration: string;
  time: string;
  date: string;
}

// HL candle from candleSnapshot
interface Candle {
  t: number;   // open time ms
  T: number;   // close time ms
  o: string;   // open
  h: string;   // high
  l: string;   // low
  c: string;   // close
  v: string;   // volume (base asset)
}

interface CandleCache {
  m1: Candle[];
  m15: Candle[];
  ts: number;  // when cached
}

interface SignalScore {
  score: number;
  reasons: string[];
  rsi: number;
  atr: number;
  atrPct: number;
  volSpike: boolean;
  mom15m: number;
  funding: number;
}

// ─── State ────────────────────────────────────────────────────────────────────

type ScalpState = 'SCANNING' | 'IN_POSITION' | 'COOLDOWN';

let scalpState: ScalpState = 'SCANNING';
let position: Position | null = null;
let cooldownUntil = 0;
let nextPollAt = 0;
let custodialAddr = HL_CUSTODIAL;
let hlBalance = 0;

const priceHistory: Record<string, PricePoint[]> = Object.fromEntries(COINS.map(c => [c, []]));
const currentPrices: Record<string, number> = {};
const tradeHistory: TradeRecord[] = [];
const logs: string[] = [];

// Candle + fundamental data
const candleCache: Record<string, CandleCache> = {};
const fundingRates: Record<string, number> = {};  // coin → rate as decimal (0.0001 = 0.01%)
let lastFundingRefresh = 0;
const cachedScores: Record<string, SignalScore & { isLong: boolean }> = {};

// ─── Persistence ──────────────────────────────────────────────────────────────

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadTrades() {
  try {
    const raw = fs.readFileSync(LOG_FILE, 'utf8');
    const saved: TradeRecord[] = JSON.parse(raw);
    tradeHistory.push(...saved);
  } catch { /* no file yet */ }
}

function saveTrades() {
  ensureDataDir();
  fs.writeFileSync(LOG_FILE, JSON.stringify(tradeHistory, null, 2));
}

function saveState() {
  if (!position) return;
  ensureDataDir();
  fs.writeFileSync(STATE_FILE, JSON.stringify(position, null, 2));
}

function clearState() {
  try { fs.unlinkSync(STATE_FILE); } catch { /* already gone */ }
}

function loadSavedPosition(): Position | null {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    return { ...JSON.parse(raw), isResumed: true };
  } catch { return null; }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addLog(msg: string) {
  const ts = new Date().toLocaleTimeString();
  logs.unshift(`\x1b[2m[${ts}]\x1b[0m ${msg}`);
  if (logs.length > 15) logs.pop();
}

function fmtDur(ms: number): string {
  const s = Math.floor(Math.abs(ms) / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m${s % 60}s`;
}

function fmtPct(p: number): string {
  const color = p >= 0 ? '\x1b[32m' : '\x1b[31m';
  return `${color}${p >= 0 ? '+' : ''}${p.toFixed(2)}%\x1b[0m`;
}

function fmtUsd(u: number): string {
  const color = u >= 0 ? '\x1b[32m' : '\x1b[31m';
  return `${color}${u >= 0 ? '+' : ''}$${u.toFixed(2)}\x1b[0m`;
}

function vlen(s: string): number { return s.replace(/\x1b\[[0-9;]*m/g, '').length; }
function padV(s: string, n: number): string {
  const v = vlen(s); return v >= n ? s : s + ' '.repeat(n - v);
}

function momentum5m(coin: string): number {
  const hist = priceHistory[coin] || [];
  const now = Date.now();
  const cutoff = now - MOMENTUM_WIN;
  const recent = hist.filter(p => p.ts >= cutoff);
  const current = currentPrices[coin];
  if (!current || recent.length === 0) return 0;
  const oldest = recent[0].price;
  return ((current - oldest) / oldest) * 100;
}

function momentumBar(pct: number): string {
  const max = 3;
  const abs = Math.min(Math.abs(pct), max);
  const filled = Math.round((abs / max) * 8);
  const empty = 8 - filled;
  const color = pct > MOMENTUM_PCT ? '\x1b[1m\x1b[32m'
    : pct < -MOMENTUM_PCT ? '\x1b[1m\x1b[31m' : '\x1b[33m';
  return color + '█'.repeat(filled) + '\x1b[2m' + '░'.repeat(empty) + '\x1b[0m';
}

// ─── HL Candle + Funding Data ─────────────────────────────────────────────────

async function fetchCandlesHL(coin: string, interval: string, count: number): Promise<Candle[]> {
  const intervalMs: Record<string, number> = {
    '1m': 60_000, '3m': 3 * 60_000, '5m': 5 * 60_000, '15m': 15 * 60_000,
  };
  const endTime = Date.now();
  const startTime = endTime - (intervalMs[interval] ?? 60_000) * (count + 2);

  const res = await axios.post(HL_INFO_URL, {
    type: 'candleSnapshot',
    req: { coin, interval, startTime, endTime },
  }, { headers: { 'Content-Type': 'application/json' }, timeout: 6000 });

  return Array.isArray(res.data) ? res.data : [];
}

async function refreshCandleCache(): Promise<void> {
  await Promise.allSettled(COINS.map(async (coin) => {
    try {
      const [m1, m15] = await Promise.all([
        fetchCandlesHL(coin, '1m', 20),
        fetchCandlesHL(coin, '15m', 20),
      ]);
      if (m1.length > 0 || m15.length > 0) {
        candleCache[coin] = { m1, m15, ts: Date.now() };
      }
    } catch { /* keep stale data */ }
  }));
}

async function refreshFundingRates(): Promise<void> {
  if (Date.now() - lastFundingRefresh < 5 * 60_000) return;
  try {
    const res = await axios.post(HL_INFO_URL,
      { type: 'metaAndAssetCtxs' },
      { headers: { 'Content-Type': 'application/json' }, timeout: 6000 },
    );
    const [meta, ctxs] = res.data as [{ universe: { name: string }[] }, { funding: string }[]];
    meta.universe.forEach((asset, i) => {
      const rate = parseFloat(ctxs[i]?.funding ?? '0');
      if (!isNaN(rate)) fundingRates[asset.name] = rate;
    });
    lastFundingRefresh = Date.now();
  } catch { /* keep stale */ }
}

// ─── Technical Indicators ─────────────────────────────────────────────────────

function calcRSI(candles: Candle[], period = RSI_PERIOD): number {
  const closes = candles.map(c => parseFloat(c.c)).filter(v => !isNaN(v));
  if (closes.length < period + 1) return 50; // neutral fallback
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  const avgG = gains / period;
  const avgL = losses / period;
  if (avgL === 0) return 100;
  return 100 - (100 / (1 + avgG / avgL));
}

function calcATR(candles: Candle[], period = ATR_PERIOD): number {
  if (candles.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const h = parseFloat(candles[i].h);
    const l = parseFloat(candles[i].l);
    const pc = parseFloat(candles[i - 1].c);
    if (isNaN(h) || isNaN(l) || isNaN(pc)) continue;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const recent = trs.slice(-period);
  if (recent.length === 0) return 0;
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

/** Momentum of last ~1h using 15m candles */
function calc15mMom(candles: Candle[]): number {
  if (candles.length < 4) return 0;
  const recent = candles.slice(-4); // 4 × 15m = 1h lookback
  const first = parseFloat(recent[0].o);
  const last = parseFloat(recent[recent.length - 1].c);
  if (isNaN(first) || isNaN(last) || first === 0) return 0;
  return ((last - first) / first) * 100;
}

function isVolSpike(candles: Candle[]): boolean {
  if (candles.length < 5) return false;
  const vols = candles.map(c => parseFloat(c.v)).filter(v => !isNaN(v));
  if (vols.length < 3) return false;
  const lastVol = vols[vols.length - 1];
  const prevVols = vols.slice(-Math.min(10, vols.length - 1), -1);
  if (prevVols.length === 0) return false;
  const avgVol = prevVols.reduce((a, b) => a + b, 0) / prevVols.length;
  return avgVol > 0 && lastVol >= avgVol * VOL_SPIKE_MULT;
}

// ─── Signal Scoring ───────────────────────────────────────────────────────────

/**
 * Composite signal score 0→93.
 * MIN_SCORE (52) requires at least strong momentum + 15m alignment,
 * or strong momentum + good RSI + volume spike.
 */
function scoreSignal(coin: string, isLong: boolean, mom5m: number): SignalScore {
  const cache = candleCache[coin];
  const cacheAge = cache ? Date.now() - cache.ts : Infinity;
  const cacheReady = cacheAge < 90_000; // consider stale after 90s

  const reasons: string[] = [];
  let score = 0;

  // ── 1. 5m momentum magnitude (10-30 pts) ──────────────────────────────────
  const absMom = Math.abs(mom5m);
  const momPts = absMom >= 3 ? 30 : absMom >= 2 ? 22 : absMom >= 1.5 ? 16 : 10;
  score += momPts;
  reasons.push(`m5:${mom5m.toFixed(1)}%(${momPts})`);

  if (!cacheReady) {
    reasons.push('candles:loading');
    return { score, reasons, rsi: 50, atr: 0, atrPct: 0, volSpike: false, mom15m: 0, funding: 0 };
  }

  const m1 = cache.m1;
  const m15 = cache.m15;

  // ── 2. 15m trend alignment (-15 to +20 pts) ───────────────────────────────
  const mom15m = calc15mMom(m15);
  if (m15.length >= 4) {
    const strongAgree = isLong ? mom15m > 0.5 : mom15m < -0.5;
    const slightAgree = isLong ? mom15m > 0 : mom15m < 0;
    const oppose = isLong ? mom15m < -0.3 : mom15m > 0.3;
    const m15pts = strongAgree ? 20 : slightAgree ? 8 : oppose ? -15 : 0;
    score += m15pts;
    reasons.push(`m15:${mom15m.toFixed(1)}%(${m15pts})`);
  } else {
    mom15m; // keep TS happy — value used in return below
    reasons.push('m15:n/a');
  }

  // ── 3. RSI confirmation (-30 to +20 pts) ──────────────────────────────────
  const rsi = calcRSI(m1);
  if (m1.length >= RSI_PERIOD + 1) {
    let rsiPts: number;
    if (isLong) {
      if (rsi < 40)       rsiPts = 20;  // oversold → potential bounce
      else if (rsi < 55)  rsiPts = 20;  // sweet spot for longs
      else if (rsi < 65)  rsiPts = 8;   // slightly stretched
      else if (rsi < RSI_OB) rsiPts = -5; // getting overbought
      else                rsiPts = -30; // overbought — strong blocker
    } else {
      if (rsi > 60)       rsiPts = 20;  // overbought → fade
      else if (rsi > 45)  rsiPts = 20;  // sweet spot for shorts
      else if (rsi > 35)  rsiPts = 8;
      else if (rsi > RSI_OS) rsiPts = -5;
      else                rsiPts = -30; // oversold — strong blocker
    }
    score += rsiPts;
    reasons.push(`RSI:${rsi.toFixed(0)}(${rsiPts})`);
  } else {
    reasons.push('RSI:n/a');
  }

  // ── 4. Volume spike (+15 or 0 pts) ────────────────────────────────────────
  const volSpike = isVolSpike(m1);
  if (m1.length >= 5) {
    const volPts = volSpike ? 15 : 0;
    score += volPts;
    reasons.push(`vol:${volSpike ? 'spike' : 'avg'}(${volPts})`);
  }

  // ── 5. Funding rate (-20 to +8 pts) ───────────────────────────────────────
  const funding = fundingRates[coin] ?? 0;
  const fundBps = funding * 10000; // convert decimal to basis points
  let fundPts: number;
  if (isLong) {
    if (fundBps > MAX_FUND_BPS)  fundPts = -20; // longs paying a lot — crowded
    else if (fundBps > 0)        fundPts = 0;   // longs pay slightly — neutral
    else if (fundBps > -MAX_FUND_BPS) fundPts = 5; // longs get paid slightly — good
    else                         fundPts = 8;   // strong negative funding — contrarian
  } else {
    if (fundBps < -MAX_FUND_BPS) fundPts = -20; // shorts paying a lot — crowded
    else if (fundBps < 0)        fundPts = 0;
    else if (fundBps < MAX_FUND_BPS) fundPts = 5;
    else                         fundPts = 8;
  }
  if (Object.keys(fundingRates).length > 0) {
    score += fundPts;
    reasons.push(`fund:${fundBps.toFixed(2)}bps(${fundPts})`);
  }

  const atr = calcATR(m1);
  const price = currentPrices[coin] || 1;
  const atrPct = (atr / price) * 100;

  return { score, reasons, rsi, atr, atrPct, volSpike, mom15m, funding };
}

// ─── HL API helpers ────────────────────────────────────────────────────────────

async function hlInfo(body: object): Promise<any> {
  const res = await axios.post(HL_INFO_URL, body, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 8000,
  });
  return res.data;
}

async function getHlPosition(coin: string): Promise<{ szi: number; entryPx: number } | null> {
  try {
    const state = await hlInfo({ type: 'clearinghouseState', user: custodialAddr });
    for (const p of (state.assetPositions || [])) {
      if (p.position.coin === coin) {
        const szi = parseFloat(p.position.szi);
        if (szi !== 0) return { szi, entryPx: parseFloat(p.position.entryPx) };
      }
    }
  } catch { /* non-fatal */ }
  return null;
}

// ─── Order execution via SDK ──────────────────────────────────────────────────

async function placeOrder(
  session: GDEXSession,
  coin: string,
  isLong: boolean,
  price: number,
  size: string,
  reduceOnly: boolean,
  tpPx = '0',
  slPx = '0',
): Promise<{ isSuccess: boolean; error?: string }> {
  const slip = reduceOnly ? CLOSE_SLIP : ENTRY_SLIP;
  const limitPx = (isLong
    ? price * (1 + slip)
    : price * (1 - slip)
  ).toFixed(4);

  try {
    const result = await session.sdk.hyperLiquid.hlCreateOrder(
      session.walletAddress,
      coin,
      isLong,
      limitPx,
      size,
      tpPx,
      slPx,
      reduceOnly,
      false,
      session.tradingPrivateKey,
    );
    if ((result as any)?.isSuccess) return { isSuccess: true };
    return { isSuccess: false, error: JSON.stringify(result) };
  } catch (err: any) {
    return { isSuccess: false, error: err.response?.data?.message ?? err.message };
  }
}

// ─── Compute size for target notional ────────────────────────────────────────

function calcSize(coin: string, price: number): string {
  const szDecimals: Record<string, number> = {
    BTC: 5, ETH: 4, SOL: 2, AVAX: 2, DOGE: 0, LINK: 2, ARB: 1,
  };
  const dec = szDecimals[coin] ?? 3;
  const mult = Math.pow(10, dec);
  const size = Math.ceil((TRADE_USD / price) * mult) / mult;
  return size.toFixed(dec);
}

// ─── ATR-based TP/SL ─────────────────────────────────────────────────────────

function calcTpSl(coin: string, price: number, isLong: boolean) {
  const cache = candleCache[coin];
  const atr = cache ? calcATR(cache.m1) : 0;
  const atrPct = atr / price;

  // Use ATR if within sensible bounds (0.05% to 5% of price)
  if (atr > 0 && atrPct >= 0.0005 && atrPct <= 0.05) {
    const tpDist = Math.max(atr * ATR_TP_MULT, price * 0.008); // floor 0.8%
    const slDist = Math.max(atr * ATR_SL_MULT, price * 0.005); // floor 0.5%
    return {
      tpPrice: isLong ? price + tpDist : price - tpDist,
      slPrice: isLong ? price - slDist : price + slDist,
      crashSlPrice: isLong ? price * (1 - CRASH_SL_PCT) : price * (1 + CRASH_SL_PCT),
      method: `ATR×${ATR_TP_MULT}/${ATR_SL_MULT} (${(atrPct * 100).toFixed(2)}%)`,
    };
  }

  // Fallback: fixed percentages
  return {
    tpPrice: isLong ? price * (1 + TP_PCT) : price * (1 - TP_PCT),
    slPrice: isLong ? price * (1 - SL_PCT) : price * (1 + SL_PCT),
    crashSlPrice: isLong ? price * (1 - CRASH_SL_PCT) : price * (1 + CRASH_SL_PCT),
    method: `fixed ${(TP_PCT * 100).toFixed(0)}%/${(SL_PCT * 100).toFixed(0)}%`,
  };
}

// ─── Terminal display ──────────────────────────────────────────────────────────

function render() {
  const W = Math.max(80, Math.min(process.stdout.columns || 100, 110));
  const INNER = W - 4;

  const C = {
    RST: '\x1b[0m', BOLD: '\x1b[1m', DIM: '\x1b[2m',
    RED: '\x1b[31m', GRN: '\x1b[32m', YEL: '\x1b[33m',
    CYN: '\x1b[36m', WHT: '\x1b[37m', MAG: '\x1b[35m',
  };

  function hline(l: string, f: string, r: string, title = '') {
    if (title) {
      const t = ` ${title} `;
      const sides = W - 2 - t.length;
      const left = Math.floor(sides / 2);
      return l + f.repeat(left) + C.BOLD + C.YEL + t + C.RST + f.repeat(W - 2 - left - t.length) + r;
    }
    return l + f.repeat(W - 2) + r;
  }

  function row(content: string) {
    const pad = Math.max(0, INNER - vlen(content));
    return `${C.CYN}║${C.RST} ${content}${' '.repeat(pad)} ${C.CYN}║${C.RST}`;
  }

  const lines: string[] = [];

  lines.push(C.CYN + hline('╔', '═', '╗', 'HL MOMENTUM SCALPER v2') + C.RST);

  // Status bar
  const stateStr = scalpState === 'SCANNING'    ? `${C.GRN}SCANNING${C.RST}`
                 : scalpState === 'IN_POSITION' ? `${C.YEL}IN POSITION${C.RST}`
                 : `${C.DIM}COOLDOWN${C.RST}`;
  const cdLeft = Math.max(0, cooldownUntil - Date.now());
  const pollLeft = Math.max(0, nextPollAt - Date.now());
  const timeInfo = scalpState === 'IN_POSITION' ? `mon:${fmtDur(MONITOR_MS)}`
    : scalpState === 'COOLDOWN' ? `cd:${fmtDur(cdLeft)}`
    : `poll:${fmtDur(pollLeft)}`;
  const totalTrades = tradeHistory.length;
  const allWins = tradeHistory.filter(t => t.pnlUsd > 0).length;
  const hasFunding = Object.keys(fundingRates).length > 0;
  const hasCandles = Object.keys(candleCache).length > 0;
  const dataStr = `${hasCandles ? `${C.GRN}C${C.RST}` : `${C.DIM}c${C.RST}`}${hasFunding ? `${C.GRN}F${C.RST}` : `${C.DIM}f${C.RST}`}`;
  lines.push(row(
    padV(`Bal:${C.BOLD}$${hlBalance.toFixed(2)}${C.RST}  ${stateStr}  ${timeInfo}  Trades:${allWins}W/${totalTrades - allWins}L  data:${dataStr}  minScore:${MIN_SCORE}`, INNER)
  ));

  // Prices + momentum + signal scores
  lines.push(C.CYN + hline('╠', '═', '╣', 'PRICES  MOMENTUM(5m)  SIGNAL SCORE') + C.RST);
  lines.push(row(padV(
    `  ${C.DIM}COIN   PRICE           MOMENTUM          SCORE  RSI   ATR%  VOL  M15%${C.RST}`,
    INNER,
  )));

  for (const coin of COINS) {
    const price = currentPrices[coin];
    const mom = momentum5m(coin);
    const cache = candleCache[coin];
    const scoreInfo = cachedScores[coin];

    const priceStr = price
      ? `${C.BOLD}$${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}${C.RST}`
      : `${C.DIM}---${C.RST}`;

    const bar = momentumBar(mom);
    const momStr = `${bar} ${fmtPct(mom)}`;

    // Score display
    let scoreStr: string;
    if (scoreInfo) {
      const col = scoreInfo.score >= MIN_SCORE
        ? (scoreInfo.isLong ? C.GRN : C.RED) + C.BOLD
        : C.DIM;
      const dir = scoreInfo.isLong ? 'L' : 'S';
      scoreStr = `${col}${dir}${scoreInfo.score.toString().padStart(3)}${C.RST}`;
    } else {
      scoreStr = `${C.DIM} ---${C.RST}`;
    }

    // Indicators from candle cache
    const rsi = cache && cache.m1.length > RSI_PERIOD ? calcRSI(cache.m1).toFixed(0).padStart(3) : ' --';
    const atrP = cache ? ((calcATR(cache.m1) / (price || 1)) * 100).toFixed(2) : '--';
    const vol = cache && cache.m1.length >= 5 ? (isVolSpike(cache.m1) ? `${C.GRN}↑${C.RST}` : `${C.DIM}·${C.RST}`) : `${C.DIM}?${C.RST}`;
    const m15 = cache && cache.m15.length >= 4
      ? (() => {
          const v = calc15mMom(cache.m15);
          const col = v > 0.3 ? C.GRN : v < -0.3 ? C.RED : C.DIM;
          return `${col}${v >= 0 ? '+' : ''}${v.toFixed(1)}${C.RST}`;
        })()
      : `${C.DIM}--${C.RST}`;

    const coinLine = `  ${C.BOLD}${coin.padEnd(5)}${C.RST}${padV(priceStr, 14)}  ${padV(momStr, 22)}  ${scoreStr}  ${rsi}  ${atrP.padStart(5)}  ${vol}   ${padV(m15, 6)}`;
    lines.push(row(padV(coinLine, INNER)));
  }

  const pts = COINS.map(c => (priceHistory[c] || []).filter(p => p.ts >= Date.now() - MOMENTUM_WIN).length);
  lines.push(row(padV(
    `  ${C.DIM}Threshold:±${MOMENTUM_PCT}%  Score≥${MIN_SCORE}  ATR TP:${ATR_TP_MULT}x SL:${ATR_SL_MULT}x  pts:[${pts.join(',')}]${C.RST}`,
    INNER,
  )));

  // Open position
  lines.push(C.CYN + hline('╠', '═', '╣', position ? 'OPEN POSITION' : 'NO POSITION') + C.RST);
  if (position) {
    const elapsed = Date.now() - position.openedAt;
    const mark = currentPrices[position.coin] || position.entryPrice;
    const rawPnl = (mark - position.entryPrice) * parseFloat(position.size) * (position.isLong ? 1 : -1);
    const pnlPct = (rawPnl / (position.entryPrice * parseFloat(position.size))) * 100;
    const dirStr = position.isLong ? `${C.GRN}LONG${C.RST}` : `${C.RED}SHORT${C.RST}`;
    const timeout = Math.max(0, MAX_HOLD_MS - elapsed);
    const resumedTag = position.isResumed ? ` ${C.DIM}[resumed]${C.RST}` : '';

    lines.push(row(padV(
      `  ${C.BOLD}${position.coin}${C.RST} ${dirStr}  ${C.BOLD}${position.size}${C.RST} @ ${C.BOLD}$${position.entryPrice.toFixed(4)}${C.RST}   hold:${C.YEL}${fmtDur(elapsed)}${C.RST}  timeout:${fmtDur(timeout)}${resumedTag}`,
      INNER,
    )));
    lines.push(row(padV(
      `  Mark: ${C.BOLD}$${mark.toFixed(4)}${C.RST}   PnL: ${fmtUsd(rawPnl)} (${fmtPct(pnlPct)})`,
      INNER,
    )));

    const trailTag = position.trailActive
      ? ` ${C.GRN}[trailing]${C.RST} peak:${C.BOLD}$${position.trailPeak.toFixed(4)}${C.RST}`
      : ` ${C.DIM}[trail @+${(TRAIL_TRIGGER * 100).toFixed(0)}%]${C.RST}`;
    lines.push(row(padV(
      `  TP: ${C.GRN}$${position.tpPrice.toFixed(4)}${C.RST}  SL: ${C.RED}$${position.slPrice.toFixed(4)}${C.RST}${trailTag}`,
      INNER,
    )));
  } else if (scalpState === 'COOLDOWN') {
    lines.push(row(padV(`  ${C.DIM}Cooling down ${fmtDur(cdLeft)}...${C.RST}`, INNER)));
  } else {
    lines.push(row(padV(`  ${C.DIM}Scanning — need ±${MOMENTUM_PCT}% momentum + score≥${MIN_SCORE}...${C.RST}`, INNER)));
  }

  // Trade history
  const wins = tradeHistory.filter(t => t.pnlUsd > 0).length;
  const totalPnl = tradeHistory.reduce((s, t) => s + t.pnlUsd, 0);
  const histTitle = tradeHistory.length > 0
    ? `TRADES: ${wins}W/${tradeHistory.length - wins}L  ${fmtUsd(totalPnl)}`
    : 'TRADE HISTORY';
  lines.push(C.CYN + hline('╠', '═', '╣', histTitle) + C.RST);
  const recent = [...tradeHistory].reverse().slice(0, 4);
  if (recent.length === 0) {
    lines.push(row(padV(`  ${C.DIM}No trades yet — waiting for scored momentum signal...${C.RST}`, INNER)));
  } else {
    for (const t of recent) {
      const exitColor = t.exitReason === 'TP' ? C.GRN
        : t.exitReason === 'SL' ? C.RED : C.YEL;
      lines.push(row(padV(
        `  ${C.DIM}${t.time}${C.RST}  ${C.BOLD}${t.coin}${C.RST} ${t.direction}  ` +
        `${exitColor}${t.exitReason}${C.RST}  ` +
        `$${t.entryPrice.toFixed(2)}→$${t.exitPrice.toFixed(2)}  ` +
        `${fmtUsd(t.pnlUsd)} (${fmtPct(t.pnlPct)})  ${C.DIM}${t.duration}${C.RST}`,
        INNER,
      )));
    }
  }

  // Logs
  lines.push(C.CYN + hline('╠', '═', '╣', 'LOGS') + C.RST);
  for (const log of logs.slice(0, 5)) {
    lines.push(row(padV(log, INNER)));
  }
  lines.push(C.CYN + hline('╚', '═', '╝') + C.RST);

  const HOME = '\x1b[H', CLREOL = '\x1b[K', HIDE = '\x1b[?25l';
  let frame = HOME + HIDE;
  for (const l of lines) frame += l + CLREOL + '\n';
  frame += CLREOL + '\n';
  process.stdout.write(frame);
}

// ─── Core loop ────────────────────────────────────────────────────────────────

async function fetchPrices(session: GDEXSession) {
  const prices = await session.sdk.hyperLiquid.getMultipleHyperliquidMarkPrices(COINS);
  const now = Date.now();
  for (const coin of COINS) {
    const p = prices[coin];
    if (!p) continue;
    currentPrices[coin] = p;
    priceHistory[coin].push({ price: p, ts: now });
    const cutoff = now - 10 * 60_000;
    priceHistory[coin] = priceHistory[coin].filter(pt => pt.ts >= cutoff);
  }
}

async function openPosition(session: GDEXSession, coin: string, isLong: boolean, sig: SignalScore) {
  const price = currentPrices[coin];
  if (!price) { addLog(`⚠️  No price for ${coin}`); return; }

  const size = calcSize(coin, price);
  const notional = parseFloat(size) * price;

  if (notional < 11) {
    addLog(`⚠️  Notional $${notional.toFixed(2)} < $11 min for ${coin}`);
    return;
  }

  const { tpPrice, slPrice, crashSlPrice, method } = calcTpSl(coin, price, isLong);
  const dir = isLong ? 'LONG' : 'SHORT';

  addLog(`🚀 ${dir} ${coin} @ $${price.toFixed(4)} size:${size} score:${sig.score} (${method})`);
  addLog(`   ${sig.reasons.slice(0, 5).join(' ')}`);

  const result = await placeOrder(
    session, coin, isLong, price, size, false,
    '0',
    crashSlPrice.toFixed(4),
  );

  if (result.isSuccess) {
    position = {
      coin, isLong, size, entryPrice: price,
      tpPrice, slPrice,
      openedAt: Date.now(),
      trailPeak: price,
      trailActive: false,
      isResumed: false,
    };
    scalpState = 'IN_POSITION';
    saveState();
    addLog(`✅ Entered — TP:$${tpPrice.toFixed(4)} SL:$${slPrice.toFixed(4)}`);
  } else {
    addLog(`❌ Order failed: ${result.error}`);
  }
}

async function closePosition(session: GDEXSession, reason: 'TP' | 'SL' | 'TRAIL' | 'TIMEOUT') {
  if (!position) return;
  const { coin, isLong, size, entryPrice, openedAt } = position;
  const exitPrice = currentPrices[coin] || entryPrice;
  const rawPnl = (exitPrice - entryPrice) * parseFloat(size) * (isLong ? 1 : -1);
  const pnlPct = (rawPnl / (entryPrice * parseFloat(size))) * 100;
  const duration = fmtDur(Date.now() - openedAt);

  addLog(`🔒 Closing ${coin} ${reason} exit:$${exitPrice.toFixed(4)} pnl:${rawPnl >= 0 ? '+' : ''}$${rawPnl.toFixed(2)}`);

  const result = await placeOrder(session, coin, !isLong, exitPrice, size, true);

  if (!result.isSuccess) {
    const hlPos = await getHlPosition(coin);
    if (!hlPos) {
      addLog(`ℹ️  Position already closed on HL — reconciling`);
    } else {
      addLog(`⚠️  Close failed (${result.error}) — trying hlCloseAll`);
      try { await session.sdk.hyperLiquid.hlCloseAll(session.walletAddress, session.tradingPrivateKey); }
      catch { /* best effort */ }
    }
  }

  tradeHistory.push({
    coin,
    direction: isLong ? 'LONG' : 'SHORT',
    entryPrice,
    exitPrice,
    pnlUsd: rawPnl,
    pnlPct,
    exitReason: reason,
    duration,
    time: new Date().toLocaleTimeString(),
    date: new Date().toLocaleDateString(),
  });

  saveTrades();
  clearState();

  try {
    hlBalance = await session.sdk.hyperLiquid.getHyperliquidUsdcBalance(custodialAddr) ?? hlBalance;
  } catch { /* non-fatal */ }

  position = null;
  cooldownUntil = Date.now() + COOLDOWN_MS;
  scalpState = 'COOLDOWN';
  addLog(`✅ Closed. Cooling ${COOLDOWN_MS / 1000}s.`);
}

async function monitorPosition(session: GDEXSession) {
  if (!position) return;
  const { coin, isLong, entryPrice, tpPrice, openedAt } = position;
  const mark = currentPrices[coin];
  if (!mark) return;

  // Update trailing stop
  if (isLong) {
    if (mark > position.trailPeak) position.trailPeak = mark;
    const peakGain = (position.trailPeak - entryPrice) / entryPrice;
    if (peakGain >= TRAIL_TRIGGER) {
      const newSl = position.trailPeak * (1 - TRAIL_DIST);
      if (newSl > position.slPrice) {
        if (!position.trailActive) {
          addLog(`📈 Trail SL activated ${coin} peak:$${position.trailPeak.toFixed(4)}`);
          position.trailActive = true;
        } else {
          addLog(`📈 Trail SL ${coin}: $${position.slPrice.toFixed(4)} → $${newSl.toFixed(4)}`);
        }
        position.slPrice = newSl;
        saveState();
      }
    }
  } else {
    if (mark < position.trailPeak) position.trailPeak = mark;
    const peakGain = (entryPrice - position.trailPeak) / entryPrice;
    if (peakGain >= TRAIL_TRIGGER) {
      const newSl = position.trailPeak * (1 + TRAIL_DIST);
      if (newSl < position.slPrice) {
        if (!position.trailActive) {
          addLog(`📉 Trail SL activated ${coin} peak:$${position.trailPeak.toFixed(4)}`);
          position.trailActive = true;
        } else {
          addLog(`📉 Trail SL ${coin}: $${position.slPrice.toFixed(4)} → $${newSl.toFixed(4)}`);
        }
        position.slPrice = newSl;
        saveState();
      }
    }
  }

  const slPrice = position.slPrice;
  const exitReason = position.trailActive ? 'TRAIL' : 'SL';

  if (isLong && mark >= tpPrice) {
    addLog(`🎯 TP hit ${coin}: $${mark.toFixed(4)} ≥ $${tpPrice.toFixed(4)}`);
    await closePosition(session, 'TP');
  } else if (isLong && mark <= slPrice) {
    addLog(`🛑 ${exitReason} hit ${coin}: $${mark.toFixed(4)} ≤ $${slPrice.toFixed(4)}`);
    await closePosition(session, exitReason);
  } else if (!isLong && mark <= tpPrice) {
    addLog(`🎯 TP hit ${coin}: $${mark.toFixed(4)} ≤ $${tpPrice.toFixed(4)}`);
    await closePosition(session, 'TP');
  } else if (!isLong && mark >= slPrice) {
    addLog(`🛑 ${exitReason} hit ${coin}: $${mark.toFixed(4)} ≥ $${slPrice.toFixed(4)}`);
    await closePosition(session, exitReason);
  } else if (Date.now() - openedAt >= MAX_HOLD_MS) {
    addLog(`⏰ Timeout ${coin} — closing`);
    await closePosition(session, 'TIMEOUT');
  }
}

async function scanSignals(session: GDEXSession) {
  if (scalpState !== 'SCANNING') return;

  // Need at least 3 price points to have a meaningful 5-min window
  const ready = COINS.some(c => (priceHistory[c] || []).filter(p => p.ts >= Date.now() - MOMENTUM_WIN).length >= 3);
  if (!ready) {
    addLog(`📡 Building price history...`);
    return;
  }

  // Compute + cache scores for all coins (for display even when not entering)
  let bestCoin = '';
  let bestScore = -Infinity;
  let bestMom = 0;
  let bestSig: SignalScore | null = null;

  for (const coin of COINS) {
    const mom = momentum5m(coin);
    if (Math.abs(mom) < MOMENTUM_PCT) {
      // Below threshold — still compute score for display (neutral)
      const sig = scoreSignal(coin, mom >= 0, mom);
      cachedScores[coin] = { ...sig, isLong: mom >= 0 };
      continue;
    }
    const isLong = mom > 0;
    const sig = scoreSignal(coin, isLong, mom);
    cachedScores[coin] = { ...sig, isLong };

    if (sig.score > bestScore) {
      bestScore = sig.score;
      bestCoin = coin;
      bestMom = mom;
      bestSig = sig;
    }
  }

  if (bestCoin && bestSig) {
    if (bestScore >= MIN_SCORE) {
      const isLong = bestMom > 0;
      addLog(`📊 Best: ${bestCoin} score:${bestScore} ${isLong ? 'LONG' : 'SHORT'} mom:${bestMom.toFixed(2)}%`);
      await openPosition(session, bestCoin, isLong, bestSig);
    } else {
      addLog(`📊 Signals below score (best:${bestCoin} ${bestScore}<${MIN_SCORE}) — ${bestSig.reasons.slice(0, 3).join(' ')}`);
    }
  }
}

// ─── Resume from saved state ──────────────────────────────────────────────────

async function resumeFromState(): Promise<boolean> {
  const saved = loadSavedPosition();
  if (!saved) return false;

  addLog(`🔄 Found saved state — verifying ${saved.coin} on HL...`);
  const hlPos = await getHlPosition(saved.coin);

  if (!hlPos) {
    addLog(`ℹ️  Saved ${saved.coin} position gone on HL — discarding`);
    clearState();
    return false;
  }

  const isLong = hlPos.szi > 0;
  saved.size = Math.abs(hlPos.szi).toString();
  saved.entryPrice = hlPos.entryPx;
  saved.isLong = isLong;
  saved.tpPrice = isLong ? hlPos.entryPx * (1 + TP_PCT) : hlPos.entryPx * (1 - TP_PCT);
  saved.slPrice = isLong ? hlPos.entryPx * (1 - SL_PCT) : hlPos.entryPx * (1 + SL_PCT);
  saved.trailPeak = currentPrices[saved.coin] || hlPos.entryPx;
  saved.trailActive = false;
  saved.isResumed = true;

  position = saved;
  scalpState = 'IN_POSITION';
  addLog(`✅ Resumed ${isLong ? 'LONG' : 'SHORT'} ${saved.coin} @ $${hlPos.entryPx.toFixed(4)} sz:${saved.size}`);
  return true;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  process.stdout.write('\x1b[?1049h\x1b[?25l');

  const cleanup = () => {
    process.stdout.write('\x1b[?25h\x1b[?1049l');
    console.log('\nStopped. Goodbye!');
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  loadTrades();

  addLog('🔐 Authenticating...');
  render();

  let session: GDEXSession;
  try {
    session = await createAuthenticatedSession({ chainId: 622112261 });
  } catch {
    session = await createAuthenticatedSession({ chainId: 42161 });
  }

  // Get custodial address
  try {
    const ui = await session.sdk.user.getUserInfo(session.walletAddress, session.encryptedSessionKey, 42161);
    custodialAddr = ui?.address?.toLowerCase() || HL_CUSTODIAL;
  } catch { custodialAddr = HL_CUSTODIAL; }

  addLog(`✅ Auth OK  wallet:${session.walletAddress.slice(0, 10)}...  custodial:${custodialAddr.slice(0, 10)}...`);

  // Initial balance
  try {
    hlBalance = await session.sdk.hyperLiquid.getHyperliquidUsdcBalance(custodialAddr) ?? 0;
    addLog(`💰 HL Balance: $${hlBalance.toFixed(2)} USDC`);
  } catch (e: any) {
    addLog(`⚠️  Balance fetch failed: ${e.message}`);
  }

  if (hlBalance < 9) {
    addLog(`❌ Need ≥$9 USDC on HyperLiquid. Deposit first.`);
    render();
    await new Promise(r => setTimeout(r, 5000));
    cleanup();
    return;
  }

  addLog(`📡 Starting... ${COINS.join('/')}  score≥${MIN_SCORE}  monitor:${MONITOR_MS / 1000}s`);

  // Initial data fetch
  await Promise.allSettled([
    fetchPrices(session),
    refreshCandleCache(),
    refreshFundingRates(),
  ]);

  addLog(`📈 BTC:$${currentPrices.BTC?.toFixed(0)} ETH:$${currentPrices.ETH?.toFixed(0)} SOL:$${currentPrices.SOL?.toFixed(2)}`);
  const candleCount = Object.keys(candleCache).length;
  const fundCount = Object.keys(fundingRates).length;
  addLog(`📊 Candles: ${candleCount}/${COINS.length} coins  Funding: ${fundCount} assets`);

  // Check for saved position
  await resumeFromState();

  if (tradeHistory.length > 0) {
    const wins = tradeHistory.filter(t => t.pnlUsd > 0).length;
    const totalPnl = tradeHistory.reduce((s, t) => s + t.pnlUsd, 0);
    addLog(`📂 ${tradeHistory.length} past trades — ${wins}W/${tradeHistory.length - wins}L  pnl:${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}`);
  }

  render();

  // ── Main poll loop ──────────────────────────────────────────────────────────
  const runLoop = async () => {
    nextPollAt = Date.now() + POLL_MS;

    try { await fetchPrices(session); } catch { /* non-fatal */ }

    // Refresh candle + funding data in background on every price poll
    if (scalpState !== 'IN_POSITION') {
      Promise.allSettled([
        refreshCandleCache(),
        refreshFundingRates(),
      ]).catch(() => {});
    }

    if (scalpState === 'IN_POSITION') {
      await monitorPosition(session);
    } else if (scalpState === 'COOLDOWN') {
      if (Date.now() >= cooldownUntil) {
        scalpState = 'SCANNING';
        addLog('🔄 Cooldown over — scanning');
      }
    } else {
      await scanSignals(session);
    }

    render();
  };

  await runLoop();

  const getInterval = () => scalpState === 'IN_POSITION' ? MONITOR_MS : POLL_MS;

  const schedulePoll = () => {
    setTimeout(async () => {
      await runLoop();
      schedulePoll();
    }, getInterval());
  };

  schedulePoll();

  process.stdout.on('resize', render);
}

main().catch(err => {
  process.stdout.write('\x1b[?25h\x1b[?1049l');
  console.error('FATAL:', err.message || err);
  process.exit(1);
});
