import { createAuthenticatedSession } from './auth';
import { loadConfig } from './config';
import WebSocket from 'ws';

(globalThis as any).WebSocket = WebSocket;

async function exploreSDKData() {
  console.log('📊 GDEX SDK Data Exploration\n');
  console.log('='.repeat(80));

  const config = loadConfig();

  // Test on Solana (most data available)
  const session = await createAuthenticatedSession({
    apiUrl: config.apiUrl,
    apiKey: config.apiKey,
    walletAddress: config.walletAddress,
    privateKey: config.privateKey,
    chainId: 622112261, // Solana
  });

  console.log(`\n📡 Exploring Data on Solana (Chain ID: 622112261)`);
  console.log('='.repeat(80));

  // ===========================================
  // 1. TOKEN DATA
  // ===========================================
  console.log('\n┌─────────────────────────────────────────┐');
  console.log('│ 1. TOKEN DATA                           │');
  console.log('└─────────────────────────────────────────┘\n');

  // 1.1 Trending Tokens
  try {
    console.log('1.1 📈 Trending Tokens (Top 5)');
    const trending = await session.sdk.tokens.getTrendingTokens(5);
    console.log(`    Found: ${trending?.length ?? 0} tokens`);
    if (trending?.[0]) {
      const t = trending[0];
      console.log(`    Example (${t.symbol}):`, {
        address: t.address,
        name: t.name,
        symbol: t.symbol,
        marketCap: t.marketCap,
        priceUsd: t.priceUsd,
        priceNative: t.priceNative,
        liquidityUsd: t.liquidityUsd,
        txCount: t.txCount,
        priceChanges: t.priceChanges,
        volumes: t.volumes,
      });
    }
  } catch (error: any) {
    console.log(`    ❌ Error: ${error.message}`);
  }

  // 1.2 Newest Tokens
  try {
    console.log('\n1.2 🆕 Newest Tokens (Page 1, Limit 20)');
    const newest = await session.sdk.tokens.getNewestTokens(622112261, 1, undefined, 20);
    console.log(`    Found: ${newest?.length ?? 0} tokens`);
    if (newest?.[0]) {
      const n = newest[0];
      console.log(`    Example (${n.symbol}):`, {
        address: n.address,
        name: n.name,
        symbol: n.symbol,
        createdTime: n.createdTime,
        marketCap: n.marketCap,
        priceUsd: n.priceUsd,
        bondingCurveProgress: n.bondingCurveProgress,
        isListedOnDex: n.isListedOnDex,
        isPumpfun: n.isPumpfun,
        txCount: n.txCount,
        volumes: n.volumes,
        data24h: n.data24h,
      });
    }
  } catch (error: any) {
    console.log(`    ❌ Error: ${error.message}`);
  }

  // 1.3 Search Tokens
  try {
    console.log('\n1.3 🔍 Search Tokens (query: "SOL")');
    const search = await session.sdk.tokens.searchTokens('SOL', 5);
    console.log(`    Found: ${search?.length ?? 0} tokens`);
    if (search?.[0]) {
      console.log(`    Examples:`, search.map(t => ({ symbol: t.symbol, name: t.name })).slice(0, 3));
    }
  } catch (error: any) {
    console.log(`    ❌ Error: ${error.message}`);
  }

  // 1.4 Native Token Prices
  try {
    console.log('\n1.4 💰 Native Token Prices (All Chains)');
    const prices = await session.sdk.tokens.getNativePrices();
    console.log(`    Found: ${prices?.length ?? 0} chains`);
    if (prices) {
      prices.forEach(p => {
        console.log(`      Chain ${p.chainId}: $${p.nativePrice.toFixed(2)}`);
      });
    }
  } catch (error: any) {
    console.log(`    ❌ Error: ${error.message}`);
  }

  // ===========================================
  // 2. USER DATA
  // ===========================================
  console.log('\n┌─────────────────────────────────────────┐');
  console.log('│ 2. USER DATA                            │');
  console.log('└─────────────────────────────────────────┘\n');

  // 2.1 User Info
  try {
    console.log('2.1 👤 User Info');
    const userInfo = await session.sdk.user.getUserInfo(
      session.walletAddress,
      session.encryptedSessionKey,
      622112261
    );
    console.log(`    Custodial Address: ${userInfo?.address}`);
    console.log(`    Balance: ${userInfo?.balance}`);
    console.log(`    Is New User: ${userInfo?.isNewUser}`);
    console.log(`    Auto Buy: ${userInfo?.autoBuy}`);
    console.log(`    Quick Buy Amount: ${userInfo?.quickBuyAmount}`);
    console.log(`    Ref Code: ${userInfo?.refCode || 'N/A'}`);
  } catch (error: any) {
    console.log(`    ❌ Error: ${error.message}`);
  }

  // 2.2 Holdings
  try {
    console.log('\n2.2 💼 Holdings');
    const holdings = await session.sdk.user.getHoldingsList(
      session.walletAddress,
      622112261,
      session.encryptedSessionKey
    );
    console.log(`    Found: ${holdings?.length ?? 0} holdings`);
    if (holdings?.[0]) {
      const h = holdings[0];
      console.log(`    Example (${h.tokenInfo.symbol}):`, {
        amount: h.amount,
        uiAmount: h.uiAmount,
        holding: h.holding,
        invested: h.invested,
        pnlPercentage: h.pnlPercentage,
        startTimestamp: h.startTimestamp,
        canSell: h.canSell,
      });
    }
  } catch (error: any) {
    console.log(`    ❌ Error: ${error.message}`);
  }

  // 2.3 Watchlist
  try {
    console.log('\n2.3 ⭐ Watchlist');
    const watchlist = await session.sdk.user.getWatchList(
      session.walletAddress,
      622112261
    );
    console.log(`    Found: ${watchlist?.watchList?.length ?? 0} tokens`);
    if (watchlist?.watchList?.[0]) {
      console.log(`    Example:`, {
        symbol: watchlist.watchList[0].symbol,
        name: watchlist.watchList[0].name,
        marketCap: watchlist.watchList[0].marketCap,
      });
    }
  } catch (error: any) {
    console.log(`    ❌ Error: ${error.message}`);
  }

  // 2.4 Referral Stats
  try {
    console.log('\n2.4 🎁 Referral Stats');
    const refStats = await session.sdk.user.getReferralStats(
      session.walletAddress,
      622112261
    );
    console.log(`    Tier 1 Referrals: ${refStats?.totalReferralCountTier1 ?? 0}`);
    console.log(`    Tier 2 Referrals: ${refStats?.totalReferralCountTier2 ?? 0}`);
    console.log(`    Pending: ${refStats?.pendingAmount ?? '0'}`);
    console.log(`    Withdrawable: ${refStats?.withdrawable ?? '0'}`);
    console.log(`    Total Withdrawn: ${refStats?.totalWithdrawn ?? '0'}`);
  } catch (error: any) {
    console.log(`    ❌ Error: ${error.message}`);
  }

  // ===========================================
  // 3. TRADING DATA
  // ===========================================
  console.log('\n┌─────────────────────────────────────────┐');
  console.log('│ 3. TRADING DATA                         │');
  console.log('└─────────────────────────────────────────┘\n');

  // 3.1 Orders
  try {
    console.log('3.1 📋 Limit Orders');
    const orders = await session.sdk.trading.getOrders(
      session.walletAddress,
      622112261,
      session.encryptedSessionKey
    );
    console.log(`    Found: ${orders?.count ?? 0} orders`);
    if (orders?.orders?.[0]) {
      const o = orders.orders[0];
      console.log(`    Example:`, {
        orderId: o.orderId,
        symbol: o.symbol,
        isBuyLimit: o.isBuyLimit,
        price: o.price,
        fromTokenAmount: o.fromTokenAmount,
        toTokenAmount: o.toTokenAmount,
        isActive: o.isActive,
        isFilled: o.isFilled,
        profitPercent: o.profitPercent,
        lossPercent: o.lossPercent,
        createdAt: o.createdAt,
      });
    }
  } catch (error: any) {
    console.log(`    ❌ Error: ${error.message}`);
  }

  // ===========================================
  // 4. HYPERLIQUID DATA
  // ===========================================
  console.log('\n┌─────────────────────────────────────────┐');
  console.log('│ 4. HYPERLIQUID DATA (Switch to Arbitrum)│');
  console.log('└─────────────────────────────────────────┘\n');

  const hlSession = await createAuthenticatedSession({
    apiUrl: config.apiUrl,
    apiKey: config.apiKey,
    walletAddress: config.walletAddress,
    privateKey: config.privateKey,
    chainId: 42161, // Arbitrum
  });

  // 4.1 Balance
  try {
    console.log('4.1 💰 HyperLiquid USDC Balance');
    const balance = await hlSession.sdk.hyperLiquid.getHyperliquidUsdcBalance(hlSession.walletAddress);
    const withdrawable = await hlSession.sdk.hyperLiquid.getHyperliquidWithdrawableBalance(hlSession.walletAddress);
    console.log(`    Total Balance: $${balance ?? 0}`);
    console.log(`    Withdrawable: $${withdrawable ?? 0}`);
  } catch (error: any) {
    console.log(`    ❌ Error: ${error.message}`);
  }

  // 4.2 Mark Prices
  try {
    console.log('\n4.2 📊 Mark Prices (Multiple Coins)');
    const prices = await hlSession.sdk.hyperLiquid.getMultipleHyperliquidMarkPrices(['BTC', 'ETH', 'SOL']);
    console.log(`    Prices:`, prices);
  } catch (error: any) {
    console.log(`    ❌ Error: ${error.message}`);
  }

  // 4.3 Clearinghouse State
  try {
    console.log('\n4.3 🏦 Clearinghouse State');
    const state = await hlSession.sdk.hyperLiquid.getHyperliquidClearinghouseState(hlSession.walletAddress);
    console.log(`    Available: ${state ? 'Yes' : 'No'}`);
    if (state) {
      console.log(`    Asset Positions:`, state.assetPositions?.length ?? 0);
      console.log(`    Margin Summary:`, state.marginSummary);
    }
  } catch (error: any) {
    console.log(`    ❌ Error: ${error.message}`);
  }

  // 4.4 User Stats
  try {
    console.log('\n4.4 📈 User Stats (Detailed PnL & Volume)');
    const stats = await hlSession.sdk.hyperLiquid.getHyperliquidUserStats(hlSession.walletAddress);
    if (stats?.isSuccess && stats.userStats) {
      console.log(`    PnL:`, {
        '24h': `$${stats.userStats['24h']}`,
        '7d': `$${stats.userStats['7d']}`,
        '30d': `$${stats.userStats['30d']}`,
        allTime: `$${stats.userStats.allTime.pnl}`,
      });
      console.log(`    Volume:`, {
        '24h': `$${stats.userStats.volumes['24h']}`,
        '7d': `$${stats.userStats.volumes['7d']}`,
        '30d': `$${stats.userStats.volumes['30d']}`,
      });
      console.log(`    Trades (24h):`, {
        wins: stats.userStats.tradesCount['24h'].win,
        losses: stats.userStats.tradesCount['24h'].lose,
        total: stats.userStats.tradesCount['24h'].total,
      });
      console.log(`    Daily PnLs: ${stats.userStats.dailyPnls?.length ?? 0} records`);
    } else {
      console.log(`    No stats available (likely no trading history)`);
    }
  } catch (error: any) {
    console.log(`    ❌ Error: ${error.message}`);
  }

  // 4.5 Trade History
  try {
    console.log('\n4.5 📜 Trade History (Last 10 trades)');
    const history = await hlSession.sdk.hyperLiquid.getHyperliquidTradeHistory(
      hlSession.walletAddress,
      hlSession.encryptedSessionKey,
      false, // getFromApi
      1, // page
      10 // limit
    );
    console.log(`    Total Records: ${history?.pagination.totalRecords ?? 0}`);
    console.log(`    Fills: ${history?.fills?.length ?? 0}`);
    if (history?.fills?.[0]) {
      const f = history.fills[0];
      console.log(`    Example:`, {
        coin: f.coin,
        side: f.side,
        px: f.px,
        sz: f.sz,
        time: f.time,
        closedPnl: f.closedPnl,
      });
    }
  } catch (error: any) {
    console.log(`    ❌ Error: ${error.message}`);
  }

  // 4.6 Leaderboard
  try {
    console.log('\n4.6 🏆 Leaderboard (Top 5, All Time PnL)');
    const leaderboard = await hlSession.sdk.hyperLiquid.getHyperliquidLeaderboard('allTime', 5, 'desc', 'pnl');
    console.log(`    Found: ${leaderboard?.length ?? 0} traders`);
    if (leaderboard?.[0]) {
      leaderboard.slice(0, 3).forEach((trader, idx) => {
        const allTime = trader.windowPerformances.find(w => w[0] === 'allTime')?.[1];
        console.log(`    #${idx + 1} ${trader.displayName || 'Anonymous'}:`, {
          address: trader.ethAddress.substring(0, 10) + '...',
          accountValue: trader.accountValue,
          pnl: allTime?.pnl,
          roi: allTime?.roi,
          volume: allTime?.vlm,
        });
      });
    }
  } catch (error: any) {
    console.log(`    ❌ Error: ${error.message}`);
  }

  // 4.7 Copy Trading Setups
  try {
    console.log('\n4.7 📋 My Copy Trading Setups');
    const copyTrades = await hlSession.sdk.hyperLiquid.getCopyTradeListFutures(
      hlSession.walletAddress,
      hlSession.encryptedSessionKey
    );
    console.log(`    Found: ${copyTrades?.length ?? 0} setups`);
    if (copyTrades?.[0]) {
      copyTrades.forEach((c, idx) => {
        console.log(`    #${idx + 1} ${c.copyTradeName}:`, {
          traderWallet: c.traderWallet.substring(0, 10) + '...',
          copyMode: c.copyMode === 1 ? 'Fixed Amount' : 'Proportion',
          amount: c.fixedAmountCostPerOrder,
          profitPercent: c.profitPercent + '%',
          lossPercent: c.lossPercent + '%',
          isActive: c.isActive,
          totalTrades: c.totalTrades,
          totalPnl: c.totalPnl,
        });
      });
    }
  } catch (error: any) {
    console.log(`    ❌ Error: ${error.message}`);
  }

  // ===========================================
  // SUMMARY
  // ===========================================
  console.log('\n' + '='.repeat(80));
  console.log('✅ Data Exploration Complete!');
  console.log('\n📊 DATA SUMMARY FOR STATISTICAL ANALYSIS:\n');

  console.log('Token Metrics:');
  console.log('  • Price data (USD, Native)');
  console.log('  • Volume (5m, 1h, 6h, 24h)');
  console.log('  • Price changes (5m, 1h, 6h, 24h)');
  console.log('  • Market cap, liquidity');
  console.log('  • Transaction counts, buy/sell ratios');
  console.log('  • Holder analysis, top holder percentages');
  console.log('  • Bonding curve progress (Pump.fun)');
  console.log('  • Security metrics (mint/freeze, taxes, locks)');

  console.log('\nHyperLiquid Metrics:');
  console.log('  • Historical PnL (24h, 7d, 30d, all-time)');
  console.log('  • Daily PnL breakdown with timestamps');
  console.log('  • Volume tracking (24h, 7d, 30d)');
  console.log('  • Win/loss ratios per timeframe');
  console.log('  • Trade fills with prices, sizes, timestamps');
  console.log('  • Leaderboard data (PnL, ROI, volume)');
  console.log('  • Position data, margin usage');

  console.log('\nUser Data:');
  console.log('  • Holdings with PnL tracking');
  console.log('  • Investment vs. current value');
  console.log('  • Referral tree statistics');
  console.log('  • Trading settings & preferences');

  console.log('\nReal-time Streams (WebSocket):');
  console.log('  • New token launches (newTokensData)');
  console.log('  • Live price updates (effectedTokensData)');
  console.log('  • Volume changes');
  console.log('  • Transaction events');
  console.log('  • WS URL: wss://trade-ws-{chainId}.gemach.io\n');

  console.log('='.repeat(80));
}

if (require.main === module) {
  exploreSDKData().catch(console.error);
}

export { exploreSDKData };
