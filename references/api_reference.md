# GDEX SDK API Reference

Complete reference for all GDEX SDK methods, organized by module. Matches `gdex.pro-sdk` package types.

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

### SDKOptions

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `apiKey` | string | — | API key for authentication |
| `timeout` | number | 10000 | Request timeout in ms |
| `wsURL` | string | — | WebSocket URL for real-time data |

---

## Token API (`sdk.tokens`)

### getTokens(params?)

Get paginated list of tokens.

**Parameters:**
- `params.page` (number): Page number
- `params.limit` (number): Items per page
- `params.search` (string, optional): Search query
- `params.sortBy` (`'age' | 'lastTrade' | 'marketCap'`, optional): Sort field
- `params.sortOrder` (`'asc' | 'desc'`, optional): Sort direction

**Returns:** `Promise<PaginatedResponse<Token>>`

### getToken(tokenAddressOrSearchText, chainId?, isSearchTokenAddress?)

Get token details by address or search query.

**Parameters:**
- `tokenAddressOrSearchText` (string): Token address or search text
- `chainId` (number, optional): Chain ID filter
- `isSearchTokenAddress` (boolean, optional): Whether searching by address

**Returns:** `Promise<Token | Token[]>`

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

### getNewestTokens(chainId?, page?, searchParams?, limit?)

Get newly created tokens.

**Parameters:**
- `chainId` (number, optional): Network chain ID
- `page` (number, optional): Page number
- `searchParams` (string, optional): Search parameters
- `limit` (number, optional): Items per page

**Returns:** `Promise<Token[]>`

### getXstocks()

Get xstocks tokens (special token category).

**Returns:** `Promise<Token[]>`

### getPriceHistory(address, interval?, limit?)

Get token price history/candlestick data.

**Parameters:**
- `address` (string): Token contract address
- `interval` (`'1m' | '5m' | '15m' | '1h' | '4h' | '1d'`, optional): Candle interval
- `limit` (number, optional): Number of candles

**Returns:** `Promise<Array<{ timestamp, open, high, low, close, volume }>>`

### getChartTokenPumpfun(tokenAddress, timeScale)

Get chart data for Pump.fun tokens (Solana).

**Parameters:**
- `tokenAddress` (string): Token address
- `timeScale` (number): Time interval in seconds

**Returns:** `Promise<OHLCV[]>`

### getNativePrices()

Get native token prices for all supported chains.

**Returns:** `Promise<NativePrice[] | undefined>`

Each `NativePrice` has:
- `chainId` (number): Chain identifier
- `nativePrice` (number): Price in USD

### getMetadataToken(chainId, tokenAddress)

Get token metadata.

**Parameters:**
- `chainId` (number): Network chain ID
- `tokenAddress` (string): Token address

**Returns:** `Promise<TokenMetadata | undefined>`

---

## Trading API (`sdk.trading`)

### getTrades(tokenAddress, params?)

Get trade history for a token.

**Parameters:**
- `tokenAddress` (string): Token contract address
- `params` (PaginationParams, optional): Pagination options

**Returns:** `Promise<PaginatedResponse<Trade>>`

### buy(address, amount, tokenAddress, chainId, privateKey)

Execute market buy order.

**Parameters:**
- `address` (string): User's wallet address
- `amount` (string): Amount in smallest unit (wei/lamports)
- `tokenAddress` (string): Token to buy
- `chainId` (number): Network chain ID
- `privateKey` (string): User's private key

**Returns:** `Promise<TransactionResponse | undefined>`

**Example amounts:**
- Ethereum (18 decimals): `"1000000000000000000"` = 1 ETH
- Solana (9 decimals): `"1000000000"` = 1 SOL

### sell(address, amount, tokenAddress, chainId, privateKey)

Execute market sell order.

**Parameters:** Same as `buy()`

**Returns:** `Promise<TransactionResponse | undefined>`

### getOrders(address, chainId, sessionKey)

Get user's limit orders.

**Parameters:**
- `address` (string): User's wallet address
- `chainId` (number): Network chain ID
- `sessionKey` (string): Encrypted session key

