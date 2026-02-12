import { createAuthenticatedSession } from './auth';
import { loadConfig } from './config';
import { CryptoUtils } from 'gdex.pro-sdk';
import axios from 'axios';

async function testHLFinal() {
  console.log('🎯 HyperLiquid Order Creation - Final Test\n');
  console.log('='.repeat(70));
  
  const config = loadConfig();
  
  // Authenticate
  console.log('\n[1/7] 🔐 Authenticating...\n');
  const session = await createAuthenticatedSession({
    apiUrl: config.apiUrl,
    apiKey: config.apiKey,
    walletAddress: config.walletAddress,
    privateKey: config.privateKey,
    chainId: 42161,
  });
  
  console.log(`✅ Authenticated: ${session.walletAddress}`);
  
  // Check balance
  console.log('\n[2/7] 💰 Checking balance...\n');
  const balance = await session.sdk.hyperLiquid.getHyperliquidUsdcBalance(session.walletAddress);
  console.log(`   Balance: $${balance ?? 0}`);
  
  if (!balance || balance < 5) {
    console.log('\n❌ Need at least $5 USDC');
    return;
  }
  
  // Get price
  console.log('\n[3/7] 📊 Getting BTC price...\n');
  const btcPrice = await session.sdk.hyperLiquid.getHyperliquidMarkPrice('BTC');
  const price = typeof btcPrice === 'string' ? parseFloat(btcPrice) : btcPrice || 66000;
  console.log(`   BTC Price: $${price.toLocaleString()}`);
  
  // Calculate position
  const leverage = 5;
  const positionValue = balance * leverage;
  const positionSize = (positionValue / price).toFixed(4);
  const nonce = CryptoUtils.generateUniqueNumber().toString();
  
  console.log('\n[4/7] 📝 Preparing order...\n');
  console.log(`   Coin: BTC`);
  console.log(`   Direction: LONG`);
  console.log(`   Leverage: ${leverage}x`);
  console.log(`   Size: ${positionSize} BTC`);
  console.log(`   Price: $${price.toLocaleString()} (market)`);
  console.log(`   Nonce: ${nonce}`);
  
  // Prepare data as ARRAY (per backend docs)
  console.log('\n[5/7] 🔧 Preparing data array...\n');
  
  const dataArray = [
    "BTC",           // [0] coin
    true,            // [1] isLong
    price.toString(),// [2] price
    positionSize,    // [3] size
    false,           // [4] reduceOnly (false to open)
    nonce,           // [5] nonce
    "0",             // [6] tpPrice (no TP)
    "0",             // [7] slPrice (no SL)
    true             // [8] isMarket
  ];
  
  console.log('   Data array:', dataArray);
  
  // Also prepare as object for SDK encoding
  const orderInput = {
    coin: "BTC",
    isLong: true,
    price: price.toString(),
    size: positionSize,
    reduceOnly: false,
    nonce: nonce,
    tpPrice: "0",
    slPrice: "0",
    isMarket: true,
  };
  
  try {
    // Encode using SDK
    console.log('\n[6/7] 🔒 Encoding and signing...\n');
    const encodedData = CryptoUtils.encodeInputData("hl_create_order", orderInput);
    console.log(`   ✅ Encoded: ${encodedData.substring(0, 50)}...`);
    
    // Sign with correct pattern
    const userId = session.walletAddress.toLowerCase();
    const signMessage = `hl_create_order-${userId}-${encodedData}`;
    const signature = CryptoUtils.sign(signMessage, session.tradingPrivateKey);
    console.log(`   ✅ Signed with pattern: hl_create_order-{userId}-{encodedData}`);
    
    // Prepare payload
    const apiKey = config.apiKey.split(',')[0].trim();
    
    // Create unencrypted payload object
    const payloadObject = {
      userId: userId,
      data: encodedData,
      signature: signature,
      apiKey: apiKey
    };
    
    console.log(`   ✅ Payload prepared`);
    
    // Encrypt the entire payload
    const encryptedPayload = CryptoUtils.encrypt(JSON.stringify(payloadObject), apiKey);
    console.log(`   ✅ Encrypted payload`);
    
    // Make request
    console.log('\n[7/7] 🚀 Sending order...\n');
    // Backend docs specify /api/ path, not /v1/
    const baseUrl = config.apiUrl.replace('/v1', '');
    const endpoint = `${baseUrl}/api/hyperliquid/create_order`;
    console.log(`   POST ${endpoint}`);
    
    const response = await axios.post(endpoint, {
      computedData: encryptedPayload
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      }
    });
    
    console.log('\n   Response:', JSON.stringify(response.data, null, 2));
    
    if (response.data?.isSuccess) {
      console.log('\n🎉 SUCCESS! HyperLiquid leveraged position opened!');
      console.log(`   ${positionSize} BTC LONG at $${price.toLocaleString()}`);
      console.log(`   Position value: $${positionValue.toFixed(2)} (${leverage}x leverage)`);
    } else {
      console.log('\n❌ Order failed:', response.data);
    }
    
  } catch (error: any) {
    console.log(`\n❌ Error: ${error.message}`);
    if (error.response) {
      console.log(`   Status: ${error.response.status}`);
      console.log(`   Data:`, error.response.data);
    }
  }
  
  console.log('\n' + '='.repeat(70));
}

if (require.main === module) {
  testHLFinal().catch(console.error);
}

export { testHLFinal };
