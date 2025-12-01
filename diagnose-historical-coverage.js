const fs = require('fs');
const path = require('path');
const historicalCache = require('./server/historical-cache.js');

// Load portfolio to get first trade dates
const portfolioFile = path.join(__dirname, 'server', 'data', 'cache', 'portfolios.json');
const portfolioData = JSON.parse(fs.readFileSync(portfolioFile, 'utf8'));

const portfolio = Object.values(portfolioData)[0].portfolio;

// Group trades by symbol to find first trade date
const firstTradeDates = new Map();
portfolio.trades.forEach(trade => {
  const tradeDate = new Date(trade.date);
  if (!firstTradeDates.has(trade.symbol) || tradeDate < firstTradeDates.get(trade.symbol)) {
    firstTradeDates.set(trade.symbol, tradeDate);
  }
});

const stats = historicalCache.getStats();

console.log('===== HISTORICAL DATA COVERAGE ANALYSIS =====\n');
console.log('Checking if historical cache has enough data for each asset...\n');

const issues = [];
const symbols = Array.from(firstTradeDates.keys()).sort();

symbols.forEach(symbol => {
  const firstTradeDate = firstTradeDates.get(symbol);
  const cacheInfo = stats.symbols[symbol];

  if (!cacheInfo) {
    issues.push({
      symbol,
      issue: 'NO_CACHE_ENTRY',
      firstTrade: firstTradeDate.toISOString().split('T')[0]
    });
    console.log(`❌ ${symbol}:`);
    console.log(`   Issue: No historical cache entry found`);
    console.log(`   First trade: ${firstTradeDate.toISOString().split('T')[0]}`);
    console.log('');
    return;
  }

  const earliestData = cacheInfo.earliestLoggedDate ? new Date(cacheInfo.earliestLoggedDate) : null;
  const latestData = cacheInfo.latestLoggedDate ? new Date(cacheInfo.latestLoggedDate) : null;

  if (!earliestData || !latestData) {
    issues.push({
      symbol,
      issue: 'NO_DATA',
      firstTrade: firstTradeDate.toISOString().split('T')[0],
      dataPoints: cacheInfo.dataPoints
    });
    console.log(`❌ ${symbol}:`);
    console.log(`   Issue: No date range in cache (${cacheInfo.dataPoints} data points)`);
    console.log(`   First trade: ${firstTradeDate.toISOString().split('T')[0]}`);
    console.log('');
    return;
  }

  // Check if cache covers from first trade to today
  const today = new Date();
  const coverageGapStart = earliestData > firstTradeDate;
  const coverageGapEnd = latestData < today;

  const daysBeforeTrade = coverageGapStart ?
    Math.floor((firstTradeDate - earliestData) / (1000 * 60 * 60 * 24)) : 0;
  const daysBehindToday = coverageGapEnd ?
    Math.floor((today - latestData) / (1000 * 60 * 60 * 24)) : 0;

  if (coverageGapStart) {
    issues.push({
      symbol,
      issue: 'INSUFFICIENT_HISTORY',
      firstTrade: firstTradeDate.toISOString().split('T')[0],
      earliestData: earliestData.toISOString().split('T')[0],
      gap: `Missing ${Math.abs(daysBeforeTrade)} days before first trade`
    });
    console.log(`⚠️  ${symbol}:`);
    console.log(`   Issue: Historical data starts AFTER first trade`);
    console.log(`   First trade: ${firstTradeDate.toISOString().split('T')[0]}`);
    console.log(`   Earliest data: ${earliestData.toISOString().split('T')[0]}`);
    console.log(`   Gap: ${Math.abs(daysBeforeTrade)} days missing`);
    console.log(`   Data points: ${cacheInfo.dataPoints}`);
    console.log('');
  } else if (coverageGapEnd && daysBehindToday > 2) {
    issues.push({
      symbol,
      issue: 'OUTDATED',
      latestData: latestData.toISOString().split('T')[0],
      gap: `${daysBehindToday} days behind`
    });
    console.log(`⚠️  ${symbol}:`);
    console.log(`   Issue: Data is outdated`);
    console.log(`   Latest data: ${latestData.toISOString().split('T')[0]}`);
    console.log(`   Gap: ${daysBehindToday} days behind today`);
    console.log(`   Data points: ${cacheInfo.dataPoints}`);
    console.log('');
  } else {
    console.log(`✅ ${symbol}:`);
    console.log(`   First trade: ${firstTradeDate.toISOString().split('T')[0]}`);
    console.log(`   Data range: ${earliestData.toISOString().split('T')[0]} to ${latestData.toISOString().split('T')[0]}`);
    console.log(`   Coverage: ${cacheInfo.dataPoints} data points (${cacheInfo.dateSpanDays} days span)`);
    console.log('');
  }
});

console.log('\n===== SUMMARY =====');
console.log(`Total symbols: ${symbols.length}`);
console.log(`Symbols with complete coverage: ${symbols.length - issues.length}`);
console.log(`Symbols with issues: ${issues.length}\n`);

if (issues.length > 0) {
  console.log('ISSUES BREAKDOWN:');
  const byType = {};
  issues.forEach(issue => {
    byType[issue.issue] = (byType[issue.issue] || 0) + 1;
  });
  Object.keys(byType).forEach(type => {
    console.log(`  ${type}: ${byType[type]}`);
  });

  console.log('\nAffected symbols:');
  issues.forEach(issue => {
    console.log(`  ${issue.symbol}: ${issue.issue}${issue.gap ? ' - ' + issue.gap : ''}`);
  });
} else {
  console.log('✅ All symbols have complete historical coverage!');
}
