// Recurring investments service - handles index fund tracking with DCA
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

const CONFIG_PATH = path.join(__dirname, '../data/recurring-investments.json');

/**
 * Returns true for Scotiabank/Fundserv fund codes (e.g. BNS397, BNS381)
 * These are fetched from Globe and Mail Barchart proxy, not Yahoo Finance.
 */
function isCanadianFundCode(symbol) {
  return /^[A-Z]{2,4}\d{3,4}$/.test(symbol);
}

/**
 * Fetch historical NAV data for a Canadian mutual fund code via Globe and Mail Barchart proxy.
 * Returns array of { date, close } sorted ascending. Prices are already in CAD.
 */
async function fetchCanadianFundHistory(symbol, startDate) {
  const ticker = symbol.includes('.') ? symbol : `${symbol}.CF`;
  const startStr = startDate.toISOString().slice(0, 10).replace(/-/g, '');
  const url = `https://globeandmail.pl.barchart.com/proxies/timeseries/queryeod.ashx`;
  const response = await axios.get(url, {
    params: { symbol: ticker, startDate: startStr, maxrecords: 2000, order: 'asc' },
    timeout: 20000,
  });
  // Parse CSV: symbol,date,open,high,low,close,volume
  const lines = response.data.trim().split('\n').filter(l => l && !l.startsWith('symbol'));
  return lines.map(line => {
    const [, date, , , , close] = line.split(',');
    return { date: date.trim(), close: parseFloat(close) };
  }).filter(d => d.close > 0);
}

const { fetchYahooChart } = require('../utils/yahoo-finance');

/**
 * Thin wrapper around fetchYahooChart that returns the shape expected by
 * calculateInvestmentMetrics: { timestamps, closes, isCAD, resolvedSymbol }
 */
async function fetchYahooWithFallback(symbol, period1, period2) {
  const fetched = await fetchYahooChart(symbol, { period1, period2, interval: '1d' }, 15000);
  if (!fetched) return null;
  const result = fetched.data.chart.result[0];
  const closes = result.indicators.quote[0].close || [];
  const isCAD = fetched.resolvedSymbol.endsWith('.TO')
    || fetched.resolvedSymbol.endsWith('.V')
    || fetched.resolvedSymbol.endsWith('.CN');
  return { timestamps: result.timestamp || [], closes, isCAD, resolvedSymbol: fetched.resolvedSymbol };
}

/**
 * Load recurring investments configuration
 */
