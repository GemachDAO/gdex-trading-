import WebSocket from 'ws';
(globalThis as any).WebSocket = WebSocket;
import axios from 'axios';
import { createAuthenticatedSession } from './auth';
import { CryptoUtils } from 'gdex.pro-sdk';
import { createHash, createCipheriv } from 'crypto';

const B = 'https://trade-api.gemach.io/v1';
const H = {
  'Origin': 'https://gdex.pro',
  'Referer': 'https://gdex.pro/',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
};

function encPayload(d: string, k: string): string {
  const h = createHash('sha256').update(k).digest('hex');
  const key = Buffer.from(h.slice(0, 64), 'hex');
  const iv = Buffer.from(createHash('sha256').update(h).digest('hex').slice(0, 32), 'hex');
  const c = createCipheriv('aes-256-cbc', key, iv);
  return c.update(d, 'utf8', 'hex') + c.final('hex');
}

(async () => {
  const session = await createAuthenticatedSession({ chainId: 622112261 });
  const userId = session.walletAddress.toLowerCase();
  const apiKey = (process.env.GDEX_API_KEY || '').split(',')[0].trim();
  console.log('Auth OK, userId:', userId);

  // Step 1: isCancelAll=true
  console.log('\n--- Step 1: Cancel ALL orders (isCancelAll=true) ---');
  try {
    const nonce = (Date.now() + Math.floor(Math.random() * 1000)).toString();
    const cancelEncoded = CryptoUtils.encodeInputData('hl_cancel_order', { nonce });
    const cancelSig = CryptoUtils.sign(`hl_cancel_order-${userId}-${cancelEncoded}`, session.tradingPrivateKey);
    const cd = encPayload(JSON.stringify({ userId, data: cancelEncoded, signature: cancelSig, apiKey }), apiKey);
    const res = await axios.post(B + '/hl/cancel_order',
      { computedData: cd, isCancelAll: true },
      { headers: { ...H, 'Content-Type': 'application/json' } });
    console.log('cancel_all result:', JSON.stringify(res.data, null, 2));
  } catch (e: any) {
    console.log('cancel_all error:', JSON.stringify(e.response?.data ?? e.message));
  }

  // Step 2: Check remaining orders
  await new Promise(r => setTimeout(r, 2000));
  console.log('\n--- Step 2: Open orders after cancel_all ---');
  const ordersRes = await axios.get(B + '/hl/open_orders?address=0x886e83feb8d1774afab4a32047a083434354c6f0&dex=', { headers: H });
  const remaining = ordersRes.data?.orders?.length ?? 0;
  console.log('Remaining open orders:', remaining);
  (ordersRes.data?.orders ?? []).forEach((o: any) => console.log('  oid:', o.oid, o.coin, '@', o.limitPx));

  // Step 3: Test /hl/place_order (new endpoint from docs)
  console.log('\n--- Step 3: Test /hl/place_order (new endpoint) ---');
  try {
    const priceRes = await axios.get(B + '/hl/meta_and_asset_ctxs?dex=', { headers: H });
    const ethPrice = parseFloat(priceRes.data?.data?.[1]?.[1]?.markPx || '2065');
    const limitPrice = (ethPrice * 0.5).toFixed(1);
    const nonce = (Date.now() + Math.floor(Math.random() * 1000)).toString();
    const params = { coin: 'ETH', isLong: true, price: limitPrice, size: '0.013', reduceOnly: false, nonce, tpPrice: '0', slPrice: '0', isMarket: false };
    console.log('Trying /place_order @ $' + limitPrice + ' (50% below market)');
    const encoded = CryptoUtils.encodeInputData('hl_create_order', params);
    const sig = CryptoUtils.sign(`hl_create_order-${userId}-${encoded}`, session.tradingPrivateKey);
    const cd = encPayload(JSON.stringify({ userId, data: encoded, signature: sig, apiKey }), apiKey);
    const res = await axios.post(B + '/hl/place_order', { computedData: cd }, { headers: { ...H, 'Content-Type': 'application/json' } });
    console.log('place_order result:', JSON.stringify(res.data, null, 2));
  } catch (e: any) {
    console.log('place_order result:', JSON.stringify(e.response?.data ?? e.message));
  }

  // Step 4: Retry /create_order after cancel_all
  console.log('\n--- Step 4: Retry /create_order after cancel_all ---');
  try {
    const priceRes = await axios.get(B + '/hl/meta_and_asset_ctxs?dex=', { headers: H });
    const ethPrice = parseFloat(priceRes.data?.data?.[1]?.[1]?.markPx || '2065');
    const limitPrice = (ethPrice * 0.5).toFixed(1);
    const nonce = (Date.now() + Math.floor(Math.random() * 1000)).toString();
    const params = { coin: 'ETH', isLong: true, price: limitPrice, size: '0.013', reduceOnly: false, nonce, tpPrice: '0', slPrice: '0', isMarket: false };
    console.log('Trying /create_order @ $' + limitPrice);
    const encoded = CryptoUtils.encodeInputData('hl_create_order', params);
    const sig = CryptoUtils.sign(`hl_create_order-${userId}-${encoded}`, session.tradingPrivateKey);
    const cd = encPayload(JSON.stringify({ userId, data: encoded, signature: sig, apiKey }), apiKey);
    const res = await axios.post(B + '/hl/create_order', { computedData: cd }, { headers: { ...H, 'Content-Type': 'application/json' } });
    console.log('create_order result:', JSON.stringify(res.data, null, 2));
    if (res.data?.isSuccess) {
      console.log('\n🎉 WORKS! Auto-cancelling the fresh order...');
      await new Promise(r => setTimeout(r, 1500));
      const oRes = await axios.get(B + '/hl/open_orders?address=0x886e83feb8d1774afab4a32047a083434354c6f0&dex=', { headers: H });
      const orders = oRes.data?.orders ?? [];
      if (orders.length > 0) {
        const o = orders[0];
        const cn = (Date.now() + Math.floor(Math.random() * 1000)).toString();
        const ce = CryptoUtils.encodeInputData('hl_cancel_order', { nonce: cn, coin: 'ETH', orderId: o.oid.toString() });
        const cs = CryptoUtils.sign(`hl_cancel_order-${userId}-${ce}`, session.tradingPrivateKey);
        const ccd = encPayload(JSON.stringify({ userId, data: ce, signature: cs, apiKey }), apiKey);
        const cr = await axios.post(B + '/hl/cancel_order', { computedData: ccd, isCancelAll: false }, { headers: { ...H, 'Content-Type': 'application/json' } });
        console.log('Auto-cancel result:', JSON.stringify(cr.data));
      }
    }
  } catch (e: any) {
    console.log('create_order error:', JSON.stringify(e.response?.data ?? e.message));
  }
})().catch(e => console.error('FATAL:', e.message));
