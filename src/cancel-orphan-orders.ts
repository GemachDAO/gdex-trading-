/**
 * cancel-orphan-orders.ts
 * Cancels stale open orders on HyperLiquid that were left by old test scripts.
 */
import WebSocket from 'ws';
(globalThis as any).WebSocket = WebSocket;

import { createAuthenticatedSession } from './auth';
import { CryptoUtils } from 'gdex.pro-sdk';
import { createHash, createCipheriv } from 'crypto';
import axios from 'axios';

const API_URL = 'https://trade-api.gemach.io/v1';
const GDEX_HEADERS = {
  'Origin': 'https://gdex.pro',
  'Referer': 'https://gdex.pro/',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Content-Type': 'application/json',
};

function encrypt(data: string, apiKey: string): string {
  const hashAPI = createHash('sha256').update(apiKey).digest('hex');
  const key = Buffer.from(hashAPI.slice(0, 64), 'hex');
  const iv = Buffer.from(createHash('sha256').update(hashAPI).digest('hex').slice(0, 32), 'hex');
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  return cipher.update(data, 'utf8', 'hex') + cipher.final('hex');
}

async function cancelOrder(userId: string, apiKey: string, tradingPrivateKey: string, coin: string, oid: number) {
  const nonce = (Date.now() + Math.floor(Math.random() * 1000)).toString();
  const params = { nonce, coin, orderId: oid.toString() };
  const encodedData = CryptoUtils.encodeInputData('hl_cancel_order', params);
  if (!encodedData) {
    console.log(`  ⚠️  encodeInputData returned null for oid ${oid} — skipping`);
    return null;
  }
  const signature = CryptoUtils.sign(`hl_cancel_order-${userId}-${encodedData}`, tradingPrivateKey);
  const payload = { userId, data: encodedData, signature, apiKey };
  const computedData = encrypt(JSON.stringify(payload), apiKey);

  const res = await axios.post(
    `${API_URL}/hl/cancel_order`,
    { computedData, isCancelAll: false },
    { headers: GDEX_HEADERS },
  );
  return res.data;
}

async function main() {
  console.log('🔐 Authenticating (Solana fallback → Arbitrum)...');
  let session;
  try {
    session = await createAuthenticatedSession({ chainId: 622112261 });
  } catch {
    session = await createAuthenticatedSession({ chainId: 42161 });
  }
  const userId = session.walletAddress.toLowerCase();
  const apiKey = (process.env.GDEX_API_KEY || '').split(',')[0].trim();
  console.log(`✅ Auth OK — userId: ${userId}`);

  // Check current open orders via HL directly
  console.log('\n📋 Fetching open orders from HyperLiquid...');
  const hlRes = await axios.post('https://api.hyperliquid.xyz/info', {
    type: 'openOrders',
    user: '0x886e83feb8d1774afab4a32047a083434354c6f0',
  });
  const orders: any[] = hlRes.data || [];
  console.log(`Found ${orders.length} open order(s):`);
  for (const o of orders) {
    console.log(`  oid:${o.oid}  ${o.coin} ${o.side === 'B' ? 'BUY' : 'SELL'}  sz:${o.sz}  @ $${o.limitPx}`);
  }

  if (orders.length === 0) {
    console.log('\n✅ Nothing to cancel.');
    return;
  }

  console.log('\n🗑️  Cancelling each order...');
  for (const o of orders) {
    process.stdout.write(`  Cancelling oid:${o.oid} (${o.coin} @ $${o.limitPx})... `);
    try {
      const result = await cancelOrder(userId, apiKey, session.tradingPrivateKey, o.coin, o.oid);
      if (result?.isSuccess) {
        console.log('✅ cancelled');
      } else {
        console.log(`❌ failed — ${JSON.stringify(result)}`);
      }
    } catch (err: any) {
      console.log(`❌ error — ${JSON.stringify(err.response?.data ?? err.message)}`);
    }
    // small delay between requests
    await new Promise(r => setTimeout(r, 800));
  }

  // Verify
  console.log('\n🔍 Verifying — checking HL open orders again...');
  await new Promise(r => setTimeout(r, 2000));
  const verifyRes = await axios.post('https://api.hyperliquid.xyz/info', {
    type: 'openOrders',
    user: '0x886e83feb8d1774afab4a32047a083434354c6f0',
  });
  const remaining: any[] = verifyRes.data || [];
  if (remaining.length === 0) {
    console.log('✅ All orders cleared!');
  } else {
    console.log(`⚠️  ${remaining.length} order(s) still open:`);
    for (const o of remaining) {
      console.log(`  oid:${o.oid}  ${o.coin}  @ $${o.limitPx}`);
    }
  }
}

main().catch(err => {
  console.error('FATAL:', err.message || err);
  process.exit(1);
});
