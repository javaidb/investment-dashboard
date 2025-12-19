const express = require('express');
const router = express.Router();
const pnlCache = require('../pnl-cache');
const pnlCalculator = require('../pnl-calculator');
const fs = require('fs');
const path = require('path');

// File-based storage for portfolio data (same as portfolio.js)
const PORTFOLIO_FILE = path.join(__dirname, '../data/cache', 'portfolios.json');

// Load portfolios from file
function loadPortfolios() {
  try {
    if (fs.existsSync(PORTFOLIO_FILE)) {
      const data = fs.readFileSync(PORTFOLIO_FILE, 'utf8');
      const portfolioData = JSON.parse(data);
      const portfolios = new Map();

      // Handle both old and new format
      const isOldFormat = Object.keys(portfolioData).some(key => {
        const item = portfolioData[key];
        return item && item.id && item.trades && item.holdings;
      });

      if (isOldFormat) {
        return new Map(Object.entries(portfolioData));
      } else {
        // New file-based format
        const portfoliosById = new Map();

        for (const [filename, fileData] of Object.entries(portfolioData)) {
          if (fileData && fileData.portfolio && typeof fileData.portfolio === 'object') {
            const portfolio = fileData.portfolio;
            const portfolioId = portfolio.id;

            if (!portfoliosById.has(portfolioId)) {
              portfoliosById.set(portfolioId, portfolio);
            } else {
              const existing = portfoliosById.get(portfolioId);
              const existingDate = new Date(existing.processedAt || 0);
              const newDate = new Date(portfolio.processedAt || 0);

              if (newDate > existingDate) {
                portfoliosById.set(portfolioId, portfolio);
              }
            }
          }
        }

        return portfoliosById;
      }
    }

    return new Map();
  } catch (error) {
    console.error('Error loading portfolios:', error);
    return new Map();
  }
}

// Get PnL cache statistics
router.get('/stats', (req, res) => {
  try {
    const stats = pnlCache.getStats();
    res.json({
      success: true,
      ...stats
    });
  } catch (error) {
    console.error('PnL stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get PnL cache statistics',
      message: error.message
    });
  }
});

// Get PnL history for a specific symbol
router.get('/symbol/:symbol', (req, res) => {
  try {
    const { symbol } = req.params;
    const { startDate, endDate } = req.query;

    const pnlData = pnlCache.get(symbol, startDate, endDate);

    if (!pnlData) {
      return res.status(404).json({
        success: false,
        error: 'No PnL data found for this symbol',
        symbol
      });
    }

    res.json({
      success: true,
      ...pnlData
    });
  } catch (error) {
    console.error('PnL retrieval error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve PnL data',
      message: error.message
    });
  }
});

// Fetch historical price data for all assets in a portfolio
router.post('/fetch-historical/:portfolioId', async (req, res) => {
  try {
    const { portfolioId } = req.params;
    const portfolios = loadPortfolios();
    const portfolio = portfolios.get(portfolioId);

    if (!portfolio) {
      return res.status(404).json({
        success: false,
        error: 'Portfolio not found',
        portfolioId
      });
    }

    if (!portfolio.trades || portfolio.trades.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Portfolio has no trades'
      });
    }

    // Get unique symbols
    const symbols = [...new Set(portfolio.trades.map(t => t.symbol))];
    console.log(`📈 Fetching historical data for ${symbols.length} symbols`);

    const axios = require('axios');
    const results = {
      success: true,
      fetched: 0,
      failed: 0,
      symbols: []
    };

    // Fetch historical data for each symbol
    for (const symbol of symbols) {
      try {
        const trade = portfolio.trades.find(t => t.symbol === symbol);
        const isStock = trade.type === 's';
        const endpoint = isStock ? `/api/historical/stock/${symbol}` : `/api/historical/crypto/${symbol}`;

        console.log(`Fetching historical data for ${symbol} (${isStock ? 'stock' : 'crypto'})`);
        const response = await axios.get(`http://localhost:5000${endpoint}?period=max`);

        if (response.data && response.data.success) {
          results.fetched++;
          results.symbols.push({ symbol, success: true });
          console.log(`✅ Fetched ${symbol}`);
        } else {
          results.failed++;
          results.symbols.push({ symbol, success: false, error: 'No data returned' });
        }
      } catch (error) {
        console.error(`❌ Failed to fetch ${symbol}:`, error.message);
        results.failed++;
        results.symbols.push({ symbol, success: false, error: error.message });
      }
    }

    console.log(`📊 Historical data fetch complete: ${results.fetched} fetched, ${results.failed} failed`);
    res.json(results);

  } catch (error) {
    console.error('Fetch historical data error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch historical data',
      message: error.message
    });
  }
});

