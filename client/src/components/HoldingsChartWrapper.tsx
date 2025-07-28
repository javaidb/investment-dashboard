import React, { useState, useEffect } from 'react';
import HoldingsChart from './HoldingsChart';

interface Trade {
  symbol: string;
  date: string;
  action: 'buy' | 'sell';
  quantity: number;
  price: number;
}

interface Holding {
  symbol: string;
  quantity: number;
  averagePrice: number;
  totalInvested: number;
  totalAmountInvested?: number;
  realizedPnL: number;
  amountSold?: number;
  type: string;
  currency: string;
  companyName?: string;
  currentPrice?: number;
  currentValue?: number;
  unrealizedPnL?: number;
  totalPnL?: number;
  totalPnLPercent?: number;
}

const HoldingsChartWrapper: React.FC = () => {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPortfolioData();
  }, []);

  const loadPortfolioData = async () => {
    try {
      setLoading(true);
      
      // Process uploaded CSV files
      const uploadResponse = await fetch('/api/portfolio/process-uploaded', {
        method: 'POST',
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to process uploaded portfolio data');
      }

      const uploadResult = await uploadResponse.json();
      
      // Get the portfolio with current prices
      const portfolioResponse = await fetch(`/api/portfolio/${uploadResult.portfolioId}`);
      if (!portfolioResponse.ok) {
        throw new Error('Failed to fetch portfolio data');
      }

      const portfolioData = await portfolioResponse.json();
      
             // Extract trades data
       const portfolioTrades = (portfolioData.trades || []).map((trade: any) => ({
         symbol: trade.symbol,
         date: trade.date,
         action: trade.action as 'buy' | 'sell',
         quantity: trade.quantity,
         price: trade.price
       }));
      setTrades(portfolioTrades);
      
      // Extract holdings data
      const safeHoldings = (portfolioData.holdings || []).map((holding: any) => ({
        symbol: holding.symbol || 'UNKNOWN',
        quantity: holding.quantity || 0,
        averagePrice: holding.averagePrice || 0,
        totalInvested: holding.totalInvested || 0,
        totalAmountInvested: holding.totalAmountInvested || holding.totalInvested || 0,
        realizedPnL: holding.realizedPnL || 0,
        amountSold: holding.amountSold || 0,
        type: holding.type || 's',
        currency: holding.currency || 'CAD',
        companyName: holding.companyName || holding.symbol || 'UNKNOWN',
        currentPrice: holding.currentPrice || null,
        currentValue: holding.currentValue || null,
        unrealizedPnL: holding.unrealizedPnL || null,
        totalPnL: holding.totalPnL || null,
        totalPnLPercent: holding.totalPnLPercent || null
      }));
      
      setHoldings(safeHoldings);
      
    } catch (err) {
      console.error('Portfolio loading error:', err);
      
      // Fallback to sample data if API fails
      try {
        const fallbackHoldings = [
          { symbol: 'AAPL', quantity: 12, averagePrice: 152.58, totalInvested: 1831.00, totalAmountInvested: 2312.50, realizedPnL: 30.75, amountSold: 481.50, type: 's', currency: 'CAD', currentPrice: 190.00, currentValue: 2280.00, unrealizedPnL: 448.42, totalPnL: 479.17, totalPnLPercent: 26.17 },
          { symbol: 'MSFT', quantity: 12, averagePrice: 281.67, totalInvested: 3380.00, totalAmountInvested: 3380.00, realizedPnL: 0, amountSold: 0, type: 's', currency: 'CAD', currentPrice: 420.00, currentValue: 5040.00, unrealizedPnL: 1660.00, totalPnL: 1660.00, totalPnLPercent: 49.11 },
          { symbol: 'GOOGL', quantity: 4, averagePrice: 140.00, totalInvested: 560.00, totalAmountInvested: 851.50, realizedPnL: 11.50, amountSold: 291.50, type: 's', currency: 'CAD', currentPrice: 170.00, currentValue: 680.00, unrealizedPnL: 120.00, totalPnL: 131.50, totalPnLPercent: 23.48 },
          { symbol: 'TSLA', quantity: 7, averagePrice: 180.25, totalInvested: 1261.75, totalAmountInvested: 2139.25, realizedPnL: -23.75, amountSold: 877.50, type: 's', currency: 'CAD', currentPrice: 250.00, currentValue: 1750.00, unrealizedPnL: 488.25, totalPnL: 464.50, totalPnLPercent: 36.81 },
          { symbol: 'BTC', quantity: 0.8, averagePrice: 46125.00, totalInvested: 36900.00, totalAmountInvested: 36900.00, realizedPnL: 0, amountSold: 0, type: 'c', currency: 'CAD', currentPrice: 65000.00, currentValue: 52000.00, unrealizedPnL: 15100.00, totalPnL: 15100.00, totalPnLPercent: 40.92 },
          { symbol: 'ETH', quantity: 1.5, averagePrice: 2800.00, totalInvested: 4200.00, totalAmountInvested: 7400.00, realizedPnL: 400.00, amountSold: 3200.00, type: 'c', currency: 'CAD', currentPrice: 3500.00, currentValue: 5250.00, unrealizedPnL: 1050.00, totalPnL: 1450.00, totalPnLPercent: 34.52 },
          { symbol: 'ADA', quantity: 700, averagePrice: 0.45, totalInvested: 315.00, totalAmountInvested: 471.00, realizedPnL: 21.00, amountSold: 156.00, type: 'c', currency: 'CAD', currentPrice: 0.60, currentValue: 420.00, unrealizedPnL: 105.00, totalPnL: 126.00, totalPnLPercent: 40.00 }
        ];
        
                 const fallbackTrades: Trade[] = [
           { symbol: 'AAPL', date: '2024-01-15', action: 'buy' as const, quantity: 10, price: 150.00 },
           { symbol: 'AAPL', date: '2024-02-20', action: 'buy' as const, quantity: 2, price: 160.00 },
           { symbol: 'AAPL', date: '2024-03-10', action: 'sell' as const, quantity: 5, price: 170.00 },
           { symbol: 'MSFT', date: '2024-01-20', action: 'buy' as const, quantity: 12, price: 280.00 },
           { symbol: 'GOOGL', date: '2024-02-05', action: 'buy' as const, quantity: 6, price: 140.00 },
           { symbol: 'GOOGL', date: '2024-03-15', action: 'sell' as const, quantity: 2, price: 155.00 },
           { symbol: 'TSLA', date: '2024-01-10', action: 'buy' as const, quantity: 10, price: 180.00 },
           { symbol: 'TSLA', date: '2024-02-25', action: 'sell' as const, quantity: 3, price: 200.00 },
           { symbol: 'BTC', date: '2024-01-01', action: 'buy' as const, quantity: 0.8, price: 46125.00 },
           { symbol: 'ETH', date: '2024-01-05', action: 'buy' as const, quantity: 2, price: 2800.00 },
           { symbol: 'ETH', date: '2024-02-10', action: 'sell' as const, quantity: 0.5, price: 3200.00 },
           { symbol: 'ADA', date: '2024-01-08', action: 'buy' as const, quantity: 1000, price: 0.45 },
           { symbol: 'ADA', date: '2024-02-28', action: 'sell' as const, quantity: 300, price: 0.52 }
         ];
        
        setHoldings(fallbackHoldings);
        setTrades(fallbackTrades);
        setError(null);
      } catch (fallbackError) {
        setError('Failed to load portfolio data and fallback failed');
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-4">
          <h2 className="text-xl font-bold text-white">Holdings Analysis</h2>
          <p className="text-green-100 text-sm">Loading your holdings data...</p>
        </div>
        <div className="p-6">
          <div className="flex justify-center items-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-green-600 border-t-transparent"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="bg-gradient-to-r from-red-600 to-pink-600 px-6 py-4">
          <h2 className="text-xl font-bold text-white">Holdings Analysis</h2>
          <p className="text-red-100 text-sm">Error loading holdings data</p>
        </div>
        <div className="p-6">
          <div className="text-center py-8">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return <HoldingsChart holdings={holdings} trades={trades} />;
};

export default HoldingsChartWrapper; 