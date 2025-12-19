const express = require('express');
const router = express.Router();
const historicalCache = require('../historical-cache');
const holdingsCache = require('../cache');
const portfolioData = require('../data/cache/portfolios.json');

/**
 * Convert daily data to weekly data (take last trading day of each week)
 */
function convertToWeeklyData(dailyData) {
  if (!dailyData || dailyData.length === 0) {
    return [];
  }

  const sorted = [...dailyData].sort((a, b) => new Date(a.date) - new Date(b.date));
  const weeklyData = [];
  let currentWeek = null;
  let weekData = null;

  sorted.forEach(day => {
    const date = new Date(day.date);
    const weekNumber = getWeekNumber(date);
    const weekKey = `${date.getFullYear()}-W${weekNumber}`;

    if (weekKey !== currentWeek) {
      if (weekData) {
        weeklyData.push(weekData);
      }
      currentWeek = weekKey;
      weekData = day;
    } else {
      // Take the latest day in the week
      weekData = day;
    }
  });

  // Add the last week
  if (weekData) {
    weeklyData.push(weekData);
  }

  return weeklyData;
}

/**
 * Get ISO week number
 */
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

/**
 * Calculate 200-week moving average from historical data
 */
function calculate200WMA(historicalData) {
  if (!historicalData || historicalData.length < 200) {
    return null;
  }

  // Sort by date to ensure proper order
  const sorted = [...historicalData].sort((a, b) => new Date(a.date) - new Date(b.date));

  // Get the last 200 weeks of data
  const last200Weeks = sorted.slice(-200);

  // Calculate average of closing prices
  const sum = last200Weeks.reduce((acc, item) => acc + item.close, 0);
  return sum / last200Weeks.length;
}

/**
 * Get weekly price changes for the last N weeks
 */
function getWeeklyChanges(historicalData, weeks = 3) {
  if (!historicalData || historicalData.length < weeks + 1) {
    return [];
  }

  const sorted = [...historicalData].sort((a, b) => new Date(a.date) - new Date(b.date));
  const changes = [];

  for (let i = 0; i < weeks; i++) {
    const currentWeek = sorted[sorted.length - 1 - i];
    const previousWeek = sorted[sorted.length - 2 - i];

    if (currentWeek && previousWeek) {
      const change = ((currentWeek.close - previousWeek.close) / previousWeek.close) * 100;
      changes.unshift(change); // Add to beginning to maintain chronological order
    }
  }

  return changes;
}

/**
 * Check if asset is below 200 WMA with positive weekly change
 */
async function checkMomentumSignal(symbol, assetName, currentPrice) {
  try {
    // Get historical data (max available daily data)
    const dailyData = historicalCache.get(symbol, 'max');

    console.log(`[${symbol}] Daily data points: ${dailyData ? dailyData.length : 0}`);

    if (!dailyData || dailyData.length < 1400) {
      // Need at least ~1400 days (200 weeks * 7 days/week)
      console.log(`[${symbol}] Not enough daily data (need 1400+, have ${dailyData ? dailyData.length : 0})`);
      return null; // Not enough data
    }

    // Convert daily data to weekly data
    const weeklyData = convertToWeeklyData(dailyData);

    console.log(`[${symbol}] Weekly data points: ${weeklyData.length}`);

    if (weeklyData.length < 200) {
      console.log(`[${symbol}] Not enough weekly data (need 200+, have ${weeklyData.length})`);
      return null; // Not enough weekly data points
    }

    // Calculate 200 WMA
    const wma200 = calculate200WMA(weeklyData);

    console.log(`[${symbol}] 200 WMA: ${wma200}, Current Price: ${currentPrice}`);

    if (!wma200) {
      return null;
    }

    // Check if current price is below 200 WMA
    const isBelow200WMA = currentPrice < wma200;

    console.log(`[${symbol}] Below 200 WMA: ${isBelow200WMA}`);

    if (!isBelow200WMA) {
      return null; // Not below 200 WMA, no signal
    }

    // Get last week's change
    const weeklyChanges = getWeeklyChanges(weeklyData, 1);

    console.log(`[${symbol}] Weekly change: ${weeklyChanges[0]}%`);

    if (weeklyChanges.length < 1) {
      return null;
    }

    // Check if current week is positive
    const currentWeekChange = weeklyChanges[0];
    const isPositiveWeek = currentWeekChange > 0;

    console.log(`[${symbol}] Positive week: ${isPositiveWeek}`);

    if (!isPositiveWeek) {
      return null; // Current week not positive
    }

    // Calculate how far below 200 WMA
    const percentBelow = ((wma200 - currentPrice) / wma200) * 100;

    // Generate news item
    return {
      id: `momentum_${symbol}_${Date.now()}`,
      symbol,
      assetName,
      type: 'momentum_signal',
      title: 'Below 200 WMA with Positive Weekly Gain',
      message: `${symbol} is trading ${percentBelow.toFixed(2)}% below its 200-week moving average and has gained ${currentWeekChange.toFixed(2)}% this week. This could present a buying opportunity while the asset is undervalued.`,
      timestamp: new Date(),
      metadata: {
        currentPrice,
        wma200,
        weeklyChanges: [currentWeekChange],
        percentBelow200WMA: percentBelow,
      },
    };
  } catch (error) {
    console.error(`Error checking momentum signal for ${symbol}:`, error);
    return null;
  }
}

