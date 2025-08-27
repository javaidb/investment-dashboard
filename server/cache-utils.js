const historicalDataCache = require('./historical-cache');
const holdingsCache = require('./cache');

// Initialize historical cache with portfolio holdings
async function initializeHistoricalCache(holdings) {
  try {
    const axios = require('axios');
    
    // Filter for stock and crypto holdings
    const stockHoldings = holdings.filter(holding => (holding.type === 's' || holding.type === 'c') && holding.symbol);
    
    if (stockHoldings.length === 0) {
      console.log('📈 No stock holdings found for historical cache');
      return;
    }
    
    console.log(`📈 Fetching historical data for ${stockHoldings.length} stock holdings...`);
    
    // Calculate date range (30 days ago to today)
    const endTimestamp = Math.floor(Date.now() / 1000);
    const startTimestamp = endTimestamp - (30 * 24 * 60 * 60); // 30 days ago
    
    // Process holdings in batches to avoid overwhelming the API
    const batchSize = 5;
    for (let i = 0; i < stockHoldings.length; i += batchSize) {
      const batch = stockHoldings.slice(i, i + batchSize);
      
      const promises = batch.map(async (holding) => {
        try {
          const symbol = holding.symbol;
          
          // Check if we already have recent data in cache
          const cachedHistorical = historicalDataCache.get(symbol, '3m', '1d');
          if (cachedHistorical && !cachedHistorical.needsUpdate) {
            console.log(`📦 Historical data for ${symbol} already cached and fresh`);
            return;
          }
          
          // Convert crypto symbols to Yahoo Finance format (e.g., BTC -> BTC-USD)
          const yahooSymbol = holding.type === 'c' ? `${symbol.toUpperCase()}-USD` : symbol;
          
          console.log(`🌐 Fetching historical data for ${symbol} (${yahooSymbol})...`);
          const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}`;
          const params = {
            period1: startTimestamp,
            period2: endTimestamp,
            interval: '1d',
            includePrePost: false
          };
          
          const response = await axios.get(yahooUrl, { 
            params,
            timeout: 8000 
          });
          
          if (response.data.chart?.result?.[0]) {
            const result = response.data.chart.result[0];
            const timestamps = result.timestamp || [];
            const quotes = result.indicators.quote[0];
            const meta = result.meta;
            
            if (timestamps.length && quotes) {
              const historicalData = timestamps.map((timestamp, index) => ({
                date: new Date(timestamp * 1000).toISOString(),
                open: quotes.open?.[index] || null,
                high: quotes.high?.[index] || null,
                low: quotes.low?.[index] || null,
                close: quotes.close?.[index] || null,
                volume: quotes.volume?.[index] || null
              })).filter(item => item.close !== null);
              
              // Cache the historical data
              const historicalCacheData = {
                data: historicalData,
                meta: {
                  companyName: meta.longName || meta.shortName || holding.companyName || symbol,
                  currentPrice: meta.regularMarketPrice || historicalData[historicalData.length - 1]?.close,
                  currency: meta.currency || 'USD'
                },
                dateRange: {
                  start: new Date(startTimestamp * 1000).toISOString(),
                  end: new Date(endTimestamp * 1000).toISOString(),
                  days: 30
                }
              };
              
              historicalDataCache.update(symbol, historicalCacheData, '3m', '1d');
              console.log(`💾 Cached historical data for ${symbol}: ${historicalData.length} data points`);
            }
          }
        } catch (error) {
          console.warn(`⚠️ Failed to fetch historical data for ${holding.symbol}: ${error.message}`);
        }
      });
      
      await Promise.all(promises);
      
      // Add small delay between batches to be respectful to the API
      if (i + batchSize < stockHoldings.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    const historicalStats = historicalDataCache.getStats();
    console.log(`📊 Historical cache updated: ${historicalStats.totalEntries} symbols cached`);
    
  } catch (error) {
    console.warn('⚠️ Historical cache initialization failed:', error.message);
  }
}

// Refresh portfolio cache (current prices + historical data)
async function refreshPortfolioCache() {
  try {
    console.log('🔄 Refreshing portfolio holdings cache...');
    const fs = require('fs');
    const path = require('path');
    const PORTFOLIO_FILE = path.join(__dirname, 'data/cache', 'portfolios.json');
    
    if (!fs.existsSync(PORTFOLIO_FILE)) {
      console.log('📝 No portfolio file found, skipping cache refresh');
      return;
    }

    const data = fs.readFileSync(PORTFOLIO_FILE, 'utf8');
    const portfolioData = JSON.parse(data);
    const portfolios = Object.values(portfolioData);
    
    if (portfolios.length === 0) {
      console.log('📝 No portfolios found, skipping cache refresh');
      return;
    }

    // Get the most recent portfolio
    const mostRecentPortfolio = portfolios.reduce((latest, current) => {
      const currentDate = new Date(current.fileMetadata?.processedAt || current.createdAt || 0);
      const latestDate = new Date(latest.fileMetadata?.processedAt || latest.createdAt || 0);
      return currentDate > latestDate ? current : latest;
    });
    
    // Handle different portfolio data structures
    let holdings = [];
    
    if (mostRecentPortfolio.holdings && Array.isArray(mostRecentPortfolio.holdings)) {
      holdings = mostRecentPortfolio.holdings;
    } else if (mostRecentPortfolio.portfolio && mostRecentPortfolio.portfolio.trades) {
      // Convert trades to holdings format for caching
      const tradesBySymbol = {};
      
      mostRecentPortfolio.portfolio.trades.forEach(trade => {
        if (!trade.symbol) return;
        
        if (!tradesBySymbol[trade.symbol]) {
          // Known crypto symbols that need -USD suffix for Yahoo Finance
          const knownCryptos = ['BTC', 'ETH', 'ADA', 'SOL', 'DOT', 'LINK', 'UNI', 'MATIC', 'AVAX', 'ATOM', 'LTC', 'BCH', 'XRP', 'DOGE', 'SHIB', 'TRX', 'ETC', 'FIL', 'NEAR', 'ALGO'];
          
          tradesBySymbol[trade.symbol] = {
            symbol: trade.symbol,
            type: knownCryptos.includes(trade.symbol.toUpperCase()) ? 'c' : 's',
            quantity: 0,
            totalCost: 0
          };
        }
        
        if (trade.action === 'buy') {
          tradesBySymbol[trade.symbol].quantity += trade.quantity;
          tradesBySymbol[trade.symbol].totalCost += trade.total;
        } else if (trade.action === 'sell') {
          tradesBySymbol[trade.symbol].quantity -= trade.quantity;
          tradesBySymbol[trade.symbol].totalCost -= trade.total;
        }
      });
      
      // Convert to holdings array, filtering out zero quantities
      holdings = Object.values(tradesBySymbol).filter(holding => holding.quantity > 0);
    }
    
    if (holdings.length === 0) {
      console.log('⚠️ No holdings found in most recent portfolio');
      return;
    }

    console.log(`💾 Updating cache for ${holdings.length} portfolio holdings...`);
    
    // Import cache functions
    const { cacheStockPricesFromHoldings } = require('./routes/portfolio');
    
    // Update current prices cache
    await cacheStockPricesFromHoldings(holdings);
    
    // Update historical data cache for performance charts
    await initializeHistoricalCache(holdings);
    
    console.log('✅ Portfolio holdings cache refreshed successfully');
    
  } catch (error) {
    console.warn('⚠️ Portfolio cache refresh failed:', error.message);
    throw error; // Re-throw so calling code can handle it
  }
}

module.exports = {
  initializeHistoricalCache,
  refreshPortfolioCache
};