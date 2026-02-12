# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

```bash
# Build & Development
npm run build               # TypeScript compile (tsc) → dist/
npm run dev                 # Run with ts-node (no build step)
npm start                   # Run compiled dist/index.js
npm test                    # Run comprehensive test suite
npm run clean               # Remove dist/

# Wallet Management
npm run wallets:qr          # Display QR codes for all wallets (easy funding!)
npm run verify              # Verify .env configuration
npm run check:balance       # Check Arbitrum on-chain balances

# Solana Trading (✅ WORKING)
npm run solana:swap         # Buy & sell a Solana meme coin (pump.fun works!)
npm run solana:scan         # Real-time token scanner dashboard with inline trading
npm run solana:limit-orders # Test limit orders with TP/SL

# EVM Chain Trading (✅ WORKING)
npm run base:trade          # Test Base chain trading
npm run base:balance        # Check Base balances

# HyperLiquid (⚠️ Opening positions broken, closing works)
npm run hl:copytrade        # Copy top HyperLiquid traders (WORKS)
npm run hl:setup            # HyperLiquid deposit & trade guide
npm run check:positions     # Check HyperLiquid positions

# Data & Analysis
npm run explore:data        # Comprehensive SDK data exploration (all available metrics)
npm run explain:wallets     # Explain two-wallet custodial system
```

## Architecture

This is a TypeScript trading bot built on the `gdex.pro-sdk` package for the GDEX decentralized exchange. It provides clean importable modules for authentication, trading, and market data, plus a comprehensive test suite.

**Source files:**

- `src/index.ts` — Barrel exports for all public APIs; CLI entry point runs test suite
- `src/auth.ts` — Authentication & session management: `createAuthenticatedSession()`, `initSDK()`, `getEffectiveApiKey()`, `ensureEVMWallet()`, `GDEXSession` interface
- `src/trading.ts` — Trading helpers that accept a `GDEXSession`: `buyToken()`, `sellToken()`, `createLimitBuyOrder()`, `createLimitSellOrder()`, `getOrders()`, `formatSolAmount()`, `formatEthAmount()`
- `src/market.ts` — Market data helpers: `getTrendingTokens()`, `searchTokens()`, `getTokenPrice()`, `getNewestTokens()`, `getNativePrices()`, `getHoldings()`, `getUserInfo()`
- `src/config.ts` — Loads `.env` via dotenv, exports `Config` interface, `loadConfig()`, `validateConfig()`, and `CHAIN_NAMES` lookup map
- `src/wallet.ts` — Wallet generation for Solana (bs58/Keypair) and EVM (ethers), `.env` persistence, chain-type detection helpers (`isSolanaChain`, `isEVMChain`)
- `src/test-suite.ts` — Comprehensive SDK test suite (8 phases): tokens, user, trading, copyTrade, hyperLiquid, WebSocket, trading execution, CryptoUtils
- **`src/deposit-correct-flow.ts`** — ✅ **Working custodial deposit implementation** (use this for deposits!)
- **`src/solana-meme-swap.ts`** — ✅ **Working Solana meme coin buy/sell** (verified with real txs)
- **`src/solana-scanner.ts`** — ✅ **Real-time Solana token scanner dashboard** (WebSocket + polling + inline trading)

**Key pattern — `GDEXSession`:**

All authenticated operations use a `GDEXSession` object returned by `createAuthenticatedSession()`. This bundles the SDK instance, wallet address, encrypted session key (for GET requests), and trading private key (for POST requests). This prevents the dangerous mistake of passing the wallet private key to trading functions.

**SDK modules accessed via `createSDK()`:**
- `sdk.tokens` — read-only market data (trending, search, prices, charts)
- `sdk.user` — authenticated user ops (holdings, watchlist, login)
- `sdk.trading` — buy/sell, limit orders, order viewing
- `sdk.copyTrade` — copy trading setup and monitoring
- `sdk.hyperLiquid` — perpetual futures, deposits, copy trading on HyperLiquid
- `sdk.connectWebSocketWithChain()` / `sdk.getWebSocketClient()` — real-time streaming

