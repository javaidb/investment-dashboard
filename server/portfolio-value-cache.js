const fs = require('fs');
const path = require('path');

/**
 * PortfolioValueCache - Permanent Storage for Portfolio Value Over Time
 *
 * DESIGN PRINCIPLES:
 *
 * 1. APPEND-ONLY: Portfolio value history is NEVER deleted, only added to
 *    - Once daily value is calculated, it remains forever
 *    - New trading days are appended incrementally
 *    - No automatic cleanup or expiration of old data
 *
 * 2. FOR NEW PORTFOLIOS:
 *    - Calculate complete value history from first transaction
 *    - Store all daily value snapshots
 *
 * 3. FOR EXISTING PORTFOLIOS:
 *    - Check last calculated date
 *    - Calculate and append only missing trading days
 *    - Never recalculate or overwrite existing data
 *
 * 4. CACHE STRUCTURE:
 *    {
 *      "portfolio_<id>": {
 *        "lastModified": "ISO timestamp",
 *        "dailyRecords": [
 *          {
 *            "date": "YYYY-MM-DD",
 *            "totalValue": Number,
 *            "totalInvested": Number,
 *            "totalPnL": Number,
 *            "unrealizedPnL": Number,
 *            "realizedPnL": Number,
 *            "totalPnLPercent": Number,
 *            "holdings": { "SYMBOL": {...} },
 *            "transactions": [...]
 *          }
 *        ],
 *        "tradingHoldingsOnly": Boolean,
 *        "earliestDate": "YYYY-MM-DD",
 *        "latestDate": "YYYY-MM-DD",
 *        "dateSpanDays": Number
 *      }
 *    }
 */
class PortfolioValueCache {
  constructor() {
    this.cacheFile = path.join(__dirname, 'data', 'cache', 'portfolio-value-cache.json');
    this.cache = new Map(); // Structure: portfolio_id -> {lastModified, dailyRecords: []}
    this.ensureCacheDirectory();
    this.loadCache();
  }

