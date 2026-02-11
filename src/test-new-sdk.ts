import { GdexClient } from '@gdex/sdk';
import { loadConfig } from './config';
import { ethers } from 'ethers';

async function testNewSDK() {
  console.log('🧪 Testing new @gdex/sdk\n');
  console.log('=' .repeat(60));

  const config = loadConfig();
  const apiKey = config.apiKey.split(',')[0].trim();

  console.log('\n[1/4] 📡 Initializing client...');
  const client = new GdexClient({
    apiKey: apiKey,
  });
  console.log('✅ Client initialized');

  console.log('\n[2/4] 🌐 Testing connectivity (getAssets)...');
  try {
    const assets = await client.getAssets();
    console.log(`✅ API is LIVE! Found ${assets.length} assets`);
    console.log('\nSample assets:');
    assets.slice(0, 5).forEach(a => {
      console.log(`  - ${a.coin} (max leverage: ${a.maxLeverage}x)`);
    });

    // Filter HIP-3 assets
    const hip3Assets = assets.filter(a => client.isHip3Asset(a.coin));
    console.log(`\n🎯 HIP-3 assets: ${hip3Assets.length} found`);
    if (hip3Assets.length > 0) {
      hip3Assets.slice(0, 3).forEach(a => {
        console.log(`  - ${a.coin}`);
      });
    }
  } catch (error: any) {
    if (error.code === 'ENOTFOUND' || error.message.includes('ENOTFOUND')) {
      console.log('❌ API not live yet (ENOTFOUND: api.gdex.io)');
      console.log('   DNS not resolved - backend not deployed yet');
      return;
    } else if (error.code === 'ECONNREFUSED') {
      console.log('❌ API not responding (ECONNREFUSED)');
      console.log('   Server exists but not accepting connections');
      return;
    } else {
      console.log(`❌ Error: ${error.message}`);
      console.log('   Code:', error.code);
      return;
    }
  }

  console.log('\n[3/4] 📊 Testing market data...');
  try {
    const btcInfo = await client.getMarketInfo('BTC');
    if (btcInfo) {
      console.log('✅ BTC market info:');
      console.log(`  Price: $${btcInfo.price}`);
      console.log(`  24h Change: ${btcInfo.change24h}%`);
      console.log(`  Volume: $${btcInfo.volume24h}`);
    } else {
      console.log('⚠️  No market info available');
    }
  } catch (error: any) {
    console.log(`❌ Market info error: ${error.message}`);
  }

  console.log('\n[4/4] 👤 Testing user info (requires auth)...');
  try {
    // Generate signature for authentication
    const wallet = new ethers.Wallet(config.privateKey);
    const nonce = Date.now();
    const message = `Login to GDEX: ${config.walletAddress.toLowerCase()} ${nonce}`;
    const signature = await wallet.signMessage(message);

    const userInfo = await client.getUserInfo(
      config.walletAddress,
      signature, // Using signature as session key (may need adjustment)
      42161
    );

    if (userInfo) {
      console.log('✅ User info retrieved:');
      console.log(`  Deposit Address: ${userInfo.address}`);
      console.log(`  Balance: $${userInfo.balance}`);
      console.log(`  Referral Code: ${userInfo.refCode}`);
    } else {
      console.log('⚠️  No user info available');
    }
  } catch (error: any) {
    console.log(`⚠️  User info error: ${error.message}`);
    console.log('   (This may require proper session authentication)');
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ NEW SDK API IS LIVE!');
  console.log('='.repeat(60));
  console.log('\n💡 Next steps:');
  console.log('   1. Implement proper authentication flow');
  console.log('   2. Test createOrder with new API');
  console.log('   3. Update trading functions to use new SDK');
}

if (require.main === module) {
  testNewSDK().catch(console.error);
}

export { testNewSDK };