**Key patterns:**
- WebSocket requires a Node.js polyfill: `(globalThis as any).WebSocket = WebSocket` (from `ws`); this is done in `auth.ts` and `test-suite.ts`
- Solana chain ID is `622112261`; all other chains are EVM
- Amounts are in smallest units (lamports for Solana, wei for EVM)

## Authentication Architecture (Critical)

The SDK uses EVM (secp256k1) signing internally for ALL chains, including Solana. You must always use an EVM wallet (`0x`-prefixed address) even when trading on Solana.

**Login flow (encapsulated by `createAuthenticatedSession()`):**
1. Generate session key pair: `CryptoUtils.getSessionKey()`
2. Generate nonce: `CryptoUtils.generateUniqueNumber()`
3. Sign with EIP-191 (`ethers.Wallet.signMessage()`), message format:
   `"By signing, you agree to GDEX Trading Terms of Use and Privacy Policy. Your GDEX log in message: ${address.toLowerCase()} ${nonce} ${publicKeyHex}"`
4. Call `sdk.user.login(address, nonce, '0x' + publicKeyHex, signature, '', chainId)`
5. For authenticated queries: encrypt session public key with API key: `CryptoUtils.encrypt('0x' + publicKeyHex, apiKey)`

**Trading flow:**
- Use the session key's **private key** (`session.tradingPrivateKey`) for buy/sell, NOT the wallet's private key
- The wallet's private key is only used for login signature

**API key handling:**
- `.env` may contain comma-separated API keys; always split and use only the first: `config.apiKey.split(',')[0].trim()`
- `getEffectiveApiKey()` in `auth.ts` handles this
- All POST payloads are AES-256-CBC encrypted using SHA256 of the API key

## Environment

Configuration is in `.env` (see `.env.example`). Key variables:
- `GDEX_API_URL` — API base URL (defaults to `https://trade-api.gemach.io/v1`)
- `WALLET_ADDRESS`, `PRIVATE_KEY` — EVM wallet credentials (auto-generated if missing; must be `0x`-prefixed)
- `GDEX_API_KEY` — API key (may be comma-separated; first key used for encryption)
- `DEFAULT_CHAIN_ID` — defaults to Solana (`622112261`)

## Solana Trading (VERIFIED WORKING)

**SDK**: `gdex.pro-sdk` | **Endpoint**: `https://trade-api.gemach.io/v1` | **Chain ID**: `622112261`

Buy/sell meme coins on Solana via `buyToken()` / `sellToken()` from `src/trading.ts`. **Pump.fun tokens work** even before DEX graduation (`isListedOnDex: false` is fine).

```typescript
// Auth on Solana (fallback to Arbitrum if needed)
let session;
try {
  session = await createAuthenticatedSession({ chainId: 622112261 });
} catch {
  session = await createAuthenticatedSession({ chainId: 42161 });
}

// Find tokens, sort by activity
const newest = await session.sdk.tokens.getNewestTokens(622112261, 1, undefined, 20);
const sorted = [...newest].sort((a, b) => (b.txCount || 0) - (a.txCount || 0));
const target = sorted[0];

// Buy
const buy = await buyToken(session, {
  tokenAddress: target.address,
  amount: formatSolAmount(0.005), // "5000000" lamports
  chainId: 622112261,
});

// Sell
const sell = await sellToken(session, {
  tokenAddress: target.address,
  amount: formatSolAmount(0.005),
  chainId: 622112261,
});
```

**Verified transactions:**
- Buy COMPOZY (pump.fun, 75% bonding curve): `3msBpERN...AUXC`
- Sell COMPOZY: `49PJtJWf...qHW`
- Buy SSI6900 (pump.fun): `4TiPBwDj...pAgP`
- Sell SSI6900: `2ygnTv7S...YThW`

