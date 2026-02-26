/**
 * Agent 5 — SCALPER
 * Watches the watchlist for freshly launched tokens (0–2 min old).
 * Buys the most active fresh token immediately on detection.
 * Exits at +10% TP, -3% SL, trailing stop (+3% activate / 2% drop),
 * or 30s max hold — whichever hits first.
 *
 * Filters (minimal, speed > precision):
 *   - NOT Token-2022
 *   - NOT mint/freeze enabled (if securities data present)
 *   - txCount ≥ 5 (some initial activity)
 *   - bondingCurveProgress ≥ 3%
 *   - marketCap ≥ $500
 *
 * Run standalone: ts-node src/pumpfun-scalper.ts
 */

import WebSocket from 'ws';
(globalThis as any).WebSocket = WebSocket;

import * as fs from 'fs';
import { createAuthenticatedSession, GDEXSession } from './auth';
import { buyToken, sellToken, formatSolAmount } from './trading';

// ─── Constants ────────────────────────────────────────────────────────────────

const SOLANA = 622112261;
const BUY_SOL = 0.005;
const MAX_POSITIONS = 3;
const FRESH_MAX_AGE_MS = 2 * 60 * 1000;   // buy window: 0–2 min old
const SCALP_TP_PCT = 10;                   // hard TP cap (down from 20)
const SCALP_SL_PCT = -3;
const TRAIL_ACTIVATE_PCT = 3;              // start trailing once up +3%
const TRAIL_DROP_PCT = 2;                  // exit if drops 2% below peak
const MAX_HOLD_MS = 30 * 1000;              // eject at 30s regardless
const MIN_TX_COUNT = 5;
const MIN_BC_PROGRESS = 3;
const MIN_MCAP = 500;
const RETRY_COOLDOWN_MS = 3 * 60 * 1000;
const POLL_MS = 5_000;
const SESSION_REFRESH_MS = 25 * 60 * 1000;
const WATCHLIST_PATH = '/tmp/pumpfun-watchlist.json';
const POSITIONS_PATH = '/tmp/pumpfun-scalp-positions.json';
const REGULAR_POSITIONS_PATH = '/tmp/pumpfun-positions.json';
const LOG_PATH = '/tmp/pumpfun-log.json';

let session: GDEXSession;
const closingPositions = new Set<string>();

// ─── Types ────────────────────────────────────────────────────────────────────

interface WatchedToken {
  address: string;
  name: string;
  symbol: string;
  price: number;
  prevPrice?: number;
  marketCap: number;
  txCount: number;
  bondingCurveProgress: number;
  isToken2022: boolean;
  firstSeen: string;
  securities?: { mintAbility: boolean; freezeAbility: boolean };
}

interface ScalpPosition {
  id: string;
  address: string;
  name: string;
  symbol: string;
  entryPrice: number;
  currentPrice: number;
  peakPrice: number;
  entryTime: string;
  amountLamports: string;
  solSpent: number;
  status: 'open' | 'closed';
  txHash: string | null;
  exitPrice?: number;
  exitTime?: string;
  exitReason?: 'TP' | 'SL' | 'TIME';
  exitTxHash?: string | null;
}

interface PositionsFile {
  lastUpdated: string;
  positions: ScalpPosition[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg: string) {
  process.stderr.write(`[SCALPER ${new Date().toISOString()}] ${msg}\n`);
}

async function authenticate(): Promise<void> {
  try {
    session = await createAuthenticatedSession({ chainId: SOLANA });
    log(`Authenticated on Solana chain ${SOLANA}`);
  } catch (err: any) {
    log(`Solana auth failed (${err?.message}), falling back to Arbitrum...`);
    session = await createAuthenticatedSession({ chainId: 42161 });
    log('Authenticated on Arbitrum (fallback)');
  }
}

function readPositions(): PositionsFile {
  try {
    if (!fs.existsSync(POSITIONS_PATH)) {
      return { lastUpdated: new Date().toISOString(), positions: [] };
    }
    return JSON.parse(fs.readFileSync(POSITIONS_PATH, 'utf8'));
  } catch {
    return { lastUpdated: new Date().toISOString(), positions: [] };
  }
}

function writePositions(data: PositionsFile) {
  const tmp = POSITIONS_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, POSITIONS_PATH);
}

