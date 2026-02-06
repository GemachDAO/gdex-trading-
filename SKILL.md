---
name: gdex-trading
description: Interact with GDEX decentralized exchange SDK for cryptocurrency trading operations. Use when users want to trade tokens, get market data, manage portfolios, set up copy trading, interact with HyperLiquid futures, or analyze crypto markets across multiple chains (Ethereum, Solana, Base, BSC, Sui, etc.). Triggers include requests to buy/sell tokens, check prices, create limit orders, copy top traders, monitor positions, get trending tokens, or any GDEX-related operations.
---

# GDEX Trading SDK

## Overview

Enable programmatic interaction with GDEX (Gemach DAO's decentralized exchange) for multi-chain cryptocurrency trading, portfolio management, copy trading, and real-time market data.

## Installation

Always install the SDK first:

```bash
npm install gdex.pro-sdk
```

## Core Capabilities

### 1. Token Operations

Get market data, search tokens, analyze trends, and retrieve price information across all supported chains.

**Common operations:**
- Search tokens by name/symbol
- Get trending tokens
- Retrieve token metadata and prices
- Get native chain prices
- View chart data

**Example:**
```typescript
import { createSDK } from 'gdex.pro-sdk';

const sdk = createSDK('https://trade-api.gemach.io/v1');

// Get trending tokens
const trending = await sdk.tokens.getTrendingTokens(10);

// Search for specific token
const results = await sdk.tokens.searchTokens('PEPE', 10);

// Get token details
const token = await sdk.tokens.getToken('0xa0b86a33e6776a721c4e3cef6e9e1a7ed6ae6c3a');
```

### 2. Trading Operations

Execute market orders and limit orders on supported chains.

**Requires:** User address and private key for authenticated operations.

**Common operations:**
- Buy tokens (market order)
- Sell tokens (market order)
- Create limit buy orders
- Create limit sell orders
- Update existing orders
- View trade history

**Example:**
```typescript
// Market buy
const buyResult = await sdk.trading.buy(
  '0xUserAddress',
  '1000000000000000000', // amount in wei
  '0xTokenAddress',
  1, // chainId (1 = Ethereum)
  'private-key'
);

// Limit sell order
const limitSell = await sdk.trading.createLimitSell(
  '0xUserAddress',
  '500000000000000000', // amount
  '0.002', // trigger price
  '0xTokenAddress',
  1, // chainId
  'private-key'
);
```

### 3. Copy Trading

Automatically copy trades from top-performing traders on supported chains.

**Supported:** Solana (fully supported), other chains coming soon.

**Common operations:**
- Create copy trade configuration
- Update copy trade settings
- Get list of copy trades
- View top traders to copy

**Example:**
```typescript
const copyTrade = await sdk.copyTrade.createCopyTrade(
  '0xYourAddress',
  '0xTraderAddress',
  'Top Trader Copy',
  '20', // gas price
  1, // buy mode: 1=fixed amount, 2=percentage
  '1000000000', // copy amount (1 SOL = 1*10^9)
  false, // buy existing tokens
  '10', // stop loss %
  '20', // take profit %
  true, // copy sell
  [], // excluded DEXes
  622112261, // Solana chainId
  'private-key'
);
```

### 4. HyperLiquid Futures

Trade perpetual futures and copy trade on HyperLiquid.

**Common operations:**
- Deposit/withdraw USDC
- Place and close positions
- Create futures copy trades
- View leaderboard

**Important:** Deposits require a token address and chain ID (Arbitrum: 42161). Withdrawals don't need decimal multiplication.

**Example:**
```typescript
// Deposit USDC to HyperLiquid (via Arbitrum)
await sdk.hyperLiquid.hlDeposit(
  '0xYourAddress',
  '0xUSDCTokenAddress', // USDC token address
  '100000000', // 100 USDC (100 * 10^6)
  42161, // chainId (Arbitrum)
  'private-key'
);

// Create copy trade
await sdk.hyperLiquid.hlCreate(
  '0xYourAddress',
  '0xTraderWallet',
  'HL Copy #1',
  1, // copy mode: 1=fixed, 2=proportion
  '100000000', // 100 USDC per order
  '10', // loss %
  '20', // profit %
  false, // opposite copy
  'private-key'
);
```

### 5. Real-Time WebSocket Data

Stream live token data and market updates.

**Available data:**
- New tokens discovered
- Token price/volume updates
- Network-specific streams

**Example:**
```typescript
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
```

### 6. User Management

Handle authentication, portfolio tracking, watchlists, and settings.

**Common operations:**
- Login/authentication
- Get user information
- View holdings/portfolio
- Manage watchlist
- Update trading settings

**Example:**
```typescript
// Get user holdings
const holdings = await sdk.user.getHoldingsList(
  '0xUserAddress',
  1, // chainId
  'session-key'
);

// Add to watchlist
await sdk.user.addWatchList(
  '0xUserAddress',
  '0xTokenAddress',
  true, // true = add, false = remove
  1, // chainId
  'private-key'
);
```

## Supported Networks

| Network | Chain ID | Native Token | Copy Trading | WebSocket |
|---------|----------|--------------|--------------|-----------|
| Ethereum | 1 | ETH | Coming Soon | ✅ |
| Base | 8453 | ETH | Coming Soon | ✅ |
| BSC | 56 | BNB | Coming Soon | ✅ |
| **Solana** | 622112261 | SOL | **✅ Supported** | ✅ |
| Sonic | 146 | S | Coming Soon | ✅ |
| Sui | 1313131213 | SUI | Coming Soon | ✅ |
| Nibiru | 6900 | NIBI | Coming Soon | ✅ |
| Berachain | 80094 | BERA | Coming Soon | ✅ |
| Optimism | 10 | ETH | Coming Soon | ✅ |
| Arbitrum | 42161 | ETH | Coming Soon | ✅ |
| Fraxtal | 252 | frxETH | Coming Soon | ✅ |

## Common Workflows

### Market Analysis Workflow

1. Get trending tokens to identify opportunities
2. Search for specific tokens of interest
3. Retrieve detailed token information
4. View price history/charts
5. Check trade history

### Trading Workflow

1. Identify target token and amount
2. For market orders: Call buy/sell directly
3. For limit orders: Create limit order with price
4. Monitor order status
5. Update or cancel as needed

### Copy Trading Setup

1. Get list of top traders
2. Select trader to copy
3. Configure copy settings (amount, stop loss, take profit)
4. Create copy trade
5. Monitor copy trade performance
6. Update settings as needed

## Amount Formatting Guidelines

**Critical:** Amounts must be properly formatted based on token decimals.

**For most EVM chains (ETH, BNB, etc.):**
- 18 decimals
- 1 token = "1000000000000000000"

**For Solana:**
- 9 decimals
- 1 SOL = "1000000000"

**For HyperLiquid USDC:**
- Deposits: Requires USDC token address + chainId (Arbitrum 42161), amount in smallest unit
- Withdrawals: No decimal multiplication needed (just the USDC amount as string)

**Use CryptoUtils for formatting:**
```typescript
import { CryptoUtils } from 'gdex.pro-sdk';

// Format amount to wei
const weiAmount = CryptoUtils.formatTokenAmount('1.5', 18);
```

## Error Handling

Always wrap SDK calls in try-catch blocks:

```typescript
try {
  const result = await sdk.trading.buy(/*...*/);
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
- **references/api_reference.md** - Complete API method reference
- **references/examples.md** - Code examples for common use cases

## Security Notes

- **Never log or expose private keys**
- **Validate addresses before transactions**
- **Test with small amounts first**
- **Use session keys for non-critical operations**
- **Verify chain IDs match intended network**