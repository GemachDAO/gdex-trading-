import { createAuthenticatedSession } from './auth';
import { loadConfig } from './config';
import { ethers } from 'ethers';
import WebSocket from 'ws';

// Polyfill WebSocket for Node.js
(globalThis as any).WebSocket = WebSocket;

const CONTROL_WALLET = '0x01779499970726ff4C111dDF58A2CA6c366b0E20';
const DEPOSIT_WALLET = '0x886e83feb8d1774afab4a32047a083434354c6f0';
const USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'; // Arbitrum USDC

async function fundAndTradeHyperLiquid() {
  console.log('🚀 HyperLiquid Funding & Trading\n');
  console.log('=' .repeat(70));

  const config = loadConfig();
  const provider = new ethers.JsonRpcProvider('https://arb1.arbitrum.io/rpc');
  const wallet = new ethers.Wallet(config.privateKey, provider);

  console.log(`Control Wallet: ${CONTROL_WALLET}`);
  console.log(`Deposit Wallet: ${DEPOSIT_WALLET}\n`);

  // Step 1: Check balances
  console.log('[1/6] 💰 Checking balances...\n');

  const controlEthBalance = await provider.getBalance(CONTROL_WALLET);
  const controlEth = parseFloat(ethers.formatEther(controlEthBalance));

  const usdcContract = new ethers.Contract(
    USDC_ADDRESS,
    ['function balanceOf(address) view returns (uint256)', 'function transfer(address to, uint256 amount) returns (bool)'],
    wallet
  );

  const controlUsdcBalance = await usdcContract.balanceOf(CONTROL_WALLET);
  const controlUsdc = parseFloat(ethers.formatUnits(controlUsdcBalance, 6));

  console.log(`Control Wallet Balances:`);
  console.log(`  ETH: ${controlEth.toFixed(6)} ETH`);
  console.log(`  USDC: ${controlUsdc.toFixed(2)} USDC`);

  if (controlEth < 0.001) {
    console.log('\n❌ Not enough ETH in control wallet for gas + transfer!');
    console.log(`   Need at least 0.001 ETH, have ${controlEth} ETH`);
    return;
  }

  if (controlUsdc < 5) {
    console.log('\n❌ Not enough USDC in control wallet!');
    console.log(`   Need at least 5 USDC, have ${controlUsdc} USDC`);
    return;
  }

  // Step 2: Send 5 USDC to deposit wallet
  console.log('\n[2/6] 💸 Sending 5 USDC to deposit wallet...\n');

  const usdcAmount = ethers.parseUnits('5', 6); // 5 USDC

  console.log(`  Sending 5 USDC to ${DEPOSIT_WALLET}...`);
  const usdcTx = await usdcContract.transfer(DEPOSIT_WALLET, usdcAmount);
  console.log(`  TX Hash: ${usdcTx.hash}`);
  console.log(`  Waiting for confirmation...`);

  await usdcTx.wait();
  console.log(`  ✅ USDC transfer confirmed!`);
  console.log(`  View: https://arbiscan.io/tx/${usdcTx.hash}`);

  // Step 3: Send $0.20 in ETH (approximately 0.00006 ETH at $3500/ETH)
  console.log('\n[3/6] 💸 Sending ETH for gas...\n');

  const ethAmount = ethers.parseEther('0.00006'); // ~$0.20 worth

  console.log(`  Sending ~$0.20 ETH to ${DEPOSIT_WALLET}...`);
  const ethTx = await wallet.sendTransaction({
    to: DEPOSIT_WALLET,
    value: ethAmount,
  });
  console.log(`  TX Hash: ${ethTx.hash}`);
  console.log(`  Waiting for confirmation...`);

  await ethTx.wait();
  console.log(`  ✅ ETH transfer confirmed!`);
  console.log(`  View: https://arbiscan.io/tx/${ethTx.hash}`);

  // Step 4: Try SDK deposit function
  console.log('\n[4/6] 🏦 Attempting SDK deposit to HyperLiquid...\n');

  const session = await createAuthenticatedSession({
    apiUrl: config.apiUrl,
    apiKey: config.apiKey,
    walletAddress: config.walletAddress,
    privateKey: config.privateKey,
    chainId: 42161,
  });

  console.log(`  Using hlDeposit() function...`);
  console.log(`  Amount: 5 USDC`);
  console.log(`  From: ${CONTROL_WALLET}`);

  try {
    const depositResult = await session.sdk.hyperLiquid.hlDeposit(
      CONTROL_WALLET,
      USDC_ADDRESS,
      usdcAmount.toString(),
      42161,
      config.privateKey
    );

    if (depositResult?.isSuccess) {
      console.log(`  ✅ SDK Deposit successful!`);
      console.log(`  Result:`, depositResult);
    } else {
      console.log(`  ❌ SDK Deposit failed:`, depositResult);
    }
  } catch (error: any) {
    console.log(`  ❌ SDK Deposit error:`, error.message);
    console.log('\n  💡 This is expected - hlDeposit() is known to fail');
    console.log('     GDEX uses custodial deposits (automatic processing)');
    console.log('     The USDC we sent will be processed automatically in 1-10 min');
  }

  // Wait for custodial deposit to process
  console.log('\n[5/6] ⏳ Waiting for custodial deposit processing...\n');
  console.log('  Checking HyperLiquid balance every 30 seconds...');

  const initialBalance = await session.sdk.hyperLiquid.getHyperliquidUsdcBalance(session.walletAddress);
  console.log(`  Initial balance: $${initialBalance ?? 0}`);

  let newBalance = initialBalance ?? 0;
  let attempts = 0;
  const maxAttempts = 20; // 10 minutes

  while (attempts < maxAttempts && newBalance <= (initialBalance ?? 0)) {
    await new Promise(r => setTimeout(r, 30000)); // 30 seconds
    attempts++;

    const balanceCheck = await session.sdk.hyperLiquid.getHyperliquidUsdcBalance(session.walletAddress);
    newBalance = balanceCheck ?? newBalance;
    process.stdout.write(`\r  Attempt ${attempts}/${maxAttempts}: $${newBalance}...`);

    if (newBalance > (initialBalance ?? 0)) {
      console.log('\n\n  ✅ Deposit processed!');
      console.log(`  New balance: $${newBalance}`);
      break;
    }
  }

  if (newBalance <= (initialBalance ?? 0)) {
    console.log('\n\n  ⚠️  Deposit not processed yet. Please wait and check later.');
    console.log('     Your USDC is in the deposit wallet and will be processed automatically.');
    return;
  }

  // Step 6: Attempt leverage trade
  console.log('\n[6/6] 🎯 Attempting leveraged trade...\n');

  const btcPrice = await session.sdk.hyperLiquid.getHyperliquidMarkPrice('BTC');
  const price = typeof btcPrice === 'string' ? parseFloat(btcPrice) : btcPrice || 66000;

  console.log(`  BTC Price: $${price.toLocaleString()}`);
  console.log(`  Account Balance: $${newBalance}`);
  console.log(`  Attempting 10x leveraged LONG on BTC...\n`);

  const positionValue = (newBalance ?? 0) * 10; // 10x leverage
  const positionSize = positionValue / price;

  console.log(`  Position size: ${positionSize.toFixed(4)} BTC`);
  console.log(`  Position value: $${positionValue}`);
  console.log(`  Leverage: 10x`);

  // Try hlCreateOrder
  console.log('\n  Method 1: hlCreateOrder...');
  try {
    const result = await session.sdk.hyperLiquid.hlCreateOrder(
      session.walletAddress,
      'BTC',
      true, // LONG
      price.toString(),
      positionSize.toFixed(4),
      (price * 1.03).toString(), // +3% TP
      (price * 0.98).toString(), // -2% SL
      false, // reduceOnly
      true, // isMarket
      session.tradingPrivateKey
    );

    if (result?.isSuccess) {
      console.log('  ✅ Order placed successfully!');
      console.log('  Result:', result);
    } else {
      console.log('  ❌ Order failed:', (result as any)?.error || result);
    }
  } catch (error: any) {
    console.log('  ❌ Error:', error.message);
  }

  // Try hlPlaceOrder
  console.log('\n  Method 2: hlPlaceOrder...');
  try {
    const result = await session.sdk.hyperLiquid.hlPlaceOrder(
      session.walletAddress,
      'BTC',
      true,
      price.toString(),
      positionSize.toFixed(4),
      false, // reduceOnly
      session.tradingPrivateKey
    );

    if (result?.isSuccess) {
      console.log('  ✅ Order placed successfully!');
      console.log('  Result:', result);
    } else {
      console.log('  ❌ Order failed:', result);
    }
  } catch (error: any) {
    console.log('  ❌ Error:', error.message);
  }

  console.log('\n' + '='.repeat(70));
  console.log('📊 Final Status:');
  console.log('  ✅ Funds transferred to deposit wallet');
  console.log('  ✅ HyperLiquid balance updated');
  console.log('  ⚠️  Direct orders likely failed (known backend issue)');
  console.log('  💡 Copy trading still works as alternative');
  console.log('=' .repeat(70));
}

if (require.main === module) {
  fundAndTradeHyperLiquid().catch(console.error);
}

export { fundAndTradeHyperLiquid };
