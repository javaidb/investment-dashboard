import React from 'react';
import { useQuery, useQueryClient } from 'react-query';
import axios from 'axios';
import { useCache } from '../contexts/CacheContext';
import { useIcons } from '../hooks/useIcons';
import CompanyIcon from './CompanyIcon';
import { TrendingUp, TrendingDown } from 'lucide-react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';



const HoldingsPerformance: React.FC = () => {
  const queryClient = useQueryClient();
  const { holdings: cachedHoldings, holdingsTimestamp, isLoading, error } = useCache();
  
  // Get icon URLs for all holdings
  const symbolsForIcons = cachedHoldings ? Object.entries(cachedHoldings).map(([symbol, data]) => {
    const holdingData = data as any;
    // Use the actual type from holdings data, or detect crypto vs stock
    let assetType = holdingData.type;
    if (!assetType) {
      // Fallback: detect crypto symbols
      const cryptoSymbols = ['BTC', 'ETH', 'ADA', 'SOL', 'DOT', 'LINK', 'UNI', 'MATIC', 'AVAX', 'ATOM', 'LTC', 'BCH', 'XRP', 'DOGE', 'SHIB'];
      assetType = cryptoSymbols.includes(symbol.toUpperCase()) ? 'c' : 's';
    }
    return {
      symbol: symbol,
      type: assetType
    };
  }) : [];
  const { iconUrls } = useIcons({ 
    symbols: symbolsForIcons,
    enabled: symbolsForIcons.length > 0 
  });

  // Use React Query for persistent holdings cache that survives browser sessions
  const { data: persistentHoldings } = useQuery(
    'persistent-holdings-cache',
    () => cachedHoldings, // Initialize from cache context
    {
      enabled: !!cachedHoldings && Object.keys(cachedHoldings).length > 0,
      staleTime: Infinity, // Never consider stale
      cacheTime: Infinity, // Keep cached forever
      refetchOnWindowFocus: false,
      refetchOnMount: false, // Don't refetch on mount if we have data
      refetchOnReconnect: false,
      refetchInterval: false,
    }
  );

  // Transfer cache context data to React Query when available
  React.useEffect(() => {
    if (cachedHoldings && Object.keys(cachedHoldings).length > 0) {
      console.log('🔄 Transferring cache context data to React Query persistent cache');
      queryClient.setQueryData('persistent-holdings-cache', cachedHoldings);
    }
  }, [cachedHoldings, queryClient]);

  // Use persistent holdings if available, fallback to cache context
  const activeHoldings = persistentHoldings || cachedHoldings;

  // Debug logging for cache data
  React.useEffect(() => {
    if (activeHoldings) {
      console.log('📊 HoldingsPerformance active data:', {
        source: persistentHoldings ? 'React Query persistent cache' : 'Cache context',
        cacheKeys: Object.keys(activeHoldings || {}),
        cacheEntries: Object.entries(activeHoldings || {}).length
      });
    }
  }, [activeHoldings, persistentHoldings]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'CAD',
    }).format(amount);
  };


  // Format functions for tooltips
  const formatTooltip = (value: any) => [`$${value.toFixed(2)}`, 'Price'];

  const formatXAxis = (tickItem: string) => {
    const date = new Date(tickItem);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const formatTooltipLabel = (label: string) => {
    const date = new Date(label);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Chart component that reads from historical data API
  const CachedChart: React.FC<{ symbol: string; holdingData: any }> = ({ symbol, holdingData }) => {
    const { data: chartData, isLoading: chartLoading } = useQuery(
      ['symbol-chart', symbol, holdingData.type],
      async () => {
        try {
          // Determine symbol type first
          const cryptoSymbols = ['BTC', 'ETH', 'ADA', 'SOL', 'DOT', 'LINK', 'UNI', 'MATIC', 'AVAX', 'ATOM', 'LTC', 'BCH', 'XRP', 'DOGE', 'SHIB'];
          const isCrypto = cryptoSymbols.includes(symbol.toUpperCase());
          
          // Try cache endpoint first - request only last 1 month ordered earliest to latest
          try {
            const cacheResponse = await axios.get(`/api/portfolio/cache/historical/${symbol}?period=1m`);
            // If we get here, data was cached
            console.log(`💾 Cache hit for ${symbol} (1 month period)`);
            return cacheResponse.data;
          } catch (cacheError) {
            // Cache miss - call the appropriate live endpoint directly for 1 month
            const endpoint = isCrypto 
              ? `/api/historical/crypto/${symbol}?period=1m&interval=1d`
              : `/api/historical/stock/${symbol}?period=1m&interval=1d`;
            
            console.log(`📊 Cache miss for ${symbol}, fetching from ${endpoint}`);
            const liveResponse = await axios.get(endpoint);
            return liveResponse.data;
          }
        } catch (error) {
          console.warn(`No historical data available for ${symbol} (${holdingData.type === 'c' ? 'crypto' : 'stock'}):`, error instanceof Error ? error.message : error);
          return null;
        }
      },
      {
        retry: 1,
        staleTime: Infinity, // Never consider stale - historical cache data doesn't need updates
        cacheTime: Infinity, // Keep cached forever
        refetchOnWindowFocus: false,
        refetchOnMount: true, // Only fetch when symbol changes
        refetchOnReconnect: false,
        refetchInterval: false, // No automatic refetching
      }
    );

    if (chartLoading) {
      return (
        <div className="trending-chart-placeholder">
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#9CA3AF',
            fontSize: '0.75rem'
          }}>
            Loading...
          </div>
        </div>
      );
    }

    if (!chartData || !chartData.data || chartData.data.length === 0) {
      return (
        <div className="trending-chart-placeholder">
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#10B981',
            fontSize: '0.75rem',
            flexDirection: 'column'
          }}>
            <div>Cached {new Date(holdingData.lastUpdated || holdingData.fetchedAt).toLocaleTimeString()}</div>
            <div style={{ fontSize: '0.625rem', marginTop: '0.25rem', opacity: 0.7 }}>
              ${holdingData.usdPrice || holdingData.price || 0} USD
            </div>
          </div>
        </div>
      );
    }

    const data = chartData.data;
    const meta = chartData.meta || {};
    
    // Calculate monthly performance from the data
    let performance = 0;
    if (data && data.length > 1) {
      const firstPrice = data[0].close;
      const lastPrice = data[data.length - 1].close;
      performance = ((lastPrice - firstPrice) / firstPrice) * 100;
    }

    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
          <defs>
            <linearGradient id={`cachedColor${symbol}`} x1="0" y1="0" x2="0" y2="1">
              <stop 
                offset="5%" 
                stopColor={performance > 0 ? "#10B981" : "#EF4444"} 
                stopOpacity={0.3}
              />
              <stop 
                offset="95%" 
                stopColor={performance > 0 ? "#10B981" : "#EF4444"} 
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
          <XAxis 
            dataKey="date" 
            tickFormatter={formatXAxis}
            stroke="#9CA3AF"
            fontSize={10}
            hide
          />
          <YAxis 
            domain={['dataMin * 0.995', 'dataMax * 1.005']}
            stroke="#9CA3AF"
            fontSize={10}
            hide
          />
          <Tooltip 
            formatter={formatTooltip}
            labelFormatter={formatTooltipLabel}
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #E5E7EB',
              borderRadius: '6px',
              fontSize: '12px'
            }}
          />
          <Area
            type="monotone"
            dataKey="close"
            stroke={performance > 0 ? "#10B981" : "#EF4444"}
            strokeWidth={1.5}
            fillOpacity={1}
            fill={`url(#cachedColor${symbol})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  };

  // Individual holding card component that calculates its own performance
  const HoldingCard: React.FC<{ symbol: string; holdingData: any; iconUrl?: string }> = ({ symbol, holdingData, iconUrl }) => {
    const { data: chartData } = useQuery(
      ['symbol-chart', symbol, holdingData.type],
      async () => {
        try {
          // Determine symbol type first
          const cryptoSymbols = ['BTC', 'ETH', 'ADA', 'SOL', 'DOT', 'LINK', 'UNI', 'MATIC', 'AVAX', 'ATOM', 'LTC', 'BCH', 'XRP', 'DOGE', 'SHIB'];
          const isCrypto = cryptoSymbols.includes(symbol.toUpperCase());
          
          // Try cache endpoint first - request only last 1 month ordered earliest to latest
          try {
            const cacheResponse = await axios.get(`/api/portfolio/cache/historical/${symbol}?period=1m`);
            // If we get here, data was cached
            console.log(`💾 Cache hit for ${symbol} (1 month period)`);
            return cacheResponse.data;
          } catch (cacheError) {
            // Cache miss - call the appropriate live endpoint directly for 1 month
            const endpoint = isCrypto 
              ? `/api/historical/crypto/${symbol}?period=1m&interval=1d`
              : `/api/historical/stock/${symbol}?period=1m&interval=1d`;
            
            console.log(`📊 Cache miss for ${symbol}, fetching from ${endpoint}`);
            const liveResponse = await axios.get(endpoint);
            return liveResponse.data;
          }
        } catch (error) {
          console.warn(`No historical data available for ${symbol} (${holdingData.type === 'c' ? 'crypto' : 'stock'}):`, error instanceof Error ? error.message : error);
          return null;
        }
      },
      {
        retry: 1,
        staleTime: Infinity, // Never consider stale
        cacheTime: Infinity, // Keep cached forever
        refetchOnWindowFocus: false,
        refetchOnMount: true, // Only fetch when symbol changes
        refetchOnReconnect: false,
        refetchInterval: false, // No automatic refetching
      }
    );

    // Calculate monthly performance from chart data
    let monthlyPerformance = 0;
    if (chartData?.data && chartData.data.length > 1) {
      const firstPrice = chartData.data[0].close;
      const lastPrice = chartData.data[chartData.data.length - 1].close;
      monthlyPerformance = ((lastPrice - firstPrice) / firstPrice) * 100;
    }

    return (
      <div className="trending-card">
        {/* Stock Info */}
        <div className="trending-header">
          <div className="flex items-center gap-3">
            <CompanyIcon
              symbol={symbol}
              iconUrl={iconUrl}
              companyName={holdingData.companyName || symbol}
              size="10x10"
              showTooltip={false}
            />
            <div>
              <h4 className="trending-symbol">{symbol}</h4>
              <p className="trending-name">{holdingData.companyName || symbol}</p>
            </div>
          </div>
          <div className="trending-price">
            <div className="trending-price-value">
              {formatCurrency(holdingData.cadPrice || holdingData.price || 0)}
            </div>
            <div className={`trending-change ${
              monthlyPerformance > 0
                ? 'positive'
                : monthlyPerformance < 0
                ? 'negative'
                : 'neutral'
            }`}>
              {monthlyPerformance > 0 ? (
                <TrendingUp style={{ width: '0.75rem', height: '0.75rem', marginRight: '0.25rem' }} />
              ) : monthlyPerformance < 0 ? (
                <TrendingDown style={{ width: '0.75rem', height: '0.75rem', marginRight: '0.25rem' }} />
              ) : null}
              {monthlyPerformance !== 0 ? `${monthlyPerformance > 0 ? '+' : ''}${monthlyPerformance.toFixed(2)}%` : 'N/A'}
            </div>
          </div>
        </div>

        {/* Cached Chart */}
        <div className="trending-chart">
          <CachedChart 
            symbol={symbol} 
            holdingData={holdingData}
          />
        </div>
      </div>
    );
  };

  // Show data immediately if we have cached data, even if context is loading
  const hasDataToShow = (persistentHoldings && Object.keys(persistentHoldings).length > 0) || 
                        (activeHoldings && Object.keys(activeHoldings).length > 0);

  if (isLoading && !hasDataToShow) {
    return (
      <div style={{ width: '100%' }}>
        <div style={{ marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#1F2937', marginBottom: '0.5rem' }}>
            Holdings Performance (Monthly)
          </h3>
          <p style={{ fontSize: '0.875rem', color: '#6B7280' }}>
            Loading your top performing holdings...
          </p>
        </div>
        <div className="trending-grid">
          {[...Array(15)].map((_, i) => (
            <div key={i} style={{ animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}>
              <div style={{ height: '8rem', backgroundColor: '#e5e7eb', borderRadius: '0.5rem', marginBottom: '0.5rem' }}></div>
              <div style={{ height: '1rem', backgroundColor: '#e5e7eb', borderRadius: '0.25rem', width: '75%', marginBottom: '0.25rem' }}></div>
              <div style={{ height: '0.75rem', backgroundColor: '#e5e7eb', borderRadius: '0.25rem', width: '50%' }}></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ width: '100%' }}>
        <div style={{ marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#1F2937', marginBottom: '0.5rem' }}>
            Holdings Performance (Monthly)
          </h3>
          <p style={{ fontSize: '0.875rem', color: '#6B7280' }}>
            No portfolio data available
          </p>
        </div>
        <div style={{ textAlign: 'center', padding: '2rem 0' }}>
          <>
            <p style={{ color: '#6b7280' }}>Upload your portfolio to see performance data</p>
            {error && (
              <p style={{ color: '#ef4444', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                Error: {typeof error === 'string' ? error : 'Failed to load portfolio data'}
              </p>
            )}
          </>
        </div>
      </div>
    );
  }

  // Check if we have holdings data (from either source)
  if (!activeHoldings || Object.keys(activeHoldings).length === 0) {
    return (
      <div style={{ width: '100%' }}>
        <div style={{ marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#1F2937', marginBottom: '0.5rem' }}>
            Holdings Performance (Cached)
          </h3>
          <p style={{ fontSize: '0.875rem', color: '#6B7280' }}>
            {persistentHoldings ? 'Loading from persistent cache...' : 'No cached holdings data available'}
          </p>
        </div>
        <div style={{ textAlign: 'center', padding: '2rem 0' }}>
          <p style={{ color: '#6b7280' }}>
            {persistentHoldings ? 'Persistent cache available, initializing...' : 'Cache is being updated...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%' }}>
      <div style={{ marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#1F2937', marginBottom: '0.5rem' }}>
          Holdings Performance (Stocks & Crypto)
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <p style={{ fontSize: '0.875rem', color: '#6B7280' }}>
            Historical price charts for your stock and cryptocurrency holdings
          </p>
          <div style={{ fontSize: '0.75rem', color: '#9CA3AF', display: 'flex', gap: '1rem' }}>
            <span>💾 Source: {persistentHoldings ? 'Persistent Cache' : 'Live Cache'}</span>
            {holdingsTimestamp && (
              <span>🕒 Cache updated: {holdingsTimestamp.toLocaleString()}</span>
            )}
          </div>
        </div>
      </div>
      <div className="trending-grid">
        {activeHoldings && Object.entries(activeHoldings).slice(0, 15).map(([symbol, holdingData]: [string, any]) => {
          return (
            <HoldingCard 
              key={symbol} 
              symbol={symbol} 
              holdingData={holdingData}
              iconUrl={iconUrls[symbol.toUpperCase()]}
            />
          );
        })}
      </div>
    </div>
  );
};

export default HoldingsPerformance; 