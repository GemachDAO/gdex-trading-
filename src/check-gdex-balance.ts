import WebSocket from 'ws';
(globalThis as any).WebSocket = WebSocket;
import axios from 'axios';
import { createAuthenticatedSession } from './auth';

const H = {
  'Origin': 'https://gdex.pro',
  'Referer': 'https://gdex.pro/',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
};

(async () => {
  console.log('Authenticating...');
  const session = await createAuthenticatedSession({ chainId: 42161 });
  const userId = session.walletAddress.toLowerCase();
  const data = session.encryptedSessionKey;
  console.log('userId:', userId);

  // 1. Portfolio (GDEX internal holdings)
  const r1 = await axios.get(
    `https://trade-api.gemach.io/v1/portfolio?userId=${userId}&data=${encodeURIComponent(data)}&chainId=42161`,
    { headers: H }
  );
  console.log('\nPortfolio (chainId=42161):', JSON.stringify(r1.data, null, 2));

  // 2. Same for Solana, to compare
  const r2 = await axios.get(
    `https://trade-api.gemach.io/v1/portfolio?userId=${userId}&data=${encodeURIComponent(data)}&chainId=622112261`,
    { headers: H }
  );
  console.log('\nPortfolio (chainId=622112261):', JSON.stringify(r2.data, null, 2));

  // 3. HL balance state
  const r3 = await axios.get(
    `https://trade-api.gemach.io/v1/hl/open_orders?address=0x886e83feb8d1774afab4a32047a083434354c6f0&dex=`,
    { headers: H }
  );
  console.log('\nHL open_orders:', JSON.stringify(r3.data, null, 2));

})().catch(e => {
  console.error('ERROR:', e.response?.data ?? e.message);
  process.exit(1);
});
