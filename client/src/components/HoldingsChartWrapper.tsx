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
        totalPnLPercent: holding.totalPnLPercent || null,
        cacheUsed: holding.cacheUsed || false
      }));
      
      setHoldings(safeHoldings);
      
          } catch (err) {
      console.error('Portfolio loading error:', err);
      
      // Try to get cache data as fallback
      try {
        console.log('🔄 Attempting to load cached data as fallback...');
        const cacheResponse = await fetch('/api/portfolio/cache/data');
        if (cacheResponse.ok) {
          const cacheData = await cacheResponse.json();
          console.log('📦 Found cached data:', cacheData);
          
          // Create holdings from cache data with actual prices
          const cachedHoldings: Holding[] = Object.entries(cacheData.cache).map(([symbol, data]: [string, any]) => {
            const isCrypto = symbol === 'BTC' || symbol === 'ETH' || symbol === 'DOGE' || symbol === 'ADA' || symbol === 'SOL';
            
            return {
              symbol: symbol,
              quantity: 1, // Default quantity for display purposes
              averagePrice: 0,
              totalInvested: 0,
              totalAmountInvested: 0,
              realizedPnL: 0,
              amountSold: 0,
              type: isCrypto ? 'c' : 's',
              currency: 'CAD',
              companyName: data.companyName || symbol,
              currentPrice: data.cadPrice || undefined,
              currentValue: data.cadPrice || undefined,
              unrealizedPnL: undefined,
              totalPnL: undefined,
              totalPnLPercent: undefined,
              cacheUsed: true
            };
          });
          
          // Sort by symbol for better organization
          const sortedCachedHoldings = cachedHoldings.sort((a, b) => a.symbol.localeCompare(b.symbol));
          
          setHoldings(sortedCachedHoldings);
          setTrades([]); // No trade data available from cache
          setError('Using cached data - portfolio information may be incomplete');
        } else {
          throw new Error('Cache not available');
        }
      } catch (fallbackError) {
        console.error('Cache fallback failed:', fallbackError);
        setError('Failed to load portfolio data and cache fallback failed');
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