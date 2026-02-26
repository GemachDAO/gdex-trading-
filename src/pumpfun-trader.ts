/**
 * Agent 3 — TRADER
 * Monitors /tmp/pumpfun-scores.json every 10s.
 * Buys 0.005 SOL of any token scoring > 75 (max 5 concurrent positions).
 * Writes open positions to /tmp/pumpfun-positions.json.
 *
 * Run standalone: ts-node src/pumpfun-trader.ts
 */

import WebSocket from 'ws';
(globalThis as any).WebSocket = WebSocket;

import * as fs from 'fs';
import { createAuthenticatedSession, GDEXSession } from './auth';
import { buyToken, formatSolAmount } from './trading';

// ─── Constants ────────────────────────────────────────────────────────────────

const SOLANA = 622112261;
const POLL_MS = 10_000;
const BUY_SOL = 0.005;
const SCORE_THRESHOLD = 60;
const MAX_POSITIONS = 5;
const RETRY_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const SESSION_REFRESH_MS = 25 * 60 * 1000; // 25 minutes — refresh before server TTL
const SCORES_PATH = '/tmp/pumpfun-scores.json';
const POSITIONS_PATH = '/tmp/pumpfun-positions.json';
const SCALP_POSITIONS_PATH = '/tmp/pumpfun-scalp-positions.json';

// Module-level session so it can be refreshed without restarting the loop
let session: GDEXSession;

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
}

interface PositionsFile {
  lastUpdated: string;
  positions: Position[];
}

