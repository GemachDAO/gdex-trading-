# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

```bash
npm run build          # TypeScript compile (tsc) → dist/
npm run dev            # Run with ts-node (no build step)
npm start              # Run compiled dist/index.js
npm test               # Run test suite (ts-node src/test-suite.ts)
npm run clean          # Remove dist/
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

## Reference Docs

The `references/` directory contains SDK API reference and code examples that are useful when extending functionality.
