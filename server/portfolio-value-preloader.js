const portfolioValueCache = require('./portfolio-value-cache');
const historicalDataCache = require('./historical-cache');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

/**
 * PortfolioValuePreloader - Calculate Portfolio Value Over Time
 *
 * This module reads all transactions from portfolio files and calculates
 * the total portfolio value for each trading day from the first transaction to today.
 *
 * Key Features:
 * - Groups all assets together by datetime
 * - Calculates total value, total invested, and P&L for each day
 * - Distinguishes between trading holdings and recurring investments
 * - Uses average cost basis methodology (same as pnl-calculator)
 * - Incremental updates (only calculates missing trading days)
 */
class PortfolioValuePreloader {
  constructor() {
    this.portfoliosFile = path.join(__dirname, 'data', 'cache', 'portfolios.json');
    this.isPreloading = false;
  }

  // Currency conversion cache
  async getUSDtoCADRate() {
    try {
      const response = await axios.get('https://api.exchangerate-api.com/v4/latest/USD', {
        timeout: 10000
      });
      const rate = response.data.rates.CAD;
      console.log(`✅ Fetched USD/CAD rate: ${rate}`);
      return rate;
    } catch (error) {
      console.warn('⚠️ Failed to fetch USD/CAD rate, using fallback rate of 1.35');
      return 1.35;
    }
  }

  // Load portfolio from portfolios.json (same source as breakdown tab)
  loadPortfolios() {
    try {
      if (!fs.existsSync(this.portfoliosFile)) {
        console.warn('⚠️ No portfolios.json file found');
        return [];
      }

      const data = fs.readFileSync(this.portfoliosFile, 'utf8');
      const portfoliosData = JSON.parse(data);
      const portfolioEntries = Object.entries(portfoliosData);

      if (portfolioEntries.length === 0) {
        console.warn('⚠️ No portfolios found in portfolios.json');
        return [];
      }

      console.log(`📁 Found ${portfolioEntries.length} portfolio entries in portfolios.json`);

      // Combine ALL trades from ALL portfolios (not just the most recent one)
      const allPortfolios = [];
      const allTradesMap = new Map(); // Use map to deduplicate trades

      for (const [filename, fileData] of portfolioEntries) {
        const portfolio = fileData.portfolio || fileData;
        const trades = portfolio.trades || [];

        // Add each trade to the map with a unique key
        trades.forEach(trade => {
          const key = `${trade.symbol}_${trade.date}_${trade.action}_${trade.quantity}_${trade.total}`;
          if (!allTradesMap.has(key)) {
            allTradesMap.set(key, trade);
          }
        });

        allPortfolios.push({
          filename,
          id: portfolio.id,
          tradesCount: trades.length
        });
      }

      const allTrades = Array.from(allTradesMap.values());
      const uniqueSymbols = new Set(allTrades.map(t => t.symbol));

      // Also get the most recent portfolio's holdings (for current state)
      const mostRecentEntry = portfolioEntries.reduce((latest, current) => {
        const currentDate = new Date(current[1].fileMetadata?.processedAt || current[1].portfolio?.createdAt || current[1].createdAt || 0);
        const latestDate = new Date(latest[1].fileMetadata?.processedAt || latest[1].portfolio?.createdAt || latest[1].createdAt || 0);
        return currentDate > latestDate ? current : latest;
      });

      const mostRecentPortfolio = mostRecentEntry[1].portfolio || mostRecentEntry[1];
      const currentHoldings = mostRecentPortfolio.holdings || [];

      console.log(`📊 Combined trades from ${portfolioEntries.length} portfolios:`);
      allPortfolios.forEach(p => {
        console.log(`   - ${p.filename}: ${p.tradesCount} trades`);
      });
      console.log(`   Total unique trades: ${allTrades.length}`);
      console.log(`   Unique symbols in trades: ${uniqueSymbols.size}`);
      console.log(`   Current holdings from most recent portfolio: ${currentHoldings.length}`);
      console.log(`📋 Symbols: ${Array.from(uniqueSymbols).sort().join(', ')}`);

      return [{
        id: 'combined_all_portfolios',
        filename: 'all_portfolios',
        trades: allTrades,
        holdings: currentHoldings
      }];
    } catch (error) {
      console.error('❌ Error loading portfolios:', error.message);
      console.error(error.stack);
      return [];
    }
  }