interface TokenScore {
  address: string;
  name: string;
  symbol: string;
  score: number;
  currentPrice: number;
  prevPrice?: number;
  priceChanges?: { m5: number; h1: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg: string) {
  process.stderr.write(`[TRADER ${new Date().toISOString()}] ${msg}\n`);
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

function readScores(): TokenScore[] {
  try {
    const data = JSON.parse(fs.readFileSync(SCORES_PATH, 'utf8'));
    return data.scores ?? [];
  } catch {
    return [];
  }
}

// ─── Main trader loop ─────────────────────────────────────────────────────────

async function tradingLoop(attempted: Map<string, number>) {
  try {
    const scores = readScores();
    if (scores.length === 0) return;

    const posData = readPositions();
    const positions = posData.positions;

    const openCount = positions.filter((p) => p.status === 'open').length;
    if (openCount >= MAX_POSITIONS) {
      log(`Max positions (${MAX_POSITIONS}) reached, not buying`);
      return;
    }

    // Collect addresses AND symbols from both trader and scalper positions
    const openAddrs = new Set(
      positions.filter((p) => p.status === 'open').map((p) => p.address),
    );
    const openSymbols = new Set(
      positions.filter((p) => p.status === 'open')
        .map((p) => p.symbol.toUpperCase()),
    );
    try {
      const scalp = JSON.parse(
        fs.readFileSync(SCALP_POSITIONS_PATH, 'utf8'),
      );
      for (const p of scalp.positions ?? []) {
        if (p.status === 'open') {
          openAddrs.add(p.address);
          openSymbols.add((p.symbol ?? '').toUpperCase());
        }
      }
    } catch {
      // Scalp positions file may not exist yet
    }

    const now = Date.now();
    const candidates = scores.filter((s) => {
      if (s.score <= SCORE_THRESHOLD) return false;
      if (openAddrs.has(s.address)) return false;
      if (openSymbols.has(s.symbol.toUpperCase())) return false;
      const lastAttempt = attempted.get(s.address);
      if (lastAttempt && now - lastAttempt < RETRY_COOLDOWN_MS) return false;
      // Anti-rug: reject tokens with falling price (m5 < -5% or price < prevPrice)
      if (s.priceChanges && s.priceChanges.m5 < -5) {
        log(`  SKIP ${s.symbol}: m5 price change ${s.priceChanges.m5.toFixed(1)}% (falling)`);
        return false;
      }
      if (s.prevPrice && s.prevPrice > 0 && s.currentPrice < s.prevPrice * 0.95) {
        log(`  SKIP ${s.symbol}: price dropped since last scan (${s.currentPrice} < ${s.prevPrice})`);
        return false;
      }
      return true;
    });

    // Update currentPrice for open positions from scores.
    // Re-read fresh before writing to avoid clobbering risk manager closes.
    const priceUpdates: Array<{ address: string; price: number }> = [];
    for (const pos of positions) {
      if (pos.status !== 'open') continue;
      const score = scores.find((s) => s.address === pos.address);
      if (score && score.currentPrice && score.currentPrice !== pos.currentPrice) {
        priceUpdates.push({ address: pos.address, price: score.currentPrice });
      }
    }

    if (priceUpdates.length > 0) {
      const fresh = readPositions();
      let dirty = false;
      for (const { address, price } of priceUpdates) {
        const p = fresh.positions.find((x) => x.address === address && x.status === 'open');
        if (p && p.currentPrice !== price) {
          p.currentPrice = price;
          dirty = true;
        }
      }
      if (dirty) {
        fresh.lastUpdated = new Date().toISOString();
        writePositions(fresh);
      }
    }

    if (candidates.length === 0) return;

    // Buy top scoring candidate
    const target = candidates[0];
    log(
      `BUY signal: ${target.symbol} (${target.address.slice(0, 8)}...) score=${target.score} price=${target.currentPrice}`
    );

    attempted.set(target.address, now);

    // Pre-buy price check: fetch live price, abort if dumping
    try {
      const liveResult = await session.sdk.tokens.getToken(
        target.address, SOLANA,
      );
      const td = Array.isArray(liveResult) ? liveResult[0] : liveResult;
      const rawPrice = (td as any)?.priceUsd ?? (td as any)?.priceNative;
      const livePrice = typeof rawPrice === 'number'
        ? rawPrice : parseFloat(rawPrice ?? '0');
      if (livePrice > 0 && target.currentPrice > 0) {
        const drift = ((livePrice - target.currentPrice) / target.currentPrice) * 100;
        if (drift < -5) {
          log(
            `  ABORT ${target.symbol}: price dropped ${drift.toFixed(1)}% since scoring ` +
            `(${target.currentPrice} → ${livePrice})`,
          );
          return;
        }
      }
    } catch {
      // Non-fatal — proceed with buy if price check fails
    }

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
      const position: Position = {
        id: `${Date.now()}-${target.address.slice(0, 6)}`,
        address: target.address,
        name: target.name,
        symbol: target.symbol,
        entryPrice: target.currentPrice,
        currentPrice: target.currentPrice,
        entryTime: new Date().toISOString(),
        amountLamports: formatSolAmount(BUY_SOL),
        remainingLamports: formatSolAmount(BUY_SOL),
        solSpent: BUY_SOL,
        status: 'open',
        exitStage: 0,
        txHash: result.hash ?? null,
        score: target.score,
      };

      const fresh = readPositions(); // re-read to avoid race
      fresh.positions.push(position);
      fresh.lastUpdated = new Date().toISOString();
      writePositions(fresh);

      log(
        `✅ BOUGHT ${target.symbol} | tx: ${result.hash ?? 'n/a'} | spent: ${BUY_SOL} SOL`
      );
    } else {
      log(
        `❌ BUY FAILED ${target.symbol}: ${result.message ?? JSON.stringify(result)}`
      );
    }
  } catch (err: any) {
    log(`Trade loop error: ${err?.message ?? err}`);
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main() {
  log('Starting trader...');

  await authenticate();

  const attempted = new Map<string, number>();

  // Proactively refresh session before the server-side TTL expires
  const refreshInterval = setInterval(authenticate, SESSION_REFRESH_MS);

  // Run immediately then on interval
  await tradingLoop(attempted);
  const interval = setInterval(() => tradingLoop(attempted), POLL_MS);

  const shutdown = () => {
    log('Shutting down trader');
    clearInterval(interval);
    clearInterval(refreshInterval);
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  log(`Trader running — checking every ${POLL_MS / 1000}s | threshold: ${SCORE_THRESHOLD} | max positions: ${MAX_POSITIONS} | session refresh every ${SESSION_REFRESH_MS / 60000}min`);
}

main().catch((err) => {
  process.stderr.write(`[TRADER FATAL] ${err?.message ?? err}\n`);
  process.exit(1);
});
