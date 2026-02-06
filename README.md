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

- `WALLET_ADDRESS` — your wallet address (required)
- `PRIVATE_KEY` — your wallet private key (required)
- `GDEX_API_KEY` — optional API key
- `SESSION_KEY` — optional, for read-only operations like viewing holdings
- `DEFAULT_CHAIN_ID` — defaults to Solana (`622112261`)

### 3. Run

```bash
# Development (ts-node, no build step)
npm run dev

# Production
npm run build
npm start
```

## Project Structure

```
├── src/
│   ├── config.ts       # Environment config & chain definitions
│   └── index.ts        # Main entry point
├── references/
│   ├── api_reference.md  # Complete SDK API reference
│   └── examples.md       # Code examples for all features
├── SKILL.md            # AI skill definition
├── .env.example        # Environment template
├── tsconfig.json       # TypeScript config
└── package.json        # Dependencies & scripts
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
- Validate addresses before transactions
- Test with small amounts first
- See `references/` for full API docs and examples