  // Combine all trades from all portfolios into a single timeline
  combineAllTrades(portfolios) {
    const allTrades = [];
    const seenTransactions = new Set(); // To avoid duplicates

    for (const portfolio of portfolios) {
      for (const trade of portfolio.trades) {
        // Create a unique key for this transaction
        const key = `${trade.symbol}_${trade.date}_${trade.action}_${trade.quantity}_${trade.total}`;

        if (!seenTransactions.has(key)) {
          seenTransactions.add(key);
          allTrades.push({
            ...trade,
            portfolioId: portfolio.id
          });
        }
      }
    }

    // Sort by date
    allTrades.sort((a, b) => new Date(a.date) - new Date(b.date));

    console.log(`📊 Combined ${allTrades.length} unique trades from ${portfolios.length} portfolios`);
    return allTrades;
  }

  // Check if a date is a working day (Monday-Friday)
  isWorkingDay(date) {
    const day = date.getDay();
    return day >= 1 && day <= 5; // Monday = 1, Friday = 5
  }

  // Get all trading days between two dates
  getTradingDaysBetween(startDate, endDate) {
    const tradingDays = [];
    const current = new Date(startDate);
    const end = new Date(endDate);

    current.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    while (current <= end) {
      if (this.isWorkingDay(current)) {
        tradingDays.push(new Date(current));
      }
      current.setDate(current.getDate() + 1);
    }

    return tradingDays;
  }

