/**
 * Solana Meme Coin Swap - Buy and Sell
 *
 * Finds a trending meme coin on Solana, buys a small amount, then sells it back.
 */

import { createAuthenticatedSession } from './auth';
import { loadConfig } from './config';
import { buyToken, sellToken, formatSolAmount } from './trading';
import { getTrendingTokens, searchTokens, getHoldings } from './market';
import WebSocket from 'ws';

(globalThis as any).WebSocket = WebSocket;

const SOLANA_CHAIN_ID = 622112261;

async function solanaMemeSwap() {
  console.log('=== Solana Meme Coin Swap ===\n');

  const config = loadConfig();
  const apiKey = config.apiKey.split(',')[0].trim();

  // Step 1: Authenticate (use Solana chain, fallback to Arbitrum if needed)
  console.log('[1/6] Authenticating...');
  let session;
  try {
    session = await createAuthenticatedSession({
      apiUrl: config.apiUrl,
      apiKey,
      walletAddress: config.walletAddress,
      privateKey: config.privateKey,
      chainId: SOLANA_CHAIN_ID,
    });
    console.log('      Authenticated on Solana.\n');
  } catch (err: any) {
    console.log(`      Solana auth failed (${err.message}), trying Arbitrum...`);
    session = await createAuthenticatedSession({
      apiUrl: config.apiUrl,
      apiKey,
      walletAddress: config.walletAddress,
      privateKey: config.privateKey,
      chainId: 42161,
    });
    console.log('      Authenticated on Arbitrum (will trade on Solana).\n');
  }

  // Step 2: Find trending tokens on Solana
  console.log('[2/6] Finding trending meme coins on Solana...');

  let solanaTrending: any[] = [];

  // Try trending tokens first
  const trending = await getTrendingTokens(session.sdk, 50);
  console.log(`      Total trending: ${trending.length}`);
  if (trending.length > 0) {
    // Debug: show chainIds
    const chainIds = [...new Set(trending.map((t: any) => t.chainId))];
    console.log(`      Chain IDs found: ${JSON.stringify(chainIds)}`);

    solanaTrending = trending.filter((t: any) => {
      const cid = typeof t.chainId === 'string' ? parseInt(t.chainId) : t.chainId;
      return cid === SOLANA_CHAIN_ID;
    });
    console.log(`      Solana trending: ${solanaTrending.length}`);
  }

  // Try newest tokens on Solana
  if (solanaTrending.length === 0) {
    console.log('      Trying newest tokens on Solana...');
    try {
      const newest = await session.sdk.tokens.getNewestTokens(SOLANA_CHAIN_ID, 1, undefined, 20);
      if (newest && newest.length > 0) {
        console.log(`      Found ${newest.length} newest Solana tokens`);
        solanaTrending.push(...newest);
      }
    } catch (err: any) {
      console.log(`      getNewestTokens error: ${err.message}`);
    }
  }

  // Try searching for specific meme coins on Solana
  if (solanaTrending.length === 0) {
    console.log('      Searching for WIF on Solana...');
    try {
      const results = await searchTokens(session.sdk, 'WIF', 20);
      const solResults = results.filter((t: any) => {
        const cid = typeof t.chainId === 'string' ? parseInt(t.chainId) : t.chainId;
        return cid === SOLANA_CHAIN_ID;
      });
      if (solResults.length > 0) {
        solanaTrending.push(...solResults);
      }
    } catch (err: any) {
      console.log(`      search error: ${err.message}`);
    }
  }

  // Try searching for BONK
  if (solanaTrending.length === 0) {
    console.log('      Searching for BONK...');
    try {
      const results = await searchTokens(session.sdk, 'BONK', 20);
      console.log(`      BONK results: ${results.length}`);
      if (results.length > 0) {
        console.log(`      First result chainId: ${results[0].chainId}`);
        solanaTrending.push(...results);
      }
    } catch (err: any) {
      console.log(`      search error: ${err.message}`);
    }
  }

  if (solanaTrending.length === 0) {
    console.log('      No Solana tokens found. Exiting.');
    return;
  }

  // Debug: show what we found
  console.log(`\n      All ${solanaTrending.length} tokens found:`);
  solanaTrending.slice(0, 10).forEach((t: any, i: number) => {
    console.log(`        ${i + 1}. ${t.symbol} | MCap: $${Math.round(t.marketCap || 0)} | BC: ${t.bondingCurveProgress ?? 'N/A'}% | TXs: ${t.txCount || 0} | $${t.priceUsd?.toFixed?.(10) || t.priceUsd || 'N/A'}`);
  });

  // Pick the best token by activity and liquidity
  // Pump.fun tokens work fine even before DEX graduation (isListedOnDex: false is OK)
  // Priority: highest txCount → highest bondingCurveProgress → highest marketCap
  const tradeable = solanaTrending.filter((t: any) =>
    t.priceUsd && parseFloat(t.priceUsd) > 0 && (t.marketCap || 0) > 1000
  );
  const sorted = (tradeable.length > 0 ? tradeable : solanaTrending).sort((a: any, b: any) => {
    // Primary: txCount (more activity = better liquidity)
    const txDiff = (b.txCount || 0) - (a.txCount || 0);
    if (txDiff !== 0) return txDiff;
    // Secondary: bondingCurveProgress (more reserves)
    return (b.bondingCurveProgress || 0) - (a.bondingCurveProgress || 0);
  });
  const target = sorted[0];

  console.log(`\n      Selected: ${target.name} (${target.symbol})`);
  console.log(`      Address: ${target.address}`);
  console.log(`      Price: $${target.priceUsd || 'N/A'}`);
  console.log(`      Market Cap: $${target.marketCap || 'N/A'}`);
  console.log();

  // Step 3: Buy the meme coin with a small amount of SOL
  const buyAmountSOL = 0.005; // 0.005 SOL (~$0.50)
  const buyAmountLamports = formatSolAmount(buyAmountSOL);

  console.log(`[3/6] Buying ${target.symbol} with ${buyAmountSOL} SOL (${buyAmountLamports} lamports)...`);

  try {
    const buyResult = await buyToken(session, {
      tokenAddress: target.address,
      amount: buyAmountLamports,
      chainId: SOLANA_CHAIN_ID,
    });

    if (buyResult?.isSuccess) {
      console.log(`      BUY SUCCESS!`);
      console.log(`      TX: ${buyResult.hash || 'N/A'}`);
    } else {
      console.log(`      BUY FAILED: ${buyResult?.message || 'Unknown error'}`);
      console.log('      Full response:', JSON.stringify(buyResult, null, 2));
      return;
    }
  } catch (err: any) {
    console.log(`      BUY ERROR: ${err.message}`);
    return;
  }
  console.log();

  // Step 4: Wait a moment for the trade to settle
  console.log('[4/6] Waiting 5 seconds for trade to settle...');
  await new Promise(r => setTimeout(r, 5000));
  console.log();

  // Step 5: Check holdings to see how much we received
  console.log('[5/6] Checking holdings...');
  try {
    const holdings = await getHoldings(session, SOLANA_CHAIN_ID);
    const tokenHolding = holdings?.find((h: any) =>
      h.address?.toLowerCase() === target.address?.toLowerCase() ||
      h.tokenAddress?.toLowerCase() === target.address?.toLowerCase()
    );

    if (tokenHolding) {
      console.log(`      Holding: ${tokenHolding.balance || tokenHolding.amount} ${target.symbol}`);
      console.log(`      Value: $${tokenHolding.valueUsd || tokenHolding.value || 'N/A'}`);
    } else {
      console.log('      Token not found in holdings (may still be processing)');
      // Show all holdings
      if (holdings && holdings.length > 0) {
        console.log('      Current holdings:');
        holdings.slice(0, 5).forEach((h: any) => {
          console.log(`        - ${h.symbol || h.name}: ${h.balance || h.amount}`);
        });
      }
    }
  } catch (err: any) {
    console.log(`      Holdings check failed: ${err.message}`);
  }
  console.log();

  // Step 6: Sell the token back
  // Use same amount to sell back
  console.log(`[6/6] Selling ${target.symbol} back (${buyAmountSOL} SOL worth)...`);

  try {
    const sellResult = await sellToken(session, {
      tokenAddress: target.address,
      amount: buyAmountLamports,
      chainId: SOLANA_CHAIN_ID,
    });

    if (sellResult?.isSuccess) {
      console.log(`      SELL SUCCESS!`);
      console.log(`      TX: ${sellResult.hash || 'N/A'}`);
    } else {
      console.log(`      SELL FAILED: ${sellResult?.message || 'Unknown error'}`);
      console.log('      Full response:', JSON.stringify(sellResult, null, 2));
    }
  } catch (err: any) {
    console.log(`      SELL ERROR: ${err.message}`);
  }

  console.log('\n=== Swap Complete ===');
}

solanaMemeSwap().catch(console.error);
