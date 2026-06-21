import React, { useState, useEffect } from 'react';
import { useQuery } from 'react-query';
import axios from 'axios';
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
  usdPrice?: number;
  exchangeRate?: number;
}

const HoldingsChartWrapper: React.FC = () => {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [error, setError] = useState<string | null>(null);

  const {
    holdings: cachedHoldings,
    latestPortfolio,
    recurringInvestments,
    isLoading,
    error: cacheError
  } = useCache();

  // Fetch watchlist data to get custom symbols
  const { data: watchlistData } = useQuery(
    'watchlist',
    async () => {
      const response = await axios.get('/api/portfolio/watchlist');
      return response.data.watchlist;
    },
    {
      staleTime: 300000, // 5 minutes
      cacheTime: 900000, // 15 minutes
      retry: 1
    }
  );

  // Fetch cached prices for custom symbols
  const { data: cachedPrices } = useQuery(
    ['cached-prices-for-chart', watchlistData?.custom],
    async () => {
      const customSymbols = watchlistData?.custom || [];
      if (customSymbols.length === 0) return {};

      try {
        const response = await axios.get('/api/portfolio/cache/data');
        return response.data.cache || {};
      } catch (error) {
        console.error('Failed to fetch cached prices:', error);
        return {};
      }
    },
    {
      enabled: (watchlistData?.custom?.length || 0) > 0,
      staleTime: 300000, // 5 minutes
      cacheTime: 900000, // 15 minutes
    }
  );

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
  }, [latestPortfolio, cachedHoldings, recurringInvestments, watchlistData, cachedPrices]);

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
          cacheUsed: !!cachedPrice,
          usdPrice: cachedPrice?.usdPrice || holding.usdPrice || 0,
          exchangeRate: cachedPrice?.exchangeRate || holding.exchangeRate || 1.4
        };
      });

      // Add custom watchlist symbols that aren't already in portfolio
      const customSymbols = watchlistData?.custom || [];
      const prices = cachedPrices || {};
      const portfolioSymbols = new Set(safeHoldings.map((h: Holding) => h.symbol));

      const customHoldings = customSymbols
        .filter((symbol: string) => !portfolioSymbols.has(symbol))
        .map((symbol: string) => {
          const cachedPrice = prices[symbol];
          if (!cachedPrice) return null;

          // Detect if symbol is crypto based on common crypto symbols
          const cryptoSymbols = ['BTC', 'ETH', 'DOGE', 'SOL', 'ADA', 'XRP', 'USDT', 'BNB', 'USDC', 'SHIB', 'AVAX', 'DOT', 'MATIC', 'LTC', 'TRX', 'LINK', 'UNI', 'ATOM', 'XMR', 'ZEC', 'TRUMP'];
          const isCrypto = cryptoSymbols.includes(symbol.toUpperCase());

          return {
            symbol,
            quantity: 0,
            averagePrice: 0,
            totalInvested: 0,
            totalAmountInvested: 0,
            realizedPnL: 0,
            amountSold: 0,
            type: isCrypto ? 'c' : 's',
            currency: 'CAD',
            companyName: cachedPrice.companyName || symbol,
            currentPrice: cachedPrice.cadPrice || cachedPrice.price || 0,
            currentValue: 0,
            unrealizedPnL: 0,
            totalPnL: 0,
            totalPnLPercent: 0,
            cacheUsed: true,
            // Add these for compatibility with HoldingsChart
            usdPrice: cachedPrice.usdPrice || 0,
            exchangeRate: cachedPrice.exchangeRate || 1.4
          } as Holding & { usdPrice?: number; exchangeRate?: number };
        })
        .filter(Boolean) as Holding[];

      // Add recurring investments as holdings
      const recurringHoldings = (recurringInvestments?.investments || [])
        .filter((inv: any) => inv.enabled && inv.totalShares > 0)
        .map((inv: any) => {
          const symbol = inv.symbol;
          const cachedPrice = cachedHoldings[symbol];

          return {
            symbol: symbol,
            quantity: inv.totalShares || 0,
            averagePrice: inv.totalInvested > 0 && inv.totalShares > 0 ? inv.totalInvested / inv.totalShares : 0,
            totalInvested: inv.totalInvested || 0,
            totalAmountInvested: inv.totalInvested || 0,
            realizedPnL: 0,
            amountSold: 0,
            type: 's', // All recurring investments are stocks/ETFs
            currency: 'CAD',
            companyName: inv.name || cachedPrice?.companyName || symbol,
            currentPrice: inv.currentPrice || cachedPrice?.cadPrice || 0,
            currentValue: inv.currentValue || 0,
            unrealizedPnL: inv.profitLoss || 0,
            totalPnL: inv.profitLoss || 0,
            totalPnLPercent: inv.profitLossPercent || 0,
            cacheUsed: !!cachedPrice,
            usdPrice: cachedPrice?.usdPrice || 0,
            exchangeRate: cachedPrice?.exchangeRate || 1.4,
            isRecurring: true // Flag to identify recurring investments
          } as Holding & { usdPrice?: number; exchangeRate?: number; isRecurring?: boolean };
        });

      // Combine portfolio holdings, custom symbols, and recurring investments
      const allHoldings = [...safeHoldings, ...customHoldings, ...recurringHoldings];

      setHoldings(allHoldings);

      console.log(`✅ HoldingsChartWrapper: Portfolio data processing completed successfully (${safeHoldings.length} portfolio + ${customHoldings.length} custom + ${recurringHoldings.length} recurring = ${allHoldings.length} total)`);
    } catch (processingError) {
      console.error('Error processing portfolio data in HoldingsChartWrapper:', processingError);
      setError(`Failed to process portfolio data: ${processingError instanceof Error ? processingError.message : 'Unknown error'}`);
    }
  };

  if (isLoading) {
    return (
      <div style={{ backgroundColor: '#10141c', border: '1px solid #1e2535', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ background: '#10141c', borderBottom: '1px solid #1e2535', padding: '14px 18px' }}>
          <h2 style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase' as const }}>Holdings Analysis</h2>
          <p style={{ fontSize: '11px', color: '#4a5568', marginTop: '2px', fontFamily: "'IBM Plex Mono', monospace" }}>Loading from cache...</p>
        </div>
        <div style={{ padding: '24px', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '128px' }}>
          <div className="loading-spinner"></div>
        </div>
      </div>
    );
  }

  if (cacheError || error) {
    return (
      <div style={{ backgroundColor: '#10141c', border: '1px solid #1e2535', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ background: '#10141c', borderBottom: '1px solid #1e2535', padding: '14px 18px' }}>
          <h2 style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase' as const }}>Holdings Analysis</h2>
          <p style={{ fontSize: '11px', color: '#f87171', marginTop: '2px', fontFamily: "'IBM Plex Mono', monospace" }}>Error loading holdings data</p>
        </div>
        <div style={{ padding: '24px', textAlign: 'center' }}>
          {cacheError && <p style={{ color: '#f87171', fontSize: '12px', marginBottom: '8px', fontFamily: "'IBM Plex Mono', monospace" }}>Cache Error: {cacheError}</p>}
          {error && <p style={{ color: '#f87171', fontSize: '12px', fontFamily: "'IBM Plex Mono', monospace" }}>Processing Error: {error}</p>}
        </div>
      </div>
    );
  }

  return <HoldingsChart holdings={holdings} trades={trades} />;
};

export default HoldingsChartWrapper; 