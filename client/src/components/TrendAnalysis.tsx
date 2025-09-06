import React from 'react';
import { useQuery, useQueryClient } from 'react-query';
import axios from 'axios';
import { useCache } from '../contexts/CacheContext';
import { useIcons } from '../hooks/useIcons';
import CompanyIcon from './CompanyIcon';
import { TrendingUp, TrendingDown, AlertTriangle, Activity, BarChart3, Zap } from 'lucide-react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';

interface TrendAnalysisResult {
  symbol: string;
  analysis: {
    inflectionPoints: Array<{ date: string; type: 'peak' | 'valley'; strength: number }>;
    trendChanges: Array<{ period: string; oldTrend: number; newTrend: number; change: 'acceleration' | 'deceleration' | 'reversal' }>;
    overallTrend: 'bullish' | 'bearish' | 'sideways';
    volatility: 'high' | 'medium' | 'low';
    momentum: 'increasing' | 'decreasing' | 'stable';
    notableChanges: string[];
  };
}

const TrendAnalysis: React.FC = () => {
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

  // Use React Query for persistent holdings cache
  const { data: persistentHoldings } = useQuery(
    'persistent-holdings-cache',
    () => cachedHoldings,
    {
      enabled: !!cachedHoldings && Object.keys(cachedHoldings).length > 0,
      staleTime: Infinity,
      cacheTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      refetchInterval: false,
    }
  );

  // Transfer cache context data to React Query when available
  React.useEffect(() => {
    if (cachedHoldings && Object.keys(cachedHoldings).length > 0) {
      console.log('🔄 TrendAnalysis: Transferring cache context data to React Query persistent cache');
      queryClient.setQueryData('persistent-holdings-cache', cachedHoldings);
    }
  }, [cachedHoldings, queryClient]);

  // Use persistent holdings if available, fallback to cache context
  const activeHoldings = persistentHoldings || cachedHoldings;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'CAD',
    }).format(amount);
  };

  const formatTooltip = (value: any) => [`$${value.toFixed(2)}`, 'Price'];

  const formatXAxis = (tickItem: string) => {
    const date = new Date(tickItem);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  };

  // Trend Analysis Functions
  const analyzeTrends = (data: any[]): TrendAnalysisResult['analysis'] => {
    if (!data || data.length < 10) {
      return {
        inflectionPoints: [],
        trendChanges: [],
        overallTrend: 'sideways',
        volatility: 'low',
        momentum: 'stable',
        notableChanges: ['Insufficient data for trend analysis']
      };
    }

    const prices = data.map(d => d.close);
    const dates = data.map(d => d.date);
    
    // Detect inflection points
    const inflectionPoints = detectInflectionPoints(prices, dates);
    
    // Analyze trend changes over different periods
    const trendChanges = analyzeTrendChanges(prices);
    
    // Calculate overall trend
    const overallTrend = calculateOverallTrend(prices);
    
    // Calculate volatility
    const volatility = calculateVolatility(prices);
    
    // Calculate momentum
    const momentum = calculateMomentum(prices);
    
    // Generate notable changes summary
    const notableChanges = generateNotableChanges(inflectionPoints, trendChanges, overallTrend, volatility, momentum);

    return {
      inflectionPoints,
      trendChanges,
      overallTrend,
      volatility,
      momentum,
      notableChanges
    };
  };

  const detectInflectionPoints = (prices: number[], dates: string[]) => {
    const inflectionPoints: any[] = [];
    const windowSize = 5; // Look at 5-day windows
    
    for (let i = windowSize; i < prices.length - windowSize; i++) {
      const leftSlope = (prices[i] - prices[i - windowSize]) / windowSize;
      const rightSlope = (prices[i + windowSize] - prices[i]) / windowSize;
      
      // Detect peaks (positive to negative slope change)
      if (leftSlope > 0 && rightSlope < 0 && Math.abs(leftSlope - rightSlope) > 0.5) {
        inflectionPoints.push({
          date: dates[i],
          type: 'peak',
          strength: Math.abs(leftSlope - rightSlope)
        });
      }
      
      // Detect valleys (negative to positive slope change)
      if (leftSlope < 0 && rightSlope > 0 && Math.abs(leftSlope - rightSlope) > 0.5) {
        inflectionPoints.push({
          date: dates[i],
          type: 'valley',
          strength: Math.abs(leftSlope - rightSlope)
        });
      }
    }
    
    return inflectionPoints.slice(-5); // Return last 5 inflection points
  };

  const analyzeTrendChanges = (prices: number[]) => {
    const trendChanges: any[] = [];
    const periods = [7, 14, 30]; // 1 week, 2 weeks, 1 month
    
    periods.forEach(period => {
      if (prices.length >= period * 2) {
        const recentTrend = calculateLinearTrend(prices.slice(-period));
        const previousTrend = calculateLinearTrend(prices.slice(-period * 2, -period));
        
        if (Math.abs(recentTrend - previousTrend) > 0.1) {
          let changeType: 'acceleration' | 'deceleration' | 'reversal';
          
          if (Math.sign(recentTrend) !== Math.sign(previousTrend)) {
            changeType = 'reversal';
          } else if (Math.abs(recentTrend) > Math.abs(previousTrend)) {
            changeType = 'acceleration';
          } else {
            changeType = 'deceleration';
          }
          
          trendChanges.push({
            period: `${period}d`,
            oldTrend: previousTrend,
            newTrend: recentTrend,
            change: changeType
          });
        }
      }
    });
    
    return trendChanges;
  };

  const calculateLinearTrend = (prices: number[]) => {
    const n = prices.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = prices;
    
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    return slope;
  };

  const calculateOverallTrend = (prices: number[]): 'bullish' | 'bearish' | 'sideways' => {
    const trend = calculateLinearTrend(prices);
    if (trend > 0.5) return 'bullish';
    if (trend < -0.5) return 'bearish';
    return 'sideways';
  };

  const calculateVolatility = (prices: number[]): 'high' | 'medium' | 'low' => {
    const returns = prices.slice(1).map((price, i) => (price - prices[i]) / prices[i]);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance);
    
    if (volatility > 0.05) return 'high';
    if (volatility > 0.02) return 'medium';
    return 'low';
  };

  const calculateMomentum = (prices: number[]): 'increasing' | 'decreasing' | 'stable' => {
    if (prices.length < 10) return 'stable';
    
    const recentTrend = calculateLinearTrend(prices.slice(-10));
    const previousTrend = calculateLinearTrend(prices.slice(-20, -10));
    
    const momentumChange = recentTrend - previousTrend;
    
    if (momentumChange > 0.2) return 'increasing';
    if (momentumChange < -0.2) return 'decreasing';
    return 'stable';
  };

  const generateNotableChanges = (inflectionPoints: any[], trendChanges: any[], overallTrend: string, volatility: string, momentum: string) => {
    const changes: string[] = [];
    
    if (inflectionPoints.length > 0) {
      const recentInflection = inflectionPoints[inflectionPoints.length - 1];
      changes.push(`Recent ${recentInflection.type} detected with ${recentInflection.strength > 2 ? 'strong' : 'moderate'} signal strength`);
    }
    
    trendChanges.forEach(change => {
      if (change.change === 'reversal') {
        changes.push(`Trend reversal over ${change.period} period`);
      } else if (change.change === 'acceleration' && Math.abs(change.newTrend) > 1) {
        changes.push(`Significant trend acceleration over ${change.period} period`);
      }
    });
    
    if (volatility === 'high') {
      changes.push('Elevated volatility detected');
    }
    
    if (momentum === 'increasing' && overallTrend === 'bullish') {
      changes.push('Strengthening bullish momentum');
    } else if (momentum === 'increasing' && overallTrend === 'bearish') {
      changes.push('Accelerating bearish trend');
    }
    
    if (changes.length === 0) {
      changes.push('No significant trend changes detected');
    }
    
    return changes;
  };

  // Chart component with trend analysis
  const TrendAnalysisChart: React.FC<{ symbol: string; holdingData: any; iconUrl?: string }> = ({ symbol, holdingData, iconUrl }) => {
    const [trendAnalysis, setTrendAnalysis] = React.useState<TrendAnalysisResult['analysis'] | null>(null);
    
    const { data: chartData, isLoading: chartLoading } = useQuery(
      ['symbol-chart-analysis', symbol, holdingData.type],
      async () => {
        try {
          const cryptoSymbols = ['BTC', 'ETH', 'ADA', 'SOL', 'DOT', 'LINK', 'UNI', 'MATIC', 'AVAX', 'ATOM', 'LTC', 'BCH', 'XRP', 'DOGE', 'SHIB'];
          const isCrypto = cryptoSymbols.includes(symbol.toUpperCase());
          
          try {
            const cacheResponse = await axios.get(`/api/portfolio/cache/historical/${symbol}`);
            console.log(`💾 Cache hit for trend analysis ${symbol}`);
            return cacheResponse.data;
          } catch (cacheError) {
            const endpoint = isCrypto 
              ? `/api/historical/crypto/${symbol}?period=3m&interval=1d`
              : `/api/historical/stock/${symbol}?period=3m&interval=1d`;
            
            console.log(`📊 Cache miss for trend analysis ${symbol}, fetching from ${endpoint}`);
            const liveResponse = await axios.get(endpoint);
            return liveResponse.data;
          }
        } catch (error) {
          console.warn(`No historical data available for trend analysis ${symbol}:`, error);
          return null;
        }
      },
      {
        retry: 1,
        staleTime: Infinity,
        cacheTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnMount: true,
        refetchOnReconnect: false,
        refetchInterval: false,
      }
    );

    // Perform trend analysis when data is available
    React.useEffect(() => {
      if (chartData && chartData.data && chartData.data.length > 0) {
        const analysis = analyzeTrends(chartData.data);
        setTrendAnalysis(analysis);
      }
    }, [chartData]);

    if (chartLoading) {
      return (
        <div className="holding-card">
          <div className="holding-header">
            <div className="holding-symbol">
              <CompanyIcon
                symbol={symbol}
                iconUrl={iconUrl}
                companyName={holdingData.companyName || symbol}
                size="10x10"
              />
              <div className="symbol-info">
                <div className="symbol-text">{symbol}</div>
              </div>
            </div>
          </div>
          <div className="holding-chart">
            <div className="mini-chart-placeholder">
              <Activity className="placeholder-icon" />
              <span className="placeholder-text">Analyzing trends...</span>
            </div>
          </div>
        </div>
      );
    }

    if (!chartData || !chartData.data || chartData.data.length === 0) {
      return (
        <div className="holding-card">
          <div className="holding-header">
            <div className="holding-symbol">
              <CompanyIcon
                symbol={symbol}
                iconUrl={iconUrl}
                companyName={holdingData.companyName || symbol}
                size="10x10"
              />
              <div className="symbol-info">
                <div className="symbol-text">{symbol}</div>
              </div>
            </div>
          </div>
          <div className="holding-chart">
            <div className="mini-chart-placeholder">
              <BarChart3 className="placeholder-icon" />
              <span className="placeholder-text">No data for analysis</span>
            </div>
          </div>
        </div>
      );
    }

    const data = chartData.data;
    
    // Calculate monthly performance
    let performance = 0;
    if (data && data.length > 1) {
      const firstPrice = data[0].close;
      const lastPrice = data[data.length - 1].close;
      performance = ((lastPrice - firstPrice) / firstPrice) * 100;
    }

    const getTrendIcon = (trend: string) => {
      switch (trend) {
        case 'bullish': return <TrendingUp className="w-4 h-4 text-green-600" />;
        case 'bearish': return <TrendingDown className="w-4 h-4 text-red-600" />;
        default: return <Activity className="w-4 h-4 text-gray-600" />;
      }
    };

    const getVolatilityColor = (volatility: string) => {
      switch (volatility) {
        case 'high': return 'text-red-600';
        case 'medium': return 'text-yellow-600';
        default: return 'text-green-600';
      }
    };

    const getMomentumIcon = (momentum: string) => {
      switch (momentum) {
        case 'increasing': return <Zap className="w-3 h-3 text-green-600" />;
        case 'decreasing': return <TrendingDown className="w-3 h-3 text-red-600" />;
        default: return <Activity className="w-3 h-3 text-gray-600" />;
      }
    };

    return (
      <div className="holding-card" style={{ 
        minHeight: '340px', 
        padding: '1.25rem',
        minWidth: '380px',
        maxWidth: '420px',
        width: '100%'
      }}>
        <div className="holding-header" style={{ marginBottom: '1rem' }}>
          <div className="holding-symbol">
            <CompanyIcon
              symbol={symbol}
              iconUrl={iconUrl}
              companyName={holdingData.companyName || symbol}
              size="10x10"
              showTooltip={false}
            />
            <div className="symbol-info">
              <div className="symbol-text" style={{ fontSize: '0.95rem', fontWeight: '700' }}>
                {symbol}
              </div>
              <div className="quantity-text" style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>
                {formatCurrency(holdingData.cadPrice || holdingData.price || 0)}
              </div>
            </div>
          </div>
          <div className="holding-price">
            <div className={`current-price ${performance >= 0 ? 'text-green-600' : 'text-red-600'}`} 
                 style={{ fontSize: '0.9rem', fontWeight: '700', marginBottom: '0.3rem' }}>
              {performance >= 0 ? '+' : ''}{performance.toFixed(2)}%
            </div>
            <div className="data-freshness">
              <div className="freshness-indicator fresh" style={{ padding: '0.2rem 0.4rem' }}>
                <Activity className="freshness-icon" />
                <span className="freshness-text">Analyzed</span>
              </div>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="holding-chart" style={{ height: '120px', marginBottom: '1rem' }}>
          <div className="mini-chart" style={{ height: '120px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart 
                data={data} 
                margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
                style={{ minHeight: '120px' }}
              >
                <defs>
                  <linearGradient id={`colorPrice-${symbol}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={performance >= 0 ? "#10b981" : "#ef4444"} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={performance >= 0 ? "#10b981" : "#ef4444"} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="date" 
                  tickFormatter={formatXAxis} 
                  hide 
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis 
                  domain={['dataMin - 5%', 'dataMax + 5%']} 
                  hide 
                  axisLine={false}
                  tickLine={false}
                />
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <Tooltip 
                  formatter={formatTooltip} 
                  labelFormatter={(label) => new Date(label).toLocaleDateString()}
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '0.75rem'
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="close"
                  stroke={performance >= 0 ? "#10b981" : "#ef4444"}
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill={`url(#colorPrice-${symbol})`}
                  connectNulls={false}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Trend Analysis Results */}
        {trendAnalysis && (
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg border border-gray-200" style={{ padding: '1rem' }}>
            {/* Characterization Section */}
            <div style={{ 
              marginBottom: '1rem', 
              border: '2px solid #3b82f6', 
              borderRadius: '0.5rem', 
              backgroundColor: 'rgba(239, 246, 255, 0.5)', 
              padding: '0.75rem' 
            }}>
              <div className="flex items-center gap-2 mb-3">
                <h4 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Characterization</h4>
              </div>
              
              <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                {/* Overall Trend */}
                <div className="bg-white rounded-md px-3 py-2 border border-gray-300 shadow-sm" style={{ flex: '1', minWidth: '0', textAlign: 'center' }}>
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <span className="text-xs font-medium text-gray-500">TREND</span>
                  </div>
                  <div className="text-sm font-bold capitalize" style={{ 
                    color: trendAnalysis.overallTrend === 'bullish' ? '#16a34a' :
                           trendAnalysis.overallTrend === 'bearish' ? '#dc2626' : '#1f2937'
                  }}>
                    {trendAnalysis.overallTrend}
                  </div>
                </div>

                {/* Volatility */}
                <div className="bg-white rounded-md px-3 py-2 border border-gray-300 shadow-sm" style={{ flex: '1', minWidth: '0', textAlign: 'center' }}>
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <div className={`w-2 h-2 rounded-full ${
                      trendAnalysis.volatility === 'high' ? 'bg-red-500' :
                      trendAnalysis.volatility === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
                    }`}></div>
                    <span className="text-xs font-medium text-gray-500">VOLATILITY</span>
                  </div>
                  <div className={`text-sm font-bold uppercase ${getVolatilityColor(trendAnalysis.volatility)}`}>
                    {trendAnalysis.volatility}
                  </div>
                </div>

                {/* Momentum */}
                <div className="bg-white rounded-md px-3 py-2 border border-gray-300 shadow-sm" style={{ flex: '1', minWidth: '0', textAlign: 'center' }}>
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <span className="text-xs font-medium text-gray-500">MOMENTUM</span>
                  </div>
                  <div className="text-sm font-bold capitalize" style={{ 
                    color: trendAnalysis.momentum === 'increasing' ? '#16a34a' :
                           trendAnalysis.momentum === 'decreasing' ? '#dc2626' : '#1f2937'
                  }}>
                    {trendAnalysis.momentum}
                  </div>
                </div>
              </div>
            </div>

            {/* Trends Section */}
            <div style={{ 
              border: '2px solid #f59e0b', 
              borderRadius: '0.5rem', 
              backgroundColor: 'rgba(255, 251, 235, 0.5)', 
              padding: '0.75rem' 
            }}>
              <div className="flex items-center gap-2 mb-3">
                <h4 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Trend Analysis</h4>
              </div>
              
              {/* Notable Changes */}
              <div className="space-y-2 mb-3">
                {trendAnalysis.notableChanges.slice(0, 2).map((change, index) => (
                  <div key={index} className="bg-white rounded-md px-3 py-2 border border-amber-300 shadow-sm">
                    <div className="flex items-start gap-3">
                      <span className="text-xs text-gray-500 mt-0.5">•</span>
                      <span className="text-xs text-gray-700 leading-relaxed font-medium">{change}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pattern Detection Summary */}
              {(trendAnalysis.inflectionPoints.length > 0 || trendAnalysis.trendChanges.length > 0) && (
                <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                  {trendAnalysis.inflectionPoints.length > 0 && (
                    <div className="bg-white rounded-md px-3 py-2 border border-blue-300 shadow-sm" style={{ flex: '1', minWidth: '0' }}>
                      <div className="text-sm font-bold text-gray-800">
                        {trendAnalysis.inflectionPoints.length}
                      </div>
                      <div className="text-xs text-blue-600 font-medium">
                        Inflection Point{trendAnalysis.inflectionPoints.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                  )}
                  
                  {trendAnalysis.trendChanges.length > 0 && (
                    <div className="bg-white rounded-md px-3 py-2 border border-green-300 shadow-sm" style={{ flex: '1', minWidth: '0' }}>
                      <div className="text-sm font-bold text-gray-800">
                        {trendAnalysis.trendChanges.length}
                      </div>
                      <div className="text-xs text-green-600 font-medium">
                        Trend Change{trendAnalysis.trendChanges.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="holdings-performance">
        <div className="holdings-performance-header">
          <h3>Trend Analysis</h3>
          <p>Analyzing portfolio trends and detecting notable changes...</p>
        </div>
        <div className="holdings-performance-grid">
          {[1, 2, 3].map((i) => (
            <div key={i} className="holding-card skeleton">
              <div className="skeleton-line" style={{ width: '60%' }}></div>
              <div className="skeleton-line" style={{ width: '40%' }}></div>
              <div className="skeleton-line" style={{ width: '80%' }}></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="holdings-performance-empty">
        <AlertTriangle className="empty-icon" />
        <p>Error loading trend analysis data: {error}</p>
      </div>
    );
  }

  if (!activeHoldings || Object.keys(activeHoldings).length === 0) {
    return (
      <div className="holdings-performance-empty">
        <BarChart3 className="empty-icon" />
        <p>No holdings data available for trend analysis</p>
      </div>
    );
  }

  const holdingsForAnalysis = Object.entries(activeHoldings).map(([symbol, data]) => ({
    symbol,
    ...data
  }));

  return (
    <div className="holdings-performance">
      <div className="holdings-performance-header">
        <div className="header-top">
          <h3>Portfolio Trend Analysis</h3>
        </div>
        <p>Advanced trend analysis detecting inflection points, momentum changes, and notable patterns over the last month</p>
        <div className="data-info">
          <div className="info-text">
            <Activity className="info-icon" />
            <span>Real-time trend detection</span>
          </div>
          <div className="info-text">
            <BarChart3 className="info-icon" />
            <span>Technical analysis</span>
          </div>
          <div className="info-text">
            <Zap className="info-icon" />
            <span>Momentum tracking</span>
          </div>
        </div>
      </div>

      <div className="holdings-performance-grid">
        {holdingsForAnalysis.map(({ symbol, ...holdingData }) => (
          <TrendAnalysisChart 
            key={symbol} 
            symbol={symbol} 
            holdingData={holdingData}
            iconUrl={iconUrls[symbol.toUpperCase()]}
          />
        ))}
      </div>
    </div>
  );
};

export default TrendAnalysis;