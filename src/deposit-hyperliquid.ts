#!/usr/bin/env ts-node
/**
 * HyperLiquid Deposit - Production Ready
 *
 * REQUIREMENTS:
 * - Minimum: 10 USDC
 * - Must have USDC on Arbitrum + ETH for gas
 * - Must authenticate with GDEX first
 * - Uses SESSION TRADING KEY (not wallet key!)
 */

import WebSocket from 'ws';
(globalThis as any).WebSocket = WebSocket;

import { createSDK } from 'gdex.pro-sdk';
import { loadConfig } from './config';
import { createAuthenticatedSession } from './auth';

const ARBITRUM_CHAIN_ID = 42161;
const ARBITRUM_USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const MINIMUM_DEPOSIT = 10; // USDC

async function depositToHyperLiquid(amountUSDC: number) {
  console.log('💎 HyperLiquid Deposit\n');
  console.log('═'.repeat(60));

  // Validate amount
  if (amountUSDC < MINIMUM_DEPOSIT) {
    console.error(`❌ Error: Minimum deposit is ${MINIMUM_DEPOSIT} USDC`);
    console.error(`   You specified: ${amountUSDC} USDC`);
    process.exit(1);
  }

  const config = loadConfig();
  const apiKey = config.apiKey.split(',')[0].trim();
  const sdk = createSDK(config.apiUrl, { apiKey });

  console.log(`📋 Deposit Details:`);
  console.log(`   Amount: ${amountUSDC} USDC`);
  console.log(`   Wallet: ${config.walletAddress}`);
  console.log(`   Chain: Arbitrum (${ARBITRUM_CHAIN_ID})`);
  console.log('═'.repeat(60));

  // Step 1: Authenticate
  console.log('\n[1/4] 🔐 Authenticating with GDEX...');
  const session = await createAuthenticatedSession({
    apiUrl: config.apiUrl,
    apiKey: apiKey,
    walletAddress: config.walletAddress,
    privateKey: config.privateKey,
    chainId: ARBITRUM_CHAIN_ID,
  });
  console.log('      ✅ Authenticated');

  // Step 2: Check balances
  console.log('\n[2/4] 💰 Checking balances...');
  try {
    const gbotBalance = await sdk.hyperLiquid.getGbotUsdcBalance(session.walletAddress);
    const hlBalance = await sdk.hyperLiquid.getHyperliquidUsdcBalance(session.walletAddress);
    console.log(`      GBOT Balance: $${gbotBalance ?? 0}`);
    console.log(`      HyperLiquid Balance: $${hlBalance ?? 0}`);
  } catch (err) {
    console.log('      ⚠️  Could not fetch balances');
  }

  // Step 3: Check Arbitrum on-chain balance
  console.log('\n[3/4] 🔍 Verifying Arbitrum USDC balance...');
  const { ethers } = require('ethers');
  const provider = new ethers.JsonRpcProvider('https://arb1.arbitrum.io/rpc');
  const usdcContract = new ethers.Contract(
    ARBITRUM_USDC_ADDRESS,
    ['function balanceOf(address) view returns (uint256)'],
    provider
  );

  const onChainBalance = await usdcContract.balanceOf(config.walletAddress);
  const onChainBalanceFormatted = parseFloat(ethers.formatUnits(onChainBalance, 6));

  console.log(`      On-chain USDC: ${onChainBalanceFormatted} USDC`);

  if (onChainBalanceFormatted < amountUSDC) {
    console.error(`\n❌ Insufficient USDC on Arbitrum!`);
    console.error(`   Required: ${amountUSDC} USDC`);
    console.error(`   Available: ${onChainBalanceFormatted} USDC`);
    console.error(`   Shortfall: ${amountUSDC - onChainBalanceFormatted} USDC`);
    console.error('\n💡 How to get USDC on Arbitrum:');
    console.error('   1. Bridge from Ethereum mainnet');
    console.error('   2. Buy on Arbitrum DEX (Uniswap, etc.)');
    console.error('   3. Transfer from exchange (Binance, Coinbase, etc.)');
    process.exit(1);
  }

  // Step 4: Execute deposit
  console.log(`\n[4/4] 📤 Executing deposit...`);
  const depositAmount = Math.floor(amountUSDC * 1e6);
  console.log(`      Amount in units: ${depositAmount}`);
  console.log(`      Using session trading key...`);

  try {
    const result = await sdk.hyperLiquid.hlDeposit(
      session.walletAddress,
      ARBITRUM_USDC_ADDRESS,
      depositAmount.toString(),
      ARBITRUM_CHAIN_ID,
      session.tradingPrivateKey  // CRITICAL: Use session trading key!
    );

    console.log('\n' + '═'.repeat(60));
    if (result?.isSuccess) {
      console.log('🎉 DEPOSIT SUCCESSFUL!');
      console.log(`✅ ${result.message}`);
      console.log(`\n📊 Deposited ${amountUSDC} USDC to HyperLiquid`);

      // Wait and check updated balance
      console.log('\n⏳ Waiting for balance update...');
      await new Promise(resolve => setTimeout(resolve, 5000));

      const newHlBalance = await sdk.hyperLiquid.getHyperliquidUsdcBalance(session.walletAddress);
      console.log(`✅ New HyperLiquid Balance: $${newHlBalance ?? 0}`);

      console.log('\n💡 You can now trade on HyperLiquid using the SDK!');
    } else {
      console.log('❌ DEPOSIT FAILED');
      console.log(`   ${result?.message}`);

      if (result?.message?.includes('Insufficient')) {
        console.log('\n💡 Possible causes:');
        console.log(`   - Not enough USDC (need ${amountUSDC} USDC)`);
        console.log('   - Not enough ETH for gas fees');
        console.log('   - Try with minimum amount (10 USDC)');
      }
    }
    console.log('═'.repeat(60));

  } catch (err: any) {
    console.log('\n' + '═'.repeat(60));
    console.log('❌ DEPOSIT ERROR');
    console.log(`   ${err.message}`);
    if (err.response?.data) {
      console.log(`   Details: ${JSON.stringify(err.response.data)}`);
    }
    console.log('═'.repeat(60));
    process.exit(1);
  }
}

// Parse amount from command line
const args = process.argv.slice(2);
const amount = args[0] ? parseFloat(args[0]) : MINIMUM_DEPOSIT;

if (isNaN(amount) || amount < 0) {
  console.error(`Usage: npm run deposit [amount]`);
  console.error(`Example: npm run deposit 10`);
  console.error(`\nMinimum: ${MINIMUM_DEPOSIT} USDC`);
  process.exit(1);
}

depositToHyperLiquid(amount).catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
