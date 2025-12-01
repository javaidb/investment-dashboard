# Daily P&L Tracking System

## Overview

The Daily P&L Tracking System provides comprehensive day-by-day performance tracking for every asset in your portfolio, starting from the first purchase date. This system calculates and caches daily profit/loss metrics, share quantities, and transaction history.

## Features

### What Gets Tracked

For each asset, the system tracks daily:
- **Share Quantity**: Total shares owned at end of each trading day
- **Cost Basis**: Total amount invested in current position (using FIFO)
- **Market Value**: Current value at closing price
- **Unrealized P&L**: Market value minus cost basis
- **Realized P&L**: Cumulative P&L from all sales
- **Total P&L**: Unrealized + Realized
- **Total P&L %**: Percentage return on total investment
- **Close Price**: End-of-day closing price
- **Transactions**: Buy/sell transactions that occurred on that day

### Key Capabilities

1. **Historical Tracking**: Starts from your first purchase date for each asset
2. **FIFO Cost Basis**: Uses First-In-First-Out method for accurate realized P&L
3. **Incremental Updates**: Only calculates missing days to minimize processing
4. **Persistent Cache**: Data stored in `server/data/cache/pnl-cache.json`
5. **Transaction Markers**: Chart highlights days when you bought or sold shares

## Architecture

### Backend Components

#### 1. PnL Cache (`server/pnl-cache.js`)
- File-based storage for daily P&L records
- Similar structure to `historical-cache.js`
- Append-only design for missing trading days
- Methods:
  - `get(symbol, startDate?, endDate?)` - Retrieve P&L data
  - `set(symbol, assetInfo, dailyRecords)` - Store complete history
  - `updateIncremental(symbol, newRecords)` - Append new days
  - `needsUpdate(symbol)` - Check if cache is stale
  - `getStats()` - Get cache statistics
  - `clearSymbol(symbol)` - Clear specific asset
  - `clearAll()` - Clear entire cache

#### 2. PnL Calculator (`server/pnl-calculator.js`)
- Processes trades and calculates daily P&L
- Combines portfolio trades with historical price data
- FIFO cost basis tracking with share lots
- Methods:
  - `calculateDailyPnL(symbol, trades, assetInfo)` - Calculate for one asset
  - `calculateAndCachePortfolioPnL(portfolio)` - Calculate for entire portfolio
  - `updatePnL(symbol, trades, assetInfo)` - Incremental update

#### 3. PnL Routes (`server/routes/pnl.js`)
API endpoints for P&L operations (see API Reference below)

### Frontend Components

#### 1. DailyPnLChart (`client/src/components/DailyPnLChart.tsx`)
Interactive chart for visualizing daily P&L trends:
- **Metrics**: Switch between Total P&L ($), Total P&L (%), or Market Value
- **Transaction Markers**: Red dots on days with buys/sells
- **Rich Tooltips**: Shows all metrics for selected day
- **Date Range**: Optional filtering by date range

#### 2. PortfolioPnLTracker (`client/src/components/PortfolioPnLTracker.tsx`)
Main dashboard for portfolio P&L tracking:
- **Portfolio Totals**: Aggregate metrics across all assets
- **Asset Table**: List of all assets with key metrics
- **One-Click Calculation**: Calculate/update P&L for entire portfolio
- **Individual Charts**: View detailed chart for any asset

## Data Structure

### PnL Cache Format
```json
{
  "SYMBOL": {
    "assetInfo": {
      "symbol": "AAPL",
      "type": "s",
      "currency": "CAD",
      "firstPurchaseDate": "2023-01-15"
    },
    "dailyRecords": [
      {
        "date": "2023-01-15",
        "shares": 10,
        "costBasis": 1500.00,
        "marketValue": 1520.00,
        "unrealizedPnL": 20.00,
        "realizedPnL": 0,
        "totalPnL": 20.00,
        "totalPnLPercent": 1.33,
        "closePrice": 152.00,
        "transactions": [
          {
            "action": "buy",
            "quantity": 10,
            "price": 150.00,
            "total": 1500.00,
            "time": "2023-01-15T14:30:00.000Z"
          }
        ]
      },
      {
        "date": "2023-01-16",
        "shares": 10,
        "costBasis": 1500.00,
        "marketValue": 1550.00,
        "unrealizedPnL": 50.00,
        "realizedPnL": 0,
        "totalPnL": 50.00,
        "totalPnLPercent": 3.33,
        "closePrice": 155.00
      }
    ],
    "lastModified": "2025-11-30T12:00:00.000Z",
    "latestDate": "2025-11-29"
  }
}
```

## API Reference

### Base URL: `/api/pnl`

#### 1. Get Cache Statistics
```http
GET /api/pnl/stats
```

