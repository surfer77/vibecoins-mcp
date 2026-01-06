import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getFeesByCoinId } from './fees.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const LISTINGS_FILE = path.join(DATA_DIR, 'listings.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  }
}

function loadListings() {
  ensureDataDir();
  if (!fs.existsSync(LISTINGS_FILE)) {
    return [];
  }
  const data = fs.readFileSync(LISTINGS_FILE, 'utf8');
  return JSON.parse(data);
}

function saveListings(listings) {
  ensureDataDir();
  fs.writeFileSync(LISTINGS_FILE, JSON.stringify(listings, null, 2), { mode: 0o600 });
}

export function addListing(listing) {
  const listings = loadListings();

  const newListing = {
    id: crypto.randomUUID(),
    name: listing.name,
    symbol: listing.symbol,
    totalSupply: listing.totalSupply || null,
    creator: listing.creator,
    creatorAddress: listing.creatorAddress,
    contractAddress: listing.contractAddress || null,
    transactionHash: listing.transactionHash || null,
    status: listing.status || 'pending',
    launchDate: new Date().toISOString(),
    url: listing.url || null,
    github: listing.github || null,
    description: listing.description || null,
    stats: {
      holders: 1,
      transactions: 0,
      marketCap: '0',
      price: '0'
    }
  };

  listings.push(newListing);
  saveListings(listings);

  return newListing;
}

function addFeesToListings(listings) {
  return listings.map(listing => ({
    ...listing,
    developerFees: getFeesByCoinId(listing.id)
  }));
}

export function getListings(filter = 'all', userId = null) {
  const listings = loadListings();

  switch (filter) {
    case 'mine':
      if (!userId) {
        return { success: false, error: 'userId required for "mine" filter' };
      }
      return {
        success: true,
        listings: addFeesToListings(listings.filter(l => l.creator === userId))
      };

    case 'top':
      // Sort by market cap (would be real data in production)
      const sorted = [...listings].sort((a, b) => {
        return parseFloat(b.stats.marketCap) - parseFloat(a.stats.marketCap);
      });
      return {
        success: true,
        listings: addFeesToListings(sorted.slice(0, 10))
      };

    case 'all':
    default:
      return {
        success: true,
        listings: addFeesToListings(listings)
      };
  }
}

export function getListingById(id) {
  const listings = loadListings();
  return listings.find(l => l.id === id) || null;
}

export function updateListing(id, updates) {
  const listings = loadListings();
  const index = listings.findIndex(l => l.id === id);

  if (index === -1) {
    return { success: false, error: 'Listing not found' };
  }

  listings[index] = { ...listings[index], ...updates };
  saveListings(listings);

  return { success: true, listing: listings[index] };
}

export function updateListingStats(id, stats) {
  const listings = loadListings();
  const index = listings.findIndex(l => l.id === id);

  if (index === -1) {
    return { success: false, error: 'Listing not found' };
  }

  listings[index].stats = { ...listings[index].stats, ...stats };
  saveListings(listings);

  return { success: true, listing: listings[index] };
}

export function getListingsByCreator(creatorAddress) {
  const listings = loadListings();
  return listings.filter(l => l.creatorAddress === creatorAddress);
}
