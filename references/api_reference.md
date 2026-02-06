# GDEX SDK API Reference

Complete reference for all GDEX SDK methods, organized by module.

## SDK Initialization

```typescript
import { createSDK, GDEXSDK } from 'gdex.pro-sdk';

// Option 1: Factory function (recommended)
const sdk = createSDK('https://trade-api.gemach.io/v1', {
  apiKey: 'optional-api-key',
  timeout: 10000
});

// Option 2: Direct instantiation
const sdk = new GDEXSDK('https://trade-api.gemach.io/v1', {
  apiKey: 'optional-api-key',
  timeout: 30000
});
```

## Token API (sdk.tokens)

### getTokens(options)
Get paginated list of tokens.

**Parameters:**
- `options.page` (number): Page number
- `options.limit` (number): Items per page
- `options.search` (string, optional): Search query
- `options.sortBy` (string, optional): Sort field
- `options.sortOrder` ('asc' | 'desc', optional): Sort direction

**Returns:** `Promise<Token[]>`

### getToken(address)
Get detailed token information.

**Parameters:**
- `address` (string): Token contract address

**Returns:** `Promise<Token>`

### searchTokens(query, limit?)
Search tokens by name or symbol.

**Parameters:**
- `query` (string): Search term
- `limit` (number, optional): Max results (default: 10)

**Returns:** `Promise<Token[]>`

### getTrendingTokens(limit?)
Get trending tokens ranked by activity.

**Parameters:**
- `limit` (number, optional): Max results (default: 50)

**Returns:** `Promise<Token[]>`

### getNewestTokens(chainId, page, search, limit)
Get newly created tokens.

**Parameters:**
- `chainId` (number): Network chain ID
- `page` (number): Page number
- `search` (string): Search query
- `limit` (number): Items per page

**Returns:** `Promise<Token[]>`

### getChartTokenPumpfun(address, timeScale)
Get chart data for Pump.fun tokens (Solana).

**Parameters:**
- `address` (string): Token address
- `timeScale` (number): Time interval in seconds

**Returns:** `Promise<ChartData>`

### getNativePrices()
Get native token prices for all supported chains.

**Returns:** `Promise<NativePrices>`

### getMetadataToken(chainId, address)
Get token metadata (image, name, symbol).

**Parameters:**
- `chainId` (number): Network chain ID
- `address` (string): Token address

**Returns:** `Promise<TokenMetadata>`

## Trading API (sdk.trading)

### getTrades(tokenAddress, options)
Get trade history for a token.

**Parameters:**
- `tokenAddress` (string): Token contract address
- `options.page` (number): Page number
- `options.limit` (number): Items per page

**Returns:** `Promise<Trade[]>`

### buy(userAddress, amount, tokenAddress, chainId, privateKey)
Execute market buy order.

**Parameters:**
- `userAddress` (string): User's wallet address
- `amount` (string): Amount in wei (multiply by 10^decimals)
- `tokenAddress` (string): Token to buy
- `chainId` (number): Network chain ID
- `privateKey` (string): User's private key

**Returns:** `Promise<TransactionResult>`

**Example amounts:**
- Ethereum (18 decimals): "1000000000000000000" = 1 ETH
- Solana (9 decimals): "1000000000" = 1 SOL

### sell(userAddress, amount, tokenAddress, chainId, privateKey)
Execute market sell order.

**Parameters:** Same as buy()

**Returns:** `Promise<TransactionResult>`

### getOrders(userAddress, chainId, sessionKey)
Get user's limit orders.

**Parameters:**
- `userAddress` (string): User's wallet address
- `chainId` (number): Network chain ID
- `sessionKey` (string): Encrypted session key

**Returns:** `Promise<Order[]>`

### createLimitBuy(userAddress, tokenAddress, amount, price, chainId, privateKey)
Create limit buy order.

