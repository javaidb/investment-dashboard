const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const router = express.Router();

// Create icons directory if it doesn't exist
const ICONS_DIR = path.join(__dirname, '..', 'data', 'icons');
const ICONS_CACHE_FILE = path.join(__dirname, '..', 'data', 'cache', 'icons-cache.json');
const ASSET_MAPPING_FILE = path.join(__dirname, '..', 'data', 'cache', 'asset-icon-mapping.json');
// Permanent assignments — stored OUTSIDE the cache dir so cache clears never touch it
const PERMANENT_ICONS_FILE = path.join(__dirname, '..', 'data', 'permanent-icons.json');
const TEMPLATE_ICON_PATH = path.join(ICONS_DIR, 'template.png');

// Ensure directories exist
async function ensureDirectories() {
  try {
    await fs.mkdir(ICONS_DIR, { recursive: true });
    await fs.mkdir(path.dirname(ICONS_CACHE_FILE), { recursive: true });
  } catch (error) {
    console.error('Error creating directories:', error);
  }
}

// Initialize directories
ensureDirectories();

// Icon sources with fallbacks
const ICON_SOURCES = [
  {
    name: 'clearbit',
    urlTemplate: (symbol, domain) => `https://logo.clearbit.com/${domain}?size=64`,
    needsDomain: true
  },
  {
    name: 'yahoo',
    urlTemplate: (symbol) => `https://logo.yahoo.com/${symbol}`,
    needsDomain: false
  },
  {
    name: 'coinpaprika',
    urlTemplate: (symbol) => `https://static.coinpaprika.com/coin/${symbol.toLowerCase()}/logo.png`,
    needsDomain: false,
    cryptoOnly: true
  }
];

// Seed assignments baked into the source as a fallback baseline.
// Anything assigned via the UI is saved to permanent-icons.json and takes precedence.
const SEED_ICONS = {
  // Crypto
  'BTC_c':      'btc.png',
  'ETH_c':      'ETH.png',
  'SOL_c':      'SOL.png',
  'DOGE_c':     'doge.png',
  'TRUMP_c':    'trump_cry.png',
  'ZEC_c':      'ZEC.png',
  // Stocks
  'AAPL_s':     'aapl.png',
  'ABAT_s':     'ABAT.png',
  'ACHR_s':     'ACHR.png',
  'ADUR_s':     'ADUR.png',
  'AEP_s':      'AEP.png',
  'AMD_s':      'AMD.png',
  'AMZN_s':     'amzn.png',
  'ASTS_s':     'ASTS.png',
  'AVGO_s':     'AVGO.png',
  'BB_s':       'BB.png',
  'BBAI_s':     'BBAI.png',
  'CCO.TO_s':   'CCO.png',
  'CEG_s':      'CEG.png',
  'CVX_s':      'CVX.png',
  'DRAM_s':     'DRAM.jpg',
  'ENB_s':      'ENB.png',
  'GLD_s':      'GLD.png',
  'GOOG_s':     'googl.png',
  'GOOGL_s':    'googl.png',
  'HIMS_s':     'HIMS.png',
  'HIVE_s':     'HIVE.png',
  'HWM_s':      'HWM.png',
  'IBIT_s':     'iShares_BlackRock.png',
  'INTC_s':     'INTC.png',
  'IREN_s':     'IREN.png',
  'LITE_s':     'LITE.png',
  'LULU_s':     'LULU.png',
  'META_s':     'META.png',
  'MSFT_s':     'msft.png',
  'MSTR_s':     'mstr.png',
  'NKE_s':      'NKE.png',
  'NOW_s':      'NOW.png',
  'NVDA_s':     'nvda.png',
  'NVO_s':      'NVO.png',
  'NXE_s':      'NXE.png',
  'ONDS_s':     'ONDS.png',
  'ORCL_s':     'ORCL.png',
  'OSCR_s':     'OSCR.png',
  'OTEX_s':     'OTEX.png',
  'OXY_s':      'OXY.png',
  'PLTR_s':     'PLTR.png',
  'PNG_s':      'PNG.png',
  'PYPL_s':     'PYPL.png',
  'QIMC_s':     'QIMC.png',
  'QS_s':       'QS.png',
  'RIVN_s':     'rivian.png',
  'SLV_s':      'SLV.png',
  'SOFI_s':     'SOFI.png',
  'SSYS_s':     'SSYS.png',
  'STE_s':      'STE.png',
  'TE_s':       'TE.png',
  'TEM_s':      'TEM.png',
  'TNZ_s':      'TNZ.png',
  'TOU_s':      'TOU.png',
  'TSLA_s':     'TSLA.png',
  'TSM_s':      'TSM.png',
  'UNH_s':      'UNH.png',
  'UUUU_s':     'UUUU.png',
  'VOO_s':      'vanguard_voo.png',
  'WS_s':       'WS.png',
  'XOM_s':      'XOM.png',
  'ZETA_s':     'ZETA.png',
  'ZVRA_s':     'ZVRA.png',
};

