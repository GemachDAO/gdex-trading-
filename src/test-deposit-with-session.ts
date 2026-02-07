#!/usr/bin/env ts-node
/**
 * Test HyperLiquid deposit using authenticated session
 */

// Polyfill WebSocket
import WebSocket from 'ws';
(globalThis as any).WebSocket = WebSocket;

import { createSDK } from 'gdex.pro-sdk';
import { loadConfig } from './config';
import { createAuthenticatedSession } from './auth';

const ARBITRUM_CHAIN_ID = 42161;
const ARBITRUM_USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

async function testDepositWithSession() {
  console.log('🔬 Testing Deposit with Authenticated Session\n');

  const config = loadConfig();
  const apiKey = config.apiKey.split(',')[0].trim();
  const sdk = createSDK(config.apiUrl, { apiKey });

  console.log('Step 1: Authenticate with GDEX...');
  const session = await createAuthenticatedSession({
    apiUrl: config.apiUrl,
    apiKey: apiKey,
    walletAddress: config.walletAddress,
    privateKey: config.privateKey,
    chainId: ARBITRUM_CHAIN_ID,
  });
  console.log('✅ Authenticated\n');

  console.log('Step 2: Attempt deposit using session private key...');
  const depositAmount = Math.floor(0.5 * 1e6); // 0.5 USDC

  // Try with session trading private key (like trading operations)
  try {
    console.log('  Using session trading key (like buy/sell)...');
    const result = await sdk.hyperLiquid.hlDeposit(
      session.walletAddress,
      ARBITRUM_USDC_ADDRESS,
      depositAmount.toString(),
      ARBITRUM_CHAIN_ID,
      session.tradingPrivateKey
    );

    if (result?.isSuccess) {
      console.log('✅ SUCCESS with session key!');
      console.log(`   ${result.message}`);
      return;
    } else {
      console.log(`❌ Failed with session key: ${result?.message}`);
    }
  } catch (err: any) {
    console.log(`❌ Error with session key: ${err.message}`);
  }

  // Try with wallet private key (without 0x)
  console.log('\nStep 3: Attempt deposit using wallet private key...');
  const privateKey = config.privateKey.startsWith('0x')
    ? config.privateKey.slice(2)
    : config.privateKey;

  try {
    console.log('  Using wallet private key...');
    const result = await sdk.hyperLiquid.hlDeposit(
      config.walletAddress,
      ARBITRUM_USDC_ADDRESS,
      depositAmount.toString(),
      ARBITRUM_CHAIN_ID,
      privateKey
    );

    if (result?.isSuccess) {
      console.log('✅ SUCCESS with wallet key!');
      console.log(`   ${result.message}`);
    } else {
      console.log(`❌ Failed: ${result?.message}`);
      console.log('\n🔍 This suggests deposit API requires:');
      console.log('   - Account whitelisting/verification');
      console.log('   - Special API permissions');
      console.log('   - Contact GDEX support about programmatic deposits');
    }
  } catch (err: any) {
    console.log(`❌ Error: ${err.message}`);
    if (err.response?.data) {
      console.log(`   Details: ${JSON.stringify(err.response.data)}`);
    }
  }
}

testDepositWithSession().catch(console.error);