**Parameters:**
- `userAddress` (string): User's wallet address
- `tokenAddress` (string): Token to buy
- `amount` (string): Amount in wei
- `price` (string): Limit price
- `chainId` (number): Network chain ID
- `privateKey` (string): User's private key

**Returns:** `Promise<OrderResult>`

### createLimitSell(userAddress, tokenAddress, amount, price, chainId, privateKey)
Create limit sell order.

**Parameters:** Same as createLimitBuy()

**Returns:** `Promise<OrderResult>`

### updateOrder(userAddress, orderId, newPrice, chainId, privateKey)
Update existing limit order.

**Parameters:**
- `userAddress` (string): User's wallet address
- `orderId` (string): Order ID to update
- `newPrice` (string): New limit price
- `chainId` (number): Network chain ID
- `privateKey` (string): User's private key

**Returns:** `Promise<OrderResult>`

## User API (sdk.user)

### login(address, nonce, sessionKey, signature, referralCode, chainId)
Authenticate user.

**Parameters:**
- `address` (string): Wallet address
- `nonce` (number): Nonce for signature
- `sessionKey` (string): Session key
- `signature` (string): Signed message
- `referralCode` (string): Referral code (optional)
- `chainId` (number): Network chain ID

**Returns:** `Promise<LoginResult>`

### getUserInfo(address, sessionKey, chainId)
Get user information.

**Parameters:**
- `address` (string): User's wallet address
- `sessionKey` (string): Session key
- `chainId` (number): Network chain ID

**Returns:** `Promise<UserInfo>`

### getHoldingsList(address, sessionKey, chainId)
Get user's token holdings.

**Parameters:**
- `address` (string): User's wallet address
- `sessionKey` (string): Session key
- `chainId` (number): Network chain ID

**Returns:** `Promise<Holding[]>`

### getWatchList(address, sessionKey, chainId)
Get user's watchlist.

**Parameters:**
- `address` (string): User's wallet address
- `sessionKey` (string): Session key
- `chainId` (number): Network chain ID

**Returns:** `Promise<WatchlistItem[]>`

### addWatchList(userAddress, tokenAddress, chainId, privateKey)
Add token to watchlist.

**Parameters:**
- `userAddress` (string): User's wallet address
- `tokenAddress` (string): Token to add
- `chainId` (number): Network chain ID
- `privateKey` (string): User's private key

**Returns:** `Promise<Result>`

### saveUserSettings(userAddress, quickBuyAmount, autoBuy, chainId, privateKey)
Update user settings.

**Parameters:**
- `userAddress` (string): User's wallet address
- `quickBuyAmount` (string): Quick buy amount
- `autoBuy` (boolean): Auto-buy enabled
- `chainId` (number): Network chain ID
- `privateKey` (string): User's private key

**Returns:** `Promise<Result>`

## Copy Trade API (sdk.copyTrade)

### createCopyTrade(userAddress, targetAddress, name, gasPrice, buyMode, copyAmount, buyExisting, lossPercent, profitPercent, copySell, excludedDexes, chainId, privateKey)
Create new copy trade configuration.

**Parameters:**
- `userAddress` (string): Your wallet address
- `targetAddress` (string): Trader to copy
- `name` (string): Name for this copy trade
- `gasPrice` (string): Gas price setting
- `buyMode` (number): 1=fixed amount, 2=percentage
- `copyAmount` (string): Amount to copy (in wei/lamports)
- `buyExisting` (boolean): Buy existing tokens
- `lossPercent` (string): Stop loss percentage
- `profitPercent` (string): Take profit percentage
- `copySell` (boolean): Copy sell orders
- `excludedDexes` (number[]): DEX numbers to exclude
- `chainId` (number): Network chain ID
- `privateKey` (string): Your private key

**Returns:** `Promise<CopyTradeResult>`

**Important:** Currently only fully supported on Solana (chainId: 622112261)

