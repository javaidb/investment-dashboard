const pnlCache = require('./pnl-cache');
const historicalDataCache = require('./historical-cache');

/**
 * PnLCalculator - Calculate daily P&L for portfolio assets
 *
 * This module processes portfolio trades and calculates daily P&L
 * by combining transaction history with historical price data.
 */
class PnLCalculator {
  /**
   * Calculate daily PnL for a single asset from trades
   * @param {string} symbol - Asset symbol
   * @param {Array} trades - Array of trades for this symbol
   * @param {Object} assetInfo - Asset metadata (type, currency)
   * @returns {Array} Daily PnL records
   */
  async calculateDailyPnL(symbol, trades, assetInfo = {}) {
    if (!trades || trades.length === 0) {
      console.log(`⚠️ No trades provided for ${symbol}`);
      return [];
    }

    // Sort trades by date (earliest first)
    const sortedTrades = [...trades].sort((a, b) => new Date(a.date) - new Date(b.date));

    // Get first purchase date
    const firstPurchaseDate = new Date(sortedTrades[0].date);
    firstPurchaseDate.setHours(0, 0, 0, 0);

    // Get today's date
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    console.log(`📊 Calculating PnL for ${symbol} from ${firstPurchaseDate.toISOString().split('T')[0]} to ${today.toISOString().split('T')[0]}`);

    // Get historical price data from cache
    const historicalData = historicalDataCache.get(symbol, 'max');
    if (!historicalData || !historicalData.data || historicalData.data.length === 0) {
      console.warn(`⚠️ No historical price data found for ${symbol}`);
      return [];
    }

    // Create a map of dates to closing prices for fast lookup
    const priceMap = new Map();
    historicalData.data.forEach(dataPoint => {
      const dateStr = new Date(dataPoint.date).toISOString().split('T')[0];
      priceMap.set(dateStr, dataPoint.close);
    });

    // Get all trading days from first purchase to today
    const tradingDays = this.getTradingDaysBetween(firstPurchaseDate, today);

    // Create a map of dates to transactions for fast lookup
    const transactionMap = new Map();
    sortedTrades.forEach(trade => {
      const dateStr = new Date(trade.date).toISOString().split('T')[0];
      if (!transactionMap.has(dateStr)) {
        transactionMap.set(dateStr, []);
      }
      transactionMap.get(dateStr).push({
        action: trade.action,
        quantity: trade.quantity,
        timestamp: new Date(trade.date).getTime(), // Keep timestamp for sorting
        price: trade.price,
        total: trade.total,
        time: trade.date
      });
    });

    // Calculate daily PnL records
    const dailyRecords = [];
    let totalShares = 0;
    let totalCostBasis = 0; // Total amount invested in current position
    let totalRealizedPnL = 0; // Cumulative realized P&L from sells
    let totalAmountInvested = 0; // Total ever invested (for accurate P&L %)
    let totalAmountReceived = 0; // Total received from sells

    // Track cost basis per share using FIFO (First In, First Out)
    const shareLots = []; // [{quantity, costPerShare, purchaseDate}]

    for (const tradingDay of tradingDays) {
      const dateStr = tradingDay.toISOString().split('T')[0];

      // Get closing price for this day FIRST (before processing transactions)
      let closePrice = priceMap.get(dateStr);

      // If no price for this specific day, try to find the nearest previous day
      if (!closePrice) {
        let lookbackDate = new Date(tradingDay);
        for (let i = 1; i <= 10; i++) {
          lookbackDate.setDate(lookbackDate.getDate() - 1);
          const lookbackStr = lookbackDate.toISOString().split('T')[0];
          closePrice = priceMap.get(lookbackStr);
          if (closePrice) break;
        }
      }

      // Skip days where we have no price data AND no transactions
      const dayTransactions = transactionMap.get(dateStr) || [];
      if (!closePrice && dayTransactions.length === 0) {
        console.warn(`⚠️ No price data or transactions for ${symbol} on ${dateStr}, skipping`);
        continue;
      }

      // Sort transactions within the day: buys first, then sells (by timestamp if same type)
      dayTransactions.sort((a, b) => {
        if (a.action === 'buy' && b.action === 'sell') return -1;
        if (a.action === 'sell' && b.action === 'buy') return 1;
        return a.timestamp - b.timestamp;
      });

      // Process any transactions on this day
      let dayRealizedPnL = 0;

      for (const transaction of dayTransactions) {
        if (transaction.action === 'buy') {
          const quantity = transaction.quantity;
          const costPerShare = transaction.total / quantity;

          // Add to share lots for FIFO tracking
          shareLots.push({
            quantity,
            costPerShare,
            purchaseDate: dateStr
          });

          totalShares += quantity;
          totalCostBasis += transaction.total;
          totalAmountInvested += transaction.total;

        } else if (transaction.action === 'sell') {
          const quantityToSell = transaction.quantity;
          let remainingToSell = quantityToSell;
          let costOfSoldShares = 0;
          let actualQuantitySold = 0; // Track actual shares sold from lots

          // Use FIFO to calculate cost basis of sold shares
          while (remainingToSell > 0 && shareLots.length > 0) {
            const lot = shareLots[0];

            if (lot.quantity <= remainingToSell) {
              // Sell entire lot
              costOfSoldShares += lot.quantity * lot.costPerShare;
              actualQuantitySold += lot.quantity;
              remainingToSell -= lot.quantity;
              shareLots.shift(); // Remove lot
            } else {
              // Sell partial lot
              costOfSoldShares += remainingToSell * lot.costPerShare;
              actualQuantitySold += remainingToSell;
              lot.quantity -= remainingToSell;
              remainingToSell = 0;
            }
          }

          // Only decrement by actual shares sold (not the requested amount)
          totalShares -= actualQuantitySold;
          totalCostBasis -= costOfSoldShares;

          // Calculate realized P&L from this sale
          const saleProceeds = transaction.total;
          dayRealizedPnL += saleProceeds - costOfSoldShares;
          totalAmountReceived += saleProceeds;
        }
      }

      totalRealizedPnL += dayRealizedPnL;

      // If still no price, use the last known price or skip
      if (!closePrice) {
        console.warn(`⚠️ No price data for ${symbol} on ${dateStr} but has transactions, using last known price or 0`);
        closePrice = dailyRecords.length > 0 ? dailyRecords[dailyRecords.length - 1].price : 0;
      }

      // Calculate market value and P&L
      const marketValue = totalShares * closePrice;
      const unrealizedPnL = marketValue - totalCostBasis;
      const totalPnL = unrealizedPnL + totalRealizedPnL;

      // Calculate P&L percentage
      // Use total amount invested (ever) for accurate percentage
      const denominator = totalAmountInvested - totalAmountReceived;
      const totalPnLPercent = denominator > 0 ? (totalPnL / denominator) * 100 : 0;

      // Create daily record
      const record = {
        date: dateStr,
        shares: totalShares,
        costBasis: totalCostBasis,
        marketValue,
        unrealizedPnL,
        realizedPnL: totalRealizedPnL,
        totalPnL,
        totalPnLPercent,
        closePrice
      };

      // Add transactions if any occurred on this day
      if (dayTransactions.length > 0) {
        record.transactions = dayTransactions;
      }

      dailyRecords.push(record);
    }

    console.log(`✅ Calculated ${dailyRecords.length} daily PnL records for ${symbol}`);
    return dailyRecords;
  }

