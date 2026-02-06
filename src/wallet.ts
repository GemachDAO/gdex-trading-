import { Keypair } from '@solana/web3.js';
import { Wallet } from 'ethers';
import bs58 from 'bs58';
import fs from 'fs';
import path from 'path';

export interface GeneratedWallet {
  address: string;
  privateKey: string;
  chainType: 'solana' | 'evm';
}

// Chain IDs that use Solana wallets
const SOLANA_CHAIN_IDS = [622112261];

// Chain IDs that use EVM wallets
const EVM_CHAIN_IDS = [1, 8453, 56, 146, 6900, 80094, 10, 42161, 252, 1329];

export function isSolanaChain(chainId: number): boolean {
  return SOLANA_CHAIN_IDS.includes(chainId);
}

export function isEVMChain(chainId: number): boolean {
  return EVM_CHAIN_IDS.includes(chainId);
}

/**
 * Generate a new Solana wallet
 */
export function generateSolanaWallet(): GeneratedWallet {
  const keypair = Keypair.generate();
  const address = keypair.publicKey.toBase58();
  const privateKey = bs58.encode(keypair.secretKey);

  return {
    address,
    privateKey,
    chainType: 'solana'
  };
}

/**
 * Generate a new EVM wallet (Ethereum, Base, BSC, etc.)
 */
export function generateEVMWallet(): GeneratedWallet {
  const wallet = Wallet.createRandom();

  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    chainType: 'evm'
  };
}

/**
 * Generate a wallet based on chain ID
 */
export function generateWallet(chainId: number): GeneratedWallet {
  if (isSolanaChain(chainId)) {
    return generateSolanaWallet();
  } else {
    return generateEVMWallet();
  }
}

/**
 * Save wallet credentials to .env file
 */
export function saveWalletToEnv(wallet: GeneratedWallet, envPath?: string): boolean {
  const filePath = envPath || path.resolve(__dirname, '..', '.env');

  try {
    let envContent = '';

    if (fs.existsSync(filePath)) {
      envContent = fs.readFileSync(filePath, 'utf-8');
    }

    // Update or add WALLET_ADDRESS
    if (envContent.includes('WALLET_ADDRESS=')) {
      envContent = envContent.replace(
        /WALLET_ADDRESS=.*/,
        `WALLET_ADDRESS=${wallet.address}`
      );
    } else {
      envContent += `\nWALLET_ADDRESS=${wallet.address}`;
    }

    // Update or add PRIVATE_KEY
    if (envContent.includes('PRIVATE_KEY=')) {
      envContent = envContent.replace(
        /PRIVATE_KEY=.*/,
        `PRIVATE_KEY=${wallet.privateKey}`
      );
    } else {
      envContent += `\nPRIVATE_KEY=${wallet.privateKey}`;
    }

    fs.writeFileSync(filePath, envContent);
    return true;
  } catch (err) {
    console.error('Failed to save wallet to .env:', err);
    return false;
  }
}

/**
 * Display wallet information
 */
export function displayWalletInfo(wallet: GeneratedWallet): void {
  console.log('\n  ╔═══════════════════════════════════════════════════════════╗');
  console.log('  ║              NEW WALLET GENERATED                         ║');
  console.log('  ╠═══════════════════════════════════════════════════════════╣');
  console.log(`  ║  Type: ${wallet.chainType.toUpperCase().padEnd(50)}║`);
  console.log('  ╠═══════════════════════════════════════════════════════════╣');
  console.log('  ║  Address:                                                 ║');
  console.log(`  ║  ${wallet.address.padEnd(56)}║`);
  console.log('  ╠═══════════════════════════════════════════════════════════╣');
  console.log('  ║  Private Key:                                             ║');

  // Split private key into multiple lines if too long
  const pk = wallet.privateKey;
  if (pk.length > 54) {
    console.log(`  ║  ${pk.slice(0, 54)}║`);
    console.log(`  ║  ${pk.slice(54).padEnd(56)}║`);
  } else {
    console.log(`  ║  ${pk.padEnd(56)}║`);
  }

  console.log('  ╠═══════════════════════════════════════════════════════════╣');
  console.log('  ║  IMPORTANT: Save these credentials securely!              ║');
  console.log('  ║  This wallet has been saved to your .env file.            ║');
  console.log('  ╚═══════════════════════════════════════════════════════════╝\n');
}

/**
 * Get Solana keypair from private key string
 */
export function getSolanaKeypair(privateKey: string): Keypair {
  const secretKey = bs58.decode(privateKey);
  return Keypair.fromSecretKey(secretKey);
}

/**
 * Get EVM wallet from private key string
 */
export function getEVMWallet(privateKey: string): Wallet {
  return new Wallet(privateKey);
}
