/**
 * GDEX Solana Pump.fun Token Scanner
 *
 * Real-time terminal dashboard for scanning, analyzing, and trading
 * Solana meme coins via the GDEX SDK.
 *
 * Usage: npm run solana:scan
 * Keys:  F=Feed  M=Movers  A=Analytics  H=Holdings  Q=Quit
 *        ↑↓=Navigate  B=Buy  S=Sell  +/-=Amount  R=Refresh
 */

import WebSocket from 'ws';
(globalThis as any).WebSocket = WebSocket;

import { createAuthenticatedSession, GDEXSession } from './auth';
import { loadConfig } from './config';
import { buyToken, sellToken, formatSolAmount } from './trading';
import { getHoldings } from './market';

// ═══════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════

const SOLANA = 622112261;
const RENDER_MS = 2000;
const POLL_MS = 10000;
const MAX_TOKENS = 200;
const DEFAULT_BUY_SOL = 0.005;

// ═══════════════════════════════════════════════════════════════════
// ANSI & Formatting Utilities
// ═══════════════════════════════════════════════════════════════════

const E = '\x1b[';
const RST = `${E}0m`;
const BOLD = `${E}1m`;
const DIM = `${E}2m`;
const RED = `${E}31m`;
const GRN = `${E}32m`;
const YEL = `${E}33m`;
const BLU = `${E}34m`;
const MAG = `${E}35m`;
const CYN = `${E}36m`;
const WHT = `${E}37m`;
const BGDARK = `${E}48;5;234m`;
const BGSEL = `${E}48;5;236m`;
const CLR = `${E}2J${E}H`;
const HIDE_CUR = `${E}?25l`;
const SHOW_CUR = `${E}?25h`;

// Box drawing
const H = { tl: '┏', tr: '┓', bl: '┗', br: '┛', h: '━', v: '┃' };
const L = { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│', tR: '├', tL: '┤' };

function c(text: string, color: string): string { return `${color}${text}${RST}`; }
function pad(s: string, n: number): string { return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length); }
function rpad(s: string, n: number): string { return s.length >= n ? s.slice(0, n) : ' '.repeat(n - s.length) + s; }
function trunc(s: string, n: number): string { return s.length <= n ? s : s.slice(0, n - 1) + '…'; }

function fmtUsd(n: number | undefined): string {
  if (n === undefined || n === null) return '$?';
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.0001) return `$${n.toFixed(6)}`;
  // Scientific for very small
  const s = n.toFixed(12);
  // Count leading zeros after decimal
  const m = s.match(/^0\.0*(\d+)/);
  if (m) {
    const zeros = s.indexOf(m[1]) - 2;
    return `$0.0{${zeros}}${m[1].slice(0, 4)}`;
  }
  return `$${n.toExponential(2)}`;
}

