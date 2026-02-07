# GDEX Deposit Guide - Complete & Correct

## ✅ The Correct Way (Custodial Deposit)

GDEX uses a **custodial wallet system** - you send funds to a GDEX-controlled address, and they deposit it to HyperLiquid for you.

### Quick Start

```bash
# Deposit 5 USDC (minimum)
npm run deposit:correct 5

# Deposit 10 USDC
npm run deposit:correct 10

# Check balances first
npm run check:balance
```

## How It Works

```
Your Wallet (Arbitrum)
    ↓ Send USDC
GDEX Deposit Address (Custodial)
    ↓ GDEX processes (1-10 min)
HyperLiquid Balance (Ready to trade!)
```

## Step-by-Step Guide

### 1. Get Your GDEX Deposit Address

```typescript
import { createSDK } from 'gdex.pro-sdk';
import { createAuthenticatedSession } from './auth';

const session = await createAuthenticatedSession({
  apiUrl: 'https://trade-api.gemach.io/v1',
  apiKey: 'your-api-key',
  walletAddress: '0xYourWallet',
  privateKey: 'your-private-key',
  chainId: 42161, // Arbitrum
});

// Get deposit address
const userInfo = await sdk.user.getUserInfo(
  session.walletAddress,
  session.encryptedSessionKey,
  42161
);

const depositAddress = userInfo.address;
console.log(`Send USDC to: ${depositAddress}`);
```

### 2. Send USDC to Deposit Address

```typescript
import { ethers } from 'ethers';

const ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

// Setup wallet
const provider = new ethers.JsonRpcProvider('https://arb1.arbitrum.io/rpc');
const wallet = new ethers.Wallet(privateKey, provider);

// USDC contract
const usdcContract = new ethers.Contract(
  ARBITRUM_USDC,
  ['function transfer(address to, uint256 amount) returns (bool)'],
  wallet
);

// Send 5 USDC (minimum)
const amount = ethers.parseUnits('5', 6); // 6 decimals for USDC
const tx = await usdcContract.transfer(depositAddress, amount);
await tx.wait();

console.log('USDC sent:', tx.hash);
```

### 3. Wait for GDEX to Process

```typescript
// Check balance every 30 seconds
const initialBalance = await sdk.hyperLiquid.getHyperliquidUsdcBalance(walletAddress);

while (true) {
  await new Promise(r => setTimeout(r, 30000)); // Wait 30 seconds

  const currentBalance = await sdk.hyperLiquid.getHyperliquidUsdcBalance(walletAddress);

  if (currentBalance > initialBalance) {
    console.log('Deposit complete!', currentBalance);
    break;
  }
}
```

## Complete Working Example

```typescript
import WebSocket from 'ws';
(globalThis as any).WebSocket = WebSocket;

import { createSDK } from 'gdex.pro-sdk';
import { createAuthenticatedSession } from './auth';
import { ethers } from 'ethers';

const ARBITRUM_CHAIN_ID = 42161;
const ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

async function deposit(amountUSDC: number) {
  // 1. Authenticate
  const config = loadConfig();
  const apiKey = config.apiKey.split(',')[0].trim();
  const sdk = createSDK(config.apiUrl, { apiKey });

  const session = await createAuthenticatedSession({
    apiUrl: config.apiUrl,
    apiKey: apiKey,
    walletAddress: config.walletAddress,
    privateKey: config.privateKey,
    chainId: ARBITRUM_CHAIN_ID,
  });

  // 2. Get deposit address
  const userInfo = await sdk.user.getUserInfo(
    session.walletAddress,
    session.encryptedSessionKey,
    ARBITRUM_CHAIN_ID
  );

  const depositAddress = userInfo.address;
  console.log(`Deposit to: ${depositAddress}`);

  // 3. Send USDC
  const provider = new ethers.JsonRpcProvider('https://arb1.arbitrum.io/rpc');
  const wallet = new ethers.Wallet(config.privateKey, provider);

  const usdc = new ethers.Contract(
    ARBITRUM_USDC,
    ['function transfer(address to, uint256 amount) returns (bool)'],
    wallet
  );

  const amount = ethers.parseUnits(amountUSDC.toString(), 6);
  const tx = await usdc.transfer(depositAddress, amount);

  console.log('Transaction sent:', tx.hash);
  await tx.wait();
  console.log('Transaction confirmed!');

  // 4. Wait for processing
  console.log('Waiting for GDEX to process (1-10 minutes)...');

  const initialBalance = await sdk.hyperLiquid.getHyperliquidUsdcBalance(session.walletAddress);

  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 30000));

    const balance = await sdk.hyperLiquid.getHyperliquidUsdcBalance(session.walletAddress);

    if (balance > initialBalance) {
      console.log('✅ Deposit complete! New balance:', balance);
      return;
    }

    console.log(`Checking... (${i+1}/20)`);
  }
}

// Usage
await deposit(5); // Minimum 5 USDC
```

