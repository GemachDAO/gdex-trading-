/**
 * Agent 4 — RISK MANAGER
 * Primary: WebSocket price feed fires exits on every price tick.
 * Fallback: REST poll every 20s catches anything the WS misses.
 *
 * Exit strategy (partial exits — each 1/3 of original position):
 *   +25%  → sell 1/3  (exitStage 0 → 1), raise SL to breakeven (0%)
 *   +50%  → sell 1/3  (exitStage 1 → 2), raise SL to +15%
 *   +100% → sell remaining 1/3 and close (exitStage 2 → closed)
 *   SL    → stage 0: -5%, stage 1: 0%, stage 2: +15%
 *   20min → time-based exit — sell all remaining
 *
 * Run standalone: ts-node src/pumpfun-risk.ts
 */

import WebSocket from 'ws';
(globalThis as any).WebSocket = WebSocket;

import * as fs from 'fs';
import { createAuthenticatedSession, GDEXSession } from './auth';
import { sellToken } from './trading';

// ─── Constants ────────────────────────────────────────────────────────────────

const SOLANA = 622112261;
const POLL_MS = 8_000;              // REST fallback — fast poll catches SL faster
const STOP_LOSS_PCT = -5;
const TRAILING_SL_STAGE1 = 0;      // breakeven after first partial
const TRAILING_SL_STAGE2 = 15;     // lock +15% profit after second partial
const PARTIAL_1_PCT = 25;           // +25%  → sell 1/3, exitStage 0→1
const PARTIAL_2_PCT = 50;           // +50%  → sell 1/3, exitStage 1→2
const FINAL_TP_PCT = 100;           // +100% → sell remaining, close
const MAX_HOLD_MS = 20 * 60 * 1000; // 20-min max hold
const SESSION_REFRESH_MS = 25 * 60 * 1000;
const POSITIONS_PATH = '/tmp/pumpfun-positions.json';
const LOG_PATH = '/tmp/pumpfun-log.json';

// Module-level session so authenticate() can refresh it anywhere
let session: GDEXSession;

// Guards against concurrent closes/partials of the same position
const closingPositions = new Set<string>();

// ─── Types ────────────────────────────────────────────────────────────────────

interface Position {
  id: string;
  address: string;
  name: string;
  symbol: string;
  entryPrice: number;
  currentPrice: number;
  entryTime: string;
  amountLamports: string;
  remainingLamports: string;
  solSpent: number;
  status: 'open' | 'closed';
  exitStage: 0 | 1 | 2;
  txHash: string | null;
  score: number;
  exitPrice?: number;
  exitTime?: string;
  exitReason?: 'TP' | 'SL' | 'TIME';
  exitTxHash?: string | null;
}

interface PositionsFile {
  lastUpdated: string;
  positions: Position[];
}

interface TradeLog {
  id: string;
  address: string;
  name: string;
  symbol: string;
  entryPrice: number;
  exitPrice: number;
  entryTime: string;
  exitTime: string;
  exitReason: 'TP' | 'SL' | 'TIME';
  solSpent: number;
  pnlSol: number;
  pnlPct: number;
  exitTxHash: string | null;
}

