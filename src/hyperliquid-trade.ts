import { createAuthenticatedSession } from './auth';
import { loadConfig } from './config';
import * as readline from 'readline';

interface TradeParams {
  symbol: string;
  isLong: boolean;
  usdAmount: number;
  leverage: number;
  takeProfitPercent: number;
  stopLossPercent: number;
}

async function placeHyperLiquidTrade(params: TradeParams) {
  console.log('\n🚀 HyperLiquid Trading Bot');
  console.log('=' .repeat(60));
  console.log(`Symbol: ${params.symbol}`);
  console.log(`Direction: ${params.isLong ? 'LONG 📈' : 'SHORT 📉'}`);
  console.log(`Position Size: $${params.usdAmount}`);
  console.log(`Leverage: ${params.leverage}x`);
  console.log(`Take Profit: ${params.takeProfitPercent}%`);
  console.log(`Stop Loss: ${params.stopLossPercent}%`);
  console.log('=' .repeat(60));

  const config = loadConfig();

  // Authenticate on Arbitrum (HyperLiquid bridge chain)
  console.log('\n📡 Authenticating...');
  const session = await createAuthenticatedSession({
    apiUrl: config.apiUrl,
    apiKey: config.apiKey,
    walletAddress: config.walletAddress,
    privateKey: config.privateKey,
    chainId: 42161, // Arbitrum
  });
  console.log('✅ Authenticated:', session.walletAddress);

  // Check balance
  console.log('\n💰 Checking HyperLiquid balance...');
  const balance = await session.sdk.hyperLiquid.getHyperliquidUsdcBalance(session.walletAddress);
  console.log(`Balance: $${balance.toFixed(2)} USDC`);

  if (balance < params.usdAmount) {
    throw new Error(`Insufficient balance! Need $${params.usdAmount}, have $${balance.toFixed(2)}`);
  }

  // Get current price
  console.log(`\n📊 Fetching ${params.symbol} price...`);
  let currentPrice: number;
  try {
    const state = await session.sdk.hyperLiquid.getHyperliquidClearinghouseState(session.walletAddress);
    const assetPosition = state.assetPositions.find((p: any) => p.position.coin === params.symbol);

    if (assetPosition) {
      currentPrice = parseFloat(assetPosition.position.entryPx || '0');
    }

    if (!currentPrice || currentPrice === 0) {
      // Fallback: use mark price from meta
      const meta = await session.sdk.hyperLiquid.getHyperliquidMeta();
      const assetMeta = meta.universe.find((u: any) => u.name === params.symbol);
      if (assetMeta) {
        // We don't have direct price, estimate from user's existing positions or use a default
        console.log('⚠️  No current price available, using estimate');
        currentPrice = 1; // Placeholder - would need market data API
      } else {
        throw new Error(`Asset ${params.symbol} not found in HyperLiquid meta`);
      }
    }
  } catch (error) {
    console.error('Error fetching price:', error);
    throw new Error('Could not fetch current price');
  }

  console.log(`Current Price: $${currentPrice}`);

  // Calculate TP/SL prices
  const tpPrice = params.isLong
    ? currentPrice * (1 + params.takeProfitPercent / 100)
    : currentPrice * (1 - params.takeProfitPercent / 100);

  const slPrice = params.isLong
    ? currentPrice * (1 - params.stopLossPercent / 100)
    : currentPrice * (1 + params.stopLossPercent / 100);

  console.log(`Take Profit Price: $${tpPrice.toFixed(4)}`);
  console.log(`Stop Loss Price: $${slPrice.toFixed(4)}`);

  // Calculate position size
  const positionSize = (params.usdAmount * params.leverage) / currentPrice;
  console.log(`Position Size: ${positionSize.toFixed(4)} ${params.symbol}`);

  console.log('\n🔄 Testing available methods...\n');

  // Method 1: Try new @gdex/sdk
  console.log('Method 1️⃣: Testing new @gdex/sdk (api.gdex.io)...');
  try {
    const { GdexClient } = await import('@gdex/sdk');
    const client = new GdexClient({
      apiKey: config.apiKey,
      privateKey: config.privateKey,
    });

    console.log('  Attempting to create order...');
    const result = await client.createOrder({
      symbol: params.symbol,
      side: params.isLong ? 'BUY' : 'SELL',
      type: 'MARKET',
      quantity: positionSize.toString(),
      leverage: params.leverage,
    });

    console.log('✅ SUCCESS with new SDK!');
    console.log('Order Result:', JSON.stringify(result, null, 2));
    return { method: 'new-sdk', result };
  } catch (error: any) {
    console.log('❌ Failed:', error.message);
    if (error.code === 'ENOTFOUND' || error.message.includes('ENOTFOUND')) {
      console.log('  (DNS not resolved - api.gdex.io not live yet)');
    }
  }

  // Method 2: Try hlCreateOrder (old API)
  console.log('\nMethod 2️⃣: Testing hlCreateOrder (trade-api.gemach.io)...');
  try {
    const result = await session.sdk.hyperLiquid.hlCreateOrder(
      session.walletAddress,
      params.symbol,
      params.isLong,
      positionSize,
      currentPrice,
      params.leverage,
      'Market',
      session.tradingPrivateKey
    );

    console.log('✅ SUCCESS with hlCreateOrder!');
    console.log('Order Result:', JSON.stringify(result, null, 2));
    return { method: 'hlCreateOrder', result };
  } catch (error: any) {
    console.log('❌ Failed:', error.message);
  }

  // Method 3: Try hlPlaceOrder with reduceOnly=false
  console.log('\nMethod 3️⃣: Testing hlPlaceOrder (reduceOnly=false)...');
  try {
    const result = await session.sdk.hyperLiquid.hlPlaceOrder(
      session.walletAddress,
      params.symbol,
      params.isLong,
      positionSize,
      currentPrice,
      false, // reduceOnly=false (open position)
      'Market',
      session.tradingPrivateKey
    );

    console.log('✅ SUCCESS with hlPlaceOrder!');
    console.log('Order Result:', JSON.stringify(result, null, 2));
    return { method: 'hlPlaceOrder', result };
  } catch (error: any) {
    console.log('❌ Failed:', error.message);
    if (error.message.includes('102') || error.message.includes('only support close')) {
      console.log('  (Error 102: Opening positions not supported via this method)');
    }
  }

  // Method 4: Try copy trading as workaround
  console.log('\nMethod 4️⃣: Testing hlCreate (copy trading workaround)...');
  console.log('  ⚠️  This method opens positions indirectly via copy trading');
  console.log('  ⚠️  Requires a trader address to copy from');
  console.log('  ℹ️  Skipping for now - needs trader address');

  console.log('\n' + '='.repeat(60));
  console.log('❌ ALL METHODS FAILED');
  console.log('='.repeat(60));
  console.log('\nDiagnosis:');
  console.log('• New SDK (api.gdex.io): DNS not live yet');
  console.log('• hlCreateOrder: Broken endpoint (returns "Sent order failed")');
  console.log('• hlPlaceOrder: Error 102 (only supports closing positions)');
  console.log('• Copy trading: Requires trader address (indirect method)');
  console.log('\n💡 Recommendation: Wait for backend team to fix opening positions');
  console.log('   or use copy trading feature to open positions indirectly.');

  throw new Error('No working method to open HyperLiquid positions at this time');
}

