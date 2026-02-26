/**
 * Agent 1 — SCANNER
 * Polls getNewestTokens() on Solana every 30s, tracks price momentum,
 * and writes /tmp/pumpfun-watchlist.json for downstream agents.
 * Also writes /tmp/pumpfun-balance.json with the custodial SOL balance.
 *
 * Run standalone: ts-node src/pumpfun-scanner.ts
 */

import WebSocket from 'ws';
(globalThis as any).WebSocket = WebSocket;

import * as fs from 'fs';
import { createAuthenticatedSession, GDEXSession } from './auth';

// ─── Constants ───────────────────────────────────────────────────────────────

const SOLANA = 622112261;
const POLL_MS = 30_000;
const MAX_TOKENS = 100;
const SESSION_REFRESH_MS = 25 * 60 * 1000;
const WATCHLIST_PATH = '/tmp/pumpfun-watchlist.json';
const BALANCE_PATH = '/tmp/pumpfun-balance.json';

// Module-level session so authenticate() can refresh it anywhere
let session: GDEXSession;

// ─── Types ────────────────────────────────────────────────────────────────────

interface TokenSecurities {
  mintAbility: boolean;
  freezeAbility: boolean;
  buyTax: number;
  sellTax: number;
  topHoldersPercentage: number;
  lpLockPercentage: number;
  contractVerified: number;
}

interface WatchedToken {
  address: string;
  name: string;
  symbol: string;
  price: number;
  prevPrice: number | undefined;
  marketCap: number;
  txCount: number;
  bondingCurveProgress: number;
  isListedOnDex: boolean;
  isToken2022: boolean;
  firstSeen: string;
  securities?: TokenSecurities;
  priceChanges?: { m5: number; h1: number };
}

interface Watchlist {
  lastUpdated: string;
  tokens: WatchedToken[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg: string) {
  process.stderr.write(`[SCANNER ${new Date().toISOString()}] ${msg}\n`);
}

function writeWatchlist(data: Watchlist) {
  const tmp = WATCHLIST_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, WATCHLIST_PATH);
}

function readWatchlist(): Watchlist {
  try {
    return JSON.parse(fs.readFileSync(WATCHLIST_PATH, 'utf8'));
  } catch {
    return { lastUpdated: new Date().toISOString(), tokens: [] };
  }
}

// ─── Session management ───────────────────────────────────────────────────────

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

// ─── Balance writer ───────────────────────────────────────────────────────────
// Fetches custodial wallet holdings every poll cycle so the dashboard can
// display the live SOL balance and portfolio value.

async function writeBalanceFile(): Promise<void> {
  try {
    let holdings: any[] | null = null;
    try {
      const raw = await session.sdk.user.getHoldingsList(
        session.walletAddress,
        SOLANA,
        session.encryptedSessionKey,
      );
      if (Array.isArray(raw)) holdings = raw;
    } catch {
      // Holdings fetch failed — non-fatal
    }

    const tmp = BALANCE_PATH + '.tmp';
    fs.writeFileSync(
      tmp,
      JSON.stringify({
        lastUpdated: new Date().toISOString(),
        custodialAddress: session.custodialAddress,
        holdings,
      }, null, 2),
    );
    fs.renameSync(tmp, BALANCE_PATH);
  } catch {
    // Non-fatal — dashboard will show cached value
  }
}

// ─── Main scanner loop ────────────────────────────────────────────────────────

