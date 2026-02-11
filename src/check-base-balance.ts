import { ethers } from 'ethers';
import { loadConfig } from './config';

async function checkBaseBalance() {
  console.log('🔵 Checking Base Balance On-Chain\n');

  const config = loadConfig();
  const walletAddress = config.walletAddress;

  console.log(`Wallet: ${walletAddress}`);
  console.log('Network: Base (Chain ID: 8453)\n');

  // Connect to Base RPC
  const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');

  try {
    // Get ETH balance
    const balance = await provider.getBalance(walletAddress);
    const ethBalance = ethers.formatEther(balance);

    console.log(`ETH Balance: ${ethBalance} ETH`);
    console.log(`ETH Balance (wei): ${balance.toString()}`);

    if (parseFloat(ethBalance) > 0) {
      console.log('\n✅ Balance confirmed on-chain!');
      console.log(`   USD Value (approx): $${(parseFloat(ethBalance) * 3500).toFixed(2)}`);
    } else {
      console.log('\n⚠️  No balance found on Base');
      console.log('\nPossible reasons:');
      console.log('   1. Transaction not confirmed yet (check after ~30 seconds)');
      console.log('   2. Sent to wrong network (verify it was Base, not Ethereum mainnet)');
      console.log('   3. Wrong address');
      console.log(`\n🔍 Check transactions: https://basescan.org/address/${walletAddress}`);
    }

    // Get transaction count
    const txCount = await provider.getTransactionCount(walletAddress);
    console.log(`\nTransaction Count: ${txCount}`);

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

if (require.main === module) {
  checkBaseBalance().catch(console.error);
}

export { checkBaseBalance };
