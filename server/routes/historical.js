const express = require('express');
const axios = require('axios');
const historicalDataCache = require('../historical-cache');
const router = express.Router();

// Cache for historical data
const historicalCache = new Map();
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour for daily data
const INTRADAY_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes for hourly data

// Helper function to check cache
function getCachedData(key) {
  const cached = historicalCache.get(key);
  if (cached && Date.now() - cached.timestamp < (key.includes('1h') ? INTRADAY_CACHE_DURATION : CACHE_DURATION)) {
    return cached.data;
  }
  return null;
}

// Helper function to set cache
function setCachedData(key, data) {
  historicalCache.set(key, {
    data,
    timestamp: Date.now()
  });
}

// Get historical data for a single stock
router.get('/stock/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { period = '1y', interval = '1d' } = req.query;
    
    // Check persistent cache first
    const cached = historicalDataCache.get(symbol, period);
    
    if (cached && !cached.needsUpdate) {
      return res.json({
        symbol,
        data: cached.data,
        cached: true,
        success: true,
        message: `Stock data retrieved from persistent cache (${cached.filteredDataPoints}/${cached.totalDataPoints} data points)`,
        meta: {
          filteredPeriod: cached.filteredPeriod,
          lastModified: cached.lastModified
        }
      });
    }

    // Convert period to Yahoo Finance format
    const periodMap = {
      '5d': '5d',
      '1m': '1mo',
      '3m': '3mo',
      'monthly': '3mo', // Map monthly to 3 months for consistency
      '6m': '6mo',
      '1y': '1y',
      '2y': '2y',
      '5y': '5y',
      'max': 'max'
    };

    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`;
    const params = {
      period1: Math.floor(Date.now() / 1000) - getPeriodInSeconds(period),
      period2: Math.floor(Date.now() / 1000),
      interval: interval,
      includePrePost: false,
      events: 'div,splits'
    };

    console.log(`📈 Fetching historical data for ${symbol} (${period}, ${interval})`);
    
    const response = await axios.get(yahooUrl, { 
      params,
      timeout: 10000 
    });

    if (!response.data.chart?.result?.[0]) {
      throw new Error('Invalid response from Yahoo Finance');
    }

    const result = response.data.chart.result[0];
    const timestamps = result.timestamp || [];
    const quotes = result.indicators.quote[0];
    
    if (!timestamps.length || !quotes) {
      throw new Error('No historical data available');
    }

    // Format data
    const historicalData = timestamps.map((timestamp, index) => ({
      date: new Date(timestamp * 1000).toISOString(),
      open: quotes.open?.[index] || null,
      high: quotes.high?.[index] || null,
      low: quotes.low?.[index] || null,
      close: quotes.close?.[index] || null,
      volume: quotes.volume?.[index] || null
    })).filter(item => item.close !== null);

    // Sort data from earliest to latest (ascending chronological order)
    historicalData.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Cache the data
    const cacheKey = `${symbol}_${period}_${interval}`;
    setCachedData(cacheKey, historicalData);

    res.json({
      symbol,
      period,
      interval,
      data: historicalData,
      cached: false,
      message: `Retrieved ${historicalData.length} data points`
    });

  } catch (error) {
    console.error(`❌ Historical data error for ${req.params.symbol}:`, error.message);
    res.status(500).json({ 
      error: 'Failed to fetch historical data',
      message: error.message
    });
  }
});

// Get historical data for multiple stocks (batch)
router.post('/stocks/batch', async (req, res) => {
  try {
    const { symbols, period = '1y', interval = '1d' } = req.body;
    
    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({ error: 'Symbols array is required' });
    }

    if (symbols.length > 20) {
      return res.status(400).json({ error: 'Maximum 20 symbols allowed per batch request' });
    }

    console.log(`📊 Batch historical data request for ${symbols.length} symbols`);
    
    const results = {};
    const promises = symbols.map(async (symbol) => {
      try {
        const cacheKey = `${symbol}_${period}_${interval}`;
        const cached = getCachedData(cacheKey);
        
        if (cached) {
          results[symbol] = {
            data: cached,
            cached: true,
            success: true
          };
          return;
        }

        const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`;
        const params = {
          period1: Math.floor(Date.now() / 1000) - getPeriodInSeconds(period),
          period2: Math.floor(Date.now() / 1000),
          interval: interval,
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
          
          if (timestamps.length && quotes) {
            const historicalData = timestamps.map((timestamp, index) => ({
              date: new Date(timestamp * 1000).toISOString(),
              open: quotes.open?.[index] || null,
              high: quotes.high?.[index] || null,
              low: quotes.low?.[index] || null,
              close: quotes.close?.[index] || null,
              volume: quotes.volume?.[index] || null
            })).filter(item => item.close !== null);

            // Sort data from earliest to latest (ascending chronological order)
            historicalData.sort((a, b) => new Date(a.date) - new Date(b.date));

            // Update cache with incremental data or full data
            if (cached && cached.lastDate) {
              // Incremental update - only add new data points
              const lastCacheDate = new Date(cached.lastDate);
              const newDataPoints = historicalData.filter(point => 
                new Date(point.date) > lastCacheDate
              );
              
              if (newDataPoints.length > 0) {
                historicalDataCache.updateIncremental(symbol, newDataPoints);
              }
            } else {
              // Full cache update for new symbols
              historicalDataCache.set(symbol, historicalData);
            }
            
            results[symbol] = {
              data: historicalData,
              cached: false,
              success: true
            };
          } else {
            results[symbol] = {
              error: 'No data available',
              success: false
            };
          }
        } else {
          results[symbol] = {
            error: 'Invalid response format',
            success: false
          };
        }
      } catch (error) {
        console.warn(`⚠️ Failed to fetch data for ${symbol}: ${error.message}`);
        results[symbol] = {
          error: error.message,
          success: false
        };
      }
    });

    await Promise.all(promises);

    const successCount = Object.values(results).filter(r => r.success).length;
    const cachedCount = Object.values(results).filter(r => r.cached).length;

    res.json({
      period,
      interval,
      results,
      summary: {
        total: symbols.length,
        successful: successCount,
        cached: cachedCount,
        failed: symbols.length - successCount
      }
    });

  } catch (error) {
    console.error('❌ Batch historical data error:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch batch historical data',
      message: error.message
    });
  }
});