**Returns:** `Promise<OrdersResponse | undefined>`

### createLimitBuy(address, amount, triggerPrice, profitPercent, lossPercent, tokenAddress, chainId, privateKey)

Create limit buy order with take-profit and stop-loss.

**Parameters:**
- `address` (string): User's wallet address
- `amount` (string): Amount to buy
- `triggerPrice` (string): Price at which to trigger the buy
- `profitPercent` (number): Take profit percentage
- `lossPercent` (number): Stop loss percentage
- `tokenAddress` (string): Token contract address
- `chainId` (number): Network chain ID
- `privateKey` (string): User's private key

**Returns:** `Promise<LimitOrderResponse | undefined>`

### createLimitSell(address, amount, triggerPrice, tokenAddress, chainId, privateKey)

Create limit sell order.

**Parameters:**
- `address` (string): User's wallet address
- `amount` (string): Amount to sell
- `triggerPrice` (string): Price at which to trigger the sell
- `tokenAddress` (string): Token contract address
- `chainId` (number): Network chain ID
- `privateKey` (string): User's private key

**Returns:** `Promise<LimitOrderResponse | undefined>`

### updateOrder(address, orderId, amount, triggerPrice, profitPercent, lossPercent, isDelete, chainId, privateKey)

Update or delete an existing limit order.

**Parameters:**
- `address` (string): User's wallet address
- `orderId` (string): Order ID to update
- `amount` (string): New amount
- `triggerPrice` (string): New trigger price
- `profitPercent` (number): New profit percentage
- `lossPercent` (number): New loss percentage
- `isDelete` (boolean): Whether to delete the order
- `chainId` (number): Network chain ID
- `privateKey` (string): User's private key

**Returns:** `Promise<UpdateOrderResponse | undefined>`

---

## User API (`sdk.user`)

### login(address, nonce, sessionKey, signature, refCode, chainId?)

Authenticate user.

**Parameters:**
- `address` (string): Wallet address
- `nonce` (number): Nonce for signature
- `sessionKey` (string): Session key
- `signature` (string): Signed message
- `refCode` (string): Referral code
- `chainId` (number, optional): Network chain ID

**Returns:** `Promise<UserInfo | undefined>`

### getUserInfo(walletAddress, sessionKey, chainId)

Get user information.

**Parameters:**
- `walletAddress` (string): User's wallet address
- `sessionKey` (string): Session key
- `chainId` (number): Network chain ID

**Returns:** `Promise<UserInfo | undefined>`

### getHoldingsList(address, chainId, sessionKey)

Get user's token holdings.

**Parameters:**
- `address` (string): User's wallet address
- `chainId` (number): Network chain ID
- `sessionKey` (string): Session key

**Returns:** `Promise<Holding[]>`

> **Note:** Parameter order is `(address, chainId, sessionKey)` — chainId comes before sessionKey.

### saveUserSettings(address, settings, privateKey)

Update user trading settings.

**Parameters:**
- `address` (string): User's wallet address
- `settings.quickBuySlippage` (number): Slippage tolerance for quick buy
- `settings.quickSellSlippage` (number): Slippage tolerance for quick sell
- `settings.buyPriorityFee` (string): Priority fee for buy transactions
- `settings.sellPriorityFee` (string): Priority fee for sell transactions
- `privateKey` (string): User's private key

**Returns:** `Promise<TransactionResponse | undefined>`

### transfer(address, to, amount, chainId, privateKey)

Transfer native tokens (ETH, SOL, etc.) to another address.

**Parameters:**
- `address` (string): User's wallet address
- `to` (string): Recipient address
- `amount` (string): Amount to transfer
- `chainId` (number | undefined): Chain ID
- `privateKey` (string): Private key

**Returns:** `Promise<TransactionResponse | undefined>`

### transferToken(address, to, amount, tokenAddress, chainId, privateKey)

Transfer ERC20/SPL tokens to another address.

**Parameters:**
- `address` (string): User's wallet address
- `to` (string): Recipient address
- `amount` (string): Amount to transfer
- `tokenAddress` (string): Token contract address
- `chainId` (number): Chain ID
- `privateKey` (string): Private key