## Requirements

| Item | Requirement |
|------|-------------|
| **Minimum Deposit** | 5 USDC |
| **Network** | Arbitrum (chain ID: 42161) |
| **Gas Token** | ETH (on Arbitrum, ~$0.10-0.50) |
| **Processing Time** | 1-10 minutes |
| **USDC Contract** | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` |

## Your Deposit Address

Your GDEX deposit address (example from test):
```
0x886e83feb8d1774afab4a32047a083434354c6f0
```

**Important:**
- This is a **custodial address** controlled by GDEX
- Only send funds you intend to trade
- Funds are automatically deposited to HyperLiquid
- You maintain control via your wallet's authentication

## Common Issues

### ❌ "Insufficient ETH"
- **Problem**: Not enough ETH for gas on Arbitrum
- **Solution**: Bridge ~$5 ETH to Arbitrum for gas fees

### ❌ "Minimum deposit"
- **Problem**: Trying to deposit less than 5 USDC
- **Solution**: Send at least 5 USDC

### ⏱️ "Taking longer than 10 minutes"
- **Problem**: Network congestion
- **Solution**: Wait longer, check transaction on Arbiscan

## Checking Balances

```bash
# Check on-chain Arbitrum balance
npm run check:balance

# Check GDEX/HyperLiquid balances
npm run verify
```

```typescript
// Via SDK
const gbotBalance = await sdk.hyperLiquid.getGbotUsdcBalance(address);
const hlBalance = await sdk.hyperLiquid.getHyperliquidUsdcBalance(address);

console.log('GBOT:', gbotBalance);
console.log('HyperLiquid:', hlBalance);
```

## ❌ WRONG Method (Don't Use)

The SDK has an `hlDeposit()` function that appears to do direct HyperLiquid deposits:

```typescript
// ❌ DON'T USE THIS
await sdk.hyperLiquid.hlDeposit(address, tokenAddr, amount, chainId, privateKey);
```

**Why it doesn't work:**
- Requires token approval (not handled by SDK)
- Complex fee structure
- Returns "Unauthorized" or "Insufficient balance" errors
- Not the intended GDEX deposit flow

**Use custodial deposit instead (documented above)** ✅

## Next Steps

After successful deposit:

1. **Trade on HyperLiquid**
   ```typescript
   await sdk.hyperLiquid.hlPlaceOrder(
     address,
     'BTC',
     true,      // long
     '50000',   // price
     '0.1',     // size
     false,     // not reduce-only
     privateKey
   );
   ```

2. **Withdraw to Arbitrum**
   ```typescript
   await sdk.hyperLiquid.hlWithdraw(
     address,
     '10',  // amount (no decimals)
     privateKey
   );
   ```

3. **Check positions**
   ```typescript
   const positions = await sdk.hyperLiquid.getHyperliquidUserStats(address);
   ```

## Verified Transaction

Example successful deposit:
- **Amount**: 5 USDC
- **Transaction**: `0x1fe9f1b1d168c98e645a20ccddaea375fe9d33f4466ff3abf249c4dfe8795eba`
- **Block**: 429400703
- **Status**: ✅ Confirmed

View on Arbiscan:
`https://arbiscan.io/tx/0x1fe9f1b1d168c98e645a20ccddaea375fe9d33f4466ff3abf249c4dfe8795eba`

## Summary

✅ **Correct Flow**: Get deposit address → Send USDC → GDEX processes → Trade!

❌ **Wrong Flow**: Call hlDeposit() directly → Fails with authorization/balance errors

**Use `npm run deposit:correct [amount]` for easy deposits!**
