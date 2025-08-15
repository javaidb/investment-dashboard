import React, { useState, useEffect } from 'react';
import { useCache } from '../contexts/CacheContext';
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
  const [error, setError] = useState<string | null>(null);
  
  const { 
    holdings: cachedHoldings, 
    latestPortfolio, 
    isLoading,
    error: cacheError
  } = useCache();

  console.log('🔍 HoldingsChartWrapper component rendered from cache context');

  useEffect(() => {
    if (!latestPortfolio || !cachedHoldings || Object.keys(cachedHoldings).length === 0) {
      console.log('⏳ HoldingsChartWrapper: Waiting for cache data...');
      return;
    }

    console.log('📦 HoldingsChartWrapper: Processing portfolio data from cache context');
    setError(null); // Clear any previous errors
    processPortfolioData();
    // eslint-disable-next-line
  }, [latestPortfolio, cachedHoldings]);

  const processPortfolioData = () => {
    try {
      console.log('📦 HoldingsChartWrapper: Processing portfolio data from cache context');
      console.log('📦 Portfolio structure:', {
        hasHoldings: !!latestPortfolio.holdings,
        hasTrades: !!latestPortfolio.trades,
        holdingsLength: latestPortfolio.holdings?.length || 0,
        tradesLength: latestPortfolio.trades?.length || 0
      });
      
      // Check if we have detailed portfolio data or just summary
      if (!latestPortfolio.holdings || !Array.isArray(latestPortfolio.holdings)) {
        console.warn('⚠️ HoldingsChartWrapper: No holdings array found in portfolio data');
        setError('Portfolio holdings data not available');
        return;
      }
      
      // Extract trades data from portfolio
      const portfolioTrades = (latestPortfolio.trades || []).map((trade: any) => ({
        symbol: trade.symbol,
        date: trade.date,
        action: trade.action,
        quantity: trade.quantity,
        price: trade.price
      }));
      setTrades(portfolioTrades);
      
      // Merge portfolio holdings with current cached prices
      const safeHoldings = (latestPortfolio.holdings || []).map((holding: any) => {
        const symbol = holding.symbol;
        const cachedPrice = cachedHoldings[symbol];
        
        // Calculate current values using cached prices
        const currentPrice = cachedPrice?.cadPrice || cachedPrice?.price || null;
        const currentValue = currentPrice ? (holding.quantity || 0) * currentPrice : null;
        const unrealizedPnL = currentValue && holding.totalInvested ? 
          currentValue - holding.totalInvested : null;
        const totalPnL = unrealizedPnL !== null ? 
          unrealizedPnL + (holding.realizedPnL || 0) : (holding.realizedPnL || 0);
        const totalPnLPercent = holding.totalInvested > 0 ? 
          (totalPnL / holding.totalInvested) * 100 : 0;
        
        return {
          symbol: symbol || 'UNKNOWN',
          quantity: holding.quantity || 0,
          averagePrice: holding.averagePrice || 0,
          totalInvested: holding.totalInvested || 0,
          totalAmountInvested: holding.totalAmountInvested || holding.totalInvested || 0,
          realizedPnL: holding.realizedPnL || 0,
          amountSold: holding.amountSold || 0,
          type: holding.type || 's',
          currency: holding.currency || 'CAD',
          companyName: cachedPrice?.companyName || holding.companyName || symbol || 'UNKNOWN',
          currentPrice: currentPrice,
          currentValue: currentValue,
          unrealizedPnL: unrealizedPnL,
          totalPnL: totalPnL,
          totalPnLPercent: totalPnLPercent,
          cacheUsed: !!cachedPrice
        };
      });
      
      setHoldings(safeHoldings);
      
      console.log('✅ HoldingsChartWrapper: Portfolio data processing completed successfully');
    } catch (processingError) {
      console.error('Error processing portfolio data in HoldingsChartWrapper:', processingError);
      setError(`Failed to process portfolio data: ${processingError instanceof Error ? processingError.message : 'Unknown error'}`);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-4">
          <h2 className="text-xl font-bold text-white">Holdings Analysis (Stocks & Crypto)</h2>
          <p className="text-green-100 text-sm">Loading your holdings data from cache...</p>
        </div>
        <div className="p-6">
          <div className="flex justify-center items-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-green-600 border-t-transparent"></div>
          </div>
        </div>
      </div>
    );
  }

  if (cacheError || error) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="bg-gradient-to-r from-red-600 to-pink-600 px-6 py-4">
          <h2 className="text-xl font-bold text-white">Holdings Analysis (Stocks & Crypto)</h2>
          <p className="text-red-100 text-sm">Error loading holdings data</p>
        </div>
        <div className="p-6">
          <div className="text-center py-8">
            {cacheError && <p className="text-red-600 text-sm mb-2">Cache Error: {cacheError}</p>}
            {error && <p className="text-red-600 text-sm">Processing Error: {error}</p>}
          </div>
        </div>
      </div>
    );
  }

  return <HoldingsChart holdings={holdings} trades={trades} />;
};

export default HoldingsChartWrapper; 