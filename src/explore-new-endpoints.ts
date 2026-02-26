import WebSocket from 'ws';
(globalThis as any).WebSocket = WebSocket;
import axios from 'axios';
import { createAuthenticatedSession } from './auth';

const B = 'https://trade-api.gemach.io/v1';
const H = {
  'Origin': 'https://gdex.pro',
  'Referer': 'https://gdex.pro/',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
};

async function chk(label: string, fn: () => Promise<string>) {
  try { console.log('✅', label + ':', await fn()); }
  catch (e: any) { console.log('❌', label + ':', JSON.stringify(e.response?.data ?? e.message).slice(0, 100)); }
}

(async () => {
  const session = await createAuthenticatedSession({ chainId: 622112261 });
  const userId = session.walletAddress.toLowerCase();
  console.log('Auth OK\n');

  await Promise.all([
    chk('GET /status (root)', async () => {
      const r = await axios.get('https://trade-api.gemach.io/status', { headers: H });
      return JSON.stringify(r.data).slice(0, 80);
    }),
    chk('GET /v1/status', async () => {
      const r = await axios.get(B + '/status', { headers: H });
      return JSON.stringify(r.data).slice(0, 80);
    }),
    chk('GET checkSolanaConnectionRpc', async () => {
      const r = await axios.get(B + '/checkSolanaConnectionRpc', { headers: H });
      return JSON.stringify(r.data).slice(0, 80);
    }),
    chk('GET bigbuys/622112261 (Solana)', async () => {
      const r = await axios.get(B + '/bigbuys/622112261', { headers: H });
      const d = r.data;
      return 'count=' + (Array.isArray(d) ? d.length : JSON.stringify(d).slice(0, 60));
    }),
    chk('GET bigbuys/8453 (Base)', async () => {
      const r = await axios.get(B + '/bigbuys/8453', { headers: H });
      const d = r.data;
      return 'count=' + (Array.isArray(d) ? d.length : JSON.stringify(d).slice(0, 60));
    }),
    chk('GET copy_trade/wallets', async () => {
      const r = await axios.get(B + '/copy_trade/wallets?chainId=622112261', { headers: H });
      return 'count=' + (Array.isArray(r.data) ? r.data.length : JSON.stringify(r.data).slice(0, 60));
    }),
    chk('GET hl/perp_dexes', async () => {
      const r = await axios.get(B + '/hl/perp_dexes', { headers: H });
      return JSON.stringify(r.data).slice(0, 120);
    }),
    chk('GET trending/options', async () => {
      const r = await axios.get(B + '/trending/options', { headers: H });
      return JSON.stringify(r.data).slice(0, 120);
    }),
    chk('GET hl_ref/info', async () => {
      const r = await axios.get(B + '/hl_ref/info?userId=' + userId, { headers: H });
      return JSON.stringify(r.data).slice(0, 120);
    }),
    chk('GET bridge/bridge_orders', async () => {
      const r = await axios.get(B + '/bridge/bridge_orders?userId=' + userId, { headers: H });
      return JSON.stringify(r.data).slice(0, 80);
    }),
    chk('GET token/token_image (BONK)', async () => {
      const r = await axios.get(B + '/token/token_image?address=DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263&chainId=622112261', { headers: H });
      return 'status=' + r.status + ' content-type=' + r.headers['content-type']?.slice(0, 30);
    }),
  ]);
})().catch(e => console.error('FATAL:', e.message));
