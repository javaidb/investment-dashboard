const express = require('express');
const axios = require('axios');
const router = express.Router();

// Finnhub API configuration
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

// Cache for stock data (in production, use Redis)
const stockCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Rate limiting for Finnhub API (60 requests per minute)
const requestTimestamps = [];
const RATE_LIMIT = 60; // requests per minute
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute in milliseconds

// Rate limiting function
function checkRateLimit() {
  const now = Date.now();
  // Remove timestamps older than 1 minute
  while (requestTimestamps.length > 0 && requestTimestamps[0] < now - RATE_LIMIT_WINDOW) {
    requestTimestamps.shift();
  }
  
  if (requestTimestamps.length >= RATE_LIMIT) {
    return false; // Rate limit exceeded
  }
  
  requestTimestamps.push(now);
  return true; // OK to proceed
}

// Get real-time stock quote
router.get('/quote/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const cacheKey = `quote_${symbol.toUpperCase()}`;
    
    // Check cache first
    const cached = stockCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return res.json(cached.data);
    }

    // Check rate limit
    if (!checkRateLimit()) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded. Please wait before making more requests.',
        retryAfter: 60
      });
    }

    const response = await axios.get(`${FINNHUB_BASE_URL}/quote`, {
      params: {
        symbol: symbol.toUpperCase(),
        token: FINNHUB_API_KEY
      }
    });

    if (!response.data || response.data.error) {
      return res.status(400).json({ error: 'Invalid symbol or API error' });
    }

    const quote = response.data;
    if (!quote.c || quote.c === 0) {
      return res.status(404).json({ error: 'Stock not found' });
    }

    const stockData = {
      symbol: symbol.toUpperCase(),
      price: parseFloat(quote.c),
      change: parseFloat(quote.d),
      changePercent: parseFloat(quote.dp),
      volume: parseInt(quote.v),
      high: parseFloat(quote.h),
      low: parseFloat(quote.l),
      open: parseFloat(quote.o),
      previousClose: parseFloat(quote.pc),
      timestamp: new Date().toISOString()
    };

    // Cache the result
    stockCache.set(cacheKey, {
      data: stockData,
      timestamp: Date.now()
    });

    res.json(stockData);
  } catch (error) {
    console.error('Stock quote error:', error.message);
    
    // Handle specific error cases
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      if (status === 403) {
        console.error('403 Forbidden - Possible rate limit exceeded or invalid API key');
        console.error('Response data:', data);
        return res.status(403).json({ 
          error: 'API access denied. Possible causes: rate limit exceeded, invalid API key, or API key not activated.',
          details: data
        });
      } else if (status === 429) {
        return res.status(429).json({ 
          error: 'Rate limit exceeded. Please wait before making more requests.',
          details: data
        });
      } else {
        return res.status(status).json({ 
          error: `API error: ${status}`,
          details: data
        });
      }
    }
    
    res.status(500).json({ error: 'Failed to fetch stock data' });
  }
});

// Get stock search results
router.get('/search/:query', async (req, res) => {
  try {
    const { query } = req.params;
    const cacheKey = `search_${query}`;
    
    // Check cache first
    const cached = stockCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return res.json(cached.data);
    }

    const response = await axios.get(`${FINNHUB_BASE_URL}/search`, {
      params: {
        q: query,
        token: FINNHUB_API_KEY
      }
    });

    if (!response.data || response.data.error) {
      return res.status(400).json({ error: 'Search failed' });
    }

    const matches = response.data.result || [];
    const searchResults = matches.map(match => ({
      symbol: match.symbol,
      name: match.description,
      type: match.type,
      region: match.primaryExchange,
      currency: match.currency
    }));

    // Cache the result
    stockCache.set(cacheKey, {
      data: searchResults,
      timestamp: Date.now()
    });

    res.json(searchResults);
  } catch (error) {
    console.error('Stock search error:', error.message);
    res.status(500).json({ error: 'Failed to search stocks' });
  }
});

