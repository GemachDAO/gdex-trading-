import { createAuthenticatedSession } from './auth';
import { loadConfig } from './config';
import WebSocket from 'ws';

// Polyfill WebSocket for Node.js
(globalThis as any).WebSocket = WebSocket;

const YOUR_WALLET = '0x3f25f0af33b24163301dd7ef94ce348e6a250b04';

async function copyTradeSelf() {
  console.log('🔄 Self Copy Trading Test\n');
  console.log('=' .repeat(70));
  console.log('📝 Plan:');
  console.log('   1. Bot will start copying your wallet');
  console.log('   2. You manually place a small HyperLiquid trade');
  console.log('   3. Bot will automatically copy your trade');
  console.log('   4. We monitor positions in real-time');
  console.log('   5. Close everything when done');
  console.log('=' .repeat(70));

  const config = loadConfig();
  const apiKey = config.apiKey.split(',')[0].trim();

  // Step 1: Authenticate
  console.log('\n[1/5] 🔐 Authenticating...');
  const session = await createAuthenticatedSession({
    apiUrl: config.apiUrl,
    apiKey: apiKey,
    walletAddress: config.walletAddress,
    privateKey: config.privateKey,
    chainId: 42161, // Arbitrum for HyperLiquid
  });
  console.log(`✅ Bot wallet: ${session.walletAddress}`);
  console.log(`✅ Will copy: ${YOUR_WALLET}`);

  // Step 2: Check balance
  console.log('\n[2/5] 💰 Checking HyperLiquid balance...');
  const balance = await session.sdk.hyperLiquid.getHyperliquidUsdcBalance(session.walletAddress);
  console.log(`Bot Balance: $${balance ?? 0} USDC`);

  if (!balance || balance < 5) {
    console.log('\n❌ Insufficient balance for copy trading');
    console.log('   Minimum recommended: $5 USDC');
    console.log('   Your balance: $' + (balance ?? 0));
    console.log('\n💡 Deposit funds first: npm run deposit:correct 10');
    return;
  }

  // Step 3: Create copy trade
  console.log('\n[3/5] 🚀 Setting up copy trade...');
  console.log('   Target Wallet: ' + YOUR_WALLET);
  console.log('   Copy Mode: Fixed Amount per Order');
  console.log('   Amount per Order: $5 USDC');
  console.log('   Stop Loss: 5%');
  console.log('   Take Profit: 10%');
  console.log('   Opposite Copy: No (same direction)\n');

  const copyTradeResult = await session.sdk.hyperLiquid.hlCreate(
    session.walletAddress,
    YOUR_WALLET,              // your wallet to copy
    'Self Copy Test',         // name
    1,                        // copyMode: 1=fixed amount
    '5',                      // $5 per order
    '5',                      // 5% stop loss
    '10',                     // 10% take profit
    false,                    // oppositeCopy (false = copy same direction)
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

  // Step 4: Monitor positions in real-time
  console.log('\n[4/5] 📊 Monitoring positions in REAL-TIME...');
  console.log('=' .repeat(70));
  console.log('🎯 BOT IS NOW WATCHING YOUR WALLET');
  console.log('=' .repeat(70));
  console.log('\n💡 Instructions:');
  console.log('   1. Go to https://app.hyperliquid.xyz');
  console.log('   2. Connect your wallet: ' + YOUR_WALLET);
  console.log('   3. Place a SMALL market order (e.g., $20 BTC long)');
  console.log('   4. Watch below as the bot copies your trade!\n');
  console.log('⏱️  Monitoring will run for 5 minutes (or press Ctrl+C to stop)');
  console.log('─'.repeat(70));

  let foundPosition = false;
  const startTime = Date.now();
  const maxDuration = 5 * 60 * 1000; // 5 minutes
  let lastPositionState: any = null;

  while (Date.now() - startTime < maxDuration) {
    try {
      const state = await session.sdk.hyperLiquid.getHyperliquidClearinghouseState(
        session.walletAddress
      );

      const positions = state?.assetPositions || [];
      const hasPositions = positions.some((p: any) => parseFloat(p.position.szi || '0') !== 0);

      // Check if position state changed
      const currentState = JSON.stringify(positions);
      if (currentState !== lastPositionState) {
        lastPositionState = currentState;

        if (hasPositions) {
          if (!foundPosition) {
            console.log('\n🎉 POSITION DETECTED! Bot copied your trade!');
            console.log('─'.repeat(70));
            foundPosition = true;
          }

          console.log(`\n[${new Date().toLocaleTimeString()}] Current Positions:`);
          positions.forEach((pos: any) => {
            const size = parseFloat(pos.position.szi || '0');
            if (size !== 0) {
              const pnl = parseFloat(pos.position.unrealizedPnl || '0');
              const entryPx = parseFloat(pos.position.entryPx || '0');
              const leverage = pos.position.leverage?.value || 0;
              const marginUsed = parseFloat(pos.position.marginUsed || '0');

              const pnlColor = pnl >= 0 ? '\x1b[32m' : '\x1b[31m';
              const reset = '\x1b[0m';
              const direction = size > 0 ? '📈 LONG' : '📉 SHORT';

              console.log(`  ${pos.position.coin}:`);
              console.log(`    Direction: ${direction}`);
              console.log(`    Size: ${Math.abs(size).toFixed(4)}`);
              console.log(`    Entry Price: $${entryPx.toLocaleString()}`);
              console.log(`    Leverage: ${leverage}x`);
              console.log(`    Margin Used: $${marginUsed.toFixed(2)}`);
              console.log(`    ${pnlColor}Unrealized PnL: $${pnl.toFixed(2)}${reset}`);
            }
          });
          console.log('─'.repeat(70));
        } else if (foundPosition) {
          console.log(`\n[${new Date().toLocaleTimeString()}] ℹ️  All positions closed`);
        }
      }

      // Update status line
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const remaining = Math.floor((maxDuration - (Date.now() - startTime)) / 1000);
      if (!foundPosition) {
        process.stdout.write(`\r⏳ Waiting for your trade... ${elapsed}s elapsed (${remaining}s remaining) `);
      }

      await new Promise(r => setTimeout(r, 3000)); // Check every 3 seconds
    } catch (error: any) {
      console.error('\n⚠️  Monitor error:', error.message);
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  console.log('\n\n⏰ Monitoring period ended');

  // Step 5: Cleanup
  console.log('\n[5/5] 🧹 Cleanup...');

  // Check final positions
  const finalState = await session.sdk.hyperLiquid.getHyperliquidClearinghouseState(
    session.walletAddress
  );
  const finalPositions = finalState?.assetPositions || [];
  const openPositions = finalPositions.filter((p: any) => parseFloat(p.position.szi || '0') !== 0);

  if (openPositions.length > 0) {
    console.log(`\n⚠️  You have ${openPositions.length} open position(s)`);
    console.log('\nOptions:');
    console.log('  1. Keep positions open and monitor manually');
    console.log('  2. Close all positions now');
    console.log('  3. Delete copy trade but keep positions');

    // For this automated test, we'll just report and not close automatically
    console.log('\n💡 Leaving positions open for you to manage manually');
    console.log('   To close: Use the HyperLiquid UI or run a close script');
  } else {
    console.log('✅ No open positions to close');
  }

  // Try to get and display copy trade info
  console.log('\n📋 Copy trade status:');
  try {
    const copyTrades = await session.sdk.hyperLiquid.getCopyTradeListFutures(
      session.walletAddress,
      session.encryptedSessionKey
    );

    if (copyTrades && copyTrades.length > 0) {
      console.log(`   Active copy trades: ${copyTrades.length}`);
      console.log('   💡 Copy trade will continue until you delete it');
      console.log('   💡 Any future trades from ' + YOUR_WALLET.substring(0, 10) + '... will be copied');
    } else {
      console.log('   No active copy trades found');
    }
  } catch (error: any) {
    console.log('   ⚠️  Could not fetch copy trade list');
  }

  // Final balance
  const finalBalance = await session.sdk.hyperLiquid.getHyperliquidUsdcBalance(
    session.walletAddress
  );
  const balanceChange = (finalBalance ?? 0) - (balance ?? 0);
  const changeColor = balanceChange >= 0 ? '\x1b[32m' : '\x1b[31m';
  const reset = '\x1b[0m';

  console.log('\n📊 Final Balance:');
  console.log(`   Initial: $${(balance ?? 0).toFixed(2)}`);
  console.log(`   Final: $${(finalBalance ?? 0).toFixed(2)}`);
  console.log(`   ${changeColor}Change: ${balanceChange >= 0 ? '+' : ''}$${balanceChange.toFixed(2)}${reset}`);

  console.log('\n' + '='.repeat(70));
  console.log('✅ Copy trading test complete!');
  console.log('='.repeat(70));
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Interrupted by user');
  console.log('💡 Copy trade may still be active - check HyperLiquid UI');
  process.exit(0);
});

if (require.main === module) {
  copyTradeSelf().catch(console.error);
}

export { copyTradeSelf };
