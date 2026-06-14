import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Target, Award, AlertTriangle, PieChart, Heart, Calendar, ShieldAlert, Wallet, Save, FolderOpen, Trash2, CheckCircle, XCircle, Clock, Activity } from 'lucide-react';
import FrameworkAllocationView from '../components/FrameworkAllocationView';
import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend
} from 'recharts';

interface Trade {
  symbol: string;
  date: string;
  action: 'buy' | 'sell';
  quantity: number;
  price: number;
  total: number;
  type: 's' | 'c';
}

interface Position {
  symbol: string;
  shares: number;
  averageCost: number;
  totalCost: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  realizedPnL: number;
  totalPnL: number;
  firstBuyDate?: string;
  firstBuyPrice?: number;
  holdingDays?: number;
  sector?: string;
  type?: string;
}

interface WinLossStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  averageGain: number;
  averageLoss: number;
  totalRealized: number;
  bestTrade: { symbol: string; profit: number } | null;
  worstTrade: { symbol: string; profit: number } | null;
}

interface SectorPerformance {
  sector: string;
  totalValue: number;
  totalCost: number;
  unrealizedPnL: number;
  realizedPnL: number;
  totalPnL: number;
  positions: number;
  winners: number;
  losers: number;
  winRate: number;
  percentOfPortfolio: number;
}

interface SubsectorPerf {
  subsector: string;
  totalValue: number;
  totalCost: number;
  portfolioPct: number;
  pnlPct: number;
  totalPnL: number;
  momentum5: number | null;
  momentum20: number | null;
  positionCount: number;
  symbols: string[];
}

interface TaxLossHarvesting {
  candidates: Array<{
    symbol: string;
    shares: number;
    unrealizedLoss: number;
    costBasis: number;
    currentValue: number;
    potentialTaxSavings: number;
  }>;
  totalLosses: number;
  totalTaxSavings: number;
  count: number;
}

interface PortfolioHealth {
  totalPositions: number;
  totalValue: number;
  totalCost: number;
  totalUnrealized: number;
  totalRealized: number;
  overallReturn: number;
  unrealizedToRealizedRatio: number;
  diversificationScore: number;
  deadMoneyCount: number;
  concentrationRisk: number;
  largestPosition: {
    percent: number;
    symbol: string;
  };
}

interface TimeBasedInsights {
  monthlyData: Array<{
    month: string;
    buys: number;
    sells: number;
    buyValue: number;
    sellValue: number;
    netInvested: number;
  }>;
  bestMonth: any;
  worstMonth: any;
  recentActivity: {
    trades: number;
    buys: number;
    sells: number;
  };
  totalTradingDays: number;
}

interface RecurringInvestment {
  symbol: string;
  name: string;
  currentValue: number;
  totalInvested: number;
}

interface RebalancingStrategy {
  id: string;
  name: string;
  description: string;
  adjustments: {[symbol: string]: number};
  createdAt: string;
  updatedAt: string;
}

interface AccountPlacement {
  symbol: string;
  exchange: 'TSX' | 'NYSE' | 'Crypto';
  currentAccount: 'TFSA' | 'RRSP' | 'FHSA' | 'Non-Reg';
  recommendedAccount: 'TFSA' | 'RRSP' | 'Non-Reg';
  reason: string;
  status: 'ok' | 'suboptimal' | 'misplaced';
  shares: number;
  marketValue: number;
  dividendYield: number | null;
}

interface RebalancingRecommendation {
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
    sma200?: number;
    sma50?: number;
    sma20?: number;
    rsi?: number;
    momentum5?: number;
    momentum20?: number;
    momentum50?: number;
    aboveMA200?: boolean;
    distanceFromMA200?: string;
  };
  reasons: string[];
}