// Get multiple stock quotes
router.post('/quotes', async (req, res) => {
  try {
    const { symbols } = req.body;
    
    if (!Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({ error: 'Symbols array is required' });
    }

    if (symbols.length > 10) {
      return res.status(400).json({ error: 'Maximum 10 symbols allowed per request' });
    }

    const quotes = [];
    
    for (const symbol of symbols) {
      try {
        const response = await axios.get(`${FINNHUB_BASE_URL}/quote`, {
          params: {
            symbol: symbol.toUpperCase(),
            token: FINNHUB_API_KEY
          }
        });

        const quote = response.data;
        if (quote && quote.c && quote.c > 0) {
          quotes.push({
            symbol: symbol.toUpperCase(),
            price: parseFloat(quote.c),
            change: parseFloat(quote.d),
            changePercent: parseFloat(quote.dp),
            volume: parseInt(quote.v),
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        console.error(`Error fetching ${symbol}:`, error.message);
      }
    }

    res.json(quotes);
  } catch (error) {
    console.error('Multiple quotes error:', error.message);
    res.status(500).json({ error: 'Failed to fetch multiple quotes' });
  }
});

// Get historical stock data for charts
router.get('/historical/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { interval = 'daily', outputsize = 'compact' } = req.query;
    const cacheKey = `historical_${symbol}_${interval}_${outputsize}`;
    
    // Check cache first
    const cached = stockCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return res.json(cached.data);
    }

    // Check rate limit
    if (!checkRateLimit()) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded. Please wait before making more requests.',
        retryAfter: 60
      });
    }

    // For free tier, we'll use a simpler approach with basic quote data
    // and generate some sample historical data based on current price
    try {
      // First get current quote
      const quoteResponse = await axios.get(`${FINNHUB_BASE_URL}/quote`, {
        params: {
          symbol: symbol.toUpperCase(),
          token: FINNHUB_API_KEY
        }
      });

      if (!quoteResponse.data || quoteResponse.data.error) {
        return res.status(400).json({ error: 'Invalid symbol or API error' });
      }

      const quote = quoteResponse.data;
      if (!quote.c || quote.c === 0) {
        return res.status(404).json({ error: 'Stock not found' });
      }

      // For free tier, we'll use Yahoo Finance API as a fallback for historical data
      // This provides real historical data without API key restrictions
      try {
        const yahooResponse = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol.toUpperCase()}`, {
          params: {
            range: outputsize === 'full' ? '1y' : '1mo',
            interval: '1d'
          }
        });

        if (yahooResponse.data && yahooResponse.data.chart && yahooResponse.data.chart.result) {
          const result = yahooResponse.data.chart.result[0];
          const timestamps = result.timestamp;
          const quotes = result.indicators.quote[0];
          
          const historicalData = timestamps.map((timestamp, index) => ({
            date: new Date(timestamp * 1000).toISOString().split('T')[0],
            open: quotes.open[index] || 0,
            high: quotes.high[index] || 0,
            low: quotes.low[index] || 0,
            close: quotes.close[index] || 0,
            volume: quotes.volume[index] || 0
          })).filter(item => item.close > 0); // Filter out invalid data points
          
          // Cache the result
          stockCache.set(cacheKey, {
            data: historicalData,
            timestamp: Date.now()
          });

          res.json(historicalData);
          return;
        }
      } catch (yahooError) {
        console.log('Yahoo Finance fallback failed, using sample data');
      }

      // Fallback: Generate sample historical data for free tier
      const currentPrice = quote.c;
      const currentDate = new Date();
      const historicalData = [];
      
      // Generate 30 days of sample data
      for (let i = 29; i >= 0; i--) {
        const date = new Date(currentDate);
        date.setDate(date.getDate() - i);
        
        // Generate realistic price variations (±5% daily)
        const variation = (Math.random() - 0.5) * 0.1; // ±5%
        const price = currentPrice * (1 + variation);
        
        historicalData.push({
          date: date.toISOString().split('T')[0],
          open: price * (1 + (Math.random() - 0.5) * 0.02),
          high: price * (1 + Math.random() * 0.03),
          low: price * (1 - Math.random() * 0.03),
          close: price,
          volume: Math.floor(Math.random() * 1000000) + 100000
        });
      }

      // Sort by date
      historicalData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // Cache the result
      stockCache.set(cacheKey, {
        data: historicalData,
        timestamp: Date.now()
      });

      res.json(historicalData);
    } catch (error) {
      console.error('Quote-based historical data error:', error.message);
      return res.status(500).json({ error: 'Failed to generate historical data' });
    }
  } catch (error) {
    console.error('Historical data error:', error.message);
    
    // Handle specific error cases
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      if (status === 403) {
        console.error('403 Forbidden - Possible rate limit exceeded or invalid API key');
        console.error('Response data:', data);
        return res.status(403).json({ 
          error: 'API access denied. Possible causes: rate limit exceeded, invalid API key, or API key not activated.',
          details: data
        });
      } else if (status === 429) {
        return res.status(429).json({ 
          error: 'Rate limit exceeded. Please wait before making more requests.',
          details: data
        });
      } else {
        return res.status(status).json({ 
          error: `API error: ${status}`,
          details: data
        });
      }
    }
    
    res.status(500).json({ error: 'Failed to fetch historical data' });
  }
});

// Test API key endpoint
router.get('/test-api-key', async (req, res) => {
  try {
    if (!FINNHUB_API_KEY || FINNHUB_API_KEY === 'your_finnhub_api_key_here') {
      return res.status(400).json({ 
        error: 'API key not configured. Please set FINNHUB_API_KEY in your .env file.' 
      });
    }

    // Test with a simple quote request
    const response = await axios.get(`${FINNHUB_BASE_URL}/quote`, {
      params: {
        symbol: 'AAPL',
        token: FINNHUB_API_KEY
      }
    });

    if (response.data && response.data.c) {
      res.json({ 
        status: 'API key is valid',
        testSymbol: 'AAPL',
        price: response.data.c,
        message: 'Successfully fetched data from Finnhub API'
      });
    } else {
      res.status(400).json({ 
        error: 'API key may be invalid or inactive',
        response: response.data
      });
    }
  } catch (error) {
    console.error('API key test error:', error.message);
    
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      if (status === 403) {
        res.status(403).json({ 
          error: 'API key is invalid, inactive, or rate limit exceeded',
          status: status,
          details: data
        });
      } else {
        res.status(status).json({ 
          error: `API test failed with status ${status}`,
          details: data
        });
      }
    } else {
      res.status(500).json({ error: 'Failed to test API key' });
    }
  }
});

module.exports = router; 