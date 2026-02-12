import { createAuthenticatedSession } from './auth';
import { loadConfig } from './config';

async function checkHLBalances() {
  console.log('🔍 Checking HyperLiquid Balances\n');
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
  console.log(`   Control Wallet: ${session.walletAddress}`);

  // Get user info to find custodial address
  console.log('\n[2/3] 📋 Getting user info...\n');
  const userInfo = await session.sdk.user.getUserInfo(
    session.walletAddress,
    session.encryptedSessionKey,
    42161
  );

  if (!userInfo) {
    console.log('   ❌ Failed to get user info');
    return;
  }

  const custodialAddress = userInfo.address;
  console.log(`   Custodial Deposit Address: ${custodialAddress}`);

  // Check both balances
  console.log('\n[3/3] 💰 Checking HyperLiquid balances...\n');

  console.log('   Checking control wallet balance...');
  const controlBalance = await session.sdk.hyperLiquid.getHyperliquidUsdcBalance(
    session.walletAddress
  );
  console.log(`   Control Wallet (${session.walletAddress}):`);
  console.log(`   Balance: $${controlBalance ?? 0}\n`);

  console.log('   Checking custodial address balance...');
  const custodialBalance = await session.sdk.hyperLiquid.getHyperliquidUsdcBalance(
    custodialAddress
  );
  console.log(`   Custodial Address (${custodialAddress}):`);
  console.log(`   Balance: $${custodialBalance ?? 0}`);

  console.log('\n' + '='.repeat(70));
  console.log('📊 Summary:\n');
  console.log(`Control Wallet:    $${controlBalance ?? 0}`);
  console.log(`Custodial Address: $${custodialBalance ?? 0}`);
  console.log('\n💡 For HyperLiquid trading, deposit to the custodial address!');
  console.log('   Run: npm run deposit:correct [amount]');
  console.log('='.repeat(70));
}

if (require.main === module) {
  checkHLBalances().catch(console.error);
}

export { checkHLBalances };
