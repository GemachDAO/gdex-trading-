import { createAuthenticatedSession } from './auth';
import { loadConfig } from './config';

async function checkHLTradeHistory() {
  console.log('📜 HyperLiquid Trade History\n');
  console.log('='.repeat(70));

  const config = loadConfig();

  // Authenticate
  console.log('\n[1/3] 🔐 Authenticating...\n');
  const session = await createAuthenticatedSession({
    apiUrl: config.apiUrl,
    apiKey: config.apiKey,
    walletAddress: config.walletAddress,
    privateKey: config.privateKey,
    chainId: 42161,
  });

  console.log(`✅ Authenticated`);

  // Get custodial address
  console.log('\n[2/3] 📋 Getting custodial address...\n');
  const userInfo = await session.sdk.user.getUserInfo(
    session.walletAddress,
    session.encryptedSessionKey,
    42161
  );

  if (!userInfo) {
    console.log('❌ Failed to get user info');
    return;
  }

  const custodialAddress = userInfo.address;
  console.log(`   Custodial Address: ${custodialAddress}`);

  // Get trade history
  console.log('\n[3/3] 📊 Fetching recent trades...\n');

  try {
    // Get fills (executed trades)
    const history = await session.sdk.hyperLiquid.getHyperliquidTradeHistory(
      custodialAddress,
      session.encryptedSessionKey,
      false, // use API instead of direct HL
      1,     // page 1
      50     // get last 50 trades
    );

    if (!history || !history.fills || history.fills.length === 0) {
      console.log('   No recent trades found');
      console.log('\n💡 This could mean:');
      console.log('   1. No trades have been executed yet');
      console.log('   2. Orders are still pending');
      console.log('   3. Check open orders with: npm run hl:positions');
      return;
    }

    console.log('='.repeat(70));
    console.log('📈 RECENT TRADES');
    console.log('='.repeat(70));
    console.log(`\nFound ${history.fills.length} recent trade(s):\n`);

    for (const fill of history.fills) {
      const side = fill.side === 'B' ? '🟢 BUY' : '🔴 SELL';
      const px = parseFloat(fill.px);
      const sz = parseFloat(fill.sz);
      const fee = parseFloat(fill.fee || '0');
      const time = new Date(fill.time);

      console.log(`┌─ ${fill.coin} ${side}`);
      console.log(`│  Time:        ${time.toLocaleString()}`);
      console.log(`│  Price:       $${px.toLocaleString()}`);
      console.log(`│  Size:        ${sz} ${fill.coin}`);
      console.log(`│  Value:       $${(px * sz).toFixed(2)}`);
      console.log(`│  Fee:         $${fee.toFixed(4)}`);
      console.log(`│  Order ID:    ${fill.oid}`);
      if (fill.tid) {
        console.log(`│  Trade ID:    ${fill.tid}`);
      }
      if (fill.closedPnl) {
        const pnl = parseFloat(fill.closedPnl);
        const pnlColor = pnl >= 0 ? '🟢' : '🔴';
        const pnlSign = pnl >= 0 ? '+' : '';
        console.log(`│  Closed P&L:  ${pnlColor} ${pnlSign}$${pnl.toFixed(2)}`);
      }
      console.log(`└─`);
      console.log();
    }

    // Summary stats
    const totalVolume = history.fills.reduce((sum, f) => sum + (parseFloat(f.px) * parseFloat(f.sz)), 0);
    const totalFees = history.fills.reduce((sum, f) => sum + parseFloat(f.fee || '0'), 0);
    const totalPnl = history.fills.reduce((sum, f) => sum + parseFloat(f.closedPnl || '0'), 0);

    console.log('-'.repeat(70));
    console.log('\n📊 SUMMARY:');
    console.log(`   Total Trades:     ${history.fills.length}`);
    console.log(`   Total Volume:     $${totalVolume.toFixed(2)}`);
    console.log(`   Total Fees:       $${totalFees.toFixed(4)}`);
    if (totalPnl !== 0) {
      const pnlColor = totalPnl >= 0 ? '🟢' : '🔴';
      const pnlSign = totalPnl >= 0 ? '+' : '';
      console.log(`   Total Closed P&L: ${pnlColor} ${pnlSign}$${totalPnl.toFixed(2)}`);
    }

  } catch (error: any) {
    console.log(`\n❌ Error fetching trade history: ${error.message}`);
    if (error.response) {
      console.log(`   Status: ${error.response.status}`);
      console.log(`   Data:`, error.response.data);
    }
  }

  console.log('\n' + '='.repeat(70));
}

if (require.main === module) {
  checkHLTradeHistory().catch(console.error);
}

export { checkHLTradeHistory };
