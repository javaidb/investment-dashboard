const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const holdingsCache = require('../cache');
const historicalDataCache = require('../historical-cache');
const fileTracker = require('../file-tracker');
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

// Load portfolios from file (new file-based caching structure)
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
      const portfolios = new Map();
      
      // Check if this is the old format (portfolioId -> portfolio) or new format (filename -> fileData)
      const isOldFormat = Object.keys(portfolioData).some(key => {
        const item = portfolioData[key];
        return item && item.id && item.trades && item.holdings;
      });
      
      if (isOldFormat) {
        // Convert old format to new format temporarily for backward compatibility
        console.log('📁 Converting old portfolio format to new file-based format...');
        const legacyPortfolios = new Map(Object.entries(portfolioData));
        
        // Validate legacy portfolio data structure
        for (const [id, portfolio] of legacyPortfolios.entries()) {
          if (!portfolio || typeof portfolio !== 'object') {
            console.warn(`⚠️ Invalid portfolio data for ID ${id}:`, portfolio);
            legacyPortfolios.delete(id);
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
        
        console.log(`📁 Loaded ${legacyPortfolios.size} legacy portfolios from file`);
        return legacyPortfolios;
      } else {
        // New file-based format: filename -> { fileMetadata, portfolio }
        let totalPortfolios = 0;
        for (const [filename, fileData] of Object.entries(portfolioData)) {
          if (fileData && fileData.portfolio && typeof fileData.portfolio === 'object') {
            portfolios.set(fileData.portfolio.id, fileData.portfolio);
            totalPortfolios++;
          }
        }
        console.log(`📁 Loaded ${totalPortfolios} portfolios from ${Object.keys(portfolioData).length} files`);
        return portfolios;
      }
    } else {
      console.log('📁 No portfolio file found, starting with empty portfolios');
    }
  } catch (error) {
    console.warn('⚠️ Could not load portfolios from file:', error.message);
  }
  return new Map();
}

// Save portfolios to file with file-based caching structure
function savePortfolios(portfolios, fileMetadata = null) {
  try {
    let portfolioData = {};
    
    // Load existing file-based data if it exists
    if (fs.existsSync(PORTFOLIO_FILE)) {
      try {
        const existingData = fs.readFileSync(PORTFOLIO_FILE, 'utf8');
        const parsedData = JSON.parse(existingData);
        
        // Check if existing data is in new file-based format
        const isNewFormat = Object.keys(parsedData).some(key => {
          const item = parsedData[key];
          return item && item.fileMetadata && item.portfolio;
        });
        
        if (isNewFormat) {
          portfolioData = parsedData;
        }
      } catch (parseError) {
        console.warn('⚠️ Could not parse existing portfolio data, starting fresh');
      }
    }
    
    // If fileMetadata is provided, update specific files
    if (fileMetadata && Array.isArray(fileMetadata)) {
      for (const fileMeta of fileMetadata) {
        const portfolio = Array.from(portfolios.values()).find(p => p.id === fileMeta.portfolioId);
        if (portfolio) {
          portfolioData[fileMeta.filename] = {
            fileMetadata: {
              folder: fileMeta.folder,
              filename: fileMeta.filename,
              fileSize: fileMeta.fileSize,
              lastModified: fileMeta.lastModified,
              processedAt: new Date().toISOString()
            },
            portfolio: portfolio
          };
        }
      }
    } else {
      // Fallback: save all portfolios without specific file metadata (legacy mode)
      const timestamp = new Date().toISOString();
      for (const [portfolioId, portfolio] of portfolios.entries()) {
        const filename = `portfolio_${portfolioId}.csv`;
        portfolioData[filename] = {
          fileMetadata: {
            folder: 'unknown',
            filename: filename,
            fileSize: 0,
            lastModified: timestamp,
            processedAt: timestamp
          },
          portfolio: portfolio
        };
      }
    }
    
    fs.writeFileSync(PORTFOLIO_FILE, JSON.stringify(portfolioData, null, 2));
    console.log(`💾 Saved ${Object.keys(portfolioData).length} file entries containing ${portfolios.size} portfolios`);
  } catch (error) {
    console.error('❌ Could not save portfolios to file:', error.message);
  }
}

// In-memory storage for portfolio data (in production, use a database)
const portfolios = loadPortfolios();

// Startup check for file modifications - run automatically when module loads
(async function startupFileCheck() {
  try {
    console.log('🚀 Running startup file modification check...');
    
    const modificationCheck = checkFileModifications();
    
    if (modificationCheck.hasOutdatedFiles) {
      console.log(`📄 Startup detected ${modificationCheck.outdatedFiles.length} outdated files, auto-reprocessing...`);
      console.log(`📄 Outdated files: ${modificationCheck.outdatedFiles.map(f => f.name).join(', ')}`);
      
      // Wait a moment for the server to fully initialize
      setTimeout(async () => {
        try {
          const fakeReq = { body: {}, params: {}, query: {} };
          const fakeRes = {
            json: (data) => {
              console.log('✅ Startup auto-reprocessing completed successfully');
              // Reload portfolios from updated cache
              const updatedPortfolios = loadPortfolios();
              portfolios.clear();
              for (const [id, portfolio] of updatedPortfolios.entries()) {
                portfolios.set(id, portfolio);
              }
              console.log('📊 Reloaded portfolios after startup processing');
            },
            status: (code) => ({
              json: (data) => {
                console.warn('⚠️ Startup auto-reprocessing failed:', data);
              }
            })
          };
          
          await processUploadedFiles(fakeReq, fakeRes);
        } catch (error) {
          console.warn('⚠️ Startup auto-reprocessing error:', error.message);
        }
      }, 2000); // Wait 2 seconds for server to be ready
    } else {
      console.log('✅ Startup check: All files are up to date');
    }
  } catch (error) {
    console.warn('⚠️ Startup file check error:', error.message);
  }
})();

