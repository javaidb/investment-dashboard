const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const holdingsCache = require('../cache');
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

// File-based storage for portfolio data
const PORTFOLIO_FILE = path.join(__dirname, '../data/cache', 'portfolios.json');

// Load portfolios from file
function loadPortfolios() {
  try {
    // Ensure portfolio directory exists
    const portfolioDir = path.dirname(PORTFOLIO_FILE);
    if (!fs.existsSync(portfolioDir)) {
      fs.mkdirSync(portfolioDir, { recursive: true });
      console.log(`📁 Created portfolio directory: ${portfolioDir}`);
    }
    
    if (fs.existsSync(PORTFOLIO_FILE)) {
      const data = fs.readFileSync(PORTFOLIO_FILE, 'utf8');
      const portfolioData = JSON.parse(data);
      const portfolios = new Map(Object.entries(portfolioData));
      console.log(`📁 Loaded ${portfolios.size} portfolios from file`);
      
      // Validate portfolio data structure
      for (const [id, portfolio] of portfolios.entries()) {
        if (!portfolio || typeof portfolio !== 'object') {
          console.warn(`⚠️ Invalid portfolio data for ID ${id}:`, portfolio);
          portfolios.delete(id);
          continue;
        }
        
        if (!portfolio.holdings || !Array.isArray(portfolio.holdings)) {
          console.warn(`⚠️ Portfolio ${id} has invalid holdings structure:`, portfolio.holdings);
          portfolio.holdings = [];
        }
        
        if (!portfolio.summary || typeof portfolio.summary !== 'object') {
          console.warn(`⚠️ Portfolio ${id} has invalid summary structure:`, portfolio.summary);
          portfolio.summary = {};
        }
      }
      
      return portfolios;
    } else {
      console.log('📁 No portfolio file found, starting with empty portfolios');
    }
  } catch (error) {
    console.warn('⚠️ Could not load portfolios from file:', error.message);
  }
  return new Map();
}

// Save portfolios to file
function savePortfolios(portfolios) {
  try {
    const portfolioData = Object.fromEntries(portfolios);
    fs.writeFileSync(PORTFOLIO_FILE, JSON.stringify(portfolioData, null, 2));
    console.log(`💾 Saved ${portfolios.size} portfolios to file`);
  } catch (error) {
    console.error('❌ Could not save portfolios to file:', error.message);
  }
}

// In-memory storage for portfolio data (in production, use a database)
const portfolios = loadPortfolios();

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
          
          // Save to file
          savePortfolios(portfolios);

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
    console.log('🔄 Processing uploaded CSV files...');
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
    
    console.log('📁 Found files:', allFiles.map(f => path.basename(f.path)));
    
    if (allFiles.length === 0) {
      console.log('❌ No CSV files found in uploads directory');
      return res.status(404).json({ error: 'No CSV files found in uploads directory' });
    }

    let allTrades = [];
    const portfolioId = Date.now().toString();
    console.log('🆔 Generated portfolio ID:', portfolioId);

    // Process each CSV file
    for (const fileInfo of allFiles) {
      const { path: filePath, type: fileType } = fileInfo;
      const trades = [];
      console.log(`📄 Processing ${fileType} file:`, path.basename(filePath));

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
            console.log(`✅ Completed processing ${path.basename(filePath)}, found ${trades.length} trades`);
            resolve();
          })
          .on('error', (error) => {
            console.error(`Error processing ${path.basename(filePath)}:`, error.message);
            resolve(); // Continue with other files instead of rejecting
          });
      });
    }

    console.log(`📊 Total trades found: ${allTrades.length}`);
    
    // Process all trades and calculate portfolio
    console.log('🔄 Processing trades and calculating portfolio...');
    const portfolio = await processTrades(allTrades);
    console.log('✅ Portfolio calculation completed');
    
    // Store portfolio data
    const portfolioData = {
      id: portfolioId,
      trades: allTrades,
      holdings: portfolio.holdings,
      summary: portfolio.summary,
      createdAt: new Date().toISOString()
    };
    
    console.log('💾 Storing portfolio data...');
    portfolios.set(portfolioId, portfolioData);
    console.log('📊 Current portfolios in memory:', Array.from(portfolios.keys()));
    
    // Save to file
    savePortfolios(portfolios);

    console.log('✅ Portfolio processing completed successfully');
    res.json({
      portfolioId: portfolioId,
      message: `Processed ${allFiles.length} CSV files successfully`,
      summary: portfolio.summary,
      holdings: portfolio.holdings,
      filesProcessed: allFiles.map(f => path.basename(f.path))
    });

  } catch (error) {
    console.error('❌ Uploaded files processing error:', error);
    res.status(500).json({ error: 'Failed to process uploaded files: ' + error.message });
  }
});

