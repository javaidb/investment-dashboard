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
  cacheUsed?: boolean;
}

const HoldingsChartWrapper: React.FC = () => {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadPortfolioData = async () => {
      try {
        setLoading(true);
        setError(null);
        
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
        
        // Set holdings and trades
        setHoldings(portfolioData.holdings || []);
        setTrades(portfolioData.trades || []);
      } catch (err: any) {
        console.error('Error loading portfolio:', err);
        setError(err.message || 'Failed to load portfolio data');
        setHoldings([]);
        setTrades([]);
      } finally {
        setLoading(false);
      }
    };

    loadPortfolioData();
  }, []);

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