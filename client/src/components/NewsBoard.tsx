import React, { useState, useMemo } from 'react';
import { useQuery } from 'react-query';
import axios from 'axios';
import { BarChart, Bar, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceDot, ReferenceLine, Area, AreaChart } from 'recharts';

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
    breakEvenPrice?: number;
    averageBuyPrice?: number;
    percentBelowBreakeven?: number;
    dollarAmountToBreakeven?: number;
    peakPrice?: number;
    peakDate?: string;
    declineFromPeak?: number;
    daysSincePeak?: number;
    percentFromBreakeven?: number;
    monthlyData?: Array<{
      date: string;
      price: number;
      index: number;
      isPeak: boolean;
      isOneMonthMark?: boolean;
    }>;
    oneMonthAgoIndex?: number;
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

interface TimingRecommendation {
  symbol: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  amount: number;
  currentInvestment: number;
  targetInvestment: number;
  timing: 'EXCELLENT' | 'GOOD' | 'NEUTRAL' | 'POOR' | 'INSUFFICIENT_DATA' | 'ERROR';
  recommendation: string;
  confidence: 'high' | 'medium' | 'low';
  indicators: {
    currentPrice?: number;
    cadPrice?: number;
    exchangeRate?: number;
    sma200?: number;
    sma50?: number;
    sma20?: number;
    rsi?: number;
    momentum20?: number;
    momentum50?: number;
    aboveMA200?: boolean;
    distanceFromMA200?: string;
    distanceFromMA50?: string;
    distanceFromMA20?: string;
    volatility?: number;
    weekHigh52?: number;
    weekLow52?: number;
    distanceFromHigh?: number;
    distanceFromLow?: number;
    volumeTrend?: number;
    macdBullish?: boolean | null;
    macdHistogram?: number | null;
    bollingerB?: number | null;
    adx?: number | null;
    safetyScore?: number | null;
    riskReward?: number | null;
    momentum5?: number | null;
    momentum252?: number | null;
    cmf?: number | null;
    atrPercent?: number | null;
    relativeStrength?: number | null;
    beta?: number | null;
  };
  reasons: string[];
  buyScore: number | null;
  sellScore: number | null;
  unrealizedPnL?: number;
  realizedPnL?: number;
  totalProfit?: number;
}