async function poll() {
  try {
    const raw = await session.sdk.tokens.getNewestTokens(SOLANA, 1, undefined, 50);
    if (!Array.isArray(raw) || raw.length === 0) {
      log('No tokens returned from API');
      return;
    }

    const existing = readWatchlist();
    const byAddr = new Map<string, WatchedToken>(
      existing.tokens.map((t) => [t.address, t])
    );

    for (const raw_t of raw) {
      const t = raw_t as any;
      if (!t.address) continue;
      const prev = byAddr.get(t.address);
      const sec = t.securities;
      const token: WatchedToken = {
        address: t.address,
        name: t.name ?? t.symbol ?? 'Unknown',
        symbol: t.symbol ?? '???',
        price: typeof t.priceUsd === 'number'
          ? t.priceUsd
          : parseFloat(t.priceUsd ?? t.priceNative ?? '0') || 0,
        prevPrice: prev ? prev.price : undefined,
        marketCap: typeof t.marketCap === 'number'
          ? t.marketCap
          : parseFloat(t.marketCap ?? '0') || 0,
        txCount: typeof t.txCount === 'number'
          ? t.txCount
          : parseInt(t.txCount ?? '0') || 0,
        bondingCurveProgress: typeof t.bondingCurveProgress === 'number'
          ? t.bondingCurveProgress
          : parseFloat(t.bondingCurveProgress ?? '0') || 0,
        isListedOnDex: !!t.isListedOnDex,
        isToken2022: !!t.isToken2022,
        firstSeen: prev?.firstSeen ?? new Date().toISOString(),
        securities: sec ? {
          mintAbility: !!sec.mintAbility,
          freezeAbility: !!sec.freezeAbility,
          buyTax: typeof sec.buyTax === 'number' ? sec.buyTax : 0,
          sellTax: typeof sec.sellTax === 'number' ? sec.sellTax : 0,
          topHoldersPercentage:
            typeof sec.topHoldersPercentage === 'number' ? sec.topHoldersPercentage : 100,
          lpLockPercentage:
            typeof sec.lpLockPercentage === 'number' ? sec.lpLockPercentage : 0,
          contractVerified:
            typeof sec.contractVerified === 'number' ? sec.contractVerified : 0,
        } : prev?.securities,
        priceChanges: t.priceChanges ? {
          m5: typeof t.priceChanges.m5 === 'number' ? t.priceChanges.m5 : 0,
          h1: typeof t.priceChanges.h1 === 'number' ? t.priceChanges.h1 : 0,
        } : prev?.priceChanges,
      };
      byAddr.set(t.address, token);
    }

    let tokens = Array.from(byAddr.values());
    tokens.sort((a, b) => (b.firstSeen > a.firstSeen ? 1 : -1));
    tokens = tokens.slice(0, MAX_TOKENS);

    writeWatchlist({ lastUpdated: new Date().toISOString(), tokens });
    log(`Watchlist updated: ${tokens.length} tokens (${raw.length} fetched)`);

    await writeBalanceFile();
  } catch (err: any) {
    log(`Poll error: ${err?.message ?? err}`);
  }
}

// ─── WebSocket price feed (best-effort) ───────────────────────────────────────

