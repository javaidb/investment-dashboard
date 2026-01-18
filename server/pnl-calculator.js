const pnlCache = require('./pnl-cache');
const historicalDataCache = require('./historical-cache');
const axios = require('axios');

// Currency conversion cache
const currencyCache = new Map();
const CURRENCY_CACHE_DURATION = 60 * 60 * 1000; // 1 hour

// Helper function to get USD to CAD exchange rate
async function getUSDtoCADRate() {
  const cacheKey = 'usd_cad_rate';
  const cached = currencyCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CURRENCY_CACHE_DURATION) {
    console.log(`✅ Using cached USD/CAD rate: ${cached.rate}`);
    return cached.rate;
  }

  try {
    console.log('🌐 Fetching USD/CAD exchange rate...');
    const response = await axios.get('https://api.exchangerate-api.com/v4/latest/USD', {
      timeout: 10000
    });

    const rate = response.data.rates.CAD;
    console.log(`✅ Fetched USD/CAD rate: ${rate}`);

    // Cache the rate
    currencyCache.set(cacheKey, {
      rate: rate,
      timestamp: Date.now()
    });

    return rate;
  } catch (error) {
    console.warn('⚠️ Failed to fetch USD/CAD rate, using fallback rate of 1.35');
    // Fallback rate (approximate USD/CAD rate)
    return 1.35;
  }
}

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

    // Determine if we need to convert USD prices to CAD
    // Historical prices for US stocks and crypto are in USD, but trades are stored in CAD
    // US stocks: symbols without .TO suffix
    // Canadian stocks: symbols with .TO suffix
    // Crypto: all in USD
    const isCanadianStock = symbol.endsWith('.TO');
    const isCrypto = assetInfo.type === 'c';
    const isUSStock = assetInfo.type === 's' && !isCanadianStock;

    // Historical prices are in USD for: US stocks and crypto
    // Historical prices are in CAD for: Canadian stocks (.TO)
    const historicalCurrency = (isUSStock || isCrypto) ? 'USD' : 'CAD';
    const needsCurrencyConversion = historicalCurrency === 'USD';

    // Get current USD to CAD exchange rate
    let USD_TO_CAD_RATE = 1.35; // Default fallback
    if (needsCurrencyConversion) {
      USD_TO_CAD_RATE = await getUSDtoCADRate();
      const assetTypeLabel = assetInfo.type === 'c' ? 'crypto' : 'stock';
      console.log(`💱 ${symbol} (${assetTypeLabel}) prices in historical cache are USD, converting to CAD (rate: ${USD_TO_CAD_RATE})`);
    }

    // Create a map of dates to closing prices for fast lookup
    const priceMap = new Map();
    historicalData.data.forEach(dataPoint => {
      const dateStr = new Date(dataPoint.date).toISOString().split('T')[0];
      // Convert USD prices to CAD if needed
      const closePrice = needsCurrencyConversion ? dataPoint.close * USD_TO_CAD_RATE : dataPoint.close;
      priceMap.set(dateStr, closePrice);
    });

    // Get all trading days from first purchase to today
    // Pass asset type so crypto can include weekends
    const tradingDays = this.getTradingDaysBetween(firstPurchaseDate, today, assetInfo.type);

    // Create a map of dates to transactions for fast lookup
    const transactionMap = new Map();
    sortedTrades.forEach(trade => {
      let tradeDate = new Date(trade.date);
      let dateStr = tradeDate.toISOString().split('T')[0];

      // For stocks, move weekend transactions to next Monday
      if (assetInfo.type === 's') {
        const dayOfWeek = tradeDate.getUTCDay();
        if (dayOfWeek === 0) { // Sunday -> Monday
          tradeDate.setUTCDate(tradeDate.getUTCDate() + 1);
          const newDateStr = tradeDate.toISOString().split('T')[0];
          console.warn(`⚠️ ${symbol}: Moving Sunday transaction from ${dateStr} to Monday ${newDateStr}`);
          dateStr = newDateStr;
        } else if (dayOfWeek === 6) { // Saturday -> Monday
          tradeDate.setUTCDate(tradeDate.getUTCDate() + 2);
          const newDateStr = tradeDate.toISOString().split('T')[0];
          console.warn(`⚠️ ${symbol}: Moving Saturday transaction from ${dateStr} to Monday ${newDateStr}`);
          dateStr = newDateStr;
        }
      }

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


    // Get USD to CAD exchange rate for currency conversion
    const usdToCadRate = await getUSDtoCADRate();

    // Calculate average price from ALL buys (matches breakdown tab method)
    // This average is fixed and used for all cost basis calculations
    // IMPORTANT: Convert all USD trades to CAD first (matches breakdown tab logic)
    let totalBuyAmount = 0;
    let totalBuyShares = 0;
    sortedTrades.forEach(trade => {
      if (trade.action === 'buy') {
        // Convert USD trades to CAD (same as breakdown tab in portfolio.js:2036)
        const tradeTotalCAD = trade.currency === 'USD' ? trade.total * usdToCadRate : trade.total;
        totalBuyAmount += tradeTotalCAD;
        totalBuyShares += trade.quantity;
      }
    });
    const fixedAveragePrice = totalBuyShares > 0 ? totalBuyAmount / totalBuyShares : 0;

    console.log(`📊 ${symbol} average cost: $${fixedAveragePrice.toFixed(2)} CAD (from all buys: $${totalBuyAmount.toFixed(2)} CAD / ${totalBuyShares.toFixed(8)} shares, exchange rate: ${usdToCadRate})`);

    // Calculate daily PnL records using AVERAGE COST BASIS (equity method per spec)
    // Using the breakdown tab approach: fixed average from all buys, RIC = Units × Avg
    // State Variables (per spec):
    // - Units (totalShares): current units held
    // - RIC (totalCostBasis): Remaining Invested Capital = Units × FixedAverage
    // - Realized_PnL (totalRealizedPnL): cumulative realized profit
    // - Rolling Cost Basis: tracked separately for visualization (changes with each transaction)
    const dailyRecords = [];
    let totalShares = 0; // Units
    let totalRealizedPnL = 0; // Realized_PnL (cumulative realized profit)
    let totalAmountInvested = 0; // Total ever invested (for accurate P&L %)
    let totalAmountReceived = 0; // Total received from sells
    let rollingCostBasis = 0; // Rolling cost basis for visualization (changes with transactions)

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
          // Convert USD to CAD for consistency (matches breakdown tab)
          const amount = transaction.total; // Already in the trade's currency
          // Note: transaction.total in the transactionMap is already the original trade.total
          // We need to check the original trade's currency
          // Since we don't have currency in transaction object, we need to look at original trades
          // For now, assume transactions inherit currency from original trades stored in sortedTrades
          const originalTrade = sortedTrades.find(t =>
            t.date === transaction.time &&
            t.action === transaction.action &&
            t.quantity === transaction.quantity
          );
          const amountCAD = originalTrade && originalTrade.currency === 'USD'
            ? amount * usdToCadRate
            : amount;

          // Per spec & breakdown tab: Buy Transaction Rules
          // Units += Units_Bought
          totalShares += quantity;

          // Track total invested for P&L percentage calculation (in CAD)
          totalAmountInvested += amountCAD;

          // Update rolling cost basis: add the cost of this purchase
          rollingCostBasis += amountCAD;

        } else if (transaction.action === 'sell') {
          const quantity = transaction.quantity;
          // Convert USD to CAD for consistency (matches breakdown tab)
          const saleProceeds = transaction.total;
          const originalTrade = sortedTrades.find(t =>
            t.date === transaction.time &&
            t.action === transaction.action &&
            t.quantity === transaction.quantity
          );
          const saleProceedsCAD = originalTrade && originalTrade.currency === 'USD'
            ? saleProceeds * usdToCadRate
            : saleProceeds;

          // Calculate average price at time of sale for rolling cost basis
          const avgPriceAtSale = totalShares > 0 ? rollingCostBasis / totalShares : 0;

          // Per spec & breakdown tab: Use fixed average cost from ALL buys (in CAD)
          // Cost_Sold = Units_Sold × FixedAvg
          const costOfSoldShares = quantity * fixedAveragePrice;

          // Per spec: Sell Transaction Rules
          // Units -= Units_Sold
          totalShares -= quantity;

          // Calculate realized P&L from this sale (in CAD)
          // Realized_PnL += Sale_Proceeds − Cost_Sold
          const salePnL = saleProceedsCAD - costOfSoldShares;
          dayRealizedPnL += salePnL;
          totalAmountReceived += saleProceedsCAD;

          // Update rolling cost basis: subtract the cost of sold shares (using average at sale time)
          rollingCostBasis -= (quantity * avgPriceAtSale);

        }
      }

      totalRealizedPnL += dayRealizedPnL;

      // If still no price, use the last known price or skip
      if (!closePrice) {
        console.warn(`⚠️ No price data for ${symbol} on ${dateStr} but has transactions, using last known price or 0`);
        closePrice = dailyRecords.length > 0 ? dailyRecords[dailyRecords.length - 1].price : 0;
      }

      // Calculate RIC (Remaining Invested Capital) using fixed average
      // Per breakdown tab: RIC = Units × FixedAvg (matches spec: unrealized = market - RIC)
      const totalCostBasis = totalShares * fixedAveragePrice;

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
        rollingCostBasis, // Dynamic cost basis for breakeven price visualization
        marketValue,
        unrealizedPnL,
        realizedPnL: totalRealizedPnL,
        totalPnL,
        totalPnLPercent,
        closePrice,
        totalAmountInvested, // Total ever invested (for accurate P&L calculation)
        totalAmountReceived  // Total received from sells
      };

      // Add transactions if any occurred on this day
      if (dayTransactions.length > 0) {
        record.transactions = dayTransactions;
      }

      dailyRecords.push(record);
    }

    console.log(`✅ Calculated ${dailyRecords.length} daily PnL records for ${symbol} using average cost basis (equity method)`);

    // DEBUG: Log final calculation results
    if (dailyRecords.length > 0) {
      const lastRecord = dailyRecords[dailyRecords.length - 1];
      console.log(`🔍 Final state for ${symbol}: Shares=${lastRecord.shares.toFixed(8)}, RIC=$${lastRecord.costBasis.toFixed(2)}, Realized P&L=$${lastRecord.realizedPnL.toFixed(2)}, Unrealized P&L=$${lastRecord.unrealizedPnL.toFixed(2)}`);
    }

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
  getTradingDaysBetween(startDate, endDate, assetType = 's') {
    const tradingDays = [];
    const current = new Date(startDate);
    const end = new Date(endDate);

    current.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    while (current <= end) {
      if (this.isWorkingDay(current, assetType)) {
        tradingDays.push(new Date(current));
      }
      current.setDate(current.getDate() + 1);
    }

    return tradingDays;
  }

  // Helper: Check if date is a working day
  isWorkingDay(date, assetType = 's') {
    // Crypto trades 24/7, so all days are trading days
    if (assetType === 'c') {
      return true;
    }

    // Stocks only trade on weekdays
    const day = date.getDay();
    return day >= 1 && day <= 5; // Monday = 1, Friday = 5
  }
}

// Create singleton instance
const pnlCalculator = new PnLCalculator();

module.exports = pnlCalculator;
