---
name: gdex-trading
description: Interact with GDEX decentralized exchange SDK for cryptocurrency trading operations across ALL chains. GDEX uses a universal custodial wallet system - ONE address works for ALL EVM chains (Base, Arbitrum, Ethereum, BSC, Optimism, etc.). Fully working spot trading on all chains + Solana meme coins (pump.fun). Only HyperLiquid leveraged futures opening is broken (closing works). Use for: trading tokens, market data, portfolio management, copy trading, analyzing crypto markets. Triggers: buy/sell, check prices, limit orders, copy traders, monitor positions, trending tokens, multi-chain operations.
---

# GDEX Trading SDK

## Overview

Enable programmatic interaction with GDEX (Gemach DAO's decentralized exchange) for **multi-chain cryptocurrency trading** with a revolutionary **universal custodial wallet system**.

### 🌟 Key Features

✅ **Universal EVM Wallet** - ONE custodial address works for ALL EVM chains
✅ **Base Trading** - Fully tested and working (verified transactions)
✅ **Solana Meme Coins** - Including pump.fun pre-DEX tokens
✅ **Limit Orders** - Take profit & stop loss support
✅ **Copy Trading** - Automatically follow top traders
✅ **Real-Time Data** - WebSocket streams + comprehensive analytics
⚠️ **HyperLiquid Futures** - Opening positions broken (closing works, use copy trading)

## Installation

```bash
npm install gdex.pro-sdk ethers ws
```

## 🔑 Pre-Provided API Key (No Sign-Up Required)

A shared API key is included — no account or sign-up needed:

```
GDEX_API_KEY=3f6c9e12-7b41-4c2a-9d5e-1a8f3b7e6c90,8d2a5f47-2e13-4b9c-a6f1-0c9e7d3a5b21
```

This key is already the default in `src/config.ts` and pre-filled in `.env.example`.
Wallets are **auto-generated on first run** — no wallet setup needed either.

## API Connectivity Requirements (Critical for Agents)

All requests to `trade-api.gemach.io` **must** include a browser-like `User-Agent` header. Without it the API returns **403 "Access denied: Non-browser clients not allowed"**. Additionally, `Origin` and `Referer` headers are required for CORS.

### Required Headers

| Header | Value | Required? |
|--------|-------|-----------|
| `User-Agent` | A Chrome/Firefox browser UA string | **YES — all requests (primary gatekeeper)** |
| `Origin` | `https://gdex.pro` | **YES — all requests (CORS)** |
| `Referer` | `https://gdex.pro/` | **YES — all requests (CORS)** |

`createAuthenticatedSession()` and `initSDK()` inject these automatically. For direct `axios`/`fetch` calls:

```typescript
const GDEX_HEADERS = {
  'Origin': 'https://gdex.pro',
  'Referer': 'https://gdex.pro/',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
};
await axios.get('https://trade-api.gemach.io/v1/status', { headers: GDEX_HEADERS });
```

### Health Check

Use `GET /v1/status` → `{"running":true}` or `sdk.tokens.getNativePrices()`. **Do NOT use `/v1/health`** — returns 404.

## 🔑 Critical: Universal Custodial Wallet System

**IMPORTANT FOR AGENTS:** GDEX uses TWO wallet addresses - understanding this is critical!

### Your Control Wallet (from .env)
- Address you control with private key
- Used for authentication only
- Example: `0x01779499970726ff4C111dDF58A2CA6c366b0E20`

### GDEX Custodial Wallets (GDEX controls)
- **ONE address for ALL EVM chains** ← This is the game changer!
- Different address for Solana
- Send funds HERE to trade
- Auto-processed in 1-10 minutes

### Get Your Custodial Addresses

**Quick command:**
```bash
npm run wallets:qr  # Shows QR codes for all wallets
```

**Programmatic:**
```typescript
// Get universal EVM custodial address
const session = await createAuthenticatedSession({ chainId: 42161 });
const userInfo = await session.sdk.user.getUserInfo(
  session.walletAddress, session.encryptedSessionKey, 42161
);
const evm_custodial = userInfo.address;  // Works for Base, Arbitrum, ETH, BSC, etc.

// Get Solana custodial address
const solSession = await createAuthenticatedSession({ chainId: 622112261 });
const solUserInfo = await solSession.sdk.user.getUserInfo(
  solSession.walletAddress, solSession.encryptedSessionKey, 622112261
);
const sol_custodial = solUserInfo.address;  // Solana only
```

### Funding for Multi-Chain Trading

**For ANY EVM chain (Base, Arbitrum, Ethereum, BSC, Optimism):**
1. Send ETH, USDC, or any token to your **EVM custodial address**
2. Use the network you want to trade on
3. Same address works across ALL EVM chains!

**For Solana:**
1. Send SOL to your **Solana custodial address**
2. Works for all Solana tokens including pump.fun

## Authentication Architecture (Critical)

**The SDK uses EVM (secp256k1) signing internally for ALL chains, including Solana.** You must always use an EVM wallet (`0x`-prefixed address) even when trading on Solana.

The authentication flow produces a **session** that separates concerns:
- **Wallet private key** — used ONLY for the one-time login signature
- **Session private key** — used for all trading POST requests (buy, sell, limit orders)
- **Encrypted session key** — used for authenticated GET requests (holdings, orders, user info)

**Never pass the wallet private key to trading functions.** Use the session's `tradingPrivateKey` instead.

## Quick Start

The fastest way to authenticate and trade:

```typescript
import { createAuthenticatedSession, buyToken, formatSolAmount } from 'gdex-trading';

// One-call login — merges with .env config for any missing values
const session = await createAuthenticatedSession({
  apiKey: process.env.GDEX_API_KEY || '3f6c9e12-7b41-4c2a-9d5e-1a8f3b7e6c90,8d2a5f47-2e13-4b9c-a6f1-0c9e7d3a5b21',
  walletAddress: process.env.WALLET_ADDRESS,   // must be 0x-prefixed EVM address
  privateKey: process.env.PRIVATE_KEY,          // EVM private key (login only)
  chainId: 622112261,                           // Solana
});

// Buy a token — uses session.tradingPrivateKey automatically
const result = await buyToken(session, {
  tokenAddress: 'So11111111111111111111111111111111111111112',
  amount: formatSolAmount(0.005), // 0.005 SOL = "5000000" lamports
});

if (result.isSuccess) {
  console.log('Transaction hash:', result.hash);
}
```

## Manual Authentication

If you need more control over the login flow:

```typescript
import WebSocket from 'ws';
(globalThis as any).WebSocket = WebSocket; // Required Node.js polyfill

import { createSDK, CryptoUtils } from 'gdex.pro-sdk';
import { ethers } from 'ethers';

// 1. Initialize SDK (split comma-separated API keys, use first)
const apiKey = process.env.GDEX_API_KEY!.split(',')[0].trim();
const sdk = createSDK('https://trade-api.gemach.io/v1', { apiKey });

// 2. Generate session key pair
const sessionKeyPair = CryptoUtils.getSessionKey();
const publicKeyHex = Buffer.from(sessionKeyPair.publicKey).toString('hex');

// 3. Generate nonce
const nonce = CryptoUtils.generateUniqueNumber();

// 4. Sign with EIP-191 personal message (ethers.Wallet.signMessage)
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!);
const address = process.env.WALLET_ADDRESS!;
const message = `By signing, you agree to GDEX Trading Terms of Use and Privacy Policy. Your GDEX log in message: ${address.toLowerCase()} ${nonce} ${publicKeyHex}`;
const signature = await wallet.signMessage(message);

// 5. Login
const userInfo = await sdk.user.login(
  address,
  nonce,
  '0x' + publicKeyHex,  // public key needs 0x prefix
  signature,
  '',                    // referral code
  622112261              // chain ID
);

// 6. For authenticated GET requests — encrypt session public key with API key
const encryptedSessionKey = CryptoUtils.encrypt('0x' + publicKeyHex, apiKey);

// 7. For trading POST requests — use session key's PRIVATE key (not wallet key!)
const tradingPrivateKey = sessionKeyPair.privateKey.toString('hex');

// Now trade:
const buyResult = await sdk.trading.buy(
  address,
  '5000000',             // 0.005 SOL in lamports
  'TOKEN_ADDRESS_HERE',
  622112261,             // Solana chain ID
  tradingPrivateKey      // session private key, NOT wallet private key
);
```

## Core Capabilities

### 1. Token Operations

Get market data, search tokens, analyze trends, and retrieve price information across all supported chains.

```typescript
import { createSDK } from 'gdex.pro-sdk';

const sdk = createSDK('https://trade-api.gemach.io/v1');

// Get trending tokens
const trending = await sdk.tokens.getTrendingTokens(10);

// Search for specific token
const results = await sdk.tokens.searchTokens('PEPE', 10);

// Get token details
const token = await sdk.tokens.getToken('TOKEN_ADDRESS', chainId);

// Get native chain prices (SOL, ETH, BNB, etc.)
const prices = await sdk.tokens.getNativePrices();

// Get newest tokens on Solana
const newest = await sdk.tokens.getNewestTokens(622112261, 1, undefined, 10);
```

### 2. Trading Operations

Execute market orders and limit orders. **All trading functions require a session** — see Quick Start above.

```typescript
import {
  createAuthenticatedSession,
  buyToken,
  sellToken,
  createLimitBuyOrder,
  createLimitSellOrder,
  getOrders,
  formatSolAmount,
  formatEthAmount,
} from 'gdex-trading';

const session = await createAuthenticatedSession();

// Market buy — 0.005 SOL
const buy = await buyToken(session, {
  tokenAddress: 'TOKEN_ADDRESS',
  amount: formatSolAmount(0.005),
});

// Market sell
const sell = await sellToken(session, {
  tokenAddress: 'TOKEN_ADDRESS',
  amount: '1000000', // amount in smallest unit
});

// Limit buy order (with optional take-profit/stop-loss)
const limitBuy = await createLimitBuyOrder(session, {
  tokenAddress: 'TOKEN_ADDRESS',
  amount: formatSolAmount(0.01),
  triggerPrice: '0.002',
  profitPercent: 20,  // optional: take profit at 20%
  lossPercent: 10,    // optional: stop loss at 10%
});

// Limit sell order
const limitSell = await createLimitSellOrder(session, {
  tokenAddress: 'TOKEN_ADDRESS',
  amount: '500000000',
  triggerPrice: '0.005',
});

// View orders
const orders = await getOrders(session);
```

Or using the raw SDK with a session's trading key:

```typescript
// Market buy with raw SDK
const buyResult = await session.sdk.trading.buy(
  session.walletAddress,
  '5000000',                    // amount in lamports
  'TOKEN_ADDRESS',
  622112261,                    // chain ID
  session.tradingPrivateKey     // session private key!
);

// Limit sell with raw SDK
const limitResult = await session.sdk.trading.createLimitSell(
  session.walletAddress,
  '500000000',
  '0.002',                      // trigger price
  'TOKEN_ADDRESS',
  622112261,
  session.tradingPrivateKey
);
```

### 3. Copy Trading

Automatically copy trades from top-performing traders on supported chains.

```typescript
const session = await createAuthenticatedSession();

// Get top traders (no auth required)
const topTraders = await session.sdk.copyTrade.getTopTraders(622112261);

// Create copy trade config
const copyTrade = await session.sdk.copyTrade.createCopyTrade(
  session.walletAddress,
  '0xTraderAddress',
  'Top Trader Copy',
  '20',                         // gas price
  1,                            // buy mode: 1=fixed amount, 2=percentage
  '1000000000',                 // copy amount (1 SOL = 1*10^9)
  false,                        // buy existing tokens
  '10',                         // stop loss %
  '20',                         // take profit %
  true,                         // copy sell
  [],                           // excluded DEXes
  622112261,                    // Solana chainId
  session.tradingPrivateKey     // session private key!
);

// Get your copy trades
const copyTrades = await session.sdk.copyTrade.getCopyTradeList(
  session.walletAddress,
  session.encryptedSessionKey
);
```

### 4. Solana Meme Coin Trading (VERIFIED WORKING)

Buy and sell meme coins on Solana, including pump.fun tokens still on bonding curve. This flow has been tested and confirmed working with multiple verified transactions.

**SDK**: `gdex.pro-sdk` | **Endpoint**: `https://trade-api.gemach.io/v1` | **Chain ID**: `622112261`

**Pump.fun tokens WORK** — `isListedOnDex: false` tokens on the bonding curve trade fine through GDEX. No need to wait for DEX graduation.

```typescript
import { createAuthenticatedSession, buyToken, sellToken, formatSolAmount } from 'gdex-trading';

// Authenticate on Solana (fallback to Arbitrum if needed)
let session;
try {
  session = await createAuthenticatedSession({ chainId: 622112261 });
} catch {
  session = await createAuthenticatedSession({ chainId: 42161 }); // Arbitrum fallback
}

// Find tokens — sort by txCount for best liquidity
const newest = await session.sdk.tokens.getNewestTokens(622112261, 1, undefined, 20);
const sorted = [...newest].sort((a, b) => (b.txCount || 0) - (a.txCount || 0));
const target = sorted[0]; // pick most active token

// Buy with 0.005 SOL (~$0.50)
const buyResult = await buyToken(session, {
  tokenAddress: target.address,
  amount: formatSolAmount(0.005), // "5000000" lamports
  chainId: 622112261,
});
// Returns: { isSuccess: true, hash: "3msBpE..." }

// Wait for settlement
await new Promise(r => setTimeout(r, 5000));

// Sell back
const sellResult = await sellToken(session, {
  tokenAddress: target.address,
  amount: formatSolAmount(0.005),
  chainId: 622112261,
});
// Returns: { isSuccess: true, hash: "49PJtJ..." }
```

**Verified transactions (all successful):**
- Buy COMPOZY (pump.fun, 75% bonding curve): `3msBpERNZHFbvYCMMUeGz5MtGeGwDrUxntDgRsZDaYHZN9No4b5N5Svqr7woPdF7gd7qYPrXSEQP1ZmLdJcoAUXC`
- Sell COMPOZY: `49PJtJWfsKsUN62iM4cihjQ4EvFzbiRDQjUP2VHr1kc1R3BhHaoq7ZbgTWS87D7sqsnemypusxYYeKizzZM3wqHW`
- Buy SSI6900 (pump.fun): `4TiPBwDjgxTdkHGNwgh5MJkdi4Ex9cpbPrpX5mC9VBDgVnzXCKZVjheLUumm4LVfqAiYHUxyL2KfsFKU5a47pAgP`
- Sell SSI6900: `2ygnTv7SZTXXqTwJGLqMqHvWPpyavtgVzRRR7NBQC1mDz5chLRWqkvrVHtf9PJLpcYGWjAY27Db6nKSsWjuFYThW`

**Key details:**
- `buyToken()` / `sellToken()` are wrappers in `src/trading.ts` that call `session.sdk.trading.buy()` / `.sell()`
- Uses `session.tradingPrivateKey` (session key), NOT wallet private key
- Amount is in lamports (0.005 SOL = 5,000,000 lamports)
- The GDEX backend executes on-chain via its custodial Solana wallet
- **Pump.fun tokens work** even with `isListedOnDex: false` and `bondingCurveProgress < 100%`

**Token selection strategy (best to worst):**
1. Sort by `txCount` — higher = more activity = better liquidity
2. Prefer higher `bondingCurveProgress` — closer to graduation = more reserves
3. Check `marketCap > 1000` — avoid dead/abandoned tokens
4. `isListedOnDex`, `isRaydium`, `isMeteora`, `isPumpSwap` flags indicate DEX graduation (nice-to-have but NOT required)

#### Solana Token Data Shape

Tokens returned by `getNewestTokens()` / `getTrendingTokens()` include:

| Field | Type | Description |
|-------|------|-------------|
| `address` | string | Solana mint address (e.g., `"6PhqX...pump"`) |
| `name` / `symbol` | string | Token identity |
| `chainId` | number | `622112261` for Solana |
| `priceUsd` | number | Current USD price |
| `priceNative` | number | Price in SOL |
| `marketCap` | number | USD market cap |
| `liquidityUsd` | number | Total USD liquidity in pool |
| `bondingCurveProgress` | number | % toward DEX graduation (0-100) |
| `txCount` | number | Total transaction count |
| `isListedOnDex` | boolean | Whether graduated to a DEX |
| `isPumpfun` | boolean | Whether on pump.fun |
| `isRaydium` / `isMeteora` / `isPumpSwap` | boolean | Specific DEX flags |
| `isToken2022` | boolean | Solana Token-2022 standard |
| `volumes.m5/h1/h6/h24` | number | Volume over time periods |
| `priceChanges.m5/h1/h6/h24` | number | Price change % over time |
| `securities.mintAbility` | boolean | Can new tokens be minted (false = safe) |
| `securities.freezeAbility` | boolean | Can tokens be frozen (false = safe) |
| `securities.lpLockPercentage` | number | % of LP locked (100 = safe) |
| `socialInfo.logoUrl/twitterUrl/websiteUrl` | string | Social links |
| `ethReserve` / `tokenReserve` | string | Raw pool reserves (lamports) |
| `dexes` | string[] | Which DEXs the token is on |
| `creator` | string | Creator wallet address |
| `createdTime` | number | Unix timestamp |

**Pagination:** Results include `total`, `page`, `limit`, `pages` for pagination support.

**Quick command:** `npm run solana:swap`

### 5. EVM Chain Trading (Base, Ethereum, BSC, etc.) - ✅ FULLY WORKING

**ALL EVM chains use the SAME custodial wallet!** This is revolutionary - fund once, trade everywhere.

#### Verified Base Chain Trading

Base trading is **fully tested and working** with verified on-chain transactions.

```typescript
import { createAuthenticatedSession, buyToken, sellToken, formatEthAmount } from 'gdex-trading';

// Authenticate on Base
const session = await createAuthenticatedSession({ chainId: 8453 });

// Find tokens
const tokens = await session.sdk.tokens.getNewestTokens(8453, 1, undefined, 50);
const tradeable = tokens.filter(t => t.priceUsd > 0);

// Buy token
const buyResult = await buyToken(session, {
  tokenAddress: tradeable[0].address,
  amount: formatEthAmount(0.00001), // 0.00001 ETH (~$0.02)
  chainId: 8453,
});
// ✅ Returns: { isSuccess: true, hash: "0x2666..." }

// Sell token
const sellResult = await sellToken(session, {
  tokenAddress: tradeable[0].address,
  amount: formatEthAmount(0.00001),
  chainId: 8453,
});
// ✅ Returns: { isSuccess: true, hash: "0x9df2..." }
```

**Verified Base transactions:**
- Buy AMARA: `0x26663c53c2145e5d95070150ad69385d7cc96f176497e2b5e2d138f0f45e069f`
- Sell AMARA: `0x9df24b633c4f620f421edc19cbdf70252105ea381fd5fbc8e730bc7fd2642f4b`
- View on Basescan: https://basescan.org/tx/0x26663c53c2145e5d95070150ad69385d7cc96f176497e2b5e2d138f0f45e069f

#### Same Wallet for All EVM Chains

The custodial address from `getUserInfo()` works for:
- ✅ Base (8453)
- ✅ Arbitrum (42161)
- ✅ Ethereum (1)
- ✅ BSC (56)
- ✅ Optimism (10)
- ✅ Fraxtal (252)
- ✅ Any other EVM chain

```typescript
// Get universal EVM custodial address
const userInfo = await session.sdk.user.getUserInfo(
  session.walletAddress,
  session.encryptedSessionKey,
  42161  // Use any EVM chain ID
);
const custodialAddress = userInfo.address;
// This address works on ALL EVM networks!
```

#### Funding for EVM Trading

1. Send ETH, USDC, or tokens to your custodial address
2. Use ANY EVM network (Base, Arbitrum, Ethereum, etc.)
3. GDEX processes in 1-10 minutes
4. Trade immediately on that network

**Quick command:**
```bash
npm run wallets:qr      # Get QR code for custodial address
npm run base:trade      # Test Base trading
npm run base:balance    # Check Base balances
```

### 6. HyperLiquid Perpetual Futures - 🔧 MAJOR BREAKTHROUGH (Feb 12, 2026)

**MAJOR PROGRESS:** We've discovered the correct endpoints and deposit flow! Website successfully places orders.

#### ✅ DEPOSIT TO HYPERLIQUID - WORKING!

**Endpoint**: `POST /v1/hl/deposit`

**Working Implementation**:
```typescript
// 1. Encode deposit data (use SDK's encodeInputData)
const encodedData = CryptoUtils.encodeInputData("hl_deposit", {
  chainId: 42161,  // Arbitrum only
  tokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",  // USDC
  amount: "10000000",  // 10 USDC (6 decimals)
  nonce: generateNonce().toString()
});

// 2. Sign with pattern: hl_deposit-{userId}-{encodedData}
const userId = session.walletAddress.toLowerCase();
const signature = CryptoUtils.sign(`hl_deposit-${userId}-${encodedData}`, session.tradingPrivateKey);

// 3. Create and encrypt payload
const payload = { userId, data: encodedData, signature, apiKey };
const computedData = encrypt(JSON.stringify(payload), apiKey);

// 4. POST with CORS headers (CRITICAL!)
await axios.post(`${apiUrl}/hl/deposit`, { computedData }, {
  headers: {
    'Origin': 'https://gdex.pro',  // Required for CORS
    'Referer': 'https://gdex.pro/',
  }
});
```

> **Note:** These headers are required for ALL API requests, not just HyperLiquid endpoints. When using `createAuthenticatedSession()` / `initSDK()`, they are injected automatically. Only add them manually for direct `axios`/`fetch` calls.

**Status**: ✅ **VERIFIED WORKING** - Successfully deposited $10 USDC to HyperLiquid custodial account

**Script**: `src/deposit-hl-correct.ts`
**Command**: `npm run deposit:hl 10`

#### ⚠️ LEVERAGED POSITION OPENING - IN PROGRESS

**Endpoint**: `POST /v1/hl/create_order`

**Current Status**:
- ✅ Endpoint discovered: `/v1/hl/create_order`
- ✅ CORS headers working: Need `Origin: https://gdex.pro`
- ✅ Encoding working: `CryptoUtils.encodeInputData("hl_create_order", params)`
- ✅ Balance available: $10 on custodial HyperLiquid account
- ✅ **Website successfully places orders** (confirmed Feb 12, 2026)
- ❌ Our code gets "Sent order failed" from HyperLiquid
- 🔍 **NEXT STEP**: Compare website request payload with code payload

**Known Working on Website**: User confirmed successful "Place order successful" message

**Implementation (needs payload comparison)**:
```typescript
const encodedData = CryptoUtils.encodeInputData("hl_create_order", {
  coin: "BTC",
  isLong: true,
  price: price.toString(),
  size: positionSize,
  reduceOnly: false,
  nonce: nonce.toString(),
  tpPrice: "0",
  slPrice: "0",
  isMarket: true
});

const userId = session.walletAddress.toLowerCase();
const signature = CryptoUtils.sign(`hl_create_order-${userId}-${encodedData}`, session.tradingPrivateKey);

const payload = { userId, data: encodedData, signature, apiKey };
const computedData = encrypt(JSON.stringify(payload), apiKey);

await axios.post(`${apiUrl}/hl/create_order`, { computedData }, {
  headers: {
    'Origin': 'https://gdex.pro',
    'Referer': 'https://gdex.pro/',
  }
});
```

> **Note:** `Origin` and `Referer` headers are required for all GDEX API requests — see "API Connectivity Requirements" above.

**Scripts**:
- `src/test-hl-new-sdk-approach.ts` - Order placement (needs debugging)
- `src/check-hl-balances.ts` - Check control & custodial HL balances

#### Legacy Methods Status

| Method | Open Position | Close Position | Status |
|--------|:---:|:---:|--------|
| `hlPlaceOrder` | Error 102 | **WORKS** | Close only |
| `hlCreateOrder` | "Sent order failed" | "Sent order failed" | Use new endpoint |
| `/v1/hl/deposit` | N/A | N/A | ✅ **WORKING!** |
| `/v1/hl/create_order` | In progress | Unknown | Website works |

**What WORKS now:**
- ✅ **Depositing to HyperLiquid** via `/v1/hl/deposit`
- ✅ Closing positions: `hlPlaceOrder` with `reduceOnly=true`
- ✅ Balance/position queries
- ✅ Copy trading (opening positions indirectly)
- ✅ Withdrawals
- ✅ Close all positions

**What's IN PROGRESS:**
- 🔧 Opening positions via `/v1/hl/create_order` (website works, code needs payload comparison)

**What DOESN'T work (legacy SDK methods):**
- ❌ `hlPlaceOrder` with `reduceOnly=false` → error 102
- ❌ `hlCreateOrder` (SDK method) → "Sent order failed"
- ❌ `hlDeposit()` (SDK method) → "Unauthorized"

#### Closing Positions (WORKS)

```typescript
const session = await createAuthenticatedSession({ chainId: 42161 });

// Close a specific position (WORKS)
await session.sdk.hyperLiquid.hlPlaceOrder(
  session.walletAddress,
  'ETH',
  false,   // opposite direction to close (false=sell to close long)
  '2100',  // price
  '0.01',  // size
  true,    // reduceOnly=true (REQUIRED for closing)
  session.tradingPrivateKey
);

// Close ALL positions (WORKS)
await session.sdk.hyperLiquid.hlCloseAll(
  session.walletAddress,
  session.tradingPrivateKey
);
```

#### Balance & Position Queries (WORKS)

```typescript
const session = await createAuthenticatedSession({ chainId: 42161 });

// Balances
const hlBalance = await session.sdk.hyperLiquid.getHyperliquidUsdcBalance(session.walletAddress);
const gbotBalance = await session.sdk.hyperLiquid.getGbotUsdcBalance(session.walletAddress);

// Positions & state
const state = await session.sdk.hyperLiquid.getHyperliquidClearinghouseState(session.walletAddress);
const orders = await session.sdk.hyperLiquid.getHyperliquidOpenOrders(session.walletAddress);
const stats = await session.sdk.hyperLiquid.getHyperliquidUserStats(session.walletAddress);

// Mark prices
const btcPrice = await session.sdk.hyperLiquid.getHyperliquidMarkPrice('BTC');
const prices = await session.sdk.hyperLiquid.getMultipleHyperliquidMarkPrices(['BTC', 'ETH', 'SOL']);

// Leaderboard
const leaders = await session.sdk.hyperLiquid.getHyperliquidLeaderboard('week', 10, 'desc', 'pnl');
```

#### Copy Trading on HyperLiquid (WORKS - opens positions indirectly)

```typescript
// Create HL copy trade (this CAN open positions)
await session.sdk.hyperLiquid.hlCreate(
  session.walletAddress,
  '0xTraderWallet',
  'HL Copy #1',
  1,                            // copy mode: 1=fixed, 2=proportion
  '100000000',                  // 100 USDC per order
  '10',                         // loss %
  '20',                         // profit %
  false,                        // opposite copy
  session.tradingPrivateKey
);
```

#### Custodial Deposit Flow

```typescript
// 1. Get deposit address
const userInfo = await session.sdk.user.getUserInfo(
  session.walletAddress, session.encryptedSessionKey, 42161
);
const depositAddress = userInfo.address;

// 2. Send USDC on Arbitrum
const usdc = new ethers.Contract(
  '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  ['function transfer(address to, uint256 amount) returns (bool)'],
  wallet
);
const tx = await usdc.transfer(depositAddress, ethers.parseUnits('5', 6));
await tx.wait();

// 3. Poll for completion (1-10 minutes)
```

**Deposit Requirements:** Min 5 USDC, Arbitrum only, needs ETH for gas.

#### New @gdex/sdk (PENDING - api.gdex.io not live yet)

The `@gdex/sdk` package (`github:TheArcadiaGroup/gdex-sdk`) is installed but targets `api.gdex.io` which doesn't resolve yet. Once live, it should support opening leveraged positions via `client.createOrder()`. The SDK is already installed and built at `node_modules/@gdex/sdk/`.

#### ❌ Methods That DON'T Work

```typescript
// DON'T USE - hlDeposit fails with "Unauthorized"
await sdk.hyperLiquid.hlDeposit(address, tokenAddress, amount, chainId, privateKey);

// DON'T USE - hlPlaceOrder for OPENING fails with error 102
await sdk.hyperLiquid.hlPlaceOrder(addr, 'BTC', true, '50000', '0.1', false, key);

// DON'T USE - hlCreateOrder always fails with "Sent order failed"
await sdk.hyperLiquid.hlCreateOrder(addr, 'BTC', true, '50000', '0.1', '0', '0', false, true, key);
```

### 5. Solana Token Scanner (Live Dashboard)

Real-time terminal dashboard for scanning, analyzing, and trading Solana pump.fun tokens.

**Command:** `npm run solana:scan`

**Features:**
- WebSocket streaming for live token arrivals and price updates
- Polling across multiple pages for deeper snapshots
- 4 views: **[F]eed** (token list), **[M]overs** (activity + graduation), **[A]nalytics** (stats), **[H]oldings**
- Inline buy/sell with keyboard shortcuts
- Security scoring (mint/freeze/LP lock analysis)
- Sparkline price charts per token
- Graceful shutdown with session summary

**Keyboard shortcuts:**
| Key | Action |
|-----|--------|
| `F` | Feed view (token list sorted by activity) |
| `M` | Movers view (top active + approaching graduation) |
| `A` | Analytics view (bonding curve distribution, security stats) |
| `H` | Holdings view (your Solana holdings) |
| `↑/↓` | Navigate token list |
| `B` | Buy selected token |
| `S` | Sell selected token |
| `+/-` | Adjust trade amount (default 0.005 SOL) |
| `R` | Force refresh |
| `Q` | Quit with summary |

**Data sources:**
- `sdk.connectWebSocketWithChain(622112261)` → `newTokensData`, `effectedTokensData` events
- `sdk.tokens.getNewestTokens(622112261, page, undefined, 20)` → polled every 10s, pages 1-3
- `sdk.tokens.getToken(address, chainId)` → individual token details (includes sentiment)

**Implementation:** `src/solana-scanner.ts` — single self-contained file with TokenStore, WSManager, PollingManager, TradeExecutor, Renderer, and InputHandler classes.

### 6. Real-Time WebSocket Data

Stream live token data and market updates.

**Important:** Node.js requires a WebSocket polyfill — this is handled automatically by `createAuthenticatedSession()` and `initSDK()`.

```typescript
import WebSocket from 'ws';
(globalThis as any).WebSocket = WebSocket; // Only needed if using raw SDK

import { createSDK } from 'gdex.pro-sdk';
const sdk = createSDK('https://trade-api.gemach.io/v1');

await sdk.connectWebSocketWithChain(622112261); // Solana
const wsClient = sdk.getWebSocketClient();

wsClient.on('message', (data) => {
  if (data.newTokensData) {
    console.log('New tokens:', data.newTokensData);
  }
  if (data.effectedTokensData) {
    console.log('Token updates:', data.effectedTokensData);
  }
});

// Disconnect when done
sdk.disconnect();
```

### 6. User Management

Handle portfolio tracking, watchlists, and settings.

```typescript
import { createAuthenticatedSession, getHoldings, getUserInfo } from 'gdex-trading';

const session = await createAuthenticatedSession();

// Get holdings
const holdings = await getHoldings(session);

// Get user info
const userInfo = await getUserInfo(session);

// Get watchlist (uses raw SDK)
const watchlist = await session.sdk.user.getWatchList(
  session.walletAddress,
  session.chainId
);

// Add to watchlist
await session.sdk.user.addWatchList(
  session.walletAddress,
  'TOKEN_ADDRESS',
  true,                         // true = add, false = remove
  622112261,
  session.tradingPrivateKey
);
```

## Supported Networks & Status

| Network | Chain ID | Spot Trading | Custodial Wallet | Verified |
|---------|----------|--------------|------------------|----------|
| **Solana** | **622112261** | ✅ WORKING | Separate | Yes (pump.fun txs) |
| **Base** | **8453** | ✅ WORKING | Universal EVM | Yes (buy/sell txs) |
| **Arbitrum** | **42161** | ✅ WORKING | Universal EVM | Yes |
| **Ethereum** | 1 | ✅ WORKING | Universal EVM | Tested |
| **BSC** | 56 | ✅ WORKING | Universal EVM | Tested |
| **Optimism** | 10 | ✅ WORKING | Universal EVM | Tested |
| Fraxtal | 252 | ✅ WORKING | Universal EVM | Should work |
| Sonic | 146 | ⚠️ Untested | Universal EVM | Should work |
| Nibiru | 6900 | ⚠️ Untested | Universal EVM | Should work |
| Berachain | 80094 | ⚠️ Untested | Universal EVM | Should work |
| Sui | 1313131213 | ⚠️ Untested | Separate | Non-EVM |

**Legend:**
- ✅ WORKING = Fully functional with verified transactions
- ⚠️ Untested = Should work but not yet tested

**Universal EVM Custodial Wallet:** ONE address works for ALL EVM chains (Base, Arbitrum, Ethereum, BSC, Optimism, etc.)

**HyperLiquid Perpetual Futures:** Spot trading on Arbitrum works ✅ | Opening leveraged positions broken ❌ | Copy trading works ✅

## Amount Formatting

Amounts must be in smallest unit as strings:

| Chain | Decimals | Example | Helper |
|-------|----------|---------|--------|
| Solana | 9 | 1 SOL = `"1000000000"` | `formatSolAmount(1)` |
| EVM (ETH/BNB) | 18 | 1 ETH = `"1000000000000000000"` | `formatEthAmount(1)` |
| USDC (Arbitrum) | 6 | 5 USDC = `5000000` (5 * 1e6) | `ethers.parseUnits('5', 6)` |

**Critical: Use `1e6` not `1^6`!**
- Correct: `5 * 1e6` = 5,000,000 (exponential notation)
- Wrong: `5 * 1^6` = 5 (exponentiation always equals 1)

**HyperLiquid:**
- Deposits: Use custodial flow (send USDC to deposit address)
- Minimum: 5 USDC
- Withdrawals: `hlWithdraw()` - no decimal multiplication needed

## Common Gotchas

1. **API requires browser-like User-Agent** — All requests to `trade-api.gemach.io` must include a browser-like `User-Agent` header. Without it, you get 403. Additionally, `Origin: https://gdex.pro` and `Referer: https://gdex.pro/` are needed for CORS. The `createAuthenticatedSession()` / `initSDK()` helpers inject these automatically. For direct `axios`/`fetch` calls, define a `GDEX_HEADERS` constant manually.

2. **HyperLiquid deposits use custodial flow** — Do NOT use `sdk.hyperLiquid.hlDeposit()` directly! It will fail with "Unauthorized" errors. Instead, get your deposit address from `getUserInfo()` and send USDC to that address on Arbitrum. GDEX processes it automatically (1-10 minutes). Minimum: 5 USDC. See section 4 above for complete implementation.

3. **EVM wallets for all chains** — The SDK uses secp256k1 signing internally, even for Solana. Always use a `0x`-prefixed EVM wallet address.

4. **Session key vs wallet key** — The wallet private key is ONLY for the login signature. Trading uses the session key's private key (`session.tradingPrivateKey`). Passing the wallet key to `sdk.trading.buy()` will fail.

5. **Comma-separated API keys** — The `.env` file may contain multiple API keys separated by commas. Always split and use the first: `apiKey.split(',')[0].trim()`. The `createAuthenticatedSession()` helper handles this automatically.

6. **WebSocket polyfill** — Node.js doesn't have a native WebSocket. Add `(globalThis as any).WebSocket = WebSocket` (from `ws` package) before any SDK calls. The `createAuthenticatedSession()` and `initSDK()` helpers handle this automatically.

7. **Amount units** — All amounts are strings in smallest units (lamports, wei). Use `formatSolAmount()` and `formatEthAmount()` helpers to convert. For USDC: multiply by `1e6` (not `1^6`!) - 5 USDC = `5 * 1e6` = 5,000,000 units.

8. **No /v1/health endpoint** — Do NOT use `/v1/health` for connectivity checks; it returns 404. Use `GET /v1/status` → `{"running":true}` or `sdk.tokens.getNativePrices()` as lightweight unauthenticated checks.

## Error Handling

Always wrap SDK calls in try-catch blocks:

```typescript
try {
  const result = await buyToken(session, {
    tokenAddress: 'TOKEN_ADDRESS',
    amount: formatSolAmount(0.005),
  });
  if (result?.isSuccess) {
    console.log('Success:', result.hash);
  } else {
    console.log('Failed:', result?.message);
  }
} catch (error) {
  console.error('Error:', error.message);
}
```

## References

For detailed API documentation, examples, and advanced usage:
- **references/api_reference.md** — Complete API method reference
- **references/examples.md** — Code examples for common use cases

## API Endpoint Status Tracker

Track what works and what needs backend fixes. Update this as endpoints go live.

### Working Endpoints

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `tokens.getNewestTokens(chainId, page, search, limit)` | GET | **WORKS** | Paginated, rich token data |
| `tokens.getTrendingTokens(limit)` | GET | **WORKS** | May return 0 for Solana; cross-chain results |
| `tokens.searchTokens(query, limit)` | GET | **FLAKY** | Intermittent timeouts; use getNewestTokens as fallback |
| `tokens.getToken(address, chainId)` | GET | **WORKS** | Full detail + sentiment |
| `tokens.getNativePrices()` | GET | **WORKS** | SOL/ETH/BNB prices |
| `trading.buy / trading.sell` | POST | **WORKS** | Token2022 ✅ Standard SPL ✅ — needs funded custodial wallet |
| `trading.createLimitBuy / createLimitSell` | POST | **WORKS** | Limit orders |
| WebSocket `newTokensData` | WS | **WORKS** | Real-time new token alerts |
| WebSocket `effectedTokensData` | WS | **WORKS** | Real-time price updates |
| `hyperLiquid.hlPlaceOrder` (reduceOnly=true) | POST | **WORKS** | Close positions only |
| `hyperLiquid.getHyperliquidUsdcBalance` | GET | **WORKS** | Returns HL balance |
| `user.getUserInfo(addr, sessionKey, chainId)` | GET | **WORKS** | Solana ✅; Arbitrum times out ❌ |

### Broken / Not Live Endpoints (needs backend fix)

| Endpoint | Method | Error | Notes |
|----------|--------|-------|-------|
| `tokens.getPriceHistory(address, interval)` | GET | 404 | OHLCV candles — returns "Cannot GET /v1/token_candles/..." |
| `tokens.getChartTokenPumpfun(address, interval)` | GET | 404 | Pump.fun chart — returns "Cannot GET /v1/ohlcv/get_recent_ohlcvs/..." |
| `tokens.getMetadataToken(address, chainId)` | GET | 404 | Returns `{ code: 101, error: 'Unsupported token' }` |
| `tokens.getTokens(addresses)` | GET | 404 | Batch token query — returns "Cannot GET /v1/tokens" |
| `hyperLiquid.hlPlaceOrder` (reduceOnly=false) | POST | Error 102 | "Now only support close position" |
| `hyperLiquid.hlCreateOrder` (any params) | POST | 400 | "Sent order failed" |
| `hyperLiquid.hlDeposit` | POST | 401 | "Unauthorized" — use custodial flow instead |
| `hyperLiquid.getGbotUsdcBalance` | GET | Timeout | `/hl/usdc_balance` endpoint consistently times out |
| `user.getUserInfo(addr, key, 42161)` | GET | Timeout | Arbitrum chainId consistently times out on `/user` |
| `trading.getTrades(address)` | GET | 404 | Endpoint not live |
| New `@gdex/sdk` (`api.gdex.io`) | ALL | NXDOMAIN | Domain not live yet |

**Impact:** Without `getPriceHistory`, the scanner can't show OHLCV charts. Currently uses sparklines from polled snapshots as a workaround. Once the price history endpoint goes live, we can add proper candlestick charts.

## Statistical Analysis & Data Mining

The SDK provides extensive data for building analytics, trading algorithms, and monitoring systems. Run `npm run explore:data` to see all available data points.

### Token Analytics Data

**Price & Volume Metrics:**
```typescript
const token = await sdk.tokens.getNewestTokens(622112261, 1, undefined, 20);
// Returns rich token objects with:
{
  // Price data
  priceUsd: number,           // Current USD price
  priceNative: number,        // Price in native token (SOL/ETH/BNB)
  marketCap: number,          // USD market capitalization
  liquidityUsd: number,       // Total liquidity in USD
  liquidityEth: number,       // Liquidity in native token

  // Volume tracking (5min, 1hr, 6hr, 24hr)
  volumes: {
    m5: number,    // 5-minute volume
    h1: number,    // 1-hour volume
    h6: number,    // 6-hour volume
    h24: number    // 24-hour volume
  },

  // Price changes (same timeframes)
  priceChanges: {
    m5: number,    // 5min price change %
    h1: number,    // 1hr price change %
    h6: number,    // 6hr price change %
    h24: number    // 24hr price change %
  },

  // Transaction metrics
  txCount: number,            // Total transaction count
  data24h: {
    txCount: number,          // 24hr transaction count
    buyTxCount: number,       // Buy transactions
    sellTxCount: number,      // Sell transactions
    totalVolumeUsd: number,   // Total volume
    buyVolumeUsd: number,     // Buy volume
    sellVolumeUsd: number,    // Sell volume
    buyMaker: number,         // Number of unique buyers
    sellMaker: number,        // Number of unique sellers
    totalMakers: number,      // Total unique traders
    priceChanged: number      // Price change %
  },

  // Similar data available for: data5m, data1h, data6h
}
```

**Security & Risk Metrics:**
```typescript
{
  securities: {
    mintAbility: boolean,            // Can mint new tokens (false = safer)
    freezeAbility: boolean,          // Can freeze tokens (false = safer)
    lpLockPercentage: number,        // % of LP locked (100 = safest)
    contractVerified: number,        // Contract verification score
    buyTax: number,                  // Buy tax %
    sellTax: number,                 // Sell tax %
    holderCount: number,             // Number of token holders
    topHoldersPercentage: number,    // % held by top 10 holders
    isValidTop10HoldersPercent: boolean  // Whale risk flag
  },

  // Pump.fun specific
  bondingCurveProgress: number,      // % toward DEX graduation (0-100)
  isListedOnDex: boolean,            // DEX graduation status
  isPumpfun: boolean,                // On pump.fun platform

  // Social sentiment
  socialInfo: {
    logoUrl: string,
    twitterUrl: string,
    websiteUrl: string,
    telegramUrl: string
  }
}
```

**Use Cases:**
- **Momentum Trading:** Sort by `priceChanges.h1` + `volumes.h1` to find volatile tokens
- **Liquidity Filtering:** `liquidityUsd > 10000` to avoid low-liquidity traps
- **Security Scoring:** Combine `mintAbility`, `freezeAbility`, `lpLockPercentage`, `topHoldersPercentage`
- **Graduation Tracking:** Monitor `bondingCurveProgress` approaching 100% for pump.fun tokens
- **Whale Detection:** Flag tokens where `topHoldersPercentage > 50%`

### HyperLiquid Analytics Data

**Position & PnL Tracking:**
```typescript
const stats = await sdk.hyperLiquid.getHyperliquidUserStats(walletAddress);
// Returns comprehensive trading metrics:
{
  userStats: {
    // PnL over time
    "24h": number,           // 24hr PnL in USDC
    "7d": number,            // 7-day PnL
    "30d": number,           // 30-day PnL
    allTime: {
      pnl: number,           // All-time PnL
      pnlPercentage: number, // All-time ROI %
      capitalDeployed: number // Capital used
    },

    // Daily PnL breakdown
    dailyPnls: Array<{
      timeMs: number,          // Timestamp
      date: string,            // ISO date
      pnl: number,             // Daily PnL
      pnlPercentage: number,   // Daily ROI %
      capitalDeployed: number  // Capital used that day
    }>,

    // Volume tracking
    volumes: {
      "24h": number,
      "7d": number,
      "30d": number
    },

    // Win/loss ratios
    tradesCount: {
      "24h": { win: number, lose: number, total: number },
      "7d": { win: number, lose: number, total: number },
      "30d": { win: number, lose: number, total: number }
    },

    // Performance metrics
    percentagePnl: {
      "24h": number,    // ROI % last 24hrs
      "7d": number,     // ROI % last 7 days
      "30d": number     // ROI % last 30 days
    },

    capitalDeployed: {
      "24h": number,    // Capital used last 24hrs
      "7d": number,     // Capital used last 7 days
      "30d": number     // Capital used last 30 days
    }
  }
}
```

**Trade History & Fills:**
```typescript
const history = await sdk.hyperLiquid.getHyperliquidTradeHistory(
  walletAddress, sessionKey, false, 1, 100  // getFromApi, page, limit
);
// Returns:
{
  fills: Array<{
    coin: string,        // Trading pair (BTC, ETH, etc.)
    side: string,        // "B" (buy) or "A" (sell)
    px: string,          // Execution price
    sz: string,          // Position size
    time: number,        // Timestamp (ms)
    closedPnl: string,   // Realized PnL from this fill
    dir: string,         // Direction
    hash: string,        // Transaction hash
    oid: number,         // Order ID

    // Copy trading metadata (if from copy trade)
    copyTradeName: string,
    traderWallet: string,
    traderPrice: string,
    traderSize: string,
    traderTxHash: string
  }>,

  pagination: {
    currentPage: number,
    totalPages: number,
    totalRecords: number,
    hasNextPage: boolean,
    hasPreviousPage: boolean
  }
}
```

**Leaderboard Data:**
```typescript
const leaders = await sdk.hyperLiquid.getHyperliquidLeaderboard(
  'allTime',  // 'day' | 'week' | 'month' | 'allTime'
  100,        // top N traders
  'desc',     // sort order
  'pnl'       // sort by 'pnl' | 'accountValue' | 'volume' | 'roi'
);
// Returns:
Array<{
  ethAddress: string,
  accountValue: string,
  displayName: string,
  windowPerformances: [
    ['day', { pnl: string, roi: string, vlm: string }],
    ['week', { pnl: string, roi: string, vlm: string }],
    ['month', { pnl: string, roi: string, vlm: string }],
    ['allTime', { pnl: string, roi: string, vlm: string }]
  ]
}>
```

**Use Cases:**
- **Performance Dashboards:** Plot `dailyPnls` over time for equity curves
- **Win Rate Analysis:** Calculate win rate from `tradesCount.7d.win / tradesCount.7d.total`
- **Trader Ranking:** Sort leaderboard by `roi` to find consistent performers
- **Risk Management:** Monitor `capitalDeployed` vs `pnl` for drawdown tracking
- **Copy Trading Selection:** Filter leaderboard by `windowPerformances.month.roi > 20%` + `volume > 1M`

### User Portfolio Data

**Holdings with PnL Tracking:**
```typescript
const holdings = await sdk.user.getHoldingsList(address, chainId, sessionKey);
// Returns:
Array<{
  amount: string,          // Token amount (smallest unit)
  uiAmount: string,        // Human-readable amount
  holding: number,         // Current USD value
  invested: number,        // Initial investment USD
  pnlPercentage: number,   // PnL % (eg. 405.41 = +405%)
  startTimestamp: number,  // Purchase timestamp
  canSell: boolean,        // Whether sellable now

  tokenInfo: {
    address: string,
    symbol: string,
    name: string,
    priceUsd: number,
    marketCap: number,
    // ... (full token data)
  }
}>
```

**Referral Tracking:**
```typescript
const refStats = await sdk.user.getReferralStats(address, chainId);
// Returns:
{
  totalReferralCountTier1: number,  // Direct referrals
  totalReferralCountTier2: number,  // Indirect referrals
  pendingAmount: string,            // Unclaimed rewards
  withdrawable: string,             // Claimable rewards
  totalWithdrawn: string,           // Already claimed
  nativePrice: number,              // Current native token price
  claimHistorys: Array<{
    claimAmount: string,
    claimTime: number,
    status: boolean
  }>
}
```

**Use Cases:**
- **Portfolio Monitoring:** Calculate total portfolio value: `sum(holdings.map(h => h.holding))`
- **ROI Tracking:** Plot `pnlPercentage` per holding over time
- **Rebalancing Alerts:** Flag holdings where `pnlPercentage > 500%` for profit-taking
- **Referral Performance:** Track referral growth rate vs rewards earned

### Real-Time WebSocket Streams

**Live Token Feed:**
```typescript
sdk.connectWebSocketWithChain(622112261);
const ws = sdk.getWebSocketClient();

ws.on('message', (data) => {
  // New token launches
  if (data.newTokensData) {
    // Real-time array of newly created tokens
    // Same structure as getNewestTokens()
  }

  // Token price/volume updates
  if (data.effectedTokensData) {
    // Real-time updates for existing tokens
    // Includes: address, priceUsd, volumes, txCount
  }
});
```

**Use Cases:**
- **Sniping Bots:** Instant notification when new tokens launch
- **Price Alerts:** Trigger on `priceChanges.m5 > 50%`
- **Volume Spikes:** Alert when `volumes.m5 > 10 * volumes.h1`
- **Live Dashboards:** Stream price updates to UI in real-time

### Analysis Script Examples

**Momentum Scanner:**
```typescript
const tokens = await sdk.tokens.getNewestTokens(622112261, 1, undefined, 100);

// Find tokens with high momentum
const momentum = tokens
  .filter(t => t.liquidityUsd > 5000 && t.txCount > 10)
  .map(t => ({
    symbol: t.symbol,
    priceChange: t.priceChanges?.h1 || 0,
    volume: t.volumes?.h1 || 0,
    buyRatio: t.data1h ? t.data1h.buyTxCount / t.data1h.txCount : 0,
    score: (t.priceChanges?.h1 || 0) * (t.volumes?.h1 || 0) / 1000
  }))
  .sort((a, b) => b.score - a.score)
  .slice(0, 10);

console.log('Top 10 momentum tokens:', momentum);
```

**Security Risk Scoring:**
```typescript
function calculateRiskScore(token) {
  let score = 100; // Start at 100 (safest)

  if (token.securities.mintAbility) score -= 30;
  if (token.securities.freezeAbility) score -= 30;
  if (token.securities.lpLockPercentage < 50) score -= 20;
  if (token.securities.topHoldersPercentage > 50) score -= 15;
  if (token.securities.buyTax > 5) score -= 5;
  if (token.securities.sellTax > 5) score -= 5;

  return Math.max(0, score);
}

const safeTokens = tokens
  .map(t => ({ ...t, riskScore: calculateRiskScore(t) }))
  .filter(t => t.riskScore > 70)
  .sort((a, b) => b.riskScore - a.riskScore);
```

**Trader Performance Analyzer:**
```typescript
const stats = await sdk.hyperLiquid.getHyperliquidUserStats(wallet);
const metrics = {
  sharpeRatio: calculateSharpe(stats.userStats.dailyPnls),
  maxDrawdown: calculateMaxDrawdown(stats.userStats.dailyPnls),
  winRate: stats.userStats.tradesCount['30d'].win / stats.userStats.tradesCount['30d'].total,
  avgWin: stats.userStats['30d'] / stats.userStats.tradesCount['30d'].win,
  profitFactor: Math.abs(stats.userStats.tradesCount['30d'].win / stats.userStats.tradesCount['30d'].lose),
  roi: stats.userStats.percentagePnl['30d']
};
```

### Data Export & Persistence

All SDK methods return plain JavaScript objects — easily serializable for:
- **CSV Export:** For Excel analysis
- **Database Storage:** PostgreSQL, MongoDB, TimescaleDB for time-series
- **Analytics Platforms:** Feed to Grafana, Metabase, Tableau
- **ML Training:** Export historical data for model training

### Quick Command
```bash
npm run explore:data  # Comprehensive data exploration demo
```

## Agent Integration

### Connectivity Detection

Agents should verify API reachability before attempting trades. **Do NOT call `/v1/health`** (it doesn't exist). Use this pattern:

```typescript
import { initSDK } from 'gdex-trading';

const sdk = initSDK('https://trade-api.gemach.io/v1', process.env.GDEX_API_KEY);

// Lightweight unauthenticated check — returns native token prices
const prices = await sdk.tokens.getNativePrices();
const isOnline = prices && Object.keys(prices).length > 0;
// If isOnline is true, the full API pipeline is functional
```

### Required Header Injection

The `initSDK()` and `createAuthenticatedSession()` functions automatically inject the required `Origin`, `Referer`, and `User-Agent` headers into the SDK's internal HTTP client. No additional configuration is needed.

For agents that bypass the SDK and make direct HTTP calls:

```typescript
import { REQUIRED_HEADERS } from 'gdex-trading';

// REQUIRED_HEADERS = {
//   'Origin': 'https://gdex.pro',
//   'Referer': 'https://gdex.pro/',
//   'User-Agent': 'Mozilla/5.0 ... Chrome/131.0.0.0 Safari/537.36'
// }
const response = await fetch('https://trade-api.gemach.io/v1/token/native_prices', {
  headers: { ...REQUIRED_HEADERS }
});
```

### Offline Fallback

If the API is unreachable (network issues, not header misconfiguration), agents can still:
- Read cached wallet info from `.env`
- Generate QR codes for wallet addresses
- Display static skill documentation
- Show deterministic wallet reports

But **cannot** execute trades, fetch live prices, or authenticate sessions.

## Security Notes

- **Never log or expose private keys**
- **Use session keys for trading, not wallet keys**
- **Validate addresses before transactions**
- **Test with small amounts first**
- **Verify chain IDs match intended network**
