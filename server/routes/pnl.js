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

    // Get unique symbols from trades
    const symbols = [...new Set(portfolio.trades?.map(t => t.symbol) || [])];

    const summary = {
      portfolioId,
      totalSymbols: symbols.length,
      assets: []
    };

    // Get holdings cache to fetch current prices
    const holdingsCache = require('../cache');

    for (const symbol of symbols) {
      const pnlData = pnlCache.get(symbol);

      if (pnlData && pnlData.dailyRecords && pnlData.dailyRecords.length > 0) {
        const latestRecord = pnlData.dailyRecords[pnlData.dailyRecords.length - 1];

        // Fetch current price from holdings cache (same as portfolio summary)
        let currentPrice = null;
        let currentValue = latestRecord.marketValue; // fallback to historical
        let unrealizedPnL = latestRecord.unrealizedPnL;
        let totalPnL = latestRecord.totalPnL;
        let totalPnLPercent = latestRecord.totalPnLPercent;

        try {
          const cachedData = await holdingsCache.get(symbol);
          if (cachedData && (cachedData.cadPrice || cachedData.price)) {
            // Use live current price (already in CAD from cache)
            currentPrice = cachedData.cadPrice || cachedData.price;
            currentValue = currentPrice * latestRecord.shares;
            unrealizedPnL = currentValue - latestRecord.costBasis;
            totalPnL = unrealizedPnL + latestRecord.realizedPnL;

            // Calculate P&L percentage based on cost basis
            if (latestRecord.costBasis > 0) {
              totalPnLPercent = (totalPnL / latestRecord.costBasis) * 100;
            }
          }
        } catch (err) {
          // Fall back to historical data if live price fetch fails
          console.warn(`Failed to fetch current price for ${symbol}, using historical data:`, err.message);
        }

        summary.assets.push({
          symbol,
          assetInfo: pnlData.assetInfo,
          latestDate: latestRecord.date,
          currentShares: latestRecord.shares,
          currentPrice: currentPrice,
          currentValue: currentValue,
          totalPnL: totalPnL,
          totalPnLPercent: totalPnLPercent,
          unrealizedPnL: unrealizedPnL,
          realizedPnL: latestRecord.realizedPnL,
          recordCount: pnlData.dailyRecords.length,
          hasPnLData: true
        });
      } else {
        summary.assets.push({
          symbol,
          hasPnLData: false
        });
      }
    }

    // Calculate portfolio totals
    const assetsWithData = summary.assets.filter(a => a.hasPnLData);
    summary.portfolioTotals = {
      totalValue: assetsWithData.reduce((sum, a) => sum + (a.currentValue || 0), 0),
      totalPnL: assetsWithData.reduce((sum, a) => sum + (a.totalPnL || 0), 0),
      totalUnrealizedPnL: assetsWithData.reduce((sum, a) => sum + (a.unrealizedPnL || 0), 0),
      totalRealizedPnL: assetsWithData.reduce((sum, a) => sum + (a.realizedPnL || 0), 0),
      assetsWithData: assetsWithData.length,
      assetsWithoutData: summary.assets.length - assetsWithData.length
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