function fmtPct(n: number | undefined): string {
  if (n === undefined || n === null || n === 0) return c('  0.0%', DIM);
  const s = `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
  return n > 0 ? c(rpad(s, 7), GRN) : c(rpad(s, 7), RED);
}

function fmtAge(ts: number): string {
  const sec = Math.floor((Date.now() / 1000) - ts);
  if (sec < 0) return '  0s';
  if (sec < 60) return rpad(`${sec}s`, 4);
  if (sec < 3600) return rpad(`${Math.floor(sec / 60)}m`, 4);
  if (sec < 86400) return rpad(`${Math.floor(sec / 3600)}h`, 4);
  return rpad(`${Math.floor(sec / 86400)}d`, 4);
}

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

const SPARK = '▁▂▃▄▅▆▇█';
function sparkline(vals: number[], width: number = 8): string {
  if (vals.length === 0) return ' '.repeat(width);
  const recent = vals.slice(-width);
  const mn = Math.min(...recent);
  const mx = Math.max(...recent);
  const rng = mx - mn || 1;
  return recent.map(v => SPARK[Math.min(7, Math.floor(((v - mn) / rng) * 7))]).join('');
}

function hbar(pct: number, width: number): string {
  const filled = Math.round((pct / 100) * width);
  return c('█'.repeat(filled), CYN) + c('░'.repeat(width - filled), DIM);
}

function boxTop(title: string, w: number): string {
  const inner = w - 2;
  const t = ` ${title} `;
  const remain = inner - t.length - 1;
  return c(L.tl + L.h, DIM) + c(t, `${BOLD}${WHT}`) + c(L.h.repeat(Math.max(0, remain)) + L.tr, DIM);
}

function boxBot(w: number): string {
  return c(L.bl + L.h.repeat(w - 2) + L.br, DIM);
}

function boxRow(content: string, w: number): string {
  // content may have ANSI codes, so we can't just pad by string length
  return c(L.v, DIM) + ' ' + content;
}

// ═══════════════════════════════════════════════════════════════════
// Token Store
// ═══════════════════════════════════════════════════════════════════

interface TokenRecord {
  raw: any;
  firstSeen: number;
  lastUpdated: number;
  priceHistory: number[];
  source: 'ws-new' | 'ws-update' | 'poll';
  securityScore: number;
}

interface Analytics {
  total: number;
  pumpfun: number;
  graduated: number;
  avgMcap: number;
  medMcap: number;
  avgTx: number;
  safeCount: number;
  riskyCount: number;
  bcDist: { label: string; count: number }[];
  vol5m: number;
}

class TokenStore {
  private tokens = new Map<string, TokenRecord>();

  upsert(raw: any, source: TokenRecord['source']): void {
    const addr = raw.address;
    if (!addr) return;
    const existing = this.tokens.get(addr);
    const price = raw.priceUsd ? parseFloat(raw.priceUsd) : (raw.priceUsd || 0);
    if (existing) {
      existing.raw = { ...existing.raw, ...raw };
      existing.lastUpdated = Date.now();
      existing.source = source;
      if (price > 0) {
        existing.priceHistory.push(price);
        if (existing.priceHistory.length > 30) existing.priceHistory.shift();
      }
      existing.securityScore = this.calcSecurity(existing.raw);
    } else {
      this.tokens.set(addr, {
        raw,
        firstSeen: Date.now(),
        lastUpdated: Date.now(),
        priceHistory: price > 0 ? [price] : [],
        source,
        securityScore: this.calcSecurity(raw),
      });
    }
    if (this.tokens.size > MAX_TOKENS) this.prune();
  }

  private calcSecurity(r: any): number {
    let score = 0;
    if (r.securities?.mintAbility === false) score += 30;
    if (r.securities?.freezeAbility === false) score += 30;
    const lp = r.securities?.lpLockPercentage ?? 0;
    score += Math.min(20, (lp / 100) * 20);
    const bc = r.bondingCurveProgress ?? 0;
    score += Math.min(20, (bc / 100) * 20);
    return Math.round(score);
  }

  private prune(): void {
    const sorted = [...this.tokens.entries()]
      .sort((a, b) => (b[1].raw.txCount || 0) - (a[1].raw.txCount || 0));
    const keep = new Map(sorted.slice(0, MAX_TOKENS));
    this.tokens = keep;
  }

  get(addr: string): TokenRecord | undefined { return this.tokens.get(addr); }
  get size(): number { return this.tokens.size; }

  getAll(): TokenRecord[] { return [...this.tokens.values()]; }

  getNewest(limit: number): TokenRecord[] {
    return this.getAll()
      .sort((a, b) => b.firstSeen - a.firstSeen)
      .slice(0, limit);
  }

  getByActivity(limit: number): TokenRecord[] {
    return this.getAll()
      .sort((a, b) => (b.raw.txCount || 0) - (a.raw.txCount || 0))
      .slice(0, limit);
  }

  getHighBC(limit: number): TokenRecord[] {
    return this.getAll()
      .filter(t => (t.raw.bondingCurveProgress || 0) > 50)
      .sort((a, b) => (b.raw.bondingCurveProgress || 0) - (a.raw.bondingCurveProgress || 0))
      .slice(0, limit);
  }

  getGraduated(limit: number): TokenRecord[] {
    return this.getAll()
      .filter(t => t.raw.isListedOnDex === true)
      .sort((a, b) => (b.raw.marketCap || 0) - (a.raw.marketCap || 0))
      .slice(0, limit);
  }

  getAnalytics(): Analytics {
    const all = this.getAll();
    if (all.length === 0) return { total: 0, pumpfun: 0, graduated: 0, avgMcap: 0, medMcap: 0, avgTx: 0, safeCount: 0, riskyCount: 0, bcDist: [], vol5m: 0 };

    const mcaps = all.map(t => t.raw.marketCap || 0).sort((a, b) => a - b);
    const bcDist = [
      { label: '0-25%', count: 0 },
      { label: '25-50%', count: 0 },
      { label: '50-75%', count: 0 },
      { label: '75-99%', count: 0 },
      { label: 'Graduated', count: 0 },
    ];
    all.forEach(t => {
      if (t.raw.isListedOnDex) { bcDist[4].count++; return; }
      const bc = t.raw.bondingCurveProgress || 0;
      if (bc < 25) bcDist[0].count++;
      else if (bc < 50) bcDist[1].count++;
      else if (bc < 75) bcDist[2].count++;
      else bcDist[3].count++;
    });

    return {
      total: all.length,
      pumpfun: all.filter(t => t.raw.isPumpfun).length,
      graduated: all.filter(t => t.raw.isListedOnDex).length,
      avgMcap: mcaps.reduce((s, v) => s + v, 0) / all.length,
      medMcap: mcaps[Math.floor(mcaps.length / 2)],
      avgTx: all.reduce((s, t) => s + (t.raw.txCount || 0), 0) / all.length,
      safeCount: all.filter(t => t.securityScore >= 70).length,
      riskyCount: all.filter(t => t.securityScore < 40).length,
      bcDist,
      vol5m: all.reduce((s, t) => s + (t.raw.volumes?.m5 || 0), 0),
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// WebSocket Manager
// ═══════════════════════════════════════════════════════════════════

class WSManager {
  private sdk: any;
  private store: TokenStore;
  msgCount = 0;
  newCount = 0;
  updateCount = 0;
  connected = false;

  constructor(sdk: any, store: TokenStore) {
    this.sdk = sdk;
    this.store = store;
  }

  async connect(): Promise<void> {
    try {
      await this.sdk.connectWebSocketWithChain(SOLANA, {
        autoReconnect: true,
        maxReconnectAttempts: 10,
        reconnectInterval: 5000,
      });
      const ws = this.sdk.getWebSocketClient();
      if (!ws) return;

      ws.on('connect', () => { this.connected = true; });
      ws.on('disconnect', () => { this.connected = false; });
      ws.on('error', () => {});
      ws.on('message', (data: any) => {
        this.msgCount++;
        if (data.newTokensData?.length) {
          data.newTokensData.forEach((t: any) => {
            this.store.upsert(t, 'ws-new');
            this.newCount++;
          });
        }
        if (data.effectedTokensData?.length) {
          data.effectedTokensData.forEach((t: any) => {
            this.store.upsert(t, 'ws-update');
            this.updateCount++;
          });
        }
      });
      this.connected = true;
    } catch {
      this.connected = false;
    }
  }

  disconnect(): void {
    try { this.sdk.disconnect(); } catch {}
    this.connected = false;
  }
}

// ═══════════════════════════════════════════════════════════════════
// Polling Manager
// ═══════════════════════════════════════════════════════════════════

class PollingManager {
  private sdk: any;
  private store: TokenStore;
  private timer: NodeJS.Timeout | null = null;
  pollCount = 0;
  lastCount = 0;

  constructor(sdk: any, store: TokenStore) {
    this.sdk = sdk;
    this.store = store;
  }

  async poll(): Promise<void> {
    this.pollCount++;
    let count = 0;
    for (let page = 1; page <= 3; page++) {
      try {
        const batch = await this.sdk.tokens.getNewestTokens(SOLANA, page, undefined, 20);
        if (batch?.length) {
          batch.forEach((t: any) => this.store.upsert(t, 'poll'));
          count += batch.length;
        }
      } catch {}
    }
    this.lastCount = count;
  }

  start(): void {
    this.poll();
    this.timer = setInterval(() => this.poll(), POLL_MS);
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }
}

// ═══════════════════════════════════════════════════════════════════
// Trade Executor
// ═══════════════════════════════════════════════════════════════════

interface TradeLog {
  time: number;
  action: 'BUY' | 'SELL';
  symbol: string;
  amount: number;
  result: 'SUCCESS' | 'FAILED';
  hash?: string;
  msg?: string;
}

class TradeExecutor {
  private session: GDEXSession;
  log: TradeLog[] = [];
  buyAmountSOL = DEFAULT_BUY_SOL;
  busy = false;

  constructor(session: GDEXSession) { this.session = session; }

  async buy(token: TokenRecord): Promise<TradeLog> {
    this.busy = true;
    const entry: TradeLog = {
      time: Date.now(),
      action: 'BUY',
      symbol: token.raw.symbol || '???',
      amount: this.buyAmountSOL,
      result: 'FAILED',
    };
    try {
      const r = await buyToken(this.session, {
        tokenAddress: token.raw.address,
        amount: formatSolAmount(this.buyAmountSOL),
        chainId: SOLANA,
      });
      if (r?.isSuccess) {
        entry.result = 'SUCCESS';
        entry.hash = r.hash;
      } else {
        entry.msg = r?.message || 'Unknown error';
      }
    } catch (e: any) {
      entry.msg = e.message;
    }
    this.log.push(entry);
    this.busy = false;
    return entry;
  }

  async sell(token: TokenRecord): Promise<TradeLog> {
    this.busy = true;
    const entry: TradeLog = {
      time: Date.now(),
      action: 'SELL',
      symbol: token.raw.symbol || '???',
      amount: this.buyAmountSOL,
      result: 'FAILED',
    };
    try {
      const r = await sellToken(this.session, {
        tokenAddress: token.raw.address,
        amount: formatSolAmount(this.buyAmountSOL),
        chainId: SOLANA,
      });
      if (r?.isSuccess) {
        entry.result = 'SUCCESS';
        entry.hash = r.hash;
      } else {
        entry.msg = r?.message || 'Unknown error';
      }
    } catch (e: any) {
      entry.msg = e.message;
    }
    this.log.push(entry);
    this.busy = false;
    return entry;
  }
}

// ═══════════════════════════════════════════════════════════════════
// Renderer
// ═══════════════════════════════════════════════════════════════════

type ViewMode = 'feed' | 'movers' | 'analytics' | 'holdings';

class Renderer {
  private store: TokenStore;
  private ws: WSManager;
  private poll: PollingManager;
  private trader: TradeExecutor;
  private startTime: number;
  viewMode: ViewMode = 'feed';
  selectedIdx = 0;
  scrollOffset = 0;
  statusMsg = '';
  private walletShort: string;
  private holdingsCache: any[] = [];
  private lastHoldingsFetch = 0;
  private session: GDEXSession;

  constructor(store: TokenStore, ws: WSManager, poll: PollingManager, trader: TradeExecutor, session: GDEXSession) {
    this.store = store;
    this.ws = ws;
    this.poll = poll;
    this.trader = trader;
    this.startTime = Date.now();
    this.session = session;
    this.walletShort = session.walletAddress.slice(0, 6) + '..' + session.walletAddress.slice(-4);
  }

  render(): void {
    const W = process.stdout.columns || 80;
    const H_TERM = process.stdout.rows || 24;
    const lines: string[] = [];

    // Header
    lines.push(...this.renderHeader(W));

    // Active view
    const viewLines = H_TERM - lines.length - 8; // reserve for header + trade log + status
    switch (this.viewMode) {
      case 'feed': lines.push(...this.renderFeed(W, Math.max(5, viewLines))); break;
      case 'movers': lines.push(...this.renderMovers(W, Math.max(5, viewLines))); break;
      case 'analytics': lines.push(...this.renderAnalytics(W, Math.max(5, viewLines))); break;
      case 'holdings': lines.push(...this.renderHoldings(W, Math.max(5, viewLines))); break;
    }

    // Trade log
    lines.push(...this.renderTradeLog(W));

    // Status bar
    lines.push(...this.renderStatusBar(W));

    process.stdout.write(CLR + lines.join('\n') + '\n');
  }

  private renderHeader(W: number): string[] {
    const uptime = fmtDuration(Date.now() - this.startTime);
    const wsIcon = this.ws.connected ? c('●', GRN) : c('○', RED);
    const lines: string[] = [];

    lines.push(c(H.tl + H.h.repeat(W - 2) + H.tr, CYN));
    const title = `  GDEX Solana Scanner`;
    const right = `${wsIcon} LIVE  ${uptime}  `;
    const gap = W - title.length - right.length - 6;
    lines.push(c(H.v, CYN) + c(title, `${BOLD}${WHT}`) + ' '.repeat(Math.max(1, gap)) + right + c(H.v, CYN));

    const stats = `  Tokens: ${c(String(this.store.size), `${BOLD}${WHT}`)} ${c('│', DIM)} WS: ${c(String(this.ws.msgCount).replace(/\B(?=(\d{3})+(?!\d))/g, ','), WHT)} msgs ${c('│', DIM)} New: ${c(String(this.ws.newCount), GRN)} ${c('│', DIM)} Polls: ${c(String(this.poll.pollCount), WHT)} ${c('│', DIM)} ${this.walletShort}`;
    lines.push(c(H.v, CYN) + stats + c(H.v, CYN));

    const views = [
      this.viewMode === 'feed' ? c('[F]eed', `${BOLD}${CYN}`) : c('[F]eed', DIM),
      this.viewMode === 'movers' ? c('[M]overs', `${BOLD}${CYN}`) : c('[M]overs', DIM),
      this.viewMode === 'analytics' ? c('[A]nalytics', `${BOLD}${CYN}`) : c('[A]nalytics', DIM),
      this.viewMode === 'holdings' ? c('[H]oldings', `${BOLD}${CYN}`) : c('[H]oldings', DIM),
    ];
    const amtStr = `Amt: ${this.trader.buyAmountSOL} SOL`;
    const viewLine = `  ${views.join('  ')}`;
    lines.push(c(H.v, CYN) + viewLine + ' '.repeat(Math.max(1, 10)) + c(amtStr, YEL) + c(H.v, CYN));

    lines.push(c(H.bl + H.h.repeat(W - 2) + H.br, CYN));
    return lines;
  }

  private securityLabel(score: number): string {
    if (score >= 70) return c('●●', GRN) + c(' Safe', GRN);
    if (score >= 40) return c('●○', YEL) + c(' Warn', YEL);
    return c('○○', RED) + c(' Risk', RED);
  }

  private renderFeed(W: number, maxRows: number): string[] {
    const lines: string[] = [];
    const tokens = this.store.getByActivity(100);

    lines.push(boxTop('Live Feed — sorted by activity', W));

    // Header row
    const hdr = `  ${c('#', DIM)}  ${c(pad('Age', 4), DIM)}  ${c(pad('Symbol', 10), DIM)}  ${c(pad('Price', 14), DIM)}  ${c(rpad('MCap', 7), DIM)}  ${c(rpad('BC%', 5), DIM)}  ${c(pad('Spark', 8), DIM)} ${c(rpad('TXs', 5), DIM)}  ${c('Security', DIM)}`;
    lines.push(boxRow(hdr, W));

    if (tokens.length === 0) {
      lines.push(boxRow(c('  Waiting for tokens...', DIM), W));
    } else {
      const visible = tokens.slice(this.scrollOffset, this.scrollOffset + maxRows);
      visible.forEach((t, i) => {
        const idx = this.scrollOffset + i;
        const sel = idx === this.selectedIdx;
        const r = t.raw;
        const prefix = sel ? c('►', CYN) : ' ';
        const num = rpad(String(idx + 1), 2);
        const age = fmtAge(r.createdTime || t.firstSeen / 1000);
        const sym = pad(trunc(r.symbol || '???', 10), 10);
        const price = pad(fmtUsd(r.priceUsd), 14);
        const mcap = rpad(fmtUsd(r.marketCap).replace('$', ''), 7);
        const bc = rpad(`${Math.round(r.bondingCurveProgress || 0)}%`, 5);
        const spark = pad(sparkline(t.priceHistory), 8);
        const txs = rpad(String(r.txCount || 0), 5);
        const sec = this.securityLabel(t.securityScore);

        const row = `${prefix}${num}  ${age}  ${sel ? c(sym, `${BOLD}${WHT}`) : c(sym, WHT)}  ${price}  ${c('$', DIM)}${mcap}  ${c(bc, r.bondingCurveProgress > 70 ? GRN : WHT)}  ${spark} ${txs}  ${sec}`;
        lines.push(boxRow(sel ? `${BGSEL}${row}${RST}` : row, W));
      });

      if (tokens.length > maxRows) {
        const scrollInfo = `  ${c(`Showing ${this.scrollOffset + 1}-${Math.min(this.scrollOffset + maxRows, tokens.length)} of ${tokens.length}`, DIM)}`;
        lines.push(boxRow(scrollInfo, W));
      }
    }

    lines.push(boxBot(W));
    return lines;
  }

  private renderMovers(W: number, maxRows: number): string[] {
    const lines: string[] = [];

    // Approaching graduation
    const highBC = this.store.getHighBC(5);
    lines.push(boxTop('Approaching Graduation (BC > 50%)', W));
    if (highBC.length === 0) {
      lines.push(boxRow(c('  No tokens near graduation yet', DIM), W));
    } else {
      highBC.forEach(t => {
        const r = t.raw;
        const bc = r.bondingCurveProgress || 0;
        const barW = Math.min(30, W - 40);
        const bar = hbar(bc, barW);
        lines.push(boxRow(`  ${c(pad(trunc(r.symbol || '???', 10), 10), `${BOLD}${WHT}`)}  ${bar} ${c(rpad(`${bc.toFixed(1)}%`, 6), bc > 75 ? GRN : YEL)}  MCap: ${fmtUsd(r.marketCap)}  TXs: ${r.txCount || 0}`, W));
      });
    }
    lines.push(boxBot(W));

    // Most active
    lines.push(boxTop('Most Active (by TXs)', W));
    const active = this.store.getByActivity(Math.min(8, Math.floor(maxRows / 2)));
    if (active.length === 0) {
      lines.push(boxRow(c('  Waiting for data...', DIM), W));
    } else {
      active.forEach((t, i) => {
        const r = t.raw;
        lines.push(boxRow(`  ${c(rpad(String(i + 1), 2), DIM)}. ${c(pad(trunc(r.symbol || '???', 10), 10), WHT)}  TXs: ${c(rpad(String(r.txCount || 0), 5), `${BOLD}${WHT}`)}  ${fmtUsd(r.priceUsd)}  MCap: ${fmtUsd(r.marketCap)}  BC: ${rpad(`${Math.round(r.bondingCurveProgress || 0)}%`, 4)}  ${sparkline(t.priceHistory)}`, W));
      });
    }
    lines.push(boxBot(W));

    // Graduated tokens
    const grads = this.store.getGraduated(5);
    if (grads.length > 0) {
      lines.push(boxTop('DEX Graduated', W));
      grads.forEach(t => {
        const r = t.raw;
        const dexes = (r.dexes || []).join(', ');
        lines.push(boxRow(`  ${c(pad(trunc(r.symbol || '???', 10), 10), `${BOLD}${GRN}`)}  MCap: ${fmtUsd(r.marketCap)}  TXs: ${r.txCount || 0}  DEXs: ${dexes}`, W));
      });
      lines.push(boxBot(W));
    }

    return lines;
  }

  private renderAnalytics(W: number, _maxRows: number): string[] {
    const lines: string[] = [];
    const a = this.store.getAnalytics();

    // Market overview
    lines.push(boxTop('Market Overview', W));
    lines.push(boxRow(`  Total Scanned: ${c(String(a.total), `${BOLD}${WHT}`)}    Pump.fun: ${c(String(a.pumpfun), MAG)}    Graduated: ${c(String(a.graduated), GRN)}`, W));
    lines.push(boxRow(`  Avg MCap: ${c(fmtUsd(a.avgMcap), WHT)}    Median MCap: ${c(fmtUsd(a.medMcap), WHT)}    Avg TXs: ${c(a.avgTx.toFixed(1), WHT)}`, W));
    lines.push(boxRow(`  5m Volume: ${c(fmtUsd(a.vol5m), WHT)}`, W));
    lines.push(boxBot(W));

    // Bonding curve distribution
    lines.push(boxTop('Bonding Curve Distribution', W));
    const maxBC = Math.max(1, ...a.bcDist.map(b => b.count));
    const barW = Math.min(35, W - 30);
    a.bcDist.forEach(b => {
      const pct = a.total > 0 ? ((b.count / a.total) * 100).toFixed(0) : '0';
      const bar = hbar((b.count / maxBC) * 100, barW);
      lines.push(boxRow(`  ${pad(b.label, 10)}  ${bar}  ${c(rpad(String(b.count), 3), WHT)} (${rpad(pct, 2)}%)`, W));
    });
    lines.push(boxBot(W));

    // Security
    lines.push(boxTop('Security Analysis', W));
    const safePct = a.total > 0 ? ((a.safeCount / a.total) * 100).toFixed(0) : '0';
    const riskyPct = a.total > 0 ? ((a.riskyCount / a.total) * 100).toFixed(0) : '0';
    const unknownCount = a.total - a.safeCount - a.riskyCount;
    lines.push(boxRow(`  ${c('●●', GRN)} Safe  (score ≥ 70):  ${c(String(a.safeCount), GRN)}  (${safePct}%)    ${hbar(parseInt(safePct), 20)}`, W));
    lines.push(boxRow(`  ${c('○○', RED)} Risky (score < 40):  ${c(String(a.riskyCount), RED)}  (${riskyPct}%)    ${hbar(parseInt(riskyPct), 20)}`, W));
    lines.push(boxRow(`  ${c('●○', YEL)} Other:              ${c(String(unknownCount), YEL)}  (${a.total > 0 ? ((unknownCount / a.total) * 100).toFixed(0) : '0'}%)`, W));
    lines.push(boxBot(W));

    return lines;
  }

  private renderHoldings(W: number, maxRows: number): string[] {
    const lines: string[] = [];

    // Fetch holdings periodically (every 30s)
    if (Date.now() - this.lastHoldingsFetch > 30000) {
      this.lastHoldingsFetch = Date.now();
      getHoldings(this.session, SOLANA).then(h => {
        this.holdingsCache = h || [];
      }).catch(() => {});
    }

    lines.push(boxTop('Solana Holdings', W));
    if (this.holdingsCache.length === 0) {
      lines.push(boxRow(c('  No holdings found (or still loading...)', DIM), W));
    } else {
      this.holdingsCache.slice(0, maxRows).forEach(h => {
        const sym = pad(trunc(h.symbol || h.name || '???', 10), 10);
        const bal = h.balance || h.amount || '0';
        const val = h.valueUsd || h.value;
        lines.push(boxRow(`  ${c(sym, WHT)}  Balance: ${c(String(bal), `${BOLD}${WHT}`)}  Value: ${val ? fmtUsd(parseFloat(val)) : c('N/A', DIM)}`, W));
      });
    }
    lines.push(boxBot(W));

    return lines;
  }

  private renderTradeLog(W: number): string[] {
    const lines: string[] = [];
    const trades = this.trader.log.slice(-3);

    if (trades.length === 0 && !this.trader.busy && !this.statusMsg) return lines;

    lines.push(boxTop('Trade Log', W));

    if (this.trader.busy) {
      lines.push(boxRow(c('  ⟳ Executing trade...', `${BOLD}${YEL}`), W));
    }

    if (this.statusMsg) {
      lines.push(boxRow(c(`  ${this.statusMsg}`, YEL), W));
      this.statusMsg = '';
    }

    trades.forEach(t => {
      const time = new Date(t.time).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const icon = t.result === 'SUCCESS' ? c('✓', GRN) : c('✗', RED);
      const action = t.action === 'BUY' ? c(pad(t.action, 4), GRN) : c(pad(t.action, 4), RED);
      const hash = t.hash ? `tx:${t.hash.slice(0, 8)}..` : (t.msg || '');
      lines.push(boxRow(`  ${c(time, DIM)}  ${action}  ${c(pad(trunc(t.symbol, 8), 8), WHT)}  ${t.amount} SOL  ${icon} ${hash}`, W));
    });

    lines.push(boxBot(W));
    return lines;
  }

  private renderStatusBar(W: number): string[] {
    const wsStatus = this.ws.connected ? c('WS:●', GRN) : c('WS:○', RED);
    const pollStatus = c(`Poll:●`, GRN);
    const keys = `${c('[↑↓]', CYN)}Nav  ${c('[B]', GRN)}uy  ${c('[S]', RED)}ell  ${c('[+/-]', YEL)}Amt  ${c('[R]', WHT)}efresh  ${c('[Q]', DIM)}uit`;
    return [` ${wsStatus} ${pollStatus} ${c('│', DIM)} ${keys}`];
  }
}

// ═══════════════════════════════════════════════════════════════════
// Input Handler
// ═══════════════════════════════════════════════════════════════════

class InputHandler {
  private renderer: Renderer;
  private trader: TradeExecutor;
  private store: TokenStore;
  private pollManager: PollingManager;
  running = true;

  constructor(renderer: Renderer, trader: TradeExecutor, store: TokenStore, poll: PollingManager) {
    this.renderer = renderer;
    this.trader = trader;
    this.store = store;
    this.pollManager = poll;
  }

  start(): void {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (key: string) => this.handle(key));
  }

  private async handle(key: string): Promise<void> {
    // Ctrl+C
    if (key === '\u0003' || key === 'q' || key === 'Q') {
      this.running = false;
      return;
    }

    const tokens = this.store.getByActivity(100);

    switch (key) {
      case 'f': case 'F': this.renderer.viewMode = 'feed'; break;
      case 'm': case 'M': this.renderer.viewMode = 'movers'; break;
      case 'a': case 'A': this.renderer.viewMode = 'analytics'; break;
      case 'h': case 'H': this.renderer.viewMode = 'holdings'; break;

      case '\x1b[A': // Up arrow
        if (this.renderer.selectedIdx > 0) {
          this.renderer.selectedIdx--;
          if (this.renderer.selectedIdx < this.renderer.scrollOffset) {
            this.renderer.scrollOffset = this.renderer.selectedIdx;
          }
        }
        this.renderer.render();
        break;

      case '\x1b[B': // Down arrow
        if (this.renderer.selectedIdx < tokens.length - 1) {
          this.renderer.selectedIdx++;
          const viewH = (process.stdout.rows || 24) - 14;
          if (this.renderer.selectedIdx >= this.renderer.scrollOffset + viewH) {
            this.renderer.scrollOffset = this.renderer.selectedIdx - viewH + 1;
          }
        }
        this.renderer.render();
        break;

      case 'b': case 'B':
        if (this.trader.busy) { this.renderer.statusMsg = 'Trade already in progress...'; break; }
        if (tokens.length === 0) { this.renderer.statusMsg = 'No tokens to buy'; break; }
        const buyToken = tokens[this.renderer.selectedIdx];
        if (buyToken) {
          this.renderer.render(); // show "executing"
          const result = await this.trader.buy(buyToken);
          this.renderer.statusMsg = result.result === 'SUCCESS'
            ? `Bought ${result.symbol}!`
            : `Buy failed: ${result.msg}`;
        }
        break;

      case 's': case 'S':
        if (this.trader.busy) { this.renderer.statusMsg = 'Trade already in progress...'; break; }
        if (tokens.length === 0) { this.renderer.statusMsg = 'No tokens to sell'; break; }
        const sellTk = tokens[this.renderer.selectedIdx];
        if (sellTk) {
          this.renderer.render();
          const result = await this.trader.sell(sellTk);
          this.renderer.statusMsg = result.result === 'SUCCESS'
            ? `Sold ${result.symbol}!`
            : `Sell failed: ${result.msg}`;
        }
        break;

      case '+': case '=':
        this.trader.buyAmountSOL = Math.round((this.trader.buyAmountSOL + 0.005) * 1000) / 1000;
        break;

      case '-': case '_':
        this.trader.buyAmountSOL = Math.max(0.001, Math.round((this.trader.buyAmountSOL - 0.005) * 1000) / 1000);
        break;

      case 'r': case 'R':
        this.renderer.statusMsg = 'Refreshing...';
        this.pollManager.poll();
        break;
    }
  }

  stop(): void {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdin.pause();
  }
}

// ═══════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════

async function main() {
  process.stdout.write(HIDE_CUR);
  console.log(c('\n  Starting GDEX Solana Scanner...\n', `${BOLD}${CYN}`));

  // Auth
  const config = loadConfig();
  const apiKey = config.apiKey.split(',')[0].trim();
  console.log(c('  Authenticating...', DIM));

  let session: GDEXSession;
  try {
    session = await createAuthenticatedSession({
      apiUrl: config.apiUrl, apiKey,
      walletAddress: config.walletAddress,
      privateKey: config.privateKey,
      chainId: SOLANA,
    });
  } catch {
    session = await createAuthenticatedSession({
      apiUrl: config.apiUrl, apiKey,
      walletAddress: config.walletAddress,
      privateKey: config.privateKey,
      chainId: 42161,
    });
  }
  console.log(c('  Authenticated.\n', GRN));

  // Init
  const store = new TokenStore();
  const wsManager = new WSManager(session.sdk, store);
  const pollManager = new PollingManager(session.sdk, store);
  const trader = new TradeExecutor(session);
  const renderer = new Renderer(store, wsManager, pollManager, trader, session);
  const input = new InputHandler(renderer, trader, store, pollManager);

  // Connect
  console.log(c('  Connecting WebSocket...', DIM));
  await wsManager.connect();
  console.log(c(`  WebSocket: ${wsManager.connected ? 'Connected' : 'Failed (polling only)'}`, wsManager.connected ? GRN : YEL));

  console.log(c('  Starting poll...', DIM));
  pollManager.start();

  // Wait for initial data
  console.log(c('  Waiting for initial data...', DIM));
  await new Promise(r => setTimeout(r, 2000));

  // Start input
  input.start();

  // Render loop
  const renderTimer = setInterval(() => {
    if (input.running) renderer.render();
  }, RENDER_MS);

  const startTime = Date.now();

  // Shutdown handler
  const shutdown = () => {
    clearInterval(renderTimer);
    pollManager.stop();
    wsManager.disconnect();
    input.stop();
    process.stdout.write(SHOW_CUR + CLR);

    const a = store.getAnalytics();
    console.log(c('\n  ━━━ GDEX Scanner Session Summary ━━━\n', `${BOLD}${CYN}`));
    console.log(`  Duration:       ${fmtDuration(Date.now() - startTime)}`);
    console.log(`  Tokens scanned: ${a.total}`);
    console.log(`  WS messages:    ${wsManager.msgCount}`);
    console.log(`  New tokens:     ${wsManager.newCount}`);
    console.log(`  Price updates:  ${wsManager.updateCount}`);
    console.log(`  Poll cycles:    ${pollManager.pollCount}`);
    console.log(`  Graduated:      ${a.graduated}`);
    console.log(`  Trades:         ${trader.log.length}`);

    if (trader.log.length > 0) {
      console.log(c('\n  Trades:', `${BOLD}${WHT}`));
      trader.log.forEach(t => {
        const icon = t.result === 'SUCCESS' ? c('✓', GRN) : c('✗', RED);
        console.log(`    ${icon} ${t.action} ${t.symbol} ${t.amount} SOL → ${t.result}${t.hash ? ` (${t.hash.slice(0, 12)}...)` : ''}`);
      });
    }

    console.log(c('\n  Session ended.\n', DIM));
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Wait for quit
  await new Promise<void>(resolve => {
    const check = setInterval(() => {
      if (!input.running) {
        clearInterval(check);
        resolve();
      }
    }, 100);
  });

  shutdown();
}

main().catch(err => {
  process.stdout.write(SHOW_CUR);
  console.error('Fatal error:', err);
  process.exit(1);
});
