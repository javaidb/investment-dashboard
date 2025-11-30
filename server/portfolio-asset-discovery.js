const fs = require('fs');
const path = require('path');

class PortfolioAssetDiscovery {
  constructor() {
    this.portfolioFile = path.join(__dirname, 'data', 'cache', 'portfolios.json');
    this.uploadsDir = path.join(__dirname, 'uploads');
  }

  // Get all unique symbols from current portfolios
  getAllUniqueSymbolsFromPortfolios() {
    try {
      if (!fs.existsSync(this.portfolioFile)) {
        console.log('📋 No portfolio data file found');
        return [];
      }

      const data = fs.readFileSync(this.portfolioFile, 'utf8');
      const portfolioData = JSON.parse(data);
      const uniqueSymbols = new Set();

      // Handle both old and new portfolio data formats
      for (const [key, value] of Object.entries(portfolioData)) {
        let portfolio = null;
        
        // New format: filename -> fileData with portfolio property
        if (value && value.portfolio && value.portfolio.holdings) {
          portfolio = value.portfolio;
        }
        // Old format: portfolioId -> portfolio directly
        else if (value && value.holdings) {
          portfolio = value;
        }

        if (portfolio && portfolio.holdings) {
          portfolio.holdings.forEach(holding => {
            if (holding.symbol && holding.quantity > 0) {
              uniqueSymbols.add(holding.symbol.toUpperCase());
            }
          });
        }
      }

      const symbolsArray = Array.from(uniqueSymbols).sort();
      console.log(`📊 Discovered ${symbolsArray.length} unique symbols from portfolios:`, symbolsArray);
      return symbolsArray;
    } catch (error) {
      console.error('❌ Error reading portfolio symbols:', error.message);
      return [];
    }
  }

  // Get all unique symbols from CSV files in uploads directory
  getAllUniqueSymbolsFromCSVFiles() {
    try {
      const uniqueSymbols = new Set();
      
      // Check both wealthsimple and crypto directories
      const directories = ['wealthsimple', 'crypto'];
      
      for (const dir of directories) {
        const dirPath = path.join(this.uploadsDir, dir);
        
        if (!fs.existsSync(dirPath)) {
          console.log(`📁 Directory not found: ${dirPath}`);
          continue;
        }

        const files = fs.readdirSync(dirPath).filter(file => 
          file.toLowerCase().endsWith('.csv')
        );

        console.log(`📁 Found ${files.length} CSV files in ${dir} directory`);

        for (const file of files) {
          const filePath = path.join(dirPath, file);
          
          try {
            const symbols = this.extractSymbolsFromCSV(filePath, dir);
            symbols.forEach(symbol => uniqueSymbols.add(symbol));
          } catch (fileError) {
            console.error(`❌ Error processing ${file}:`, fileError.message);
          }
        }
      }

      const symbolsArray = Array.from(uniqueSymbols).sort();
      console.log(`📊 Discovered ${symbolsArray.length} unique symbols from CSV files:`, symbolsArray);
      return symbolsArray;
    } catch (error) {
      console.error('❌ Error reading CSV symbols:', error.message);
      return [];
    }
  }

  // Extract symbols from a specific CSV file
  extractSymbolsFromCSV(filePath, type) {
    const symbols = new Set();
    
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      
      if (lines.length < 2) {
        console.log(`⚠️ CSV file appears empty or has no data rows: ${path.basename(filePath)}`);
        return Array.from(symbols);
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      
      // Find symbol column based on file type
      let symbolColumnIndex = -1;
      
      if (type === 'wealthsimple') {
        // Look for "Description" column in Wealthsimple format
        symbolColumnIndex = headers.findIndex(h => 
          h.includes('description') || h.includes('security')
        );
      } else if (type === 'crypto') {
        // Look for "Symbol" column in crypto format
        symbolColumnIndex = headers.findIndex(h => 
          h.includes('symbol') || h.includes('asset') || h.includes('coin')
        );
      }

      if (symbolColumnIndex === -1) {
        console.log(`⚠️ Could not find symbol column in ${path.basename(filePath)}, headers:`, headers);
        return Array.from(symbols);
      }

      // Process data rows
      for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(',');
        
        if (row.length <= symbolColumnIndex) {
          continue;
        }
        
        let symbolData = row[symbolColumnIndex].trim().replace(/"/g, '');
        
        if (!symbolData) {
          continue;
        }

        if (type === 'wealthsimple') {
          // Extract symbol from Wealthsimple description format: "COMPANY NAME (SYMBOL)"
          const symbolMatch = symbolData.match(/\(([A-Z]+)\)$/);
          if (symbolMatch) {
            symbols.add(symbolMatch[1]);
          }
        } else if (type === 'crypto') {
          // For crypto, the symbol should be directly in the column
          const cleanSymbol = symbolData.toUpperCase();
          if (/^[A-Z0-9]+$/.test(cleanSymbol)) {
            symbols.add(cleanSymbol);
          }
        }
      }

      console.log(`📄 Extracted ${symbols.size} symbols from ${path.basename(filePath)} (${type})`);
      return Array.from(symbols);
      
    } catch (error) {
      console.error(`❌ Error parsing CSV ${path.basename(filePath)}:`, error.message);
      return Array.from(symbols);
    }
  }

