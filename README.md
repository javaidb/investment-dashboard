# Investment Dashboard

A comprehensive web dashboard for tracking stocks and cryptocurrency investments with live data, search functionality, and profit analysis.

## Features

- **Live Data Tracking**: Real-time stock and crypto prices updated every few minutes
- **Search Functionality**: Easy search for stocks and cryptocurrencies
- **Portfolio Summary**: Automatic calculation of current holdings value and net profit based on sample trades
- **CSV Upload**: Upload your trading history to calculate net profits
- **Portfolio Analysis**: Track current holdings and historical performance
- **Modern UI**: Beautiful, responsive dashboard interface

## Tech Stack

- **Frontend**: React with TypeScript, Tailwind CSS, Chart.js
- **Backend**: Node.js with Express
- **Data APIs**: Alpha Vantage (stocks), CoinGecko (crypto)
- **File Processing**: CSV parsing for trading data

## Quick Start

1. **Install dependencies**:
   ```bash
   npm run install-all
   ```

2. **Set up environment variables**:
   - Copy `.env.example` to `.env` in the server directory
   - Add your API keys for Alpha Vantage and CoinGecko

3. **Start development servers**:
   ```bash
   npm run dev
   ```

4. **Access the dashboard**:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:5000

## API Keys Required

- **Alpha Vantage**: For stock market data (free tier available)
- **CoinGecko**: For cryptocurrency data (free tier available)

## Project Structure

```
investment-dashboard/
├── client/                 # React frontend
├── server/                 # Node.js backend
├── package.json           # Root package.json
└── README.md             # This file
```

## Usage

1. **Portfolio Summary**: View your current holdings and profit/loss calculations based on sample trades data
2. **Search for investments**: Use the search bar to find stocks or cryptocurrencies
3. **Add to watchlist**: Click the "+" button to add items to your watchlist
4. **Upload trading data**: Use the CSV upload feature to analyze your trading history
5. **View portfolio**: See your current holdings and profit/loss calculations

## Sample Portfolio Data

The dashboard includes a sample portfolio based on the following trades:
- **AAPL**: 12 shares (10 bought at $150.25, 5 bought at $155.75, 3 sold at $160.50)
- **MSFT**: 12 shares (8 bought at $280.00, 4 bought at $285.50)
- **GOOGL**: 4 shares (6 bought at $140.00, 2 sold at $145.75)
- **TSLA**: 7 shares (12 bought at $180.25, 5 sold at $175.50)
- **BTC**: 0.8 BTC (0.5 bought at $45,000, 0.3 bought at $48,000)
- **ETH**: 1.5 ETH (2.5 bought at $2,800, 1.0 sold at $3,200)
- **ADA**: 700 ADA (1000 bought at $0.45, 300 sold at $0.52)

The portfolio summary shows:
- Total invested amount
- Current market value
- Total profit/loss (realized + unrealized)
- Individual holding performance

## CSV Format

Your trading CSV should include these columns:
- `symbol` (stock/crypto symbol)
- `date` (purchase/sale date)
- `action` (buy/sell)
- `quantity` (number of shares/coins)
- `total amount` (total amount in CAD - all amounts are processed as CAD)
- `type` ('s' for stock or 'c' for crypto)

**Currency Handling**: All CSV amounts are processed as CAD. Current market prices (in USD) are automatically converted to CAD using real-time exchange rates for accurate profit/loss calculations.