**Response:**
```json
{
  "success": true,
  "totalSymbols": 15,
  "cacheFile": "/path/to/pnl-cache.json",
  "totalRecords": 2450,
  "needsUpdateCount": 3,
  "symbols": {
    "AAPL": {
      "assetInfo": {...},
      "recordCount": 250,
      "firstDate": "2023-01-15",
      "latestDate": "2025-11-29",
      "needsUpdate": false,
      "missingDays": 0
    }
  }
}
```

#### 2. Get P&L for Specific Symbol
```http
GET /api/pnl/symbol/:symbol?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
```

**Parameters:**
- `symbol` (required): Asset symbol
- `startDate` (optional): Filter start date
- `endDate` (optional): Filter end date

**Response:**
```json
{
  "success": true,
  "symbol": "AAPL",
  "assetInfo": {...},
  "dailyRecords": [...],
  "totalRecords": 250,
  "filteredRecords": 90
}
```

#### 3. Calculate P&L for Portfolio
```http
POST /api/pnl/calculate/:portfolioId
```

Calculates and caches daily P&L for all assets in portfolio.

**Response:**
```json
{
  "success": true,
  "portfolioId": "123456",
  "processed": 15,
  "failed": 0,
  "symbols": [
    {
      "symbol": "AAPL",
      "recordCount": 250,
      "success": true
    }
  ],
  "message": "Processed 15 assets, 0 failed"
}
```

#### 4. Update P&L for Single Symbol
```http
POST /api/pnl/update/:symbol
Content-Type: application/json

{
  "portfolioId": "123456"
}
```

Updates P&L cache for a specific symbol (incremental).

**Response:**
```json
{
  "success": true,
  "symbol": "AAPL",
  "portfolioId": "123456",
  "type": "incremental",
  "recordCount": 250,
  "newRecords": 5
}
```

#### 5. Get Portfolio P&L Summary
```http
GET /api/pnl/portfolio/:portfolioId/summary
```

**Response:**
```json
{
  "success": true,
  "portfolioId": "123456",
  "totalSymbols": 15,
  "assets": [...],
  "portfolioTotals": {
    "totalValue": 50000.00,
    "totalPnL": 5000.00,
    "totalUnrealizedPnL": 3000.00,
    "totalRealizedPnL": 2000.00,
    "assetsWithData": 15,
    "assetsWithoutData": 0
  }
}
```

#### 6. Clear P&L Cache for Symbol
```http
DELETE /api/pnl/symbol/:symbol
```

#### 7. Clear Entire P&L Cache
```http
DELETE /api/pnl/clear-all
```

## Usage Guide

### Initial Setup

1. **Upload Portfolio CSV Files**
   - Upload your Wealthsimple or crypto exchange CSV files
   - System processes trades automatically

2. **Ensure Historical Data is Available**
   - Historical prices are fetched from `historical-cache`
   - Make sure historical data is preloaded for your assets

3. **Calculate P&L**
   - Navigate to P&L Tracker page
   - Click "Calculate / Update PnL" button
   - System processes all assets in portfolio

### Viewing P&L Data

1. **Portfolio Overview**
   - See aggregate metrics across all assets
   - Total value, total P&L, unrealized/realized breakdown

2. **Asset Table**
   - View all assets with key metrics
   - See current shares, value, P&L, and P&L %
   - Click "View Chart" for detailed visualization

3. **Daily P&L Chart**
   - Switch between different metrics (P&L $, P&L %, Market Value)
   - Hover over any day to see detailed breakdown
   - Red dots indicate transaction days

### Updating P&L

The system uses an incremental update strategy:

1. **Automatic Updates**
   - System checks for missing days
   - Only calculates new trading days

2. **Manual Updates**
   - Click "Calculate / Update PnL" to refresh
   - System updates all assets that need it

3. **New Trades**
   - After uploading new CSV files, recalculate P&L
   - System will incorporate new transactions

## Cost Basis Calculation (FIFO)

The system uses **First-In-First-Out (FIFO)** for cost basis:

### Example:
```
Day 1: Buy 10 shares @ $100 = $1,000
Day 5: Buy 5 shares @ $110 = $550
Day 10: Sell 12 shares @ $120 = $1,440

Cost basis of sold shares (FIFO):
- 10 shares from Day 1 @ $100 = $1,000
- 2 shares from Day 5 @ $110 = $220
Total cost: $1,220

Realized P&L: $1,440 - $1,220 = $220

Remaining position:
- 3 shares from Day 5 @ $110 = $330
```

## Performance Considerations

### Optimization Strategies

1. **Leverages Existing Caches**
   - Uses `historical-cache` for price data
   - No duplicate API calls for price history

