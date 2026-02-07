# HyperLiquid Deposit Guide

## Overview

The GDEX SDK provides the `hlDeposit` function to deposit USDC from Arbitrum to your HyperLiquid trading account.

## Function Signature

```typescript
await sdk.hyperLiquid.hlDeposit(
  address: string,           // Your wallet address
  tokenAddress: string,      // USDC contract on Arbitrum
  amount: string,            // Amount in smallest units (multiply by 1e6 for USDC)
  chainId: number,           // 42161 for Arbitrum
  privateKey: string         // Your wallet's private key
);
```

## Constants

```typescript
const ARBITRUM_CHAIN_ID = 42161;
const ARBITRUM_USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
```

## Amount Calculation

**IMPORTANT:** USDC has 6 decimals, so you need to multiply by `1e6` (not `1^6`):

```typescript
// To deposit 1 USDC:
const amount = Math.floor(1 * 1e6);  // = 1000000 units

// To deposit 10 USDC:
const amount = Math.floor(10 * 1e6); // = 10000000 units

// To deposit 0.5 USDC:
const amount = Math.floor(0.5 * 1e6); // = 500000 units
```

## Example Usage

```typescript
import { createSDK } from 'gdex.pro-sdk';

const sdk = createSDK('https://trade-api.gemach.io/v1', {
  apiKey: 'your-api-key'
});

const ARBITRUM_CHAIN_ID = 42161;
const ARBITRUM_USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

// Deposit 5 USDC
const depositAmount = Math.floor(5 * 1e6); // 5000000 units

const result = await sdk.hyperLiquid.hlDeposit(
  '0xYourWalletAddress',
  ARBITRUM_USDC_ADDRESS,
  depositAmount.toString(),
  ARBITRUM_CHAIN_ID,
  'your-private-key-without-0x-prefix'
);

if (result?.isSuccess) {
  console.log('✅ Deposit successful!', result.message);
} else {
  console.log('❌ Deposit failed:', result?.message);
}
```

## Requirements

Before depositing, ensure you have:

1. **USDC Balance on Arbitrum**
   - Check your Arbitrum USDC balance
   - Get USDC on Arbitrum via bridge or exchange

2. **ETH on Arbitrum for Gas**
   - Need sufficient ETH to pay transaction fees
   - Typical gas cost: ~$0.10-0.50

3. **Wallet Setup**
   - `WALLET_ADDRESS` in `.env` (EVM format: `0x...`)
   - `PRIVATE_KEY` in `.env` (without `0x` prefix)
   - `GDEX_API_KEY` in `.env`

4. **GDEX Account**
   - Wallet may need to be registered with GDEX
   - Try using the wallet on GDEX website first

## Testing

Run the deposit test script:

```bash
# Deposit 1 USDC
npm run test:deposit 1

# Deposit 5 USDC
npm run test:deposit 5

# Deposit 10 USDC
npm run test:deposit 10
```

## Current Issue

We're encountering an "Unauthorized" (code 103) error when attempting deposits. This could be due to:

1. **Wallet Not Registered**: The wallet may need to be registered with GDEX first
   - Try connecting your wallet on the GDEX web interface
   - Complete any KYC or registration steps

2. **API Authentication**: The deposit endpoint may require additional authentication
   - Contact GDEX support for deposit access
   - Verify API key has deposit permissions

3. **Network/Contract Issues**: Verify the USDC contract address and network
   - Double-check you're using Arbitrum network (not Arbitrum Nova)
   - Confirm USDC contract: `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`

## Checking Balances

Check your current balances:

```typescript
// Check GBOT balance (GDEX internal)
const gbotBalance = await sdk.hyperLiquid.getGbotUsdcBalance(address);
console.log(`GBOT Balance: $${gbotBalance}`);

// Check HyperLiquid balance (on HyperLiquid chain)
const hlBalance = await sdk.hyperLiquid.getHyperliquidUsdcBalance(address);
console.log(`HyperLiquid Balance: $${hlBalance}`);
```

## Alternative: Manual Deposit

If the SDK deposit isn't working, you can deposit directly:

1. Go to [HyperLiquid](https://app.hyperliquid.xyz/)
2. Connect your wallet
3. Use the deposit interface to transfer USDC from Arbitrum
4. Once deposited, you can trade via the GDEX SDK

## Next Steps

If deposit continues to fail:

1. Contact GDEX support with error code 103
2. Try depositing via HyperLiquid website directly
3. Verify your wallet is whitelisted for programmatic deposits
4. Check if there are any minimum deposit requirements

## Support

- GDEX Documentation: Check SDK docs
- HyperLiquid Docs: https://hyperliquid.gitbook.io/
- Issue: "Unauthorized" error code 103 on hlDeposit
