import WebSocket from 'ws';
(globalThis as any).WebSocket = WebSocket;
import { createAuthenticatedSession } from './auth';
import { CryptoUtils } from 'gdex.pro-sdk';
import { createHash, createCipheriv } from 'crypto';
import axios from 'axios';

const CUSTODIAL = '0x886e83feb8d1774afab4a32047a083434354c6f0';
const API_URL = 'https://trade-api.gemach.io/v1';
const HEADERS = {
  'Origin': 'https://gdex.pro', 'Referer': 'https://gdex.pro/',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
  'Content-Type': 'application/json',
};

function encrypt(data: string, apiKey: string): string {
  const h = createHash('sha256').update(apiKey).digest('hex');
  const key = Buffer.from(h.slice(0, 64), 'hex');
  const iv = Buffer.from(createHash('sha256').update(h).digest('hex').slice(0, 32), 'hex');
  const c = createCipheriv('aes-256-cbc', key, iv);
  return c.update(data, 'utf8', 'hex') + c.final('hex');
}

async function main() {
  console.log('[1/3] Auth via Solana...');
  const session = await createAuthenticatedSession({ chainId: 622112261 });
  const apiKey = (process.env.GDEX_API_KEY || '').split(',')[0].trim();
  const userId = session.walletAddress.toLowerCase();

  const before = await session.sdk.hyperLiquid.getHyperliquidUsdcBalance(CUSTODIAL);
  console.log('HL balance before: $' + (before ?? 0));

  console.log('[2/3] Depositing $10 USDC...');
  const nonce = (Date.now() + Math.floor(Math.random() * 1000)).toString();

  const encodedData = CryptoUtils.encodeInputData('hl_deposit', {
    chainId: 42161,
    tokenAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    amount: '10000000',  // $10 USDC (min is $10)
    nonce,
  });
  console.log('encodedData ok:', !!encodedData);

  const signMsg = `hl_deposit-${userId}-${encodedData}`;
  const signature = CryptoUtils.sign(signMsg, session.tradingPrivateKey);
  const payload = { userId, data: encodedData, signature, apiKey };
  const computedData = encrypt(JSON.stringify(payload), apiKey);

  const res = await axios.post(API_URL + '/hl/deposit', { computedData }, { headers: HEADERS });
  console.log('[3/3] Response:', JSON.stringify(res.data));

  if (res.data?.isSuccess) {
    console.log('Deposit initiated! Waiting 60s for confirmation...');
    await new Promise(r => setTimeout(r, 60000));
    const after = await session.sdk.hyperLiquid.getHyperliquidUsdcBalance(CUSTODIAL);
    console.log('HL balance after: $' + (after ?? 0));
    if ((after ?? 0) > (before ?? 0)) {
      console.log('SUCCESS — balance increased by $' + ((after ?? 0) - (before ?? 0)));
    } else {
      console.log('Still processing — check again with: npm run hl:balance');
    }
  }
}

main().catch(e => {
  console.error('ERROR:', (e as any).response?.data ?? (e as any).message);
  process.exit(1);
});