**Returns:** `Promise<TransactionResponse | undefined>`

### getWatchList(address, chainId)

Get user's watchlist.

**Parameters:**
- `address` (string): User's wallet address
- `chainId` (number): Network chain ID

**Returns:** `Promise<WatchListResponse | undefined>`

### addWatchList(address, tokenAddress, isAdded, chainId, privateKey)

Add or remove token from watchlist.

**Parameters:**
- `address` (string): User's wallet address
- `tokenAddress` (string): Token address
- `isAdded` (boolean): `true` to add, `false` to remove
- `chainId` (number): Network chain ID
- `privateKey` (string): User's private key

**Returns:** `Promise<{ isSuccess: boolean, message: string } | undefined>`

### importToken(address, tokenAddress, chainId, privateKey)

Import a custom token to user's holding list.

**Parameters:**
- `address` (string): User's wallet address
- `tokenAddress` (string): Token contract address
- `chainId` (number): Chain ID
- `privateKey` (string): Private key

**Returns:** `Promise<{ isSuccess: boolean, message: string } | undefined>`

### getReferralStats(address, chainId)

Get referral statistics.

**Parameters:**
- `address` (string): User's wallet address
- `chainId` (number): Chain ID

**Returns:** `Promise<ReferralStats | undefined>`

### claim(address, chainId, privateKey)

Claim referral rewards.

**Parameters:**
- `address` (string): User's wallet address
- `chainId` (number): Chain ID
- `privateKey` (string): Private key

**Returns:** `Promise<{ isSuccess: boolean, message: string } | undefined>`

---

## Copy Trade API (`sdk.copyTrade`)

### createCopyTrade(address, targetAddress, targetAddressName, gasPrice, buyMode, copyBuyAmount, isBuyExistingToken, lossPercent, profitPercent, copySell, excludedDexNumbers, chainId, privateKey)

Create new copy trade configuration.

**Parameters:**
- `address` (string): Your wallet address
- `targetAddress` (string): Trader to copy
- `targetAddressName` (string): Name for the target trader
- `gasPrice` (string): Gas price / priority fee
- `buyMode` (number): 1=fixed amount, 2=percentage
- `copyBuyAmount` (string): Amount or percentage (multiply by decimals if fixed amount mode)
- `isBuyExistingToken` (boolean): Buy existing tokens
- `lossPercent` (string): Stop loss percentage
- `profitPercent` (string): Take profit percentage
- `copySell` (boolean): Copy sell orders
- `excludedDexNumbers` (number[]): DEX numbers to exclude
- `chainId` (number): Network chain ID
- `privateKey` (string): Your private key

**Returns:** `Promise<{ isSuccess: boolean, message: string } | undefined>`

> **Note:** Currently fully supported on Solana (chainId: 622112261)

### updateCopyTrade(address, targetAddress, targetAddressName, gasPrice, buyMode, copyBuyAmount, isBuyExistingToken, lossPercent, profitPercent, isDelete, isChangeStatus, copyTradeId, copySell, excludedDexNumbers, chainId, privateKey)

Update existing copy trade.

**Parameters:** Same as `createCopyTrade()` plus:
- `isDelete` (boolean): Delete this copy trade (param 10)
- `isChangeStatus` (boolean): Change active status (param 11)
- `copyTradeId` (string): ID of copy trade to update (param 12)

> **Note:** Parameter order differs from `createCopyTrade` — `isDelete`, `isChangeStatus`, and `copyTradeId` are inserted before `copySell`.

**Returns:** `Promise<{ isSuccess: boolean, message: string } | undefined>`

### getCopyTradeList(address, sessionKey)

Get user's copy trades.

**Parameters:**
- `address` (string): User's wallet address
- `sessionKey` (string): Session key

**Returns:** `Promise<CopyTradeListResponse | undefined>`

> **Note:** No `chainId` parameter.

### getTxList(address, sessionKey)

Get copy trade transaction history.

**Parameters:**
- `address` (string): User's wallet address
- `sessionKey` (string): Session key

