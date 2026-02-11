import { createAuthenticatedSession } from './auth';
import { loadConfig } from './config';
import WebSocket from 'ws';

// Polyfill WebSocket for Node.js
(globalThis as any).WebSocket = WebSocket;

async function testCopyTrading() {
  console.log('🔄 HyperLiquid Copy Trading Test\n');
  console.log('=' .repeat(70));

  const config = loadConfig();
  const apiKey = config.apiKey.split(',')[0].trim();

  // Step 1: Authenticate
  console.log('\n[1/7] 🔐 Authenticating...');
  const session = await createAuthenticatedSession({
    apiUrl: config.apiUrl,
    apiKey: apiKey,
    walletAddress: config.walletAddress,
    privateKey: config.privateKey,
    chainId: 42161, // Arbitrum for HyperLiquid
  });
  console.log(`✅ Authenticated: ${session.walletAddress}`);

  // Step 2: Check balance
  console.log('\n[2/7] 💰 Checking HyperLiquid balance...');
  const balance = await session.sdk.hyperLiquid.getHyperliquidUsdcBalance(session.walletAddress);
  console.log(`Balance: $${balance ?? 0} USDC`);

  if (!balance || balance < 5) {
    console.log('\n❌ Insufficient balance for copy trading');
    console.log('   Minimum recommended: $5 USDC');
    console.log('   Your balance: $' + (balance ?? 0));
    console.log('\n💡 Deposit funds first: npm run deposit:correct 10');
    return;
  }

  // Step 3: Get top traders
  console.log('\n[3/7] 🏆 Fetching top HyperLiquid traders...');
  const leaderboard = await session.sdk.hyperLiquid.getHyperliquidLeaderboard(
    'week',  // period: 'day' | 'week' | 'month' | 'allTime'
    10,      // limit
    'desc',  // order
    'pnl'    // sortBy
  );

  if (!leaderboard || leaderboard.length === 0) {
    console.log('❌ No traders found on leaderboard');
    return;
  }

  console.log(`✅ Found ${leaderboard.length} top traders\n`);
  console.log('Top 5 Traders (by Weekly PnL):');
  console.log('─'.repeat(70));

  leaderboard.slice(0, 5).forEach((trader: any, i: number) => {
    // Extract weekly performance data
    const weekPerf = trader.windowPerformances?.find((w: any) => w[0] === 'week')?.[1] || {};
    const pnl = parseFloat(weekPerf.pnl || '0');
    const roi = parseFloat(weekPerf.roi || '0') * 100;
    const address = trader.ethAddress || '';
    const accountValue = parseFloat(trader.accountValue || '0');

    const pnlColor = pnl >= 0 ? '\x1b[32m' : '\x1b[31m';
    const reset = '\x1b[0m';

    console.log(
      `${i + 1}. ${address.substring(0, 10)}...${address.substring(address.length - 4)} | ` +
      `${pnlColor}PnL: $${pnl.toLocaleString(undefined, {maximumFractionDigits: 0})}${reset} | ` +
      `ROI: ${roi.toFixed(2)}% | ` +
      `Account: $${accountValue.toLocaleString(undefined, {maximumFractionDigits: 0})}`
    );
  });

  // Select trader (top performer)
  const targetTrader: any = leaderboard[0];
  const weekPerf = targetTrader.windowPerformances?.find((w: any) => w[0] === 'week')?.[1] || {};

  console.log(`\n🎯 Selected trader: ${targetTrader.ethAddress}`);
  console.log(`   Weekly PnL: $${parseFloat(weekPerf.pnl || '0').toLocaleString(undefined, {maximumFractionDigits: 0})}`);
  console.log(`   Weekly ROI: ${(parseFloat(weekPerf.roi || '0') * 100).toFixed(2)}%`);
  console.log(`   Account Value: $${parseFloat(targetTrader.accountValue || '0').toLocaleString(undefined, {maximumFractionDigits: 0})}`);

  // Step 4: Create copy trade
  console.log('\n[4/7] 🚀 Creating copy trade...');
  console.log('   Copy Mode: Fixed Amount per Order');
  console.log('   Amount per Order: $5 USDC');
  console.log('   Stop Loss: 10%');
  console.log('   Take Profit: 20%');
  console.log('   Opposite Copy: No (same direction)\n');

  const copyTradeResult = await session.sdk.hyperLiquid.hlCreate(
    session.walletAddress,
    targetTrader.ethAddress,     // trader to copy
    'Test Copy Trade',            // name
    1,                            // copyMode: 1=fixed amount
    '5',                          // $5 per order
    '10',                         // 10% stop loss
    '20',                         // 20% take profit
    false,                        // oppositeCopy (false = copy same direction)
    session.tradingPrivateKey
  );

  if (!copyTradeResult || !copyTradeResult.isSuccess) {
    console.log('❌ Failed to create copy trade');
    console.log('   Error:', (copyTradeResult as any)?.error || 'Unknown error');
    return;
  }

  console.log('✅ Copy trade created successfully!');
  const copyTradeId = (copyTradeResult as any).copyTradeId || 'unknown';
  console.log(`   Copy Trade ID: ${copyTradeId}`);

  // Step 5: Get copy trade list
  console.log('\n[5/7] 📋 Fetching active copy trades...');
  const copyTrades = await session.sdk.hyperLiquid.getCopyTradeListFutures(
    session.walletAddress,
    session.encryptedSessionKey
  );

  if (copyTrades && copyTrades.length > 0) {
    console.log(`✅ Found ${copyTrades.length} active copy trade(s)\n`);
    copyTrades.forEach((ct: any, i: number) => {
      console.log(`${i + 1}. ${ct.name || 'Unnamed'}`);
      console.log(`   Trader: ${ct.targetAddress}`);
      console.log(`   Mode: ${ct.copyMode === 1 ? 'Fixed Amount' : 'Proportional'}`);
      console.log(`   Amount: $${ct.fixedAmountCostPerOrder}`);
      console.log(`   Status: ${ct.isActive ? '🟢 Active' : '🔴 Inactive'}`);
    });
  }

  // Step 6: Monitor positions (wait for trades to copy)
  console.log('\n[6/7] 📊 Monitoring positions...');
  console.log('   Waiting 30 seconds for trader to make moves...\n');

  for (let i = 0; i < 6; i++) {
    await new Promise(r => setTimeout(r, 5000)); // Check every 5 seconds

    const state = await session.sdk.hyperLiquid.getHyperliquidClearinghouseState(
      session.walletAddress
    );

    const positions = state?.assetPositions || [];
    const hasPositions = positions.some((p: any) => parseFloat(p.position.szi || '0') !== 0);

    if (hasPositions) {
      console.log(`✅ Positions opened! (${i * 5}s elapsed)`);
      console.log('\nCurrent Positions:');
      console.log('─'.repeat(70));

      positions.forEach((pos: any) => {
        const size = parseFloat(pos.position.szi || '0');
        if (size !== 0) {
          const pnl = parseFloat(pos.position.unrealizedPnl || '0');
          const pnlColor = pnl >= 0 ? '\x1b[32m' : '\x1b[31m';
          const reset = '\x1b[0m';
          const direction = size > 0 ? 'LONG 📈' : 'SHORT 📉';

          console.log(
            `${pos.position.coin}: ${direction} | ` +
            `Size: ${Math.abs(size).toFixed(4)} | ` +
            `Entry: $${pos.position.entryPx} | ` +
            `${pnlColor}PnL: $${pnl.toFixed(2)}${reset}`
          );
        }
      });

      break;
    } else {
      process.stdout.write(`\r   Waiting... ${i * 5}s elapsed (no positions yet)`);
    }
  }

  // Step 7: Close copy trade and positions
  console.log('\n\n[7/7] 🛑 Closing copy trade and positions...');

  // First, close all open positions
  const state = await session.sdk.hyperLiquid.getHyperliquidClearinghouseState(
    session.walletAddress
  );

  const positions = state?.assetPositions || [];
  const openPositions = positions.filter((p: any) => parseFloat(p.position.szi || '0') !== 0);

  if (openPositions.length > 0) {
    console.log(`   Closing ${openPositions.length} open position(s)...`);

    // Close all positions at once
    try {
      await session.sdk.hyperLiquid.hlCloseAll(
        session.walletAddress,
        session.tradingPrivateKey
      );
      console.log(`   ✅ Closed all positions`);
    } catch (error: any) {
      console.log(`   ⚠️  Failed to close positions: ${error.message}`);
    }
  } else {
    console.log('   No open positions to close');
  }

  // Delete the copy trade
  console.log('\n   Deleting copy trade configuration...');

  if (copyTrades && copyTrades.length > 0) {
    const ct: any = copyTrades[0]; // Get the copy trade we just created

    try {
      const deleteResult = await session.sdk.hyperLiquid.hlUpdate(
        session.walletAddress,
        ct.targetAddress || targetTrader.ethAddress,
        ct.name || 'Test Copy Trade',
        ct.copyMode || 1,
        ct.fixedAmountCostPerOrder?.toString() || '5',
        ct.lossPercent?.toString() || '10',
        ct.profitPercent?.toString() || '20',
        ct.id?.toString() || copyTradeId, // copyTradeId
        ct.oppositeCopy || false,
        session.tradingPrivateKey,
        true, // isDelete = true
        false // isChangeStatus
      );

      if (deleteResult?.isSuccess) {
        console.log('   ✅ Copy trade deleted successfully');
      } else {
        console.log('   ⚠️  Failed to delete copy trade:', (deleteResult as any)?.error);
      }
    } catch (error: any) {
      console.log('   ⚠️  Error deleting copy trade:', error.message);
    }
  }

  // Final balance check
  console.log('\n📊 Final balance check...');
  const finalBalance = await session.sdk.hyperLiquid.getHyperliquidUsdcBalance(
    session.walletAddress
  );
  const balanceChange = (finalBalance ?? 0) - (balance ?? 0);
  const changeColor = balanceChange >= 0 ? '\x1b[32m' : '\x1b[31m';
  const reset = '\x1b[0m';

  console.log(`   Initial: $${(balance ?? 0).toFixed(2)}`);
  console.log(`   Final: $${(finalBalance ?? 0).toFixed(2)}`);
  console.log(`   ${changeColor}Change: ${balanceChange >= 0 ? '+' : ''}$${balanceChange.toFixed(2)}${reset}`);

  console.log('\n' + '='.repeat(70));
  console.log('✅ Copy trading test complete!');
  console.log('='.repeat(70));
}

if (require.main === module) {
  testCopyTrading().catch(console.error);
}

export { testCopyTrading };
