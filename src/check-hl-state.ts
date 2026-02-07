import { createAuthenticatedSession } from './auth';
import { loadConfig } from './config';
import WebSocket from 'ws';

(globalThis as any).WebSocket = WebSocket;

async function checkHLState() {
  console.log('🔍 Checking HyperLiquid Account State\n');

  try {
    const config = loadConfig();
    const apiKey = config.apiKey.split(',')[0].trim();

    console.log('🔐 Authenticating...');
    const session = await createAuthenticatedSession({
      apiUrl: config.apiUrl,
      apiKey: apiKey,
      walletAddress: config.walletAddress,
      privateKey: config.privateKey,
      chainId: 42161,
    });
    console.log('✅ Authenticated\n');

    console.log('📊 Fetching clearinghouse state...\n');
    const state = await session.sdk.hyperLiquid.getHyperliquidClearinghouseState(
      session.walletAddress
    );

    console.log('════════════════════════════════════════════════════════════');
    console.log('HyperLiquid Clearinghouse State:\n');
    console.log(JSON.stringify(state, null, 2));
    console.log('════════════════════════════════════════════════════════════\n');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

if (require.main === module) {
  checkHLState().catch(console.error);
}

export { checkHLState };
