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

// Currency conversion cache
const currencyCache = new Map();
const CURRENCY_CACHE_DURATION = 60 * 60 * 1000; // 1 hour

// Helper function to get USD to CAD exchange rate
async function getUSDtoCADRate() {
  const cacheKey = 'usd_cad_rate';
  const cached = currencyCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CURRENCY_CACHE_DURATION) {
    console.log(`✅ Using cached USD/CAD rate: ${cached.rate}`);
    return cached.rate;
  }

  try {
    console.log('🌐 Fetching USD/CAD exchange rate...');
    // Using a free currency API (you can replace with your preferred service)
    const response = await axios.get('https://api.exchangerate-api.com/v4/latest/USD', {
      timeout: 10000
    });
    
    const rate = response.data.rates.CAD;
    console.log(`✅ Fetched USD/CAD rate: ${rate}`);
    
    // Cache the rate
    currencyCache.set(cacheKey, {
      rate: rate,
      timestamp: Date.now()
    });
    
    return rate;
  } catch (error) {
    console.warn('⚠️ Failed to fetch USD/CAD rate, using fallback rate of 1.35');
    // Fallback rate (approximate USD/CAD rate)
    return 1.35;
  }
}

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

// Read and process uploaded CSV files
router.post('/process-uploaded', async (req, res) => {
  try {
    const uploadDir = path.join(__dirname, '../uploads');
    const cryptoDir = path.join(uploadDir, 'crypto');
    const wealthsimpleDir = path.join(uploadDir, 'wealthsimple');
    
    // Get files from both directories
    const cryptoFiles = fs.existsSync(cryptoDir) ? 
      fs.readdirSync(cryptoDir).filter(file => file.endsWith('.csv')) : [];
    const wealthsimpleFiles = fs.existsSync(wealthsimpleDir) ? 
      fs.readdirSync(wealthsimpleDir).filter(file => file.endsWith('.csv')) : [];
    
    const allFiles = [
      ...cryptoFiles.map(file => ({ path: path.join(cryptoDir, file), type: 'crypto' })),
      ...wealthsimpleFiles.map(file => ({ path: path.join(wealthsimpleDir, file), type: 'wealthsimple' }))
    ];
    
    if (allFiles.length === 0) {
      return res.status(404).json({ error: 'No CSV files found in uploads directory' });
    }

    let allTrades = [];
    const portfolioId = Date.now().toString();

    // Process each CSV file
    for (const fileInfo of allFiles) {
      const { path: filePath, type: fileType } = fileInfo;
      const trades = [];

      await new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
          .pipe(csv())
          .on('data', (row) => {
            try {
              let trade = null;
              
              if (fileType === 'crypto') {
                // Process crypto format
                trade = processCryptoRow(row, path.basename(filePath));
              } else if (fileType === 'wealthsimple') {
                // Process Wealthsimple format
                trade = processWealthsimpleRow(row, path.basename(filePath));
              }
              
              if (trade) {
                console.log(`Processing trade in ${path.basename(filePath)}:`, trade);
                trades.push(trade);
              }
            } catch (error) {
              console.warn(`Error processing row in ${path.basename(filePath)}:`, error.message);
              // Continue processing other rows instead of rejecting the entire file
            }
          })
          .on('end', () => {
            allTrades = allTrades.concat(trades);
            resolve();
          })
          .on('error', (error) => {
            console.error(`Error processing ${path.basename(filePath)}:`, error.message);
            resolve(); // Continue with other files instead of rejecting
          });
      });
    }

    // Process all trades and calculate portfolio
    const portfolio = await processTrades(allTrades);
    
    // Store portfolio data
    portfolios.set(portfolioId, {
      id: portfolioId,
      trades: allTrades,
      holdings: portfolio.holdings,
      summary: portfolio.summary,
      createdAt: new Date().toISOString()
    });

    res.json({
      portfolioId: portfolioId,
      message: `Processed ${allFiles.length} CSV files successfully`,
      summary: portfolio.summary,
      holdings: portfolio.holdings,
      filesProcessed: allFiles.map(f => path.basename(f.path))
    });

  } catch (error) {
    console.error('Uploaded files processing error:', error);
    res.status(500).json({ error: 'Failed to process uploaded files: ' + error.message });
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

// Get currency conversion rate
router.get('/currency/rate', async (req, res) => {
  try {
    const rate = await getUSDtoCADRate();
    res.json({
      usdToCad: rate,
      cadToUsd: 1 / rate,
      timestamp: new Date().toISOString(),
      source: 'exchangerate-api.com'
    });
  } catch (error) {
    console.error('Currency rate error:', error);
    res.status(500).json({ error: 'Failed to fetch currency rate' });
  }
});

// Helper function to process trades and calculate holdings
async function processTrades(trades) {
  const holdings = new Map();
  let totalInvested = 0;
  let totalRealizedPnL = 0; // Track P&L from sales
  let totalAmountSold = 0; // Track total amount sold

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
        totalAmountInvested: 0, // Track total amount ever invested (all buy transactions)
        realizedPnL: 0,
        amountSold: 0, // Track total amount sold
        type: trade.type, // 's' for stock, 'c' for crypto
        currency: trade.currency || 'CAD' // Default to CAD
      });
    }

    const holding = holdings.get(symbol);

    if (trade.action === 'buy') {
      const newQuantity = holding.quantity + trade.quantity;
      const newTotalInvested = holding.totalInvested + trade.total;
      
      holding.quantity = newQuantity;
      holding.totalInvested = newTotalInvested;
      holding.totalAmountInvested += trade.total; // Accumulate total amount ever invested
      holding.averagePrice = newTotalInvested / newQuantity;
      totalInvested += trade.total;
    } else if (trade.action === 'sell') {
      if (holding.quantity < trade.quantity) {
        console.warn(`⚠️ Insufficient quantity for ${symbol}: trying to sell ${trade.quantity} but only have ${holding.quantity}. Adjusting sell quantity.`);
        
        // Adjust sell quantity to available amount
        const adjustedQuantity = holding.quantity;
        const adjustedTotal = trade.total * (adjustedQuantity / trade.quantity);
        
        const realizedPnL = adjustedTotal - (holding.averagePrice * adjustedQuantity);
        
        holding.quantity = 0;
        holding.realizedPnL += realizedPnL;
        holding.amountSold += adjustedTotal; // Track adjusted amount sold
        totalRealizedPnL += realizedPnL;
        totalAmountSold += adjustedTotal; // Track total amount sold
        holding.totalInvested = 0;
        holding.averagePrice = 0;
      } else {
        const realizedPnL = trade.total - (holding.averagePrice * trade.quantity);
        
        holding.quantity -= trade.quantity;
        holding.realizedPnL += realizedPnL;
        holding.amountSold += trade.total; // Track amount sold
        totalRealizedPnL += realizedPnL;
        totalAmountSold += trade.total; // Track total amount sold

        if (holding.quantity === 0) {
          holding.totalInvested = 0;
          holding.averagePrice = 0;
        } else {
          holding.totalInvested = holding.averagePrice * holding.quantity;
        }
      }
    }
  }

  // Convert holdings map to array and filter out zero quantities
  const holdingsArray = Array.from(holdings.values())
    .filter(holding => holding.quantity > 0);

  console.log('📊 Final holdings:', holdingsArray.map(h => ({ symbol: h.symbol, type: h.type, quantity: h.quantity })));

  return {
    holdings: holdingsArray,
    summary: {
      totalInvested: totalInvested,
      totalRealized: totalRealizedPnL, // Keep as P&L for backward compatibility
      totalAmountSold: totalAmountSold, // Add new field for total amount sold
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
      let currentPrice = null;
      
      console.log(`🔍 Fetching price for ${holding.symbol} (type: ${holding.type})`);
      
      // Use the type information from the holding to determine which API to call
      // Note: APIs return USD prices, but holdings are in CAD - currency conversion needed for accurate P&L
      if (holding.type === 'c') {
        try {
          // Use crypto API for crypto holdings
          const cryptoResponse = await axios.get(`http://localhost:5000/api/crypto/price/${holding.symbol.toLowerCase()}`);
          currentPrice = cryptoResponse.data.price;
          console.log(`✅ Fetched crypto price for ${holding.symbol}: $${currentPrice} USD (holding in CAD)`);
        } catch (cryptoError) {
          console.warn(`❌ Could not fetch crypto price for ${holding.symbol}:`, cryptoError.message);
          // For crypto, if API fails, we'll use a fallback price to avoid showing 0 values
          // This is a temporary solution - in production, you'd want to implement proper fallback logic
          if (holding.symbol === 'DOGE') {
            currentPrice = 0.08; // Fallback DOGE price in USD
            console.log(`🔄 Using fallback price for ${holding.symbol}: $${currentPrice} USD`);
          } else if (holding.symbol === 'BTC') {
            currentPrice = 45000; // Fallback BTC price in USD
            console.log(`🔄 Using fallback price for ${holding.symbol}: $${currentPrice} USD`);
          } else if (holding.symbol === 'ETH') {
            currentPrice = 3200; // Fallback ETH price in USD
            console.log(`🔄 Using fallback price for ${holding.symbol}: $${currentPrice} USD`);
          } else {
            console.warn(`⚠️ No fallback price available for ${holding.symbol}, current value will be null`);
          }
        }
      } else if (holding.type === 's') {
        try {
          // Use stock API for stock holdings
          const stockResponse = await axios.get(`http://localhost:5000/api/stocks/quote/${holding.symbol}`);
          currentPrice = stockResponse.data.price;
          console.log(`✅ Fetched stock price for ${holding.symbol}: $${currentPrice} USD (holding in CAD)`);
        } catch (stockError) {
          console.warn(`❌ Could not fetch stock price for ${holding.symbol}:`, stockError.message);
        }
      } else {
        console.warn(`⚠️ Unknown type '${holding.type}' for ${holding.symbol}, skipping price fetch`);
      }

      // Get company name for stocks
      let companyName = holding.symbol;
      if (holding.type === 's') {
        try {
          const stockResponse = await axios.get(`http://localhost:5000/api/stocks/quote/${holding.symbol}`);
          companyName = stockResponse.data.name || holding.symbol;
        } catch (nameError) {
          console.warn(`Could not fetch company name for ${holding.symbol}:`, nameError.message);
        }
      } else if (holding.type === 'c') {
        // For crypto, use a simple mapping or fetch from crypto API
        const cryptoNames = {
          'BTC': 'Bitcoin',
          'ETH': 'Ethereum',
          'ADA': 'Cardano',
          'SOL': 'Solana',
          'DOGE': 'Dogecoin'
        };
        companyName = cryptoNames[holding.symbol] || holding.symbol;
      }

      // Convert USD price to CAD for accurate P&L calculations
      const exchangeRate = await getUSDtoCADRate();
      const cadPrice = currentPrice ? currentPrice * exchangeRate : null;
      const currentValue = cadPrice ? cadPrice * holding.quantity : null;
      const unrealizedPnL = currentValue ? currentValue - holding.totalInvested : null;
      const totalPnL = unrealizedPnL ? unrealizedPnL + holding.realizedPnL : holding.realizedPnL;

      holdingsWithPrices.push({
        ...holding,
        companyName: companyName,
        currentPrice: cadPrice, // Store CAD price for display
        currentValue: currentValue,
        unrealizedPnL: unrealizedPnL,
        totalPnL: totalPnL,
        totalPnLPercent: totalPnL ? (totalPnL / holding.totalInvested) * 100 : null,
        usdPrice: currentPrice, // Keep USD price for reference
        exchangeRate: exchangeRate // Store exchange rate for transparency
      });
    } catch (error) {
      console.error(`Error fetching price for ${holding.symbol}:`, error);
      holdingsWithPrices.push(holding);
    }
  }

  return holdingsWithPrices;
}

