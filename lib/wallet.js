import { ethers } from 'ethers';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const WALLETS_FILE = path.join(DATA_DIR, 'wallets.json');

// Encryption settings
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const ITERATIONS = 100000;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  }
}

function loadWallets() {
  ensureDataDir();
  if (!fs.existsSync(WALLETS_FILE)) {
    return {};
  }
  const data = fs.readFileSync(WALLETS_FILE, 'utf8');
  return JSON.parse(data);
}

function saveWallets(wallets) {
  ensureDataDir();
  fs.writeFileSync(WALLETS_FILE, JSON.stringify(wallets, null, 2), { mode: 0o600 });
}

function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, 'sha256');
}

function encrypt(text, password) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKey(password, salt);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  return {
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    encrypted
  };
}

function decrypt(encryptedData, password) {
  const salt = Buffer.from(encryptedData.salt, 'hex');
  const iv = Buffer.from(encryptedData.iv, 'hex');
  const tag = Buffer.from(encryptedData.tag, 'hex');
  const key = deriveKey(password, salt);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Create a new wallet for a user
 */
export async function createWallet(userId, password) {
  const wallets = loadWallets();

  if (wallets[userId]) {
    return {
      success: false,
      error: 'Wallet already exists for this user. Use "get" to retrieve it.'
    };
  }

  // Generate new Ethereum wallet
  const wallet = ethers.Wallet.createRandom();

  // Encrypt the private key
  const encryptedKey = encrypt(wallet.privateKey, password);

  // Store wallet data
  wallets[userId] = {
    address: wallet.address,
    encryptedKey,
    createdAt: new Date().toISOString()
  };

  saveWallets(wallets);

  return {
    success: true,
    address: wallet.address,
    message: 'Wallet created! This is where your fees from coin launches will be sent.',
    warning: 'CRITICAL: Your password is the ONLY way to access this wallet. There is NO recovery option. If you lose your password, your wallet and all funds are permanently lost!'
  };
}

/**
 * Get wallet address (no password needed)
 */
export function getWalletAddress(userId) {
  const wallets = loadWallets();

  if (!wallets[userId]) {
    return {
      success: false,
      error: 'No wallet found. Create one first with action="create" and a password. This wallet is where your fees from coin launches will be sent. Choose a password you will NEVER forget - there is no recovery option!'
    };
  }

  return {
    success: true,
    address: wallets[userId].address,
    createdAt: wallets[userId].createdAt,
    note: 'This is where your fees from coin launches are sent.'
  };
}

/**
 * Get wallet balance
 */
export async function getBalance(userId, rpcUrl = 'https://eth.llamarpc.com') {
  const wallets = loadWallets();

  if (!wallets[userId]) {
    return {
      success: false,
      error: 'No wallet found'
    };
  }

  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const balance = await provider.getBalance(wallets[userId].address);

    return {
      success: true,
      address: wallets[userId].address,
      balance: ethers.formatEther(balance),
      unit: 'ETH'
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to get balance: ${err.message}`
    };
  }
}

/**
 * Sign a message with the user's wallet
 */
export async function signMessage(userId, password, message) {
  const wallets = loadWallets();

  if (!wallets[userId]) {
    return {
      success: false,
      error: 'No wallet found'
    };
  }

  try {
    const privateKey = decrypt(wallets[userId].encryptedKey, password);
    const wallet = new ethers.Wallet(privateKey);
    const signature = await wallet.signMessage(message);

    return {
      success: true,
      address: wallet.address,
      message,
      signature
    };
  } catch (err) {
    if (err.message.includes('Unsupported state') || err.message.includes('auth')) {
      return {
        success: false,
        error: 'Invalid password'
      };
    }
    return {
      success: false,
      error: `Signing failed: ${err.message}`
    };
  }
}

/**
 * Get decrypted wallet instance (for internal use)
 */
export function getDecryptedWallet(userId, password) {
  const wallets = loadWallets();

  if (!wallets[userId]) {
    return {
      success: false,
      error: 'No wallet found'
    };
  }

  try {
    const privateKey = decrypt(wallets[userId].encryptedKey, password);
    const wallet = new ethers.Wallet(privateKey);

    return {
      success: true,
      wallet,
      address: wallet.address
    };
  } catch (err) {
    return {
      success: false,
      error: 'Invalid password'
    };
  }
}

/**
 * Check if user has a wallet
 */
export function hasWallet(userId) {
  const wallets = loadWallets();
  return !!wallets[userId];
}

/**
 * Transfer ETH to another address
 * WARNING: This is irreversible!
 */
export async function transfer(userId, password, toAddress, amount, rpcUrl = 'https://eth.llamarpc.com') {
  const wallets = loadWallets();

  if (!wallets[userId]) {
    return {
      success: false,
      error: 'No wallet found'
    };
  }

  // Validate address
  if (!ethers.isAddress(toAddress)) {
    return {
      success: false,
      error: 'Invalid destination address'
    };
  }

  try {
    const privateKey = decrypt(wallets[userId].encryptedKey, password);
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

    // Get current balance
    const balance = await provider.getBalance(wallet.address);
    const amountWei = ethers.parseEther(amount);

    if (balance < amountWei) {
      return {
        success: false,
        error: `Insufficient balance. You have ${ethers.formatEther(balance)} ETH but tried to send ${amount} ETH`
      };
    }

    // Send transaction
    const tx = await wallet.sendTransaction({
      to: toAddress,
      value: amountWei
    });

    // Wait for confirmation
    const receipt = await tx.wait();

    return {
      success: true,
      transactionHash: receipt.hash,
      from: wallet.address,
      to: toAddress,
      amount: amount,
      unit: 'ETH',
      blockNumber: receipt.blockNumber
    };
  } catch (err) {
    if (err.message.includes('Unsupported state') || err.message.includes('auth')) {
      return {
        success: false,
        error: 'Invalid password'
      };
    }
    return {
      success: false,
      error: `Transfer failed: ${err.message}`
    };
  }
}

/**
 * Collect accumulated fees from the fee contract
 * If user has no ETH balance, we call API to collect on their behalf
 * If user has ETH, they call the contract directly (they pay gas)
 */
export async function collectFees(userId, password, apiBaseUrl, rpcUrl = 'https://eth.llamarpc.com') {
  const wallets = loadWallets();

  if (!wallets[userId]) {
    return {
      success: false,
      error: 'No wallet found'
    };
  }

  try {
    const privateKey = decrypt(wallets[userId].encryptedKey, password);
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    const balance = await provider.getBalance(wallet.address);

    if (balance === 0n) {
      // No ETH for gas - call API to collect on their behalf
      const message = `Collect fees for ${wallet.address}\nTimestamp: ${Date.now()}`;
      const signature = await wallet.signMessage(message);

      const response = await fetch(`${apiBaseUrl}/api/collect-fees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: wallet.address,
          message,
          signature
        })
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: result.error || 'API request failed'
        };
      }

      return {
        success: true,
        method: 'api',
        message: 'Fees collected via API (we paid the gas for you)',
        ...result
      };
    } else {
      // User has ETH - they call the contract directly
      // FeeHook contract ABI for withdraw function
      const FEE_HOOK_ABI = [
        'function claimFees(address recipient) external returns (uint256)'
      ];

      // Get fee hook address from API
      const configResponse = await fetch(`${apiBaseUrl}/api/config`);
      if (!configResponse.ok) {
        return {
          success: false,
          error: 'Failed to fetch contract config from API'
        };
      }
      const config = await configResponse.json();

      if (!config.feeHookAddress) {
        return {
          success: false,
          error: 'Fee hook contract address not configured'
        };
      }

      const feeHook = new ethers.Contract(config.feeHookAddress, FEE_HOOK_ABI, wallet);
      const tx = await feeHook.claimFees(wallet.address);
      const receipt = await tx.wait();

      return {
        success: true,
        method: 'direct',
        message: 'Fees collected directly from contract (you paid gas)',
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber
      };
    }
  } catch (err) {
    if (err.message.includes('Unsupported state') || err.message.includes('auth')) {
      return {
        success: false,
        error: 'Invalid password'
      };
    }
    return {
      success: false,
      error: `Fee collection failed: ${err.message}`
    };
  }
}