// In-memory permanent icon store: seed + anything saved via the UI
let permanentIcons = { ...SEED_ICONS };

async function loadPermanentIcons() {
  try {
    const data = await fs.readFile(PERMANENT_ICONS_FILE, 'utf8');
    const saved = JSON.parse(data);
    // UI assignments override seeds
    permanentIcons = { ...SEED_ICONS, ...saved };
  } catch {
    // File doesn't exist yet — start from seeds, save immediately
    permanentIcons = { ...SEED_ICONS };
    await savePermanentIcons();
  }
}

async function savePermanentIcons() {
  try {
    await fs.writeFile(PERMANENT_ICONS_FILE, JSON.stringify(permanentIcons, null, 2));
  } catch (error) {
    console.error('Error saving permanent icons:', error);
  }
}

// Call once at startup
loadPermanentIcons();

// Company domain mapping for common stocks
const COMPANY_DOMAINS = {
  'AAPL': 'apple.com',
  'MSFT': 'microsoft.com',
  'GOOGL': 'google.com',
  'GOOG': 'google.com',
  'AMZN': 'amazon.com',
  'TSLA': 'tesla.com',
  'META': 'meta.com',
  'NVDA': 'nvidia.com',
  'NFLX': 'netflix.com',
  'PYPL': 'paypal.com',
  'ADBE': 'adobe.com',
  'CRM': 'salesforce.com',
  'ORCL': 'oracle.com',
  'IBM': 'ibm.com',
  'INTC': 'intel.com',
  'AMD': 'amd.com',
  'UBER': 'uber.com',
  'LYFT': 'lyft.com',
  'SPOT': 'spotify.com',
  'SQ': 'squareup.com',
  'SHOP': 'shopify.com',
  'ZM': 'zoom.us',
  'SLACK': 'slack.com',
  'TWTR': 'twitter.com',
  'SNAP': 'snap.com',
  'PINS': 'pinterest.com',
  'ROKU': 'roku.com',
  'DOCU': 'docusign.com'
};

// Crypto symbol to ID mapping for CoinPaprika
const CRYPTO_IDS = {
  'BTC': 'btc-bitcoin',
  'ETH': 'eth-ethereum',
  'ADA': 'ada-cardano',
  'SOL': 'sol-solana',
  'DOT': 'dot-polkadot',
  'MATIC': 'matic-polygon',
  'AVAX': 'avax-avalanche',
  'LINK': 'link-chainlink',
  'UNI': 'uni-uniswap',
  'DOGE': 'doge-dogecoin',
  'SHIB': 'shib-shiba-inu',
  'LTC': 'ltc-litecoin',
  'XRP': 'xrp-xrp',
  'TRX': 'trx-tron',
  'ATOM': 'atom-cosmos',
  'ALGO': 'algo-algorand'
};

