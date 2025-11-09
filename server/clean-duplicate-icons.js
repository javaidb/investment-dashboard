const fs = require('fs');
const path = require('path');

// Path to icons cache
const ICONS_CACHE_PATH = path.join(__dirname, 'data', 'cache', 'icons-cache.json');

// Crypto symbols that should only have 'c' type, not 's' type
const CRYPTO_SYMBOLS = ['BTC', 'ETH', 'SOL', 'DOGE', 'TRUMP'];

console.log('🧹 Cleaning duplicate icon entries for crypto symbols...');
console.log(`📁 Icons cache file: ${ICONS_CACHE_PATH}`);

try {
  // Read the icons cache
  const iconsCache = JSON.parse(fs.readFileSync(ICONS_CACHE_PATH, 'utf8'));

  console.log(`\n📊 Total icon entries before cleanup: ${Object.keys(iconsCache).length}`);

  // Track removed entries
  const removed = [];

  // Remove stock entries for crypto symbols
  CRYPTO_SYMBOLS.forEach(symbol => {
    const stockKey = `${symbol.toLowerCase()}_s`;
    const cryptoKey = `${symbol.toLowerCase()}_c`;

    // Check if both stock and crypto versions exist
    if (iconsCache[stockKey] && iconsCache[cryptoKey]) {
      console.log(`\n❌ Removing duplicate stock entry for ${symbol}:`);
      console.log(`   Stock key: ${stockKey} -> ${iconsCache[stockKey].filename}`);
      console.log(`   Keeping crypto key: ${cryptoKey} -> ${iconsCache[cryptoKey].filename}`);

      removed.push({
        symbol,
        stockKey,
        filename: iconsCache[stockKey].filename
      });

      delete iconsCache[stockKey];
    } else if (iconsCache[stockKey] && !iconsCache[cryptoKey]) {
      console.log(`\n⚠️  ${symbol} has stock entry but no crypto entry - converting to crypto`);
      console.log(`   Converting ${stockKey} to ${cryptoKey}`);

      // Convert stock entry to crypto
      iconsCache[cryptoKey] = {
        ...iconsCache[stockKey],
        type: 'c'
      };

      delete iconsCache[stockKey];

      removed.push({
        symbol,
        stockKey,
        converted: true
      });
    } else if (iconsCache[cryptoKey]) {
      console.log(`✅ ${symbol} only has crypto entry (correct)`);
    }
  });

  console.log(`\n📊 Total icon entries after cleanup: ${Object.keys(iconsCache).length}`);
  console.log(`\n🗑️  Removed ${removed.length} duplicate/incorrect entries`);

  if (removed.length > 0) {
    // Create backup
    const backupPath = ICONS_CACHE_PATH + '.backup';
    fs.copyFileSync(ICONS_CACHE_PATH, backupPath);
    console.log(`\n💾 Backup created: ${backupPath}`);

    // Write updated cache
    fs.writeFileSync(ICONS_CACHE_PATH, JSON.stringify(iconsCache, null, 2));
    console.log(`✅ Icons cache updated successfully!`);

    console.log('\n📋 Summary of removed entries:');
    removed.forEach(({ symbol, stockKey, converted, filename }) => {
      if (converted) {
        console.log(`  - ${stockKey} → converted to ${symbol.toLowerCase()}_c`);
      } else {
        console.log(`  - ${stockKey} (${filename})`);
      }
    });
  } else {
    console.log('\n✅ No duplicate entries found - icons cache is clean!');
  }

} catch (error) {
  console.error('❌ Error cleaning icon cache:', error);
  process.exit(1);
}

console.log('\n✨ Done!');
