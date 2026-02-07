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

### 4. HyperLiquid Futures

Trade perpetual futures and copy trade on HyperLiquid.

**CRITICAL: GDEX uses custodial deposits.** Do NOT use `hlDeposit()` directly - it will fail with "Unauthorized" errors!

#### Correct Deposit Flow (Custodial)

GDEX provides a deposit address for each user. Send USDC to this address on Arbitrum, and GDEX automatically deposits it to HyperLiquid.

```typescript
const session = await createAuthenticatedSession();

// Step 1: Get your GDEX deposit address (custodial)
const userInfo = await session.sdk.user.getUserInfo(
  session.walletAddress,
  session.encryptedSessionKey,
  42161  // Arbitrum chain ID
);
const depositAddress = userInfo.address;

console.log('Send USDC to:', depositAddress);

// Step 2: Send USDC to deposit address (standard ERC-20 transfer)
import { ethers } from 'ethers';

const ARBITRUM_RPC = 'https://arb1.arbitrum.io/rpc';
const USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

const provider = new ethers.JsonRpcProvider(ARBITRUM_RPC);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

const usdc = new ethers.Contract(
  USDC_ADDRESS,
  ['function transfer(address to, uint256 amount) returns (bool)'],
  wallet
);

// Send 5 USDC (minimum deposit)
const amount = ethers.parseUnits('5', 6); // USDC has 6 decimals
const tx = await usdc.transfer(depositAddress, amount);
await tx.wait();

console.log('USDC sent:', tx.hash);

// Step 3: Wait for GDEX to process (1-10 minutes)
const initialBalance = await session.sdk.hyperLiquid.getHyperliquidUsdcBalance(
  session.walletAddress
);

// Poll every 30 seconds
while (true) {
  await new Promise(resolve => setTimeout(resolve, 30000));

  const currentBalance = await session.sdk.hyperLiquid.getHyperliquidUsdcBalance(
    session.walletAddress
  );

  if (currentBalance > initialBalance) {
    console.log('Deposit complete! Balance:', currentBalance);
    break;
  }
}
```

#### Deposit Requirements

- **Minimum**: 5 USDC
- **Network**: Arbitrum only (chain ID: 42161)
- **USDC Contract**: `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`
- **Gas**: ETH on Arbitrum (~$0.10-0.50)
- **Processing Time**: 1-10 minutes

#### Other HyperLiquid Operations

```typescript
const session = await createAuthenticatedSession();

// Get leaderboard (no auth required)
const leaders = await session.sdk.hyperLiquid.getHyperliquidLeaderboard('week', 10, 'desc', 'pnl');

// Get mark prices
const btcPrice = await session.sdk.hyperLiquid.getHyperliquidMarkPrice('BTC');
const prices = await session.sdk.hyperLiquid.getMultipleHyperliquidMarkPrices(['BTC', 'ETH', 'SOL']);

// Check balances
const gbotBalance = await session.sdk.hyperLiquid.getGbotUsdcBalance(session.walletAddress);
const hlBalance = await session.sdk.hyperLiquid.getHyperliquidUsdcBalance(session.walletAddress);

// Place order (long BTC)
await session.sdk.hyperLiquid.hlPlaceOrder(
  session.walletAddress,
  'BTC',                        // coin
  true,                         // isLong (true=long, false=short)
  '50000',                      // price
  '0.1',                        // size
  false,                        // reduceOnly (false=open new, true=close only)
  session.tradingPrivateKey
);

// Withdraw from HyperLiquid to Arbitrum
await session.sdk.hyperLiquid.hlWithdraw(
  session.walletAddress,
  '10',                         // amount (no decimals needed)
  session.tradingPrivateKey
);

// Create HL copy trade
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

#### ❌ WRONG: Don't Use hlDeposit()

```typescript
// DON'T USE THIS - It will fail!
await session.sdk.hyperLiquid.hlDeposit(
  session.walletAddress,
  tokenAddress,
  amount,
  chainId,
  privateKey
);
// Returns "Unauthorized" or "Insufficient balance" errors
// This is not the intended GDEX deposit flow
```

**Always use the custodial deposit flow documented above!**

### 5. Real-Time WebSocket Data

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

## Security Notes

- **Never log or expose private keys**
- **Use session keys for trading, not wallet keys**
- **Validate addresses before transactions**
- **Test with small amounts first**
- **Verify chain IDs match intended network**
