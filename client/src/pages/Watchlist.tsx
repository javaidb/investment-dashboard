import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import axios from 'axios';
import { useCache } from '../contexts/CacheContext';
import Watchlists from '../components/Watchlists';
import HoldingsChartWrapper from '../components/HoldingsChartWrapper';
import ProfitLossBarChart from '../components/ProfitLossBarChart';
import PriceOffsetBarChart from '../components/PriceOffsetBarChart';

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
  usdPrice?: number;
  exchangeRate?: number;
  cacheUsed?: boolean;
  weeklyChangePercent?: number;
  currentPosition?: number;
  lastWeekPosition?: number;
  positionChange?: 'up' | 'down' | 'same' | 'new';
}

interface WatchlistData {
  active: string[];
  inactive: string[];
  custom: string[];
  totalSymbols: number;
}

const Watchlist: React.FC = () => {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [weeklyChanges, setWeeklyChanges] = useState<{[symbol: string]: number}>({});
  const [showInactive, setShowInactive] = useState(false);
  const [showCustom, setShowCustom] = useState(false);

  const queryClient = useQueryClient();
  const {
    holdings: cachedHoldings,
    latestPortfolio,
    recurringInvestments,
    isLoading,
    error: cacheError,
  } = useCache();

  // Fetch watchlist data to get custom symbols
  const { data: watchlistData } = useQuery<WatchlistData>(
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

  // Use React Query for persistent portfolio cache that survives browser sessions
  const { data: persistentPortfolio } = useQuery(
    'persistent-portfolio-cache',
    () => ({ holdings: cachedHoldings, portfolio: latestPortfolio }),
    {
      enabled: !!latestPortfolio && !!cachedHoldings && Object.keys(cachedHoldings).length > 0,
      staleTime: Infinity,
      cacheTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      refetchInterval: false,
    }
  );

  // Use persistent data if available, fallback to cache context
  const activeHoldings = persistentPortfolio?.holdings || cachedHoldings;
  const activePortfolio = persistentPortfolio?.portfolio || latestPortfolio;

  // Combine portfolio holdings and custom watchlist symbols
  const customSymbols = watchlistData?.custom || [];
  const portfolioSymbols = activePortfolio?.holdings?.map((h: Holding) => h.symbol) || [];
  const allSymbols = Array.from(new Set([...portfolioSymbols, ...customSymbols]));

  // Fetch weekly changes from historical cache for all symbols (portfolio + custom)
  const { data: weeklyChangesData } = useQuery(
    ['weekly-changes-batch', allSymbols.join(',')],
    async () => {
      if (allSymbols.length === 0) return {};

      console.log('🔄 Fetching weekly changes for', allSymbols.length, 'symbols (portfolio + custom) via batch endpoint');

      try {
        const response = await axios.post('/api/portfolio/cache/weekly-changes', { symbols: allSymbols });
        console.log('✅ Weekly changes batch response:', response.data);
        return response.data.weeklyChanges || {};
      } catch (error) {
        console.error('❌ Failed to fetch weekly changes batch:', error);
        return {};
      }
    },
    {
      enabled: allSymbols.length > 0,
      staleTime: 300000, // 5 minutes
      cacheTime: 900000, // 15 minutes
      retry: 1
    }
  );

  // Update weekly changes when data is available
  useEffect(() => {
    if (weeklyChangesData) {
      setWeeklyChanges(weeklyChangesData);
    }
  }, [weeklyChangesData]);

  // Fetch price data for inactive and custom symbols from holdings cache
  const { data: cachedPrices } = useQuery(
    ['cached-prices', watchlistData?.inactive, watchlistData?.custom],
    async () => {
      const inactiveSymbols = watchlistData?.inactive || [];
      const customSymbols = watchlistData?.custom || [];
      const allSymbols = [...inactiveSymbols, ...customSymbols];

      if (allSymbols.length === 0) return {};

      try {
        const response = await axios.get('/api/portfolio/cache/data');
        return response.data.cache || {};
      } catch (error) {
        console.error('Failed to fetch cached prices:', error);
        return {};
      }
    },
    {
      enabled: (watchlistData?.inactive?.length || 0) > 0 || (watchlistData?.custom?.length || 0) > 0,
      staleTime: 300000, // 5 minutes
      cacheTime: 900000, // 15 minutes,
    }
  );

  // Update holdings when activePortfolio, weekly changes, or watchlist changes
  useEffect(() => {
    const portfolioHoldings = activePortfolio?.holdings || [];
    const inactiveSymbols = watchlistData?.inactive || [];
    const customSymbols = watchlistData?.custom || [];
    const prices = cachedPrices || {};

    // Map portfolio holdings with weekly changes
    const mappedPortfolioHoldings = portfolioHoldings.map((holding: Holding) => ({
      ...holding,
      weeklyChangePercent: weeklyChanges[holding.symbol] || holding.weeklyChangePercent,
      category: (holding.quantity > 0.001 ? 'active' : 'inactive') as 'active' | 'inactive' | 'custom'
    }));

    // Create holdings for inactive symbols from portfolio
    const inactiveHoldings = inactiveSymbols
      .map(symbol => {
        const portfolioHolding = portfolioHoldings.find((h: Holding) => h.symbol === symbol);
        const cachedPrice = prices[symbol];

        if (portfolioHolding) {
          return {
            ...portfolioHolding,
            weeklyChangePercent: weeklyChanges[symbol] || portfolioHolding.weeklyChangePercent,
            category: 'inactive' as const
          };
        }

        return null;
      })
      .filter(Boolean);

    // Create holdings for custom symbols
    const customHoldings = customSymbols
      .map(symbol => {
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
          type: isCrypto ? 'c' : 's',
          currency: 'CAD',
          companyName: cachedPrice.companyName || symbol,
          currentPrice: cachedPrice.cadPrice || cachedPrice.price || 0,
          currentValue: 0,
          unrealizedPnL: 0,
          totalPnL: 0,
          totalPnLPercent: 0,
          usdPrice: cachedPrice.usdPrice || 0,
          exchangeRate: cachedPrice.exchangeRate || 1.4,
          weeklyChangePercent: weeklyChanges[symbol] || null,
          category: 'custom' as const
        } as Holding & { category: 'active' | 'inactive' | 'custom' };
      })
      .filter(Boolean) as (Holding & { category: 'active' | 'inactive' | 'custom' })[];

    // Combine all holdings
    const allHoldings = [...mappedPortfolioHoldings, ...customHoldings];

    // Sort by total P&L
    const sortedHoldings = allHoldings.sort((a, b) => {
      const aValue = a.totalPnL || 0;
      const bValue = b.totalPnL || 0;
      return bValue - aValue;
    });

    setHoldings(sortedHoldings);
  }, [activePortfolio, weeklyChanges, watchlistData, cachedPrices]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header Section */}
      <div className="dashboard-header">
        <div className="dashboard-header-content">
          <h1 className="dashboard-title">Watchlist</h1>
          <p className="dashboard-subtitle">Monitor your portfolio performance, asset allocation, and custom tracked symbols</p>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ padding: '1rem 0.5rem' }}>
        <div style={{ maxWidth: '2000px', margin: '0 auto' }}>
          <div style={{ marginBottom: '1rem' }}>

            {/* Watchlists Section */}
            <Watchlists />

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

            {/* Chart Toggles */}
            {holdings.length > 0 && (
              <div style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                boxShadow: '0 4px 12px -2px rgba(0, 0, 0, 0.1)',
                border: '1px solid #e5e7eb',
                padding: '16px 20px',
                marginBottom: '20px',
                display: 'flex',
                gap: '12px',
                alignItems: 'center',
                flexWrap: 'wrap'
              }}>
                <span style={{ fontSize: '14px', fontWeight: '600', color: '#374151', marginRight: '8px' }}>
                  Show in charts:
                </span>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={showInactive}
                    onChange={(e) => setShowInactive(e.target.checked)}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '14px', color: '#6b7280' }}>
                    Inactive holdings ({watchlistData?.inactive?.length || 0})
                  </span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={showCustom}
                    onChange={(e) => setShowCustom(e.target.checked)}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '14px', color: '#6b7280' }}>
                    Custom symbols ({watchlistData?.custom?.length || 0})
                  </span>
                </label>
              </div>
            )}

            {/* Profit/Loss Bar Chart */}
            {holdings.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <ProfitLossBarChart
                  holdings={holdings.filter(h => {
                    const category = (h as any).category || 'active';
                    if (category === 'active') return true;
                    if (category === 'inactive') return showInactive;
                    if (category === 'custom') return showCustom;
                    return true;
                  })}
                />
              </div>
            )}

            {/* Price Offset Bar Chart */}
            {holdings.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <PriceOffsetBarChart
                  holdings={holdings.filter(h => {
                    const category = (h as any).category || 'active';
                    if (category === 'active') return true;
                    if (category === 'inactive') return showInactive;
                    if (category === 'custom') return showCustom;
                    return true;
                  })}
                />
              </div>
            )}

            {/* Empty State */}
            {holdings.length === 0 && !isLoading && (
              <div className="card text-center py-12">
                <p className="text-gray-500">No holdings data available</p>
                <p className="text-sm text-gray-400 mt-2">Upload portfolio data to see your watchlist</p>
              </div>
            )}

            {/* Loading State */}
            {isLoading && (
              <div className="card text-center py-12">
                <div className="loading-spinner mx-auto mb-4"></div>
                <p className="text-gray-500">Loading watchlist...</p>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};

export default Watchlist;
