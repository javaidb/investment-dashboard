import React from 'react';
import { useQuery, useQueryClient } from 'react-query';
import axios from 'axios';
import { useCache } from '../contexts/CacheContext';
import { useIcons } from '../hooks/useIcons';
import CompanyIcon from './CompanyIcon';
import { TrendingUp, TrendingDown, AlertTriangle, Activity, BarChart3, Zap, Minus, Info, Calculator, Target } from 'lucide-react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Scatter,
  ScatterChart,
  ReferenceDot
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
    
    // Step 1: Apply 2-week (14-day) moving average to smooth out noise and spikes
    const smoothingWindow = 14;
    const smoothedPrices = calculateMovingAverage(prices, smoothingWindow);
    
    // Step 2: Find inflection points on the smoothed curve by detecting slope changes
    const lookAhead = 21; // 3-week window to confirm trend changes
    
    for (let i = lookAhead; i < smoothedPrices.length - lookAhead; i++) {
      const current = smoothedPrices[i];
      
      // Calculate slopes before and after the current point
      const leftSlope = (current - smoothedPrices[i - lookAhead]) / lookAhead;
      const rightSlope = (smoothedPrices[i + lookAhead] - current) / lookAhead;
      
      // Detect significant slope changes (trend reversals)
      const slopeChange = Math.abs(leftSlope - rightSlope);
      
      // Peak detection: upward slope changes to downward (left positive, right negative)
      if (leftSlope > 0 && rightSlope < 0 && slopeChange > 0.02) {
        // Calculate strength based on slope change magnitude and price level
        const priceStrength = Math.abs((current - smoothedPrices[i - lookAhead]) / smoothedPrices[i - lookAhead]);
        const strength = slopeChange + priceStrength;
        
        inflectionPoints.push({
          date: dates[i],
          type: 'peak',
          strength: strength,
          priceLevel: prices[i], // Use original price for display
          smoothedPrice: current
        });
      }
      
      // Valley detection: downward slope changes to upward (left negative, right positive)  
      if (leftSlope < 0 && rightSlope > 0 && slopeChange > 0.02) {
        // Calculate strength based on slope change magnitude and price drop
        const priceStrength = Math.abs((smoothedPrices[i - lookAhead] - current) / smoothedPrices[i - lookAhead]);
        const strength = slopeChange + priceStrength;
        
        inflectionPoints.push({
          date: dates[i],
          type: 'valley', 
          strength: strength,
          priceLevel: prices[i], // Use original price for display
          smoothedPrice: current
        });
      }
    }
    
    // Remove points too close together (within 30 days) keeping strongest
    const filteredPoints: any[] = [];
    const sortedByStrength = inflectionPoints.sort((a, b) => b.strength - a.strength);
    
    for (const point of sortedByStrength) {
      const tooClose = filteredPoints.some(existing => 
        Math.abs(new Date(point.date).getTime() - new Date(existing.date).getTime()) < 30 * 24 * 60 * 60 * 1000
      );
      if (!tooClose) {
        filteredPoints.push(point);
      }
    }
    
    // Return top 4-6 most significant points chronologically
    return filteredPoints
      .slice(0, 6)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  const calculateMovingAverage = (prices: number[], window: number): number[] => {
    const ma: number[] = [];
    for (let i = 0; i < prices.length; i++) {
      if (i < window - 1) {
        ma.push(prices[i]); // Use actual price for early values
      } else {
        const sum = prices.slice(i - window + 1, i + 1).reduce((a, b) => a + b, 0);
        ma.push(sum / window);
      }
    }
    return ma;
  };

  const analyzeTrendChanges = (prices: number[]) => {
    const trendChanges: any[] = [];
    const periods = [60, 120, 180]; // 2 months, 4 months, 6 months for better yearly perspective
    
    periods.forEach(period => {
      if (prices.length >= period * 2) {
        // Calculate percentage-based trends for better comparison
        const recentPeriodStart = prices[prices.length - period * 2];
        const recentPeriodMid = prices[prices.length - period];
        const recentPeriodEnd = prices[prices.length - 1];
        
        const firstHalfReturn = ((recentPeriodMid - recentPeriodStart) / recentPeriodStart) * 100;
        const secondHalfReturn = ((recentPeriodEnd - recentPeriodMid) / recentPeriodMid) * 100;
        
        // Only flag significant changes (>15% difference in returns)
        if (Math.abs(secondHalfReturn - firstHalfReturn) > 15) {
          let changeType: 'acceleration' | 'deceleration' | 'reversal';
          let magnitude = Math.abs(secondHalfReturn - firstHalfReturn);
          
          if (Math.sign(secondHalfReturn) !== Math.sign(firstHalfReturn) && magnitude > 20) {
            changeType = 'reversal';
          } else if (Math.abs(secondHalfReturn) > Math.abs(firstHalfReturn) * 1.5) {
            changeType = 'acceleration';
          } else if (Math.abs(secondHalfReturn) < Math.abs(firstHalfReturn) * 0.5) {
            changeType = 'deceleration';
          } else {
            return; // Skip minor changes
          }
          
          const periodLabel = period === 60 ? '2m' : period === 120 ? '4m' : '6m';
          trendChanges.push({
            period: periodLabel,
            oldTrend: firstHalfReturn,
            newTrend: secondHalfReturn,
            change: changeType,
            magnitude: magnitude
          });
        }
      }
    });
    
    // Sort by magnitude to show most significant changes first
    return trendChanges.sort((a, b) => (b.magnitude || 0) - (a.magnitude || 0));
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
    // Calculate year-over-year percentage change for better context
    const startPrice = prices[0];
    const endPrice = prices[prices.length - 1];
    const overallReturn = ((endPrice - startPrice) / startPrice) * 100;
    
    // Use more meaningful thresholds for yearly performance
    if (overallReturn > 10) return 'bullish'; // >10% annual return
    if (overallReturn < -10) return 'bearish'; // <-10% annual return
    return 'sideways';
  };

  const calculateVolatility = (prices: number[]): 'high' | 'medium' | 'low' => {
    // Calculate annualized volatility using daily returns
    const returns = prices.slice(1).map((price, i) => Math.log(price / prices[i]));
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / (returns.length - 1);
    const dailyVolatility = Math.sqrt(variance);
    const annualizedVolatility = dailyVolatility * Math.sqrt(252); // Trading days per year
    
    // Volatility thresholds based on typical market behavior
    if (annualizedVolatility > 0.4) return 'high';    // >40% annualized
    if (annualizedVolatility > 0.2) return 'medium';  // 20-40% annualized  
    return 'low';                                      // <20% annualized
  };

  const calculateMomentum = (prices: number[]): 'increasing' | 'decreasing' | 'stable' => {
    if (prices.length < 90) return 'stable';
    
    // Compare recent 3-month period with previous 3-month period
    const recent3Months = prices.slice(-90, -1);
    const previous3Months = prices.slice(-180, -90);
    
    if (recent3Months.length === 0 || previous3Months.length === 0) return 'stable';
    
    // Calculate percentage returns for each period
    const recentReturn = ((recent3Months[recent3Months.length - 1] - recent3Months[0]) / recent3Months[0]) * 100;
    const previousReturn = ((previous3Months[previous3Months.length - 1] - previous3Months[0]) / previous3Months[0]) * 100;
    
    const momentumChange = recentReturn - previousReturn;
    
    // More significant thresholds for quarterly momentum shifts
    if (momentumChange > 15) return 'increasing';  // Recent quarter 15%+ better
    if (momentumChange < -15) return 'decreasing'; // Recent quarter 15%+ worse
    return 'stable';
  };

  const colorTrendWords = (text: string) => {
    return text
      .replace(/bullish/gi, '<span style="color: #16a34a; font-weight: 600;">bullish</span>')
      .replace(/bearish/gi, '<span style="color: #dc2626; font-weight: 600;">bearish</span>');
  };

  const generateNotableChanges = (inflectionPoints: any[], trendChanges: any[], overallTrend: string, volatility: string, momentum: string) => {
    const changes: string[] = [];
    
    // Analyze inflection points pattern
    if (inflectionPoints.length >= 2) {
      const peaks = inflectionPoints.filter(p => p.type === 'peak');
      const valleys = inflectionPoints.filter(p => p.type === 'valley');
      
      if (peaks.length > valleys.length * 2) {
        changes.push('Multiple resistance levels identified - potential distribution pattern');
      } else if (valleys.length > peaks.length * 2) {
        changes.push('Multiple support levels tested - potential accumulation pattern');
      } else if (inflectionPoints.length >= 4) {
        const recentPoint = inflectionPoints[inflectionPoints.length - 1];
        changes.push(`${recentPoint.type === 'peak' ? 'Resistance' : 'Support'} level established at $${recentPoint.priceLevel?.toFixed(2)}`);
      }
    }
    
    // Highlight most significant trend changes
    if (trendChanges.length > 0) {
      const mostSignificant = trendChanges[0]; // Already sorted by magnitude
      if (mostSignificant.change === 'reversal') {
        const direction = mostSignificant.newTrend > 0 ? 'bullish' : 'bearish';
        changes.push(`Major trend reversal to ${direction} over ${mostSignificant.period} (${Math.abs(mostSignificant.magnitude).toFixed(1)}% shift)`);
      } else if (mostSignificant.change === 'acceleration') {
        changes.push(`Trend acceleration over ${mostSignificant.period} period (${Math.abs(mostSignificant.newTrend).toFixed(1)}% vs ${Math.abs(mostSignificant.oldTrend).toFixed(1)}%)`);
      }
    }
    
    // Combine trend and momentum for insights
    if (overallTrend === 'bullish' && momentum === 'increasing') {
      changes.push('Strong upward momentum with accelerating gains');
    } else if (overallTrend === 'bearish' && momentum === 'decreasing') {
      changes.push('Downtrend intensifying with accelerating losses');
    } else if (overallTrend === 'sideways' && volatility === 'high') {
      changes.push('High volatility range-bound trading - breakout potential');
    } else if (momentum === 'stable' && volatility === 'low') {
      changes.push('Consolidation phase with low volatility');
    }
    
    // Risk assessment
    if (volatility === 'high' && momentum === 'decreasing') {
      changes.push('Elevated risk: high volatility with weakening momentum');
    }
    
    if (changes.length === 0) {
      changes.push(`Steady ${overallTrend} trend with ${volatility} volatility`);
    }
    
    // Limit to top 3 most relevant insights
    return changes.slice(0, 3);
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
            // First try to get 1-year data from historical cache
            const cacheResponse = await axios.get(`/api/portfolio/cache/historical/${symbol}?period=1y`);
            console.log(`💾 Cache hit for trend analysis ${symbol} (1-year data)`);
            return cacheResponse.data;
          } catch (cacheError) {
            // Fallback to fetching 1-year data from historical API
            const endpoint = isCrypto 
              ? `/api/historical/crypto/${symbol}?period=1y&interval=1d`
              : `/api/historical/stock/${symbol}?period=1y&interval=1d`;
            
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
      return (
        <img
          src={`/icons/${trend}.png`}
          alt={`${trend} trend`}
          style={{ width: '1rem', height: '1rem' }}
          onError={(e) => {
            // Fallback to Lucide icons if custom icons fail to load
            const target = e.target as HTMLImageElement;
            const fallbackIcon = trend === 'bullish' ? 
              <TrendingUp className="w-4 h-4 text-green-600" /> : 
              trend === 'bearish' ? 
              <TrendingDown className="w-4 h-4 text-red-600" /> : 
              <Minus className="w-4 h-4 text-gray-600" />;
            target.style.display = 'none';
            // Note: This fallback approach is simplified for the icon function
          }}
        />
      );
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
                {/* Inflection Point Markers as Reference Dots */}
                {trendAnalysis && trendAnalysis.inflectionPoints && trendAnalysis.inflectionPoints.map((point, index) => {
                  const dataPoint = data.find((d: any) => 
                    new Date(d.date).toDateString() === new Date(point.date).toDateString()
                  );
                  
                  if (!dataPoint) return null;
                  
                  return (
                    <ReferenceDot
                      key={`inflection-${index}`}
                      x={dataPoint.date}
                      y={dataPoint.close}
                      r={6}
                      fill="transparent"
                      stroke={point.type === 'peak' ? '#dc2626' : '#2563eb'}
                      strokeWidth={3}
                      style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))' }}
                    />
                  );
                })}
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
                <div className="bg-white rounded-md px-3 py-2 border border-gray-300 shadow-sm" style={{ flex: '1', minWidth: '0', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <img
                    src={`/icons/${trendAnalysis.overallTrend}.png`}
                    alt={`${trendAnalysis.overallTrend} trend`}
                    style={{ 
                      width: '2rem', 
                      height: '2rem',
                      objectFit: 'contain'
                    }}
                    onError={(e) => {
                      console.log(`Failed to load icon: /icons/${trendAnalysis.overallTrend}.png`);
                      // Fallback to Lucide icons if custom icons fail to load
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      const fallback = target.nextElementSibling as HTMLElement;
                      if (fallback) {
                        fallback.style.display = 'block';
                      }
                    }}
                  />
                  {/* Fallback icons */}
                  <div style={{ display: 'none' }}>
                    {trendAnalysis.overallTrend === 'bullish' ? (
                      <TrendingUp style={{ width: '2rem', height: '2rem', color: '#16a34a' }} />
                    ) : trendAnalysis.overallTrend === 'bearish' ? (
                      <TrendingDown style={{ width: '2rem', height: '2rem', color: '#dc2626' }} />
                    ) : (
                      <Minus style={{ width: '2rem', height: '2rem', color: '#6b7280' }} />
                    )}
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
                      <span 
                        className="text-xs text-gray-700 leading-relaxed font-medium"
                        dangerouslySetInnerHTML={{ __html: colorTrendWords(change) }}
                      />
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
        <p>Advanced trend analysis detecting inflection points, momentum changes, and notable patterns over the last year</p>
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

      {/* Calculation Methods Info Graphic - At Bottom */}
      <div className="mt-12 mb-8">
        <div className="bg-gradient-to-br from-slate-50 via-gray-50 to-blue-50 rounded-2xl border border-gray-200 shadow-lg overflow-hidden">
          {/* Header Section */}
          <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/10 rounded-xl backdrop-blur-sm">
                <Calculator className="w-8 h-8 text-white" />
              </div>
              <div>
                <h4 className="text-2xl font-bold text-white mb-1">Calculation Methodology</h4>
                <p className="text-slate-300 text-sm">Understanding how trend analysis metrics are computed</p>
              </div>
            </div>
          </div>

          {/* Content Grid */}
          <div className="p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
              
              {/* Overall Trend Card */}
              <div className="bg-white rounded-2xl p-6 shadow-md border border-gray-100 hover:shadow-lg transition-all duration-300 group">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 bg-gradient-to-br from-emerald-100 to-emerald-50 rounded-xl group-hover:from-emerald-200 group-hover:to-emerald-100 transition-all">
                    <Target className="w-6 h-6 text-emerald-600" />
                  </div>
                  <h5 className="text-lg font-bold text-gray-800">Overall Trend</h5>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-100">
                    <img
                      src="/icons/bullish.png"
                      alt="Bullish trend"
                      className="w-5 h-5 flex-shrink-0"
                      onError={(e) => {
                        // Fallback to Lucide icon if image fails to load
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const fallback = target.nextElementSibling as HTMLElement;
                        if (fallback) {
                          fallback.style.display = 'block';
                        }
                      }}
                    />
                    <TrendingUp className="w-5 h-5 text-green-600 flex-shrink-0" style={{ display: 'none' }} />
                    <div>
                      <div className="text-sm text-green-600">Annual return &gt; 10%</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-red-50 to-rose-50 rounded-lg border border-red-100">
                    <img
                      src="/icons/bearish.png"
                      alt="Bearish trend"
                      className="w-5 h-5 flex-shrink-0"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const fallback = target.nextElementSibling as HTMLElement;
                        if (fallback) {
                          fallback.style.display = 'block';
                        }
                      }}
                    />
                    <TrendingDown className="w-5 h-5 text-red-600 flex-shrink-0" style={{ display: 'none' }} />
                    <div>
                      <div className="text-sm text-red-600">Annual return &lt; -10%</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-gray-50 to-slate-50 rounded-lg border border-gray-100">
                    <img
                      src="/icons/sideways.png"
                      alt="Sideways trend"
                      className="w-5 h-5 flex-shrink-0"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const fallback = target.nextElementSibling as HTMLElement;
                        if (fallback) {
                          fallback.style.display = 'block';
                        }
                      }}
                    />
                    <Minus className="w-5 h-5 text-gray-600 flex-shrink-0" style={{ display: 'none' }} />
                    <div>
                      <div className="text-sm text-gray-600">Return -10% to +10%</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Momentum Card */}
              <div className="bg-white rounded-2xl p-6 shadow-md border border-gray-100 hover:shadow-lg transition-all duration-300 group">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 bg-gradient-to-br from-amber-100 to-yellow-50 rounded-xl group-hover:from-amber-200 group-hover:to-yellow-100 transition-all">
                    <Zap className="w-6 h-6 text-amber-600" />
                  </div>
                  <h5 className="text-lg font-bold text-gray-800">Momentum</h5>
                </div>
                <div className="space-y-4">
                  <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
                    <div className="font-semibold text-blue-800 mb-2">Method</div>
                    <div className="text-sm text-blue-700">Compare recent 3-month vs previous 3-month period returns</div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                      <span className="text-sm"><strong>Increasing:</strong> Recent 15%+ better</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                      <span className="text-sm"><strong>Decreasing:</strong> Recent 15%+ worse</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
                      <span className="text-sm"><strong>Stable:</strong> &lt; 15% difference</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Volatility Card */}
              <div className="bg-white rounded-2xl p-6 shadow-md border border-gray-100 hover:shadow-lg transition-all duration-300 group">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 bg-gradient-to-br from-purple-100 to-violet-50 rounded-xl group-hover:from-purple-200 group-hover:to-violet-100 transition-all">
                    <Activity className="w-6 h-6 text-purple-600" />
                  </div>
                  <h5 className="text-lg font-bold text-gray-800">Volatility</h5>
                </div>
                <div className="space-y-4">
                  <div className="p-4 bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl border border-purple-100">
                    <div className="font-semibold text-purple-800 mb-2">Method</div>
                    <div className="text-sm text-purple-700">Annualized standard deviation of daily returns</div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-2 bg-red-50 rounded-lg">
                      <div className="w-4 h-4 bg-red-500 rounded-full shadow-sm"></div>
                      <div>
                        <div className="font-semibold text-red-800 text-sm">High Risk</div>
                        <div className="text-xs text-red-600">&gt; 40% annualized</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-2 bg-yellow-50 rounded-lg">
                      <div className="w-4 h-4 bg-yellow-500 rounded-full shadow-sm"></div>
                      <div>
                        <div className="font-semibold text-yellow-800 text-sm">Medium Risk</div>
                        <div className="text-xs text-yellow-600">20% - 40%</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-2 bg-green-50 rounded-lg">
                      <div className="w-4 h-4 bg-green-500 rounded-full shadow-sm"></div>
                      <div>
                        <div className="font-semibold text-green-800 text-sm">Low Risk</div>
                        <div className="text-xs text-green-600">&lt; 20%</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Inflection Points Card */}
              <div className="bg-white rounded-2xl p-6 shadow-md border border-gray-100 hover:shadow-lg transition-all duration-300 group">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 bg-gradient-to-br from-orange-100 to-amber-50 rounded-xl group-hover:from-orange-200 group-hover:to-amber-100 transition-all">
                    <BarChart3 className="w-6 h-6 text-orange-600" />
                  </div>
                  <h5 className="text-lg font-bold text-gray-800">Inflection Points</h5>
                </div>
                <div className="space-y-4">
                  <div className="p-4 bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl border border-orange-100">
                    <div className="font-semibold text-orange-800 mb-2">Method</div>
                    <div className="text-sm text-orange-700">14-day smoothing + slope change detection</div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-3 bg-red-50 rounded-lg border border-red-100">
                      <div className="w-5 h-5 rounded-full border-2 border-red-500 bg-transparent shadow-sm flex-shrink-0"></div>
                      <div>
                        <div className="font-semibold text-red-800 text-sm">Peak</div>
                        <div className="text-xs text-red-600">Uptrend → Downtrend</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                      <div className="w-5 h-5 rounded-full border-2 border-blue-500 bg-transparent shadow-sm flex-shrink-0"></div>
                      <div>
                        <div className="font-semibold text-blue-800 text-sm">Valley</div>
                        <div className="text-xs text-blue-600">Downtrend → Uptrend</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* Footer Note */}
            <div className="mt-8 p-6 bg-gradient-to-r from-slate-50 to-gray-50 rounded-xl border border-gray-100">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-slate-500 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-slate-600 leading-relaxed">
                  <strong className="text-slate-700">Note:</strong> All calculations use 1-year historical data with appropriate smoothing to eliminate noise. 
                  Trend classifications are based on industry-standard thresholds optimized for long-term investment analysis.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrendAnalysis;