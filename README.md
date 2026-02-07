# GDEX Trading Bot

TypeScript trading bot for [GDEX](https://gdex.pro) decentralized exchange. Features multi-chain trading, HyperLiquid perpetuals, and **working custodial deposits**.

## 🚀 Quick Start

```bash
npm install
cp .env.example .env  # Add your wallet & API key
npm test              # Run test suite (35+ tests)
```

## 💰 Depositing to HyperLiquid (**IMPORTANT!**)

**GDEX uses custodial deposits.** Don't call `hlDeposit()` directly!

### ✅ Correct Method

```bash
# Deposit 5 USDC (minimum) to HyperLiquid
npm run deposit:correct 5
```

This will:
1. Get your GDEX deposit address (custodial)
2. Send USDC from your wallet to that address (on Arbitrum)
3. Wait for GDEX to process (1-10 minutes)
4. Confirm when funds appear in HyperLiquid

**See [DEPOSIT_GUIDE.md](./DEPOSIT_GUIDE.md) for complete details!**

### ❌ Wrong Method (Don't Use)

```typescript
// DON'T USE - This doesn't work!
await sdk.hyperLiquid.hlDeposit(address, tokenAddr, amount, chainId, privateKey);
```

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
import { buyToken, sellToken } from './trading';

// Buy with 0.005 SOL
const result = await buyToken(
  session,
  '5000000',      // lamports
  tokenAddress,
  622112261
);
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
// After deposit, trade perpetuals
await sdk.hyperLiquid.hlPlaceOrder(
  address,
  'BTC',     // coin
  true,      // isLong
  '50000',   // price
  '0.1',     // size
  false,     // reduceOnly
  privateKey
);
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

35+ comprehensive tests covering:

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
const result = await buyToken(
  session,
  '5000000',  // 0.005 SOL
  trending[0].address,
  622112261
);

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
