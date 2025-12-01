const axios = require('./server/node_modules/axios').default;
const historicalDataCache = require('./server/historical-cache');

/**
 * Fetch full historical data for specific symbols
 * This forces a complete re-fetch going back as far as possible
 */
async function fetchFullHistoryForSymbol(symbol, isCrypto = false) {
  try {
    console.log(`\n🔍 Fetching full historical data for ${symbol}...`);

    // Convert to Yahoo Finance format
    let yahooSymbol = symbol;
    if (isCrypto) {
      yahooSymbol = `${symbol}-USD`;
    }

    // Fetch maximum available history (10 years or max)
    const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}`, {
      params: {
        range: 'max', // Get maximum available history
        interval: '1d'
      },
      timeout: 30000 // 30 second timeout
    });

    if (response.data && response.data.chart && response.data.chart.result) {
      const result = response.data.chart.result[0];
      const timestamps = result.timestamp;
      const quotes = result.indicators.quote[0];
      const metadata = result.meta;

      if (!timestamps || !quotes) {
        throw new Error('Invalid data structure from Yahoo Finance');
      }

      // Convert to EDT and create data points
      const historicalData = timestamps.map((timestamp, index) => {
        const utcDate = new Date(timestamp * 1000);
        const edtDate = new Date(utcDate.getTime() - (4 * 60 * 60 * 1000));

        return {
          date: edtDate.toISOString(),
          open: quotes.open[index] || 0,
          high: quotes.high[index] || 0,
          low: quotes.low[index] || 0,
          close: quotes.close[index] || 0,
          volume: quotes.volume[index] || 0
        };
      }).filter(item => item.close > 0);

      if (historicalData.length === 0) {
        throw new Error('No valid historical data points returned');
      }

      // Sort by date (earliest first)
      historicalData.sort((a, b) => new Date(a.date) - new Date(b.date));

      const earliestDate = historicalData[0].date.split('T')[0];
      const latestDate = historicalData[historicalData.length - 1].date.split('T')[0];

      console.log(`📊 Retrieved ${historicalData.length} data points`);
      console.log(`   Date range: ${earliestDate} to ${latestDate}`);
      console.log(`   Yahoo symbol: ${yahooSymbol}`);

      // Store in cache (this will REPLACE existing data)
      historicalDataCache.set(symbol, historicalData, metadata);

      console.log(`✅ Successfully cached full history for ${symbol}`);

      return {
        success: true,
        symbol,
        dataPoints: historicalData.length,
        dateRange: { earliest: earliestDate, latest: latestDate }
      };
    } else {
      throw new Error('No chart data returned from Yahoo Finance');
    }

  } catch (error) {
    console.error(`❌ Failed to fetch ${symbol}: ${error.message}`);
    return {
      success: false,
      symbol,
      error: error.message
    };
  }
}

async function main() {
  console.log('===== FETCHING FULL HISTORICAL DATA =====\n');
  console.log('This will fetch maximum available history for DOGE and TSLA');
  console.log('and replace their current cache entries.\n');

  const symbolsToFetch = [
    { symbol: 'DOGE', isCrypto: true, currentEarliest: '2024-11-29', needsFrom: '2022-10-29' },
    { symbol: 'TSLA', isCrypto: false, currentEarliest: '2025-09-02', needsFrom: '2022-08-25' }
  ];

  const results = [];

  for (const { symbol, isCrypto, currentEarliest, needsFrom } of symbolsToFetch) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Symbol: ${symbol}`);
    console.log(`Current earliest data: ${currentEarliest}`);
    console.log(`Need data from: ${needsFrom}`);
    console.log(`${'='.repeat(60)}`);

    const result = await fetchFullHistoryForSymbol(symbol, isCrypto);
    results.push(result);

    // Add delay between requests
    if (symbol !== symbolsToFetch[symbolsToFetch.length - 1].symbol) {
      console.log('\n⏳ Waiting 2 seconds before next request...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log('\n\n===== SUMMARY =====\n');

  results.forEach(result => {
    if (result.success) {
      console.log(`✅ ${result.symbol}:`);
      console.log(`   Data points: ${result.dataPoints}`);
      console.log(`   Date range: ${result.dateRange.earliest} to ${result.dateRange.latest}`);
    } else {
      console.log(`❌ ${result.symbol}: ${result.error}`);
    }
  });

  const successful = results.filter(r => r.success).length;
  console.log(`\nTotal: ${successful}/${results.length} successful`);

  if (successful === results.length) {
    console.log('\n🎉 All historical data fetched successfully!');
    console.log('You can now recalculate P&L for DOGE and TSLA with complete data.');
  } else {
    console.log('\n⚠️ Some fetches failed. Check errors above.');
  }
}

main().catch(console.error);
