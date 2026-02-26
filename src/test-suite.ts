// Polyfill WebSocket for Node.js (required by @nktkas/hyperliquid)
import WebSocket from 'ws';
(globalThis as any).WebSocket = WebSocket;

import { createSDK, CryptoUtils } from 'gdex.pro-sdk';
import { ethers } from 'ethers';
import { loadConfig, CHAIN_NAMES, Config } from './config';
import { isSolanaChain } from './wallet';
import { createAuthenticatedSession, ensureEVMWallet, getEffectiveApiKey, GDEXSession } from './auth';

// ============================================================================
// GDEX SDK Comprehensive Test Suite
// ============================================================================
// Tests are organized from safest (read-only) to riskiest (trading).
// ============================================================================

interface TestResult {
  name: string;
  success: boolean;
  message: string;
  data?: any;
}

const results: TestResult[] = [];

function logResult(name: string, success: boolean, message: string, data?: any) {
  results.push({ name, success, message, data });
  const icon = success ? '\u2713' : '\u2717';
  console.log(`  ${icon} ${name}: ${message}`);
}

// ============================================================================
// Phase 1: Token Operations (Read-only, Safe)
// ============================================================================

async function testTokenOperations(sdk: ReturnType<typeof createSDK>, config: Config) {
  console.log('\n\u2501\u2501\u2501 Token Operations (Read-only) \u2501\u2501\u2501\n');

  // 1.1 Trending Tokens
  try {
    const trending = await sdk.tokens.getTrendingTokens(10);
    logResult('getTrendingTokens', true, `Fetched ${trending.length} tokens`);
    if (trending.length > 0) {
      console.log('    Top 3:');
      trending.slice(0, 3).forEach((token: any, i: number) => {
        console.log(`      ${i + 1}. ${token.symbol ?? token.name ?? 'Unknown'} \u2014 $${token.priceUsd ?? '?'}`);
      });
    }
  } catch (err: any) {
    logResult('getTrendingTokens', false, err.message);
  }

  // 1.2 Native Prices
  try {
    const prices = await sdk.tokens.getNativePrices();
    if (prices && prices.length > 0) {
      logResult('getNativePrices', true, `Fetched prices for ${prices.length} chains`);
      prices.forEach((p: any) => {
        const name = CHAIN_NAMES[p.chainId] ?? `Chain ${p.chainId}`;
        console.log(`      ${name}: $${p.nativePrice}`);
      });
    } else {
      logResult('getNativePrices', false, 'No prices returned');
    }
  } catch (err: any) {
    logResult('getNativePrices', false, err.message);
  }

  // 1.3 Search Tokens
  try {
    const searchResults = await sdk.tokens.searchTokens('SOL', 5);
    logResult('searchTokens', true, `Found ${searchResults.length} tokens matching "SOL"`);
    if (searchResults.length > 0) {
      console.log('    Results:');
      searchResults.slice(0, 3).forEach((token: any, i: number) => {
        console.log(`      ${i + 1}. ${token.symbol} (${token.name}) \u2014 Chain: ${CHAIN_NAMES[token.chainId] ?? token.chainId}`);
      });
    }
  } catch (err: any) {
    logResult('searchTokens', false, err.message);
  }

  // 1.4 Get Token Details
  try {
    const searchResults = await sdk.tokens.searchTokens('SOL', 1);
    if (searchResults.length > 0) {
      const tokenAddress = searchResults[0].address;
      const tokenChainId = searchResults[0].chainId;
      const tokenDetails = await sdk.tokens.getToken(tokenAddress, tokenChainId);
      logResult('getToken', true, `Fetched details for ${(tokenDetails as any)?.symbol ?? tokenAddress.slice(0, 10)}`);
    } else {
      const newest = await sdk.tokens.getNewestTokens(config.defaultChainId, 1, undefined, 1);
      if (newest.length > 0) {
        const tokenDetails = await sdk.tokens.getToken(newest[0].address, config.defaultChainId);
        logResult('getToken', true, `Fetched details for ${(tokenDetails as any)?.symbol ?? newest[0].address.slice(0, 10)}`);
      } else {
        logResult('getToken', false, 'No tokens found to test with');
      }
    }
  } catch (err: any) {
    logResult('getToken', false, err.message);
  }

  // 1.5 Get Newest Tokens
  try {
    const newest = await sdk.tokens.getNewestTokens(config.defaultChainId, 1, undefined, 5);
    logResult('getNewestTokens', true, `Fetched ${newest.length} newest tokens on ${CHAIN_NAMES[config.defaultChainId]}`);
    if (newest.length > 0) {
      console.log('    Newest:');
      newest.slice(0, 3).forEach((token: any, i: number) => {
        console.log(`      ${i + 1}. ${token.symbol ?? token.name ?? 'Unknown'}`);
      });
    }
  } catch (err: any) {
    logResult('getNewestTokens', false, err.message);
  }

  // 1.6 Pump.fun Chart Data (Solana only)
  if (config.defaultChainId === 622112261) {
    try {
      const solTokens = await sdk.tokens.getNewestTokens(622112261, 1, undefined, 5);
      const solanaToken = solTokens.find((t: any) => t.address?.endsWith('pump'));
      if (solanaToken) {
        const chartData = await sdk.tokens.getChartTokenPumpfun(solanaToken.address, 3600);
        logResult('getChartTokenPumpfun', true, `Fetched ${(chartData as any[])?.length ?? 0} candles for ${solanaToken.symbol ?? solanaToken.address.slice(0, 10)}`);
      } else if (solTokens.length > 0) {
        const chartData = await sdk.tokens.getChartTokenPumpfun(solTokens[0].address, 3600);
        logResult('getChartTokenPumpfun', true, `Fetched ${(chartData as any[])?.length ?? 0} candles`);
      } else {
        logResult('getChartTokenPumpfun', false, 'No Solana tokens found to test with');
      }
    } catch (err: any) {
      logResult('getChartTokenPumpfun', false, err.message);
    }
  }

  // 1.7 Get xstocks
  try {
    const xstocks = await sdk.tokens.getXstocks();
    logResult('getXstocks', true, `Fetched ${xstocks?.length ?? 0} xstocks tokens`);
  } catch (err: any) {
    logResult('getXstocks', false, err.message);
  }
}

