#!/usr/bin/env ts-node
/**
 * Final Deposit Test - Using Session Key with Small Amount
 */

import WebSocket from 'ws';
(globalThis as any).WebSocket = WebSocket;

import { createSDK } from 'gdex.pro-sdk';
import { loadConfig } from './config';
import { createAuthenticatedSession } from './auth';

const ARBITRUM_CHAIN_ID = 42161;
const ARBITRUM_USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

async function testDeposit() {
  console.log('💎 HyperLiquid Deposit - Final Test\n');
  console.log('═'.repeat(60));

  const config = loadConfig();
  const apiKey = config.apiKey.split(',')[0].trim();
  const sdk = createSDK(config.apiUrl, { apiKey });

  console.log('🔐 Authenticating...');
  const session = await createAuthenticatedSession({
    apiUrl: config.apiUrl,
    apiKey: apiKey,
    walletAddress: config.walletAddress,
    privateKey: config.privateKey,
    chainId: ARBITRUM_CHAIN_ID,
  });
  console.log('✅ Authenticated\n');

  // Check balances
  console.log('💰 Current Balances:');
  const gbotBalance = await sdk.hyperLiquid.getGbotUsdcBalance(session.walletAddress);
  const hlBalance = await sdk.hyperLiquid.getHyperliquidUsdcBalance(session.walletAddress);
  console.log(`  GBOT: $${gbotBalance ?? 0}`);
  console.log(`  HyperLiquid: $${hlBalance ?? 0}`);

  // Try very small amount: 0.1 USDC
  const depositAmount = Math.floor(0.1 * 1e6); // 100,000 units = 0.1 USDC

  console.log(`\n📤 Depositing 0.1 USDC (${depositAmount} units)...`);
  console.log('   Using session trading key (correct method!)');

  try {
    const result = await sdk.hyperLiquid.hlDeposit(
      session.walletAddress,
      ARBITRUM_USDC_ADDRESS,
      depositAmount.toString(),
      ARBITRUM_CHAIN_ID,
      session.tradingPrivateKey  // KEY INSIGHT: Use session trading key!
    );

    console.log('\n' + '═'.repeat(60));
    if (result?.isSuccess) {
      console.log('🎉 DEPOSIT SUCCESSFUL!');
      console.log(`✅ ${result.message}`);
      console.log('\n📊 What we learned:');
      console.log('   1. Must use SESSION TRADING KEY (not wallet key)');
      console.log('   2. Amount must be small enough for balance + fees');
      console.log('   3. Format: amount * 1e6 for USDC (6 decimals)');

      // Check updated balance
      console.log('\n⏳ Waiting 3 seconds for balance update...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      const newHlBalance = await sdk.hyperLiquid.getHyperliquidUsdcBalance(session.walletAddress);
      console.log(`   New HyperLiquid Balance: $${newHlBalance ?? 0}`);
    } else {
      console.log('❌ DEPOSIT FAILED');
      console.log(`   ${result?.message}`);

      if (result?.message?.includes('Insufficient')) {
        console.log('\n💡 Try even smaller amount:');
        console.log('   - Current attempt: 0.1 USDC');
        console.log('   - Wallet has: 1.0 USDC');
        console.log('   - Try: 0.05 USDC or less');
      }
    }
    console.log('═'.repeat(60));

  } catch (err: any) {
    console.log('\n' + '═'.repeat(60));
    console.log('❌ ERROR');
    console.log(`   ${err.message}`);
    if (err.response?.data) {
      console.log(`   ${JSON.stringify(err.response.data)}`);
    }
    console.log('═'.repeat(60));
  }
}

testDeposit().catch(console.error);