// Get historical data for portfolio stocks
router.get('/:portfolioId/historical', async (req, res) => {
  try {
    const { portfolioId } = req.params;
    const { period = '1y', interval = '1d' } = req.query;
    
    const portfolio = portfolios.get(portfolioId);
    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    if (!portfolio.holdings || !Array.isArray(portfolio.holdings)) {
      return res.status(400).json({ error: 'Invalid portfolio holdings' });
    }

    // Extract stock symbols from portfolio holdings
    const stockSymbols = portfolio.holdings
      .filter(holding => holding.type === 's' && holding.quantity > 0)
      .map(holding => holding.symbol);

    if (stockSymbols.length === 0) {
      return res.json({
        portfolioId,
        symbols: [],
        results: {},
        message: 'No stock holdings found in portfolio'
      });
    }

    console.log(`📊 Fetching historical data for ${stockSymbols.length} portfolio stocks`);

    // Make request to historical endpoint
    const axios = require('axios');
    const baseURL = process.env.NODE_ENV === 'production' 
      ? 'https://yourdomain.com/api' 
      : 'http://localhost:5000/api';
    
    const response = await axios.post(`${baseURL}/historical/stocks/batch`, {
      symbols: stockSymbols,
      period,
      interval
    }, {
      timeout: 30000
    });

    res.json({
      portfolioId,
      symbols: stockSymbols,
      period,
      interval,
      ...response.data
    });

  } catch (error) {
    console.error('❌ Portfolio historical data error:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch portfolio historical data',
      message: error.message
    });
  }
});