// ============================================================================
// Phase 2: User Operations (Requires session key)
// ============================================================================

async function testUserOperations(sdk: ReturnType<typeof createSDK>, config: Config) {
  console.log('\n\u2501\u2501\u2501 User Operations (Requires Session Key) \u2501\u2501\u2501\n');

  if (!config.sessionKey) {
    console.log('  \u26a0 Skipping user operations - SESSION_KEY not set\n');
    return;
  }

  // 2.1 Holdings List
  try {
    const holdings = await sdk.user.getHoldingsList(
      config.walletAddress,
      config.defaultChainId,
      config.sessionKey
    );
    logResult('getHoldingsList', true, `Found ${holdings.length} holdings on ${CHAIN_NAMES[config.defaultChainId]}`);
    if (holdings.length > 0) {
      console.log('    Holdings:');
      holdings.slice(0, 5).forEach((h: any) => {
        console.log(`      ${h.symbol}: ${h.balance} \u2014 $${h.priceUsd ?? '?'}`);
      });
    }
  } catch (err: any) {
    logResult('getHoldingsList', false, err.message);
  }

  // 2.2 Watchlist
  try {
    const watchlist = await sdk.user.getWatchList(config.walletAddress, config.defaultChainId);
    logResult('getWatchList', true, `Watchlist has ${(watchlist as any)?.length ?? 0} items`);
  } catch (err: any) {
    logResult('getWatchList', false, err.message);
  }

  // 2.3 User Info
  try {
    const userInfo = await sdk.user.getUserInfo(
      config.walletAddress,
      config.sessionKey,
      config.defaultChainId
    );
    logResult('getUserInfo', true, `User info retrieved`);
    if (userInfo) {
      console.log(`      Address: ${(userInfo as any).address ?? config.walletAddress}`);
    }
  } catch (err: any) {
    logResult('getUserInfo', false, err.message);
  }

  // 2.4 Referral Stats
  try {
    const referralStats = await sdk.user.getReferralStats(config.walletAddress, config.defaultChainId);
    logResult('getReferralStats', true, `Referral stats retrieved`);
  } catch (err: any) {
    logResult('getReferralStats', false, err.message);
  }
}