// Calculate and cache PnL for a portfolio
router.post('/calculate/:portfolioId', async (req, res) => {
  try {
    const { portfolioId } = req.params;
    const portfolios = loadPortfolios();

    const portfolio = portfolios.get(portfolioId);
    if (!portfolio) {
      return res.status(404).json({
        success: false,
        error: 'Portfolio not found',
        portfolioId
      });
    }

    if (!portfolio.trades || !Array.isArray(portfolio.trades) || portfolio.trades.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Portfolio has no trades',
        portfolioId
      });
    }

    console.log(`📊 Calculating PnL for portfolio ${portfolioId} with ${portfolio.trades.length} trades`);

    const result = await pnlCalculator.calculateAndCachePortfolioPnL(portfolio);

    res.json({
      success: result.success,
      portfolioId,
      ...result,
      message: `Processed ${result.processed} assets, ${result.failed} failed`
    });

  } catch (error) {
    console.error('PnL calculation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate PnL',
      message: error.message
    });
  }
});

// Update PnL for a specific symbol
router.post('/update/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { portfolioId } = req.body;

    if (!portfolioId) {
      return res.status(400).json({
        success: false,
        error: 'portfolioId is required in request body'
      });
    }

    const portfolios = loadPortfolios();
    const portfolio = portfolios.get(portfolioId);

    if (!portfolio) {
      return res.status(404).json({
        success: false,
        error: 'Portfolio not found',
        portfolioId
      });
    }

    // Get trades for this symbol
    const symbolTrades = portfolio.trades?.filter(t => t.symbol === symbol) || [];

    if (symbolTrades.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No trades found for this symbol in portfolio',
        symbol,
        portfolioId
      });
    }

    // Get asset info from first trade
    const assetInfo = {
      symbol,
      type: symbolTrades[0].type,
      currency: symbolTrades[0].currency || 'CAD'
    };

    const result = await pnlCalculator.updatePnL(symbol, symbolTrades, assetInfo);

    res.json({
      success: result.success,
      symbol,
      portfolioId,
      ...result
    });

  } catch (error) {
    console.error('PnL update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update PnL',
      message: error.message
    });
  }
});