async function loadConfig() {
  try {
    const data = await fs.readFile(CONFIG_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading recurring investments config:', error);
    return { recurringInvestments: [] };
  }
}

/**
 * Save recurring investments configuration
 */
async function saveConfig(config) {
  try {
    await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error saving recurring investments config:', error);
    return false;
  }
}

/**
 * Clean contribution calculator with no hardcoded symbol overrides.
 * Used for investments that have contributionSegments defined.
 */
function calculateContributionsClean(startDate, endDate, frequency, dayOfWeek, amount) {
  const start = new Date(startDate);
  const end   = new Date(endDate);
  if (start > end) return [];

  const dayMap = {
    'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
    'Thursday': 4, 'Friday': 5, 'Saturday': 6
  };
  const targetDay = dayMap[dayOfWeek] ?? 1; // Default Monday

  let currentDate = new Date(start);
  while (currentDate.getDay() !== targetDay) currentDate.setDate(currentDate.getDate() + 1);

  const intervalDays = frequency === 'weekly' ? 7 : frequency === 'biweekly' ? 14 : 30;
  const contributions = [];
  while (currentDate <= end) {
    contributions.push({ date: new Date(currentDate), amount });
    currentDate.setDate(currentDate.getDate() + intervalDays);
  }
  return contributions;
}

/**
 * Calculate the number of contributions between two dates based on frequency
 * Returns array of contribution objects with date and amount
 */
function calculateContributions(startDate, endDate, frequency, dayOfWeek, recurringAmount, symbol) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const contributions = [];

  // Map day names to JS day numbers (0 = Sunday, 1 = Monday, etc.)
  const dayMap = {
    'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
    'Thursday': 4, 'Friday': 5, 'Saturday': 6
  };

  const targetDay = dayMap[dayOfWeek];

  // Find the first occurrence of the target day on or after start date
  let currentDate = new Date(start);
  while (currentDate.getDay() !== targetDay) {
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Calculate interval based on frequency
  let intervalDays;
  switch (frequency) {
    case 'weekly':
      intervalDays = 7;
      break;
    case 'biweekly':
      intervalDays = 14;
      break;
    case 'monthly':
      intervalDays = 30; // Approximate
      break;
    default:
      intervalDays = 7;
  }

  // Transition date for amount changes (January 12, 2026)
  const transitionDate = new Date('2026-01-12');

  // Special dates - use UTC to avoid timezone issues
  const specialPurchaseDate = new Date(Date.UTC(2026, 0, 9)); // Jan 9, 2026
  const skippedRecurringDate = new Date(Date.UTC(2026, 0, 10)); // Jan 10, 2026

  // Define amount changes for specific symbols
  const amountChanges = {
    'BNS397': { before: 400, after: 152 },   // NASDAQ Index Fund
    'BNS381': { before: 175, after: 152 },   // Canadian Equity Index Fund
    'BNS387': { before: 25,  after: 25  },   // International Equity (unchanged)
  };

  // Generate all contribution dates with appropriate amounts
  while (currentDate <= end) {
    // Compare dates by converting to date-only strings to avoid timezone issues
    const currentDateStr = currentDate.toISOString().split('T')[0];
    const skippedDateStr = skippedRecurringDate.toISOString().split('T')[0];

    // Skip the regular January 10, 2026 contribution for ALL funds
    // (QQQ and XIU.TO had manual purchases on Jan 9, XEF.TO was skipped entirely this week)
    if (currentDateStr === skippedDateStr) {
      currentDate.setDate(currentDate.getDate() + intervalDays);
      continue;
    }

    let contributionAmount = recurringAmount; // Default to original amount

    // Check if this symbol has a defined amount change
    if (amountChanges[symbol]) {
      // Use the appropriate amount based on date
      contributionAmount = currentDate >= transitionDate
        ? amountChanges[symbol].after
        : amountChanges[symbol].before;
    }

    contributions.push({
      date: new Date(currentDate),
      amount: contributionAmount
    });
    currentDate.setDate(currentDate.getDate() + intervalDays);
  }

  // Add special January 9, 2026 manual purchase for NASDAQ and Canadian Equity only
  if (symbol === 'BNS397' || symbol === 'BNS381') {
    if (specialPurchaseDate >= start && specialPurchaseDate <= end) {
      // Insert the special purchase in chronological order
      const specialContribution = {
        date: new Date(specialPurchaseDate),
        amount: 154
      };

      // Find the right position to insert
      let inserted = false;
      for (let i = 0; i < contributions.length; i++) {
        if (contributions[i].date > specialPurchaseDate) {
          contributions.splice(i, 0, specialContribution);
          inserted = true;
          break;
        }
      }

      // If not inserted (either empty array or all dates are before), add at the end or beginning
      if (!inserted) {
        if (contributions.length === 0 || contributions[contributions.length - 1].date < specialPurchaseDate) {
          contributions.push(specialContribution);
        } else {
          contributions.unshift(specialContribution);
        }
      }
    }
  }
  // For BNS387 (International Equity), the entire week of Jan 9-10 was skipped
  // It will resume on Jan 17, 2026 at the regular $25/week rate

  return contributions;
}

/**
 * Calculate total invested and related metrics for a recurring investment
 */
async function calculateInvestmentMetrics(investment) {
  if (!investment.enabled) {
    return {
      ...investment,
      totalInvested: investment.initialAmount,
      contributionCount: 0,
      recurringInvested: 0,
      currentPrice: 0,
      currentValue: 0,
      profitLoss: 0,
      profitLossPercent: 0,
      lastUpdated: new Date().toISOString()
    };
  }

  const today = new Date();
  let contributions;
  if (investment.contributionSegments && investment.contributionSegments.length > 0) {
    // Multi-segment mode: compute per-segment contributions without hardcoded overrides
    contributions = [];
    for (const seg of investment.contributionSegments) {
      const segEnd = new Date(Math.min(new Date(seg.untilDate).getTime(), today.getTime()))
        .toISOString().slice(0, 10);
      const segContribs = calculateContributionsClean(
        seg.startDate, segEnd,
        seg.frequency || investment.frequency,
        seg.dayOfWeek || investment.dayOfWeek,
        seg.amount
      );
      contributions.push(...segContribs);
    }
    contributions.sort((a, b) => a.date - b.date);
  } else {
    contributions = calculateContributions(
      investment.initialDate,
      today,
      investment.frequency,
      investment.dayOfWeek,
      investment.recurringAmount,
      investment.symbol
    );
  }

  const contributionCount = contributions.length;
  const recurringInvested = contributions.reduce((sum, contrib) => sum + contrib.amount, 0);
  const totalInvested = investment.initialAmount + recurringInvested;

  // Fetch USD/CAD exchange rate
  let usdToCAD = 1.41;
  try {
    const exchangeResponse = await axios.get('https://api.exchangerate-api.com/v4/latest/USD');
    usdToCAD = exchangeResponse.data.rates.CAD || 1.41;
  } catch (error) {
    console.warn('Could not fetch exchange rate, using default:', error.message);
  }

  // Calculate actual shares purchased at each contribution date
  let totalShares = 0;
  let currentPrice = 0;
  let currentValue = 0;

  try {
    const purchaseDates   = [new Date(investment.initialDate), ...contributions.map(c => c.date)];
    const purchaseAmounts = [investment.initialAmount,         ...contributions.map(c => c.amount)];
    const startDate = new Date(investment.initialDate);

    // Build a date → price map from historical data
    const priceByDate = {};

    if (isCanadianFundCode(investment.symbol)) {
      // Canadian mutual fund — fetch from Globe and Mail Barchart proxy (prices already in CAD)
      const rows = await fetchCanadianFundHistory(investment.symbol, startDate);
      for (const row of rows) priceByDate[row.date] = row.close;
      if (rows.length > 0) currentPrice = rows[rows.length - 1].close;
    } else {
      // Exchange-traded security — fetch from Yahoo Finance
      // For Canadian equities (TSX/TSXV), prices are already in CAD; US equities need USD→CAD conversion
      const period1 = Math.floor(startDate.getTime() / 1000);
      const period2 = Math.floor(new Date().getTime() / 1000);
      const yahoo = await fetchYahooWithFallback(investment.symbol, period1, period2);
      if (yahoo) {
        const { timestamps, closes, isCAD } = yahoo;
        const multiplier = isCAD ? 1 : usdToCAD;
        for (let i = 0; i < timestamps.length; i++) {
          if (closes[i] != null) {
            const d = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);
            priceByDate[d] = closes[i] * multiplier;
          }
        }
        const lastClose = closes.filter(c => c != null).pop();
        if (lastClose) currentPrice = lastClose * multiplier;
      }
    }

    // For each purchase, find the closest available price date and calculate shares
    const sortedDates = Object.keys(priceByDate).sort();
    for (let i = 0; i < purchaseDates.length; i++) {
      const target = purchaseDates[i].toISOString().slice(0, 10);
      // Find closest date on or before target
      let closest = sortedDates.filter(d => d <= target).pop()
        ?? sortedDates[0];
      const price = priceByDate[closest];
      if (price && price > 0) totalShares += purchaseAmounts[i] / price;
    }

    currentValue = totalShares * currentPrice;
  } catch (error) {
    console.error(`Error fetching historical prices for ${investment.symbol}:`, error.message);
    currentPrice = 0;
    currentValue = 0;
  }

  const profitLoss = currentValue - totalInvested;
  const profitLossPercent = totalInvested > 0 ? (profitLoss / totalInvested) * 100 : 0;

  return {
    ...investment,
    totalInvested,
    contributionCount,
    recurringInvested,
    currentPrice,
    priceInCAD: currentPrice,
    totalShares,
    currentValue,
    profitLoss,
    profitLossPercent,
    contributions: contributions.map(c => ({
      date: c.date.toISOString().split('T')[0],
      amount: c.amount
    })),
    lastUpdated: new Date().toISOString()
  };
}

