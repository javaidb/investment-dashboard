# Investment Dashboard Setup Guide

## Prerequisites

Before setting up the investment dashboard, you'll need to install:

1. **Node.js** (version 16 or higher)
   - Download from: https://nodejs.org/
   - This will also install npm (Node Package Manager)

2. **Git** (if not already installed)
   - Download from: https://git-scm.com/

## Installation Steps

### 1. Install Dependencies

Open a terminal/command prompt in the project directory and run:

```bash
# Install root dependencies
npm install

# Install backend dependencies
cd server
npm install

# Install frontend dependencies
cd ../client
npm install

# Return to root directory
cd ..
```

### 2. Set Up Environment Variables

1. Copy the environment example file:
   ```bash
   cd server
   copy env.example .env
   ```

2. Edit the `.env` file and add your API keys:
   ```
   # Server Configuration
   PORT=5000
   NODE_ENV=development

   # API Keys (Get these from the respective services)
   ALPHA_VANTAGE_API_KEY=your_alpha_vantage_api_key_here
   COINGECKO_API_KEY=your_coingecko_api_key_here

   # Rate Limiting
   RATE_LIMIT_WINDOW_MS=900000
   RATE_LIMIT_MAX_REQUESTS=100

   # Data Refresh Intervals (in minutes)
   STOCK_REFRESH_INTERVAL=5
   CRYPTO_REFRESH_INTERVAL=2
   ```

### 3. Get API Keys

#### Alpha Vantage (Stocks)
1. Go to https://www.alphavantage.co/
2. Sign up for a free account
3. Get your API key from the dashboard
4. Add it to the `.env` file

#### CoinGecko (Cryptocurrencies)
1. Go to https://www.coingecko.com/en/api
2. Sign up for a free account
3. Get your API key from the dashboard
4. Add it to the `.env` file

### 4. Start the Application

#### Development Mode (Recommended)
```bash
# Start both backend and frontend simultaneously
npm run dev
```

#### Or start them separately:
```bash
# Terminal 1 - Start backend
npm run server

# Terminal 2 - Start frontend
npm run client
```

### 5. Access the Dashboard

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000
- **API Health Check**: http://localhost:5000/api/health

## Features

### Dashboard Overview
- Real-time stock and crypto prices
- Trending investments
- Portfolio summary statistics
- Quick action buttons

### Search Functionality
- Search for stocks and cryptocurrencies
- Real-time price data
- Detailed investment information
- Filter by type (stock/crypto)

### Portfolio Management
- Upload CSV files with trading history
- Automatic profit/loss calculations
- Current holdings analysis
- Real-time portfolio value updates

## CSV Format

Your trading CSV should include these columns:
- `symbol` - Stock/crypto symbol (e.g., AAPL, BTC)
- `date` - Transaction date (YYYY-MM-DD)
- `action` - buy or sell
- `quantity` - Number of shares/coins
- `price` - Price per share/coin

Example:
```csv
symbol,date,action,quantity,price
AAPL,2024-01-15,buy,10,150.25
AAPL,2024-02-20,sell,5,155.75
BTC,2024-01-10,buy,0.5,45000.00
```

## Troubleshooting

### Common Issues

1. **Port already in use**
   - Change the PORT in server/.env file
   - Or kill the process using the port

2. **API key errors**
   - Verify your API keys are correct
   - Check if you've exceeded free tier limits

3. **CORS errors**
   - Ensure the frontend is running on localhost:3000
   - Check the CORS configuration in server/index.js

4. **Module not found errors**
   - Run `npm install` in both server and client directories
   - Clear node_modules and reinstall if needed

### Development Tips

1. **Backend Development**
   - Server runs on port 5000
   - API endpoints are prefixed with `/api`
   - Check server logs for debugging

2. **Frontend Development**
   - React app runs on port 3000
   - Hot reload enabled for development
   - Check browser console for errors

3. **Data Refresh**
   - Stock data refreshes every 5 minutes
   - Crypto data refreshes every 2 minutes
   - Manual refresh available in the UI

## Production Deployment

For production deployment:

1. Build the frontend:
   ```bash
   cd client
   npm run build
   ```

2. Set NODE_ENV=production in server/.env

3. Deploy the server directory to your hosting platform

4. The server will serve the built React app automatically

## API Endpoints

### Stocks
- `GET /api/stocks/quote/:symbol` - Get stock quote
- `GET /api/stocks/search/:query` - Search stocks
- `POST /api/stocks/quotes` - Get multiple quotes

### Cryptocurrencies
- `GET /api/crypto/price/:id` - Get crypto price
- `GET /api/crypto/search/:query` - Search crypto
- `GET /api/crypto/trending` - Get trending crypto
- `POST /api/crypto/prices` - Get multiple prices

### Portfolio
- `POST /api/portfolio/upload` - Upload CSV file
- `GET /api/portfolio` - Get all portfolios
- `GET /api/portfolio/:id` - Get specific portfolio
- `DELETE /api/portfolio/:id` - Delete portfolio

### Search
- `GET /api/search/:query` - Search both stocks and crypto
- `GET /api/search/trending/all` - Get trending items
- `GET /api/search/details/:symbol` - Get detailed info

## Support

If you encounter any issues:

1. Check the console logs for error messages
2. Verify all dependencies are installed
3. Ensure API keys are valid and have sufficient quota
4. Check that all required ports are available

## License

This project is licensed under the MIT License. 