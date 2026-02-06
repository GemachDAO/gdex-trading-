# GDEX Trading Bot

A trading bot built on the [GDEX](https://gdex.pro) decentralized exchange SDK (`gdex.pro-sdk`). Supports multi-chain token trading, copy trading, HyperLiquid futures, and real-time WebSocket market data.

## Supported Chains

| Network | Chain ID | Copy Trading |
|---------|----------|--------------|
| Ethereum | 1 | Coming Soon |
| Base | 8453 | Coming Soon |
| BSC | 56 | Coming Soon |
| **Solana** | **622112261** | **Supported** |
| Sonic | 146 | Coming Soon |
| Sui | 1313131213 | Coming Soon |
| Nibiru | 6900 | Coming Soon |
| Berachain | 80094 | Coming Soon |
| Optimism | 10 | Coming Soon |
| Arbitrum | 42161 | Coming Soon |
| Fraxtal | 252 | Coming Soon |

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in your values:

- `WALLET_ADDRESS` — EVM wallet address (`0x`-prefixed, required even for Solana)
- `PRIVATE_KEY` — EVM private key (used only for login signing)
- `GDEX_API_KEY` — API key (may be comma-separated; first key is used)
- `DEFAULT_CHAIN_ID` — defaults to Solana (`622112261`)

### 3. Run

```bash
# Development (ts-node, no build step)
npm run dev

# Run test suite
npm test

# Production
npm run build
npm start
```

## Authentication Architecture

The SDK uses **EVM (secp256k1) signing for ALL chains**, including Solana. You must always use an EVM wallet.

The `createAuthenticatedSession()` helper handles the full login flow in one call:

```typescript
import { createAuthenticatedSession, buyToken, formatSolAmount } from 'gdex-trading';

const session = await createAuthenticatedSession();

const result = await buyToken(session, {
  tokenAddress: 'TOKEN_ADDRESS',
  amount: formatSolAmount(0.005),
});
```

Key concept: the session separates wallet and trading keys:
- **Wallet private key** — only for the one-time login signature
- **`session.tradingPrivateKey`** — for all trading POST requests
- **`session.encryptedSessionKey`** — for authenticated GET requests

## Project Structure

```
├── src/
│   ├── index.ts         # Barrel exports & CLI entry point
│   ├── auth.ts          # Authentication & session management
│   ├── trading.ts       # Trading helper functions
│   ├── market.ts        # Market data helpers
│   ├── config.ts        # Environment config & chain definitions
│   ├── wallet.ts        # Wallet generation (EVM & Solana)
│   └── test-suite.ts    # Comprehensive SDK test suite
├── references/
│   ├── api_reference.md # Complete SDK API reference
│   └── examples.md      # Code examples for all features
├── SKILL.md             # AI skill definition
├── CLAUDE.md            # Claude Code project instructions
├── .env.example         # Environment template
├── tsconfig.json        # TypeScript config
└── package.json         # Dependencies & scripts
```

## Features

- **Market Data** — trending tokens, search, prices, charts
- **Trading** — market buy/sell, limit orders across all chains
- **Copy Trading** — automatically copy top Solana traders
- **HyperLiquid** — perpetual futures, deposits, copy trading
- **WebSocket** — real-time new token alerts & price updates
- **Portfolio** — holdings, watchlists, user settings

## Security

- **Never commit your `.env` file** — it's in `.gitignore`
- Use session keys for trading, not wallet keys
- Validate addresses before transactions
- Test with small amounts first
- See `references/` for full API docs and examples