  // Ensure cache directory exists
  ensureCacheDirectory() {
    try {
      const cacheDir = path.dirname(this.cacheFile);
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
        console.log(`📁 Created portfolio value cache directory: ${cacheDir}`);
      }
    } catch (error) {
      console.warn('⚠️ Could not create portfolio value cache directory:', error.message);
    }
  }

  // Load cache from file on startup
  loadCache() {
    try {
      if (fs.existsSync(this.cacheFile)) {
        const data = fs.readFileSync(this.cacheFile, 'utf8');
        const cacheData = JSON.parse(data);
        this.cache = new Map(Object.entries(cacheData));
        console.log(`📦 Loaded ${this.cache.size} portfolio value cache entries from file`);
      } else {
        console.log('📦 No portfolio value cache file found, starting with empty cache');
      }
    } catch (error) {
      console.warn('⚠️ Could not load portfolio value cache:', error.message);
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
      console.error('❌ Could not save portfolio value cache:', error.message);
    }
  }

  // Check if a date is a working day (Monday-Friday)
  isWorkingDay(date) {
    const day = date.getDay();
    return day >= 1 && day <= 5; // Monday = 1, Friday = 5
  }

  // Get all missing trading days between a start date and today
  getMissingTradingDays(lastDataDate) {
    const missingDays = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today

    if (!lastDataDate) {
      // No existing data, return empty array (will trigger full fetch)
      return [];
    }

    const startDate = new Date(lastDataDate);
    startDate.setDate(startDate.getDate() + 1); // Start from day after last data
    startDate.setHours(0, 0, 0, 0);

    // Find all working days between lastDataDate and today (inclusive)
    const currentDate = new Date(startDate);
    while (currentDate <= today) {
      if (this.isWorkingDay(currentDate)) {
        missingDays.push(new Date(currentDate));
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return missingDays;
  }

  // Format date for consistent storage
  formatDate(date) {
    return date.toISOString().split('T')[0]; // YYYY-MM-DD format
  }

  // Get local timestamp in ISO format
  getLocalTimestamp() {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const localTime = new Date(now.getTime() - (offset * 60 * 1000));
    return localTime.toISOString().slice(0, -1) + 'Z'; // Keep Z suffix for consistency
  }

  // Check if cached data needs update by finding missing trading days
  needsUpdate(portfolioId) {
    const cached = this.cache.get(portfolioId);

    if (!cached || !cached.dailyRecords || cached.dailyRecords.length === 0) {
      return { needsUpdate: true, lastDate: null, missingDays: [] }; // No cache data
    }

    // Get the last date in our data
    const sortedData = [...cached.dailyRecords].sort((a, b) => new Date(b.date) - new Date(a.date));
    const lastDate = sortedData[0].date;

    // Find missing trading days since last data date
    const missingDays = this.getMissingTradingDays(lastDate);
    const needsUpdate = missingDays.length > 0;

    return {
      needsUpdate,
      lastDate,
      missingDays,
      daysMissing: missingDays.length
    };
  }

  // Get cached portfolio value data with optional period filtering
  get(portfolioId, period = null) {
    const cached = this.cache.get(portfolioId);

    if (!cached || !cached.dailyRecords) {
      return null;
    }

    let data = cached.dailyRecords;

    // Filter data to requested period if specified
    if (period && Array.isArray(data)) {
      const periodDays = {
        '1m': 30,
        '3m': 90,
        '6m': 180,
        '1y': 365,
        'max': null // Return all data
      };

      const requestedDays = periodDays[period];
      if (requestedDays) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - requestedDays);

        data = data.filter(point => new Date(point.date) >= cutoffDate);
      }
    }

    // Sort data by date (earliest first for consistency)
    data.sort((a, b) => new Date(a.date) - new Date(b.date));

    const updateStatus = this.needsUpdate(portfolioId);

    return {
      portfolioId,
      data,
      lastModified: cached.lastModified,
      filteredPeriod: period,
      totalDataPoints: cached.dailyRecords ? cached.dailyRecords.length : 0,
      filteredDataPoints: data.length,
      needsUpdate: updateStatus.needsUpdate,
      lastDate: updateStatus.lastDate,
      tradingHoldingsOnly: cached.tradingHoldingsOnly || false
    };
  }

  // Calculate date metadata for cache entry
  calculateDateMetadata(data) {
    if (!Array.isArray(data) || data.length === 0) {
      return {
        earliestDate: null,
        latestDate: null,
        dateSpanDays: 0
      };
    }

    const dates = data.map(d => new Date(d.date)).filter(d => !isNaN(d));
    if (dates.length === 0) {
      return {
        earliestDate: null,
        latestDate: null,
        dateSpanDays: 0
      };
    }

    dates.sort((a, b) => a - b);
    const earliest = dates[0];
    const latest = dates[dates.length - 1];
    const spanMs = latest - earliest;
    const spanDays = Math.floor(spanMs / (1000 * 60 * 60 * 24));

    return {
      earliestDate: earliest.toISOString().split('T')[0],
      latestDate: latest.toISOString().split('T')[0],
      dateSpanDays: spanDays
    };
  }

  // Set complete portfolio value data in cache (replaces existing data)
  set(portfolioId, dailyRecords, tradingHoldingsOnly = false) {
    const dataArray = Array.isArray(dailyRecords) ? dailyRecords : [];
    const dateMetadata = this.calculateDateMetadata(dataArray);

    const cacheEntry = {
      lastModified: this.getLocalTimestamp(),
      dailyRecords: dataArray,
      tradingHoldingsOnly,
      ...dateMetadata
    };

    this.cache.set(portfolioId, cacheEntry);
    this.saveCache();

    const dataPoints = cacheEntry.dailyRecords.length;
    const spanInfo = dateMetadata.dateSpanDays > 0 ? ` (${dateMetadata.dateSpanDays} days span)` : '';
    console.log(`💾 Cached portfolio value for ${portfolioId}: ${dataPoints} daily records${spanInfo}`);
  }

  // Update cache with incremental data (merges with existing)
  updateIncremental(portfolioId, newRecords, tradingHoldingsOnly = false) {
    if (!newRecords || !Array.isArray(newRecords) || newRecords.length === 0) {
      console.log(`⚠️ Skipping incremental cache update for ${portfolioId}: no valid data`);
      return;
    }

    const existing = this.cache.get(portfolioId);
    let combinedData = [];

    if (existing && existing.dailyRecords) {
      // Merge existing data with new data, avoiding duplicates
      const existingDates = new Set(existing.dailyRecords.map(d => d.date));
      const uniqueNewData = newRecords.filter(d => !existingDates.has(d.date));

      combinedData = [...existing.dailyRecords, ...uniqueNewData];
      console.log(`🔄 Incremental update for ${portfolioId}: added ${uniqueNewData.length} new daily records`);
    } else {
      combinedData = newRecords;
      console.log(`🆕 Initial data for ${portfolioId}: ${newRecords.length} daily records`);
    }

    // Sort by date to maintain chronological order
    combinedData.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculate date metadata
    const dateMetadata = this.calculateDateMetadata(combinedData);

    const cacheEntry = {
      lastModified: this.getLocalTimestamp(),
      dailyRecords: combinedData,
      tradingHoldingsOnly,
      ...dateMetadata
    };

    this.cache.set(portfolioId, cacheEntry);
    this.saveCache();

    const spanInfo = dateMetadata.dateSpanDays > 0 ? ` (${dateMetadata.dateSpanDays} days span)` : '';
    console.log(`💾 Updated portfolio value cache for ${portfolioId}: ${combinedData.length} total daily records${spanInfo}`);
  }

  // Get all cached portfolio IDs
  getAllPortfolioIds() {
    return Array.from(this.cache.keys());
  }

  // Manual cleanup method (removes all entries)
  // ⚠️ WARNING: This permanently deletes ALL portfolio value history!
  // Only use this for debugging or if the cache is corrupted
  clearAll() {
    const count = this.cache.size;
    console.warn(`🚨 WARNING: About to delete ALL ${count} portfolio value cache entries - this is PERMANENT!`);
    this.cache.clear();
    this.saveCache();
    console.log(`🧹 Manually cleared ${count} portfolio value cache entries`);
    return count;
  }

  // Clear cache for a specific portfolio
  clear(portfolioId) {
    if (this.cache.has(portfolioId)) {
      this.cache.delete(portfolioId);
      this.saveCache();
      console.log(`🧹 Cleared portfolio value cache for ${portfolioId}`);
      return true;
    }
    return false;
  }

  // Get cache statistics
  getStats() {
    const stats = {
      totalPortfolios: this.cache.size,
      cacheFile: this.cacheFile,
      portfolios: {},
      needsUpdateCount: 0,
      totalDataPoints: 0
    };

    // Analyze each portfolio
    for (const [portfolioId, value] of this.cache.entries()) {
      const updateStatus = this.needsUpdate(portfolioId);
      const dataPoints = Array.isArray(value.dailyRecords) ? value.dailyRecords.length : 0;

      // Get date range
      let dateRange = null;
      if (value.dailyRecords && value.dailyRecords.length > 0) {
        const sortedDates = value.dailyRecords.map(d => d.date).sort();
        dateRange = {
          earliest: sortedDates[0],
          latest: sortedDates[sortedDates.length - 1]
        };
      }

      // Get latest portfolio value
      let latestValue = null;
      if (value.dailyRecords && value.dailyRecords.length > 0) {
        const sortedRecords = [...value.dailyRecords].sort((a, b) => new Date(b.date) - new Date(a.date));
        latestValue = sortedRecords[0];
      }

      stats.portfolios[portfolioId] = {
        lastModified: value.lastModified,
        dataPoints,
        dateRange,
        earliestDate: value.earliestDate,
        latestDate: value.latestDate,
        dateSpanDays: value.dateSpanDays,
        needsUpdate: updateStatus.needsUpdate,
        lastDate: updateStatus.lastDate,
        missingDays: updateStatus.missingDays || [],
        daysMissing: updateStatus.daysMissing || 0,
        tradingHoldingsOnly: value.tradingHoldingsOnly || false,
        latestValue: latestValue ? {
          totalValue: latestValue.totalValue,
          totalInvested: latestValue.totalInvested,
          totalPnL: latestValue.totalPnL,
          totalPnLPercent: latestValue.totalPnLPercent
        } : null
      };

      if (updateStatus.needsUpdate) {
        stats.needsUpdateCount++;
      }

      stats.totalDataPoints += dataPoints;
    }

    return stats;
  }
}

// Create singleton instance
const portfolioValueCache = new PortfolioValueCache();

module.exports = portfolioValueCache;
