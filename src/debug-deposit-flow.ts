#!/usr/bin/env ts-node
import WebSocket from 'ws';
(globalThis as any).WebSocket = WebSocket;

import { createSDK } from 'gdex.pro-sdk';
import { loadConfig } from './config';
import { createAuthenticatedSession } from './auth';
import { ethers } from 'ethers';

const ARBITRUM_CHAIN_ID = 42161;
const ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

async function debug() {
  const config = loadConfig();
  const apiKey = config.apiKey.split(',')[0].trim();
  const sdk = createSDK(config.apiUrl, { apiKey });

  console.log('🔍 Debugging Deposit Flow\n');
  console.log('═'.repeat(60));

  const session = await createAuthenticatedSession({
    apiUrl: config.apiUrl,
    apiKey: apiKey,
    walletAddress: config.walletAddress,
    privateKey: config.privateKey,
    chainId: ARBITRUM_CHAIN_ID,
  });

  console.log('📊 All Balances:\n');

  const gbotBalance = await sdk.hyperLiquid.getGbotUsdcBalance(session.walletAddress);
  console.log(`1. GBOT Balance: $${gbotBalance}`);

  const hlBalance = await sdk.hyperLiquid.getHyperliquidUsdcBalance(session.walletAddress);
  console.log(`2. HyperLiquid Balance: $${hlBalance}`);

  const provider = new ethers.JsonRpcProvider('https://arb1.arbitrum.io/rpc');
  const usdcContract = new ethers.Contract(
    ARBITRUM_USDC,
    ['function balanceOf(address) view returns (uint256)'],
    provider
  );
  const onChainBalance = await usdcContract.balanceOf(config.walletAddress);
  const onChainFormatted = ethers.formatUnits(onChainBalance, 6);
  console.log(`3. On-chain Arbitrum USDC: ${onChainFormatted} USDC`);

  const ethBalance = await provider.getBalance(config.walletAddress);
  console.log(`4. On-chain Arbitrum ETH: ${ethers.formatEther(ethBalance)} ETH`);

  console.log('\n' + '═'.repeat(60));
  console.log('💡 Deposit Flow Question:');
  console.log(`\n   hlDeposit() moves funds from WHERE to HyperLiquid?`);
  console.log(`\n   Option A: Arbitrum Blockchain → HyperLiquid`);
  console.log(`     - Would use on-chain USDC: ${onChainFormatted} USDC`);
  console.log(`     - Would deduct gas from ETH`);
  console.log(`\n   Option B: GBOT Internal → HyperLiquid`);
  console.log(`     - Would use GBOT balance: $${gbotBalance}`);
  console.log(`     - Internal GDEX transfer (no gas)`);
  console.log('═'.repeat(60));
}

debug().catch(console.error);
