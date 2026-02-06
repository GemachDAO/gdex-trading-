import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

export interface Config {
  apiUrl: string;
  apiKey: string;
  walletAddress: string;
  privateKey: string;
  sessionKey: string;
  defaultChainId: number;
}

export function loadConfig(): Config {
  const apiUrl = process.env.GDEX_API_URL || 'https://trade-api.gemach.io/v1';
  const apiKey = process.env.GDEX_API_KEY || '';
  const walletAddress = process.env.WALLET_ADDRESS || '';
  const privateKey = process.env.PRIVATE_KEY || '';
  const sessionKey = process.env.SESSION_KEY || '';
  const defaultChainId = parseInt(process.env.DEFAULT_CHAIN_ID || '622112261', 10);

  return { apiUrl, apiKey, walletAddress, privateKey, sessionKey, defaultChainId };
}

export function validateConfig(config: Config): string[] {
  const errors: string[] = [];

  if (!config.walletAddress) {
    errors.push('WALLET_ADDRESS is required. Set it in your .env file.');
  }
  if (!config.privateKey) {
    errors.push('PRIVATE_KEY is required. Set it in your .env file.');
  }

  return errors;
}

/** Human-readable chain names */
export const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum',
  8453: 'Base',
  56: 'BSC',
  622112261: 'Solana',
  146: 'Sonic',
  1313131213: 'Sui',
  6900: 'Nibiru',
  80094: 'Berachain',
  10: 'Optimism',
  42161: 'Arbitrum',
  252: 'Fraxtal',
};
