const cache = require('./server/historical-cache.js');

const stats = cache.getStats();

console.log('===== HISTORICAL CACHE STATUS =====');
console.log(`Total symbols: ${stats.totalSymbols}`);
console.log(`Total data points: ${stats.totalDataPoints}`);
console.log(`Assets needing update: ${stats.needsUpdateCount}\n`);

const symbols = Object.keys(stats.symbols).sort();

console.log('===== DETAILED BREAKDOWN =====\n');

symbols.forEach(symbol => {
  const info = stats.symbols[symbol];
  console.log(`${symbol}:`);
  console.log(`  Data points: ${info.dataPoints}`);
  console.log(`  Date range: ${info.earliestLoggedDate || 'N/A'} to ${info.latestLoggedDate || 'N/A'}`);
  console.log(`  Needs update: ${info.needsUpdate} (${info.daysMissing} missing days)`);
  console.log('');
});

console.log('\n===== ASSETS WITH NO DATA =====');
const noData = symbols.filter(s => stats.symbols[s].dataPoints === 0);
if (noData.length > 0) {
  console.log(noData.join(', '));
} else {
  console.log('All assets have historical data!');
}

console.log('\n===== ASSETS WITH INSUFFICIENT DATA =====');
const insufficientData = symbols.filter(s => {
  const points = stats.symbols[s].dataPoints;
  return points > 0 && points < 30; // Less than 30 days
});
if (insufficientData.length > 0) {
  insufficientData.forEach(s => {
    console.log(`${s}: ${stats.symbols[s].dataPoints} data points`);
  });
} else {
  console.log('All assets have sufficient data (30+ days)');
}
