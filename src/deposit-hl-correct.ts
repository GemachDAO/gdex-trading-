import { createAuthenticatedSession } from './auth';
import { loadConfig } from './config';
import { CryptoUtils } from 'gdex.pro-sdk';
import axios from 'axios';
import { createHash, createCipheriv } from 'crypto';

// Encryption functions (same as order script)
function deriveKeyAndIv(apiKey: string) {
  const hashAPI = createHash('sha256').update(apiKey).digest('hex');
  const key = Buffer.from(hashAPI.slice(0, 64), 'hex');
  const ivHash = createHash('sha256').update(hashAPI).digest('hex').slice(0, 32);
  const iv = Buffer.from(ivHash, 'hex');
  return { key, iv };
}

function encrypt(data: string, apiKey: string): string {
  const { key, iv } = deriveKeyAndIv(apiKey);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

function generateNonce(): number {
  return Date.now() + Math.floor(Math.random() * 1000);
}

async function depositHLCorrect(amountUSDC: number = 10) {
  console.log('💰 Deposit to HyperLiquid (Correct Method)\n');
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

  // Get user info
  console.log('\n[2/5] 📋 Getting user info...\n');
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
  console.log(`   Control Wallet: ${session.walletAddress}`);
  console.log(`   Custodial Address: ${custodialAddress}`);

  // Check balances
  console.log('\n[3/5] 💵 Checking balances...\n');

  // HyperLiquid balance
  const hlBalance = await session.sdk.hyperLiquid.getHyperliquidUsdcBalance(custodialAddress);
  console.log(`   Current HyperLiquid Balance: $${hlBalance ?? 0}`);

  // Arbitrum USDC balance
  const { ethers } = await import('ethers');
  const provider = new ethers.JsonRpcProvider('https://arb1.arbitrum.io/rpc');
  const usdcContract = new ethers.Contract(
    '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    ['function balanceOf(address) view returns (uint256)'],
    provider
  );
  const arbBalance = await usdcContract.balanceOf(custodialAddress);
  const arbBalanceUSDC = Number(arbBalance) / 1e6;
  console.log(`   Arbitrum USDC Balance: $${arbBalanceUSDC.toFixed(2)}`);

  if (arbBalanceUSDC < amountUSDC) {
    console.log(`\n❌ Need at least $${amountUSDC} USDC on Arbitrum`);
    console.log(`   Send USDC to: ${custodialAddress}`);
    return;
  }

  // Prepare deposit data
  console.log(`\n[4/5] 🔧 Preparing deposit ($${amountUSDC} USDC)...\n`);

  const nonce = generateNonce();
  const depositAmount = (amountUSDC * 1e6).toString(); // USDC has 6 decimals

  // Encode data array as per backend docs
  const dataArray = [
    42161,                                           // [0] chainId (Arbitrum)
    "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // [1] USDC token address
    depositAmount,                                   // [2] amount
    nonce.toString()                                 // [3] nonce
  ];

  console.log('   Data array:', dataArray);

  try {
    // Encode using SDK
    const encodedData = CryptoUtils.encodeInputData("hl_deposit", {
      chainId: 42161,
      tokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      amount: depositAmount,
      nonce: nonce.toString()
    });

    console.log(`   ✅ Encoded data`);

    // Sign: hl_deposit-{userId}-{encodedData}
    const userId = session.walletAddress.toLowerCase();
    const signMessage = `hl_deposit-${userId}-${encodedData}`;
    const signature = CryptoUtils.sign(signMessage, session.tradingPrivateKey);

    console.log(`   ✅ Signed (userId: ${userId})`);

    // Create payload
    const apiKey = config.apiKey.split(',')[0].trim();
    const payload = {
      userId: userId,
      data: encodedData,
      signature: signature,
      apiKey: apiKey
    };

    // Encrypt payload
    const computedData = encrypt(JSON.stringify(payload), apiKey);
    console.log(`   ✅ Encrypted payload`);

    // Make request
    console.log('\n[5/5] 🚀 Sending deposit request...\n');
    const endpoint = `${config.apiUrl}/hl/deposit`; // Try /hl/deposit
    console.log(`   POST ${endpoint}`);

    const response = await axios.post(endpoint, {
      computedData: computedData
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://gdex.pro',
        'Referer': 'https://gdex.pro/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
      }
    });

    console.log('\n   Response:', JSON.stringify(response.data, null, 2));

    if (response.data?.isSuccess) {
      console.log('\n🎉 Deposit initiated successfully!');
      console.log(`   Amount: $${amountUSDC} USDC`);
      console.log('   Waiting for HyperLiquid confirmation (~10 minutes)...');

      // Monitor balance
      console.log('\n⏳ Monitoring HyperLiquid balance...\n');
      const initialBalance = hlBalance || 0;

      for (let i = 0; i < 40; i++) { // Check for up to 10 minutes (40 * 15s)
        await new Promise(r => setTimeout(r, 15000)); // 15 seconds

        const currentBalance = await session.sdk.hyperLiquid.getHyperliquidUsdcBalance(custodialAddress);

        if (currentBalance && currentBalance > initialBalance) {
          console.log(`\n✅ Deposit confirmed!`);
          console.log(`   Previous: $${initialBalance}`);
          console.log(`   Current:  $${currentBalance}`);
          console.log('\n🚀 Ready to trade HyperLiquid leveraged positions!');
          console.log('   Try: npm run test:hl');
          return;
        }

        const elapsed = ((i + 1) * 15);
        console.log(`   [${elapsed}s] Balance: $${currentBalance ?? 0} (waiting...)`);
      }

      console.log('\n⚠️  Still waiting. Deposit may take up to 10 minutes.');
      console.log('   Check balance manually: npm run check:hl:balance');
    } else {
      console.log('\n❌ Deposit failed:', response.data);
    }

  } catch (error: any) {
    console.log(`\n❌ Error: ${error.message}`);
    if (error.response) {
      console.log(`   Status: ${error.response.status}`);
      console.log(`   Data:`, error.response.data);
    }
  }

  console.log('\n' + '='.repeat(70));
}

if (require.main === module) {
  const amount = process.argv[2] ? parseFloat(process.argv[2]) : 10;
  depositHLCorrect(amount).catch(console.error);
}

export { depositHLCorrect };
