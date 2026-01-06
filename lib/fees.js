import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const FEES_FILE = path.join(DATA_DIR, 'fees.json');

// Fee configuration
export const FEE_CONFIG = {
  launchFee: '0.01', // ETH charged per launch
  tradingFeePercent: 1, // 1% of each trade
  creatorSharePercent: 50 // Creator gets 50% of trading fees
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  }
}

function loadFees() {
  ensureDataDir();
  if (!fs.existsSync(FEES_FILE)) {
    return { records: [], totals: {} };
  }
  const data = fs.readFileSync(FEES_FILE, 'utf8');
  return JSON.parse(data);
}

function saveFees(fees) {
  ensureDataDir();
  fs.writeFileSync(FEES_FILE, JSON.stringify(fees, null, 2), { mode: 0o600 });
}

export function recordFee(feeRecord) {
  const fees = loadFees();

  const record = {
    id: crypto.randomUUID(),
    userId: feeRecord.userId,
    userAddress: feeRecord.userAddress,
    type: feeRecord.type, // 'launch' | 'trade'
    amount: feeRecord.amount,
    coinId: feeRecord.coinId,
    coinSymbol: feeRecord.coinSymbol,
    transactionHash: feeRecord.transactionHash || null,
    timestamp: new Date().toISOString()
  };

  fees.records.push(record);

  // Update totals
  if (!fees.totals[feeRecord.userId]) {
    fees.totals[feeRecord.userId] = {
      totalEarned: '0',
      launchFees: '0',
      tradingFees: '0',
      coinCount: 0
    };
  }

  const userTotals = fees.totals[feeRecord.userId];
  const amount = parseFloat(feeRecord.amount);

  userTotals.totalEarned = (parseFloat(userTotals.totalEarned) + amount).toString();

  if (feeRecord.type === 'launch') {
    userTotals.launchFees = (parseFloat(userTotals.launchFees) + amount).toString();
    userTotals.coinCount++;
  } else if (feeRecord.type === 'trade') {
    userTotals.tradingFees = (parseFloat(userTotals.tradingFees) + amount).toString();
  }

  saveFees(fees);
  return record;
}

export function getMyFees(userId) {
  const fees = loadFees();

  const userRecords = fees.records.filter(r => r.userId === userId);
  const userTotals = fees.totals[userId] || {
    totalEarned: '0',
    launchFees: '0',
    tradingFees: '0',
    coinCount: 0
  };

  // Group by coin
  const byCoin = {};
  for (const record of userRecords) {
    if (!byCoin[record.coinId]) {
      byCoin[record.coinId] = {
        coinId: record.coinId,
        symbol: record.coinSymbol,
        launchFee: '0',
        tradingFees: '0',
        totalEarned: '0'
      };
    }

    const amount = parseFloat(record.amount);
    if (record.type === 'launch') {
      byCoin[record.coinId].launchFee = record.amount;
    } else {
      byCoin[record.coinId].tradingFees = (
        parseFloat(byCoin[record.coinId].tradingFees) + amount
      ).toString();
    }
    byCoin[record.coinId].totalEarned = (
      parseFloat(byCoin[record.coinId].totalEarned) + amount
    ).toString();
  }

  return {
    success: true,
    summary: {
      totalEarned: userTotals.totalEarned,
      totalEarnedUnit: 'ETH',
      launchFees: userTotals.launchFees,
      tradingFees: userTotals.tradingFees,
      coinsLaunched: userTotals.coinCount
    },
    breakdown: Object.values(byCoin),
    recentTransactions: userRecords.slice(-10).reverse()
  };
}

export function getFeeConfig() {
  return FEE_CONFIG;
}

/**
 * Get fees earned for a specific coin
 */
export function getFeesByCoinId(coinId) {
  const fees = loadFees();
  const coinRecords = fees.records.filter(r => r.coinId === coinId);

  let totalEarned = 0;
  let tradingFees = 0;
  let launchFee = 0;

  for (const record of coinRecords) {
    const amount = parseFloat(record.amount);
    totalEarned += amount;
    if (record.type === 'trade') {
      tradingFees += amount;
    } else if (record.type === 'launch') {
      launchFee = amount;
    }
  }

  return {
    totalEarned: totalEarned.toString(),
    tradingFees: tradingFees.toString(),
    launchFee: launchFee.toString(),
    unit: 'ETH'
  };
}
