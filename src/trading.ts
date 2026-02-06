import { GDEXSession } from './auth';

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
}

export interface SellOptions {
  tokenAddress: string;
  /** Amount in smallest unit */
  amount: string;
  chainId?: number;
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
// Trading functions
// ---------------------------------------------------------------------------

/**
 * Execute a market buy using the session's trading private key.
 *
 * @example
 * ```ts
 * const result = await buyToken(session, {
 *   tokenAddress: 'So11111111111111111111111111111111111111112',
 *   amount: formatSolAmount(0.005), // 0.005 SOL
 * });
 * ```
 */
export async function buyToken(
  session: GDEXSession,
  opts: BuyOptions
): Promise<TradeResult> {
  const chainId = opts.chainId ?? session.chainId;
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
 * Execute a market sell using the session's trading private key.
 */
export async function sellToken(
  session: GDEXSession,
  opts: SellOptions
): Promise<TradeResult> {
  const chainId = opts.chainId ?? session.chainId;
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
