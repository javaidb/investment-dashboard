import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import axios from 'axios';
import { useCache } from '../contexts/CacheContext';
import { useIcons } from '../hooks/useIcons';
import CompanyIcon from './CompanyIcon';
import PortfolioAllocationPieChart from './PortfolioAllocationPieChart';
import RecurringInvestments from './RecurringInvestments';
import ProfitByAssetTypeBarChart from './ProfitByAssetTypeBarChart';

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
  sector?: string; // Sector/industry classification
  currentPrice?: number; // Now in CAD
  currentValue?: number; // Now in CAD
  unrealizedPnL?: number; // Now in CAD
  totalPnL?: number; // Now in CAD
  totalPnLPercent?: number;
  usdPrice?: number; // USD price for reference
  exchangeRate?: number; // Exchange rate used for conversion
  cacheUsed?: boolean; // Flag to indicate if cache was used
  weeklyChangePercent?: number | number[]; // Weekly change percentage (can be single value or array of 3)
  dailyChangePercent?: number | number[]; // Daily change percentage (can be single value or array of 3)
  monthlyChangePercent?: number | number[]; // Monthly change percentage (can be single value or array of 3)
  quarterlyChangePercent?: number; // Quarterly change percentage (90 days)
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

// 3-Segment Pill Component for displaying multiple period changes
interface ThreeSegmentPillProps {
  values: number[]; // Array of 3 values [oldest, middle, newest]
  labels?: string[]; // Optional labels for each segment
}

const ThreeSegmentPill: React.FC<ThreeSegmentPillProps> = ({ values, labels }) => {
  if (!values || values.length !== 3) {
    return (
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
    );
  }

  return (
    <div style={{
      display: 'flex',
      gap: '4px',
      alignItems: 'center'
    }}>
      {[...values].reverse().map((value, index) => {
        const originalIndex = values.length - 1 - index; // Track original index for labels
        const isPositive = value >= 0;
        const isHighPositive = value > 10; // Blue for > 10%
        const formattedValue = value.toFixed(1) + '%';

        // Determine colors based on value
        let backgroundColor, color, borderColor;
        if (isHighPositive) {
          // Blue for high positive gains (> 10%)
          backgroundColor = '#dbeafe';
          color = '#1e40af';
          borderColor = '#93c5fd';
        } else if (isPositive) {
          // Green for moderate positive gains
          backgroundColor = '#dcfce7';
          color = '#166534';
          borderColor = '#bbf7d0';
        } else if (value > -10) {
          // Red for small losses (> -10%)
          backgroundColor = '#fef2f2';
          color = '#dc2626';
          borderColor = '#fecaca';
        } else {
          // Deep burgundy/maroon for large losses (<= -10%)
          backgroundColor = '#fdf2f8';
          color = '#701a75';
          borderColor = '#e879f9';
        }

        return (
          <div
            key={index}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px 8px',
              borderRadius: '12px',
              fontSize: '13px',
              fontWeight: '600',
              backgroundColor,
              color,
              border: `1.5px solid ${borderColor}`,
              minWidth: '50px',
              transition: 'all 0.2s ease',
              cursor: labels ? 'help' : 'default'
            }}
            title={labels ? labels[originalIndex] : undefined}
          >
            {isPositive ? '+' : ''}{formattedValue}
          </div>
        );
      })}
    </div>
  );
};

