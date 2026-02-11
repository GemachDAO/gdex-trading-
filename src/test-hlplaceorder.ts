import { createAuthenticatedSession } from './auth';
import { loadConfig } from './config';
import WebSocket from 'ws';

// Polyfill WebSocket for Node.js
(globalThis as any).WebSocket = WebSocket;

async function testHlPlaceOrder() {
  console.log('🚀 Testing HyperLiquid hlPlaceOrder (reduceOnly=false)\n');

  try {
    const config = loadConfig();
    const apiKey = config.apiKey.split(',')[0].trim();

    console.log('[1/4] 🔐 Authenticating for HyperLiquid (Arbitrum)...');
    const session = await createAuthenticatedSession({
      apiUrl: config.apiUrl,
      apiKey: apiKey,
      walletAddress: config.walletAddress,
      privateKey: config.privateKey,
      chainId: 42161, // Arbitrum for HyperLiquid
    });
    console.log('      ✅ Authenticated\n');

    console.log('[2/4] 💰 Checking HyperLiquid balance...');
    const balance = await session.sdk.hyperLiquid.getHyperliquidUsdcBalance(
      session.walletAddress
    );
    console.log(`      Balance: $${balance ?? 0}\n`);

    console.log('[3/4] 📊 Getting BTC market price...');
    const markPrice = await session.sdk.hyperLiquid.getHyperliquidMarkPrice('BTC');
    const btcPrice = typeof markPrice === 'string' ? parseFloat(markPrice) : markPrice || 66000;
    console.log(`      Current BTC price: $${btcPrice.toLocaleString()}\n`);

    console.log('[4/4] 🎯 Placing hlPlaceOrder with reduceOnly=false...');

    const positionSize = 0.003; // Small position

    console.log('      Parameters:');
    console.log(`      - address: ${session.walletAddress}`);
    console.log(`      - coin: BTC`);
    console.log(`      - isLong: true (LONG)`);
    console.log(`      - price: ${btcPrice.toString()}`);
    console.log(`      - size: ${positionSize.toString()}`);
    console.log(`      - reduceOnly: false (OPEN POSITION)`);
    console.log(`      - privateKey: ${session.tradingPrivateKey.substring(0, 10)}...\n`);

    console.log('      Executing hlPlaceOrder...\n');

    const result = await session.sdk.hyperLiquid.hlPlaceOrder(
      session.walletAddress,
      'BTC',
      true,                           // isLong
      btcPrice.toString(),            // price (as string)
      positionSize.toString(),        // size (as string)
      false,                          // reduceOnly = FALSE (trying to OPEN position)
      session.tradingPrivateKey
    );

    console.log('════════════════════════════════════════════════════════════');
    if (result && result.isSuccess) {
      console.log('✅ hlPlaceOrder SUCCESS!');
      console.log('   Result:', JSON.stringify(result, null, 2));
    } else {
      console.log('❌ hlPlaceOrder FAILED');
      console.log('   Result:', JSON.stringify(result, null, 2));
    }
    console.log('════════════════════════════════════════════════════════════\n');

  } catch (error: any) {
    console.error('\n❌ Exception caught:', error.message);
    if (error.response?.data) {
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
  }
}

if (require.main === module) {
  testHlPlaceOrder().catch(console.error);
}

export { testHlPlaceOrder };
