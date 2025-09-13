const fs = require('fs');
const path = require('path');

class HistoricalDataCache {
  constructor() {
    this.cacheFile = path.join(__dirname, 'data', 'cache', 'historical-cache.json');
    this.cache = new Map(); // Structure: symbol -> {lastModified, data: []}
    this.ensureCacheDirectory();
    this.loadCache();
  }

  // Ensure cache directory exists
  ensureCacheDirectory() {
    try {
      const cacheDir = path.dirname(this.cacheFile);
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
        console.log(`📁 Created historical cache directory: ${cacheDir}`);
      }
    } catch (error) {
      console.warn('⚠️ Could not create historical cache directory:', error.message);
    }
  }

  // Load cache from file on startup
  loadCache() {
    try {
      if (fs.existsSync(this.cacheFile)) {
        const data = fs.readFileSync(this.cacheFile, 'utf8');
        const cacheData = JSON.parse(data);
        this.cache = new Map(Object.entries(cacheData));
        console.log(`📦 Loaded ${this.cache.size} historical cache entries from file`);
      } else {
        console.log('📦 No historical cache file found, starting with empty cache');
      }
    } catch (error) {
      console.warn('⚠️ Could not load historical cache:', error.message);
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
      console.error('❌ Could not save historical cache:', error.message);
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

  // Get the last working day before today (kept for compatibility)
  getLastWorkingDay() {
    const today = new Date();
    let lastWorkingDay = new Date(today);
    
    // If today is a working day, use today as the cutoff
    if (this.isWorkingDay(today)) {
      // Set to start of today to ensure cache updates on working days
      lastWorkingDay.setHours(0, 0, 0, 0);
      return lastWorkingDay;
    }
    
    // Otherwise, go back day by day until we find a working day
    lastWorkingDay.setDate(today.getDate() - 1);
    while (!this.isWorkingDay(lastWorkingDay)) {
      lastWorkingDay.setDate(lastWorkingDay.getDate() - 1);
    }
    
    // Set to end of that working day
    lastWorkingDay.setHours(23, 59, 59, 999);
    return lastWorkingDay;
  }

  // Parse date string to Date object
  parseDate(dateStr) {
    return new Date(dateStr);
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
  needsUpdate(symbol) {
    const cached = this.cache.get(symbol);
    
    if (!cached || !cached.data || cached.data.length === 0) {
      return { needsUpdate: true, lastDate: null, missingDays: [] }; // No cache data
    }
    
    // Get the last date in our data
    const sortedData = [...cached.data].sort((a, b) => new Date(b.date) - new Date(a.date));
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

  // Get cached historical data with optional period filtering
  get(symbol, period = null) {
    const cached = this.cache.get(symbol);
    
    if (!cached || !cached.data) {
      return null;
    }
    
    let data = cached.data;
    
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
    
    const updateStatus = this.needsUpdate(symbol);
    
    return {
      symbol,
      data,
      lastModified: cached.lastModified,
      filteredPeriod: period,
      totalDataPoints: cached.data ? cached.data.length : 0,
      filteredDataPoints: data.length,
      needsUpdate: updateStatus.needsUpdate,
      lastDate: updateStatus.lastDate
    };
  }

  // Calculate date metadata for cache entry
  calculateDateMetadata(data) {
    if (!Array.isArray(data) || data.length === 0) {
      return {
        earliestLoggedDate: null,
        latestLoggedDate: null,
        dateSpanDays: 0
      };
    }

    const dates = data.map(d => new Date(d.date)).filter(d => !isNaN(d));
    if (dates.length === 0) {
      return {
        earliestLoggedDate: null,
        latestLoggedDate: null,
        dateSpanDays: 0
      };
    }

    dates.sort((a, b) => a - b);
    const earliest = dates[0];
    const latest = dates[dates.length - 1];
    const spanMs = latest - earliest;
    const spanDays = Math.floor(spanMs / (1000 * 60 * 60 * 24));

    return {
      earliestLoggedDate: earliest.toISOString().split('T')[0],
      latestLoggedDate: latest.toISOString().split('T')[0],
      dateSpanDays: spanDays
    };
  }

  // Set complete historical data in cache (replaces existing data)
  set(symbol, data, metadata = null) {
    const dataArray = Array.isArray(data) ? data : (data.data || []);
    const dateMetadata = this.calculateDateMetadata(dataArray);
    
    const cacheEntry = {
      lastModified: this.getLocalTimestamp(),
      data: dataArray,
      ...dateMetadata
    };

    // Add asset metadata if provided
    if (metadata) {
      cacheEntry.assetInfo = {
        name: metadata.longName || metadata.shortName || symbol,
        symbol: metadata.symbol || symbol,
        instrumentType: metadata.instrumentType || 'UNKNOWN',
        currency: metadata.currency || 'USD',
        exchange: metadata.exchangeName || metadata.fullExchangeName || 'UNKNOWN'
      };
    }

    this.cache.set(symbol, cacheEntry);
    this.saveCache();
    
    const dataPoints = cacheEntry.data.length;
    const assetName = metadata?.longName ? ` (${metadata.longName})` : '';
    const spanInfo = dateMetadata.dateSpanDays > 0 ? ` (${dateMetadata.dateSpanDays} days span)` : '';
    console.log(`💾 Cached complete historical data for ${symbol}${assetName}: ${dataPoints} data points${spanInfo}`);
  }

  // Update cache with incremental data (merges with existing)
  updateIncremental(symbol, newData) {
    if (!newData || !Array.isArray(newData) || newData.length === 0) {
      console.log(`⚠️ Skipping incremental cache update for ${symbol}: no valid data`);
      return;
    }

    const existing = this.cache.get(symbol);
    let combinedData = [];

    if (existing && existing.data) {
      // Merge existing data with new data, avoiding duplicates
      const existingDates = new Set(existing.data.map(d => d.date));
      const uniqueNewData = newData.filter(d => !existingDates.has(d.date));
      
      combinedData = [...existing.data, ...uniqueNewData];
      console.log(`🔄 Incremental update for ${symbol}: added ${uniqueNewData.length} new data points`);
    } else {
      combinedData = newData;
      console.log(`🆕 Initial data for ${symbol}: ${newData.length} data points`);
    }

    // Sort by date to maintain chronological order
    combinedData.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculate date metadata
    const dateMetadata = this.calculateDateMetadata(combinedData);

    const cacheEntry = {
      lastModified: this.getLocalTimestamp(),
      data: combinedData,
      ...dateMetadata
    };

    // Preserve existing asset info if available
    if (existing && existing.assetInfo) {
      cacheEntry.assetInfo = existing.assetInfo;
    }

    this.cache.set(symbol, cacheEntry);
    this.saveCache();
    
    const spanInfo = dateMetadata.dateSpanDays > 0 ? ` (${dateMetadata.dateSpanDays} days span)` : '';
    console.log(`💾 Updated cache for ${symbol}: ${combinedData.length} total data points${spanInfo}`);
  }

  // Get all cached symbols
  getAllSymbols() {
    return Array.from(this.cache.keys());
  }

  // Clear cache entries older than a specified number of days
  clearOldEntries(daysOld = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    let removedCount = 0;
    for (const [symbol, value] of this.cache.entries()) {
      if (value.lastModified && new Date(value.lastModified) < cutoffDate) {
        this.cache.delete(symbol);
        removedCount++;
      }
    }
    
    if (removedCount > 0) {
      this.saveCache();
      console.log(`🧹 Removed ${removedCount} old historical cache entries (older than ${daysOld} days)`);
    }
    
    return removedCount;
  }

  // Manual cleanup method (removes all entries)
  clearAll() {
    const count = this.cache.size;
    this.cache.clear();
    this.saveCache();
    console.log(`🧹 Manually cleared ${count} historical cache entries`);
    return count;
  }

  // Get cache statistics
  getStats() {
    const stats = {
      totalSymbols: this.cache.size,
      cacheFile: this.cacheFile,
      symbols: {},
      needsUpdateCount: 0,
      totalDataPoints: 0
    };

    // Analyze each symbol
    for (const [symbol, value] of this.cache.entries()) {
      const updateStatus = this.needsUpdate(symbol);
      const dataPoints = Array.isArray(value.data) ? value.data.length : 0;
      
      // Get date range
      let dateRange = null;
      if (value.data && value.data.length > 0) {
        const sortedDates = value.data.map(d => d.date).sort();
        dateRange = {
          earliest: sortedDates[0],
          latest: sortedDates[sortedDates.length - 1]
        };
      }
      
      stats.symbols[symbol] = {
        lastModified: value.lastModified,
        dataPoints,
        dateRange,
        earliestLoggedDate: value.earliestLoggedDate,
        latestLoggedDate: value.latestLoggedDate,
        dateSpanDays: value.dateSpanDays,
        needsUpdate: updateStatus.needsUpdate,
        lastDate: updateStatus.lastDate,
        missingDays: updateStatus.missingDays || [],
        daysMissing: updateStatus.daysMissing || 0,
        assetInfo: value.assetInfo
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
const historicalDataCache = new HistoricalDataCache();

// Auto-cleanup old entries and refresh cache on startup
setTimeout(async () => {
  try {
    // First cleanup old entries
    historicalDataCache.clearOldEntries(30); // Remove entries older than 30 days
    
    // Then refresh stale cache entries
    const stats = historicalDataCache.getStats();
    if (stats.needsUpdateCount > 0) {
      console.log(`🔄 Found ${stats.needsUpdateCount} historical cache entries needing updates, refreshing...`);
      
      // Import preloader dynamically to avoid circular dependency
      const historicalDataPreloader = require('./historical-data-preloader');
      const preloader = historicalDataPreloader;
      
      const result = await preloader.prePopulateHistoricalCache();
      if (result.success) {
        console.log(`✅ Historical cache startup refresh completed: ${result.symbolsProcessed} symbols processed in ${result.duration}ms`);
      } else {
        console.log(`⚠️ Historical cache startup refresh: ${result.message}`);
      }
    } else {
      console.log('✅ All historical cache entries are up to date, no startup refresh needed');
    }
  } catch (error) {
    console.warn('⚠️ Historical cache startup refresh failed:', error.message);
  }
}, 10000); // Wait 10 seconds after startup to allow server to fully initialize

module.exports = historicalDataCache;