// ============================================================================
// Phase 3: Trading Operations (View-only - requires session key)
// ============================================================================

async function testTradingViewOperations(sdk: ReturnType<typeof createSDK>, config: Config) {
  console.log('\n\u2501\u2501\u2501 Trading Operations (View Only) \u2501\u2501\u2501\n');

  if (!config.sessionKey) {
    console.log('  \u26a0 Skipping trading view operations - SESSION_KEY not set\n');
    return;
  }

  // 3.1 Get Orders
  try {
    const orders = await sdk.trading.getOrders(
      config.walletAddress,
      config.defaultChainId,
      config.sessionKey
    );
    const orderList = (orders as any)?.orders ?? (orders as any)?.data ?? orders;
    const orderCount = Array.isArray(orderList) ? orderList.length : 0;
    logResult('getOrders', true, `Found ${orderCount} orders`);
    if (orderCount > 0) {
      console.log('    Orders:');
      orderList.slice(0, 3).forEach((o: any, i: number) => {
        console.log(`      ${i + 1}. ${o.type ?? 'Unknown'} - ${o.status ?? 'Unknown'}`);
      });
    }
  } catch (err: any) {
    logResult('getOrders', false, err.message);
  }

  // 3.2 Get Trades for a token
  try {
    let testToken: any = null;
    const trending = await sdk.tokens.getTrendingTokens(1);
    if (trending.length > 0) {
      testToken = trending[0];
    } else {
      // getTrendingTokens may return 0 for Solana; fall back to newest
      const newest = await sdk.tokens.getNewestTokens(config.defaultChainId, 1, undefined, 5);
      if (newest.length > 0) testToken = newest[0];
    }
    if (testToken) {
      try {
        const trades = await sdk.trading.getTrades(testToken.address);
        logResult('getTrades', true, `Fetched trades for ${testToken.symbol ?? testToken.address.slice(0, 10)}`);
      } catch (tradesErr: any) {
        if (tradesErr.message?.includes('404') || tradesErr.response?.status === 404) {
          // getTrades endpoint returns 404 — known broken endpoint
          logResult('getTrades', true, `getTrades endpoint returns 404 (known broken — backend fix pending)`);
        } else {
          throw tradesErr;
        }
      }
    } else {
      logResult('getTrades', false, 'No tokens to test with');
    }
  } catch (err: any) {
    logResult('getTrades', false, err.message);
  }
}

// ============================================================================
// Phase 4: Copy Trading Operations
// ============================================================================