2. **Incremental Updates**
   - Only calculates missing days
   - Avoids full recalculation on each update

3. **File-Based Persistence**
   - Cache survives server restarts
   - Reduces recalculation needs

4. **Batch Processing**
   - Calculates all assets in portfolio at once
   - Efficient for large portfolios

### First-Time Calculation

For a portfolio with 15 assets, each held for ~1 year (250 trading days):
- **Total calculations**: 15 × 250 = 3,750 daily records
- **Processing time**: ~5-10 seconds (depends on historical cache)
- **Subsequent updates**: Only new days (typically 1-5 days)

## Integration Points

### Adding to Your UI

#### Option 1: Standalone Page
```tsx
import PortfolioPnLTracker from './components/PortfolioPnLTracker';

function PnLPage() {
  const portfolioId = "123456"; // Get from your portfolio state
  return <PortfolioPnLTracker portfolioId={portfolioId} />;
}
```

#### Option 2: Individual Asset Chart
```tsx
import DailyPnLChart from './components/DailyPnLChart';

function AssetDetail({ symbol }) {
  return (
    <div>
      <h1>{symbol} Details</h1>
      <DailyPnLChart symbol={symbol} />
    </div>
  );
}
```

#### Option 3: Date Range Filter
```tsx
<DailyPnLChart
  symbol="AAPL"
  startDate="2024-01-01"
  endDate="2024-12-31"
/>
```

### Adding to Navigation

Update your `App.tsx` or routing configuration:
```tsx
import PortfolioPnLTracker from './components/PortfolioPnLTracker';

// In your routes:
<Route path="/pnl" element={<PortfolioPnLTracker portfolioId={portfolioId} />} />
```

Update `Layout.tsx` to add navigation link:
```tsx
<Link
  to="/pnl"
  className="flex items-center px-4 py-2 text-gray-700 hover:bg-gray-100"
>
  📊 P&L Tracker
</Link>
```

## Troubleshooting

### Common Issues

#### 1. "No PnL data found for this symbol"
**Cause**: P&L hasn't been calculated yet
**Solution**: Click "Calculate / Update PnL" button

#### 2. "No historical price data found for [symbol]"
**Cause**: Historical cache missing price data
**Solution**:
- Ensure historical data preloader has run
- Check `historical-cache.json` for the symbol
- Manually trigger historical data fetch

#### 3. P&L calculations seem incorrect
**Cause**: Missing or incorrect trade data
**Solution**:
- Verify CSV upload processed correctly
- Check `portfolios.json` for trade data
- Ensure all trades have correct dates and quantities

#### 4. Chart not displaying
**Cause**: No daily records or date filtering issue
**Solution**:
- Check browser console for errors
- Verify API returns data: `/api/pnl/symbol/{SYMBOL}`
- Try removing date filters

#### 5. Performance is slow
**Cause**: Large portfolio or missing historical cache
**Solution**:
- Ensure `historical-cache.json` is populated
- Consider calculating P&L for subsets of assets
- Check server logs for API timeout errors

### Debugging

#### Check Cache Status
```bash
# View PnL cache stats
curl http://localhost:5000/api/pnl/stats

# View specific symbol
curl http://localhost:5000/api/pnl/symbol/AAPL
```

#### Check Files
```bash
# View PnL cache file
cat server/data/cache/pnl-cache.json | jq

# View historical cache
cat server/data/cache/historical-cache.json | jq '.AAPL' | head -50
```

#### Server Logs
Watch server console for:
- `📊 Calculating PnL for [symbol]...`
- `✅ Calculated X daily PnL records for [symbol]`
- `💾 Cached PnL history for [symbol]`
- Any error messages

## Future Enhancements

Potential improvements to consider:

1. **Tax Lot Selection**: Support for specific lot selection (not just FIFO)
2. **Export Functionality**: Export P&L data to CSV/Excel
3. **Alerts**: Notify when P&L crosses certain thresholds
4. **Comparison Tools**: Compare multiple assets side-by-side
5. **Performance Attribution**: Break down P&L by time periods
6. **Benchmark Comparison**: Compare against market indices
7. **Dividends Integration**: Include dividend income in realized P&L

## File Locations

### Backend
- `server/pnl-cache.js` - Cache management module
- `server/pnl-calculator.js` - P&L calculation logic
- `server/routes/pnl.js` - API endpoints
- `server/data/cache/pnl-cache.json` - Cached P&L data (auto-generated)

### Frontend
- `client/src/components/DailyPnLChart.tsx` - Chart component
- `client/src/components/PortfolioPnLTracker.tsx` - Main tracker page

### Configuration
- `server/index.js` - Routes registered here
- No additional environment variables needed
