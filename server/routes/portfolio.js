const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + '.csv');
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// In-memory storage for portfolio data (in production, use a database)
const portfolios = new Map();

// Upload and process CSV file
router.post('/upload', upload.single('trades'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No CSV file uploaded' });
    }

    const trades = [];
    const portfolioId = Date.now().toString();

    // Parse CSV file
    fs.createReadStream(req.file.path)
      .pipe(csv())
      .on('data', (row) => {
        // Validate required columns
        if (!row.symbol || !row.date || !row.action || !row.quantity || !row.price) {
          throw new Error('Missing required columns: symbol, date, action, quantity, price');
        }

        trades.push({
          symbol: row.symbol.toUpperCase(),
          date: new Date(row.date),
          action: row.action.toLowerCase(),
          quantity: parseFloat(row.quantity),
          price: parseFloat(row.price),
          total: parseFloat(row.quantity) * parseFloat(row.price)
        });
      })
      .on('end', async () => {
        try {
          // Clean up uploaded file
          fs.unlinkSync(req.file.path);

          // Process trades and calculate portfolio
          const portfolio = await processTrades(trades);
          
          // Store portfolio data
          portfolios.set(portfolioId, {
            id: portfolioId,
            trades: trades,
            holdings: portfolio.holdings,
            summary: portfolio.summary,
            createdAt: new Date().toISOString()
          });

          res.json({
            portfolioId: portfolioId,
            message: 'Portfolio uploaded successfully',
            summary: portfolio.summary,
            holdings: portfolio.holdings
          });
        } catch (error) {
          console.error('Portfolio processing error:', error);
          res.status(500).json({ error: 'Failed to process portfolio data' });
        }
      })
      .on('error', (error) => {
        // Clean up uploaded file on error
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        res.status(400).json({ error: 'Invalid CSV format: ' + error.message });
      });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Get portfolio summary
router.get('/:portfolioId', async (req, res) => {
  try {
    const { portfolioId } = req.params;
    const portfolio = portfolios.get(portfolioId);

    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    // Get current prices for holdings
    const holdingsWithPrices = await getCurrentPrices(portfolio.holdings);

    res.json({
      id: portfolioId,
      summary: portfolio.summary,
      holdings: holdingsWithPrices,
      trades: portfolio.trades,
      createdAt: portfolio.createdAt
    });
  } catch (error) {
    console.error('Portfolio retrieval error:', error);
    res.status(500).json({ error: 'Failed to retrieve portfolio' });
  }
});

// Get all portfolios
router.get('/', (req, res) => {
  try {
    const portfolioList = Array.from(portfolios.values()).map(portfolio => ({
      id: portfolio.id,
      summary: portfolio.summary,
      createdAt: portfolio.createdAt
    }));

    res.json(portfolioList);
  } catch (error) {
    console.error('Portfolio list error:', error);
    res.status(500).json({ error: 'Failed to retrieve portfolios' });
  }
});

// Delete portfolio
router.delete('/:portfolioId', (req, res) => {
  try {
    const { portfolioId } = req.params;
    const deleted = portfolios.delete(portfolioId);

    if (!deleted) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    res.json({ message: 'Portfolio deleted successfully' });
  } catch (error) {
    console.error('Portfolio deletion error:', error);
    res.status(500).json({ error: 'Failed to delete portfolio' });
  }
});

// Helper function to process trades and calculate holdings
async function processTrades(trades) {
  const holdings = new Map();
  let totalInvested = 0;
  let totalRealized = 0;

  // Sort trades by date
  trades.sort((a, b) => a.date - b.date);

  for (const trade of trades) {
    const symbol = trade.symbol;
    
    if (!holdings.has(symbol)) {
      holdings.set(symbol, {
        symbol: symbol,
        quantity: 0,
        averagePrice: 0,
        totalInvested: 0,
        realizedPnL: 0
      });
    }

    const holding = holdings.get(symbol);

    if (trade.action === 'buy') {
      const newQuantity = holding.quantity + trade.quantity;
      const newTotalInvested = holding.totalInvested + trade.total;
      
      holding.quantity = newQuantity;
      holding.totalInvested = newTotalInvested;
      holding.averagePrice = newTotalInvested / newQuantity;
      totalInvested += trade.total;
    } else if (trade.action === 'sell') {
      if (holding.quantity < trade.quantity) {
        throw new Error(`Insufficient quantity for ${symbol}: trying to sell ${trade.quantity} but only have ${holding.quantity}`);
      }

      const soldRatio = trade.quantity / holding.quantity;
      const realizedPnL = trade.total - (holding.averagePrice * trade.quantity);
      
      holding.quantity -= trade.quantity;
      holding.realizedPnL += realizedPnL;
      totalRealized += realizedPnL;

      if (holding.quantity === 0) {
        holding.totalInvested = 0;
        holding.averagePrice = 0;
      } else {
        holding.totalInvested = holding.averagePrice * holding.quantity;
      }
    }
  }

  // Convert holdings map to array and filter out zero quantities
  const holdingsArray = Array.from(holdings.values())
    .filter(holding => holding.quantity > 0);

  return {
    holdings: holdingsArray,
    summary: {
      totalInvested: totalInvested,
      totalRealized: totalRealized,
      totalHoldings: holdingsArray.length,
      totalQuantity: holdingsArray.reduce((sum, h) => sum + h.quantity, 0)
    }
  };
}

// Helper function to get current prices for holdings
async function getCurrentPrices(holdings) {
  const holdingsWithPrices = [];
  
  for (const holding of holdings) {
    try {
      // Try to get stock price first, then crypto
      let currentPrice = null;
      
      try {
        // Try stock API
        const stockResponse = await axios.get(`http://localhost:5000/api/stocks/quote/${holding.symbol}`);
        currentPrice = stockResponse.data.price;
      } catch (stockError) {
        try {
          // Try crypto API (convert symbol to lowercase for CoinGecko)
          const cryptoResponse = await axios.get(`http://localhost:5000/api/crypto/price/${holding.symbol.toLowerCase()}`);
          currentPrice = cryptoResponse.data.price;
        } catch (cryptoError) {
          console.warn(`Could not fetch price for ${holding.symbol}`);
        }
      }

      const currentValue = currentPrice ? currentPrice * holding.quantity : null;
      const unrealizedPnL = currentValue ? currentValue - holding.totalInvested : null;
      const totalPnL = unrealizedPnL ? unrealizedPnL + holding.realizedPnL : holding.realizedPnL;

      holdingsWithPrices.push({
        ...holding,
        currentPrice: currentPrice,
        currentValue: currentValue,
        unrealizedPnL: unrealizedPnL,
        totalPnL: totalPnL,
        totalPnLPercent: totalPnL ? (totalPnL / holding.totalInvested) * 100 : null
      });
    } catch (error) {
      console.error(`Error fetching price for ${holding.symbol}:`, error);
      holdingsWithPrices.push(holding);
    }
  }

  return holdingsWithPrices;
}

module.exports = router; 