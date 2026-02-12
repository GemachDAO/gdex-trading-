import { createAuthenticatedSession } from './auth';
import { loadConfig } from './config';
import { CryptoUtils } from 'gdex.pro-sdk';
import axios from 'axios';

async function testCorrectHLEndpoint() {
  console.log('🎯 Testing CORRECT HyperLiquid Endpoint\n');
  console.log('='.repeat(70));
  
  const config = loadConfig();
  
  // Authenticate
  console.log('\n[1/6] 🔐 Authenticating...\n');
  const session = await createAuthenticatedSession({
    apiUrl: config.apiUrl,
    apiKey: config.apiKey,
    walletAddress: config.walletAddress,
    privateKey: config.privateKey,
    chainId: 42161,
  });
  
  console.log(`✅ Authenticated`);
  
  // Check balance  
  console.log('\n[2/6] 💰 Checking balance...\n');
  const balance = await session.sdk.hyperLiquid.getHyperliquidUsdcBalance(session.walletAddress);
  console.log(`   Balance: $${balance ?? 0}`);
  
  if (!balance || balance < 5) {
    console.log('\n❌ Need at least $5 USDC');
    return;
  }
  
  // Get price
  console.log('\n[3/6] 📊 Getting BTC price...\n');
  const btcPrice = await session.sdk.hyperLiquid.getHyperliquidMarkPrice('BTC');
  const price = typeof btcPrice === 'string' ? parseFloat(btcPrice) : btcPrice || 66000;
  console.log(`   BTC Price: $${price.toLocaleString()}`);
  
  // Prepare order
  const leverage = 5;
  const positionValue = balance * leverage;
  const positionSize = (positionValue / price).toFixed(4);
  const nonce = CryptoUtils.generateUniqueNumber();
  
  console.log('\n[4/6] 📝 Preparing order...\n');
  console.log(`   Leverage: ${leverage}x`);
  console.log(`   Size: ${positionSize} BTC`);
  console.log(`   Nonce: ${nonce}`);
  
  // Encode order data using SDK's encodeInputData
  console.log('\n[5/6] 🔧 Encoding order with SDK...\n');
  
  const orderInput = {
    coin: "BTC",
    isLong: true,
    price: price.toString(),
    size: positionSize,
    reduceOnly: false,
    nonce: nonce.toString(),
    tpPrice: "0", // No TP
    slPrice: "0", // No SL
    isMarket: true,
  };
  
  console.log('   Order input:', orderInput);
  
  try {
    const encodedData = CryptoUtils.encodeInputData("hl_create_order", orderInput);
    console.log(`   ✅ Encoded data: ${encodedData.substring(0, 50)}...`);
    
    // Now we need userId - try to get from backend
    console.log('\n[6/6] 🚀 Attempting order creation...\n');
    
    // Sign the data
    const signMessage = `hl_create_order-${session.walletAddress}-${encodedData}`;
    const signature = CryptoUtils.sign(signMessage, session.tradingPrivateKey);
    console.log(`   ✅ Signed`);

    // Try manual payload construction as per backend docs
    const apiKey = config.apiKey.split(',')[0].trim();

    const computedDataObject = {
      userId: session.walletAddress.toLowerCase(), // Try lowercase
      data: encodedData,
      signature: signature,
      apiKey: apiKey
    };

    console.log(`   ✅ Prepared computedData object`);

    // Make direct HTTP POST to /api/hyperliquid/create_order
    const endpoint = `${config.apiUrl}/hyperliquid/create_order`;
    console.log(`   📡 POST ${endpoint}`);

    const response = await axios.post(endpoint, {
      computedData: computedDataObject
    }, {
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    console.log('\n   Response:', response.data);
    
    if (response.data?.isSuccess) {
      console.log('\n🎉 SUCCESS! HyperLiquid order created!');
    } else {
      console.log('\n❌ Failed:', response.data);
    }
    
  } catch (error: any) {
    console.log(`\n   ❌ Error: ${error.message}`);
    if (error.response) {
      console.log(`   Status: ${error.response.status}`);
      console.log(`   Data:`, error.response.data);
    }
  }
  
  console.log('\n' + '='.repeat(70));
}

if (require.main === module) {
  testCorrectHLEndpoint().catch(console.error);
}

export { testCorrectHLEndpoint };
