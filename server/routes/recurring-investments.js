const express = require('express');
const router = express.Router();
const {
  getAllRecurringInvestments,
  updateRecurringInvestment,
  addRecurringInvestment,
  deleteRecurringInvestment,
  loadConfig
} = require('../services/recurring-investments');

// Import caches
const holdingsCache = require('../cache');
const historicalDataCache = require('../historical-cache');
const axios = require('axios');

/**
 * GET /api/recurring-investments
 * Get all recurring investments with calculated metrics
 */
router.get('/', async (req, res) => {
  try {
    const data = await getAllRecurringInvestments();

    // Ensure recurring investment symbols are in holdings cache
    for (const investment of data.investments) {
      if (investment.enabled && investment.currentPrice > 0) {
        const cached = holdingsCache.get(investment.symbol);
        if (!cached || !cached.price) {
          // Add to holdings cache
          holdingsCache.set(investment.symbol, {
            price: investment.currentPrice,
            usdPrice: investment.currentPrice,
            cadPrice: investment.priceInCAD || investment.currentPrice,
            companyName: investment.name,
            sector: 'ETF',
            exchangeRate: 1.39,
            priceDate: new Date().toISOString(),
            fetchedAt: new Date().toISOString()
          });
          console.log(`💾 Added recurring investment ${investment.symbol} to holdings cache`);
        }
      }
    }

    res.json(data);
  } catch (error) {
    console.error('Error fetching recurring investments:', error);
    // Return empty data instead of 500 error to prevent breaking portfolio display
    res.json({
      investments: [],
      totals: {
        totalInvested: 0,
        currentValue: 0,
        profitLoss: 0,
        profitLossPercent: 0
      }
    });
  }
});

/**
 * GET /api/recurring-investments/config
 * Get raw configuration (for editing)
 */
router.get('/config', async (req, res) => {
  try {
    const config = await loadConfig();
    res.json(config);
  } catch (error) {
    console.error('Error fetching config:', error);
    res.status(500).json({ error: 'Failed to fetch configuration' });
  }
});

/**
 * POST /api/recurring-investments
 * Add a new recurring investment
 */
router.post('/', async (req, res) => {
  try {
    const investment = await addRecurringInvestment(req.body);
    res.json(investment);
  } catch (error) {
    console.error('Error adding recurring investment:', error);
    res.status(500).json({ error: 'Failed to add recurring investment' });
  }
});

/**
 * PUT /api/recurring-investments/:id
 * Update an existing recurring investment
 */
router.put('/:id', async (req, res) => {
  try {
    const investment = await updateRecurringInvestment(req.params.id, req.body);
    res.json(investment);
  } catch (error) {
    console.error('Error updating recurring investment:', error);
    res.status(404).json({ error: error.message });
  }
});

/**
 * DELETE /api/recurring-investments/:id
 * Delete a recurring investment
 */
router.delete('/:id', async (req, res) => {
  try {
    await deleteRecurringInvestment(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting recurring investment:', error);
    res.status(500).json({ error: 'Failed to delete recurring investment' });
  }
});

/**
 * POST /api/recurring-investments/add-to-historical-cache
 * Add recurring investment symbols to historical cache
 */
router.post('/add-to-historical-cache', async (req, res) => {
  try {
    const config = await loadConfig();
    const symbols = config.recurringInvestments.map(inv => inv.symbol);
    const results = [];

    for (const symbol of symbols) {
      try {
        // Check if symbol needs historical data
        const updateStatus = historicalDataCache.needsUpdate(symbol);

        if (!updateStatus.needsUpdate && updateStatus.lastDate) {
          console.log(`✅ ${symbol} is up to date (last date: ${updateStatus.lastDate})`);
          results.push({ symbol, status: 'up-to-date', lastDate: updateStatus.lastDate });
          continue;
        }

        // Fetch historical data from Yahoo Finance
        const endDate = new Date();
        const startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - 5); // Get 5 years of data

        const period1 = Math.floor(startDate.getTime() / 1000);
        const period2 = Math.floor(endDate.getTime() / 1000);

        console.log(`📡 Fetching historical data for ${symbol}...`);
        const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`, {
          params: {
            period1,
            period2,
            interval: '1d'
          },
          timeout: 30000
        });

        if (response.data && response.data.chart && response.data.chart.result) {
          const result = response.data.chart.result[0];
          const timestamps = result.timestamp || [];
          const quotes = result.indicators.quote[0];
          const metadata = result.meta;

          const historicalData = timestamps.map((timestamp, index) => ({
            date: new Date(timestamp * 1000).toISOString().split('T')[0],
            open: quotes.open[index],
            high: quotes.high[index],
            low: quotes.low[index],
            close: quotes.close[index],
            volume: quotes.volume[index]
          })).filter(d => d.close !== null);

          // Save to historical cache
          if (updateStatus.lastDate) {
            // Incremental update
            historicalDataCache.updateIncremental(symbol, historicalData);
          } else {
            // Full historical data
            historicalDataCache.set(symbol, historicalData, metadata);
          }

          results.push({
            symbol,
            status: 'added',
            dataPoints: historicalData.length,
            dateRange: {
              from: historicalData[0]?.date,
              to: historicalData[historicalData.length - 1]?.date
            }
          });
          console.log(`✅ Added ${historicalData.length} data points for ${symbol}`);
        } else {
          results.push({ symbol, status: 'no-data' });
        }
      } catch (error) {
        console.error(`Error fetching historical data for ${symbol}:`, error.message);
        results.push({ symbol, status: 'error', error: error.message });
      }
    }

    res.json({
      success: true,
      results,
      summary: {
        total: symbols.length,
        added: results.filter(r => r.status === 'added').length,
        upToDate: results.filter(r => r.status === 'up-to-date').length,
        errors: results.filter(r => r.status === 'error').length
      }
    });
  } catch (error) {
    console.error('Error adding recurring investments to historical cache:', error);
    res.status(500).json({ error: 'Failed to add to historical cache' });
  }
});

module.exports = router;
