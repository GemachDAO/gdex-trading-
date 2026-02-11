import { ethers } from 'ethers';
import { createAuthenticatedSession } from './auth';
import { loadConfig } from './config';

const WALLET_TO_CHECK = '0x886e83feb8d1774afab4a32047a083434354c6f0';

async function checkWallet() {
  console.log('🔍 Wallet Investigation\n');
  console.log('=' .repeat(70));
  console.log(`Checking: ${WALLET_TO_CHECK}\n`);

  // Check on multiple chains
  const chains = [
    { name: 'Ethereum', rpc: 'https://eth.llamarpc.com', chainId: 1 },
    { name: 'Arbitrum', rpc: 'https://arb1.arbitrum.io/rpc', chainId: 42161 },
    { name: 'Base', rpc: 'https://mainnet.base.org', chainId: 8453 },
    { name: 'BSC', rpc: 'https://bsc-dataseed.binance.org', chainId: 56 },
  ];

  for (const chain of chains) {
    console.log(`\n📊 ${chain.name} (Chain ID: ${chain.chainId})`);
    console.log('─'.repeat(70));

    try {
      const provider = new ethers.JsonRpcProvider(chain.rpc);

      // Get ETH balance
      const balance = await provider.getBalance(WALLET_TO_CHECK);
      const ethBalance = ethers.formatEther(balance);

      // Get transaction count
      const txCount = await provider.getTransactionCount(WALLET_TO_CHECK);

      console.log(`ETH Balance: ${parseFloat(ethBalance).toFixed(6)} ETH`);
      console.log(`Transaction Count: ${txCount}`);

      if (parseFloat(ethBalance) > 0) {
        console.log(`💰 Has ${ethBalance} ETH on ${chain.name}!`);
      }
    } catch (error: any) {
      console.log(`⚠️  Error: ${error.message}`);
    }
  }

  // Check if it's related to GDEX
  console.log('\n\n🔍 Checking GDEX Connection...');
  console.log('─'.repeat(70));

  try {
    const config = loadConfig();
    const session = await createAuthenticatedSession({
      apiUrl: config.apiUrl,
      apiKey: config.apiKey,
      walletAddress: config.walletAddress,
      privateKey: config.privateKey,
      chainId: 42161,
    });

    console.log(`Your wallet: ${session.walletAddress}`);
    console.log(`Checking wallet: ${WALLET_TO_CHECK}`);
    console.log(`Match: ${session.walletAddress.toLowerCase() === WALLET_TO_CHECK.toLowerCase() ? 'YES ✅' : 'NO ❌'}`);

    // Try to get user info for this wallet
    try {
      const userInfo = await session.sdk.user.getUserInfo(
        WALLET_TO_CHECK,
        session.encryptedSessionKey,
        42161
      );

      if (userInfo) {
        console.log('\n💡 Found GDEX user info:');
        console.log(`  Deposit Address: ${userInfo.address}`);
        console.log(`  Balance: ${userInfo.balance}`);
        console.log(`  Is New User: ${userInfo.isNewUser}`);
        if (userInfo.refCode) {
          console.log(`  Referral Code: ${userInfo.refCode}`);
        }
      }
    } catch (error: any) {
      console.log('\n⚠️  Not a GDEX user or no access to this wallet info');
    }

  } catch (error: any) {
    console.log('⚠️  Could not check GDEX connection:', error.message);
  }

  // Block explorer links
  console.log('\n\n🔗 Block Explorer Links:');
  console.log('─'.repeat(70));
  console.log(`Ethereum: https://etherscan.io/address/${WALLET_TO_CHECK}`);
  console.log(`Arbitrum: https://arbiscan.io/address/${WALLET_TO_CHECK}`);
  console.log(`Base: https://basescan.org/address/${WALLET_TO_CHECK}`);
  console.log(`BSC: https://bscscan.com/address/${WALLET_TO_CHECK}`);

  console.log('\n' + '='.repeat(70));
}

if (require.main === module) {
  checkWallet().catch(console.error);
}

export { checkWallet };