interface LogFile {
  lastUpdated: string;
  trades: TradeLog[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg: string) {
  process.stderr.write(`[RISK ${new Date().toISOString()}] ${msg}\n`);
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

function readPositions(): PositionsFile | null {
  try {
    if (!fs.existsSync(POSITIONS_PATH)) return null;
    return JSON.parse(fs.readFileSync(POSITIONS_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function writePositions(data: PositionsFile) {
  const tmp = POSITIONS_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, POSITIONS_PATH);
}

function readLog(): LogFile {
  try {
    return JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'));
  } catch {
    return { lastUpdated: new Date().toISOString(), trades: [] };
  }
}

function appendToLog(trade: TradeLog) {
  const logData = readLog();
  logData.trades.push(trade);
  logData.lastUpdated = new Date().toISOString();
  const tmp = LOG_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(logData, null, 2));
  fs.renameSync(tmp, LOG_PATH);
}

// ─── Trailing SL ──────────────────────────────────────────────────────────────
// SL ratchets up after each partial: -8% → 0% → +15%

function effectiveSL(stage: number): number {
  if (stage >= 2) return TRAILING_SL_STAGE2;
  if (stage >= 1) return TRAILING_SL_STAGE1;
  return STOP_LOSS_PCT;
}

// ─── Price fetcher (REST fallback) ────────────────────────────────────────────

async function getCurrentPrice(address: string): Promise<number | null> {
  try {
    const result = await session.sdk.tokens.getToken(address, SOLANA);
    if (!result) return null;
    const tokenData = Array.isArray(result) ? result[0] : result;
    if (!tokenData) return null;
    const raw = tokenData.priceUsd ?? tokenData.priceNative;
    const parsed = typeof raw === 'number' ? raw : parseFloat(raw ?? '0');
    return parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

// ─── Partial sell (1/3 of original position) ──────────────────────────────────

async function executePartialSell(
  pos: Position,
  currentPrice: number,
  newStage: 1 | 2,
  triggerPct: number,
): Promise<void> {
  if (closingPositions.has(pos.id)) return;
  closingPositions.add(pos.id);

  try {
    const posData = readPositions();
    if (!posData) return;
    const posInData = posData.positions.find((p) => p.id === pos.id);
    if (!posInData || posInData.status !== 'open') return;
    if (posInData.exitStage >= newStage) return; // already handled this stage

    const totalLamports = parseInt(pos.amountLamports, 10);
    const sellLamports = Math.floor(totalLamports / 3).toString();
    const prevRemaining = parseInt(posInData.remainingLamports ?? pos.amountLamports, 10);
    const newRemaining = Math.max(0, prevRemaining - parseInt(sellLamports, 10)).toString();

    let sellResult = await sellToken(session, {
      tokenAddress: pos.address,
      amount: sellLamports,
      chainId: SOLANA,
    });

    if (!sellResult.isSuccess) {
      log(`  Partial sell failed — refreshing session and retrying...`);
      await authenticate();
      sellResult = await sellToken(session, {
        tokenAddress: pos.address,
        amount: sellLamports,
        chainId: SOLANA,
      });
    }

    if (!sellResult.isSuccess) {
      log(
        `  ❌ Partial sell retry failed for ${pos.symbol}: ` +
        `${sellResult.message ?? JSON.stringify(sellResult)}`,
      );
      return;
    }

    posInData.exitStage = newStage;
    posInData.remainingLamports = newRemaining;
    posInData.currentPrice = currentPrice;
    posData.lastUpdated = new Date().toISOString();
    writePositions(posData);

    const pnlPct =
      ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
    const partialFraction = parseInt(sellLamports, 10)
      / parseInt(pos.amountLamports, 10);
    const partialPnlSol =
      pos.solSpent * partialFraction * (pnlPct / 100);

    appendToLog({
      id: `${pos.id}-partial${newStage}`,
      address: pos.address,
      name: pos.name,
      symbol: pos.symbol,
      entryPrice: pos.entryPrice,
      exitPrice: currentPrice,
      entryTime: pos.entryTime,
      exitTime: new Date().toISOString(),
      exitReason: 'TP',
      solSpent: pos.solSpent * partialFraction,
      pnlSol: partialPnlSol,
      pnlPct,
      exitTxHash: sellResult.hash ?? null,
    });

    log(
      `  🔒 PARTIAL SELL ${pos.symbol} (1/3) | trigger: +${triggerPct}% ` +
      `| stage ${newStage - 1}→${newStage} ` +
      `| P&L at trigger: +${pnlPct.toFixed(1)}% | tx: ${sellResult.hash ?? 'n/a'}`,
    );
  } finally {
    closingPositions.delete(pos.id);
  }
}

// ─── Full close ───────────────────────────────────────────────────────────────

async function executeClose(
  pos: Position,
  currentPrice: number,
  reason: 'TP' | 'SL' | 'TIME',
): Promise<void> {
  if (closingPositions.has(pos.id)) return;
  closingPositions.add(pos.id);

  try {
    const posData = readPositions();
    if (!posData) return;
    const posInData = posData.positions.find((p) => p.id === pos.id);
    if (!posInData || posInData.status !== 'open') return;

    const sellAmount = posInData.remainingLamports ?? posInData.amountLamports;

    let sellResult = await sellToken(session, {
      tokenAddress: pos.address,
      amount: sellAmount,
      chainId: SOLANA,
    });

    if (!sellResult.isSuccess) {
      log(`  Sell failed — refreshing session and retrying once...`);
      await authenticate();
      sellResult = await sellToken(session, {
        tokenAddress: pos.address,
        amount: sellAmount,
        chainId: SOLANA,
      });
    }

    if (!sellResult.isSuccess) {
      log(
        `  ❌ Sell retry also failed for ${pos.symbol}: ` +
        `${sellResult.message ?? JSON.stringify(sellResult)}`,
      );
      return;
    }

    const pnlPct = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
    const exitTime = new Date().toISOString();
    const remaining = parseInt(sellAmount, 10);
    const total = parseInt(pos.amountLamports, 10);
    const remainingFraction = total > 0 ? remaining / total : 1;
    const pnlSol = pos.solSpent * remainingFraction * (pnlPct / 100);

    posInData.status = 'closed';
    posInData.exitPrice = currentPrice;
    posInData.exitTime = exitTime;
    posInData.exitReason = reason;
    posInData.exitTxHash = sellResult.hash ?? null;
    posData.lastUpdated = exitTime;
    writePositions(posData);

    appendToLog({
      id: pos.id,
      address: pos.address,
      name: pos.name,
      symbol: pos.symbol,
      entryPrice: pos.entryPrice,
      exitPrice: currentPrice,
      entryTime: pos.entryTime,
      exitTime,
      exitReason: reason,
      solSpent: pos.solSpent,
      pnlSol,
      pnlPct,
      exitTxHash: sellResult.hash ?? null,
    });

    const emoji = reason === 'TP' ? '✅' : reason === 'TIME' ? '⏱' : '❌';
    log(
      `  ${emoji} CLOSED ${pos.symbol} | reason: ${reason} ` +
      `| P&L: ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%` +
      ` (${pnlSol >= 0 ? '+' : ''}${pnlSol.toFixed(4)} SOL) | tx: ${sellResult.hash ?? 'n/a'}`,
    );
  } finally {
    closingPositions.delete(pos.id);
  }
}

// ─── WebSocket price handler ───────────────────────────────────────────────────

async function onPriceUpdates(updates: any[]): Promise<void> {
  const posData = readPositions();
  if (!posData) return;

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

    const sl = effectiveSL(pos.exitStage);

    if (pos.exitStage === 0 && pnlPct >= PARTIAL_1_PCT) {
      log(`  ⚡ WS Stage 1: ${pos.symbol} (+${pnlPct.toFixed(1)}%) → selling 1/3`);
      sellFired = true;
      executePartialSell(pos, price, 1, PARTIAL_1_PCT)
        .catch((e) => log(`  Partial error: ${e?.message}`));
    } else if (pos.exitStage === 1 && pnlPct >= PARTIAL_2_PCT) {
      log(`  ⚡ WS Stage 2: ${pos.symbol} (+${pnlPct.toFixed(1)}%) → selling 1/3`);
      sellFired = true;
      executePartialSell(pos, price, 2, PARTIAL_2_PCT)
        .catch((e) => log(`  Partial error: ${e?.message}`));
    } else if (pos.exitStage === 2 && pnlPct >= FINAL_TP_PCT) {
      log(`  ⚡ WS Final TP: ${pos.symbol} (+${pnlPct.toFixed(1)}%)`);
      sellFired = true;
      executeClose(pos, price, 'TP').catch((e) => log(`  Close error: ${e?.message}`));
    } else if (pnlPct <= sl) {
      log(`  ⚡ WS SL: ${pos.symbol} (${pnlPct.toFixed(1)}% ≤ ${sl}% stage${pos.exitStage})`);
      sellFired = true;
      executeClose(pos, price, 'SL').catch((e) => log(`  Close error: ${e?.message}`));
    }
  }

  // Only write price updates when no sells were fired.
  // Async sells read fresh posData and write their own updates;
  // writing stale posData here would clobber stage/status changes.
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
    wsClient.on('disconnect', () => log('WebSocket disconnected — poll fallback active'));
    wsClient.on('error', () => {}); // suppress — poll handles recovery

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

// ─── Time-based exit loop (runs every 60s alongside REST poll) ────────────────

async function ageCheckLoop(): Promise<void> {
  try {
    const posData = readPositions();
    if (!posData) return;

    const openPositions = posData.positions.filter((p) => p.status === 'open');
    for (const pos of openPositions) {
      if (closingPositions.has(pos.id)) continue;
      const ageMs = Date.now() - new Date(pos.entryTime).getTime();
      if (ageMs < MAX_HOLD_MS) continue;

      const currentPrice = await getCurrentPrice(pos.address);
      if (currentPrice === null) {
        log(`  ${pos.symbol}: price fetch failed for time exit, skipping`);
        continue;
      }
      log(`  ⏱ TIME EXIT: ${pos.symbol} held ${(ageMs / 60_000).toFixed(0)}min ≥ 20min`);
      await executeClose(pos, currentPrice, 'TIME');
    }
  } catch (err: any) {
    log(`Age check error: ${err?.message ?? err}`);
  }
}

// ─── REST fallback poll ───────────────────────────────────────────────────────

async function riskLoop(): Promise<void> {
  try {
    const posData = readPositions();
    if (!posData) return;

    const openPositions = posData.positions.filter((p) => p.status === 'open');
    if (openPositions.length === 0) return;

    log(`Poll: checking ${openPositions.length} open position(s)...`);
    let dirty = false;

    for (const pos of openPositions) {
      try {
        if (closingPositions.has(pos.id)) continue;

        const currentPrice = await getCurrentPrice(pos.address);
        if (currentPrice === null) {
          log(`  ${pos.symbol}: price fetch failed, skipping`);
          continue;
        }

        const posInData = posData.positions.find((p) => p.id === pos.id);
        if (!posInData) continue;
        posInData.currentPrice = currentPrice;
        dirty = true;

        const pnlPct = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
        log(
          `  ${pos.symbol}: entry=$${pos.entryPrice.toExponential(3)} ` +
          `current=$${currentPrice.toExponential(3)} ` +
          `P&L=${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}% stage=${pos.exitStage}`,
        );

        const sl = effectiveSL(pos.exitStage);

        if (pos.exitStage === 0 && pnlPct >= PARTIAL_1_PCT) {
          log(`  🎯 Poll Stage 1: ${pos.symbol} (+${pnlPct.toFixed(1)}%) → selling 1/3`);
          if (dirty) {
            posData.lastUpdated = new Date().toISOString();
            writePositions(posData);
            dirty = false;
          }
          await executePartialSell(pos, currentPrice, 1, PARTIAL_1_PCT);
        } else if (pos.exitStage === 1 && pnlPct >= PARTIAL_2_PCT) {
          log(`  🎯 Poll Stage 2: ${pos.symbol} (+${pnlPct.toFixed(1)}%) → selling 1/3`);
          if (dirty) {
            posData.lastUpdated = new Date().toISOString();
            writePositions(posData);
            dirty = false;
          }
          await executePartialSell(pos, currentPrice, 2, PARTIAL_2_PCT);
        } else if (pos.exitStage === 2 && pnlPct >= FINAL_TP_PCT) {
          log(`  🎯 Poll Final TP: ${pos.symbol} (+${pnlPct.toFixed(1)}%)`);
          if (dirty) {
            posData.lastUpdated = new Date().toISOString();
            writePositions(posData);
            dirty = false;
          }
          await executeClose(pos, currentPrice, 'TP');
        } else if (pnlPct <= sl) {
          log(`  🛑 Poll SL: ${pos.symbol} (${pnlPct.toFixed(1)}% ≤ ${sl}% stage${pos.exitStage})`);
          if (dirty) {
            posData.lastUpdated = new Date().toISOString();
            writePositions(posData);
            dirty = false;
          }
          await executeClose(pos, currentPrice, 'SL');
        }
      } catch (err: any) {
        log(`  Error checking ${pos.symbol}: ${err?.message ?? err}`);
      }
    }

    if (dirty) {
      posData.lastUpdated = new Date().toISOString();
      writePositions(posData);
    }
  } catch (err: any) {
    log(`Risk loop error: ${err?.message ?? err}`);
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main() {
  log('Starting risk manager...');

  await authenticate();

  if (!fs.existsSync(LOG_PATH)) {
    fs.writeFileSync(
      LOG_PATH,
      JSON.stringify({ lastUpdated: new Date().toISOString(), trades: [] }, null, 2),
    );
  }

  await startWebSocketFeed();

  const refreshInterval = setInterval(authenticate, SESSION_REFRESH_MS);

  await riskLoop();
  await ageCheckLoop();

  const pollInterval = setInterval(async () => {
    await riskLoop();
    await ageCheckLoop();
  }, POLL_MS);

  const shutdown = () => {
    log('Shutting down risk manager');
    clearInterval(pollInterval);
    clearInterval(refreshInterval);
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  log(
    `Risk manager running | WS: real-time | Poll fallback: ${POLL_MS / 1000}s` +
    ` | Exits: +${PARTIAL_1_PCT}%/+${PARTIAL_2_PCT}%/+${FINAL_TP_PCT}% (1/3 each)` +
    ` | SL: ${STOP_LOSS_PCT}%→${TRAILING_SL_STAGE1}%→+${TRAILING_SL_STAGE2}%` +
    ` | Max hold: 20min | Poll: ${POLL_MS / 1000}s`,
  );
}

main().catch((err) => {
  process.stderr.write(`[RISK FATAL] ${err?.message ?? err}\n`);
  process.exit(1);
});
