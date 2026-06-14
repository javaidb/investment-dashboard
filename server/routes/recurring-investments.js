const express = require('express');
const router = express.Router();
const {
  getAllRecurringInvestments,
  updateRecurringInvestment,
  addRecurringInvestment,
  deleteRecurringInvestment,
  loadConfig,
  saveConfig,
  isCanadianFundCode,
  fetchCanadianFundHistory
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

        const endDate = new Date();
        const startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - 5); // Get 5 years of data

        let historicalData = [];

        if (isCanadianFundCode(symbol)) {
          // Canadian mutual fund — fetch from Globe and Mail Barchart proxy (prices in CAD)
          console.log(`📡 Fetching historical data for Canadian fund ${symbol} via Barchart...`);
          const rows = await fetchCanadianFundHistory(symbol, startDate);
          historicalData = rows.map(r => ({
            date: r.date,
            open: r.close,
            high: r.close,
            low: r.close,
            close: r.close,
            volume: 0
          }));
        } else {
          // Exchange-traded security — fetch from Yahoo Finance with .TO/.V fallback
          const period1 = Math.floor(startDate.getTime() / 1000);
          const period2 = Math.floor(endDate.getTime() / 1000);

          console.log(`📡 Fetching historical data for ${symbol} via Yahoo Finance...`);
          const { fetchYahooWithFallback } = require('../services/recurring-investments');
          const yahoo = await fetchYahooWithFallback(symbol, period1, period2);
          if (yahoo) {
            const { timestamps, closes } = yahoo;
            historicalData = timestamps.map((timestamp, index) => ({
              date: new Date(timestamp * 1000).toISOString().split('T')[0],
              open: closes[index], high: closes[index],
              low: closes[index], close: closes[index], volume: 0,
            })).filter(d => d.close !== null);
          }
        }

        if (historicalData.length > 0) {
          // Save to historical cache
          if (updateStatus.lastDate) {
            historicalDataCache.updateIncremental(symbol, historicalData);
          } else {
            historicalDataCache.set(symbol, historicalData, {});
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

// ─── Sync from Tax Accounts Planner ──────────────────────────────────────────

const SYMBOL_NAMES = {
  BNS397: 'NASDAQ Index Fund',
  BNS381: 'Canadian Equity Index Fund',
  BNS387: 'International Equity Index Fund',
  BNS362: 'Scotia Resource Fund',
  QQQ:    'NASDAQ-100 ETF',
  SPY:    'S&P 500 ETF',
  VTI:    'Vanguard Total Stock Market',
  'XIU.TO': 'iShares S&P/TSX 60',
  'XEF.TO': 'iShares MSCI EAFE',
  'XBB.TO': 'iShares Core Canadian Bond',
  'VAB.TO': 'Vanguard Canadian Aggregate Bond',
  'ZSP.TO': 'BMO S&P 500 (CAD-Hedged)',
};

/**
 * POST /api/recurring-investments/sync-from-planner
 * Derive recurring-investments.json from TaxAccountsPlanner localStorage data.
 * Body: { tfsa: AccountSegment[], fhsa: AccountSegment[], rrsp: AccountSegment[] }
 */
router.post('/sync-from-planner', async (req, res) => {
  try {
    const plannerData = req.body; // { tfsa, fhsa, rrsp }
    const today = new Date().toISOString().slice(0, 10);

    // Aggregate per unique symbol across all accounts
    const symbolMap = {};

    for (const [accountType, segments] of Object.entries(plannerData)) {
      if (!Array.isArray(segments)) continue;
      for (const seg of segments) {
        if (!seg.startDate || !Array.isArray(seg.allocations)) continue;
        for (const alloc of seg.allocations) {
          if (!alloc.symbol || !alloc.percentage) continue;
          const sym = alloc.symbol;
          if (!symbolMap[sym]) {
            symbolMap[sym] = {
              initialAmount: 0,
              initialDate: seg.startDate,
              frequency: seg.frequency || 'weekly',
              dayOfWeek: seg.dayOfWeek || 'Monday',
              contributionSegments: [],
              accounts: new Set(),
            };
          }
          const entry = symbolMap[sym];
          entry.accounts.add(accountType.toUpperCase());
          entry.initialAmount += (alloc.oneTimeAmount || 0);
          if (seg.startDate < entry.initialDate) {
            entry.initialDate = seg.startDate;
            entry.frequency = seg.frequency || 'weekly';
            entry.dayOfWeek = seg.dayOfWeek || 'Monday';
          }
          const recurringAmt = seg.amount * (alloc.percentage / 100);
          entry.contributionSegments.push({
            startDate: seg.startDate,
            untilDate: seg.untilDate || '2099-12-31',
            amount: Math.round(recurringAmt * 100) / 100,
            frequency: seg.frequency || 'weekly',
            dayOfWeek: seg.dayOfWeek || 'Monday',
          });
        }
      }
    }

    if (Object.keys(symbolMap).length === 0) {
      return res.json({ success: true, message: 'No symbols found in planner', investments: [] });
    }

    // Load existing config to preserve any manual fields (e.g. notes, institution)
    const existingConfig = await loadConfig();
    const existingMap = {};
    for (const inv of (existingConfig.recurringInvestments || [])) {
      existingMap[inv.symbol] = inv;
    }

    const newInvestments = Object.entries(symbolMap).map(([symbol, entry]) => {
      const existing = existingMap[symbol] || {};
      // Sum all currently active segments across all accounts for display
      const sorted = entry.contributionSegments.slice().sort((a, b) => a.startDate.localeCompare(b.startDate));
      const active = sorted.filter(s => s.startDate <= today && s.untilDate >= today);
      const fallback = sorted[sorted.length - 1]; // latest by start if none active
      const currentRecurring = active.length > 0
        ? active.reduce((sum, s) => sum + s.amount, 0)
        : (fallback ? fallback.amount : 0);
      const refSeg = active[0] || fallback;
      const accounts = [...entry.accounts];

      return {
        id: existing.id || symbol.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        name: existing.name || SYMBOL_NAMES[symbol] || symbol,
        symbol,
        type: existing.type || 'index_fund',
        institution: existing.institution || (/^BNS\d+$/.test(symbol) ? 'Scotiabank' : 'Other'),
        initialAmount: entry.initialAmount,
        initialDate: entry.initialDate,
        recurringAmount: Math.round(currentRecurring * 100) / 100,
        frequency: refSeg ? refSeg.frequency : entry.frequency,
        dayOfWeek: refSeg ? refSeg.dayOfWeek : entry.dayOfWeek,
        enabled: existing.enabled !== undefined ? existing.enabled : true,
        accounts,
        contributionSegments: sorted,
        notes: existing.notes || `${accounts.join('+')} · ${symbol}`,
      };
    });

    // Sort by initialDate
    newInvestments.sort((a, b) => a.initialDate.localeCompare(b.initialDate));

    await saveConfig({ recurringInvestments: newInvestments });

    console.log(`✅ Synced ${newInvestments.length} recurring investments from planner`);
    res.json({ success: true, investments: newInvestments.map(i => ({ symbol: i.symbol, accounts: i.accounts })) });
  } catch (error) {
    console.error('Error syncing from planner:', error);
    res.status(500).json({ error: 'Failed to sync from planner' });
  }
});

module.exports = router;
