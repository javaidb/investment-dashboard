import React from 'react';
import { useQuery } from 'react-query';
import axios from 'axios';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart
} from 'recharts';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface TrendingItem {
  symbol: string;
  name: string;
  type: 'stock' | 'crypto';
  price?: number;
  change?: number;
  changePercent?: number;
}

interface StockData {
  date: string;
  close: number;
}

const TrendingStocks: React.FC = () => {
  // Fetch trending stocks (only on initial load, no automatic refetching)
  const { data: trendingData, isLoading, error } = useQuery(
    'trendingWeekly',
    async () => {
      console.log('🔄 Fetching trending weekly data...');
      try {
        const response = await axios.get('/api/historical/trending/weekly', {
          timeout: 30000 // 30 seconds timeout for trending data
        });
        console.log('✅ Trending weekly data received:', Object.keys(response.data.results || {}).length, 'stocks');
        return response.data;
      } catch (error) {
        const axiosError = error as any;
        console.error('❌ Axios request failed:', {
          message: axiosError.message,
          status: axiosError.response?.status,
          statusText: axiosError.response?.statusText,
          data: axiosError.response?.data,
          url: axiosError.config?.url,
          baseURL: axiosError.config?.baseURL
        });
        throw error;
      }
    },
    {
      staleTime: 5 * 60 * 1000, // 5 minutes - reasonable for trending data
      cacheTime: 30 * 60 * 1000, // 30 minutes cache time
      refetchOnWindowFocus: false,
      refetchOnMount: true,
      refetchOnReconnect: false, // Disable to avoid double requests
      refetchInterval: false,
      retry: 2, // Retry failed requests up to 2 times
      retryDelay: 1000, // Wait 1 second between retries
      onError: (error) => {
        console.error('❌ Trending weekly query failed:', error);
      },
      onSuccess: (data) => {
        console.log('✅ Trending weekly query success:', data);
      }
    }
  );

  const formatTooltip = (value: any) => [`$${value.toFixed(2)}`, 'Price'];

  const formatXAxis = (tickItem: string) => {
    const date = new Date(tickItem);
    return date.toLocaleDateString('en-US', { 
      weekday: 'short',
      month: 'short', 
      day: 'numeric' 
    });
  };

  const formatTooltipLabel = (label: string) => {
    const date = new Date(label);
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  if (isLoading) {
    return (
      <div style={{ width: '100%' }}>
        <div className="trending-grid">
          {[...Array(6)].map((_, i) => (
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
    console.error('TrendingStocks error:', error);
    return (
      <div style={{ width: '100%' }}>
        <div style={{ textAlign: 'center', padding: '2rem 0' }}>
          <p style={{ color: '#ef4444', marginBottom: '0.5rem' }}>Failed to load trending stocks</p>
          <p style={{ color: '#6b7280', fontSize: '0.75rem' }}>
            {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%' }}>
      <div style={{ marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#1F2937', marginBottom: '0.5rem' }}>
          Trending Stocks (Weekly Gainers)
        </h3>
        <p style={{ fontSize: '0.875rem', color: '#6B7280' }}>
          Hourly performance from {trendingData?.dateRange?.start ? new Date(trendingData.dateRange.start).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) : 'Monday'} to now
        </p>
      </div>
      <div className="trending-grid">
        {trendingData?.results && Object.entries(trendingData.results).slice(0, 6).map(([symbol, stockInfo]: [string, any]) => {
          const chartData = stockInfo.data || [];
          const meta = stockInfo.meta || {};
          
          return (
            <div key={symbol} className="trending-card">
              {/* Stock Info */}
              <div className="trending-header">
                <div>
                  <h4 className="trending-symbol">{symbol}</h4>
                  <p className="trending-name">{meta.companyName || symbol}</p>
                </div>
                <div className="trending-price">
                  <div className="trending-price-value">
                    ${meta.currentPrice?.toFixed(2) || 'N/A'}
                  </div>
                  <div className={`trending-change ${
                    meta.changePercent && meta.changePercent > 0
                      ? 'positive'
                      : meta.changePercent && meta.changePercent < 0
                      ? 'negative'
                      : 'neutral'
                  }`}>
                    {meta.changePercent && meta.changePercent > 0 ? (
                      <TrendingUp style={{ width: '0.75rem', height: '0.75rem', marginRight: '0.25rem' }} />
                    ) : meta.changePercent && meta.changePercent < 0 ? (
                      <TrendingDown style={{ width: '0.75rem', height: '0.75rem', marginRight: '0.25rem' }} />
                    ) : null}
                    {meta.changePercent ? `${meta.changePercent > 0 ? '+' : ''}${meta.changePercent.toFixed(2)}%` : 'N/A'}
                  </div>
                </div>
              </div>

              {/* Hourly Chart */}
              <div className="trending-chart">
                {chartData.length > 1 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                      <defs>
                        <linearGradient id={`color${symbol}`} x1="0" y1="0" x2="0" y2="1">
                          <stop 
                            offset="5%" 
                            stopColor={meta.changePercent && meta.changePercent > 0 ? "#10B981" : "#EF4444"} 
                            stopOpacity={0.3}
                          />
                          <stop 
                            offset="95%" 
                            stopColor={meta.changePercent && meta.changePercent > 0 ? "#10B981" : "#EF4444"} 
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
                        stroke={meta.changePercent && meta.changePercent > 0 ? "#10B981" : "#EF4444"}
                        strokeWidth={1.5}
                        fillOpacity={1}
                        fill={`url(#color${symbol})`}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="trending-chart-placeholder">
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '100%',
                      color: '#9CA3AF',
                      fontSize: '0.75rem'
                    }}>
                      Loading chart data...
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TrendingStocks; 