// Helper function to process crypto format rows
function processCryptoRow(row, filename) {
  // Skip completely empty rows or rows with missing essential data
  if (!row.symbol || !row.date || !row.action || !row.quantity || !row['total amount'] || !row.type || 
      row.symbol.trim() === '' || row.date.trim() === '' || row.action.trim() === '' || 
      row.quantity.trim() === '' || row['total amount'].trim() === '' || row.type.trim() === '') {
    console.log(`Skipping empty/invalid row in ${filename}:`, row);
    return null;
  }

  // Only process BUY or SELL transactions
  if (row.action.toLowerCase() !== 'buy' && row.action.toLowerCase() !== 'sell') {
    return null;
  }

  // Validate type values
  if (row.type.toLowerCase() !== 's' && row.type.toLowerCase() !== 'c') {
    console.warn(`Invalid type '${row.type}' in ${filename}. Must be 's' for stock or 'c' for crypto`);
    return null;
  }

  // Parse date - handle both simple dates and datetime formats
  let parsedDate;
  try {
    parsedDate = new Date(row.date);
    if (isNaN(parsedDate.getTime())) {
      throw new Error('Invalid date');
    }
  } catch (dateError) {
    console.warn(`Invalid date format for ${row.symbol}: ${row.date}`);
    parsedDate = new Date(); // Use current date as fallback
  }

  const totalAmount = parseFloat(row['total amount']);
  const quantity = parseFloat(row.quantity);
  const pricePerUnit = totalAmount / quantity; // Calculate price per share/coin

  return {
    symbol: row.symbol.toUpperCase(),
    date: parsedDate,
    action: row.action.toLowerCase(),
    quantity: quantity,
    price: pricePerUnit, // Price per share/coin in CAD
    total: totalAmount, // Total amount invested in CAD
    type: row.type.toLowerCase(), // 's' for stock, 'c' for crypto
    currency: 'CAD' // All amounts are in CAD
  };
}