// Load icons cache
async function loadIconsCache() {
  try {
    const data = await fs.readFile(ICONS_CACHE_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

// Save icons cache
async function saveIconsCache(cache) {
  try {
    await fs.writeFile(ICONS_CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (error) {
    console.error('Error saving icons cache:', error);
  }
}

// Load asset-icon mapping
async function loadAssetMapping() {
  try {
    const data = await fs.readFile(ASSET_MAPPING_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      // File exists but couldn't be parsed — do NOT overwrite, log and return empty in-memory default
      console.error('⚠️ Could not parse asset-icon mapping file (will NOT overwrite):', error.message);
    }
    // File doesn't exist yet — return a blank default but only save it the first time
    const defaultMapping = {
      nextId: 1,
      mappings: {},
      metadata: {
        description: "Maps asset symbols to unique icon ID numbers. Icons are stored as {id}.png in server/data/icons/",
        instructions: "To customize an icon: 1) Find the asset's ID number here, 2) Replace server/data/icons/{id}.png with your custom icon",
        created: new Date().toISOString().split('T')[0],
        version: "1.0"
      }
    };
    if (error.code === 'ENOENT') {
      await saveAssetMapping(defaultMapping);
    }
    return defaultMapping;
  }
}

// Save asset-icon mapping
async function saveAssetMapping(mapping) {
  try {
    await fs.writeFile(ASSET_MAPPING_FILE, JSON.stringify(mapping, null, 2));
  } catch (error) {
    console.error('Error saving asset mapping:', error);
  }
}

// Get or assign icon ID for a symbol
async function getOrAssignIconId(symbol, type = 's') {
  const mapping = await loadAssetMapping();
  const key = `${symbol.toUpperCase()}_${type}`;

  // Permanent assignments always win — apply them to the mapping if not already set
  if (permanentIcons[key]) {
    const hardcodedFile = permanentIcons[key];
    if (!mapping.mappings[key]) {
      // New entry: create it with the hardcoded file
      const newId = mapping.nextId;
      mapping.mappings[key] = {
        id: newId,
        symbol: symbol.toUpperCase(),
        type: type,
        filename: hardcodedFile,
        created: new Date().toISOString(),
        source: 'hardcoded'
      };
      mapping.nextId = newId + 1;
      await saveAssetMapping(mapping);
    } else if (mapping.mappings[key].filename !== hardcodedFile) {
      // Entry exists but was reset to template — fix it silently
      mapping.mappings[key].filename = hardcodedFile;
      mapping.mappings[key].source = 'hardcoded';
      await saveAssetMapping(mapping);
    }
    return mapping.mappings[key];
  }

  if (mapping.mappings[key]) {
    return mapping.mappings[key];
  }

  // Brand-new symbol: assign template and let user pick an icon later
  const newId = mapping.nextId;
  mapping.mappings[key] = {
    id: newId,
    symbol: symbol.toUpperCase(),
    type: type,
    filename: 'template.png',
    created: new Date().toISOString(),
    source: 'template'
  };
  mapping.nextId = newId + 1;

  await saveAssetMapping(mapping);
  console.log(`Assigned template.png for ${symbol} (${type === 'c' ? 'crypto' : 'stock'})`);

  return mapping.mappings[key];
}

// Generate cache key for symbol
function getCacheKey(symbol, type) {
  return `${symbol}_${type}`.toLowerCase();
}

// Download image from URL
async function downloadImage(url, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https:') ? https : http;
    const timer = setTimeout(() => {
      reject(new Error('Request timeout'));
    }, timeout);

    protocol.get(url, (response) => {
      clearTimeout(timer);
      
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const contentType = response.headers['content-type'] || '';
        
        // Validate it's an image
        if (!contentType.startsWith('image/')) {
          reject(new Error('Not an image'));
          return;
        }
        
        resolve({
          buffer,
          contentType,
          size: buffer.length
        });
      });
    }).on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

// Fetch icon for a symbol using local template system
async function fetchIcon(symbol, type = 's') {
  const cacheKey = getCacheKey(symbol, type);
  const mappingKey = `${symbol.toUpperCase()}_${type}`;
  const cache = await loadIconsCache();

  // If a permanent assignment exists and the cache disagrees, self-heal the cache entry
  if (permanentIcons[mappingKey]) {
    const expected = permanentIcons[mappingKey];
    const cached = cache[cacheKey];
    if (cached && cached.filename === expected) {
      // Cache is correct — check file exists then return
      try {
        await fs.access(path.join(ICONS_DIR, expected));
        return cached;
      } catch {
        // File missing on disk — fall through to rebuild
      }
    }
    // Cache is wrong or missing — rebuild it from the hardcoded assignment
    const iconMapping = await getOrAssignIconId(symbol, type);
    const iconData = {
      symbol,
      type,
      filename: iconMapping.filename,
      source: 'hardcoded',
      contentType: 'image/png',
      size: 0,
      timestamp: Date.now(),
      url: `/api/icons/image/${iconMapping.filename}`,
      id: iconMapping.id
    };
    cache[cacheKey] = iconData;
    await saveIconsCache(cache);
    return iconData;
  }

  // Check if we have a cached icon that's still valid
  if (cache[cacheKey] && cache[cacheKey].filename && !cache[cacheKey].failed) {
    const iconPath = path.join(ICONS_DIR, cache[cacheKey].filename);
    try {
      await fs.access(iconPath);
      return cache[cacheKey];
    } catch (error) {
      // File doesn't exist, will create new one
      console.log(`Icon file ${cache[cacheKey].filename} not found, creating new one`);
    }
  }

  // Get or assign unique ID for this symbol
  const iconMapping = await getOrAssignIconId(symbol, type);

  // Create icon data object
  const iconData = {
    symbol,
    type,
    filename: iconMapping.filename,
    source: 'template',
    contentType: 'image/png',
    size: 0, // Will be set when file is accessed
    timestamp: Date.now(),
    url: `/api/icons/image/${iconMapping.filename}`,
    id: iconMapping.id
  };

  // Update cache
  cache[cacheKey] = iconData;
  await saveIconsCache(cache);
  
  console.log(`Icon assigned for ${symbol} (${type === 'c' ? 'crypto' : 'stock'}): ID ${iconMapping.id} -> ${iconMapping.filename}`);
  
  return iconData;
}

// Get icon for symbol (JSON response)
router.get('/symbol/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { type = 's' } = req.query; // 's' for stock, 'c' for crypto

    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    const iconData = await fetchIcon(symbol.toUpperCase(), type);

    if (iconData && !iconData.failed) {
      res.json({
        success: true,
        icon: iconData
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Icon not found'
      });
    }
  } catch (error) {
    console.error('Error fetching icon:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Serve icon image directly for a symbol
router.get('/symbol/:symbol/image', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { type = 's' } = req.query; // 's' for stock, 'c' for crypto

    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    const iconData = await fetchIcon(symbol.toUpperCase(), type);

    if (iconData && !iconData.failed && iconData.filename) {
      // Redirect to the image endpoint
      return res.redirect(`/api/icons/image/${iconData.filename}`);
    } else {
      // Return a placeholder or 404
      return res.status(404).json({
        success: false,
        error: 'Icon not found'
      });
    }
  } catch (error) {
    console.error('Error serving icon image:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Serve icon images
router.get('/image/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const filepath = path.join(ICONS_DIR, filename);
    
    // Security check: ensure filename doesn't contain path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    
    const stats = await fs.stat(filepath);
    const cache = await loadIconsCache();
    
    // Find icon data in cache
    const iconData = Object.values(cache).find(icon => icon.filename === filename);
    
    if (iconData && iconData.contentType) {
      res.setHeader('Content-Type', iconData.contentType);
    } else {
      res.setHeader('Content-Type', 'image/png');
    }
    
    res.setHeader('Cache-Control', 'public, max-age=604800'); // 1 week
    res.setHeader('Content-Length', stats.size);
    
    const fileStream = require('fs').createReadStream(filepath);
    fileStream.pipe(res);
    
  } catch (error) {
    console.error('Error serving icon:', error);
    res.status(404).json({ error: 'Icon not found' });
  }
});

// Get icons for multiple symbols
router.post('/batch', async (req, res) => {
  try {
    const { symbols } = req.body;
    
    if (!Array.isArray(symbols)) {
      return res.status(400).json({ error: 'Symbols must be an array' });
    }

    const results = {};
    
    // Process symbols in parallel with limit
    const batchSize = 5;
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      const promises = batch.map(async (item) => {
        const symbol = typeof item === 'string' ? item : item.symbol;
        const type = typeof item === 'string' ? 's' : (item.type || 's');
        
        try {
          const iconData = await fetchIcon(symbol.toUpperCase(), type);
          return { symbol: symbol.toUpperCase(), iconData };
        } catch (error) {
          console.error(`Error fetching icon for ${symbol}:`, error);
          return { symbol: symbol.toUpperCase(), iconData: null };
        }
      });
      
      const batchResults = await Promise.all(promises);
      batchResults.forEach(({ symbol, iconData }) => {
        results[symbol] = iconData;
      });
    }

    res.json({
      success: true,
      icons: results
    });
    
  } catch (error) {
    console.error('Error fetching batch icons:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get icons cache (all portfolio holdings, initializing missing ones)
router.get('/cache', async (req, res) => {
  try {
    // Load portfolio holdings
    const portfoliosPath = path.join(__dirname, '..', 'data', 'cache', 'portfolios.json');
    let allHoldings = [];

    try {
      const portfoliosData = await fs.readFile(portfoliosPath, 'utf8');
      const portfolios = JSON.parse(portfoliosData);

      // Collect all unique symbol+type combinations from trades (more complete than holdings)
      const seen = new Set();
      Object.values(portfolios).forEach(portfolioEntry => {
        const portfolio = portfolioEntry.portfolio || portfolioEntry;

        // From trades (catches all ever-traded symbols)
        if (portfolio.trades && Array.isArray(portfolio.trades)) {
          portfolio.trades.forEach(trade => {
            if (trade.symbol) {
              const type = trade.type || 's';
              const key = `${trade.symbol.toUpperCase()}_${type}`;
              if (!seen.has(key)) {
                seen.add(key);
                allHoldings.push({ symbol: trade.symbol.toUpperCase(), type });
              }
            }
          });
        }

        // Also from holdings (in case trades aren't available)
        if (portfolio.holdings && Array.isArray(portfolio.holdings)) {
          portfolio.holdings.forEach(holding => {
            if (holding.symbol) {
              const type = holding.type || 's';
              const key = `${holding.symbol.toUpperCase()}_${type}`;
              if (!seen.has(key)) {
                seen.add(key);
                allHoldings.push({ symbol: holding.symbol.toUpperCase(), type });
              }
            }
          });
        }
      });

      console.log(`🔍 Found ${allHoldings.length} unique symbols in portfolio`);
    } catch (portfolioError) {
      console.warn('⚠️ Could not load portfolios, returning existing cache:', portfolioError.message);
      const cache = await loadIconsCache();
      return res.json({ success: true, cache });
    }

    // Also include recurring investment symbols (e.g. BNS397) which are not in portfolios.json
    try {
      const recurringPath = path.join(__dirname, '..', 'data', 'recurring-investments.json');
      const recurringData = await fs.readFile(recurringPath, 'utf8');
      const { recurringInvestments } = JSON.parse(recurringData);
      const seen = new Set(allHoldings.map(h => `${h.symbol}_${h.type}`));
      for (const inv of (recurringInvestments || [])) {
        if (inv.symbol) {
          const key = `${inv.symbol.toUpperCase()}_s`;
          if (!seen.has(key)) {
            seen.add(key);
            allHoldings.push({ symbol: inv.symbol.toUpperCase(), type: 's' });
          }
        }
      }
      console.log(`🔍 Total symbols including recurring investments: ${allHoldings.length}`);
    } catch (recurringError) {
      console.warn('⚠️ Could not load recurring investments for icons:', recurringError.message);
    }

    // Initialize icons for any symbols not yet in cache (sequential to avoid race condition on ID assignment)
    for (const { symbol, type } of allHoldings) {
      await fetchIcon(symbol, type).catch(() => null);
    }

    // Return the full cache filtered to portfolio symbols
    const cache = await loadIconsCache();
    const portfolioKeys = new Set(allHoldings.map(({ symbol, type }) => `${symbol}_${type}`.toLowerCase()));
    const filteredCache = {};
    Object.entries(cache).forEach(([key, value]) => {
      if (portfolioKeys.has(key.toLowerCase())) {
        filteredCache[key] = value;
      }
    });

    console.log(`📦 Returning ${Object.keys(filteredCache).length} icons for ${allHoldings.length} portfolio symbols`);

    res.json({ success: true, cache: filteredCache });
  } catch (error) {
    console.error('Error getting icons cache:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get asset-icon mapping
router.get('/mapping', async (req, res) => {
  try {
    const mapping = await loadAssetMapping();
    res.json({
      success: true,
      mapping: mapping
    });
  } catch (error) {
    console.error('Error getting asset mapping:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get cache statistics
router.get('/stats', async (req, res) => {
  try {
    const cache = await loadIconsCache();
    const files = await fs.readdir(ICONS_DIR).catch(() => []);
    
    const stats = {
      totalCached: Object.keys(cache).length,
      successful: Object.values(cache).filter(icon => !icon.failed).length,
      failed: Object.values(cache).filter(icon => icon.failed).length,
      filesOnDisk: files.length,
      lastUpdated: Math.max(...Object.values(cache).map(icon => icon.timestamp || 0))
    };
    
    res.json(stats);
  } catch (error) {
    console.error('Error getting icon stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get available icons in the icons directory
router.get('/available', async (req, res) => {
  try {
    const files = await fs.readdir(ICONS_DIR).catch(() => []);
    const pngFiles = files.filter(file => file.toLowerCase().endsWith('.png'));
    
    const icons = pngFiles.map(filename => ({
      filename,
      url: `/api/icons/image/${filename}`
    }));
    
    res.json({
      success: true,
      icons
    });
  } catch (error) {
    console.error('Error getting available icons:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update icon mapping
router.put('/update', async (req, res) => {
  try {
    const { symbolKey, filename } = req.body;
    
    if (!symbolKey || !filename) {
      return res.status(400).json({ error: 'symbolKey and filename are required' });
    }

    // Validate filename exists
    const iconPath = path.join(ICONS_DIR, filename);
    try {
      await fs.access(iconPath);
    } catch (error) {
      return res.status(404).json({ error: 'Icon file not found' });
    }

    // Load current cache and mapping
    const cache = await loadIconsCache();
    const mapping = await loadAssetMapping();
    
    if (!cache[symbolKey]) {
      return res.status(404).json({ error: 'Symbol not found in cache' });
    }

    // Update cache
    cache[symbolKey].filename = filename;
    cache[symbolKey].url = `/api/icons/image/${filename}`;
    cache[symbolKey].timestamp = Date.now();
    
    // Update mapping
    const mappingKey = `${cache[symbolKey].symbol}_${cache[symbolKey].type}`.toUpperCase();
    if (mapping.mappings[mappingKey]) {
      mapping.mappings[mappingKey].filename = filename;
    }

    // Persist permanently so it survives any future cache/mapping reset
    permanentIcons[mappingKey] = filename;

    await saveIconsCache(cache);
    await saveAssetMapping(mapping);
    await savePermanentIcons();

    res.json({
      success: true,
      message: 'Icon mapping updated successfully'
    });
  } catch (error) {
    console.error('Error updating icon mapping:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload new icon
router.post('/upload', async (req, res) => {
  try {
    const multer = require('multer');
    
    // Configure multer for file upload
    const storage = multer.memoryStorage();
    const upload = multer({
      storage,
      limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
      },
      fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
          cb(null, true);
        } else {
          cb(new Error('Only image files are allowed'));
        }
      }
    }).single('icon');

    upload(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }

      const { symbolKey } = req.body;
      const file = req.file;

      if (!symbolKey || !file) {
        return res.status(400).json({ error: 'symbolKey and icon file are required' });
      }

      try {
        // Load current cache
        const cache = await loadIconsCache();
        const mapping = await loadAssetMapping();
        
        if (!cache[symbolKey]) {
          return res.status(404).json({ error: 'Symbol not found in cache' });
        }

        // Generate filename based on symbol, e.g. MSFT.png, MSFT1.png, MSFT2.png
        const ext = path.extname(file.originalname) || '.png';
        const symbol = cache[symbolKey].symbol;
        let newFilename = `${symbol}${ext}`;
        let counter = 1;
        while (true) {
          try {
            await fs.access(path.join(ICONS_DIR, newFilename));
            newFilename = `${symbol}${counter}${ext}`;
            counter++;
          } catch {
            break; // filename is free
          }
        }
        const newFilePath = path.join(ICONS_DIR, newFilename);

        // Save file
        await fs.writeFile(newFilePath, file.buffer);

        // Update cache
        cache[symbolKey].filename = newFilename;
        cache[symbolKey].url = `/api/icons/image/${newFilename}`;
        cache[symbolKey].timestamp = Date.now();
        cache[symbolKey].contentType = file.mimetype;
        cache[symbolKey].size = file.size;
        
        // Update mapping
        const mappingKey = `${cache[symbolKey].symbol}_${cache[symbolKey].type}`.toUpperCase();
        if (mapping.mappings[mappingKey]) {
          mapping.mappings[mappingKey].filename = newFilename;
        }

        // Persist permanently so it survives any future cache/mapping reset
        permanentIcons[mappingKey] = newFilename;

        await saveIconsCache(cache);
        await saveAssetMapping(mapping);
        await savePermanentIcons();

        res.json({
          success: true,
          message: 'Icon uploaded successfully',
          filename: newFilename
        });
      } catch (error) {
        console.error('Error processing upload:', error);
        res.status(500).json({ error: 'Failed to process upload' });
      }
    });
  } catch (error) {
    console.error('Error setting up upload:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Clear cache
router.delete('/cache', async (req, res) => {
  try {
    await saveIconsCache({});
    
    // Optionally delete files
    if (req.query.deleteFiles === 'true') {
      const files = await fs.readdir(ICONS_DIR).catch(() => []);
      await Promise.all(
        files.map(file => fs.unlink(path.join(ICONS_DIR, file)).catch(() => {}))
      );
    }
    
    res.json({ success: true, message: 'Cache cleared' });
  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;