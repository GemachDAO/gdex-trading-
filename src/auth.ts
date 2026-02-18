// Polyfill WebSocket for Node.js (required by SDK internals)
import WebSocket from 'ws';
(globalThis as any).WebSocket = WebSocket;

import { createSDK, CryptoUtils } from 'gdex.pro-sdk';
import { ethers } from 'ethers';
import { loadConfig, Config, REQUIRED_HEADERS } from './config';
import { generateEVMWallet, saveWalletToEnv } from './wallet';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Bundles everything needed for authenticated GDEX operations. */
export interface GDEXSession {
  /** Initialized SDK instance */
  sdk: ReturnType<typeof createSDK>;
  /** EVM wallet address (0x-prefixed) */
  walletAddress: string;
  /** Session key pair from CryptoUtils.getSessionKey() */
  sessionKeyPair: { privateKey: Buffer; publicKey: Uint8Array };
  /** Encrypted session public key (for authenticated GET requests) */
  encryptedSessionKey: string;
  /** Hex-encoded session private key (for trading POST requests) */
  tradingPrivateKey: string;
  /** Effective API key (first of comma-separated list) */
  apiKey: string;
  /** Chain ID used during login */
  chainId: number;
}

export interface CreateSessionOptions {
  /** API base URL. Defaults to config or https://trade-api.gemach.io/v1 */
  apiUrl?: string;
  /** API key (may be comma-separated; first key is used) */
  apiKey?: string;
  /** EVM wallet address (0x-prefixed) */
  walletAddress?: string;
  /** EVM wallet private key (for login signing only) */
  privateKey?: string;
  /** Chain ID. Defaults to Solana (622112261) */
  chainId?: number;
  /** Referral code */
  refCode?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Split comma-separated API keys and return the first one trimmed.
 * The GDEX config sometimes stores multiple keys separated by commas.
 */
export function getEffectiveApiKey(apiKey: string): string {
  return apiKey.split(',')[0].trim();
}

/**
 * Inject required browser-like Origin/Referer headers into the SDK's
 * internal axios instance.  Without these the GDEX API returns 403
 * "Access denied: Non-browser clients not allowed".
 */
function patchSDKHeaders(sdk: ReturnType<typeof createSDK>): void {
  try {
    const httpClient = (sdk as any).httpClient;
    if (httpClient?.getClient) {
      const axios = httpClient.getClient();
      Object.assign(axios.defaults.headers.common, REQUIRED_HEADERS);
    } else if (httpClient?.client?.defaults) {
      Object.assign(httpClient.client.defaults.headers.common, REQUIRED_HEADERS);
    }
  } catch {
    // SDK internals changed — headers won't be set, calls may 403
    console.warn('[gdex] Warning: Could not patch SDK headers. API calls may fail with 403.');
  }
}

/**
 * Create and return an initialized SDK instance.
 * Handles comma-separated API key extraction and injects required
 * Origin/Referer headers automatically.
 */
export function initSDK(apiUrl: string, apiKey?: string): ReturnType<typeof createSDK> {
  const effectiveKey = apiKey ? getEffectiveApiKey(apiKey) : undefined;
  const sdk = createSDK(apiUrl, { apiKey: effectiveKey });
  patchSDKHeaders(sdk);
  return sdk;
}

// ---------------------------------------------------------------------------
// Session creation
// ---------------------------------------------------------------------------

/**
 * One-call login that returns a fully authenticated GDEXSession.
 *
 * Uses the proven EIP-191 personal-message signing flow:
 *   1. Generate session key pair
 *   2. Generate nonce
 *   3. Sign login message with wallet private key (ethers.Wallet.signMessage)
 *   4. Call sdk.user.login()
 *   5. Encrypt session public key with API key for authenticated queries
 *
 * @example
 * ```ts
 * const session = await createAuthenticatedSession({
 *   apiKey: 'your-api-key',
 *   walletAddress: '0x...',
 *   privateKey: '0x...',
 * });
 * ```
 */
export async function createAuthenticatedSession(
  opts: CreateSessionOptions = {}
): Promise<GDEXSession> {
  // Merge with .env config for any missing values
  const envConfig = loadConfig();
  const apiUrl = opts.apiUrl ?? envConfig.apiUrl;
  const rawApiKey = opts.apiKey ?? envConfig.apiKey;
  const walletAddress = opts.walletAddress ?? envConfig.walletAddress;
  const privateKey = opts.privateKey ?? envConfig.privateKey;
  const chainId = opts.chainId ?? envConfig.defaultChainId;
  const refCode = opts.refCode ?? '';

  if (!rawApiKey) throw new Error('API key is required. Set GDEX_API_KEY in .env or pass apiKey option.');
  if (!walletAddress) throw new Error('Wallet address is required. Set WALLET_ADDRESS in .env or pass walletAddress option.');
  if (!privateKey) throw new Error('Private key is required for login. Set PRIVATE_KEY in .env or pass privateKey option.');

  const apiKey = getEffectiveApiKey(rawApiKey);

  // 1. Initialise SDK
  const sdk = initSDK(apiUrl, apiKey);

  // 2. Generate session key pair
  const sessionKeyPair = CryptoUtils.getSessionKey();
  const publicKeyHex = Buffer.from(sessionKeyPair.publicKey).toString('hex');
  const publicKeyWith0x = '0x' + publicKeyHex;

  // 3. Generate nonce
  const nonce = CryptoUtils.generateUniqueNumber();

  // 4. Sign with EIP-191 personal message
  const wallet = new ethers.Wallet(privateKey);
  const messageSign = `By signing, you agree to GDEX Trading Terms of Use and Privacy Policy. Your GDEX log in message: ${walletAddress.toLowerCase()} ${nonce} ${publicKeyHex}`;
  const signature = await wallet.signMessage(messageSign);

  // 5. Login
  const userInfo = await sdk.user.login(
    walletAddress,
    nonce,
    publicKeyWith0x,
    signature,
    refCode,
    chainId
  );

  if (!userInfo || !(userInfo as any).address) {
    throw new Error('Login failed: API returned no valid user info');
  }

  // 6. Encrypt session public key for authenticated GET queries
  const encryptedSessionKey = CryptoUtils.encrypt(publicKeyWith0x, apiKey);

  // 7. The session key's private key is used for trading POST requests
  const tradingPrivateKey = sessionKeyPair.privateKey.toString('hex');

  return {
    sdk,
    walletAddress,
    sessionKeyPair,
    encryptedSessionKey,
    tradingPrivateKey,
    apiKey,
    chainId,
  };
}

/**
 * Ensure the config has a valid EVM wallet, auto-generating one if needed.
 * Returns updated config. Useful for CLI/test-suite bootstrap.
 */
export function ensureEVMWallet(config: Config): Config {
  const needsNewWallet =
    !config.privateKey ||
    !config.walletAddress ||
    config.walletAddress === '0x0000000000000000000000000000000000000001' ||
    !config.walletAddress.startsWith('0x');

  if (!needsNewWallet) return config;

  if (config.walletAddress && !config.walletAddress.startsWith('0x')) {
    console.log('  Detected non-EVM wallet. GDEX SDK requires EVM (secp256k1) keys for all chains.');
    console.log('  Generating a new EVM wallet for SDK authentication...\n');
  } else {
    console.log('  No wallet configured. Auto-generating a new EVM wallet...\n');
  }

  const wallet = generateEVMWallet();
  const saved = saveWalletToEnv(wallet);
  if (saved) {
    console.log('  Wallet saved to .env file.\n');
  }

  return { ...config, walletAddress: wallet.address, privateKey: wallet.privateKey };
}
