const fs = require('fs');
const path = require('path');

class HoldingsCache {
  constructor() {
    this.cacheFile = path.join(__dirname, 'holdings-cache.json');
    this.cache = new Map();
    this.loadCache();
  }

  // Load cache from file on startup
  loadCache() {
    try {
      if (fs.existsSync(this.cacheFile)) {
        const data = fs.readFileSync(this.cacheFile, 'utf8');
        const cacheData = JSON.parse(data);
        this.cache = new Map(Object.entries(cacheData));
        console.log(`📦 Loaded ${this.cache.size} cached holdings from file`);
      }
    } catch (error) {
      console.warn('⚠️ Could not load holdings cache:', error.message);
      this.cache = new Map();
    }
  }

  // Save cache to file
  saveCache() {
    try {
      const cacheData = Object.fromEntries(this.cache);
      fs.writeFileSync(this.cacheFile, JSON.stringify(cacheData, null, 2));
    } catch (error) {
      console.error('❌ Could not save holdings cache:', error.message);
    }
  }

  // Get cached holding data
  get(symbol) {
    const cached = this.cache.get(symbol);
    if (!cached) return null;

    // Check if cache is still valid (less than 1 hour old)
    const now = new Date();
    const cacheAge = now - new Date(cached.lastUpdated);
    const maxAge = 60 * 60 * 1000; // 1 hour in milliseconds

    if (cacheAge > maxAge) {
      console.log(`⏰ Cache expired for ${symbol}, removing from cache`);
      this.cache.delete(symbol);
      this.saveCache();
      return null;
    }

    return cached;
  }

  // Set holding data in cache
  set(symbol, data) {
    const cacheEntry = {
      symbol: symbol,
      price: data.price,
      usdPrice: data.usdPrice,
      cadPrice: data.cadPrice,
      companyName: data.companyName,
      exchangeRate: data.exchangeRate,
      lastUpdated: new Date().toISOString(),
      priceDate: new Date().toISOString()
    };

    this.cache.set(symbol, cacheEntry);
    this.saveCache();
    console.log(`💾 Cached data for ${symbol}: $${data.cadPrice} CAD`);
  }

  // Update cache with new data (only if not null)
  update(symbol, data) {
    if (!data || !data.price) {
      console.log(`⚠️ Skipping cache update for ${symbol}: no valid price data`);
      return;
    }

    this.set(symbol, data);
  }

  // Get all cached symbols
  getAllSymbols() {
    return Array.from(this.cache.keys());
  }

  // Clear expired entries
  cleanup() {
    const now = new Date();
    const maxAge = 60 * 60 * 1000; // 1 hour
    let cleanedCount = 0;

    for (const [symbol, data] of this.cache.entries()) {
      const cacheAge = now - new Date(data.lastUpdated);
      if (cacheAge > maxAge) {
        this.cache.delete(symbol);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} expired cache entries`);
      this.saveCache();
    }
  }

  // Get cache statistics
  getStats() {
    return {
      totalEntries: this.cache.size,
      symbols: this.getAllSymbols(),
      cacheFile: this.cacheFile
    };
  }
}

// Create singleton instance
const holdingsCache = new HoldingsCache();

// Cleanup expired entries every 30 minutes
setInterval(() => {
  holdingsCache.cleanup();
}, 30 * 60 * 1000);

module.exports = holdingsCache; 