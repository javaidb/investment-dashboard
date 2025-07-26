const express = require('express');
const axios = require('axios');
const router = express.Router();

// CoinGecko API configuration
const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3';

// Cache for crypto data
const cryptoCache = new Map();
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes

// Get cryptocurrency price data
router.get('/price/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { currency = 'usd' } = req.query;
    const cacheKey = `price_${id}_${currency}`;
    
    // Check cache first
    const cached = cryptoCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return res.json(cached.data);
    }

    const response = await axios.get(`${COINGECKO_BASE_URL}/simple/price`, {
      params: {
        ids: id,
        vs_currencies: currency,
        include_24hr_change: true,
        include_24hr_vol: true,
        include_market_cap: true
      }
    });

    if (!response.data[id]) {
      return res.status(404).json({ error: 'Cryptocurrency not found' });
    }

    const priceData = response.data[id];
    const cryptoData = {
      id: id,
      symbol: id.toUpperCase(),
      price: priceData[currency],
      change24h: priceData[`${currency}_24h_change`],
      volume24h: priceData[`${currency}_24h_vol`],
      marketCap: priceData[`${currency}_market_cap`],
      currency: currency.toUpperCase(),
      timestamp: new Date().toISOString()
    };

    // Cache the result
    cryptoCache.set(cacheKey, {
      data: cryptoData,
      timestamp: Date.now()
    });

    res.json(cryptoData);
  } catch (error) {
    console.error('Crypto price error:', error.message);
    res.status(500).json({ error: 'Failed to fetch crypto data' });
  }
});

// Search cryptocurrencies
router.get('/search/:query', async (req, res) => {
  try {
    const { query } = req.params;
    const cacheKey = `search_${query}`;
    
    // Check cache first
    const cached = cryptoCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return res.json(cached.data);
    }

    const response = await axios.get(`${COINGECKO_BASE_URL}/search`, {
      params: {
        query: query
      }
    });

    const coins = response.data.coins || [];
    const searchResults = coins.slice(0, 10).map(coin => ({
      id: coin.id,
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      marketCapRank: coin.market_cap_rank,
      thumb: coin.thumb,
      large: coin.large
    }));

    // Cache the result
    cryptoCache.set(cacheKey, {
      data: searchResults,
      timestamp: Date.now()
    });

    res.json(searchResults);
  } catch (error) {
    console.error('Crypto search error:', error.message);
    res.status(500).json({ error: 'Failed to search cryptocurrencies' });
  }
});

// Get trending cryptocurrencies
router.get('/trending', async (req, res) => {
  try {
    const cacheKey = 'trending';
    
    // Check cache first
    const cached = cryptoCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return res.json(cached.data);
    }

    const response = await axios.get(`${COINGECKO_BASE_URL}/search/trending`);
    
    const trending = response.data.coins || [];
    const trendingData = trending.map(coin => ({
      id: coin.item.id,
      symbol: coin.item.symbol.toUpperCase(),
      name: coin.item.name,
      marketCapRank: coin.item.market_cap_rank,
      priceBtc: coin.item.price_btc,
      score: coin.item.score,
      thumb: coin.item.thumb,
      large: coin.item.large
    }));

    // Cache the result
    cryptoCache.set(cacheKey, {
      data: trendingData,
      timestamp: Date.now()
    });

    res.json(trendingData);
  } catch (error) {
    console.error('Trending crypto error:', error.message);
    res.status(500).json({ error: 'Failed to fetch trending cryptocurrencies' });
  }
});

// Get multiple cryptocurrency prices
router.post('/prices', async (req, res) => {
  try {
    const { ids, currency = 'usd' } = req.body;
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'IDs array is required' });
    }

    if (ids.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 cryptocurrencies allowed per request' });
    }

    const response = await axios.get(`${COINGECKO_BASE_URL}/simple/price`, {
      params: {
        ids: ids.join(','),
        vs_currencies: currency,
        include_24hr_change: true,
        include_24hr_vol: true,
        include_market_cap: true
      }
    });

    const prices = Object.entries(response.data).map(([id, data]) => ({
      id: id,
      symbol: id.toUpperCase(),
      price: data[currency],
      change24h: data[`${currency}_24h_change`],
      volume24h: data[`${currency}_24h_vol`],
      marketCap: data[`${currency}_market_cap`],
      currency: currency.toUpperCase(),
      timestamp: new Date().toISOString()
    }));

    res.json(prices);
  } catch (error) {
    console.error('Multiple crypto prices error:', error.message);
    res.status(500).json({ error: 'Failed to fetch multiple crypto prices' });
  }
});

// Get market data for top cryptocurrencies
router.get('/market-data', async (req, res) => {
  try {
    const { currency = 'usd', per_page = 20, page = 1 } = req.query;
    const cacheKey = `market_${currency}_${per_page}_${page}`;
    
    // Check cache first
    const cached = cryptoCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return res.json(cached.data);
    }

    const response = await axios.get(`${COINGECKO_BASE_URL}/coins/markets`, {
      params: {
        vs_currency: currency,
        order: 'market_cap_desc',
        per_page: per_page,
        page: page,
        sparkline: false,
        price_change_percentage: '24h,7d,30d'
      }
    });

    const marketData = response.data.map(coin => ({
      id: coin.id,
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      price: coin.current_price,
      change24h: coin.price_change_percentage_24h,
      change7d: coin.price_change_percentage_7d_in_currency,
      change30d: coin.price_change_percentage_30d_in_currency,
      marketCap: coin.market_cap,
      volume24h: coin.total_volume,
      marketCapRank: coin.market_cap_rank,
      image: coin.image,
      timestamp: new Date().toISOString()
    }));

    // Cache the result
    cryptoCache.set(cacheKey, {
      data: marketData,
      timestamp: Date.now()
    });

    res.json(marketData);
  } catch (error) {
    console.error('Market data error:', error.message);
    res.status(500).json({ error: 'Failed to fetch market data' });
  }
});

module.exports = router; 