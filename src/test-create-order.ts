import WebSocket from 'ws';
(globalThis as any).WebSocket = WebSocket;

import { createAuthenticatedSession } from './auth';
import { CryptoUtils } from 'gdex.pro-sdk';
import { createHash, createCipheriv } from 'crypto';
import axios from 'axios';

const API_URL = 'https://trade-api.gemach.io/v1';
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const GDEX_HEADERS = {
  'Origin': 'https://gdex.pro',
  'Referer': 'https://gdex.pro/',
  'User-Agent': BROWSER_UA,
};

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

async function testCreateOrder() {
  console.log('=== Testing HL create_order ===\n');

  // Use Solana auth (Arbitrum sign_in consistently times out)
  let session;
  try {
    session = await createAuthenticatedSession({ chainId: 622112261 });
  } catch {
    session = await createAuthenticatedSession({ chainId: 42161 });
  }
  const apiKey = (process.env.GDEX_API_KEY || '').split(',')[0].trim();
  const userId = session.walletAddress.toLowerCase();

  console.log('userId:', userId);

  // Get ETH mark price
  const priceRes = await axios.get(`${API_URL}/hl/meta_and_asset_ctxs?dex=`, {
    headers: GDEX_HEADERS,
  });
  const ethCtx = priceRes.data?.data?.[1]?.[1];
  const ethPrice = parseFloat(ethCtx?.markPx || '2050');
  console.log(`ETH mark price: $${ethPrice}`);

  // Limit BUY 50% below market — will NOT fill, safe to test
  const limitPrice = (ethPrice * 0.5).toFixed(1);
  const size = '0.013'; // 0.013 × ~$1025 ≈ $13.33 (> $11 min)
  const orderValue = (parseFloat(limitPrice) * parseFloat(size)).toFixed(2);
  console.log(`\nOrder: BUY ${size} ETH @ $${limitPrice} = $${orderValue} notional`);
  console.log('(Limit order 50% below market — safe, will NOT fill)\n');

  const nonce = generateNonce();
  const params = {
    coin: 'ETH',
    isLong: true,
    price: limitPrice,
    size,
    reduceOnly: false,
    nonce: nonce.toString(),
    tpPrice: '0',
    slPrice: '0',
    isMarket: false,
  };

  const encodedData = CryptoUtils.encodeInputData('hl_create_order', params);
  console.log('encodedData (first 60):', encodedData.slice(0, 60) + '...');

  const msgStr = `hl_create_order-${userId}-${encodedData}`;
  const signature = CryptoUtils.sign(msgStr, session.tradingPrivateKey);
  console.log('signature (first 20):', signature.slice(0, 20) + '...');

  const payload = { userId, data: encodedData, signature, apiKey };
  const computedData = encrypt(JSON.stringify(payload), apiKey);

  try {
    const res = await axios.post(
      `${API_URL}/hl/create_order`,
      { computedData },
      {
        headers: { ...GDEX_HEADERS, 'Content-Type': 'application/json' },
      }
    );
    console.log('\n✅ RESPONSE:', JSON.stringify(res.data, null, 2));

    if (res.data?.isSuccess) {
      console.log('\n🎉 CREATE_ORDER WORKS! Fetching open orders to cancel...');
      await new Promise(r => setTimeout(r, 2000));

      // HL orders are tracked under the EVM custodial address
      // Try getUserInfo with Ethereum chainId (1) to get EVM custodial address
      let custodialAddr = userId; // fallback to control wallet
      for (const chainId of [1, 8453, 56]) {
        try {
          const userInfo = await session.sdk.user.getUserInfo(
            session.walletAddress, session.encryptedSessionKey, chainId
          );
          const addr = userInfo?.address?.toLowerCase();
          if (addr && addr.startsWith('0x')) {
            custodialAddr = addr;
            break;
          }
        } catch { /* try next */ }
      }
      console.log('Custodial address:', custodialAddr);

      const ordersRes = await axios.get(
        `${API_URL}/hl/open_orders?address=${custodialAddr}&dex=`,
        { headers: GDEX_HEADERS }
      );
      const orders = ordersRes.data?.orders || [];
      console.log('Open orders count:', orders.length);

      if (orders.length > 0) {
        const order = orders[0];
        console.log(`\nCancelling order oid=${order.oid} (${order.coin} ${order.side} ${order.sz} @ ${order.limitPx})...`);

        const cancelNonce = generateNonce();
        const cancelParams = { nonce: cancelNonce.toString(), coin: 'ETH', orderId: order.oid.toString() };
        const cancelEncoded = CryptoUtils.encodeInputData('hl_cancel_order', cancelParams);
        const cancelMsg = `hl_cancel_order-${userId}-${cancelEncoded}`;
        const cancelSig = CryptoUtils.sign(cancelMsg, session.tradingPrivateKey);
        const cancelPayload = { userId, data: cancelEncoded, signature: cancelSig, apiKey };
        const cancelComputed = encrypt(JSON.stringify(cancelPayload), apiKey);

        const cancelRes = await axios.post(
          `${API_URL}/hl/cancel_order`,
          { computedData: cancelComputed, isCancelAll: false },
          { headers: { ...GDEX_HEADERS, 'Content-Type': 'application/json' } }
        );
        console.log('Cancel result:', JSON.stringify(cancelRes.data, null, 2));
      }
    }
  } catch (err: any) {
    console.log('\n❌ ERROR:', JSON.stringify(err.response?.data ?? err.message, null, 2));
  }
}

testCreateOrder().catch(console.error);
