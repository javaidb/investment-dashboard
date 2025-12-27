import React, { useState, useMemo } from 'react';
import { useQuery } from 'react-query';
import axios from 'axios';
import { BarChart, Bar, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceDot, Area, AreaChart } from 'recharts';

interface NewsItem {
  id: string;
  symbol: string;
  assetName: string;
  type: 'momentum_signal' | 'warning' | 'achievement';
  title: string;
  message: string;
  timestamp: Date;
  metadata: {
    currentPrice?: number;
    wma200?: number;
    weeklyChanges?: number[];
    percentBelow200WMA?: number;
    dailyChange?: number;
    previousClose?: number;
    averageChange?: number;
    high52Week?: number;
    low52Week?: number;
    percentFromHigh?: number;
    percentFromLow?: number;
    threeMonthChange?: number;
    twoWeekChange?: number;
  };
}

interface NewsResponse {
  items: NewsItem[];
  lastUpdated: string;
}

interface SymbolSummary {
  symbol: string;
  assetName: string;
  currentPrice?: number;
  dailyChange?: number;
  weeklyChanges?: number[];
  signals: string[];
  isPositive: boolean;
  isActive: boolean;
}

const NewsBoard: React.FC = () => {
  const [selectedView, setSelectedView] = useState<'gains-losses' | 'notable-change'>('gains-losses');

  const { data, isLoading, error, refetch } = useQuery<NewsResponse>(
    'newsboard',
    async () => {
      const response = await axios.get('/api/newsboard/events');
      return response.data;
    },
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 30 * 60 * 1000, // 30 minutes
      refetchOnWindowFocus: false,
      refetchOnMount: true,
      refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
    }
  );

  // Fetch portfolio holdings to determine active assets
  const { data: holdingsData } = useQuery(
    'portfolio-holdings',
    async () => {
      try {
        // Get list of portfolios
        const listResponse = await axios.get('/api/portfolio');
        const portfolioList = listResponse.data;

        if (!portfolioList || portfolioList.length === 0) {
          return {};
        }

        // Get the first (most recent) portfolio's full data
        const latestPortfolioId = portfolioList[0].id;
        const portfolioResponse = await axios.get(`/api/portfolio/${latestPortfolioId}/cached`);
        const portfolio = portfolioResponse.data;

        // Convert holdings array to map keyed by symbol
        const holdingsMap: { [key: string]: any } = {};
        if (portfolio.holdings && Array.isArray(portfolio.holdings)) {
          portfolio.holdings.forEach((holding: any) => {
            holdingsMap[holding.symbol] = {
              shares: holding.quantity || 0,
              currentValue: holding.currentValue || 0,
            };
          });
        }

        return holdingsMap;
      } catch (error) {
        console.error('Error fetching holdings:', error);
        return {};
      }
    },
    {
      staleTime: 5 * 60 * 1000,
      cacheTime: 30 * 60 * 1000,
    }
  );

  // Group news items by symbol and summarize
  const symbolSummaries = useMemo(() => {
    if (!data?.items) return [];

    console.log('🔍 Holdings Data:', holdingsData);

    const grouped = new Map<string, SymbolSummary>();

    data.items.forEach((item: NewsItem) => {
      if (!grouped.has(item.symbol)) {
        // Determine if this symbol is positive or negative overall
        const isPositive = item.metadata.dailyChange !== undefined
          ? item.metadata.dailyChange >= 0
          : item.type === 'achievement' || item.type === 'momentum_signal';

        // Check if asset is active (has shares > 0 in holdings)
        const holding = holdingsData?.[item.symbol];
        const isActive = holding && holding.shares > 0;

        console.log(`📊 ${item.symbol}: holding=`, holding, 'isActive=', isActive);

        grouped.set(item.symbol, {
          symbol: item.symbol,
          assetName: item.assetName,
          currentPrice: item.metadata.currentPrice,
          dailyChange: item.metadata.dailyChange,
          weeklyChanges: item.metadata.weeklyChanges,
          signals: [item.title],
          isPositive,
          isActive: isActive || false,
        });
      } else {
        const existing = grouped.get(item.symbol)!;
        existing.signals.push(item.title);
      }
    });

    return Array.from(grouped.values());
  }, [data?.items, holdingsData]);

  // Fetch 1-year historical data for inflection point analysis
  const { data: inflectionData, isLoading: inflectionLoading } = useQuery(
    'inflection-analysis',
    async () => {
      try {
        const symbols = symbolSummaries.map(s => s.symbol);
        const analyses: { [key: string]: any } = {};

        for (const symbol of symbols) {
          try {
            const response = await axios.get(`/api/portfolio/cache/historical/${symbol}?period=max`);
            const historicalData = response.data?.data;

            if (historicalData && historicalData.length > 0) {
              // Analyze for inflection point (using all available data, typically 1y+)
              const analysis = analyzeInflectionPoint(historicalData, symbol);
              if (analysis) {
                analyses[symbol] = analysis;
              }
            }
          } catch (err) {
            console.warn(`Failed to fetch historical data for ${symbol}`);
          }
        }

        console.log('📊 Inflection analyses:', analyses);
        return analyses;
      } catch (error) {
        console.error('Error fetching inflection data:', error);
        return {};
      }
    },
    {
      enabled: selectedView === 'notable-change' && symbolSummaries.length > 0,
      staleTime: 10 * 60 * 1000,
    }
  );

  // Analyze historical data for inflection points (bottoms turning upward)
  const analyzeInflectionPoint = (data: any[], symbol: string) => {
    if (!data || data.length < 60) {
      console.log(`❌ ${symbol}: Not enough data (${data?.length} days)`);
      return null;
    }

    const sorted = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const prices = sorted.map(d => d.close);

    // Find the lowest point in the last 180 days (increased from 90)
    const lookbackDays = Math.min(180, prices.length);
    const recentPrices = prices.slice(-lookbackDays);
    const minPrice = Math.min(...recentPrices);
    const minIndex = prices.length - lookbackDays + recentPrices.indexOf(minPrice);

    // Check if the low was at least 15 days ago (relaxed from 20)
    const daysSinceLow = prices.length - minIndex - 1;

    console.log(`📊 ${symbol}: Low was ${daysSinceLow} days ago, min price: $${minPrice}`);

    if (daysSinceLow < 15 || daysSinceLow > 120) {
      console.log(`❌ ${symbol}: Days since low (${daysSinceLow}) outside range 15-120`);
      return null;
    }

    // Calculate price movement since the low
    const currentPrice = prices[prices.length - 1];
    const recoveryPercent = ((currentPrice - minPrice) / minPrice) * 100;

    console.log(`📊 ${symbol}: Recovery ${recoveryPercent.toFixed(1)}%`);

    // Must have recovered at least 3% from the low (relaxed from 5%)
    if (recoveryPercent < 3) {
      console.log(`❌ ${symbol}: Recovery ${recoveryPercent.toFixed(1)}% below 3% threshold`);
      return null;
    }

    // Check if trend is upward (last 2 weeks)
    const last14Days = prices.slice(-14);
    if (last14Days.length < 14) {
      console.log(`❌ ${symbol}: Not enough recent data for trend analysis`);
      return null;
    }

    const firstWeekAvg = last14Days.slice(0, 7).reduce((a, b) => a + b, 0) / 7;
    const secondWeekAvg = last14Days.slice(7, 14).reduce((a, b) => a + b, 0) / 7;
    const trendUp = secondWeekAvg > firstWeekAvg;

    console.log(`📊 ${symbol}: Trend ${trendUp ? 'UP ✓' : 'DOWN ✗'} (${((secondWeekAvg - firstWeekAvg) / firstWeekAvg * 100).toFixed(1)}%)`);

    if (!trendUp) {
      console.log(`❌ ${symbol}: Recent trend is downward`);
      return null;
    }

    // Calculate how far from 1-year high
    const yearHigh = Math.max(...prices);
    const percentFromHigh = ((currentPrice - yearHigh) / yearHigh) * 100;

    console.log(`✅ ${symbol}: INFLECTION POINT DETECTED!`);

    // Get last year of data for chart
    const yearAgo = Math.max(0, prices.length - 365);
    const yearData = sorted.slice(yearAgo).map((d, idx) => ({
      date: d.date,
      price: d.close,
      index: idx,
      isBottom: yearAgo + idx === minIndex,
    }));

    return {
      symbol,
      minPrice,
      currentPrice,
      daysSinceLow,
      recoveryPercent,
      percentFromHigh,
      lowDate: sorted[minIndex].date,
      trendStrength: ((secondWeekAvg - firstWeekAvg) / firstWeekAvg) * 100,
      chartData: yearData,
      minIndex: minIndex - yearAgo, // Index relative to chart data
    };
  };

  // Create sparkline data
  const createSparklineData = (weeklyChanges?: number[]) => {
    if (!weeklyChanges || weeklyChanges.length === 0) return null;
    return weeklyChanges.map((value, index) => ({ index, value }));
  };

  // Render card component
  const renderCard = (summary: SymbolSummary, index: number, isGain: boolean) => (
    <div
      key={summary.symbol}
      className={`bg-gradient-to-br from-slate-800/90 via-${isGain ? 'green' : 'red'}-900/20 to-slate-900/90 backdrop-blur-xl rounded-2xl border-2 ${
        summary.isActive
          ? `border-${isGain ? 'green' : 'red'}-500/80 hover:border-${isGain ? 'green' : 'red'}-400/90 shadow-2xl shadow-${isGain ? 'green' : 'red'}-500/20 hover:shadow-${isGain ? 'green' : 'red'}-500/40`
          : `border-slate-600/40 hover:border-slate-500/60 shadow-lg opacity-50 grayscale-[0.3]`
      } transition-all duration-300 transform hover:scale-105 hover:-translate-y-1 animate-fadeIn overflow-hidden group`}
      style={{ animationDelay: `${index * 30}ms` }}
    >
      {/* Card Header with Gradient Accent */}
      <div className={`bg-gradient-to-r from-${isGain ? 'green' : 'red'}-600/30 to-${isGain ? 'emerald' : 'rose'}-600/30 border-b border-${isGain ? 'green' : 'red'}-500/40 p-4 ${!summary.isActive ? 'relative' : ''}`}>
        {!summary.isActive && (
          <div className="absolute top-3 right-3 bg-slate-700/90 border border-slate-500/50 px-3 py-1 rounded-full text-xs font-bold text-slate-300 uppercase tracking-wider shadow-lg">
            Watchlist
          </div>
        )}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={`bg-${isGain ? 'green' : 'red'}-500/30 p-2 rounded-lg border border-${isGain ? 'green' : 'red'}-500/50`}>
              <span className="text-2xl">{isGain ? '📈' : '📉'}</span>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-2xl font-black text-white truncate tracking-tight">{summary.symbol}</h3>
              <p className="text-xs text-slate-300/80 truncate font-medium">{summary.assetName}</p>
            </div>
          </div>
        </div>

        {/* Daily Change Highlight */}
        {summary.dailyChange !== undefined && (
          <div className={`bg-${isGain ? 'green' : 'red'}-500/40 border border-${isGain ? 'green' : 'red'}-400/60 rounded-xl px-4 py-3 backdrop-blur-sm`}>
            <div className="flex items-baseline justify-between">
              <span className={`text-xs text-${isGain ? 'green' : 'red'}-100/80 font-semibold`}>Today's Change</span>
              <span className={`text-3xl font-black text-${isGain ? 'green' : 'red'}-50`}>
                {isGain && '+'}{summary.dailyChange.toFixed(2)}%
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Card Body */}
      <div className="p-4 space-y-4">
        {/* Current Price */}
        {summary.currentPrice && (
          <div className={`flex items-baseline justify-between bg-slate-800/50 rounded-xl px-4 py-3 border border-${isGain ? 'green' : 'red'}-500/20`}>
            <span className="text-sm text-slate-300 font-semibold">Current Price</span>
            <span className="text-xl font-black text-white">${summary.currentPrice.toFixed(2)}</span>
          </div>
        )}

        {/* Weekly Performance Chart */}
        {summary.weeklyChanges && summary.weeklyChanges.length > 0 && (
          <div className={`bg-slate-800/50 rounded-xl p-3 border border-${isGain ? 'green' : 'red'}-500/20`}>
            <div className="text-xs text-slate-400 font-semibold mb-2">Weekly Trend</div>
            <ResponsiveContainer width="100%" height={50}>
              <BarChart data={createSparklineData(summary.weeklyChanges) || []}>
                <Bar dataKey="value" fill={isGain ? '#10b981' : '#ef4444'} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Signals */}
        <div className={`bg-${isGain ? 'green' : 'red'}-900/20 border border-${isGain ? 'green' : 'red'}-500/30 rounded-xl p-3`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs text-${isGain ? 'green' : 'red'}-300/90 font-bold uppercase tracking-wide`}>
              {summary.signals.length} Signal{summary.signals.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-1.5">
            {summary.signals.slice(0, 2).map((signal, idx) => (
              <div key={idx} className="text-sm text-slate-200 leading-snug">{signal}</div>
            ))}
            {summary.signals.length > 2 && (
              <div className="text-xs text-slate-400 italic pt-1">+{summary.signals.length - 2} more signals</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 md:p-6">
      {/* Header */}
      <div className="max-w-[1800px] mx-auto mb-8">
        <div className="relative bg-gradient-to-br from-slate-800/90 via-slate-800/70 to-slate-800/90 backdrop-blur-xl rounded-3xl p-6 md:p-8 border border-slate-600/40 shadow-2xl overflow-hidden">
          {/* Animated background gradient */}
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 via-purple-600/10 to-green-600/10 animate-pulse-glow"></div>

          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h1 className="text-4xl md:text-5xl font-black text-white mb-3 flex items-center gap-3 tracking-tight">
                <span className="text-5xl">📡</span>
                <span className="bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">NewsBoard</span>
              </h1>
              <p className="text-slate-300 text-base md:text-lg font-medium">
                Real-time insights and alerts for your portfolio assets
              </p>
              {data?.lastUpdated && (
                <div className="flex items-center gap-2 mt-3">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                  <p className="text-slate-400 text-sm">
                    Updated {new Date(data.lastUpdated).toLocaleTimeString()}
                  </p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              {/* View Toggle */}
              <div className="flex bg-slate-700/50 rounded-xl p-1 border border-slate-600/50">
                <button
                  onClick={() => setSelectedView('gains-losses')}
                  className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${
                    selectedView === 'gains-losses'
                      ? 'bg-gradient-to-r from-green-600 to-red-600 text-white shadow-lg'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  📊 Gains/Losses
                </button>
                <button
                  onClick={() => setSelectedView('notable-change')}
                  className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${
                    selectedView === 'notable-change'
                      ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  🔍 Notable Change
                </button>
              </div>

              <button
                onClick={() => refetch()}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-2xl transform hover:scale-105 font-bold text-sm flex items-center gap-2"
              >
                <span>🔄</span>
                <span>Refresh</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content Sections */}
      <div className="max-w-[1800px] mx-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-slate-400 text-lg">Loading portfolio signals...</p>
            </div>
          </div>
        ) : error ? (
          <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-8 text-center">
            <p className="text-red-400 text-lg">❌ Failed to load signals</p>
            <p className="text-red-300/70 mt-2">{(error as Error).message}</p>
          </div>
        ) : symbolSummaries.length === 0 ? (
          <div className="bg-slate-800/30 border border-slate-600/30 rounded-xl p-12 text-center backdrop-blur-sm">
            <p className="text-slate-400 text-xl mb-2">📭 No signals to display</p>
            <p className="text-slate-500">Your portfolio is quiet right now. Check back later!</p>
          </div>
        ) : selectedView === 'notable-change' ? (
          // Notable Change View
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 backdrop-blur-sm rounded-2xl border border-blue-500/30 p-5 shadow-xl">
              <div className="flex items-center gap-3">
                <div className="bg-blue-500/20 p-2.5 rounded-xl border border-blue-500/40">
                  <span className="text-2xl">🔍</span>
                </div>
                <div>
                  <h2 className="text-xl font-black text-white">Inflection Points Detected</h2>
                  <p className="text-blue-300/70 text-xs">Assets showing bottom reversal patterns</p>
                </div>
              </div>
            </div>

            {inflectionLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-4"></div>
                  <p className="text-slate-400 text-lg">Analyzing historical data for inflection points...</p>
                </div>
              </div>
            ) : !inflectionData || Object.keys(inflectionData).length === 0 ? (
              <div className="bg-slate-800/30 border border-slate-600/30 rounded-xl p-12 text-center backdrop-blur-sm">
                <p className="text-slate-400 text-xl mb-2">🔍 No inflection points detected</p>
                <p className="text-slate-500">No assets are currently showing clear bottom reversal patterns</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {Object.values(inflectionData).map((analysis: any, index: number) => {
                  const summary = symbolSummaries.find(s => s.symbol === analysis.symbol);
                  if (!summary) return null;

                  return (
                    <div
                      key={analysis.symbol}
                      className="bg-gradient-to-br from-slate-800/90 via-blue-900/20 to-slate-900/90 backdrop-blur-xl rounded-2xl border-2 border-blue-500/60 hover:border-blue-400/80 shadow-2xl hover:shadow-blue-500/30 transition-all duration-300 transform hover:scale-105 hover:-translate-y-1 animate-fadeIn overflow-hidden"
                      style={{ animationDelay: `${index * 30}ms` }}
                    >
                      {/* Card Header */}
                      <div className="bg-gradient-to-r from-blue-600/30 to-purple-600/30 border-b border-blue-500/40 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className="bg-blue-500/30 p-2 rounded-lg border border-blue-500/50">
                              <span className="text-2xl">📍</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="text-2xl font-black text-white truncate tracking-tight">{analysis.symbol}</h3>
                              <p className="text-xs text-slate-300/80 truncate font-medium">{summary.assetName}</p>
                            </div>
                          </div>
                        </div>

                        {/* Recovery Highlight */}
                        <div className="bg-blue-500/40 border border-blue-400/60 rounded-xl px-4 py-3 backdrop-blur-sm">
                          <div className="flex items-baseline justify-between">
                            <span className="text-xs text-blue-100/80 font-semibold">Recovery from Low</span>
                            <span className="text-3xl font-black text-blue-50">
                              +{analysis.recoveryPercent.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Card Body */}
                      <div className="p-4 space-y-4">
                        {/* 1-Year Chart with Inflection Point */}
                        {analysis.chartData && analysis.chartData.length > 0 && (
                          <div className="bg-slate-800/50 rounded-xl p-3 border border-blue-500/20">
                            <div className="text-xs text-slate-400 font-semibold mb-2">1-Year Price Chart</div>
                            <ResponsiveContainer width="100%" height={120}>
                              <AreaChart data={analysis.chartData}>
                                <defs>
                                  <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                  </linearGradient>
                                </defs>
                                <XAxis
                                  dataKey="index"
                                  hide
                                />
                                <YAxis
                                  domain={['auto', 'auto']}
                                  hide
                                />
                                <Tooltip
                                  content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                      const data = payload[0].payload;
                                      return (
                                        <div className="bg-slate-900/95 border border-blue-500/50 rounded-lg px-3 py-2 shadow-xl">
                                          <p className="text-xs text-slate-400">
                                            {new Date(data.date).toLocaleDateString()}
                                          </p>
                                          <p className="text-sm font-bold text-white">
                                            ${data.price.toFixed(2)}
                                          </p>
                                          {data.isBottom && (
                                            <p className="text-xs text-blue-400 font-bold mt-1">
                                              📍 Bottom
                                            </p>
                                          )}
                                        </div>
                                      );
                                    }
                                    return null;
                                  }}
                                />
                                <Area
                                  type="monotone"
                                  dataKey="price"
                                  stroke="#3b82f6"
                                  strokeWidth={2}
                                  fill="url(#priceGradient)"
                                />
                                {/* Mark the inflection point (bottom) */}
                                {analysis.minIndex >= 0 && analysis.chartData[analysis.minIndex] && (
                                  <ReferenceDot
                                    x={analysis.minIndex}
                                    y={analysis.minPrice}
                                    r={6}
                                    fill="#ef4444"
                                    stroke="#fff"
                                    strokeWidth={2}
                                  />
                                )}
                              </AreaChart>
                            </ResponsiveContainer>
                            <div className="flex items-center justify-center mt-2 gap-4 text-xs">
                              <div className="flex items-center gap-1">
                                <div className="w-3 h-3 rounded-full bg-red-500 border-2 border-white"></div>
                                <span className="text-slate-400">Bottom: {new Date(analysis.lowDate).toLocaleDateString()}</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Bottom Info */}
                        <div className="bg-slate-800/50 rounded-xl px-4 py-3 border border-blue-500/20 space-y-2">
                          <div className="flex items-baseline justify-between text-xs">
                            <span className="text-slate-400">Bottom Price</span>
                            <span className="text-white font-bold">${analysis.minPrice.toFixed(2)}</span>
                          </div>
                          <div className="flex items-baseline justify-between text-xs">
                            <span className="text-slate-400">Days Since Low</span>
                            <span className="text-white font-bold">{analysis.daysSinceLow} days</span>
                          </div>
                          <div className="flex items-baseline justify-between text-xs">
                            <span className="text-slate-400">Current Price</span>
                            <span className="text-white font-bold">${analysis.currentPrice.toFixed(2)}</span>
                          </div>
                        </div>

                        {/* Trend Strength */}
                        <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-3">
                          <div className="text-xs text-blue-300/90 font-bold uppercase tracking-wide mb-2">
                            Trend Analysis
                          </div>
                          <div className="space-y-1.5 text-sm text-slate-200">
                            <div>✓ Bottom identified {new Date(analysis.lowDate).toLocaleDateString()}</div>
                            <div>✓ Upward trend confirmed ({analysis.trendStrength.toFixed(1)}%)</div>
                            <div>✓ {Math.abs(analysis.percentFromHigh).toFixed(0)}% below year high</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          // Gains/Losses View
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* GAINS Section */}
            <div className="space-y-4">
              {/* GAINS Header */}
              <div className="bg-gradient-to-r from-green-600/20 to-emerald-600/20 backdrop-blur-sm rounded-2xl border border-green-500/30 p-5 shadow-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-green-500/20 p-2.5 rounded-xl border border-green-500/40">
                      <span className="text-2xl">📈</span>
                    </div>
                    <div>
                      <h2 className="text-xl font-black text-white">Gains</h2>
                      <p className="text-green-300/70 text-xs">Positive movement</p>
                    </div>
                  </div>
                  <div className="bg-green-500/20 border border-green-500/40 px-3 py-1.5 rounded-xl">
                    <span className="text-green-300 font-black text-base">
                      {symbolSummaries.filter(s => s.isPositive).length}
                    </span>
                  </div>
                </div>
              </div>

              {/* Active Gains */}
              {symbolSummaries.filter(s => s.isPositive && s.isActive).length > 0 && (
                <>
                  <div className="flex items-center gap-2 bg-green-500/20 border border-green-500/40 rounded-xl px-4 py-3">
                    <span className="text-lg">✅</span>
                    <span className="text-sm font-black text-green-200 uppercase tracking-wide">
                      Active Holdings ({symbolSummaries.filter(s => s.isPositive && s.isActive).length})
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                    {symbolSummaries.filter(s => s.isPositive && s.isActive).map((summary, index) =>
                      renderCard(summary, index, true)
                    )}
                  </div>
                </>
              )}

              {/* Inactive Gains (Watchlist) */}
              {symbolSummaries.filter(s => s.isPositive && !s.isActive).length > 0 && (
                <>
                  <div className="flex items-center gap-2 bg-slate-700/40 border border-slate-600/50 rounded-xl px-4 py-3 mt-6">
                    <span className="text-lg">👁️</span>
                    <span className="text-sm font-black text-slate-300 uppercase tracking-wide">
                      Watchlist ({symbolSummaries.filter(s => s.isPositive && !s.isActive).length})
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                    {symbolSummaries.filter(s => s.isPositive && !s.isActive).map((summary, index) =>
                      renderCard(summary, index, true)
                    )}
                  </div>
                </>
              )}
            </div>

            {/* LOSSES Section */}
            <div className="space-y-4">
              {/* LOSSES Header */}
              <div className="bg-gradient-to-r from-red-600/20 to-rose-600/20 backdrop-blur-sm rounded-2xl border border-red-500/30 p-5 shadow-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-red-500/20 p-2.5 rounded-xl border border-red-500/40">
                      <span className="text-2xl">📉</span>
                    </div>
                    <div>
                      <h2 className="text-xl font-black text-white">Losses</h2>
                      <p className="text-red-300/70 text-xs">Negative movement</p>
                    </div>
                  </div>
                  <div className="bg-red-500/20 border border-red-500/40 px-3 py-1.5 rounded-xl">
                    <span className="text-red-300 font-black text-base">
                      {symbolSummaries.filter(s => !s.isPositive).length}
                    </span>
                  </div>
                </div>
              </div>

              {/* Active Losses */}
              {symbolSummaries.filter(s => !s.isPositive && s.isActive).length > 0 && (
                <>
                  <div className="flex items-center gap-2 bg-red-500/20 border border-red-500/40 rounded-xl px-4 py-3">
                    <span className="text-lg">✅</span>
                    <span className="text-sm font-black text-red-200 uppercase tracking-wide">
                      Active Holdings ({symbolSummaries.filter(s => !s.isPositive && s.isActive).length})
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                    {symbolSummaries.filter(s => !s.isPositive && s.isActive).map((summary, index) =>
                      renderCard(summary, index, false)
                    )}
                  </div>
                </>
              )}

              {/* Inactive Losses (Watchlist) */}
              {symbolSummaries.filter(s => !s.isPositive && !s.isActive).length > 0 && (
                <>
                  <div className="flex items-center gap-2 bg-slate-700/40 border border-slate-600/50 rounded-xl px-4 py-3 mt-6">
                    <span className="text-lg">👁️</span>
                    <span className="text-sm font-black text-slate-300 uppercase tracking-wide">
                      Watchlist ({symbolSummaries.filter(s => !s.isPositive && !s.isActive).length})
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                    {symbolSummaries.filter(s => !s.isPositive && !s.isActive).map((summary, index) =>
                      renderCard(summary, index, false)
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NewsBoard;