**Token selection (best practices):**
- Sort by `txCount` (higher = more activity = better liquidity)
- Prefer higher `bondingCurveProgress` (more reserves in pool)
- `isListedOnDex` is NOT required — pump.fun bonding curve tokens trade fine
- Check `marketCap > 1000` to avoid dead tokens

**Quick command:** `npm run solana:swap`

## 🎉 HyperLiquid Perpetual Futures - MAJOR BREAKTHROUGH (Feb 12, 2026)

### ✅ DEPOSIT TO HYPERLIQUID - WORKING!

**Endpoint**: `POST /v1/hl/deposit`
**Status**: ✅ **VERIFIED WORKING** - Successfully deposited $10 USDC
**Script**: `src/deposit-hl-correct.ts`

```typescript
// Working deposit implementation
const encodedData = CryptoUtils.encodeInputData("hl_deposit", {
  chainId: 42161,  // Arbitrum only
  tokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",  // USDC
  amount: "10000000",  // 10 USDC (6 decimals)
  nonce: generateNonce().toString()
});

const userId = session.walletAddress.toLowerCase();
const signature = CryptoUtils.sign(`hl_deposit-${userId}-${encodedData}`, session.tradingPrivateKey);

const payload = { userId, data: encodedData, signature, apiKey };
const computedData = encrypt(JSON.stringify(payload), apiKey);

await axios.post(`${apiUrl}/hl/deposit`, { computedData }, {
  headers: {
    'Origin': 'https://gdex.pro',  // CRITICAL for CORS
    'Referer': 'https://gdex.pro/',
  }
});
```

**Key Requirements**:
- ✅ CORS headers: `Origin: https://gdex.pro` (required!)
- ✅ Encoding: `CryptoUtils.encodeInputData("hl_deposit", ...)`
- ✅ Signing: `hl_deposit-${userId}-${encodedData}`
- ✅ Full payload encryption with API key

### ⚠️ LEVERAGED POSITION OPENING - IN PROGRESS

**Endpoint**: `POST /v1/hl/create_order`
**Status**: Website works, our code gets "Sent order failed"

**What We Know**:
- ✅ Endpoint: `/v1/hl/create_order`
- ✅ CORS headers working (same as deposit)
- ✅ Encoding: `CryptoUtils.encodeInputData("hl_create_order", params)`
- ✅ Balance: $10 on custodial HyperLiquid account
- ✅ **Website successfully places orders** (confirmed Feb 12, 2026)
- ❌ Code gets "Sent order failed" from HyperLiquid
- 🔍 **Next**: Compare website payload with code payload

**Scripts**:
- `src/test-hl-new-sdk-approach.ts` - Order placement (needs payload comparison)
- `src/deposit-hl-correct.ts` - Deposit (WORKING!)
- `src/check-hl-balances.ts` - Check balances

### ✅ What WORKS:
- ✅ **Depositing to HyperLiquid** via `/v1/hl/deposit` endpoint
- ✅ **Spot trading on ALL EVM chains** - Base, Arbitrum, Ethereum, BSC, etc.
- ✅ **Solana meme coin trading** - Including pump.fun tokens
- ✅ **Closing HyperLiquid positions**: `hlPlaceOrder` with `reduceOnly=true`
- ✅ **Balance queries**: `getHyperliquidUsdcBalance()`, `getHyperliquidClearinghouseState()`
- ✅ **Copy trading**: `hlCreate()` (opens positions indirectly)
- ✅ **Close all positions**: `hlCloseAll()`
- ✅ **Withdrawals**: `hlWithdraw()`

### 🔧 What's IN PROGRESS:
- 🔧 **Opening leveraged positions** via `/v1/hl/create_order` (website confirmed working)

### ❌ What DOESN'T Work (Legacy SDK Methods):
- ❌ `hlPlaceOrder` with `reduceOnly=false` → error 102
- ❌ `hlCreateOrder` (SDK method) → "Sent order failed"
- ❌ `hlDeposit()` (SDK method) → "Unauthorized"

## Reference Docs

The `references/` directory contains SDK API reference and code examples that are useful when extending functionality.