/**
 * Get all portfolio holdings
 */
function getPortfolioHoldings() {
  const holdings = [];

  if (!portfolioData) {
    return holdings;
  }

  // The portfolioData structure has filenames as keys
  const portfolioEntries = Object.values(portfolioData);

  // Iterate through all portfolio entries
  for (const entry of portfolioEntries) {
    const portfolio = entry.portfolio || entry;

    if (portfolio.currentHoldings) {
      for (const [symbol, holding] of Object.entries(portfolio.currentHoldings)) {
        // Skip if already added (from another portfolio)
        if (holdings.find(h => h.symbol === symbol)) {
          continue;
        }

        holdings.push({
          symbol,
          assetName: holding.assetName || symbol,
          currentPrice: holding.currentPrice || 0,
          shares: holding.shares || 0,
        });
      }
    } else if (portfolio.holdings && Array.isArray(portfolio.holdings)) {
      // Handle array-based holdings structure
      for (const holding of portfolio.holdings) {
        // Skip if already added
        if (holdings.find(h => h.symbol === holding.symbol)) {
          continue;
        }

        holdings.push({
          symbol: holding.symbol,
          assetName: holding.assetName || holding.symbol,
          currentPrice: holding.currentPrice || 0,
          shares: holding.shares || 0,
        });
      }
    }
  }

  return holdings;
}

/**
 * GET /api/newsboard/events
 * Get all news events for the portfolio
 */
router.get('/events', async (req, res) => {
  try {
    const newsItems = [];

    // Get all holdings from portfolios
    const holdings = getPortfolioHoldings();

    if (holdings.length === 0) {
      return res.json({
        items: [],
        lastUpdated: new Date().toISOString(),
      });
    }

    // Fetch current prices for all holdings
    const holdingsWithPrices = await Promise.all(holdings.map(async (holding) => {
      const cachedData = holdingsCache.get(holding.symbol);
      const currentPrice = cachedData?.price || 0;

      return {
        ...holding,
        currentPrice,
        assetName: cachedData?.name || holding.assetName || holding.symbol,
      };
    }));

    // Check each holding for momentum signals
    const checks = holdingsWithPrices.map(holding =>
      checkMomentumSignal(holding.symbol, holding.assetName, holding.currentPrice)
    );

    const results = await Promise.all(checks);

    // Filter out null results and add to news items
    results.forEach(result => {
      if (result) {
        newsItems.push(result);
      }
    });

    // Sort by timestamp (newest first)
    newsItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({
      items: newsItems,
      lastUpdated: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Error fetching newsboard events:', error);
    res.status(500).json({ error: 'Failed to fetch newsboard events' });
  }
});

/**
 * GET /api/newsboard/events/:symbol
 * Get news events for a specific symbol
 */
router.get('/events/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;

    // Find the symbol in holdings
    const holdings = getPortfolioHoldings();
    const holding = holdings.find(h => h.symbol.toLowerCase() === symbol.toLowerCase());

    if (!holding) {
      return res.status(404).json({ error: 'Symbol not found in portfolio' });
    }

    // Fetch current price from cache
    const cachedData = holdingsCache.get(holding.symbol);
    const currentPrice = cachedData?.price || 0;
    const assetName = cachedData?.name || holding.assetName || holding.symbol;

    // Check for momentum signal
    const newsItem = await checkMomentumSignal(holding.symbol, assetName, currentPrice);

    res.json({
      items: newsItem ? [newsItem] : [],
      lastUpdated: new Date().toISOString(),
    });

  } catch (error) {
    console.error(`Error fetching newsboard events for ${req.params.symbol}:`, error);
    res.status(500).json({ error: 'Failed to fetch newsboard events' });
  }
});

module.exports = router;