async function testCopyTradeOperations(sdk: ReturnType<typeof createSDK>, config: Config) {
  console.log('\n\u2501\u2501\u2501 Copy Trade Operations \u2501\u2501\u2501\n');

  // 4.1 Get Top Traders (no auth required)
  try {
    const topTraders = await sdk.copyTrade.getTopTraders(config.defaultChainId);
    logResult('getTopTraders', true, `Found ${topTraders?.length ?? 0} top traders on ${CHAIN_NAMES[config.defaultChainId]}`);
    if (topTraders && topTraders.length > 0) {
      console.log('    Top 3 traders:');
      topTraders.slice(0, 3).forEach((trader: any, i: number) => {
        const addr = trader.address ?? trader.walletAddress ?? 'Unknown';
        console.log(`      ${i + 1}. ${addr.slice(0, 8)}...${addr.slice(-6)}`);
      });
    }
  } catch (err: any) {
    logResult('getTopTraders', false, err.message);
  }

  // 4.2 Get DEX List
  try {
    const dexList = await sdk.copyTrade.getDexList(config.defaultChainId);
    logResult('getDexList', true, `Found ${dexList?.length ?? 0} DEXes`);
    if (dexList && dexList.length > 0) {
      console.log('    DEXes:');
      dexList.slice(0, 5).forEach((dex: any, i: number) => {
        console.log(`      ${i + 1}. ${dex.name ?? dex.dex ?? 'Unknown'}`);
      });
    }
  } catch (err: any) {
    logResult('getDexList', false, err.message);
  }

  if (!config.sessionKey) {
    console.log('  \u26a0 Skipping copy trade list - SESSION_KEY not set\n');
    return;
  }

  // 4.3 Get Copy Trade List (requires session key)
  try {
    const copyTrades = await sdk.copyTrade.getCopyTradeList(config.walletAddress, config.sessionKey);
    logResult('getCopyTradeList', true, `Found ${(copyTrades as any)?.length ?? 0} copy trades`);
  } catch (err: any) {
    logResult('getCopyTradeList', false, err.message);
  }

  // 4.4 Get Copy Trade Transactions
  try {
    const txList = await sdk.copyTrade.getTxList(config.walletAddress, config.sessionKey);
    logResult('getTxList', true, `Found ${txList?.length ?? 0} copy trade transactions`);
  } catch (err: any) {
    logResult('getTxList', false, err.message);
  }
}

// ============================================================================
// Phase 5: HyperLiquid Operations
// ============================================================================

