import axios from 'axios';
import { CryptoUtils } from 'gdex.pro-sdk';
import { GDEXSession } from './auth';
import { REQUIRED_HEADERS } from './config';

const SOLANA = 622112261;
// Default slippage for Solana v2 trades — 20% handles volatile new tokens
const DEFAULT_SLIPPAGE_BPS = 2000;
// Poll up to 30s for async v2 result
const MAX_POLL_ATTEMPTS = 30;
const POLL_INTERVAL_MS = 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TradeResult {
  isSuccess: boolean;
  hash?: string;
  message?: string;
  [key: string]: any;
}

export interface BuyOptions {
  tokenAddress: string;
  /** Amount in smallest unit (lamports for Solana, wei for EVM) */
  amount: string;
  /** Override session's default chain ID */
  chainId?: number;
  /** Slippage in basis points for Solana v2 (default 2000 = 20%) */
  slippageBps?: number;
  /** Jito/Helius priority tip in SOL for Solana v2 (default 0) */
  tip?: number;
}

export interface SellOptions {
  tokenAddress: string;
  /** Amount in smallest unit */
  amount: string;
  chainId?: number;
  /** Slippage in basis points for Solana v2 (default 2000 = 20%) */
  slippageBps?: number;
  /** Jito/Helius priority tip in SOL for Solana v2 (default 0) */
  tip?: number;
}

export interface LimitBuyOrderOptions {
  tokenAddress: string;
  /** Amount in smallest unit */
  amount: string;
  /** Trigger price as string (e.g., "0.002") */
  triggerPrice: string;
  /** Take profit percentage (e.g., 20 for 20%) */
  profitPercent?: number;
  /** Stop loss percentage (e.g., 10 for 10%) */
  lossPercent?: number;
  chainId?: number;
}

export interface LimitOrderOptions {
  tokenAddress: string;
  /** Amount in smallest unit */
  amount: string;
  /** Trigger price as string (e.g., "0.002") */
  triggerPrice: string;
  chainId?: number;
}

// ---------------------------------------------------------------------------
// Unit helpers
// ---------------------------------------------------------------------------

/** Convert SOL to lamports string. E.g., 0.005 → "5000000" */
export function formatSolAmount(sol: number): string {
  return Math.round(sol * 1_000_000_000).toString();
}

/** Convert ETH/BNB (18-decimal) to wei string. E.g., 0.1 → "100000000000000000" */
export function formatEthAmount(eth: number): string {
  // Use BigInt to avoid floating point issues
  const wei = BigInt(Math.round(eth * 1e9)) * BigInt(1e9);
  return wei.toString();
}

// ---------------------------------------------------------------------------
// Solana v2 async trade helpers
// ---------------------------------------------------------------------------

async function pollTradeStatus(apiUrl: string, requestId: string): Promise<TradeResult> {
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    try {
      const res = await axios.get(`${apiUrl}/trade-status/${requestId}`, {
        headers: REQUIRED_HEADERS,
        timeout: 5000,
      });
      const d = res.data;
      if (d.status === 'success') {
        return { isSuccess: true, hash: d.hash };
      }
      if (d.status === 'error') {
        return { isSuccess: false, message: d.error || 'Trade failed' };
      }
      // pending / processing — keep polling
    } catch {
      // ignore transient poll errors
    }
  }
  return { isSuccess: false, message: 'Timeout waiting for trade confirmation' };
}

/** Buy via POST /purchase_v2 (async queue — handles Token2022 + Raydium LaunchLab) */
async function buyTokenV2(session: GDEXSession, opts: BuyOptions): Promise<TradeResult> {
  const chainId = opts.chainId ?? session.chainId;
  const apiUrl = session.sdk.getConfig().baseURL;
  const userId = session.walletAddress.toLowerCase();
  const nonce = CryptoUtils.generateUniqueNumber().toString();

  const encodedData = CryptoUtils.encodeInputData('purchase', {
    tokenAddress: opts.tokenAddress,
    amount: opts.amount,
    nonce,
    chainId,
  });
  if (!encodedData) {
    return { isSuccess: false, message: 'encodeInputData returned null for purchase' };
  }

  const signature = CryptoUtils.sign(`purchase-${userId}-${encodedData}`, session.tradingPrivateKey);
  const computedData = CryptoUtils.getDataToSendApi(userId, encodedData, signature, session.apiKey);

  const res = await axios.post(`${apiUrl}/purchase_v2`, {
    computedData,
    chainId,
    slippage: opts.slippageBps ?? DEFAULT_SLIPPAGE_BPS,
    tip: opts.tip ?? 0,
  }, {
    headers: { ...REQUIRED_HEADERS, 'Content-Type': 'application/json' },
    timeout: 15000,
  });

  const requestId: string | undefined = res.data?.requestId;
  if (!requestId) {
    // Some responses are synchronous — check for immediate success/error
    if (res.data?.isSuccess === true) return { isSuccess: true, hash: res.data.hash };
    return { isSuccess: false, message: res.data?.error || 'No requestId in purchase_v2 response' };
  }

  return pollTradeStatus(apiUrl, requestId);
}

