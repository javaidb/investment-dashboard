const express = require('express');
const axios = require('axios');
const router = express.Router();

// Alpha Vantage API configuration
const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const ALPHA_VANTAGE_BASE_URL = 'https://www.alphavantage.co/query';

// Cache for stock data (in production, use Redis)
const stockCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

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

    const response = await axios.get(ALPHA_VANTAGE_BASE_URL, {
      params: {
        function: 'GLOBAL_QUOTE',
        symbol: symbol.toUpperCase(),
        apikey: ALPHA_VANTAGE_API_KEY
      }
    });

    if (response.data['Error Message']) {
      return res.status(400).json({ error: 'Invalid symbol or API error' });
    }

    const quote = response.data['Global Quote'];
    if (!quote || Object.keys(quote).length === 0) {
      return res.status(404).json({ error: 'Stock not found' });
    }

    const stockData = {
      symbol: quote['01. symbol'],
      price: parseFloat(quote['05. price']),
      change: parseFloat(quote['09. change']),
      changePercent: quote['10. change percent'].replace('%', ''),
      volume: parseInt(quote['06. volume']),
      high: parseFloat(quote['03. high']),
      low: parseFloat(quote['04. low']),
      open: parseFloat(quote['02. open']),
      previousClose: parseFloat(quote['08. previous close']),
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

    const response = await axios.get(ALPHA_VANTAGE_BASE_URL, {
      params: {
        function: 'SYMBOL_SEARCH',
        keywords: query,
        apikey: ALPHA_VANTAGE_API_KEY
      }
    });

    if (response.data['Error Message']) {
      return res.status(400).json({ error: 'Search failed' });
    }

    const matches = response.data.bestMatches || [];
    const searchResults = matches.map(match => ({
      symbol: match['1. symbol'],
      name: match['2. name'],
      type: match['3. type'],
      region: match['4. region'],
      currency: match['8. currency']
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
        const response = await axios.get(ALPHA_VANTAGE_BASE_URL, {
          params: {
            function: 'GLOBAL_QUOTE',
            symbol: symbol.toUpperCase(),
            apikey: ALPHA_VANTAGE_API_KEY
          }
        });

        const quote = response.data['Global Quote'];
        if (quote && Object.keys(quote).length > 0) {
          quotes.push({
            symbol: quote['01. symbol'],
            price: parseFloat(quote['05. price']),
            change: parseFloat(quote['09. change']),
            changePercent: quote['10. change percent'].replace('%', ''),
            volume: parseInt(quote['06. volume']),
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

    const response = await axios.get(ALPHA_VANTAGE_BASE_URL, {
      params: {
        function: 'TIME_SERIES_DAILY',
        symbol: symbol.toUpperCase(),
        outputsize: outputsize, // 'compact' for last 100 days, 'full' for 20+ years
        apikey: ALPHA_VANTAGE_API_KEY
      }
    });

    if (response.data['Error Message']) {
      return res.status(400).json({ error: 'Invalid symbol or API error' });
    }

    const timeSeriesData = response.data['Time Series (Daily)'];
    if (!timeSeriesData || Object.keys(timeSeriesData).length === 0) {
      return res.status(404).json({ error: 'Historical data not found' });
    }

    // Transform the data for charting
    const historicalData = Object.entries(timeSeriesData)
      .map(([date, data]) => ({
        date: date,
        open: parseFloat(data['1. open']),
        high: parseFloat(data['2. high']),
        low: parseFloat(data['3. low']),
        close: parseFloat(data['4. close']),
        volume: parseInt(data['5. volume'])
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Cache the result
    stockCache.set(cacheKey, {
      data: historicalData,
      timestamp: Date.now()
    });

    res.json(historicalData);
  } catch (error) {
    console.error('Historical data error:', error.message);
    res.status(500).json({ error: 'Failed to fetch historical data' });
  }
});

module.exports = router; 