const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

// Import routes
const stockRoutes = require('./routes/stocks');
const cryptoRoutes = require('./routes/crypto');
const portfolioRoutes = require('./routes/portfolio');
const searchRoutes = require('./routes/search');
const historicalRoutes = require('./routes/historical');

// Import cache for startup initialization
const holdingsCache = require('./cache');

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
  app.use('/api/', limiter);
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
        // Get the most recent portfolio
        const mostRecentPortfolio = portfolios.reduce((latest, current) => {
          return new Date(current.createdAt) > new Date(latest.createdAt) ? current : latest;
        });
        
        console.log(`🔄 Found ${portfolios.length} portfolios, using most recent: ${mostRecentPortfolio.id}`);
        
        if (mostRecentPortfolio.holdings && Array.isArray(mostRecentPortfolio.holdings)) {
          console.log(`📈 Initializing cache with ${mostRecentPortfolio.holdings.length} holdings from portfolio ${mostRecentPortfolio.id}`);
          
          // Import the cache function dynamically to avoid circular dependencies
          const { cacheStockPricesFromHoldings } = require('./routes/portfolio');
          
          // Cache prices for the most recent portfolio's holdings
          await cacheStockPricesFromHoldings(mostRecentPortfolio.holdings);
          
          const statsAfter = holdingsCache.getStats();
          console.log(`📊 Cache after initialization: ${statsAfter.totalEntries} entries`);
        } else {
          console.log('⚠️ No holdings found in most recent portfolio');
        }
      } else {
        console.log('📝 No portfolios found in file');
      }
    } else {
      console.log('📝 No portfolio file found, cache will be populated on first request');
    }
    
    console.log('✅ Cache initialization completed');
    console.log(`📈 Cache ready for portfolio operations`);
  } catch (error) {
    console.warn('⚠️ Cache initialization failed, will populate on first request:', error.message);
  }
}

app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Investment Dashboard API ready`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // Initialize cache on startup
  await initializeCache();
});

module.exports = app; 