## GDEX Custodial Wallet System (CRITICAL - READ THIS!)

**IMPORTANT**: GDEX uses a **universal custodial wallet system** for ALL EVM chains. Understanding this is critical for funding and trading.

### 🔑 Two-Wallet System

GDEX operates with TWO wallet addresses:

1. **YOUR EVM Wallet** (`WALLET_ADDRESS` in `.env`)
   - You control with your private key
   - Used for authentication and signing
   - Example: `0x01779499970726ff4C111dDF58A2CA6c366b0E20`

2. **GDEX Custodial Wallets** (GDEX controls, auto-assigned per user)
   - **EVM Chains**: ONE universal address for ALL EVM chains
   - **Solana**: Separate address for Solana trading
   - You send funds HERE for trading
   - GDEX processes automatically (1-10 minutes)

### 🌐 Universal EVM Custodial Wallet

**The same custodial address works for ALL EVM chains!**

To get your universal EVM custodial address:
```typescript
const session = await createAuthenticatedSession({ chainId: 42161 }); // Any EVM chain
const userInfo = await session.sdk.user.getUserInfo(
  session.walletAddress,
  session.encryptedSessionKey,
  42161 // Or 8453 for Base, 1 for Ethereum, etc.
);
const evm_custodial_address = userInfo.address;
// Example: 0x886e83feb8d1774afab4a32047a083434354c6f0
```

**This address works for:**
- ✅ Arbitrum (42161) - For HyperLiquid futures + spot trading
- ✅ Base (8453) - **VERIFIED WORKING** with buy/sell
- ✅ Ethereum (1)
- ✅ BSC (56)
- ✅ Optimism (10)
- ✅ All other EVM chains

### ✅ Correct Funding Flow (EVM Chains)

1. **Get your GDEX custodial address** (one-time, same for all EVM chains)
2. **Send funds to that address** on your chosen network
3. **GDEX processes automatically** (1-10 minutes)
4. **Trade immediately** after processing

**Example: Funding for Base Trading**
```typescript
// Send ETH to your custodial address on Base network
// Address: 0x886e83feb8d1774afab4a32047a083434354c6f0 (example)
// Amount: 0.005 ETH minimum for testing
// Network: Base (Chain ID: 8453)
```

**Example: Funding for HyperLiquid**
```typescript
// Send USDC to same custodial address on Arbitrum
// Address: 0x886e83feb8d1774afab4a32047a083434354c6f0 (same!)
// Amount: 5 USDC minimum
// Network: Arbitrum (Chain ID: 42161)
```

### 🪙 Solana Custodial Wallet

**Solana uses a DIFFERENT custodial address:**

```typescript
const session = await createAuthenticatedSession({ chainId: 622112261 });
const userInfo = await session.sdk.user.getUserInfo(
  session.walletAddress,
  session.encryptedSessionKey,
  622112261
);
const solana_custodial_address = userInfo.address;
// Example: 25xbqQDwE6fnpWW8u7CprZKQPBHfj9sF56pCERxpwMms
```

**Send SOL to this address for Solana meme coin trading.**

### 📱 Quick Access - Display All Wallet QR Codes

```bash
npm run wallets:qr  # Shows QR codes for easy phone wallet scanning
```

Displays:
- Your EVM wallet (direct control)
- EVM custodial wallet (Arbitrum, Base, Ethereum, etc.)
- Solana custodial wallet

### ✅ EVM Chain Trading (VERIFIED WORKING)

**Base Trading** - Fully tested and working:
```typescript
const session = await createAuthenticatedSession({ chainId: 8453 });
const tokens = await session.sdk.tokens.getNewestTokens(8453, 1, undefined, 50);

// Buy
const buy = await buyToken(session, {
  tokenAddress: tokens[0].address,
  amount: formatEthAmount(0.00001), // 0.00001 ETH
  chainId: 8453,
});
// Returns: { isSuccess: true, hash: "0x2666..." }

// Sell
const sell = await sellToken(session, {
  tokenAddress: tokens[0].address,
  amount: formatEthAmount(0.00001),
  chainId: 8453,
});
// Returns: { isSuccess: true, hash: "0x9df2..." }
```

