import { createAuthenticatedSession } from './auth';
import { loadConfig } from './config';
import WebSocket from 'ws';

(globalThis as any).WebSocket = WebSocket;

async function checkHyperLiquidPositions() {
  console.log('📊 Checking HyperLiquid Positions\n');

  try {
    const config = loadConfig();
    const apiKey = config.apiKey.split(',')[0].trim();

    console.log('[1/2] 🔐 Authenticating...');
    const session = await createAuthenticatedSession({
      apiUrl: config.apiUrl,
      apiKey: apiKey,
      walletAddress: config.walletAddress,
      privateKey: config.privateKey,
      chainId: 42161, // Arbitrum
    });
    console.log('      ✅ Authenticated\n');

    console.log('[2/2] 📈 Fetching account info...');
    const userStats = await session.sdk.hyperLiquid.getHyperliquidUserStats(
      session.walletAddress
    );

    console.log('\n════════════════════════════════════════════════════════════');
    console.log('📊 HyperLiquid Account Info:\n');
    console.log(JSON.stringify(userStats, null, 2));

    console.log('\n💡 IMPORTANT: GDEX currently only supports CLOSING positions via API');
    console.log('   Error code 102: "Now only support close position"');
    console.log('\n   To open leveraged positions:');
    console.log('   1. Use HyperLiquid app: https://app.hyperliquid.xyz');
    console.log('   2. Or use HyperLiquid API directly');
    console.log('   3. Then use GDEX API to close positions');
    console.log('════════════════════════════════════════════════════════════\n');

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
  }
}

if (require.main === module) {
  checkHyperLiquidPositions().catch(console.error);
}

export { checkHyperLiquidPositions };
