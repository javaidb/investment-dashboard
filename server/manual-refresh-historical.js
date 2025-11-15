const historicalDataPreloader = require('./historical-data-preloader');

console.log('🚀 Starting manual historical data refresh...\n');

historicalDataPreloader.prePopulateHistoricalCache()
  .then(result => {
    console.log('\n✅ Refresh completed!');
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Refresh failed:', error);
    process.exit(1);
  });
