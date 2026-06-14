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

  // Reload cache from disk into memory
  reloadFromDisk() {
    this.loadCache();
    return this.cache.size;
  }

  // Get cached holding data (never expires - persistent cache)
  get(symbol) {
    return this.cache.get(symbol) || null;
  }

  // Set holding data in cache
  set(symbol, data) {
    const existing = this.cache.get(symbol);
    const cacheEntry = {
      symbol: symbol,
      price: data.price,
      usdPrice: data.usdPrice,
      cadPrice: data.cadPrice,
      companyName: data.companyName,
      sector: data.sector || existing?.sector || null, // Preserve existing sector if not provided
      subsector: data.subsector !== undefined ? data.subsector : (existing?.subsector || null), // Preserve existing subsector
      otherSectors: data.otherSectors !== undefined ? data.otherSectors : (existing?.otherSectors || null), // Preserve existing other sectors
      conviction: data.conviction !== undefined ? data.conviction : (existing?.conviction || null), // Preserve existing conviction
      exchangeRate: data.exchangeRate,
      lastUpdated: new Date().toISOString(),
      priceDate: data.priceDate || new Date().toISOString(), // Store when the price data refers to
      fetchedAt: data.fetchedAt || new Date().toISOString(), // Store when we fetched this data
      targets: existing?.targets || data.targets || {
        // Default targets calculated from average buy price
        defaultRiskPrice: null,
        defaultRewardPrice: null,
        // Custom user-defined targets (override defaults if set)
        customRiskPrice: null,
        customRewardPrice: null
      }
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

    // Preserve existing sector and conviction if not provided in update (these don't change with price updates)
    const existing = this.cache.get(symbol);
    if (existing && existing.sector && !data.sector) {
      data.sector = existing.sector;
    }
    if (existing && existing.subsector !== undefined && data.subsector === undefined) {
      data.subsector = existing.subsector;
    }
    if (existing && existing.otherSectors !== undefined && data.otherSectors === undefined) {
      data.otherSectors = existing.otherSectors;
    }
    if (existing && existing.conviction !== undefined && data.conviction === undefined) {
      data.conviction = existing.conviction;
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

  // Update target prices for a symbol
  updateTargets(symbol, targets) {
    const cached = this.cache.get(symbol);
    if (!cached) {
      console.warn(`⚠️ Cannot update targets for ${symbol}: symbol not in cache`);
      return false;
    }

    // Merge with existing targets
    cached.targets = {
      ...cached.targets,
      ...targets
    };

    this.cache.set(symbol, cached);
    this.saveCache();
    console.log(`🎯 Updated targets for ${symbol}:`, targets);
    return true;
  }

  // Get targets for a symbol
  getTargets(symbol) {
    const cached = this.cache.get(symbol);
    return cached?.targets || null;
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