  /**
   * Calculate and cache daily PnL for multiple assets
   * @param {Object} portfolio - Portfolio object with trades
   * @returns {Object} Results summary
   */
  async calculateAndCachePortfolioPnL(portfolio) {
    if (!portfolio || !portfolio.trades || !Array.isArray(portfolio.trades)) {
      console.warn('⚠️ Invalid portfolio structure');
      return {
        success: false,
        message: 'Invalid portfolio structure',
        processed: 0
      };
    }

    // Group trades by symbol
    const tradesBySymbol = new Map();
    portfolio.trades.forEach(trade => {
      if (!tradesBySymbol.has(trade.symbol)) {
        tradesBySymbol.set(trade.symbol, {
          trades: [],
          assetInfo: {
            symbol: trade.symbol,
            type: trade.type,
            currency: trade.currency || 'CAD'
          }
        });
      }
      tradesBySymbol.get(trade.symbol).trades.push(trade);
    });

    console.log(`📊 Processing PnL for ${tradesBySymbol.size} assets`);

    const results = {
      success: true,
      processed: 0,
      failed: 0,
      symbols: []
    };

    // Process each symbol
    for (const [symbol, data] of tradesBySymbol.entries()) {
      try {
        const dailyRecords = await this.calculateDailyPnL(
          symbol,
          data.trades,
          data.assetInfo
        );

        if (dailyRecords && dailyRecords.length > 0) {
          pnlCache.set(symbol, data.assetInfo, dailyRecords);
          results.processed++;
          results.symbols.push({
            symbol,
            recordCount: dailyRecords.length,
            success: true
          });
        } else {
          results.failed++;
          results.symbols.push({
            symbol,
            success: false,
            error: 'No daily records generated'
          });
        }
      } catch (error) {
        console.error(`❌ Failed to calculate PnL for ${symbol}:`, error.message);
        results.failed++;
        results.symbols.push({
          symbol,
          success: false,
          error: error.message
        });
      }
    }

    console.log(`✅ PnL calculation complete: ${results.processed} succeeded, ${results.failed} failed`);
    return results;
  }

