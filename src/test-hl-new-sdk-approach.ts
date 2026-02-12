import { createAuthenticatedSession } from './auth';
import { loadConfig } from './config';
import { CryptoUtils } from 'gdex.pro-sdk';
import axios from 'axios';
import { createHash, createCipheriv } from 'crypto';

// Encryption functions from new SDK
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

async function testNewSDKApproach() {
  console.log('🎯 HyperLiquid Order - New SDK Approach\n');
  console.log('='.repeat(70));

  const config = loadConfig();

  // Authenticate
  console.log('\n[1/6] 🔐 Authenticating...\n');
  const session = await createAuthenticatedSession({
    apiUrl: config.apiUrl,
    apiKey: config.apiKey,
    walletAddress: config.walletAddress,
    privateKey: config.privateKey,
    chainId: 42161,
  });

  console.log(`✅ Authenticated`);

  // Get custodial address
  console.log('\n[2/7] 📋 Getting custodial address...\n');
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

  // Check HyperLiquid balance
  console.log('\n[3/7] 💰 Checking HyperLiquid balance...\n');
  const hlBalance = await session.sdk.hyperLiquid.getHyperliquidUsdcBalance(custodialAddress);
  console.log(`   HyperLiquid Balance: $${hlBalance ?? 0}`);

  // Check Arbitrum USDC balance
  console.log('   Checking Arbitrum USDC...');
  const provider = new (await import('ethers')).ethers.JsonRpcProvider('https://arb1.arbitrum.io/rpc');
  const usdcContract = new (await import('ethers')).ethers.Contract(
    '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    ['function balanceOf(address) view returns (uint256)'],
    provider
  );
  const arbBalance = await usdcContract.balanceOf(custodialAddress);
  const arbBalanceUSDC = Number(arbBalance) / 1e6;
  console.log(`   Arbitrum USDC Balance: $${arbBalanceUSDC.toFixed(2)}`);

  const totalBalance = Math.max(arbBalanceUSDC, hlBalance || 0);

  if (totalBalance < 5) {
    console.log('\n❌ Need at least $5 USDC (Arbitrum or HyperLiquid)');
    console.log(`   Arbitrum: $${arbBalanceUSDC.toFixed(2)}`);
    console.log(`   HyperLiquid: $${hlBalance ?? 0}`);
    console.log(`\n   To deposit: Send USDC to ${custodialAddress}`);
    return;
  }

  console.log(`\n✅ Sufficient balance! Total: $${totalBalance.toFixed(2)}`);

  // Get price
  console.log('\n[4/7] 📊 Getting BTC price...\n');
  const btcPrice = await session.sdk.hyperLiquid.getHyperliquidMarkPrice('BTC');
  const price = typeof btcPrice === 'string' ? parseFloat(btcPrice) : btcPrice || 66000;
  console.log(`   BTC Price: $${price.toLocaleString()}`);

  // Prepare order - start with small 2x leverage
  const leverage = 2;
  const positionValue = totalBalance * leverage;
  const positionSize = (positionValue / price).toFixed(4);
  const nonce = generateNonce();

  console.log('\n[5/7] 📝 Preparing order...\n');
  console.log(`   Leverage: ${leverage}x`);
  console.log(`   Size: ${positionSize} BTC`);
  console.log(`   Nonce: ${nonce}`);

  // Encode data exactly like new SDK (JSON.stringify, not CryptoUtils.encodeInputData!)
  console.log('\n[6/7] 🔧 Encoding order (new SDK method)...\n');

  // Use SDK's encodeInputData, not JSON.stringify
  const orderParams = {
    coin: "BTC",
    isLong: true,
    price: price.toString(),
    size: positionSize,
    reduceOnly: false,
    nonce: nonce.toString(), // nonce must be string
    tpPrice: "0",
    slPrice: "0",
    isMarket: true
  };

  const encodedData = CryptoUtils.encodeInputData("hl_create_order", orderParams);
  console.log(`   Encoded: ${encodedData.substring(0, 60)}...`);

  try {
    // Use CONTROL wallet as userId - backend should route to custodial for HL
    const userId = session.walletAddress.toLowerCase();
    const apiKey = config.apiKey.split(',')[0].trim();

    // Sign using trading private key
    const signMessage = `hl_create_order-${userId}-${encodedData}`;
    const signature = CryptoUtils.sign(signMessage, session.tradingPrivateKey);
    console.log(`   ✅ Signed (userId: ${userId})`);
    console.log(`   Note: Backend should route to custodial ${custodialAddress}`);

    // Create payload exactly like new SDK
    const payload = {
      userId: userId,
      data: encodedData,
      signature: signature,
      apiKey: apiKey
    };

    // Encrypt entire payload
    const computedData = encrypt(JSON.stringify(payload), apiKey);
    console.log(`   ✅ Encrypted payload`);

    // Make request
    console.log('\n[7/7] 🚀 Sending order...\n');
    const baseUrl = config.apiUrl; // https://trade-api.gemach.io/v1
    const endpoint = `${baseUrl}/hl/create_order`; // /hl/ not /api/hyperliquid/
    console.log(`   POST ${endpoint}`);

    const response = await axios.post(endpoint, {
      computedData: computedData
    }, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
        'Origin': 'https://gdex.pro',
        'Referer': 'https://gdex.pro/',
      }
    });

    console.log('\n   Response:', JSON.stringify(response.data, null, 2));

    if (response.data?.isSuccess) {
      console.log('\n🎉 SUCCESS! HyperLiquid leveraged position opened!');
      console.log(`   ${positionSize} BTC LONG at $${price.toLocaleString()}`);
      console.log(`   Position value: $${positionValue.toFixed(2)} (${leverage}x leverage)`);
    } else {
      console.log('\n❌ Order failed:', response.data);
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
  testNewSDKApproach().catch(console.error);
}

export { testNewSDKApproach };
