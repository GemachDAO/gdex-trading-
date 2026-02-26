import { createAuthenticatedSession } from './auth';
import { loadConfig } from './config';

async function hlDashboard() {
  console.clear();
  console.log('═'.repeat(70));
  console.log('                   🚀 HYPERLIQUID DASHBOARD 🚀');
  console.log('═'.repeat(70));

  const config = loadConfig();

  // Authenticate
  const session = await createAuthenticatedSession({
    apiUrl: config.apiUrl,
    apiKey: config.apiKey,
    walletAddress: config.walletAddress,
    privateKey: config.privateKey,
    chainId: 42161,
  });

  // Get custodial address
  const userInfo = await session.sdk.user.getUserInfo(
    session.walletAddress,
    session.encryptedSessionKey,
    42161
  );

  if (!userInfo) {
    console.log('\n❌ Failed to get user info');
    return;
  }

  const custodialAddress = userInfo.address;

  console.log('\n📋 ACCOUNT INFO');
  console.log('─'.repeat(70));
  console.log(`   Control Wallet:      ${session.walletAddress}`);
  console.log(`   Custodial Address:   ${custodialAddress}`);

  // Get balance
  const balance = await session.sdk.hyperLiquid.getHyperliquidUsdcBalance(custodialAddress);

  // Get clearinghouse state
  const state = await session.sdk.hyperLiquid.getHyperliquidClearinghouseState(custodialAddress);

  console.log('\n💰 ACCOUNT BALANCE');
  console.log('─'.repeat(70));

  if (state && state.crossMarginSummary) {
    const summary = state.crossMarginSummary;
    const accountValue = parseFloat(summary.accountValue || '0');
    const marginUsed = parseFloat(summary.totalMarginUsed || '0');
    const posValue = parseFloat(summary.totalNtlPos || '0');
    const withdrawable = parseFloat(state.withdrawable || '0');

    console.log(`   Account Value:       $${accountValue.toFixed(2)}`);
    console.log(`   Margin Used:         $${marginUsed.toFixed(2)}`);
    console.log(`   Available:           $${withdrawable.toFixed(2)}`);
    console.log(`   Position Value:      $${Math.abs(posValue).toFixed(2)}`);
  } else {
    console.log(`   Balance:             $${balance?.toFixed(2) ?? '0.00'}`);
  }

  // Get positions
  console.log('\n📊 OPEN POSITIONS');
  console.log('─'.repeat(70));

  const positions = state?.assetPositions || [];

  if (positions.length === 0) {
    console.log('   No open positions');
  } else {
    let totalPnl = 0;

    for (const pos of positions) {
      const position = pos.position;
      const szi = parseFloat(position.szi);
      const isLong = szi > 0;
      const size = Math.abs(szi);
      const entryPrice = parseFloat(position.entryPx);
      const unrealizedPnl = parseFloat(position.unrealizedPnl);
      const leverage = position.leverage?.value || position.leverage;

      totalPnl += unrealizedPnl;

      const pnlColor = unrealizedPnl >= 0 ? '🟢' : '🔴';
      const pnlSign = unrealizedPnl >= 0 ? '+' : '';
      const direction = isLong ? '🟢 LONG' : '🔴 SHORT';

      console.log(`\n   ${position.coin} ${direction} ${leverage}x`);
      console.log(`      Size: ${size.toFixed(4)} | Entry: $${entryPrice.toLocaleString()} | P&L: ${pnlColor} ${pnlSign}$${unrealizedPnl.toFixed(2)}`);
    }

    console.log('\n   ' + '─'.repeat(66));
    const totalPnlColor = totalPnl >= 0 ? '🟢' : '🔴';
    const totalPnlSign = totalPnl >= 0 ? '+' : '';
    console.log(`   TOTAL P&L: ${totalPnlColor} ${totalPnlSign}$${totalPnl.toFixed(2)}`);
  }

  // Get open orders
  console.log('\n📝 OPEN ORDERS');
  console.log('─'.repeat(70));

  try {
    const orders = await session.sdk.hyperLiquid.getHyperliquidOpenOrders(custodialAddress);

    if (!orders || orders.length === 0) {
      console.log('   No open orders');
    } else {
      for (const order of orders) {
        const side = order.side === 'B' ? '🟢 BUY' : '🔴 SELL';
        const price = order.limitPx ? `$${parseFloat(order.limitPx).toLocaleString()}` : 'Market';
        console.log(`   ${order.coin} ${side} ${order.sz} @ ${price}`);
      }
    }
  } catch (error) {
    console.log('   Unable to fetch orders');
  }

  // Get recent trades
  console.log('\n📜 RECENT TRADES (Last 10)');
  console.log('─'.repeat(70));

  try {
    const history = await session.sdk.hyperLiquid.getHyperliquidTradeHistory(
      custodialAddress,
      session.encryptedSessionKey,
      false,
      1,
      10
    );

    if (!history || !history.fills || history.fills.length === 0) {
      console.log('   No recent trades');
    } else {
      for (const fill of history.fills.slice(0, 10)) {
        const side = fill.side === 'B' ? '🟢 BUY' : '🔴 SELL';
        const px = parseFloat(fill.px);
        const sz = parseFloat(fill.sz);
        const time = new Date(fill.time);
        const timeStr = time.toLocaleTimeString();

        console.log(`   ${timeStr} | ${fill.coin} ${side} ${sz} @ $${px.toLocaleString()}`);
      }
    }
  } catch (error) {
    console.log('   Unable to fetch trade history');
  }

  // Get current prices
  console.log('\n💹 CURRENT PRICES');
  console.log('─'.repeat(70));

  try {
    const btcPrice = await session.sdk.hyperLiquid.getHyperliquidMarkPrice('BTC');
    const ethPrice = await session.sdk.hyperLiquid.getHyperliquidMarkPrice('ETH');

    console.log(`   BTC: $${typeof btcPrice === 'number' ? btcPrice.toLocaleString() : btcPrice}`);
    console.log(`   ETH: $${typeof ethPrice === 'number' ? ethPrice.toLocaleString() : ethPrice}`);
  } catch (error) {
    console.log('   Unable to fetch prices');
  }

  console.log('\n' + '═'.repeat(70));
  console.log('🔄 Auto-refresh: Run this command again to update');
  console.log('Commands: npm run hl:positions | npm run hl:history | npm run hl:dashboard');
  console.log('═'.repeat(70) + '\n');
}

if (require.main === module) {
  hlDashboard().catch(console.error);
}

export { hlDashboard };