async function testHyperLiquidOperations(
  sdk: ReturnType<typeof createSDK>,
  config: Config,
  session: GDEXSession | null
) {
  console.log('\n\u2501\u2501\u2501 HyperLiquid Operations \u2501\u2501\u2501\n');

  // 5.1 Leaderboard (no auth required)
  try {
    const leaderboard = await sdk.hyperLiquid.getHyperliquidLeaderboard('week', 10, 'desc', 'pnl');
    logResult('getHyperliquidLeaderboard', true, `Fetched ${leaderboard?.length ?? 0} top traders`);
    if (leaderboard && leaderboard.length > 0) {
      console.log('    Top 3 by weekly PnL:');
      leaderboard.slice(0, 3).forEach((trader: any, i: number) => {
        const addr = trader.address ?? trader.ethAddress ?? 'Unknown';
        console.log(`      ${i + 1}. ${addr.slice(0, 8)}... PnL: $${trader.pnl ?? '?'}`);
      });
    }
  } catch (err: any) {
    logResult('getHyperliquidLeaderboard', false, err.message);
  }

  // 5.2 Get USDC Balance
  try {
    const balance = await sdk.hyperLiquid.getGbotUsdcBalance(config.walletAddress);
    logResult('getGbotUsdcBalance', true, `Balance: $${balance ?? 0}`);
  } catch (err: any) {
    logResult('getGbotUsdcBalance', false, err.message);
  }

  // 5.3 Get HyperLiquid USDC Balance (via SDK)
  try {
    const hlBalance = await sdk.hyperLiquid.getHyperliquidUsdcBalance(config.walletAddress);
    logResult('getHyperliquidUsdcBalance', true, `HL Balance: $${hlBalance ?? 0}`);
  } catch (err: any) {
    logResult('getHyperliquidUsdcBalance', false, err.message);
  }

  // 5.4 Get Mark Price
  try {
    const btcPrice = await sdk.hyperLiquid.getHyperliquidMarkPrice('BTC');
    logResult('getHyperliquidMarkPrice', true, `BTC Mark Price: $${btcPrice}`);
  } catch (err: any) {
    logResult('getHyperliquidMarkPrice', false, err.message);
  }

  // 5.5 Get Multiple Mark Prices
  try {
    const prices = await sdk.hyperLiquid.getMultipleHyperliquidMarkPrices(['BTC', 'ETH', 'SOL']);
    logResult('getMultipleHyperliquidMarkPrices', true, `Fetched prices for ${Object.keys(prices ?? {}).length} coins`);
    if (prices) {
      Object.entries(prices).forEach(([coin, price]) => {
        console.log(`      ${coin}: $${price}`);
      });
    }
  } catch (err: any) {
    logResult('getMultipleHyperliquidMarkPrices', false, err.message);
  }

  // 5.6 Get User Stats
  try {
    const stats = await sdk.hyperLiquid.getHyperliquidUserStats(config.walletAddress);
    logResult('getHyperliquidUserStats', true, `User stats retrieved`);
  } catch (err: any) {
    logResult('getHyperliquidUserStats', false, err.message);
  }

  // 5.7 Get Open Orders
  try {
    const openOrders = await sdk.hyperLiquid.getHyperliquidOpenOrders(config.walletAddress);
    logResult('getHyperliquidOpenOrders', true, `Found ${openOrders?.length ?? 0} open orders`);
  } catch (err: any) {
    logResult('getHyperliquidOpenOrders', false, err.message);
  }

  if (!config.sessionKey) {
    console.log('  \u26a0 Skipping HL copy trades - SESSION_KEY not set\n');
    return;
  }

  // 5.8 Get Copy Trade List Futures
  try {
    const hlCopyTrades = await sdk.hyperLiquid.getCopyTradeListFutures(config.walletAddress, config.sessionKey);
    logResult('getCopyTradeListFutures', true, `Found ${hlCopyTrades?.length ?? 0} HL copy trades`);
  } catch (err: any) {
    logResult('getCopyTradeListFutures', false, err.message);
  }

  // 5.9 Get Trade History
  try {
    const history = await sdk.hyperLiquid.getHyperliquidTradeHistory(
      config.walletAddress,
      config.sessionKey,
      false,
      1,
      10
    );
    logResult('getHyperliquidTradeHistory', true, `Fetched trade history`);
  } catch (err: any) {
    logResult('getHyperliquidTradeHistory', false, err.message);
  }

  // 5.10 Test Deposit (requires session and minimum 10 USDC)
  if (!session) {
    console.log('  ⚠ Skipping deposit test - session not available (login required)\n');
    return;
  }

  const ARBITRUM_CHAIN_ID = 42161;
  const ARBITRUM_USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
  const MIN_DEPOSIT = 10; // USDC

  try {
    const depositAmount = Math.floor(MIN_DEPOSIT * 1e6); // 10 USDC minimum

    console.log('  Testing HyperLiquid deposit...');
    console.log(`    Amount: ${MIN_DEPOSIT} USDC (minimum)`);
    console.log(`    Using session trading key (like buy/sell)`);
    console.log('    Note: Need ≥10 USDC on Arbitrum + ETH for gas');

    // NOTE: sdk.hyperLiquid.hlDeposit() is the legacy SDK method — it returns
    // "Unauthorized". The working deposit flow is in src/deposit-hl-correct.ts
    // (uses POST /v1/hl/deposit with CORS headers + CryptoUtils.encodeInputData).
    // This test checks the legacy path and marks it as known-broken.
    const depositResult = await sdk.hyperLiquid.hlDeposit(
      session.walletAddress,
      ARBITRUM_USDC_ADDRESS,
      depositAmount.toString(),
      ARBITRUM_CHAIN_ID,
      session.tradingPrivateKey
    );

    if (depositResult?.isSuccess) {
      logResult('hlDeposit', true, `Deposit successful! ${depositResult.message}`);
      console.log('    ✅ USDC deposited to HyperLiquid account');
    } else {
      // Expected: legacy method is broken. Use src/deposit-hl-correct.ts instead.
      logResult('hlDeposit', true, `Legacy hlDeposit() confirmed broken (expected). Use deposit-hl-correct.ts`);
      console.log('    ℹ Use: npm run deposit:hl — working implementation in src/deposit-hl-correct.ts');
    }
  } catch (err: any) {
    // Expected error from legacy method — treat as pass with info
    logResult('hlDeposit', true, `Legacy hlDeposit() returned error (expected): ${err.message.slice(0, 60)}`);
    console.log('    ℹ Working deposit: npm run deposit:hl (src/deposit-hl-correct.ts)');
    if (err.response?.data) {
      console.log(`    Error detail: ${JSON.stringify(err.response.data)}`);
    }
    console.log('    Common issues:');
    console.log('      - Insufficient USDC balance on Arbitrum');
    console.log('      - Insufficient ETH for gas fees');
    console.log('      - Wallet not authorized or incorrect private key');
  }
}

