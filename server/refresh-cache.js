#!/usr/bin/env node

/**
 * Manual Cache Refresh Script
 * Run this to update the holdings cache with all portfolio symbols
 */

const { refreshPortfolioCache } = require('./cache-utils');

console.log('🔄 Starting manual cache refresh...\n');
console.log('This will fetch current prices for ALL portfolio holdings.');
console.log('Expected to cache prices for ~33 symbols.\n');

refreshPortfolioCache()
  .then(() => {
    console.log('\n✅ Cache refresh completed successfully!');
    console.log('📊 Check server/data/cache/holdings-cache.json to verify all symbols are cached.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Cache refresh failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  });
