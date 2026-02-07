#!/usr/bin/env ts-node
/**
 * Correct GDEX Deposit Flow
 *
 * 1. Get custodial deposit address from GDEX
 * 2. Send USDC to that address on Arbitrum
 * 3. GDEX automatically deposits to HyperLiquid
 */

import WebSocket from 'ws';
(globalThis as any).WebSocket = WebSocket;

import { createSDK } from 'gdex.pro-sdk';
import { loadConfig } from './config';
import { createAuthenticatedSession } from './auth';
import { ethers } from 'ethers';

const ARBITRUM_CHAIN_ID = 42161;
const ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const MIN_DEPOSIT = 5; // USDC

async function depositCorrectFlow(amountUSDC: number) {
  console.log('💎 GDEX Deposit - Correct Flow\n');
  console.log('═'.repeat(60));

  if (amountUSDC < MIN_DEPOSIT) {
    console.error(`❌ Error: Minimum deposit is ${MIN_DEPOSIT} USDC`);
    console.error(`   You specified: ${amountUSDC} USDC`);
    process.exit(1);
  }

  const config = loadConfig();
  const apiKey = config.apiKey.split(',')[0].trim();
  const sdk = createSDK(config.apiUrl, { apiKey });

  console.log(`📋 Deposit Details:`);
  console.log(`   Amount: ${amountUSDC} USDC`);
  console.log(`   Your Wallet: ${config.walletAddress}`);
  console.log('═'.repeat(60));

  // Step 1: Authenticate
  console.log('\n[1/5] 🔐 Authenticating...');
  const session = await createAuthenticatedSession({
    apiUrl: config.apiUrl,
    apiKey: apiKey,
    walletAddress: config.walletAddress,
    privateKey: config.privateKey,
    chainId: ARBITRUM_CHAIN_ID,
  });
  console.log('      ✅ Authenticated');

  // Step 2: Get GDEX deposit address
  console.log('\n[2/5] 📍 Getting GDEX deposit address...');

  let depositAddress: string;
  try {
    // Try getDepositAddress (if available in SDK)
    depositAddress = await (sdk.user as any).getDepositAddress(
      session.walletAddress,
      session.encryptedSessionKey,
      ARBITRUM_CHAIN_ID
    );
    console.log(`      ✅ Deposit Address: ${depositAddress}`);
  } catch (err: any) {
    // Fallback: Get from user info
    console.log('      Trying getUserInfo instead...');
    const userInfo = await sdk.user.getUserInfo(
      session.walletAddress,
      session.encryptedSessionKey,
      ARBITRUM_CHAIN_ID
    );

    depositAddress = (userInfo as any)?.address || (userInfo as any)?.depositAddress;

    if (depositAddress) {
      console.log(`      ✅ Deposit Address: ${depositAddress}`);
    } else {
      console.error('      ❌ Could not get deposit address');
      console.log('      User Info:', JSON.stringify(userInfo, null, 2));
      process.exit(1);
    }
  }

  // Step 3: Check current balance
  console.log('\n[3/5] 💰 Checking balances...');
  const hlBalanceBefore = await sdk.hyperLiquid.getHyperliquidUsdcBalance(session.walletAddress);
  console.log(`      HyperLiquid Balance (before): $${hlBalanceBefore ?? 0}`);

  // Step 4: Send USDC to deposit address
  console.log(`\n[4/5] 📤 Sending ${amountUSDC} USDC to deposit address...`);
  console.log(`      From: ${config.walletAddress}`);
  console.log(`      To: ${depositAddress}`);

  try {
    // Setup provider and signer
    const provider = new ethers.JsonRpcProvider('https://arb1.arbitrum.io/rpc');
    const wallet = new ethers.Wallet(
      config.privateKey.startsWith('0x') ? config.privateKey.slice(2) : config.privateKey,
      provider
    );

    // USDC contract
    const usdcContract = new ethers.Contract(
      ARBITRUM_USDC,
      ['function transfer(address to, uint256 amount) returns (bool)'],
      wallet
    );

    // Send transfer
    const amount = ethers.parseUnits(amountUSDC.toString(), 6);
    console.log(`      Amount in units: ${amount.toString()}`);

    const tx = await usdcContract.transfer(depositAddress, amount);
    console.log(`      ✅ Transaction sent: ${tx.hash}`);
    console.log(`      ⏳ Waiting for confirmation...`);

    const receipt = await tx.wait();
    console.log(`      ✅ Transaction confirmed! Block: ${receipt.blockNumber}`);

  } catch (err: any) {
    console.error(`\n❌ Transfer failed: ${err.message}`);
    if (err.code === 'INSUFFICIENT_FUNDS') {
      console.error('   Not enough ETH for gas fees');
    }
    process.exit(1);
  }

  // Step 5: Wait for GDEX to process
  console.log('\n[5/5] ⏳ Waiting for GDEX to process deposit...');
  console.log('      This typically takes 1-10 minutes');

  let attempts = 0;
  const maxAttempts = 20;

  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds

    const hlBalanceAfter = await sdk.hyperLiquid.getHyperliquidUsdcBalance(session.walletAddress);

    if (hlBalanceAfter && hlBalanceAfter > (hlBalanceBefore || 0)) {
      console.log(`\n${'═'.repeat(60)}`);
      console.log('🎉 DEPOSIT SUCCESSFUL!');
      console.log(`✅ New HyperLiquid Balance: $${hlBalanceAfter}`);
      console.log(`📈 Increase: $${hlBalanceAfter - (hlBalanceBefore || 0)}`);
      console.log('═'.repeat(60));
      return;
    }

    attempts++;
    console.log(`      Attempt ${attempts}/${maxAttempts} - Balance: $${hlBalanceAfter ?? 0} (waiting...)`);
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log('⏱️  Deposit still processing...');
  console.log('   Your USDC was sent successfully to the deposit address.');
  console.log('   GDEX is processing the HyperLiquid deposit.');
  console.log('   Check your balance again in a few minutes.');
  console.log('═'.repeat(60));
}

// Parse amount
const args = process.argv.slice(2);
const amount = args[0] ? parseFloat(args[0]) : MIN_DEPOSIT;

if (isNaN(amount) || amount < MIN_DEPOSIT) {
  console.error(`Usage: npm run deposit:correct [amount]`);
  console.error(`Minimum: ${MIN_DEPOSIT} USDC`);
  console.error(`Example: npm run deposit:correct 5`);
  process.exit(1);
}

depositCorrectFlow(amount).catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
