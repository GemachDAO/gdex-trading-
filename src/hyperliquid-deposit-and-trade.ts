import { createAuthenticatedSession } from './auth';
import { loadConfig } from './config';
import { ethers } from 'ethers';
import WebSocket from 'ws';

// Polyfill WebSocket for Node.js
(globalThis as any).WebSocket = WebSocket;

async function depositAndTradeHyperLiquid() {
  console.log('💰 HyperLiquid Deposit & Trade Setup\n');
  console.log('=' .repeat(70));

  const config = loadConfig();

  // Step 1: Get deposit address
  console.log('\n[1/6] 🔍 Getting your GDEX deposit address...');

  const session = await createAuthenticatedSession({
    apiUrl: config.apiUrl,
    apiKey: config.apiKey,
    walletAddress: config.walletAddress,
    privateKey: config.privateKey,
    chainId: 42161, // Arbitrum
  });

  const userInfo = await session.sdk.user.getUserInfo(
    session.walletAddress,
    session.encryptedSessionKey,
    42161
  );

  const depositAddress = userInfo?.address;

  console.log('✅ Your GDEX Deposit Address (Arbitrum):');
  console.log(`   ${depositAddress}`);
  console.log('\n📋 What you need to send:');
  console.log('   1. USDC (minimum $5, recommend $50+ for trading)');
  console.log('   2. ETH for gas (~$1-2 worth)');
  console.log('   Network: Arbitrum One (Chain ID: 42161)');
  console.log('   USDC Contract: 0xaf88d065e77c8cC2239327C5EDb3A432268e5831');

  // Step 2: Check current on-chain balances
  console.log('\n[2/6] 💼 Checking current on-chain balances...');

  const provider = new ethers.JsonRpcProvider('https://arb1.arbitrum.io/rpc');

  // Check ETH balance
  const ethBalance = await provider.getBalance(depositAddress!);
  const ethFormatted = parseFloat(ethers.formatEther(ethBalance));

  // Check USDC balance
  const usdcContract = new ethers.Contract(
    '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    ['function balanceOf(address) view returns (uint256)'],
    provider
  );
  const usdcBalance = await usdcContract.balanceOf(depositAddress);
  const usdcFormatted = parseFloat(ethers.formatUnits(usdcBalance, 6));

  console.log(`   ETH: ${ethFormatted.toFixed(6)} ETH (~$${(ethFormatted * 3500).toFixed(2)})`);
  console.log(`   USDC: ${usdcFormatted.toFixed(2)} USDC`);

  if (ethFormatted < 0.0005) {
    console.log('\n⚠️  Need more ETH for gas fees!');
    console.log(`   Send at least 0.001 ETH to: ${depositAddress}`);
  }

  if (usdcFormatted < 5) {
    console.log('\n⚠️  Need USDC to trade!');
    console.log(`   Send at least 5 USDC to: ${depositAddress}`);
    console.log('\n💡 Waiting for deposits...');
    console.log('   Press Ctrl+C when you\'ve sent the funds, then run this script again');
    console.log('\n🔗 Quick links:');
    console.log(`   - View on Arbiscan: https://arbiscan.io/address/${depositAddress}`);
    console.log(`   - Bridge to Arbitrum: https://bridge.arbitrum.io/`);
    return;
  }

  console.log('\n✅ Sufficient funds detected on-chain!');

  // Step 3: Check HyperLiquid balance
  console.log('\n[3/6] 🏦 Checking HyperLiquid balance...');

  let hlBalance = await session.sdk.hyperLiquid.getHyperliquidUsdcBalance(session.walletAddress);
  console.log(`   Current HyperLiquid Balance: $${hlBalance ?? 0}`);

  if (!hlBalance || hlBalance < 5) {
    console.log('\n⏳ Waiting for GDEX to process your deposit...');
    console.log('   (This usually takes 1-10 minutes)');
    console.log('   Checking every 30 seconds...\n');

    const startBalance = hlBalance ?? 0;
    let attempts = 0;
    const maxAttempts = 20; // 10 minutes

    while (attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 30000)); // Wait 30 seconds
      attempts++;

      hlBalance = await session.sdk.hyperLiquid.getHyperliquidUsdcBalance(session.walletAddress);

      process.stdout.write(`\r   Attempt ${attempts}/${maxAttempts}: $${hlBalance ?? 0}...`);

      if (hlBalance && hlBalance > startBalance) {
        console.log('\n\n✅ Deposit processed! New balance: $' + hlBalance);
        break;
      }
    }

    if (!hlBalance || hlBalance < 5) {
      console.log('\n\n⚠️  Deposit not processed yet.');
      console.log('   Please wait longer and run this script again.');
      console.log('   Or contact GDEX support if it\'s been >30 minutes.');
      return;
    }
  }

  // Step 4: Get BTC price
  console.log('\n[4/6] 📊 Getting BTC market price...');

  const btcPrice = await session.sdk.hyperLiquid.getHyperliquidMarkPrice('BTC');
  const price = typeof btcPrice === 'string' ? parseFloat(btcPrice) : btcPrice || 67000;

  console.log(`   BTC Price: $${price.toLocaleString()}`);

  // Step 5: Show trading options
  console.log('\n[5/6] 🎯 Trading Options:');
  console.log('=' .repeat(70));
  console.log('\n⚠️  IMPORTANT: Direct orders are currently broken on HyperLiquid');
  console.log('   - hlCreateOrder: Returns "Sent order failed"');
  console.log('   - hlPlaceOrder: Returns error 102');
  console.log('\n✅ Copy Trading WORKS (indirect way to open positions):');
  console.log('   You can copy a top trader and their trades will be replicated');

  console.log('\n[6/6] 🤔 What would you like to do?');
  console.log('─'.repeat(70));
  console.log('\n1️⃣  Set up COPY TRADING (recommended - this works!)');
  console.log('   - Copy a top HyperLiquid trader');
  console.log('   - Their positions will be automatically replicated');
  console.log('   - Can set your own position size and SL/TP');

  console.log('\n2️⃣  Try DIRECT ORDER (will likely fail)');
  console.log('   - Attempt hlCreateOrder or hlPlaceOrder');
  console.log('   - For testing/logging purposes');
  console.log('   - Expected to fail with current backend issues');

  console.log('\n3️⃣  Just WAIT');
  console.log('   - Wait for GDEX team to fix direct orders');
  console.log('   - Your balance is ready when they do');

  console.log('\n' + '='.repeat(70));
  console.log('💰 Your HyperLiquid Balance: $' + (hlBalance ?? 0));
  console.log('📍 Status: Ready to trade (via copy trading)');
  console.log('=' .repeat(70));

  console.log('\n💡 Next steps:');
  console.log('   - Run: npm run hl:copytrade-self (to test copy trading)');
  console.log('   - Or: npm run test:hyperliquid (to try direct order again)');
  console.log('   - Or: Wait for GDEX team to fix direct orders\n');
}

if (require.main === module) {
  depositAndTradeHyperLiquid().catch(console.error);
}

export { depositAndTradeHyperLiquid };