async function monitorPosition(session: any, symbol: string, tpPrice: number, slPrice: number, isLong: boolean) {
  console.log('\n📡 Starting position monitor...');
  console.log('Press Ctrl+C to stop monitoring\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let monitoring = true;

  process.on('SIGINT', () => {
    monitoring = false;
    rl.close();
    console.log('\n\n👋 Monitoring stopped');
    process.exit(0);
  });

  let iteration = 0;
  while (monitoring) {
    try {
      iteration++;
      const state = await session.sdk.hyperLiquid.getHyperliquidClearinghouseState(session.walletAddress);
      const position = state.assetPositions.find((p: any) => p.position.coin === symbol);

      if (!position) {
        console.log(`[${new Date().toLocaleTimeString()}] ⚠️  No ${symbol} position found`);
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }

      const currentPrice = parseFloat(position.position.entryPx || '0');
      const size = parseFloat(position.position.szi || '0');
      const unrealizedPnl = parseFloat(position.position.unrealizedPnl || '0');
      const marginUsed = parseFloat(position.position.marginUsed || '0');
      const returnPct = (unrealizedPnl / marginUsed) * 100;

      // Clear previous line and print update
      if (iteration > 1) {
        process.stdout.write('\x1b[1A\x1b[2K');
      }

      const pnlColor = unrealizedPnl >= 0 ? '\x1b[32m' : '\x1b[31m';
      const reset = '\x1b[0m';

      console.log(
        `[${new Date().toLocaleTimeString()}] ` +
        `${symbol}: $${currentPrice.toFixed(4)} | ` +
        `Size: ${size.toFixed(4)} | ` +
        `${pnlColor}PnL: $${unrealizedPnl.toFixed(2)} (${returnPct.toFixed(2)}%)${reset} | ` +
        `TP: $${tpPrice.toFixed(4)} | SL: $${slPrice.toFixed(4)}`
      );

      // Check TP/SL
      if (isLong) {
        if (currentPrice >= tpPrice) {
          console.log('\n\n🎯 TAKE PROFIT HIT! Closing position...');
          await closePosition(session, symbol);
          break;
        }
        if (currentPrice <= slPrice) {
          console.log('\n\n🛑 STOP LOSS HIT! Closing position...');
          await closePosition(session, symbol);
          break;
        }
      } else {
        if (currentPrice <= tpPrice) {
          console.log('\n\n🎯 TAKE PROFIT HIT! Closing position...');
          await closePosition(session, symbol);
          break;
        }
        if (currentPrice >= slPrice) {
          console.log('\n\n🛑 STOP LOSS HIT! Closing position...');
          await closePosition(session, symbol);
          break;
        }
      }

      await new Promise(r => setTimeout(r, 5000)); // Check every 5 seconds
    } catch (error: any) {
      console.error('Monitor error:', error.message);
      await new Promise(r => setTimeout(r, 10000));
    }
  }
}

async function closePosition(session: any, symbol: string) {
  console.log(`\n🔄 Closing ${symbol} position...`);

  try {
    const result = await session.sdk.hyperLiquid.hlCloseAll(
      session.walletAddress,
      symbol,
      session.tradingPrivateKey
    );

    console.log('✅ Position closed successfully!');
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (error: any) {
    console.error('❌ Failed to close position:', error.message);
    throw error;
  }
}

async function main() {
  try {
    const params: TradeParams = {
      symbol: 'BTC',
      isLong: true,
      usdAmount: 10, // $10 position
      leverage: 25,
      takeProfitPercent: 2,
      stopLossPercent: 2,
    };

    const result = await placeHyperLiquidTrade(params);

    // If we successfully opened a position, start monitoring
    if (result) {
      const config = loadConfig();
      const session = await createAuthenticatedSession({
        apiUrl: config.apiUrl,
        apiKey: config.apiKey,
        walletAddress: config.walletAddress,
        privateKey: config.privateKey,
        chainId: 42161,
      });

      const currentPrice = 1; // Would need to fetch this properly
      const tpPrice = params.isLong
        ? currentPrice * (1 + params.takeProfitPercent / 100)
        : currentPrice * (1 - params.takeProfitPercent / 100);

      const slPrice = params.isLong
        ? currentPrice * (1 - params.stopLossPercent / 100)
        : currentPrice * (1 + params.stopLossPercent / 100);

      await monitorPosition(session, params.symbol, tpPrice, slPrice, params.isLong);
    }
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { placeHyperLiquidTrade, monitorPosition, closePosition };
