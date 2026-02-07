#!/usr/bin/env ts-node
/**
 * Test deposit with maximum available amount
 */

import WebSocket from 'ws';
(globalThis as any).WebSocket = WebSocket;

import { createSDK } from 'gdex.pro-sdk';
import { loadConfig } from './config';
import { createAuthenticatedSession } from './auth';

const ARBITRUM_CHAIN_ID = 42161;
const ARBITRUM_USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

async function testDepositMax() {
  console.log('💎 Testing Deposit with Available Balance\n');

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

  // Check GBOT balance (internal GDEX balance)
  const gbotBalance = await sdk.hyperLiquid.getGbotUsdcBalance(session.walletAddress);
  console.log(`💰 GBOT Balance: $${gbotBalance}`);
  console.log(`   (This might be what's used for deposit, not on-chain balance)\n`);

  // Try different amounts
  const amounts = [10, 9.5, 9, 8.5, 8];

  for (const amount of amounts) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Testing ${amount} USDC...`);

    const depositAmount = Math.floor(amount * 1e6);

    try {
      const result = await sdk.hyperLiquid.hlDeposit(
        session.walletAddress,
        ARBITRUM_USDC_ADDRESS,
        depositAmount.toString(),
        ARBITRUM_CHAIN_ID,
        session.tradingPrivateKey
      );

      if (result?.isSuccess) {
        console.log(`✅ SUCCESS with ${amount} USDC!`);
        console.log(`   ${result.message}`);

        // Check new balance
        const newHlBalance = await sdk.hyperLiquid.getHyperliquidUsdcBalance(session.walletAddress);
        console.log(`   New HyperLiquid Balance: $${newHlBalance}`);
        break;
      } else {
        console.log(`❌ Failed: ${result?.message}`);
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || err.message;
      console.log(`❌ Error: ${errorMsg}`);

      if (!errorMsg.includes('Insufficient')) {
        break; // Stop if it's a different error
      }
    }
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log('💡 Note: The error mentions "fee".');
  console.log('   GBOT balance might need buffer for transfer fees.');
  console.log('   Current GBOT balance: $' + gbotBalance);
  console.log('═'.repeat(60));
}

testDepositMax().catch(console.error);