  // Get all unique symbols from all sources (portfolios + CSV files + custom watchlist)
  getAllUniqueSymbols() {
    const portfolioSymbols = this.getAllUniqueSymbolsFromPortfolios();
    const csvSymbols = this.getAllUniqueSymbolsFromCSVFiles();
    const watchlistSymbols = this.getAllUniqueSymbolsFromWatchlist();

    // Combine and deduplicate
    const allSymbols = new Set([...portfolioSymbols, ...csvSymbols, ...watchlistSymbols]);
    const uniqueSymbols = Array.from(allSymbols).sort();

    console.log(`🔍 Total unique symbols discovered: ${uniqueSymbols.length}`);
    console.log(`📊 From portfolios: ${portfolioSymbols.length}, From CSVs: ${csvSymbols.length}, From watchlist: ${watchlistSymbols.length}, Combined: ${uniqueSymbols.length}`);

    return uniqueSymbols;
  }

  // Get all unique symbols from custom watchlist
  getAllUniqueSymbolsFromWatchlist() {
    try {
      const watchlistCache = require('./watchlist-cache');
      const watchlist = watchlistCache.getWatchlist();

      // Include all custom symbols, and optionally active/inactive
      const allWatchlistSymbols = [
        ...(watchlist.active || []),
        ...(watchlist.inactive || []),
        ...(watchlist.custom || [])
      ];

      const uniqueSymbols = Array.from(new Set(allWatchlistSymbols)).sort();
      console.log(`📊 Discovered ${uniqueSymbols.length} unique symbols from watchlist:`, uniqueSymbols);
      return uniqueSymbols;
    } catch (error) {
      console.error('❌ Error reading watchlist symbols:', error.message);
      return [];
    }
  }

  // Get symbols that need historical data updates
  getSymbolsNeedingHistoricalData(historicalDataCache) {
    const allSymbols = this.getAllUniqueSymbols();
    const symbolsNeedingUpdate = [];
    
    for (const symbol of allSymbols) {
      const updateInfo = historicalDataCache.needsUpdate(symbol);
      
      if (updateInfo.needsUpdate) {
        symbolsNeedingUpdate.push({
          symbol,
          lastDate: updateInfo.lastDate,
          needsUpdate: updateInfo.needsUpdate,
          missingDays: updateInfo.missingDays,
          daysMissing: updateInfo.daysMissing,
          dataPoints: historicalDataCache.get(symbol)?.totalDataPoints || 0
        });
      }
    }

    console.log(`📈 Historical data needed for ${symbolsNeedingUpdate.length}/${allSymbols.length} symbols`);
    if (symbolsNeedingUpdate.length > 0) {
      const totalMissingDays = symbolsNeedingUpdate.reduce((sum, s) => sum + (s.daysMissing || 0), 0);
      console.log(`📅 Total missing trading days across all symbols: ${totalMissingDays}`);
    }
    return symbolsNeedingUpdate;
  }

  // Get stats about discovered assets
  getDiscoveryStats() {
    const portfolioSymbols = this.getAllUniqueSymbolsFromPortfolios();
    const csvSymbols = this.getAllUniqueSymbolsFromCSVFiles();
    const allSymbols = this.getAllUniqueSymbols();
    
    return {
      totalSymbols: allSymbols.length,
      portfolioSymbols: portfolioSymbols.length,
      csvSymbols: csvSymbols.length,
      discoveredSymbols: allSymbols,
      lastDiscoveryTime: new Date().toISOString()
    };
  }
}

// Create singleton instance
const portfolioAssetDiscovery = new PortfolioAssetDiscovery();

module.exports = portfolioAssetDiscovery;