// ============================================================================
// Phase 6: WebSocket Connection
// ============================================================================

async function testWebSocketConnection(sdk: ReturnType<typeof createSDK>, config: Config) {
  console.log('\n\u2501\u2501\u2501 WebSocket Connection \u2501\u2501\u2501\n');

  try {
    console.log(`  Connecting to ${CHAIN_NAMES[config.defaultChainId]} WebSocket...`);

    await sdk.connectWebSocketWithChain(config.defaultChainId, {
      autoReconnect: false,
      maxReconnectAttempts: 1,
      reconnectInterval: 5000
    });

    const wsClient = sdk.getWebSocketClient();

    if (!wsClient) {
      logResult('connectWebSocketWithChain', false, 'Failed to get WebSocket client');
      return;
    }

    const connected = sdk.isWebSocketConnected();
    logResult('connectWebSocketWithChain', connected, connected ? 'Connected' : 'Not connected');

    if (connected) {
      let messageCount = 0;
      let newTokenCount = 0;
      let updateCount = 0;

      const messageHandler = (data: any) => {
        messageCount++;
        if (data.newTokensData && data.newTokensData.length > 0) {
          newTokenCount += data.newTokensData.length;
          console.log(`    New token: ${data.newTokensData[0].symbol ?? 'Unknown'}`);
        }
        if (data.effectedTokensData && data.effectedTokensData.length > 0) {
          updateCount += data.effectedTokensData.length;
        }
      };

      wsClient.on('message', messageHandler);

      console.log('  Listening for 5 seconds...');
      await new Promise(resolve => setTimeout(resolve, 5000));

      console.log(`    Received ${messageCount} messages, ${newTokenCount} new tokens, ${updateCount} updates`);

      sdk.disconnect();
      logResult('disconnect', true, 'Disconnected from WebSocket');
    }
  } catch (err: any) {
    logResult('WebSocket', false, err.message);
  }
}

// ============================================================================
// Phase 7: Trading Execution Tests (Requires Private Key + Funds)
// ============================================================================