/**
 * Get all recurring investments with calculated metrics
 */
async function getAllRecurringInvestments() {
  const config = await loadConfig();
  const investments = config.recurringInvestments || [];

  // Calculate metrics for each investment in parallel with error handling
  const investmentsWithMetrics = await Promise.allSettled(
    investments.map(investment => calculateInvestmentMetrics(investment))
  );

  // Filter out failed investments and log errors
  const successfulInvestments = investmentsWithMetrics
    .map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        console.error(`Failed to calculate metrics for investment ${investments[index].symbol}:`, result.reason);
        // Return a minimal investment object so it still appears in the list
        return {
          ...investments[index],
          totalInvested: investments[index].initialAmount || 0,
          contributionCount: 0,
          recurringInvested: 0,
          currentPrice: 0,
          currentValue: 0,
          profitLoss: 0,
          profitLossPercent: 0,
          error: 'Failed to fetch data',
          lastUpdated: new Date().toISOString()
        };
      }
    });

  // Calculate totals
  const totals = successfulInvestments.reduce((acc, inv) => ({
    totalInvested: acc.totalInvested + (inv.totalInvested || 0),
    currentValue: acc.currentValue + (inv.currentValue || 0),
    profitLoss: acc.profitLoss + (inv.profitLoss || 0)
  }), { totalInvested: 0, currentValue: 0, profitLoss: 0 });

  totals.profitLossPercent = totals.totalInvested > 0
    ? (totals.profitLoss / totals.totalInvested) * 100
    : 0;

  return {
    investments: successfulInvestments,
    totals
  };
}