/** Sell via POST /sell_v2 (async queue — handles Token2022 + Raydium LaunchLab) */
async function sellTokenV2(session: GDEXSession, opts: SellOptions): Promise<TradeResult> {
  const chainId = opts.chainId ?? session.chainId;
  const apiUrl = session.sdk.getConfig().baseURL;
  const userId = session.walletAddress.toLowerCase();
  const nonce = CryptoUtils.generateUniqueNumber().toString();

  const encodedData = CryptoUtils.encodeInputData('sell', {
    tokenAddress: opts.tokenAddress,
    amount: opts.amount,
    nonce,
    chainId,
  });
  if (!encodedData) {
    return { isSuccess: false, message: 'encodeInputData returned null for sell' };
  }

  const signature = CryptoUtils.sign(`sell-${userId}-${encodedData}`, session.tradingPrivateKey);
  const computedData = CryptoUtils.getDataToSendApi(userId, encodedData, signature, session.apiKey);

  const res = await axios.post(`${apiUrl}/sell_v2`, {
    computedData,
    chainId,
    slippage: opts.slippageBps ?? DEFAULT_SLIPPAGE_BPS,
    tip: opts.tip ?? 0,
  }, {
    headers: { ...REQUIRED_HEADERS, 'Content-Type': 'application/json' },
    timeout: 15000,
  });

  const requestId: string | undefined = res.data?.requestId;
  if (!requestId) {
    if (res.data?.isSuccess === true) return { isSuccess: true, hash: res.data.hash };
    return { isSuccess: false, message: res.data?.error || 'No requestId in sell_v2 response' };
  }

  return pollTradeStatus(apiUrl, requestId);
}

// ---------------------------------------------------------------------------
// Public trading functions
// ---------------------------------------------------------------------------

/**
 * Execute a market buy.
 * Solana: uses /purchase_v2 (handles Token2022 + Raydium LaunchLab, async+poll).
 * EVM: uses SDK trading.buy (synchronous).
 */
export async function buyToken(
  session: GDEXSession,
  opts: BuyOptions
): Promise<TradeResult> {
  const chainId = opts.chainId ?? session.chainId;
  if (chainId === SOLANA) {
    return buyTokenV2(session, opts);
  }
  const result = await session.sdk.trading.buy(
    session.walletAddress,
    opts.amount,
    opts.tokenAddress,
    chainId,
    session.tradingPrivateKey
  );
  return result as TradeResult;
}

/**
 * Execute a market sell.
 * Solana: uses /sell_v2 (handles Token2022 + Raydium LaunchLab, async+poll).
 * EVM: uses SDK trading.sell (synchronous).
 */
export async function sellToken(
  session: GDEXSession,
  opts: SellOptions
): Promise<TradeResult> {
  const chainId = opts.chainId ?? session.chainId;
  if (chainId === SOLANA) {
    return sellTokenV2(session, opts);
  }
  const result = await session.sdk.trading.sell(
    session.walletAddress,
    opts.amount,
    opts.tokenAddress,
    chainId,
    session.tradingPrivateKey
  );
  return result as TradeResult;
}

/**
 * Create a limit buy order.
 * SDK signature: createLimitBuy(address, amount, triggerPrice, profitPercent, lossPercent, tokenAddress, chainId, privateKey)
 */
export async function createLimitBuyOrder(
  session: GDEXSession,
  opts: LimitBuyOrderOptions
): Promise<TradeResult> {
  const chainId = opts.chainId ?? session.chainId;
  const result = await session.sdk.trading.createLimitBuy(
    session.walletAddress,
    opts.amount,
    opts.triggerPrice,
    opts.profitPercent ?? 0,
    opts.lossPercent ?? 0,
    opts.tokenAddress,
    chainId,
    session.tradingPrivateKey
  );
  return result as TradeResult;
}

/**
 * Create a limit sell order.
 * SDK signature: createLimitSell(address, amount, triggerPrice, tokenAddress, chainId, privateKey)
 */
export async function createLimitSellOrder(
  session: GDEXSession,
  opts: LimitOrderOptions
): Promise<TradeResult> {
  const chainId = opts.chainId ?? session.chainId;
  const result = await session.sdk.trading.createLimitSell(
    session.walletAddress,
    opts.amount,
    opts.triggerPrice,
    opts.tokenAddress,
    chainId,
    session.tradingPrivateKey
  );
  return result as TradeResult;
}

/**
 * Get orders for the authenticated user.
 */
export async function getOrders(
  session: GDEXSession,
  chainId?: number
): Promise<any> {
  return session.sdk.trading.getOrders(
    session.walletAddress,
    chainId ?? session.chainId,
    session.encryptedSessionKey
  );
}
