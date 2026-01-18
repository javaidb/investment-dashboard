import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Target, Award, AlertTriangle, PieChart, Heart, Calendar, ShieldAlert, Wallet } from 'lucide-react';
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

const Insights: React.FC = () => {
  const [positions, setPositions] = useState<Position[]>([]);
  const [winLossStats, setWinLossStats] = useState<WinLossStats | null>(null);
  const [sectorPerformance, setSectorPerformance] = useState<SectorPerformance[]>([]);
  const [taxLossHarvesting, setTaxLossHarvesting] = useState<TaxLossHarvesting | null>(null);
  const [portfolioHealth, setPortfolioHealth] = useState<PortfolioHealth | null>(null);
  const [timeBasedInsights, setTimeBasedInsights] = useState<TimeBasedInsights | null>(null);
  const [recurringInvestments, setRecurringInvestments] = useState<RecurringInvestment[]>([]);
  const [loading, setLoading] = useState(true);

  // State for portfolio rebalancing simulator
  const [adjustments, setAdjustments] = useState<{[symbol: string]: number}>({});
  const [showAdjustments, setShowAdjustments] = useState(false);
  const [searchSymbol, setSearchSymbol] = useState('');

  useEffect(() => {
    fetchInsightsData();
  }, []);

  const fetchInsightsData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/portfolio/insights');
      const data = await response.json();
      setPositions(data.positions || []);
      setWinLossStats(data.winLossStats || null);
      setSectorPerformance(data.sectorPerformance || []);
      setTaxLossHarvesting(data.taxLossHarvesting || null);
      setPortfolioHealth(data.portfolioHealth || null);
      setTimeBasedInsights(data.timeBasedInsights || null);
      setRecurringInvestments(data.recurringInvestments || []);
    } catch (error) {
      console.error('Error fetching insights:', error);
    } finally {
      setLoading(false);
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

      {/* Capital on Assets Section */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
          <Wallet className="mr-2" />
          Capital on Assets
        </h2>
        <p className="text-gray-600 mb-6">Distribution of assets by invested capital ranges</p>

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

            // Categorize all assets by invested capital
            const microTesting = assetsToUse.filter(a => a.totalCost < 500);
            const macroTesting = assetsToUse.filter(a => a.totalCost >= 500 && a.totalCost < 1000);
            const standardPosition = assetsToUse.filter(a => a.totalCost >= 1000 && a.totalCost < 5000);
            const significantPosition = assetsToUse.filter(a => a.totalCost >= 5000 && a.totalCost < 15000);
            const majorHolding = assetsToUse.filter(a => a.totalCost >= 15000);

            const categories = [
              { name: '< $500', subtitle: 'Micro-Testing Waters', data: microTesting, color: '#8B5CF6', range: '< $500', targetCapitalPercent: 5, targetAssetPercent: 12 },
              { name: '$500 - $1,000', subtitle: 'Macro-Testing Waters', data: macroTesting, color: '#10B981', range: '$500 - $1,000', targetCapitalPercent: 10, targetAssetPercent: 13 },
              { name: '$1,000 - $5,000', subtitle: 'Standard Position', data: standardPosition, color: '#3B82F6', range: '$1,000 - $5,000', targetCapitalPercent: 25, targetAssetPercent: 45 },
              { name: '$5,000 - $15,000', subtitle: 'Significant Position', data: significantPosition, color: '#F59E0B', range: '$5,000 - $15,000', targetCapitalPercent: 35, targetAssetPercent: 22 },
              { name: '> $15,000', subtitle: 'Major Holding', data: majorHolding, color: '#DC2626', range: '> $15,000', targetCapitalPercent: 25, targetAssetPercent: 8 }
            ];

            // Calculate total invested across all assets for percentage calculation
            const grandTotalInvested = assetsToUse.reduce((sum, a) => sum + a.totalCost, 0);

            const renderCapitalPieChart = (category: typeof categories[0]) => {
              const chartData = category.data
                .filter(a => a.totalCost > 0) // Only include assets with valid cost
                .map(a => ({
                  symbol: a.symbol,
                  value: a.totalCost,
                  currentValue: a.currentValue,
                  pnl: a.unrealizedPnL,
                  isRecurring: a.isRecurring
                }));

              const totalInvested = chartData.reduce((sum, d) => sum + d.value, 0);
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

                    {/* Target indicators */}
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <div className="flex justify-around text-xs">
                        <div className="text-center">
                          <p className="text-gray-400">Target</p>
                          <p className="font-semibold text-gray-600">{category.targetCapitalPercent}% capital</p>
                          <p className="font-semibold text-gray-600">{category.targetAssetPercent}% assets ({Math.round(allAssets.length * category.targetAssetPercent / 100)})</p>
                        </div>
                        <div className="text-center">
                          <p className="text-gray-400">Current</p>
                          <p className={`font-semibold ${Math.abs(percentOfTotal - category.targetCapitalPercent) <= 5 ? 'text-green-600' : 'text-orange-600'}`}>
                            {percentOfTotal.toFixed(1)}% capital
                          </p>
                          <p className={`font-semibold ${Math.abs(assetPercent - category.targetAssetPercent) <= 5 ? 'text-green-600' : 'text-orange-600'}`}>
                            {assetPercent.toFixed(1)}% assets ({chartData.length})
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
                            {chartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                            ))}
                          </Pie>
                          <Tooltip content={<CustomTooltip />} />
                        </RechartsPieChart>
                      </ResponsiveContainer>

                      <div className="mt-4 max-h-48 overflow-y-auto">
                        {category.data
                          .sort((a, b) => b.totalCost - a.totalCost)
                          .map((asset) => {
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
                {/* Pie Charts Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 mb-8">
                  {categories.map((category, index) => (
                    <div key={index}>
                      {renderCapitalPieChart(category)}
                    </div>
                  ))}
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

                  {showAdjustments && (
                    <div>
                      <div className="flex items-center justify-between mb-4 pb-4 border-b">
                        <div className="text-sm text-gray-600">
                          <p className="font-semibold">Original Total: <span className="text-gray-900">${allAssets.reduce((sum, a) => sum + a.totalCost, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></p>
                          <p className="font-semibold mt-1">Adjusted Total: <span className={`${grandTotalInvested > allAssets.reduce((sum, a) => sum + a.totalCost, 0) ? 'text-green-600' : grandTotalInvested < allAssets.reduce((sum, a) => sum + a.totalCost, 0) ? 'text-red-600' : 'text-gray-900'}`}>${grandTotalInvested.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></p>
                        </div>
                        <button
                          onClick={() => {
                            setAdjustments({});
                            setSearchSymbol('');
                          }}
                          className="px-3 py-1 bg-red-100 text-red-700 rounded-lg text-sm font-semibold hover:bg-red-200"
                        >
                          Reset All
                        </button>
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
                        const filteredAssets = allAssets
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

                        if (filteredAssets.length === 0) {
                          return (
                            <div className="col-span-full text-center py-12 text-gray-500">
                              <p className="text-lg font-semibold mb-2">
                                {searchSymbol ? 'No matching assets found' : 'Search for an asset to start adjusting'}
                              </p>
                              <p className="text-sm">
                                {searchSymbol
                                  ? `No assets match "${searchSymbol}". Try a different symbol.`
                                  : 'Type a symbol in the search box above or adjust an asset to see it here.'}
                              </p>
                            </div>
                          );
                        }

                        return (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-96 overflow-y-auto">
                            {filteredAssets.map((asset) => {
                            const currentValue = adjustments[asset.symbol] !== undefined ? adjustments[asset.symbol] : asset.totalCost;
                            const difference = currentValue - asset.totalCost;

                            return (
                              <div key={asset.symbol} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-gray-900">{asset.symbol}</span>
                                    {asset.isRecurring && (
                                      <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">DCA</span>
                                    )}
                                  </div>
                                  {difference !== 0 && (
                                    <button
                                      onClick={() => {
                                        const newAdj = {...adjustments};
                                        delete newAdj[asset.symbol];
                                        setAdjustments(newAdj);
                                      }}
                                      className="text-xs text-red-600 hover:text-red-800"
                                    >
                                      Reset
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
                        );
                      })()}
                    </div>
                  )}
                </div>
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



      {/* Portfolio Health & Sector Performance - Side by Side */}
      <div className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Portfolio Health Section */}
        {portfolioHealth && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
              <Heart className="mr-2" />
              Portfolio Health
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

        {/* Sector Performance Section */}
        {sectorPerformance.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
              <PieChart className="mr-2" />
              Sector Performance
            </h2>
            <div className="bg-white rounded-lg shadow overflow-hidden max-h-[400px] overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sector</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Portfolio %</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Positions</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Win Rate</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Value</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total P&L</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sectorPerformance.map((sector) => (
                    <tr key={sector.sector} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{sector.sector}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{sector.percentOfPortfolio.toFixed(1)}%</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{sector.positions}</div>
                        <div className="text-xs text-gray-500">{sector.winners}W / {sector.losers}L</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`text-sm font-semibold ${sector.winRate >= 50 ? 'text-green-600' : 'text-red-600'}`}>
                          {sector.winRate.toFixed(0)}%
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">${sector.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`text-sm font-semibold ${sector.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ${sector.totalPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

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
    </div>
  );
};

export default Insights;