// Processing locks and request deduplication
let isProcessing = false;
const activeRequests = new Map(); // Track active requests to prevent duplicates
const portfolioRequestQueue = new Map(); // Queue for portfolio requests

// Middleware to automatically check for file modifications and reprocess if needed
const autoReprocessMiddleware = async (req, res, next) => {
  try {
    // Skip auto-check for certain endpoints to avoid infinite loops
    const skipPaths = ['/process-uploaded', '/auto-process', '/check-modifications', '/upload'];
    const shouldSkip = skipPaths.some(path => req.path.includes(path));
    
    if (shouldSkip || isProcessing) {
      console.log(`⏭️ Skipping auto-reprocess check for ${req.path} (${shouldSkip ? 'excluded path' : 'already processing'})`);
      return next();
    }

    console.log('🔄 Auto-checking for file modifications...');
    const modificationCheck = checkFileModifications();
    
    if (modificationCheck.hasOutdatedFiles) {
      console.log(`📄 Found ${modificationCheck.outdatedFiles.length} outdated files, auto-reprocessing...`);
      console.log(`📄 Outdated files: ${modificationCheck.outdatedFiles.map(f => f.name).join(', ')}`);
      
      // Set processing flag to prevent concurrent processing
      isProcessing = true;
      
      try {
        // Trigger auto-reprocessing synchronously
        await new Promise((resolve, reject) => {
          const fakeReq = { body: {}, params: {}, query: {} };
          const fakeRes = {
            json: (data) => {
              console.log('✅ Auto-reprocessing completed successfully');
              // Reload portfolios from updated cache
              const updatedPortfolios = loadPortfolios();
              for (const [id, portfolio] of updatedPortfolios.entries()) {
                portfolios.set(id, portfolio);
              }
              resolve(data);
            },
            status: (code) => ({
              json: (data) => {
                console.warn('⚠️ Auto-reprocessing failed:', data);
                resolve(null); // Continue with existing data
              }
            })
          };
          
          processUploadedFiles(fakeReq, fakeRes).catch(error => {
            console.warn('⚠️ Auto-reprocessing error:', error.message);
            resolve(null); // Continue with existing data
          });
        });
        
        console.log('📊 Reloaded portfolios after auto-processing');
      } catch (autoProcessError) {
        console.warn('⚠️ Auto-reprocessing failed, continuing with existing data:', autoProcessError.message);
      } finally {
        isProcessing = false;
      }
    } else {
      console.log('✅ All files are up to date, no reprocessing needed');
    }
    
    next();
  } catch (error) {
    console.error('❌ Auto-reprocess middleware error:', error.message);
    next(); // Continue even if auto-reprocessing fails
  }
};

// Currency conversion cache
const currencyCache = new Map();
const CURRENCY_CACHE_DURATION = 60 * 60 * 1000; // 1 hour

// Request deduplication utility
function deduplicateRequest(key, requestPromise) {
  if (activeRequests.has(key)) {
    console.log(`🔄 Deduplicating request for key: ${key}`);
    return activeRequests.get(key);
  }
  
  const promise = requestPromise()
    .finally(() => {
      activeRequests.delete(key);
    });
  
  activeRequests.set(key, promise);
  return promise;
}

// Request queue utility for expensive operations
async function queueRequest(queueKey, operation) {
  if (portfolioRequestQueue.has(queueKey)) {
    console.log(`⏳ Queueing request for: ${queueKey}`);
    await portfolioRequestQueue.get(queueKey);
  }
  
  const promise = operation();
  portfolioRequestQueue.set(queueKey, promise);
  
  try {
    const result = await promise;
    return result;
  } finally {
    portfolioRequestQueue.delete(queueKey);
  }
}

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

// Check for file changes (can be called independently)
router.get('/check-changes', (req, res) => {
  try {
    const changes = fileTracker.checkForChanges();
    const stats = fileTracker.getStats();
    
    res.json({
      success: true,
      changes: changes,
      stats: stats,
      hasChanges: changes.hasChanges,
      message: changes.hasChanges ? 
        `Found ${changes.newFiles.length} new and ${changes.modifiedFiles.length} modified files` :
        'No file changes detected'
    });
  } catch (error) {
    console.error('File change check error:', error);
    res.status(500).json({ error: 'Failed to check for file changes' });
  }
});

// Check file modifications against cache
router.get('/check-modifications', (req, res) => {
  try {
    const modificationCheck = checkFileModifications();
    
    res.json({
      success: true,
      ...modificationCheck,
      message: modificationCheck.hasOutdatedFiles ? 
        `${modificationCheck.outdatedFiles.length} files need reprocessing` :
        'All files are up to date'
    });
  } catch (error) {
    console.error('File modification check error:', error);
    res.status(500).json({ error: 'Failed to check file modifications' });
  }
});