function appendToLog(trade: object) {
  try {
    let logData: { lastUpdated: string; trades: any[] };
    try {
      logData = JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'));
    } catch {
      logData = { lastUpdated: new Date().toISOString(), trades: [] };
    }
    logData.trades.push(trade);
    logData.lastUpdated = new Date().toISOString();
    const tmp = LOG_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(logData, null, 2));
    fs.renameSync(tmp, LOG_PATH);
  } catch {
    // Non-fatal
  }
}

async function getCurrentPrice(address: string): Promise<number | null> {
  try {
    const result = await session.sdk.tokens.getToken(address, SOLANA);
    if (!result) return null;
    const td = Array.isArray(result) ? result[0] : result;
    if (!td) return null;
    const raw = (td as any).priceUsd ?? (td as any).priceNative;
    const parsed = typeof raw === 'number' ? raw : parseFloat(raw ?? '0');
    return parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

// ─── Scalp candidate filter ───────────────────────────────────────────────────

function isScalpCandidate(t: WatchedToken): boolean {
  if (t.securities?.mintAbility) return false;
  if (t.securities?.freezeAbility) return false;
  const ageMs = Date.now() - new Date(t.firstSeen).getTime();
  if (ageMs > FRESH_MAX_AGE_MS) return false;
  if ((t.txCount ?? 0) < MIN_TX_COUNT) return false;
  if ((t.bondingCurveProgress ?? 0) < MIN_BC_PROGRESS) return false;
  if ((t.marketCap ?? 0) < MIN_MCAP) return false;
  if (!t.price || t.price <= 0) return false;
  // Anti-rug: reject tokens whose price is falling
  if (t.prevPrice && t.prevPrice > 0 && t.price < t.prevPrice * 0.95) {
    return false;
  }
  return true;
}

// ─── Close executor ───────────────────────────────────────────────────────────

async function executeClose(
  pos: ScalpPosition,
  currentPrice: number,
  reason: 'TP' | 'SL' | 'TIME',
): Promise<void> {
  if (closingPositions.has(pos.id)) return;
  closingPositions.add(pos.id);

  try {
    const posData = readPositions();
    const posInData = posData.positions.find((p) => p.id === pos.id);
    if (!posInData || posInData.status !== 'open') return;

    let sellResult = await sellToken(session, {
      tokenAddress: pos.address,
      amount: pos.amountLamports,
      chainId: SOLANA,
    });

    if (!sellResult.isSuccess) {
      log(`  Sell failed — refreshing session and retrying...`);
      await authenticate();
      sellResult = await sellToken(session, {
        tokenAddress: pos.address,
        amount: pos.amountLamports,
        chainId: SOLANA,
      });
    }

    if (!sellResult.isSuccess) {
      log(
        `  ❌ Sell retry failed for ${pos.symbol}: ` +
        `${sellResult.message ?? JSON.stringify(sellResult)}`,
      );
      return;
    }

    const pnlPct = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
    const exitTime = new Date().toISOString();
    const pnlSol = pos.solSpent * (pnlPct / 100);

    posInData.status = 'closed';
    posInData.exitPrice = currentPrice;
    posInData.exitTime = exitTime;
    posInData.exitReason = reason;
    posInData.exitTxHash = sellResult.hash ?? null;
    posData.lastUpdated = exitTime;
    writePositions(posData);

    appendToLog({
      id: pos.id, address: pos.address, name: pos.name, symbol: pos.symbol,
      entryPrice: pos.entryPrice, exitPrice: currentPrice,
      entryTime: pos.entryTime, exitTime,
      exitReason: reason, solSpent: pos.solSpent,
      pnlSol, pnlPct, exitTxHash: sellResult.hash ?? null, type: 'scalp',
    });

    const emoji = reason === 'TP' ? '✅' : reason === 'TIME' ? '⏱' : '❌';
    log(
      `  ${emoji} SCALP CLOSED ${pos.symbol} | ${reason} ` +
      `| P&L: ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%` +
      ` (${pnlSol >= 0 ? '+' : ''}${pnlSol.toFixed(4)} SOL)` +
      ` | tx: ${sellResult.hash ?? 'n/a'}`,
    );
  } finally {
    closingPositions.delete(pos.id);
  }
}

// ─── WebSocket price handler ───────────────────────────────────────────────────

async function onPriceUpdates(updates: any[]): Promise<void> {
  const posData = readPositions();
  const openPositions = posData.positions.filter((p) => p.status === 'open');
  if (openPositions.length === 0) return;

  const openByAddr = new Map(openPositions.map((p) => [p.address, p]));
  let dirty = false;
  let sellFired = false;

  for (const update of updates) {
    if (!update.address) continue;
    const pos = openByAddr.get(update.address);
    if (!pos) continue;

    const price =
      typeof update.priceUsd === 'number'
        ? update.priceUsd
        : parseFloat(update.priceUsd ?? update.priceNative ?? '0') || 0;
    if (price <= 0) continue;

    const posInData = posData.positions.find((p) => p.id === pos.id);
    if (posInData && posInData.currentPrice !== price) {
      posInData.currentPrice = price;
      dirty = true;
    }

    if (closingPositions.has(pos.id)) continue;
    const pnlPct = ((price - pos.entryPrice) / pos.entryPrice) * 100;

    // Track peak price for trailing stop
    if (posInData && price > (posInData.peakPrice ?? pos.entryPrice)) {
      posInData.peakPrice = price;
      dirty = true;
    }

    if (pnlPct >= SCALP_TP_PCT) {
      log(`  ⚡ WS TP: ${pos.symbol} (+${pnlPct.toFixed(1)}%)`);
      sellFired = true;
      executeClose(pos, price, 'TP').catch((e) => log(`  Close error: ${e?.message}`));
    } else if (pnlPct <= SCALP_SL_PCT) {
      log(`  ⚡ WS SL: ${pos.symbol} (${pnlPct.toFixed(1)}%)`);
      sellFired = true;
      executeClose(pos, price, 'SL').catch((e) => log(`  Close error: ${e?.message}`));
    } else {
      // Trailing stop: once up +3%, exit if drops 2% below peak
      const peak = posInData?.peakPrice ?? pos.entryPrice;
      const peakPnl = ((peak - pos.entryPrice) / pos.entryPrice) * 100;
      if (peakPnl >= TRAIL_ACTIVATE_PCT) {
        const dropFromPeak =
          ((peak - price) / peak) * 100;
        if (dropFromPeak >= TRAIL_DROP_PCT) {
          log(
            `  ⚡ WS TRAIL: ${pos.symbol}` +
            ` peak +${peakPnl.toFixed(1)}%` +
            ` now +${pnlPct.toFixed(1)}%` +
            ` (dropped ${dropFromPeak.toFixed(1)}% from peak)`,
          );
          sellFired = true;
          executeClose(pos, price, 'TP')
            .catch((e) => log(`  Close error: ${e?.message}`));
        }
      }
    }
  }

  // Only write price updates when no sells were fired.
  // Async sells read fresh posData and write their own updates;
  // writing stale posData here would clobber status changes.
  if (dirty && !sellFired) {
    posData.lastUpdated = new Date().toISOString();
    writePositions(posData);
  }
}

// ─── WebSocket feed ───────────────────────────────────────────────────────────

async function startWebSocketFeed(): Promise<void> {
  try {
    await session.sdk.connectWebSocketWithChain(SOLANA, {
      autoReconnect: true,
      maxReconnectAttempts: 10,
      reconnectInterval: 5000,
    });

    const wsClient = session.sdk.getWebSocketClient();
    if (!wsClient) {
      log('WebSocket client unavailable (non-fatal — poll fallback active)');
      return;
    }

    wsClient.on('connect', () => log('WebSocket connected — real-time exits active'));
    wsClient.on('disconnect', () => log('WebSocket disconnected'));
    wsClient.on('error', () => {});

    wsClient.on('message', (data: any) => {
      if (data.effectedTokensData?.length) {
        onPriceUpdates(data.effectedTokensData).catch(() => {});
      }
    });

    log('WebSocket price feed started');
  } catch (err: any) {
    log(`WebSocket unavailable (non-fatal): ${err?.message ?? err}`);
  }
}

// ─── Time-based exit ─────────────────────────────────────────────────────────

async function ageCheckLoop(): Promise<void> {
  try {
    const posData = readPositions();
    const open = posData.positions.filter((p) => p.status === 'open');

    for (const pos of open) {
      if (closingPositions.has(pos.id)) continue;

      const currentPrice = await getCurrentPrice(pos.address);
      const price = currentPrice ?? pos.currentPrice;

      // Update peak price via REST poll
      if (currentPrice && currentPrice > (pos.peakPrice ?? pos.entryPrice)) {
        const fresh = readPositions();
        const fp = fresh.positions.find(
          (p) => p.id === pos.id && p.status === 'open',
        );
        if (fp) {
          fp.peakPrice = currentPrice;
          fp.currentPrice = currentPrice;
          fresh.lastUpdated = new Date().toISOString();
          writePositions(fresh);
        }
      }

      const pnlPct = ((price - pos.entryPrice) / pos.entryPrice) * 100;

      // Hard TP / SL
      if (pnlPct >= SCALP_TP_PCT) {
        log(`  ⚡ POLL TP: ${pos.symbol} (+${pnlPct.toFixed(1)}%)`);
        await executeClose(pos, price, 'TP');
        continue;
      }
      if (pnlPct <= SCALP_SL_PCT) {
        log(`  ⚡ POLL SL: ${pos.symbol} (${pnlPct.toFixed(1)}%)`);
        await executeClose(pos, price, 'SL');
        continue;
      }

      // Trailing stop check (poll fallback)
      const peak = pos.peakPrice ?? pos.entryPrice;
      const peakPnl = ((peak - pos.entryPrice) / pos.entryPrice) * 100;
      if (peakPnl >= TRAIL_ACTIVATE_PCT && currentPrice) {
        const dropFromPeak = ((peak - price) / peak) * 100;
        if (dropFromPeak >= TRAIL_DROP_PCT) {
          log(
            `  ⚡ POLL TRAIL: ${pos.symbol}` +
            ` peak +${peakPnl.toFixed(1)}%` +
            ` now +${pnlPct.toFixed(1)}%` +
            ` (dropped ${dropFromPeak.toFixed(1)}% from peak)`,
          );
          await executeClose(pos, price, 'TP');
          continue;
        }
      }

      // Time-based exit
      const ageMs = Date.now() - new Date(pos.entryTime).getTime();
      if (ageMs >= MAX_HOLD_MS) {
        log(
          `  ⏱ TIME EXIT: ${pos.symbol}` +
          ` held ${(ageMs / 1000).toFixed(0)}s ≥ 30s`,
        );
        await executeClose(pos, price, 'TIME');
      }
    }
  } catch (err: any) {
    log(`Age check error: ${err?.message ?? err}`);
  }
}

// ─── Main scalp loop ─────────────────────────────────────────────────────────

async function scalpLoop(attempted: Map<string, number>): Promise<void> {
  try {
    const posData = readPositions();
    const openCount = posData.positions.filter((p) => p.status === 'open').length;
    if (openCount >= MAX_POSITIONS) return;

    // Collect addresses AND symbols from both scalp and regular positions
    const heldAddrs = new Set(
      posData.positions.filter((p) => p.status === 'open').map((p) => p.address),
    );
    const heldSymbols = new Set(
      posData.positions.filter((p) => p.status === 'open')
        .map((p) => p.symbol.toUpperCase()),
    );
    try {
      const regular = JSON.parse(
        fs.readFileSync(REGULAR_POSITIONS_PATH, 'utf8'),
      );
      for (const p of regular.positions ?? []) {
        if (p.status === 'open') {
          heldAddrs.add(p.address);
          heldSymbols.add((p.symbol ?? '').toUpperCase());
        }
      }
    } catch {
      // Regular positions file may not exist yet
    }

    let tokens: WatchedToken[] = [];
    try {
      const wl = JSON.parse(fs.readFileSync(WATCHLIST_PATH, 'utf8'));
      tokens = wl?.tokens ?? [];
    } catch {
      return; // Watchlist not ready yet
    }

    const now = Date.now();
    const candidates = tokens.filter((t) => {
      if (heldAddrs.has(t.address)) return false;
      if (heldSymbols.has(t.symbol.toUpperCase())) return false;
      const lastAttempt = attempted.get(t.address);
      if (lastAttempt && now - lastAttempt < RETRY_COOLDOWN_MS) return false;
      return isScalpCandidate(t);
    });

    if (candidates.length === 0) return;

    // Pick most active fresh token
    candidates.sort((a, b) => (b.txCount ?? 0) - (a.txCount ?? 0));
    const target = candidates[0];
    const ageS = ((now - new Date(target.firstSeen).getTime()) / 1000).toFixed(0);

    log(
      `SCALP signal: ${target.symbol} (${target.address.slice(0, 8)}...)` +
      ` age=${ageS}s tx=${target.txCount} bc=${target.bondingCurveProgress.toFixed(0)}%` +
      ` mcap=$${(target.marketCap / 1000).toFixed(1)}K`,
    );

    attempted.set(target.address, now);

    let result = await buyToken(session, {
      tokenAddress: target.address,
      amount: formatSolAmount(BUY_SOL),
      chainId: SOLANA,
    });

    if (!result.isSuccess) {
      log('Buy failed — refreshing session and retrying once...');
      await authenticate();
      result = await buyToken(session, {
        tokenAddress: target.address,
        amount: formatSolAmount(BUY_SOL),
        chainId: SOLANA,
      });
    }

    if (result.isSuccess) {
      const position: ScalpPosition = {
        id: `scalp-${Date.now()}-${target.address.slice(0, 6)}`,
        address: target.address,
        name: target.name,
        symbol: target.symbol,
        entryPrice: target.price,
        currentPrice: target.price,
        peakPrice: target.price,
        entryTime: new Date().toISOString(),
        amountLamports: formatSolAmount(BUY_SOL),
        solSpent: BUY_SOL,
        status: 'open',
        txHash: result.hash ?? null,
      };

      const fresh = readPositions();
      fresh.positions.push(position);
      fresh.lastUpdated = new Date().toISOString();
      writePositions(fresh);

      log(`✅ SCALP BOUGHT ${target.symbol} | tx: ${result.hash ?? 'n/a'} | ${BUY_SOL} SOL`);
    } else {
      log(`❌ SCALP BUY FAILED ${target.symbol}: ${result.message ?? JSON.stringify(result)}`);
    }
  } catch (err: any) {
    log(`Scalp loop error: ${err?.message ?? err}`);
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main() {
  log('Starting scalper...');

  await authenticate();
  await startWebSocketFeed();

  const attempted = new Map<string, number>();
  const refreshInterval = setInterval(authenticate, SESSION_REFRESH_MS);

  await ageCheckLoop();
  await scalpLoop(attempted);

  const interval = setInterval(async () => {
    await ageCheckLoop();
    await scalpLoop(attempted);
  }, POLL_MS);

  const shutdown = () => {
    log('Shutting down scalper');
    clearInterval(interval);
    clearInterval(refreshInterval);
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  log(
    `Scalper running — poll ${POLL_MS / 1000}s` +
    ` | Fresh 0–2min | TP +${SCALP_TP_PCT}%` +
    ` | Trail +${TRAIL_ACTIVATE_PCT}%↓${TRAIL_DROP_PCT}%` +
    ` | SL ${SCALP_SL_PCT}% | Max ${MAX_HOLD_MS / 1000}s`,
  );
}

main().catch((err) => {
  process.stderr.write(`[SCALPER FATAL] ${err?.message ?? err}\n`);
  process.exit(1);
});