**Returns:** `Promise<CopyTradeTxList[] | undefined>`

### getTopTraders(chainId, tag?)

Get list of top traders to copy.

**Parameters:**
- `chainId` (number): Network chain ID
- `tag` (string, optional): Tag filter

**Returns:** `Promise<TopTrader[] | undefined>`

### getDexList(chainId)

Get list of available DEXes for copy trading.

**Parameters:**
- `chainId` (number): Network chain ID

**Returns:** `Promise<DexCopyTrade[] | undefined>`

---

## HyperLiquid API (`sdk.hyperLiquid`)

### hlCreate(address, traderWallet, copyTradeName, copyMode, fixedAmountCostPerOrder, lossPercent, profitPercent, oppositeCopy, privateKey)

Create HyperLiquid copy trade.

**Parameters:**
- `address` (string): Your wallet address
- `traderWallet` (string): Trader to copy
- `copyTradeName` (string): Name for this copy trade
- `copyMode` (number): 1=fixed amount, 2=proportion
- `fixedAmountCostPerOrder` (string): Amount per order (mode 1) or percentage (mode 2)
- `lossPercent` (string): Stop loss %
- `profitPercent` (string): Take profit %
- `oppositeCopy` (boolean): Copy opposite direction
- `privateKey` (string): Your private key

**Returns:** `Promise<HLResponse>`

### hlUpdate(address, traderWallet, copyTradeName, copyMode, fixedAmountCostPerOrder, lossPercent, profitPercent, copyTradeId, oppositeCopy, privateKey, isDelete?, isChangeStatus?)

Update HyperLiquid copy trade.

**Parameters:** Same as `hlCreate()` plus:
- `copyTradeId` (string): ID of copy trade to update (param 8)
- `isDelete` (boolean, optional): Delete the copy trade
- `isChangeStatus` (boolean, optional): Change active status

**Returns:** `Promise<HLResponse>`

### hlDeposit(address, tokenAddress, amount, chainId, privateKey)

Deposit funds to HyperLiquid.

**Parameters:**
- `address` (string): Your wallet address
- `tokenAddress` (string): Token contract address (e.g., USDC on Arbitrum)
- `amount` (string): Amount in token's smallest unit
- `chainId` (number): Chain ID (Arbitrum: 42161)
- `privateKey` (string): Your private key

**Returns:** `Promise<{ isSuccess: boolean, message: string } | undefined>`

### hlWithdraw(address, amount, privateKey)

Withdraw USDC from HyperLiquid.

**Parameters:**
- `address` (string): Your wallet address
- `amount` (string): USDC amount — do NOT multiply by decimals
- `privateKey` (string): Your private key

**Returns:** `Promise<{ isSuccess: boolean, message: string } | undefined>`

### hlPlaceOrder(address, coin, isLong, price, size, reduceOnly, privateKey)

Place an order on HyperLiquid.

**Parameters:**
- `address` (string): Your wallet address
- `coin` (string): Coin symbol (e.g., `"ETH"`, `"BTC"`)
- `isLong` (boolean): `true` for long/buy, `false` for short/sell
- `price` (string): Limit price
- `size` (string): Position size
- `reduceOnly` (boolean | undefined): `true` to only reduce existing positions
- `privateKey` (string): Your private key

**Returns:** `Promise<{ isSuccess: boolean, message: string } | undefined>`

**Position Closing Strategy:**
- To close a LONG: set `isLong=false`, `reduceOnly=true`
- To close a SHORT: set `isLong=true`, `reduceOnly=true`
- To open a new position: set `reduceOnly=false`

### hlCreateOrder(address, coin, isLong, price, size, tpPrice, slPrice, reduceOnly, isMarket, privateKey)

Create advanced order with Take Profit and Stop Loss.

**Parameters:**
- `address` (string): User wallet address
- `coin` (string): Trading pair symbol
- `isLong` (boolean): Direction
- `price` (string): Order price (ignored if `isMarket=true`)
- `size` (string): Order size
- `tpPrice` (string): Take profit price (`"0"` or `""` to skip)
- `slPrice` (string): Stop loss price (`"0"` or `""` to skip)
- `reduceOnly` (boolean | undefined): Reduce-only order
- `isMarket` (boolean | undefined): Market order (immediate execution)
- `privateKey` (string): Private key

