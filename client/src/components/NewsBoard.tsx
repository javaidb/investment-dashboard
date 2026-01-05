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

  // Group news items by symbol and summarize (excluding recovery signals for gains/losses view)
  const symbolSummaries = useMemo(() => {
    if (!data?.items) return [];

    console.log('🔍 Holdings Data:', holdingsData);

    const grouped = new Map<string, SymbolSummary>();

    data.items.forEach((item: NewsItem) => {
      // Skip recovery signals - they'll be shown in Notable Change section
      if (item.title === 'Potential Recovery Signal') {
        return;
      }

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

  // Extract recovery signals from news items
  const recoverySignals = useMemo(() => {
    if (!data?.items) return [];

    return data.items
      .filter(item => item.title === 'Potential Recovery Signal')
      .map(item => {
        const holding = holdingsData?.[item.symbol];
        const isActive = holding && holding.shares > 0;

        return {
          symbol: item.symbol,
          assetName: item.assetName,
          currentPrice: item.metadata.currentPrice,
          threeMonthChange: item.metadata.threeMonthChange,
          twoWeekChange: item.metadata.twoWeekChange,
          isActive: isActive || false,
        };
      });
  }, [data?.items, holdingsData]);

  // Fetch historical data for recovery signals
  const { data: recoveryChartsData, isLoading: recoveryChartsLoading } = useQuery(
    'recovery-charts',
    async () => {
      try {
        const charts: { [key: string]: any } = {};

        for (const signal of recoverySignals) {
          try {
            const response = await axios.get(`/api/portfolio/cache/historical/${signal.symbol}?period=6m`);
            const historicalData = response.data?.data;

            if (historicalData && historicalData.length > 0) {
              const sorted = [...historicalData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
              const prices = sorted.map(d => d.close);

              // Find the 3-month low point
              const threeMonthAgo = Math.max(0, sorted.length - 90);
              const threeMonthPrices = prices.slice(threeMonthAgo);
              const minPrice = Math.min(...threeMonthPrices);
              const minIndex = threeMonthAgo + threeMonthPrices.indexOf(minPrice);

              // Create chart data
              const chartData = sorted.map((d, idx) => ({
                date: d.date,
                price: d.close,
                index: idx,
                isLow: idx === minIndex,
              }));

              charts[signal.symbol] = {
                chartData,
                minPrice,
                minIndex,
                lowDate: sorted[minIndex].date,
              };
            }
          } catch (err) {
            console.warn(`Failed to fetch historical data for ${signal.symbol}`);
          }
        }

        return charts;
      } catch (error) {
        console.error('Error fetching recovery charts:', error);
        return {};
      }
    },
    {
      enabled: selectedView === 'notable-change' && recoverySignals.length > 0,
      staleTime: 10 * 60 * 1000,
    }
  );

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

  // Group symbols by trend patterns
  const groupedSymbols = useMemo(() => {
    const gains = symbolSummaries.filter(s => s.isPositive);
    const losses = symbolSummaries.filter(s => !s.isPositive);

    // Check if a symbol has a trend (3+ weekly changes available)
    const hasTrend = (summary: SymbolSummary) =>
      summary.weeklyChanges && summary.weeklyChanges.length >= 3;

    const isUpwardTrend = (summary: SymbolSummary) => {
      if (!summary.weeklyChanges || summary.weeklyChanges.length < 3) return false;
      const avgChange = summary.weeklyChanges.reduce((sum, val) => sum + val, 0) / summary.weeklyChanges.length;
      return avgChange > 0;
    };

    const isDownwardTrend = (summary: SymbolSummary) => {
      if (!summary.weeklyChanges || summary.weeklyChanges.length < 3) return false;
      const avgChange = summary.weeklyChanges.reduce((sum, val) => sum + val, 0) / summary.weeklyChanges.length;
      return avgChange < 0;
    };

    // Helper to check signal types
    const has200WMASignal = (s: SymbolSummary) =>
      s.signals.some(sig => sig.includes('Below 200 WMA with Positive Weekly Gain'));
    const hasStrongDailyGain = (s: SymbolSummary) =>
      s.signals.some(sig => sig.includes('Strong Daily Gain'));

    // Sort gains by priority:
    // 1. Both 200 WMA + Strong Daily Gain
    // 2. 200 WMA only
    // 3. Strong Daily Gain only
    // 4. Others
    const sortGains = (a: SymbolSummary, b: SymbolSummary) => {
      const aHas200WMA = has200WMASignal(a);
      const aHasStrong = hasStrongDailyGain(a);
      const bHas200WMA = has200WMASignal(b);
      const bHasStrong = hasStrongDailyGain(b);

      // Both signals
      const aBoth = aHas200WMA && aHasStrong;
      const bBoth = bHas200WMA && bHasStrong;
      if (aBoth && !bBoth) return -1;
      if (!aBoth && bBoth) return 1;

      // 200 WMA only
      if (aHas200WMA && !bHas200WMA) return -1;
      if (!aHas200WMA && bHas200WMA) return 1;

      // Strong Daily Gain only
      if (aHasStrong && !bHasStrong) return -1;
      if (!aHasStrong && bHasStrong) return 1;

      return 0;
    };

    const gainsWithTrendList = gains.filter(s => hasTrend(s) && isUpwardTrend(s)).sort(sortGains);
    const gainsWithoutTrendList = gains.filter(s => !hasTrend(s) || !isUpwardTrend(s)).sort(sortGains);

    return {
      gainsWithTrend: gainsWithTrendList,
      gainsWithoutTrend: gainsWithoutTrendList,
      lossesWithTrend: losses.filter(s => hasTrend(s) && isDownwardTrend(s)),
      lossesWithoutTrend: losses.filter(s => !hasTrend(s) || !isDownwardTrend(s)),
    };
  }, [symbolSummaries]);

  // Create sparkline data
  const createSparklineData = (weeklyChanges?: number[]) => {
    if (!weeklyChanges || weeklyChanges.length === 0) return null;
    return weeklyChanges.map((value, index) => ({ index, value }));
  };

  // Calculate trend summary
  const getTrendSummary = (weeklyChanges: number[]) => {
    const avgChange = weeklyChanges.reduce((sum, val) => sum + val, 0) / weeklyChanges.length;
    const totalChange = weeklyChanges.reduce((sum, val) => sum + val, 0);
    return { avgChange, totalChange };
  };

  // Render row component for trend panels
  const renderTrendRow = (summary: SymbolSummary, isGain: boolean) => {
    const trendSummary = summary.weeklyChanges ? getTrendSummary(summary.weeklyChanges) : null;
    const hasBelow200WMASignal = summary.signals.includes('Below 200 WMA with Positive Weekly Gain');

    // Debug logging
    if (summary.symbol === 'LULU') {
      console.log('LULU signals:', summary.signals);
      console.log('Has 200 WMA signal:', hasBelow200WMASignal);
    }

    return (
      <div
        key={summary.symbol}
        className={`flex items-center p-2.5 rounded-lg ${
          hasBelow200WMASignal
            ? 'bg-gradient-to-r from-amber-900/30 via-slate-800/30 to-slate-800/30 border-2 border-amber-500/60 hover:border-amber-400/80 shadow-lg shadow-amber-500/20'
            : 'bg-slate-800/30 border'
        } ${
          summary.isActive && !hasBelow200WMASignal
            ? `border-${isGain ? 'green' : 'red'}-500/30 hover:border-${isGain ? 'green' : 'red'}-500/50`
            : !hasBelow200WMASignal ? 'border-slate-600/20 hover:border-slate-500/40 opacity-60' : ''
        } transition-all hover:bg-slate-800/50`}
      >
        {/* Symbol and Name */}
        <div className="flex-shrink-0 w-28">
          <div className="flex items-center gap-1">
            <div className="font-bold text-white text-xs">{summary.symbol}</div>
            {hasBelow200WMASignal && (
              <span className="text-[10px] bg-amber-500/30 border border-amber-400/50 px-1 py-0.5 rounded text-amber-200 font-bold">
                200W
              </span>
            )}
          </div>
          <div className="text-[10px] text-slate-400 truncate">{summary.assetName}</div>
        </div>

        {/* Current Price */}
        {summary.currentPrice && (
          <div className="flex-shrink-0 w-16 text-right ml-4">
            <div className="text-[10px] text-slate-400">Price</div>
            <div className="text-xs font-bold text-white">${summary.currentPrice.toFixed(2)}</div>
          </div>
        )}

        {/* Daily Change */}
        {summary.dailyChange !== undefined && (
          <div className="flex-shrink-0 w-14 text-right ml-4">
            <div className="text-[10px] text-slate-400">Today</div>
            <div className={`text-xs font-bold ${isGain ? 'text-green-400' : 'text-red-400'}`}>
              {isGain && '+'}{summary.dailyChange.toFixed(1)}%
            </div>
          </div>
        )}

        {/* Weekly Trend Chart */}
        {summary.weeklyChanges && summary.weeklyChanges.length > 0 && (
          <div className="flex-1 min-w-0 max-w-[140px] ml-8">
            <ResponsiveContainer width="100%" height={28}>
              <BarChart data={createSparklineData(summary.weeklyChanges) || []} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <Bar
                  dataKey="value"
                  fill={isGain ? '#10b981' : '#ef4444'}
                  radius={[1, 1, 0, 0]}
                  opacity={0.8}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Trend Summary */}
        {trendSummary && (
          <div className="flex-shrink-0 w-24 text-right ml-4">
            <div className="text-[10px] text-slate-400">Avg/Week</div>
            <div className={`text-xs font-bold ${isGain ? 'text-green-400' : 'text-red-400'}`}>
              {isGain && '+'}{trendSummary.avgChange.toFixed(1)}%
            </div>
          </div>
        )}

        {/* Signals - to the right */}
        {summary.signals.length > 0 && (
          <div className="flex-1 flex items-center gap-1.5 ml-6 flex-wrap">
            {summary.signals.map((signal, idx) => (
              <span
                key={idx}
                className={`text-[10px] px-2 py-0.5 rounded whitespace-nowrap ${
                  signal.includes('200 WMA')
                    ? 'bg-amber-500/20 border border-amber-400/40 text-amber-200'
                    : isGain
                    ? 'bg-green-500/20 border border-green-400/40 text-green-200'
                    : 'bg-red-500/20 border border-red-400/40 text-red-200'
                }`}
              >
                {signal}
              </span>
            ))}
          </div>
        )}

        {/* Active/Watchlist Badge */}
        {!summary.isActive && (
          <div className="flex-shrink-0 ml-4">
            <span className="text-[10px] bg-slate-700/50 border border-slate-600/50 px-1.5 py-0.5 rounded text-slate-400">
              Watch
            </span>
          </div>
        )}
      </div>
    );
  };

  // Render card component for non-trend items
  const renderCard = (summary: SymbolSummary, index: number, isGain: boolean) => {
    const hasBelow200WMASignal = summary.signals.includes('Below 200 WMA with Positive Weekly Gain');

    // Debug logging
    if (summary.symbol === 'LULU') {
      console.log('LULU card signals:', summary.signals);
      console.log('LULU has 200 WMA signal:', hasBelow200WMASignal);
    }

    return (
      <div
        key={summary.symbol}
        className={`bg-gradient-to-br ${
          hasBelow200WMASignal
            ? 'from-amber-900/40 via-slate-800/90 to-slate-900/90 border-2 border-amber-500/80 hover:border-amber-400/90 shadow-2xl shadow-amber-500/30'
            : `from-slate-800/90 via-${isGain ? 'green' : 'red'}-900/20 to-slate-900/90 border-2 ${
                summary.isActive
                  ? `border-${isGain ? 'green' : 'red'}-500/80 hover:border-${isGain ? 'green' : 'red'}-400/90 shadow-2xl shadow-${isGain ? 'green' : 'red'}-500/20 hover:shadow-${isGain ? 'green' : 'red'}-500/40`
                  : `border-slate-600/40 hover:border-slate-500/60 shadow-lg opacity-50 grayscale-[0.3]`
              }`
        } backdrop-blur-xl rounded-2xl transition-all duration-300 transform hover:scale-105 hover:-translate-y-1 animate-fadeIn overflow-hidden group`}
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
              <div className="flex items-center gap-2">
                <h3 className="text-2xl font-black text-white truncate tracking-tight">{summary.symbol}</h3>
                {hasBelow200WMASignal && (
                  <span className="text-xs bg-amber-500/30 border border-amber-400/50 px-2 py-0.5 rounded text-amber-200 font-bold">
                    200W
                  </span>
                )}
              </div>
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
};

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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recovery Signals Section */}
            {recoverySignals.length > 0 && (
              <div className="space-y-4">
                <div className="bg-gradient-to-r from-green-600/20 to-emerald-600/20 backdrop-blur-sm rounded-2xl border border-green-500/30 p-5 shadow-xl">
                  <div className="flex items-center gap-3">
                    <div className="bg-green-500/20 p-2.5 rounded-xl border border-green-500/40">
                      <span className="text-2xl">🌱</span>
                    </div>
                    <div>
                      <h2 className="text-xl font-black text-white">Recovery Signals</h2>
                      <p className="text-green-300/70 text-xs">Assets showing early signs of recovery</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                  {recoverySignals.map((signal, index) => (
                    <div
                      key={signal.symbol}
                      className={`bg-gradient-to-br from-slate-800/90 via-green-900/20 to-slate-900/90 backdrop-blur-xl rounded-2xl border-2 ${
                        signal.isActive
                          ? 'border-green-500/80 hover:border-green-400/90 shadow-2xl shadow-green-500/20 hover:shadow-green-500/40'
                          : 'border-slate-600/40 hover:border-slate-500/60 shadow-lg opacity-50 grayscale-[0.3]'
                      } transition-all duration-300 transform hover:scale-105 hover:-translate-y-1 animate-fadeIn overflow-hidden`}
                      style={{ animationDelay: `${index * 30}ms` }}
                    >
                      {/* Card Header */}
                      <div className={`bg-gradient-to-r from-green-600/30 to-emerald-600/30 border-b border-green-500/40 p-4 ${!signal.isActive ? 'relative' : ''}`}>
                        {!signal.isActive && (
                          <div className="absolute top-3 right-3 bg-slate-700/90 border border-slate-500/50 px-3 py-1 rounded-full text-xs font-bold text-slate-300 uppercase tracking-wider shadow-lg">
                            Watchlist
                          </div>
                        )}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className="bg-green-500/30 p-2 rounded-lg border border-green-500/50">
                              <span className="text-2xl">🌱</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="text-2xl font-black text-white truncate tracking-tight">{signal.symbol}</h3>
                              <p className="text-xs text-slate-300/80 truncate font-medium">{signal.assetName}</p>
                            </div>
                          </div>
                        </div>

                        {/* Recovery Highlight */}
                        <div className="bg-green-500/40 border border-green-400/60 rounded-xl px-4 py-3 backdrop-blur-sm">
                          <div className="flex items-baseline justify-between">
                            <span className="text-xs text-green-100/80 font-semibold">2-Week Recovery</span>
                            <span className="text-3xl font-black text-green-50">
                              +{signal.twoWeekChange?.toFixed(2)}%
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Card Body */}
                      <div className="p-4 space-y-4">
                        {/* 6-Month Chart with Low Point */}
                        {!recoveryChartsLoading && recoveryChartsData?.[signal.symbol]?.chartData && (
                          <div className="bg-slate-800/50 rounded-xl p-3 border border-green-500/20">
                            <div className="text-xs text-slate-400 font-semibold mb-2">6-Month Price Chart</div>
                            <ResponsiveContainer width="100%" height={120}>
                              <AreaChart data={recoveryChartsData[signal.symbol].chartData}>
                                <defs>
                                  <linearGradient id={`recoveryGradient-${signal.symbol}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
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
                                        <div className="bg-slate-900/95 border border-green-500/50 rounded-lg px-3 py-2 shadow-xl">
                                          <p className="text-xs text-slate-400">
                                            {new Date(data.date).toLocaleDateString()}
                                          </p>
                                          <p className="text-sm font-bold text-white">
                                            ${data.price.toFixed(2)}
                                          </p>
                                          {data.isLow && (
                                            <p className="text-xs text-red-400 font-bold mt-1">
                                              📍 Low Point
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
                                  stroke="#10b981"
                                  strokeWidth={2}
                                  fill={`url(#recoveryGradient-${signal.symbol})`}
                                />
                                {/* Mark the low point */}
                                {recoveryChartsData[signal.symbol].minIndex >= 0 && recoveryChartsData[signal.symbol].chartData[recoveryChartsData[signal.symbol].minIndex] && (
                                  <ReferenceDot
                                    x={recoveryChartsData[signal.symbol].minIndex}
                                    y={recoveryChartsData[signal.symbol].minPrice}
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
                                <span className="text-slate-400">Low: {new Date(recoveryChartsData[signal.symbol].lowDate).toLocaleDateString()}</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Current Price */}
                        {signal.currentPrice && (
                          <div className="flex items-baseline justify-between bg-slate-800/50 rounded-xl px-4 py-3 border border-green-500/20">
                            <span className="text-sm text-slate-300 font-semibold">Current Price</span>
                            <span className="text-xl font-black text-white">${signal.currentPrice.toFixed(2)}</span>
                          </div>
                        )}

                        {/* 3-Month Performance */}
                        {signal.threeMonthChange !== undefined && recoveryChartsData?.[signal.symbol] && (
                          <div className="bg-slate-800/50 rounded-xl px-4 py-3 border border-green-500/20 space-y-2">
                            <div className="flex items-baseline justify-between text-xs">
                              <span className="text-slate-400">Low Price</span>
                              <span className="text-white font-bold">${recoveryChartsData[signal.symbol].minPrice.toFixed(2)}</span>
                            </div>
                            <div className="flex items-baseline justify-between text-xs">
                              <span className="text-slate-400">3-Month Change</span>
                              <span className="text-red-400 font-bold">{signal.threeMonthChange.toFixed(2)}%</span>
                            </div>
                            <div className="flex items-baseline justify-between text-xs">
                              <span className="text-slate-400">2-Week Recovery</span>
                              <span className="text-green-400 font-bold">+{signal.twoWeekChange?.toFixed(2)}%</span>
                            </div>
                          </div>
                        )}

                        {/* Recovery Analysis */}
                        <div className="bg-green-900/20 border border-green-500/30 rounded-xl p-3">
                          <div className="text-xs text-green-300/90 font-bold uppercase tracking-wide mb-2">
                            Recovery Analysis
                          </div>
                          <div className="space-y-1.5 text-sm text-slate-200">
                            <div>✓ Down {Math.abs(signal.threeMonthChange || 0).toFixed(0)}% over 3 months</div>
                            <div>✓ Gained {signal.twoWeekChange?.toFixed(1)}% in 2 weeks</div>
                            <div>✓ Early recovery signs emerging</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Inflection Points Section */}
            <div className="space-y-4">
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
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
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

              {/* Upward Trend Panel */}
              {groupedSymbols.gainsWithTrend.length > 0 && (
                <div className="bg-gradient-to-br from-green-900/20 to-slate-900/50 backdrop-blur-sm rounded-2xl border border-green-500/30 p-4 shadow-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">📊</span>
                    <span className="text-sm font-black text-green-200 uppercase tracking-wide">
                      Upward Trend ({groupedSymbols.gainsWithTrend.length})
                    </span>
                  </div>
                  <div className="space-y-2">
                    {groupedSymbols.gainsWithTrend.map(summary => renderTrendRow(summary, true))}
                  </div>
                </div>
              )}

              {/* Other Gains Panel */}
              {groupedSymbols.gainsWithoutTrend.length > 0 && (
                <div className="bg-gradient-to-br from-green-900/20 to-slate-900/50 backdrop-blur-sm rounded-2xl border border-green-500/30 p-4 shadow-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">📈</span>
                    <span className="text-sm font-black text-green-200 uppercase tracking-wide">
                      Other Gains ({groupedSymbols.gainsWithoutTrend.length})
                    </span>
                  </div>
                  <div className="space-y-2">
                    {groupedSymbols.gainsWithoutTrend.map(summary => renderTrendRow(summary, true))}
                  </div>
                </div>
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

              {/* Downward Trend Panel */}
              {groupedSymbols.lossesWithTrend.length > 0 && (
                <div className="bg-gradient-to-br from-red-900/20 to-slate-900/50 backdrop-blur-sm rounded-2xl border border-red-500/30 p-4 shadow-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">📊</span>
                    <span className="text-sm font-black text-red-200 uppercase tracking-wide">
                      Downward Trend ({groupedSymbols.lossesWithTrend.length})
                    </span>
                  </div>
                  <div className="space-y-2">
                    {groupedSymbols.lossesWithTrend.map(summary => renderTrendRow(summary, false))}
                  </div>
                </div>
              )}

              {/* Other Losses Panel */}
              {groupedSymbols.lossesWithoutTrend.length > 0 && (
                <div className="bg-gradient-to-br from-red-900/20 to-slate-900/50 backdrop-blur-sm rounded-2xl border border-red-500/30 p-4 shadow-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">📉</span>
                    <span className="text-sm font-black text-red-200 uppercase tracking-wide">
                      Other Losses ({groupedSymbols.lossesWithoutTrend.length})
                    </span>
                  </div>
                  <div className="space-y-2">
                    {groupedSymbols.lossesWithoutTrend.map(summary => renderTrendRow(summary, false))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NewsBoard;
