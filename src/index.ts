import { createSDK } from 'gdex.pro-sdk';
import { loadConfig, validateConfig, CHAIN_NAMES } from './config';

async function main() {
  console.log('=== GDEX Trading Bot ===\n');

  // ── Load & validate config ──────────────────────────────────────────
  const config = loadConfig();
  const errors = validateConfig(config);

  if (errors.length > 0) {
    console.error('Configuration errors:');
    errors.forEach((e) => console.error(`  - ${e}`));
    console.error('\nCopy .env.example to .env and fill in your values.');
    process.exit(1);
  }

  const chainName = CHAIN_NAMES[config.defaultChainId] ?? `Chain ${config.defaultChainId}`;
  console.log(`Chain   : ${chainName} (${config.defaultChainId})`);
  console.log(`Wallet  : ${config.walletAddress.slice(0, 6)}...${config.walletAddress.slice(-4)}`);
  console.log();

  // ── Initialise SDK ──────────────────────────────────────────────────
  const sdk = createSDK(config.apiUrl, {
    apiKey: config.apiKey || undefined,
  });

  // ── 1. Trending tokens ─────────────────────────────────────────────
  try {
    console.log('Fetching trending tokens...');
    const trending = await sdk.tokens.getTrendingTokens(10);
    console.log(`\nTop ${trending.length} Trending Tokens:`);
    trending.forEach((token: any, i: number) => {
      console.log(
        `  ${i + 1}. ${token.symbol ?? token.name ?? 'Unknown'} — $${token.priceUsd ?? '?'}`
      );
    });
  } catch (err: any) {
    console.error('Failed to fetch trending tokens:', err.message);
  }

  // ── 2. Native prices ───────────────────────────────────────────────
  try {
    console.log('\nFetching native prices...');
    const prices = await sdk.tokens.getNativePrices();
    if (prices && prices.length > 0) {
      console.log('Native Token Prices:');
      prices.forEach((p) => {
        const name = CHAIN_NAMES[p.chainId] ?? `Chain ${p.chainId}`;
        console.log(`  ${name}: $${p.nativePrice}`);
      });
    }
  } catch (err: any) {
    console.error('Failed to fetch native prices:', err.message);
  }

  // ── 3. User holdings (if session key provided) ─────────────────────
  if (config.sessionKey) {
    try {
      console.log('\nFetching holdings...');
      const holdings = await sdk.user.getHoldingsList(
        config.walletAddress,
        config.defaultChainId,
        config.sessionKey
      );

      if (holdings.length === 0) {
        console.log('  No holdings found on this chain.');
      } else {
        console.log(`Holdings (${chainName}):`);
        holdings.forEach((h: any) => {
          console.log(`  ${h.symbol}: ${h.balance} — $${h.priceUsd ?? '?'}`);
        });
      }
    } catch (err: any) {
      console.error('Failed to fetch holdings:', err.message);
    }
  }

  console.log('\n=== Done ===');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
