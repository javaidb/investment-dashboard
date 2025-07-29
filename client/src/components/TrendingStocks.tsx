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
  // Fetch trending stocks - only shows stocks with positive 24h performance
  const { data: trendingData, isLoading, error } = useQuery(
    'trending',
    async () => {
      const response = await axios.get('/api/search/trending/all');
      return response.data;
    },
    {
      refetchInterval: 300000, // Refetch every 5 minutes
    }
  );

  // Fetch historical data for trending stocks
  const { data: historicalData } = useQuery(
    ['trendingHistorical', trendingData],
    async () => {
      if (!trendingData?.stocks) return {};
      
      const symbols = trendingData.stocks.slice(0, 6).map((stock: TrendingItem) => stock.symbol);
      const historicalPromises = symbols.map(async (symbol: string) => {
        try {
          const response = await axios.get(`/api/stocks/yahoo/historical/${symbol}`, {
            params: { range: '1mo', interval: '1d' }
          });
          return { symbol, data: response.data };
        } catch (error) {
          console.error(`Error fetching data for ${symbol}:`, error);
          return { symbol, data: [] };
        }
      });
      
      const results = await Promise.all(historicalPromises);
      const historicalMap: { [key: string]: StockData[] } = {};
      results.forEach(({ symbol, data }) => {
        historicalMap[symbol] = data;
      });
      
      return historicalMap;
    },
    {
      enabled: !!trendingData?.stocks,
      staleTime: 300000, // 5 minutes
    }
  );

  const formatTooltip = (value: any) => [`$${value.toFixed(2)}`, 'Price'];

  const formatXAxis = (tickItem: string) => {
    const date = new Date(tickItem);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
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
    return (
      <div style={{ width: '100%' }}>
        <div style={{ textAlign: 'center', padding: '2rem 0' }}>
          <p style={{ color: '#6b7280' }}>Failed to load trending stocks</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%' }}>
      <div style={{ marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#1F2937', marginBottom: '0.5rem' }}>
          Trending Stocks (24h Gainers)
        </h3>
        <p style={{ fontSize: '0.875rem', color: '#6B7280' }}>
          Stocks with the best 24-hour performance
        </p>
      </div>
      <div className="trending-grid">
        {trendingData?.stocks?.slice(0, 6).map((stock: TrendingItem) => {
          const stockData = historicalData?.[stock.symbol] || [];
          const lastDayData = stockData.slice(-2); // Last 2 data points for 1-day view
          
          return (
            <div key={stock.symbol} className="trending-card">
              {/* Stock Info */}
              <div className="trending-header">
                <div>
                  <h4 className="trending-symbol">{stock.symbol}</h4>
                  <p className="trending-name">{stock.name}</p>
                </div>
                <div className="trending-price">
                  <div className="trending-price-value">
                    ${stock.price?.toFixed(2) || 'N/A'}
                  </div>
                  <div className={`trending-change ${
                    stock.changePercent && stock.changePercent > 0
                      ? 'positive'
                      : stock.changePercent && stock.changePercent < 0
                      ? 'negative'
                      : 'neutral'
                  }`}>
                    {stock.changePercent && stock.changePercent > 0 ? (
                      <TrendingUp style={{ width: '0.75rem', height: '0.75rem', marginRight: '0.25rem' }} />
                    ) : stock.changePercent && stock.changePercent < 0 ? (
                      <TrendingDown style={{ width: '0.75rem', height: '0.75rem', marginRight: '0.25rem' }} />
                    ) : null}
                    {stock.changePercent ? `${stock.changePercent > 0 ? '+' : ''}${stock.changePercent.toFixed(2)}%` : 'N/A'}
                  </div>
                </div>
              </div>

              {/* Mini Chart */}
              <div className="trending-chart">
                {lastDayData.length > 1 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={lastDayData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                      <defs>
                        <linearGradient id={`color${stock.symbol}`} x1="0" y1="0" x2="0" y2="1">
                          <stop 
                            offset="5%" 
                            stopColor={stock.changePercent && stock.changePercent > 0 ? "#10B981" : "#EF4444"} 
                            stopOpacity={0.3}
                          />
                          <stop 
                            offset="95%" 
                            stopColor={stock.changePercent && stock.changePercent > 0 ? "#10B981" : "#EF4444"} 
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
                        domain={['dataMin - 0.1', 'dataMax + 0.1']}
                        stroke="#9CA3AF"
                        fontSize={10}
                        hide
                      />
                      <Tooltip 
                        formatter={formatTooltip}
                        labelFormatter={(label) => new Date(label).toLocaleTimeString()}
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
                        stroke={stock.changePercent && stock.changePercent > 0 ? "#10B981" : "#EF4444"}
                        strokeWidth={1.5}
                        fillOpacity={1}
                        fill={`url(#color${stock.symbol})`}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="trending-chart-placeholder">
                    No chart data
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