  /**
   * Update PnL cache with new trading days (incremental update)
   * @param {string} symbol - Asset symbol
   * @param {Array} trades - All trades for this symbol
   * @param {Object} assetInfo - Asset metadata
   * @returns {Object} Update result
   */
  async updatePnL(symbol, trades, assetInfo) {
    const existingCache = pnlCache.get(symbol);

    if (!existingCache) {
      // No existing cache, do full calculation
      console.log(`🆕 No existing PnL cache for ${symbol}, calculating full history`);
      const dailyRecords = await this.calculateDailyPnL(symbol, trades, assetInfo);
      if (dailyRecords && dailyRecords.length > 0) {
        pnlCache.set(symbol, assetInfo, dailyRecords);
        return {
          success: true,
          type: 'full',
          recordCount: dailyRecords.length
        };
      }
      return { success: false, error: 'No records generated' };
    }

    // Check if update is needed
    const updateStatus = pnlCache.needsUpdate(symbol);
    if (!updateStatus.needsUpdate) {
      console.log(`✅ PnL cache for ${symbol} is up to date`);
      return {
        success: true,
        type: 'no-update-needed',
        recordCount: existingCache.dailyRecords.length
      };
    }

    // Calculate only missing days
    console.log(`🔄 Updating PnL for ${symbol}: ${updateStatus.missingDays} missing days`);
    const fullRecords = await this.calculateDailyPnL(symbol, trades, assetInfo);

    if (fullRecords && fullRecords.length > 0) {
      pnlCache.set(symbol, assetInfo, fullRecords);
      return {
        success: true,
        type: 'incremental',
        recordCount: fullRecords.length,
        newRecords: updateStatus.missingDays
      };
    }

    return { success: false, error: 'Failed to generate records' };
  }

  // Helper: Get all trading days between two dates
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

  // Helper: Check if date is a working day
  isWorkingDay(date) {
    const day = date.getDay();
    return day >= 1 && day <= 5; // Monday = 1, Friday = 5
  }
}

// Create singleton instance
const pnlCalculator = new PnLCalculator();

module.exports = pnlCalculator;
