import { createAuthenticatedSession } from './auth';
import { loadConfig } from './config';
import { ethers } from 'ethers';

async function depositToCustodialHL() {
  console.log('💰 Deposit to Custodial HyperLiquid Account\n');
  console.log('='.repeat(70));

  const config = loadConfig();

  // Authenticate
  console.log('\n[1/5] 🔐 Authenticating...\n');
  const session = await createAuthenticatedSession({
    apiUrl: config.apiUrl,
    apiKey: config.apiKey,
    walletAddress: config.walletAddress,
    privateKey: config.privateKey,
    chainId: 42161,
  });

  console.log(`✅ Authenticated`);

  // Get custodial address
  console.log('\n[2/5] 📋 Getting custodial address...\n');
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

  // Check Arbitrum USDC balance
  console.log('\n[3/5] 💵 Checking Arbitrum USDC balance...\n');
  const provider = new ethers.JsonRpcProvider('https://arb1.arbitrum.io/rpc');
  const usdcContract = new ethers.Contract(
    '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // Arbitrum USDC
    ['function balanceOf(address) view returns (uint256)'],
    provider
  );

  const balance = await usdcContract.balanceOf(custodialAddress);
  const balanceUSDC = Number(balance) / 1e6;

  console.log(`   Arbitrum USDC Balance: $${balanceUSDC.toFixed(2)}`);

  if (balanceUSDC < 10) {
    console.log('\n⚠️  Custodial address needs USDC on Arbitrum first!');
    console.log('\n📝 To fund the custodial address:');
    console.log(`   1. Send at least 10 USDC to: ${custodialAddress}`);
    console.log('   2. Use Arbitrum network');
    console.log('   3. Wait 1-2 minutes for confirmation');
    console.log('   4. Run this script again');
    return;
  }

  // Use GDEX's hlDeposit to move USDC to HyperLiquid
  console.log('\n[4/5] 🚀 Depositing to HyperLiquid...\n');
  const depositAmount = Math.floor(Math.min(balanceUSDC, 10) * 1e6).toString();
  console.log(`   Depositing: $${Number(depositAmount) / 1e6} USDC`);

  try {
    const result = await session.sdk.hyperLiquid.hlDeposit(
      custodialAddress,
      '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC
      depositAmount,
      42161,
      session.tradingPrivateKey
    );

    console.log('\n   Result:', result);

    if (result && result.isSuccess) {
      console.log('\n✅ Deposit initiated!');
      console.log('   Waiting for HyperLiquid confirmation (1-5 minutes)...');

      // Poll balance
      console.log('\n[5/5] ⏳ Monitoring balance...\n');
      const initialBalance = await session.sdk.hyperLiquid.getHyperliquidUsdcBalance(custodialAddress);
      console.log(`   Initial balance: $${initialBalance ?? 0}`);

      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 15000)); // Check every 15s
        const currentBalance = await session.sdk.hyperLiquid.getHyperliquidUsdcBalance(custodialAddress);

        if (currentBalance && currentBalance > (initialBalance || 0)) {
          console.log(`\n🎉 Deposit confirmed! New balance: $${currentBalance}`);
          console.log('\n✅ Ready to trade leveraged positions!');
          console.log('   Run: npm run test:hl');
          return;
        }

        console.log(`   [${i + 1}/20] Still waiting... ($${currentBalance ?? 0})`);
      }

      console.log('\n⚠️  Deposit taking longer than expected. Check HyperLiquid manually.');
    } else {
      console.log('\n❌ Deposit failed:', result);
    }
  } catch (error: any) {
    console.log('\n❌ Error:', error.message);
    if (error.response) {
      console.log('   Response:', error.response.data);
    }
  }

  console.log('\n' + '='.repeat(70));
}

if (require.main === module) {
  depositToCustodialHL().catch(console.error);
}

export { depositToCustodialHL };
