import { loadConfig } from './config';
import { createAuthenticatedSession } from './auth';
const qrcode = require('qrcode-terminal');

async function displayWalletQRCodes() {
  console.log('\n' + '═'.repeat(80));
  console.log('💰 WALLET QR CODES - Easy Funding');
  console.log('═'.repeat(80));

  const config = loadConfig();

  // 1. Your EVM Wallet (Direct Control)
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ 🔑 YOUR EVM WALLET (You Control)                                        │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘\n');

  console.log(`Address: ${config.walletAddress}`);
  console.log('\nUse this for:');
  console.log('  • Direct deposits on Arbitrum, Base, Ethereum, BSC');
  console.log('  • You have full control with your private key');
  console.log('  • Send ETH for gas, USDC for trading\n');

  console.log('QR Code:\n');
  qrcode.generate(config.walletAddress, { small: true });

  // 2. GDEX Custodial - Arbitrum/HyperLiquid
  console.log('\n' + '─'.repeat(80));
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ 📦 GDEX CUSTODIAL - ARBITRUM/HYPERLIQUID                                │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘\n');

  let arbAddress = 'unavailable';
  try {
    const arbSession = await createAuthenticatedSession({
      apiUrl: config.apiUrl,
      apiKey: config.apiKey,
      walletAddress: config.walletAddress,
      privateKey: config.privateKey,
      chainId: 42161,
    });

    const arbUserInfo = await arbSession.sdk.user.getUserInfo(
      arbSession.walletAddress,
      arbSession.encryptedSessionKey,
      42161
    );

    arbAddress = arbUserInfo?.address || 'unavailable';

    console.log(`Address: ${arbAddress}`);
    console.log('\nUse this for:');
    console.log('  • HyperLiquid perpetual futures trading');
    console.log('  • Send USDC on Arbitrum (minimum $5)');
    console.log('  • Send ETH for gas (~$0.50)');
    console.log('  • Auto-processed by GDEX in 1-10 minutes\n');

    console.log('QR Code:\n');
    qrcode.generate(arbAddress, { small: true });

  } catch (error: any) {
    console.log(`⚠️  Error: ${error.message}`);
  }

  // 3. GDEX Custodial - Solana
  console.log('\n' + '─'.repeat(80));
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ 📦 GDEX CUSTODIAL - SOLANA                                              │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘\n');

  let solAddress = 'unavailable';
  try {
    const solSession = await createAuthenticatedSession({
      apiUrl: config.apiUrl,
      apiKey: config.apiKey,
      walletAddress: config.walletAddress,
      privateKey: config.privateKey,
      chainId: 622112261,
    });

    const solUserInfo = await solSession.sdk.user.getUserInfo(
      solSession.walletAddress,
      solSession.encryptedSessionKey,
      622112261
    );

    solAddress = solUserInfo?.address || 'unavailable';

    console.log(`Address: ${solAddress}`);
    console.log('\nUse this for:');
    console.log('  • Solana meme coin trading (pump.fun tokens)');
    console.log('  • Send SOL for trading');
    console.log('  • Auto-processed by GDEX in 1-10 minutes\n');

    console.log('QR Code:\n');
    qrcode.generate(solAddress, { small: true });

  } catch (error: any) {
    console.log(`⚠️  Error: ${error.message}`);
  }

  // Summary — addresses fetched live, never hardcoded
  console.log('\n' + '═'.repeat(80));
  console.log('📋 QUICK REFERENCE');
  console.log('═'.repeat(80));
  console.log(`
┌──────────────┬────────────────────────────────────────────────┬───────────────┐
│ Account      │ Address                                        │ Purpose       │
├──────────────┼────────────────────────────────────────────────┼───────────────┤
│ YOUR EVM     │ ${config.walletAddress.substring(0, 42).padEnd(46)} │ Direct control│
├──────────────┼────────────────────────────────────────────────┼───────────────┤
│ GDEX Arb/HL  │ ${arbAddress.padEnd(46)} │ HyperLiquid   │
├──────────────┼────────────────────────────────────────────────┼───────────────┤
│ GDEX Solana  │ ${solAddress.padEnd(46)} │ Solana memes  │
└──────────────┴────────────────────────────────────────────────┴───────────────┘
`);

  console.log('💡 TIP: Scan QR codes with your phone wallet for easy deposits!\n');
  console.log('═'.repeat(80) + '\n');
}

if (require.main === module) {
  displayWalletQRCodes().catch(console.error);
}

export { displayWalletQRCodes };