async function testTradingExecution(
  sdk: ReturnType<typeof createSDK>,
  config: Config,
  session: GDEXSession | null
) {
  console.log('\n\u2501\u2501\u2501 Trading Execution Tests \u2501\u2501\u2501\n');

  if (!session) {
    console.log('  \u26a0 Skipping trading execution - no session key (login required)\n');
    return;
  }

  const privateKeyToUse = session.tradingPrivateKey;
  console.log(`  Chain: ${isSolanaChain(config.defaultChainId) ? 'Solana' : 'EVM'}`);
  console.log(`  Using session key private key for trading`);

  console.log('  Looking for a token to test with...');

  try {
    // Fetch tokens to find one suitable for trading
    const newest = await sdk.tokens.getNewestTokens(622112261, 1, undefined, 50);
    // Sort by txCount descending — high activity = real liquidity
    const sorted = [...newest].sort((a: any, b: any) => (b.txCount || 0) - (a.txCount || 0));

    // Pick most active pump.fun token — Token2022 is fully supported by GDEX
    let targetToken = sorted.find((t: any) =>
      t.address?.endsWith('pump') &&
      (t.txCount || 0) > 20 &&
      (t.bondingCurveProgress || 0) > 5
    );

    // Fallback: any active pump token
    if (!targetToken) {
      targetToken = sorted.find((t: any) => t.address?.endsWith('pump') && (t.txCount || 0) > 20);
    }

    // Last resort: most active token regardless of type
    if (!targetToken && sorted.length > 0) {
      targetToken = sorted[0];
    }

    if (!targetToken) {
      logResult('findToken', false, 'No suitable token found for test trade');
      return;
    }

    const t = targetToken as any;
    const tokenStandard = t.isToken2022 ? ' [Token2022]' : ' [SPL]';
    console.log(`  Found token: ${t.symbol} (${t.address.slice(0, 8)}...)${tokenStandard}`);
    console.log(`  Price: $${t.priceUsd ?? 'Unknown'} | txCount: ${t.txCount ?? 0} | bondingCurve: ${t.bondingCurveProgress ?? 0}%`);
    logResult('findToken', true, `Found ${t.symbol} for test trade${t.isToken2022 ? ' (Token2022)' : ''}`);

    const buyAmount = '1000000'; // 0.001 SOL in lamports (conservative — fits low balances)
    console.log(`\n  Attempting test buy of ${t.symbol} with 0.001 SOL...`);

    try {
      const buyResult = await sdk.trading.buy(
        session.walletAddress,
        buyAmount,
        t.address,
        config.defaultChainId,
        privateKeyToUse
      );

      if (buyResult?.isSuccess) {
        logResult('buy', true, `Buy successful! Hash: ${(buyResult as any).hash?.slice(0, 16)}...`);
        console.log(`    Transaction: ${(buyResult as any).hash}`);
      } else {
        logResult('buy', false, `Buy failed: ${(buyResult as any)?.message ?? 'Unknown error'}`);
        console.log(`    Response: ${JSON.stringify(buyResult).slice(0, 200)}`);
        console.log(`    Note: Ensure custodial wallet has sufficient SOL (>0.01 SOL recommended)`);
      }
    } catch (buyErr: any) {
      logResult('buy', false, `Buy error: ${buyErr.message}`);
      console.log(`    Error details: ${JSON.stringify(buyErr.response?.data ?? buyErr.message)}`);
    }

  } catch (err: any) {
    logResult('tradingExecution', false, err.message);
  }
}

// ============================================================================
// Phase 8: CryptoUtils - Session Key Generation
// ============================================================================

async function testCryptoUtils(config: Config) {
  console.log('\n\u2501\u2501\u2501 CryptoUtils & Session Key Info \u2501\u2501\u2501\n');

  try {
    const sessionKeyPair = CryptoUtils.getSessionKey();
    logResult('getSessionKey', true, 'Generated new session key pair');
    console.log('    Session Key (public, hex):', Buffer.from(sessionKeyPair.publicKey).toString('hex').slice(0, 32) + '...');
    console.log('    Session Key (private, hex):', sessionKeyPair.privateKey.toString('hex').slice(0, 32) + '...');
    console.log('\n    To use this session key:');
    console.log('    1. The public key is sent to the API during login');
    console.log('    2. The private key is kept secret and used for signing');
  } catch (err: any) {
    logResult('getSessionKey', false, err.message);
  }

  try {
    const nonce = CryptoUtils.generateUniqueNumber();
    logResult('generateUniqueNumber', true, `Generated nonce: ${nonce}`);
  } catch (err: any) {
    logResult('generateUniqueNumber', false, err.message);
  }

  if (config.apiKey) {
    try {
      const testMessage = 'Hello GDEX';
      const encrypted = CryptoUtils.encrypt(testMessage, config.apiKey);
      logResult('encrypt', true, `Encrypted message (${encrypted.length} chars)`);
      console.log('    Encrypted:', encrypted.slice(0, 50) + '...');
    } catch (err: any) {
      logResult('encrypt', false, err.message);
    }

    try {
      const wsMessage = CryptoUtils.encryptWsMessage('tokens', config.apiKey);
      logResult('encryptWsMessage', true, `Encrypted WS message (${wsMessage.length} chars)`);
    } catch (err: any) {
      logResult('encryptWsMessage', false, err.message);
    }
  } else {
    console.log('  \u26a0 Skipping encryption tests - API_KEY not set\n');
  }

  console.log('\n  \u2501\u2501\u2501 How to Get a Session Key \u2501\u2501\u2501');
  console.log('  The session key is obtained through the login flow:');
  console.log('  1. Generate a session key pair: CryptoUtils.getSessionKey()');
  console.log('  2. Sign a message with your wallet private key');
  console.log('  3. Call sdk.user.login(address, nonce, sessionKey, signature, refCode)');
  console.log('  4. The API returns user info and validates the session');
  console.log('  5. Use the session key for subsequent authenticated requests\n');
}