// Get PnL summary for all symbols in a portfolio
router.get('/portfolio/:portfolioId/summary', async (req, res) => {
  console.log('🔥🔥🔥 PnL SUMMARY ENDPOINT - USING PORTFOLIO HOLDINGS DATA 🔥🔥🔥');
  try {
    const { portfolioId } = req.params;

    // Load portfolio data directly (same way as other endpoints)
    const portfolios = loadPortfolios();
    const portfolio = portfolios.get(portfolioId);

    if (!portfolio) {
      return res.status(404).json({
        success: false,
        error: 'Portfolio not found',
        portfolioId
      });
    }

    // Get holdings and enrich with current prices (same logic as portfolio.js)
    const rawHoldings = portfolio.holdings || [];
    const holdingsCache = require('../cache');

    console.log(`\n📊 PnL Summary Calculation (using portfolio holdings):`);
    console.log(`Total holdings: ${rawHoldings.length}`);

    // Enrich holdings with current prices and calculate P&L
    const enrichedHoldings = [];
    for (const holding of rawHoldings) {
      let currentPrice = null;
      let currentValue = 0;
      let unrealizedPnL = 0;

      // Fetch current price from cache (same as portfolio endpoint)
      try {
        const cachedData = await holdingsCache.get(holding.symbol);
        if (cachedData && (cachedData.cadPrice || cachedData.price)) {
          currentPrice = cachedData.cadPrice || cachedData.price;
          const exchangeRate = cachedData.exchangeRate || 1.35;

          // Convert holdings values to CAD if needed
          const totalInvestedCAD = holding.currency === 'USD'
            ? (Number(holding.totalInvested) || 0) * exchangeRate
            : (Number(holding.totalInvested) || 0);
          const totalAmountInvestedCAD = holding.currency === 'USD'
            ? (Number(holding.totalAmountInvested) || Number(holding.totalInvested) || 0) * exchangeRate
            : (Number(holding.totalAmountInvested) || Number(holding.totalInvested) || 0);
          const realizedPnLCAD = holding.currency === 'USD'
            ? (Number(holding.realizedPnL) || 0) * exchangeRate
            : (Number(holding.realizedPnL) || 0);

          currentValue = currentPrice * (Number(holding.quantity) || 0);
          unrealizedPnL = currentValue - totalInvestedCAD;
          const totalPnL = unrealizedPnL + realizedPnLCAD;

          // Calculate P&L percentage using totalAmountInvested (same as Breakdown tab)
          const totalPnLPercent = totalAmountInvestedCAD > 0
            ? (totalPnL / totalAmountInvestedCAD) * 100
            : 0;

          enrichedHoldings.push({
            ...holding,
            currentPrice,
            currentValue,
            unrealizedPnL,
            realizedPnL: realizedPnLCAD,
            totalPnL,
            totalPnLPercent
          });
        } else {
          // No price data, use holding as-is with zeros
          enrichedHoldings.push({
            ...holding,
            currentPrice: null,
            currentValue: 0,
            unrealizedPnL: 0,
            totalPnL: holding.realizedPnL || 0
          });
        }
      } catch (err) {
        console.warn(`Failed to fetch price for ${holding.symbol}:`, err.message);
        enrichedHoldings.push({
          ...holding,
          currentPrice: null,
          currentValue: 0,
          unrealizedPnL: 0,
          totalPnL: holding.realizedPnL || 0
        });
      }
    }

    // Filter to current holdings (quantity > 0)
    const currentHoldings = enrichedHoldings.filter(h => h.quantity > 0);
    console.log(`Current holdings (qty > 0): ${currentHoldings.length}`);
    console.log(`Fully sold holdings: ${enrichedHoldings.length - currentHoldings.length}`);

    // Calculate totals using SAME logic as Breakdown tab
    const totalUnrealizedPnL = currentHoldings.reduce((sum, h) => sum + (h.unrealizedPnL || 0), 0);
    const totalRealizedPnL = enrichedHoldings.reduce((sum, h) => sum + (h.realizedPnL || 0), 0);
    let totalPnL = totalUnrealizedPnL + totalRealizedPnL;
    let totalValue = currentHoldings.reduce((sum, h) => sum + (h.currentValue || 0), 0);

    console.log(`Total Unrealized P&L: ${totalUnrealizedPnL.toFixed(2)}`);
    console.log(`Total Realized P&L: ${totalRealizedPnL.toFixed(2)}`);
    console.log(`Trading P&L (before recurring): ${totalPnL.toFixed(2)}`);

    // Add recurring investments to totals (same as Breakdown tab)
    let recurringPnL = 0;
    try {
      const axios = require('axios');
      const recurringResponse = await axios.get('http://localhost:5000/api/recurring-investments');

      if (recurringResponse.data && recurringResponse.data.totals) {
        const recurringTotals = recurringResponse.data.totals;
        totalValue += recurringTotals.currentValue || 0;
        recurringPnL = recurringTotals.profitLoss || 0;
        totalPnL += recurringPnL;

        console.log(`📊 Including recurring investments P&L: +${recurringPnL.toFixed(2)} CAD`);
        console.log(`📊 FINAL TOTAL P&L: ${totalPnL.toFixed(2)} CAD`);
      }
    } catch (err) {
      console.warn('⚠️ Failed to fetch recurring investments for PnL summary:', err.message);
    }

    // Build assets list for UI (using enriched holdings data)
    const assets = enrichedHoldings.map(h => {
      const pnlData = pnlCache.get(h.symbol);
      return {
        symbol: h.symbol,
        assetInfo: {
          symbol: h.symbol,
          type: h.type,
          currency: h.currency || 'CAD'
        },
        currentShares: h.quantity,
        currentPrice: h.currentPrice,
        currentValue: h.currentValue,
        totalPnL: h.totalPnL,
        totalPnLPercent: h.totalPnLPercent,
        unrealizedPnL: h.unrealizedPnL,
        realizedPnL: h.realizedPnL,
        recordCount: pnlData?.dailyRecords?.length || 0,
        hasPnLData: !!(pnlData && pnlData.dailyRecords && pnlData.dailyRecords.length > 0)
      };
    });

    const summary = {
      portfolioId,
      totalSymbols: enrichedHoldings.length,
      assets: assets,
      portfolioTotals: {
        totalValue: totalValue,
        totalPnL: totalPnL,
        totalUnrealizedPnL: totalUnrealizedPnL + recurringPnL,
        totalRealizedPnL: totalRealizedPnL,
        assetsWithData: assets.filter(a => a.hasPnLData).length,
        assetsWithoutData: assets.filter(a => !a.hasPnLData).length
      }
    };

    res.json({
      success: true,
      ...summary
    });

  } catch (error) {
    console.error('PnL summary error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get PnL summary',
      message: error.message
    });
  }
});

