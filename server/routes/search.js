const express = require('express');
const axios = require('axios');
const router = express.Router();

// Search both stocks and cryptocurrencies
router.get('/:query', async (req, res) => {
  try {
    const { query } = req.params;
    const { limit = 10 } = req.query;

    if (!query || query.trim().length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    // Search stocks and crypto in parallel
    const [stockResults, cryptoResults] = await Promise.allSettled([
      searchStocks(query),
      searchCrypto(query)
    ]);

    // Combine and format results
    const results = [];

    // Add stock results
    if (stockResults.status === 'fulfilled' && stockResults.value) {
      results.push(...stockResults.value.map(stock => ({
        ...stock,
        type: 'stock',
        displayName: `${stock.symbol} - ${stock.name}`
      })));
    }

    // Add crypto results
    if (cryptoResults.status === 'fulfilled' && cryptoResults.value) {
      results.push(...cryptoResults.value.map(crypto => ({
        ...crypto,
        type: 'crypto',
        displayName: `${crypto.symbol} - ${crypto.name}`
      })));
    }

    // Sort by relevance (exact symbol matches first, then by name similarity)
    results.sort((a, b) => {
      const aExactSymbol = a.symbol.toLowerCase() === query.toLowerCase();
      const bExactSymbol = b.symbol.toLowerCase() === query.toLowerCase();
      
      if (aExactSymbol && !bExactSymbol) return -1;
      if (!aExactSymbol && bExactSymbol) return 1;
      
      const aNameMatch = a.name.toLowerCase().includes(query.toLowerCase());
      const bNameMatch = b.name.toLowerCase().includes(query.toLowerCase());
      
      if (aNameMatch && !bNameMatch) return -1;
      if (!aNameMatch && bNameMatch) return 1;
      
      return 0;
    });

    // Limit results
    const limitedResults = results.slice(0, parseInt(limit));

    res.json({
      query: query,
      total: results.length,
      results: limitedResults
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Get trending items (stocks and crypto) - DEPRECATED
// Use /api/historical/trending/weekly for real trending data
router.get('/trending/all', async (req, res) => {
  try {
    res.status(410).json({ 
      error: 'This endpoint is deprecated. Use /api/historical/trending/weekly for real trending stocks data.',
      redirectTo: '/api/historical/trending/weekly'
    });
  } catch (error) {
    console.error('Trending search error:', error);
    res.status(500).json({ error: 'Failed to fetch trending items' });
  }
});

// Helper function to search stocks
async function searchStocks(query) {
  try {
    const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
    const ALPHA_VANTAGE_BASE_URL = 'https://www.alphavantage.co/query';

    const response = await axios.get(ALPHA_VANTAGE_BASE_URL, {
      params: {
        function: 'SYMBOL_SEARCH',
        keywords: query,
        apikey: ALPHA_VANTAGE_API_KEY
      }
    });

    if (response.data['Error Message']) {
      return [];
    }

    const matches = response.data.bestMatches || [];
    return matches.map(match => ({
      symbol: match['1. symbol'],
      name: match['2. name'],
      type: match['3. type'],
      region: match['4. region'],
      currency: match['8. currency']
    }));
  } catch (error) {
    console.error('Stock search error:', error);
    return [];
  }
}

// Helper function to search cryptocurrencies
async function searchCrypto(query) {
  try {
    const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3';

    const response = await axios.get(`${COINGECKO_BASE_URL}/search`, {
      params: {
        query: query
      }
    });

    const coins = response.data.coins || [];
    return coins.slice(0, 10).map(coin => ({
      id: coin.id,
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      marketCapRank: coin.market_cap_rank,
      thumb: coin.thumb,
      large: coin.large
    }));
  } catch (error) {
    console.error('Crypto search error:', error);
    return [];
  }
}

// Get detailed information for a specific symbol
router.get('/details/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { type } = req.query; // 'stock' or 'crypto'

    let details = null;

    if (type === 'stock' || !type) {
      try {
        const stockResponse = await axios.get(`http://localhost:5000/api/stocks/quote/${symbol}`);
        details = {
          ...stockResponse.data,
          type: 'stock'
        };
      } catch (stockError) {
        // If stock lookup fails, try crypto
        if (!type) {
          try {
            const cryptoResponse = await axios.get(`http://localhost:5000/api/crypto/price/${symbol.toLowerCase()}`);
            details = {
              ...cryptoResponse.data,
              type: 'crypto'
            };
          } catch (cryptoError) {
            return res.status(404).json({ error: 'Symbol not found' });
          }
        } else {
          return res.status(404).json({ error: 'Stock not found' });
        }
      }
    } else if (type === 'crypto') {
      try {
        const cryptoResponse = await axios.get(`http://localhost:5000/api/crypto/price/${symbol.toLowerCase()}`);
        details = {
          ...cryptoResponse.data,
          type: 'crypto'
        };
      } catch (cryptoError) {
        return res.status(404).json({ error: 'Cryptocurrency not found' });
      }
    }

    res.json(details);
  } catch (error) {
    console.error('Details lookup error:', error);
    res.status(500).json({ error: 'Failed to fetch details' });
  }
});

module.exports = router; 