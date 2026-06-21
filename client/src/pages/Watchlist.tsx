import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import axios from 'axios';
import { useCache } from '../contexts/CacheContext';
import Watchlists from '../components/Watchlists';
import HoldingsChartWrapper from '../components/HoldingsChartWrapper';
import ProfitLossBarChart from '../components/ProfitLossBarChart';
import PriceOffsetBarChart from '../components/PriceOffsetBarChart';
import Below200WeekMA from '../components/Below200WeekMA';

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
    <div style={{ background: '#0a0c10', minHeight: '100%' }}>
      {/* Header Section */}
      <div style={{ background: '#10141c', borderBottom: '1px solid #1e2535', padding: '12px 20px' }}>
        <div style={{ fontFamily: "'IBM Plex Mono', 'Courier New', monospace", fontSize: '12px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase' as const }}>
          Watchlist
        </div>
        <div style={{ fontSize: '11px', color: '#4a5568', marginTop: '2px', fontFamily: "'IBM Plex Mono', monospace" }}>
          Portfolio performance · Asset allocation · Custom tracked symbols
        </div>
      </div>

      {/* Main Content */}
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

        {/* Watchlists Section */}
        <Watchlists />

        {/* Holdings Chart */}
        {holdings.length > 0 && (
          <div style={{
            backgroundColor: '#10141c',
            borderRadius: '8px',
            border: '1px solid #1e2535',
            overflow: 'hidden',
            width: '100%',
          }}>
            <HoldingsChartWrapper />
          </div>
        )}

        {/* Below 200-Week MA Section */}
        {holdings.length > 0 && (
          <Below200WeekMA holdings={holdings} />
        )}

        {/* Chart Toggles */}
        {holdings.length > 0 && (
          <div style={{
            backgroundColor: '#10141c',
            borderRadius: '8px',
            border: '1px solid #1e2535',
            padding: '14px 18px',
            display: 'flex',
            gap: '16px',
            alignItems: 'center',
            flexWrap: 'wrap' as const
          }}>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', fontWeight: 700, color: '#64748b', letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginRight: '4px' }}>
              Show in charts
            </span>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                style={{ width: '14px', height: '14px', cursor: 'pointer', accentColor: '#475569' }}
              />
              <span style={{ fontSize: '13px', color: '#64748b' }}>
                Inactive holdings ({watchlistData?.inactive?.length || 0})
              </span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showCustom}
                onChange={(e) => setShowCustom(e.target.checked)}
                style={{ width: '14px', height: '14px', cursor: 'pointer', accentColor: '#3b82f6' }}
              />
              <span style={{ fontSize: '13px', color: '#64748b' }}>
                Custom symbols ({watchlistData?.custom?.length || 0})
              </span>
            </label>
          </div>
        )}

        {/* Profit/Loss Bar Chart */}
        {holdings.length > 0 && (
          <ProfitLossBarChart
            holdings={holdings.filter(h => {
              const category = (h as any).category || 'active';
              if (category === 'active') return true;
              if (category === 'inactive') return showInactive;
              if (category === 'custom') return showCustom;
              return true;
            })}
          />
        )}

        {/* Price Offset Bar Chart */}
        {holdings.length > 0 && (
          <PriceOffsetBarChart
            holdings={holdings.filter(h => {
              const category = (h as any).category || 'active';
              if (category === 'active') return true;
              if (category === 'inactive') return showInactive;
              if (category === 'custom') return showCustom;
              return true;
            })}
          />
        )}

        {/* Empty State */}
        {holdings.length === 0 && !isLoading && (
          <div style={{ backgroundColor: '#10141c', border: '1px solid #1e2535', borderRadius: '8px', padding: '48px', textAlign: 'center' }}>
            <p style={{ color: '#64748b', fontSize: '14px' }}>No holdings data available</p>
            <p style={{ color: '#4a5568', fontSize: '12px', marginTop: '8px' }}>Upload portfolio data to see your watchlist</p>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div style={{ backgroundColor: '#10141c', border: '1px solid #1e2535', borderRadius: '8px', padding: '48px', textAlign: 'center' }}>
            <div className="loading-spinner mx-auto mb-4"></div>
            <p style={{ color: '#64748b', fontSize: '14px' }}>Loading watchlist...</p>
          </div>
        )}

      </div>
    </div>
  );
};

export default Watchlist;