// Clear PnL cache for a specific symbol
router.delete('/symbol/:symbol', (req, res) => {
  try {
    const { symbol } = req.params;
    const cleared = pnlCache.clearSymbol(symbol);

    res.json({
      success: true,
      symbol,
      cleared,
      message: cleared ? `Cleared PnL cache for ${symbol}` : `No PnL cache found for ${symbol}`
    });
  } catch (error) {
    console.error('PnL clear error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear PnL cache',
      message: error.message
    });
  }
});

// Get aggregated daily P&L for entire portfolio
router.get('/portfolio/:portfolioId/daily', async (req, res) => {
  try {
    const { portfolioId } = req.params;

    // Load portfolio data
    const portfolios = loadPortfolios();
    const portfolio = portfolios.get(portfolioId);

    if (!portfolio) {
      return res.status(404).json({
        success: false,
        error: 'Portfolio not found',
        portfolioId
      });
    }

    // Get all unique symbols from trades
    const symbols = [...new Set((portfolio.trades || []).map(t => t.symbol))];

    if (symbols.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Portfolio has no trades'
      });
    }

    console.log(`📊 Aggregating daily P&L for ${symbols.length} symbols`);

    // Collect P&L data for all symbols that have it
    const symbolsWithData = [];
    const symbolsWithoutData = [];

    for (const symbol of symbols) {
      const pnlData = pnlCache.get(symbol);
      if (pnlData && pnlData.dailyRecords && pnlData.dailyRecords.length > 0) {
        symbolsWithData.push({
          symbol,
          dailyRecords: pnlData.dailyRecords,
          assetInfo: pnlData.assetInfo
        });
      } else {
        symbolsWithoutData.push(symbol);
      }
    }

    if (symbolsWithData.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No P&L data available for any assets in portfolio',
        message: 'Calculate P&L for individual assets first',
        symbolsWithoutData
      });
    }

    console.log(`Found P&L data for ${symbolsWithData.length}/${symbols.length} symbols`);

    // Build a map of date -> aggregated values
    const dailyAggregates = new Map();

    for (const symbolData of symbolsWithData) {
      for (const record of symbolData.dailyRecords) {
        const dateKey = record.date;

        if (!dailyAggregates.has(dateKey)) {
          dailyAggregates.set(dateKey, {
            date: dateKey,
            totalValue: 0,
            totalCostBasis: 0,
            totalUnrealizedPnL: 0,
            totalRealizedPnL: 0,
            totalPnL: 0,
            assetsCount: 0
          });
        }

        const aggregate = dailyAggregates.get(dateKey);
        aggregate.totalValue += record.marketValue || 0;
        aggregate.totalCostBasis += record.costBasis || 0;
        aggregate.totalUnrealizedPnL += record.unrealizedPnL || 0;
        aggregate.totalRealizedPnL += record.realizedPnL || 0;
        aggregate.totalPnL += record.totalPnL || 0;
        aggregate.assetsCount++;
      }
    }

    // Convert map to sorted array
    const dailyRecords = Array.from(dailyAggregates.values())
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map(record => ({
        ...record,
        totalPnLPercent: record.totalCostBasis > 0
          ? (record.totalPnL / record.totalCostBasis) * 100
          : 0
      }));

    const startDate = dailyRecords.length > 0 ? dailyRecords[0].date : null;
    const endDate = dailyRecords.length > 0 ? dailyRecords[dailyRecords.length - 1].date : null;

    console.log(`📈 Aggregated ${dailyRecords.length} daily records from ${startDate} to ${endDate}`);

    res.json({
      success: true,
      portfolioId,
      dailyRecords,
      totalRecords: dailyRecords.length,
      startDate,
      endDate,
      symbolsWithData: symbolsWithData.map(s => s.symbol),
      symbolsWithoutData
    });

  } catch (error) {
    console.error('Portfolio daily P&L error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get portfolio daily P&L',
      message: error.message
    });
  }
});

// Clear entire PnL cache
router.delete('/clear-all', (req, res) => {
  try {
    const count = pnlCache.clearAll();

    res.json({
      success: true,
      cleared: count,
      message: `Cleared ${count} PnL cache entries`
    });
  } catch (error) {
    console.error('PnL clear all error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear PnL cache',
      message: error.message
    });
  }
});

module.exports = router;
