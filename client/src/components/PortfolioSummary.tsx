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
  subsector?: string | string[] | null;
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
  analystTargetMean?: number | null; // Analyst mean price target
  analystCount?: number | null; // Number of analysts
  insiderSentiment?: string | null; // STRONG_BUY / BUY / NEUTRAL / SELL / HEAVY_SELL
  insiderHasData?: boolean | null; // false = Finnhub has no SEC filings (non-US stock)
  insiderBuyCount?: number | null;
  insiderSellCount?: number | null;
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
        padding: '2px 6px',
        borderRadius: '2px',
        fontSize: '12px',
        fontWeight: '500',
        backgroundColor: '#141820',
        color: '#4a5568',
        border: '1px solid #1e2535',
        fontFamily: "'IBM Plex Mono', monospace",
      }}>
        —
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
      {[...values].reverse().map((value, index) => {
        const originalIndex = values.length - 1 - index;
        const isPositive = value >= 0;
        const isHighPositive = value > 10;
        const formattedValue = (isPositive ? '+' : '') + value.toFixed(1);

        let backgroundColor, color, borderColor;
        if (isHighPositive) {
          backgroundColor = 'rgba(79,143,255,0.12)'; color = '#4f8fff'; borderColor = 'rgba(79,143,255,0.25)';
        } else if (isPositive) {
          backgroundColor = 'rgba(34,197,94,0.12)'; color = '#22c55e'; borderColor = 'rgba(34,197,94,0.25)';
        } else if (value > -10) {
          backgroundColor = 'rgba(239,68,68,0.12)'; color = '#ef4444'; borderColor = 'rgba(239,68,68,0.25)';
        } else {
          backgroundColor = 'rgba(168,85,247,0.12)'; color = '#a855f7'; borderColor = 'rgba(168,85,247,0.25)';
        }

        return (
          <div
            key={index}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '2px 5px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: '700',
              backgroundColor,
              color,
              border: `1px solid ${borderColor}`,
              minWidth: '42px',
              whiteSpace: 'nowrap',
              cursor: labels ? 'help' : 'default',
              fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
            }}
            title={labels ? labels[originalIndex] : undefined}
          >
            {formattedValue}
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
  const [showInactiveHoldings, setShowInactiveHoldings] = useState(true);
  const [sortColumn, setSortColumn] = useState<string>('pnl');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
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

  // Fetch analyst price targets and insider sentiment for stock holdings
  const { data: analystData } = useQuery(
    ['portfolio-analyst-data', holdings.filter(h => h.type !== 'c').map(h => h.symbol).join(',')],
    async () => {
      const stockSymbols = holdings.filter(h => h.type !== 'c' && (h.quantity || 0) > 0.01).map(h => h.symbol);
      if (stockSymbols.length === 0) return { targets: {}, insiders: {} };
      const [targetsRes, insidersRes] = await Promise.all([
        axios.post('/api/analyst/price-targets/batch', { symbols: stockSymbols }),
        axios.post('/api/analyst/insider/batch', { symbols: stockSymbols }),
      ]);
      return { targets: targetsRes.data.targets || {}, insiders: insidersRes.data.insiders || {} };
    },
    {
      enabled: holdings.length > 0,
      staleTime: 60 * 60 * 1000,
      cacheTime: 2 * 60 * 60 * 1000,
      retry: 1,
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
  }, [activePortfolio, activeHoldings, persistentPortfolio, weeklyChanges, dailyChanges, monthlyChanges, quarterlyChanges, positionHistory, analystData]);

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
        const totalAmtInvested = holding.totalAmountInvested || holding.totalInvested || 0;
        const netInvested = totalAmtInvested - (holding.amountSold || 0);
        const pnlDenominator = (totalPnL >= 0 && netInvested > 0) ? netInvested : totalAmtInvested;
        const totalPnLPercent = pnlDenominator > 0 ? (totalPnL / pnlDenominator) * 100 : 0;
        
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
          subsector: holding.subsector || cachedPrice?.subsector || null,
          currentPrice: currentPrice,
          currentValue: currentValue,
          unrealizedPnL: unrealizedPnL,
          totalPnL: totalPnL,
          totalPnLPercent: totalPnLPercent,
          cacheUsed: !!cachedPrice,
          weeklyChangePercent: weeklyChange !== undefined ? weeklyChange : null,
          dailyChangePercent: dailyChange !== undefined ? dailyChange : null,
          monthlyChangePercent: monthlyChange !== undefined ? monthlyChange : null,
          quarterlyChangePercent: quarterlyChange !== undefined ? quarterlyChange : null,
          analystTargetMean: analystData?.targets?.[symbol]?.targetMean ?? null,
          analystCount: analystData?.targets?.[symbol]?.analystCount ?? null,
          insiderSentiment: analystData?.insiders?.[symbol]?.sentiment ?? null,
          insiderHasData: analystData?.insiders?.[symbol]?.hasData ?? null,
          insiderBuyCount: analystData?.insiders?.[symbol]?.buyCount ?? null,
          insiderSellCount: analystData?.insiders?.[symbol]?.sellCount ?? null,
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
      const tradingNetInvested = totalAmountInvested - totalAmountSold;
      const tradingPnlDenominator = (tradingTotalPnL >= 0 && tradingNetInvested > 0) ? tradingNetInvested : totalAmountInvested;
      const tradingTotalPnLPercent = tradingPnlDenominator > 0 ? (tradingTotalPnL / tradingPnlDenominator) * 100 : 0;

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
      const combinedNetInvested = combinedTotalInvested - totalAmountSold;
      const combinedPnlDenominator = (combinedTotalPnL >= 0 && combinedNetInvested > 0) ? combinedNetInvested : combinedTotalInvested;
      const combinedTotalPnLPercent = combinedPnlDenominator > 0 ? (combinedTotalPnL / combinedPnlDenominator) * 100 : 0;

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
      <div style={{ background: '#141820', borderRadius: '6px', border: '1px solid #1e2535', overflow: 'hidden' }}>
        <div style={{ background: '#141820', borderBottom: '1px solid #1e2535', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase' as const, marginBottom: '4px' }}>Portfolio Summary</div>
            <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0 }}>Loading investment data…</p>
            <p style={{ color: '#4a5568', fontSize: '12px', margin: '4px 0 0' }}>This may take up to 60 seconds while fetching current prices</p>
          </div>
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-t-transparent" style={{ borderColor: '#00d4aa', borderTopColor: 'transparent' }}></div>
        </div>
        <div style={{ padding: '24px', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '120px' }}>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '8px' }}>
            <div style={{ height: '8px', background: '#1e2535', borderRadius: '2px', width: '200px' }}></div>
            <div style={{ height: '8px', background: '#1e2535', borderRadius: '2px', width: '140px' }}></div>
          </div>
        </div>
      </div>
    );
  }

  if (cacheError || error) {
    console.log('❌ PortfolioSummary: Rendering error state:', { cacheError, error });
    return (
      <div style={{ padding: '16px 20px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px' }}>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', fontWeight: 700, color: '#ef4444', letterSpacing: '0.1em', marginBottom: '8px' }}>PORTFOLIO SUMMARY ERROR</div>
        <div style={{ fontSize: '13px', color: '#94a3b8' }}>Cache Error: {cacheError}</div>
        {error && <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>Processing Error: {error}</div>}
        <button onClick={refreshCache} style={{ marginTop: 12, padding: '5px 14px', borderRadius: '2px', border: '1px solid #1e2535', background: '#141820', color: '#94a3b8', cursor: 'pointer', fontSize: '12px', fontFamily: "'IBM Plex Mono', monospace" }}>Refresh Cache</button>
      </div>
    );
  }

  // Sort handler for the Active Trading Holdings table
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  const getSortedHoldings = (list: Holding[]) => {
    return [...list].sort((a, b) => {
      let aVal: number, bVal: number;
      switch (sortColumn) {
        case 'symbol': {
          const cmp = a.symbol.localeCompare(b.symbol);
          return sortDirection === 'asc' ? cmp : -cmp;
        }
        case 'currentValue': aVal = a.currentValue || 0; bVal = b.currentValue || 0; break;
        case 'totalInvested': aVal = a.totalAmountInvested || 0; bVal = b.totalAmountInvested || 0; break;
        case 'pnlPercent': aVal = a.totalPnLPercent || 0; bVal = b.totalPnLPercent || 0; break;
        case 'portfolio': {
          aVal = a.totalAmountInvested ? (a.totalAmountInvested - (a.amountSold || 0)) : 0;
          bVal = b.totalAmountInvested ? (b.totalAmountInvested - (b.amountSold || 0)) : 0;
          break;
        }
        case 'analystUpside': {
          const aUp = a.analystTargetMean && a.currentPrice ? ((a.analystTargetMean - a.currentPrice) / a.currentPrice) * 100 : -999;
          const bUp = b.analystTargetMean && b.currentPrice ? ((b.analystTargetMean - b.currentPrice) / b.currentPrice) * 100 : -999;
          aVal = aUp; bVal = bUp; break;
        }
        case 'dailyChange': {
          const aArr = Array.isArray(a.dailyChangePercent) ? a.dailyChangePercent : [];
          const bArr = Array.isArray(b.dailyChangePercent) ? b.dailyChangePercent : [];
          aVal = aArr[aArr.length - 1] ?? 0; bVal = bArr[bArr.length - 1] ?? 0; break;
        }
        case 'weeklyChange': {
          const aArr = Array.isArray(a.weeklyChangePercent) ? a.weeklyChangePercent : [];
          const bArr = Array.isArray(b.weeklyChangePercent) ? b.weeklyChangePercent : [];
          aVal = aArr[aArr.length - 1] ?? 0; bVal = bArr[bArr.length - 1] ?? 0; break;
        }
        default: aVal = a.totalPnL || 0; bVal = b.totalPnL || 0; // 'pnl' (default)
      }
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });
  };

  const SortableHeader: React.FC<{ column: string; label: string; subLabel?: string }> = ({ column, label, subLabel }) => {
    const active = sortColumn === column;
    return (
      <button
        onClick={() => handleSort(column)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          textAlign: 'left',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
          <span style={{
            fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
            color: active ? '#00d4aa' : '#4a5568',
            fontWeight: '600',
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.14em'
          }}>
            {label}
          </span>
          <span style={{ color: active ? '#00d4aa' : '#4a5568', fontSize: '11px' }}>
            {active ? (sortDirection === 'desc' ? '▼' : '▲') : '⇅'}
          </span>
        </div>
        {subLabel && <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', fontWeight: '400', color: '#4a5568', textTransform: 'none', letterSpacing: '0.06em' }}>{subLabel}</span>}
      </button>
    );
  };

  console.log('✅ PortfolioSummary: Rendering success state with', holdings.length, 'holdings');
  return (
    <>

      <div style={{ padding: '16px', width: '100%', maxWidth: '100%' }}>
        {/* Grid layout: Summary cards and Recurring Investments on left, Profit chart on right */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr minmax(0, 45%)', gap: '24px', marginBottom: '24px' }}>
          {/* Left side: Summary and Recurring Investments */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {summary && tradingSummary && (
              <div style={{
                backgroundColor: '#141820',
                borderRadius: '6px',
                border: '1px solid #1e2535',
                overflow: 'hidden',
                width: '100%'
              }}>
                <div style={{
                  background: '#141820',
                  padding: '14px 20px',
                  borderBottom: '1px solid #1e2535'
                }}>
                  <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                    <div style={{ fontFamily: "'IBM Plex Mono', 'Courier New', monospace", fontSize: '12px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase' as const }}>Portfolio Summary</div>
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
                      padding: '14px 16px',
                      display: 'grid',
                      gridTemplateColumns: '140px repeat(5, 1fr)',
                      gap: '12px',
                      alignItems: 'center',
                      borderBottom: '1px solid #1e2535',
                      borderRight: '2px solid #1e2535',
                      background: '#141820'
                    }}>
                      <div style={{textAlign: 'left'}}>
                        <div style={{
                          fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
                          fontSize: '12px',
                          color: '#00d4aa',
                          fontWeight: '700',
                          letterSpacing: '0.12em',
                          textTransform: 'uppercase' as const
                        }}>
                          Total Portfolio
                        </div>
                      </div>
                      <div style={{textAlign: 'center'}}>
                        <div style={{
                          fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
                          fontSize: '17px',
                          fontWeight: '600',
                          color: '#e2e8f0',
                          marginBottom: '4px'
                        }}>
                          {formatCurrency(summary.totalInvested)}
                        </div>
                        <div style={{
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: '10px',
                          color: '#4a5568',
                          letterSpacing: '0.06em',
                          marginTop: '2px'
                        }}>
                          Total Invested
                        </div>
                      </div>
                      <div style={{textAlign: 'center'}}>
                        <div style={{
                          fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
                          fontSize: '17px',
                          fontWeight: '600',
                          color: '#e2e8f0',
                          marginBottom: '4px'
                        }}>
                          {formatCurrency(summary.currentTotalValue)}
                        </div>
                        <div style={{
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: '10px',
                          color: '#4a5568',
                          letterSpacing: '0.06em',
                          marginTop: '2px'
                        }}>
                          Current Value
                        </div>
                      </div>
                      <div style={{textAlign: 'center'}}>
                        <div style={{
                          fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
                          fontSize: '17px',
                          fontWeight: '600',
                          color: summary.totalUnrealizedPnL && summary.totalUnrealizedPnL >= 0 ? '#22c55e' : '#ef4444',
                          marginBottom: '2px'
                        }}>
                          {formatCurrency(summary.totalUnrealizedPnL)}
                        </div>
                        <div style={{
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: '11px',
                          fontWeight: '600',
                          color: summary.totalUnrealizedPnL && summary.totalUnrealizedPnL >= 0 ? '#22c55e' : '#ef4444',
                          marginBottom: '2px'
                        }}>
                          {summary.totalUnrealizedPnL && summary.totalUnrealizedPnL >= 0 ? '↑' : '↓'} {summary.totalInvested > 0 ? formatPercentage((summary.totalUnrealizedPnL || 0) / summary.totalInvested * 100) : '0.00%'}
                        </div>
                        <div style={{
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: '10px',
                          color: '#4a5568',
                          letterSpacing: '0.06em',
                        }}>
                          Unrealized P/L
                        </div>
                      </div>
                      <div style={{textAlign: 'center'}}>
                        <div style={{
                          fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
                          fontSize: '17px',
                          fontWeight: '600',
                          color: summary.totalRealized && summary.totalRealized >= 0 ? '#22c55e' : '#ef4444',
                          marginBottom: '2px'
                        }}>
                          {formatCurrency(summary.totalRealized)}
                        </div>
                        <div style={{
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: '10px',
                          color: '#4a5568',
                          letterSpacing: '0.06em',
                        }}>
                          Realized P/L
                        </div>
                      </div>
                      <div style={{textAlign: 'center'}}>
                        <div style={{
                          fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
                          fontSize: '17px',
                          fontWeight: '600',
                          color: summary.totalPnL && summary.totalPnL >= 0 ? '#22c55e' : '#ef4444',
                          marginBottom: '2px'
                        }}>
                          {formatCurrency(summary.totalPnL)}
                        </div>
                        <div style={{
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: '11px',
                          fontWeight: '600',
                          color: summary.totalPnL && summary.totalPnL >= 0 ? '#22c55e' : '#ef4444',
                          marginBottom: '2px'
                        }}>
                          {summary.totalPnL && summary.totalPnL >= 0 ? '↑' : '↓'} {summary.totalInvested > 0 ? formatPercentage((summary.totalPnL || 0) / summary.totalInvested * 100) : '0.00%'}
                        </div>
                        <div style={{
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: '10px',
                          color: '#4a5568',
                          letterSpacing: '0.06em',
                        }}>
                          Total P/L
                        </div>
                      </div>
                    </div>

                    {/* Rows: Stocks+ETFs and Crypto */}
                    {holdings.length > 0 && (() => {
                      const seH = holdings.filter(h => h.type !== 'c');
                      const crH = holdings.filter(h => h.type === 'c');

                      const seCurrentValue = seH.reduce((s, h) => s + (h.currentValue || 0), 0);
                      const seTotalInvested = seH.reduce((s, h) => s + (h.totalInvested || 0), 0);
                      const seUnrealized = seH.reduce((s, h) => s + (h.unrealizedPnL || 0), 0);
                      const seRealized = seH.reduce((s, h) => s + (h.realizedPnL || 0), 0);
                      const seTotalPnL = seUnrealized + seRealized;
                      const seTai = seH.reduce((s, h) => s + (h.totalAmountInvested || h.totalInvested || 0), 0);
                      const seAmtSold = seH.reduce((s, h) => s + (h.amountSold || 0), 0);
                      const seNi = seTai - seAmtSold;
                      const seDen = (seTotalPnL >= 0 && seNi > 0) ? seNi : (seTai || 1);
                      const sePct = (seTotalPnL / seDen) * 100;

                      const crCurrentValue = crH.reduce((s, h) => s + (h.currentValue || 0), 0);
                      const crTotalInvested = crH.reduce((s, h) => s + (h.totalInvested || 0), 0);
                      const crUnrealized = crH.reduce((s, h) => s + (h.unrealizedPnL || 0), 0);
                      const crRealized = crH.reduce((s, h) => s + (h.realizedPnL || 0), 0);
                      const crTotalPnL = crUnrealized + crRealized;
                      const crTai = crH.reduce((s, h) => s + (h.totalAmountInvested || h.totalInvested || 0), 0);
                      const crAmtSold = crH.reduce((s, h) => s + (h.amountSold || 0), 0);
                      const crNi = crTai - crAmtSold;
                      const crDen = (crTotalPnL >= 0 && crNi > 0) ? crNi : (crTai || 1);
                      const crPct = (crTotalPnL / crDen) * 100;

                      const rowStyle: React.CSSProperties = { padding: '14px 16px', display: 'grid', gridTemplateColumns: '140px repeat(5, 1fr)', gap: '12px', alignItems: 'center', borderTop: '1px solid #1e2535', borderRight: '2px solid #1e2535', background: '#141820' };
                      const f = "'IBM Plex Mono', 'Courier New', monospace";
                      const pc = (v: number) => v >= 0 ? '#22c55e' : '#ef4444';

                      return (
                        <>
                          <div style={rowStyle}>
                            <div style={{ fontFamily: f, fontSize: '12px', color: '#3b82f6', fontWeight: '700', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Stocks + ETFs</div>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontFamily: f, fontSize: '17px', fontWeight: '600', color: '#e2e8f0', marginBottom: '2px' }}>{formatCurrency(seTotalInvested)}</div>
                              <div style={{ fontSize: '10px', color: '#4a5568', letterSpacing: '0.06em', fontFamily: f }}>Total Invested</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontFamily: f, fontSize: '17px', fontWeight: '600', color: '#e2e8f0', marginBottom: '2px' }}>{formatCurrency(seCurrentValue)}</div>
                              <div style={{ fontSize: '10px', color: '#4a5568', letterSpacing: '0.06em', fontFamily: f }}>Current Value</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontFamily: f, fontSize: '17px', fontWeight: '600', color: pc(seUnrealized), marginBottom: '2px' }}>{formatCurrency(seUnrealized)}</div>
                              <div style={{ fontSize: '10px', color: '#4a5568', letterSpacing: '0.06em', fontFamily: f }}>Unrealized P/L</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontFamily: f, fontSize: '17px', fontWeight: '600', color: pc(seRealized), marginBottom: '2px' }}>{formatCurrency(seRealized)}</div>
                              <div style={{ fontSize: '10px', color: '#4a5568', letterSpacing: '0.06em', fontFamily: f }}>Realized P/L</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginBottom: '2px' }}>
                                <span style={{ fontFamily: f, fontSize: '17px', fontWeight: '600', color: pc(seTotalPnL) }}>{formatCurrency(seTotalPnL)}</span>
                                <span style={{ fontSize: '11px', color: pc(seTotalPnL) }}>{sePct >= 0 ? '+' : ''}{sePct.toFixed(1)}%</span>
                              </div>
                              <div style={{ fontSize: '10px', color: '#4a5568', letterSpacing: '0.06em', fontFamily: f }}>Total P/L</div>
                            </div>
                          </div>
                          <div style={rowStyle}>
                            <div style={{ fontFamily: f, fontSize: '12px', color: '#f59e0b', fontWeight: '700', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Crypto</div>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontFamily: f, fontSize: '17px', fontWeight: '600', color: '#e2e8f0', marginBottom: '2px' }}>{formatCurrency(crTotalInvested)}</div>
                              <div style={{ fontSize: '10px', color: '#4a5568', letterSpacing: '0.06em', fontFamily: f }}>Total Invested</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontFamily: f, fontSize: '17px', fontWeight: '600', color: '#e2e8f0', marginBottom: '2px' }}>{formatCurrency(crCurrentValue)}</div>
                              <div style={{ fontSize: '10px', color: '#4a5568', letterSpacing: '0.06em', fontFamily: f }}>Current Value</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontFamily: f, fontSize: '17px', fontWeight: '600', color: pc(crUnrealized), marginBottom: '2px' }}>{formatCurrency(crUnrealized)}</div>
                              <div style={{ fontSize: '10px', color: '#4a5568', letterSpacing: '0.06em', fontFamily: f }}>Unrealized P/L</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontFamily: f, fontSize: '17px', fontWeight: '600', color: pc(crRealized), marginBottom: '2px' }}>{formatCurrency(crRealized)}</div>
                              <div style={{ fontSize: '10px', color: '#4a5568', letterSpacing: '0.06em', fontFamily: f }}>Realized P/L</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginBottom: '2px' }}>
                                <span style={{ fontFamily: f, fontSize: '17px', fontWeight: '600', color: pc(crTotalPnL) }}>{formatCurrency(crTotalPnL)}</span>
                                <span style={{ fontSize: '11px', color: pc(crTotalPnL) }}>{crPct >= 0 ? '+' : ''}{crPct.toFixed(1)}%</span>
                              </div>
                              <div style={{ fontSize: '10px', color: '#4a5568', letterSpacing: '0.06em', fontFamily: f }}>Total P/L</div>
                            </div>
                          </div>
                          {recurringInvestments?.totals && (() => {
                            const ri = recurringInvestments.totals;
                            const riPct = ri.totalInvested > 0 ? (ri.profitLoss / ri.totalInvested) * 100 : 0;
                            return (
                              <div style={rowStyle}>
                                <div style={{ fontFamily: f, fontSize: '12px', color: '#DC2626', fontWeight: '700', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Index Funds</div>
                                <div style={{ textAlign: 'center' }}>
                                  <div style={{ fontFamily: f, fontSize: '17px', fontWeight: '600', color: '#e2e8f0', marginBottom: '2px' }}>{formatCurrency(ri.totalInvested)}</div>
                                  <div style={{ fontSize: '10px', color: '#4a5568', letterSpacing: '0.06em', fontFamily: f }}>Total Invested</div>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                  <div style={{ fontFamily: f, fontSize: '17px', fontWeight: '600', color: '#e2e8f0', marginBottom: '2px' }}>{formatCurrency(ri.currentValue)}</div>
                                  <div style={{ fontSize: '10px', color: '#4a5568', letterSpacing: '0.06em', fontFamily: f }}>Current Value</div>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                  <div style={{ fontFamily: f, fontSize: '17px', fontWeight: '600', color: pc(ri.profitLoss), marginBottom: '2px' }}>{formatCurrency(ri.profitLoss)}</div>
                                  <div style={{ fontSize: '10px', color: '#4a5568', letterSpacing: '0.06em', fontFamily: f }}>Unrealized P/L</div>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                  <div style={{ fontFamily: f, fontSize: '17px', fontWeight: '600', color: '#4a5568', marginBottom: '2px' }}>—</div>
                                  <div style={{ fontSize: '10px', color: '#4a5568', letterSpacing: '0.06em', fontFamily: f }}>Realized P/L</div>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginBottom: '2px' }}>
                                    <span style={{ fontFamily: f, fontSize: '17px', fontWeight: '600', color: pc(ri.profitLoss) }}>{formatCurrency(ri.profitLoss)}</span>
                                    <span style={{ fontSize: '11px', color: pc(ri.profitLoss) }}>{riPct >= 0 ? '+' : ''}{riPct.toFixed(1)}%</span>
                                  </div>
                                  <div style={{ fontSize: '10px', color: '#4a5568', letterSpacing: '0.06em', fontFamily: f }}>Total P/L</div>
                                </div>
                              </div>
                            );
                          })()}
                        </>
                      );
                    })()}
                  </div>

                  {/* Right side: All-Time Performance (spans both rows) */}
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: '16px 20px',
                    background: 'rgba(168,85,247,0.06)',
                    borderLeft: '1px solid rgba(168,85,247,0.2)'
                  }}>
                    <div style={{
                      fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
                      fontSize: '12px',
                      color: '#a855f7',
                      fontWeight: '700',
                      marginBottom: '4px',
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase' as const
                    }}>
                      All-Time
                    </div>
                    <div style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: '12px',
                      color: '#4a5568',
                      marginBottom: '14px',
                      textAlign: 'center'
                    }}>
                      Current + Realized
                    </div>

                    <div style={{marginBottom: '14px', textAlign: 'center'}}>
                      <div style={{
                        fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
                        fontSize: '22px',
                        fontWeight: '600',
                        color: summary.totalPnL && summary.totalPnL >= 0 ? '#22c55e' : '#ef4444',
                        marginBottom: '4px',
                      }}>
                        {formatCurrency(summary.totalPnL)}
                      </div>
                      <div style={{
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: '10px',
                        color: '#4a5568',
                        letterSpacing: '0.06em',
                        marginTop: '2px'
                      }}>
                        Total P/L
                      </div>
                    </div>

                    <div style={{textAlign: 'center'}}>
                      <div style={{
                        fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
                        fontSize: '22px',
                        fontWeight: '600',
                        color: summary.totalPnLPercent && summary.totalPnLPercent >= 0 ? '#22c55e' : '#ef4444',
                        marginBottom: '4px',
                      }}>
                        {formatPercentage(summary.totalPnLPercent)}
                      </div>
                      <div style={{
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: '10px',
                        color: '#4a5568',
                        letterSpacing: '0.06em',
                        marginTop: '2px'
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
            <div style={{ display: 'flex', width: '100%', height: '100%' }}>
              <ProfitByAssetTypeBarChart
                holdings={holdings}
                recurringInvestments={recurringInvestments?.investments || []}
              />
            </div>
          )}
        </div>

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
                totalAmountInvested: 0,
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
            acc[category].totalAmountInvested += holding.totalAmountInvested || holding.totalInvested || 0;
            acc[category].currentValue += holding.currentValue || 0;
            acc[category].totalPnL += holding.totalPnL || 0;
            acc[category].unrealizedPnL += holding.unrealizedPnL || 0;
            acc[category].realizedPnL += holding.realizedPnL || 0;
            acc[category].totalAmountSold += holding.amountSold || 0;
            acc[category].holdings.push(holding);

            return acc;
          }, {} as {[key: string]: {count: number, totalInvested: number, totalAmountInvested: number, currentValue: number, totalPnL: number, unrealizedPnL: number, realizedPnL: number, totalAmountSold: number, holdings: Holding[]}});

          // Add recurring investments as Index Fund category
          if (recurringInvestments?.totals) {
            holdingsByType['Index Fund'] = {
              count: recurringInvestments.investments?.length || 0,
              totalInvested: recurringInvestments.totals.totalInvested,
              totalAmountInvested: recurringInvestments.totals.totalInvested,
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
              backgroundColor: '#141820',
              borderRadius: '6px',
              border: '1px solid #1e2535',
              overflow: 'hidden',
              width: '100%',
              maxWidth: '100%',
              marginBottom: '14px',
              gridColumn: '1 / -1'
            }}>
              <div style={{
                background: '#141820',
                padding: '12px 20px'
              }}>
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                  <div style={{ fontFamily: "'IBM Plex Mono', 'Courier New', monospace", fontSize: '12px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase' as const }}>Holdings by Asset Type</div>
                  <div style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#4a5568',
                    backgroundColor: '#0a0c10',
                    padding: '3px 10px',
                    borderRadius: '2px',
                    border: '1px solid #1e2535'
                  }}>{Object.keys(holdingsByType).length} types</div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full" style={{backgroundColor: '#141820', borderCollapse: 'collapse'}}>
                  <thead>
                    <tr style={{backgroundColor: '#141820'}}>
                      {(['Type','#','Invested','Value','P&L','P&L%','Unrlzd','Rlzd','Alloc%','Day','Week','This Wk','Month','Qtr','YTD']).map(h => (
                        <th key={h} style={{fontFamily: "'IBM Plex Mono','Courier New',monospace", backgroundColor: '#141820', color: '#4a5568', fontSize: '11px', fontWeight: '600', padding: '0 8px 7px', textTransform: 'uppercase' as const, letterSpacing: '0.14em', textAlign: 'left', whiteSpace: 'nowrap' as const}}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCategories.map(([category, data], index) => {
                      const catNetInvested = data.totalAmountInvested - data.totalAmountSold;
                      const catPnlDenominator = (data.totalPnL >= 0 && catNetInvested > 0) ? catNetInvested : data.totalAmountInvested;
                      const pnlPercent = catPnlDenominator > 0 ? (data.totalPnL / catPnlDenominator) * 100 : 0;
                      const unrealizedPercent = catPnlDenominator > 0 ? (data.unrealizedPnL / catPnlDenominator) * 100 : 0;
                      const realizedPercent = catPnlDenominator > 0 ? (data.realizedPnL / catPnlDenominator) * 100 : 0;
                      const portfolioPercent = totalCapital > 0 ? (data.currentValue / totalCapital) * 100 : 0;
                      const changes = calculateCategoryChanges(data);

                      return (
                        <tr key={category} style={{
                          backgroundColor: '#141820',
                          borderBottom: '1px solid #1e2535',
                          borderLeft: `3px solid ${categoryColors[category]}`,
                        }}>
                          <td style={{padding: '7px 8px'}}>
                            <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                              <div style={{
                                width: '8px',
                                height: '8px',
                                backgroundColor: categoryColors[category],
                                borderRadius: '2px',
                                flexShrink: 0
                              }}></div>
                              <div style={{
                                fontFamily: "'IBM Plex Sans', sans-serif",
                                fontSize: '13px',
                                fontWeight: 500,
                                color: '#e2e8f0'
                              }}>
                                {category}
                              </div>
                            </div>
                          </td>
                          <td style={{padding: '7px 8px', textAlign: 'center'}}>
                            <div style={{
                              fontFamily: "'IBM Plex Mono', monospace",
                              fontSize: '13px',
                              fontWeight: '600',
                              color: '#e2e8f0'
                            }}>
                              {data.count}
                            </div>
                          </td>
                          <td style={{padding: '7px 8px'}}>
                            <div style={{
                              fontFamily: "'IBM Plex Mono', monospace",
                              fontSize: '13px',
                              fontWeight: '600',
                              color: '#e2e8f0'
                            }}>
                              {formatCurrency(data.totalInvested)}
                            </div>
                          </td>
                          <td style={{padding: '7px 8px'}}>
                            <div style={{
                              fontFamily: "'IBM Plex Mono', monospace",
                              fontSize: '13px',
                              fontWeight: '600',
                              color: '#e2e8f0'
                            }}>
                              {formatCurrency(data.currentValue)}
                            </div>
                          </td>
                          <td style={{padding: '7px 8px'}}>
                            <div style={{
                              fontFamily: "'IBM Plex Mono', monospace",
                              fontSize: '13px',
                              fontWeight: '700',
                              color: data.totalPnL >= 0 ? '#22c55e' : '#ef4444',
                            }}>
                              {data.totalPnL >= 0 ? '▲' : '▼'} {formatCurrency(data.totalPnL)}
                            </div>
                          </td>
                          <td style={{padding: '7px 8px'}}>
                            <div style={{display: 'flex', flexDirection: 'column', gap: '3px'}}>
                              <div style={{
                                fontFamily: "'IBM Plex Mono', monospace",
                                fontSize: '12px',
                                fontWeight: '700',
                                color: pnlPercent >= 0 ? '#22c55e' : '#ef4444',
                              }}>
                                {formatPercentage(pnlPercent)}
                              </div>
                              <div style={{display: 'flex', gap: '4px', flexWrap: 'nowrap'}}>
                                <div style={{
                                  fontFamily: "'IBM Plex Mono', monospace",
                                  fontSize: '12px',
                                  fontWeight: '600',
                                  padding: '1px 5px',
                                  borderRadius: '2px',
                                  backgroundColor: 'rgba(79,143,255,0.1)',
                                  color: '#4f8fff',
                                  border: '1px solid rgba(79,143,255,0.2)',
                                  whiteSpace: 'nowrap' as const
                                }}>
                                  U: {formatPercentage(unrealizedPercent)}
                                </div>
                                <div style={{
                                  fontFamily: "'IBM Plex Mono', monospace",
                                  fontSize: '12px',
                                  fontWeight: '600',
                                  padding: '1px 5px',
                                  borderRadius: '2px',
                                  backgroundColor: 'rgba(168,85,247,0.1)',
                                  color: '#a855f7',
                                  border: '1px solid rgba(168,85,247,0.2)',
                                  whiteSpace: 'nowrap' as const
                                }}>
                                  R: {formatPercentage(realizedPercent)}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td style={{padding: '7px 8px'}}>
                            <div style={{
                              fontFamily: "'IBM Plex Mono', monospace",
                              fontSize: '12px',
                              fontWeight: '600',
                              color: data.unrealizedPnL >= 0 ? '#22c55e' : '#ef4444'
                            }}>
                              {formatCurrency(data.unrealizedPnL)}
                            </div>
                          </td>
                          <td style={{padding: '7px 8px'}}>
                            <div style={{
                              fontFamily: "'IBM Plex Mono', monospace",
                              fontSize: '12px',
                              fontWeight: '600',
                              color: data.realizedPnL >= 0 ? '#22c55e' : '#ef4444'
                            }}>
                              {formatCurrency(data.realizedPnL)}
                            </div>
                          </td>
                          <td style={{padding: '7px 8px'}}>
                            <div style={{
                              fontFamily: "'IBM Plex Mono', monospace",
                              fontSize: '12px',
                              fontWeight: '600',
                              padding: '3px 8px',
                              borderRadius: '2px',
                              backgroundColor: portfolioPercent < 0.01 ? 'rgba(148,163,184,0.08)' : 'rgba(79,143,255,0.12)',
                              color: portfolioPercent < 0.01 ? '#4a5568' : '#4f8fff',
                              border: `1px solid ${portfolioPercent < 0.01 ? 'rgba(148,163,184,0.15)' : 'rgba(79,143,255,0.25)'}`,
                              width: 'fit-content'
                            }}>
                              {portfolioPercent.toFixed(2)}%
                            </div>
                          </td>
                          <td style={{padding: '7px 8px'}}>
                            <ThreeSegmentPill
                              values={changes.dailyChange}
                              labels={['2 days ago', 'Yesterday', 'Today']}
                            />
                          </td>
                          <td style={{padding: '7px 8px'}}>
                            <ThreeSegmentPill
                              values={changes.weeklyChange}
                              labels={['2 weeks ago', 'Last week', 'This week']}
                            />
                          </td>
                          <td style={{padding: '7px 8px'}}>
                            <ThreeSegmentPill
                              values={changes.thisWeekChange}
                              labels={['2 weeks ago', 'Last week', 'This week']}
                            />
                          </td>
                          <td style={{padding: '7px 8px'}}>
                            <ThreeSegmentPill
                              values={changes.monthlyChange}
                              labels={['2 months ago', 'Last month', 'This month']}
                            />
                          </td>
                          <td style={{padding: '7px 8px'}}>
                            <div style={{
                              fontFamily: "'IBM Plex Mono', monospace",
                              fontSize: '12px',
                              fontWeight: '600',
                              color: changes.quarterlyChange >= 0 ? '#22c55e' : '#ef4444',
                            }}>
                              {changes.quarterlyChange >= 0 ? '▲' : '▼'} {formatPercentage(changes.quarterlyChange)}
                            </div>
                          </td>
                          <td style={{padding: '7px 8px'}}>
                            <div style={{
                              fontFamily: "'IBM Plex Mono', monospace",
                              fontSize: '12px',
                              fontWeight: '600',
                              color: changes.yearlyChange >= 0 ? '#22c55e' : '#ef4444',
                            }}>
                              {changes.yearlyChange >= 0 ? '▲' : '▼'} {formatPercentage(changes.yearlyChange)}
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

        {/* Portfolio Allocation Pie Chart */}
        {holdings.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <PortfolioAllocationPieChart
              holdings={holdings}
              recurringInvestments={recurringInvestments?.investments || []}
            />
          </div>
        )}

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
                totalAmountInvested: 0,
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
            acc[sector].totalAmountInvested += holding.totalAmountInvested || holding.totalInvested || 0;
            acc[sector].currentValue += holding.currentValue || 0;
            acc[sector].totalPnL += holding.totalPnL || 0;
            acc[sector].unrealizedPnL += holding.unrealizedPnL || 0;
            acc[sector].realizedPnL += holding.realizedPnL || 0;
            acc[sector].totalAmountSold += holding.amountSold || 0;
            acc[sector].holdings.push(holding);

            return acc;
          }, {} as {[key: string]: {count: number, activeCount: number, totalInvested: number, totalAmountInvested: number, currentValue: number, totalPnL: number, unrealizedPnL: number, realizedPnL: number, totalAmountSold: number, holdings: Holding[]}});

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
              backgroundColor: '#141820',
              borderRadius: '6px',
              border: '1px solid #1e2535',
              overflow: 'hidden',
              width: '100%',
              maxWidth: '100%',
              marginTop: '0',
              marginBottom: '14px',
              gridColumn: '1 / -1'
            }}>
              <div style={{
                background: '#141820',
                padding: '12px 20px'
              }}>
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                  <div style={{ fontFamily: "'IBM Plex Mono', 'Courier New', monospace", fontSize: '12px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase' as const }}>Holdings by Sector</div>
                  <div style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#4a5568',
                    backgroundColor: '#0a0c10',
                    padding: '3px 10px',
                    borderRadius: '2px',
                    border: '1px solid #1e2535'
                  }}>{Object.keys(holdingsBySector).length} sectors</div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full" style={{backgroundColor: '#141820', borderCollapse: 'collapse'}}>
                  <thead>
                    <tr style={{backgroundColor: '#141820'}}>
                      {(['Sector','Act/Tot','Invested','Value','P&L','P&L%','Unrlzd','Rlzd','Alloc%','Day','Week','This Wk','Month','Qtr','YTD']).map(h => (
                        <th key={h} style={{fontFamily: "'IBM Plex Mono','Courier New',monospace", backgroundColor: '#141820', color: '#4a5568', fontSize: '11px', fontWeight: '600', padding: '0 8px 7px', textTransform: 'uppercase' as const, letterSpacing: '0.14em', textAlign: 'left', whiteSpace: 'nowrap' as const}}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSectors.map(([sector, data], index) => {
                      const sectorNetInvested = data.totalAmountInvested - data.totalAmountSold;
                      const sectorPnlDenominator = (data.totalPnL >= 0 && sectorNetInvested > 0) ? sectorNetInvested : data.totalAmountInvested;
                      const pnlPercent = sectorPnlDenominator > 0 ? (data.totalPnL / sectorPnlDenominator) * 100 : 0;
                      const unrealizedPercent = sectorPnlDenominator > 0 ? (data.unrealizedPnL / sectorPnlDenominator) * 100 : 0;
                      const realizedPercent = sectorPnlDenominator > 0 ? (data.realizedPnL / sectorPnlDenominator) * 100 : 0;
                      const portfolioPercent = totalCapital > 0 ? (data.currentValue / totalCapital) * 100 : 0;
                      const changes = calculateSectorChanges(data);
                      const sectorColor = sectorColors[sector] || sectorColors['Other'];

                      return (
                        <tr key={sector} style={{
                          backgroundColor: '#141820',
                          borderBottom: '1px solid #1e2535',
                          borderLeft: `3px solid ${sectorColor}`,
                        }}>
                          <td style={{padding: '7px 8px'}}>
                            <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                              <div style={{
                                width: '8px',
                                height: '8px',
                                backgroundColor: sectorColor,
                                borderRadius: '2px',
                                flexShrink: 0
                              }}></div>
                              <div style={{
                                fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
                                fontSize: '13px',
                                fontWeight: '600',
                                color: '#e2e8f0'
                              }}>
                                {sector}
                              </div>
                            </div>
                          </td>
                          <td style={{padding: '7px 8px', textAlign: 'center'}}>
                            <div style={{
                              fontFamily: "'IBM Plex Mono', monospace",
                              fontSize: '13px',
                              fontWeight: '600',
                              color: '#e2e8f0'
                            }}>
                              {data.activeCount} / {data.count}
                            </div>
                          </td>
                          <td style={{padding: '7px 8px'}}>
                            <div style={{
                              fontFamily: "'IBM Plex Mono', monospace",
                              fontSize: '13px',
                              fontWeight: '600',
                              color: '#e2e8f0'
                            }}>
                              {formatCurrency(data.totalInvested)}
                            </div>
                          </td>
                          <td style={{padding: '7px 8px'}}>
                            <div style={{
                              fontFamily: "'IBM Plex Mono', monospace",
                              fontSize: '13px',
                              fontWeight: '600',
                              color: '#e2e8f0'
                            }}>
                              {formatCurrency(data.currentValue)}
                            </div>
                          </td>
                          <td style={{padding: '7px 8px'}}>
                            <div style={{
                              fontFamily: "'IBM Plex Mono', monospace",
                              fontSize: '13px',
                              fontWeight: '700',
                              color: data.totalPnL >= 0 ? '#22c55e' : '#ef4444',
                            }}>
                              {data.totalPnL >= 0 ? '▲' : '▼'} {formatCurrency(data.totalPnL)}
                            </div>
                          </td>
                          <td style={{padding: '7px 8px'}}>
                            <div style={{display: 'flex', flexDirection: 'column', gap: '3px'}}>
                              <div style={{
                                fontFamily: "'IBM Plex Mono', monospace",
                                fontSize: '12px',
                                fontWeight: '700',
                                color: pnlPercent >= 0 ? '#22c55e' : '#ef4444',
                              }}>
                                {formatPercentage(pnlPercent)}
                              </div>
                              <div style={{display: 'flex', gap: '4px', flexWrap: 'nowrap'}}>
                                <div style={{
                                  fontFamily: "'IBM Plex Mono', monospace",
                                  fontSize: '12px',
                                  fontWeight: '600',
                                  padding: '1px 5px',
                                  borderRadius: '2px',
                                  backgroundColor: 'rgba(79,143,255,0.1)',
                                  color: '#4f8fff',
                                  border: '1px solid rgba(79,143,255,0.2)',
                                  whiteSpace: 'nowrap' as const
                                }}>
                                  U: {formatPercentage(unrealizedPercent)}
                                </div>
                                <div style={{
                                  fontFamily: "'IBM Plex Mono', monospace",
                                  fontSize: '12px',
                                  fontWeight: '600',
                                  padding: '1px 5px',
                                  borderRadius: '2px',
                                  backgroundColor: 'rgba(168,85,247,0.1)',
                                  color: '#a855f7',
                                  border: '1px solid rgba(168,85,247,0.2)',
                                  whiteSpace: 'nowrap' as const
                                }}>
                                  R: {formatPercentage(realizedPercent)}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td style={{padding: '7px 8px'}}>
                            <div style={{
                              fontFamily: "'IBM Plex Mono', monospace",
                              fontSize: '12px',
                              fontWeight: '600',
                              color: data.unrealizedPnL >= 0 ? '#22c55e' : '#ef4444'
                            }}>
                              {formatCurrency(data.unrealizedPnL)}
                            </div>
                          </td>
                          <td style={{padding: '7px 8px'}}>
                            <div style={{
                              fontFamily: "'IBM Plex Mono', monospace",
                              fontSize: '12px',
                              fontWeight: '600',
                              color: data.realizedPnL >= 0 ? '#22c55e' : '#ef4444'
                            }}>
                              {formatCurrency(data.realizedPnL)}
                            </div>
                          </td>
                          <td style={{padding: '7px 8px'}}>
                            <div style={{
                              fontFamily: "'IBM Plex Mono', monospace",
                              fontSize: '12px',
                              fontWeight: '600',
                              padding: '3px 8px',
                              borderRadius: '2px',
                              backgroundColor: portfolioPercent < 0.01 ? 'rgba(148,163,184,0.08)' : 'rgba(79,143,255,0.12)',
                              color: portfolioPercent < 0.01 ? '#4a5568' : '#4f8fff',
                              border: `1px solid ${portfolioPercent < 0.01 ? 'rgba(148,163,184,0.15)' : 'rgba(79,143,255,0.25)'}`,
                              width: 'fit-content'
                            }}>
                              {portfolioPercent.toFixed(2)}%
                            </div>
                          </td>
                          <td style={{padding: '7px 8px'}}>
                            <div style={{fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', fontWeight: '600', color: changes.dailyChange >= 0 ? '#22c55e' : '#ef4444'}}>
                              {changes.dailyChange >= 0 ? '▲' : '▼'} {formatPercentage(changes.dailyChange)}
                            </div>
                          </td>
                          <td style={{padding: '7px 8px'}}>
                            <div style={{fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', fontWeight: '600', color: changes.weeklyChange >= 0 ? '#22c55e' : '#ef4444'}}>
                              {changes.weeklyChange >= 0 ? '▲' : '▼'} {formatPercentage(changes.weeklyChange)}
                            </div>
                          </td>
                          <td style={{padding: '7px 8px'}}>
                            <div style={{fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', fontWeight: '600', color: changes.thisWeekChange >= 0 ? '#22c55e' : '#ef4444'}}>
                              {changes.thisWeekChange >= 0 ? '▲' : '▼'} {formatPercentage(changes.thisWeekChange)}
                            </div>
                          </td>
                          <td style={{padding: '7px 8px'}}>
                            <div style={{fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', fontWeight: '600', color: changes.monthlyChange >= 0 ? '#22c55e' : '#ef4444'}}>
                              {changes.monthlyChange >= 0 ? '▲' : '▼'} {formatPercentage(changes.monthlyChange)}
                            </div>
                          </td>
                          <td style={{padding: '7px 8px'}}>
                            <div style={{fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', fontWeight: '600', color: changes.quarterlyChange >= 0 ? '#22c55e' : '#ef4444'}}>
                              {changes.quarterlyChange >= 0 ? '▲' : '▼'} {formatPercentage(changes.quarterlyChange)}
                            </div>
                          </td>
                          <td style={{padding: '7px 8px'}}>
                            <div style={{fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', fontWeight: '600', color: changes.yearlyChange >= 0 ? '#22c55e' : '#ef4444'}}>
                              {changes.yearlyChange >= 0 ? '▲' : '▼'} {formatPercentage(changes.yearlyChange)}
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
            backgroundColor: '#141820',
            borderRadius: '6px',
            border: '1px solid #1e2535',
            overflow: 'hidden',
            width: '100%',
            maxWidth: '100%',
            marginTop: '0',
            marginBottom: '0',
            gridColumn: '1 / -1'
          }}>
            <div style={{
              background: '#141820',
              padding: '12px 20px',
              borderBottom: '1px solid #1e2535'
            }}>
              <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px'}}>
                <div style={{ fontFamily: "'IBM Plex Mono', 'Courier New', monospace", fontSize: '12px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase' as const }}>Active Trading Holdings</div>
                <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                  <button
                    onClick={() => setShowInactiveHoldings(prev => !prev)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: '12px',
                      fontWeight: '600',
                      color: showInactiveHoldings ? '#4a5568' : '#a855f7',
                      backgroundColor: showInactiveHoldings ? '#141820' : 'rgba(168,85,247,0.1)',
                      border: `1px solid ${showInactiveHoldings ? '#1e2535' : 'rgba(168,85,247,0.25)'}`,
                      padding: '3px 10px',
                      borderRadius: '2px',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: showInactiveHoldings ? '#4a5568' : '#a855f7'}} />
                    {showInactiveHoldings ? 'HIDE' : 'SHOW'} INACTIVE ({holdings.filter(h => h.quantity <= 0.01).length})
                  </button>
                  <div style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#4a5568',
                    backgroundColor: '#0a0c10',
                    padding: '3px 10px',
                    borderRadius: '2px',
                    border: '1px solid #1e2535'
                  }}>{showInactiveHoldings ? holdings.length : holdings.filter(h => h.quantity > 0.01).length} assets</div>
                </div>
              </div>
              <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                <label style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#4a5568',
                  letterSpacing: '0.08em'
                }}>
                  TOTAL CAPITAL:
                </label>
                <div style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  padding: '3px 10px',
                  borderRadius: '2px',
                  border: '1px solid #1e2535',
                  fontSize: '13px',
                  fontWeight: '600',
                  backgroundColor: '#0a0c10',
                  color: '#00d4aa'
                }}>
                  {formatCurrency(totalCapital)}
                </div>
                <div style={{
                  fontFamily: "'IBM Plex Sans', sans-serif",
                  fontSize: '12px',
                  color: '#4a5568',
                }}>
                  auto-calculated from net portfolio value
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full" style={{backgroundColor: '#141820', borderCollapse: 'collapse'}}>
                <thead>
                  <tr style={{backgroundColor: '#141820'}}>
                    {/* shared th style */}
                    <th style={{fontFamily: "'IBM Plex Mono','Courier New',monospace", backgroundColor: '#141820', color: '#4a5568', fontSize: '11px', fontWeight: '600', padding: '0 6px 7px', textTransform: 'uppercase' as const, letterSpacing: '0.14em', textAlign: 'center', width: '44px', whiteSpace: 'nowrap' as const}}>#</th>
                    <th style={{fontFamily: "'IBM Plex Mono','Courier New',monospace", backgroundColor: '#141820', padding: '0 8px 7px'}}><SortableHeader column="symbol" label="Sym" /></th>
                    <th style={{fontFamily: "'IBM Plex Mono','Courier New',monospace", backgroundColor: '#141820', color: '#4a5568', fontSize: '11px', fontWeight: '600', padding: '0 6px 7px', textTransform: 'uppercase' as const, letterSpacing: '0.14em', width: '36px', whiteSpace: 'nowrap' as const}}>Co</th>
                    <th style={{fontFamily: "'IBM Plex Mono','Courier New',monospace", backgroundColor: '#141820', color: '#4a5568', fontSize: '11px', fontWeight: '600', padding: '0 8px 7px', textTransform: 'uppercase' as const, letterSpacing: '0.14em', whiteSpace: 'nowrap' as const}}>Name</th>
                    <th style={{fontFamily: "'IBM Plex Mono','Courier New',monospace", backgroundColor: '#141820', color: '#4a5568', fontSize: '11px', fontWeight: '600', padding: '0 8px 7px', textTransform: 'uppercase' as const, letterSpacing: '0.14em', whiteSpace: 'nowrap' as const}}>Type</th>
                    <th style={{fontFamily: "'IBM Plex Mono','Courier New',monospace", backgroundColor: '#141820', color: '#4a5568', fontSize: '11px', fontWeight: '600', padding: '0 8px 7px', textTransform: 'uppercase' as const, letterSpacing: '0.14em', whiteSpace: 'nowrap' as const}}>Qty</th>
                    <th style={{fontFamily: "'IBM Plex Mono','Courier New',monospace", backgroundColor: '#141820', color: '#4a5568', fontSize: '11px', fontWeight: '600', padding: '0 8px 7px', textTransform: 'uppercase' as const, letterSpacing: '0.14em', whiteSpace: 'nowrap' as const}}>Price</th>
                    <th style={{fontFamily: "'IBM Plex Mono','Courier New',monospace", backgroundColor: '#141820', padding: '0 8px 7px'}}><SortableHeader column="currentValue" label="Value" /></th>
                    <th style={{fontFamily: "'IBM Plex Mono','Courier New',monospace", backgroundColor: '#141820', padding: '0 8px 7px'}}><SortableHeader column="portfolio" label="Net Inv" /></th>
                    <th style={{fontFamily: "'IBM Plex Mono','Courier New',monospace", backgroundColor: '#141820', padding: '0 8px 7px'}}><SortableHeader column="totalInvested" label="Invested" /></th>
                    <th style={{fontFamily: "'IBM Plex Mono','Courier New',monospace", backgroundColor: '#141820', color: '#4a5568', fontSize: '11px', fontWeight: '600', padding: '0 8px 7px', textTransform: 'uppercase' as const, letterSpacing: '0.14em', whiteSpace: 'nowrap' as const}}>Sold</th>
                    <th style={{fontFamily: "'IBM Plex Mono','Courier New',monospace", backgroundColor: '#141820', padding: '0 8px 7px'}}><SortableHeader column="pnl" label="P&L" /></th>
                    <th style={{fontFamily: "'IBM Plex Mono','Courier New',monospace", backgroundColor: '#141820', color: '#4a5568', fontSize: '11px', fontWeight: '600', padding: '0 8px 7px', textTransform: 'uppercase' as const, letterSpacing: '0.14em', whiteSpace: 'nowrap' as const}}>Insider</th>
                    <th style={{fontFamily: "'IBM Plex Mono','Courier New',monospace", backgroundColor: '#141820', padding: '0 8px 7px'}}><SortableHeader column="dailyChange" label="Day" /></th>
                    <th style={{fontFamily: "'IBM Plex Mono','Courier New',monospace", backgroundColor: '#141820', padding: '0 8px 7px'}}><SortableHeader column="weeklyChange" label="Week" /></th>
                    <th style={{fontFamily: "'IBM Plex Mono','Courier New',monospace", backgroundColor: '#141820', color: '#4a5568', fontSize: '11px', fontWeight: '600', padding: '0 8px 7px', textTransform: 'uppercase' as const, letterSpacing: '0.14em', whiteSpace: 'nowrap' as const}}>Month</th>
                    <th style={{fontFamily: "'IBM Plex Mono','Courier New',monospace", backgroundColor: '#141820', padding: '0 8px 7px'}}><SortableHeader column="portfolio" label="Alloc%" /></th>
                  </tr>
                </thead>
                <tbody>
                  {getSortedHoldings(holdings.filter(h => showInactiveHoldings || h.quantity > 0.01)).map((holding, index) => (
                    <tr key={holding.symbol} style={{
                      backgroundColor: '#141820',
                      borderBottom: '1px solid #1e2535',
                    }} onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(0,212,170,0.04)';
                    }} onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#141820';
                    }}>
                      <td style={{padding: '7px 6px', textAlign: 'center'}}>
                        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px'}}>
                          {holding.positionChange && holding.positionChange !== 'same' && (
                            <span style={{fontSize: '11px', color: holding.positionChange === 'up' ? '#22c55e' : holding.positionChange === 'down' ? '#ef4444' : '#4f8fff'}}>
                              {holding.positionChange === 'up' ? '▲' : holding.positionChange === 'down' ? '▼' : '★'}
                            </span>
                          )}
                          <div style={{
                            fontFamily: "'IBM Plex Mono', monospace",
                            fontSize: '13px',
                            fontWeight: '600',
                            color: holding.positionChange === 'up' ? '#22c55e' :
                                   holding.positionChange === 'down' ? '#ef4444' :
                                   holding.positionChange === 'new' ? '#4f8fff' : '#94a3b8',
                          }}>
                            {holding.currentPosition}
                          </div>
                        </div>
                        {holding.lastWeekPosition ? (
                          <div style={{fontFamily: "'IBM Plex Sans', sans-serif", fontSize: '11px', color: '#4a5568', marginTop: '1px'}}>
                            was {holding.lastWeekPosition}
                          </div>
                        ) : holding.positionChange === 'new' ? (
                          <div style={{fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', color: '#4f8fff', marginTop: '1px', letterSpacing: '0.06em'}}>
                            NEW
                          </div>
                        ) : null}
                      </td>
                      <td style={{padding: '7px 8px'}}>
                        <div style={{
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: '13px',
                          fontWeight: '600',
                          color: '#e2e8f0'
                        }}>
                          {holding.symbol}
                        </div>
                      </td>
                      <td style={{padding: '7px 8px', textAlign: 'center'}}>
                        <CompanyIcon
                          symbol={holding.symbol}
                          iconUrl={iconUrls[holding.symbol.toUpperCase()]}
                          companyName={holding.companyName}
                          size="10x10"
                          showFallback={true}
                          showTooltip={false}
                        />
                      </td>
                      <td style={{padding: '7px 8px', maxWidth: '140px'}}>
                        <div
                          title={holding.companyName}
                          style={{
                            fontSize: '12px',
                            color: '#94a3b8',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical' as const,
                            overflow: 'hidden',
                            lineHeight: '1.35',
                          }}
                        >
                          {holding.companyName}
                        </div>
                      </td>
                      <td style={{padding: '7px 8px'}}>
                        <div style={{
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: '12px',
                          fontWeight: '600',
                          padding: '2px 7px',
                          borderRadius: '2px',
                          backgroundColor: holding.type === 'c' ? 'rgba(168,85,247,0.12)' : 'rgba(79,143,255,0.12)',
                          color: holding.type === 'c' ? '#a855f7' : '#4f8fff',
                          border: `1px solid ${holding.type === 'c' ? 'rgba(168,85,247,0.25)' : 'rgba(79,143,255,0.25)'}`,
                          letterSpacing: '0.06em'
                        }}>
                          {holding.type === 'c' ? 'CRYPTO' : 'STOCK'}
                        </div>
                      </td>
                      <td style={{padding: '7px 8px'}}>
                        <div style={{
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: '13px',
                          fontWeight: '600',
                          color: '#e2e8f0'
                        }}>
                          {Number.isInteger(holding.quantity) ? holding.quantity.toLocaleString() : safeToFixed(holding.quantity)}
                        </div>
                      </td>
                      <td style={{padding: '7px 8px'}}>
                        <div style={{
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: '13px',
                          fontWeight: '600',
                          color: '#e2e8f0'
                        }}>
                          {formatCurrency(holding.currentPrice)}
                        </div>
                      </td>
                      <td style={{
                        padding: '7px 8px',
                        backgroundColor: (() => {
                          const currentValue = holding.currentValue || 0;
                          const netInvested = calculateNetInvested(holding.totalAmountInvested, holding.amountSold);
                          if (currentValue <= 0.01) return 'transparent';
                          return currentValue > netInvested ? 'rgba(34,197,94,0.07)' : 'rgba(239,68,68,0.07)';
                        })()
                      }}>
                        <div style={{
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: '13px',
                          fontWeight: '600',
                          color: (() => {
                            const currentValue = holding.currentValue || 0;
                            const netInvested = calculateNetInvested(holding.totalAmountInvested, holding.amountSold);
                            if (currentValue <= 0.01) return '#4a5568';
                            return currentValue > netInvested ? '#22c55e' : '#ef4444';
                          })()
                        }}>
                          {formatCurrency(holding.currentValue)}
                        </div>
                      </td>
                      <td style={{
                        padding: '7px 8px',
                        backgroundColor: holding.quantity <= 0.01 ? 'rgba(168,85,247,0.06)' : 'rgba(79,143,255,0.05)'
                      }}>
                        <div style={{
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: '13px',
                          fontWeight: '600',
                          color: holding.quantity <= 0.01 ? '#a855f7' : '#94a3b8'
                        }}>
                          {formatCurrency(calculateNetInvested(holding.totalAmountInvested, holding.amountSold))}
                        </div>
                      </td>
                      <td style={{padding: '7px 8px'}}>
                        <div style={{
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: '13px',
                          fontWeight: '600',
                          color: '#94a3b8'
                        }}>
                          {formatCurrency(holding.totalAmountInvested)}
                        </div>
                      </td>
                      <td style={{padding: '7px 8px'}}>
                        <div style={{
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: '13px',
                          fontWeight: '600',
                          color: '#94a3b8'
                        }}>
                          {formatCurrency(holding.amountSold || 0)}
                        </div>
                      </td>
                      <td style={{padding: '10px 12px'}}>
                        {(() => {
                          const totalAmtInvested = holding.totalAmountInvested || holding.totalInvested || 0;
                          const netInvested = totalAmtInvested - (holding.amountSold || 0);
                          const pnlDenominator = ((holding.totalPnL || 0) >= 0 && netInvested > 0) ? netInvested : totalAmtInvested;
                          const unrealizedPct = pnlDenominator > 0 ? ((holding.unrealizedPnL || 0) / pnlDenominator) * 100 : 0;
                          const realizedPct = pnlDenominator > 0 ? ((holding.realizedPnL || 0) / pnlDenominator) * 100 : 0;
                          const pnlPos = (holding.totalPnL && holding.totalPnL >= 0);
                          const pnlColor = pnlPos ? '#22c55e' : '#ef4444';
                          const unrlzdColor = (holding.unrealizedPnL && holding.unrealizedPnL >= 0) ? '#22c55e' : '#ef4444';
                          const rlzdColor = (holding.realizedPnL && holding.realizedPnL >= 0) ? '#22c55e' : '#ef4444';
                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              {/* Total P&L — colored box with arrow */}
                              <div style={{
                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                padding: '3px 7px', borderRadius: '2px',
                                backgroundColor: pnlPos ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                                border: `1px solid ${pnlPos ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                              }}>
                                <span style={{ fontSize: '11px', color: pnlColor }}>{pnlPos ? '▲' : '▼'}</span>
                                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', fontWeight: 700, color: pnlColor, whiteSpace: 'nowrap' as const }}>{formatCurrency(holding.totalPnL)}</span>
                                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', fontWeight: 600, color: pnlColor, whiteSpace: 'nowrap' as const }}>{formatPercentage(holding.totalPnLPercent)}</span>
                              </div>
                              {/* Unrealized */}
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', color: '#4a5568', letterSpacing: '0.06em', flexShrink: 0 }}>U</span>
                                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', fontWeight: 600, color: unrlzdColor, whiteSpace: 'nowrap' as const }}>{formatCurrency(holding.unrealizedPnL)}</span>
                                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', fontWeight: 600, color: '#4f8fff', whiteSpace: 'nowrap' as const }}>{formatPercentage(unrealizedPct)}</span>
                              </div>
                              {/* Realized */}
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', color: '#4a5568', letterSpacing: '0.06em', flexShrink: 0 }}>R</span>
                                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', fontWeight: 600, color: rlzdColor, whiteSpace: 'nowrap' as const }}>{formatCurrency(holding.realizedPnL)}</span>
                                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', fontWeight: 600, color: '#a855f7', whiteSpace: 'nowrap' as const }}>{formatPercentage(realizedPct)}</span>
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                      {/* Insider activity */}
                      <td style={{padding: '7px 8px'}}>
                        {holding.insiderSentiment && holding.insiderSentiment !== 'NEUTRAL' ? (() => {
                          const colors: Record<string, { bg: string; text: string; border: string }> = {
                            STRONG_BUY: { bg: 'rgba(0,212,170,0.12)', text: '#00d4aa', border: 'rgba(0,212,170,0.25)' },
                            BUY:        { bg: 'rgba(34,197,94,0.12)', text: '#22c55e', border: 'rgba(34,197,94,0.25)' },
                            SELL:       { bg: 'rgba(239,68,68,0.12)', text: '#ef4444', border: 'rgba(239,68,68,0.25)' },
                            HEAVY_SELL: { bg: 'rgba(239,68,68,0.18)', text: '#f87171', border: 'rgba(239,68,68,0.35)' },
                          };
                          const c = colors[holding.insiderSentiment] || { bg: '#141820', text: '#4a5568', border: '#1e2535' };
                          const label = holding.insiderSentiment.replace('_', ' ');
                          return (
                            <div title={`${holding.insiderBuyCount ?? 0} buys, ${holding.insiderSellCount ?? 0} sells (90 days)`}>
                              <div style={{
                                fontFamily: "'IBM Plex Mono', monospace",
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '2px 7px',
                                borderRadius: '2px',
                                fontSize: '12px',
                                fontWeight: '700',
                                backgroundColor: c.bg,
                                color: c.text,
                                border: `1px solid ${c.border}`,
                                textTransform: 'uppercase' as const,
                                letterSpacing: '0.08em'
                              }}>
                                {label}
                              </div>
                              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', color: '#4a5568', marginTop: '2px' }}>
                                {holding.insiderBuyCount ?? 0}B / {holding.insiderSellCount ?? 0}S
                              </div>
                            </div>
                          );
                        })() : holding.insiderHasData === false ? (
                          <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: '12px', color: '#2a3445' }} title="No SEC filing data — non-US or non-covered stock">non-US</div>
                        ) : holding.insiderSentiment === 'NEUTRAL' ? (
                          <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: '12px', color: '#4a5568' }} title="No insider transactions in last 90 days">quiet</div>
                        ) : (
                          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', color: '#1e2535' }}>—</div>
                        )}
                      </td>
                      <td style={{padding: '7px 7px'}}>
                        {Array.isArray(holding.dailyChangePercent) ? (
                          <ThreeSegmentPill
                            values={holding.dailyChangePercent}
                            labels={['2 days ago', 'Yesterday', 'Today']}
                          />
                        ) : (
                          <ThreeSegmentPill values={[]} />
                        )}
                      </td>
                      <td style={{padding: '7px 7px'}}>
                        {Array.isArray(holding.weeklyChangePercent) ? (
                          <ThreeSegmentPill
                            values={holding.weeklyChangePercent}
                            labels={['2 weeks ago', 'Last week', 'This week']}
                          />
                        ) : (
                          <ThreeSegmentPill values={[]} />
                        )}
                      </td>
                      <td style={{padding: '7px 7px'}}>
                        {Array.isArray(holding.monthlyChangePercent) ? (
                          <ThreeSegmentPill
                            values={holding.monthlyChangePercent}
                            labels={['2 months ago', 'Last month', 'This month']}
                          />
                        ) : (
                          <ThreeSegmentPill values={[]} />
                        )}
                      </td>
                      <td style={{padding: '7px 8px'}}>
                        {(() => {
                          const netInvested = calculateNetInvested(holding.totalAmountInvested, holding.amountSold);
                          const percentage = totalCapital > 0 ? (netInvested / totalCapital) * 100 : 0;

                          let backgroundColor, textColor, borderColor;
                          if (percentage > 5) {
                            backgroundColor = 'rgba(168,85,247,0.12)';
                            textColor = '#a855f7';
                            borderColor = 'rgba(168,85,247,0.25)';
                          } else if (percentage > 1) {
                            backgroundColor = 'rgba(79,143,255,0.12)';
                            textColor = '#4f8fff';
                            borderColor = 'rgba(79,143,255,0.25)';
                          } else {
                            backgroundColor = 'rgba(34,197,94,0.12)';
                            textColor = '#22c55e';
                            borderColor = 'rgba(34,197,94,0.25)';
                          }

                          return (
                            <div style={{
                              fontFamily: "'IBM Plex Mono', monospace",
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '3px 8px',
                              borderRadius: '2px',
                              fontSize: '12px',
                              fontWeight: '600',
                              backgroundColor,
                              color: textColor,
                              border: `1px solid ${borderColor}`
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
    </>
  );
};

export default PortfolioSummary;