// Get top 6 highest performing stocks since Monday with 1h resolution data
router.get('/trending/weekly', async (req, res) => {
  try {
    // Calculate date range from most recent Monday to now
    const now = new Date();
    const mondayThisWeek = new Date(now);
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // If Sunday, go back 6 days to Monday
    mondayThisWeek.setDate(now.getDate() - daysFromMonday);
    mondayThisWeek.setHours(0, 0, 0, 0); // Start of Monday
    
    // Popular stocks to analyze for trending (reduced for faster response)
    const candidateStocks = [
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'NFLX', 'AMD', 'CRM',
      'PYPL', 'SQ', 'ROKU', 'BA', 'JPM', 'V', 'MA', 'DIS', 'INTC', 'KO'
    ];

    const startTimestamp = Math.floor(mondayThisWeek.getTime() / 1000);
    const endTimestamp = Math.floor(now.getTime() / 1000);
    
    console.log(`📅 Analyzing ${candidateStocks.length} stocks from ${mondayThisWeek.toISOString()} to ${now.toISOString()}`);

    // Step 1: Get performance data for all candidate stocks
    const stockPerformances = [];
    const performancePromises = candidateStocks.map(async (symbol) => {
      try {
        const cacheKey = `${symbol}_weekly_1h_${startTimestamp}`;
        const cached = getCachedData(cacheKey);
        
        let historicalData;
        if (cached) {
          historicalData = cached;
        } else {
          // Fetch real data from Yahoo Finance
          const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`;
          const params = {
            period1: startTimestamp,
            period2: endTimestamp,
            interval: '1h',
            includePrePost: false
          };

          const response = await axios.get(yahooUrl, { 
            params,
            timeout: 5000  // Reduced timeout for faster response
          });

          if (!response.data.chart?.result?.[0]) {
            throw new Error('No data available from Yahoo Finance');
          }

          const result = response.data.chart.result[0];
          const timestamps = result.timestamp || [];
          const quotes = result.indicators.quote[0];
          
          if (!timestamps.length || !quotes) {
            throw new Error('No historical data points available');
          }

          historicalData = timestamps.map((timestamp, index) => ({
            date: new Date(timestamp * 1000).toISOString(),
            open: quotes.open?.[index] || null,
            high: quotes.high?.[index] || null,
            low: quotes.low?.[index] || null,
            close: quotes.close?.[index] || null,
            volume: quotes.volume?.[index] || null
          })).filter(item => item.close !== null);

          // Sort data from earliest to latest (ascending chronological order)
          historicalData.sort((a, b) => new Date(a.date) - new Date(b.date));

          // Cache the data
          setCachedData(cacheKey, historicalData);
        }

        // Calculate performance since Monday
        if (historicalData.length > 0) {
          const firstPrice = historicalData[0].close;
          const lastPrice = historicalData[historicalData.length - 1].close;
          const change = lastPrice - firstPrice;
          const changePercent = (change / firstPrice) * 100;
          
          return {
            symbol,
            data: historicalData,
            firstPrice,
            lastPrice,
            change,
            changePercent,
            success: true
          };
        } else {
          throw new Error('No valid price data points');
        }
      } catch (error) {
        console.warn(`⚠️ Failed to fetch data for ${symbol}: ${error.message}`);
        return {
          symbol,
          error: error.message,
          success: false
        };
      }
    });

    const performances = await Promise.all(performancePromises);
    
    // Filter to only successful stocks with positive performance
    const validPerformances = performances.filter(p => 
      p.success && p.changePercent > 0
    );
    
    if (validPerformances.length === 0) {
      return res.status(404).json({
        error: 'No trending stocks found with positive performance since Monday',
        message: 'All analyzed stocks either failed to fetch data or have negative performance'
      });
    }
    
    // Sort by performance and take top 6
    const topTrendingStocks = validPerformances
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, 6);
    
    console.log(`📈 Found ${topTrendingStocks.length} trending stocks with positive performance`);
    
    // Step 2: Refresh portfolio holdings cache (proactive caching)
    try {
      const { refreshPortfolioCache } = require('../cache-utils');
      await refreshPortfolioCache();
    } catch (error) {
      console.warn('⚠️ Portfolio cache refresh failed during trending update:', error.message);
      // Don't fail the trending request if portfolio cache update fails
    }
    
    // Step 3: Format results for response
    const results = {};
    topTrendingStocks.forEach(stock => {
      results[stock.symbol] = {
        data: stock.data,
        meta: {
          companyName: getCompanyName(stock.symbol),
          currentPrice: stock.lastPrice,
          change: stock.change,
          changePercent: stock.changePercent,
          currency: 'USD'
        },
        cached: false,
        success: true,
        mock: false
      };
    });

    const successCount = Object.values(results).filter(r => r.success).length;
    const cachedCount = Object.values(results).filter(r => r.cached).length;

    res.json({
      results: results,
      dateRange: {
        start: mondayThisWeek.toISOString(),
        end: now.toISOString(),
        hoursFromMonday: Math.floor((now.getTime() - mondayThisWeek.getTime()) / (1000 * 60 * 60))
      },
      summary: {
        total: Object.keys(results).length,
        successful: successCount,
        cached: cachedCount,
        failed: candidateStocks.length - validPerformances.length,
        analyzedStocks: candidateStocks.length,
        positiveTrending: validPerformances.length
      },
      message: `Found ${successCount} real trending stocks with positive performance since Monday`
    });

  } catch (error) {
    console.error('❌ Weekly trending data error:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch weekly trending data',
      message: error.message
    });
  }
});

// Get trending stocks with intraday data (1h for last 5 days) - LEGACY
router.get('/trending/intraday', async (req, res) => {
  try {
    // Predefined list of popular trending stocks
    const trendingSymbols = [
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 
      'META', 'NVDA', 'NFLX', 'AMD', 'SPY'
    ];

    console.log('📈 Fetching intraday data for trending stocks');
    
    const results = {};
    const promises = trendingSymbols.map(async (symbol) => {
      try {
        const cacheKey = `${symbol}_5d_1h`;
        const cached = getCachedData(cacheKey);
        
        if (cached) {
          results[symbol] = {
            data: cached,
            cached: true,
            success: true
          };
          return;
        }

        const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`;
        const params = {
          period1: Math.floor(Date.now() / 1000) - (5 * 24 * 60 * 60), // 5 days
          period2: Math.floor(Date.now() / 1000),
          interval: '1h',
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

            // Sort data from earliest to latest (ascending chronological order)
            historicalData.sort((a, b) => new Date(a.date) - new Date(b.date));

            // Calculate trend metrics
            const firstPrice = historicalData[0]?.close;
            const lastPrice = historicalData[historicalData.length - 1]?.close;
            const change = lastPrice - firstPrice;
            const changePercent = (change / firstPrice) * 100;

            // Update cache with incremental data or full data
            if (cached && cached.lastDate) {
              // Incremental update - only add new data points
              const lastCacheDate = new Date(cached.lastDate);
              const newDataPoints = historicalData.filter(point => 
                new Date(point.date) > lastCacheDate
              );
              
              if (newDataPoints.length > 0) {
                historicalDataCache.updateIncremental(symbol, newDataPoints);
              }
            } else {
              // Full cache update for new symbols
              historicalDataCache.set(symbol, historicalData);
            }
            
            results[symbol] = {
              data: historicalData,
              meta: {
                companyName: meta.longName || meta.shortName || symbol,
                currentPrice: meta.regularMarketPrice || lastPrice,
                change,
                changePercent,
                currency: meta.currency || 'USD'
              },
              cached: false,
              success: true
            };
          } else {
            results[symbol] = {
              error: 'No intraday data available',
              success: false
            };
          }
        } else {
          results[symbol] = {
            error: 'Invalid response format',
            success: false
          };
        }
      } catch (error) {
        console.warn(`⚠️ Failed to fetch intraday data for ${symbol}: ${error.message}`);
        results[symbol] = {
          error: error.message,
          success: false
        };
      }
    });

    await Promise.all(promises);

    const successCount = Object.values(results).filter(r => r.success).length;
    const cachedCount = Object.values(results).filter(r => r.cached).length;

    // Filter only positive trending stocks (gainers)
    const positiveTrending = Object.entries(results)
      .filter(([symbol, data]) => data.success && data.meta?.changePercent > 0)
      .reduce((acc, [symbol, data]) => {
        acc[symbol] = data;
        return acc;
      }, {});

    res.json({
      results: positiveTrending,
      summary: {
        total: trendingSymbols.length,
        successful: successCount,
        cached: cachedCount,
        failed: trendingSymbols.length - successCount,
        positiveTrending: Object.keys(positiveTrending).length
      },
      message: `Retrieved intraday data for ${Object.keys(positiveTrending).length} trending stocks`
    });

  } catch (error) {
    console.error('❌ Trending intraday data error:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch trending intraday data',
      message: error.message
    });
  }
});

