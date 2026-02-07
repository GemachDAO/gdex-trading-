import { createAuthenticatedSession } from './auth';
import { buyToken } from './trading';
import { getTrendingTokens, getNewestTokens } from './market';
import { loadConfig } from './config';

async function testSolanaTrade() {
  console.log('🧪 Testing Solana Trade\n');

  try {
    // Load configuration
    const config = loadConfig();
    const apiKey = config.apiKey.split(',')[0].trim();

    console.log('[1/4] 🔐 Authenticating for Solana...');
    const session = await createAuthenticatedSession({
      apiUrl: config.apiUrl,
      apiKey: apiKey,
      walletAddress: config.walletAddress,
      privateKey: config.privateKey,
      chainId: 622112261, // Solana
    });
    console.log('      ✅ Authenticated\n');

    console.log('[2/4] 📊 Getting tokens...');

    // Try trending tokens first
    let tokens = await getTrendingTokens(session.sdk, 5);
    let tokenSource = 'Trending';

    // If no trending, try newest
    if (tokens.length === 0) {
      console.log('      No trending tokens, trying newest...');
      tokens = await getNewestTokens(session.sdk, 622112261, 5);
      tokenSource = 'Newest';
    }

    // If still no tokens, use a fallback well-known Solana token
    if (tokens.length === 0) {
      console.log('      No tokens from API, using fallback token...');
      tokens = [{
        address: 'So11111111111111111111111111111111111111112', // Wrapped SOL
        symbol: 'WSOL',
        name: 'Wrapped SOL'
      }];
      tokenSource = 'Fallback';
    }

    const token = tokens[0];
    console.log(`      ✅ Selected (${tokenSource}): ${token.symbol || 'Unknown'}`);
    console.log(`         Address: ${token.address}`);
    console.log(`         Chain: Solana (622112261)\n`);

    console.log('[3/4] 💰 Checking if we have SOL balance...');
    console.log('      Note: This test requires SOL in your wallet');
    console.log(`      Wallet: ${session.walletAddress}\n`);

    console.log('[4/4] 🛒 Executing buy order...');
    const buyAmount = '5000000'; // 0.005 SOL (5 million lamports)
    console.log(`      Amount: 0.005 SOL (${buyAmount} lamports)`);
    console.log(`      Token: ${token.address}`);
    console.log(`      Using session private key: ${session.tradingPrivateKey.substring(0, 10)}...`);

    const result = await buyToken(session, {
      amount: buyAmount,
      tokenAddress: token.address,
      chainId: 622112261
    });

    console.log('\n════════════════════════════════════════════════════════════');
    if (result.isSuccess) {
      console.log('✅ Trade Successful!');
      console.log(`   Transaction: ${result.transactionHash || 'N/A'}`);
      console.log(`   Status: ${result.message || 'Completed'}`);
    } else {
      console.log('❌ Trade Failed');
      console.log(`   Error: ${result.message}`);
      console.log(`   Code: ${result.errorCode || 'N/A'}`);

      if (result.message?.includes('Insufficient balance')) {
        console.log('\n💡 Tip: You need SOL in your wallet to trade on Solana');
        console.log(`   Wallet: ${session.walletAddress}`);
      }
    }
    console.log('════════════════════════════════════════════════════════════\n');

  } catch (error: any) {
    console.error('\n❌ Error during test:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
  }
}

// Run if called directly
if (require.main === module) {
  testSolanaTrade().catch(console.error);
}

export { testSolanaTrade };
