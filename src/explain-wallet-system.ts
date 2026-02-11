import { createAuthenticatedSession } from './auth';
import { loadConfig } from './config';

async function explainWalletSystem() {
  console.log('🏦 GDEX Wallet System Explained\n');
  console.log('=' .repeat(70));

  const config = loadConfig();

  console.log('\n📋 Configuration:');
  console.log(`Wallet Address from .env: ${config.walletAddress}`);
  console.log(`Private Key (first 10 chars): ${config.privateKey.substring(0, 10)}...`);

  console.log('\n' + '─'.repeat(70));
  console.log('🔍 Checking on Different Chains...\n');

  const chains = [
    { name: 'Arbitrum (HyperLiquid)', chainId: 42161 },
    { name: 'Solana', chainId: 622112261 },
    { name: 'Base', chainId: 8453 },
  ];

  for (const chain of chains) {
    console.log(`\n📊 ${chain.name} (Chain ID: ${chain.chainId})`);
    console.log('─'.repeat(70));

    try {
      const session = await createAuthenticatedSession({
        apiUrl: config.apiUrl,
        apiKey: config.apiKey,
        walletAddress: config.walletAddress,
        privateKey: config.privateKey,
        chainId: chain.chainId,
      });

      console.log(`1️⃣  YOUR WALLET (you control with private key):`);
      console.log(`    Address: ${session.walletAddress}`);
      console.log(`    This is from your .env file`);
      console.log(`    You sign transactions with this wallet's private key`);

      // Get user info to find GDEX deposit address
      try {
        const userInfo = await session.sdk.user.getUserInfo(
          session.walletAddress,
          session.encryptedSessionKey,
          chain.chainId
        );

        console.log(`\n2️⃣  GDEX CUSTODIAL DEPOSIT ADDRESS (GDEX controls):`);
        console.log(`    Address: ${userInfo?.address || 'N/A'}`);
        console.log(`    Balance: ${userInfo?.balance || 0}`);
        console.log(`    Is New User: ${userInfo?.isNewUser}`);

        if (userInfo?.address) {
          console.log(`\n💡 How it works:`);
          console.log(`    ✅ Send funds TO: ${userInfo.address} (GDEX deposit address)`);
          console.log(`    ✅ Control/Trade FROM: ${session.walletAddress} (your wallet)`);
          console.log(`    ✅ GDEX processes deposits from ${userInfo.address} automatically`);
        }

        // Check if the mystery wallet matches
        const mysteryWallet = '0x886e83feb8d1774afab4a32047a083434354c6f0';
        if (userInfo?.address?.toLowerCase() === mysteryWallet.toLowerCase()) {
          console.log(`\n🎯 MATCH! The mystery wallet IS your GDEX deposit address!`);
        }

      } catch (error: any) {
        console.log(`\n⚠️  Could not get GDEX deposit address: ${error.message}`);
      }

    } catch (error: any) {
      console.log(`❌ Authentication failed: ${error.message}`);
    }
  }

  console.log('\n\n' + '='.repeat(70));
  console.log('📚 SUMMARY: Two-Wallet System');
  console.log('='.repeat(70));
  console.log(`
1️⃣  YOUR WALLET (in .env file)
    - Address: ${config.walletAddress}
    - You control this with your private key
    - You use this to authenticate with GDEX API
    - You sign transactions with this wallet

2️⃣  GDEX CUSTODIAL DEPOSIT ADDRESS (from getUserInfo)
    - GDEX controls this address
    - You send funds HERE to deposit
    - GDEX automatically processes deposits
    - Funds appear in your GDEX balance

🔄 Flow:
    1. Send USDC to GDEX deposit address
    2. GDEX sees the deposit
    3. Credits your account (linked to your wallet)
    4. You trade using your wallet's private key
    5. GDEX executes trades on your behalf
  `);

  console.log('\n💡 To find your GDEX deposit address anytime:');
  console.log('   const userInfo = await sdk.user.getUserInfo(yourWallet, sessionKey, chainId);');
  console.log('   const depositAddress = userInfo.address;');
  console.log('\n' + '='.repeat(70));
}

if (require.main === module) {
  explainWalletSystem().catch(console.error);
}

export { explainWalletSystem };