const Insights: React.FC = () => {
  const [positions, setPositions] = useState<Position[]>([]);
  const [winLossStats, setWinLossStats] = useState<WinLossStats | null>(null);
  const [sectorPerformance, setSectorPerformance] = useState<SectorPerformance[]>([]);
  const [taxLossHarvesting, setTaxLossHarvesting] = useState<TaxLossHarvesting | null>(null);
  const [portfolioHealth, setPortfolioHealth] = useState<PortfolioHealth | null>(null);
  const [timeBasedInsights, setTimeBasedInsights] = useState<TimeBasedInsights | null>(null);
  const [recurringInvestments, setRecurringInvestments] = useState<RecurringInvestment[]>([]);
  const [accountPlacements, setAccountPlacements] = useState<AccountPlacement[]>([]);
  const [hideInactivePlacements, setHideInactivePlacements] = useState(true);
  const [loading, setLoading] = useState(true);
  const [symbolSubsectors, setSymbolSubsectors] = useState<Record<string, string[]>>({});
  const [symbolMomentum, setSymbolMomentum] = useState<Record<string, number>>({});
  const [symbolMomentum5, setSymbolMomentum5] = useState<Record<string, number>>({});
  const [loadingMomentum, setLoadingMomentum] = useState(false);
  const [subsectorSort, setSubsectorSort] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'totalValue', dir: 'desc' });

  // State for portfolio rebalancing simulator
  const [adjustments, setAdjustments] = useState<{[symbol: string]: number}>({});
  const [showAdjustments, setShowAdjustments] = useState(false);
  const [searchSymbol, setSearchSymbol] = useState('');

  // State for saved strategies
  const [savedStrategies, setSavedStrategies] = useState<RebalancingStrategy[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [strategyName, setStrategyName] = useState('');
  const [strategyDescription, setStrategyDescription] = useState('');
  const [saveError, setSaveError] = useState('');
  const [selectedStrategyToOverwrite, setSelectedStrategyToOverwrite] = useState<string>('');

  // State for recommendations
  const [recommendations, setRecommendations] = useState<RebalancingRecommendation[]>([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [showRecommendations, setShowRecommendations] = useState(false);

  // State for sector drilldown
  const [selectedSector, setSelectedSector] = useState<string | null>(null);

  useEffect(() => {
    fetchInsightsData();
    fetchSavedStrategies();
    fetchSubsectorData();
  }, []);

  const fetchInsightsData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/portfolio/insights');
      const data = await response.json();
      const fetchedPositions: Position[] = data.positions || [];
      setPositions(fetchedPositions);
      setWinLossStats(data.winLossStats || null);
      setSectorPerformance(data.sectorPerformance || []);
      setTaxLossHarvesting(data.taxLossHarvesting || null);
      setPortfolioHealth(data.portfolioHealth || null);
      setTimeBasedInsights(data.timeBasedInsights || null);
      setRecurringInvestments(data.recurringInvestments || []);
      setAccountPlacements(data.accountPlacements || []);
      // momentum is now fetched from all cached symbols in fetchSubsectorData
    } catch (error) {
      console.error('Error fetching insights:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSubsectorData = async () => {
    try {
      // Fetch subsector mappings from cache
      const cacheRes = await fetch('/api/portfolio/cache/data');
      if (cacheRes.ok) {
        const cacheJson = await cacheRes.json();
        const map: Record<string, string[]> = {};
        for (const [sym, entry] of Object.entries(cacheJson.cache as Record<string, any>)) {
          const sub = entry.subsector;
          if (Array.isArray(sub) && sub.length > 0) map[sym] = sub;
          else if (typeof sub === 'string' && sub) map[sym] = [sub];
        }
        setSymbolSubsectors(map);
        // Fetch momentum for every symbol that has a subsector (all preprocessed assets)
        fetchMomentumData(Object.keys(map));
      }
    } catch (e) {
      console.error('Error fetching subsector data:', e);
    }
  };

  const fetchMomentumData = async (symbols: string[]) => {
    if (symbols.length === 0) return;
    try {
      setLoadingMomentum(true);
      const holdings = symbols.map(sym => ({
        symbol: sym,
        currentInvestment: 0,
        unrealizedPnL: 0,
        realizedPnL: 0,
      }));
      const res = await fetch('/api/rebalancing-recommendations/all-active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holdings }),
      });
      if (res.ok) {
        const data = await res.json();
        const momMap: Record<string, number> = {};
        const mom5Map: Record<string, number> = {};
        for (const rec of (data.recommendations || [])) {
          if (rec.indicators?.momentum20 != null) momMap[rec.symbol] = rec.indicators.momentum20;
          if (rec.indicators?.momentum5 != null) mom5Map[rec.symbol] = rec.indicators.momentum5;
        }
        setSymbolMomentum(momMap);
        setSymbolMomentum5(mom5Map);
      }
    } catch (e) {
      console.error('Error fetching momentum data:', e);
    } finally {
      setLoadingMomentum(false);
    }
  };

  const fetchSavedStrategies = async () => {
    try {
      const response = await fetch('/api/strategies');
      const data = await response.json();
      setSavedStrategies(data);
    } catch (error) {
      console.error('Error fetching saved strategies:', error);
    }
  };

  const saveStrategy = async (forceOverwrite = false) => {
    try {
      setSaveError('');

      if (!strategyName.trim()) {
        setSaveError('Please enter a strategy name');
        return;
      }

      if (Object.keys(adjustments).length === 0) {
        setSaveError('Please make at least one adjustment before saving');
        return;
      }

      // Determine if overwriting
      const overwrite = forceOverwrite || selectedStrategyToOverwrite !== '';
      const existingId = selectedStrategyToOverwrite || null;

      const response = await fetch('/api/strategies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: strategyName,
          description: strategyDescription,
          adjustments: adjustments,
          overwrite: overwrite,
          existingId: existingId
        })
      });

      const responseData = await response.json();

      if (!response.ok) {
        // If name conflict and we have the existing strategy info
        if (response.status === 400 && responseData.existingStrategy) {
          setSaveError(`A strategy named "${strategyName}" already exists. Choose it from the dropdown to overwrite or use a different name.`);
          return;
        }
        setSaveError(responseData.error || 'Failed to save strategy');
        return;
      }

      await fetchSavedStrategies();
      setShowSaveModal(false);
      setStrategyName('');
      setStrategyDescription('');
      setSaveError('');
      setSelectedStrategyToOverwrite('');
    } catch (error) {
      console.error('Error saving strategy:', error);
      setSaveError('Failed to save strategy');
    }
  };

  const loadStrategy = (strategy: RebalancingStrategy) => {
    setAdjustments(strategy.adjustments);
    setShowLoadModal(false);
    setShowAdjustments(true);
  };

  const deleteStrategy = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this strategy?')) {
      return;
    }

    try {
      const response = await fetch(`/api/strategies/${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to delete strategy');
      }

      await fetchSavedStrategies();
    } catch (error) {
      console.error('Error deleting strategy:', error);
      alert('Failed to delete strategy');
    }
  };

  const fetchRecommendations = async () => {
    if (Object.keys(adjustments).length === 0) {
      setRecommendations([]);
      setShowRecommendations(false);
      return;
    }

    try {
      setLoadingRecommendations(true);

      // Build current allocations from positions and recurring investments
      const currentAllocations: {[symbol: string]: number} = {};

      positions.forEach(p => {
        currentAllocations[p.symbol] = p.totalCost;
      });

      recurringInvestments.forEach(r => {
        currentAllocations[r.symbol] = r.totalInvested;
      });

      const response = await fetch('/api/rebalancing-recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          adjustments: adjustments,
          currentAllocations: currentAllocations
        })
      });

      if (!response.ok) {
        throw new Error('Failed to fetch recommendations');
      }

      const data = await response.json();
      setRecommendations(data.recommendations || []);
      setShowRecommendations(true);
    } catch (error) {
      console.error('Error fetching recommendations:', error);
      setRecommendations([]);
    } finally {
      setLoadingRecommendations(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading insights...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Portfolio Insights</h1>
        <p className="text-gray-600">Actionable intelligence to improve your trading decisions</p>
      </div>

      {/* Win/Loss Analysis Section */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
          <Award className="mr-2" />
          Win/Loss Analysis
        </h2>

        {winLossStats ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {/* Win Rate Card */}
            <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-600">Win Rate</p>
                <TrendingUp className="text-green-500" size={20} />
              </div>
              <p className="text-3xl font-bold text-gray-900">
                {winLossStats.winRate.toFixed(1)}%
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {winLossStats.winningTrades} wins / {winLossStats.totalTrades} trades
              </p>
            </div>

            {/* Average Gain Card */}
            <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-600">Avg Gain</p>
                <DollarSign className="text-blue-500" size={20} />
              </div>
              <p className="text-3xl font-bold text-green-600">
                ${winLossStats.averageGain.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-gray-500 mt-1">Per winning trade</p>
            </div>

            {/* Average Loss Card */}
            <div className="bg-white rounded-lg shadow p-6 border-l-4 border-red-500">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-600">Avg Loss</p>
                <TrendingDown className="text-red-500" size={20} />
              </div>
              <p className="text-3xl font-bold text-red-600">
                ${Math.abs(winLossStats.averageLoss).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-gray-500 mt-1">Per losing trade</p>
            </div>

            {/* Total Realized Card */}
            <div className="bg-white rounded-lg shadow p-6 border-l-4 border-purple-500">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-600">Total Realized</p>
                <Target className="text-purple-500" size={20} />
              </div>
              <p className={`text-3xl font-bold ${winLossStats.totalRealized >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${winLossStats.totalRealized.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-gray-500 mt-1">From closed positions</p>
            </div>
          </div>
        ) : (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
            <div className="flex items-center">
              <AlertTriangle className="text-yellow-600 mr-2" />
              <p className="text-yellow-700">No realized trades found. Win/Loss analysis requires closed positions.</p>
            </div>
          </div>
        )}

        {/* Best and Worst Trades */}
        {winLossStats && (winLossStats.bestTrade || winLossStats.worstTrade) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {winLossStats.bestTrade && (
              <div className="bg-green-50 rounded-lg p-6 border border-green-200">
                <h3 className="text-lg font-semibold text-green-900 mb-2 flex items-center">
                  <Award className="mr-2" size={20} />
                  Best Trade
                </h3>
                <p className="text-2xl font-bold text-green-700">{winLossStats.bestTrade.symbol}</p>
                <p className="text-3xl font-bold text-green-600 mt-2">
                  +${winLossStats.bestTrade.profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            )}

            {winLossStats.worstTrade && (
              <div className="bg-red-50 rounded-lg p-6 border border-red-200">
                <h3 className="text-lg font-semibold text-red-900 mb-2 flex items-center">
                  <TrendingDown className="mr-2" size={20} />
                  Worst Trade
                </h3>
                <p className="text-2xl font-bold text-red-700">{winLossStats.worstTrade.symbol}</p>
                <p className="text-3xl font-bold text-red-600 mt-2">
                  ${winLossStats.worstTrade.profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            )}
          </div>
        )}
      </div>


      {/* Portfolio Framework Allocation Section */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
          <Target className="mr-2" />
          Portfolio Framework Allocation
        </h2>
        <p className="text-gray-600 mb-6">Positions mapped to framework roles — Anchor, Supporting, Speculative — with sector targets and sizing compliance</p>

        {(positions.length > 0 || recurringInvestments.length > 0) ? (
          (() => {
            // Combine positions and recurring investments into a unified list
            const allAssets = [
              ...positions.filter(p => p.shares > 0).map(p => ({
                symbol: p.symbol,
                totalCost: p.totalCost,
                currentValue: p.marketValue,
                unrealizedPnL: p.unrealizedPnL,
                isRecurring: false
              })),
              ...recurringInvestments.map(r => ({
                symbol: r.symbol,
                totalCost: r.totalInvested,
                currentValue: r.currentValue,
                unrealizedPnL: r.currentValue - r.totalInvested,
                isRecurring: true
              }))
            ];

            // Apply adjustments to create hypothetical portfolio
            const adjustedAssets = allAssets.map(asset => ({
              ...asset,
              totalCost: adjustments[asset.symbol] !== undefined ? adjustments[asset.symbol] : asset.totalCost
            }));

            // Use adjusted or original assets based on mode
            const assetsToUse = showAdjustments ? adjustedAssets : allAssets;

            // (categories removed — replaced by FrameworkAllocationView)

            // Calculate total invested across all assets for percentage calculation
            const grandTotalInvested = assetsToUse.reduce((sum, a) => sum + a.totalCost, 0);

            const renderCapitalPieChart = (category: any) => {
              const chartData = category.data
                .filter((a: any) => a.totalCost > 0)
                .map((a: any) => ({
                  symbol: a.symbol,
                  value: a.totalCost,
                  currentValue: a.currentValue,
                  pnl: a.unrealizedPnL,
                  isRecurring: a.isRecurring
                }));

              const totalInvested = chartData.reduce((sum: number, d: any) => sum + d.value, 0);
              const percentOfTotal = grandTotalInvested > 0 ? (totalInvested / grandTotalInvested) * 100 : 0;
              const assetPercent = allAssets.length > 0 ? (chartData.length / allAssets.length) * 100 : 0;

              const CustomTooltip = ({ active, payload }: any) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  const percent = (data.value / totalInvested) * 100;
                  return (
                    <div className="bg-white p-3 border border-gray-300 rounded-lg shadow-lg">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-gray-900">{data.symbol}</p>
                        {data.isRecurring && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">DCA</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600">
                        Invested: ${data.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <p className="text-sm text-gray-600">
                        Current: ${data.currentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <p className={`text-sm font-semibold ${data.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        P&L: ${data.pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <p className="text-sm text-gray-600">
                        {percent.toFixed(1)}% of category
                      </p>
                    </div>
                  );
                }
                return null;
              };

              // Generate shades of the base color for each slice
              const generateColorShades = (baseColor: string, count: number) => {
                const colors: string[] = [];
                for (let i = 0; i < count; i++) {
                  const opacity = 0.5 + (i / count) * 0.5; // Range from 0.5 to 1
                  colors.push(`${baseColor}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`);
                }
                return colors;
              };

              const colors = generateColorShades(category.color, chartData.length);

              return (
                <div className="bg-white rounded-lg shadow-lg border border-gray-100 p-6">
                  <div className="text-center mb-4">
                    <h3 className="text-lg font-bold text-gray-900">{category.name}</h3>
                    <p className="text-sm font-semibold text-gray-600 italic">{category.subtitle}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {chartData.length} assets <span className="text-gray-400">({allAssets.length > 0 ? ((chartData.length / allAssets.length) * 100).toFixed(1) : 0}%)</span>
                    </p>
                    <p className="text-xl font-bold text-gray-900 mt-2">
                      ${totalInvested.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      <span className="text-sm text-gray-600 ml-1">({percentOfTotal.toFixed(1)}%)</span>
                    </p>
                    <p className="text-xs text-gray-500">Total Invested</p>
                    {chartData.length > 0 && (() => {
                      const validData = category.data.filter((a: any) => a.totalCost > 0);
                      const avgReturn = validData.length > 0
                        ? validData.reduce((sum: number, a: any) => sum + (a.unrealizedPnL / a.totalCost) * 100, 0) / validData.length
                        : 0;
                      return (
                        <p className={`text-sm font-semibold mt-1 ${avgReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          Avg return: {avgReturn >= 0 ? '+' : ''}{avgReturn.toFixed(1)}%
                        </p>
                      );
                    })()}

                    {/* Target indicators */}
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <div className="flex justify-around text-xs">
                        <div className="text-center">
                          <p className="text-gray-400">Target</p>
                          <p className="font-semibold text-gray-600">{category.targetCapitalPercent}% capital</p>
                          <p className="font-semibold text-gray-600">{category.targetAssetCount} assets</p>
                        </div>
                        <div className="text-center">
                          <p className="text-gray-400">Current</p>
                          <p className={`font-semibold ${Math.abs(percentOfTotal - category.targetCapitalPercent) <= 5 ? 'text-green-600' : 'text-orange-600'}`}>
                            {percentOfTotal.toFixed(1)}% capital
                          </p>
                          <p className={`font-semibold ${Math.abs(chartData.length - category.targetAssetCount) <= 2 ? 'text-green-600' : 'text-orange-600'}`}>
                            {chartData.length} assets
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {chartData.length > 0 ? (
                    <>
                      <ResponsiveContainer width="100%" height={280}>
                        <RechartsPieChart>
                          <Pie
                            data={chartData}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={(entry: any) => {
                              const value = entry.value || 0;
                              const percent = (value / totalInvested) * 100;
                              if (percent < 3) return ''; // Don't show labels for very small slices
                              return entry.symbol;
                            }}
                            style={{ fontSize: '10px' }}
                            outerRadius={65}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {chartData.map((entry: any, index: number) => (
                              <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                            ))}
                          </Pie>
                          <Tooltip content={<CustomTooltip />} />
                        </RechartsPieChart>
                      </ResponsiveContainer>

                      <div className="mt-4 max-h-48 overflow-y-auto">
                        {category.data
                          .sort((a: any, b: any) => b.totalCost - a.totalCost)
                          .map((asset: any) => {
                            const percent = (asset.totalCost / totalInvested) * 100;
                            return (
                              <div key={asset.symbol} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-semibold text-gray-900">{asset.symbol}</p>
                                    {asset.isRecurring && (
                                      <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">DCA</span>
                                    )}
                                  </div>
                                  <p className="text-xs text-gray-500">{percent.toFixed(1)}%</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm text-gray-900">
                                    ${asset.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </p>
                                  <p className={`text-xs font-semibold ${asset.unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {asset.unrealizedPnL >= 0 ? '+' : ''}${asset.unrealizedPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <p className="text-sm">No assets in this range</p>
                    </div>
                  )}
                </div>
              );
            };

            return (
              <>
                {/* Framework Allocation View */}
                <div className="mb-8">
                  {showAdjustments && Object.keys(adjustments).length > 0 && (
                    <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
                      <TrendingUp className="w-4 h-4 flex-shrink-0" />
                      <span>Simulated view — reflecting simulator adjustments below</span>
                    </div>
                  )}
                  <FrameworkAllocationView
                    positions={[
                      ...positions.map(p => {
                        if (showAdjustments && adjustments[p.symbol] !== undefined) {
                          const simulatedCost = adjustments[p.symbol];
                          // Position is effectively zero (dust, sold-out, or negligible) — treat as fresh entry.
                          // Threshold matches FrameworkAllocationView's own heldBySymbol filter (shares > 0.001).
                          if ((p.shares ?? 0) < 0.001 || (p.marketValue ?? 0) < 1) {
                            return {
                              symbol: p.symbol,
                              shares: simulatedCost > 0 ? 1 : 0,
                              marketValue: simulatedCost,
                              totalCost: simulatedCost,
                              sector: p.sector,
                              type: p.type,
                              realizedPnL: p.realizedPnL ?? 0,
                              currentPrice: p.currentPrice,
                              averagePrice: p.averageCost,
                            };
                          }
                          const ratio = p.totalCost > 0 ? simulatedCost / p.totalCost : 0;
                          return {
                            symbol: p.symbol,
                            shares: simulatedCost > 0 ? p.shares : 0,
                            marketValue: p.marketValue * ratio,
                            totalCost: simulatedCost,
                            sector: p.sector,
                            type: p.type,
                            realizedPnL: p.realizedPnL ?? 0,
                            currentPrice: p.currentPrice,
                            averagePrice: p.averageCost,
                          };
                        }
                        return {
                          symbol: p.symbol,
                          shares: p.shares,
                          marketValue: p.marketValue,
                          totalCost: p.totalCost,
                          sector: p.sector,
                          type: p.type,
                          realizedPnL: p.realizedPnL ?? 0,
                          currentPrice: p.currentPrice,
                          averagePrice: p.averageCost,
                        };
                      }),
                      ...(showAdjustments
                        ? Object.entries(adjustments)
                            // Only add synthetic entries for symbols not in positions at all
                            .filter(([sym, amt]) => amt > 0 && !positions.some(p => p.symbol === sym))
                            .map(([sym, amt]) => ({
                              symbol: sym,
                              shares: 1,
                              marketValue: amt,
                              totalCost: amt,
                              sector: undefined as string | undefined,
                              type: 's' as const,
                              realizedPnL: 0,
                            }))
                        : []
                      ),
                    ]}
                    symbolSubsectors={symbolSubsectors}
                    symbolMomentum5={symbolMomentum5}
                    symbolMomentum20={symbolMomentum}
                  />
                </div>

                {/* Portfolio Rebalancing Tool */}
                <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5" />
                        Portfolio Rebalancing Simulator
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        Adjust asset investments to see how targets would change
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowLoadModal(true)}
                        className="px-4 py-2 rounded-lg font-semibold text-sm bg-purple-600 text-white hover:bg-purple-700 transition-colors flex items-center gap-2"
                      >
                        <FolderOpen className="w-4 h-4" />
                        Load Strategy
                      </button>
                      <button
                        onClick={() => setShowAdjustments(!showAdjustments)}
                        className={`px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${
                          showAdjustments
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        {showAdjustments ? 'Hide Simulator' : 'Show Simulator'}
                      </button>
                    </div>
                  </div>

                  {showAdjustments && (
                    <div>
                      <div className="flex items-center justify-between mb-4 pb-4 border-b">
                        <div className="text-sm text-gray-600">
                          <p className="font-semibold">Original Total: <span className="text-gray-900">${allAssets.reduce((sum, a) => sum + a.totalCost, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></p>
                          <p className="font-semibold mt-1">Adjusted Total: <span className={`${grandTotalInvested > allAssets.reduce((sum, a) => sum + a.totalCost, 0) ? 'text-green-600' : grandTotalInvested < allAssets.reduce((sum, a) => sum + a.totalCost, 0) ? 'text-red-600' : 'text-gray-900'}`}>${grandTotalInvested.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={fetchRecommendations}
                            disabled={Object.keys(adjustments).length === 0 || loadingRecommendations}
                            className="px-3 py-1 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-1"
                          >
                            <Activity className="w-4 h-4" />
                            {loadingRecommendations ? 'Analyzing...' : 'Get Recommendations'}
                          </button>
                          <button
                            onClick={() => setShowSaveModal(true)}
                            disabled={Object.keys(adjustments).length === 0}
                            className="px-3 py-1 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-1"
                          >
                            <Save className="w-4 h-4" />
                            Save Strategy
                          </button>
                          <button
                            onClick={() => {
                              setAdjustments({});
                              setSearchSymbol('');
                              setRecommendations([]);
                              setShowRecommendations(false);
                            }}
                            className="px-3 py-1 bg-red-100 text-red-700 rounded-lg text-sm font-semibold hover:bg-red-200"
                          >
                            Reset All
                          </button>
                        </div>
                      </div>

                      {/* Search Bar */}
                      <div className="mb-4">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Search for asset to adjust
                        </label>
                        <input
                          type="text"
                          value={searchSymbol}
                          onChange={(e) => setSearchSymbol(e.target.value.toUpperCase())}
                          placeholder="Type symbol (e.g., AAPL, BTC)..."
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>

                      {/* Assets Grid - Only show adjusted assets or search results */}
                      {(() => {
                        // Include symbols already in adjustments that aren't in the portfolio
                        const extraAdjusted = Object.keys(adjustments)
                          .filter(sym => !allAssets.some(a => a.symbol === sym))
                          .map(sym => ({ symbol: sym, totalCost: 0, currentValue: 0, unrealizedPnL: 0, isRecurring: false as const }));

                        const filteredAssets = [...allAssets, ...extraAdjusted]
                          .filter(asset => {
                            // Show if adjusted OR if matches search
                            const isAdjusted = adjustments[asset.symbol] !== undefined;
                            const matchesSearch = searchSymbol === '' || asset.symbol.toUpperCase().includes(searchSymbol);
                            return isAdjusted || matchesSearch;
                          })
                          .sort((a, b) => {
                            // Sort adjusted items first, then by investment size
                            const aAdjusted = adjustments[a.symbol] !== undefined;
                            const bAdjusted = adjustments[b.symbol] !== undefined;
                            if (aAdjusted && !bAdjusted) return -1;
                            if (!aAdjusted && bAdjusted) return 1;
                            return b.totalCost - a.totalCost;
                          });

                        // Check if the search term is an exact new symbol not in portfolio
                        const isNewSymbol = searchSymbol && !allAssets.some(a => a.symbol === searchSymbol) && !adjustments[searchSymbol];

                        if (filteredAssets.length === 0) {
                          return (
                            <div className="col-span-full text-center py-12 text-gray-500">
                              <p className="text-lg font-semibold mb-2">
                                {searchSymbol ? 'No matching assets found' : 'Search for an asset to start adjusting'}
                              </p>
                              {isNewSymbol ? (
                                <div>
                                  <p className="text-sm mb-4">"{searchSymbol}" is not in your portfolio.</p>
                                  <button
                                    onClick={() => setAdjustments({ ...adjustments, [searchSymbol]: 0 })}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
                                  >
                                    + Add {searchSymbol} to simulation
                                  </button>
                                </div>
                              ) : (
                                <p className="text-sm">
                                  {searchSymbol
                                    ? `No assets match "${searchSymbol}". Try a different symbol.`
                                    : 'Type a symbol in the search box above or adjust an asset to see it here.'}
                                </p>
                              )}
                            </div>
                          );
                        }

                        return (
                          <div>
                            {isNewSymbol && (
                              <div className="mb-3">
                                <button
                                  onClick={() => setAdjustments({ ...adjustments, [searchSymbol]: 0 })}
                                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
                                >
                                  + Add {searchSymbol} to simulation
                                </button>
                              </div>
                            )}
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-96 overflow-y-auto">
                            {filteredAssets.map((asset) => {
                            const isNewEntry = !allAssets.some(a => a.symbol === asset.symbol);
                            const currentValue = adjustments[asset.symbol] !== undefined ? adjustments[asset.symbol] : asset.totalCost;
                            const difference = currentValue - asset.totalCost;

                            return (
                              <div key={asset.symbol} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-gray-900">{asset.symbol}</span>
                                    {isNewEntry && (
                                      <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">New</span>
                                    )}
                                    {!isNewEntry && asset.isRecurring && (
                                      <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">DCA</span>
                                    )}
                                  </div>
                                  {(difference !== 0 || isNewEntry) && (
                                    <button
                                      onClick={() => {
                                        const newAdj = {...adjustments};
                                        delete newAdj[asset.symbol];
                                        setAdjustments(newAdj);
                                      }}
                                      className="text-xs text-red-600 hover:text-red-800"
                                    >
                                      {isNewEntry ? 'Remove' : 'Reset'}
                                    </button>
                                  )}
                                </div>

                                <div className="mb-2">
                                  <label className="text-xs text-gray-600 block mb-1">Invested Amount</label>
                                  <input
                                    type="number"
                                    value={currentValue.toFixed(2)}
                                    onChange={(e) => setAdjustments({
                                      ...adjustments,
                                      [asset.symbol]: parseFloat(e.target.value) || 0
                                    })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    step="100"
                                  />
                                </div>

                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-gray-600">Original: ${asset.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                  {difference !== 0 && (
                                    <span className={`font-semibold ${difference > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                      {difference > 0 ? '+' : ''}${difference.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                          </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>

                {/* Rebalancing Recommendations Section */}
                {showRecommendations && recommendations.length > 0 && (
                  <div className="mt-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg shadow-lg border border-blue-200 p-6">
                    <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <Activity className="w-5 h-5 text-blue-600" />
                      Timing Recommendations for Your Adjustments
                    </h3>
                    <p className="text-sm text-gray-600 mb-6">
                      Based on technical analysis (200-day MA, RSI, momentum), here's when to execute your rebalancing moves:
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {recommendations.map((rec) => {
                        const timingColors = {
                          EXCELLENT: 'bg-green-100 border-green-400 text-green-800',
                          GOOD: 'bg-blue-100 border-blue-400 text-blue-800',
                          NEUTRAL: 'bg-yellow-100 border-yellow-400 text-yellow-800',
                          POOR: 'bg-red-100 border-red-400 text-red-800',
                          INSUFFICIENT_DATA: 'bg-gray-100 border-gray-400 text-gray-800',
                          ERROR: 'bg-gray-100 border-gray-400 text-gray-800'
                        };

                        const timingIcons = {
                          EXCELLENT: <CheckCircle className="w-4 h-4" />,
                          GOOD: <CheckCircle className="w-4 h-4" />,
                          NEUTRAL: <Clock className="w-4 h-4" />,
                          POOR: <XCircle className="w-4 h-4" />,
                          INSUFFICIENT_DATA: <AlertTriangle className="w-4 h-4" />,
                          ERROR: <AlertTriangle className="w-4 h-4" />
                        };

                        return (
                          <div key={rec.symbol} className={`border-l-4 rounded-lg p-3 ${timingColors[rec.timing]} h-full flex flex-col`}>
                            {/* Header */}
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-1.5">
                                {timingIcons[rec.timing]}
                                <h4 className="font-bold text-base">{rec.symbol}</h4>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${rec.action === 'BUY' ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
                                  {rec.action}
                                </span>
                              </div>
                            </div>

                            {/* Timing Badge */}
                            <div className="mb-2">
                              <span className="text-xs font-bold uppercase">{rec.timing}</span>
                              <span className="text-xs text-gray-600 ml-1">({rec.confidence})</span>
                            </div>

                            {/* Numbers */}
                            <div className="grid grid-cols-2 gap-2 mb-2 text-xs">
                              <div>
                                <div className="text-gray-600">Current</div>
                                <div className="font-semibold">${(rec.currentInvestment || 0).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</div>
                              </div>
                              <div>
                                <div className="text-gray-600">Target</div>
                                <div className="font-semibold">${(rec.targetInvestment || 0).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</div>
                              </div>
                            </div>

                            {/* Change Amount */}
                            <div className="mb-2 text-xs">
                              <span className="text-gray-600">Change: </span>
                              <span className={`font-bold ${rec.action === 'BUY' ? 'text-green-700' : 'text-red-700'}`}>
                                {rec.action === 'BUY' ? '+' : '-'}${(rec.amount || 0).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}
                              </span>
                            </div>

                            {/* Recommendation */}
                            <p className="text-xs font-semibold mb-2 flex-grow">{rec.recommendation}</p>

                            {/* Key Factors - Collapsible */}
                            {rec.reasons && rec.reasons.length > 0 && (
                              <details className="mt-auto">
                                <summary className="text-xs font-semibold cursor-pointer hover:text-gray-700 mb-1">
                                  Key Factors ({rec.reasons.length})
                                </summary>
                                <ul className="text-xs space-y-0.5 ml-2 mt-1">
                                  {rec.reasons.map((reason, idx) => (
                                    <li key={idx} className="flex items-start gap-1">
                                      <span className="mt-0.5">•</span>
                                      <span className="leading-tight">{reason}</span>
                                    </li>
                                  ))}
                                </ul>
                              </details>
                            )}

                            {/* Technical Indicators - Collapsible */}
                            {rec.indicators && Object.keys(rec.indicators).length > 0 && (
                              <details className="mt-2">
                                <summary className="text-xs font-semibold cursor-pointer hover:text-gray-700">
                                  Technical Indicators
                                </summary>
                                <div className="mt-1 grid grid-cols-2 gap-1 text-xs">
                                  {rec.indicators?.currentPrice && (
                                    <div className="truncate">
                                      <span className="text-gray-600">Price: </span>
                                      <span className="font-semibold">${rec.indicators.currentPrice.toFixed(2)}</span>
                                    </div>
                                  )}
                                  {rec.indicators?.sma200 && (
                                    <div className="truncate">
                                      <span className="text-gray-600">200MA: </span>
                                      <span className="font-semibold">${rec.indicators.sma200.toFixed(2)}</span>
                                    </div>
                                  )}
                                  {rec.indicators?.rsi && (
                                    <div className="truncate">
                                      <span className="text-gray-600">RSI: </span>
                                      <span className="font-semibold">{rec.indicators.rsi.toFixed(1)}</span>
                                    </div>
                                  )}
                                  {rec.indicators?.momentum20 !== undefined && (
                                    <div className="truncate">
                                      <span className="text-gray-600">Mom: </span>
                                      <span className={`font-semibold ${rec.indicators.momentum20 > 0 ? 'text-green-700' : 'text-red-700'}`}>
                                        {rec.indicators.momentum20.toFixed(1)}%
                                      </span>
                                    </div>
                                  )}
                                  {rec.indicators?.distanceFromMA200 && (
                                    <div className="truncate">
                                      <span className="text-gray-600">vs MA: </span>
                                      <span className="font-semibold">{rec.indicators.distanceFromMA200}</span>
                                    </div>
                                  )}
                                </div>
                              </details>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            );
          })()
        ) : (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
            <div className="flex items-center">
              <AlertTriangle className="text-yellow-600 mr-2" />
              <p className="text-yellow-700">No positions found. Upload portfolio data to see capital distribution.</p>
            </div>
          </div>
        )}
      </div>



      {/* Holding Period Breakdown */}
      {positions.filter(p => p.shares > 0 && p.holdingDays !== undefined).length > 0 && (() => {
        const active = positions.filter(p => p.shares > 0 && p.holdingDays !== undefined);
        const groups = [
          { label: 'Short Term', sublabel: '< 3 months', filter: (p: Position) => (p.holdingDays ?? 0) < 90, color: 'border-blue-400' },
          { label: 'Medium Term', sublabel: '3 – 12 months', filter: (p: Position) => (p.holdingDays ?? 0) >= 90 && (p.holdingDays ?? 0) < 365, color: 'border-yellow-400' },
          { label: 'Long Term', sublabel: '> 1 year', filter: (p: Position) => (p.holdingDays ?? 0) >= 365, color: 'border-green-400' },
        ].map(g => {
          const members = active.filter(g.filter);
          const totalValue = members.reduce((s, p) => s + p.marketValue, 0);
          const avgReturn = members.length > 0
            ? members.reduce((s, p) => s + p.unrealizedPnLPercent, 0) / members.length
            : 0;
          return { ...g, members, totalValue, avgReturn };
        });
        return (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
              <Calendar className="mr-2" />
              Holding Period Breakdown
            </h2>
            <p className="text-gray-600 mb-6">Performance grouped by how long you've held each position</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {groups.map((g, i) => (
                <div key={i} className={`bg-white rounded-lg shadow-lg border-l-4 ${g.color} p-6`}>
                  <h3 className="text-lg font-bold text-gray-900">{g.label}</h3>
                  <p className="text-sm text-gray-500 mb-4">{g.sublabel}</p>
                  <div className="flex justify-between mb-4">
                    <div>
                      <p className="text-2xl font-bold text-gray-900">{g.members.length}</p>
                      <p className="text-xs text-gray-500">positions</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-gray-900">
                        ${g.totalValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </p>
                      <p className="text-xs text-gray-500">market value</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-2xl font-bold ${g.avgReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {g.avgReturn >= 0 ? '+' : ''}{g.avgReturn.toFixed(1)}%
                      </p>
                      <p className="text-xs text-gray-500">avg return</p>
                    </div>
                  </div>
                  {g.members.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {g.members.map(p => (
                        <span key={p.symbol} className={`text-xs px-2 py-0.5 rounded font-semibold ${p.unrealizedPnLPercent >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {p.symbol}
                        </span>
                      ))}
                    </div>
                  )}
                  {g.members.length === 0 && (
                    <p className="text-xs text-gray-400 italic">No positions in this range</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Diversification Section */}
      {sectorPerformance.length > 0 && (() => {
        const SECTOR_COLORS: Record<string, string> = {
          'Tech': '#3B82F6',
          'Consumer Cyclical': '#10B981',
          'Industrials': '#F59E0B',
          'Healthcare': '#EF4444',
          'Financial Services': '#8B5CF6',
          'Utilities': '#06B6D4',
          'Energy': '#F97316',
          'Materials': '#84CC16',
          'Real Estate': '#EC4899',
          'Telecommunications': '#6366F1',
          'ETF': '#9333EA',
          'ETF - Index Fund': '#9333EA',
          'Cryptocurrency': '#FBBF24',
          'Alternative Investments': '#a78bfa',
          'Unknown': '#9CA3AF',
        };

        const getWeightLabel = (pct: number): { label: string; color: string; bg: string } => {
          if (pct > 35) return { label: 'Concentrated', color: 'text-red-700', bg: 'bg-red-100' };
          if (pct > 20) return { label: 'Heavy', color: 'text-yellow-700', bg: 'bg-yellow-100' };
          if (pct >= 5) return { label: 'Healthy', color: 'text-green-700', bg: 'bg-green-100' };
          return { label: 'Thin', color: 'text-gray-600', bg: 'bg-gray-100' };
        };

        const totalCostAll = sectorPerformance.reduce((sum, s) => sum + s.totalCost, 0);

        // Count only real active positions (not ghost/sold entries with 0 cost)
        const activeCountBySector = positions.reduce((acc, p) => {
          if (p.totalCost > 0 && p.shares > 0.001 && p.sector) {
            acc[p.sector] = (acc[p.sector] || 0) + 1;
          }
          return acc;
        }, {} as Record<string, number>);
        const pctOf = (sector: string) => {
          const s = sectorPerformance.find(x => x.sector === sector);
          return totalCostAll > 0 && s ? (s.totalCost / totalCostAll) * 100 : 0;
        };

        const techPct = pctOf('Tech');
        const cryptoPct = pctOf('Cryptocurrency');
        const altPct = pctOf('Alternative Investments');
        const etfPct = pctOf('ETF') + pctOf('ETF - Index Fund');
        const techCorrelated = techPct + cryptoPct + altPct;

        const prioritySectors = ['Healthcare', 'Financial Services', 'Industrials', 'Utilities', 'Real Estate'];
        const presentSectors = new Set(sectorPerformance.map(s => s.sector));

        const suggestions: string[] = [];
        if (techCorrelated > 50) suggestions.push(`⚠️ Tech-correlated exposure (Tech + Crypto + Alts) is ${techCorrelated.toFixed(1)}% — these sectors move together in risk-off events`);
        sectorPerformance
          .filter(s => !['ETF', 'ETF - Index Fund', 'Cryptocurrency'].includes(s.sector))
          .filter(s => totalCostAll > 0 && (s.totalCost / totalCostAll) * 100 > 35)
          .forEach(s => suggestions.push(`⚠️ ${s.sector} is concentrated at ${((s.totalCost / totalCostAll) * 100).toFixed(1)}% — consider trimming or diversifying into other sectors`));
        prioritySectors
          .filter(s => !presentSectors.has(s))
          .slice(0, 2)
          .forEach(s => suggestions.push(`➕ No ${s} exposure — consider adding for defensiveness and lower correlation`));
        if (etfPct < 20) suggestions.push(`📊 ETF/Index coverage is ${etfPct.toFixed(1)}% — index funds smooth sector-specific volatility`);
        if (portfolioHealth && portfolioHealth.concentrationRisk > 50) suggestions.push(`⚠️ Top 5 positions hold ${portfolioHealth.concentrationRisk}% of portfolio — single-stock concentration risk is elevated`);

        const chartData = sectorPerformance
          .filter(s => s.totalCost > 0)
          .map(s => ({ name: s.sector, value: s.totalCost }))
          .sort((a, b) => b.value - a.value);

        // Approximate historical sector correlations (symmetric)
        const CORR: Record<string, Record<string, number>> = {
          'Tech':                 { 'Tech':1.00,'Cryptocurrency':0.72,'Consumer Cyclical':0.65,'Healthcare':0.35,'Energy':0.15,'Materials':0.30,'Industrials':0.55,'Financial Services':0.45,'Utilities':0.10,'Index Fund':0.88,'Alternative Investments':0.65,'Telecommunications':0.60 },
          'Cryptocurrency':       { 'Tech':0.72,'Cryptocurrency':1.00,'Consumer Cyclical':0.50,'Healthcare':0.20,'Energy':0.25,'Materials':0.35,'Industrials':0.40,'Financial Services':0.35,'Utilities':0.05,'Index Fund':0.65,'Alternative Investments':0.75,'Telecommunications':0.45 },
          'Consumer Cyclical':    { 'Tech':0.65,'Cryptocurrency':0.50,'Consumer Cyclical':1.00,'Healthcare':0.35,'Energy':0.30,'Materials':0.40,'Industrials':0.60,'Financial Services':0.55,'Utilities':0.15,'Index Fund':0.80,'Alternative Investments':0.45,'Telecommunications':0.50 },
          'Healthcare':           { 'Tech':0.35,'Cryptocurrency':0.20,'Consumer Cyclical':0.35,'Healthcare':1.00,'Energy':0.10,'Materials':0.25,'Industrials':0.40,'Financial Services':0.30,'Utilities':0.30,'Index Fund':0.55,'Alternative Investments':0.20,'Telecommunications':0.30 },
          'Energy':               { 'Tech':0.15,'Cryptocurrency':0.25,'Consumer Cyclical':0.30,'Healthcare':0.10,'Energy':1.00,'Materials':0.60,'Industrials':0.45,'Financial Services':0.30,'Utilities':0.35,'Index Fund':0.35,'Alternative Investments':0.30,'Telecommunications':0.20 },
          'Materials':            { 'Tech':0.30,'Cryptocurrency':0.35,'Consumer Cyclical':0.40,'Healthcare':0.25,'Energy':0.60,'Materials':1.00,'Industrials':0.55,'Financial Services':0.35,'Utilities':0.30,'Index Fund':0.50,'Alternative Investments':0.40,'Telecommunications':0.30 },
          'Industrials':          { 'Tech':0.55,'Cryptocurrency':0.40,'Consumer Cyclical':0.60,'Healthcare':0.40,'Energy':0.45,'Materials':0.55,'Industrials':1.00,'Financial Services':0.55,'Utilities':0.35,'Index Fund':0.75,'Alternative Investments':0.45,'Telecommunications':0.55 },
          'Financial Services':   { 'Tech':0.45,'Cryptocurrency':0.35,'Consumer Cyclical':0.55,'Healthcare':0.30,'Energy':0.30,'Materials':0.35,'Industrials':0.55,'Financial Services':1.00,'Utilities':0.30,'Index Fund':0.70,'Alternative Investments':0.40,'Telecommunications':0.40 },
          'Utilities':            { 'Tech':0.10,'Cryptocurrency':0.05,'Consumer Cyclical':0.15,'Healthcare':0.30,'Energy':0.35,'Materials':0.30,'Industrials':0.35,'Financial Services':0.30,'Utilities':1.00,'Index Fund':0.35,'Alternative Investments':0.10,'Telecommunications':0.25 },
          'Index Fund':           { 'Tech':0.88,'Cryptocurrency':0.65,'Consumer Cyclical':0.80,'Healthcare':0.55,'Energy':0.35,'Materials':0.50,'Industrials':0.75,'Financial Services':0.70,'Utilities':0.35,'Index Fund':1.00,'Alternative Investments':0.60,'Telecommunications':0.65 },
          'Alternative Investments':{ 'Tech':0.65,'Cryptocurrency':0.75,'Consumer Cyclical':0.45,'Healthcare':0.20,'Energy':0.30,'Materials':0.40,'Industrials':0.45,'Financial Services':0.40,'Utilities':0.10,'Index Fund':0.60,'Alternative Investments':1.00,'Telecommunications':0.40 },
          'Telecommunications':   { 'Tech':0.60,'Cryptocurrency':0.45,'Consumer Cyclical':0.50,'Healthcare':0.30,'Energy':0.20,'Materials':0.30,'Industrials':0.55,'Financial Services':0.40,'Utilities':0.25,'Index Fund':0.65,'Alternative Investments':0.40,'Telecommunications':1.00 },
        };

        const corrSectors = chartData.map(d => d.name);

        // Compute correlation insights weighted by sector allocation
        const corrInsights = (() => {
          const pairs: { a: string; b: string; wa: number; wb: number; corr: number }[] = [];
          for (let i = 0; i < corrSectors.length; i++) {
            for (let j = i + 1; j < corrSectors.length; j++) {
              const a = corrSectors[i], b = corrSectors[j];
              const wa = pctOf(a), wb = pctOf(b);
              if (wa > 3 && wb > 3) {
                const corr = CORR[a]?.[b] ?? CORR[b]?.[a] ?? 0;
                pairs.push({ a, b, wa, wb, corr });
              }
            }
          }

          // Weighted average pairwise correlation (portfolio-level diversification score)
          const totalW = pairs.reduce((s, p) => s + (p.wa / 100) * (p.wb / 100), 0);
          const weightedCorr = totalW > 0
            ? pairs.reduce((s, p) => s + p.corr * (p.wa / 100) * (p.wb / 100), 0) / totalW
            : 0;

          // High-correlation heavy pairs (both >5%, corr >0.60) — biggest risk
          const riskyPairs = pairs
            .filter(p => p.corr >= 0.60 && p.wa > 5 && p.wb > 5)
            .sort((a, b) => (b.corr * (b.wa + b.wb)) - (a.corr * (a.wa + a.wb)));

          // Best diversifiers: sectors with lowest avg corr to the rest (and weight >3%)
          const avgCorrPerSector = corrSectors.map(s => {
            const others = corrSectors.filter(x => x !== s);
            const avg = others.length > 0
              ? others.reduce((sum, o) => sum + (CORR[s]?.[o] ?? CORR[o]?.[s] ?? 0), 0) / others.length
              : 0;
            return { sector: s, avgCorr: avg, pct: pctOf(s) };
          }).filter(x => x.pct > 3).sort((a, b) => a.avgCorr - b.avgCorr);

          return { weightedCorr, riskyPairs, avgCorrPerSector };
        })();

        const corrColor = (v: number, isDiag: boolean) => {
          if (isDiag) return { bg: '#f3f4f6', text: '#6b7280' };
          if (v >= 0.70) return { bg: '#fecaca', text: '#991b1b' };
          if (v >= 0.50) return { bg: '#fed7aa', text: '#92400e' };
          if (v >= 0.30) return { bg: '#fef9c3', text: '#713f12' };
          return { bg: '#dcfce7', text: '#14532d' };
        };

        return (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
              <PieChart className="mr-2" />
              Diversification
            </h2>
            <p className="text-gray-600 mb-6">Sector spread assessment and rebalancing guidance</p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left: Donut Pie Chart */}
              <div className="bg-white rounded-lg shadow-lg border border-gray-100 p-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Sector Allocation</h3>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <RechartsPieChart width={300} height={300}>
                    <Pie
                      data={chartData}
                      cx={150}
                      cy={150}
                      innerRadius={70}
                      outerRadius={130}
                      startAngle={90}
                      endAngle={-270}
                      dataKey="value"
                      style={{ cursor: 'pointer' }}
                      onClick={(entry: any) => setSelectedSector(entry.name)}
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`dc-${index}`} fill={SECTOR_COLORS[entry.name] || '#9CA3AF'} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }: any) => {
                        if (active && payload && payload.length) {
                          const d = payload[0].payload;
                          const sp = sectorPerformance.find(s => s.sector === d.name);
                          return (
                            <div className="bg-white border border-gray-200 rounded-lg shadow p-3 text-sm">
                              <p className="font-bold text-gray-900 mb-1">{d.name}</p>
                              <p className="text-gray-700">Invested: ${d.value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                              {sp && totalCostAll > 0 && <p className="text-gray-700">Weight: {((sp.totalCost / totalCostAll) * 100).toFixed(1)}%</p>}
                              {sp && <p className={sp.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}>P&L: ${sp.totalPnL.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                  </RechartsPieChart>
                </div>
                <div className="flex flex-wrap gap-2 mt-4">
                  {sectorPerformance.map(s => (
                    <div key={s.sector} className="flex items-center gap-1">
                      <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: SECTOR_COLORS[s.sector] || '#9CA3AF' }} />
                      <span className="text-xs text-gray-600">{s.sector}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: Weight Assessment + Suggestions */}
              <div className="flex flex-col gap-4">
                <div className="bg-white rounded-lg shadow-lg border border-gray-100 p-6">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4">Weight Assessment</h3>
                  <div className="flex flex-col gap-3">
                    {[...sectorPerformance].filter(s => s.totalCost > 0).sort((a, b) => b.totalCost - a.totalCost).map(s => {
                      const pct = totalCostAll > 0 ? (s.totalCost / totalCostAll) * 100 : 0;
                      const { label, color, bg } = getWeightLabel(pct);
                      return (
                        <div key={s.sector}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: SECTOR_COLORS[s.sector] || '#9CA3AF' }} />
                              <span className="text-sm font-medium text-gray-800">{s.sector}</span>
                              <span className="text-xs text-gray-400">({activeCountBySector[s.sector] ?? s.positions})</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-gray-700">{pct.toFixed(1)}%</span>
                              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${bg} ${color}`}>{label}</span>
                            </div>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: SECTOR_COLORS[s.sector] || '#9CA3AF' }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {suggestions.length > 0 && (
                  <div className="bg-gray-50 rounded-lg border border-gray-200 p-5">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                      <Target className="w-4 h-4" />
                      Rebalancing Guidance
                    </h3>
                    <ul className="flex flex-col gap-2">
                      {suggestions.map((suggestion, i) => (
                        <li key={i} className="text-sm text-gray-700 leading-snug">{suggestion}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {/* Correlation Matrix + Insights */}
            <div className="mt-8 bg-white rounded-lg shadow-lg border border-gray-100 p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-1">Sector Correlation Matrix</h3>
              <p className="text-xs text-gray-500 mb-4">Approximate historical correlations between your sectors. Green = low correlation (good diversification), Red = high correlation (similar risk exposure). Diagonal = same sector.</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '32px', alignItems: 'start' }}>
                {/* Matrix */}
                <div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ borderCollapse: 'collapse', fontSize: '11px', whiteSpace: 'nowrap' }}>
                      <thead>
                        <tr>
                          <th style={{ padding: '6px 8px', textAlign: 'left', color: '#6b7280', fontWeight: 600, minWidth: '120px' }}></th>
                          {corrSectors.map(s => (
                            <th key={s} style={{ padding: '6px 6px', textAlign: 'center', color: '#374151', fontWeight: 600, maxWidth: '72px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={s}>
                              {s.length > 8 ? s.slice(0, 8) + '…' : s}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {corrSectors.map(row => (
                          <tr key={row}>
                            <td style={{ padding: '4px 8px', fontWeight: 600, color: '#374151', borderRight: '1px solid #e5e7eb' }} title={row}>
                              {row.length > 16 ? row.slice(0, 16) + '…' : row}
                            </td>
                            {corrSectors.map(col => {
                              const isDiag = row === col;
                              const v = CORR[row]?.[col] ?? CORR[col]?.[row] ?? 0;
                              const { bg, text } = corrColor(v, isDiag);
                              return (
                                <td key={col} style={{ padding: '4px 6px', textAlign: 'center', backgroundColor: bg, color: text, fontWeight: isDiag ? 400 : 600, borderRadius: '3px', margin: '1px' }}>
                                  {isDiag ? '—' : v.toFixed(2)}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex gap-4 mt-4 text-xs text-gray-600">
                    <span><span style={{ display:'inline-block', width:10, height:10, backgroundColor:'#dcfce7', borderRadius:2, marginRight:4 }}/>Low (&lt;0.30)</span>
                    <span><span style={{ display:'inline-block', width:10, height:10, backgroundColor:'#fef9c3', borderRadius:2, marginRight:4 }}/>Moderate (0.30–0.50)</span>
                    <span><span style={{ display:'inline-block', width:10, height:10, backgroundColor:'#fed7aa', borderRadius:2, marginRight:4 }}/>High (0.50–0.70)</span>
                    <span><span style={{ display:'inline-block', width:10, height:10, backgroundColor:'#fecaca', borderRadius:2, marginRight:4 }}/>Very High (&gt;0.70)</span>
                  </div>
                </div>

                {/* Insights panel */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* Portfolio correlation score */}
                  <div style={{ backgroundColor: '#f9fafb', borderRadius: '10px', padding: '14px 16px' }}>
                    <p style={{ fontSize: '11px', color: '#6b7280', margin: '0 0 4px' }}>Portfolio Correlation Score</p>
                    <p style={{ fontSize: '24px', fontWeight: 'bold', margin: 0, color: corrInsights.weightedCorr >= 0.55 ? '#dc2626' : corrInsights.weightedCorr >= 0.40 ? '#d97706' : '#16a34a' }}>
                      {corrInsights.weightedCorr.toFixed(2)}
                    </p>
                    <p style={{ fontSize: '11px', color: '#6b7280', margin: '4px 0 0' }}>
                      {corrInsights.weightedCorr >= 0.55 ? 'High — most sectors move together' : corrInsights.weightedCorr >= 0.40 ? 'Moderate — some correlated clusters' : 'Low — well diversified'}
                    </p>
                  </div>

                  {/* Risky correlated pairs */}
                  {corrInsights.riskyPairs.length > 0 && (
                    <div style={{ backgroundColor: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '10px', padding: '14px 16px' }}>
                      <p style={{ fontSize: '12px', fontWeight: 700, color: '#92400e', margin: '0 0 8px' }}>⚠️ Correlated Heavy Positions</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {corrInsights.riskyPairs.slice(0, 4).map(p => (
                          <div key={p.a + p.b} style={{ fontSize: '11px', color: '#78350f' }}>
                            <span style={{ fontWeight: 600 }}>{p.a}</span> ({p.wa.toFixed(0)}%) + <span style={{ fontWeight: 600 }}>{p.b}</span> ({p.wb.toFixed(0)}%)
                            <span style={{ float: 'right', color: '#dc2626', fontWeight: 700 }}>{(p.corr * 100).toFixed(0)}% corr</span>
                            <div style={{ clear: 'both', fontSize: '10px', color: '#92400e' }}>{(p.wa + p.wb).toFixed(0)}% of portfolio moves together</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Best diversifiers */}
                  {corrInsights.avgCorrPerSector.length > 0 && (
                    <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '14px 16px' }}>
                      <p style={{ fontSize: '12px', fontWeight: 700, color: '#14532d', margin: '0 0 8px' }}>✅ Best Diversifiers</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        {corrInsights.avgCorrPerSector.slice(0, 3).map(x => (
                          <div key={x.sector} style={{ fontSize: '11px', color: '#166534' }}>
                            <span style={{ fontWeight: 600 }}>{x.sector}</span> ({x.pct.toFixed(0)}% of portfolio)
                            <span style={{ float: 'right', color: '#16a34a', fontWeight: 700 }}>avg {(x.avgCorr * 100).toFixed(0)}% corr</span>
                          </div>
                        ))}
                      </div>
                      <p style={{ fontSize: '10px', color: '#4ade80', marginTop: '6px', marginBottom: 0 }}>These sectors reduce portfolio-wide correlation the most.</p>
                    </div>
                  )}

                  {/* Under-diversified warning */}
                  {corrInsights.riskyPairs.slice(0, 1).map(p => (
                    <div key="main-risk" style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '14px 16px' }}>
                      <p style={{ fontSize: '12px', fontWeight: 700, color: '#991b1b', margin: '0 0 6px' }}>🔴 Main Concentration Risk</p>
                      <p style={{ fontSize: '11px', color: '#7f1d1d', margin: 0 }}>
                        {p.a} and {p.b} together make up <strong>{(p.wa + p.wb).toFixed(0)}%</strong> of your capital and have a <strong>{(p.corr * 100).toFixed(0)}%</strong> historical correlation. A single macro selloff (rate hike, risk-off) likely hits both simultaneously.
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Sector drilldown modal */}
            {selectedSector && (() => {
              const assets = positions.filter(p => p.sector === selectedSector && p.shares > 0.001 && p.totalCost > 0);
              const sectorTotal = assets.reduce((s, p) => s + p.totalCost, 0);
              const assetChartData = assets.map(p => ({ name: p.symbol, value: p.totalCost })).sort((a, b) => b.value - a.value);
              const HUE_PALETTE = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#F97316','#84CC16','#EC4899','#6366F1','#FBBF24','#a78bfa'];
              return (
                <div
                  style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => setSelectedSector(null)}
                >
                  <div
                    style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '480px', maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}
                    onClick={e => e.stopPropagation()}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <div>
                        <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#111827', margin: 0 }}>{selectedSector}</h3>
                        <p style={{ fontSize: '13px', color: '#6b7280', margin: '2px 0 0' }}>{assets.length} position{assets.length !== 1 ? 's' : ''} · ${sectorTotal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} invested</p>
                      </div>
                      <button onClick={() => setSelectedSector(null)} style={{ border: 'none', background: '#f3f4f6', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', fontSize: '16px', color: '#6b7280' }}>✕</button>
                    </div>
                    {assets.length > 0 ? (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                          <RechartsPieChart width={220} height={220}>
                            <Pie data={assetChartData} cx={110} cy={110} innerRadius={50} outerRadius={95} dataKey="value" startAngle={90} endAngle={-270}>
                              {assetChartData.map((_, i) => <Cell key={i} fill={HUE_PALETTE[i % HUE_PALETTE.length]} />)}
                            </Pie>
                            <Tooltip content={({ active, payload }: any) => {
                              if (active && payload?.length) {
                                const d = payload[0].payload;
                                return <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 12px', fontSize: '13px' }}><strong>{d.name}</strong><br />${d.value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} · {sectorTotal > 0 ? ((d.value / sectorTotal) * 100).toFixed(1) : 0}%</div>;
                              }
                              return null;
                            }} />
                          </RechartsPieChart>
                        </div>
                        <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
                          {[...assets].sort((a, b) => b.totalCost - a.totalCost).map((p, i) => (
                            <div key={p.symbol} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', backgroundColor: '#f9fafb', borderRadius: '6px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ width: '10px', height: '10px', borderRadius: '3px', backgroundColor: HUE_PALETTE[i % HUE_PALETTE.length], flexShrink: 0 }} />
                                <span style={{ fontSize: '13px', fontWeight: '600', color: '#111827' }}>{p.symbol}</span>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <span style={{ fontSize: '13px', color: '#374151' }}>${p.totalCost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                                <span style={{ fontSize: '11px', color: '#9ca3af', marginLeft: '6px' }}>{sectorTotal > 0 ? ((p.totalCost / sectorTotal) * 100).toFixed(1) : 0}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: '14px', padding: '24px 0' }}>No active positions with cost data</p>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })()}

      {/* Subsector Performance Section */}
      {(() => {
        const SUBSECTOR_COLORS: Record<string, string> = {
          'AI': '#6366F1',
          'Semiconductors': '#3B82F6',
          'Cloud & SaaS': '#0EA5E9',
          'Cybersecurity': '#06B6D4',
          'Quantum Computing': '#8B5CF6',
          'Social Media': '#EC4899',
          'Search & Advertising': '#F59E0B',
          'Consumer Electronics': '#10B981',
          'Bitcoin': '#F97316',
          'Altcoins': '#FBBF24',
          'Defense': '#475569',
          'Electric Vehicles': '#22C55E',
          'Aerospace': '#94A3B8',
          'Oil & Gas': '#92400E',
          'Natural Gas': '#D97706',
          'Pipelines': '#78716C',
          'Uranium': '#84CC16',
          'Nuclear Power': '#A3E635',
          'Pharmaceuticals': '#EF4444',
          'Biotech': '#F43F5E',
          'Medical Devices': '#F87171',
          'Health Insurance': '#FB7185',
          'Telehealth': '#FDA4AF',
          'Fintech': '#A78BFA',
          'Payments': '#7C3AED',
          'Banks': '#5B21B6',
          'Insurance': '#4C1D95',
          'Asset Management': '#6D28D9',
          'Fixed Income': '#64748B',
          'Gold': '#CA8A04',
          'Silver': '#CBD5E1',
          'Battery Materials': '#4ADE80',
          'Mining': '#166534',
          'E-Commerce': '#34D399',
          'Gaming': '#2DD4BF',
          'Industrial Equipment': '#FB923C',
          'Clean Technology': '#059669',
          'Data Centers': '#67E8F9',
          'Space': '#818CF8',
          'Robotics / Automation': '#C084FC',
          'Streaming / Media': '#F9A8D4',
        };

        // Assign a deterministic fallback color for any unlisted subsector
        const FALLBACK_PALETTE = ['#E879F9','#FCD34D','#6EE7B7','#93C5FD','#FCA5A1','#A5B4FC'];
        const getColor = (name: string, idx: number) =>
          SUBSECTOR_COLORS[name] ?? FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length];

        // Build a position lookup by symbol (all positions, not just active)
        const posMap: Record<string, Position> = {};
        for (const p of positions) posMap[p.symbol] = p;

        // All tracked symbols = everything in the cache subsector map
        const allTrackedSymbols = Object.keys(symbolSubsectors);

        // For portfolio allocation % we only count currently-held value
        const totalPortfolioValue = positions
          .filter(p => p.shares > 0.001)
          .reduce((sum, p) => sum + p.marketValue, 0);

        const subsectorMap: Record<string, { totalValue: number; totalCost: number; totalPnL: number; momSum: number; momCount: number; mom5Sum: number; mom5Count: number; symbols: Set<string> }> = {};

        for (const sym of allTrackedSymbols) {
          const subs = symbolSubsectors[sym] || [];
          if (subs.length === 0) continue;
          const pos = posMap[sym];
          const marketValue   = pos?.marketValue   ?? 0;
          const totalCost     = pos?.totalCost     ?? 0;
          const unrealizedPnL = pos?.unrealizedPnL ?? 0;
          const realizedPnL   = pos?.realizedPnL   ?? 0;
          const totalPnL      = unrealizedPnL + realizedPnL;

          for (const sub of subs) {
            if (!subsectorMap[sub]) subsectorMap[sub] = { totalValue: 0, totalCost: 0, totalPnL: 0, momSum: 0, momCount: 0, mom5Sum: 0, mom5Count: 0, symbols: new Set() };
            const e = subsectorMap[sub];
            const w = 1 / subs.length;
            e.totalValue += marketValue * w;
            e.totalCost  += totalCost * w;
            e.totalPnL   += totalPnL * w;
            e.symbols.add(sym);
            const mom = symbolMomentum[sym];
            if (mom != null) { e.momSum += mom; e.momCount++; }
            const mom5 = symbolMomentum5[sym];
            if (mom5 != null) { e.mom5Sum += mom5; e.mom5Count++; }
          }
        }

        const basePerf: SubsectorPerf[] = Object.entries(subsectorMap).map(([sub, d]) => ({
          subsector: sub,
          totalValue: d.totalValue,
          totalCost:  d.totalCost,
          portfolioPct: totalPortfolioValue > 0 ? (d.totalValue / totalPortfolioValue) * 100 : 0,
          pnlPct:     d.totalCost > 0 ? (d.totalPnL / d.totalCost) * 100 : 0,
          totalPnL:   d.totalPnL,
          momentum5:  d.mom5Count > 0 ? d.mom5Sum / d.mom5Count : null,
          momentum20: d.momCount > 0 ? d.momSum / d.momCount : null,
          positionCount: d.symbols.size,
          symbols: Array.from(d.symbols).sort(),
        }));

        const { col, dir } = subsectorSort;
        const sorted = [...basePerf].sort((a, b) => {
          let av: number, bv: number;
          if (col === 'subsector') {
            return dir === 'asc' ? a.subsector.localeCompare(b.subsector) : b.subsector.localeCompare(a.subsector);
          } else if (col === 'momentum5') {
            av = a.momentum5 ?? -Infinity;
            bv = b.momentum5 ?? -Infinity;
          } else if (col === 'momentum20') {
            av = a.momentum20 ?? -Infinity;
            bv = b.momentum20 ?? -Infinity;
          } else {
            av = (a as any)[col] ?? 0;
            bv = (b as any)[col] ?? 0;
          }
          return dir === 'asc' ? av - bv : bv - av;
        });

        const pieData = basePerf
          .sort((a, b) => b.totalValue - a.totalValue)
          .map((s, i) => ({ name: s.subsector, value: Math.round(s.totalValue), color: getColor(s.subsector, i) }));

        if (sorted.length === 0) return null;

        const SortTh = ({ label, colKey, right = true }: { label: string; colKey: string; right?: boolean }) => {
          const active = subsectorSort.col === colKey;
          return (
            <th
              className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase cursor-pointer select-none hover:text-gray-800 ${right ? 'text-right' : 'text-left'}`}
              onClick={() => setSubsectorSort(prev => ({ col: colKey, dir: prev.col === colKey && prev.dir === 'desc' ? 'asc' : 'desc' }))}
            >
              {label}{active ? (subsectorSort.dir === 'desc' ? ' ↓' : ' ↑') : ' ↕'}
            </th>
          );
        };

        return (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
              <Activity className="mr-2" />
              Subsector Performance
              {loadingMomentum && <span className="ml-3 text-sm font-normal text-gray-400">Loading momentum...</span>}
            </h2>
            <div className="bg-white rounded-xl shadow flex flex-col lg:flex-row overflow-hidden">
              {/* Pie */}
              <div className="lg:w-[340px] flex-shrink-0 p-4 border-b lg:border-b-0 lg:border-r border-gray-100 flex flex-col items-center justify-center">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Allocation by Subsector</p>
                <ResponsiveContainer width="100%" height={280}>
                  <RechartsPieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={110} innerRadius={50}>
                      {pieData.map((entry, i) => (
                        <Cell key={`${entry.name}-${i}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [`$${value.toLocaleString()}`, 'Value']} />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </div>
              {/* Table */}
              <div className="flex-1 overflow-auto max-h-[380px]">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <SortTh label="Subsector" colKey="subsector" right={false} />
                      <SortTh label="Alloc %" colKey="portfolioPct" />
                      <SortTh label="5d Mom" colKey="momentum5" />
                      <SortTh label="20d Mom" colKey="momentum20" />
                      <SortTh label="P&L %" colKey="pnlPct" />
                      <SortTh label="P&L $" colKey="totalPnL" />
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Holdings</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sorted.map((s, i) => (
                      <tr key={s.subsector} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: getColor(s.subsector, i), flexShrink: 0 }} />
                            <span className="font-medium text-gray-900 whitespace-nowrap">{s.subsector}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-700">{s.portfolioPct.toFixed(1)}%</td>
                        <td className="px-4 py-2.5 text-right">
                          {s.momentum5 != null
                            ? <span className={`font-semibold ${s.momentum5 >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {s.momentum5 >= 0 ? '+' : ''}{s.momentum5.toFixed(1)}%
                              </span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {s.momentum20 != null
                            ? <span className={`font-semibold ${s.momentum20 >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {s.momentum20 >= 0 ? '+' : ''}{s.momentum20.toFixed(1)}%
                              </span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={`font-semibold ${s.pnlPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {s.pnlPct >= 0 ? '+' : ''}{s.pnlPct.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={`font-semibold ${s.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {s.totalPnL >= 0 ? '+' : ''}${Math.round(s.totalPnL).toLocaleString()}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-400" style={{ minWidth: 120 }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                            {s.symbols.map(sym => (
                              <span key={sym} style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 4, padding: '1px 5px', whiteSpace: 'nowrap', color: '#374151' }}>
                                {sym}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Portfolio Health */}
      {portfolioHealth && (
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
            <Heart className="mr-2" />
            Portfolio Health
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow p-6 border-l-4 border-purple-500">
              <p className="text-sm text-gray-600 mb-1">Diversification Score</p>
              <p className="text-3xl font-bold text-purple-600">{portfolioHealth.diversificationScore}/100</p>
              <p className="text-xs text-gray-500 mt-1">Higher is better</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500">
              <p className="text-sm text-gray-600 mb-1">Overall Return</p>
              <p className={`text-3xl font-bold ${portfolioHealth.overallReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {portfolioHealth.overallReturn.toFixed(1)}%
              </p>
              <p className="text-xs text-gray-500 mt-1">Total portfolio</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6 border-l-4 border-yellow-500">
              <p className="text-sm text-gray-600 mb-1">Concentration Risk</p>
              <p className="text-3xl font-bold text-yellow-600">{portfolioHealth.concentrationRisk}%</p>
              <p className="text-xs text-gray-500 mt-1">Top 5 positions</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6 border-l-4 border-gray-500">
              <p className="text-sm text-gray-600 mb-1">Dead Money</p>
              <p className="text-3xl font-bold text-gray-600">{portfolioHealth.deadMoneyCount}</p>
              <p className="text-xs text-gray-500 mt-1">Near breakeven positions</p>
            </div>
          </div>
        </div>
      )}

      {/* Tax Loss Harvesting Section */}
      {taxLossHarvesting && taxLossHarvesting.count > 0 && (
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
            <ShieldAlert className="mr-2" />
            Tax Loss Harvesting Opportunities
          </h2>
          <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-6 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-600">Candidates</p>
                <p className="text-2xl font-bold text-gray-900">{taxLossHarvesting.count}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Losses</p>
                <p className="text-2xl font-bold text-red-600">
                  ${taxLossHarvesting.totalLosses.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Potential Tax Savings (25%)</p>
                <p className="text-2xl font-bold text-green-600">
                  ${taxLossHarvesting.totalTaxSavings.toFixed(2)}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Symbol</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Shares</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unrealized Loss</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tax Savings</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {taxLossHarvesting.candidates.slice(0, 10).map((candidate) => (
                  <tr key={candidate.symbol} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {candidate.symbol}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {candidate.shares.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-red-600">
                      ${candidate.unrealizedLoss.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-green-600">
                      ${candidate.potentialTaxSavings.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Time-Based Insights Section */}
      {timeBasedInsights && (
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
            <Calendar className="mr-2" />
            Time-Based Insights
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="bg-green-50 rounded-lg p-6 border border-green-200">
              <h3 className="text-sm font-semibold text-green-900 mb-2">Best Month</h3>
              <p className="text-2xl font-bold text-green-700">{timeBasedInsights.bestMonth.month}</p>
              <p className="text-sm text-green-600 mt-1">
                ${timeBasedInsights.bestMonth.netInvested.toFixed(2)} net invested
              </p>
            </div>
            <div className="bg-red-50 rounded-lg p-6 border border-red-200">
              <h3 className="text-sm font-semibold text-red-900 mb-2">Worst Month</h3>
              <p className="text-2xl font-bold text-red-700">{timeBasedInsights.worstMonth.month}</p>
              <p className="text-sm text-red-600 mt-1">
                ${timeBasedInsights.worstMonth.netInvested.toFixed(2)} net invested
              </p>
            </div>
            <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
              <h3 className="text-sm font-semibold text-blue-900 mb-2">Last 30 Days</h3>
              <p className="text-2xl font-bold text-blue-700">{timeBasedInsights.recentActivity.trades}</p>
              <p className="text-sm text-blue-600 mt-1">
                {timeBasedInsights.recentActivity.buys} buys, {timeBasedInsights.recentActivity.sells} sells
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Cost Basis Insights Section */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
          <Target className="mr-2" />
          Cost Basis Insights
        </h2>

        {positions.length > 0 ? (
          <>
            {(() => {
              // Categorize positions with sorting (0 shares at bottom)
              const sortWithZeroSharesLast = (positions: Position[], sortFn: (a: Position, b: Position) => number) => {
                const withShares = positions.filter(p => p.shares > 0);
                const withoutShares = positions.filter(p => p.shares <= 0);
                return [...withShares.sort(sortFn), ...withoutShares.sort(sortFn)];
              };

              const profitPositions = sortWithZeroSharesLast(
                positions.filter(p => {
                  const isNearBreakeven = Math.abs(p.unrealizedPnL) <= 10;
                  return !isNearBreakeven && p.unrealizedPnL > 0;
                }),
                (a, b) => b.unrealizedPnL - a.unrealizedPnL
              );

              const lossPositions = sortWithZeroSharesLast(
                positions.filter(p => {
                  const isNearBreakeven = Math.abs(p.unrealizedPnL) <= 10;
                  return !isNearBreakeven && p.unrealizedPnL < 0;
                }),
                (a, b) => a.unrealizedPnL - b.unrealizedPnL
              );

              const breakevenPositions = sortWithZeroSharesLast(
                positions.filter(p => Math.abs(p.unrealizedPnL) <= 10),
                (a, b) => Math.abs(a.unrealizedPnL) - Math.abs(b.unrealizedPnL)
              );

              const renderPositionTable = (positions: Position[], title: string, titleColor: string, bgColor: string, borderColor: string) => (
                <div className="flex-1 min-w-[300px]">
                  <div className={`${bgColor} ${borderColor} border-l-4 rounded-lg overflow-hidden`}>
                    <div className="p-4 border-b border-gray-200">
                      <h3 className={`text-lg font-bold ${titleColor} flex items-center justify-between`}>
                        {title}
                        <span className="text-sm font-normal text-gray-600">({positions.length})</span>
                      </h3>
                    </div>
                    <div className="overflow-x-auto max-h-96 overflow-y-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Symbol</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Shares</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Avg Cost</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Current</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">P&L</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {positions.length > 0 ? positions.map((position) => {
                            const distancePercent = ((position.currentPrice - position.averageCost) / position.averageCost) * 100;
                            const isProfit = position.unrealizedPnL > 0;
                            const hasNoShares = position.shares <= 0;

                            return (
                              <tr key={position.symbol} className={`hover:bg-gray-50 ${hasNoShares ? 'opacity-40' : ''}`}>
                                <td className="px-3 py-3 whitespace-nowrap">
                                  <div className={`text-sm font-medium ${hasNoShares ? 'text-gray-500' : 'text-gray-900'}`}>
                                    {position.symbol}
                                  </div>
                                </td>
                                <td className="px-3 py-3 whitespace-nowrap">
                                  <div className={`text-xs ${hasNoShares ? 'text-gray-400' : 'text-gray-700'}`}>
                                    {position.shares < 1
                                      ? position.shares.toFixed(4)
                                      : position.shares.toFixed(2)}
                                  </div>
                                </td>
                                <td className="px-3 py-3 whitespace-nowrap">
                                  <div className={`text-xs ${hasNoShares ? 'text-gray-400' : 'text-gray-700'}`}>
                                    ${position.averageCost.toFixed(2)}
                                  </div>
                                </td>
                                <td className="px-3 py-3 whitespace-nowrap">
                                  <div className={`text-xs ${hasNoShares ? 'text-gray-400' : 'text-gray-700'}`}>
                                    ${position.currentPrice.toFixed(2)}
                                  </div>
                                  <div className={`text-xs ${hasNoShares ? 'text-gray-400' : distancePercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {distancePercent >= 0 ? '+' : ''}{distancePercent.toFixed(1)}%
                                  </div>
                                </td>
                                <td className="px-3 py-3 whitespace-nowrap">
                                  <div className={`text-sm font-semibold ${hasNoShares ? 'text-gray-400' : isProfit ? 'text-green-600' : 'text-red-600'}`}>
                                    ${position.unrealizedPnL.toFixed(2)}
                                  </div>
                                  <div className={`text-xs ${hasNoShares ? 'text-gray-400' : isProfit ? 'text-green-500' : 'text-red-500'}`}>
                                    {position.unrealizedPnLPercent.toFixed(1)}%
                                  </div>
                                </td>
                              </tr>
                            );
                          }) : (
                            <tr>
                              <td colSpan={5} className="px-3 py-4 text-center text-sm text-gray-500">
                                No positions
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );

              return (
                <div className="flex flex-col lg:flex-row gap-4">
                  {renderPositionTable(profitPositions, '🟢 In Profit', 'text-green-800', 'bg-green-50', 'border-green-500')}
                  {renderPositionTable(lossPositions, '🔴 At Loss', 'text-red-800', 'bg-red-50', 'border-red-500')}
                  {renderPositionTable(breakevenPositions, '🟡 Near Breakeven', 'text-yellow-800', 'bg-yellow-50', 'border-yellow-500')}
                </div>
              );
            })()}
          </>
        ) : (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
            <div className="flex items-center">
              <AlertTriangle className="text-yellow-600 mr-2" />
              <p className="text-yellow-700">No open positions found. Upload portfolio data to see cost basis insights.</p>
            </div>
          </div>
        )}
      </div>


      {/* Account Placement Audit Section */}
      {accountPlacements.length > 0 && (() => {
        const visiblePlacements = hideInactivePlacements
          ? accountPlacements.filter(p => p.shares > 0.01)
          : accountPlacements;
        const misplaced = visiblePlacements.filter(p => p.status === 'misplaced');
        const suboptimal = visiblePlacements.filter(p => p.status === 'suboptimal');
        const optimal = visiblePlacements.filter(p => p.status === 'ok');
        const hiddenCount = accountPlacements.length - visiblePlacements.length;

        const statusBadge = (status: AccountPlacement['status']) => {
          if (status === 'ok') return (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
              <CheckCircle size={11} /> Optimal
            </span>
          );
          if (status === 'suboptimal') return (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
              <AlertTriangle size={11} /> Suboptimal
            </span>
          );
          return (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
              <XCircle size={11} /> Misplaced
            </span>
          );
        };

        const accountBadge = (account: string) => {
          const colors: Record<string, string> = {
            TFSA: 'bg-blue-100 text-blue-700',
            RRSP: 'bg-purple-100 text-purple-700',
            FHSA: 'bg-indigo-100 text-indigo-700',
            'Non-Reg': 'bg-gray-100 text-gray-600',
          };
          return (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${colors[account] || 'bg-gray-100 text-gray-600'}`}>
              {account}
            </span>
          );
        };

        const exchangeBadge = (exchange: string) => {
          const colors: Record<string, string> = {
            TSX: 'bg-red-50 text-red-700',
            NYSE: 'bg-blue-50 text-blue-700',
            Crypto: 'bg-orange-50 text-orange-700',
          };
          return (
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${colors[exchange] || 'bg-gray-50 text-gray-600'}`}>
              {exchange}
            </span>
          );
        };

        return (
          <div className="mt-12 mb-12 pt-8 border-t border-gray-200">
            <div className="flex items-start justify-between mb-1">
              <h2 className="text-2xl font-bold text-gray-900 flex items-center">
                <ShieldAlert className="mr-2" />
                Account Placement Audit
              </h2>
              <label className="flex items-center gap-2 cursor-pointer select-none mt-1">
                <span className="text-sm text-gray-500">Hide inactive</span>
                <div
                  onClick={() => setHideInactivePlacements(v => !v)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${hideInactivePlacements ? 'bg-blue-600' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${hideInactivePlacements ? 'translate-x-4' : 'translate-x-1'}`} />
                </div>
              </label>
            </div>
            <p className="text-gray-600 mb-6">
              Each active position evaluated against Canadian tax-optimisation rules — TFSA for growth, RRSP for US dividend income (treaty), non-reg for eligible Canadian dividends.
            </p>

            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                <p className="text-3xl font-bold text-green-700">{optimal.length}</p>
                <p className="text-sm text-green-600 font-medium mt-1">Optimally placed</p>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                <p className="text-3xl font-bold text-yellow-700">{suboptimal.length}</p>
                <p className="text-sm text-yellow-600 font-medium mt-1">Suboptimal placement</p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                <p className="text-3xl font-bold text-red-700">{misplaced.length}</p>
                <p className="text-sm text-red-600 font-medium mt-1">Misplaced</p>
              </div>
            </div>

            {/* Placement table */}
            <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-gray-600 font-semibold">Symbol</th>
                      <th className="text-left px-4 py-3 text-gray-600 font-semibold">Exchange</th>
                      <th className="text-left px-4 py-3 text-gray-600 font-semibold">Current Account</th>
                      <th className="text-left px-4 py-3 text-gray-600 font-semibold">Recommended</th>
                      <th className="text-right px-4 py-3 text-gray-600 font-semibold">Div Yield</th>
                      <th className="text-right px-4 py-3 text-gray-600 font-semibold">Mkt Value</th>
                      <th className="text-left px-4 py-3 text-gray-600 font-semibold">Status</th>
                      <th className="text-left px-4 py-3 text-gray-600 font-semibold">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {visiblePlacements.map((p, i) => (
                      <tr
                        key={`${p.symbol}-${p.currentAccount}-${i}`}
                        className={
                          p.status === 'misplaced' ? 'bg-red-50' :
                          p.status === 'suboptimal' ? 'bg-yellow-50' :
                          'hover:bg-gray-50'
                        }
                      >
                        <td className="px-4 py-3 font-bold text-gray-900">{p.symbol}</td>
                        <td className="px-4 py-3">{exchangeBadge(p.exchange)}</td>
                        <td className="px-4 py-3">{accountBadge(p.currentAccount)}</td>
                        <td className="px-4 py-3">
                          {p.currentAccount === p.recommendedAccount
                            ? <span className="text-gray-400 text-xs">—</span>
                            : accountBadge(p.recommendedAccount)
                          }
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">
                          {p.exchange === 'Crypto'
                            ? <span className="text-gray-400 text-xs">—</span>
                            : p.dividendYield != null
                              ? <span className={p.dividendYield >= 1 ? 'text-green-600 font-medium' : 'text-gray-500'}>
                                  {p.dividendYield.toFixed(2)}%
                                </span>
                              : <span className="text-gray-400 text-xs">—</span>
                          }
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">
                          ${p.marketValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </td>
                        <td className="px-4 py-3">{statusBadge(p.status)}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs max-w-xs">{p.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {hiddenCount > 0 && (
              <p className="text-xs text-gray-400 mt-2 text-right">
                {hiddenCount} closed position{hiddenCount !== 1 ? 's' : ''} hidden — toggle to show
              </p>
            )}

            {/* Key rules reminder */}
            <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
              <p className="font-semibold mb-2">Key placement rules</p>
              <ul className="space-y-1 text-blue-700 text-xs list-disc list-inside">
                <li>Canadian eligible dividends → Non-Reg (dividend tax credit often beats TFSA after tax)</li>
                <li>US stocks → RRSP (Canada-US treaty eliminates 15% withholding; unrecoverable in TFSA)</li>
                <li>Canadian growth stocks → TFSA (tax-free gains, no withholding drag)</li>
                <li>Crypto → Non-Reg only (not eligible for registered accounts)</li>
                <li>Priority: max TFSA first → max RRSP → spill into non-reg</li>
              </ul>
            </div>
          </div>
        );
      })()}

      {/* Save Strategy Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Save Rebalancing Strategy</h3>

            {saveError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {saveError}
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Overwrite Existing Strategy (optional)
              </label>
              <select
                value={selectedStrategyToOverwrite}
                onChange={(e) => {
                  const strategyId = e.target.value;
                  setSelectedStrategyToOverwrite(strategyId);

                  // Auto-fill name and description if overwriting
                  if (strategyId) {
                    const strategy = savedStrategies.find(s => s.id === strategyId);
                    if (strategy) {
                      setStrategyName(strategy.name);
                      setStrategyDescription(strategy.description);
                    }
                  }
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value="">Create New Strategy</option>
                {savedStrategies.map((strategy) => (
                  <option key={strategy.id} value={strategy.id}>
                    {strategy.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {selectedStrategyToOverwrite ? 'This will overwrite the selected strategy' : 'Or select an existing strategy to overwrite it'}
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Strategy Name*
              </label>
              <input
                type="text"
                value={strategyName}
                onChange={(e) => setStrategyName(e.target.value)}
                placeholder="e.g., Increase Tech Holdings"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Description (optional)
              </label>
              <textarea
                value={strategyDescription}
                onChange={(e) => setStrategyDescription(e.target.value)}
                placeholder="Add notes about this strategy..."
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 font-semibold mb-1">Adjustments:</p>
              <p className="text-xs text-gray-500">{Object.keys(adjustments).length} assets modified</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => saveStrategy()}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors"
              >
                {selectedStrategyToOverwrite ? 'Overwrite Strategy' : 'Save Strategy'}
              </button>
              <button
                onClick={() => {
                  setShowSaveModal(false);
                  setSaveError('');
                  setStrategyName('');
                  setStrategyDescription('');
                  setSelectedStrategyToOverwrite('');
                }}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Load Strategy Modal */}
      {showLoadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 max-h-[80vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Load Rebalancing Strategy</h3>

            {savedStrategies.length === 0 ? (
              <div className="text-center py-12">
                <FolderOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600 font-semibold mb-2">No saved strategies</p>
                <p className="text-sm text-gray-500">Create adjustments and save them to reuse later</p>
              </div>
            ) : (
              <div className="space-y-3 mb-6">
                {savedStrategies.map((strategy) => (
                  <div key={strategy.id} className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h4 className="font-bold text-gray-900">{strategy.name}</h4>
                        {strategy.description && (
                          <p className="text-sm text-gray-600 mt-1">{strategy.description}</p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                          <span>{Object.keys(strategy.adjustments).length} assets</span>
                          <span>Created {new Date(strategy.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex gap-2 ml-4">
                        <button
                          onClick={() => loadStrategy(strategy)}
                          className="px-3 py-1 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
                        >
                          Load
                        </button>
                        <button
                          onClick={() => deleteStrategy(strategy.id)}
                          className="px-3 py-1 bg-red-100 text-red-700 rounded-lg text-sm font-semibold hover:bg-red-200 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => setShowLoadModal(false)}
              className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Insights;