// Helper function to process Wealthsimple format rows
function processWealthsimpleRow(row, filename) {
  // Skip completely empty rows or rows with missing essential data
  if (!row.date || !row.transaction || !row.description || !row.amount || 
      row.date.trim() === '' || row.transaction.trim() === '' || 
      row.description.trim() === '' || row.amount.trim() === '') {
    console.log(`Skipping empty/invalid row in ${filename}:`, row);
    return null;
  }

  // Only process BUY or SELL transactions
  if (row.transaction.toUpperCase() !== 'BUY' && row.transaction.toUpperCase() !== 'SELL') {
    return null;
  }

  // Extract symbol and quantity from description
  // Format: "TSLA - Tesla Inc: Bought 1.0000 shares (executed at 2025-04-30), FX Rate: 1.4065"
  // Format: "TSLA - Tesla Inc: Sold 1.0000 shares (executed at 2025-03-18), FX Rate: 1.4026"
  const description = row.description;
  const symbolMatch = description.match(/^([A-Z]+)\s*-\s*/);
  
  // Check for both "Bought" and "Sold" patterns
  const boughtMatch = description.match(/Bought\s+([\d.]+)\s+shares/);
  const soldMatch = description.match(/Sold\s+([\d.]+)\s+shares/);
  
  if (!symbolMatch || (!boughtMatch && !soldMatch)) {
    console.warn(`Could not extract symbol or quantity from description in ${filename}: ${description}`);
    return null;
  }

  const symbol = symbolMatch[1];
  const quantity = parseFloat(boughtMatch ? boughtMatch[1] : soldMatch[1]);
  const amount = parseFloat(row.amount);
  
  // For Wealthsimple: 
  // - BUY transactions: negative amounts (money going out)
  // - SELL transactions: positive amounts (money coming in)
  const totalAmount = Math.abs(amount);
  const action = row.transaction.toLowerCase();
  const pricePerUnit = totalAmount / quantity;

  // Parse date
  let parsedDate;
  try {
    parsedDate = new Date(row.date);
    if (isNaN(parsedDate.getTime())) {
      throw new Error('Invalid date');
    }
  } catch (dateError) {
    console.warn(`Invalid date format for ${symbol}: ${row.date}`);
    parsedDate = new Date(); // Use current date as fallback
  }

  return {
    symbol: symbol.toUpperCase(),
    date: parsedDate,
    action: action,
    quantity: quantity,
    price: pricePerUnit, // Price per share in CAD
    total: totalAmount, // Total amount in CAD
    type: 's', // Wealthsimple is for stocks
    currency: 'CAD' // All amounts are in CAD
  };
}

module.exports = router; 