**Verified Base transactions:**
- Buy AMARA: `0x26663c53c2145e5d95070150ad69385d7cc96f176497e2b5e2d138f0f45e069f`
- Sell AMARA: `0x9df24b633c4f620f421edc19cbdf70252105ea381fd5fbc8e730bc7fd2642f4b`

### ❌ WRONG Method (Don't Use!)

```typescript
// DON'T USE THIS - It doesn't work!
await sdk.hyperLiquid.hlDeposit(address, tokenAddress, amount, chainId, privateKey);
```

**Why it fails:**
- Returns "Unauthorized" error
- Not the intended GDEX flow
- Use custodial deposits (send to custodial address directly)

## 🚀 Quick Start Guide

### 1. Get Your Wallet Addresses
```bash
npm run wallets:qr
```
This shows QR codes for:
- Your EVM wallet (you control)
- Universal EVM custodial wallet (for Base, Arbitrum, Ethereum, etc.)
- Solana custodial wallet

### 2. Fund Your Custodial Wallets

**For EVM chains (Base, Arbitrum, etc.):**
- Send ETH/USDC to your **EVM custodial address**
- Works on ANY EVM network (Base, Arbitrum, Ethereum, BSC, Optimism, etc.)
- Same address for all EVM chains!

**For Solana:**
- Send SOL to your **Solana custodial address**
- Different address than EVM

### 3. Start Trading

**Solana meme coins:**
```bash
npm run solana:swap    # Automated buy/sell test
npm run solana:scan    # Live scanner with inline trading
```

**Base chain:**
```bash
npm run base:trade     # Test Base trading
```

**Any chain via code:**
```typescript
import { createAuthenticatedSession, buyToken, formatEthAmount } from 'gdex-trading';

const session = await createAuthenticatedSession({ chainId: 8453 }); // Base
const result = await buyToken(session, {
  tokenAddress: '0x...',
  amount: formatEthAmount(0.001),
  chainId: 8453,
});
```

## 📊 Supported Networks & Status

| Network | Chain ID | Trading Status | Notes |
|---------|----------|----------------|-------|
| **Solana** | 622112261 | ✅ WORKING | Pump.fun tokens work! Verified txs |
| **Base** | 8453 | ✅ WORKING | Verified buy/sell txs |
| **Arbitrum** | 42161 | ✅ WORKING | Spot trading works, HL futures opening broken |
| **Ethereum** | 1 | ✅ WORKING | Same custodial wallet as Base/Arb |
| **BSC** | 56 | ✅ WORKING | Same custodial wallet |
| **Optimism** | 10 | ✅ WORKING | Same custodial wallet |
| Fraxtal | 252 | ✅ WORKING | Same custodial wallet |
| Sonic | 146 | ⚠️ Untested | Should work (same wallet) |
| Sui | 1313131213 | ⚠️ Untested | Non-EVM, separate wallet |
| Nibiru | 6900 | ⚠️ Untested | Should work (same wallet) |
| Berachain | 80094 | ⚠️ Untested | Should work (same wallet) |

**Key:**
- ✅ WORKING = Fully tested with verified transactions
- ⚠️ Untested = Should work but not yet tested

**Universal EVM Custodial Wallet**: One address works for all EVM chains (Base, Arbitrum, Ethereum, BSC, Optimism, etc.)

## 🔑 Key Takeaways for Agents/Skills

1. **ONE custodial wallet for ALL EVM chains** - No need to manage multiple addresses
2. **Spot trading works everywhere** - Base, Arbitrum, Ethereum, BSC, etc. all verified
3. **Only HyperLiquid futures opening is broken** - Everything else works perfectly
4. **Solana fully functional** - Including pump.fun pre-DEX tokens
5. **Use `npm run wallets:qr`** - Easiest way to get addresses for funding
6. **Use `npm run explore:data`** - See all available data for analysis/bots

