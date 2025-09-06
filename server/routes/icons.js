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
    // Create default mapping if file doesn't exist
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
    await saveAssetMapping(defaultMapping);
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
  
  if (mapping.mappings[key]) {
    return mapping.mappings[key];
  }
  
  // Assign new ID
  const newId = mapping.nextId;
  mapping.mappings[key] = {
    id: newId,
    symbol: symbol.toUpperCase(),
    type: type,
    filename: `${newId}.png`,
    created: new Date().toISOString(),
    source: 'template'
  };
  mapping.nextId = newId + 1;
  
  await saveAssetMapping(mapping);
  
  // Copy template to new icon file
  const newIconPath = path.join(ICONS_DIR, `${newId}.png`);
  try {
    await fs.copyFile(TEMPLATE_ICON_PATH, newIconPath);
    console.log(`Created new icon ${newId}.png for ${symbol} (${type === 'c' ? 'crypto' : 'stock'})`);
  } catch (error) {
    console.error(`Error copying template for ${symbol}:`, error);
  }
  
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
  const cache = await loadIconsCache();
  
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
  
  // Check if the icon file exists
  const iconPath = path.join(ICONS_DIR, iconMapping.filename);
  try {
    await fs.access(iconPath);
  } catch (error) {
    // Icon file doesn't exist, copy from template
    try {
      await fs.copyFile(TEMPLATE_ICON_PATH, iconPath);
      console.log(`Created icon ${iconMapping.filename} for ${symbol} from template`);
    } catch (copyError) {
      console.error(`Failed to create icon for ${symbol}:`, copyError);
      // Update cache with failed status
      cache[cacheKey] = {
        symbol,
        type,
        timestamp: Date.now(),
        failed: true
      };
      await saveIconsCache(cache);
      return null;
    }
  }

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

// Get icon for symbol
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

// Get icons cache
router.get('/cache', async (req, res) => {
  try {
    const cache = await loadIconsCache();
    res.json({
      success: true,
      cache: cache
    });
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
    
    await saveIconsCache(cache);
    await saveAssetMapping(mapping);
    
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

        // Generate unique filename
        const ext = path.extname(file.originalname) || '.png';
        const hash = crypto.randomBytes(16).toString('hex');
        const newFilename = `${hash}${ext}`;
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
        
        await saveIconsCache(cache);
        await saveAssetMapping(mapping);
        
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