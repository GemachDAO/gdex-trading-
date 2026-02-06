import { createSDK } from 'gdex.pro-sdk';
import { GDEXSession } from './auth';

type SDK = ReturnType<typeof createSDK>;

// ---------------------------------------------------------------------------
// Unauthenticated market data (uses raw SDK)
// ---------------------------------------------------------------------------

/** Get trending tokens across all chains. */
export async function getTrendingTokens(sdk: SDK, limit: number = 10): Promise<any[]> {
  return sdk.tokens.getTrendingTokens(limit);
}

/** Search tokens by name or symbol. */
export async function searchTokens(sdk: SDK, query: string, limit: number = 10): Promise<any[]> {
  return sdk.tokens.searchTokens(query, limit);
}

/** Get token price and details. */
export async function getTokenPrice(sdk: SDK, address: string, chainId?: number): Promise<any> {
  return sdk.tokens.getToken(address, chainId);
}

/** Get newest tokens on a specific chain. */
export async function getNewestTokens(
  sdk: SDK,
  chainId: number,
  limit: number = 10
): Promise<any[]> {
  return sdk.tokens.getNewestTokens(chainId, 1, undefined, limit);
}

/** Get native token prices for all chains. */
export async function getNativePrices(sdk: SDK): Promise<any[]> {
  return (await sdk.tokens.getNativePrices()) ?? [];
}

/** Get xstocks tokens. */
export async function getXstocks(sdk: SDK): Promise<any[]> {
  return sdk.tokens.getXstocks();
}

/** Get pump.fun chart data for a Solana token. */
export async function getChartTokenPumpfun(
  sdk: SDK,
  tokenAddress: string,
  interval: number = 3600
): Promise<any> {
  return sdk.tokens.getChartTokenPumpfun(tokenAddress, interval);
}

// ---------------------------------------------------------------------------
// Authenticated user data (uses GDEXSession)
// ---------------------------------------------------------------------------

/** Get user's token holdings on a chain. */
export async function getHoldings(session: GDEXSession, chainId?: number): Promise<any[]> {
  return session.sdk.user.getHoldingsList(
    session.walletAddress,
    chainId ?? session.chainId,
    session.encryptedSessionKey
  );
}

/** Get authenticated user info. */
export async function getUserInfo(session: GDEXSession, chainId?: number): Promise<any> {
  return session.sdk.user.getUserInfo(
    session.walletAddress,
    session.encryptedSessionKey,
    chainId ?? session.chainId
  );
}

/** Get user's watchlist. */
export async function getWatchList(session: GDEXSession, chainId?: number): Promise<any> {
  return session.sdk.user.getWatchList(
    session.walletAddress,
    chainId ?? session.chainId
  );
}

/** Get user's referral stats. */
export async function getReferralStats(session: GDEXSession, chainId?: number): Promise<any> {
  return session.sdk.user.getReferralStats(
    session.walletAddress,
    chainId ?? session.chainId
  );
}