/**
 * Update a specific recurring investment
 */
async function updateRecurringInvestment(id, updates) {
  const config = await loadConfig();
  const index = config.recurringInvestments.findIndex(inv => inv.id === id);

  if (index === -1) {
    throw new Error(`Recurring investment with id ${id} not found`);
  }

  config.recurringInvestments[index] = {
    ...config.recurringInvestments[index],
    ...updates
  };

  await saveConfig(config);
  return config.recurringInvestments[index];
}

/**
 * Add a new recurring investment
 */
async function addRecurringInvestment(investment) {
  const config = await loadConfig();

  // Generate ID if not provided
  if (!investment.id) {
    investment.id = investment.symbol.toLowerCase().replace(/[^a-z0-9]/g, '-');
  }

  config.recurringInvestments.push(investment);
  await saveConfig(config);

  return investment;
}

/**
 * Delete a recurring investment
 */
async function deleteRecurringInvestment(id) {
  const config = await loadConfig();
  config.recurringInvestments = config.recurringInvestments.filter(inv => inv.id !== id);
  await saveConfig(config);
  return true;
}

module.exports = {
  loadConfig,
  saveConfig,
  isCanadianFundCode,
  fetchCanadianFundHistory,
  fetchYahooWithFallback,
  calculateContributions,
  calculateContributionsClean,
  calculateInvestmentMetrics,
  getAllRecurringInvestments,
  updateRecurringInvestment,
  addRecurringInvestment,
  deleteRecurringInvestment
};
