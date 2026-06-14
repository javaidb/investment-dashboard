const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const path = require('path');
const cron = require('node-cron');

// Load environment variables
dotenv.config();

// Import routes
const stockRoutes = require('./routes/stocks');
const cryptoRoutes = require('./routes/crypto');
const portfolioRoutes = require('./routes/portfolio');
const searchRoutes = require('./routes/search');
const historicalRoutes = require('./routes/historical');
const iconRoutes = require('./routes/icons');
const recurringInvestmentsRoutes = require('./routes/recurring-investments');
const pnlRoutes = require('./routes/pnl');
const newsboardRoutes = require('./routes/newsboard');
const portfolioValueRoutes = require('./routes/portfolio-value');
const rebalancingStrategiesRoutes = require('./routes/rebalancing-strategies');
const rebalancingRecommendationsRoutes = require('./routes/rebalancing-recommendations');
const taxRoutes = require('./routes/tax');
const screenerRoutes = require('./routes/screener');
const fibonacciRoutes = require('./routes/fibonacci');

// Import cache for startup initialization
const holdingsCache = require('./cache');
const historicalDataCache = require('./historical-cache');
const watchlistCache = require('./watchlist-cache');
const fileTracker = require('./file-tracker');
const historicalDataPreloader = require('./historical-data-preloader');
const portfolioAssetDiscovery = require('./portfolio-asset-discovery');
const portfolioValueCache = require('./portfolio-value-cache');
const portfolioValuePreloader = require('./portfolio-value-preloader');

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(helmet());

// Trust proxy for proper IP detection
app.set('trust proxy', 1);

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://yourdomain.com'] 
    : ['http://localhost:3000'],
  credentials: true
}));

// Rate limiting with error handling
try {
  const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    trustProxy: true,
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
    handler: (req, res) => {
      res.status(429).json({
        error: 'Too many requests',
        message: 'Please try again later',
        retryAfter: Math.ceil(parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000 / 1000)
      });
    }
  });
  // Apply rate limiting only to external API routes (not local file operations)
  app.use('/api/stocks', limiter);
  app.use('/api/crypto', limiter);
  app.use('/api/search', limiter);
} catch (error) {
  console.warn('Rate limiter configuration failed, continuing without rate limiting:', error.message);
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files (for production)
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
}

