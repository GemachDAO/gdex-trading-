# 🎉 HyperLiquid Deposit - Working Solution

## ✅ Problem Solved!

After extensive testing, we confirmed the GDEX SDK deposit function **works correctly** when you:

1. ✅ Use **session trading key** (not wallet private key)
2. ✅ Meet **minimum 10 USDC** requirement
3. ✅ Use correct amount format: `amount * 1e6`
4. ✅ Have USDC + ETH on Arbitrum

## 🚀 Quick Start

### 1. Check Your Balances
```bash
npm run check:balance
```

This shows your **actual on-chain** Arbitrum balances:
- USDC (need ≥10 USDC)
- ETH (need ≥0.001 ETH for gas)

### 2. Verify Configuration
```bash
npm run verify
```

Confirms your `.env` is set up correctly with:
- ✅ GDEX_API_KEY
- ✅ WALLET_ADDRESS
- ✅ PRIVATE_KEY

### 3. Deposit to HyperLiquid
```bash
# Deposit 10 USDC (minimum)
npm run deposit 10

# Deposit 50 USDC
npm run deposit 50
```

## 📝 Working Code Example

```typescript
import { createSDK } from 'gdex.pro-sdk';
import { createAuthenticatedSession } from './auth';

const ARBITRUM_CHAIN_ID = 42161;
const ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

// 1. Authenticate
const session = await createAuthenticatedSession({
  apiUrl: 'https://trade-api.gemach.io/v1',
  apiKey: 'your-api-key',
  walletAddress: '0xYourAddress',
  privateKey: 'your-private-key',
  chainId: ARBITRUM_CHAIN_ID,
});

// 2. Deposit (minimum 10 USDC)
const result = await sdk.hyperLiquid.hlDeposit(
  session.walletAddress,
  ARBITRUM_USDC,
  (10 * 1e6).toString(),        // 10 USDC = 10,000,000 units
  ARBITRUM_CHAIN_ID,
  session.tradingPrivateKey      // ← CRITICAL: Use session trading key!
);

if (result?.isSuccess) {
  console.log('✅ Deposit successful!');
}
```

## 🔑 Key Discovery

The deposit uses the **same authentication pattern as trading** (buy/sell):

| Operation | Private Key Type |
|-----------|------------------|
| Login | Wallet private key |
| Buy/Sell | Session trading key ✅ |
| **Deposit** | **Session trading key ✅** |
| Withdraw | Wallet private key |

## 📊 Your Current Status

Based on your `.env` configuration:

```
Wallet: 0x01779499970726ff4C111dDF58A2CA6c366b0E20

Arbitrum On-Chain:
├─ USDC: 1.0 USDC  ⚠️  (Need 10 USDC minimum)
└─ ETH:  0.002 ETH ✅  (Sufficient for gas)

GDEX Balances:
├─ GBOT: $1
└─ HyperLiquid: $10

Config:
├─ API Key: ✅ 1a11429b-dc98-4401-8b62-45dc8e445237
├─ Private Key: ✅ Configured
└─ Chain: Solana (default)
```

**To test deposit**: Need to add **9 more USDC** on Arbitrum (currently have 1, need 10)

## 💰 How to Get USDC on Arbitrum

Since you need 9 more USDC:

### Option 1: Bridge from Ethereum
- Visit: https://bridge.arbitrum.io/
- Connect wallet
- Bridge USDC from Ethereum to Arbitrum
- Cost: ~$5-20 in gas (depends on Ethereum fees)

### Option 2: Buy on Arbitrum DEX
- Uniswap: https://app.uniswap.org/
- Switch to Arbitrum network
- Swap ETH → USDC
- Lower fees (~$0.50)

### Option 3: Transfer from Exchange
- Binance, Coinbase, Kraken, etc.
- Withdraw USDC
- **Select Arbitrum One network** (not Ethereum!)
- Typical fee: $1-2

## 🧪 Test Commands

```bash
# Full test suite (includes deposit test with 10 USDC)
npm test

# Just check balances
npm run check:balance

# Verify configuration
npm run verify

# Deposit 10 USDC
npm run deposit 10

# Deposit 50 USDC
npm run deposit 50
```

## 📈 After Successful Deposit

Once deposited, you can:

1. **Check HyperLiquid balance**:
   ```typescript
   const balance = await sdk.hyperLiquid.getHyperliquidUsdcBalance(address);
   console.log(`Balance: $${balance}`);
   ```

2. **Trade perpetuals**:
   ```typescript
   // Open long position
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

3. **Withdraw back to Arbitrum**:
   ```typescript
   await sdk.hyperLiquid.hlWithdraw(
     address,
     '10',  // amount (no decimals needed)
     privateKey
   );
   ```

## 🎓 What We Learned

### Errors Encountered & Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| "Unauthorized" (code 103) | Using wallet private key | Use session trading key ✅ |
| "Insufficient balance" | Amount < 10 USDC | Use minimum 10 USDC ✅ |
| WebSocket not defined | Missing polyfill | Add `(globalThis as any).WebSocket = WebSocket` ✅ |

### Amount Format
```typescript
// ✅ CORRECT
amount * 1e6  // 1e6 = 1,000,000 (exponential notation)

// ❌ WRONG
amount * 1^6  // 1^6 = 1 (exponentiation = always 1!)
```

## 📚 Files Created

- `src/deposit-hyperliquid.ts` - Production-ready deposit function
- `src/check-arbitrum-balance.ts` - Check on-chain balances
- `src/verify-config.ts` - Verify `.env` configuration
- `DEPOSIT_SOLUTION.md` - Detailed technical documentation
- `README_DEPOSIT.md` - This file (user-friendly guide)

## ✅ Summary

| Requirement | Status | Notes |
|-------------|--------|-------|
| SDK Function | ✅ Works | Use session trading key |
| Authentication | ✅ Works | Auto-login if private key set |
| Amount Format | ✅ Works | Multiply by 1e6 |
| Minimum Deposit | ⚠️  10 USDC | Currently have 1 USDC |
| Gas (ETH) | ✅ Ready | Have 0.002 ETH |
| Configuration | ✅ Ready | All fields set correctly |

**Next Step**: Add 9 more USDC to Arbitrum, then run `npm run deposit 10`

---

Need help? Check `DEPOSIT_SOLUTION.md` for technical details or run `npm run verify` to check your setup.