// Cache management endpoints
router.get('/cache/stats', (req, res) => {
  try {
    const totalEntries = historicalCache.size;
    const cacheEntries = [];
    
    for (const [key, value] of historicalCache.entries()) {
      const age = Date.now() - value.timestamp;
      const isExpired = age > (key.includes('1h') ? INTRADAY_CACHE_DURATION : CACHE_DURATION);
      
      cacheEntries.push({
        key,
        dataPoints: value.data.length,
        age: Math.floor(age / 1000), // age in seconds
        expired: isExpired
      });
    }

    res.json({
      success: true,
      stats: {
        totalEntries,
        cacheEntries,
        cacheDurations: {
          dailyData: CACHE_DURATION / 1000, // in seconds
          intradayData: INTRADAY_CACHE_DURATION / 1000 // in seconds
        }
      }
    });
  } catch (error) {
    console.error('Historical cache stats error:', error);
    res.status(500).json({ error: 'Failed to get cache statistics' });
  }
});

router.delete('/cache/clear', (req, res) => {
  try {
    const entriesCleared = historicalCache.size;
    historicalCache.clear();
    
    res.json({
      success: true,
      message: `Cleared ${entriesCleared} historical data cache entries`
    });
  } catch (error) {
    console.error('Historical cache clear error:', error);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

// Helper function to convert period to seconds
function getPeriodInSeconds(period) {
  const periodMap = {
    '5d': 5 * 24 * 60 * 60,
    '1m': 30 * 24 * 60 * 60,
    '3m': 90 * 24 * 60 * 60,
    '6m': 180 * 24 * 60 * 60,
    '1y': 365 * 24 * 60 * 60,
    '2y': 2 * 365 * 24 * 60 * 60,
    '5y': 5 * 365 * 24 * 60 * 60,
    'max': 20 * 365 * 24 * 60 * 60 // 20 years as max
  };
  
  return periodMap[period] || periodMap['1y'];
}

// Helper function to get company names for fallback stocks
function getCompanyName(symbol) {
  const companyNames = {
    'PYPL': 'PayPal Holdings Inc.',
    'SQ': 'Square Inc.',
    'ZM': 'Zoom Video Communications Inc.',
    'SHOP': 'Shopify Inc.',
    'NFLX': 'Netflix Inc.',
    'ROKU': 'Roku Inc.',
    'SPOT': 'Spotify Technology S.A.',
    'UBER': 'Uber Technologies Inc.',
    'DOCU': 'DocuSign Inc.',
    'SNOW': 'Snowflake Inc.'
  };
  
  return companyNames[symbol] || symbol;
}

// Helper function to convert crypto symbols to Yahoo Finance format
function getCryptoYahooSymbol(symbol) {
  const cryptoMap = {
    'BTC': 'BTC-USD',
    'ETH': 'ETH-USD',
    'ADA': 'ADA-USD',
    'SOL': 'SOL-USD',
    'DOT': 'DOT-USD',
    'LINK': 'LINK-USD',
    'UNI': 'UNI-USD',
    'MATIC': 'MATIC-USD',
    'AVAX': 'AVAX-USD',
    'ATOM': 'ATOM-USD',
    'LTC': 'LTC-USD',
    'BCH': 'BCH-USD',
    'XRP': 'XRP-USD',
    'DOGE': 'DOGE-USD',
    'SHIB': 'SHIB-USD',
    'TRX': 'TRX-USD',
    'ETC': 'ETC-USD',
    'FIL': 'FIL-USD',
    'NEAR': 'NEAR-USD',
    'ALGO': 'ALGO-USD'
  };
  
  return cryptoMap[symbol.toUpperCase()] || `${symbol.toUpperCase()}-USD`;
}

// Helper function to get realistic stock prices for fallback data
function getRealisticStockPrice(symbol) {
  const stockPrices = {
    'PYPL': 65,      // PayPal around $65
    'SQ': 70,        // Square around $70
    'ZM': 75,        // Zoom around $75
    'SHOP': 125,     // Shopify around $125
    'NFLX': 450,     // Netflix around $450
    'ROKU': 85,      // Roku around $85
    'SPOT': 320,     // Spotify around $320
    'UBER': 75,      // Uber around $75
    'DOCU': 55,      // DocuSign around $55
    'SNOW': 180      // Snowflake around $180
  };
  
  return stockPrices[symbol] || 150; // Default to $150 if unknown
}

// === CRYPTO HISTORICAL DATA ENDPOINTS (Using Yahoo Finance) ===

// Get historical data for a single cryptocurrency using Yahoo Finance
router.get('/crypto/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { period = '1y', interval = '1d' } = req.query;
    
    // Check persistent cache first
    const cached = historicalDataCache.get(symbol, period);
    
    if (cached && !cached.needsUpdate) {
      return res.json({
        symbol,
        data: cached.data,
        cached: true,
        success: true,
        message: `Crypto data retrieved from persistent cache (${cached.filteredDataPoints}/${cached.totalDataPoints} data points)`,
        meta: {
          filteredPeriod: cached.filteredPeriod,
          lastModified: cached.lastModified
        }
      });
    }

    // Convert crypto symbol to Yahoo Finance format (e.g., BTC -> BTC-USD)
    const yahooSymbol = getCryptoYahooSymbol(symbol);
    
    console.log(`🪙 Fetching crypto historical data for ${symbol} (${yahooSymbol}) using Yahoo Finance`);

    // Use the same Yahoo Finance endpoint as stocks
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}`;
    const params = {
      period1: Math.floor(Date.now() / 1000) - getPeriodInSeconds(period),
      period2: Math.floor(Date.now() / 1000),
      interval: interval,
      includePrePost: false,
      events: 'div,splits'
    };

    const response = await axios.get(yahooUrl, { 
      params,
      timeout: 10000 
    });

    if (!response.data.chart?.result?.[0]) {
      throw new Error('Invalid response from Yahoo Finance');
    }

    const result = response.data.chart.result[0];
    const timestamps = result.timestamp || [];
    const quotes = result.indicators.quote[0];
    
    if (!timestamps.length || !quotes) {
      throw new Error('No historical data available');
    }

    // Format data to match stock historical data structure
    const historicalData = timestamps.map((timestamp, index) => ({
      date: new Date(timestamp * 1000).toISOString(),
      open: quotes.open?.[index] || null,
      high: quotes.high?.[index] || null,
      low: quotes.low?.[index] || null,
      close: quotes.close?.[index] || null,
      volume: quotes.volume?.[index] || null
    })).filter(item => item.close !== null);

    if (historicalData.length === 0) {
      throw new Error('No historical data available');
    }

    // Sort data from earliest to latest (ascending chronological order)
    historicalData.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Update cache with incremental data or full data
    if (historicalData.length > 0) {
      if (cached && cached.lastDate) {
        // Incremental update - only add new data points
        const lastCacheDate = new Date(cached.lastDate);
        const newDataPoints = historicalData.filter(point => 
          new Date(point.date) > lastCacheDate
        );
        
        if (newDataPoints.length > 0) {
          historicalDataCache.updateIncremental(symbol, newDataPoints);
        }
      } else {
        // Full cache update for new symbols
        historicalDataCache.set(symbol, historicalData);
      }
    }

    res.json({
      symbol,
      period,
      interval,
      data: historicalData,
      cached: false,
      success: true,
      message: `Retrieved ${historicalData.length} crypto data points from Yahoo Finance`
    });

  } catch (error) {
    console.error(`❌ Crypto historical data error for ${req.params.symbol}:`, error.message);
    res.status(500).json({ 
      error: 'Failed to fetch crypto historical data',
      message: error.message,
      success: false
    });
  }
});

// Get historical data for multiple cryptocurrencies (batch) using Yahoo Finance
router.post('/crypto/batch', async (req, res) => {
  try {
    const { symbols, period = '1y', interval = '1d' } = req.body;
    
    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({ error: 'Symbols array is required' });
    }

    if (symbols.length > 20) {
      return res.status(400).json({ error: 'Maximum 20 crypto symbols allowed per batch request' });
    }

    console.log(`🪙 Batch crypto historical data request for ${symbols.length} symbols using Yahoo Finance`);
    
    const results = {};

    const promises = symbols.map(async (symbol) => {
      try {
        // Check persistent cache first
        const cached = historicalDataCache.get(symbol, period);
        
        if (cached && !cached.needsUpdate) {
          results[symbol] = {
            data: cached.data,
            cached: true,
            success: true,
            message: `Data retrieved from persistent cache (${cached.filteredDataPoints}/${cached.totalDataPoints} data points)`,
            meta: {
              filteredPeriod: cached.filteredPeriod,
              lastModified: cached.lastModified
            }
          };
          return;
        }

        // Convert crypto symbol to Yahoo Finance format
        const yahooSymbol = getCryptoYahooSymbol(symbol);
        
        const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}`;
        const params = {
          period1: Math.floor(Date.now() / 1000) - getPeriodInSeconds(period),
          period2: Math.floor(Date.now() / 1000),
          interval: interval,
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
          
          if (timestamps.length && quotes) {
            const historicalData = timestamps.map((timestamp, index) => ({
              date: new Date(timestamp * 1000).toISOString(),
              open: quotes.open?.[index] || null,
              high: quotes.high?.[index] || null,
              low: quotes.low?.[index] || null,
              close: quotes.close?.[index] || null,
              volume: quotes.volume?.[index] || null
            })).filter(item => item.close !== null);

            // Sort data from earliest to latest (ascending chronological order)
            historicalData.sort((a, b) => new Date(a.date) - new Date(b.date));

            // Update cache with incremental data or full data
            if (cached && cached.lastDate) {
              // Incremental update - only add new data points
              const lastCacheDate = new Date(cached.lastDate);
              const newDataPoints = historicalData.filter(point => 
                new Date(point.date) > lastCacheDate
              );
              
              if (newDataPoints.length > 0) {
                historicalDataCache.updateIncremental(symbol, newDataPoints);
              }
            } else {
              // Full cache update for new symbols
              historicalDataCache.set(symbol, historicalData);
            }
            
            results[symbol] = {
              data: historicalData,
              cached: false,
              success: true
            };
          } else {
            results[symbol] = {
              error: 'No data available',
              success: false
            };
          }
        } else {
          results[symbol] = {
            error: 'Invalid response format',
            success: false
          };
        }
      } catch (error) {
        console.warn(`⚠️ Failed to fetch crypto data for ${symbol}: ${error.message}`);
        results[symbol] = {
          error: error.message,
          success: false
        };
      }
    });

    await Promise.all(promises);

    const successCount = Object.values(results).filter(r => r.success).length;
    const cachedCount = Object.values(results).filter(r => r.cached).length;

    res.json({
      period,
      interval,
      results,
      summary: {
        total: symbols.length,
        successful: successCount,
        cached: cachedCount,
        failed: symbols.length - successCount
      }
    });

  } catch (error) {
    console.error('❌ Batch crypto historical data error:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch batch crypto historical data',
      message: error.message
    });
  }
});

module.exports = router;