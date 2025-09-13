const axios = require('axios');
const portfolioAssetDiscovery = require('./portfolio-asset-discovery');
const historicalDataCache = require('./historical-cache');

class HistoricalDataPreloader {
  constructor() {
    this.maxConcurrentRequests = 3; // Don't overwhelm the API
    this.requestDelay = 500; // 500ms between batches to be respectful
    this.maxRetries = 2;
    this.isPreloading = false;
  }

  // Pre-populate historical cache for all portfolio assets
  async prePopulateHistoricalCache(options = {}) {
    if (this.isPreloading) {
      console.log('🔄 Historical cache pre-population already in progress, skipping...');
      return { success: false, message: 'Already in progress' };
    }

    this.isPreloading = true;
    const startTime = Date.now();

    try {
      console.log('🚀 Starting historical cache pre-population...');
      
      // Discover all unique symbols from portfolios and CSV files
      const symbolsNeedingData = portfolioAssetDiscovery.getSymbolsNeedingHistoricalData(historicalDataCache);
      
      if (symbolsNeedingData.length === 0) {
        console.log('✅ All historical data is up to date!');
        return { 
          success: true, 
          message: 'All historical data up to date',
          symbolsProcessed: 0,
          duration: Date.now() - startTime
        };
      }

      console.log(`📊 Pre-populating historical data for ${symbolsNeedingData.length} symbols...`);

      const results = {
        successful: 0,
        failed: 0,
        skipped: 0,
        errors: []
      };

      // Process symbols in batches to avoid overwhelming the API
      const batches = this.createBatches(symbolsNeedingData, this.maxConcurrentRequests);
      
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        console.log(`📦 Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} symbols)`);
        
        // Process batch concurrently
        const batchPromises = batch.map(symbolInfo => 
          this.fetchAndCacheHistoricalData(symbolInfo)
        );
        
        const batchResults = await Promise.allSettled(batchPromises);
        
        // Analyze batch results
        batchResults.forEach((result, index) => {
          const symbolInfo = batch[index];
          
          if (result.status === 'fulfilled') {
            const fetchResult = result.value;
            if (fetchResult.success) {
              results.successful++;
              console.log(`✅ ${symbolInfo.symbol}: ${fetchResult.dataPoints} data points cached`);
            } else {
              results.failed++;
              results.errors.push(`${symbolInfo.symbol}: ${fetchResult.error}`);
              console.log(`❌ ${symbolInfo.symbol}: ${fetchResult.error}`);
            }
          } else {
            results.failed++;
            results.errors.push(`${symbolInfo.symbol}: ${result.reason}`);
            console.log(`❌ ${symbolInfo.symbol}: ${result.reason}`);
          }
        });

        // Add delay between batches (except for the last batch)
        if (batchIndex < batches.length - 1) {
          await this.sleep(this.requestDelay);
        }
      }

      const duration = Date.now() - startTime;
      console.log(`🎉 Historical cache pre-population completed in ${duration}ms`);
      console.log(`📈 Results: ${results.successful} successful, ${results.failed} failed, ${results.skipped} skipped`);

      if (results.errors.length > 0) {
        console.log('❌ Errors encountered:');
        results.errors.forEach(error => console.log(`  - ${error}`));
      }

      return {
        success: true,
        message: 'Pre-population completed',
        symbolsProcessed: symbolsNeedingData.length,
        results,
        duration
      };

    } catch (error) {
      console.error('❌ Historical cache pre-population failed:', error.message);
      return {
        success: false,
        message: error.message,
        duration: Date.now() - startTime
      };
    } finally {
      this.isPreloading = false;
    }
  }

  // Convert crypto symbols to Yahoo Finance format
  convertToYahooSymbol(symbol) {
    // Common crypto symbols that need -USD suffix
    const cryptoSymbols = ['BTC', 'ETH', 'DOGE', 'SOL', 'ADA', 'DOT', 'MATIC', 'AVAX', 'LINK', 'UNI'];
    
    if (cryptoSymbols.includes(symbol.toUpperCase())) {
      return `${symbol}-USD`;
    }
    
    // Return original symbol for stocks
    return symbol;
  }

  // Convert UTC timestamp to Eastern Daylight Time (EDT/GMT-4)
  convertToEDT(utcTimestamp) {
    const utcDate = new Date(utcTimestamp * 1000);
    // Convert to EDT (GMT-4) by subtracting 4 hours
    const edtDate = new Date(utcDate.getTime() - (4 * 60 * 60 * 1000));
    return edtDate.toISOString();
  }

  // Fetch and cache historical data for a single symbol
  async fetchAndCacheHistoricalData(symbolInfo, retryCount = 0) {
    const { symbol, lastDate, needsUpdate, missingDays, daysMissing } = symbolInfo;
    
    try {
      // Determine the period to fetch based on missing days
      let period = '1y'; // Default to 1 year
      
      if (!lastDate) {
        // No existing data, fetch maximum available
        period = '10y';
        console.log(`🔍 Fetching full historical data for ${symbol} (no existing data)`);
      } else if (missingDays && missingDays.length > 0) {
        // We have some data but missing recent days
        if (daysMissing <= 30) {
          period = '1mo';
        } else if (daysMissing <= 90) {
          period = '3mo';
        } else if (daysMissing <= 180) {
          period = '6mo';
        } else {
          period = '1y';
        }
        
        console.log(`🔄 Fetching incremental data for ${symbol} (${daysMissing} missing trading days, using ${period})`);
      } else {
        // No missing days, cache is up to date
        return {
          success: true,
          dataPoints: 0,
          updateType: 'up_to_date'
        };
      }

      // Convert symbol to Yahoo Finance format (adds -USD for crypto)
      const yahooSymbol = this.convertToYahooSymbol(symbol);
      
      // Fetch historical data from Yahoo Finance
      const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}`, {
        params: {
          range: period,
          interval: '1d'
        },
        timeout: 15000 // 15 second timeout
      });

      if (response.data && response.data.chart && response.data.chart.result) {
        const result = response.data.chart.result[0];
        const timestamps = result.timestamp;
        const quotes = result.indicators.quote[0];
        const metadata = result.meta; // Extract metadata from Yahoo Finance response
        
        if (!timestamps || !quotes) {
          throw new Error('Invalid data structure from Yahoo Finance');
        }
        
        const historicalData = timestamps.map((timestamp, index) => ({
          date: this.convertToEDT(timestamp),
          open: quotes.open[index] || 0,
          high: quotes.high[index] || 0,
          low: quotes.low[index] || 0,
          close: quotes.close[index] || 0,
          volume: quotes.volume[index] || 0
        })).filter(item => item.close > 0);

        if (historicalData.length === 0) {
          throw new Error('No valid historical data points returned');
        }

        // Update cache - use incremental update if we already have some data
        if (lastDate && needsUpdate && missingDays && missingDays.length > 0) {
          // Filter to only new data points for missing trading days
          const lastCacheDate = new Date(lastDate);
          const newDataPoints = historicalData.filter(point => {
            const pointDate = new Date(point.date);
            return pointDate > lastCacheDate;
          });
          
          if (newDataPoints.length > 0) {
            historicalDataCache.updateIncremental(symbol, newDataPoints);
            console.log(`📈 Added ${newDataPoints.length} new data points for ${symbol} (${daysMissing} days were missing)`);
            return {
              success: true,
              dataPoints: newDataPoints.length,
              updateType: 'incremental',
              daysFilled: daysMissing
            };
          } else {
            return {
              success: true,
              dataPoints: 0,
              updateType: 'no_new_data'
            };
          }
        } else if (!lastDate) {
          // Full cache update for symbols with no existing data
          historicalDataCache.set(symbol, historicalData, metadata);
          return {
            success: true,
            dataPoints: historicalData.length,
            updateType: 'full'
          };
        } else {
          return {
            success: true,
            dataPoints: 0,
            updateType: 'up_to_date'
          };
        }
      } else {
        throw new Error('No chart data returned from Yahoo Finance');
      }

    } catch (error) {
      // Retry logic
      if (retryCount < this.maxRetries) {
        console.log(`🔄 Retrying ${symbol} (attempt ${retryCount + 1}/${this.maxRetries + 1})`);
        await this.sleep(1000); // Wait 1 second before retry
        return this.fetchAndCacheHistoricalData(symbolInfo, retryCount + 1);
      }
      
      return {
        success: false,
        error: error.message || 'Unknown error',
        retryCount
      };
    }
  }

  // Create batches for concurrent processing
  createBatches(items, batchSize) {
    const batches = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  // Sleep utility
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Quick update for recently changed symbols (for file processing)
  async quickUpdateSymbols(symbols) {
    if (!Array.isArray(symbols) || symbols.length === 0) {
      return { success: true, message: 'No symbols to update' };
    }

    console.log(`🔄 Quick historical data update for ${symbols.length} symbols: ${symbols.join(', ')}`);
    
    const results = { successful: 0, failed: 0, errors: [] };
    
    for (const symbol of symbols) {
      try {
        const symbolInfo = {
          symbol,
          lastDate: historicalDataCache.get(symbol)?.lastDate || null,
          needsUpdate: true
        };
        
        const result = await this.fetchAndCacheHistoricalData(symbolInfo);
        
        if (result.success) {
          results.successful++;
          console.log(`✅ Quick update ${symbol}: ${result.dataPoints} data points`);
        } else {
          results.failed++;
          results.errors.push(`${symbol}: ${result.error}`);
        }
        
        // Small delay between requests
        if (symbols.indexOf(symbol) < symbols.length - 1) {
          await this.sleep(200);
        }
        
      } catch (error) {
        results.failed++;
        results.errors.push(`${symbol}: ${error.message}`);
      }
    }

    return {
      success: results.failed === 0,
      message: `Quick update completed: ${results.successful} successful, ${results.failed} failed`,
      results
    };
  }

  // Get preloader status
  getStatus() {
    return {
      isPreloading: this.isPreloading,
      maxConcurrentRequests: this.maxConcurrentRequests,
      requestDelay: this.requestDelay
    };
  }
}

// Create singleton instance
const historicalDataPreloader = new HistoricalDataPreloader();

module.exports = historicalDataPreloader;