const fs = require('fs');
const path = require('path');

class WatchlistCache {
  constructor() {
    this.cacheFile = path.join(__dirname, 'data', 'cache', 'watchlist-cache.json');
    this.cache = {
      active: [], // symbols with quantity > 0
      inactive: [], // symbols with quantity === 0 (all shares sold)
      custom: [] // manually added symbols to track
    };
    this.ensureCacheDirectory();
    this.loadCache();
  }

  // Ensure cache directory exists
  ensureCacheDirectory() {
    try {
      const cacheDir = path.dirname(this.cacheFile);
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
        console.log(`📁 Created watchlist cache directory: ${cacheDir}`);
      }
    } catch (error) {
      console.warn('⚠️ Could not create watchlist cache directory:', error.message);
    }
  }

  // Load cache from file on startup
  loadCache() {
    try {
      if (fs.existsSync(this.cacheFile)) {
        const data = fs.readFileSync(this.cacheFile, 'utf8');
        const loaded = JSON.parse(data);
        // Ensure custom array exists for backward compatibility
        this.cache = {
          active: loaded.active || [],
          inactive: loaded.inactive || [],
          custom: loaded.custom || []
        };
        console.log(`📋 Loaded watchlist: ${this.cache.active.length} active, ${this.cache.inactive.length} inactive, ${this.cache.custom.length} custom symbols`);
      } else {
        console.log('📋 No watchlist cache found, starting empty');
      }
    } catch (error) {
      console.warn('⚠️ Could not load watchlist cache:', error.message);
      this.cache = { active: [], inactive: [], custom: [] };
    }
  }

  // Save cache to file
  saveCache() {
    try {
      this.ensureCacheDirectory();
      fs.writeFileSync(this.cacheFile, JSON.stringify(this.cache, null, 2));
      console.log(`💾 Saved watchlist: ${this.cache.active.length} active, ${this.cache.inactive.length} inactive, ${this.cache.custom.length} custom symbols`);
    } catch (error) {
      console.error('❌ Could not save watchlist cache:', error.message);
    }
  }

  // Update watchlist from portfolio holdings
  updateFromHoldings(holdings) {
    if (!holdings || !Array.isArray(holdings)) {
      console.warn('⚠️ Invalid holdings data for watchlist update');
      return;
    }

    const activeSymbols = new Set();
    const inactiveSymbols = new Set();
    const MIN_QUANTITY_THRESHOLD = 0.001; // Treat quantities below this as effectively zero

    holdings.forEach(holding => {
      if (!holding.symbol) return;

      const quantity = Number(holding.quantity) || 0;
      const symbol = holding.symbol.toUpperCase();

      if (quantity >= MIN_QUANTITY_THRESHOLD) {
        activeSymbols.add(symbol);
        // Remove from inactive if it's now active
        inactiveSymbols.delete(symbol);
      } else {
        // Quantity is 0 or negligible (e.g., 1e-9 from rounding)
        // Only add to inactive if not in active
        if (!activeSymbols.has(symbol)) {
          inactiveSymbols.add(symbol);
        }
      }
    });

    // Preserve existing inactive symbols that aren't now active
    this.cache.inactive.forEach(symbol => {
      if (!activeSymbols.has(symbol)) {
        inactiveSymbols.add(symbol);
      }
    });

    this.cache.active = Array.from(activeSymbols).sort();
    this.cache.inactive = Array.from(inactiveSymbols).sort();

    this.saveCache();
    console.log(`🔄 Updated watchlist from holdings: ${this.cache.active.length} active, ${this.cache.inactive.length} inactive`);
  }

  // Get watchlist data
  getWatchlist() {
    return {
      active: [...this.cache.active],
      inactive: [...this.cache.inactive],
      custom: [...this.cache.custom],
      totalSymbols: this.cache.active.length + this.cache.inactive.length + this.cache.custom.length
    };
  }

  // Add symbol to watchlist manually
  addSymbol(symbol, isActive = true) {
    const upperSymbol = symbol.toUpperCase();

    if (isActive) {
      if (!this.cache.active.includes(upperSymbol)) {
        this.cache.active.push(upperSymbol);
        this.cache.active.sort();
      }
      // Remove from inactive if it's there
      this.cache.inactive = this.cache.inactive.filter(s => s !== upperSymbol);
    } else {
      if (!this.cache.inactive.includes(upperSymbol)) {
        this.cache.inactive.push(upperSymbol);
        this.cache.inactive.sort();
      }
      // Remove from active if it's there
      this.cache.active = this.cache.active.filter(s => s !== upperSymbol);
    }

    this.saveCache();
    console.log(`➕ Added ${upperSymbol} to ${isActive ? 'active' : 'inactive'} watchlist`);
  }

  // Remove symbol from watchlist
  removeSymbol(symbol) {
    const upperSymbol = symbol.toUpperCase();
    const wasActive = this.cache.active.includes(upperSymbol);
    const wasInactive = this.cache.inactive.includes(upperSymbol);

    this.cache.active = this.cache.active.filter(s => s !== upperSymbol);
    this.cache.inactive = this.cache.inactive.filter(s => s !== upperSymbol);

    if (wasActive || wasInactive) {
      this.saveCache();
      console.log(`➖ Removed ${upperSymbol} from watchlist`);
      return true;
    }

    return false;
  }

  // Clear all watchlist data
  clearAll() {
    const activeCount = this.cache.active.length;
    const inactiveCount = this.cache.inactive.length;

    this.cache = { active: [], inactive: [] };
    this.saveCache();

    console.log(`🧹 Cleared watchlist: ${activeCount} active, ${inactiveCount} inactive symbols removed`);
    return { activeCount, inactiveCount };
  }

  // Add symbol to custom watchlist
  addCustomSymbol(symbol) {
    const upperSymbol = symbol.toUpperCase();

    // Remove from active/inactive if it's there
    this.cache.active = this.cache.active.filter(s => s !== upperSymbol);
    this.cache.inactive = this.cache.inactive.filter(s => s !== upperSymbol);

    // Add to custom if not already there
    if (!this.cache.custom.includes(upperSymbol)) {
      this.cache.custom.push(upperSymbol);
      this.cache.custom.sort();
      this.saveCache();
      console.log(`➕ Added ${upperSymbol} to custom watchlist`);
      return true;
    }

    console.log(`⚠️ ${upperSymbol} already in custom watchlist`);
    return false;
  }

  // Remove symbol from custom watchlist
  removeCustomSymbol(symbol) {
    const upperSymbol = symbol.toUpperCase();
    const wasCustom = this.cache.custom.includes(upperSymbol);

    this.cache.custom = this.cache.custom.filter(s => s !== upperSymbol);

    if (wasCustom) {
      this.saveCache();
      console.log(`➖ Removed ${upperSymbol} from custom watchlist`);
      return true;
    }

    return false;
  }

  // Get statistics
  getStats() {
    return {
      activeCount: this.cache.active.length,
      inactiveCount: this.cache.inactive.length,
      customCount: this.cache.custom.length,
      totalCount: this.cache.active.length + this.cache.inactive.length + this.cache.custom.length,
      cacheFile: this.cacheFile
    };
  }
}

// Create singleton instance
const watchlistCache = new WatchlistCache();

module.exports = watchlistCache;
