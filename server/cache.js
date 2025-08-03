const fs = require('fs');
const path = require('path');

class HoldingsCache {
  constructor() {
    this.cacheFile = path.join(__dirname, 'data', 'cache', 'holdings-cache.json');
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
        console.log(`📁 Created cache directory: ${cacheDir}`);
      }
    } catch (error) {
      console.warn('⚠️ Could not create cache directory:', error.message);
    }
  }

  // Load cache from file on startup
  loadCache() {
    try {
      if (fs.existsSync(this.cacheFile)) {
        const data = fs.readFileSync(this.cacheFile, 'utf8');
        const cacheData = JSON.parse(data);
        this.cache = new Map(Object.entries(cacheData));
        console.log(`📦 Loaded ${this.cache.size} cached holdings from file`);
      } else {
        console.log('📦 No cache file found, starting with empty cache');
      }
    } catch (error) {
      console.warn('⚠️ Could not load holdings cache:', error.message);
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
      console.error('❌ Could not save holdings cache:', error.message);
    }
  }

  // Get cached holding data (never expires - persistent cache)
  get(symbol) {
    return this.cache.get(symbol) || null;
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
      priceDate: data.priceDate || new Date().toISOString(), // Store when the price data refers to
      fetchedAt: data.fetchedAt || new Date().toISOString() // Store when we fetched this data
    };

    this.cache.set(symbol, cacheEntry);
    this.saveCache();
    console.log(`💾 Cached data for ${symbol}: $${data.cadPrice} CAD (price date: ${cacheEntry.priceDate})`);
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

  // Check if cached data is stale (older than 1 hour fetch time)
  isStale(symbol) {
    const cached = this.cache.get(symbol);
    if (!cached || !cached.fetchedAt) return true;
    
    const now = new Date();
    const fetchAge = now - new Date(cached.fetchedAt);
    const maxAge = 60 * 60 * 1000; // 1 hour
    
    return fetchAge > maxAge;
  }

  // Manual cleanup method (removes all entries - use sparingly)
  clearAll() {
    const count = this.cache.size;
    this.cache.clear();
    this.saveCache();
    console.log(`🧹 Manually cleared ${count} cache entries`);
    return count;
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

// No automatic cleanup - cache persists until manually cleared or updated

module.exports = holdingsCache; 