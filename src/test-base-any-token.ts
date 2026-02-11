import { createAuthenticatedSession } from './auth';
import { loadConfig } from './config';
import { buyToken, sellToken, formatEthAmount } from './trading';

const BASE_CHAIN_ID = 8453;

async function testBaseAnyToken() {
  console.log('🎯 Base Network Trading Test (Relaxed Filters)\n');
  console.log('='.repeat(70));
  
  const config = loadConfig();
  
  const session = await createAuthenticatedSession({
    apiUrl: config.apiUrl,
    apiKey: config.apiKey,
    walletAddress: config.walletAddress,
    privateKey: config.privateKey,
    chainId: BASE_CHAIN_ID,
  });
  
  console.log('\n[1/3] 🔍 Finding ANY token with price > 0...\n');
  
  const tokens = await session.sdk.tokens.getNewestTokens(BASE_CHAIN_ID, 1, undefined, 100);
  console.log(`Total tokens: ${tokens?.length ?? 0}`);
  
  // Just need price > 0
  const tradeable = tokens?.filter(t => t.priceUsd > 0)
    .sort((a, b) => (b.liquidityUsd || 0) - (a.liquidityUsd || 0));
  
  console.log(`Tokens with price > 0: ${tradeable?.length ?? 0}`);
  
  if (tradeable && tradeable.length > 0) {
    const top5 = tradeable.slice(0, 5);
    console.log('\nTop 5 by liquidity:');
    top5.forEach((t, i) => {
      console.log(`  ${i+1}. ${t.symbol} - $${t.priceUsd.toFixed(8)} - Liq: $${t.liquidityUsd.toFixed(2)} - TX: ${t.txCount}`);
    });
    
    const targetToken = tradeable[0];
    console.log(`\n🎯 Testing with: ${targetToken.symbol}`);
    console.log(`   Address: ${targetToken.address}`);
    console.log(`   Price: $${targetToken.priceUsd}`);
    console.log(`   Liquidity: $${targetToken.liquidityUsd.toFixed(2)}`);
    
    // Try buy
    console.log('\n[2/3] 💰 Attempting BUY with 0.00001 ETH...\n');
    
    const buyResult = await buyToken(session, {
      tokenAddress: targetToken.address,
      amount: formatEthAmount(0.00001),
      chainId: BASE_CHAIN_ID,
    });
    
    console.log('Result:', JSON.stringify(buyResult, null, 2));
    
    if (buyResult?.isSuccess) {
      console.log('\n✅ BUY WORKED!');
      console.log(`TX: https://basescan.org/tx/${buyResult.hash}`);
      
      await new Promise(r => setTimeout(r, 5000));
      
      console.log('\n[3/3] 💸 Attempting SELL...\n');
      
      const sellResult = await sellToken(session, {
        tokenAddress: targetToken.address,
        amount: formatEthAmount(0.00001),
        chainId: BASE_CHAIN_ID,
      });
      
      console.log('Result:', JSON.stringify(sellResult, null, 2));
      
      if (sellResult?.isSuccess) {
        console.log('\n✅ SELL WORKED!');
        console.log(`TX: https://basescan.org/tx/${sellResult.hash}`);
      }
    }
  } else {
    console.log('\n❌ No tokens with price > 0 found');
  }
  
  console.log('\n' + '='.repeat(70));
}

if (require.main === module) {
  testBaseAnyToken().catch(console.error);
}

export { testBaseAnyToken };