// Get monthly holdings data with daily resolution
router.get('/:portfolioId/monthly', async (req, res) => {
  try {
    const { portfolioId } = req.params;
    
    const portfolio = portfolios.get(portfolioId);
    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }
    
    if (!portfolio.holdings || !Array.isArray(portfolio.holdings)) {
      return res.status(400).json({ error: 'Invalid portfolio holdings' });
    }

    console.log(`📊 Fetching monthly data for portfolio ${portfolioId}`);
    
    // Calculate date range for last month (30 days)
    const now = new Date();
    const lastMonth = new Date(now);
    lastMonth.setDate(now.getDate() - 30); // Go back 30 days
    lastMonth.setHours(0, 0, 0, 0); // Start of day
    
    const startTimestamp = Math.floor(lastMonth.getTime() / 1000);
    const endTimestamp = Math.floor(now.getTime() / 1000);
    
    console.log(`📅 Date range: ${lastMonth.toISOString()} to ${now.toISOString()}`);

    // The monthly endpoint should get updated portfolio data with current prices first
    // Since the stored portfolio might not have the latest prices, use cache-based data
    let holdingsWithPrices = [];
    
    if (portfolio.holdings && Array.isArray(portfolio.holdings)) {
      holdingsWithPrices = portfolio.holdings.map(holding => {
        try {
          if (!holding || !holding.symbol) {
            return null;
          }
          
          const cachedData = holdingsCache && holdingsCache.get ? holdingsCache.get(holding.symbol) : null;
          if (cachedData) {
            const cadPrice = cachedData.cadPrice || 0;
            const currentValue = cadPrice * (holding.quantity || 0);
            const unrealizedPnL = currentValue - (holding.totalInvested || 0);
            const totalPnL = unrealizedPnL + (holding.realizedPnL || 0);
            const totalPnLPercent = (holding.totalInvested || 0) > 0 ? (totalPnL / holding.totalInvested) * 100 : 0;
            
            return {
              ...holding,
              companyName: cachedData.companyName || holding.symbol,
              currentPrice: cadPrice,
              currentValue: currentValue,
              unrealizedPnL: unrealizedPnL,
              totalPnL: totalPnL,
              totalPnLPercent: totalPnLPercent,
              usdPrice: cachedData.usdPrice || 0,
              exchangeRate: cachedData.exchangeRate || 1.35,
              cacheUsed: true
            };
          }
          
          // Use fallback prices for holdings not in cache
          let fallbackPrice = null;
          let companyName = holding.symbol;
          
          if (holding.type === 'c') {
            fallbackPrice = getCryptoFallbackPrice(holding.symbol);
            companyName = getCryptoName(holding.symbol);
          } else if (holding.type === 's') {
            fallbackPrice = getStockFallbackPrice(holding.symbol);
            companyName = getStockName(holding.symbol);
          }
          
          if (fallbackPrice) {
            const exchangeRate = 1.35; // fallback exchange rate
            const cadPrice = fallbackPrice * exchangeRate;
            const currentValue = cadPrice * (holding.quantity || 0);
            const unrealizedPnL = currentValue - (holding.totalInvested || 0);
            const totalPnL = unrealizedPnL + (holding.realizedPnL || 0);
            const totalPnLPercent = (holding.totalInvested || 0) > 0 ? (totalPnL / holding.totalInvested) * 100 : 0;
            
            return {
              ...holding,
              companyName: companyName,
              currentPrice: cadPrice,
              currentValue: currentValue,
              unrealizedPnL: unrealizedPnL,
              totalPnL: totalPnL,
              totalPnLPercent: totalPnLPercent,
              usdPrice: fallbackPrice,
              exchangeRate: exchangeRate,
              cacheUsed: false,
              fallbackUsed: true
            };
          }
          
          // Return holding with existing price data if available
          return holding.currentPrice ? holding : null;
        } catch (error) {
          console.error(`Error processing holding ${holding?.symbol}:`, error);
          return null;
        }
      }).filter(Boolean);
    }

    console.log(`📊 Total holdings processed: ${holdingsWithPrices.length}`);

    // Show all holdings, with those having price data first
    const holdingsWithData = holdingsWithPrices
      .sort((a, b) => {
        const aHasData = a.currentPrice !== null && a.currentPrice !== undefined && a.currentPrice > 0;
        const bHasData = b.currentPrice !== null && b.currentPrice !== undefined && b.currentPrice > 0;
        
        // First, prioritize holdings with price data
        if (aHasData && !bHasData) return -1;
        if (!aHasData && bHasData) return 1;
        
        // Among holdings with data, sort by performance
        if (aHasData && bHasData) {
          return (b.totalPnLPercent || 0) - (a.totalPnLPercent || 0);
        }
        
        // Among holdings without data, sort alphabetically
        return a.symbol.localeCompare(b.symbol);
      })
      .slice(0, 15); // Show up to 15 holdings
      
    console.log(`📈 Found ${holdingsWithData.length} holdings with price data:`, 
      holdingsWithData.map(h => ({ symbol: h.symbol, currentPrice: h.currentPrice, totalPnLPercent: h.totalPnLPercent })));

    if (holdingsWithData.length === 0) {
      return res.json({
        portfolioId,
        results: {},
        dateRange: {
          start: lastMonth.toISOString(),
          end: now.toISOString(),
          days: 30
        },
        summary: {
          total: 0,
          successful: 0,
          failed: 0
        },
        message: 'No holdings with price data found'
      });
    }

    console.log(`📈 Processing ${holdingsWithData.length} top performing holdings`);
    
    const results = {};
    const promises = holdingsWithData.map(async (holding) => {
      try {
        const symbol = holding.symbol;
        const cacheKey = `${symbol}_monthly_1d_${startTimestamp}`;
        
        // Skip chart generation for holdings without current price data
        if (!holding.currentPrice || holding.currentPrice <= 0) {
          results[symbol] = {
            data: [],
            meta: {
              companyName: holding.companyName || holding.symbol,
              currentPrice: null,
              change: null,
              changePercent: null,
              currency: 'CAD',
              monthlyPerformance: null
            },
            success: false,
            noData: true
          };
          return;
        }
        
        // Try to get real historical data first (for stocks)
        if (holding.type === 's') {
          try {
            const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`;
            const params = {
              period1: startTimestamp,
              period2: endTimestamp,
              interval: '1d',
              includePrePost: false
            };

            const response = await axios.get(yahooUrl, { 
              params,
              timeout: 10000 
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

                // Calculate monthly performance
                const firstPrice = historicalData[0]?.close;
                const lastPrice = historicalData[historicalData.length - 1]?.close;
                const change = lastPrice - firstPrice;
                const changePercent = firstPrice ? (change / firstPrice) * 100 : 0;

                results[symbol] = {
                  data: historicalData,
                  meta: {
                    companyName: meta.longName || meta.shortName || holding.companyName || symbol,
                    currentPrice: meta.regularMarketPrice || lastPrice || holding.currentPrice,
                    change: change,
                    changePercent: changePercent,
                    currency: meta.currency || 'USD',
                    monthlyPerformance: changePercent
                  },
                  success: true
                };
                return;
              }
            }
          } catch (error) {
            console.warn(`⚠️ Yahoo Finance failed for ${symbol}: ${error.message}`);
          }
        }
        
        // For crypto, don't generate mock data - historical data unavailable
        if (holding.type === 'c') {
          results[symbol] = {
            data: [],
            meta: {
              companyName: holding.companyName || holding.symbol,
              currentPrice: holding.currentPrice,
              change: null,
              changePercent: null,
              currency: 'CAD',
              monthlyPerformance: null
            },
            success: false,
            noData: true
          };
          return;
        }
        
        // Fallback: Generate mock daily data for the last month (stocks only)
        console.log(`🔄 Generating mock monthly data for ${symbol}`);
        const mockData = [];
        const daysInPeriod = 30;
        const basePrice = holding.currentPrice || 200;
        // Cap the total change to realistic values (-50% to +50%)
        const totalChange = Math.max(-50, Math.min(50, holding.totalPnLPercent || 5));
        const mockChangePercent = totalChange;
        
        for (let i = 0; i <= daysInPeriod; i++) {
          const dayDate = new Date(lastMonth.getTime() + (i * 24 * 60 * 60 * 1000));
          const progress = i / daysInPeriod;
          const priceChange = (totalChange / 100) * basePrice * progress;
          const dailyPrice = basePrice + priceChange + (Math.random() - 0.5) * basePrice * 0.02; // Add daily volatility
          
          mockData.push({
            date: dayDate.toISOString(),
            open: dailyPrice * (1 + (Math.random() - 0.5) * 0.02),
            high: dailyPrice * (1 + Math.random() * 0.03),
            low: dailyPrice * (1 - Math.random() * 0.03),
            close: dailyPrice,
            volume: Math.floor(Math.random() * 5000000) + 500000
          });
        }
        
        results[symbol] = {
          data: mockData,
          meta: {
            companyName: holding.companyName || holding.symbol,
            currentPrice: holding.currentPrice,
            change: holding.totalPnL,
            changePercent: holding.totalPnLPercent,
            currency: 'CAD',
            monthlyPerformance: mockChangePercent
          },
          success: true,
          mock: true
        };
        
      } catch (error) {
        console.error(`❌ Failed to process monthly data for ${holding.symbol}: ${error.message}`);
        results[holding.symbol] = {
          error: error.message,
          success: false
        };
      }
    });

    await Promise.all(promises);
    const successCount = Object.values(results).filter(r => r.success).length;

    res.json({
      portfolioId,
      results,
      dateRange: {
        start: lastMonth.toISOString(),
        end: now.toISOString(),
        days: 30
      },
      summary: {
        total: Object.keys(results).length,
        successful: successCount,
        failed: Object.keys(results).length - successCount
      },
      message: `Retrieved monthly data for ${successCount} holdings`
    });

  } catch (error) {
    console.error('❌ Portfolio monthly data error:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch portfolio monthly data',
      message: error.message
    });
  }
});

// Get portfolio summary
router.get('/:portfolioId', async (req, res) => {
  try {
    console.log('🔍 Portfolio GET request received for ID:', req.params.portfolioId);
    
    const { portfolioId } = req.params;
    
    if (!portfolioId) {
      console.log('❌ No portfolio ID provided');
      return res.status(400).json({ error: 'Portfolio ID is required' });
    }
    
    console.log('📊 Current portfolios in memory:', Array.from(portfolios.keys()));
    const portfolio = portfolios.get(portfolioId);

    if (!portfolio) {
      console.log('❌ Portfolio not found:', portfolioId);
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    console.log('✅ Portfolio found, validating structure...');
    console.log('Portfolio structure:', {
      hasHoldings: !!portfolio.holdings,
      holdingsType: typeof portfolio.holdings,
      holdingsLength: portfolio.holdings ? portfolio.holdings.length : 'N/A',
      hasSummary: !!portfolio.summary,
      summaryType: typeof portfolio.summary
    });

    // Validate portfolio structure
    if (!portfolio.holdings || !Array.isArray(portfolio.holdings)) {
      console.error('❌ Invalid portfolio structure:', portfolio);
      return res.status(500).json({ error: 'Invalid portfolio data structure' });
    }

    console.log('🔄 Starting price fetching for', portfolio.holdings.length, 'holdings...');
    
    // Skip live price fetching for now to prevent crashes - use cache only
    let holdingsWithPrices;
    try {
      console.log('ℹ️ Using cache-only mode to prevent API timeouts');
      holdingsWithPrices = portfolio.holdings.map(holding => {
        try {
          if (!holding || !holding.symbol) {
            console.warn('Invalid holding object:', holding);
            return null;
          }
          
          const cachedData = holdingsCache && holdingsCache.get ? holdingsCache.get(holding.symbol) : null;
          if (cachedData) {
            const cadPrice = cachedData.cadPrice || 0;
            const currentValue = cadPrice * (holding.quantity || 0);
            const unrealizedPnL = currentValue - (holding.totalInvested || 0);
            const totalPnL = unrealizedPnL + (holding.realizedPnL || 0);
            const totalPnLPercent = (holding.totalInvested || 0) > 0 ? (totalPnL / holding.totalInvested) * 100 : 0;
            
            return {
              ...holding,
              companyName: cachedData.companyName || holding.symbol,
              currentPrice: cadPrice,
              currentValue: currentValue,
              unrealizedPnL: unrealizedPnL,
              totalPnL: totalPnL,
              totalPnLPercent: totalPnLPercent,
              usdPrice: cachedData.usdPrice || 0,
              exchangeRate: cachedData.exchangeRate || 1.35,
              cacheUsed: true
            };
          }
          
          // Use fallback prices for holdings not in cache
          let fallbackPrice = null;
          let companyName = holding.symbol;
          
          if (holding.type === 'c') {
            fallbackPrice = getCryptoFallbackPrice(holding.symbol);
            companyName = getCryptoName(holding.symbol);
          } else if (holding.type === 's') {
            fallbackPrice = getStockFallbackPrice(holding.symbol);
            companyName = getStockName(holding.symbol);
          }
          
          if (fallbackPrice) {
            const exchangeRate = 1.35; // fallback exchange rate
            const cadPrice = fallbackPrice * exchangeRate;
            const currentValue = cadPrice * (holding.quantity || 0);
            const unrealizedPnL = currentValue - (holding.totalInvested || 0);
            const totalPnL = unrealizedPnL + (holding.realizedPnL || 0);
            const totalPnLPercent = (holding.totalInvested || 0) > 0 ? (totalPnL / holding.totalInvested) * 100 : 0;
            
            return {
              ...holding,
              companyName: companyName,
              currentPrice: cadPrice,
              currentValue: currentValue,
              unrealizedPnL: unrealizedPnL,
              totalPnL: totalPnL,
              totalPnLPercent: totalPnLPercent,
              usdPrice: fallbackPrice,
              exchangeRate: exchangeRate,
              cacheUsed: false,
              fallbackUsed: true
            };
          }
          
          // Return holding with null values if no data available
          return {
            ...holding,
            companyName: holding.symbol,
            currentPrice: null,
            currentValue: null,
            unrealizedPnL: null,
            totalPnL: null,
            totalPnLPercent: null,
            usdPrice: null,
            exchangeRate: null,
            cacheUsed: false,
            fallbackUsed: false
          };
        } catch (holdingError) {
          console.error(`Error processing holding ${holding?.symbol}:`, holdingError);
          return holding;
        }
      }).filter(Boolean); // Remove null entries
      console.log('✅ Cache-only processing completed');
    } catch (error) {
      console.error('❌ Cache processing failed:', error);
      // Ultimate fallback - return original holdings with basic structure
      holdingsWithPrices = portfolio.holdings.map(holding => ({
        ...holding,
        companyName: holding.symbol,
        currentPrice: null,
        currentValue: null,
        unrealizedPnL: null,
        totalPnL: null,
        totalPnLPercent: null,
        usdPrice: null,
        exchangeRate: null,
        cacheUsed: false,
        fallbackUsed: false
      }));
    }

    // Validate holdingsWithPrices
    if (!holdingsWithPrices || !Array.isArray(holdingsWithPrices)) {
      console.error('❌ Failed to process holdings with prices');
      return res.status(500).json({ error: 'Failed to process portfolio holdings' });
    }

    console.log('📤 Sending portfolio response...');
    res.json({
      id: portfolioId,
      summary: portfolio.summary || {},
      holdings: holdingsWithPrices,
      trades: portfolio.trades || [],
      createdAt: portfolio.createdAt,
      lastUpdated: new Date().toISOString(),
      dataSource: 'API'
    });
    console.log('✅ Portfolio response sent successfully');
  } catch (error) {
    console.error('❌ Portfolio retrieval error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to retrieve portfolio', details: error.message });
  }
});

// Get all portfolios
router.get('/', (req, res) => {
  try {
    const portfolioList = Array.from(portfolios.values()).map(portfolio => ({
      id: portfolio.id,
      summary: portfolio.summary,
      createdAt: portfolio.createdAt,
      lastUpdated: new Date().toISOString()
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

    // Save to file after deletion
    savePortfolios(portfolios);

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

  // Convert holdings map to array and change zero quantities to 1e-9 to show in assets
  const holdingsArray = Array.from(holdings.values())
    .map(holding => {
      if (holding.quantity === 0) {
        holding.quantity = 1e-9;
      }
      return holding;
    });

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

// Helper function to get current prices for holdings with cache fallback
async function getCurrentPrices(holdings) {
  if (!holdings || !Array.isArray(holdings)) {
    console.warn('Invalid holdings array provided to getCurrentPrices');
    return [];
  }
  
  console.log(`📊 Processing ${holdings.length} holdings for price data`);
  const holdingsWithPrices = [];
  
  // Process holdings sequentially to avoid overwhelming APIs
  for (const holding of holdings) {
    try {
      if (!holding || !holding.symbol) {
        console.warn('Invalid holding object, skipping:', holding);
        holdingsWithPrices.push(holding);
        continue;
      }
      
      let currentPrice = null;
      let companyName = holding.symbol;
      let exchangeRate = null;
      let cadPrice = null;
      let currentValue = null;
      let unrealizedPnL = null;
      let totalPnL = null;
      let totalPnLPercent = null;
      let usdPrice = null;
      let cacheUsed = false;
      
      console.log(`🔍 Processing ${holding.symbol} (type: ${holding.type})`);
      
      // Try to fetch fresh data from API first
      try {
        if (holding.type === 'c') {
          // Fetch crypto price from CoinGecko
          const coinGeckoUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${getCoinGeckoId(holding.symbol)}&vs_currencies=usd`;
          const cryptoResponse = await axios.get(coinGeckoUrl, { timeout: 8000 });
          const coinId = getCoinGeckoId(holding.symbol);
          const fetchedPrice = cryptoResponse.data[coinId]?.usd;
          
          if (fetchedPrice) {
            console.log(`✅ Fetched fresh crypto price for ${holding.symbol}: $${fetchedPrice} USD`);
            currentPrice = fetchedPrice;
            companyName = getCryptoName(holding.symbol);
            
            // Get exchange rate and calculate CAD price
            exchangeRate = await getUSDtoCADRate();
            cadPrice = currentPrice * exchangeRate;
            usdPrice = currentPrice;
            
            // Update cache with fresh data
            holdingsCache.update(holding.symbol, {
              price: currentPrice,
              usdPrice: currentPrice,
              cadPrice: cadPrice,
              companyName: companyName,
              exchangeRate: exchangeRate
            });
          } else {
            throw new Error('No price data returned from CoinGecko');
          }
        } else if (holding.type === 's') {
          // Fetch stock price from Yahoo Finance
          const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${holding.symbol}`;
          const stockResponse = await axios.get(yahooUrl, { timeout: 8000 });
          
          if (stockResponse.data?.chart?.result?.[0]) {
            const result = stockResponse.data.chart.result[0];
            const meta = result.meta;
            const fetchedPrice = meta.regularMarketPrice || meta.previousClose;
            
            if (fetchedPrice) {
              console.log(`✅ Fetched fresh stock price for ${holding.symbol}: $${fetchedPrice} USD`);
              currentPrice = fetchedPrice;
              companyName = meta.longName || meta.shortName || getStockName(holding.symbol);
              
              // Get exchange rate and calculate CAD price
              exchangeRate = await getUSDtoCADRate();
              cadPrice = currentPrice * exchangeRate;
              usdPrice = currentPrice;
              
              // Update cache with fresh data
              holdingsCache.update(holding.symbol, {
                price: currentPrice,
                usdPrice: currentPrice,
                cadPrice: cadPrice,
                companyName: companyName,
                exchangeRate: exchangeRate
              });
            } else {
              throw new Error('No price data in Yahoo Finance response');
            }
          } else {
            throw new Error('Invalid response format from Yahoo Finance');
          }
        }
      } catch (apiError) {
        console.warn(`❌ API fetch failed for ${holding.symbol}: ${apiError.message}`);
        
        // Fall back to cached data if API fails
        const cachedData = holdingsCache.get(holding.symbol);
        if (cachedData) {
          console.log(`🔄 Using cached data as fallback for ${holding.symbol}`);
          currentPrice = cachedData.usdPrice || 0;
          companyName = cachedData.companyName || holding.symbol;
          exchangeRate = cachedData.exchangeRate || 1.35;
          cadPrice = cachedData.cadPrice || 0;
          usdPrice = cachedData.usdPrice || 0;
          cacheUsed = true;
        } else {
          // Final fallback to hardcoded prices
          if (holding.type === 'c') {
            currentPrice = getCryptoFallbackPrice(holding.symbol);
            companyName = getCryptoName(holding.symbol);
          } else if (holding.type === 's') {
            currentPrice = getStockFallbackPrice(holding.symbol);
            companyName = getStockName(holding.symbol);
          }
          
          if (currentPrice) {
            console.log(`🔄 Using hardcoded fallback price for ${holding.symbol}: $${currentPrice} USD`);
            exchangeRate = 1.35; // fallback exchange rate
            cadPrice = currentPrice * exchangeRate;
            usdPrice = currentPrice;
          }
        }
      }
      
      // Calculate financial metrics
      if (cadPrice && holding.quantity) {
        currentValue = cadPrice * (holding.quantity || 0);
        unrealizedPnL = currentValue - (holding.totalInvested || 0);
        totalPnL = unrealizedPnL + (holding.realizedPnL || 0);
        totalPnLPercent = (holding.totalInvested || 0) > 0 ? (totalPnL / holding.totalInvested) * 100 : 0;
      }

      holdingsWithPrices.push({
        ...holding,
        companyName: companyName,
        currentPrice: cadPrice, // Store CAD price for display
        currentValue: currentValue,
        unrealizedPnL: unrealizedPnL,
        totalPnL: totalPnL,
        totalPnLPercent: totalPnLPercent,
        usdPrice: usdPrice, // Keep USD price for reference
        exchangeRate: exchangeRate, // Store exchange rate for transparency
        cacheUsed: cacheUsed // Flag to indicate if cache was used
      });
    } catch (error) {
      console.error(`Critical error processing holding ${holding?.symbol}:`, error);
      // Return the holding without price data rather than failing completely
      holdingsWithPrices.push(holding);
    }
  }

  console.log(`✅ Completed processing ${holdingsWithPrices.length} holdings`);
  return holdingsWithPrices;
}

// Helper function to get crypto names
function getCryptoName(symbol) {
  const cryptoNames = {
    'BTC': 'Bitcoin',
    'ETH': 'Ethereum',
    'ADA': 'Cardano',
    'SOL': 'Solana',
    'DOGE': 'Dogecoin'
  };
  return cryptoNames[symbol] || symbol;
}

// Helper function to get CoinGecko IDs for crypto symbols
function getCoinGeckoId(symbol) {
  const coinGeckoIds = {
    'BTC': 'bitcoin',
    'ETH': 'ethereum',
    'ADA': 'cardano',
    'SOL': 'solana',
    'DOGE': 'dogecoin'
  };
  return coinGeckoIds[symbol] || symbol.toLowerCase();
}

// Helper function to get crypto fallback prices
function getCryptoFallbackPrice(symbol) {
  const fallbackPrices = {
    'DOGE': 0.08,
    'BTC': 45000,
    'ETH': 3200,
    'ADA': 0.60,
    'SOL': 100
  };
  return fallbackPrices[symbol] || null;
}

// Helper function to get stock fallback prices
function getStockFallbackPrice(symbol) {
  const fallbackPrices = {
    'AAPL': 150.00,
    'GOOGL': 2800.00,
    'MSFT': 330.00,
    'TSLA': 200.00,
    'AMZN': 3200.00,
    'META': 320.00,
    'NVDA': 450.00,
    'NFLX': 400.00,
    'AMD': 110.00,
    'INTC': 45.00,
    'SPY': 450.00,
    'QQQ': 380.00,
    'VTI': 220.00,
    'RIVN': 12.00,
    'VOO': 400.00,
    'TSM': 120.00,
    'ACHR': 8.00,
    'MSTR': 350.00
  };
  return fallbackPrices[symbol] || null;
}

// Helper function to get stock names
function getStockName(symbol) {
  const stockNames = {
    'AAPL': 'Apple Inc.',
    'GOOGL': 'Alphabet Inc.',
    'MSFT': 'Microsoft Corporation',
    'TSLA': 'Tesla, Inc.',
    'AMZN': 'Amazon.com Inc.',
    'META': 'Meta Platforms Inc.',
    'NVDA': 'NVIDIA Corporation',
    'NFLX': 'Netflix Inc.',
    'AMD': 'Advanced Micro Devices',
    'INTC': 'Intel Corporation',
    'SPY': 'SPDR S&P 500 ETF',
    'QQQ': 'Invesco QQQ Trust',
    'VTI': 'Vanguard Total Stock Market ETF',
    'RIVN': 'Rivian Automotive Inc.',
    'VOO': 'Vanguard S&P 500 ETF',
    'TSM': 'Taiwan Semiconductor Manufacturing',
    'ACHR': 'Archer Aviation Inc.',
    'MSTR': 'MicroStrategy Incorporated'
  };
  return stockNames[symbol] || symbol;
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

// Cache management endpoints
router.get('/cache/stats', (req, res) => {
  try {
    const stats = holdingsCache.getStats();
    res.json({
      success: true,
      cache: stats,
      message: `Cache contains ${stats.totalEntries} entries`
    });
  } catch (error) {
    console.error('Cache stats error:', error);
    res.status(500).json({ error: 'Failed to get cache statistics' });
  }
});

router.get('/cache/data', (req, res) => {
  try {
    const cacheData = {};
    
    // Check if holdingsCache and its cache property exist
    if (holdingsCache && holdingsCache.cache) {
      for (const [symbol, data] of holdingsCache.cache.entries()) {
        cacheData[symbol] = data;
      }
    } else {
      console.warn('Holdings cache not available or not properly initialized');
    }
    
    res.json({
      success: true,
      cache: cacheData,
      message: `Retrieved ${Object.keys(cacheData).length} cache entries`
    });
  } catch (error) {
    console.error('Cache data error:', error);
    res.status(500).json({ error: 'Failed to get cache data' });
  }
});

router.delete('/cache/clear', (req, res) => {
  try {
    // Clear all cache entries
    const stats = holdingsCache.getStats();
    holdingsCache.cache.clear();
    holdingsCache.saveCache();
    
    res.json({
      success: true,
      message: `Cleared ${stats.totalEntries} cache entries`
    });
  } catch (error) {
    console.error('Cache clear error:', error);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

router.delete('/cache/:symbol', (req, res) => {
  try {
    const { symbol } = req.params;
    const deleted = holdingsCache.cache.delete(symbol);
    holdingsCache.saveCache();
    
    res.json({
      success: true,
      message: deleted ? `Removed ${symbol} from cache` : `${symbol} not found in cache`
    });
  } catch (error) {
    console.error('Cache delete error:', error);
    res.status(500).json({ error: 'Failed to delete cache entry' });
  }
});

module.exports = router; 