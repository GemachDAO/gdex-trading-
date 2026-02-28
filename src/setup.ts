/**
 * setup.ts — zero-friction first-run initialisation for bots and humans
 *
 * What it does:
 *   1. Ensures .env exists (copies .env.example if missing)
 *   2. Auto-generates a fresh EVM wallet if WALLET_ADDRESS/PRIVATE_KEY are empty
 *   3. Authenticates and fetches your personal GDEX custodial addresses
 *   4. Writes addresses to .gdex-addresses.json for agents to read later
 *   5. Prints a JSON summary to stdout so bots can parse the output directly
 *
 * Usage:
 *   npm run setup
 *   npx ts-node src/setup.ts
 *
 * Machine-readable output (pipe to jq etc.):
 *   npm run setup --silent | tail -1 | jq .
 */

import WebSocket from 'ws';
(globalThis as any).WebSocket = WebSocket;

import fs   from 'fs';
import path from 'path';
import { loadConfig }                from './config';
import { ensureEVMWallet }           from './auth';
import { createAuthenticatedSession } from './auth';

const ROOT         = path.resolve(__dirname, '..');
const ENV_PATH     = path.join(ROOT, '.env');
const EXAMPLE_PATH = path.join(ROOT, '.env.example');
const ADDR_PATH    = path.join(ROOT, '.gdex-addresses.json');

async function main() {
  // ── 1. Ensure .env exists ────────────────────────────────────────────────
  if (!fs.existsSync(ENV_PATH)) {
    if (fs.existsSync(EXAMPLE_PATH)) {
      fs.copyFileSync(EXAMPLE_PATH, ENV_PATH);
      console.error('[setup] Created .env from .env.example');
    } else {
      console.error('[setup] ERROR: .env.example not found. Re-clone the repo.');
      process.exit(1);
    }
  }

  // ── 2. Auto-generate wallet if empty ────────────────────────────────────
  let config = loadConfig();
  config = ensureEVMWallet(config);

  console.error(`[setup] Control wallet: ${config.walletAddress}`);

  // ── 3. Fetch custodial addresses ─────────────────────────────────────────
  let evmCustodial  = '';
  let solCustodial  = '';

  console.error('[setup] Fetching EVM custodial address (Arbitrum)...');
  try {
    const s = await createAuthenticatedSession({ chainId: 42161 });
    const info = await s.sdk.user.getUserInfo(s.walletAddress, s.encryptedSessionKey, 42161);
    evmCustodial = info?.address ?? '';
  } catch (e: any) {
    console.error('[setup] Warning: could not fetch EVM custodial:', e.message);
  }

  console.error('[setup] Fetching Solana custodial address...');
  try {
    const s = await createAuthenticatedSession({ chainId: 622112261 });
    const info = await s.sdk.user.getUserInfo(s.walletAddress, s.encryptedSessionKey, 622112261);
    solCustodial = info?.address ?? '';
  } catch (e: any) {
    console.error('[setup] Warning: could not fetch Solana custodial:', e.message);
  }

  // ── 4. Persist addresses ─────────────────────────────────────────────────
  const result = {
    controlWallet:  config.walletAddress,
    evmCustodial,   // deposit EVM tokens here (Base, Arbitrum, ETH, BSC, Optimism, etc.)
    solCustodial,   // deposit SOL here for Solana/pump.fun trading
    note: 'Deposit funds to the custodial addresses. GDEX processes in 1-10 min.',
  };

  fs.writeFileSync(ADDR_PATH, JSON.stringify(result, null, 2));
  console.error(`[setup] Saved addresses to .gdex-addresses.json`);

  // ── 5. Human-readable summary ────────────────────────────────────────────
  console.error('');
  console.error('═'.repeat(60));
  console.error('  GDEX Setup Complete — YOUR addresses:');
  console.error('═'.repeat(60));
  console.error(`  Control wallet : ${result.controlWallet}`);
  console.error(`  EVM custodial  : ${result.evmCustodial  || '(unavailable)'}`);
  console.error(`  Solana custodial: ${result.solCustodial || '(unavailable)'}`);
  console.error('');
  console.error('  Deposit to custodial addresses to start trading.');
  console.error('  EVM custodial works for ALL chains: Base, Arbitrum, ETH, BSC, Optimism');
  console.error('═'.repeat(60));

  // ── 6. Machine-readable JSON to stdout ───────────────────────────────────
  // All log lines above went to stderr so only this clean JSON hits stdout.
  // Bots can do: npm run setup --silent | jq .evmCustodial
  console.log(JSON.stringify(result));
}

main().catch(err => {
  console.error('[setup] Fatal:', err.message ?? err);
  process.exit(1);
});
