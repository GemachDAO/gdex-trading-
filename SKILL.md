---
name: gdex-trading
description: Interact with GDEX decentralized exchange SDK for cryptocurrency trading operations. Use when users want to trade tokens, get market data, manage portfolios, set up copy trading, interact with HyperLiquid futures, or analyze crypto markets across multiple chains (Ethereum, Solana, Base, BSC, Sui, etc.). Triggers include requests to buy/sell tokens, check prices, create limit orders, copy top traders, monitor positions, get trending tokens, or any GDEX-related operations.
---

# GDEX Trading SDK

## Overview

Enable programmatic interaction with GDEX (Gemach DAO's decentralized exchange) for multi-chain cryptocurrency trading, portfolio management, copy trading, and real-time market data.

## Installation

```bash
npm install gdex.pro-sdk ethers ws
```

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
  apiKey: process.env.GDEX_API_KEY,
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

### 5. HyperLiquid Futures

**CRITICAL: GDEX uses custodial deposits.** Do NOT use `hlDeposit()` directly!

#### Current API Status (as of Feb 2025)

| Method | Open Position | Close Position | Status |
|--------|:---:|:---:|--------|
| `hlPlaceOrder` | Error 102 | **WORKS** | Close only |
| `hlCreateOrder` | "Sent order failed" | "Sent order failed" | Broken |
| New `@gdex/sdk` | DNS not live | DNS not live | `api.gdex.io` pending |

**Opening positions via API is NOT currently supported.** The GDEX backend returns error 102: "Now only support close position" for `hlPlaceOrder`, and `hlCreateOrder` always returns "Sent order failed" regardless of parameters.

**What WORKS now:**
- Closing positions: `hlPlaceOrder` with `reduceOnly=true`
- Balance/position queries
- Copy trading (opening positions indirectly)
- Withdrawals
- Close all positions

**What DOESN'T work:**
- `hlPlaceOrder` with `reduceOnly=false` → error 102
- `hlCreateOrder` (any params) → "Sent order failed"
- `hlDeposit()` → "Unauthorized" (use custodial flow)

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

## Supported Networks

| Network | Chain ID | Native Token | Copy Trading | WebSocket |
|---------|----------|--------------|--------------|-----------|
| Ethereum | 1 | ETH | Coming Soon | Yes |
| Base | 8453 | ETH | Coming Soon | Yes |
| BSC | 56 | BNB | Coming Soon | Yes |
| **Solana** | **622112261** | SOL | **Supported** | Yes |
| Sonic | 146 | S | Coming Soon | Yes |
| Sui | 1313131213 | SUI | Coming Soon | Yes |
| Nibiru | 6900 | NIBI | Coming Soon | Yes |
| Berachain | 80094 | BERA | Coming Soon | Yes |
| Optimism | 10 | ETH | Coming Soon | Yes |
| Arbitrum | 42161 | ETH | Coming Soon | Yes |
| Fraxtal | 252 | frxETH | Coming Soon | Yes |

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

1. **HyperLiquid deposits use custodial flow** — Do NOT use `sdk.hyperLiquid.hlDeposit()` directly! It will fail with "Unauthorized" errors. Instead, get your deposit address from `getUserInfo()` and send USDC to that address on Arbitrum. GDEX processes it automatically (1-10 minutes). Minimum: 5 USDC. See section 4 above for complete implementation.

2. **EVM wallets for all chains** — The SDK uses secp256k1 signing internally, even for Solana. Always use a `0x`-prefixed EVM wallet address.

3. **Session key vs wallet key** — The wallet private key is ONLY for the login signature. Trading uses the session key's private key (`session.tradingPrivateKey`). Passing the wallet key to `sdk.trading.buy()` will fail.

4. **Comma-separated API keys** — The `.env` file may contain multiple API keys separated by commas. Always split and use the first: `apiKey.split(',')[0].trim()`. The `createAuthenticatedSession()` helper handles this automatically.

5. **WebSocket polyfill** — Node.js doesn't have a native WebSocket. Add `(globalThis as any).WebSocket = WebSocket` (from `ws` package) before any SDK calls. The `createAuthenticatedSession()` and `initSDK()` helpers handle this automatically.

6. **Amount units** — All amounts are strings in smallest units (lamports, wei). Use `formatSolAmount()` and `formatEthAmount()` helpers to convert. For USDC: multiply by `1e6` (not `1^6`!) - 5 USDC = `5 * 1e6` = 5,000,000 units.

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
| `tokens.getTrendingTokens(limit)` | GET | **WORKS** | Cross-chain (may be empty for Solana) |
| `tokens.searchTokens(query, limit)` | GET | **WORKS** | Search by name/symbol |
| `tokens.getToken(address, chainId)` | GET | **WORKS** | Full detail + sentiment |
| `tokens.getNativePrices()` | GET | **WORKS** | SOL/ETH/BNB prices |
| `trading.buy / trading.sell` | POST | **WORKS** | Pump.fun tokens included |
| `trading.createLimitBuy / createLimitSell` | POST | **WORKS** | Limit orders |
| WebSocket `newTokensData` | WS | **WORKS** | Real-time new token alerts |
| WebSocket `effectedTokensData` | WS | **WORKS** | Real-time price updates |
| `hyperLiquid.hlPlaceOrder` (reduceOnly=true) | POST | **WORKS** | Close positions only |
| `hyperLiquid.getHyperliquidUsdcBalance` | GET | **WORKS** | Balance queries |

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
| New `@gdex/sdk` (`api.gdex.io`) | ALL | NXDOMAIN | Domain not live yet |

**Impact:** Without `getPriceHistory`, the scanner can't show OHLCV charts. Currently uses sparklines from polled snapshots as a workaround. Once the price history endpoint goes live, we can add proper candlestick charts.

## Security Notes

- **Never log or expose private keys**
- **Use session keys for trading, not wallet keys**
- **Validate addresses before transactions**
- **Test with small amounts first**
- **Verify chain IDs match intended network**
