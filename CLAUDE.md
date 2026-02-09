# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

```bash
npm run build               # TypeScript compile (tsc) → dist/
npm run dev                 # Run with ts-node (no build step)
npm start                   # Run compiled dist/index.js
npm test                    # Run test suite (ts-node src/test-suite.ts)
npm run clean               # Remove dist/
npm run solana:swap         # Buy & sell a Solana meme coin (pump.fun supported)
npm run solana:scan         # Real-time Solana token scanner dashboard
npm run deposit:correct 5   # Deposit 5 USDC to HyperLiquid (minimum)
npm run check:balance       # Check Arbitrum on-chain balances
npm run verify              # Verify .env configuration
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

## HyperLiquid Trading Status (CRITICAL - READ THIS!)

### What WORKS via API:
- Closing positions: `hlPlaceOrder` with `reduceOnly=true` returns `{ isSuccess: true }`
- Balance queries: `getHyperliquidUsdcBalance()`, `getHyperliquidClearinghouseState()`
- Copy trading: `hlCreate()` (opens positions indirectly)
- Close all: `hlCloseAll()`
- Withdrawals: `hlWithdraw()`

### What DOESN'T work via API:
- `hlPlaceOrder` with `reduceOnly=false` → error 102: "Now only support close position"
- `hlCreateOrder` (any params) → "Sent order failed" (broken endpoint)
- `hlDeposit()` → "Unauthorized" (use custodial flow instead)

### New @gdex/sdk (`github:TheArcadiaGroup/gdex-sdk`)
- Installed at `node_modules/@gdex/sdk/`
- Targets `https://api.gdex.io/v1` which is **NOT LIVE YET** (NXDOMAIN)
- Once live, `client.createOrder()` should support opening leveraged positions
- Different payload format (includes apiKey in encrypted payload) - incompatible with old API

## Reference Docs

The `references/` directory contains SDK API reference and code examples that are useful when extending functionality.

## HyperLiquid Deposits (CRITICAL - READ THIS!)

**IMPORTANT**: GDEX uses a **custodial wallet system** for deposits. Do NOT use `sdk.hyperLiquid.hlDeposit()` directly!

### ✅ Correct Deposit Flow (Custodial)

1. **Get your GDEX deposit address** (one-time setup per user)
2. **Send USDC to that address** on Arbitrum (standard ERC-20 transfer)
3. **GDEX processes automatically** (1-10 minutes)
4. **Funds appear in HyperLiquid** balance

### Implementation

```typescript
// 1. Authenticate
const session = await createAuthenticatedSession({
  apiUrl: config.apiUrl,
  apiKey: config.apiKey,
  walletAddress: config.walletAddress,
  privateKey: config.privateKey,
  chainId: 42161, // Arbitrum
});

// 2. Get deposit address
const userInfo = await sdk.user.getUserInfo(
  session.walletAddress,
  session.encryptedSessionKey,
  42161
);
const depositAddress = userInfo.address; // Your custodial deposit address

// 3. Send USDC (Arbitrum)
const provider = new ethers.JsonRpcProvider('https://arb1.arbitrum.io/rpc');
const wallet = new ethers.Wallet(config.privateKey, provider);
const usdc = new ethers.Contract(
  '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  ['function transfer(address to, uint256 amount) returns (bool)'],
  wallet
);

const amount = ethers.parseUnits('5', 6); // 5 USDC (minimum)
const tx = await usdc.transfer(depositAddress, amount);
await tx.wait();

// 4. Wait for GDEX to process (poll every 30 seconds)
const initialBalance = await sdk.hyperLiquid.getHyperliquidUsdcBalance(session.walletAddress);
while (true) {
  await new Promise(r => setTimeout(r, 30000));
  const balance = await sdk.hyperLiquid.getHyperliquidUsdcBalance(session.walletAddress);
  if (balance > initialBalance) {
    console.log('Deposit complete!', balance);
    break;
  }
}
```

### Quick Command

```bash
npm run deposit:correct 5  # Deposit 5 USDC (minimum)
```

This uses `src/deposit-correct-flow.ts` which implements the full flow automatically.

### Requirements

- **Minimum**: 5 USDC
- **Network**: Arbitrum (chain ID: 42161)
- **USDC Contract**: `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`
- **Gas**: ETH on Arbitrum (~$0.10-0.50)
- **Processing**: 1-10 minutes

### ❌ WRONG Method (Don't Use!)

```typescript
// DON'T USE THIS - It doesn't work!
await sdk.hyperLiquid.hlDeposit(address, tokenAddress, amount, chainId, privateKey);
```

**Why it fails:**
- Requires token approval (not handled)
- Returns "Unauthorized" or "Insufficient balance" errors
- Not the intended GDEX deposit flow

**Always use the custodial deposit flow documented above!**

See `DEPOSIT_GUIDE.md` for complete details and troubleshooting.
