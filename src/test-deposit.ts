#!/usr/bin/env ts-node
/**
 * HyperLiquid Deposit Test
 *
 * Tests depositing USDC from Arbitrum to HyperLiquid
 * Make sure you have:
 * - USDC balance on Arbitrum
 * - ETH on Arbitrum for gas fees
 * - WALLET_ADDRESS and PRIVATE_KEY set in .env
 */

// Polyfill WebSocket for Node.js (required by @nktkas/hyperliquid)
import WebSocket from 'ws';
(globalThis as any).WebSocket = WebSocket;

import { createSDK } from 'gdex.pro-sdk';
import { loadConfig } from './config';
import { createAuthenticatedSession } from './auth';

const ARBITRUM_CHAIN_ID = 42161;
const ARBITRUM_USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

async function testDeposit(amountUSDC: number) {
  console.log('🏦 HyperLiquid Deposit Test\n');
  console.log('═'.repeat(60));

  // Load configuration
  const config = loadConfig();

  if (!config.walletAddress || !config.privateKey) {
    console.error('❌ Error: WALLET_ADDRESS and PRIVATE_KEY must be set in .env');
    process.exit(1);
  }

  // Initialize SDK
  const apiKey = config.apiKey.split(',')[0].trim();
  const sdk = createSDK(config.apiUrl, { apiKey });

  console.log('📋 Configuration:');
  console.log(`  Wallet: ${config.walletAddress}`);
  console.log(`  Chain: Arbitrum (ID: ${ARBITRUM_CHAIN_ID})`);
  console.log(`  USDC Contract: ${ARBITRUM_USDC_ADDRESS}`);
  console.log(`  Amount: ${amountUSDC} USDC`);
  console.log('═'.repeat(60));

  // Authenticate with GDEX API
  console.log('\n🔐 Authenticating with GDEX API...');
  let session;
  try {
    session = await createAuthenticatedSession({
      apiUrl: config.apiUrl,
      apiKey: apiKey,
      walletAddress: config.walletAddress,
      privateKey: config.privateKey,
      chainId: ARBITRUM_CHAIN_ID, // Use Arbitrum chain for HyperLiquid
    });
    console.log('  ✅ Authentication successful');
  } catch (err: any) {
    console.error(`  ❌ Authentication failed: ${err.message}`);
    console.log('  Continuing without session...');
  }

  // Check current balances
  console.log('\n💰 Checking current balances...');

  try {
    const gbotBalance = await sdk.hyperLiquid.getGbotUsdcBalance(config.walletAddress);
    console.log(`  Gbot USDC Balance: $${gbotBalance ?? 0}`);

    const hlBalance = await sdk.hyperLiquid.getHyperliquidUsdcBalance(config.walletAddress);
    console.log(`  HyperLiquid USDC Balance: $${hlBalance ?? 0}`);
  } catch (err: any) {
    console.log(`  ⚠️  Could not fetch balances: ${err.message}`);
  }

  // Convert amount to smallest unit (USDC has 6 decimals)
  const depositAmount = Math.floor(amountUSDC * 1e6);
  console.log(`\n📤 Initiating deposit...`);
  console.log(`  Amount in units: ${depositAmount} (= ${depositAmount / 1e6} USDC)`);
  console.log(`  Note: Amount uses 1e6 (not 1^6) for USDC's 6 decimals`);

  try {
    console.log('\n⏳ Sending deposit transaction...');

    // Strip 0x prefix from private key if present (SDK expects key without prefix)
    const privateKey = config.privateKey.startsWith('0x')
      ? config.privateKey.slice(2)
      : config.privateKey;

    console.log(`  Private Key: ${privateKey.slice(0, 8)}...${privateKey.slice(-8)} (${config.privateKey.startsWith('0x') ? 'stripped 0x' : 'no prefix'})`);

    const depositResult = await sdk.hyperLiquid.hlDeposit(
      config.walletAddress,
      ARBITRUM_USDC_ADDRESS,
      depositAmount.toString(),
      ARBITRUM_CHAIN_ID,
      privateKey
    );

    console.log('\n' + '═'.repeat(60));
    if (depositResult?.isSuccess) {
      console.log('✅ DEPOSIT SUCCESSFUL!');
      console.log(`   Message: ${depositResult.message}`);
      console.log(`   Amount: ${amountUSDC} USDC deposited to HyperLiquid`);

      // Check balance again
      console.log('\n💰 Checking updated balances...');
      setTimeout(async () => {
        try {
          const newHlBalance = await sdk.hyperLiquid.getHyperliquidUsdcBalance(config.walletAddress);
          console.log(`  New HyperLiquid Balance: $${newHlBalance ?? 0}`);
        } catch (err) {
          console.log('  ⚠️  Could not fetch updated balance');
        }
      }, 3000);
    } else {
      console.log('❌ DEPOSIT FAILED');
      console.log(`   Message: ${depositResult?.message ?? 'Unknown error'}`);
      console.log('\n🔍 Troubleshooting:');
      console.log('   1. Ensure you have sufficient USDC on Arbitrum');
      console.log('   2. Ensure you have ETH on Arbitrum for gas fees');
      console.log('   3. Verify wallet address and private key are correct');
      console.log('   4. Check that USDC contract address is correct');
    }
    console.log('═'.repeat(60));

  } catch (err: any) {
    console.log('\n' + '═'.repeat(60));
    console.log('❌ DEPOSIT ERROR');
    console.log(`   ${err.message}`);

    if (err.response?.data) {
      console.log(`   Details: ${JSON.stringify(err.response.data, null, 2)}`);
    }

    console.log('\n🔍 Common Issues:');
    console.log('   • Insufficient USDC balance on Arbitrum');
    console.log('   • Insufficient ETH for gas fees');
    console.log('   • Wallet not authorized (check private key)');
    console.log('   • Network connectivity issues');
    console.log('═'.repeat(60));
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const amount = args[0] ? parseFloat(args[0]) : 1;

if (isNaN(amount) || amount <= 0) {
  console.error('Usage: npm run test:deposit [amount]');
  console.error('Example: npm run test:deposit 1');
  process.exit(1);
}

// Run the test
testDeposit(amount).catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