**Returns:** `Promise<{ isSuccess: boolean, message: string } | undefined>`

### hlCloseAll(address, privateKey)

Close all open positions.

**Parameters:**
- `address` (string): Your wallet address
- `privateKey` (string): Your private key

**Returns:** `Promise<{ isSuccess: boolean, message: string } | undefined>`

### hlCancelOrder(address, coin, orderId, privateKey)

Cancel a specific order.

**Parameters:**
- `address` (string): User wallet address
- `coin` (string): Trading pair symbol
- `orderId` (string): Order ID to cancel
- `privateKey` (string): Private key

**Returns:** `Promise<{ isSuccess: boolean, message: string } | undefined>`

### hlCancelAllOrders(address, privateKey)

Cancel all open orders.

**Parameters:**
- `address` (string): User wallet address
- `privateKey` (string): Private key

**Returns:** `Promise<{ isSuccess: boolean, message: string } | undefined>`

### getCopyTradeListFutures(address, sessionKey)

Get HyperLiquid copy trades.

**Parameters:**
- `address` (string): User's wallet address
- `sessionKey` (string): Session key

**Returns:** `Promise<CopyTradelistFutures[] | undefined>`

### getGbotUsdcBalance(address)

Get USDC balance for a user on HyperLiquid (via backend).

**Parameters:**
- `address` (string): User wallet address

**Returns:** `Promise<number>`

### getHyperliquidUsdcBalance(gbotAddress)

Get user's USDC balance on HyperLiquid (via SDK).

**Parameters:**
- `gbotAddress` (string): User wallet address

**Returns:** `Promise<number | undefined>`

### getHyperliquidWithdrawableBalance(gbotAddress)

Get user's withdrawable USDC balance.

**Parameters:**
- `gbotAddress` (string): User wallet address

**Returns:** `Promise<number | undefined>`

### getHyperliquidClearinghouseState(gbotAddress)

Get clearinghouse state with positions and balances.

**Parameters:**
- `gbotAddress` (string): User wallet address

**Returns:** `Promise<PerpsClearinghouseState | undefined>`

### getHyperliquidUserStats(gbotAddress)

Get user statistics (PnL, volume, trading metrics, positions, open orders).

**Parameters:**
- `gbotAddress` (string): User wallet address

**Returns:** `Promise<HyperLiquidUserStats | undefined>`

### getHyperliquidTradeHistory(address, sessionKey, getFromApi?, page?, limit?, filterByTrader?)

Get trade history with pagination.

**Parameters:**
- `address` (string): User wallet address
- `sessionKey` (string): Session key
- `getFromApi` (boolean, optional): Fetch from backend instead of HL SDK
- `page` (number, optional): Page number (default: 1)
- `limit` (number, optional): Records per page (default: 50, max: 500)
- `filterByTrader` (string, optional): Filter by trader name (only when `getFromApi=true`)

**Returns:** `Promise<{ fills, pagination } | undefined>`

### getHyperliquidOpenOrders(gbotAddress)

Get open orders.

**Parameters:**
- `gbotAddress` (string): User wallet address

**Returns:** `Promise<FrontendOrder[] | undefined>`

### getHyperliquidHistoricalOrders(gbotAddress)

Get historical orders.

**Parameters:**
- `gbotAddress` (string): User wallet address

**Returns:** `Promise<OrderStatus<FrontendOrder>[] | undefined>`

### getHyperliquidMarkPrice(coin)

Get mark price for a specific coin.

**Parameters:**
- `coin` (string): Trading pair symbol (e.g., `"BTC"`)

**Returns:** `Promise<number>`

### getMultipleHyperliquidMarkPrices(coins)

Get mark prices for multiple coins at once.

**Parameters:**
- `coins` (string[]): Array of trading pair symbols

**Returns:** `Promise<Record<string, number>>`

