#!/usr/bin/env ts-node
/**
 * Check Arbitrum USDC Balance
 *
 * Directly queries Arbitrum blockchain to check USDC and ETH balances
 */

import { ethers } from 'ethers';
import { loadConfig } from './config';

const ARBITRUM_RPC = 'https://arb1.arbitrum.io/rpc';
const ARBITRUM_USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

// USDC ABI (minimal - just balanceOf)
const USDC_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)'
];

async function checkBalances() {
  console.log('🔍 Checking Arbitrum On-Chain Balances\n');
  console.log('═'.repeat(60));

  const config = loadConfig();

  if (!config.walletAddress) {
    console.error('❌ WALLET_ADDRESS not set in .env');
    process.exit(1);
  }

  console.log(`📋 Wallet: ${config.walletAddress}`);
  console.log(`🌐 Network: Arbitrum One`);
  console.log(`💱 USDC Contract: ${ARBITRUM_USDC_ADDRESS}`);
  console.log('═'.repeat(60));

  try {
    // Connect to Arbitrum
    const provider = new ethers.JsonRpcProvider(ARBITRUM_RPC);

    // Check ETH balance
    console.log('\n💰 Checking ETH balance...');
    const ethBalance = await provider.getBalance(config.walletAddress);
    const ethFormatted = ethers.formatEther(ethBalance);
    console.log(`  ETH Balance: ${ethFormatted} ETH`);

    if (parseFloat(ethFormatted) < 0.001) {
      console.log('  ⚠️  Warning: Low ETH balance, may not be enough for gas fees');
    } else {
      console.log('  ✅ Sufficient ETH for gas fees');
    }

    // Check USDC balance
    console.log('\n💵 Checking USDC balance...');
    const usdcContract = new ethers.Contract(
      ARBITRUM_USDC_ADDRESS,
      USDC_ABI,
      provider
    );

    const usdcBalance = await usdcContract.balanceOf(config.walletAddress);
    const decimals = await usdcContract.decimals();
    const symbol = await usdcContract.symbol();
    const usdcFormatted = ethers.formatUnits(usdcBalance, decimals);

    console.log(`  ${symbol} Balance: ${usdcFormatted} ${symbol}`);
    console.log(`  Raw Units: ${usdcBalance.toString()} (${decimals} decimals)`);

    if (parseFloat(usdcFormatted) > 0) {
      console.log('  ✅ USDC available for deposit');
    } else {
      console.log('  ❌ No USDC balance - need to get USDC on Arbitrum first');
    }

    // Summary
    console.log('\n' + '═'.repeat(60));
    console.log('📊 SUMMARY');
    console.log('═'.repeat(60));
    console.log(`ETH:  ${ethFormatted} ETH`);
    console.log(`USDC: ${usdcFormatted} USDC`);

    if (parseFloat(ethFormatted) >= 0.001 && parseFloat(usdcFormatted) > 0) {
      console.log('\n✅ Wallet is ready for HyperLiquid deposit!');
      console.log('   You have both USDC and ETH on Arbitrum.');
    } else {
      console.log('\n⚠️  Wallet NOT ready for deposit:');
      if (parseFloat(ethFormatted) < 0.001) {
        console.log('   - Need more ETH for gas fees (get from bridge or exchange)');
      }
      if (parseFloat(usdcFormatted) === 0) {
        console.log('   - Need USDC on Arbitrum (bridge from mainnet or buy on Arbitrum DEX)');
      }
    }
    console.log('═'.repeat(60));

  } catch (err: any) {
    console.error('\n❌ Error checking balances:', err.message);
    console.log('\nPossible issues:');
    console.log('  - RPC connection failed (network issue)');
    console.log('  - Invalid wallet address');
    console.log('  - Contract address incorrect');
  }
}

checkBalances().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
