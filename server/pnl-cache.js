const fs = require('fs');
const path = require('path');

/**
 * PnLCache - Daily Portfolio P&L Tracking System
 *
 * DESIGN PRINCIPLES:
 *
 * 1. DAILY TRACKING: Record daily portfolio performance for each asset
 *    - Start from first purchase date of each asset
 *    - Track quantity, cost basis, and P&L daily
 *    - Include transaction details (buys/sells) on transaction dates
 *
 * 2. DATA STRUCTURE:
 *    {
 *      "SYMBOL": {
 *        "assetInfo": {
 *          "symbol": "SYMBOL",
 *          "type": "s" | "c",  // stock or crypto
 *          "currency": "USD" | "CAD",
 *          "firstPurchaseDate": "YYYY-MM-DD"
 *        },
 *        "dailyRecords": [
 *          {
 *            "date": "YYYY-MM-DD",
 *            "shares": 100,              // Total shares owned at end of day
 *            "costBasis": 5000,          // Total amount invested (CAD)
 *            "marketValue": 5500,        // Current value at closing price
 *            "unrealizedPnL": 500,       // Market value - cost basis
 *            "realizedPnL": 0,           // Total realized P&L to date
 *            "totalPnL": 500,            // Unrealized + realized
 *            "totalPnLPercent": 10,      // (Total P&L / Total invested) * 100
 *            "closePrice": 55,           // Closing price for the day
 *            "transactions": [           // Optional: only on days with trades
 *              {
 *                "action": "buy" | "sell",
 *                "quantity": 10,
 *                "price": 50,
 *                "total": 500,
 *                "time": "ISO timestamp"
 *              }
 *            ]
 *          },
 *          ...
 *        ],
 *        "lastModified": "ISO timestamp",
 *        "latestDate": "YYYY-MM-DD"
 *      }
 *    }
 *
 * 3. UPDATE STRATEGY:
 *    - For new assets: calculate full history from first purchase to today
 *    - For existing assets: append missing days since last update
 *    - Daily updates add only new trading days
 *
 * 4. PERFORMANCE:
 *    - Leverages historical-cache for price data (no redundant API calls)
 *    - File-based persistence across server restarts
 *    - Incremental updates minimize recalculation
 */
class PnLCache {
  constructor() {
    this.cacheFile = path.join(__dirname, 'data', 'cache', 'pnl-cache.json');
    this.cache = new Map(); // Structure: symbol -> {assetInfo, dailyRecords, lastModified}
    this.ensureCacheDirectory();
    this.loadCache();
  }