async function startWebSocketFeed() {
  try {
    await session.sdk.connectWebSocketWithChain(SOLANA, {
      autoReconnect: true,
      maxReconnectAttempts: 10,
      reconnectInterval: 5000,
    });

    const wsClient = session.sdk.getWebSocketClient();
    if (!wsClient) {
      log('WebSocket client not available after connect (non-fatal)');
      return;
    }

    wsClient.on('connect', () => { log('WebSocket connected'); });
    wsClient.on('disconnect', () => { log('WebSocket disconnected'); });
    wsClient.on('error', () => {}); // suppress — poll is the fallback

    wsClient.on('message', (data: any) => {
      try {
        if (data.newTokensData?.length) {
          const wl = readWatchlist();
          const byAddr = new Map(wl.tokens.map((t) => [t.address, t]));

          for (const t of data.newTokensData) {
            if (!t.address) continue;
            const price = typeof t.priceUsd === 'number'
              ? t.priceUsd
              : parseFloat(t.priceUsd ?? t.priceNative ?? '0') || 0;
            const prev = byAddr.get(t.address);
            byAddr.set(t.address, {
              address: t.address,
              name: t.name ?? t.symbol ?? 'Unknown',
              symbol: t.symbol ?? '???',
              price,
              prevPrice: prev ? prev.price : undefined,
              marketCap: typeof t.marketCap === 'number'
                ? t.marketCap
                : parseFloat(t.marketCap ?? '0') || 0,
              txCount: typeof t.txCount === 'number'
                ? t.txCount
                : parseInt(t.txCount ?? '0') || 0,
              bondingCurveProgress: typeof t.bondingCurveProgress === 'number'
                ? t.bondingCurveProgress
                : parseFloat(t.bondingCurveProgress ?? '0') || 0,
              isListedOnDex: !!t.isListedOnDex,
              isToken2022: !!t.isToken2022,
              firstSeen: prev?.firstSeen ?? new Date().toISOString(),
              securities: t.securities ? {
                mintAbility: !!t.securities.mintAbility,
                freezeAbility: !!t.securities.freezeAbility,
                buyTax: typeof t.securities.buyTax === 'number' ? t.securities.buyTax : 0,
                sellTax: typeof t.securities.sellTax === 'number' ? t.securities.sellTax : 0,
                topHoldersPercentage:
                  typeof t.securities.topHoldersPercentage === 'number'
                    ? t.securities.topHoldersPercentage : 100,
                lpLockPercentage:
                  typeof t.securities.lpLockPercentage === 'number'
                    ? t.securities.lpLockPercentage : 0,
                contractVerified:
                  typeof t.securities.contractVerified === 'number'
                    ? t.securities.contractVerified : 0,
              } : prev?.securities,
              priceChanges: t.priceChanges ? {
                m5: typeof t.priceChanges.m5 === 'number' ? t.priceChanges.m5 : 0,
                h1: typeof t.priceChanges.h1 === 'number' ? t.priceChanges.h1 : 0,
              } : prev?.priceChanges,
            });
          }

          let tokens = Array.from(byAddr.values());
          tokens.sort((a, b) => (b.firstSeen > a.firstSeen ? 1 : -1));
          wl.tokens = tokens.slice(0, MAX_TOKENS);
          wl.lastUpdated = new Date().toISOString();
          writeWatchlist(wl);
        }

        if (data.effectedTokensData?.length) {
          const wl = readWatchlist();
          let changed = false;
          for (const t of data.effectedTokensData) {
            if (!t.address) continue;
            const idx = wl.tokens.findIndex((tok) => tok.address === t.address);
            if (idx === -1) continue;
            const newPrice = typeof t.priceUsd === 'number'
              ? t.priceUsd
              : parseFloat(t.priceUsd ?? t.priceNative ?? '0') || 0;
            if (newPrice > 0 && newPrice !== wl.tokens[idx].price) {
              wl.tokens[idx].prevPrice = wl.tokens[idx].price;
              wl.tokens[idx].price = newPrice;
              if (t.priceChanges) {
                wl.tokens[idx].priceChanges = {
                  m5: typeof t.priceChanges.m5 === 'number'
                    ? t.priceChanges.m5
                    : (wl.tokens[idx].priceChanges?.m5 ?? 0),
                  h1: typeof t.priceChanges.h1 === 'number'
                    ? t.priceChanges.h1
                    : (wl.tokens[idx].priceChanges?.h1 ?? 0),
                };
              }
              if (typeof t.txCount === 'number') wl.tokens[idx].txCount = t.txCount;
              changed = true;
            }
          }
          if (changed) {
            wl.lastUpdated = new Date().toISOString();
            writeWatchlist(wl);
          }
        }
      } catch {
        // ignore WS message parse errors
      }
    });

    log('WebSocket price feed connected');
  } catch (err: any) {
    log(`WebSocket unavailable (non-fatal): ${err?.message ?? err}`);
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main() {
  log('Starting pump.fun scanner...');

  await authenticate();
  await writeBalanceFile();

  await poll();

  startWebSocketFeed().catch(() => {});

  const refreshInterval = setInterval(authenticate, SESSION_REFRESH_MS);
  const pollInterval = setInterval(() => poll(), POLL_MS);

  const shutdown = () => {
    log('Shutting down scanner');
    clearInterval(pollInterval);
    clearInterval(refreshInterval);
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  log(`Scanner running — polling every ${POLL_MS / 1000}s | session refresh every ${SESSION_REFRESH_MS / 60000}min`);
}

main().catch((err) => {
  process.stderr.write(`[SCANNER FATAL] ${err?.message ?? err}\n`);
  process.exit(1);
});