// API Routes
app.use('/api/stocks', stockRoutes);
app.use('/api/crypto', cryptoRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/historical', historicalRoutes);
app.use('/api/icons', iconRoutes);
app.use('/api/recurring-investments', recurringInvestmentsRoutes);
app.use('/api/pnl', pnlRoutes);
app.use('/api/newsboard', newsboardRoutes);
app.use('/api/portfolio-value', portfolioValueRoutes);
app.use('/api/strategies', rebalancingStrategiesRoutes);
app.use('/api/rebalancing-recommendations', rebalancingRecommendationsRoutes);
app.use('/api/tax', taxRoutes);
app.use('/api/screener', screenerRoutes);
app.use('/api/fibonacci', fibonacciRoutes);

// Watchlist endpoint - expose all tracked symbols (active, inactive, custom)
app.get('/api/watchlist', (req, res) => {
  res.json(watchlistCache.getWatchlist());
});

// Reload watchlist cache from disk
app.post('/api/watchlist/reload', (req, res) => {
  const stats = watchlistCache.reloadCache();
  res.json({ success: true, stats });
});

// Reload holdings cache from disk
app.post('/api/holdings-cache/reload', (req, res) => {
  const count = holdingsCache.reloadFromDisk();
  res.json({ success: true, entries: count });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Serve React app in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});


// Startup cache initialization function
async function initializeCache() {
  try {
    console.log('💾 Initializing cache with portfolio holdings...');
    
    // Check for file changes on startup
    console.log('📋 Checking for CSV file changes...');
    const fileChanges = fileTracker.checkForChanges();
    if (fileChanges.hasChanges) {
      console.log(`🆕 File changes detected on startup: ${fileChanges.newFiles.length} new, ${fileChanges.modifiedFiles.length} modified, ${fileChanges.deletedFiles.length} deleted`);
      console.log('💡 Consider calling /api/portfolio/auto-process to process new files');
    } else {
      console.log('✅ No file changes detected');
    }
    
    // Load portfolios from file to get the most recent one
    const fs = require('fs');
    const path = require('path');
    const PORTFOLIO_FILE = path.join(__dirname, 'data/cache', 'portfolios.json');
    
    // Get cache stats before initialization
    const statsBefore = holdingsCache.getStats();
    console.log(`📊 Cache before initialization: ${statsBefore.totalEntries} entries`);
    
    if (fs.existsSync(PORTFOLIO_FILE)) {
      const data = fs.readFileSync(PORTFOLIO_FILE, 'utf8');
      const portfolioData = JSON.parse(data);
      const portfolios = Object.values(portfolioData);
      
      if (portfolios.length > 0) {
        // Get the most recent portfolio - handle file-based structure
        const mostRecentEntry = portfolios.reduce((latest, current) => {
          const currentDate = new Date(current.fileMetadata?.processedAt || current.portfolio?.createdAt || current.createdAt || 0);
          const latestDate = new Date(latest.fileMetadata?.processedAt || latest.portfolio?.createdAt || latest.createdAt || 0);
          return currentDate > latestDate ? current : latest;
        });

        // Extract the actual portfolio object
        const mostRecentPortfolio = mostRecentEntry.portfolio || mostRecentEntry;

        console.log(`🔄 Found ${portfolios.length} portfolios, using most recent: ${mostRecentPortfolio.id}`);
        
        // If there are file changes and no recent portfolio, suggest processing
        if (fileChanges.hasChanges) {
          const portfolioAge = Date.now() - new Date(mostRecentPortfolio.createdAt).getTime();
          const oneHour = 60 * 60 * 1000;
          if (portfolioAge > oneHour) {
            console.log('🔄 Most recent portfolio is older than 1 hour and files have changed - consider reprocessing');
          }
        }
        
        if (mostRecentPortfolio.holdings && Array.isArray(mostRecentPortfolio.holdings)) {
          console.log(`📈 Initializing cache with ${mostRecentPortfolio.holdings.length} holdings from portfolio ${mostRecentPortfolio.id}`);
          
          // Import the cache function dynamically to avoid circular dependencies
          const { cacheStockPricesFromHoldings } = require('./routes/portfolio');
          
          // Cache prices for the most recent portfolio's holdings
          await cacheStockPricesFromHoldings(mostRecentPortfolio.holdings);

          const statsAfter = holdingsCache.getStats();
          console.log(`📊 Cache after initialization: ${statsAfter.totalEntries} entries`);

          // Initialize watchlist cache with active/inactive symbols
          console.log('📋 Initializing watchlist cache...');
          watchlistCache.updateFromHoldings(mostRecentPortfolio.holdings);
          const watchlistStats = watchlistCache.getStats();
          console.log(`📋 Watchlist initialized: ${watchlistStats.activeCount} active, ${watchlistStats.inactiveCount} inactive symbols`);
          
          // Pre-populate historical cache for all portfolio assets
          console.log('📈 Pre-populating historical cache for all portfolio assets...');
          setTimeout(async () => {
            try {
              const preloadResult = await historicalDataPreloader.prePopulateHistoricalCache();
              if (preloadResult.success) {
                console.log(`✅ Historical cache pre-population completed: ${preloadResult.symbolsProcessed} symbols processed in ${preloadResult.duration}ms`);

                // After historical cache is populated, calculate portfolio value over time
                console.log('💰 Calculating portfolio value over time...');
                const portfolioValueResult = await portfolioValuePreloader.prePopulatePortfolioValue();
                if (portfolioValueResult.success) {
                  console.log(`✅ Portfolio value cache pre-population completed in ${portfolioValueResult.duration}ms`);
                } else {
                  console.log(`⚠️ Portfolio value cache pre-population failed: ${portfolioValueResult.message}`);
                }
              } else {
                console.log(`⚠️ Historical cache pre-population failed: ${preloadResult.message}`);
              }
            } catch (error) {
              console.error('❌ Error during historical cache pre-population:', error.message);
            }
          }, 2000); // Start 2 seconds after server startup to avoid overwhelming startup
        } else {
          console.log('⚠️ No holdings found in most recent portfolio');
        }
      } else {
        console.log('📝 No portfolios found in file');
        if (fileChanges.hasChanges) {
          console.log('💡 New files detected but no portfolios exist - call /api/portfolio/process-uploaded to create your first portfolio');
        }
      }
    } else {
      console.log('📝 No portfolio file found, cache will be populated on first request');
      if (fileChanges.hasChanges) {
        console.log('💡 CSV files detected but no portfolios exist - call /api/portfolio/process-uploaded to get started');
      }
    }
    
    console.log('✅ Cache initialization completed');
    console.log(`📈 Cache ready for portfolio operations`);

    // Display file tracking summary
    const fileStats = fileTracker.getStats();
    console.log(`📋 File tracking: ${fileStats.totalFiles} total files, ${fileStats.processedFiles} processed`);

    // Recalculate default risk/reward targets for all holdings
    await recalculateDefaultTargets();

  } catch (error) {
    console.warn('⚠️ Cache initialization failed, will populate on first request:', error.message);
  }
}

// Recalculate default risk/reward targets for all portfolio holdings
async function recalculateDefaultTargets() {
  try {
    console.log('🎯 Recalculating default risk/reward targets...');

    // Load portfolios from file
    const fs = require('fs');
    const PORTFOLIO_FILE = path.join(__dirname, 'data/cache', 'portfolios.json');

    if (!fs.existsSync(PORTFOLIO_FILE)) {
      console.log('📝 No portfolio file found, skipping target recalculation');
      return;
    }

    const data = fs.readFileSync(PORTFOLIO_FILE, 'utf8');
    const portfolioData = JSON.parse(data);
    const portfolios = Object.values(portfolioData);

    if (portfolios.length === 0) {
      console.log('📝 No portfolios found, skipping target recalculation');
      return;
    }

    // Get the most recent portfolio
    const mostRecentEntry = portfolios.reduce((latest, current) => {
      const currentDate = new Date(current.fileMetadata?.processedAt || current.portfolio?.createdAt || current.createdAt || 0);
      const latestDate = new Date(latest.fileMetadata?.processedAt || latest.portfolio?.createdAt || latest.createdAt || 0);
      return currentDate > latestDate ? current : latest;
    });

    const mostRecentPortfolio = mostRecentEntry.portfolio || mostRecentEntry;

    if (!mostRecentPortfolio.holdings || !Array.isArray(mostRecentPortfolio.holdings)) {
      console.log('⚠️ No holdings found in portfolio');
      return;
    }

    // Recalculate defaults for each holding
    let updatedCount = 0;
    for (const holding of mostRecentPortfolio.holdings) {
      const symbol = holding.symbol;
      const averageBuyPrice = holding.quantity > 0 ? holding.totalInvested / holding.quantity : 0;

      if (averageBuyPrice <= 0) continue;

      // Get current price from cache
      const cachedHolding = holdingsCache.get(symbol);
      const currentPrice = cachedHolding?.cadPrice || cachedHolding?.price || 0;

      if (currentPrice <= 0) continue;

      // Calculate default targets based on average buy price
      const defaultRiskPrice = averageBuyPrice * 0.90; // avg price - 10%
      const defaultRewardPrice = averageBuyPrice * 1.5; // avg price × 1.5

      // Get existing targets to preserve custom values
      const existingTargets = holdingsCache.getTargets(symbol);

      // Update only default targets, preserve custom values
      holdingsCache.updateTargets(symbol, {
        defaultRiskPrice: defaultRiskPrice,
        defaultRewardPrice: defaultRewardPrice,
        customRiskPrice: existingTargets?.customRiskPrice || null,
        customRewardPrice: existingTargets?.customRewardPrice || null
      });

      updatedCount++;
    }

    console.log(`✅ Updated default targets for ${updatedCount} holdings`);

  } catch (error) {
    console.error('❌ Error recalculating default targets:', error.message);
  }
}

// Automatic cache refresh function
async function refreshCacheBackground() {
  try {
    console.log('🔄 Background cache refresh starting...');

    // Load portfolios from file to get the most recent one
    const fs = require('fs');
    const PORTFOLIO_FILE = path.join(__dirname, 'data/cache', 'portfolios.json');

    if (fs.existsSync(PORTFOLIO_FILE)) {
      const data = fs.readFileSync(PORTFOLIO_FILE, 'utf8');
      const portfolioData = JSON.parse(data);
      const portfolios = Object.values(portfolioData);

      if (portfolios.length > 0) {
        // Get the most recent portfolio - handle file-based structure
        const mostRecentEntry = portfolios.reduce((latest, current) => {
          const currentDate = new Date(current.fileMetadata?.processedAt || current.portfolio?.createdAt || current.createdAt || 0);
          const latestDate = new Date(latest.fileMetadata?.processedAt || latest.portfolio?.createdAt || latest.createdAt || 0);
          return currentDate > latestDate ? current : latest;
        });

        // Extract the actual portfolio object
        const mostRecentPortfolio = mostRecentEntry.portfolio || mostRecentEntry;

        if (mostRecentPortfolio.holdings && Array.isArray(mostRecentPortfolio.holdings)) {
          const { cacheStockPricesFromHoldings } = require('./routes/portfolio');
          await cacheStockPricesFromHoldings(mostRecentPortfolio.holdings);

          const stats = holdingsCache.getStats();
          console.log(`✅ Background cache refresh completed: ${stats.totalEntries} entries updated`);
        }
      }
    }
  } catch (error) {
    console.error('❌ Background cache refresh failed:', error.message);
  }
}

app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Investment Dashboard API ready`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);

  // Initialize cache on startup
  await initializeCache();

  // Schedule automatic cache refresh every hour
  // Cron expression: '0 * * * *' = At minute 0 of every hour (e.g., 9:00, 10:00, 11:00)
  cron.schedule('0 * * * *', () => {
    console.log('⏰ Hourly cache refresh triggered by scheduler');
    refreshCacheBackground();
  });

  console.log('⏰ Scheduled automatic cache refresh every hour');
});

module.exports = app; 