const NewsBoard: React.FC = () => {
  const [selectedView, setSelectedView] = useState<'alerts' | 'gains-losses' | 'notable-change' | 'eagle' | 'recs' | 'sells'>('recs');

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
          return { holdingsMap: {}, activeHoldings: [], allPortfolioHoldings: [] };
        }

        // Get the first (most recent) portfolio's full data
        const latestPortfolioId = portfolioList[0].id;
        const portfolioResponse = await axios.get(`/api/portfolio/${latestPortfolioId}/cached`);
        const portfolio = portfolioResponse.data;

        // Convert holdings array to map keyed by symbol
        const holdingsMap: { [key: string]: any } = {};
        const activeHoldings: any[] = [];
        const allPortfolioHoldings: any[] = [];

        if (portfolio.holdings && Array.isArray(portfolio.holdings)) {
          portfolio.holdings.forEach((holding: any) => {
            const shares = holding.quantity || 0;
            const currentValue = holding.currentValue || 0;
            const totalInvested = holding.totalInvested || 0;
            const unrealizedPnL = holding.unrealizedPnL || 0;
            const realizedPnL = holding.realizedPnL || 0;

            holdingsMap[holding.symbol] = {
              shares,
              currentValue,
              totalInvested,
              unrealizedPnL,
              realizedPnL,
            };

            const entry = {
              symbol: holding.symbol,
              currentInvestment: totalInvested,
              shares,
              currentValue,
              unrealizedPnL,
              realizedPnL,
            };

            allPortfolioHoldings.push(entry);

            // Only include active holdings (shares >= 0.01)
            if (shares >= 0.01) {
              activeHoldings.push(entry);
            }
          });
        }

        return { holdingsMap, activeHoldings, allPortfolioHoldings };
      } catch (error) {
        console.error('Error fetching holdings:', error);
        return { holdingsMap: {}, activeHoldings: [], allPortfolioHoldings: [] };
      }
    },
    {
      staleTime: 5 * 60 * 1000,
      cacheTime: 30 * 60 * 1000,
    }
  );

  // Fetch watchlist (active, inactive, custom) to supplement portfolio holdings
  const { data: watchlistData } = useQuery(
    'watchlist-data',
    async () => {
      try {
        const response = await axios.get('/api/watchlist');
        return response.data as { active: string[]; inactive: string[]; custom: string[] };
      } catch (error) {
        console.error('Error fetching watchlist:', error);
        return { active: [], inactive: [], custom: [] };
      }
    },
    {
      staleTime: 5 * 60 * 1000,
      cacheTime: 30 * 60 * 1000,
    }
  );

  // Fetch timing recommendations for ALL tracked assets (active, inactive, custom watchlist)
  const { data: recsData, isLoading: recsLoading, refetch: refetchRecs } = useQuery(
    'recs-timing-data',
    async () => {
      try {
        const allPortfolioHoldings = holdingsData?.allPortfolioHoldings || [];
        const portfolioSymbols = new Set(allPortfolioHoldings.map((h: any) => h.symbol));

        // Add ALL watchlist symbols (active, inactive, custom) not already in portfolio
        const watchlistSymbols = [
          ...(watchlistData?.active   || []),
          ...(watchlistData?.inactive || []),
          ...(watchlistData?.custom   || []),
        ];
        const extraHoldings = watchlistSymbols.filter((sym: string, i: number) => watchlistSymbols.indexOf(sym) === i)
          .filter((sym: string) => !portfolioSymbols.has(sym))
          .map((sym: string) => ({
            symbol: sym,
            currentInvestment: 0,
            shares: 0,
            currentValue: 0,
            unrealizedPnL: 0,
            realizedPnL: 0,
          }));

        const allHoldings = [...allPortfolioHoldings, ...extraHoldings];

        if (allHoldings.length === 0) {
          return { recommendations: [], summary: { total: 0, strongBuys: 0, strongSells: 0, analyzed: 0 } };
        }

        console.log('🔄 Fetching timing recommendations for', allHoldings.length, 'total tracked assets');

        const response = await axios.post('/api/rebalancing-recommendations/all-active', {
          holdings: allHoldings,
        });

        console.log('✅ Received timing recommendations:', response.data);
        return response.data;
      } catch (error) {
        console.error('❌ Failed to fetch timing recommendations:', error);
        return { recommendations: [], summary: { total: 0, strongBuys: 0, strongSells: 0, analyzed: 0 } };
      }
    },
    {
      enabled: (selectedView === 'recs' || selectedView === 'sells') && !!holdingsData?.allPortfolioHoldings && !!watchlistData,
      staleTime: 10 * 60 * 1000, // 10 minutes
      cacheTime: 30 * 60 * 1000, // 30 minutes
    }
  );

  // Group news items by symbol and summarize (excluding recovery signals and breakeven signals for gains/losses view)
  const symbolSummaries = useMemo(() => {
    if (!data?.items) return [];

    console.log('🔍 Holdings Data:', holdingsData?.holdingsMap);

    const grouped = new Map<string, SymbolSummary>();

    data.items.forEach((item: NewsItem) => {
      // Skip recovery signals - they'll be shown in Notable Change section
      if (item.title === 'Potential Recovery Signal') {
        return;
      }

      // Skip below breakeven signals - they'll be shown in Eagle tab
      if (item.title === 'Below Breakeven Price') {
        return;
      }

      // Skip peak decline alerts - they'll be shown in Alerts tab
      if (item.title === 'Peak & Decline Alert') {
        return;
      }

      if (!grouped.has(item.symbol)) {
        // Determine if this symbol is positive or negative overall
        const isPositive = item.metadata.dailyChange !== undefined
          ? item.metadata.dailyChange >= 0
          : item.type === 'achievement' || item.type === 'momentum_signal';

        // Check if asset is active (has shares > 0 in holdings)
        const holding = holdingsData?.holdingsMap?.[item.symbol];
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
        const holding = holdingsData?.holdingsMap?.[item.symbol];
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

  // Extract below-breakeven signals for Eagle tab (active holdings only)
  const belowBreakevenSignals = useMemo(() => {
    if (!data?.items) return [];

    return data.items
      .filter(item => item.title === 'Below Breakeven Price')
      .map(item => {
        const holding = holdingsData?.holdingsMap?.[item.symbol];
        // Check for meaningful share count (> 0.01 to handle floating point artifacts)
        const isActive = holding && holding.shares >= 0.01;

        return {
          symbol: item.symbol,
          assetName: item.assetName,
          currentPrice: item.metadata.currentPrice,
          breakEvenPrice: item.metadata.breakEvenPrice,
          averageBuyPrice: item.metadata.averageBuyPrice,
          percentBelowBreakeven: item.metadata.percentBelowBreakeven,
          dollarAmountToBreakeven: item.metadata.dollarAmountToBreakeven,
          isActive: isActive || false,
        };
      })
      .filter(signal => signal.isActive) // Only include active holdings (shares >= 0.01)
      .sort((a, b) => (b.percentBelowBreakeven || 0) - (a.percentBelowBreakeven || 0)); // Sort by gap descending (worst first)
  }, [data?.items, holdingsData]);

  // Extract peak decline alerts for Alerts tab (active holdings only)
  const peakDeclineAlerts = useMemo(() => {
    if (!data?.items) return [];

    return data.items
      .filter(item => item.title === 'Peak & Decline Alert')
      .map(item => {
        const holding = holdingsData?.holdingsMap?.[item.symbol];
        const isActive = holding && holding.shares >= 0.01;

        return {
          symbol: item.symbol,
          assetName: item.assetName,
          currentPrice: item.metadata.currentPrice,
          peakPrice: item.metadata.peakPrice,
          peakDate: item.metadata.peakDate,
          declineFromPeak: item.metadata.declineFromPeak,
          daysSincePeak: item.metadata.daysSincePeak,
          breakEvenPrice: item.metadata.breakEvenPrice,
          percentFromBreakeven: item.metadata.percentFromBreakeven,
          monthlyData: item.metadata.monthlyData,
          oneMonthAgoIndex: item.metadata.oneMonthAgoIndex,
          isActive: isActive || false,
          shares: holding?.shares || 0,
          currentValue: holding?.currentValue || 0,
        };
      })
      .filter(signal => signal.isActive) // Only include active holdings (shares >= 0.01)
      .sort((a, b) => (a.declineFromPeak || 0) - (b.declineFromPeak || 0)); // Sort by decline descending (worst first)
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

  // Helper functions for sell recommendations
  const getReason1 = (symbol: string, pnlPercent: number): string => {
    const reasons: { [key: string]: string } = {
      'TRUMP': 'Meme coin down 99.99% - worthless',
      'DOGE': 'Meme coin with no utility - high risk',
      'SOL': 'Position too small to be meaningful',
      'ZEC': 'Privacy coin - limited adoption',
      'MSTR': 'Over-leveraged Bitcoin proxy - crash risk in correction',
      'IREN': 'Bitcoin miner - high operating costs in downturn',
      'LULU': 'Weak discretionary retail fundamentals',
      'ZETA': 'Small cap with weak positioning',
      'HIMS': 'Speculative telehealth under pressure',
    };
    return reasons[symbol] || `Down ${pnlPercent.toFixed(1)}% - high risk`;
  };

  const getReason2 = (symbol: string, pnlPercent: number, indicators: any): string => {
    if (symbol === 'TSLA') return `Up ${pnlPercent.toFixed(1)}% - lock in gains, high volatility`;
    if (symbol === 'ASTS') return `Up ${pnlPercent.toFixed(1)}% - speculative space stock`;
    if (symbol === 'BTC') return `RSI ${indicators?.rsi?.toFixed(0) || 'high'} - crypto vulnerable in correction`;
    if (symbol === 'ETH') return `Down ${Math.abs(pnlPercent).toFixed(1)}% - reduce crypto exposure`;
    if (symbol === 'NVDA') return 'Near 52-week high - extended valuation';
    if (symbol === 'AVGO') return 'Reduce losing mega-cap position';
    return 'Consider trimming exposure';
  };

  const getTrimPercent = (symbol: string, pnlPercent: number): number => {
    if (symbol === 'TSLA' && pnlPercent > 0) return 50; // Take 50% profits
    if (symbol === 'ASTS' && pnlPercent > 30) return 50;
    if (symbol === 'BTC') return 33; // Trim 1/3
    if (symbol === 'ETH') return 25;
    if (symbol === 'NVDA') return 50;
    if (symbol === 'AVGO') return 33;
    return 25;
  };

  // Categorize assets for sell recommendations based on correction strategy
  const sellRecommendations = useMemo(() => {
    if (!recsData?.recommendations || !holdingsData?.holdingsMap) return { priority1: [], priority2: [], total: 0 };

    const priority1: any[] = []; // Immediate sells
    const priority2: any[] = []; // Trim/reduce positions

    recsData.recommendations.forEach((rec: TimingRecommendation) => {
      const holding = holdingsData.holdingsMap[rec.symbol];
      if (!holding || holding.shares < 0.01) return;

      const pnlPercent = holding.totalInvested > 0
        ? ((holding.unrealizedPnL || 0) / holding.totalInvested) * 100
        : 0;

      // Priority 1: Immediate Sell Candidates
      // Meme coins/stocks down significantly or fundamentally weak
      if (
        rec.symbol === 'TRUMP' || // Meme coin, down 99%+
        rec.symbol === 'DOGE' || // Meme coin
        rec.symbol === 'SOL' && holding.shares < 0.01 || // Essentially worthless position
        rec.symbol === 'ZEC' || // Privacy coin, limited adoption
        (rec.symbol === 'MSTR' && pnlPercent < -30) || // Bitcoin proxy, down significantly
        (rec.symbol === 'IREN' && pnlPercent < 0) || // Bitcoin miner, high risk
        (rec.symbol === 'LULU' && pnlPercent < -15) || // Weak retail
        (rec.symbol === 'ZETA' && pnlPercent < -10) || // Small cap risk
        (rec.symbol === 'HIMS' && pnlPercent < -15) // Speculative healthcare
      ) {
        priority1.push({
          ...rec,
          holding,
          pnlPercent,
          reason: getReason1(rec.symbol, pnlPercent),
          suggestedAction: 'SELL ALL',
        });
      }
      // Priority 2: Trim/Reduce Positions
      // Take profits or reduce high-risk exposure
      else if (
        (rec.symbol === 'TSLA' && pnlPercent > 0) || // Take profits, high volatility
        (rec.symbol === 'ASTS' && pnlPercent > 30) || // Lock in gains, speculative
        (rec.symbol === 'BTC' && (rec.indicators?.rsi || 0) > 65) || // Crypto high, reduce
        (rec.symbol === 'ETH' && pnlPercent < 0) || // Reduce losing crypto
        (rec.symbol === 'NVDA' && (rec.indicators?.distanceFromHigh || -999) > -5) || // Near highs
        (rec.symbol === 'AVGO' && pnlPercent < 0) // Reduce losing position
      ) {
        const trimPercent = getTrimPercent(rec.symbol, pnlPercent);
        priority2.push({
          ...rec,
          holding,
          pnlPercent,
          reason: getReason2(rec.symbol, pnlPercent, rec.indicators),
          suggestedAction: `TRIM ${trimPercent}%`,
        });
      }
    });

    return {
      priority1: priority1.sort((a, b) => a.pnlPercent - b.pnlPercent),
      priority2: priority2.sort((a, b) => b.pnlPercent - a.pnlPercent),
      total: priority1.length + priority2.length,
    };
  }, [recsData?.recommendations, holdingsData?.holdingsMap]);

  // Count how many recs display each signal flag (same priority logic as the table badge)
  const flagCounts = useMemo(() => {
    const counts = { strongEntry: 0, modEntry: 0, recovery: 0, trend: 0, prime: 0, extended: 0 };
    if (!recsData?.recommendations) return counts;
    for (const rec of recsData.recommendations) {
      const ind = rec.indicators;
      if (!ind) continue;
      const reversal   = ind.momentum5 != null && ind.momentum20 != null && ind.momentum5 > 0 && ind.momentum20 < 0;
      const accumStrong = (ind.cmf ?? -1) >= 0.10;
      const accumWeak   = (ind.cmf ?? -1) > 0;
      const bullish     = ind.macdBullish === true;
      const d200        = parseFloat(ind.distanceFromMA200 ?? '0');
      const mom5v       = ind.momentum5 ?? null;
      const mom20v      = ind.momentum20 ?? null;
      const adxV        = ind.adx ?? 0;
      const accumTrend  = (ind.cmf ?? -1) > -0.05;
      const dip         = ind.distanceFromHigh ?? 0;
      const safety      = ind.safetyScore ?? 0;

      const isStrong   = reversal && accumStrong && bullish;
      const isModerate = (reversal && bullish && accumWeak) || (reversal && accumStrong);
      const isExtended = d200 > 20;
      const isRecovery = !reversal && mom5v != null && mom20v != null && mom5v > 0 && mom20v > 0 && mom20v < 8 && d200 < 0 && bullish && accumWeak;
      const isTrend    = !reversal && !isRecovery && mom20v != null && mom20v > 0 && bullish && adxV > 15 && d200 >= 0 && d200 <= 30 && accumTrend;
      const isPrime    = !reversal && !isRecovery && !isTrend && safety >= 40 && dip <= -20 && dip >= -55 && d200 <= -8 && d200 >= -35;

      // Same priority as the badge IIFE
      if (isTrend)         counts.trend++;
      else if (isExtended) counts.extended++;
      else if (isStrong)   counts.strongEntry++;
      else if (isModerate) counts.modEntry++;
      else if (isPrime)    counts.prime++;
      else if (isRecovery) counts.recovery++;
    }
    return counts;
  }, [recsData?.recommendations]);

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
                  onClick={() => setSelectedView('recs')}
                  className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${
                    selectedView === 'recs'
                      ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  📊 Recs
                </button>
                <button
                  onClick={() => setSelectedView('alerts')}
                  className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${
                    selectedView === 'alerts'
                      ? 'bg-gradient-to-r from-orange-600 to-red-600 text-white shadow-lg'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  🚨 Alerts
                </button>
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
                <button
                  onClick={() => setSelectedView('eagle')}
                  className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${
                    selectedView === 'eagle'
                      ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-lg'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  🦅 Eagle
                </button>
                <button
                  onClick={() => setSelectedView('sells')}
                  className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${
                    selectedView === 'sells'
                      ? 'bg-gradient-to-r from-red-600 to-orange-600 text-white shadow-lg'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  💸 Sells
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
        ) : selectedView === 'alerts' ? (
          // Alerts View - Peak & Decline Alerts
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-orange-600/20 to-red-600/20 backdrop-blur-sm rounded-2xl border border-orange-500/30 p-5 shadow-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-orange-500/20 p-2.5 rounded-xl border border-orange-500/40">
                    <span className="text-2xl">🚨</span>
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-white">Peak & Decline Alerts</h2>
                    <p className="text-orange-300/70 text-xs">Assets that peaked in the last month and are now trending downward</p>
                  </div>
                </div>
                <div className="bg-orange-500/20 border border-orange-500/40 px-3 py-1.5 rounded-xl">
                  <span className="text-orange-300 font-black text-base">
                    {peakDeclineAlerts.length}
                  </span>
                </div>
              </div>
            </div>

            {peakDeclineAlerts.length === 0 ? (
              <div className="bg-slate-800/30 border border-slate-600/30 rounded-xl p-12 text-center backdrop-blur-sm">
                <p className="text-slate-400 text-xl mb-2">✅ No peak decline alerts</p>
                <p className="text-slate-500">All assets are maintaining their recent highs or showing upward trends.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {peakDeclineAlerts.map((alert, index) => (
                  <div
                    key={alert.symbol}
                    className="bg-gradient-to-br from-slate-800/90 via-orange-900/20 to-slate-900/90 backdrop-blur-xl rounded-xl border-2 border-orange-500/80 hover:border-orange-400/90 shadow-xl shadow-orange-500/20 hover:shadow-orange-500/40 transition-all duration-200 hover:scale-102 animate-fadeIn overflow-hidden"
                    style={{ animationDelay: `${index * 20}ms` }}
                  >
                    {/* Card Header - Compact */}
                    <div className="bg-gradient-to-r from-orange-600/30 to-red-600/30 border-b border-orange-500/40 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="bg-orange-500/30 p-1.5 rounded-lg border border-orange-500/50">
                          <span className="text-lg">📉</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-black text-white truncate tracking-tight">{alert.symbol}</h3>
                          <p className="text-[10px] text-slate-300/80 truncate font-medium">{alert.assetName}</p>
                        </div>
                      </div>

                      {/* Decline Highlight - Compact */}
                      <div className="bg-red-500/40 border border-red-400/60 rounded-lg px-3 py-2 backdrop-blur-sm">
                        <div className="flex items-baseline justify-between">
                          <span className="text-[10px] text-red-100/80 font-semibold">From Peak</span>
                          <span className="text-xl font-black text-red-50">
                            {alert.declineFromPeak?.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Card Body - Compact */}
                    <div className="p-3 space-y-3">
                      {/* 1-Month Chart with Peak and Breakeven */}
                      {alert.monthlyData && alert.monthlyData.length > 0 && (
                        <div className="bg-slate-800/50 rounded-lg p-2 border border-orange-500/20">
                          <ResponsiveContainer width="100%" height={80}>
                            <AreaChart data={alert.monthlyData}>
                              <defs>
                                <linearGradient id={`alertGradient-${alert.symbol}`} x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                                  <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                                </linearGradient>
                              </defs>
                              <XAxis dataKey="index" hide />
                              <YAxis domain={['auto', 'auto']} hide />
                              <Tooltip
                                content={({ active, payload }) => {
                                  if (active && payload && payload.length) {
                                    const data = payload[0].payload;
                                    return (
                                      <div className="bg-slate-900/95 border border-orange-500/50 rounded-lg px-3 py-2 shadow-xl">
                                        <p className="text-xs text-slate-400">
                                          {new Date(data.date).toLocaleDateString()}
                                        </p>
                                        <p className="text-sm font-bold text-white">
                                          ${data.price.toFixed(2)}
                                        </p>
                                        {data.isPeak && (
                                          <p className="text-xs text-orange-400 font-bold mt-1">
                                            📍 Peak
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
                                stroke="#f97316"
                                strokeWidth={2}
                                fill={`url(#alertGradient-${alert.symbol})`}
                              />
                              {/* Mark the peak point */}
                              {alert.monthlyData.find(d => d.isPeak) && (
                                <ReferenceDot
                                  x={alert.monthlyData.find(d => d.isPeak)!.index}
                                  y={alert.peakPrice}
                                  r={6}
                                  fill="#f97316"
                                  stroke="#fff"
                                  strokeWidth={2}
                                />
                              )}
                              {/* Vertical line at 1-month mark */}
                              {alert.oneMonthAgoIndex !== undefined && (
                                <ReferenceLine
                                  x={alert.oneMonthAgoIndex}
                                  stroke="#64748b"
                                  strokeWidth={1}
                                  strokeDasharray="3 3"
                                  label=""
                                />
                              )}
                              {/* Show breakeven line if available */}
                              {alert.breakEvenPrice && alert.breakEvenPrice > 0 && (
                                <Line
                                  type="monotone"
                                  dataKey={() => alert.breakEvenPrice}
                                  stroke="#fbbf24"
                                  strokeWidth={2}
                                  strokeDasharray="5 5"
                                  dot={false}
                                />
                              )}
                            </AreaChart>
                          </ResponsiveContainer>
                          <div className="flex items-center justify-center mt-1 gap-2 text-[10px]">
                            <div className="flex items-center gap-0.5">
                              <div className="w-2 h-2 rounded-full bg-orange-500 border border-white"></div>
                              <span className="text-slate-400">Peak</span>
                            </div>
                            <div className="flex items-center gap-0.5">
                              <div className="w-2 h-0.5 bg-slate-500"></div>
                              <span className="text-slate-400">1mo</span>
                            </div>
                            {alert.breakEvenPrice && alert.breakEvenPrice > 0 && (
                              <div className="flex items-center gap-0.5">
                                <div className="w-3 h-0.5 bg-amber-400"></div>
                                <span className="text-slate-400">B/E</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Price Info - Compact Grid */}
                      <div className="bg-slate-800/50 rounded-lg px-2 py-2 border border-orange-500/20">
                        <div className="grid grid-cols-3 gap-2 text-[10px]">
                          <div>
                            <div className="text-slate-400">Current</div>
                            <div className="text-white font-bold">${alert.currentPrice?.toFixed(2)}</div>
                          </div>
                          <div>
                            <div className="text-slate-400">Peak</div>
                            <div className="text-white font-bold">${alert.peakPrice?.toFixed(2)}</div>
                          </div>
                          <div>
                            <div className="text-slate-400">Days Ago</div>
                            <div className="text-white font-bold">{alert.daysSincePeak}d</div>
                          </div>
                          <div>
                            <div className="text-slate-400">Shares</div>
                            <div className="text-white font-bold">{alert.shares.toFixed(2)}</div>
                          </div>
                          <div>
                            <div className="text-slate-400">Value</div>
                            <div className="text-white font-bold">${(alert.currentValue || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                          </div>
                          {alert.breakEvenPrice && alert.breakEvenPrice > 0 ? (
                            <div>
                              <div className="text-slate-400">vs B/E</div>
                              <div className={`font-bold ${(alert.percentFromBreakeven || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {(alert.percentFromBreakeven || 0) >= 0 ? '+' : ''}{alert.percentFromBreakeven?.toFixed(1)}%
                              </div>
                            </div>
                          ) : (
                            <div></div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
        ) : selectedView === 'eagle' ? (
          // Eagle View - Below Breakeven Assets
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-4">
              <div className="bg-gradient-to-r from-amber-600/20 to-orange-600/20 backdrop-blur-sm rounded-2xl border border-amber-500/30 p-5 shadow-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-amber-500/20 p-2.5 rounded-xl border border-amber-500/40">
                      <span className="text-2xl">🦅</span>
                    </div>
                    <div>
                      <h2 className="text-xl font-black text-white">Eagle - Below Breakeven</h2>
                      <p className="text-amber-300/70 text-xs">Assets trading below their breakeven price</p>
                    </div>
                  </div>
                  <div className="bg-amber-500/20 border border-amber-500/40 px-3 py-1.5 rounded-xl">
                    <span className="text-amber-300 font-black text-base">
                      {belowBreakevenSignals.length}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {belowBreakevenSignals.length === 0 ? (
              <div className="lg:col-span-4 bg-slate-800/30 border border-slate-600/30 rounded-xl p-12 text-center backdrop-blur-sm">
                <p className="text-slate-400 text-xl mb-2">🎉 All assets are above breakeven!</p>
                <p className="text-slate-500">No assets are currently trading below their breakeven price.</p>
              </div>
            ) : (
              <div className="lg:col-span-4 bg-gradient-to-br from-amber-900/20 to-slate-900/50 backdrop-blur-sm rounded-2xl border border-amber-500/30 p-4 shadow-lg">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" style={{ gridAutoFlow: 'column', gridTemplateRows: `repeat(${Math.ceil(belowBreakevenSignals.length / 4)}, auto)` }}>
                  {belowBreakevenSignals.map((signal, index) => {
                    // Calculate slider positions
                    const currentPrice = signal.currentPrice || 0;
                    const breakEvenPrice = signal.breakEvenPrice || 0;
                    const avgBuyPrice = signal.averageBuyPrice || breakEvenPrice;

                    // Create price range for slider (from lowest to 20% above breakeven)
                    const lowestPrice = Math.min(currentPrice, avgBuyPrice, breakEvenPrice) * 0.95;
                    const highestPrice = breakEvenPrice * 1.2;
                    const priceRange = highestPrice - lowestPrice;

                    // Calculate positions as percentages
                    const currentPosition = ((currentPrice - lowestPrice) / priceRange) * 100;
                    const breakEvenPosition = ((breakEvenPrice - lowestPrice) / priceRange) * 100;
                    const avgBuyPosition = avgBuyPrice ? ((avgBuyPrice - lowestPrice) / priceRange) * 100 : null;

                    return (
                      <div
                        key={signal.symbol}
                        className="bg-slate-800/30 border border-amber-500/30 hover:border-amber-500/50 rounded-lg transition-all hover:bg-slate-800/50"
                      >
                        <div className="flex flex-col p-2.5 space-y-3">
                        {/* Header Row - Symbol and Prices */}
                        <div className="flex items-center justify-between">
                          <div className="flex-shrink-0">
                            <div className="font-bold text-white text-sm">{signal.symbol}</div>
                            <div className="text-[10px] text-slate-400 truncate">{signal.assetName}</div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <div className="text-[10px] text-slate-400">Current</div>
                              <div className="text-xs font-bold text-red-400">${currentPrice.toFixed(2)}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-[10px] text-slate-400">B/E Target</div>
                              <div className="text-xs font-bold text-amber-400">${breakEvenPrice.toFixed(2)}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-[10px] text-slate-400">Gap</div>
                              <div className="text-xs font-bold text-red-400">
                                -{signal.percentBelowBreakeven?.toFixed(1)}%
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Price Slider Visualization */}
                        <div className="w-full">
                          <div className="relative h-8 flex items-center">
                            {/* Slider track */}
                            <div className="absolute inset-0 flex items-center">
                              <div className="w-full h-2 bg-slate-700/50 rounded-full overflow-hidden">
                                {/* Red zone (below breakeven) */}
                                <div
                                  className="absolute h-full bg-gradient-to-r from-red-600/40 to-red-500/40"
                                  style={{
                                    left: '0%',
                                    width: `${breakEvenPosition}%`
                                  }}
                                />
                                {/* Green zone (above breakeven) */}
                                <div
                                  className="absolute h-full bg-gradient-to-r from-green-600/40 to-green-500/40"
                                  style={{
                                    left: `${breakEvenPosition}%`,
                                    width: `${100 - breakEvenPosition}%`
                                  }}
                                />
                              </div>
                            </div>

                            {/* Price markers */}
                            <div className="relative w-full h-full flex items-center">
                              {/* Average Buy Price marker (if different from breakeven) */}
                              {avgBuyPosition !== null && Math.abs(avgBuyPosition - breakEvenPosition) > 2 && (
                                <div
                                  className="absolute flex flex-col items-center"
                                  style={{ left: `${avgBuyPosition}%`, transform: 'translateX(-50%)' }}
                                >
                                  <div className="w-1 h-4 bg-blue-400 rounded-full"></div>
                                  <div className="text-[9px] text-blue-400 font-bold mt-0.5">AVG</div>
                                </div>
                              )}

                              {/* Breakeven Price marker */}
                              <div
                                className="absolute flex flex-col items-center z-10"
                                style={{ left: `${breakEvenPosition}%`, transform: 'translateX(-50%)' }}
                              >
                                <div className="w-1.5 h-6 bg-amber-400 rounded-full shadow-lg"></div>
                                <div className="text-[9px] text-amber-400 font-bold mt-0.5">B/E</div>
                              </div>

                              {/* Current Price marker */}
                              <div
                                className="absolute flex flex-col items-center z-20"
                                style={{ left: `${currentPosition}%`, transform: 'translateX(-50%)' }}
                              >
                                <div className="w-2 h-7 bg-red-500 rounded-full shadow-xl border-2 border-white"></div>
                                <div className="text-[9px] text-red-300 font-bold mt-0.5">NOW</div>
                              </div>
                            </div>
                          </div>
                        </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : selectedView === 'recs' ? (
          // Recs View - Timing Recommendations for All Active Assets
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-indigo-600/20 to-purple-600/20 backdrop-blur-sm rounded-2xl border border-indigo-500/30 p-5 shadow-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-indigo-500/20 p-2.5 rounded-xl border border-indigo-500/40">
                    <span className="text-2xl">📊</span>
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-white">Timing Recommendations</h2>
                    <p className="text-indigo-300/70 text-xs">Technical analysis for all active assets</p>
                    <div className="flex items-center gap-3 mt-2 bg-slate-800/60 border border-slate-600/40 rounded-lg px-3 py-2">
                      <span className="text-slate-300 text-xs"><span className="text-indigo-300 font-bold">Group = verdict</span> <span className="text-slate-500">—</span> Strong Buy/Sell = act now.</span>
                      <span className="text-slate-600 text-xs">|</span>
                      <span className="text-slate-300 text-xs"><span className="text-yellow-300 font-bold">Row flags = timing layer</span> <span className="text-slate-500">—</span> confirms how &amp; when to enter.</span>
                      <span className="text-slate-600 text-xs">|</span>
                      <span className="text-slate-400 text-xs italic">Strong Buy with no flag: scale in. Flag only: watch closely.</span>
                    </div>
                  </div>
                </div>
                {recsData?.summary && (
                  <div className="flex items-center gap-3">
                    <div className="bg-green-500/20 border border-green-500/40 px-3 py-1.5 rounded-xl">
                      <span className="text-green-300 font-black text-sm">{recsData.summary.strongBuys} Strong Buys</span>
                    </div>
                    <div className="bg-red-500/20 border border-red-500/40 px-3 py-1.5 rounded-xl">
                      <span className="text-red-300 font-black text-sm">{recsData.summary.strongSells} Strong Sells</span>
                    </div>
                  </div>
                )}
              </div>
            </div>


            {recsLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-500 mx-auto mb-4"></div>
                  <p className="text-slate-400 text-lg">Analyzing your active assets...</p>
                </div>
              </div>
            ) : !recsData?.recommendations || recsData.recommendations.length === 0 ? (
              <div className="bg-slate-800/30 border border-slate-600/30 rounded-xl p-12 text-center backdrop-blur-sm">
                <p className="text-slate-400 text-xl mb-2">📭 No tracked assets to analyze</p>
                <p className="text-slate-500">Upload portfolio data or add symbols to your watchlist.</p>
              </div>
            ) : (
              <>
              {/* Signal legend */}
              <div className="flex gap-2 mb-3 w-full items-stretch">

                {/* Entry group */}
                <div className="flex flex-col flex-[2] gap-1">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-green-400/60 text-center">↓ Entry Signals</div>
                  <div className="flex gap-1.5 flex-1">
                    {([
                      { color: 'border-green-400 text-green-400', badge: '⚡ entry', count: flagCounts.strongEntry, short: '5d ↑  ·  20d ↓  ·  CMF ≥ 0.10  ·  MACD ↑', action: 'STRONG BUY — all signals aligned', detail: 'Strongest entry: 5-day momentum has just turned positive while 20-day is still negative (reversal starting). Strong accumulation (CMF ≥ 0.10) and MACD bullish confirm buyers are stepping in. Best risk/reward entry point.' },
                      { color: 'border-lime-400 text-lime-400',   badge: '↗ entry', count: flagCounts.modEntry,    short: '5d ↑  ·  20d ↓  ·  CMF > 0  ·  MACD ↑',    action: 'BUY — watch for follow-through',   detail: 'Same reversal pattern as ⚡ but with lighter accumulation (CMF just above zero). Valid entry signal, slightly less confirmed — higher chance of a false start.' },
                    ] as const).map(({ color, badge, count, short, action, detail }) => (
                      <div key={badge} className={`relative group flex-1 bg-slate-800/60 border ${color} rounded-lg px-3 py-2.5 text-center`}>
                        {count > 0 && (
                          <div className="absolute -top-2 -right-2 min-w-[18px] h-[18px] rounded-full bg-slate-700 border border-slate-500 flex items-center justify-center px-1">
                            <span className="text-[10px] font-black text-white leading-none">{count}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-center gap-1.5">
                          <span className="font-black text-sm">{badge}</span>
                          <span className="opacity-40 hover:opacity-80 cursor-default select-none text-xs">ⓘ</span>
                        </div>
                        <div className="opacity-60 mt-1 text-xs leading-snug">{short}</div>
                        <div className="font-bold mt-1.5 text-xs tracking-wide">{action}</div>
                        <div className="absolute bottom-full left-0 mb-2 w-72 bg-slate-900 border border-slate-600/60 rounded-lg px-3 py-2 text-xs text-slate-300 leading-relaxed shadow-xl z-50 hidden group-hover:block pointer-events-none">{detail}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Standalone signals */}
                {([
                  { color: 'border-blue-400 text-blue-400',     label: 'Recovery',  badge: '◎ recovery', count: flagCounts.recovery, short: '5d ↑  ·  20d ↑ (<8%)  ·  below 200MA',        action: 'CAN BUY — reversal confirmed',       detail: 'Reversal already complete — both 5d and 20d momentum are positive but still small (<8%), and price is still below the 200MA. The asset is stabilising after a decline. Next stage after entry.' },
                  { color: 'border-yellow-400 text-yellow-400', label: 'Trend',     badge: '↑ trend',    count: flagCounts.trend,    short: '20d ↑  ·  ADX > 15  ·  MACD ↑  ·  0–30% above 200MA', action: 'HOLD or ADD ON DIPS',          detail: 'Active sustained uptrend. 20-day momentum positive, ADX > 15 (directional strength confirmed), MACD bullish, price 0–30% above 200MA. No reversal needed — trend is intact. Hold or add on dips.' },
                  { color: 'border-purple-400 text-purple-400', label: 'Prime Dip', badge: '★ prime',    count: flagCounts.prime,    short: 'dip ≥ 20%  ·  200MA elevated  ·  safety 40+',    action: 'ACCUMULATE — quality at discount',   detail: 'Quality asset in a sudden dip. Price is ≥20% below 52-week high while 200MA is still elevated — indicating a recent crash, not prolonged structural decline. Safety ≥60 = bright purple, 40–59 = dimmer purple (more volatile, same signal).' },
                  { color: 'border-orange-400 text-orange-400', label: 'Extended',  badge: '↗ extended', count: flagCounts.extended,  short: 'entry signal  ·  > 20% above 200MA',              action: 'WAIT — let it pull back first',      detail: 'A valid entry or reversal signal is present, but the asset is already more than 20% above its 200MA. The move may already be priced in. Consider waiting for a pullback before entering.' },
                ] as const).map(({ color, badge, count, label, short, action, detail }) => (
                  <div key={badge} className="flex flex-col flex-1 gap-1">
                    <div className={`text-[9px] font-bold uppercase tracking-widest text-center opacity-60 ${color.split(' ')[1]}`}>{label}</div>
                    <div className={`relative group flex-1 bg-slate-800/60 border ${color} rounded-lg px-3 py-2.5 text-center`}>
                      {count > 0 && (
                        <div className="absolute -top-2 -right-2 min-w-[18px] h-[18px] rounded-full bg-slate-700 border border-slate-500 flex items-center justify-center px-1">
                          <span className="text-[10px] font-black text-white leading-none">{count}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="font-black text-sm">{badge}</span>
                        <span className="opacity-40 hover:opacity-80 cursor-default select-none text-xs">ⓘ</span>
                      </div>
                      <div className="opacity-60 mt-1 text-xs leading-snug">{short}</div>
                      <div className="font-bold mt-1.5 text-xs tracking-wide">{action}</div>
                      <div className="absolute bottom-full left-0 mb-2 w-72 bg-slate-900 border border-slate-600/60 rounded-lg px-3 py-2 text-xs text-slate-300 leading-relaxed shadow-xl z-50 hidden group-hover:block pointer-events-none">{detail}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-sm rounded-2xl border border-indigo-500/30 p-4 shadow-lg overflow-x-auto overflow-y-auto max-h-[70vh]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-800">
                    {/* Group header row */}
                    <tr className="border-b border-slate-700/40">
                      {/* Identity: 2 cols */}
                      <th colSpan={2} className="px-3 pt-2 pb-1 text-left">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Identity</span>
                      </th>
                      {/* Verdict: 2 cols */}
                      <th colSpan={2} className="px-3 pt-2 pb-1 text-center border-l border-slate-700/50">
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">Verdict</span>
                          <span className="group relative cursor-default">
                            <span className="text-indigo-400/60 text-[10px] font-bold">ⓘ</span>
                            <div className="absolute left-1/2 -translate-x-1/2 top-5 z-50 hidden group-hover:block w-64 bg-slate-900 border border-slate-600 rounded-lg p-2.5 text-left shadow-xl">
                              <p className="text-[11px] text-slate-200 leading-relaxed"><span className="text-indigo-300 font-bold">Buy</span> — 0–100: higher = better time to enter. ≥70 strong signal.</p>
                              <p className="text-[11px] text-slate-200 leading-relaxed mt-1"><span className="text-indigo-300 font-bold">Sell</span> — 0–100: higher = better time to exit. ≥70 strong signal.</p>
                              <p className="text-[11px] text-slate-200 leading-relaxed mt-1"><span className="text-emerald-400 font-bold">⚡ entry</span> — reversal + CMF accum + MACD bullish, price not extended (&lt;+20% vs 200MA).<br/><span className="text-green-500 font-bold">↗ entry</span> — reversal + MACD bullish or CMF accum, price not extended.<br/><span className="text-amber-400 font-bold">↗ extended</span> — same signals but price &gt;+20% above 200MA — momentum trade, not a value entry.</p>
                            </div>
                          </span>
                        </div>
                      </th>
                      {/* Trend: 4 cols — vs 200MA, vs 50MA, vs 20MA, ADX */}
                      <th colSpan={4} className="px-3 pt-2 pb-1 text-center border-l border-slate-700/50">
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Trend</span>
                          <span className="group relative cursor-default">
                            <span className="text-blue-400/60 text-[10px] font-bold">ⓘ</span>
                            <div className="absolute left-1/2 -translate-x-1/2 top-5 z-50 hidden group-hover:block w-72 bg-slate-900 border border-slate-600 rounded-lg p-2.5 text-left shadow-xl">
                              <p className="text-[11px] text-slate-200 leading-relaxed"><span className="text-blue-300 font-bold">vs 200MA / 50MA / 20MA</span> — % distance from moving average. Negative = below MA (value zone). Positive = extended above.</p>
                              <p className="text-[11px] text-slate-200 leading-relaxed mt-1"><span className="text-blue-300 font-bold">ADX</span> — trend strength. &lt;20 choppy/no trend, 20–40 developing, &gt;40 strong trend.</p>
                            </div>
                          </span>
                        </div>
                      </th>
                      {/* Momentum: 5 cols — RSI, Mom 20d, MACD, Mom 1y, RS vs SPY */}
                      <th colSpan={5} className="px-3 pt-2 pb-1 text-center border-l border-slate-700/50">
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400">Momentum</span>
                          <span className="group relative cursor-default">
                            <span className="text-amber-400/60 text-[10px] font-bold">ⓘ</span>
                            <div className="absolute left-1/2 -translate-x-1/2 top-5 z-50 hidden group-hover:block w-72 bg-slate-900 border border-slate-600 rounded-lg p-2.5 text-left shadow-xl">
                              <p className="text-[11px] text-slate-200 leading-relaxed"><span className="text-amber-300 font-bold">RSI</span> — &lt;30 oversold (buy signal), &gt;70 overbought (sell signal).</p>
                              <p className="text-[11px] text-slate-200 leading-relaxed mt-1"><span className="text-amber-300 font-bold">Mom 20d</span> — price change over 20 days. Reversal = 5d positive while 20d still negative.</p>
                              <p className="text-[11px] text-slate-200 leading-relaxed mt-1"><span className="text-amber-300 font-bold">MACD</span> — ▲ bullish (uptrend), ▼ bearish (downtrend).</p>
                              <p className="text-[11px] text-slate-200 leading-relaxed mt-1"><span className="text-amber-300 font-bold">Mom 1y</span> — annual price change. Positive = in long uptrend.</p>
                              <p className="text-[11px] text-slate-200 leading-relaxed mt-1"><span className="text-amber-300 font-bold">RS vs SPY</span> — annual momentum minus SPY's. Positive = outperforming the market.</p>
                            </div>
                          </span>
                        </div>
                      </th>
                      {/* Range: 3 cols — vs 52w Hi, vs 52w Lo, Bollinger %B */}
                      <th colSpan={3} className="px-3 pt-2 pb-1 text-center border-l border-slate-700/50">
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-purple-400">Range</span>
                          <span className="group relative cursor-default">
                            <span className="text-purple-400/60 text-[10px] font-bold">ⓘ</span>
                            <div className="absolute left-1/2 -translate-x-1/2 top-5 z-50 hidden group-hover:block w-64 bg-slate-900 border border-slate-600 rounded-lg p-2.5 text-left shadow-xl">
                              <p className="text-[11px] text-slate-200 leading-relaxed"><span className="text-purple-300 font-bold">vs 52w Hi</span> — % below the 52-week high. Very negative = deep value territory.</p>
                              <p className="text-[11px] text-slate-200 leading-relaxed mt-1"><span className="text-purple-300 font-bold">vs 52w Lo</span> — % above the 52-week low. Near 0% = at lows.</p>
                              <p className="text-[11px] text-slate-200 leading-relaxed mt-1"><span className="text-purple-300 font-bold">Boll %B</span> — position within Bollinger Bands. 0 = lower band (oversold), 1 = upper band (overbought).</p>
                            </div>
                          </span>
                        </div>
                      </th>
                      {/* Activity: 3 cols — CMF, Volatility, Vol Ratio */}
                      <th colSpan={3} className="px-3 pt-2 pb-1 text-center border-l border-slate-700/50">
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">Activity</span>
                          <span className="group relative cursor-default">
                            <span className="text-cyan-400/60 text-[10px] font-bold">ⓘ</span>
                            <div className="absolute right-0 top-5 z-50 hidden group-hover:block w-72 bg-slate-900 border border-slate-600 rounded-lg p-2.5 text-left shadow-xl">
                              <p className="text-[11px] text-slate-200 leading-relaxed"><span className="text-cyan-300 font-bold">CMF</span> — Chaikin Money Flow. ≥+0.10 = institutions accumulating. ≤−0.10 = distribution.</p>
                              <p className="text-[11px] text-slate-200 leading-relaxed mt-1"><span className="text-cyan-300 font-bold">Volatility</span> — annualised. &lt;20% stable, &gt;40% high risk.</p>
                              <p className="text-[11px] text-slate-200 leading-relaxed mt-1"><span className="text-cyan-300 font-bold">Vol Ratio</span> — today's volume vs 20-day average. &gt;+50% = unusual activity spike.</p>
                            </div>
                          </span>
                        </div>
                      </th>
                      {/* Risk: 4 cols — Safety, R/R, ATR%, Beta */}
                      <th colSpan={4} className="px-3 pt-2 pb-1 text-center border-l border-slate-700/50">
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-rose-400">Risk</span>
                          <span className="group relative cursor-default">
                            <span className="text-rose-400/60 text-[10px] font-bold">ⓘ</span>
                            <div className="absolute right-0 top-5 z-50 hidden group-hover:block w-72 bg-slate-900 border border-slate-600 rounded-lg p-2.5 text-left shadow-xl">
                              <p className="text-[11px] text-slate-200 leading-relaxed"><span className="text-rose-300 font-bold">Safety</span> — 0–100 composite: volatility (40%), max drawdown (35%), ATR% (25%). ≥70 low risk.</p>
                              <p className="text-[11px] text-slate-200 leading-relaxed mt-1"><span className="text-rose-300 font-bold">R/R</span> — (52w High − price) ÷ (price − 52w Low). ≥3 = asymmetric upside.</p>
                              <p className="text-[11px] text-slate-200 leading-relaxed mt-1"><span className="text-rose-300 font-bold">ATR%</span> — average daily range as % of price. &lt;1% calm, &gt;3% volatile — use for position sizing.</p>
                              <p className="text-[11px] text-slate-200 leading-relaxed mt-1"><span className="text-rose-300 font-bold">Beta</span> — sensitivity to market. &lt;0.8 defensive, &gt;1.3 amplified market moves.</p>
                            </div>
                          </span>
                        </div>
                      </th>
                      {/* P&L: 1 col */}
                      <th colSpan={1} className="px-3 pt-2 pb-1 text-right border-l border-slate-700/50">
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-green-400">P&L</span>
                          <span className="group relative cursor-default">
                            <span className="text-green-400/60 text-[10px] font-bold">ⓘ</span>
                            <div className="absolute right-0 top-5 z-50 hidden group-hover:block w-52 bg-slate-900 border border-slate-600 rounded-lg p-2.5 text-left shadow-xl">
                              <p className="text-[11px] text-slate-200 leading-relaxed"><span className="text-green-300 font-bold">Profit</span> — total unrealized + realized P&L for this position in CAD.</p>
                            </div>
                          </span>
                        </div>
                      </th>
                    </tr>
                    {/* Column header row */}
                    <tr className="border-b border-slate-600/50">
                      {/* Identity */}
                      <th className="px-3 py-2 text-left text-xs font-bold text-slate-300 uppercase">Symbol</th>
                      <th className="px-3 py-2 text-right text-xs font-bold text-slate-300 uppercase">Price</th>
                      {/* Verdict */}
                      <th className="px-3 py-2 text-center text-xs font-bold text-green-300 uppercase border-l border-slate-700/50">Buy</th>
                      <th className="px-3 py-2 text-center text-xs font-bold text-red-300 uppercase">Sell</th>
                      {/* Trend */}
                      <th className="px-3 py-2 text-right text-xs font-bold text-slate-300 uppercase border-l border-slate-700/50">vs 200MA</th>
                      <th className="px-3 py-2 text-right text-xs font-bold text-slate-300 uppercase">vs 50MA</th>
                      <th className="px-3 py-2 text-right text-xs font-bold text-slate-300 uppercase">vs 20MA</th>
                      <th className="px-3 py-2 text-right text-xs font-bold text-slate-300 uppercase">ADX</th>
                      {/* Momentum */}
                      <th className="px-3 py-2 text-right text-xs font-bold text-slate-300 uppercase border-l border-slate-700/50">RSI</th>
                      <th className="px-3 py-2 text-right text-xs font-bold text-blue-300 uppercase outline outline-1 outline-blue-500/50">Mom 20d</th>
                      <th className="px-3 py-2 text-center text-xs font-bold text-blue-300 uppercase outline outline-1 outline-blue-500/50">MACD</th>
                      <th className="px-3 py-2 text-right text-xs font-bold text-slate-300 uppercase">Mom 1y</th>
                      <th className="px-3 py-2 text-right text-xs font-bold text-slate-300 uppercase">RS/SPY</th>
                      {/* Range */}
                      <th className="px-3 py-2 text-right text-xs font-bold text-slate-300 uppercase border-l border-slate-700/50">vs 52w Hi</th>
                      <th className="px-3 py-2 text-right text-xs font-bold text-slate-300 uppercase">vs 52w Lo</th>
                      <th className="px-3 py-2 text-right text-xs font-bold text-slate-300 uppercase">Boll %B</th>
                      {/* Activity */}
                      <th className="px-3 py-2 text-right text-xs font-bold text-blue-300 uppercase border-l border-slate-700/50 outline outline-1 outline-blue-500/50">CMF</th>
                      <th className="px-3 py-2 text-right text-xs font-bold text-slate-300 uppercase">Volatility</th>
                      <th className="px-3 py-2 text-right text-xs font-bold text-slate-300 uppercase">Vol Ratio</th>
                      {/* Risk */}
                      <th className="px-3 py-2 text-right text-xs font-bold text-slate-300 uppercase border-l border-slate-700/50">Safety</th>
                      <th className="px-3 py-2 text-right text-xs font-bold text-slate-300 uppercase">R/R</th>
                      <th className="px-3 py-2 text-right text-xs font-bold text-slate-300 uppercase">ATR%</th>
                      <th className="px-3 py-2 text-right text-xs font-bold text-slate-300 uppercase">Beta</th>
                      {/* P&L */}
                      <th className="px-3 py-2 text-right text-xs font-bold text-slate-300 uppercase border-l border-slate-700/50">Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      // ── colour helpers ───────────────────────────────────
                      const getRSIColor = (rsi: number | undefined) => {
                        if (!rsi) return 'text-slate-400';
                        if (rsi < 30) return 'text-green-400';
                        if (rsi > 70) return 'text-red-400';
                        return 'text-yellow-400';
                      };
                      const getMomentumColor = (mom: number | undefined) => {
                        if (mom === undefined) return 'text-slate-400';
                        if (mom > 5) return 'text-green-400';
                        if (mom < -5) return 'text-red-400';
                        return 'text-yellow-400';
                      };
                      const getMAColor = (distanceStr: string | undefined) => {
                        if (!distanceStr) return 'text-slate-400';
                        const d = parseFloat(distanceStr);
                        if (d < -10) return 'text-green-400';
                        if (d > 15) return 'text-red-400';
                        return 'text-yellow-400';
                      };
                      const getBuyScoreStyle = (score: number | null) => {
                        if (score == null) return 'text-slate-500';
                        if (score >= 75) return 'text-emerald-400 font-black';
                        if (score >= 60) return 'text-green-400 font-bold';
                        if (score >= 45) return 'text-yellow-400 font-semibold';
                        if (score >= 30) return 'text-orange-400 font-semibold';
                        return 'text-red-400 font-semibold';
                      };
                      const getSellScoreStyle = (score: number | null) => {
                        if (score == null) return 'text-slate-500';
                        if (score >= 75) return 'text-red-400 font-black';
                        if (score >= 60) return 'text-orange-400 font-bold';
                        if (score >= 45) return 'text-yellow-400 font-semibold';
                        if (score >= 30) return 'text-green-400 font-semibold';
                        return 'text-emerald-400 font-semibold';
                      };
                      const getVolatilityColor = (vol: number | undefined) => {
                        if (vol === undefined) return 'text-slate-400';
                        if (vol < 20) return 'text-green-400';
                        if (vol > 40) return 'text-red-400';
                        return 'text-yellow-400';
                      };
                      const get52wRangeColor = (distHigh: number | undefined, distLow: number | undefined) => {
                        if (distHigh === undefined || distLow === undefined) return 'text-slate-400';
                        if (distHigh > -5) return 'text-red-400';
                        if (distLow < 10) return 'text-green-400';
                        return 'text-yellow-400';
                      };
                      const getVolumeColor = (trend: number | undefined) => {
                        if (trend === undefined) return 'text-slate-400';
                        if (trend > 50) return 'text-green-400';
                        if (trend < -50) return 'text-red-400';
                        return 'text-yellow-400';
                      };
                      const getADXColor = (adx: number | null | undefined) => {
                        if (adx == null) return 'text-slate-400';
                        if (adx < 20) return 'text-slate-400';
                        if (adx >= 40) return 'text-green-400';
                        return 'text-yellow-400';
                      };
                      const getBollingerColor = (b: number | null | undefined) => {
                        if (b == null) return 'text-slate-400';
                        if (b < 0.2) return 'text-green-400';
                        if (b > 0.8) return 'text-red-400';
                        return 'text-yellow-400';
                      };
                      const getSafetyColor = (s: number | null | undefined) => {
                        if (s == null) return 'text-slate-400';
                        if (s >= 70) return 'text-green-400';
                        if (s >= 50) return 'text-yellow-400';
                        if (s >= 30) return 'text-orange-400';
                        return 'text-red-400';
                      };
                      const getRRColor = (rr: number | null | undefined) => {
                        if (rr == null) return 'text-slate-400';
                        if (rr >= 3)    return 'text-emerald-400';
                        if (rr >= 2)    return 'text-green-400';
                        if (rr >= 1)    return 'text-yellow-400';
                        if (rr >= 0.5)  return 'text-orange-400';
                        return 'text-red-400';
                      };

                      // ── grouping ─────────────────────────────────────────
                      type GroupId = 0 | 1 | 2 | 3 | 4 | 5;
                      const GROUP_META: { label: string; scoreLabel: string; textColor: string; bgColor: string; borderColor: string }[] = [
                        { label: 'Strong Buy',     scoreLabel: 'Buy ≥ 70',             textColor: 'text-emerald-300', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/40' },
                        { label: 'Strong Sell',    scoreLabel: 'Sell ≥ 70',            textColor: 'text-red-300',     bgColor: 'bg-red-500/10',     borderColor: 'border-red-500/40'     },
                        { label: 'Moderate Buy',   scoreLabel: 'Buy 45–69',            textColor: 'text-green-300',   bgColor: 'bg-green-500/8',    borderColor: 'border-green-600/30'   },
                        { label: 'Moderate Sell',  scoreLabel: 'Sell 45–69', textColor: 'text-orange-300', bgColor: 'bg-orange-500/8',   borderColor: 'border-orange-500/30'  },
                        { label: 'Hold',           scoreLabel: 'Holding · no signal',  textColor: 'text-sky-300',     bgColor: 'bg-sky-500/10',     borderColor: 'border-sky-500/30'     },
                        { label: 'Watch',          scoreLabel: 'Not held · no signal', textColor: 'text-slate-400',   bgColor: 'bg-slate-700/10',   borderColor: 'border-slate-600/30'   },
                      ];

                      const getGroupId = (rec: TimingRecommendation): GroupId => {
                        const isHolding = (holdingsData?.holdingsMap?.[rec.symbol]?.shares ?? 0) >= 0.01;
                        // No data — always Watch, never Hold
                        if (rec.buyScore == null || rec.sellScore == null) return 5;
                        const b = rec.buyScore;
                        const s = rec.sellScore;
                        // Strong signals always override
                        if (b >= 70) return 0;
                        if (s >= 70) return 1;
                        if (isHolding) {
                          // Owned: only surface as Moderate Buy/Sell when one score clearly
                          // dominates (≥15pt gap AND ≥55) — otherwise signals are too mixed to act
                          if (b >= 55 && b - s >= 15) return 2;
                          if (s >= 55 && s - b >= 15) return 3;
                          return 4; // Hold — signals balanced or weak, sit tight
                        }
                        // Not owned
                        if (b >= 45 && b > s) return 2;
                        if (s >= 45) return 3;
                        return 5;
                      };

                      // Sort: by group first, then by dominant score descending within group
                      const sorted = [...recsData.recommendations].sort((a: TimingRecommendation, b: TimingRecommendation) => {
                        const ga = getGroupId(a);
                        const gb = getGroupId(b);
                        if (ga !== gb) return ga - gb;
                        // Within buy groups sort by buyScore, sell groups by sellScore, neutral by max
                        const scoreA = (ga === 0 || ga === 2) ? (a.buyScore ?? 0) : (ga === 1 || ga === 3) ? (a.sellScore ?? 0) : Math.max(a.buyScore ?? 0, a.sellScore ?? 0);
                        const scoreB = (gb === 0 || gb === 2) ? (b.buyScore ?? 0) : (gb === 1 || gb === 3) ? (b.sellScore ?? 0) : Math.max(b.buyScore ?? 0, b.sellScore ?? 0);
                        return scoreB - scoreA;
                      });

                      // ── build flat row list with separator rows ──────────
                      const rows: React.ReactNode[] = [];
                      let lastGroup: GroupId | null = null;

                      sorted.forEach((rec: TimingRecommendation) => {
                        const gid = getGroupId(rec);
                        if (gid !== lastGroup) {
                          lastGroup = gid;
                          const g = GROUP_META[gid];
                          rows.push(
                            <tr key={`sep-${gid}`}>
                              <td colSpan={18} className={`px-4 py-1.5 ${g.bgColor} border-y ${g.borderColor}`}>
                                <div className="flex items-center gap-2">
                                  <span className={`text-[11px] font-black uppercase tracking-widest ${g.textColor}`}>{g.label}</span>
                                  <span className="text-[10px] text-slate-500">{g.scoreLabel}</span>
                                </div>
                              </td>
                            </tr>
                          );
                        }

                        rows.push(
                          <tr
                            key={rec.symbol}
                            className={`border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors ${
                              (() => {
                                const ind = rec.indicators;
                                const reversal    = ind?.momentum5 != null && ind?.momentum20 != null && ind.momentum5 > 0 && ind.momentum20 < 0;
                                const accumStrong = (ind?.cmf ?? -1) >= 0.10;
                                const accumWeak   = (ind?.cmf ?? -1) > 0;
                                const bullish     = ind?.macdBullish === true;
                                const d200        = parseFloat(ind?.distanceFromMA200 ?? '0');
                                const isExtended  = d200 > 20;
                                const isStrong    = reversal && accumStrong && bullish;
                                const isModerate  = (reversal && bullish && accumWeak) || (reversal && accumStrong);
                                const mom5v       = ind?.momentum5 ?? null;
                                const mom20v      = ind?.momentum20 ?? null;
                                const isRecovery  = !reversal && mom5v != null && mom20v != null && mom5v > 0 && mom20v > 0 && mom20v < 8 && d200 < 0 && bullish && accumWeak;
                                const adxV        = ind?.adx ?? 0;
                                const accumTrend  = (ind?.cmf ?? -1) > -0.05;
                                const isTrend     = !reversal && !isRecovery && mom20v != null && mom20v > 0 && bullish && adxV > 15 && d200 >= 0 && d200 <= 30 && accumTrend;
                                const dip         = ind?.distanceFromHigh ?? 0;
                                const safety      = ind?.safetyScore ?? 0;
                                const isPrime     = !reversal && !isRecovery && !isTrend && safety >= 65 && dip <= -15 && dip >= -50 && d200 >= -20;
                                if (!isStrong && !isModerate && !isRecovery && !isTrend && !isPrime) return '';
                                if (isTrend)    return 'bg-yellow-500/10 border-l-4 border-l-yellow-400';
                                if (isExtended) return 'bg-orange-500/10 border-l-4 border-l-orange-400';
                                if (isStrong)   return 'bg-green-500/15 border-l-4 border-l-green-400';
                                if (isModerate) return 'bg-lime-500/10 border-l-4 border-l-lime-400';
                                if (isPrime)    return 'bg-purple-500/10 border-l-4 border-l-purple-400';
                                return 'bg-blue-500/10 border-l-4 border-l-blue-400';
                              })()
                            }`}
                          >
                            {/* Identity */}
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`w-2 h-2 rounded-full flex-shrink-0 ${(holdingsData?.holdingsMap?.[rec.symbol]?.shares ?? 0) >= 0.01 ? 'bg-green-400' : 'bg-slate-600'}`}
                                  title={(holdingsData?.holdingsMap?.[rec.symbol]?.shares ?? 0) >= 0.01 ? 'Currently holding' : 'Not held'}
                                />
                                <div className="font-bold text-white">{rec.symbol}</div>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-right">
                              <div className="text-white font-semibold">
                                ${rec.indicators?.cadPrice?.toFixed(2) || '-'}
                              </div>
                            </td>
                            {/* Verdict */}
                            <td className="px-3 py-3 text-center border-l border-slate-700/30">
                              <span className={`text-base tabular-nums ${getBuyScoreStyle(rec.buyScore)}`}>
                                {rec.buyScore != null ? rec.buyScore : '–'}
                              </span>
                              {(() => {
                                const ind = rec.indicators;
                                const reversal    = ind?.momentum5 != null && ind?.momentum20 != null && ind.momentum5 > 0 && ind.momentum20 < 0;
                                const accumStrong = (ind?.cmf ?? -1) >= 0.10;
                                const accumWeak   = (ind?.cmf ?? -1) > 0;
                                const bullish     = ind?.macdBullish === true;
                                const d200        = parseFloat(ind?.distanceFromMA200 ?? '0');
                                const isExtended  = d200 > 20;
                                const strong  = reversal && accumStrong && bullish;
                                const moderate  = (reversal && bullish && accumWeak) || (reversal && accumStrong);
                                const mom5v2    = ind?.momentum5 ?? null;
                                const mom20v2   = ind?.momentum20 ?? null;
                                const recovery  = !reversal && mom5v2 != null && mom20v2 != null && mom5v2 > 0 && mom20v2 > 0 && mom20v2 < 8 && d200 < 0 && bullish && accumWeak;
                                const adxV2       = ind?.adx ?? 0;
                                const accumTrend2 = (ind?.cmf ?? -1) > -0.05;
                                const trend       = !reversal && !recovery && mom20v2 != null && mom20v2 > 0 && bullish && adxV2 > 15 && d200 >= 0 && d200 <= 30 && accumTrend2;
                                const dip2        = ind?.distanceFromHigh ?? 0;
                                const safety2     = ind?.safetyScore ?? 0;
                                const prime       = !reversal && !recovery && !trend && safety2 >= 65 && dip2 <= -15 && dip2 >= -50 && d200 >= -20;
                                if (!strong && !moderate && !recovery && !trend && !prime) return null;
                                if (trend)      return <div className="text-[9px] font-black text-yellow-400 uppercase tracking-wide leading-none mt-0.5">↑ trend</div>;
                                if (isExtended) return <div className="text-[9px] font-black text-orange-400 uppercase tracking-wide leading-none mt-0.5">↗ extended</div>;
                                if (strong)     return <div className="text-[9px] font-black text-green-400 uppercase tracking-wide leading-none mt-0.5">⚡ entry</div>;
                                if (moderate)   return <div className="text-[9px] font-black text-lime-400 uppercase tracking-wide leading-none mt-0.5">↗ entry</div>;
                                if (prime)      return safety2 >= 60
                                  ? <div className="text-[9px] font-black text-purple-400 uppercase tracking-wide leading-none mt-0.5">★ prime</div>
                                  : <div className="text-[9px] font-black text-purple-300/70 uppercase tracking-wide leading-none mt-0.5">★ prime !</div>;
                                return              <div className="text-[9px] font-black text-blue-400 uppercase tracking-wide leading-none mt-0.5">◎ recovery</div>;
                              })()}
                            </td>
                            <td className="px-3 py-3 text-center">
                              <span className={`text-base tabular-nums ${getSellScoreStyle(rec.sellScore)}`}>
                                {rec.sellScore != null ? rec.sellScore : '–'}
                              </span>
                            </td>
                            {/* Trend */}
                            <td className="px-3 py-3 text-right border-l border-slate-700/30">
                              <div className={`font-semibold ${getMAColor(rec.indicators?.distanceFromMA200)}`}>
                                {rec.indicators?.distanceFromMA200 || '-'}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-right">
                              <div className={`font-semibold ${getMAColor(rec.indicators?.distanceFromMA50)}`}>
                                {rec.indicators?.distanceFromMA50 || '-'}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-right">
                              <div className={`font-semibold ${getMAColor(rec.indicators?.distanceFromMA20)}`}>
                                {rec.indicators?.distanceFromMA20 || '-'}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-right">
                              <div className={`font-semibold ${getADXColor(rec.indicators?.adx)}`}>
                                {rec.indicators?.adx != null ? rec.indicators.adx.toFixed(1) : '-'}
                              </div>
                            </td>
                            {/* Momentum */}
                            <td className="px-3 py-3 text-right border-l border-slate-700/30">
                              <div className={`font-semibold ${getRSIColor(rec.indicators?.rsi)}`}>
                                {rec.indicators?.rsi?.toFixed(1) || '-'}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-right">
                              <div className={`font-semibold ${getMomentumColor(rec.indicators?.momentum20)}`}>
                                {rec.indicators?.momentum20 !== undefined
                                  ? `${rec.indicators.momentum20 > 0 ? '+' : ''}${rec.indicators.momentum20.toFixed(1)}%`
                                  : '-'}
                              </div>
                              {rec.indicators?.momentum5 != null && rec.indicators?.momentum20 != null
                                && rec.indicators.momentum5 > 0 && rec.indicators.momentum20 < 0 && (
                                <div className="text-[9px] font-black text-emerald-400 uppercase tracking-wide leading-none mt-0.5"
                                  title={`5d momentum: +${rec.indicators.momentum5.toFixed(1)}% — reversal signal`}>
                                  ↑ reversal
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-3 text-center">
                              {rec.indicators?.macdBullish == null ? (
                                <span className="text-slate-500 text-xs">-</span>
                              ) : rec.indicators.macdBullish ? (
                                <span className="text-green-400 font-bold text-sm" title={`Histogram: ${rec.indicators.macdHistogram?.toFixed(3)}`}>▲</span>
                              ) : (
                                <span className="text-red-400 font-bold text-sm" title={`Histogram: ${rec.indicators.macdHistogram?.toFixed(3)}`}>▼</span>
                              )}
                            </td>
                            {/* Mom 1y */}
                            <td className="px-3 py-3 text-right">
                              {(() => {
                                const m = rec.indicators?.momentum252;
                                if (m == null) return <div className="font-semibold text-slate-500">-</div>;
                                const color = m >= 20 ? 'text-emerald-400' : m >= 5 ? 'text-green-400' : m >= 0 ? 'text-slate-300' : m >= -15 ? 'text-orange-400' : 'text-red-400';
                                return <div className={`font-semibold ${color}`}>{m > 0 ? '+' : ''}{m.toFixed(1)}%</div>;
                              })()}
                            </td>
                            {/* RS vs SPY */}
                            <td className="px-3 py-3 text-right">
                              {(() => {
                                const rs = rec.indicators?.relativeStrength;
                                if (rs == null) return <div className="font-semibold text-slate-500">-</div>;
                                const color = rs >= 15 ? 'text-emerald-400' : rs >= 5 ? 'text-green-400' : rs >= -5 ? 'text-slate-300' : rs >= -15 ? 'text-orange-400' : 'text-red-400';
                                return <div className={`font-semibold ${color}`}>{rs > 0 ? '+' : ''}{rs.toFixed(1)}%</div>;
                              })()}
                            </td>
                            {/* Range */}
                            <td className="px-3 py-3 text-right border-l border-slate-700/30">
                              <div className={`font-semibold ${get52wRangeColor(rec.indicators?.distanceFromHigh, rec.indicators?.distanceFromLow)}`}>
                                {rec.indicators?.distanceFromHigh !== undefined && rec.indicators?.distanceFromLow !== undefined
                                  ? `${rec.indicators.distanceFromHigh > 0 ? '+' : ''}${rec.indicators.distanceFromHigh.toFixed(0)}%`
                                  : '-'}
                              </div>
                            </td>
                            {/* vs 52w Lo */}
                            <td className="px-3 py-3 text-right">
                              {(() => {
                                const lo = rec.indicators?.distanceFromLow;
                                if (lo == null) return <div className="font-semibold text-slate-500">-</div>;
                                const color = lo <= 10 ? 'text-green-400' : lo <= 30 ? 'text-slate-300' : lo <= 60 ? 'text-orange-300' : 'text-red-400';
                                return <div className={`font-semibold ${color}`}>+{lo.toFixed(0)}%</div>;
                              })()}
                            </td>
                            <td className="px-3 py-3 text-right">
                              <div className={`font-semibold ${getBollingerColor(rec.indicators?.bollingerB)}`}>
                                {rec.indicators?.bollingerB != null
                                  ? rec.indicators.bollingerB.toFixed(2)
                                  : '-'}
                              </div>
                            </td>
                            {/* Activity */}
                            <td className="px-3 py-3 text-right border-l border-slate-700/30">
                              {(() => {
                                const c = rec.indicators?.cmf;
                                if (c == null) return <div className="font-semibold text-slate-500">-</div>;
                                const color = c >= 0.25 ? 'text-emerald-400'
                                            : c >= 0.10 ? 'text-green-400'
                                            : c >= 0    ? 'text-slate-300'
                                            : c >= -0.10 ? 'text-orange-400'
                                            : 'text-red-400';
                                const label = c >= 0.10 ? 'accum' : c <= -0.10 ? 'distrib' : null;
                                return (
                                  <div>
                                    <div className={`font-semibold ${color}`}>
                                      {c >= 0 ? '+' : ''}{c.toFixed(2)}
                                    </div>
                                    {label && (
                                      <div className={`text-[9px] font-black uppercase tracking-wide leading-none mt-0.5 ${c > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {label}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="px-3 py-3 text-right">
                              <div className={`font-semibold ${getVolatilityColor(rec.indicators?.volatility)}`}>
                                {rec.indicators?.volatility !== undefined
                                  ? `${rec.indicators.volatility.toFixed(1)}%`
                                  : '-'}
                              </div>
                            </td>
                            {/* Vol Ratio */}
                            <td className="px-3 py-3 text-right">
                              {(() => {
                                const vt = rec.indicators?.volumeTrend;
                                if (vt == null) return <div className="font-semibold text-slate-500">-</div>;
                                const color = vt >= 100 ? 'text-emerald-400' : vt >= 50 ? 'text-green-400' : vt >= -20 ? 'text-slate-300' : 'text-orange-400';
                                return <div className={`font-semibold ${color}`}>{vt > 0 ? '+' : ''}{vt.toFixed(0)}%</div>;
                              })()}
                            </td>
                            {/* Risk */}
                            <td className="px-3 py-3 text-right border-l border-slate-700/30">
                              <div className={`font-semibold ${getSafetyColor(rec.indicators?.safetyScore)}`}>
                                {rec.indicators?.safetyScore != null ? rec.indicators.safetyScore : '-'}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-right">
                              <div className={`font-semibold ${getRRColor(rec.indicators?.riskReward)}`}>
                                {rec.indicators?.riskReward != null ? rec.indicators.riskReward.toFixed(1) + 'x' : '-'}
                              </div>
                            </td>
                            {/* ATR% */}
                            <td className="px-3 py-3 text-right">
                              {(() => {
                                const atr = rec.indicators?.atrPercent;
                                if (atr == null) return <div className="font-semibold text-slate-500">-</div>;
                                const color = atr < 1 ? 'text-green-400' : atr < 2 ? 'text-slate-300' : atr < 3.5 ? 'text-orange-400' : 'text-red-400';
                                return <div className={`font-semibold ${color}`}>{atr.toFixed(2)}%</div>;
                              })()}
                            </td>
                            {/* Beta */}
                            <td className="px-3 py-3 text-right">
                              {(() => {
                                const b = rec.indicators?.beta;
                                if (b == null) return <div className="font-semibold text-slate-500">-</div>;
                                const color = b < 0.8 ? 'text-green-400' : b < 1.2 ? 'text-slate-300' : b < 1.6 ? 'text-orange-400' : 'text-red-400';
                                return <div className={`font-semibold ${color}`}>{b.toFixed(2)}</div>;
                              })()}
                            </td>
                            {/* P&L */}
                            <td className="px-3 py-3 text-right border-l border-slate-700/30">
                              <div className={`font-semibold ${(rec.totalProfit || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {rec.totalProfit !== undefined
                                  ? `${rec.totalProfit >= 0 ? '+' : ''}$${rec.totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                  : '-'}
                              </div>
                            </td>
                          </tr>
                        );
                      });

                      return rows;
                    })()}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>
        ) : selectedView === 'sells' ? (
          // Sells View - Market Correction Strategy
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-red-600/20 to-orange-600/20 backdrop-blur-sm rounded-2xl border border-red-500/30 p-5 shadow-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-red-500/20 p-2.5 rounded-xl border border-red-500/40">
                    <span className="text-2xl">💸</span>
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-white">Market Correction Strategy</h2>
                    <p className="text-red-300/70 text-xs">Assets to sell/trim before potential downturn</p>
                  </div>
                </div>
                <div className="bg-red-500/20 border border-red-500/40 px-3 py-1.5 rounded-xl">
                  <span className="text-red-300 font-black text-base">
                    {sellRecommendations.total} Assets
                  </span>
                </div>
              </div>
            </div>

            {recsLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-red-500 mx-auto mb-4"></div>
                  <p className="text-slate-400 text-lg">Analyzing sell opportunities...</p>
                </div>
              </div>
            ) : sellRecommendations.total === 0 ? (
              <div className="bg-slate-800/30 border border-slate-600/30 rounded-xl p-12 text-center backdrop-blur-sm">
                <p className="text-slate-400 text-xl mb-2">✅ Portfolio looks defensive</p>
                <p className="text-slate-500">No immediate sell recommendations based on correction strategy.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Priority 1 and 2 Side by Side */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Priority 1: Immediate Sells */}
                  {sellRecommendations.priority1.length > 0 && (
                    <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-sm rounded-2xl border border-red-500/40 overflow-hidden shadow-lg">
                      <div className="bg-gradient-to-r from-red-600/30 to-orange-600/30 px-4 py-2.5 border-b border-red-500/30">
                        <h3 className="text-base font-black text-white flex items-center gap-2">
                          <span className="text-lg">🚨</span>
                          Priority 1: Immediate Sells
                        </h3>
                        <p className="text-red-300/70 text-xs mt-0.5">High risk, weak fundamentals, or meme assets</p>
                      </div>
                      <div className="p-3 space-y-2">
                        {sellRecommendations.priority1.map((item: any, index: number) => (
                          <div
                            key={item.symbol}
                            className="bg-slate-800/40 border border-red-500/20 rounded-lg p-2.5 hover:border-red-500/40 transition-all"
                            style={{ animationDelay: `${index * 50}ms` }}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2">
                                <span className="text-base font-black text-white">{item.symbol}</span>
                                <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-red-500/30 border border-red-500/50 text-red-200">
                                  {item.suggestedAction}
                                </span>
                              </div>
                              <div className="text-sm font-bold text-white">
                                ${item.holding.currentValue?.toFixed(2) || '0.00'}
                              </div>
                            </div>
                            <div className="text-xs text-red-300/80 mb-1.5">{item.reason}</div>
                            <div className="flex items-center gap-3 text-xs">
                              <div>
                                <span className="text-slate-400">P&L: </span>
                                <span className={`font-bold ${item.pnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {item.pnlPercent >= 0 ? '+' : ''}{item.pnlPercent.toFixed(1)}%
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400">Price: </span>
                                <span className="font-semibold text-white">
                                  ${item.indicators?.cadPrice?.toFixed(2) || item.indicators?.currentPrice?.toFixed(2) || '-'}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400">Shares: </span>
                                <span className="font-semibold text-white">
                                  {item.holding.shares?.toFixed(4) || '-'}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Priority 2: Trim/Reduce */}
                  {sellRecommendations.priority2.length > 0 && (
                    <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-sm rounded-2xl border border-orange-500/40 overflow-hidden shadow-lg">
                      <div className="bg-gradient-to-r from-orange-600/30 to-yellow-600/30 px-4 py-2.5 border-b border-orange-500/30">
                        <h3 className="text-base font-black text-white flex items-center gap-2">
                          <span className="text-lg">⚠️</span>
                          Priority 2: Trim / Reduce
                        </h3>
                        <p className="text-orange-300/70 text-xs mt-0.5">Take profits or reduce high-risk exposure</p>
                      </div>
                      <div className="p-3 space-y-2">
                        {sellRecommendations.priority2.map((item: any, index: number) => (
                          <div
                            key={item.symbol}
                            className="bg-slate-800/40 border border-orange-500/20 rounded-lg p-2.5 hover:border-orange-500/40 transition-all"
                            style={{ animationDelay: `${index * 50}ms` }}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2">
                                <span className="text-base font-black text-white">{item.symbol}</span>
                                <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-orange-500/30 border border-orange-500/50 text-orange-200">
                                  {item.suggestedAction}
                                </span>
                              </div>
                              <div className="text-sm font-bold text-white">
                                ${item.holding.currentValue?.toFixed(2) || '0.00'}
                              </div>
                            </div>
                            <div className="text-xs text-orange-300/80 mb-1.5">{item.reason}</div>
                            <div className="flex items-center gap-3 text-xs">
                              <div>
                                <span className="text-slate-400">P&L: </span>
                                <span className={`font-bold ${item.pnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {item.pnlPercent >= 0 ? '+' : ''}{item.pnlPercent.toFixed(1)}%
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400">Price: </span>
                                <span className="font-semibold text-white">
                                  ${item.indicators?.cadPrice?.toFixed(2) || item.indicators?.currentPrice?.toFixed(2) || '-'}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400">RSI: </span>
                                <span className={`font-bold ${(item.indicators?.rsi || 0) > 70 ? 'text-red-400' : (item.indicators?.rsi || 0) < 30 ? 'text-green-400' : 'text-yellow-400'}`}>
                                  {item.indicators?.rsi?.toFixed(0) || '-'}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400">Shares: </span>
                                <span className="font-semibold text-white">
                                  {item.holding.shares?.toFixed(4) || '-'}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Strategy Summary */}
                <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-sm rounded-2xl border border-blue-500/30 p-5 shadow-lg">
                  <h3 className="text-lg font-black text-white mb-3 flex items-center gap-2">
                    <span className="text-xl">📋</span>
                    Correction Strategy Summary
                  </h3>
                  <div className="space-y-2 text-sm text-slate-300">
                    <p>• <strong className="text-white">Raise Cash:</strong> Target 20-30% of portfolio in cash for buying opportunities</p>
                    <p>• <strong className="text-white">Quality First:</strong> Hold defensive positions (VOO, XEQT, healthcare, energy)</p>
                    <p>• <strong className="text-white">Re-Deploy on Dips:</strong> Buy quality tech (GOOGL, META, AMD) at 15-25% discounts</p>
                    <p>• <strong className="text-white">Precious Metals:</strong> Consider adding GLD/SLV as hedges</p>
                  </div>
                </div>
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
