/**
 * SWAP ETH → USDC on Arbitrum, then deposit to HyperLiquid
 *
 * Step 1: Uniswap V3 on Arbitrum — swap ETH from control wallet → USDC,
 *         send directly to custodial wallet (ethers.js, no GDEX SDK needed)
 * Step 2: GDEX SDK (CryptoUtils + /hl/deposit) — move USDC to HyperLiquid
 *
 * Usage: npx ts-node src/swap-eth-and-deposit.ts
 */

import WebSocket from 'ws';
(globalThis as any).WebSocket = WebSocket;

import { createAuthenticatedSession } from './auth';
import { CryptoUtils } from 'gdex.pro-sdk';
import { createHash, createCipheriv } from 'crypto';
import { ethers } from 'ethers';
import axios from 'axios';

// ─── Constants ────────────────────────────────────────────────────────────────

const CUSTODIAL       = '0x886e83feb8d1774afab4a32047a083434354c6f0';
const ARB_CHAIN_ID    = 42161;
const ARB_USDC        = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const ARB_WETH        = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';
const ARB_RPC         = 'https://arb1.arbitrum.io/rpc';
const UNISWAP_ROUTER  = '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45'; // SwapRouter02
const ETH_TO_SWAP     = '0.001';  // ~$1.90 — just enough to top up to $10+
const DEPOSIT_AMOUNT  = 10;       // USDC to deposit to HL (minimum is $10)

const API_URL = 'https://trade-api.gemach.io/v1';
const HEADERS = {
  'Origin': 'https://gdex.pro',
  'Referer': 'https://gdex.pro/',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Content-Type': 'application/json',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function encrypt(data: string, apiKey: string): string {
  const h = createHash('sha256').update(apiKey).digest('hex');
  const key = Buffer.from(h.slice(0, 64), 'hex');
  const iv  = Buffer.from(createHash('sha256').update(h).digest('hex').slice(0, 32), 'hex');
  const c   = createCipheriv('aes-256-cbc', key, iv);
  return c.update(data, 'utf8', 'hex') + c.final('hex');
}

