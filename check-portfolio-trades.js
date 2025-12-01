const fs = require('fs');
const path = require('path');

const portfolioFile = path.join(__dirname, 'server', 'data', 'cache', 'portfolios.json');
const portfolioData = JSON.parse(fs.readFileSync(portfolioFile, 'utf8'));

console.log('===== PORTFOLIO TRADES ANALYSIS =====\n');

// Find the portfolio
const portfolios = [];
for (const [filename, fileData] of Object.entries(portfolioData)) {
  if (fileData && fileData.portfolio) {
    portfolios.push(fileData.portfolio);
  }
}

if (portfolios.length === 0) {
  console.log('No portfolios found!');
  process.exit(1);
}

const portfolio = portfolios[0];
console.log(`Portfolio ID: ${portfolio.id}`);
console.log(`Total trades: ${portfolio.trades ? portfolio.trades.length : 0}\n`);

if (!portfolio.trades || portfolio.trades.length === 0) {
  console.log('No trades found!');
  process.exit(1);
}

// Group trades by symbol
const tradesBySymbol = new Map();
portfolio.trades.forEach(trade => {
  if (!tradesBySymbol.has(trade.symbol)) {
    tradesBySymbol.set(trade.symbol, []);
  }
  tradesBySymbol.get(trade.symbol).push(trade);
});

console.log('===== TRADES BY SYMBOL =====\n');
const symbols = Array.from(tradesBySymbol.keys()).sort();

symbols.forEach(symbol => {
  const trades = tradesBySymbol.get(symbol);
  const firstTrade = trades.sort((a, b) => new Date(a.date) - new Date(b.date))[0];
  const buyTrades = trades.filter(t => t.action === 'buy');
  const sellTrades = trades.filter(t => t.action === 'sell');

  console.log(`${symbol}:`);
  console.log(`  Total trades: ${trades.length} (${buyTrades.length} buys, ${sellTrades.length} sells)`);
  console.log(`  First trade: ${new Date(firstTrade.date).toISOString().split('T')[0]}`);
  console.log(`  Type: ${firstTrade.type === 's' ? 'Stock' : 'Crypto'}`);
  console.log(`  Currency: ${firstTrade.currency || 'Unknown'}`);
  console.log('');
});

console.log(`\n===== SUMMARY =====`);
console.log(`Total unique symbols with trades: ${symbols.length}`);
console.log(`Symbols: ${symbols.join(', ')}`);