### getHyperliquidLeaderboard(timeWindow?, topN?, sortOrder?, sortBy?)

Get HyperLiquid leaderboard.

**Parameters:**
- `timeWindow` (`'day' | 'week' | 'month' | 'allTime'`, optional): Time window (default: `'allTime'`)
- `topN` (number, optional): Max results
- `sortOrder` (`'asc' | 'desc'`, optional): Sort direction (default: `'desc'`)
- `sortBy` (`'pnl' | 'accountValue' | 'volume' | 'roi'`, optional): Sort field (default: `'pnl'`)

**Returns:** `Promise<HyperLiquidLeaderboard[]>`

---

## WebSocket Client

### connectWebSocket()

Connect to default WebSocket.

**Returns:** `Promise<void>`

### connectWebSocketWithChain(chainId, options?)

Connect to chain-specific WebSocket.

**Parameters:**
- `chainId` (number): Network chain ID
- `options.autoReconnect` (boolean, optional): Auto-reconnect on disconnect
- `options.maxReconnectAttempts` (number, optional): Max reconnect attempts
- `options.reconnectInterval` (number, optional): Reconnect interval in ms

**Returns:** `Promise<void>`

**WebSocket URLs:**
- Ethereum (1): `wss://trade-ws-1.gemach.io`
- Base (8453): `wss://trade-ws-8453.gemach.io`
- BSC (56): `wss://trade-ws-56.gemach.io`
- Solana (622112261): `wss://trade-ws-622112261.gemach.io`

### subscribeToToken(chainId, tokenAddress, channels?)

Subscribe to real-time token data.

**Parameters:**
- `chainId` (number): Chain ID
- `tokenAddress` (string): Token address to monitor
- `channels` (`('price' | 'trades' | 'orderbook')[]`, optional): Data channels

**Returns:** `Promise<void>`

### getWebSocketClient()

Get WebSocket client instance.

**Returns:** `WebSocketClient | undefined`

### isWebSocketConnected()

Check WebSocket connection status.

**Returns:** `boolean`

### disconnect()

Disconnect WebSocket and cleanup.

**Returns:** `void`

### getSupportedChainIds()

Get supported chain IDs for WebSocket connections.

**Returns:** `number[]`

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
  if (data.newTokensData) {
    data.newTokensData.forEach(token => {
      console.log('New token:', token);
    });
  }
  if (data.effectedTokensData) {
    data.effectedTokensData.forEach(update => {
      console.log('Updated:', update);
    });
  }
});
```

---

## Crypto Utilities

```typescript
import { CryptoUtils } from 'gdex.pro-sdk';
```

### sign(message, privateKey)

Sign message with private key.

**Parameters:**
- `message` (string): Message to sign
- `privateKey` (string): Private key

**Returns:** `string`

### encrypt(text, apiKey?)

Encrypt text (optionally with API key).

**Parameters:**
- `text` (string): Text to encrypt
- `apiKey` (string, optional): API key

**Returns:** `string`

### getSessionKey()

Generate a new session key pair.

**Returns:** `{ privateKey: Buffer, publicKey: Uint8Array }`

### generateUniqueNumber()

Generate a unique number (for nonces, etc.).

**Returns:** `number`

### getDataToSendApi(userId, data, signature, apiKey?)

Prepare signed data for API requests.

**Parameters:**
- `userId` (string): User identifier
- `data` (any): Data payload
- `signature` (string): Signature
- `apiKey` (string, optional): API key

**Returns:** `string`

### encodeInputData(type, input)

Encode input data for various transaction types.

**Parameters:**
- `type` (string): Transaction type (`'purchase'`, `'sell'`, `'transfer'`, `'limit_buy'`, `'create_copy_trade'`, `'hl_create'`, etc.)
- `input` (object): Input data matching the transaction type

**Returns:** `string`

### encryptWsMessage(topics?, apiKey?)

Encrypt WebSocket subscription message.

**Parameters:**
- `topics` (string, optional): Topics to subscribe to
- `apiKey` (string, optional): API key

**Returns:** `string`
