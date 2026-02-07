import { createAuthenticatedSession } from './auth';
import { loadConfig } from './config';
import WebSocket from 'ws';

// Polyfill WebSocket for Node.js
(globalThis as any).WebSocket = WebSocket;

async function testHyperLiquidLeverageTrade() {
  console.log('🚀 Testing HyperLiquid Leveraged Trade\n');

  try {
    const config = loadConfig();
    const apiKey = config.apiKey.split(',')[0].trim();

    console.log('[1/5] 🔐 Authenticating for HyperLiquid (Arbitrum)...');
    const session = await createAuthenticatedSession({
      apiUrl: config.apiUrl,
      apiKey: apiKey,
      walletAddress: config.walletAddress,
      privateKey: config.privateKey,
      chainId: 42161, // Arbitrum for HyperLiquid
    });
    console.log('      ✅ Authenticated\n');

    console.log('[2/5] 💰 Checking HyperLiquid balance...');
    const balance = await session.sdk.hyperLiquid.getHyperliquidUsdcBalance(
      session.walletAddress
    );
    console.log(`      Balance: $${balance ?? 0}`);

    if (!balance || balance < 5) {
      console.log('\n❌ Insufficient balance for leveraged trading');
      console.log('   Minimum recommended: $5 USDC');
      console.log('   Your balance: $' + (balance ?? 0));
      console.log('\n💡 Deposit funds first: npm run deposit:correct 10');
      return;
    }
    console.log('      ✅ Sufficient balance for trading\n');

    console.log('[3/5] 📊 Getting BTC market price...');
    // Get current BTC price from HyperLiquid
    let btcPrice: number;
    try {
      const markPrice = await session.sdk.hyperLiquid.getHyperliquidMarkPrice('BTC');
      if (markPrice && typeof markPrice === 'number') {
        btcPrice = markPrice;
        console.log(`      Current BTC price: $${btcPrice.toLocaleString()}`);
      } else if (typeof markPrice === 'string') {
        btcPrice = parseFloat(markPrice);
        console.log(`      Current BTC price: $${btcPrice.toLocaleString()}`);
      } else {
        btcPrice = 95000; // Fallback price
        console.log(`      Using fallback BTC price: $${btcPrice.toLocaleString()}`);
      }
    } catch (error) {
      btcPrice = 95000; // Fallback price
      console.log(`      Using fallback BTC price: $${btcPrice.toLocaleString()}`);
    }
    console.log();

    console.log('[4/5] 📋 Setting up trade parameters...');

    // Calculate position size for 20x leverage
    // With $10 balance and 20x leverage, we can trade $200 worth of BTC
    const accountValue = balance;
    const leverage = 20;
    const positionValue = accountValue * leverage;
    const positionSize = positionValue / btcPrice;

    // Round to appropriate precision (HyperLiquid typically uses 3-4 decimals for BTC)
    const roundedSize = Math.floor(positionSize * 10000) / 10000;

    console.log(`      Account Balance: $${accountValue}`);
    console.log(`      Leverage: ${leverage}x 🔥`);
    console.log(`      Position Value: $${positionValue}`);
    console.log(`      Position Size: ${roundedSize} BTC`);
    console.log(`      Entry Price: $${btcPrice.toLocaleString()}`);
    console.log(`      Direction: LONG (bullish)\n`);

    // Check minimum order value ($11 required)
    const orderValue = roundedSize * btcPrice;
    if (orderValue < 11) {
      console.log('❌ Order value too small for HyperLiquid');
      console.log(`   Minimum order value: $11`);
      console.log(`   Your order value: $${orderValue.toFixed(2)}`);
      console.log(`   Position size: ${roundedSize} BTC`);
      console.log('\n💡 Deposit more funds to trade: npm run deposit:correct 50');
      return;
    }

    console.log('[5/5] 🎯 Placing leveraged BTC order...');

    // Calculate TP/SL prices with TIGHT stop loss for 20x leverage
    const takeProfitPrice = Math.floor(btcPrice * 1.03); // +3% profit target
    const stopLossPrice = Math.floor(btcPrice * 0.99);   // -1% TIGHT stop loss (20% loss at 20x)

    console.log(`      Coin: BTC`);
    console.log(`      Size: ${roundedSize} BTC`);
    console.log(`      Type: MARKET Order (LONG)`);
    console.log(`      Leverage: ${leverage}x 🔥`);
    console.log(`      Limit Price: $${btcPrice.toLocaleString()}`);
    console.log(`      Take Profit: $${takeProfitPrice.toLocaleString()} (+3%)`);
    console.log(`      Stop Loss: $${stopLossPrice.toLocaleString()} (-1% TIGHT 🛡️)`);
    console.log(`      Risk: ~20% of balance at SL`);
    console.log(`      Using session private key: ${session.tradingPrivateKey.substring(0, 10)}...`);
    console.log();

    const result = await session.sdk.hyperLiquid.hlCreateOrder(
      session.walletAddress,
      'BTC',              // coin
      true,               // isLong (true = buy/long, false = sell/short)
      btcPrice.toString(), // price (reference price for market order)
      roundedSize.toString(), // size in BTC
      takeProfitPrice.toString(), // tpPrice (required for opening positions)
      stopLossPrice.toString(),   // slPrice (required for opening positions)
      false,              // reduceOnly (false = can open new position)
      true,               // isMarket (true = MARKET order, executes immediately)
      session.tradingPrivateKey
    );

    console.log('════════════════════════════════════════════════════════════');
    if (result && result.isSuccess) {
      console.log('✅ HyperLiquid Order Placed Successfully!');
      console.log(`   Coin: BTC`);
      console.log(`   Size: ${roundedSize} BTC`);
      console.log(`   Leverage: ${leverage}x`);
      console.log(`   Position Value: $${positionValue}`);
      console.log(`   Entry Price: $${btcPrice.toLocaleString()}`);
      console.log(`   Direction: LONG`);

      console.log('\n💡 Monitor your position:');
      console.log('   - Check HyperLiquid app: https://app.hyperliquid.xyz');
      console.log('   - View positions: sdk.hyperLiquid.getHyperliquidPositions()');
    } else {
      console.log('❌ Order Failed');
      console.log(`   Error: ${result?.message || 'Unknown error'}`);

      if (result?.message?.includes('Insufficient')) {
        console.log('\n💡 Tip: You need more USDC balance in HyperLiquid');
        console.log('   Deposit: npm run deposit:correct [amount]');
      }

      if (result?.message?.includes('position size')) {
        console.log('\n💡 Tip: Position size may be too small or too large');
        console.log('   Try adjusting the amount or leverage');
      }
    }
    console.log('════════════════════════════════════════════════════════════\n');

  } catch (error: any) {
    console.error('\n❌ Error during HyperLiquid trade:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
  }
}

// Run if called directly
if (require.main === module) {
  testHyperLiquidLeverageTrade().catch(console.error);
}

export { testHyperLiquidLeverageTrade };
