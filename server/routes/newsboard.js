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
    const result = historicalCache.get(symbol, 'max');
    const dailyData = result?.data;

    if (!dailyData || dailyData.length < 1400) {
      return null; // Not enough data for 200 WMA
    }

    // Convert daily data to weekly data
    const weeklyData = convertToWeeklyData(dailyData);

    if (weeklyData.length < 200) {
      return null; // Not enough weekly data points
    }

    // Calculate 200 WMA
    const wma200 = calculate200WMA(weeklyData);

    if (!wma200) {
      return null;
    }

    // Check if current price is below 200 WMA
    const isBelow200WMA = currentPrice < wma200;

    if (!isBelow200WMA) {
      return null; // Not below 200 WMA, no signal
    }

    // Get last week's change
    const weeklyChanges = getWeeklyChanges(weeklyData, 1);

    if (weeklyChanges.length < 1) {
      return null;
    }

    // Check if current week is positive
    const currentWeekChange = weeklyChanges[0];
    const isPositiveWeek = currentWeekChange > 0;

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
 * Check for significant daily price movements
 */
function checkDailyMovement(symbol, assetName, currentPrice) {
  try {
    const result = historicalCache.get(symbol, '1m'); // Use '1m' instead of '30d'
    const dailyData = result?.data;

    if (!dailyData || dailyData.length < 2) {
      return null;
    }

    // Get yesterday's close
    const sorted = [...dailyData].sort((a, b) => new Date(b.date) - new Date(a.date));
    const yesterdayClose = sorted[1]?.close;

    if (!yesterdayClose) {
      return null;
    }

    const dailyChange = ((currentPrice - yesterdayClose) / yesterdayClose) * 100;

    // Check for significant movement (>5% in either direction)
    if (Math.abs(dailyChange) >= 5) {
      const isPositive = dailyChange > 0;
      return {
        id: `daily_${symbol}_${Date.now()}`,
        symbol,
        assetName,
        type: isPositive ? 'achievement' : 'warning',
        title: isPositive ? 'Strong Daily Gain' : 'Significant Daily Drop',
        message: `${symbol} has ${isPositive ? 'surged' : 'dropped'} ${Math.abs(dailyChange).toFixed(2)}% today. ${isPositive ? 'Strong upward momentum detected.' : 'Consider reviewing your position.'}`,
        timestamp: new Date(),
        metadata: {
          currentPrice,
          dailyChange,
          previousClose: yesterdayClose,
        },
      };
    }

    return null;
  } catch (error) {
    console.error(`Error checking daily movement for ${symbol}:`, error);
    return null;
  }
}

/**
 * Check for weekly trends (3 consecutive weeks in same direction)
 */
function checkWeeklyTrend(symbol, assetName, currentPrice) {
  try {
    const result = historicalCache.get(symbol, '6m');
    const dailyData = result?.data;

    if (!dailyData || dailyData.length < 30) {
      return null;
    }

    const weeklyData = convertToWeeklyData(dailyData);
    const weeklyChanges = getWeeklyChanges(weeklyData, 3);

    if (weeklyChanges.length < 3) {
      return null;
    }

    // Check for 3 consecutive positive weeks
    const allPositive = weeklyChanges.every(change => change > 0);
    const allNegative = weeklyChanges.every(change => change < 0);

    if (allPositive || allNegative) {
      const totalChange = weeklyChanges.reduce((sum, change) => sum + change, 0);
      const avgChange = totalChange / 3;

      return {
        id: `trend_${symbol}_${Date.now()}`,
        symbol,
        assetName,
        type: allPositive ? 'achievement' : 'warning',
        title: allPositive ? '3-Week Upward Trend' : '3-Week Downward Trend',
        message: `${symbol} has been trending ${allPositive ? 'upward' : 'downward'} for 3 consecutive weeks with an average weekly ${allPositive ? 'gain' : 'loss'} of ${Math.abs(avgChange).toFixed(2)}%. ${allPositive ? 'Positive momentum building.' : 'Sustained weakness detected.'}`,
        timestamp: new Date(),
        metadata: {
          currentPrice,
          weeklyChanges,
          averageChange: avgChange,
        },
      };
    }

    return null;
  } catch (error) {
    console.error(`Error checking weekly trend for ${symbol}:`, error);
    return null;
  }
}

/**
 * Check for 52-week high or low
 */
