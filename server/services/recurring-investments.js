// Recurring investments service - handles index fund tracking with DCA
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

const CONFIG_PATH = path.join(__dirname, '../data/recurring-investments.json');

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
 * Calculate the number of contributions between two dates based on frequency
 */
function calculateContributions(startDate, endDate, frequency, dayOfWeek) {
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

  // Generate all contribution dates
  while (currentDate <= end) {
    contributions.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() + intervalDays);
  }

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
  const contributions = calculateContributions(
    investment.initialDate,
    today,
    investment.frequency,
    investment.dayOfWeek
  );

  const contributionCount = contributions.length;
  const recurringInvested = contributionCount * investment.recurringAmount;
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
    // Get initial purchase date and add contributions
    const purchaseDates = [new Date(investment.initialDate), ...contributions];
    const purchaseAmounts = [investment.initialAmount, ...contributions.map(() => investment.recurringAmount)];

    // Fetch historical prices for the entire date range
    const startDate = new Date(investment.initialDate);
    const endDate = new Date();
    const period1 = Math.floor(startDate.getTime() / 1000);
    const period2 = Math.floor(endDate.getTime() / 1000);

    const yahooResponse = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${investment.symbol}`, {
      params: {
        period1: period1,
        period2: period2,
        interval: '1d'
      },
      timeout: 15000
    });

    if (yahooResponse.data && yahooResponse.data.chart && yahooResponse.data.chart.result) {
      const result = yahooResponse.data.chart.result[0];
      const timestamps = result.timestamp || [];
      const quotes = result.indicators.quote[0];
      const closePrices = quotes.close || [];

      // Get current price (most recent)
      const latestPriceUSD = closePrices[closePrices.length - 1];
      currentPrice = latestPriceUSD * usdToCAD;

      // For each purchase date, find the closest historical price and calculate shares bought
      for (let i = 0; i < purchaseDates.length; i++) {
        const purchaseDate = purchaseDates[i];
        const purchaseAmount = purchaseAmounts[i];
        const purchaseTimestamp = Math.floor(purchaseDate.getTime() / 1000);

        // Find the closest timestamp in historical data
        let closestIndex = 0;
        let minDiff = Math.abs(timestamps[0] - purchaseTimestamp);

        for (let j = 1; j < timestamps.length; j++) {
          const diff = Math.abs(timestamps[j] - purchaseTimestamp);
          if (diff < minDiff) {
            minDiff = diff;
            closestIndex = j;
          }
        }

        // Get the price on that date and calculate shares purchased
        const historicalPriceUSD = closePrices[closestIndex];
        if (historicalPriceUSD && historicalPriceUSD > 0) {
          const historicalPriceCAD = historicalPriceUSD * usdToCAD;
          const sharesPurchased = purchaseAmount / historicalPriceCAD;
          totalShares += sharesPurchased;
        }
      }

      // Calculate current value based on actual shares owned
      currentValue = totalShares * currentPrice;
    }
  } catch (error) {
    console.error(`Error fetching historical prices for ${investment.symbol}:`, error.message);
    // Fallback to simple estimation if historical data fails
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
    contributions: contributions.map(d => d.toISOString().split('T')[0]),
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
  calculateContributions,
  calculateInvestmentMetrics,
  getAllRecurringInvestments,
  updateRecurringInvestment,
  addRecurringInvestment,
  deleteRecurringInvestment
};
