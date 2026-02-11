import { createAuthenticatedSession } from './auth';
import { loadConfig } from './config';
import { buyToken, sellToken, formatEthAmount } from './trading';
import { getNewestTokens, getHoldings } from './market';
import WebSocket from 'ws';

// Polyfill WebSocket for Node.js
(globalThis as any).WebSocket = WebSocket;

const BASE_CHAIN_ID = 8453;

async function tradeOnBase() {
  console.log('🔵 Base Chain Trading Test\n');
  console.log('=' .repeat(70));

  const config = loadConfig();

  // Step 1: Authenticate on Base
  console.log('\n[1/6] 🔐 Authenticating on Base...');
  const session = await createAuthenticatedSession({
    apiUrl: config.apiUrl,
    apiKey: config.apiKey,
    walletAddress: config.walletAddress,
    privateKey: config.privateKey,
    chainId: BASE_CHAIN_ID,
  });
  console.log(`✅ Wallet: ${session.walletAddress}`);

  // Step 2: Check ETH balance on Base (on-chain)
  console.log('\n[2/6] 💰 Checking Base ETH balance...');
  try {
    const { ethers } = await import('ethers');
    const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
    const balance = await provider.getBalance(session.walletAddress);
    const ethBalance = parseFloat(ethers.formatEther(balance));

    console.log(`ETH Balance: ${ethBalance.toFixed(6)} ETH (~$${(ethBalance * 3500).toFixed(2)})`);

    if (ethBalance < 0.0001) {
      console.log('\n⚠️  Low ETH balance!');
      console.log(`   Current: ${ethBalance} ETH`);
      console.log(`   Recommended: At least 0.0001 ETH for testing`);
      console.log(`\n💡 Please send some ETH to: ${session.walletAddress}`);
      console.log('   Network: Base (Chain ID: 8453)');
      console.log('   Bridge: https://bridge.base.org/');
      return;
    }

    console.log('✅ Sufficient ETH for trading');
  } catch (error: any) {
    console.log('⚠️  Could not fetch balance:', error.message);
    console.log('   Continuing anyway...');
  }

  // Step 3: Find trending tokens on Base
  console.log('\n[3/6] 🔍 Finding tokens on Base...');

  try {
    const newest = await getNewestTokens(session.sdk, BASE_CHAIN_ID, 20);

    if (!newest || newest.length === 0) {
      console.log('❌ No tokens found on Base');
      return;
    }

    console.log(`✅ Found ${newest.length} tokens\n`);

    // Sort by market cap (since txCount seems to be 0 for Base tokens)
    const sorted = [...newest]
      .filter((t: any) => parseFloat(t.marketCap || '0') > 1000) // At least $1000 mcap
      .sort((a: any, b: any) => parseFloat(b.marketCap || '0') - parseFloat(a.marketCap || '0'));

    if (sorted.length === 0) {
      console.log('❌ No suitable tokens found (need >$1000 market cap)');
      console.log('\n📊 Showing all tokens anyway:');

      // Show first 5 tokens regardless of filters
      newest.slice(0, 5).forEach((token: any, i: number) => {
        console.log(`${i + 1}. ${token.symbol || 'UNKNOWN'}`);
        console.log(`   TXs: ${token.txCount || 0}, MCap: $${parseFloat(token.marketCap || '0').toFixed(2)}`);
      });

      // Just use the first token anyway
      if (newest.length > 0) {
        console.log('\n⚠️  Proceeding with first token anyway for testing...');
        sorted.push(newest[0]);
      } else {
        return;
      }
    }

    console.log('Top 5 Active Tokens:');
    console.log('─'.repeat(70));

    sorted.slice(0, 5).forEach((token: any, i: number) => {
      const mcap = parseFloat(token.marketCap || '0');
      const txCount = token.txCount || 0;
      const price = parseFloat(token.price || '0');

      console.log(`${i + 1}. ${token.symbol || 'UNKNOWN'} (${token.name || 'Unknown'})`);
      console.log(`   Address: ${token.address.substring(0, 10)}...${token.address.substring(token.address.length - 4)}`);
      console.log(`   Price: $${price.toFixed(8)}`);
      console.log(`   Market Cap: $${mcap.toLocaleString()}`);
      console.log(`   Transactions: ${txCount}`);
      console.log(`   Listed on DEX: ${token.isListedOnDex ? 'Yes ✅' : 'No ⚠️'}`);
    });

    // Select token with most activity
    const targetToken = sorted[0];
    console.log(`\n🎯 Selected: ${targetToken.symbol} (${targetToken.name})`);
    console.log(`   Most active with ${targetToken.txCount} transactions`);
    console.log(`   Market Cap: $${parseFloat(targetToken.marketCap).toLocaleString()}`);

    // Step 4: Buy token
    console.log('\n[4/6] 📈 Buying token...');
    const buyAmount = formatEthAmount(0.00001); // 0.00001 ETH (~$0.035)
    console.log(`   Spending: 0.00001 ETH (~$0.035)`);
    console.log(`   Token: ${targetToken.symbol}`);
    console.log(`   Address: ${targetToken.address}`);

    const buyResult = await buyToken(session, {
      tokenAddress: targetToken.address,
      amount: buyAmount,
      chainId: BASE_CHAIN_ID,
    });

    if (!buyResult || !buyResult.isSuccess) {
      console.log('❌ Buy failed:', (buyResult as any)?.error || 'Unknown error');
      return;
    }

    console.log('✅ Buy successful!');
    if ((buyResult as any).hash) {
      console.log(`   TX Hash: ${(buyResult as any).hash}`);
      console.log(`   View: https://basescan.org/tx/${(buyResult as any).hash}`);
    }

    // Wait a bit for transaction to settle
    console.log('\n⏳ Waiting 10 seconds for transaction to settle...');
    await new Promise(r => setTimeout(r, 10000));

    // Step 5: Check holdings
    console.log('\n[5/6] 📊 Checking holdings...');

    try {
      const holdings = await getHoldings(session, BASE_CHAIN_ID);

      if (holdings && holdings.length > 0) {
        console.log(`✅ Found ${holdings.length} token(s) in wallet\n`);

        holdings.forEach((holding: any) => {
          const balance = parseFloat(holding.balance || '0');
          const value = parseFloat(holding.value || '0');
          const price = parseFloat(holding.price || '0');

          console.log(`Token: ${holding.symbol}`);
          console.log(`  Balance: ${balance.toLocaleString()}`);
          console.log(`  Price: $${price.toFixed(8)}`);
          console.log(`  Value: $${value.toFixed(4)}`);
          console.log(`  Address: ${holding.address}`);
          console.log();
        });

        // Find our token in holdings
        const ourHolding = holdings.find((h: any) =>
          h.address.toLowerCase() === targetToken.address.toLowerCase()
        );

        if (!ourHolding) {
          console.log('⚠️  Our token not found in holdings yet');
          console.log('   This is normal - may take a moment to update');
          console.log('   Continuing with sell attempt...\n');
        } else {
          console.log(`✅ Confirmed holding: ${parseFloat(ourHolding.balance).toLocaleString()} ${targetToken.symbol}`);
        }
      } else {
        console.log('⚠️  No holdings found (may take a moment to update)');
      }
    } catch (error: any) {
      console.log('⚠️  Could not fetch holdings:', error.message);
    }

    // Step 6: Sell token
    console.log('\n[6/6] 📉 Selling token...');
    console.log(`   Token: ${targetToken.symbol}`);
    console.log(`   Amount: 0.0001 ETH worth`);

    const sellResult = await sellToken(session, {
      tokenAddress: targetToken.address,
      amount: buyAmount, // Sell same amount we bought
      chainId: BASE_CHAIN_ID,
    });

    if (!sellResult || !sellResult.isSuccess) {
      console.log('❌ Sell failed:', (sellResult as any)?.error || 'Unknown error');
      console.log('   Note: You still hold the tokens - can sell manually later');
      return;
    }

    console.log('✅ Sell successful!');
    if ((sellResult as any).hash) {
      console.log(`   TX Hash: ${(sellResult as any).hash}`);
      console.log(`   View: https://basescan.org/tx/${(sellResult as any).hash}`);
    }

    // Final summary
    console.log('\n' + '='.repeat(70));
    console.log('✅ Base Trading Test Complete!');
    console.log('='.repeat(70));
    console.log('\n📊 Summary:');
    console.log(`   Token: ${targetToken.symbol} (${targetToken.name})`);
    console.log(`   Buy TX: ${(buyResult as any).hash ? 'Success ✅' : 'No hash'}`);
    console.log(`   Sell TX: ${(sellResult as any).hash ? 'Success ✅' : 'No hash'}`);
    console.log(`\n💡 View transactions on BaseScan: https://basescan.org/address/${session.walletAddress}`);

  } catch (error: any) {
    console.error('\n❌ Error during trading:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
  }
}

if (require.main === module) {
  tradeOnBase().catch(console.error);
}

export { tradeOnBase };
