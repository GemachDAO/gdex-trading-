import { GdexClient } from '@gdex/sdk';
import { loadConfig } from './config';
import { ethers } from 'ethers';

async function testNewSDK() {
  console.log('🧪 Testing New GDEX SDK\n');

  try {
    const config = loadConfig();
    const apiKey = config.apiKey.split(',')[0].trim();

    console.log('[1/5] 🔧 Initializing GdexClient...');
    const client = new GdexClient({
      apiKey: apiKey,
      baseUrl: config.apiUrl, // Use the correct API URL from config
    });
    console.log(`      API URL: ${config.apiUrl}`);
    console.log('      ✅ Client initialized\n');

    console.log('[2/5] 📊 Fetching available assets...');
    const assets = await client.getAssets();
    console.log(`      ✅ Found ${assets.length} tradeable assets\n`);

    // Show BTC info
    const btcAsset = assets.find(a => a.coin === 'BTC');
    if (btcAsset) {
      console.log('      BTC Asset:');
      console.log(`         Mark Price: $${btcAsset.markPx}`);
      console.log(`         Max Leverage: ${btcAsset.maxLeverage}x`);
      console.log(`         Size Decimals: ${btcAsset.szDecimals}`);
      console.log();
    }

    console.log('[3/5] 💰 Checking account state...');
    const state = await client.getAccountState(config.walletAddress);

    if (state) {
      console.log(`      Withdrawable: $${state.withdrawable}`);
      console.log(`      Account Value: $${state.crossMarginSummary.accountValue}`);
      console.log(`      Open Positions: ${state.assetPositions.length}`);

      if (state.assetPositions.length > 0) {
        console.log('\n      Positions:');
        state.assetPositions.forEach(({ position }) => {
          const side = parseFloat(position.szi) > 0 ? 'LONG' : 'SHORT';
          console.log(`         ${position.coin} ${side}: ${Math.abs(parseFloat(position.szi))}`);
          console.log(`            Entry: $${position.entryPx} | PnL: $${position.unrealizedPnl}`);
        });
      }
    } else {
      console.log('      ⚠️  No state returned (account may not exist on HL)');
    }
    console.log();

    console.log('[4/5] 🔐 Preparing signature for trading...');
    const wallet = new ethers.Wallet(config.privateKey);
    const userId = config.walletAddress;

    // Generate a signature (this might need adjustment based on actual requirements)
    const message = `GDEX Trading: ${userId}`;
    const signature = await wallet.signMessage(message);
    console.log(`      User ID: ${userId}`);
    console.log(`      Signature: ${signature.substring(0, 20)}...`);
    console.log();

    console.log('[5/5] 🎯 Testing order placement...');

    if (!state || parseFloat(state.withdrawable) < 11) {
      console.log('      ⚠️  Insufficient balance ($11 minimum)');
      console.log(`      Current balance: $${state?.withdrawable || '0'}`);
      console.log('\n💡 Deposit funds: npm run deposit:correct 50');
      return;
    }

    // Calculate order size (using ~$20 for 2x leverage with $10 balance)
    const btcPrice = parseFloat(btcAsset?.markPx || '70000');
    const orderValue = 20; // $20 position
    const orderSize = orderValue / btcPrice;
    const roundedSize = Math.floor(orderSize * 10000) / 10000;

    // Calculate TP/SL (required)
    const takeProfitPrice = Math.floor(btcPrice * 1.05);
    const stopLossPrice = Math.floor(btcPrice * 0.97);

    console.log(`      Placing 2x leveraged BTC order:`);
    console.log(`         Size: ${roundedSize} BTC ($${orderValue})`);
    console.log(`         Entry: $${btcPrice.toLocaleString()}`);
    console.log(`         TP: $${takeProfitPrice.toLocaleString()} (+5%)`);
    console.log(`         SL: $${stopLossPrice.toLocaleString()} (-3%)`);
    console.log();

    const result = await client.createOrder(userId, signature, {
      coin: 'BTC',
      isLong: true,
      price: btcPrice.toString(),
      size: roundedSize.toString(),
      tpPrice: takeProfitPrice.toString(),
      slPrice: stopLossPrice.toString(),
      isMarket: true,
    });

    console.log('════════════════════════════════════════════════════════════');
    if (result.isSuccess) {
      console.log('✅ Order Placed Successfully!');

      const status = result.retData?.response?.data?.statuses[0];
      if (status?.filled) {
        console.log(`   Filled at: $${status.filled.avgPx}`);
        console.log(`   Size: ${status.filled.totalSz} BTC`);
      } else if (status?.resting) {
        console.log(`   Order ID: ${status.resting.oid}`);
        console.log(`   Status: Resting (limit order)`);
      } else if (status?.error) {
        console.log(`   Error: ${status.error}`);
      }
    } else {
      console.log('❌ Order Failed');
      console.log(`   Error: ${result.error}`);
    }
    console.log('════════════════════════════════════════════════════════════\n');

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    if (error.response?.data) {
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

if (require.main === module) {
  testNewSDK().catch(console.error);
}

export { testNewSDK };
