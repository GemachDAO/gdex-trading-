#!/usr/bin/env ts-node
/**
 * Verify Configuration and API Key Usage
 */

import { loadConfig } from './config';
import { getEffectiveApiKey } from './auth';

console.log('🔍 Verifying GDEX Configuration\n');
console.log('═'.repeat(60));

const config = loadConfig();

console.log('📋 Configuration Loaded:');
console.log(`  API URL: ${config.apiUrl}`);
console.log(`  API Key (raw): ${config.apiKey}`);

// Check if API key has comma-separated values
if (config.apiKey.includes(',')) {
  const keys = config.apiKey.split(',').map(k => k.trim());
  console.log(`  API Keys Found: ${keys.length}`);
  keys.forEach((key, i) => {
    console.log(`    Key ${i + 1}: ${key}`);
  });
}

const effectiveKey = getEffectiveApiKey(config.apiKey);
console.log(`\n🔑 Effective API Key Being Used:`);
console.log(`  ${effectiveKey}`);

console.log(`\n💼 Wallet Configuration:`);
console.log(`  Address: ${config.walletAddress}`);
console.log(`  Private Key: ${config.privateKey.slice(0, 10)}...${config.privateKey.slice(-8)}`);
console.log(`  Has 0x prefix: ${config.privateKey.startsWith('0x') ? 'Yes (will be stripped for SDK)' : 'No'}`);

console.log(`\n🌐 Chain Configuration:`);
console.log(`  Default Chain ID: ${config.defaultChainId}`);

const chainNames: Record<number, string> = {
  1: 'Ethereum',
  8453: 'Base',
  56: 'BSC',
  622112261: 'Solana',
  146: 'Sonic',
  1313131213: 'Sui',
  6900: 'Nibiru',
  80094: 'Berachain',
  10: 'Optimism',
  42161: 'Arbitrum',
  252: 'Fraxtal',
};

console.log(`  Chain Name: ${chainNames[config.defaultChainId] || 'Unknown'}`);

console.log(`\n📊 Session Key:`);
console.log(`  Configured: ${config.sessionKey ? 'Yes' : 'No (will auto-login if private key is set)'}`);

console.log('\n' + '═'.repeat(60));

// Verify all required fields
const issues: string[] = [];

if (!config.apiKey) {
  issues.push('❌ GDEX_API_KEY is not set');
}

if (!config.walletAddress) {
  issues.push('❌ WALLET_ADDRESS is not set');
}

if (!config.privateKey) {
  issues.push('❌ PRIVATE_KEY is not set');
}

if (!config.walletAddress.startsWith('0x')) {
  issues.push('⚠️  WALLET_ADDRESS should start with 0x (EVM format)');
}

if (config.privateKey && !config.privateKey.match(/^(0x)?[0-9a-fA-F]{64}$/)) {
  issues.push('⚠️  PRIVATE_KEY format may be incorrect (should be 64 hex characters)');
}

if (issues.length > 0) {
  console.log('🚨 Configuration Issues Found:\n');
  issues.forEach(issue => console.log(`  ${issue}`));
} else {
  console.log('✅ Configuration is valid!');
  console.log('   All required fields are set and properly formatted.');
}

console.log('\n' + '═'.repeat(60));
