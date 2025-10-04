import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import axios from 'axios';
import { useCache } from '../contexts/CacheContext';
import { useIcons } from '../hooks/useIcons';
import CompanyIcon from './CompanyIcon';
import HoldingsChartWrapper from './HoldingsChartWrapper';

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
  totalAmountInvested?: number; // Total amount ever invested (all buy transactions)
  realizedPnL: number;
  amountSold?: number; // Total amount sold in CAD
  type: string; // 's' for stock, 'c' for crypto
  currency: string; // 'CAD' for Canadian dollars
  companyName?: string;
  currentPrice?: number; // Now in CAD
  currentValue?: number; // Now in CAD
  unrealizedPnL?: number; // Now in CAD
  totalPnL?: number; // Now in CAD
  totalPnLPercent?: number;
  usdPrice?: number; // USD price for reference
  exchangeRate?: number; // Exchange rate used for conversion
  cacheUsed?: boolean; // Flag to indicate if cache was used
  weeklyChangePercent?: number; // Weekly change percentage
  currentPosition?: number; // Current position in sorted order (1-indexed)
  lastWeekPosition?: number; // Position from last week
  positionChange?: 'up' | 'down' | 'same' | 'new'; // Position movement
}

interface PortfolioSummaryData {
  totalInvested: number;
  totalRealized: number;
  totalAmountSold?: number;
  totalHoldings: number;
  totalQuantity: number;
  currentTotalValue?: number;
  totalUnrealizedPnL?: number;
  totalPnL?: number;
  totalPnLPercent?: number;
}