  // Ensure cache directory exists
  ensureCacheDirectory() {
    try {
      const cacheDir = path.dirname(this.cacheFile);
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
        console.log(`📁 Created PnL cache directory: ${cacheDir}`);
      }
    } catch (error) {
      console.warn('⚠️ Could not create PnL cache directory:', error.message);
    }
  }

  // Load cache from file on startup
  loadCache() {
    try {
      if (fs.existsSync(this.cacheFile)) {
        const data = fs.readFileSync(this.cacheFile, 'utf8');
        const cacheData = JSON.parse(data);
        this.cache = new Map(Object.entries(cacheData));
        console.log(`📦 Loaded ${this.cache.size} PnL cache entries from file`);
      } else {
        console.log('📦 No PnL cache file found, starting with empty cache');
      }
    } catch (error) {
      console.warn('⚠️ Could not load PnL cache:', error.message);
      this.cache = new Map();
    }
  }

  // Save cache to file
  saveCache() {
    try {
      this.ensureCacheDirectory();
      const cacheData = Object.fromEntries(this.cache);
      fs.writeFileSync(this.cacheFile, JSON.stringify(cacheData, null, 2));
    } catch (error) {
      console.error('❌ Could not save PnL cache:', error.message);
    }
  }

  // Get local timestamp in ISO format
  getLocalTimestamp() {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const localTime = new Date(now.getTime() - (offset * 60 * 1000));
    return localTime.toISOString().slice(0, -1) + 'Z';
  }

  // Format date for consistent storage
  formatDate(date) {
    if (typeof date === 'string') {
      return new Date(date).toISOString().split('T')[0];
    }
    return date.toISOString().split('T')[0]; // YYYY-MM-DD format
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

  // Get PnL data for a symbol with optional date range
  get(symbol, startDate = null, endDate = null) {
    const cached = this.cache.get(symbol);

    if (!cached || !cached.dailyRecords) {
      return null;
    }

    let records = cached.dailyRecords;

    // Filter by date range if specified
    if (startDate || endDate) {
      const start = startDate ? new Date(startDate) : new Date('1900-01-01');
      const end = endDate ? new Date(endDate) : new Date();

      records = records.filter(record => {
        const recordDate = new Date(record.date);
        return recordDate >= start && recordDate <= end;
      });
    }

    return {
      symbol,
      assetInfo: cached.assetInfo,
      dailyRecords: records,
      lastModified: cached.lastModified,
      totalRecords: cached.dailyRecords.length,
      filteredRecords: records.length
    };
  }

  // Set complete PnL history for a symbol
  set(symbol, assetInfo, dailyRecords) {
    if (!dailyRecords || !Array.isArray(dailyRecords) || dailyRecords.length === 0) {
      console.warn(`⚠️ No daily records provided for ${symbol}`);
      return;
    }

    // Sort records by date (earliest first)
    dailyRecords.sort((a, b) => new Date(a.date) - new Date(b.date));

    const cacheEntry = {
      assetInfo: {
        symbol: assetInfo.symbol || symbol,
        type: assetInfo.type,
        currency: assetInfo.currency || 'CAD',
        firstPurchaseDate: dailyRecords[0].date
      },
      dailyRecords,
      lastModified: this.getLocalTimestamp(),
      latestDate: dailyRecords[dailyRecords.length - 1].date
    };

    this.cache.set(symbol, cacheEntry);
    this.saveCache();

    console.log(`💾 Cached PnL history for ${symbol}: ${dailyRecords.length} daily records from ${cacheEntry.assetInfo.firstPurchaseDate} to ${cacheEntry.latestDate}`);
  }

  // Update PnL cache with new daily records (append-only)
  updateIncremental(symbol, newRecords) {
    if (!newRecords || !Array.isArray(newRecords) || newRecords.length === 0) {
      console.log(`⚠️ No new records to update for ${symbol}`);
      return;
    }

    const existing = this.cache.get(symbol);
    let combinedRecords = [];

    if (existing && existing.dailyRecords) {
      // Merge existing records with new ones, avoiding duplicates
      const existingDates = new Set(existing.dailyRecords.map(r => r.date));
      const uniqueNewRecords = newRecords.filter(r => !existingDates.has(r.date));

      combinedRecords = [...existing.dailyRecords, ...uniqueNewRecords];
      console.log(`🔄 Incremental update for ${symbol}: added ${uniqueNewRecords.length} new daily records`);
    } else {
      combinedRecords = newRecords;
      console.log(`🆕 Initial PnL data for ${symbol}: ${newRecords.length} daily records`);
    }

    // Sort by date to maintain chronological order
    combinedRecords.sort((a, b) => new Date(a.date) - new Date(b.date));

    const cacheEntry = {
      assetInfo: existing?.assetInfo || {
        symbol,
        type: 's', // Default to stock, will be updated
        currency: 'CAD',
        firstPurchaseDate: combinedRecords[0].date
      },
      dailyRecords: combinedRecords,
      lastModified: this.getLocalTimestamp(),
      latestDate: combinedRecords[combinedRecords.length - 1].date
    };

    this.cache.set(symbol, cacheEntry);
    this.saveCache();

    console.log(`💾 Updated PnL cache for ${symbol}: ${combinedRecords.length} total daily records`);
  }

  // Get all cached symbols
  getAllSymbols() {
    return Array.from(this.cache.keys());
  }

  // Check if cache needs update (has missing days)
  needsUpdate(symbol) {
    const cached = this.cache.get(symbol);

    if (!cached || !cached.dailyRecords || cached.dailyRecords.length === 0) {
      return { needsUpdate: true, lastDate: null, missingDays: 0 };
    }

    const lastDate = cached.latestDate;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastRecordDate = new Date(lastDate);
    const missingDays = this.getTradingDaysBetween(lastRecordDate, today)
      .filter(date => date > lastRecordDate).length;

    return {
      needsUpdate: missingDays > 0,
      lastDate,
      missingDays
    };
  }

  // Clear all PnL cache entries
  clearAll() {
    const count = this.cache.size;
    console.warn(`🚨 WARNING: Deleting ALL ${count} PnL cache entries`);
    this.cache.clear();
    this.saveCache();
    console.log(`🧹 Cleared ${count} PnL cache entries`);
    return count;
  }

  // Clear PnL data for a specific symbol
  clearSymbol(symbol) {
    const existed = this.cache.has(symbol);
    this.cache.delete(symbol);
    if (existed) {
      this.saveCache();
      console.log(`🧹 Cleared PnL cache for ${symbol}`);
    }
    return existed;
  }

  // Get cache statistics
  getStats() {
    const stats = {
      totalSymbols: this.cache.size,
      cacheFile: this.cacheFile,
      symbols: {},
      needsUpdateCount: 0,
      totalRecords: 0
    };

    for (const [symbol, value] of this.cache.entries()) {
      const updateStatus = this.needsUpdate(symbol);
      const recordCount = value.dailyRecords?.length || 0;

      stats.symbols[symbol] = {
        assetInfo: value.assetInfo,
        recordCount,
        firstDate: value.assetInfo?.firstPurchaseDate,
        latestDate: value.latestDate,
        lastModified: value.lastModified,
        needsUpdate: updateStatus.needsUpdate,
        missingDays: updateStatus.missingDays
      };

      if (updateStatus.needsUpdate) {
        stats.needsUpdateCount++;
      }

      stats.totalRecords += recordCount;
    }

    return stats;
  }
}

// Create singleton instance
const pnlCache = new PnLCache();

module.exports = pnlCache;