async function getUsdcBalance(address: string): Promise<number> {
  const provider = new ethers.JsonRpcProvider(ARB_RPC);
  const usdc = new ethers.Contract(ARB_USDC,
    ['function balanceOf(address) view returns (uint256)'], provider);
  const bal = await usdc.balanceOf(address);
  return Number(bal) / 1e6;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═'.repeat(60));
  console.log('  GDEX SDK: ETH → USDC Swap + HyperLiquid Deposit');
  console.log('═'.repeat(60));

  // ── Step 1: Auth ──────────────────────────────────────────────────────────
  console.log('\n[1/4] 🔐 Authenticating via Solana (fastest login)...');
  const session = await createAuthenticatedSession({ chainId: 622112261 });
  const apiKey  = (process.env.GDEX_API_KEY || '').split(',')[0].trim();
  const userId  = session.walletAddress.toLowerCase();
  console.log(`      ✅ wallet: ${session.walletAddress}`);
  console.log(`      ✅ custodial: ${CUSTODIAL}`);

  // ── Current balances ──────────────────────────────────────────────────────
  const usdcBefore = await getUsdcBalance(CUSTODIAL);
  const hlBefore   = await session.sdk.hyperLiquid.getHyperliquidUsdcBalance(CUSTODIAL) ?? 0;

  const provider = new ethers.JsonRpcProvider(ARB_RPC);
  const ethBalWei = await provider.getBalance(CUSTODIAL);
  const ethBal    = parseFloat(ethers.formatEther(ethBalWei));

  console.log(`\n      Balances:`);
  console.log(`        ETH  on Arb:          ${ethBal.toFixed(6)} ETH`);
  console.log(`        USDC on Arb:          $${usdcBefore.toFixed(2)}`);
  console.log(`        USDC on HyperLiquid:  $${hlBefore.toFixed(2)}`);

  if (ethBal < parseFloat(ETH_TO_SWAP) + 0.0005) {
    console.log(`\n❌ Not enough ETH. Have ${ethBal.toFixed(6)}, need ~${ETH_TO_SWAP} + gas`);
    process.exit(1);
  }

  // ── Step 2: Swap ETH → USDC via Uniswap V3 on Arbitrum ──────────────────
  console.log(`\n[2/4] 🔄 Swapping ${ETH_TO_SWAP} ETH → USDC via Uniswap V3 on Arbitrum...`);
  console.log(`      from: control wallet (${session.walletAddress})`);
  console.log(`      to:   custodial wallet (${CUSTODIAL}) — USDC lands here directly`);

  const privateKeyRaw = (process.env.PRIVATE_KEY || '').replace(/^0x/, '');
  if (!privateKeyRaw) { console.error('❌ PRIVATE_KEY not in .env'); process.exit(1); }

  const wallet   = new ethers.Wallet('0x' + privateKeyRaw, provider);
  const swapAbi  = ['function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)'];
  const router   = new ethers.Contract(UNISWAP_ROUTER, swapAbi, wallet);

  const amountIn = ethers.parseEther(ETH_TO_SWAP);
  const params   = {
    tokenIn:             ARB_WETH,
    tokenOut:            ARB_USDC,
    fee:                 500,        // 0.05% pool (ETH/USDC tight spread)
    recipient:           CUSTODIAL,  // USDC goes straight to custodial
    amountIn,
    amountOutMinimum:    1_000_000n, // min $1.00 USDC (protects against bad slippage)
    sqrtPriceLimitX96:   0n,
  };

  console.log(`      swapping ${ETH_TO_SWAP} ETH → min $1.00 USDC...`);
  const swapTx   = await router.exactInputSingle(params, { value: amountIn });
  console.log(`      ✅ Swap tx sent: ${swapTx.hash}`);
  console.log(`      ⏳ Waiting for confirmation...`);
  const receipt  = await swapTx.wait();
  console.log(`      ✅ Confirmed in block ${receipt.blockNumber}`);
  const txHash   = swapTx.hash;

  // ── Poll for USDC balance increase ────────────────────────────────────────
  console.log(`\n      ⏳ Waiting for swap to settle (polling every 10s)...`);
  let usdcAfterSwap = usdcBefore;
  for (let i = 0; i < 18; i++) {
    await new Promise(r => setTimeout(r, 10_000));
    usdcAfterSwap = await getUsdcBalance(CUSTODIAL);
    const gained = usdcAfterSwap - usdcBefore;
    process.stdout.write(`\r      [${(i + 1) * 10}s] USDC: $${usdcAfterSwap.toFixed(2)} (gained: $${gained.toFixed(2)})`);
    if (usdcAfterSwap > usdcBefore + 0.5) break;
  }
  console.log();

  const gained = usdcAfterSwap - usdcBefore;
  console.log(`      ✅ Swap settled: $${usdcBefore.toFixed(2)} → $${usdcAfterSwap.toFixed(2)} (+$${gained.toFixed(2)} USDC)`);

  if (usdcAfterSwap < DEPOSIT_AMOUNT) {
    console.log(`\n❌ Not enough USDC for deposit. Have $${usdcAfterSwap.toFixed(2)}, need $${DEPOSIT_AMOUNT}`);
    process.exit(1);
  }

  // ── Step 3: Deposit USDC → HyperLiquid ───────────────────────────────────
  console.log(`\n[3/4] 💸 Depositing $${DEPOSIT_AMOUNT} USDC → HyperLiquid...`);
  const nonce        = (Date.now() + Math.floor(Math.random() * 1000)).toString();
  const depositAmt   = (DEPOSIT_AMOUNT * 1e6).toString();

  const encodedData = CryptoUtils.encodeInputData('hl_deposit', {
    chainId:       ARB_CHAIN_ID,
    tokenAddress:  ARB_USDC,
    amount:        depositAmt,
    nonce,
  });

  const signature   = CryptoUtils.sign(`hl_deposit-${userId}-${encodedData}`, session.tradingPrivateKey);
  const payload     = { userId, data: encodedData, signature, apiKey };
  const computedData = encrypt(JSON.stringify(payload), apiKey);

  const depRes = await axios.post(`${API_URL}/hl/deposit`, { computedData }, { headers: HEADERS });
  console.log(`      Response: ${JSON.stringify(depRes.data)}`);

  if (!depRes.data?.isSuccess) {
    console.log(`\n❌ Deposit failed: ${JSON.stringify(depRes.data)}`);
    process.exit(1);
  }

  console.log(`      ✅ Deposit of $${DEPOSIT_AMOUNT} USDC initiated!`);

  // ── Step 4: Poll HL balance ───────────────────────────────────────────────
  console.log(`\n[4/4] ⏳ Waiting for HL balance to update (this can take 1–10 min)...`);
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 30_000));
    const hlNow = await session.sdk.hyperLiquid.getHyperliquidUsdcBalance(CUSTODIAL) ?? 0;
    process.stdout.write(`\r      [${(i + 1) * 30}s] HL balance: $${hlNow.toFixed(2)}`);
    if (hlNow > hlBefore + 5) {
      console.log(`\n\n${'═'.repeat(60)}`);
      console.log('🎉  SUCCESS!');
      console.log(`    Swap:    +$${gained.toFixed(2)} USDC (via sdk.trading.buy)`);
      console.log(`    Deposit: +$${DEPOSIT_AMOUNT} USDC → HyperLiquid`);
      console.log(`    HL balance: $${hlBefore.toFixed(2)} → $${hlNow.toFixed(2)}`);
      console.log(`${'═'.repeat(60)}`);
      console.log('\n🚀 Ready to run: npm run hl:scalper');
      return;
    }
  }

  console.log('\n\n⏱️  Deposit is still processing (HyperLiquid can take up to 10 min).');
  console.log(`   Check balance with: npm run hl:balance`);
  console.log(`   Then run scalper:   npm run hl:scalper`);
}

main().catch(err => {
  console.error('\n❌ Fatal:', err.response?.data ?? err.message);
  process.exit(1);
});
