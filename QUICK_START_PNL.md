# Quick Start: Daily P&L Tracker

## 🎉 Setup Complete!

Your Daily P&L Tracking system is now fully integrated and ready to use!

## 📍 How to Access

1. **Start the development server** (if not already running):
   ```bash
   npm run dev
   ```

2. **Navigate to P&L Tracker**:
   - Click "P&L Tracker" in the navigation bar (with LineChart icon 📈)
   - Or go directly to: `http://localhost:3000/pnl`

## 🚀 Quick Start Guide

### Step 1: Ensure You Have Portfolio Data
1. Go to **Portfolio** page
2. Upload your CSV files (Wealthsimple or crypto exchange format)
3. Wait for processing to complete

### Step 2: Calculate Daily P&L
1. Navigate to **P&L Tracker** page
2. Click the **"Calculate / Update PnL"** button
3. Wait for calculation to complete (5-10 seconds for ~15 assets)
4. System will show success message with results

### Step 3: View Your Daily P&L
Once calculated, you'll see:

- **Portfolio Totals** (top cards):
  - Total Portfolio Value
  - Total P&L
  - Unrealized P&L
  - Realized P&L

- **Asset Table** (below):
  - All your assets with current metrics
  - Shares owned, current value, P&L, P&L %
  - Number of daily records tracked

- **Individual Charts**:
  - Click "View Chart" for any asset
  - Interactive line chart with daily data
  - Switch between metrics: Total P&L ($), P&L (%), Market Value
  - Red dots mark transaction days (buys/sells)
  - Hover over any day for detailed breakdown

## 🎨 Features

### What You'll See

#### Chart Metrics (toggle between):
1. **Total P&L ($)** - Dollar amount profit/loss over time
2. **Total P&L (%)** - Percentage return over time
3. **Market Value** - Total value of holdings over time

#### Daily Data Points:
- Share quantity owned
- Cost basis (amount invested)
- Market value (current worth)
- Unrealized P&L (paper gains/losses)
- Realized P&L (actual gains/losses from sales)
- Total P&L (unrealized + realized)
- Closing price
- Transactions (on days you traded)

#### Transaction Markers:
- **Red dots** = Days you bought or sold shares
- Hover to see transaction details

## 📊 Understanding Your Data

### Cost Basis (FIFO Method)
The system uses **First-In-First-Out** (FIFO) to track cost basis:

**Example:**
```
Jan 1:  Buy 10 shares @ $100 = $1,000
Jan 5:  Buy 5 shares @ $110 = $550
Jan 10: Sell 12 shares @ $120

Cost of sold shares (FIFO):
- 10 shares from Jan 1 @ $100 = $1,000
- 2 shares from Jan 5 @ $110 = $220
Total cost: $1,220

Realized P&L: $1,440 (proceeds) - $1,220 (cost) = $220

Remaining: 3 shares from Jan 5 @ $110 = $330
```

### P&L Calculations

**Unrealized P&L** = Market Value - Cost Basis (current position)

**Realized P&L** = Sum of all gains/losses from sales

**Total P&L** = Unrealized + Realized

**P&L %** = (Total P&L / Total Ever Invested) × 100

## 🔄 Updating Data

### When to Update:
- After uploading new CSV files with recent trades
- Once per day to get latest prices
- When historical price data is refreshed

### How to Update:
1. Click **"Calculate / Update PnL"** button
2. System only recalculates missing trading days (fast!)
3. Existing data is preserved and new days are added

## 📁 Where Data is Stored

Your P&L data is cached at:
```
server/data/cache/pnl-cache.json
```

This file persists across server restarts, so you don't need to recalculate unless:
- You have new trades to process
- You want to add today's data
- Cache was manually cleared

## 🛠️ Troubleshooting

### "No PnL data found for this symbol"
**Solution**: Click "Calculate / Update PnL" button to generate data

### "No historical price data found"
**Solution**: Ensure historical-cache has price data. Check:
1. Server logs for historical data preloader
2. File exists: `server/data/cache/historical-cache.json`
3. Contains data for your symbols

### Calculation takes too long
**Normal**: First calculation for 15 assets × 250 days = 5-10 seconds
**Subsequent updates**: Only new days, much faster (1-2 seconds)

### Chart not showing
**Check**:
1. Browser console for errors
2. API response: `GET /api/pnl/symbol/{SYMBOL}`
3. Daily records exist in response

## 🔗 API Endpoints (for debugging)

Test your setup with these endpoints:

```bash
# Get cache stats
curl http://localhost:5000/api/pnl/stats

# Get P&L for specific symbol
curl http://localhost:5000/api/pnl/symbol/AAPL

# Get portfolio summary
curl http://localhost:5000/api/pnl/portfolio/{PORTFOLIO_ID}/summary
```

## 📚 Full Documentation

For complete details, see:
- **[PNL_TRACKING.md](PNL_TRACKING.md)** - Complete system documentation
- **[CLAUDE.md](CLAUDE.md)** - Project overview (updated with P&L info)

## 🎯 Next Steps

1. **Calculate your P&L**: Click the button and wait for results
2. **Explore the charts**: View each asset's daily performance
3. **Track regularly**: Update daily or weekly to see trends
4. **Export data** (future): Feature coming soon

## 💡 Tips

- **Best viewed on desktop** - Charts are interactive and detailed
- **Mobile responsive** - Works on phones but better on larger screens
- **Historical view** - Go back to see how you performed over time
- **Transaction history** - See exactly when you bought/sold
- **Performance analysis** - Identify best/worst performing assets

---

**Ready to go!** Navigate to `/pnl` and start tracking your daily P&L! 📈