const PortfolioSummary: React.FC = () => {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [summary, setSummary] = useState<PortfolioSummaryData | null>(null);
  const [tradingSummary, setTradingSummary] = useState<{
    currentValue: number;
    totalInvested: number;
    totalPnL: number;
    totalPnLPercent: number;
    totalRealized: number;
    totalAmountSold: number;
    totalUnrealizedPnL: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [weeklyChanges, setWeeklyChanges] = useState<{[symbol: string]: number[]}>({});
  const [dailyChanges, setDailyChanges] = useState<{[symbol: string]: number[]}>({});
  const [monthlyChanges, setMonthlyChanges] = useState<{[symbol: string]: number[]}>({});
  const [quarterlyChanges, setQuarterlyChanges] = useState<{[symbol: string]: number}>({});
  const [positionHistory, setPositionHistory] = useState<{[symbol: string]: number}>({});
  // Calculate total capital from portfolio net value
  const totalCapital = summary ? (summary.currentTotalValue || 0) : 0;
  
  const queryClient = useQueryClient();
  const {
    holdings: cachedHoldings,
    latestPortfolio,
    recurringInvestments,
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
      // Force React Query to recognize the data change
      queryClient.invalidateQueries('persistent-portfolio-cache');
    }
  }, [latestPortfolio, cachedHoldings, portfolioTimestamp, queryClient]);

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
  // Using batch endpoint for instant results (single HTTP request instead of 33)
  const { data: weeklyChangesData, isLoading: isWeeklyChangesLoading, error: weeklyChangesError } = useQuery(
    ['weekly-changes-batch', holdings.map(h => h.symbol).join(',')],
    async () => {
      if (holdings.length === 0) return {};

      console.log('🔄 Fetching weekly changes for', holdings.length, 'holdings via batch endpoint');
      const symbols = holdings.map(h => h.symbol);

      try {
        const response = await axios.post('/api/portfolio/cache/weekly-changes', { symbols });
        console.log('✅ Weekly changes batch response:', response.data);

        return response.data.weeklyChanges || {};
      } catch (error) {
        console.error('❌ Failed to fetch weekly changes batch:', error);
        return {};
      }
    },
    {
      enabled: holdings.length > 0,
      staleTime: 300000, // 5 minutes
      cacheTime: 900000, // 15 minutes
      retry: 1
    }
  );

  // Use React Query to get daily changes from historical cache
  const { data: dailyChangesData, isLoading: isDailyChangesLoading, error: dailyChangesError } = useQuery(
    ['daily-changes-batch', holdings.map(h => h.symbol).join(',')],
    async () => {
      if (holdings.length === 0) return {};

      console.log('🔄 Fetching daily changes for', holdings.length, 'holdings via batch endpoint');
      const symbols = holdings.map(h => h.symbol);

      try {
        const response = await axios.post('/api/portfolio/cache/daily-changes', { symbols });
        console.log('✅ Daily changes batch response:', response.data);

        return response.data.dailyChanges || {};
      } catch (error) {
        console.error('❌ Failed to fetch daily changes batch:', error);
        return {};
      }
    },
    {
      enabled: holdings.length > 0,
      staleTime: 300000, // 5 minutes
      cacheTime: 900000, // 15 minutes
      retry: 1
    }
  );

  // Use React Query to get monthly changes from historical cache
  const { data: monthlyChangesData, isLoading: isMonthlyChangesLoading, error: monthlyChangesError } = useQuery(
    ['monthly-changes-batch', holdings.map(h => h.symbol).join(',')],
    async () => {
      if (holdings.length === 0) return {};

      console.log('🔄 Fetching monthly changes for', holdings.length, 'holdings via batch endpoint');
      const symbols = holdings.map(h => h.symbol);

      try {
        const response = await axios.post('/api/portfolio/cache/monthly-changes', { symbols });
        console.log('✅ Monthly changes batch response:', response.data);

        return response.data.monthlyChanges || {};
      } catch (error) {
        console.error('❌ Failed to fetch monthly changes batch:', error);
        return {};
      }
    },
    {
      enabled: holdings.length > 0,
      staleTime: 300000, // 5 minutes
      cacheTime: 900000, // 15 minutes
      retry: 1
    }
  );

  // Use React Query to get quarterly changes from historical cache
  const { data: quarterlyChangesData, isLoading: isQuarterlyChangesLoading, error: quarterlyChangesError } = useQuery(
    ['quarterly-changes-batch', holdings.map(h => h.symbol).join(',')],
    async () => {
      if (holdings.length === 0) return {};

      console.log('🔄 Fetching quarterly changes for', holdings.length, 'holdings via batch endpoint');
      const symbols = holdings.map(h => h.symbol);

      try {
        const response = await axios.post('/api/portfolio/cache/quarterly-changes', { symbols });
        console.log('✅ Quarterly changes batch response:', response.data);

        return response.data.quarterlyChanges || {};
      } catch (error) {
        console.error('❌ Failed to fetch quarterly changes batch:', error);
        return {};
      }
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

  // Update dailyChanges when data is available
  React.useEffect(() => {
    console.log('🔄 Daily changes useEffect triggered:', {
      hasData: !!dailyChangesData,
      dataKeys: dailyChangesData ? Object.keys(dailyChangesData) : [],
      data: dailyChangesData,
      isLoading: isDailyChangesLoading,
      error: dailyChangesError
    });

    if (dailyChangesData) {
      console.log('✅ Setting daily changes state:', dailyChangesData);
      setDailyChanges(dailyChangesData);
    }
  }, [dailyChangesData, isDailyChangesLoading, dailyChangesError]);

  // Update monthlyChanges when data is available
  React.useEffect(() => {
    if (monthlyChangesData) {
      console.log('✅ Setting monthly changes state:', monthlyChangesData);
      setMonthlyChanges(monthlyChangesData);
    }
  }, [monthlyChangesData, isMonthlyChangesLoading, monthlyChangesError]);

  // Update quarterlyChanges when data is available
  React.useEffect(() => {
    if (quarterlyChangesData) {
      console.log('✅ Setting quarterly changes state:', quarterlyChangesData);
      setQuarterlyChanges(quarterlyChangesData);
    }
  }, [quarterlyChangesData, isQuarterlyChangesLoading, quarterlyChangesError]);

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
      dailyChangesAvailable: Object.keys(dailyChanges).length,
      dailyChangesData: dailyChanges,
      monthlyChangesAvailable: Object.keys(monthlyChanges).length,
      monthlyChangesData: monthlyChanges,
      quarterlyChangesAvailable: Object.keys(quarterlyChanges).length,
      quarterlyChangesData: quarterlyChanges,
      positionHistoryAvailable: Object.keys(positionHistory).length,
      positionHistoryData: positionHistory
    });
    setError(null); // Clear any previous errors
    processPortfolioData();
    // eslint-disable-next-line
  }, [activePortfolio, activeHoldings, persistentPortfolio, weeklyChanges, dailyChanges, monthlyChanges, quarterlyChanges, positionHistory]);

  const processPortfolioData = () => {
    console.log('🔥 processPortfolioData STARTING');
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
      console.log('🔍 First holding from API:', activePortfolio.holdings?.[0]);
      const safeHoldings = (activePortfolio.holdings || []).map((holding: any) => {
        const symbol = holding.symbol;
        const cachedPrice = activeHoldings[symbol];
        
        // Prefer API-provided current price/value (most accurate), fallback to cached prices
        // The API provides fresh prices, while cachedPrice might be stale
        const currentPrice = holding.currentPrice ?? cachedPrice?.cadPrice ?? cachedPrice?.price ?? null;
        const currentValue = holding.currentValue ?? (currentPrice ? (holding.quantity || 0) * currentPrice : null);
        // Prefer API's pre-calculated unrealizedPnL (uses fresh prices), fallback to local calculation
        const unrealizedPnL = holding.unrealizedPnL ?? (currentValue && holding.totalInvested ?
          currentValue - holding.totalInvested : null);
        const totalPnL = holding.totalPnL ?? (unrealizedPnL !== null ?
          unrealizedPnL + (holding.realizedPnL || 0) : (holding.realizedPnL || 0));

        // Debug logging for first few symbols
        if (['BTC', 'ETH', 'TSLA', 'AAPL'].includes(symbol)) {
          console.log(`💰 ${symbol}: API unrealizedPnL=${holding.unrealizedPnL}, calculated=${unrealizedPnL}, using=${unrealizedPnL === holding.unrealizedPnL ? 'API' : 'calculated'}`);
          console.log(`   currentValue=${currentValue}, totalInvested=${holding.totalInvested}, diff=${currentValue && holding.totalInvested ? currentValue - holding.totalInvested : 'N/A'}`);
        }
        // Use totalAmountInvested for accurate P&L percentage (total ever invested, not just current position)
        const totalPnLPercent = (holding.totalAmountInvested || holding.totalInvested || 0) > 0 ?
          (totalPnL / (holding.totalAmountInvested || holding.totalInvested)) * 100 : 0;
        
        const weeklyChange = weeklyChanges[symbol];
        const dailyChange = dailyChanges[symbol];
        const monthlyChange = monthlyChanges[symbol];
        const quarterlyChange = quarterlyChanges[symbol];
        console.log(`🔍 Processing holding ${symbol}: weeklyChange=${weeklyChange}, dailyChange=${dailyChange}, monthlyChange=${monthlyChange}, quarterlyChange=${quarterlyChange}`);

        const result = {
          symbol: symbol || 'UNKNOWN',
          quantity: holding.quantity || 0,
          averagePrice: holding.averagePrice || 0,
          totalInvested: holding.totalInvested || 0,
          totalAmountInvested: holding.totalAmountInvested || holding.totalInvested || 0,
          realizedPnL: holding.realizedPnL || 0,
          amountSold: holding.amountSold || 0,
          type: holding.type || 's',
          currency: holding.currency || 'CAD',
          companyName: holding.companyName || cachedPrice?.companyName || symbol || 'UNKNOWN',
          sector: holding.sector || cachedPrice?.sector || null,
          currentPrice: currentPrice,
          currentValue: currentValue,
          unrealizedPnL: unrealizedPnL,
          totalPnL: totalPnL,
          totalPnLPercent: totalPnLPercent,
          cacheUsed: !!cachedPrice,
          weeklyChangePercent: weeklyChange !== undefined ? weeklyChange : null,
          dailyChangePercent: dailyChange !== undefined ? dailyChange : null,
          monthlyChangePercent: monthlyChange !== undefined ? monthlyChange : null,
          quarterlyChangePercent: quarterlyChange !== undefined ? quarterlyChange : null
        };

        // Final debug for BTC
        if (symbol === 'BTC') {
          console.log(`🔥 BTC final unrealizedPnL in result object:`, result.unrealizedPnL);
        }

        return result;
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
      // Calculate holdings totals (trading only)
      console.log(`🔍 safeHoldings BTC unrealizedPnL before sum:`, safeHoldings.find((h: any) => h.symbol === 'BTC')?.unrealizedPnL);
      const currentTotalValue = safeHoldings.reduce((sum: number, h: Holding) =>
        sum + (h.currentValue || 0), 0);
      const totalUnrealizedPnL = safeHoldings.reduce((sum: number, h: Holding) =>
        sum + (h.unrealizedPnL || 0), 0);
      const totalRealizedPnL = safeHoldings.reduce((sum: number, h: Holding) =>
        sum + (h.realizedPnL || 0), 0);

      console.log('📊 SUMMARY CALCULATION:');
      console.log(`   Total Unrealized P&L: CA$${totalUnrealizedPnL.toFixed(2)}`);
      console.log(`   Total Realized P&L: CA$${totalRealizedPnL.toFixed(2)}`);
      console.log(`   Holdings count: ${safeHoldings.length}`);
      const totalInvested = safeHoldings.reduce((sum: number, h: Holding) =>
        sum + (h.totalInvested || 0), 0);
      // Use totalAmountInvested for accurate total investment tracking
      const totalAmountInvested = safeHoldings.reduce((sum: number, h: Holding) =>
        sum + (h.totalAmountInvested || h.totalInvested || 0), 0);
      const totalAmountSold = safeHoldings.reduce((sum: number, h: Holding) =>
        sum + (h.amountSold || 0), 0);
      const tradingTotalPnL = totalUnrealizedPnL + totalRealizedPnL;
      const tradingTotalPnLPercent = totalAmountInvested > 0 ?
        (tradingTotalPnL / totalAmountInvested) * 100 : 0;

      // Add recurring investments totals if available
      const recurringTotals = recurringInvestments?.totals || {
        totalInvested: 0,
        currentValue: 0,
        profitLoss: 0
      };

      // Combine holdings and recurring investments (total portfolio)
      const combinedCurrentValue = currentTotalValue + recurringTotals.currentValue;
      const combinedTotalInvested = totalAmountInvested + recurringTotals.totalInvested;
      const combinedTotalPnL = (totalUnrealizedPnL + totalRealizedPnL) + recurringTotals.profitLoss;
      const combinedTotalPnLPercent = combinedTotalInvested > 0 ?
        (combinedTotalPnL / combinedTotalInvested) * 100 : 0;

      // Calculate combined unrealized P&L (trading unrealized + recurring unrealized)
      // recurringTotals.profitLoss is unrealized since there are no sales in recurring investments
      const combinedUnrealizedPnL = totalUnrealizedPnL + recurringTotals.profitLoss;

      // Store combined portfolio metrics (total portfolio including index funds)
      setSummary({
        totalInvested: totalInvested + recurringTotals.totalInvested, // Current position cost for display
        currentTotalValue: combinedCurrentValue,
        totalPnL: combinedTotalPnL,
        totalPnLPercent: combinedTotalPnLPercent, // This uses totalAmountInvested in calculation
        totalRealized: totalRealizedPnL,
        totalAmountSold: totalAmountSold,
        totalHoldings: safeHoldings.length,
        totalQuantity: safeHoldings.reduce((sum: number, h: Holding) => sum + (h.quantity || 0), 0),
        totalUnrealizedPnL: combinedUnrealizedPnL // Include both trading and recurring unrealized P&L
      });

      // Store trading-only metrics (without index funds)
      setTradingSummary({
        currentValue: currentTotalValue,
        totalInvested: totalInvested, // Current position cost for display
        totalPnL: tradingTotalPnL,
        totalPnLPercent: tradingTotalPnLPercent, // This uses totalAmountInvested in calculation
        totalRealized: totalRealizedPnL,
        totalAmountSold: totalAmountSold,
        totalUnrealizedPnL: totalUnrealizedPnL // Add unrealized P&L from API calculations
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
        {/* Grid layout: Summary cards and Recurring Investments on left, Profit chart on right */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 650px', gap: '24px', marginBottom: '24px' }}>
          {/* Left side: Summary and Recurring Investments */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {summary && tradingSummary && (
              <div style={{
                backgroundColor: 'white',
                borderRadius: '16px',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
                border: '1px solid #e5e7eb',
                overflow: 'hidden',
                width: '100%'
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

                {/* Grid layout: Left side (current positions) + Right side (all-time performance) */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '4fr 1fr',
                  gap: '0'
                }}>
                  {/* Left side: Current positions */}
                  <div>
                    {/* Row 1: Total Portfolio Current Positions */}
                    <div style={{
                      padding: '30px 24px',
                      display: 'grid',
                      gridTemplateColumns: '180px repeat(5, 1fr)',
                      gap: '20px',
                      alignItems: 'center',
                      borderBottom: '1px solid #e5e7eb',
                      borderRight: '2px solid #e5e7eb',
                      background: 'linear-gradient(to right, #eff6ff, #f0f9ff)'
                    }}>
                      <div style={{textAlign: 'left'}}>
                        <div style={{
                          fontSize: '14px',
                          color: '#2563eb',
                          fontWeight: '700',
                          letterSpacing: '0.5px',
                          textTransform: 'uppercase'
                        }}>
                          Total Portfolio
                        </div>
                      </div>
                      <div style={{textAlign: 'center'}}>
                        <div style={{
                          fontSize: '26px',
                          fontWeight: '700',
                          color: '#111827',
                          marginBottom: '4px',
                          fontFamily: 'Futura, "Trebuchet MS", Arial, sans-serif'
                        }}>
                          {formatCurrency(summary.totalInvested)}
                        </div>
                        <div style={{
                          fontSize: '11px',
                          color: '#6b7280',
                          backgroundColor: 'white',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          display: 'inline-block',
                          border: '1px solid #bfdbfe'
                        }}>
                          Total Invested
                        </div>
                      </div>
                      <div style={{textAlign: 'center'}}>
                        <div style={{
                          fontSize: '26px',
                          fontWeight: '700',
                          color: '#111827',
                          marginBottom: '4px',
                          fontFamily: 'Futura, "Trebuchet MS", Arial, sans-serif'
                        }}>
                          {formatCurrency(summary.currentTotalValue)}
                        </div>
                        <div style={{
                          fontSize: '11px',
                          color: '#6b7280',
                          backgroundColor: 'white',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          display: 'inline-block',
                          border: '1px solid #bfdbfe'
                        }}>
                          Current Value
                        </div>
                      </div>
                      <div style={{textAlign: 'center'}}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          marginBottom: '4px'
                        }}>
                          <div style={{
                            fontSize: '26px',
                            fontWeight: '700',
                            color: summary.totalUnrealizedPnL && summary.totalUnrealizedPnL >= 0 ? '#166534' : '#dc2626',
                            fontFamily: 'Futura, "Trebuchet MS", Arial, sans-serif'
                          }}>
                            {formatCurrency(summary.totalUnrealizedPnL)}
                          </div>
                          <div style={{
                            fontSize: '13px',
                            fontWeight: '600',
                            color: summary.totalUnrealizedPnL && summary.totalUnrealizedPnL >= 0 ? '#166534' : '#dc2626',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '2px'
                          }}>
                            <span>{summary.totalUnrealizedPnL && summary.totalUnrealizedPnL >= 0 ? '↑' : '↓'}</span>
                            <span>{summary.totalInvested > 0 ? formatPercentage((summary.totalUnrealizedPnL || 0) / summary.totalInvested * 100) : '0.00%'}</span>
                          </div>
                        </div>
                        <div style={{
                          fontSize: '11px',
                          color: '#6b7280',
                          backgroundColor: 'white',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          display: 'inline-block',
                          border: '1px solid #bfdbfe'
                        }}>
                          Unrealized P/L
                        </div>
                      </div>
                      <div style={{textAlign: 'center'}}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          marginBottom: '4px'
                        }}>
                          <div style={{
                            fontSize: '26px',
                            fontWeight: '700',
                            color: summary.totalRealized && summary.totalRealized >= 0 ? '#166534' : '#dc2626',
                            fontFamily: 'Futura, "Trebuchet MS", Arial, sans-serif'
                          }}>
                            {formatCurrency(summary.totalRealized)}
                          </div>
                        </div>
                        <div style={{
                          fontSize: '11px',
                          color: '#6b7280',
                          backgroundColor: 'white',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          display: 'inline-block',
                          border: '1px solid #bfdbfe'
                        }}>
                          Realized P/L
                        </div>
                      </div>
                      <div style={{textAlign: 'center'}}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          marginBottom: '4px'
                        }}>
                          <div style={{
                            fontSize: '26px',
                            fontWeight: '700',
                            color: summary.totalPnL && summary.totalPnL >= 0 ? '#166534' : '#dc2626',
                            fontFamily: 'Futura, "Trebuchet MS", Arial, sans-serif'
                          }}>
                            {formatCurrency(summary.totalPnL)}
                          </div>
                          <div style={{
                            fontSize: '13px',
                            fontWeight: '600',
                            color: summary.totalPnL && summary.totalPnL >= 0 ? '#166534' : '#dc2626',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '2px'
                          }}>
                            <span>{summary.totalPnL && summary.totalPnL >= 0 ? '↑' : '↓'}</span>
                            <span>{summary.totalInvested > 0 ? formatPercentage((summary.totalPnL || 0) / summary.totalInvested * 100) : '0.00%'}</span>
                          </div>
                        </div>
                        <div style={{
                          fontSize: '11px',
                          color: '#6b7280',
                          backgroundColor: 'white',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          display: 'inline-block',
                          border: '1px solid #bfdbfe'
                        }}>
                          Total P/L
                        </div>
                      </div>
                    </div>

                    {/* Row 2: Trading Holdings Only */}
                    <div style={{
                      padding: '30px 24px',
                      display: 'grid',
                      gridTemplateColumns: '180px repeat(5, 1fr)',
                      gap: '20px',
                      alignItems: 'center',
                      borderRight: '2px solid #e5e7eb',
                      background: 'linear-gradient(to right, #fefce8, #fef9c3)'
                    }}>
                      <div style={{textAlign: 'left'}}>
                        <div style={{
                          fontSize: '14px',
                          color: '#ca8a04',
                          fontWeight: '700',
                          letterSpacing: '0.5px',
                          textTransform: 'uppercase'
                        }}>
                          Trading Holdings
                        </div>
                      </div>
                      <div style={{textAlign: 'center'}}>
                        <div style={{
                          fontSize: '26px',
                          fontWeight: '700',
                          color: '#111827',
                          marginBottom: '4px',
                          fontFamily: 'Futura, "Trebuchet MS", Arial, sans-serif'
                        }}>
                          {formatCurrency(tradingSummary.totalInvested)}
                        </div>
                        <div style={{
                          fontSize: '11px',
                          color: '#6b7280',
                          backgroundColor: 'white',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          display: 'inline-block',
                          border: '1px solid #fde68a'
                        }}>
                          Total Invested
                        </div>
                      </div>
                      <div style={{textAlign: 'center'}}>
                        <div style={{
                          fontSize: '26px',
                          fontWeight: '700',
                          color: '#111827',
                          marginBottom: '4px',
                          fontFamily: 'Futura, "Trebuchet MS", Arial, sans-serif'
                        }}>
                          {formatCurrency(tradingSummary.currentValue)}
                        </div>
                        <div style={{
                          fontSize: '11px',
                          color: '#6b7280',
                          backgroundColor: 'white',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          display: 'inline-block',
                          border: '1px solid #fde68a'
                        }}>
                          Current Value
                        </div>
                      </div>
                      <div style={{textAlign: 'center'}}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          marginBottom: '4px'
                        }}>
                          <div style={{
                            fontSize: '26px',
                            fontWeight: '700',
                            color: tradingSummary.totalUnrealizedPnL >= 0 ? '#166534' : '#dc2626',
                            fontFamily: 'Futura, "Trebuchet MS", Arial, sans-serif'
                          }}>
                            {formatCurrency(tradingSummary.totalUnrealizedPnL)}
                          </div>
                          <div style={{
                            fontSize: '13px',
                            fontWeight: '600',
                            color: tradingSummary.totalUnrealizedPnL >= 0 ? '#166534' : '#dc2626',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '2px'
                          }}>
                            <span>{tradingSummary.totalUnrealizedPnL >= 0 ? '↑' : '↓'}</span>
                            <span>{tradingSummary.totalInvested > 0 ? formatPercentage(tradingSummary.totalUnrealizedPnL / tradingSummary.totalInvested * 100) : '0.00%'}</span>
                          </div>
                        </div>
                        <div style={{
                          fontSize: '11px',
                          color: '#6b7280',
                          backgroundColor: 'white',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          display: 'inline-block',
                          border: '1px solid #fde68a'
                        }}>
                          Unrealized P/L
                        </div>
                      </div>
                      <div style={{textAlign: 'center'}}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          marginBottom: '4px'
                        }}>
                          <div style={{
                            fontSize: '26px',
                            fontWeight: '700',
                            color: tradingSummary.totalRealized && tradingSummary.totalRealized >= 0 ? '#166534' : '#dc2626',
                            fontFamily: 'Futura, "Trebuchet MS", Arial, sans-serif'
                          }}>
                            {formatCurrency(tradingSummary.totalRealized)}
                          </div>
                        </div>
                        <div style={{
                          fontSize: '11px',
                          color: '#6b7280',
                          backgroundColor: 'white',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          display: 'inline-block',
                          border: '1px solid #fde68a'
                        }}>
                          Realized P/L
                        </div>
                      </div>
                      <div style={{textAlign: 'center'}}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          marginBottom: '4px'
                        }}>
                          <div style={{
                            fontSize: '26px',
                            fontWeight: '700',
                            color: tradingSummary.totalPnL && tradingSummary.totalPnL >= 0 ? '#166534' : '#dc2626',
                            fontFamily: 'Futura, "Trebuchet MS", Arial, sans-serif'
                          }}>
                            {formatCurrency(tradingSummary.totalPnL)}
                          </div>
                          <div style={{
                            fontSize: '13px',
                            fontWeight: '600',
                            color: tradingSummary.totalPnL && tradingSummary.totalPnL >= 0 ? '#166534' : '#dc2626',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '2px'
                          }}>
                            <span>{tradingSummary.totalPnL && tradingSummary.totalPnL >= 0 ? '↑' : '↓'}</span>
                            <span>{tradingSummary.totalInvested > 0 ? formatPercentage((tradingSummary.totalPnL || 0) / tradingSummary.totalInvested * 100) : '0.00%'}</span>
                          </div>
                        </div>
                        <div style={{
                          fontSize: '11px',
                          color: '#6b7280',
                          backgroundColor: 'white',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          display: 'inline-block',
                          border: '1px solid #fde68a'
                        }}>
                          Total P/L
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right side: All-Time Performance (spans both rows) */}
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: '16px 20px',
                    background: 'linear-gradient(135deg, #faf5ff, #f3e8ff)'
                  }}>
                    <div style={{
                      fontSize: '11px',
                      color: '#7c3aed',
                      fontWeight: '700',
                      marginBottom: '6px',
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase'
                    }}>
                      All-Time Performance
                    </div>
                    <div style={{
                      fontSize: '10px',
                      color: '#9333ea',
                      marginBottom: '12px',
                      textAlign: 'center',
                      fontStyle: 'italic'
                    }}>
                      (Current + Realized)
                    </div>

                    <div style={{marginBottom: '16px', textAlign: 'center'}}>
                      <div style={{
                        fontSize: '30px',
                        fontWeight: '700',
                        color: summary.totalPnL && summary.totalPnL >= 0 ? '#166534' : '#dc2626',
                        marginBottom: '5px',
                        fontFamily: 'Futura, "Trebuchet MS", Arial, sans-serif'
                      }}>
                        {formatCurrency(summary.totalPnL)}
                      </div>
                      <div style={{
                        fontSize: '11px',
                        color: '#6b7280',
                        backgroundColor: 'white',
                        padding: '3px 10px',
                        borderRadius: '12px',
                        display: 'inline-block',
                        border: '1px solid #e9d5ff'
                      }}>
                        Total P/L
                      </div>
                    </div>

                    <div style={{textAlign: 'center'}}>
                      <div style={{
                        fontSize: '30px',
                        fontWeight: '700',
                        color: summary.totalPnLPercent && summary.totalPnLPercent >= 0 ? '#166534' : '#dc2626',
                        marginBottom: '5px',
                        fontFamily: 'Futura, "Trebuchet MS", Arial, sans-serif'
                      }}>
                        {formatPercentage(summary.totalPnLPercent)}
                      </div>
                      <div style={{
                        fontSize: '11px',
                        color: '#6b7280',
                        backgroundColor: 'white',
                        padding: '3px 10px',
                        borderRadius: '12px',
                        display: 'inline-block',
                        border: '1px solid #e9d5ff'
                      }}>
                        Total Return %
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Recurring Investments Section */}
            <div style={{ width: '100%' }}>
              <RecurringInvestments />
            </div>
          </div>

          {/* Right side: Profit by Asset Type Bar Chart */}
          {holdings.length > 0 && (
            <div style={{ display: 'flex', width: '100%' }}>
              <ProfitByAssetTypeBarChart
                holdings={holdings}
                recurringInvestments={recurringInvestments?.investments || []}
              />
            </div>
          )}
        </div>

        {/* Portfolio Allocation Pie Chart */}
        {holdings.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <PortfolioAllocationPieChart
              holdings={holdings}
              recurringInvestments={recurringInvestments?.investments || []}
            />
          </div>
        )}

        {/* Holdings by Asset Type Table */}
        {holdings.length > 0 && (() => {
          // Group holdings by asset type
          const categoryColors: {[key: string]: string} = {
            'Crypto': '#F59E0B',
            'ETF': '#3B82F6',
            'Stock': '#10B981',
            'Index Fund': '#DC2626'
          };

          const holdingsByType = holdings.reduce((acc, holding) => {
            let category = 'Stock';
            if (holding.type === 'c') {
              category = 'Crypto';
            } else if (holding.symbol.includes('XEQT') || holding.symbol.includes('VOO') || holding.symbol.includes('QQQ') || holding.symbol.includes('IBIT')) {
              category = 'ETF';
            }

            if (!acc[category]) {
              acc[category] = {
                count: 0,
                totalInvested: 0,
                currentValue: 0,
                totalPnL: 0,
                unrealizedPnL: 0,
                realizedPnL: 0,
                totalAmountSold: 0,
                holdings: []
              };
            }

            acc[category].count += 1;
            acc[category].totalInvested += holding.totalInvested || 0;
            acc[category].currentValue += holding.currentValue || 0;
            acc[category].totalPnL += holding.totalPnL || 0;
            acc[category].unrealizedPnL += holding.unrealizedPnL || 0;
            acc[category].realizedPnL += holding.realizedPnL || 0;
            acc[category].totalAmountSold += holding.amountSold || 0;
            acc[category].holdings.push(holding);

            return acc;
          }, {} as {[key: string]: {count: number, totalInvested: number, currentValue: number, totalPnL: number, unrealizedPnL: number, realizedPnL: number, totalAmountSold: number, holdings: Holding[]}});

          // Add recurring investments as Index Fund category
          if (recurringInvestments?.totals) {
            holdingsByType['Index Fund'] = {
              count: recurringInvestments.investments?.length || 0,
              totalInvested: recurringInvestments.totals.totalInvested,
              currentValue: recurringInvestments.totals.currentValue,
              totalPnL: recurringInvestments.totals.profitLoss,
              unrealizedPnL: recurringInvestments.totals.profitLoss, // All P&L is unrealized for recurring investments
              realizedPnL: 0, // No realized P&L for recurring investments
              totalAmountSold: 0,
              holdings: []
            };
          }

          // Calculate time-based changes for each category
          const calculateCategoryChanges = (categoryData: any) => {
            const currentValue = categoryData.currentValue;
            const totalInvested = categoryData.totalInvested;

            // Calculate the overall return on investment
            const overallReturnPercent = totalInvested > 0 ? ((currentValue - totalInvested) / totalInvested) * 100 : 0;

            // For categories with holdings data, calculate weighted changes from REAL historical data
            // For Index Fund category (recurring investments), use the overall return
            if (categoryData.holdings && categoryData.holdings.length > 0) {
              const totalCurrentValue = categoryData.holdings.reduce((sum: number, h: Holding) =>
                sum + (h.currentValue || 0), 0);

              // Helper to aggregate array changes
              const aggregateArrayChanges = (field: 'dailyChangePercent' | 'weeklyChangePercent' | 'monthlyChangePercent'): number[] => {
                const aggregated: number[] = [0, 0, 0];
                let hasData = false;

                categoryData.holdings.forEach((h: Holding) => {
                  const changeData = h[field];
                  if (Array.isArray(changeData) && changeData.length === 3 && h.currentValue) {
                    const weight = totalCurrentValue > 0 ? h.currentValue / totalCurrentValue : 0;
                    changeData.forEach((val, idx) => {
                      aggregated[idx] += val * weight;
                    });
                    hasData = true;
                  }
                });

                // Return the full array of 3 values for the ThreeSegmentPill
                return hasData ? aggregated : [0, 0, 0];
              };

              const dailyChange = aggregateArrayChanges('dailyChangePercent');
              const weeklyChange = aggregateArrayChanges('weeklyChangePercent');
              const monthlyChange = aggregateArrayChanges('monthlyChangePercent');

              const quarterlyChange = categoryData.holdings.reduce((sum: number, h: Holding) => {
                if (h.quarterlyChangePercent !== null && h.quarterlyChangePercent !== undefined && h.currentValue) {
                  // Weight by current value
                  const weight = totalCurrentValue > 0 ? h.currentValue / totalCurrentValue : 0;
                  return sum + (h.quarterlyChangePercent * weight);
                }
                return sum;
              }, 0);

              const capChange = (change: number, maxCap: number) => {
                if (Math.abs(change) > maxCap) {
                  return change > 0 ? maxCap : -maxCap;
                }
                return change;
              };

              return {
                dailyChange: dailyChange,
                weeklyChange: weeklyChange,
                thisWeekChange: weeklyChange.map(val => capChange(val * 0.7, 50)), // Current week progress (estimated), as array
                monthlyChange: monthlyChange, // REAL data from historical cache
                quarterlyChange: quarterlyChange, // REAL data from historical cache
                yearlyChange: capChange(overallReturnPercent, 500) // Use actual ROI for yearly, capped
              };
            } else {
              // For Index Fund (no holdings data), estimate based on overall return
              // Index funds typically grow steadily, so distribute the yearly return across periods
              const capChange = (change: number, maxCap: number) => {
                if (Math.abs(change) > maxCap) {
                  return change > 0 ? maxCap : -maxCap;
                }
                return change;
              };

              // Estimate changes from yearly return
              const estimatedWeeklyChange = overallReturnPercent / 52;
              const estimatedDailyChange = overallReturnPercent / 365;
              const estimatedMonthlyChange = overallReturnPercent / 12;

              return {
                dailyChange: [capChange(estimatedDailyChange, 3), capChange(estimatedDailyChange, 3), capChange(estimatedDailyChange, 3)],
                weeklyChange: [capChange(estimatedWeeklyChange, 10), capChange(estimatedWeeklyChange, 10), capChange(estimatedWeeklyChange, 10)],
                thisWeekChange: [capChange(estimatedWeeklyChange * 0.7, 7), capChange(estimatedWeeklyChange * 0.7, 7), capChange(estimatedWeeklyChange * 0.7, 7)],
                monthlyChange: [capChange(estimatedMonthlyChange, 30), capChange(estimatedMonthlyChange, 30), capChange(estimatedMonthlyChange, 30)],
                quarterlyChange: capChange(overallReturnPercent / 4, 125),
                yearlyChange: capChange(overallReturnPercent, 500)
              };
            }
          };

          const sortedCategories = Object.entries(holdingsByType).sort((a, b) => b[1].totalPnL - a[1].totalPnL);

          return (
            <div style={{
              backgroundColor: 'white',
              borderRadius: '16px',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
              border: '1px solid #e5e7eb',
              overflow: 'hidden',
              width: '100%',
              maxWidth: '100%',
              marginBottom: '24px',
              gridColumn: '1 / -1'
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
                  }}>Holdings by Asset Type</h3>
                  <div style={{
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#6b7280',
                    backgroundColor: 'white',
                    padding: '6px 12px',
                    borderRadius: '20px',
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
                  }}>{Object.keys(holdingsByType).length} types</div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full" style={{backgroundColor: 'white', border: '1px solid #e5e7eb'}}>
                  <thead>
                    <tr style={{backgroundColor: '#f8fafc', borderBottom: '2px solid #e5e7eb'}}>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                        Asset Type
                      </th>
                      <th className="text-center py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                        # of Assets
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                        Total Invested
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                        Current Value
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                        Total P&L ↓
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                        Total P&L %
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                        Unrealized P&L
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                        Realized P&L
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                        % of Portfolio
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                        Daily Change
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                        Weekly Change
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                        This Week
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                        Monthly Change
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                        Quarterly Change
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                        Yearly Change
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sortedCategories.map(([category, data], index) => {
                      const pnlPercent = data.totalInvested > 0 ? (data.totalPnL / data.totalInvested) * 100 : 0;
                      const portfolioPercent = totalCapital > 0 ? (data.currentValue / totalCapital) * 100 : 0;
                      const changes = calculateCategoryChanges(data);

                      return (
                        <tr key={category} style={{
                          backgroundColor: index % 2 === 0 ? '#ffffff' : '#f9fafb',
                          borderBottom: '1px solid #f3f4f6',
                          borderLeft: `4px solid ${categoryColors[category]}`,
                          transition: 'all 0.2s ease'
                        }}>
                          <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                            <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
                              <div style={{
                                width: '12px',
                                height: '12px',
                                backgroundColor: categoryColors[category],
                                borderRadius: '3px'
                              }}></div>
                              <div style={{
                                fontSize: '16px',
                                fontWeight: '700',
                                color: '#111827'
                              }}>
                                {category}
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-6" style={{padding: '20px 24px', textAlign: 'center'}}>
                            <div style={{
                              fontSize: '16px',
                              fontWeight: '600',
                              color: '#111827'
                            }}>
                              {data.count}
                            </div>
                          </td>
                          <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                            <div style={{
                              fontSize: '16px',
                              fontWeight: '600',
                              color: '#111827'
                            }}>
                              {formatCurrency(data.totalInvested)}
                            </div>
                          </td>
                          <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                            <div style={{
                              fontSize: '16px',
                              fontWeight: '600',
                              color: '#111827'
                            }}>
                              {formatCurrency(data.currentValue)}
                            </div>
                          </td>
                          <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              padding: '8px 16px',
                              borderRadius: '20px',
                              fontSize: '14px',
                              fontWeight: '600',
                              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                              backgroundColor: data.totalPnL >= 0 ? '#dcfce7' : '#fef2f2',
                              color: data.totalPnL >= 0 ? '#166534' : '#dc2626',
                              border: `2px solid ${data.totalPnL >= 0 ? '#bbf7d0' : '#fecaca'}`,
                              width: 'fit-content'
                            }}>
                              {data.totalPnL >= 0 ? (
                                <svg style={{width: '16px', height: '16px', marginRight: '8px'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                </svg>
                              ) : (
                                <svg style={{width: '16px', height: '16px', marginRight: '8px'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0v-8m0 8l-8-8-4 4-6-6" />
                                </svg>
                              )}
                              {formatCurrency(data.totalPnL)}
                            </div>
                          </td>
                          <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                            <div style={{
                              fontSize: '14px',
                              fontWeight: '600',
                              padding: '6px 12px',
                              borderRadius: '16px',
                              backgroundColor: pnlPercent >= 0 ? '#f0fdf4' : '#fef2f2',
                              color: pnlPercent >= 0 ? '#166534' : '#dc2626',
                              border: `1px solid ${pnlPercent >= 0 ? '#bbf7d0' : '#fecaca'}`,
                              width: 'fit-content'
                            }}>
                              {formatPercentage(pnlPercent)}
                            </div>
                          </td>
                          <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                            <div style={{
                              fontSize: '15px',
                              fontWeight: '600',
                              color: data.unrealizedPnL >= 0 ? '#166534' : '#dc2626'
                            }}>
                              {formatCurrency(data.unrealizedPnL)}
                            </div>
                          </td>
                          <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                            <div style={{
                              fontSize: '15px',
                              fontWeight: '600',
                              color: data.realizedPnL >= 0 ? '#166534' : '#dc2626'
                            }}>
                              {formatCurrency(data.realizedPnL)}
                            </div>
                          </td>
                          <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                            <div style={{
                              fontSize: '14px',
                              fontWeight: '600',
                              padding: '6px 12px',
                              borderRadius: '16px',
                              backgroundColor: '#dbeafe',
                              color: '#2563eb',
                              border: '2px solid #93c5fd',
                              width: 'fit-content'
                            }}>
                              {portfolioPercent.toFixed(2)}%
                            </div>
                          </td>
                          <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                            <ThreeSegmentPill
                              values={changes.dailyChange}
                              labels={['2 days ago', 'Yesterday', 'Today']}
                            />
                          </td>
                          <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                            <ThreeSegmentPill
                              values={changes.weeklyChange}
                              labels={['2 weeks ago', 'Last week', 'This week']}
                            />
                          </td>
                          <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                            <ThreeSegmentPill
                              values={changes.thisWeekChange}
                              labels={['2 weeks ago', 'Last week', 'This week']}
                            />
                          </td>
                          <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                            <ThreeSegmentPill
                              values={changes.monthlyChange}
                              labels={['2 months ago', 'Last month', 'This month']}
                            />
                          </td>
                          <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              padding: '6px 12px',
                              borderRadius: '16px',
                              fontSize: '14px',
                              fontWeight: '600',
                              backgroundColor: changes.quarterlyChange >= 0 ? '#dcfce7' : '#fef2f2',
                              color: changes.quarterlyChange >= 0 ? '#166534' : '#dc2626',
                              border: `2px solid ${changes.quarterlyChange >= 0 ? '#bbf7d0' : '#fecaca'}`,
                              width: 'fit-content'
                            }}>
                              {changes.quarterlyChange >= 0 ? (
                                <svg style={{width: '14px', height: '14px', marginRight: '6px'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                </svg>
                              ) : (
                                <svg style={{width: '14px', height: '14px', marginRight: '6px'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0v-8m0 8l-8-8-4 4-6-6" />
                                </svg>
                              )}
                              {formatPercentage(changes.quarterlyChange)}
                            </div>
                          </td>
                          <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              padding: '6px 12px',
                              borderRadius: '16px',
                              fontSize: '14px',
                              fontWeight: '600',
                              backgroundColor: changes.yearlyChange >= 0 ? '#dcfce7' : '#fef2f2',
                              color: changes.yearlyChange >= 0 ? '#166534' : '#dc2626',
                              border: `2px solid ${changes.yearlyChange >= 0 ? '#bbf7d0' : '#fecaca'}`,
                              width: 'fit-content'
                            }}>
                              {changes.yearlyChange >= 0 ? (
                                <svg style={{width: '14px', height: '14px', marginRight: '6px'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                </svg>
                              ) : (
                                <svg style={{width: '14px', height: '14px', marginRight: '6px'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0v-8m0 8l-8-8-4 4-6-6" />
                                </svg>
                              )}
                              {formatPercentage(changes.yearlyChange)}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {/* Holdings by Sector Table */}
        {holdings.length > 0 && (() => {
          // Group holdings by sector
          // Colors for sectors - matching pie chart
          const sectorColors: {[key: string]: string} = {
            'Tech': '#3B82F6',
            'Consumer Cyclical': '#10B981',
            'Industrials': '#F59E0B',
            'Healthcare': '#EF4444',
            'Financial Services': '#8B5CF6',
            'Utilities': '#06B6D4',
            'Energy': '#F97316',
            'Materials': '#84CC16',
            'Real Estate': '#EC4899',
            'Telecommunications': '#6366F1',
            'ETF': '#9333EA',
            'Alternative Investments': '#8B5CF6',
            'Cryptocurrency': '#FBBF24',
            'Consumer Defensive': '#14B8A6',
            'Unknown': '#9CA3AF',
            'Other': '#9CA3AF'
          };

          const holdingsBySector = holdings.reduce((acc, holding) => {
            // Skip crypto and recurring investments for sector breakdown
            if (holding.type === 'c') return acc;

            // Determine sector
            let sector = holding.sector || 'Other';

            // ETFs and Index Funds should not be included in sector breakdown
            if (holding.symbol.includes('XEQT') || holding.symbol.includes('VOO') ||
                holding.symbol.includes('QQQ') || holding.symbol.includes('IBIT')) {
              return acc;
            }

            // Only include holdings that have meaningful data (currently hold shares OR have historical trading activity)
            const hasCurrentPosition = (holding.quantity || 0) > 0;
            const hasHistoricalActivity = (holding.totalInvested || 0) > 0 || (holding.realizedPnL || 0) !== 0;

            if (!hasCurrentPosition && !hasHistoricalActivity) {
              return acc; // Skip holdings with no meaningful data
            }

            if (!acc[sector]) {
              acc[sector] = {
                count: 0,
                activeCount: 0,
                totalInvested: 0,
                currentValue: 0,
                totalPnL: 0,
                unrealizedPnL: 0,
                realizedPnL: 0,
                totalAmountSold: 0,
                holdings: []
              };
            }

            acc[sector].count += 1;
            // Track active assets (quantity > 0.0001 to account for rounding artifacts)
            // Positions with 1e-9 or similar tiny values are considered fully sold
            if (holding.quantity > 0.0001) {
              acc[sector].activeCount += 1;
            }

            // Debug logging for Tech sector
            if (sector === 'Tech') {
              console.log(`🔍 Tech holding: ${holding.symbol}, quantity: ${holding.quantity}, active: ${holding.quantity > 0.0001}, totalInvested: ${holding.totalInvested}, realizedPnL: ${holding.realizedPnL}`);
            }

            acc[sector].totalInvested += holding.totalInvested || 0;
            acc[sector].currentValue += holding.currentValue || 0;
            acc[sector].totalPnL += holding.totalPnL || 0;
            acc[sector].unrealizedPnL += holding.unrealizedPnL || 0;
            acc[sector].realizedPnL += holding.realizedPnL || 0;
            acc[sector].totalAmountSold += holding.amountSold || 0;
            acc[sector].holdings.push(holding);

            return acc;
          }, {} as {[key: string]: {count: number, activeCount: number, totalInvested: number, currentValue: number, totalPnL: number, unrealizedPnL: number, realizedPnL: number, totalAmountSold: number, holdings: Holding[]}});

          // Debug: Log Tech sector details
          if (holdingsBySector['Tech']) {
            console.log(`🔍 Tech Sector Summary - Total: ${holdingsBySector['Tech'].count}, Active: ${holdingsBySector['Tech'].activeCount}`);
            console.log(`🔍 Tech holdings list:`, holdingsBySector['Tech'].holdings.map(h => `${h.symbol} (qty: ${h.quantity})`));
          }

          // Calculate time-based changes for each sector
          const calculateSectorChanges = (sectorData: any) => {
            const currentValue = sectorData.currentValue;
            const totalInvested = sectorData.totalInvested;

            // Calculate the overall return on investment
            const overallReturnPercent = totalInvested > 0 ? ((currentValue - totalInvested) / totalInvested) * 100 : 0;

            // Calculate weighted changes from REAL historical data
            if (sectorData.holdings && sectorData.holdings.length > 0) {
              const totalCurrentValue = sectorData.holdings.reduce((sum: number, h: Holding) =>
                sum + (h.currentValue || 0), 0);

              // Helper to aggregate array changes
              const aggregateArrayChanges = (field: 'dailyChangePercent' | 'weeklyChangePercent' | 'monthlyChangePercent'): number => {
                const aggregated: number[] = [0, 0, 0];
                let hasData = false;

                sectorData.holdings.forEach((h: Holding) => {
                  const changeData = h[field];
                  if (Array.isArray(changeData) && changeData.length === 3 && h.currentValue) {
                    const weight = totalCurrentValue > 0 ? h.currentValue / totalCurrentValue : 0;
                    changeData.forEach((val, idx) => {
                      aggregated[idx] += val * weight;
                    });
                    hasData = true;
                  }
                });

                // Return the latest value (index 2) as the representative change
                return hasData ? aggregated[2] : 0;
              };

              const dailyChange = aggregateArrayChanges('dailyChangePercent');
              const weeklyChange = aggregateArrayChanges('weeklyChangePercent');
              const monthlyChange = aggregateArrayChanges('monthlyChangePercent');

              const quarterlyChange = sectorData.holdings.reduce((sum: number, h: Holding) => {
                if (h.quarterlyChangePercent !== null && h.quarterlyChangePercent !== undefined && h.currentValue) {
                  const weight = totalCurrentValue > 0 ? h.currentValue / totalCurrentValue : 0;
                  return sum + (h.quarterlyChangePercent * weight);
                }
                return sum;
              }, 0);

              const capChange = (change: number, maxCap: number) => {
                if (Math.abs(change) > maxCap) {
                  return change > 0 ? maxCap : -maxCap;
                }
                return change;
              };

              return {
                dailyChange,
                weeklyChange,
                thisWeekChange: capChange(weeklyChange * 0.7, 50), // Current week progress (estimated)
                monthlyChange,
                quarterlyChange,
                yearlyChange: capChange(overallReturnPercent, 500), // Use actual ROI for yearly, capped
                overallReturn: overallReturnPercent
              };
            }

            return {
              dailyChange: 0,
              weeklyChange: 0,
              thisWeekChange: 0,
              monthlyChange: 0,
              quarterlyChange: 0,
              yearlyChange: 0,
              overallReturn: overallReturnPercent
            };
          };

          // Sort sectors by total P&L (descending)
          const sortedSectors = Object.entries(holdingsBySector).sort((a, b) => b[1].totalPnL - a[1].totalPnL);

          // Only show if there are sectors
          if (sortedSectors.length === 0) return null;

          return (
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
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                  <h3 style={{
                    fontSize: '20px',
                    fontWeight: 'bold',
                    color: '#111827'
                  }}>Holdings by Sector</h3>
                  <div style={{
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#6b7280',
                    backgroundColor: 'white',
                    padding: '6px 12px',
                    borderRadius: '20px',
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
                  }}>{Object.keys(holdingsBySector).length} sectors</div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full" style={{backgroundColor: 'white', border: '1px solid #e5e7eb'}}>
                  <thead>
                    <tr style={{backgroundColor: '#f8fafc', borderBottom: '2px solid #e5e7eb'}}>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                        Sector
                      </th>
                      <th className="text-center py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                        # Assets (Active/Total)
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                        Total Invested
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                        Current Value
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                        Total P&L ↓
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                        Total P&L %
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                        Unrealized P&L
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                        Realized P&L
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                        % of Portfolio
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                        Daily Change
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                        Weekly Change
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                        This Week
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                        Monthly Change
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                        Quarterly Change
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                        Yearly Change
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sortedSectors.map(([sector, data], index) => {
                      const pnlPercent = data.totalInvested > 0 ? (data.totalPnL / data.totalInvested) * 100 : 0;
                      const portfolioPercent = totalCapital > 0 ? (data.currentValue / totalCapital) * 100 : 0;
                      const changes = calculateSectorChanges(data);
                      const sectorColor = sectorColors[sector] || sectorColors['Other'];

                      return (
                        <tr key={sector} style={{
                          backgroundColor: index % 2 === 0 ? '#ffffff' : '#f9fafb',
                          borderBottom: '1px solid #f3f4f6',
                          borderLeft: `4px solid ${sectorColor}`,
                          transition: 'all 0.2s ease'
                        }}>
                          <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                            <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
                              <div style={{
                                width: '12px',
                                height: '12px',
                                backgroundColor: sectorColor,
                                borderRadius: '3px'
                              }}></div>
                              <div style={{
                                fontSize: '16px',
                                fontWeight: '700',
                                color: '#111827'
                              }}>
                                {sector}
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-6" style={{padding: '20px 24px', textAlign: 'center'}}>
                            <div style={{
                              fontSize: '16px',
                              fontWeight: '600',
                              color: '#111827'
                            }}>
                              {data.activeCount} / {data.count}
                            </div>
                          </td>
                          <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                            <div style={{
                              fontSize: '16px',
                              fontWeight: '600',
                              color: '#111827'
                            }}>
                              {formatCurrency(data.totalInvested)}
                            </div>
                          </td>
                          <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                            <div style={{
                              fontSize: '16px',
                              fontWeight: '600',
                              color: '#111827'
                            }}>
                              {formatCurrency(data.currentValue)}
                            </div>
                          </td>
                          <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                            <div style={{
                              fontSize: '16px',
                              fontWeight: '700',
                              color: data.totalPnL >= 0 ? '#059669' : '#dc2626',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}>
                              {data.totalPnL >= 0 ? (
                                <svg style={{width: '18px', height: '18px'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                </svg>
                              ) : (
                                <svg style={{width: '18px', height: '18px'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0v-8m0 8l-8-8-4 4-6-6" />
                                </svg>
                              )}
                              {formatCurrency(data.totalPnL)}
                            </div>
                          </td>
                          <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                            <div style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '6px 12px',
                              borderRadius: '16px',
                              fontSize: '14px',
                              fontWeight: '700',
                              backgroundColor: pnlPercent >= 0 ? '#dcfce7' : '#fef2f2',
                              color: pnlPercent >= 0 ? '#166534' : '#dc2626',
                              border: `2px solid ${pnlPercent >= 0 ? '#bbf7d0' : '#fecaca'}`
                            }}>
                              {formatPercentage(pnlPercent)}
                            </div>
                          </td>
                          <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                            <div style={{
                              fontSize: '15px',
                              fontWeight: '600',
                              color: data.unrealizedPnL >= 0 ? '#059669' : '#dc2626'
                            }}>
                              {formatCurrency(data.unrealizedPnL)}
                            </div>
                          </td>
                          <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                            <div style={{
                              fontSize: '15px',
                              fontWeight: '600',
                              color: data.realizedPnL >= 0 ? '#059669' : '#dc2626'
                            }}>
                              {formatCurrency(data.realizedPnL)}
                            </div>
                          </td>
                          <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px'
                            }}>
                              <div style={{
                                fontSize: '15px',
                                fontWeight: '600',
                                color: '#111827'
                              }}>
                                {formatPercentage(portfolioPercent)}
                              </div>
                              <div style={{
                                flex: 1,
                                height: '6px',
                                backgroundColor: '#e5e7eb',
                                borderRadius: '3px',
                                overflow: 'hidden',
                                minWidth: '40px'
                              }}>
                                <div style={{
                                  width: `${Math.min(portfolioPercent, 100)}%`,
                                  height: '100%',
                                  backgroundColor: sectorColor,
                                  transition: 'width 0.3s ease'
                                }}></div>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              padding: '6px 12px',
                              borderRadius: '16px',
                              fontSize: '14px',
                              fontWeight: '600',
                              backgroundColor: changes.dailyChange >= 0 ? '#dcfce7' : '#fef2f2',
                              color: changes.dailyChange >= 0 ? '#166534' : '#dc2626',
                              border: `2px solid ${changes.dailyChange >= 0 ? '#bbf7d0' : '#fecaca'}`,
                              width: 'fit-content'
                            }}>
                              {changes.dailyChange >= 0 ? (
                                <svg style={{width: '14px', height: '14px', marginRight: '6px'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                </svg>
                              ) : (
                                <svg style={{width: '14px', height: '14px', marginRight: '6px'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0v-8m0 8l-8-8-4 4-6-6" />
                                </svg>
                              )}
                              {formatPercentage(changes.dailyChange)}
                            </div>
                          </td>
                          <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              padding: '6px 12px',
                              borderRadius: '16px',
                              fontSize: '14px',
                              fontWeight: '600',
                              backgroundColor: changes.weeklyChange >= 0 ? '#dcfce7' : '#fef2f2',
                              color: changes.weeklyChange >= 0 ? '#166534' : '#dc2626',
                              border: `2px solid ${changes.weeklyChange >= 0 ? '#bbf7d0' : '#fecaca'}`,
                              width: 'fit-content'
                            }}>
                              {changes.weeklyChange >= 0 ? (
                                <svg style={{width: '14px', height: '14px', marginRight: '6px'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                </svg>
                              ) : (
                                <svg style={{width: '14px', height: '14px', marginRight: '6px'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0v-8m0 8l-8-8-4 4-6-6" />
                                </svg>
                              )}
                              {formatPercentage(changes.weeklyChange)}
                            </div>
                          </td>
                          <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              padding: '6px 12px',
                              borderRadius: '16px',
                              fontSize: '14px',
                              fontWeight: '600',
                              backgroundColor: changes.thisWeekChange >= 0 ? '#dcfce7' : '#fef2f2',
                              color: changes.thisWeekChange >= 0 ? '#166534' : '#dc2626',
                              border: `2px solid ${changes.thisWeekChange >= 0 ? '#bbf7d0' : '#fecaca'}`,
                              width: 'fit-content'
                            }}>
                              {changes.thisWeekChange >= 0 ? (
                                <svg style={{width: '14px', height: '14px', marginRight: '6px'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                </svg>
                              ) : (
                                <svg style={{width: '14px', height: '14px', marginRight: '6px'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0v-8m0 8l-8-8-4 4-6-6" />
                                </svg>
                              )}
                              {formatPercentage(changes.thisWeekChange)}
                            </div>
                          </td>
                          <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              padding: '6px 12px',
                              borderRadius: '16px',
                              fontSize: '14px',
                              fontWeight: '600',
                              backgroundColor: changes.monthlyChange >= 0 ? '#dcfce7' : '#fef2f2',
                              color: changes.monthlyChange >= 0 ? '#166534' : '#dc2626',
                              border: `2px solid ${changes.monthlyChange >= 0 ? '#bbf7d0' : '#fecaca'}`,
                              width: 'fit-content'
                            }}>
                              {changes.monthlyChange >= 0 ? (
                                <svg style={{width: '14px', height: '14px', marginRight: '6px'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                </svg>
                              ) : (
                                <svg style={{width: '14px', height: '14px', marginRight: '6px'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0v-8m0 8l-8-8-4 4-6-6" />
                                </svg>
                              )}
                              {formatPercentage(changes.monthlyChange)}
                            </div>
                          </td>
                          <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              padding: '6px 12px',
                              borderRadius: '16px',
                              fontSize: '14px',
                              fontWeight: '600',
                              backgroundColor: changes.quarterlyChange >= 0 ? '#dcfce7' : '#fef2f2',
                              color: changes.quarterlyChange >= 0 ? '#166534' : '#dc2626',
                              border: `2px solid ${changes.quarterlyChange >= 0 ? '#bbf7d0' : '#fecaca'}`,
                              width: 'fit-content'
                            }}>
                              {changes.quarterlyChange >= 0 ? (
                                <svg style={{width: '14px', height: '14px', marginRight: '6px'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                </svg>
                              ) : (
                                <svg style={{width: '14px', height: '14px', marginRight: '6px'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0v-8m0 8l-8-8-4 4-6-6" />
                                </svg>
                              )}
                              {formatPercentage(changes.quarterlyChange)}
                            </div>
                          </td>
                          <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              padding: '6px 12px',
                              borderRadius: '16px',
                              fontSize: '14px',
                              fontWeight: '600',
                              backgroundColor: changes.yearlyChange >= 0 ? '#dcfce7' : '#fef2f2',
                              color: changes.yearlyChange >= 0 ? '#166534' : '#dc2626',
                              border: `2px solid ${changes.yearlyChange >= 0 ? '#bbf7d0' : '#fecaca'}`,
                              width: 'fit-content'
                            }}>
                              {changes.yearlyChange >= 0 ? (
                                <svg style={{width: '14px', height: '14px', marginRight: '6px'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                </svg>
                              ) : (
                                <svg style={{width: '14px', height: '14px', marginRight: '6px'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0v-8m0 8l-8-8-4 4-6-6" />
                                </svg>
                              )}
                              {formatPercentage(changes.yearlyChange)}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

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
                }}>Active Trading Holdings</h3>
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
                <div style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: '2px solid #e5e7eb',
                  fontSize: '16px',
                  fontWeight: '700',
                  backgroundColor: '#f8fafc',
                  color: '#111827'
                }}>
                  {formatCurrency(totalCapital)}
                </div>
                <div style={{
                  fontSize: '12px',
                  color: '#6b7280',
                  backgroundColor: '#f3f4f6',
                  padding: '4px 8px',
                  borderRadius: '12px'
                }}>
                  Auto-calculated from net portfolio value
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
                      Daily Change %
                    </th>
                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                      Weekly Change %
                    </th>
                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                      Monthly Change %
                    </th>
                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                      % of Portfolio
                      <div style={{fontSize: '10px', fontWeight: '400', color: '#6b7280', marginTop: '2px', textTransform: 'none'}}>
                        (based on net invested)
                      </div>
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
                      <td className="py-4 px-6" style={{padding: '10px 12px'}}>
                        <div style={{display: 'flex', gap: '6px', alignItems: 'stretch'}}>
                          {/* Total P&L - Left side */}
                          <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            padding: '6px 10px',
                            borderRadius: '8px',
                            backgroundColor: (holding.totalPnL && holding.totalPnL >= 0) ? '#dcfce7' : '#fef2f2',
                            border: `1px solid ${(holding.totalPnL && holding.totalPnL >= 0) ? '#bbf7d0' : '#fecaca'}`,
                            minWidth: '110px'
                          }}>
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              marginBottom: '1px'
                            }}>
                              <div style={{
                                fontSize: '9px',
                                fontWeight: '600',
                                color: '#6b7280',
                                textTransform: 'uppercase',
                                letterSpacing: '0.3px'
                              }}>Total</div>
                              {(holding.totalPnL && holding.totalPnL >= 0) ? (
                                <svg style={{width: '10px', height: '10px'}} fill="none" stroke="#166534" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                </svg>
                              ) : (
                                <svg style={{width: '10px', height: '10px'}} fill="none" stroke="#dc2626" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0v-8m0 8l-8-8-4 4-6-6" />
                                </svg>
                              )}
                            </div>
                            <div style={{
                              fontSize: '14px',
                              fontWeight: '700',
                              color: (holding.totalPnL && holding.totalPnL >= 0) ? '#166534' : '#dc2626',
                              lineHeight: '1.2'
                            }}>
                              {formatCurrency(holding.totalPnL)}
                            </div>
                            <div style={{
                              fontSize: '11px',
                              fontWeight: '600',
                              color: (holding.totalPnL && holding.totalPnL >= 0) ? '#166534' : '#dc2626',
                              lineHeight: '1.2'
                            }}>
                              {formatPercentage(holding.totalPnLPercent)}
                            </div>
                          </div>

                          {/* Unrealized & Realized - Right side stacked */}
                          <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '3px',
                            justifyContent: 'center'
                          }}>
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: '#f9fafb',
                              border: '1px solid #e5e7eb'
                            }}>
                              <div style={{
                                fontSize: '8px',
                                fontWeight: '600',
                                color: '#9ca3af',
                                textTransform: 'uppercase',
                                whiteSpace: 'nowrap'
                              }}>Unr:</div>
                              <div style={{
                                fontSize: '10px',
                                fontWeight: '600',
                                color: (holding.unrealizedPnL && holding.unrealizedPnL >= 0) ? '#059669' : '#dc2626'
                              }}>
                                {formatCurrency(holding.unrealizedPnL)}
                              </div>
                            </div>

                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: '#f9fafb',
                              border: '1px solid #e5e7eb'
                            }}>
                              <div style={{
                                fontSize: '8px',
                                fontWeight: '600',
                                color: '#9ca3af',
                                textTransform: 'uppercase',
                                whiteSpace: 'nowrap'
                              }}>Rea:</div>
                              <div style={{
                                fontSize: '10px',
                                fontWeight: '600',
                                color: (holding.realizedPnL && holding.realizedPnL >= 0) ? '#059669' : '#dc2626'
                              }}>
                                {formatCurrency(holding.realizedPnL)}
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                        {Array.isArray(holding.dailyChangePercent) ? (
                          <ThreeSegmentPill
                            values={holding.dailyChangePercent}
                            labels={['2 days ago', 'Yesterday', 'Today']}
                          />
                        ) : (
                          <ThreeSegmentPill values={[]} />
                        )}
                      </td>
                      <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                        {Array.isArray(holding.weeklyChangePercent) ? (
                          <ThreeSegmentPill
                            values={holding.weeklyChangePercent}
                            labels={['2 weeks ago', 'Last week', 'This week']}
                          />
                        ) : (
                          <ThreeSegmentPill values={[]} />
                        )}
                      </td>
                      <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                        {Array.isArray(holding.monthlyChangePercent) ? (
                          <ThreeSegmentPill
                            values={holding.monthlyChangePercent}
                            labels={['2 months ago', 'Last month', 'This month']}
                          />
                        ) : (
                          <ThreeSegmentPill values={[]} />
                        )}
                      </td>
                      <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                        {(() => {
                          const netInvested = calculateNetInvested(holding.totalAmountInvested, holding.amountSold);
                          const percentage = totalCapital > 0 ? (netInvested / totalCapital) * 100 : 0;

                          // Color coding: Purple > 5%, Blue 1-5%, Green <= 1%
                          let backgroundColor, textColor, borderColor;
                          if (percentage > 5) {
                            backgroundColor = '#f3e8ff'; // Purple
                            textColor = '#6b21a8';
                            borderColor = '#e9d5ff';
                          } else if (percentage > 1) {
                            backgroundColor = '#dbeafe'; // Blue
                            textColor = '#2563eb';
                            borderColor = '#93c5fd';
                          } else {
                            backgroundColor = '#dcfce7'; // Green
                            textColor = '#166534';
                            borderColor = '#bbf7d0';
                          }

                          return (
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              padding: '6px 12px',
                              borderRadius: '16px',
                              fontSize: '14px',
                              fontWeight: '600',
                              backgroundColor,
                              color: textColor,
                              border: `2px solid ${borderColor}`
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