# Investment Dashboard

A comprehensive web dashboard for tracking stocks and cryptocurrency investments with live data, search functionality, and profit analysis.

## Features

- **Live Data Tracking**: Real-time stock and crypto prices updated every few minutes
- **Search Functionality**: Easy search for stocks and cryptocurrencies
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

1. **Search for investments**: Use the search bar to find stocks or cryptocurrencies
2. **Add to watchlist**: Click the "+" button to add items to your watchlist
3. **Upload trading data**: Use the CSV upload feature to analyze your trading history
4. **View portfolio**: See your current holdings and profit/loss calculations

## CSV Format

Your trading CSV should include these columns:
- `symbol` (stock/crypto symbol)
- `date` (purchase/sale date)
- `action` (buy/sell)
- `quantity` (number of shares/coins)
- `price` (price per share/coin)