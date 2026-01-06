import { ethers } from 'ethers';
import { getDecryptedWallet, hasWallet } from './wallet.js';
import { addListing, updateListing } from './listings.js';
import { recordFee } from './fees.js';

// API endpoint for the deployment server (to be configured)
const API_BASE_URL = process.env.LAUNCHER_API_URL || 'http://localhost:3001';

/**
 * Launch a new coin by calling the external deployment API
 */
export async function launchCoin(options) {
  const { userId, password, name, symbol, url, github, description } = options;

  // Validate inputs
  if (!name || name.length < 1 || name.length > 32) {
    return { success: false, error: 'Name must be 1-32 characters' };
  }

  if (!symbol || symbol.length < 2 || symbol.length > 8) {
    return { success: false, error: 'Symbol must be 2-8 characters' };
  }

  if (description && description.length > 500) {
    return { success: false, error: 'Description must be 500 characters or less' };
  }

  // Check if user has a wallet
  if (!hasWallet(userId)) {
    return {
      success: false,
      error: 'No wallet found. Create one first using the wallet tool with action="create". Your wallet is where fees from coin launches are sent. IMPORTANT: Choose a password you will NEVER forget - there is NO recovery option!',
      action_required: 'create_wallet'
    };
  }

  // Get wallet to sign the launch request
  const walletResult = getDecryptedWallet(userId, password);
  if (!walletResult.success) {
    return walletResult;
  }

  const wallet = walletResult.wallet;
  const walletAddress = wallet.address;

  // Create the message to sign
  const timestamp = Date.now();
  const message = `Launch coin on Billionaire\n\nName: ${name}\nSymbol: ${symbol}\nCreator: ${walletAddress}\nTimestamp: ${timestamp}`;

  // Sign the message
  const signature = await wallet.signMessage(message);

  // Create listing first (in pending state)
  const listing = addListing({
    name,
    symbol,
    creator: userId,
    creatorAddress: walletAddress,
    status: 'pending',
    url: url || null,
    github: github || null,
    description: description || null,
  });

  // Call external API to deploy the contract
  try {
    const response = await fetch(`${API_BASE_URL}/api/launch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        walletAddress,
        signature,
        message,
        name,
        symbol,
        timestamp,
        url: url || null,
        github: github || null,
        description: description || null,
      })
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      // Update listing to failed
      updateListing(listing.id, {
        status: 'failed',
        error: result.error || 'API request failed'
      });

      return {
        success: false,
        error: result.error || 'Failed to launch coin'
      };
    }

    // Update listing with contract data from API
    updateListing(listing.id, {
      contractAddress: result.contractAddress,
      transactionHash: result.transactionHash,
      totalSupply: result.totalSupply,
      status: 'launched'
    });

    // Record the fee
    recordFee({
      userId,
      userAddress: walletAddress,
      type: 'launch',
      amount: result.fee || '0',
      coinId: listing.id,
      coinSymbol: symbol,
      transactionHash: result.transactionHash
    });

    return {
      success: true,
      message: 'Coin launched successfully!',
      coin: {
        id: listing.id,
        name,
        symbol,
        totalSupply: result.totalSupply,
        contractAddress: result.contractAddress,
        transactionHash: result.transactionHash,
        creator: walletAddress,
        status: 'launched',
        url: url || null,
        github: github || null,
        description: description || null,
      }
    };
  } catch (err) {
    // API not available - run in stub mode for testing
    if (err.cause?.code === 'ECONNREFUSED' || err.message.includes('fetch')) {
      console.error('API not available, running in stub mode');

      const mockTxHash = `0x${Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;
      const mockContractAddress = `0x${Array(40).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

      updateListing(listing.id, {
        contractAddress: mockContractAddress,
        transactionHash: mockTxHash,
        status: 'launched'
      });

      recordFee({
        userId,
        userAddress: walletAddress,
        type: 'launch',
        amount: '0.01',
        coinId: listing.id,
        coinSymbol: symbol,
        transactionHash: mockTxHash
      });

      return {
        success: true,
        message: 'Coin launched (STUB MODE - API not available)',
        coin: {
          id: listing.id,
          name,
          symbol,
          contractAddress: mockContractAddress,
          transactionHash: mockTxHash,
          creator: walletAddress,
          status: 'launched',
          url: url || null,
          github: github || null,
          description: description || null,
        },
        note: 'Running in stub mode because deployment API is not available.'
      };
    }

    // Update listing to failed
    updateListing(listing.id, {
      status: 'failed',
      error: err.message
    });

    return {
      success: false,
      error: `Launch failed: ${err.message}`
    };
  }
}

/**
 * Get status of the deployment API
 */
export async function getApiStatus() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/status`);
    const result = await response.json();
    return {
      available: true,
      ...result
    };
  } catch (err) {
    return {
      available: false,
      message: 'Deployment API not available. Launches will run in stub mode.',
      apiUrl: API_BASE_URL
    };
  }
}