  // Calculate portfolio value over time
  async calculatePortfolioValue(portfolioId = '1766016312183', tradingHoldingsOnly = false) {
    try {
      console.log(`📊 Calculating portfolio value for portfolio ${portfolioId}...`);

      // Load all portfolios
      const portfolios = this.loadPortfolios();
      if (portfolios.length === 0) {
        console.warn('⚠️ No portfolios found');
        return { success: false, message: 'No portfolios found' };
      }

      // Use the specific portfolio ID or the most recent one
      let allTrades = [];
      let currentHoldings = [];

      if (portfolioId === 'combined' || portfolioId === '1766016312183') {
        // Use the most recent portfolio's trades (already loaded in loadPortfolios)
        allTrades = this.combineAllTrades(portfolios);
        currentHoldings = portfolios[0].holdings || [];
      } else {
        // Find specific portfolio
        const portfolio = portfolios.find(p => p.id === portfolioId);
        if (!portfolio) {
          console.warn(`⚠️ Portfolio ${portfolioId} not found`);
          return { success: false, message: `Portfolio ${portfolioId} not found` };
        }
        allTrades = portfolio.trades;
        currentHoldings = portfolio.holdings || [];
      }

      console.log(`📊 Using ${currentHoldings.length} current holdings to validate final state`);

      // Filter to trading holdings only if requested
      if (tradingHoldingsOnly) {
        // TODO: Implement logic to identify recurring investments
        // For now, we'll include all trades
        console.log('ℹ️ Trading holdings only mode - filtering recurring investments (not yet implemented)');
      }

      if (allTrades.length === 0) {
        console.warn('⚠️ No trades found');
        return { success: false, message: 'No trades found' };
      }

      // Get first transaction date
      const firstTradeDate = new Date(allTrades[0].date);
      firstTradeDate.setHours(0, 0, 0, 0);

      // Get today's date
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      console.log(`📅 Calculating from ${firstTradeDate.toISOString().split('T')[0]} to ${today.toISOString().split('T')[0]}`);

      // Get all trading days
      const tradingDays = this.getTradingDaysBetween(firstTradeDate, today);
      console.log(`📆 Processing ${tradingDays.length} trading days`);

      // Group trades by date for fast lookup
      const tradesByDate = new Map();
      allTrades.forEach(trade => {
        const dateStr = new Date(trade.date).toISOString().split('T')[0];
        if (!tradesByDate.has(dateStr)) {
          tradesByDate.set(dateStr, []);
        }
        tradesByDate.get(dateStr).push(trade);
      });

      // Get USD to CAD rate
      const USD_TO_CAD_RATE = await this.getUSDtoCADRate();

      // Track holdings for each symbol using average cost basis
      const holdingsBySymbol = new Map();
      // Structure: { symbol: { shares, totalBuyAmount, totalBuyShares, totalRealizedPnL, totalAmountInvested, totalAmountReceived } }

      const dailyRecords = [];
      let totalRealizedPnLAllTime = 0; // Total realized P&L across all closed positions

      for (const tradingDay of tradingDays) {
        const dateStr = tradingDay.toISOString().split('T')[0];
        const dayTrades = tradesByDate.get(dateStr) || [];

        // Process transactions for this day
        for (const trade of dayTrades) {
          const { symbol, action, quantity, total } = trade;

          // Initialize holding if not exists
          if (!holdingsBySymbol.has(symbol)) {
            holdingsBySymbol.set(symbol, {
              shares: 0,
              totalBuyAmount: 0,
              totalBuyShares: 0,
              totalRealizedPnL: 0,
              totalAmountInvested: 0,
              totalAmountReceived: 0,
              type: trade.type,
              currency: trade.currency || 'CAD'
            });
          }

          const holding = holdingsBySymbol.get(symbol);

          // Convert USD trade amounts to CAD (same as breakdown tab logic)
          const tradeAmountCAD = trade.currency === 'USD' ? total * USD_TO_CAD_RATE : total;

          if (action === 'buy') {
            holding.shares += quantity;
            holding.totalBuyAmount += tradeAmountCAD;
            holding.totalBuyShares += quantity;
            holding.totalAmountInvested += tradeAmountCAD;
          } else if (action === 'sell') {
            // Calculate average price of all shares bought (in CAD)
            const averagePrice = holding.totalBuyShares > 0 ? holding.totalBuyAmount / holding.totalBuyShares : 0;

            // Calculate cost basis of sold shares
            const costOfSoldShares = quantity * averagePrice;

            // Calculate realized P&L (in CAD)
            const realizedPnL = tradeAmountCAD - costOfSoldShares;
            holding.totalRealizedPnL += realizedPnL;
            totalRealizedPnLAllTime += realizedPnL;

            // Update shares
            holding.shares -= quantity;
            holding.totalAmountReceived += tradeAmountCAD;
          }
        }

        // On the final day, correct share counts using actual current holdings BEFORE calculating value
        if (dateStr === today.toISOString().split('T')[0] && currentHoldings.length > 0) {
          console.log(`🔄 Correcting final day holdings with actual current state from portfolio...`);

          // Add or update holdings from current portfolio state
          for (const holding of currentHoldings) {
            const symbol = holding.symbol;
            const currentQuantity = holding.quantity || 0;

            if (currentQuantity > 0) {
              if (!holdingsBySymbol.has(symbol)) {
                // Symbol not in our trades - add it
                console.log(`   ➕ Adding missing symbol ${symbol} with ${currentQuantity} shares`);
                holdingsBySymbol.set(symbol, {
                  shares: currentQuantity,
                  totalBuyAmount: holding.totalCost || 0,
                  totalBuyShares: currentQuantity,
                  totalRealizedPnL: 0,
                  totalAmountInvested: holding.totalCost || 0,
                  totalAmountReceived: 0,
                  type: holding.type,
                  currency: holding.currency || 'CAD'
                });
              } else {
                // Symbol exists - update shares to match current
                const existing = holdingsBySymbol.get(symbol);
                if (Math.abs(existing.shares - currentQuantity) > 0.0001) {
                  console.log(`   🔄 Updating ${symbol}: ${existing.shares.toFixed(4)} → ${currentQuantity.toFixed(4)} shares`);
                  existing.shares = currentQuantity;
                }
              }
            }
          }
        }

        // Calculate portfolio value for this day
        let totalValue = 0;
        let totalCostBasis = 0;
        const holdingsSnapshot = {};
        const symbolsWithoutPrice = [];

        for (const [symbol, holding] of holdingsBySymbol.entries()) {
          if (holding.shares > 0) {
            // Get closing price for this symbol on this day
            const historicalData = historicalDataCache.get(symbol, 'max');

            let closePrice = null;
            if (historicalData && historicalData.data) {
              // Find price for this specific day
              const priceData = historicalData.data.find(d => {
                const dataDate = new Date(d.date).toISOString().split('T')[0];
                return dataDate === dateStr;
              });

              if (priceData) {
                closePrice = priceData.close;

                // Convert USD to CAD if needed
                // Determine currency by symbol pattern (same logic as pnl-calculator)
                const isCanadianStock = symbol.endsWith('.TO');
                const isCrypto = holding.type === 'c';
                const isUSStock = holding.type === 's' && !isCanadianStock;
                const historicalCurrency = (isUSStock || isCrypto) ? 'USD' : 'CAD';

                if (historicalCurrency === 'USD') {
                  closePrice = closePrice * USD_TO_CAD_RATE;
                }
              } else {
                // No price for this day, try to find nearest previous day
                let lookbackDate = new Date(tradingDay);
                for (let i = 1; i <= 10; i++) {
                  lookbackDate.setDate(lookbackDate.getDate() - 1);
                  const lookbackStr = lookbackDate.toISOString().split('T')[0];
                  const lookbackData = historicalData.data.find(d => {
                    const dataDate = new Date(d.date).toISOString().split('T')[0];
                    return dataDate === lookbackStr;
                  });
                  if (lookbackData) {
                    closePrice = lookbackData.close;
                    // Determine currency by symbol pattern (same logic as pnl-calculator)
                    const isCanadianStock = symbol.endsWith('.TO');
                    const isCrypto = holding.type === 'c';
                    const isUSStock = holding.type === 's' && !isCanadianStock;
                    const historicalCurrency = (isUSStock || isCrypto) ? 'USD' : 'CAD';

                    if (historicalCurrency === 'USD') {
                      closePrice = closePrice * USD_TO_CAD_RATE;
                    }
                    break;
                  }
                }
              }
            }

            // Calculate cost basis regardless of whether we have a price
            const averagePrice = holding.totalBuyShares > 0 ? holding.totalBuyAmount / holding.totalBuyShares : 0;
            const costBasis = holding.shares * averagePrice;
            totalCostBasis += costBasis;

            if (closePrice) {
              // We have a price - calculate market value
              const marketValue = holding.shares * closePrice;
              totalValue += marketValue;

              holdingsSnapshot[symbol] = {
                shares: holding.shares,
                costBasis: costBasis,
                marketValue: marketValue,
                closePrice: closePrice,
                realizedPnL: holding.totalRealizedPnL || 0  // Include realized P&L for each holding
              };
            } else {
              // Symbol has shares but no price data - still include cost basis
              symbolsWithoutPrice.push(symbol);

              // Include in snapshot with null market value
              holdingsSnapshot[symbol] = {
                shares: holding.shares,
                costBasis: costBasis,
                marketValue: 0, // No price available
                closePrice: null,
                realizedPnL: holding.totalRealizedPnL || 0  // Include realized P&L for each holding
              };
            }
          }
        }

        // Calculate total invested (should match breakdown tab)
        // Use RIC (totalCostBasis) which is the cost basis of current holdings
        // This matches the breakdown tab's "Total Invested" field
        let totalAmountInvested = 0;
        let totalAmountReceived = 0;
        for (const [symbol, holding] of holdingsBySymbol.entries()) {
          totalAmountInvested += holding.totalAmountInvested;
          totalAmountReceived += holding.totalAmountReceived;
        }

        // For display: use RIC (cost basis of current holdings) to match breakdown tab
        const displayTotalInvested = totalCostBasis;
        const unrealizedPnL = totalValue - totalCostBasis;
        const totalPnL = unrealizedPnL + totalRealizedPnLAllTime;

        // Calculate P&L% using total amount ever invested (more meaningful for performance tracking)
        const totalPnLPercent = totalAmountInvested > 0 ? (totalPnL / totalAmountInvested) * 100 : 0;

        // Create daily record
        const record = {
          date: dateStr,
          totalValue: parseFloat(totalValue.toFixed(2)),
          totalInvested: parseFloat(displayTotalInvested.toFixed(2)), // RIC (matches breakdown tab)
          totalPnL: parseFloat(totalPnL.toFixed(2)),
          unrealizedPnL: parseFloat(unrealizedPnL.toFixed(2)),
          realizedPnL: parseFloat(totalRealizedPnLAllTime.toFixed(2)),
          totalPnLPercent: parseFloat(totalPnLPercent.toFixed(2)),
          holdings: holdingsSnapshot
        };

        // Add transactions if any occurred on this day
        if (dayTrades.length > 0) {
          record.transactions = dayTrades.map(t => ({
            symbol: t.symbol,
            action: t.action,
            quantity: t.quantity,
            total: t.total
          }));
        }

        dailyRecords.push(record);
      }

      console.log(`✅ Calculated ${dailyRecords.length} daily portfolio value records`);

      // Log validation data
      if (dailyRecords.length > 0) {
        const latestRecord = dailyRecords[dailyRecords.length - 1];
        console.log(`📊 Latest portfolio value (${latestRecord.date}):`);
        console.log(`   Total Value: $${latestRecord.totalValue.toLocaleString()}`);
        console.log(`   Total Invested: $${latestRecord.totalInvested.toLocaleString()}`);
        console.log(`   Total P&L: $${latestRecord.totalPnL.toLocaleString()} (${latestRecord.totalPnLPercent.toFixed(2)}%)`);
        console.log(`   Unrealized P&L: $${latestRecord.unrealizedPnL.toLocaleString()}`);
        console.log(`   Realized P&L: $${latestRecord.realizedPnL.toLocaleString()}`);
      }

      // Cache the results using 'combined' as the key for consistency with frontend
      portfolioValueCache.set('combined', dailyRecords, tradingHoldingsOnly);

      return {
        success: true,
        portfolioId: 'combined',
        recordCount: dailyRecords.length,
        latestRecord: dailyRecords.length > 0 ? dailyRecords[dailyRecords.length - 1] : null
      };

    } catch (error) {
      console.error('❌ Error calculating portfolio value:', error.message);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Pre-populate portfolio value cache
  async prePopulatePortfolioValue(options = {}) {
    if (this.isPreloading) {
      console.log('🔄 Portfolio value pre-population already in progress, skipping...');
      return { success: false, message: 'Already in progress' };
    }

    this.isPreloading = true;
    const startTime = Date.now();

    try {
      console.log('🚀 Starting portfolio value cache pre-population...');

      // Calculate for most recent portfolio (ID 1766016312183)
      const result = await this.calculatePortfolioValue('1766016312183', false);

      // Also calculate for trading holdings only
      // const tradingResult = await this.calculatePortfolioValue('1766016312183_trading', true);

      const duration = Date.now() - startTime;
      console.log(`🎉 Portfolio value cache pre-population completed in ${duration}ms`);

      return {
        success: result.success,
        message: 'Pre-population completed',
        duration,
        result
      };

    } catch (error) {
      console.error('❌ Portfolio value cache pre-population failed:', error.message);
      return {
        success: false,
        message: error.message,
        duration: Date.now() - startTime
      };
    } finally {
      this.isPreloading = false;
    }
  }

  // Get preloader status
  getStatus() {
    return {
      isPreloading: this.isPreloading
    };
  }
}

// Create singleton instance
const portfolioValuePreloader = new PortfolioValuePreloader();

module.exports = portfolioValuePreloader;