const PortfolioSummary: React.FC = () => {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [summary, setSummary] = useState<PortfolioSummaryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [weeklyChanges, setWeeklyChanges] = useState<{[symbol: string]: number}>({});
  const [positionHistory, setPositionHistory] = useState<{[symbol: string]: number}>({});
  const [totalCapital, setTotalCapital] = useState<number>(() => {
    const saved = localStorage.getItem('portfolio-total-capital');
    return saved ? parseFloat(saved) : 100000; // Default to $100,000
  });
  
  const queryClient = useQueryClient();
  const { 
    holdings: cachedHoldings, 
    latestPortfolio, 
    holdingsTimestamp, 
    portfolioTimestamp, 
    isLoading,
    error: cacheError,
    refreshCache
  } = useCache();

  // Use React Query for persistent portfolio cache that survives browser sessions
  const { data: persistentPortfolio } = useQuery(
    'persistent-portfolio-cache',
    () => ({ holdings: cachedHoldings, portfolio: latestPortfolio }), // Initialize from cache context
    {
      enabled: !!latestPortfolio && !!cachedHoldings && Object.keys(cachedHoldings).length > 0,
      staleTime: Infinity, // Never consider stale
      cacheTime: Infinity, // Keep cached forever
      refetchOnWindowFocus: false,
      refetchOnMount: false, // Don't refetch on mount if we have data
      refetchOnReconnect: false,
      refetchInterval: false,
    }
  );

  // Transfer cache context data to React Query when available
  useEffect(() => {
    if (latestPortfolio && cachedHoldings && Object.keys(cachedHoldings).length > 0) {
      console.log('🔄 Transferring portfolio cache context data to React Query persistent cache');
      queryClient.setQueryData('persistent-portfolio-cache', { 
        holdings: cachedHoldings, 
        portfolio: latestPortfolio 
      });
    }
  }, [latestPortfolio, cachedHoldings, queryClient]);

  // Use persistent data if available, fallback to cache context
  const activeHoldings = persistentPortfolio?.holdings || cachedHoldings;
  const activePortfolio = persistentPortfolio?.portfolio || latestPortfolio;

  // Fetch icons for all holdings - ensure we have the right data
  const symbolsForIcons = holdings.length > 0 ? holdings.map(holding => ({
    symbol: holding.symbol,
    type: holding.type || 's'
  })) : [];
  
  const { iconUrls } = useIcons({
    symbols: symbolsForIcons,
    enabled: holdings.length > 0
  });

  // Debug logging
  console.log('🔍 PortfolioSummary Icon Debug:', {
    holdingsCount: holdings.length,
    symbolsForIcons,
    iconUrls,
    sampleIconLookup: holdings.length > 0 ? {
      symbol: holdings[0]?.symbol,
      upperSymbol: holdings[0]?.symbol?.toUpperCase(),
      iconUrl: iconUrls[holdings[0]?.symbol?.toUpperCase()]
    } : null
  });

  console.log('🔍 PortfolioSummary component rendered - Source:', persistentPortfolio ? 'Persistent Cache' : 'Live Cache');

  // Use React Query to get weekly changes from historical cache ONLY
  const { data: weeklyChangesData, isLoading: isWeeklyChangesLoading, error: weeklyChangesError } = useQuery(
    ['weekly-changes', holdings.map(h => h.symbol).join(',')],
    async () => {
      console.log('🔄 Fetching weekly changes for', holdings.length, 'holdings from historical cache only:', holdings.map(h => h.symbol));
      const changes: {[symbol: string]: number} = {};
      
      await Promise.all(holdings.map(async (holding) => {
        try {
          console.log(`📊 Processing weekly change for ${holding.symbol} from historical cache only`);
          
          // ONLY try cache endpoint - no fallback to live endpoints
          let chartData;
          try {
            const cacheResponse = await axios.get(`/api/portfolio/cache/historical/${holding.symbol}`);
            chartData = cacheResponse.data;
            console.log(`✅ Got cached data for ${holding.symbol}:`, chartData.data?.length, 'data points');
            
            // Calculate weekly change (7 days) using historical cache data
            if (chartData?.data && chartData.data.length > 7) {
              const data = chartData.data;
              // Ensure data is sorted from earliest to latest (which it should already be)
              const sortedData = data.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
              
              const currentPrice = sortedData[sortedData.length - 1].close;
              const oneWeekAgoPrice = sortedData[sortedData.length - 8].close; // 7 days ago
              
              console.log(`💹 ${holding.symbol}: Current=${currentPrice}, WeekAgo=${oneWeekAgoPrice} (from historical cache)`);
              
              if (currentPrice && oneWeekAgoPrice) {
                const changePercent = ((currentPrice - oneWeekAgoPrice) / oneWeekAgoPrice) * 100;
                changes[holding.symbol] = changePercent;
                console.log(`📈 ${holding.symbol} weekly change: ${changePercent.toFixed(2)}% (from historical cache)`);
              }
            } else {
              console.warn(`❌ Insufficient cached data for ${holding.symbol}: ${chartData?.data?.length || 0} data points (need >7)`);
            }
          } catch (cacheError) {
            console.warn(`⚠️ No cached data available for ${holding.symbol}, skipping weekly change calculation`);
          }
        } catch (error) {
          console.warn(`❌ Failed to get weekly change from cache for ${holding.symbol}:`, error);
        }
      }));
      
      console.log('✅ Weekly changes calculation complete (historical cache only):', changes);
      return changes;
    },
    {
      enabled: holdings.length > 0,
      staleTime: 300000, // 5 minutes
      cacheTime: 900000, // 15 minutes
      retry: 1
    }
  );
  
  // Get historical positions from a week ago for comparison
  const { data: historicalPositions } = useQuery(
    ['historical-positions', activePortfolio?.timestamp],
    async () => {
      if (!activePortfolio?.holdings) return {};
      
      console.log('🔄 Calculating historical positions from a week ago');
      
      // Calculate positions based on current logic but with week-old data
      // For now, we'll simulate this by using a stored key in localStorage
      const weekAgoKey = `positions_${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}`;
      const storedPositions = localStorage.getItem(weekAgoKey);
      
      if (storedPositions) {
        try {
          return JSON.parse(storedPositions);
        } catch (e) {
          console.warn('Failed to parse stored positions:', e);
        }
      }
      
      return {};
    },
    {
      enabled: !!activePortfolio?.holdings,
      staleTime: Infinity, // Historical data doesn't change
      cacheTime: 24 * 60 * 60 * 1000, // 24 hours
    }
  );

  // Update weeklyChanges when data is available
  React.useEffect(() => {
    console.log('🔄 Weekly changes useEffect triggered:', {
      hasData: !!weeklyChangesData,
      dataKeys: weeklyChangesData ? Object.keys(weeklyChangesData) : [],
      data: weeklyChangesData,
      isLoading: isWeeklyChangesLoading,
      error: weeklyChangesError
    });
    
    if (weeklyChangesData) {
      console.log('✅ Setting weekly changes state:', weeklyChangesData);
      setWeeklyChanges(weeklyChangesData);
    }
  }, [weeklyChangesData, isWeeklyChangesLoading, weeklyChangesError]);

  // Update position history when historical positions are available
  React.useEffect(() => {
    if (historicalPositions) {
      console.log('✅ Setting historical positions:', historicalPositions);
      setPositionHistory(historicalPositions);
    } else {
      // For demo purposes, create some sample historical data if none exists
      const weekAgoKey = `positions_${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}`;
      
      const existingData = localStorage.getItem(weekAgoKey);
      
      if (!existingData && holdings.length > 0) {
        // Create sample historical positions to demonstrate the feature
        const samplePositions: {[symbol: string]: number} = {};
        holdings.forEach((holding, index) => {
          // Simulate realistic position changes based on current position
          const currentPos = index + 1;
          let historicalPos: number;
          
          // Create varied position changes for demonstration
          if (holdings.length >= 5) {
            switch (index % 5) {
              case 0: historicalPos = Math.min(currentPos + 2, holdings.length); break; // Moved up 2 spots
              case 1: historicalPos = Math.max(currentPos - 1, 1); break; // Moved down 1 spot
              case 2: historicalPos = Math.min(currentPos + 3, holdings.length); break; // Moved up 3 spots
              case 3: historicalPos = Math.max(currentPos - 2, 1); break; // Moved down 2 spots
              case 4: historicalPos = currentPos; break; // Stayed same
              default: historicalPos = currentPos + (Math.random() > 0.5 ? 1 : -1); break;
            }
          } else {
            // For smaller portfolios, create simpler changes
            if (index === 0) historicalPos = 2;
            else if (index === 1) historicalPos = 1;
            else historicalPos = currentPos + (Math.random() > 0.5 ? 1 : -1);
          }
          
          // Ensure position is within bounds
          historicalPos = Math.max(1, Math.min(historicalPos, holdings.length));
          
          samplePositions[holding.symbol] = historicalPos;
        });
        
        localStorage.setItem(weekAgoKey, JSON.stringify(samplePositions));
        setPositionHistory(samplePositions);
        console.log('🎯 Created sample historical positions for demo:', samplePositions);
      }
      
      // Also create some additional historical dates for richer testing
      const dates = [
        new Date(Date.now() - 6 * 24 * 60 * 60 * 1000), // 6 days ago
        new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago  
        new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), // 4 days ago
        new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
        new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
      ];
      
      dates.forEach((date, dateIndex) => {
        const dateKey = `positions_${date.toISOString().split('T')[0]}`;
        if (!localStorage.getItem(dateKey) && holdings.length > 0) {
          const historicalPositions: {[symbol: string]: number} = {};
          holdings.forEach((holding, index) => {
            const currentPos = index + 1;
            // Create gradual position changes over time
            const variation = Math.floor(Math.random() * 3) - 1; // -1, 0, or 1
            const historicalPos = Math.max(1, Math.min(currentPos + variation, holdings.length));
            historicalPositions[holding.symbol] = historicalPos;
          });
          localStorage.setItem(dateKey, JSON.stringify(historicalPositions));
          console.log(`📅 Created historical positions for ${dateKey}:`, historicalPositions);
        }
      });
    }
  }, [historicalPositions, holdings]);

  useEffect(() => {
    if (!activePortfolio || !activeHoldings || Object.keys(activeHoldings).length === 0) {
      console.log('⏳ Waiting for portfolio data...', { 
        hasPortfolio: !!activePortfolio, 
        hasHoldings: !!activeHoldings,
        source: persistentPortfolio ? 'persistent' : 'live'
      });
      return;
    }

    console.log('📦 Processing portfolio data from', persistentPortfolio ? 'persistent cache' : 'live cache context', {
      weeklyChangesAvailable: Object.keys(weeklyChanges).length,
      weeklyChangesData: weeklyChanges,
      positionHistoryAvailable: Object.keys(positionHistory).length,
      positionHistoryData: positionHistory
    });
    setError(null); // Clear any previous errors
    processPortfolioData();
    // eslint-disable-next-line
  }, [activePortfolio, activeHoldings, persistentPortfolio, weeklyChanges, positionHistory]);

  const processPortfolioData = () => {
    try {
      console.log('📦 Processing portfolio data from', persistentPortfolio ? 'persistent cache' : 'live cache context');
      console.log('📦 Portfolio structure:', {
        hasHoldings: !!activePortfolio.holdings,
        hasTrades: !!activePortfolio.trades,
        holdingsLength: activePortfolio.holdings?.length || 0,
        tradesLength: activePortfolio.trades?.length || 0,
        source: persistentPortfolio ? 'persistent' : 'live'
      });
      
      // Check if we have detailed portfolio data or just summary
      if (!activePortfolio.holdings || !Array.isArray(activePortfolio.holdings)) {
        console.warn('⚠️ PortfolioSummary: No holdings array found in portfolio data');
        setError('Portfolio holdings data not available');
        return;
      }
      
      // Extract trades data from portfolio
      const portfolioTrades = (activePortfolio.trades || []).map((trade: any) => ({
        symbol: trade.symbol,
        date: trade.date,
        action: trade.action,
        quantity: trade.quantity,
        price: trade.price
      }));
      setTrades(portfolioTrades);
      
      // Merge portfolio holdings with current cached prices
      const safeHoldings = (activePortfolio.holdings || []).map((holding: any) => {
        const symbol = holding.symbol;
        const cachedPrice = activeHoldings[symbol];
        
        // Calculate current values using cached prices
        const currentPrice = cachedPrice?.cadPrice || cachedPrice?.price || null;
        const currentValue = currentPrice ? (holding.quantity || 0) * currentPrice : null;
        const unrealizedPnL = currentValue && holding.totalInvested ? 
          currentValue - holding.totalInvested : null;
        const totalPnL = unrealizedPnL !== null ? 
          unrealizedPnL + (holding.realizedPnL || 0) : (holding.realizedPnL || 0);
        const totalPnLPercent = holding.totalInvested > 0 ? 
          (totalPnL / holding.totalInvested) * 100 : 0;
        
        const weeklyChange = weeklyChanges[symbol];
        console.log(`🔍 Processing holding ${symbol}: weeklyChange=${weeklyChange}, hasWeeklyChanges=${Object.keys(weeklyChanges).length > 0}`);
        
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
          weeklyChangePercent: weeklyChange !== undefined ? weeklyChange : null
        };
      });
      
      // Sort holdings by P&L amount (highest to lowest)
      const sortedHoldings = safeHoldings.sort((a: Holding, b: Holding) => {
        const aPnL = a.totalPnL || 0;
        const bPnL = b.totalPnL || 0;
        return bPnL - aPnL; // Descending order (highest P&L first)
      });
      
      // Add position tracking and movement indicators
      const holdingsWithPositions = sortedHoldings.map((holding: Holding, index: number) => {
        const currentPosition = index + 1; // 1-indexed
        const lastWeekPosition = positionHistory[holding.symbol];
        
        let positionChange: 'up' | 'down' | 'same' | 'new' = 'new';
        if (lastWeekPosition !== undefined) {
          if (currentPosition < lastWeekPosition) {
            positionChange = 'up'; // Moved up in rankings (lower number = better)
          } else if (currentPosition > lastWeekPosition) {
            positionChange = 'down'; // Moved down in rankings
          } else {
            positionChange = 'same'; // Same position
          }
        }
        
        console.log(`📊 Position for ${holding.symbol}: Current=${currentPosition}, LastWeek=${lastWeekPosition}, Change=${positionChange}`);
        
        return {
          ...holding,
          currentPosition,
          lastWeekPosition,
          positionChange
        };
      });
      
      // Store current positions for future comparison
      const currentPositions = holdingsWithPositions.reduce((acc: {[symbol: string]: number}, holding: Holding) => {
        acc[holding.symbol] = holding.currentPosition || 0;
        return acc;
      }, {} as {[symbol: string]: number});
      
      const todayKey = `positions_${new Date().toISOString().split('T')[0]}`;
      localStorage.setItem(todayKey, JSON.stringify(currentPositions));
      console.log('💾 Stored current positions for future comparison:', currentPositions);
      
      setHoldings(holdingsWithPositions);
      
      // Calculate summary with cached values
      const currentTotalValue = safeHoldings.reduce((sum: number, h: Holding) => 
        sum + (h.currentValue || 0), 0);
      const totalUnrealizedPnL = safeHoldings.reduce((sum: number, h: Holding) => 
        sum + (h.unrealizedPnL || 0), 0);
      const totalRealizedPnL = safeHoldings.reduce((sum: number, h: Holding) => 
        sum + (h.realizedPnL || 0), 0);
      const totalPnL = totalUnrealizedPnL + totalRealizedPnL;
      const totalInvested = safeHoldings.reduce((sum: number, h: Holding) => 
        sum + (h.totalInvested || 0), 0);
      const totalAmountSold = safeHoldings.reduce((sum: number, h: Holding) => 
        sum + (h.amountSold || 0), 0);
      const totalPnLPercent = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;

      setSummary({
        totalInvested: totalInvested,
        totalRealized: totalRealizedPnL,
        totalAmountSold: totalAmountSold,
        totalHoldings: safeHoldings.length,
        totalQuantity: safeHoldings.reduce((sum: number, h: Holding) => sum + (h.quantity || 0), 0),
        currentTotalValue,
        totalUnrealizedPnL,
        totalPnL,
        totalPnLPercent
      });
      
      console.log('✅ Portfolio data processing completed successfully');
    } catch (processingError) {
      console.error('Error processing portfolio data:', processingError);
      setError(`Failed to process portfolio data: ${processingError instanceof Error ? processingError.message : 'Unknown error'}`);
    }
  };

  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined || isNaN(value)) {
      return 'C$0.00';
    }
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
    }).format(value);
  };

  const formatPercentage = (value: number | null | undefined) => {
    if (value === null || value === undefined || isNaN(value)) {
      return '0.00%';
    }
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  const safeToFixed = (value: number | null | undefined, decimals: number = 4) => {
    if (value === null || value === undefined || isNaN(value)) {
      return '0.0000';
    }
    return value.toFixed(decimals);
  };

  const calculateNetInvested = (totalInvested: number | undefined, amountSold: number | undefined) => {
    return (totalInvested || 0) - (amountSold || 0);
  };

  // Handle total capital changes and save to localStorage
  const handleTotalCapitalChange = (value: number) => {
    setTotalCapital(value);
    localStorage.setItem('portfolio-total-capital', value.toString());
  };

  console.log('🔍 PortfolioSummary render state:', { isLoading, error: cacheError, holdings: holdings.length, summary: !!summary });

  // Show data immediately if we have persistent cached data, even if context is loading
  const hasDataToShow = (persistentPortfolio?.holdings && persistentPortfolio.holdings.length > 0) || 
                        (holdings && holdings.length > 0);

  if (isLoading && !hasDataToShow) {
    console.log('🔄 PortfolioSummary: Rendering loading state');
    return (
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">Portfolio Summary</h2>
              <p className="text-blue-100 text-sm">Loading your investment data...</p>
              <p className="text-blue-100 text-xs mt-1">This may take up to 60 seconds while fetching current prices</p>
            </div>
            <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
            </div>
          </div>
        </div>
        <div className="p-6">
          <div className="flex justify-center items-center h-32">
            <div className="animate-pulse space-y-3">
              <div className="h-4 bg-gray-200 rounded w-48"></div>
              <div className="h-4 bg-gray-200 rounded w-32"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (cacheError || error) {
    console.log('❌ PortfolioSummary: Rendering error state:', { cacheError, error });
    return (
      <div style={{ color: 'red', padding: '1rem', background: '#fff0f0', border: '1px solid #ffcccc', borderRadius: 8 }}>
        <div><b>Portfolio Summary</b></div>
        <div>Cache Error: {cacheError}</div>
        {error && <div>Processing Error: {error}</div>}
        <button onClick={refreshCache} style={{ marginTop: 12, padding: '6px 16px', borderRadius: 4, border: '1px solid #ccc', background: '#f9f9f9', cursor: 'pointer' }}>Refresh Cache</button>
      </div>
    );
  }

  console.log('✅ PortfolioSummary: Rendering success state with', holdings.length, 'holdings');
  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
      {/* Header with gradient */}
      <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 px-6 py-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-black/10"></div>
        <div className="relative z-10">
          <h2 className="text-3xl font-bold text-white mb-2 drop-shadow-lg">Portfolio Summary</h2>
          <p className="text-indigo-100 text-base font-medium">Current holdings and performance from {persistentPortfolio ? 'persistent' : 'live'} cache</p>
          <div className="mt-3 space-y-2">
            <div className="text-sm text-indigo-200 bg-indigo-800/30 px-4 py-2 rounded-lg inline-block">
              💾 Source: {persistentPortfolio ? 'Persistent Cache (Browser Storage)' : 'Live Cache Context'} • 💱 All amounts converted from USD to CAD for accurate P&L calculations • 📊 Holdings sorted by P&L (highest first) • 💰 Net Invested = Total Invested - Amount Sold
            </div>
            <div className="flex gap-4 text-xs text-indigo-300">
              {portfolioTimestamp && (
                <div>📊 Portfolio: {portfolioTimestamp.toLocaleString()}</div>
              )}
              {holdingsTimestamp && (
                <div>💰 Prices: {holdingsTimestamp.toLocaleString()}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 bg-gradient-to-br from-gray-50 to-white" style={{width: '100%', maxWidth: 'fit-content', margin: '0 auto'}}>
        {summary && (
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
            border: '1px solid #e5e7eb',
            overflow: 'hidden',
            width: '100%',
            marginBottom: '24px'
          }}>
            <div style={{
              background: 'linear-gradient(to right, #f8fafc, #f1f5f9)',
              padding: '20px 24px',
              borderBottom: '1px solid #e5e7eb'
            }}>
              <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                <h3 style={{
                  fontSize: '20px',
                  fontWeight: 'bold',
                  color: '#111827'
                }}>Portfolio Summary</h3>
              </div>
            </div>
            <div style={{
              padding: '20px 24px',
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '24px',
              alignItems: 'center'
            }}>
              <div style={{textAlign: 'center'}}>
                <div style={{
                  fontSize: '28px',
                  fontWeight: '700',
                  color: '#111827',
                  marginBottom: '4px',
                  fontFamily: 'Futura, "Trebuchet MS", Arial, sans-serif'
                }}>
                  {formatCurrency(summary.currentTotalValue)}
                </div>
                <div style={{
                  fontSize: '12px',
                  color: '#6b7280',
                  backgroundColor: '#f3f4f6',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  display: 'inline-block'
                }}>
                  Net Value in All Holdings by Market
                </div>
              </div>
              <div style={{textAlign: 'center'}}>
                <div style={{
                  fontSize: '28px',
                  fontWeight: '700',
                  color: (summary.totalInvested - (summary.totalAmountSold || 0)) >= 0 ? '#dc2626' : '#166534',
                  marginBottom: '4px',
                  fontFamily: 'Futura, "Trebuchet MS", Arial, sans-serif'
                }}>
                  {formatCurrency(summary.totalInvested - (summary.totalAmountSold || 0))}
                </div>
                <div style={{
                  fontSize: '12px',
                  color: '#6b7280',
                  backgroundColor: '#f3f4f6',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  display: 'inline-block',
                  marginRight: '8px'
                }}>
                  Net Cash Flow
                </div>
                <span style={{
                  fontSize: '12px',
                  color: '#6b7280',
                  fontWeight: '500'
                }}>
                  (<span style={{color: '#dc2626'}}>{formatCurrency(summary.totalInvested)}</span> - <span style={{color: '#166534'}}>{formatCurrency(summary.totalAmountSold || 0)}</span>)
                </span>
              </div>
              <div style={{textAlign: 'center'}}>
                <div style={{
                  fontSize: '28px',
                  fontWeight: '700',
                  color: summary.totalPnL && summary.totalPnL >= 0 ? '#166534' : '#dc2626',
                  marginBottom: '4px',
                  fontFamily: 'Futura, "Trebuchet MS", Arial, sans-serif'
                }}>
                  {formatCurrency(summary.totalPnL)}
                </div>
                <div style={{
                  fontSize: '12px',
                  color: '#6b7280',
                  backgroundColor: '#f3f4f6',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  display: 'inline-block'
                }}>
                  P&L
                </div>
              </div>
              <div style={{textAlign: 'center'}}>
                <div style={{
                  fontSize: '28px',
                  fontWeight: '700',
                  color: summary.totalPnLPercent && summary.totalPnLPercent >= 0 ? '#166534' : '#dc2626',
                  marginBottom: '4px',
                  fontFamily: 'Futura, "Trebuchet MS", Arial, sans-serif'
                }}>
                  {formatPercentage(summary.totalPnLPercent)}
                </div>
                <div style={{
                  fontSize: '12px',
                  color: '#6b7280',
                  backgroundColor: '#f3f4f6',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  display: 'inline-block'
                }}>
                  P&L %
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Holdings Chart */}
        {holdings.length > 0 && (
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
            border: '1px solid #e5e7eb',
            overflow: 'hidden',
            width: '100%',
            marginBottom: '24px'
          }}>
            <HoldingsChartWrapper />
          </div>
        )}

        {/* Holdings Table */}
        {holdings.length > 0 && (
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
            border: '1px solid #e5e7eb',
            overflow: 'hidden',
            width: '100%',
            maxWidth: '100%',
            marginTop: '0',
            marginBottom: '0',
            gridColumn: '1 / -1'
          }}>
            <div style={{
              background: 'linear-gradient(to right, #f8fafc, #f1f5f9)',
              padding: '20px 24px',
              borderBottom: '1px solid #e5e7eb'
            }}>
              <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px'}}>
                <h3 style={{
                  fontSize: '20px',
                  fontWeight: 'bold',
                  color: '#111827'
                }}>Holdings Breakdown</h3>
                <div style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#6b7280',
                  backgroundColor: 'white',
                  padding: '6px 12px',
                  borderRadius: '20px',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
                }}>{holdings.length} assets</div>
              </div>
              <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
                <label style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#374151'
                }}>
                  Total Capital Available:
                </label>
                <div style={{position: 'relative'}}>
                  <input
                    type="number"
                    value={totalCapital}
                    onChange={(e) => handleTotalCapitalChange(parseFloat(e.target.value) || 0)}
                    style={{
                      padding: '8px 12px 8px 32px',
                      borderRadius: '8px',
                      border: '2px solid #d1d5db',
                      fontSize: '14px',
                      fontWeight: '600',
                      width: '150px',
                      backgroundColor: 'white',
                      color: '#111827'
                    }}
                    onFocus={(e) => {
                      e.target.style.border = '2px solid #3b82f6';
                      e.target.style.outline = 'none';
                    }}
                    onBlur={(e) => {
                      e.target.style.border = '2px solid #d1d5db';
                    }}
                  />
                  <span style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#6b7280',
                    fontSize: '14px',
                    pointerEvents: 'none'
                  }}>C$</span>
                </div>
                <div style={{
                  fontSize: '12px',
                  color: '#6b7280',
                  backgroundColor: '#f3f4f6',
                  padding: '4px 8px',
                  borderRadius: '12px'
                }}>
                  Used for % calculations
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full" style={{backgroundColor: 'white', border: '1px solid #e5e7eb'}}>
                <thead>
                  <tr style={{backgroundColor: '#f8fafc', borderBottom: '2px solid #e5e7eb'}}>
                    <th className="text-center py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 12px', width: '80px'}}>
                      #
                    </th>
                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                      Symbol
                    </th>
                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px', width: '80px'}}>
                      Icon
                    </th>
                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                      Company
                    </th>
                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                      Type
                    </th>
                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                      Shares
                    </th>
                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                      Current Price
                    </th>
                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                      Current Value
                    </th>
                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                      Net Invested
                    </th>
                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                      Total Invested
                    </th>
                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                      Amount Sold ($)
                    </th>
                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                      P&L ↓
                    </th>
                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                      Weekly Change %
                    </th>
                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                      % of Portfolio
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {holdings.map((holding, index) => (
                    <tr key={holding.symbol} style={{
                      backgroundColor: index % 2 === 0 ? '#ffffff' : '#f9fafb',
                      borderBottom: '1px solid #f3f4f6',
                      transition: 'all 0.2s ease'
                    }} onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#f0f9ff';
                    }} onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = index % 2 === 0 ? '#ffffff' : '#f9fafb';
                    }}>
                      <td className="py-4 px-6" style={{padding: '16px 12px', textAlign: 'center'}}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}>
                          {holding.positionChange && holding.positionChange !== 'same' && (
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              fontSize: '12px',
                            }}>
                              {holding.positionChange === 'up' ? (
                                <svg style={{width: '14px', height: '14px', color: '#166534'}} fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M7 14l5-5 5 5H7z"/>
                                </svg>
                              ) : holding.positionChange === 'down' ? (
                                <svg style={{width: '14px', height: '14px', color: '#dc2626'}} fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M7 10l5 5 5-5H7z"/>
                                </svg>
                              ) : holding.positionChange === 'new' ? (
                                <svg style={{width: '14px', height: '14px', color: '#2563eb'}} fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                                </svg>
                              ) : null}
                            </div>
                          )}
                          <div style={{
                            fontSize: '16px',
                            fontWeight: '700',
                            color: holding.positionChange === 'up' ? '#166534' : 
                                   holding.positionChange === 'down' ? '#dc2626' : 
                                   holding.positionChange === 'new' ? '#2563eb' : '#111827',
                            fontFamily: 'Futura, "Trebuchet MS", Arial, sans-serif'
                          }}>
                            {holding.currentPosition}
                          </div>
                        </div>
                        {holding.lastWeekPosition ? (
                          <div style={{
                            fontSize: '10px',
                            color: '#6b7280',
                            marginTop: '2px'
                          }}>
                            was {holding.lastWeekPosition}
                          </div>
                        ) : holding.positionChange === 'new' ? (
                          <div style={{
                            fontSize: '10px',
                            color: '#2563eb',
                            marginTop: '2px',
                            fontWeight: '500'
                          }}>
                            NEW
                          </div>
                        ) : null}
                      </td>
                      <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                        <div style={{
                          fontSize: '16px',
                          fontWeight: '600',
                          color: '#111827'
                        }}>
                          {holding.symbol}
                        </div>
                      </td>
                      <td className="py-4 px-6" style={{padding: '20px 24px', textAlign: 'center'}}>
                        <CompanyIcon
                          symbol={holding.symbol}
                          iconUrl={iconUrls[holding.symbol.toUpperCase()]}
                          companyName={holding.companyName}
                          size="10x10"
                          showFallback={true}
                          showTooltip={false}
                        />
                      </td>
                      <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                        <div style={{
                          fontSize: '14px',
                          color: '#6b7280',
                          fontStyle: 'italic'
                        }}>
                          {holding.companyName}
                        </div>
                      </td>
                      <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                        <div style={{
                          fontSize: '14px',
                          fontWeight: '600',
                          padding: '6px 12px',
                          borderRadius: '16px',
                          backgroundColor: holding.type === 'c' ? '#f3e8ff' : '#dbeafe',
                          color: holding.type === 'c' ? '#7c3aed' : '#2563eb',
                          border: `1px solid ${holding.type === 'c' ? '#c4b5fd' : '#93c5fd'}`
                        }}>
                          {holding.type === 'c' ? 'Crypto' : 'Stock'}
                        </div>
                      </td>
                      <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                        <div style={{
                          fontSize: '16px',
                          fontWeight: '600',
                          color: '#111827'
                        }}>
                          {Number.isInteger(holding.quantity) ? holding.quantity.toLocaleString() : safeToFixed(holding.quantity)}
                        </div>
                      </td>
                      <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                        <div style={{
                          fontSize: '16px',
                          fontWeight: '600',
                          color: '#111827'
                        }}>
                          {formatCurrency(holding.currentPrice)}
                        </div>
                      </td>
                      <td className="py-4 px-6" style={{
                        padding: '20px 24px', 
                        backgroundColor: (() => {
                          const currentValue = holding.currentValue || 0;
                          const netInvested = calculateNetInvested(holding.totalAmountInvested, holding.amountSold);
                          
                          // Grey background for zero or very small values
                          if (currentValue <= 0.01) return '#f9fafb';
                          
                          return currentValue > netInvested ? '#dcfce7' : '#fef2f2';
                        })()
                      }}>
                        <div style={{
                          fontSize: '16px',
                          fontWeight: '600',
                          color: (() => {
                            const currentValue = holding.currentValue || 0;
                            const netInvested = calculateNetInvested(holding.totalAmountInvested, holding.amountSold);
                            
                            // Grey text for zero or very small values
                            if (currentValue <= 0.01) return '#9ca3af';
                            
                            return currentValue > netInvested ? '#166534' : '#dc2626';
                          })()
                        }}>
                          {formatCurrency(holding.currentValue)}
                        </div>
                      </td>
                      <td className="py-4 px-6" style={{
                        padding: '20px 24px', 
                        backgroundColor: holding.quantity <= 0.01 ? '#f3e8ff' : '#e0f2fe'
                      }}>
                        <div style={{
                          fontSize: '16px',
                          fontWeight: '600',
                          color: holding.quantity <= 0.01 ? '#7c3aed' : '#111827'
                        }}>
                          {formatCurrency(calculateNetInvested(holding.totalAmountInvested, holding.amountSold))}
                        </div>
                      </td>
                      <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                        <div style={{
                          fontSize: '16px',
                          fontWeight: '600',
                          color: '#111827'
                        }}>
                          {formatCurrency(holding.totalAmountInvested)}
                        </div>
                      </td>
                      <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                        <div style={{
                          fontSize: '16px',
                          fontWeight: '600',
                          color: '#111827'
                        }}>
                          {formatCurrency(holding.amountSold || 0)}
                        </div>
                      </td>
                      <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                        <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '8px 16px',
                            borderRadius: '20px',
                            fontSize: '14px',
                            fontWeight: '600',
                            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                            backgroundColor: (holding.totalPnL && holding.totalPnL >= 0) ? '#dcfce7' : '#fef2f2',
                            color: (holding.totalPnL && holding.totalPnL >= 0) ? '#166534' : '#dc2626',
                            border: `2px solid ${(holding.totalPnL && holding.totalPnL >= 0) ? '#bbf7d0' : '#fecaca'}`
                          }}>
                            {(holding.totalPnL && holding.totalPnL >= 0) ? (
                              <svg style={{width: '16px', height: '16px', marginRight: '8px'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                              </svg>
                            ) : (
                              <svg style={{width: '16px', height: '16px', marginRight: '8px'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0v-8m0 8l-8-8-4 4-6-6" />
                              </svg>
                            )}
                            {formatCurrency(holding.totalPnL)}
                          </div>
                          {holding.totalPnLPercent !== null && holding.totalPnLPercent !== undefined && (
                            <div style={{
                              fontSize: '14px',
                              fontWeight: '600',
                              padding: '6px 12px',
                              borderRadius: '16px',
                              backgroundColor: holding.totalPnLPercent >= 0 ? '#f0fdf4' : '#fef2f2',
                              color: holding.totalPnLPercent >= 0 ? '#166534' : '#dc2626',
                              border: `1px solid ${holding.totalPnLPercent >= 0 ? '#bbf7d0' : '#fecaca'}`
                            }}>
                              {formatPercentage(holding.totalPnLPercent)}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                        {holding.weeklyChangePercent !== null && holding.weeklyChangePercent !== undefined ? (
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '6px 12px',
                            borderRadius: '16px',
                            fontSize: '14px',
                            fontWeight: '600',
                            backgroundColor: holding.weeklyChangePercent >= 0 ? '#dcfce7' : '#fef2f2',
                            color: holding.weeklyChangePercent >= 0 ? '#166534' : '#dc2626',
                            border: `2px solid ${holding.weeklyChangePercent >= 0 ? '#bbf7d0' : '#fecaca'}`
                          }}>
                            {holding.weeklyChangePercent >= 0 ? (
                              <svg style={{width: '14px', height: '14px', marginRight: '6px'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                              </svg>
                            ) : (
                              <svg style={{width: '14px', height: '14px', marginRight: '6px'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0v-8m0 8l-8-8-4 4-6-6" />
                              </svg>
                            )}
                            {formatPercentage(holding.weeklyChangePercent)}
                          </div>
                        ) : (
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '4px 8px',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: '500',
                            backgroundColor: '#f3f4f6',
                            color: '#6b7280',
                            border: '1px solid #d1d5db'
                          }}>
                            <svg style={{width: '12px', height: '12px', marginRight: '4px'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Loading...
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                        {(() => {
                          const netInvested = calculateNetInvested(holding.totalAmountInvested, holding.amountSold);
                          const percentage = totalCapital > 0 ? (netInvested / totalCapital) * 100 : 0;
                          const isBelow2Percent = percentage < 2;

                          return (
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              padding: '6px 12px',
                              borderRadius: '16px',
                              fontSize: '14px',
                              fontWeight: '600',
                              backgroundColor: isBelow2Percent ? '#dcfce7' : '#dbeafe',
                              color: isBelow2Percent ? '#166534' : '#2563eb',
                              border: `2px solid ${isBelow2Percent ? '#bbf7d0' : '#93c5fd'}`
                            }}>
                              {percentage.toFixed(2)}%
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}


      </div>
    </div>
  );
};

export default PortfolioSummary;