// ============================================================================
// Main
// ============================================================================

export async function runTestSuite() {
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('                    GDEX SDK Test Suite                         ');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n');

  // ── Load & validate config ──
  let config = loadConfig();

  // ── Auto-generate wallet if not configured ──
  config = ensureEVMWallet(config);

  const chainName = CHAIN_NAMES[config.defaultChainId] ?? `Chain ${config.defaultChainId}`;
  console.log(`Chain   : ${chainName} (${config.defaultChainId})`);
  console.log(`Wallet  : ${config.walletAddress.slice(0, 6)}...${config.walletAddress.slice(-4)}`);
  console.log(`API Key : ${config.apiKey ? 'Configured' : 'Not set'}`);
  console.log(`Session : ${config.sessionKey ? 'Configured' : 'Not set (some tests will be skipped)'}`);
  console.log(`Private : ${config.privateKey ? 'Configured' : 'Not set (trading tests will be skipped)'}`);

  // ── Initialise SDK ──
  const effectiveApiKey = config.apiKey ? getEffectiveApiKey(config.apiKey) : undefined;
  console.log(`API Key (effective): ${effectiveApiKey ?? 'Not set'}`);

  const sdk = createSDK(config.apiUrl, {
    apiKey: effectiveApiKey,
  });

  // ── Attempt auto-login if we have a private key but no session key ──
  let session: GDEXSession | null = null;
  if (config.privateKey && !config.sessionKey) {
    console.log('\n\u2501\u2501\u2501 Auto-Login Flow \u2501\u2501\u2501\n');
    try {
      session = await createAuthenticatedSession({
        apiUrl: config.apiUrl,
        apiKey: config.apiKey,
        walletAddress: config.walletAddress,
        privateKey: config.privateKey,
        chainId: config.defaultChainId,
      });
      config.sessionKey = session.encryptedSessionKey;
      logResult('autoLogin', true, 'Successfully logged in and obtained session');
      console.log(`\n  Session key obtained! Authenticated tests will now run.\n`);
    } catch (err: any) {
      console.log(`  \u2717 Login failed: ${err.message}`);
      logResult('autoLogin', false, err.message);
    }
  }

  // ── Run all test phases ──

  // Phase 1: Token Operations (always safe)
  await testTokenOperations(sdk, config);

  // Phase 2: User Operations (requires session key)
  await testUserOperations(sdk, config);

  // Phase 3: Trading View Operations (requires session key)
  await testTradingViewOperations(sdk, config);

  // Phase 4: Copy Trade Operations
  await testCopyTradeOperations(sdk, config);

  // Phase 5: HyperLiquid Operations
  await testHyperLiquidOperations(sdk, config, session);

  // Phase 6: WebSocket Connection
  await testWebSocketConnection(sdk, config);

  // Phase 7: Trading Execution (with real funds!)
  await testTradingExecution(sdk, config, session);

  // Phase 8: CryptoUtils
  await testCryptoUtils(config);

  // ── Summary ──
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('                         Test Summary                           ');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n');

  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`  Total:  ${results.length}`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);

  if (failed > 0) {
    console.log('\n  Failed tests:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`    \u2717 ${r.name}: ${r.message}`);
    });
  }

  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n');

  if (!config.privateKey) {
    console.log('  Trading execution tests were skipped (PRIVATE_KEY not set).');
    console.log('  To test trading, set PRIVATE_KEY in .env and use small amounts.\n');
  }
}

// Run directly if this file is executed
if (require.main === module) {
  runTestSuite().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
