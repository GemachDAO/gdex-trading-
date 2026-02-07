/**
 * GDEX SDK Trading Test with Proper Authentication
 *
 * Based on the official example but with working auth
 */

import { GdexClient } from '@gdex/sdk';
import { loadConfig } from './config';
import { ethers } from 'ethers';

async function testGdexSDKProper() {
  console.log('=== GDEX SDK Trading Test ===\n');

  try {
    const config = loadConfig();
    const apiKey = config.apiKey.split(',')[0].trim();

    // Initialize client with working endpoint
    console.log('1. Initializing client...');
    const client = new GdexClient({
      apiKey: apiKey,
      baseUrl: config.apiUrl, // Use working endpoint
    });
    console.log(`   API: ${config.apiUrl}`);
    console.log('   ✅ Client initialized\n');

    // Prepare authentication
    const wallet = new ethers.Wallet(config.privateKey);
    const USER_ID = config.walletAddress; // Wallet address as user ID

    // Generate signature (trying different message formats)
    console.log('2. Generating signature...');
    const timestamp = Date.now();
    const message = `GDEX:${USER_ID}:${timestamp}`;
    const SIGNATURE = await wallet.signMessage(message);
    console.log(`   User ID: ${USER_ID}`);
    console.log(`   Signature: ${SIGNATURE.substring(0, 20)}...\n`);

    // Fetch available assets
    console.log('3. Fetching available assets...');
    const assets = await client.getAssets();
    console.log(`   Found ${assets.length} tradeable assets\n`);

    // Get BTC info
    const btc = assets.find(a => a.coin === 'BTC');
    if (btc) {
      console.log('4. BTC Information:');
      console.log(`   Price: $${btc.markPx}`);
      console.log(`   Max Leverage: ${btc.maxLeverage}x`);
      console.log(`   Size Decimals: ${btc.szDecimals}\n`);
    }

    // Check account balance
    console.log('5. Checking account balance...');
    const state = await client.getAccountState(USER_ID);
    if (state) {
      console.log(`   Withdrawable: $${state.withdrawable}`);
      console.log(`   Account Value: $${state.crossMarginSummary.accountValue}`);
      console.log(`   Open Positions: ${state.assetPositions.length}\n`);

      if (parseFloat(state.withdrawable) < 11) {
        console.log('   ⚠️  Insufficient balance ($11 minimum)');
        console.log('   Skipping trade examples\n');
        return;
      }
    } else {
      console.log('   ⚠️  Could not fetch account state\n');
      return;
    }

    // Calculate trade parameters
    console.log('6. Preparing 20x leveraged trade...');
    const currentPrice = parseFloat(btc?.markPx || '70000');
    const accountValue = parseFloat(state.withdrawable);
    const leverage = 20;
    const positionValue = Math.min(accountValue * leverage, 200); // Cap at $200
    const size = (positionValue / currentPrice).toFixed(4);

    // Calculate TP/SL
    const tpPrice = Math.floor(currentPrice * 1.03).toString(); // +3%
    const slPrice = Math.floor(currentPrice * 0.99).toString(); // -1% tight SL

    console.log(`   Size: ${size} BTC`);
    console.log(`   Position Value: $${positionValue}`);
    console.log(`   Leverage: ${leverage}x 🔥`);
    console.log(`   Entry: $${currentPrice.toLocaleString()}`);
    console.log(`   TP: $${tpPrice} (+3%)`);
    console.log(`   SL: $${slPrice} (-1%)\n`);

    // Place market order with TP/SL
    console.log('7. Placing market order with TP/SL...');
    const marketOrder = await client.createOrder(USER_ID, SIGNATURE, {
      coin: 'BTC',
      isLong: true,
      price: currentPrice.toString(),
      size: size,
      tpPrice: tpPrice,
      slPrice: slPrice,
      isMarket: true,
    });

    console.log('\n════════════════════════════════════════════════════════════');
    if (marketOrder.isSuccess) {
      const status = marketOrder.retData?.response?.data?.statuses[0];

      if (status?.filled) {
        console.log('✅ Order Filled Successfully!');
        console.log(`   Average Price: $${status.filled.avgPx}`);
        console.log(`   Size: ${status.filled.totalSz} BTC`);
        console.log(`   Position Value: $${(parseFloat(status.filled.totalSz) * parseFloat(status.filled.avgPx)).toFixed(2)}`);
      } else if (status?.resting) {
        console.log('✅ Order Placed (Resting)');
        console.log(`   Order ID: ${status.resting.oid}`);
      } else if (status?.error) {
        console.log('❌ Order Error');
        console.log(`   Error: ${status.error}`);
      } else {
        console.log('✅ Order Submitted');
        console.log('   Response:', JSON.stringify(marketOrder.retData, null, 2));
      }
    } else {
      console.log('❌ Order Failed');
      console.log(`   Error: ${marketOrder.error}`);
    }
    console.log('════════════════════════════════════════════════════════════\n');

    // View open positions
    console.log('8. Checking positions...');
    const updatedState = await client.getAccountState(USER_ID);
    if (updatedState && updatedState.assetPositions.length > 0) {
      console.log('   Open Positions:');
      updatedState.assetPositions.forEach(({ position }) => {
        const side = parseFloat(position.szi) > 0 ? 'LONG' : 'SHORT';
        const size = Math.abs(parseFloat(position.szi));
        console.log(`   ${position.coin} ${side}: ${size} BTC`);
        console.log(`      Entry: $${position.entryPx}`);
        console.log(`      PnL: $${position.unrealizedPnl}`);
        console.log(`      Liquidation: $${position.liquidationPx}`);
      });
    } else {
      console.log('   No open positions');
    }
    console.log('');

    console.log('=== Test Complete ===');

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    if (error.response?.data) {
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
  }
}

if (require.main === module) {
  testGdexSDKProper().catch(console.error);
}

export { testGdexSDKProper };