// Read and process uploaded CSV files
router.post('/process-uploaded', async (req, res) => {
  return await processUploadedFiles(req, res);
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
router.get('/:portfolioId/monthly', autoReprocessMiddleware, async (req, res) => {
  const { portfolioId } = req.params;
  
  try {
    const portfolio = portfolios.get(portfolioId);
    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }
    
    if (!portfolio.holdings || !Array.isArray(portfolio.holdings)) {
      return res.status(400).json({ error: 'Invalid portfolio holdings' });
    }

    console.log(`📊 Fetching monthly data for portfolio ${portfolioId}`);
    
    // Calculate date range for last 3 months (90 days)
    const now = new Date();
    const lastMonth = new Date(now);
    lastMonth.setDate(now.getDate() - 90); // Go back 90 days (3 months)
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
          if (cachedData && 
              typeof cachedData === 'object' && 
              cachedData.cadPrice !== undefined && 
              cachedData.cadPrice !== null && 
              !isNaN(cachedData.cadPrice)) {
            const cadPrice = Number(cachedData.cadPrice) || 0;
            const currentValue = cadPrice * (Number(holding.quantity) || 0);
            const unrealizedPnL = currentValue - (Number(holding.totalInvested) || 0);
            const totalPnL = unrealizedPnL + (Number(holding.realizedPnL) || 0);
            const totalPnLPercent = (Number(holding.totalInvested) || 0) > 0 ? (totalPnL / Number(holding.totalInvested)) * 100 : 0;
            
            return {
              ...holding,
              companyName: cachedData.companyName || holding.symbol,
              currentPrice: cadPrice,
              currentValue: currentValue,
              unrealizedPnL: unrealizedPnL,
              totalPnL: totalPnL,
              totalPnLPercent: totalPnLPercent,
              usdPrice: Number(cachedData.usdPrice) || 0,
              exchangeRate: Number(cachedData.exchangeRate) || 1.35,
              cacheUsed: true
            };
          }
          
          // Use fallback prices only for crypto, not for stocks
          let fallbackPrice = null;
          let companyName = holding.symbol;
          
          if (holding.type === 'c') {
            fallbackPrice = getCryptoFallbackPrice(holding.symbol);
            companyName = getCryptoName(holding.symbol);
            
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
      }); // Process ALL holdings as requested
      
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
    const timeout = 30000; // 30 second timeout
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
        
        // Try to get historical data from cache first (for stocks)
        if (holding.type === 's') {
          // Check cache first
          const cachedHistorical = historicalDataCache.get(symbol, '3m', '1d');
          
          if (cachedHistorical && !cachedHistorical.needsUpdate) {
            // Use cached data
            console.log(`📦 Using cached historical data for ${symbol}`);
            const historicalData = cachedHistorical.data;
            const meta = cachedHistorical.meta;
            
            if (historicalData && historicalData.length > 0) {
              // Calculate monthly performance from cached data
              const firstPrice = historicalData[0]?.close;
              const lastPrice = historicalData[historicalData.length - 1]?.close;
              const change = lastPrice - firstPrice;
              const changePercent = firstPrice ? (change / firstPrice) * 100 : 0;

              results[symbol] = {
                data: historicalData,
                meta: {
                  ...meta,
                  companyName: meta.companyName || holding.companyName || symbol,
                  currentPrice: meta.currentPrice || holding.currentPrice,
                  change: change,
                  changePercent: changePercent,
                  monthlyPerformance: changePercent
                },
                success: true,
                fromCache: true
              };
              return;
            }
          }

          // If no cache or needs update, fetch from Yahoo Finance
          try {
            console.log(`🌐 Fetching fresh historical data for ${symbol}`);
            const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`;
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

                // Calculate monthly performance
                const firstPrice = historicalData[0]?.close;
                const lastPrice = historicalData[historicalData.length - 1]?.close;
                const change = lastPrice - firstPrice;
                const changePercent = firstPrice ? (change / firstPrice) * 100 : 0;

                // Cache the current price data with datetime for future use
                const currentPrice = meta.regularMarketPrice || lastPrice;
                if (currentPrice) {
                  const exchangeRate = await getUSDtoCADRate();
                  holdingsCache.update(symbol, {
                    price: currentPrice,
                    usdPrice: currentPrice,
                    cadPrice: currentPrice * exchangeRate,
                    companyName: meta.longName || meta.shortName || symbol,
                    exchangeRate: exchangeRate,
                    fetchedAt: new Date().toISOString(),
                    currency: meta.currency || 'USD'
                  });
                  console.log(`💾 Cached price data for ${symbol}: $${currentPrice} USD at ${new Date().toISOString()}`);
                }

                // Cache the historical data
                const historicalCacheData = {
                  data: historicalData,
                  meta: {
                    companyName: meta.longName || meta.shortName || holding.companyName || symbol,
                    currentPrice: currentPrice || holding.currentPrice,
                    currency: meta.currency || 'USD'
                  },
                  dateRange: {
                    start: new Date(startTimestamp * 1000).toISOString(),
                    end: new Date(endTimestamp * 1000).toISOString(),
                    days: 30
                  }
                };
                
                historicalDataCache.update(symbol, historicalCacheData, '3m', '1d');

                results[symbol] = {
                  data: historicalData,
                  meta: {
                    companyName: meta.longName || meta.shortName || holding.companyName || symbol,
                    currentPrice: currentPrice || holding.currentPrice,
                    change: change,
                    changePercent: changePercent,
                    currency: meta.currency || 'USD',
                    monthlyPerformance: changePercent
                  },
                  success: true,
                  fromCache: false
                };
                return;
              }
            }
          } catch (error) {
            console.warn(`⚠️ Yahoo Finance failed for ${symbol}: ${error.message}`);
            
            // Try to use stale cache data if available
            if (cachedHistorical && cachedHistorical.data && cachedHistorical.data.length > 0) {
              console.log(`📦 Using stale cached data for ${symbol} due to API failure`);
              const historicalData = cachedHistorical.data;
              const meta = cachedHistorical.meta;
              
              const firstPrice = historicalData[0]?.close;
              const lastPrice = historicalData[historicalData.length - 1]?.close;
              const change = lastPrice - firstPrice;
              const changePercent = firstPrice ? (change / firstPrice) * 100 : 0;

              results[symbol] = {
                data: historicalData,
                meta: {
                  ...meta,
                  companyName: meta.companyName || holding.companyName || symbol,
                  currentPrice: meta.currentPrice || holding.currentPrice,
                  change: change,
                  changePercent: changePercent,
                  monthlyPerformance: changePercent
                },
                success: true,
                fromCache: true,
                stale: true
              };
              return;
            }
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

    try {
      await Promise.race([
        Promise.all(promises),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Monthly data timeout')), timeout))
      ]);
    } catch (error) {
      console.warn(`⚠️ Monthly data processing timed out or failed: ${error.message}`);
      // Continue with whatever results we have
    }
    
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
router.get('/:portfolioId', autoReprocessMiddleware, async (req, res) => {
  const { portfolioId } = req.params;
  
  try {
    console.log('🔍 Portfolio GET request received for ID:', portfolioId);
    
    const { refresh } = req.query;

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
    
    // Step 1: Proactively cache stock prices from holdings (refresh cache if needed)
    console.log('📊 Step 1: Proactive stock price caching...');
    try {
      await cacheStockPricesFromHoldings(portfolio.holdings);
      console.log('✅ Cache refresh completed');
    } catch (cacheError) {
      console.warn('⚠️ Stock price caching failed, continuing with existing cache:', cacheError.message);
    }
    
    // Step 2: Process holdings with cached/live data
    let holdingsWithPrices;
    try {
      console.log('📊 Step 2: Processing holdings with price data...');
      holdingsWithPrices = portfolio.holdings.map(holding => {
        try {
          if (!holding || !holding.symbol) {
            console.warn('Invalid holding object:', holding);
            return null;
          }
          
          const cachedData = holdingsCache && holdingsCache.get ? holdingsCache.get(holding.symbol) : null;
          if (cachedData && 
              typeof cachedData === 'object' && 
              cachedData.cadPrice !== undefined && 
              cachedData.cadPrice !== null && 
              !isNaN(cachedData.cadPrice)) {
            const cadPrice = Number(cachedData.cadPrice) || 0;
            const currentValue = cadPrice * (Number(holding.quantity) || 0);
            const unrealizedPnL = currentValue - (Number(holding.totalInvested) || 0);
            const totalPnL = unrealizedPnL + (Number(holding.realizedPnL) || 0);
            const totalPnLPercent = (Number(holding.totalInvested) || 0) > 0 ? (totalPnL / Number(holding.totalInvested)) * 100 : 0;
            
            console.log(`💰 Using cached data for ${holding.symbol}: $${cadPrice.toFixed(2)} CAD (age: ${cachedData.fetchedAt ? Math.round((Date.now() - new Date(cachedData.fetchedAt).getTime()) / 1000 / 60) : 'unknown'} min)`);
            
            return {
              ...holding,
              companyName: cachedData.companyName || holding.symbol,
              currentPrice: cadPrice,
              currentValue: currentValue,
              unrealizedPnL: unrealizedPnL,
              totalPnL: totalPnL,
              totalPnLPercent: totalPnLPercent,
              usdPrice: Number(cachedData.usdPrice) || 0,
              exchangeRate: Number(cachedData.exchangeRate) || 1.35,
              cacheUsed: true
            };
          }
          
          // Use fallback prices only for crypto, not for stocks
          let fallbackPrice = null;
          let companyName = holding.symbol;
          
          if (holding.type === 'c') {
            fallbackPrice = getCryptoFallbackPrice(holding.symbol);
            companyName = getCryptoName(holding.symbol);
            
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
router.get('/', autoReprocessMiddleware, (req, res) => {
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

    // Save to file after deletion (no specific file metadata needed for deletion)
    savePortfolios(portfolios);

    res.json({ message: 'Portfolio deleted successfully' });
  } catch (error) {
    console.error('Portfolio deletion error:', error);
    res.status(500).json({ error: 'Failed to delete portfolio' });
  }
});

// Get portfolio data from cache only (no API calls) - for instant loading
router.get('/:portfolioId/cached', async (req, res) => {
  const { portfolioId } = req.params;
  
  try {
    console.log('💾 Portfolio CACHED request received for ID:', portfolioId);

    if (!portfolioId) {
      console.log('❌ No portfolio ID provided');
      return res.status(400).json({ error: 'Portfolio ID is required' });
    }
    
    const portfolio = portfolios.get(portfolioId);

    if (!portfolio) {
      console.log('❌ Portfolio not found:', portfolioId);
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    console.log('✅ Portfolio found, returning cached data without API calls');
    
    // Validate portfolio structure
    if (!portfolio.holdings || !Array.isArray(portfolio.holdings)) {
      console.error('❌ Invalid portfolio structure:', portfolio);
      return res.status(500).json({ error: 'Invalid portfolio data structure' });
    }

    // Return portfolio data merged with current cached holdings prices (no fresh API calls)
    const holdingsWithCachedPrices = portfolio.holdings.map(holding => {
      const symbol = holding.symbol;
      const cachedHolding = holdingsCache?.cache?.get(symbol);
      
      if (cachedHolding) {
        // Calculate current values using cached prices
        const currentPrice = cachedHolding.cadPrice || cachedHolding.price || null;
        const currentValue = currentPrice ? holding.quantity * currentPrice : null;
        const unrealizedPnL = currentValue && holding.totalInvested ? 
          currentValue - holding.totalInvested : null;
        const totalPnL = unrealizedPnL !== null ? 
          unrealizedPnL + holding.realizedPnL : holding.realizedPnL;
        
        return {
          ...holding,
          currentPrice: currentPrice,
          currentValue: currentValue,
          unrealizedPnL: unrealizedPnL,
          totalPnL: totalPnL,
          totalPnLPercent: holding.totalInvested > 0 ? (totalPnL / holding.totalInvested) * 100 : 0,
          companyName: cachedHolding.companyName || holding.companyName || symbol,
          cacheUsed: true,
          cacheTimestamp: cachedHolding.lastUpdated || cachedHolding.fetchedAt
        };
      } else {
        // No cached data available - return holding as-is
        return {
          ...holding,
          cacheUsed: false
        };
      }
    });

    const response = {
      ...portfolio,
      holdings: holdingsWithCachedPrices,
      cached: true,
      message: 'Data retrieved from cache only, no API calls made'
    };

    console.log('📦 Returning cached portfolio with', holdingsWithCachedPrices.length, 'holdings');
    res.json(response);
    
  } catch (error) {
    console.error('❌ Portfolio cached request error:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve cached portfolio data',
      details: error.message 
    });
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

// Helper function to check if files have been modified since last cache update
function checkFileModifications() {
  try {
    console.log('🔍 Checking file modifications against cache...');
    
    // Load current portfolios cache
    let portfolioData = {};
    if (fs.existsSync(PORTFOLIO_FILE)) {
      try {
        const data = fs.readFileSync(PORTFOLIO_FILE, 'utf8');
        portfolioData = JSON.parse(data);
      } catch (error) {
        console.warn('⚠️ Could not read portfolio cache file:', error.message);
        return { hasOutdatedFiles: true, outdatedFiles: [], reason: 'Cache file unreadable' };
      }
    } else {
      console.log('📁 No portfolio cache file found, all files need processing');
      return { hasOutdatedFiles: true, outdatedFiles: [], reason: 'No cache file exists' };
    }

    // Get all current CSV files
    const uploadsDirWealthsimple = path.join(__dirname, '../uploads/wealthsimple');
    const uploadsDirCrypto = path.join(__dirname, '../uploads/crypto');
    const allFiles = [];
    
    // Scan wealthsimple folder
    if (fs.existsSync(uploadsDirWealthsimple)) {
      const wealthsimpleFiles = fs.readdirSync(uploadsDirWealthsimple)
        .filter(file => file.toLowerCase().endsWith('.csv'))
        .map(file => ({
          name: file,
          path: path.join(uploadsDirWealthsimple, file),
          folder: 'wealthsimple'
        }));
      allFiles.push(...wealthsimpleFiles);
    }
    
    // Scan crypto folder
    if (fs.existsSync(uploadsDirCrypto)) {
      const cryptoFiles = fs.readdirSync(uploadsDirCrypto)
        .filter(file => file.toLowerCase().endsWith('.csv'))
        .map(file => ({
          name: file,
          path: path.join(uploadsDirCrypto, file),
          folder: 'crypto'
        }));
      allFiles.push(...cryptoFiles);
    }

    if (allFiles.length === 0) {
      console.log('📁 No CSV files found in upload directories');
      return { hasOutdatedFiles: false, outdatedFiles: [], reason: 'No CSV files found' };
    }

    const outdatedFiles = [];
    
    // Check each file against cache
    for (const fileInfo of allFiles) {
      try {
        const fileStats = fs.statSync(fileInfo.path);
        const actualModified = fileStats.mtime.toISOString();
        
        // Look for this file in cache
        const cachedFileData = portfolioData[fileInfo.name];
        
        if (!cachedFileData || !cachedFileData.fileMetadata) {
          console.log(`📄 File ${fileInfo.name} not found in cache - needs processing`);
          outdatedFiles.push({
            ...fileInfo,
            reason: 'Not in cache',
            actualModified: actualModified,
            cachedModified: null
          });
          continue;
        }
        
        const cachedModified = cachedFileData.fileMetadata.lastModified;
        
        // Compare timestamps
        if (actualModified !== cachedModified) {
          console.log(`📄 File ${fileInfo.name} is outdated:`);
          console.log(`   Actual: ${actualModified}`);
          console.log(`   Cached: ${cachedModified}`);
          
          outdatedFiles.push({
            ...fileInfo,
            reason: 'Modified since cache',
            actualModified: actualModified,
            cachedModified: cachedModified
          });
        } else {
          console.log(`✅ File ${fileInfo.name} is up to date`);
        }
      } catch (error) {
        console.warn(`⚠️ Error checking file ${fileInfo.name}:`, error.message);
        outdatedFiles.push({
          ...fileInfo,
          reason: 'Error reading file',
          actualModified: null,
          cachedModified: null,
          error: error.message
        });
      }
    }
    
    const hasOutdatedFiles = outdatedFiles.length > 0;
    
    if (hasOutdatedFiles) {
      console.log(`🔄 Found ${outdatedFiles.length} outdated files that need reprocessing`);
    } else {
      console.log(`✅ All ${allFiles.length} files are up to date`);
    }
    
    return {
      hasOutdatedFiles,
      outdatedFiles,
      totalFiles: allFiles.length,
      upToDateFiles: allFiles.length - outdatedFiles.length,
      reason: hasOutdatedFiles ? `${outdatedFiles.length} files need reprocessing` : 'All files up to date'
    };
    
  } catch (error) {
    console.error('❌ Error checking file modifications:', error.message);
    return {
      hasOutdatedFiles: true,
      outdatedFiles: [],
      reason: 'Error during check: ' + error.message,
      error: error.message
    };
  }
}

// Helper function to proactively cache ALL asset prices from portfolio holdings
async function cacheStockPricesFromHoldings(holdings) {
  if (!holdings || !Array.isArray(holdings)) {
    console.log('📊 No holdings provided for price caching');
    return;
  }

  // Get ALL holdings (stocks AND crypto) with valid symbols
  const allHoldings = holdings.filter(holding => 
    holding && holding.symbol && (holding.type === 's' || holding.type === 'c')
  );

  if (allHoldings.length === 0) {
    console.log('📊 No holdings found for caching');
    return;
  }

  console.log(`🔄 Starting proactive caching for ALL ${allHoldings.length} holdings:`, 
    allHoldings.map(h => `${h.symbol}(${h.type})`).join(', '));

  // Process assets concurrently but with a reasonable limit to avoid overwhelming APIs
  const batchSize = 10;
  for (let i = 0; i < allHoldings.length; i += batchSize) {
    const batch = allHoldings.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async (holding) => {
      try {
        const symbol = holding.symbol;
        
        // Only skip API call if cache is very recent (less than 15 minutes), but always ensure cache exists
        const cachedData = holdingsCache.get(symbol);
        if (cachedData && cachedData.fetchedAt && !holdingsCache.isStale(symbol)) {
          const cacheAge = Date.now() - new Date(cachedData.fetchedAt).getTime();
          const fifteenMinutes = 15 * 60 * 1000;
          if (cacheAge < fifteenMinutes) {
            console.log(`⏰ Skipping API call for ${symbol} - cache is very recent (${Math.round(cacheAge / 1000 / 60)} min old)`);
            return; // Skip API call but cache data is available for portfolio summary
          }
        }

        console.log(`📈 Fetching fresh price for ${symbol} (${holding.type})...`);
        
        if (holding.type === 's') {
          // Fetch stock price from Yahoo Finance
          const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`;
          const response = await axios.get(yahooUrl, { timeout: 8000 });
          
          if (response.data?.chart?.result?.[0]) {
            const result = response.data.chart.result[0];
            const meta = result.meta;
            const currentPrice = meta.regularMarketPrice || meta.previousClose;
            
            if (currentPrice) {
              // Get exchange rate and calculate CAD price
              const exchangeRate = await getUSDtoCADRate();
              const cadPrice = currentPrice * exchangeRate;
              
              // Update cache with fresh data
              holdingsCache.update(symbol, {
                price: currentPrice,
                usdPrice: currentPrice,
                cadPrice: cadPrice,
                companyName: meta.longName || meta.shortName || getStockName(symbol),
                exchangeRate: exchangeRate,
                fetchedAt: new Date().toISOString(),
                priceDate: new Date().toISOString(), // When this price is from
                currency: meta.currency || 'USD'
              });
              
              console.log(`✅ Cached stock ${symbol}: $${currentPrice} USD ($${cadPrice.toFixed(2)} CAD)`);
            } else {
              console.warn(`⚠️ No price data available for stock ${symbol}`);
            }
          } else {
            console.warn(`⚠️ Invalid response format for stock ${symbol}`);
          }
        } else if (holding.type === 'c') {
          // Fetch crypto price from Yahoo Finance (e.g., BTC-USD, ETH-USD)
          const cryptoSymbol = `${symbol.toUpperCase()}-USD`;
          const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${cryptoSymbol}`;
          const response = await axios.get(yahooUrl, { timeout: 8000 });
          
          if (response.data?.chart?.result?.[0]) {
            const result = response.data.chart.result[0];
            const meta = result.meta;
            const currentPrice = meta.regularMarketPrice || meta.previousClose;
            
            if (currentPrice) {
              // Get exchange rate and calculate CAD price
              const exchangeRate = await getUSDtoCADRate();
              const cadPrice = currentPrice * exchangeRate;
              
              // Update cache with fresh data
              holdingsCache.update(symbol, {
                price: currentPrice,
                usdPrice: currentPrice,
                cadPrice: cadPrice,
                companyName: meta.longName || meta.shortName || getCryptoName(symbol),
                exchangeRate: exchangeRate,
                fetchedAt: new Date().toISOString(),
                priceDate: new Date().toISOString(), // When this price is from
                currency: 'USD'
              });
              
              console.log(`✅ Cached crypto ${symbol}: $${currentPrice} USD ($${cadPrice.toFixed(2)} CAD)`);
            } else {
              console.warn(`⚠️ No price data available for crypto ${symbol}`);
            }
          } else {
            console.warn(`⚠️ Invalid response format for crypto ${symbol}`);
          }
        }
      } catch (error) {
        console.warn(`❌ Failed to cache price for ${holding.symbol}: ${error.message}`);
      }
    });

    // Wait for current batch to complete before processing next batch
    await Promise.all(batchPromises);
    
    // Small delay between batches to be respectful to APIs
    if (i + batchSize < allHoldings.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  const stats = holdingsCache.getStats();
  console.log(`💾 Price caching completed. Cache now contains ${stats.totalEntries} entries for ${allHoldings.length} holdings`);
}

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
              
              // Update cache with fresh data including datetime
              holdingsCache.update(holding.symbol, {
                price: currentPrice,
                usdPrice: currentPrice,
                cadPrice: cadPrice,
                companyName: companyName,
                exchangeRate: exchangeRate,
                fetchedAt: new Date().toISOString(),
                currency: meta.currency || 'USD'
              });
              console.log(`💾 Cached price data for ${holding.symbol}: $${currentPrice} USD at ${new Date().toISOString()}`);
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
          // For crypto, still use hardcoded fallback if no cache
          if (holding.type === 'c') {
            currentPrice = getCryptoFallbackPrice(holding.symbol);
            companyName = getCryptoName(holding.symbol);
            
            if (currentPrice) {
              console.log(`🔄 Using hardcoded fallback price for ${holding.symbol}: $${currentPrice} USD`);
              exchangeRate = 1.35; // fallback exchange rate
              cadPrice = currentPrice * exchangeRate;
              usdPrice = currentPrice;
            }
          }
          // For stocks, don't use hardcoded fallback - only use cache or API data
          else if (holding.type === 's') {
            console.log(`❌ No cached or API data available for stock ${holding.symbol}, skipping price calculation`);
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

// Historical cache management endpoints
router.get('/cache/historical/stats', (req, res) => {
  try {
    const stats = historicalDataCache.getStats();
    res.json({
      success: true,
      cache: stats,
      message: `Historical cache contains ${stats.totalEntries} entries (${stats.needsUpdateCount} need updates)`
    });
  } catch (error) {
    console.error('Historical cache stats error:', error);
    res.status(500).json({ error: 'Failed to get historical cache statistics' });
  }
});

router.delete('/cache/historical/clear', (req, res) => {
  try {
    const count = historicalDataCache.clearAll();
    res.json({
      success: true,
      message: `Cleared ${count} historical cache entries`
    });
  } catch (error) {
    console.error('Historical cache clear error:', error);
    res.status(500).json({ error: 'Failed to clear historical cache' });
  }
});

router.delete('/cache/historical/cleanup', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const count = historicalDataCache.clearOldEntries(days);
    res.json({
      success: true,
      message: `Cleaned up ${count} historical cache entries older than ${days} days`
    });
  } catch (error) {
    console.error('Historical cache cleanup error:', error);
    res.status(500).json({ error: 'Failed to cleanup historical cache' });
  }
});

// Get historical cache data for a specific symbol
router.get('/cache/historical/:symbol', (req, res) => {
  try {
    const { symbol } = req.params;
    
    // Search through all cache entries to find the most recent entry for this symbol
    let latestEntry = null;
    let latestTimestamp = 0;
    
    for (const [cacheKey, cacheEntry] of historicalDataCache.cache.entries()) {
      if (cacheEntry.symbol === symbol && cacheEntry.period === '3m' && cacheEntry.resolution === '1d') {
        const timestamp = new Date(cacheEntry.lastUpdated || cacheEntry.fetchedAt).getTime();
        if (timestamp > latestTimestamp) {
          latestTimestamp = timestamp;
          latestEntry = cacheEntry;
        }
      }
    }
    
    // If no cache entry found, try to fetch fresh data from historical endpoint
    if (!latestEntry) {
      console.log(`🔍 No cache found for ${symbol}, fetching fresh historical data`);
      
      // Determine if this is likely a crypto symbol and redirect to appropriate endpoint
      const cryptoSymbols = ['BTC', 'ETH', 'ADA', 'SOL', 'DOT', 'LINK', 'UNI', 'MATIC', 'AVAX', 'ATOM', 'LTC', 'BCH', 'XRP', 'DOGE', 'SHIB'];
      const isCrypto = cryptoSymbols.includes(symbol.toUpperCase());
      
      if (isCrypto) {
        // Redirect to crypto historical endpoint for fresh data
        return res.redirect(`/api/historical/crypto/${symbol}?period=3m&interval=1d`);
      } else {
        // Redirect to stock historical endpoint for fresh data  
        return res.redirect(`/api/historical/stock/${symbol}?period=3m&interval=1d`);
      }
    }
    
    res.json({
      success: true,
      symbol: symbol,
      data: latestEntry.data || [],
      meta: latestEntry.meta || {},
      dateRange: latestEntry.dateRange || {},
      fromCache: true,
      stale: historicalDataCache.needsUpdate(symbol, '3m', '1d')
    });
  } catch (error) {
    console.error(`Historical cache get error for ${req.params.symbol}:`, error);
    res.status(500).json({ error: 'Failed to get historical cache data' });
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

// File tracking management endpoints
router.get('/files/tracking/stats', (req, res) => {
  try {
    const stats = fileTracker.getStats();
    const changes = fileTracker.checkForChanges();
    
    res.json({
      success: true,
      stats: stats,
      changes: changes,
      message: `Tracking ${stats.totalFiles} files (${stats.processedFiles} processed)`
    });
  } catch (error) {
    console.error('File tracking stats error:', error);
    res.status(500).json({ error: 'Failed to get file tracking statistics' });
  }
});

router.post('/files/tracking/update', (req, res) => {
  try {
    fileTracker.updateTracking();
    const stats = fileTracker.getStats();
    
    res.json({
      success: true,
      stats: stats,
      message: `Updated tracking for ${stats.totalFiles} files`
    });
  } catch (error) {
    console.error('File tracking update error:', error);
    res.status(500).json({ error: 'Failed to update file tracking' });
  }
});

router.delete('/files/tracking/clear', (req, res) => {
  try {
    const count = fileTracker.clearTracking();
    
    res.json({
      success: true,
      message: `Cleared tracking for ${count} files`
    });
  } catch (error) {
    console.error('File tracking clear error:', error);
    res.status(500).json({ error: 'Failed to clear file tracking' });
  }
});

// Auto-process files if changes detected
router.post('/auto-process', async (req, res) => {
  try {
    // Check for file modifications against cache
    const modificationCheck = checkFileModifications();
    
    if (!modificationCheck.hasOutdatedFiles) {
      return res.json({
        success: true,
        processed: false,
        message: modificationCheck.reason,
        modificationCheck: modificationCheck
      });
    }

    console.log('🔄 Auto-processing due to file modifications...');
    console.log(`📄 Outdated files: ${modificationCheck.outdatedFiles.map(f => f.name).join(', ')}`);
    
    // Call the existing process-uploaded logic
    const processReq = { ...req };
    const processRes = {
      json: (data) => {
        res.json({
          success: true,
          processed: true,
          message: `Files auto-processed due to modifications: ${modificationCheck.outdatedFiles.map(f => f.name).join(', ')}`,
          modificationCheck: modificationCheck,
          processingResult: data
        });
      },
      status: (code) => ({
        json: (data) => res.status(code).json({
          success: false,
          processed: false,
          message: 'Auto-processing failed',
          modificationCheck: modificationCheck,
          error: data
        })
      })
    };

    // Redirect to process-uploaded endpoint logic
    return await processUploadedFiles(processReq, processRes);
    
  } catch (error) {
    console.error('Auto-process error:', error);
    res.status(500).json({ 
      success: false,
      processed: false,
      error: 'Failed to auto-process files',
      message: error.message 
    });
  }
});

// Clean up duplicate portfolios
router.post('/cleanup/duplicates', (req, res) => {
  try {
    console.log('🧹 Starting portfolio cleanup...');
    
    const portfoliosArray = Array.from(portfolios.entries());
    const uniquePortfolios = new Map();
    let duplicatesRemoved = 0;
    
    // Group portfolios by their content hash (summary + holdings count)
    for (const [id, portfolio] of portfoliosArray) {
      const contentHash = JSON.stringify({
        totalInvested: portfolio.summary?.totalInvested,
        totalHoldings: portfolio.summary?.totalHoldings,
        holdingsCount: portfolio.holdings?.length
      });
      
      if (!uniquePortfolios.has(contentHash)) {
        // Keep the first occurrence (oldest)
        uniquePortfolios.set(contentHash, { id, portfolio });
      } else {
        // Remove duplicate
        portfolios.delete(id);
        duplicatesRemoved++;
        console.log(`🗑️ Removed duplicate portfolio: ${id}`);
      }
    }
    
    // Save cleaned up portfolios (no specific file metadata needed for cleanup)
    savePortfolios(portfolios);
    
    console.log(`✅ Cleanup completed. Removed ${duplicatesRemoved} duplicates, kept ${portfolios.size} unique portfolios`);
    
    res.json({
      success: true,
      message: `Cleanup completed successfully`,
      duplicatesRemoved: duplicatesRemoved,
      remainingPortfolios: portfolios.size
    });
  } catch (error) {
    console.error('Portfolio cleanup error:', error);
    res.status(500).json({ error: 'Failed to cleanup portfolios' });
  }
});

// Extract the process-uploaded logic to a reusable function
async function processUploadedFiles(req, res) {
  // Check if already processing to prevent race conditions
  if (isProcessing) {
    console.log('⚠️ Portfolio processing already in progress, rejecting request');
    return res.status(429).json({ 
      error: 'Portfolio processing already in progress. Please wait and try again.',
      isProcessing: true
    });
  }

  isProcessing = true;
  try {
    console.log('🔄 Processing uploaded CSV files...');
    
    // Check for file changes first
    const changes = fileTracker.checkForChanges();
    if (changes.hasChanges) {
      console.log(`📊 File changes detected: ${changes.newFiles.length} new, ${changes.modifiedFiles.length} modified, ${changes.deletedFiles.length} deleted`);
    }
    
    // Get all current files
    const allFiles = fileTracker.getAllCSVFiles();
    
    console.log('📁 Found files:', allFiles.map(f => f.name));
    
    if (allFiles.length === 0) {
      console.log('❌ No CSV files found in uploads directory');
      return res.status(404).json({ 
        error: 'No CSV files found in uploads directory',
        suggestion: 'Please place CSV files in server/uploads/wealthsimple/ or server/uploads/crypto/ directories'
      });
    }

    let allTrades = [];
    const portfolioId = Date.now().toString();
    console.log('🆔 Generated portfolio ID:', portfolioId);

    // Collect file metadata for new caching structure
    const fileMetadataList = [];
    
    // Process each CSV file
    for (const fileInfo of allFiles) {
      const { path: filePath, type: fileType } = fileInfo;
      const trades = [];
      console.log(`📄 Processing ${fileType} file:`, fileInfo.name);
      
      // Get file metadata
      let fileStats;
      try {
        fileStats = fs.statSync(filePath);
      } catch (statError) {
        console.error(`Error getting file stats for ${fileInfo.name}:`, statError.message);
        continue;
      }

      await new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
          .pipe(csv())
          .on('data', (row) => {
            try {
              let trade = null;
              
              if (fileType === 'crypto') {
                // Process crypto format
                trade = processCryptoRow(row, fileInfo.name);
              } else if (fileType === 'wealthsimple') {
                // Process Wealthsimple format
                trade = processWealthsimpleRow(row, fileInfo.name);
              }
              
              if (trade) {
                console.log(`Processing trade in ${fileInfo.name}:`, trade);
                trades.push(trade);
              }
            } catch (error) {
              console.warn(`Error processing row in ${fileInfo.name}:`, error.message);
              // Continue processing other rows instead of rejecting the entire file
            }
          })
          .on('end', () => {
            allTrades = allTrades.concat(trades);
            console.log(`✅ Completed processing ${fileInfo.name}, found ${trades.length} trades`);
            
            // Add file metadata for this file
            fileMetadataList.push({
              folder: fileType, // 'crypto' or 'wealthsimple'
              filename: fileInfo.name,
              fileSize: fileStats.size,
              lastModified: fileStats.mtime.toISOString(),
              portfolioId: portfolioId, // Will be set after portfolio creation
              tradesCount: trades.length
            });
            
            resolve();
          })
          .on('error', (error) => {
            console.error(`Error processing ${fileInfo.name}:`, error.message);
            resolve(); // Continue with other files instead of rejecting
          });
      });
    }

    console.log(`📊 Total trades found: ${allTrades.length}`);
    
    // Process all trades and calculate portfolio
    console.log('🔄 Processing trades and calculating portfolio...');
    const portfolio = await processTrades(allTrades);
    console.log('✅ Portfolio calculation completed');
    
    // Proactively cache stock prices for the new portfolio
    console.log('📊 Proactively caching stock prices for new portfolio...');
    try {
      await cacheStockPricesFromHoldings(portfolio.holdings);
    } catch (cacheError) {
      console.warn('⚠️ Stock price caching failed for new portfolio:', cacheError.message);
    }
    
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
    
    // Update file metadata with the actual portfolio ID
    fileMetadataList.forEach(fileMeta => {
      fileMeta.portfolioId = portfolioId;
    });
    
    // Save to file with metadata
    savePortfolios(portfolios, fileMetadataList);

    // Update file tracking to mark all files as processed
    fileTracker.updateTracking();
    fileTracker.markAsProcessed(portfolioId);

    console.log('✅ Portfolio processing completed successfully');
    res.json({
      portfolioId: portfolioId,
      message: `Processed ${allFiles.length} CSV files successfully`,
      summary: portfolio.summary,
      holdings: portfolio.holdings,
      filesProcessed: allFiles.map(f => f.name),
      fileChanges: changes
    });

  } catch (error) {
    console.error('❌ Uploaded files processing error:', error);
    res.status(500).json({ error: 'Failed to process uploaded files: ' + error.message });
  } finally {
    // Always release the processing lock
    isProcessing = false;
    console.log('🔓 Released processing lock');
  }
}

module.exports = router;

// Export the cache function for startup initialization
module.exports.cacheStockPricesFromHoldings = cacheStockPricesFromHoldings; 