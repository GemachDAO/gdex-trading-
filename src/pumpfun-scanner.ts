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
import axios from 'axios';
import { createAuthenticatedSession, GDEXSession } from './auth';
import { tryConnectBus, BusClient } from './pumpfun-bus';

// ─── Constants ───────────────────────────────────────────────────────────────

const SOLANA = 622112261;
const POLL_MS = 30_000;
const MAX_TOKENS = 100;
const SESSION_REFRESH_MS = 25 * 60 * 1000;
const WATCHLIST_PATH = '/tmp/pumpfun-watchlist.json';
const BALANCE_PATH = '/tmp/pumpfun-balance.json';

// Module-level session so authenticate() can refresh it anywhere
let session: GDEXSession;

// Bus client — no-op until connected (falls back to file-only if bus unavailable)
let bus: BusClient = { publish: () => {}, log: () => {}, close: () => {} };

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

// ─── Solana RPC balance (bypasses GDEX API entirely) ─────────────────────────

async function fetchSolBalanceRpc(address: string): Promise<number | null> {
  try {
    const res = await axios.post(
      'https://api.mainnet-beta.solana.com',
      { jsonrpc: '2.0', id: 1, method: 'getBalance', params: [address] },
      { headers: { 'Content-Type': 'application/json' }, timeout: 8000 },
    );
    const lamports = res.data?.result?.value;
    if (typeof lamports === 'number') return lamports / 1_000_000_000;
  } catch {}
  return null;
}

async function writeBalanceFile(): Promise<void> {
  try {
    // Try GDEX holdings API first
    let holdings: any[] | null = null;
    let holdingsOk = false;
    try {
      const raw = await session.sdk.user.getHoldingsList(
        session.walletAddress,
        SOLANA,
        session.encryptedSessionKey,
      );
      if (Array.isArray(raw)) {
        holdings = raw;
        holdingsOk = true;
      }
    } catch {
      // Ignore — will fall back to RPC
    }

    // Extract SOL from holdings when the API worked
    let solBalance: number | null = null;
    if (holdingsOk && Array.isArray(holdings)) {
      let total = 0;
      for (const h of holdings) {
        const sym = (h.symbol ?? h.ticker ?? '').toUpperCase();
        const bal = parseFloat(h.balance ?? h.amount ?? h.nativeBalance ?? '0') || 0;
        if (sym === 'SOL' || h.isNative) total += bal;
      }
      solBalance = total;
    }

    // If GDEX API failed or returned no SOL entry (e.g. empty holdings array), fall back to Solana RPC
    if (solBalance === null || solBalance === 0) {
      const custodial = session.custodialAddress ?? '';
      if (custodial) {
        const rpcBal = await fetchSolBalanceRpc(custodial);
        if (rpcBal !== null) {
          solBalance = rpcBal;
          log(`SOL balance (via RPC): ${solBalance.toFixed(4)} SOL`);
        } else {
          log('SOL balance unknown — RPC also failed, skipping balance update');
          return; // Don't overwrite with stale 0
        }
      }
    }

    if (solBalance === null) return; // Nothing reliable to write

    const tmp = BALANCE_PATH + '.tmp';
    fs.writeFileSync(
      tmp,
      JSON.stringify({
        lastUpdated: new Date().toISOString(),
        custodialAddress: session.custodialAddress,
        solBalance,
        holdings,
      }, null, 2),
    );
    fs.renameSync(tmp, BALANCE_PATH);

    // Only broadcast a confirmed balance — never a failed-API 0
    bus.publish('BALANCE_UPDATE', { solBalance });
    log(`SOL balance: ${solBalance.toFixed(4)} SOL`);
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

    const watchlistData = { lastUpdated: new Date().toISOString(), tokens };
    writeWatchlist(watchlistData);
    log(`Watchlist updated: ${tokens.length} tokens (${raw.length} fetched)`);

    // Push to bus so ANALYST and SCALPER react immediately (no polling delay)
    bus.publish('TOKENS_UPDATE', { tokens, count: tokens.length });

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

            // Push price ticks to RISK (instant SL/TP) and SCALPER
            const updates = data.effectedTokensData
              .filter((t: any) => t.address)
              .map((t: any) => ({
                address: t.address,
                price: typeof t.priceUsd === 'number'
                  ? t.priceUsd
                  : parseFloat(t.priceUsd ?? t.priceNative ?? '0') || 0,
                priceChangePct: t.priceChanges?.m5 ?? 0,
              }))
              .filter((u: any) => u.price > 0);
            if (updates.length > 0) {
              bus.publish('PRICE_UPDATE', { updates });
            }
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

  // Connect to message bus (non-blocking — falls back to file-only if unavailable)
  bus = await tryConnectBus('SCANNER', () => {
    // Scanner doesn't need to receive messages from other agents
  });
  log('Connected to message bus');

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
