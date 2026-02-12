import { createAuthenticatedSession } from './auth';
import { loadConfig } from './config';
import { CryptoUtils } from 'gdex.pro-sdk';

async function testNewHLEndpoint() {
  console.log('🧪 Testing New HyperLiquid Endpoint from Backend Docs\n');
  console.log('='.repeat(70));
  
  const config = loadConfig();
  
  // 1. Authenticate
  console.log('\n[1/5] 🔐 Authenticating...\n');
  const session = await createAuthenticatedSession({
    apiUrl: config.apiUrl,
    apiKey: config.apiKey,
    walletAddress: config.walletAddress,
    privateKey: config.privateKey,
    chainId: 42161,
  });
  
  console.log(`✅ Authenticated`);
  console.log(`   Wallet: ${session.walletAddress}`);
  
  // 2. Check balance
  console.log('\n[2/5] 💰 Checking balance...\n');
  const balance = await session.sdk.hyperLiquid.getHyperliquidUsdcBalance(session.walletAddress);
  console.log(`   Balance: $${balance ?? 0}`);
  
  if (!balance || balance < 5) {
    console.log('\n❌ Need at least $5 USDC in HyperLiquid');
    return;
  }
  
  // 3. Get BTC price
  console.log('\n[3/5] 📊 Getting BTC price...\n');
  const btcPrice = await session.sdk.hyperLiquid.getHyperliquidMarkPrice('BTC');
  const price = typeof btcPrice === 'string' ? parseFloat(btcPrice) : btcPrice || 66000;
  console.log(`   BTC Price: $${price.toLocaleString()}`);
  
  // 4. Prepare order data
  const leverage = 5; // Conservative 5x
  const positionValue = balance * leverage;
  const positionSize = (positionValue / price).toFixed(4);
  
  console.log('\n[4/5] 📝 Preparing order...\n');
  console.log(`   Leverage: ${leverage}x`);
  console.log(`   Position Value: $${positionValue.toFixed(2)}`);
  console.log(`   Position Size: ${positionSize} BTC`);
  console.log(`   Entry Price: $${price.toLocaleString()}`);
  
  // 5. Try new endpoint approach
  console.log('\n[5/5] 🚀 Testing NEW endpoint: POST /api/hyperliquid/create_order\n');
  
  try {
    // Prepare order data according to backend docs
    const orderData = {
      coin: "BTC",
      isLong: true,
      price: price.toString(),
      size: positionSize,
      reduceOnly: false, // Open new position
      nonce: CryptoUtils.generateUniqueNumber(),
    };
    
    console.log('   Order data:', orderData);
    
    // This is where we need to:
    // 1. Encode the data (hl_create_order format)
    // 2. Sign with pattern: hl_create_order-{userId}-{encodedData}
    // 3. Encrypt with apiKey
    // 4. POST to /api/hyperliquid/create_order
    
    // Let me check if SDK has this encoding method
    console.log('\n   🔍 Checking SDK for hl_create_order encoding...');
    console.log('   Note: We may need to call the HTTP endpoint directly');
    
    // Try direct HTTP call
    const axios = require('axios');
    const apiKey = config.apiKey.split(',')[0].trim();
    
    // We need to find the userId first
    const userInfo = await session.sdk.user.getUserInfo(
      session.walletAddress,
      session.encryptedSessionKey,
      42161
    );
    
    console.log(`\n   User ID: ${(userInfo as any)?.id || 'Not found in userInfo'}`);
    console.log(`   User Info keys:`, Object.keys(userInfo || {}));
    
    // The backend docs say we need:
    // - userId
    // - encoded order data
    // - signature of hl_create_order-{userId}-{encodedData}
    // - apiKey
    
    console.log('\n   ⚠️  Need to implement:');
    console.log('   1. Get userId from backend');
    console.log('   2. Encode order data (hl_create_order format)');
    console.log('   3. Sign: hl_create_order-{userId}-{encodedData}');
    console.log('   4. Encrypt computedData with apiKey');
    console.log('   5. POST to /api/hyperliquid/create_order');
    
  } catch (error: any) {
    console.log(`   ❌ Error: ${error.message}`);
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('📋 Analysis:');
  console.log('='.repeat(70));
  console.log(`
This is a DIFFERENT endpoint than what the SDK uses!

Current SDK endpoint (broken):
  - Uses hlCreateOrder() which calls some internal SDK method
  - Returns "Sent order failed"

New backend endpoint (from docs):
  - POST /api/hyperliquid/create_order
  - Uses hl_create_order encoding
  - Signs with: hl_create_order-{userId}-{encodedData}
  - Includes apiKey in computedData

Next steps:
  1. Find or implement hl_create_order encoding
  2. Get userId from backend
  3. Implement the signing pattern
  4. Make direct HTTP POST request

This could be the solution! 🎯
  `);
  console.log('='.repeat(70));
}

if (require.main === module) {
  testNewHLEndpoint().catch(console.error);
}

export { testNewHLEndpoint };
