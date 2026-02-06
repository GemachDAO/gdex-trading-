# GDEX SDK Code Examples

Practical examples for common GDEX SDK use cases.

## Table of Contents

1. [Market Analysis](#market-analysis)
2. [Basic Trading](#basic-trading)
3. [Limit Orders](#limit-orders)
4. [Copy Trading](#copy-trading)
5. [HyperLiquid Futures](#hyperliquid-futures)
6. [WebSocket Real-Time Data](#websocket-real-time-data)
7. [Portfolio Management](#portfolio-management)
8. [Multi-Chain Operations](#multi-chain-operations)

## Market Analysis

### Get Trending Tokens and Analyze

```typescript
import { createSDK } from 'gdex.pro-sdk';

async function analyzeTrendingTokens() {
  const sdk = createSDK('https://trade-api.gemach.io/v1');
  
  // Get top 20 trending tokens
  const trending = await sdk.tokens.getTrendingTokens(20);
  
  console.log('Top Trending Tokens:');
  trending.forEach((token, index) => {
    console.log(`${index + 1}. ${token.symbol} - $${token.priceUsd}`);
    console.log(`   Volume 24h: $${token.volume24h}`);
    console.log(`   Market Cap: $${token.marketCap}`);
  });
  
  // Get detailed info for top token
  if (trending.length > 0) {
    const topToken = await sdk.tokens.getToken(trending[0].address);
    console.log('\nTop Token Details:', topToken);
  }
}
```

### Search and Compare Tokens

```typescript
async function searchAndCompare() {
  const sdk = createSDK('https://trade-api.gemach.io/v1');
  
  // Search for PEPE tokens
  const pepeTokens = await sdk.tokens.searchTokens('PEPE', 10);
  
  console.log('PEPE Tokens Found:', pepeTokens.length);
  
  // Compare by market cap
  const sorted = pepeTokens.sort((a, b) => 
    parseFloat(b.marketCap) - parseFloat(a.marketCap)
  );
  
  sorted.forEach((token, i) => {
    console.log(`${i + 1}. ${token.name} (${token.symbol})`);
    console.log(`   Chain: ${token.chainId}`);
    console.log(`   Market Cap: $${token.marketCap}`);
    console.log(`   Address: ${token.address}`);
  });
}
```

### Get Solana Pump.fun Chart Data

```typescript
async function getPumpfunChartData() {
  const sdk = createSDK('https://trade-api.gemach.io/v1');
  
  const tokenAddress = 'DZZUrx7gN6cvNLWHi25ursiVFJob51exHEQujuzdpump';
  
  // Get 1-hour candles for last 24 hours
  const chartData = await sdk.tokens.getChartTokenPumpfun(
    tokenAddress,
    3600 // 1 hour in seconds
  );
  
  console.log('Chart Data:', chartData);
}
```

## Basic Trading

### Market Buy on Ethereum

```typescript
import { createSDK, CryptoUtils } from 'gdex.pro-sdk';

async function buyTokenOnEthereum() {
  const sdk = createSDK('https://trade-api.gemach.io/v1', {
    apiKey: 'your-api-key'
  });
  
  const userAddress = '0xYourAddress';
  const privateKey = 'your-private-key';
  const tokenAddress = '0xa0b86a33e6776a721c4e3cef6e9e1a7ed6ae6c3a';
  
  // Buy with 0.1 ETH
  const amount = '100000000000000000'; // 0.1 ETH in wei
  
  try {
    const result = await sdk.trading.buy(
      userAddress,
      amount,
      tokenAddress,
      1, // Ethereum chainId
      privateKey
    );
    
    if (result?.isSuccess) {
      console.log('✅ Buy successful!');
      console.log('Transaction hash:', result.hash);
      console.log('Gas used:', result.gasUsed);
    } else {
      console.log('❌ Buy failed:', result?.message);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}
```

### Market Sell on Solana

```typescript
async function sellTokenOnSolana() {
  const sdk = createSDK('https://trade-api.gemach.io/v1', {
    apiKey: 'your-api-key'
  });
  
  const userAddress = '0xYourAddress';
  const privateKey = 'your-private-key';
  const tokenAddress = 'SolanaTokenAddress';
  
  // Sell 1 SOL worth
  const amount = '1000000000'; // 1 SOL (9 decimals)
  
  try {
    const result = await sdk.trading.sell(
      userAddress,
      amount,
      tokenAddress,
      622112261, // Solana chainId
      privateKey
    );
    
    if (result?.isSuccess) {
      console.log('✅ Sell successful!');
      console.log('Transaction signature:', result.hash);
    } else {
      console.log('❌ Sell failed:', result?.message);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}
```

## Limit Orders

### Create Limit Buy Order

```typescript
async function createLimitBuyOrder() {
  const sdk = createSDK('https://trade-api.gemach.io/v1', {
    apiKey: 'your-api-key'
  });
  
  const userAddress = '0xYourAddress';
  const privateKey = 'your-private-key';
  const tokenAddress = '0xa0b86a33e6776a721c4e3cef6e9e1a7ed6ae6c3a';
  
  const result = await sdk.trading.createLimitBuy(
    userAddress,
    tokenAddress,
    '100000000000000000', // 0.1 ETH
    '0.001', // Limit price
    1, // Ethereum
    privateKey
  );
  
  console.log('Limit buy order created:', result);
}
```

### Manage Limit Orders

```typescript
async function manageLimitOrders() {
  const sdk = createSDK('https://trade-api.gemach.io/v1', {
    apiKey: 'your-api-key'
  });
  
  const userAddress = '0xYourAddress';
  const sessionKey = 'your-session-key';
  const privateKey = 'your-private-key';
  
  // Get all limit orders
  const orders = await sdk.trading.getOrders(
    userAddress,
    1, // Ethereum
    sessionKey
  );
  
  console.log('Active orders:', orders.length);
  
  // Update first order if exists
  if (orders.length > 0) {
    const updatedOrder = await sdk.trading.updateOrder(
      userAddress,
      orders[0].id,
      '0.0015', // New price
      1,
      privateKey
    );
    
    console.log('Order updated:', updatedOrder);
  }
}
```

## Copy Trading

### Set Up Solana Copy Trade

```typescript
async function setupSolanaCopyTrade() {
  const sdk = createSDK('https://trade-api.gemach.io/v1', {
    apiKey: 'your-api-key'
  });
  
  const userAddress = '0xYourAddress';
  const privateKey = 'your-private-key';
  
  // First, get top traders
  const topTraders = await sdk.copyTrade.getTopTraders();
  console.log('Top 5 traders:', topTraders.slice(0, 5));
  
  // Select a trader to copy
  const targetTrader = topTraders[0].address;
  
  // Create copy trade
  const result = await sdk.copyTrade.createCopyTrade(
    userAddress,
    targetTrader,
    'Solana Top Trader',
    '20', // gas price
    1, // fixed amount mode
    '1000000000', // 1 SOL per trade
    false, // don't buy existing
    '10', // 10% stop loss
    '25', // 25% take profit
    true, // copy sells
    [], // no excluded DEXes
    622112261, // Solana
    privateKey
  );
  
  if (result?.isSuccess) {
    console.log('✅ Copy trade created successfully!');
  }
}
```

### Monitor and Update Copy Trades

```typescript
async function monitorCopyTrades() {
  const sdk = createSDK('https://trade-api.gemach.io/v1', {
    apiKey: 'your-api-key'
  });
  
  const userAddress = '0xYourAddress';
  const sessionKey = 'your-session-key';
  const privateKey = 'your-private-key';
  
  // Get all copy trades
  const copyTrades = await sdk.copyTrade.getCopyTradeList(
    userAddress,
    sessionKey,
    622112261 // Solana
  );
  
  console.log('Active copy trades:', copyTrades.length);
  
  // Update copy trade settings
  if (copyTrades.length > 0) {
    const ct = copyTrades[0];
    
    const updated = await sdk.copyTrade.updateCopyTrade(
      userAddress,
      ct.id,
      ct.targetAddress,
      ct.name,
      '25', // increase gas price
      1,
      '1500000000', // increase to 1.5 SOL
      false,
      '15', // tighter stop loss
      '30', // higher take profit
      true,
      [],
      false, // not deleting
      false, // not changing status
      622112261,
      privateKey
    );
    
    console.log('Copy trade updated:', updated);
  }
}
```

## HyperLiquid Futures

### Deposit and Start Copy Trading

```typescript
async function startHyperLiquidCopyTrade() {
  const sdk = createSDK('https://trade-api.gemach.io/v1', {
    apiKey: 'your-api-key'
  });
  
  const userAddress = '0xYourAddress';
  const privateKey = 'your-private-key';
  
  // Step 1: Deposit USDC
  console.log('Depositing 500 USDC...');
  const deposit = await sdk.hyperLiquid.hlDeposit(
    userAddress,
    '500000000', // 500 USDC (multiply by 10^6)
    privateKey
  );
  
  if (!deposit?.isSuccess) {
    console.error('Deposit failed:', deposit?.message);
    return;
  }
  
  console.log('✅ Deposit successful');
  
  // Step 2: Get top traders
  const leaderboard = await sdk.hyperLiquid.getHyperliquidLeaderboard(
    'week',
    10,
    'desc',
    'pnl'
  );
  
  console.log('Top 10 traders by weekly PnL:');
  leaderboard.forEach((trader, i) => {
    console.log(`${i + 1}. ${trader.address} - PnL: $${trader.pnl}`);
  });
  
  // Step 3: Create copy trade
  const traderWallet = leaderboard[0].address;
  
  const copyTrade = await sdk.hyperLiquid.hlCreate(
    userAddress,
    traderWallet,
    'HL Top PnL Trader',
    1, // fixed amount mode
    '100000000', // 100 USDC per position
    '10', // 10% stop loss
    '20', // 20% take profit
    false, // normal copy (not opposite)
    privateKey
  );
  
  if (copyTrade?.isSuccess) {
    console.log('✅ HyperLiquid copy trade created!');
  }
}
```

### Manage HyperLiquid Positions

```typescript
async function manageHLPositions() {
  const sdk = createSDK('https://trade-api.gemach.io/v1', {
    apiKey: 'your-api-key'
  });
  
  const userAddress = '0xYourAddress';
  const privateKey = 'your-private-key';
  
  // Close specific position
  const order = await sdk.hyperLiquid.hlPlaceOrder(
    userAddress,
    'ETH',
    false, // sell/close long
    '1', // size
    '3500', // limit price
    privateKey
  );
  
  console.log('Order placed:', order);
  
  // Or close all positions at once
  const closeAll = await sdk.hyperLiquid.hlCloseAll(
    userAddress,
    privateKey
  );
  
  console.log('All positions closed:', closeAll);
}
```

## WebSocket Real-Time Data

### Monitor Solana New Tokens

```typescript
async function monitorSolanaTokens() {
  const sdk = createSDK('https://trade-api.gemach.io/v1');
  
  console.log('🔗 Connecting to Solana WebSocket...');
  await sdk.connectWebSocketWithChain(622112261);
  
  const wsClient = sdk.getWebSocketClient();
  
  if (!wsClient) {
    console.error('Failed to connect');
    return;
  }
  
  wsClient.on('connect', (data) => {
    console.log('✅ Connected to chain:', data.chainId);
  });
  
  wsClient.on('message', (data) => {
    // New tokens
    if (data.newTokensData && data.newTokensData.length > 0) {
      console.log('\n🆕 NEW TOKENS DISCOVERED:');
      data.newTokensData.forEach(token => {
        console.log(`- ${token.symbol} (${token.name})`);
        console.log(`  Address: ${token.address}`);
        console.log(`  Price: $${token.priceUsd}`);
      });
    }
    
    // Token updates
    if (data.effectedTokensData && data.effectedTokensData.length > 0) {
      console.log('\n📊 TOKEN UPDATES:');
      data.effectedTokensData.forEach(update => {
        console.log(`- ${update.symbol}`);
        console.log(`  Price: $${update.priceUsd}`);
        console.log(`  24h Change: ${update.priceChange24h}%`);
      });
    }
  });
  
  wsClient.on('error', (error) => {
    console.error('❌ WebSocket error:', error.message);
  });
  
  wsClient.on('disconnect', (data) => {
    console.log('⚠️ Disconnected:', data.reason);
  });
  
  console.log('🎯 Monitoring Solana tokens. Press Ctrl+C to exit.');
}
```

### Multi-Chain WebSocket Monitoring

```typescript
async function monitorMultipleChains() {
  const chains = [
    { name: 'Ethereum', id: 1 },
    { name: 'Base', id: 8453 },
    { name: 'Solana', id: 622112261 }
  ];
  
  for (const chain of chains) {
    const sdk = createSDK('https://trade-api.gemach.io/v1');
    
    await sdk.connectWebSocketWithChain(chain.id);
    const wsClient = sdk.getWebSocketClient();
    
    if (wsClient) {
      wsClient.on('message', (data) => {
        if (data.newTokensData) {
          console.log(`[${chain.name}] New tokens:`, data.newTokensData.length);
        }
      });
    }
  }
}
```

## Portfolio Management

### Get Holdings and Analytics

```typescript
async function analyzePortfolio() {
  const sdk = createSDK('https://trade-api.gemach.io/v1', {
    apiKey: 'your-api-key'
  });
  
  const userAddress = '0xYourAddress';
  const sessionKey = 'your-session-key';
  
  // Get holdings across Ethereum
  const ethHoldings = await sdk.user.getHoldingsList(
    userAddress,
    sessionKey,
    1 // Ethereum
  );
  
  console.log('Ethereum Holdings:', ethHoldings.length);
  
  let totalValue = 0;
  ethHoldings.forEach(holding => {
    const value = parseFloat(holding.balance) * parseFloat(holding.priceUsd);
    totalValue += value;
    
    console.log(`${holding.symbol}: ${holding.balance}`);
    console.log(`  Value: $${value.toFixed(2)}`);
    console.log(`  24h Change: ${holding.priceChange24h}%`);
  });
  
  console.log(`\nTotal Portfolio Value: $${totalValue.toFixed(2)}`);
}
```

### Manage Watchlist

```typescript
async function manageWatchlist() {
  const sdk = createSDK('https://trade-api.gemach.io/v1', {
    apiKey: 'your-api-key'
  });
  
  const userAddress = '0xYourAddress';
  const sessionKey = 'your-session-key';
  const privateKey = 'your-private-key';
  
  // Get current watchlist
  const watchlist = await sdk.user.getWatchList(
    userAddress,
    sessionKey,
    1 // Ethereum
  );
  
  console.log('Watchlist:', watchlist);
  
  // Add new token
  const newToken = '0xa0b86a33e6776a721c4e3cef6e9e1a7ed6ae6c3a';
  const added = await sdk.user.addWatchList(
    userAddress,
    newToken,
    1,
    privateKey
  );
  
  console.log('Token added to watchlist:', added);
}
```

## Multi-Chain Operations

### Execute Same Trade on Multiple Chains

```typescript
async function multiChainTrade() {
  const sdk = createSDK('https://trade-api.gemach.io/v1', {
    apiKey: 'your-api-key'
  });
  
  const userAddress = '0xYourAddress';
  const privateKey = 'your-private-key';
  
  const chains = [
    { id: 1, name: 'Ethereum', amount: '100000000000000000' }, // 0.1 ETH
    { id: 8453, name: 'Base', amount: '100000000000000000' }, // 0.1 ETH
    { id: 56, name: 'BSC', amount: '100000000000000000' } // 0.1 BNB
  ];
  
  for (const chain of chains) {
    try {
      const result = await sdk.trading.buy(
        userAddress,
        chain.amount,
        'TOKEN_ADDRESS_ON_CHAIN',
        chain.id,
        privateKey
      );
      
      if (result?.isSuccess) {
        console.log(`✅ ${chain.name}: Success - ${result.hash}`);
      } else {
        console.log(`❌ ${chain.name}: Failed - ${result?.message}`);
      }
    } catch (error) {
      console.error(`❌ ${chain.name}: Error - ${error.message}`);
    }
  }
}
```

### Check Native Prices Across All Chains

```typescript
async function checkAllNativePrices() {
  const sdk = createSDK('https://trade-api.gemach.io/v1');
  
  const prices = await sdk.tokens.getNativePrices();
  
  console.log('Native Token Prices:');
  Object.entries(prices).forEach(([chainId, price]) => {
    console.log(`Chain ${chainId}: $${price}`);
  });
}
```