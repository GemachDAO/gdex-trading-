# GDEX Trading Bot

TypeScript trading bot for [GDEX](https://gdex.pro) decentralized exchange with **revolutionary universal custodial wallet system**.

## Install as a Claude Skill

```bash
npx skills add GemachDAO/gdex-trading-
```

Once installed, Claude can trade tokens, check prices, manage HyperLiquid positions, and run the pump.fun scanner automatically on your behalf.

## 🌟 Key Features

✅ **Universal EVM Wallet** - ONE custodial address works for ALL EVM chains
✅ **Base Trading** - Fully working with verified transactions
✅ **Solana Meme Coins** - Including pump.fun pre-DEX tokens
✅ **Multi-Chain** - Arbitrum, Ethereum, BSC, Optimism, and more
✅ **Real-Time Data** - WebSocket streams + comprehensive analytics
✅ **HyperLiquid Futures** - Opening positions WORKING! (Feb 26, 2026 breakthrough)

## 🚀 Quick Start

```bash
npm install
cp .env.example .env  # API key pre-filled, wallet auto-generates on first run

# Get wallet addresses for funding
npm run wallets:qr    # Display QR codes

# Test trading
npm run solana:swap   # Trade Solana meme coins
npm run base:trade    # Trade on Base
```

> **No API key needed!** A shared GDEX API key is pre-configured.
> `GDEX_API_KEY=3f6c9e12-7b41-4c2a-9d5e-1a8f3b7e6c90,8d2a5f47-2e13-4b9c-a6f1-0c9e7d3a5b21`
> Your EVM wallet auto-generates on first run.

## 🔑 Universal Custodial Wallet System (**CRITICAL!**)

GDEX uses TWO wallet addresses:

### 1. Your Control Wallet (from `.env`)
- You control with private key
- Used for authentication only
- Example: `0x01779499970726ff4C111dDF58A2CA6c366b0E20`

### 2. GDEX Custodial Wallets
- **ONE address for ALL EVM chains** ← Revolutionary!
- Different address for Solana
- Send funds HERE to trade
- Auto-processed in 1-10 minutes

### Get Your Addresses

```bash
npm run wallets:qr  # Shows QR codes for easy phone wallet funding
```

### Funding for Trading

**For ANY EVM chain (Base, Arbitrum, Ethereum, BSC, etc.):**
1. Get your custodial address (same for all EVM chains!)
2. Send ETH, USDC, or tokens to that address
3. Use the network you want to trade on
4. Trade after GDEX processes (1-10 min)

**For Solana:**
1. Use separate Solana custodial address
2. Send SOL
3. Trade meme coins (pump.fun works!)

## 🎯 Verified Trading Examples

### Base Chain (✅ Working)
```bash
npm run base:trade
```
Verified transactions:
- Buy: `0x26663c53c2145e5d95070150ad69385d7cc96f176497e2b5e2d138f0f45e069f`
- Sell: `0x9df24b633c4f620f421edc19cbdf70252105ea381fd5fbc8e730bc7fd2642f4b`

### Solana Meme Coins (✅ Working)
```bash
npm run solana:swap  # Buy & sell pump.fun tokens
npm run solana:scan  # Real-time scanner with inline trading
```

## 🎉 HyperLiquid Perpetual Futures - FULLY WORKING (Feb 26, 2026)

### ✅ DEPOSIT TO HYPERLIQUID - WORKING!

**Status**: ✅ **VERIFIED WORKING** - Successfully deposited $10 USDC to HyperLiquid

```bash
npm run deposit:hl 10  # Deposit 10 USDC to HyperLiquid
```

### ✅ OPENING POSITIONS - WORKING! (NEW)

**Status**: ✅ **VERIFIED** - Real limit orders placed on HyperLiquid via GDEX API

**Script**: `src/test-create-order.ts`

```bash
npx ts-node src/test-create-order.ts  # Place & cancel ETH limit order
```

**Key Requirements**:
- Endpoint: `POST /v1/hl/create_order`
- Browser User-Agent required on all requests (axios UA gets 403)
- CORS headers: `Origin: https://gdex.pro`, `Referer: https://gdex.pro/`
- Min order value: price × size ≥ $11
- Numeric-style nonce: `Date.now() + Math.random() * 1000`

### ✅ What Works:
- ✅ **Depositing to HyperLiquid** via `/v1/hl/deposit`
- ✅ **Opening leveraged positions** via `/v1/hl/create_order` ← NEW!
- ✅ **Cancelling orders** via `/v1/hl/cancel_order`
- ✅ Closing positions
- ✅ Balance queries
- ✅ Copy trading (opens positions indirectly)
- ✅ Withdrawals

## 📚 Documentation

- **[DEPOSIT_GUIDE.md](./DEPOSIT_GUIDE.md)** - Complete deposit guide (**MUST READ!**)
- **[CLAUDE.md](./CLAUDE.md)** - Architecture & build commands
- **[references/](./references/)** - SDK API documentation

## ⚙️ Configuration

`.env` file:

```bash
GDEX_API_KEY=your-api-key
WALLET_ADDRESS=0xYourWallet  # EVM format required
PRIVATE_KEY=0xYourPrivateKey
DEFAULT_CHAIN_ID=622112261   # Solana
```

## 🧪 Available Commands

```bash
# Development
npm run dev              # Run with ts-node
npm run build            # Compile TypeScript
npm test                 # Run test suite

# Utilities
npm run verify           # Verify .env configuration
npm run check:balance    # Check on-chain Arbitrum balances

# Deposits (Correct Method!)
npm run deposit:correct 5    # Deposit 5 USDC (minimum)
npm run deposit:correct 10   # Deposit 10 USDC
```

## 🌐 Supported Chains

| Network | Chain ID | Status |
|---------|----------|--------|
| **Solana** | **622112261** | ✅ Trading |
| **Arbitrum** | **42161** | ✅ HyperLiquid Deposits |
| Ethereum | 1 | ✅ Trading |
| Base | 8453 | ✅ Trading |
| BSC | 56 | ✅ Trading |
| Optimism | 10 | ✅ Trading |

**For HyperLiquid deposits**: Use Arbitrum only (minimum 5 USDC)

## 📦 Project Structure

```
src/
├── deposit-correct-flow.ts  # ✅ Working deposit (use this!)
├── auth.ts                   # Authentication & session management
├── trading.ts                # Buy/sell helper functions
├── market.ts                 # Market data queries
├── config.ts                 # Configuration loading
├── wallet.ts                 # Wallet utilities
└── test-suite.ts             # Comprehensive test suite (35+ tests)

DEPOSIT_GUIDE.md              # Complete deposit documentation
CLAUDE.md                     # Architecture reference
references/                   # SDK API docs
```

## 🎯 Core Features

### Authentication

```typescript
import { createAuthenticatedSession } from './auth';

const session = await createAuthenticatedSession({
  apiUrl: 'https://trade-api.gemach.io/v1',
  apiKey: 'your-api-key',
  walletAddress: '0xYourWallet',
  privateKey: 'your-private-key',
  chainId: 622112261, // Solana
});

// session.walletAddress
// session.encryptedSessionKey (for GET)
// session.tradingPrivateKey (for POST)
```

### Trading

```typescript
import { buyToken, sellToken, formatSolAmount } from './trading';

// Buy with 0.005 SOL
const result = await buyToken(session, {
  tokenAddress,
  amount: formatSolAmount(0.005), // '5000000' lamports
  chainId: 622112261,
});
```

### Market Data

```typescript
import { getTrendingTokens, getTokenPrice } from './market';

const trending = await getTrendingTokens(sdk, 10);
const price = await getTokenPrice(sdk, tokenAddress, chainId);
```

### HyperLiquid Deposits

```bash
# Step 1: Deposit USDC
npm run deposit:correct 10

# Step 2: Wait 1-10 minutes

# Step 3: Trade perpetuals
```

```typescript
// After deposit, open a leveraged position via REST endpoint
// See: src/test-create-order.ts  |  npm run hl:order
import axios from 'axios';
import { createHash, createCipheriv } from 'crypto';
import { CryptoUtils } from 'gdex.pro-sdk';

const nonce = (Date.now() + Math.floor(Math.random() * 1000)).toString();
const params = { coin: 'ETH', isLong: true, price: '1500', size: '0.013',
  reduceOnly: false, nonce, tpPrice: '0', slPrice: '0', isMarket: false };
const encoded = CryptoUtils.encodeInputData('hl_create_order', params);
const sig = CryptoUtils.sign(`hl_create_order-${userId}-${encoded}`, session.tradingPrivateKey);
const payload = { userId, data: encoded, signature: sig, apiKey: session.apiKey };
// ... encrypt payload and POST to /v1/hl/create_order
```

## 🔑 Key Concepts

### Session Keys (Critical!)

- **Wallet private key**: Only for initial login signature
- **`session.tradingPrivateKey`**: For all trading operations ✅
- **`session.encryptedSessionKey`**: For authenticated queries

```typescript
// ✅ CORRECT
await sdk.trading.buy(..., session.tradingPrivateKey);

// ❌ WRONG - Don't use wallet key for trading!
await sdk.trading.buy(..., config.privateKey);
```

### Amount Formatting

```typescript
// USDC (6 decimals)
const amount = Math.floor(5 * 1e6);  // 5 USDC = 5,000,000 units

// SOL (9 decimals)
const amount = Math.floor(0.005 * 1e9);  // 0.005 SOL = 5,000,000 lamports

// ETH (18 decimals)
const amount = ethers.parseEther('0.01');
```

### Custodial Deposits

GDEX provides a deposit address for each user:
1. Get your deposit address via `getUserInfo()`
2. Send USDC/ETH to that address on Arbitrum
3. GDEX automatically deposits to HyperLiquid
4. Trade with your balance!

**This is the ONLY method that works.**

## 🧪 Test Suite

36 comprehensive tests covering:

- ✅ Token operations (trending, search, prices)
- ✅ User operations (holdings, watchlist)
- ✅ Trading operations (orders, execution)
- ✅ Copy trading (top traders, DEX list)
- ✅ HyperLiquid (balances, perpetuals)
- ✅ WebSocket (real-time updates)
- ✅ CryptoUtils (session keys, encryption)

```bash
npm test  # Run all tests
```

## 🚨 Common Issues

### Deposit Fails

**❌ Error**: "Unauthorized" or "Insufficient balance" with `hlDeposit()`
**✅ Solution**: Use `npm run deposit:correct` (custodial flow)

### Authentication Error

**❌ Error**: "Wallet not found"
**✅ Solution**: Use EVM wallet format (`0x...`), not Solana base58

### Amount Error

**❌ Error**: "Insufficient balance for transfer and fee"
**✅ Solution**: Need minimum deposit + gas (~5 USDC + $0.50 ETH)

## 📝 Example Workflows

### Complete Trading Flow

```typescript
// 1. Authenticate
const session = await createAuthenticatedSession({...});

// 2. Get trending token
const trending = await getTrendingTokens(sdk, 1);

// 3. Buy
const result = await buyToken(session, {
  tokenAddress: trending[0].address,
  amount: '5000000',  // 0.005 SOL
  chainId: 622112261,
});

console.log('Trade:', result.isSuccess ? 'Success!' : 'Failed');
```

### HyperLiquid Deposit → Trade

```bash
# 1. Deposit
npm run deposit:correct 10

# 2. Wait for processing (script monitors automatically)

# 3. Trade perpetuals via SDK
```

## 💡 Pro Tips

1. **Always test with small amounts first**
2. **Check balances**: `npm run check:balance`
3. **Use session keys correctly** - different keys for different operations
4. **For deposits, use custodial flow** - `npm run deposit:correct`
5. **Minimum deposits**: 5 USDC for HyperLiquid
6. **Read DEPOSIT_GUIDE.md** - Has complete deposit walkthrough

## 🎓 Learning Resources

- **Test Suite**: `src/test-suite.ts` - Learn by example
- **Deposit Guide**: `DEPOSIT_GUIDE.md` - Step-by-step
- **SDK Examples**: `node_modules/gdex.pro-sdk/examples/`
- **API Reference**: `references/api_reference.md`

## 🔗 Links

- GDEX: https://gdex.pro
- HyperLiquid: https://hyperliquid.xyz
- Arbitrum Explorer: https://arbiscan.io

## Security

- Never commit `.env` (in `.gitignore`)
- Use session keys, not wallet keys for trading
- Always test with small amounts
- Validate addresses before transactions

## License

MIT

---

**Need help?**
- Depositing: Read [DEPOSIT_GUIDE.md](./DEPOSIT_GUIDE.md)
- Configuration: Run `npm run verify`
- Testing: Run `npm test`

**Remember**: Always use `npm run deposit:correct` for deposits - custodial flow is the only method that works!
