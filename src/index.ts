// GDEX Trading Bot — public API
//
// Import individual modules:
//   import { createAuthenticatedSession, GDEXSession } from 'gdex-trading/auth';
//   import { buyToken, sellToken } from 'gdex-trading/trading';
//
// Or import everything from the barrel:
//   import { createAuthenticatedSession, buyToken, getTrendingTokens } from 'gdex-trading';

// Auth & session management
export {
  createAuthenticatedSession,
  initSDK,
  getEffectiveApiKey,
  ensureEVMWallet,
  type GDEXSession,
  type CreateSessionOptions,
} from './auth';

// Trading operations
export {
  buyToken,
  sellToken,
  createLimitBuyOrder,
  createLimitSellOrder,
  getOrders,
  formatSolAmount,
  formatEthAmount,
  type TradeResult,
  type BuyOptions,
  type SellOptions,
  type LimitBuyOrderOptions,
  type LimitOrderOptions,
} from './trading';

// Market data
export {
  getTrendingTokens,
  searchTokens,
  getTokenPrice,
  getNewestTokens,
  getNativePrices,
  getXstocks,
  getChartTokenPumpfun,
  getHoldings,
  getUserInfo,
  getWatchList,
  getReferralStats,
} from './market';

// Config & wallet utilities
export { loadConfig, validateConfig, CHAIN_NAMES, REQUIRED_HEADERS, type Config } from './config';
export {
  generateWallet,
  generateEVMWallet,
  generateSolanaWallet,
  saveWalletToEnv,
  isSolanaChain,
  isEVMChain,
  type GeneratedWallet,
} from './wallet';

// Re-export SDK essentials for convenience
export { createSDK, CryptoUtils } from 'gdex.pro-sdk';

// Test suite
export { runTestSuite } from './test-suite';

// CLI entry point — run test suite when executed directly
if (require.main === module) {
  // Dynamic import to avoid loading test-suite overhead for library consumers
  require('./test-suite').runTestSuite().catch((err: any) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
