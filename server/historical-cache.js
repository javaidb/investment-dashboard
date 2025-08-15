const fs = require('fs');
const path = require('path');

class HistoricalDataCache {
  constructor() {
    this.cacheFile = path.join(__dirname, 'data', 'cache', 'historical-cache.json');
    this.cache = new Map();
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

  // Get the last working day before today
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

  // Generate cache key for historical data (stable keys for performance graphs)
  generateCacheKey(symbol, period = '3m', resolution = '1d') {
    return `${symbol}_${period}_${resolution}`;
  }

  // Check if cached data needs update (only update if not updated since last working day)
  needsUpdate(symbol, period = '3m', resolution = '1d') {
    const cacheKey = this.generateCacheKey(symbol, period, resolution);
    const cached = this.cache.get(cacheKey);
    
    if (!cached || !cached.lastUpdated) {
      return true; // No cache or no update timestamp
    }
    
    const lastUpdated = new Date(cached.lastUpdated);
    const lastWorkingDay = this.getLastWorkingDay();
    
    // If we haven't updated since the last working day, we need to update
    return lastUpdated < lastWorkingDay;
  }

  // Get cached historical data
  get(symbol, period = '3m', resolution = '1d') {
    const cacheKey = this.generateCacheKey(symbol, period, resolution);
    const cached = this.cache.get(cacheKey);
    
    if (!cached) {
      return null;
    }
    
    // Return the cached data even if it needs update - let caller decide
    return {
      ...cached,
      needsUpdate: this.needsUpdate(symbol, period, resolution)
    };
  }

  // Set historical data in cache
  set(symbol, data, period = '3m', resolution = '1d') {
    const cacheKey = this.generateCacheKey(symbol, period, resolution);
    
    const cacheEntry = {
      symbol: symbol,
      period: period,
      resolution: resolution,
      data: data.data || [],
      meta: data.meta || {},
      dateRange: data.dateRange || {},
      lastUpdated: new Date().toISOString(),
      fetchedAt: new Date().toISOString()
    };

    this.cache.set(cacheKey, cacheEntry);
    this.saveCache();
    
    const dataPoints = Array.isArray(cacheEntry.data) ? cacheEntry.data.length : 0;
    console.log(`💾 Cached historical data for ${symbol} (${period}/${resolution}): ${dataPoints} data points`);
  }

  // Update cache with new data (only if not null/empty)
  update(symbol, data, period = '3m', resolution = '1d') {
    if (!data || !data.data || !Array.isArray(data.data) || data.data.length === 0) {
      console.log(`⚠️ Skipping historical cache update for ${symbol}: no valid data`);
      return;
    }

    this.set(symbol, data, period, resolution);
  }

  // Get all cached symbols for a specific period/resolution
  getAllSymbols(period = '3m', resolution = '1d') {
    const symbols = [];
    for (const [key, value] of this.cache.entries()) {
      if (value.period === period && value.resolution === resolution) {
        symbols.push(value.symbol);
      }
    }
    return symbols;
  }

  // Clear cache entries older than a specified number of days
  clearOldEntries(daysOld = 7) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    let removedCount = 0;
    for (const [key, value] of this.cache.entries()) {
      if (value.lastUpdated && new Date(value.lastUpdated) < cutoffDate) {
        this.cache.delete(key);
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
      totalEntries: this.cache.size,
      cacheFile: this.cacheFile,
      entriesByType: {},
      needsUpdateCount: 0
    };

    // Group by period/resolution
    for (const [key, value] of this.cache.entries()) {
      const type = `${value.period}/${value.resolution}`;
      if (!stats.entriesByType[type]) {
        stats.entriesByType[type] = [];
      }
      stats.entriesByType[type].push({
        symbol: value.symbol,
        lastUpdated: value.lastUpdated,
        dataPoints: Array.isArray(value.data) ? value.data.length : 0,
        needsUpdate: this.needsUpdate(value.symbol, value.period, value.resolution)
      });
      
      if (this.needsUpdate(value.symbol, value.period, value.resolution)) {
        stats.needsUpdateCount++;
      }
    }

    return stats;
  }
}

// Create singleton instance
const historicalDataCache = new HistoricalDataCache();

// Auto-cleanup old entries on startup
setTimeout(() => {
  historicalDataCache.clearOldEntries(7); // Remove entries older than 7 days
}, 5000); // Wait 5 seconds after startup

module.exports = historicalDataCache;