function check52WeekHighLow(symbol, assetName, currentPrice) {
  try {
    const result = historicalCache.get(symbol, '1y');
    const dailyData = result?.data;

    if (!dailyData || dailyData.length < 200) {
      return null;
    }

    const prices = dailyData.map(d => d.close);
    const high52Week = Math.max(...prices);
    const low52Week = Math.min(...prices);

    const percentFromHigh = ((currentPrice - high52Week) / high52Week) * 100;
    const percentFromLow = ((currentPrice - low52Week) / low52Week) * 100;

    // Check if within 2% of 52-week high
    if (percentFromHigh >= -2 && percentFromHigh <= 0) {
      return {
        id: `high52_${symbol}_${Date.now()}`,
        symbol,
        assetName,
        type: 'achievement',
        title: 'Approaching 52-Week High',
        message: `${symbol} is trading at $${currentPrice.toFixed(2)}, just ${Math.abs(percentFromHigh).toFixed(2)}% below its 52-week high of $${high52Week.toFixed(2)}. Strong performance indicator.`,
        timestamp: new Date(),
        metadata: {
          currentPrice,
          high52Week,
          percentFromHigh,
        },
      };
    }

    // Check if within 2% of 52-week low
    if (percentFromLow >= 0 && percentFromLow <= 2) {
      return {
        id: `low52_${symbol}_${Date.now()}`,
        symbol,
        assetName,
        type: 'warning',
        title: 'Near 52-Week Low',
        message: `${symbol} is trading at $${currentPrice.toFixed(2)}, only ${percentFromLow.toFixed(2)}% above its 52-week low of $${low52Week.toFixed(2)}. Potential value opportunity or continued weakness.`,
        timestamp: new Date(),
        metadata: {
          currentPrice,
          low52Week,
          percentFromLow,
        },
      };
    }

    return null;
  } catch (error) {
    console.error(`Error checking 52-week high/low for ${symbol}:`, error);
    return null;
  }
}

/**
 * Check for recovery signals (down significantly but showing recent strength)
 */
function checkRecoverySignal(symbol, assetName, currentPrice) {
  try {
    const result = historicalCache.get(symbol, '6m');
    const dailyData = result?.data;

    if (!dailyData || dailyData.length < 60) {
      return null;
    }

    const sorted = [...dailyData].sort((a, b) => new Date(a.date) - new Date(b.date));

    // Get price 3 months ago
    const threeMonthsAgo = sorted[sorted.length - 90]?.close || sorted[0].close;
    const threeMonthChange = ((currentPrice - threeMonthsAgo) / threeMonthsAgo) * 100;

    // Get last 2 weeks of data
    const lastTwoWeeks = sorted.slice(-10);
    const twoWeeksAgo = lastTwoWeeks[0]?.close;
    const twoWeekChange = ((currentPrice - twoWeeksAgo) / twoWeeksAgo) * 100;

    // Recovery signal: down >15% over 3 months but up >5% in last 2 weeks
    if (threeMonthChange < -15 && twoWeekChange > 5) {
      return {
        id: `recovery_${symbol}_${Date.now()}`,
        symbol,
        assetName,
        type: 'momentum_signal',
        title: 'Potential Recovery Signal',
        message: `${symbol} is down ${Math.abs(threeMonthChange).toFixed(2)}% over 3 months but has gained ${twoWeekChange.toFixed(2)}% in the last 2 weeks. Early signs of recovery emerging.`,
        timestamp: new Date(),
        metadata: {
          currentPrice,
          threeMonthChange,
          twoWeekChange,
        },
      };
    }

    return null;
  } catch (error) {
    console.error(`Error checking recovery signal for ${symbol}:`, error);
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

    // Check each holding for all types of signals
    for (const holding of holdingsWithPrices) {
      const { symbol, assetName, currentPrice } = holding;

      // Run all checks
      const checks = [
        checkMomentumSignal(symbol, assetName, currentPrice),
        checkDailyMovement(symbol, assetName, currentPrice),
        checkWeeklyTrend(symbol, assetName, currentPrice),
        check52WeekHighLow(symbol, assetName, currentPrice),
        checkRecoverySignal(symbol, assetName, currentPrice),
      ];

      const results = await Promise.all(checks);

      // Add all non-null results to news items
      results.forEach(result => {
        if (result) {
          newsItems.push(result);
        }
      });
    }

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