### updateCopyTrade(userAddress, copyTradeId, targetAddress, name, gasPrice, buyMode, copyAmount, buyExisting, lossPercent, profitPercent, copySell, excludedDexes, isDelete, isChangeStatus, chainId, privateKey)
Update existing copy trade.

**Parameters:** Same as createCopyTrade() plus:
- `copyTradeId` (string): ID of copy trade to update
- `isDelete` (boolean): Delete this copy trade
- `isChangeStatus` (boolean): Change active status

**Returns:** `Promise<CopyTradeResult>`

### getCopyTradeList(address, sessionKey, chainId)
Get user's copy trades.

**Parameters:**
- `address` (string): User's wallet address
- `sessionKey` (string): Session key
- `chainId` (number): Network chain ID

**Returns:** `Promise<CopyTrade[]>`

### getTopTraders()
Get list of top traders to copy.

**Returns:** `Promise<TopTrader[]>`

## HyperLiquid API (sdk.hyperLiquid)

### hlCreate(userAddress, traderWallet, name, copyMode, amountPerOrder, lossPercent, profitPercent, oppositeCopy, privateKey)
Create HyperLiquid copy trade.

**Parameters:**
- `userAddress` (string): Your wallet address
- `traderWallet` (string): Trader to copy
- `name` (string): Copy trade name
- `copyMode` (number): 1=fixed, 2=proportion
- `amountPerOrder` (string): USDC amount (multiply by 10^6), if copyMode=2 set ""
- `lossPercent` (string): Stop loss %
- `profitPercent` (string): Take profit %
- `oppositeCopy` (boolean): Copy opposite positions
- `privateKey` (string): Your private key

**Returns:** `Promise<HLResult>`

### hlUpdate(userAddress, traderWallet, name, copyMode, amountPerOrder, lossPercent, profitPercent, copyTradeId, oppositeCopy, privateKey, isDelete, isChangeStatus)
Update HyperLiquid copy trade.

**Parameters:** Same as hlCreate() plus:
- `copyTradeId` (string): ID to update
- `isDelete` (boolean): Delete this copy trade
- `isChangeStatus` (boolean): Change active status

**Returns:** `Promise<HLResult>`

### hlDeposit(address, amount, privateKey)
Deposit USDC to HyperLiquid.

**Parameters:**
- `address` (string): Your wallet address
- `amount` (string): USDC amount (multiply by 10^6)
- `privateKey` (string): Your private key

**Returns:** `Promise<DepositResult>`

**Example:** For 100 USDC: amount = "100000000"

### hlWithdraw(address, amount, privateKey)
Withdraw USDC from HyperLiquid.

**Parameters:**
- `address` (string): Your wallet address
- `amount` (string): USDC amount (NO decimal multiplication needed)
- `privateKey` (string): Your private key

**Returns:** `Promise<WithdrawResult>`

**Example:** For 100 USDC: amount = "100"

### hlPlaceOrder(address, coin, isBuy, size, price, privateKey)
Place order to close position.

**Parameters:**
- `address` (string): Your wallet address
- `coin` (string): Coin symbol (e.g., "ETH")
- `isBuy` (boolean): Buy or sell
- `size` (string): Position size
- `price` (string): Order price
- `privateKey` (string): Your private key

**Returns:** `Promise<OrderResult>`

### hlCloseAll(address, privateKey)
Close all open positions.

**Parameters:**
- `address` (string): Your wallet address
- `privateKey` (string): Your private key

**Returns:** `Promise<CloseAllResult>`

### getHyperliquidLeaderboard(period?, limit?, sortOrder?, sortBy?)
Get HyperLiquid leaderboard.

**Parameters:**
- `period` (string, optional): 'day' | 'week' | 'month' | 'allTime' (default: 'allTime')
- `limit` (number, optional): Max results (default: 10)
- `sortOrder` ('asc' | 'desc', optional): Sort direction (default: 'desc')
- `sortBy` ('pnl' | 'accountValue', optional): Sort field (default: 'pnl')

