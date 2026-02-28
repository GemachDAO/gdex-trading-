#!/usr/bin/env node
/**
 * postinstall.js — runs automatically after `npm install`
 *
 * Creates .env from .env.example if it doesn't exist yet.
 * Wallet credentials (WALLET_ADDRESS / PRIVATE_KEY) are auto-generated
 * on the first script run via ensureEVMWallet() in auth.ts.
 *
 * Run `npm run setup` after install to generate your wallet and fetch
 * your personal custodial addresses.
 */
const fs   = require('fs');
const path = require('path');

const root       = path.join(__dirname, '..');
const envPath    = path.join(root, '.env');
const examplePath = path.join(root, '.env.example');

if (!fs.existsSync(envPath)) {
  if (fs.existsSync(examplePath)) {
    fs.copyFileSync(examplePath, envPath);
    console.log('[gdex] ✅ Created .env from .env.example');
  } else {
    console.warn('[gdex] ⚠️  .env.example not found — skipping .env creation');
  }
  console.log('[gdex] 👉 Run "npm run setup" to generate your wallet and get your deposit addresses');
} else {
  // .env exists — silently succeed (idempotent)
}
