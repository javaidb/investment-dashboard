import React from 'react';
import { useQuery } from 'react-query';
import axios from 'axios';
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
  const [portfolioId, setPortfolioId] = React.useState<string | null>(null);
  
  // First get portfolio ID by processing uploaded files
  React.useEffect(() => {
    const getPortfolioId = async () => {
      try {
        const uploadResponse = await fetch('/api/portfolio/process-uploaded', {
          method: 'POST',
        });
        if (uploadResponse.ok) {
          const uploadResult = await uploadResponse.json();
          setPortfolioId(uploadResult.portfolioId);
        }
      } catch (error) {
        console.error('Failed to get portfolio ID:', error);
      }
    };
    
    getPortfolioId();
  }, []);

  // Fetch monthly holdings data with daily resolution
  const { data: monthlyData, isLoading, error } = useQuery(
    ['monthlyHoldingsData', portfolioId],
    async () => {
      if (!portfolioId) throw new Error('No portfolio ID available');
      const response = await axios.get(`/api/portfolio/${portfolioId}/monthly`);
      return response.data;
    },
    {
      enabled: !!portfolioId,
      refetchInterval: 300000, // Refetch every 5 minutes
      retry: 2,
    }
  );

  // Debug logging for monthly data
  React.useEffect(() => {
    if (monthlyData) {
      console.log('Monthly data received:', {
        resultsKeys: Object.keys(monthlyData.results || {}),
        dateRange: monthlyData.dateRange,
        summary: monthlyData.summary
      });
    }
  }, [monthlyData]);

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

  // Monthly chart component for each holding (similar to TrendingStocks)
  const MonthlyChart: React.FC<{ symbol: string; stockInfo: any }> = ({ symbol, stockInfo }) => {
    const chartData = stockInfo.data || [];
    const meta = stockInfo.meta || {};
    
    if (chartData.length === 0) {
      const message = stockInfo.noData ? 'Chart data unavailable' : 'Loading chart data...';
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
            {message}
          </div>
        </div>
      );
    }

    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
          <defs>
            <linearGradient id={`monthlyColor${symbol}`} x1="0" y1="0" x2="0" y2="1">
              <stop 
                offset="5%" 
                stopColor={meta.monthlyPerformance && meta.monthlyPerformance > 0 ? "#10B981" : "#EF4444"} 
                stopOpacity={0.3}
              />
              <stop 
                offset="95%" 
                stopColor={meta.monthlyPerformance && meta.monthlyPerformance > 0 ? "#10B981" : "#EF4444"} 
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
            stroke={meta.monthlyPerformance && meta.monthlyPerformance > 0 ? "#10B981" : "#EF4444"}
            strokeWidth={1.5}
            fillOpacity={1}
            fill={`url(#monthlyColor${symbol})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  };

  if (isLoading) {
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
                Error: {error instanceof Error ? error.message : 'Failed to load portfolio data'}
              </p>
            )}
          </>
        </div>
      </div>
    );
  }

  // Check if we have monthly data
  if (!monthlyData?.results || Object.keys(monthlyData.results).length === 0) {
    return (
      <div style={{ width: '100%' }}>
        <div style={{ marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#1F2937', marginBottom: '0.5rem' }}>
            Holdings Performance (Monthly)
          </h3>
          <p style={{ fontSize: '0.875rem', color: '#6B7280' }}>
            No holdings with monthly data available
          </p>
        </div>
        <div style={{ textAlign: 'center', padding: '2rem 0' }}>
          <p style={{ color: '#6b7280' }}>Price data is being updated...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%' }}>
      <div style={{ marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#1F2937', marginBottom: '0.5rem' }}>
          Holdings Performance (Monthly)
        </h3>
        <p style={{ fontSize: '0.875rem', color: '#6B7280' }}>
          Daily performance from {monthlyData?.dateRange?.start ? new Date(monthlyData.dateRange.start).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : 'last month'} to now
        </p>
      </div>
      <div className="trending-grid">
        {monthlyData?.results && Object.entries(monthlyData.results).slice(0, 15).map(([symbol, stockInfo]: [string, any]) => {
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
                    {formatCurrency(meta.currentPrice || 0)}
                  </div>
                  <div className={`trending-change ${
                    meta.monthlyPerformance && meta.monthlyPerformance > 0
                      ? 'positive'
                      : meta.monthlyPerformance && meta.monthlyPerformance < 0
                      ? 'negative'
                      : 'neutral'
                  }`}>
                    {meta.monthlyPerformance && meta.monthlyPerformance > 0 ? (
                      <TrendingUp style={{ width: '0.75rem', height: '0.75rem', marginRight: '0.25rem' }} />
                    ) : meta.monthlyPerformance && meta.monthlyPerformance < 0 ? (
                      <TrendingDown style={{ width: '0.75rem', height: '0.75rem', marginRight: '0.25rem' }} />
                    ) : null}
                    {meta.monthlyPerformance ? `${meta.monthlyPerformance > 0 ? '+' : ''}${meta.monthlyPerformance.toFixed(2)}%` : 'N/A'}
                  </div>
                </div>
              </div>

              {/* Monthly Chart */}
              <div className="trending-chart">
                <MonthlyChart 
                  symbol={symbol} 
                  stockInfo={stockInfo}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default HoldingsPerformance; 