**Returns:** `Promise<LeaderboardEntry[]>`

### getCopyTradeList(address, sessionKey)
Get HyperLiquid copy trades.

**Parameters:**
- `address` (string): User's wallet address
- `sessionKey` (string): Session key

**Returns:** `Promise<HLCopyTrade[]>`

## WebSocket Client

### connectWebSocket()
Connect to default WebSocket.

**Returns:** `Promise<void>`

### connectWebSocketWithChain(chainId)
Connect to chain-specific WebSocket.

**Parameters:**
- `chainId` (number): Network chain ID

**Returns:** `Promise<void>`

**WebSocket URLs:**
- Ethereum (1): wss://trade-ws-1.gemach.io
- Base (8453): wss://trade-ws-8453.gemach.io
- BSC (56): wss://trade-ws-56.gemach.io
- Solana (622112261): wss://trade-ws-622112261.gemach.io
- And others...

### getWebSocketClient()
Get WebSocket client instance.

**Returns:** `WebSocketClient | null`

### isWebSocketConnected()
Check WebSocket connection status.

**Returns:** `boolean`

### disconnect()
Disconnect WebSocket.

**Returns:** `void`

### WebSocket Events

```typescript
const wsClient = sdk.getWebSocketClient();

// Connection events
wsClient.on('connect', (data) => {
  console.log('Connected to chain:', data.chainId);
});

wsClient.on('disconnect', (data) => {
  console.log('Disconnected:', data.reason);
});

wsClient.on('error', (error) => {
  console.error('Error:', error.message);
});

// Data events
wsClient.on('message', (data) => {
  // New tokens discovered
  if (data.newTokensData) {
    data.newTokensData.forEach(token => {
      console.log('New token:', token);
    });
  }
  
  // Token updates
  if (data.effectedTokensData) {
    data.effectedTokensData.forEach(update => {
      console.log('Updated:', update);
    });
  }
});
```

## Crypto Utilities (CryptoUtils)

```typescript
import { CryptoUtils } from 'gdex.pro-sdk';
```

### isValidAddress(address)
Validate Ethereum address.

**Parameters:**
- `address` (string): Address to validate

**Returns:** `boolean`

### toChecksumAddress(address)
Convert to checksum address.

**Parameters:**
- `address` (string): Address to convert

**Returns:** `string`

### shortenAddress(address, chars?)
Shorten address for display.

**Parameters:**
- `address` (string): Address to shorten
- `chars` (number, optional): Characters to show (default: 4)

**Returns:** `string`

**Example:** "0x1234...7890"

### formatTokenAmount(amount, decimals)
Format token amount from wei.

**Parameters:**
- `amount` (string): Amount in wei
- `decimals` (number): Token decimals

**Returns:** `string`

### formatCurrency(amount)
Format as USD currency.

**Parameters:**
- `amount` (number): Amount to format

**Returns:** `string`

**Example:** "$1,234,567.89"

### formatPercentage(value)
Format as percentage.

**Parameters:**
- `value` (number): Percentage value

**Returns:** `string`

**Example:** "25.50%"

### formatLargeNumber(value)
Format large numbers (K, M, B).

**Parameters:**
- `value` (number): Number to format

**Returns:** `string`

**Example:** "1.23M"

### generateRandomWallet()
Generate new random wallet.

**Returns:** `{ address: string, privateKey: string }`

### createWalletFromPrivateKey(privateKey)
Create wallet from private key.

**Parameters:**
- `privateKey` (string): Private key

**Returns:** `Wallet`

### sign(message, privateKey)
Sign message with private key.

**Parameters:**
- `message` (string): Message to sign
- `privateKey` (string): Private key

**Returns:** `string`

### verifySignature(message, signature, address)
Verify message signature.

**Parameters:**
- `message` (string): Original message
- `signature` (string): Signature to verify
- `address` (string): Signer's address

**Returns:** `boolean`