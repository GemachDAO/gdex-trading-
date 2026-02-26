import { createAuthenticatedSession } from './auth';
import { loadConfig } from './config';

async function checkHLPositions() {
  console.log('📊 HyperLiquid Positions & P&L Monitor\n');
  console.log('='.repeat(70));

  const config = loadConfig();

  // Authenticate
  console.log('\n[1/4] 🔐 Authenticating...\n');
  const session = await createAuthenticatedSession({
    apiUrl: config.apiUrl,
    apiKey: config.apiKey,
    walletAddress: config.walletAddress,
    privateKey: config.privateKey,
    chainId: 42161,
  });

  console.log(`✅ Authenticated`);

  // Get custodial address
  console.log('\n[2/4] 📋 Getting custodial address...\n');
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
  console.log(`   Control Wallet: ${session.walletAddress}`);
  console.log(`   Custodial Address: ${custodialAddress}`);

  // Check balance
  console.log('\n[3/4] 💰 Checking account balance...\n');
  const balance = await session.sdk.hyperLiquid.getHyperliquidUsdcBalance(custodialAddress);
  console.log(`   Account Balance: $${balance?.toFixed(2) ?? '0.00'}`);

  // Get clearinghouse state (positions & account info)
  console.log('\n[4/4] 📈 Fetching positions and P&L...\n');

  try {
    const state = await session.sdk.hyperLiquid.getHyperliquidClearinghouseState(custodialAddress);

    if (!state) {
      console.log('   No positions or account data found');
      return;
    }

    // Account summary
    console.log('\n' + '='.repeat(70));
    console.log('💼 ACCOUNT SUMMARY');
    console.log('='.repeat(70));

    const summary = state.crossMarginSummary;
    console.log(`\n   Account Value:       $${parseFloat(summary.accountValue || '0').toFixed(2)}`);
    console.log(`   Total Margin Used:   $${parseFloat(summary.totalMarginUsed || '0').toFixed(2)}`);
    console.log(`   Total Position Value: $${parseFloat(summary.totalNtlPos || '0').toFixed(2)}`);
    console.log(`   Withdrawable:        $${parseFloat(state.withdrawable || '0').toFixed(2)}`);

    // Positions
    console.log('\n' + '='.repeat(70));
    console.log('📊 OPEN POSITIONS');
    console.log('='.repeat(70));

    const positions = state.assetPositions;

    if (!positions || positions.length === 0) {
      console.log('\n   No open positions');
    } else {
      console.log(`\n   Found ${positions.length} position(s):\n`);

      for (const pos of positions) {
        const position = pos.position;

        const szi = parseFloat(position.szi);
        const isLong = szi > 0;
        const size = Math.abs(szi);
        const entryPrice = parseFloat(position.entryPx);
        const unrealizedPnl = parseFloat(position.unrealizedPnl);
        const leverage = position.leverage?.value || position.leverage;
        const liquidationPx = parseFloat(position.liquidationPx || '0');
        const marginUsed = parseFloat(position.marginUsed);
        const positionValue = parseFloat(position.positionValue);

        console.log(`   ┌─ ${position.coin} ${isLong ? '🟢 LONG' : '🔴 SHORT'}`);
        console.log(`   │  Size:             ${size.toFixed(4)} ${position.coin}`);
        console.log(`   │  Entry Price:      $${entryPrice.toLocaleString()}`);
        console.log(`   │  Leverage:         ${leverage}x`);
        console.log(`   │  Position Value:   $${positionValue.toFixed(2)}`);
        console.log(`   │  Margin Used:      $${marginUsed.toFixed(2)}`);
        console.log(`   │`);

        const pnlColor = unrealizedPnl >= 0 ? '🟢' : '🔴';
        const pnlSign = unrealizedPnl >= 0 ? '+' : '';
        console.log(`   │  Unrealized P&L:   ${pnlColor} ${pnlSign}$${unrealizedPnl.toFixed(2)}`);

        if (liquidationPx > 0) {
          console.log(`   │  Liquidation:      $${liquidationPx.toLocaleString()}`);
        }
        console.log(`   └─`);
        console.log();
      }

      // Total P&L
      const totalPnl = positions.reduce((sum, p) => sum + parseFloat(p.position.unrealizedPnl), 0);
      const pnlColor = totalPnl >= 0 ? '🟢' : '🔴';
      const pnlSign = totalPnl >= 0 ? '+' : '';

      console.log('   ' + '-'.repeat(66));
      console.log(`   TOTAL UNREALIZED P&L: ${pnlColor} ${pnlSign}$${totalPnl.toFixed(2)}`);
    }

    // Get open orders
    console.log('\n' + '='.repeat(70));
    console.log('📝 OPEN ORDERS');
    console.log('='.repeat(70));

    const orders = await session.sdk.hyperLiquid.getHyperliquidOpenOrders(custodialAddress);

    if (!orders || orders.length === 0) {
      console.log('\n   No open orders');
    } else {
      console.log(`\n   Found ${orders.length} open order(s):\n`);

      for (const order of orders) {
        const side = order.side === 'B' ? '🟢 BUY' : '🔴 SELL';
        const orderType = order.orderType || (order.limitPx ? 'Limit' : 'Market');

        console.log(`   ┌─ ${order.coin} ${side} (${orderType})`);
        console.log(`   │  Order ID:   ${order.oid}`);
        console.log(`   │  Size:       ${order.sz} ${order.coin}`);
        if (order.limitPx) {
          console.log(`   │  Limit Price: $${parseFloat(order.limitPx).toLocaleString()}`);
        }
        console.log(`   │  Timestamp:  ${new Date(order.timestamp).toLocaleString()}`);
        console.log(`   └─`);
        console.log();
      }
    }

  } catch (error: any) {
    console.log(`\n❌ Error fetching positions: ${error.message}`);
    if (error.response) {
      console.log(`   Status: ${error.response.status}`);
      console.log(`   Data:`, error.response.data);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('✅ Position check complete!');
  console.log('='.repeat(70));
}

if (require.main === module) {
  checkHLPositions().catch(console.error);
}

export { checkHLPositions };
