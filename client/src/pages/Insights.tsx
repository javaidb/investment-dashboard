import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Target, Award, AlertTriangle, PieChart, Heart, Calendar, ShieldAlert, CheckCircle, XCircle, Clock, Activity } from 'lucide-react';
import ValuationMetricsPanel from '../components/ValuationMetricsPanel';
import MarketInsightsTab from '../components/MarketInsightsTab';
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

const Insights: React.FC = () => {
  const [positions, setPositions] = useState<Position[]>([]);
  const [winLossStats, setWinLossStats] = useState<WinLossStats | null>(null);
  const [sectorPerformance, setSectorPerformance] = useState<SectorPerformance[]>([]);
  const [taxLossHarvesting, setTaxLossHarvesting] = useState<TaxLossHarvesting | null>(null);
  const [portfolioHealth, setPortfolioHealth] = useState<PortfolioHealth | null>(null);
  const [timeBasedInsights, setTimeBasedInsights] = useState<TimeBasedInsights | null>(null);
  const [accountPlacements, setAccountPlacements] = useState<AccountPlacement[]>([]);
  const [hideInactivePlacements, setHideInactivePlacements] = useState(true);
  const [loading, setLoading] = useState(true);
  const [symbolSubsectors, setSymbolSubsectors] = useState<Record<string, string[]>>({});
  const [symbolMomentum, setSymbolMomentum] = useState<Record<string, number>>({});
  const [symbolMomentum5, setSymbolMomentum5] = useState<Record<string, number>>({});
  const [loadingMomentum, setLoadingMomentum] = useState(false);
  const [subsectorSort, setSubsectorSort] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'totalValue', dir: 'desc' });

  // State for sector drilldown
  const [selectedSector, setSelectedSector] = useState<string | null>(null);

  // Insights sub-tab navigation
  const [insightsTab, setInsightsTab] = useState<'timing' | 'market' | 'diversification' | 'account'>('timing');

  useEffect(() => {
    fetchInsightsData();
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

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div className="text-center">
          <div className="loading-spinner"></div>
          <p style={{ marginTop: '16px', color: '#64748b' }}>Loading insights...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div className="mb-6">
        <div style={{ fontFamily: "'IBM Plex Mono','Courier New',monospace", fontSize: '12px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Portfolio Insights</div>
        <p style={{ fontSize: '11px', color: '#4a5568', fontFamily: "'IBM Plex Mono',monospace", margin: '3px 0 12px' }}>Actionable intelligence to improve your trading decisions</p>

        {/* Sub-tab navigation */}
        <div style={{
          display: 'flex',
          gap: '4px',
          backgroundColor: '#10141c',
          border: '1px solid #1e2535',
          borderRadius: '6px',
          padding: '4px',
          width: 'fit-content',
        }}>
          {([
            { id: 'timing',          label: 'Timing',           icon: '📈', desc: 'Win/loss, valuation, time-based' },
            { id: 'market',          label: 'Market',           icon: '🌍', desc: 'Market conditions, earnings calendar, sector comparison' },
            { id: 'diversification', label: 'Diversification',  icon: '🔀', desc: 'Correlation, sectors, tax loss' },
            { id: 'account',         label: 'Account Structure', icon: '🏦', desc: 'TFSA/RRSP/FHSA placement audit' },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => setInsightsTab(tab.id)}
              title={tab.desc}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: insightsTab === tab.id ? '700' : '500',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                backgroundColor: insightsTab === tab.id ? 'rgba(59,130,246,0.12)' : 'transparent',
                color: insightsTab === tab.id ? '#60a5fa' : '#64748b',
                border: insightsTab === tab.id ? '1px solid rgba(59,130,246,0.25)' : '1px solid transparent',
                boxShadow: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Win/Loss Analysis Section — Timing tab */}
      {insightsTab === 'timing' && (
      <div className="mb-8">
        <h2 style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px', margin: 0, marginBottom: '16px' }}>
          <Award style={{ color: '#64748b' }} size={16} />
          Win/Loss Analysis
        </h2>

        {winLossStats ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
            {/* Win Rate Card */}
            <div style={{ backgroundColor: '#10141c', border: '1px solid #1e2535', borderLeft: '3px solid #10b981', borderRadius: '8px', padding: '16px' }}>
              <div className="flex items-center justify-between mb-2">
                <p style={{ fontSize: '11px', color: '#64748b', fontFamily: "'IBM Plex Mono',monospace" }}>Win Rate</p>
                <TrendingUp className="text-green-500" size={20} />
              </div>
              <p style={{ fontSize: '22px', fontWeight: 700, color: '#e2e8f0', fontFamily: "'IBM Plex Mono',monospace" }}>
                {winLossStats.winRate.toFixed(1)}%
              </p>
              <p style={{ fontSize: '11px', color: '#4a5568', fontFamily: "'IBM Plex Mono',monospace" }}>
                {winLossStats.winningTrades} wins / {winLossStats.totalTrades} trades
              </p>
            </div>

            {/* Average Gain Card */}
            <div style={{ backgroundColor: '#10141c', border: '1px solid #1e2535', borderLeft: '3px solid #3b82f6', borderRadius: '8px', padding: '16px' }}>
              <div className="flex items-center justify-between mb-2">
                <p style={{ fontSize: '11px', color: '#64748b', fontFamily: "'IBM Plex Mono',monospace" }}>Avg Gain</p>
                <DollarSign className="text-blue-500" size={20} />
              </div>
              <p className="text-3xl font-bold text-green-600">
                ${winLossStats.averageGain.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p style={{ fontSize: '11px', color: '#4a5568', fontFamily: "'IBM Plex Mono',monospace" }}>Per winning trade</p>
            </div>

            {/* Average Loss Card */}
            <div style={{ backgroundColor: '#10141c', border: '1px solid #1e2535', borderLeft: '3px solid #ef4444', borderRadius: '8px', padding: '16px' }}>
              <div className="flex items-center justify-between mb-2">
                <p style={{ fontSize: '11px', color: '#64748b', fontFamily: "'IBM Plex Mono',monospace" }}>Avg Loss</p>
                <TrendingDown className="text-red-500" size={20} />
              </div>
              <p className="text-3xl font-bold text-red-600">
                ${Math.abs(winLossStats.averageLoss).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p style={{ fontSize: '11px', color: '#4a5568', fontFamily: "'IBM Plex Mono',monospace" }}>Per losing trade</p>
            </div>

            {/* Total Realized Card */}
            <div style={{ backgroundColor: '#10141c', border: '1px solid #1e2535', borderLeft: '3px solid #8b5cf6', borderRadius: '8px', padding: '16px' }}>
              <div className="flex items-center justify-between mb-2">
                <p style={{ fontSize: '11px', color: '#64748b', fontFamily: "'IBM Plex Mono',monospace" }}>Total Realized</p>
                <Target className="text-purple-500" size={20} />
              </div>
              <p className={`text-3xl font-bold ${winLossStats.totalRealized >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${winLossStats.totalRealized.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p style={{ fontSize: '11px', color: '#4a5568', fontFamily: "'IBM Plex Mono',monospace" }}>From closed positions</p>
            </div>
          </div>
        ) : (
          <div style={{ backgroundColor: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.25)', borderLeft: '3px solid #fbbf24', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
            <div className="flex items-center">
              <AlertTriangle style={{ color: '#fbbf24', marginRight: '8px' }} />
              <p style={{ color: '#fbbf24' }}>No realized trades found. Win/Loss analysis requires closed positions.</p>
            </div>
          </div>
        )}

        {/* Best and Worst Trades */}
        {winLossStats && (winLossStats.bestTrade || winLossStats.worstTrade) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {winLossStats.bestTrade && (
              <div style={{ backgroundColor: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '8px', padding: '20px' }}>
                <h3 style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 12px' }}>
                  <Award style={{ color: '#64748b' }} size={16} />
                  Best Trade
                </h3>
                <p style={{ fontSize: '22px', fontWeight: 700, color: '#34d399', fontFamily: "'IBM Plex Mono',monospace" }}>{winLossStats.bestTrade.symbol}</p>
                <p style={{ fontSize: '22px', fontWeight: 700, color: '#34d399', fontFamily: "'IBM Plex Mono',monospace", marginTop: '8px' }}>
                  +${winLossStats.bestTrade.profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            )}

            {winLossStats.worstTrade && (
              <div style={{ backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '20px' }}>
                <h3 style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 12px' }}>
                  <TrendingDown style={{ color: '#64748b' }} size={16} />
                  Worst Trade
                </h3>
                <p style={{ fontSize: '22px', fontWeight: 700, color: '#f87171', fontFamily: "'IBM Plex Mono',monospace" }}>{winLossStats.worstTrade.symbol}</p>
                <p style={{ fontSize: '22px', fontWeight: 700, color: '#f87171', fontFamily: "'IBM Plex Mono',monospace", marginTop: '8px' }}>
                  ${winLossStats.worstTrade.profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {/* Valuation Metrics in Timing tab */}
      {insightsTab === 'timing' && (
        <div className="mb-8">
          <ValuationMetricsPanel />
        </div>
      )}



      {/* ── Market Tab ─────────────────────────────────────────────────────── */}
      {insightsTab === 'market' && (
        <MarketInsightsTab />
      )}

      {/* Diversification Section — Diversification tab */}
      {insightsTab === 'diversification' && sectorPerformance.length > 0 && (() => {
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
          if (pct > 35) return { label: 'Concentrated', color: '#f87171', bg: 'rgba(239,68,68,0.1)' };
          if (pct > 20) return { label: 'Heavy', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)' };
          if (pct >= 5) return { label: 'Healthy', color: '#34d399', bg: 'rgba(16,185,129,0.1)' };
          return { label: 'Thin', color: '#64748b', bg: 'rgba(100,116,139,0.1)' };
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
          if (isDiag) return { bg: '#1e2535', text: '#4a5568' };
          if (v >= 0.70) return { bg: 'rgba(239,68,68,0.18)',   text: '#f87171' };
          if (v >= 0.50) return { bg: 'rgba(249,115,22,0.18)',  text: '#fb923c' };
          if (v >= 0.30) return { bg: 'rgba(234,179,8,0.18)',   text: '#fbbf24' };
          return           { bg: 'rgba(16,185,129,0.15)',   text: '#34d399' };
        };

        return (
          <div className="mb-8">
            <h2 style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '12px', fontWeight: 700, color: '#e2e8f0', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 8px' }}>
              <PieChart style={{ color: '#94a3b8' }} size={16} />
              Diversification
            </h2>
            <p style={{ fontSize: '11px', color: '#64748b', fontFamily: "'IBM Plex Mono',monospace", marginBottom: '24px' }}>Sector spread assessment and rebalancing guidance</p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left: Donut Pie Chart */}
              <div style={{ backgroundColor: '#10141c', border: '1px solid #1e2535', borderRadius: '8px', padding: '20px' }}>
                <h3 style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '12px', fontWeight: 700, color: '#e2e8f0', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 16px' }}>Sector Allocation</h3>
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
                            <div style={{ backgroundColor: '#10141c', border: '1px solid #1e2535', borderRadius: '8px', padding: '12px', fontSize: '13px' }}>
                              <p style={{ fontWeight: 700, color: '#e2e8f0', marginBottom: '4px' }}>{d.name}</p>
                              <p style={{ color: '#94a3b8' }}>Invested: ${d.value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                              {sp && totalCostAll > 0 && <p style={{ color: '#94a3b8' }}>Weight: {((sp.totalCost / totalCostAll) * 100).toFixed(1)}%</p>}
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
                      <span style={{ fontSize: '11px', color: '#64748b' }}>{s.sector}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: Weight Assessment + Suggestions */}
              <div className="flex flex-col gap-4">
                <div style={{ backgroundColor: '#10141c', border: '1px solid #1e2535', borderRadius: '8px', padding: '20px' }}>
                  <h3 style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '12px', fontWeight: 700, color: '#e2e8f0', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 16px' }}>Weight Assessment</h3>
                  <div className="flex flex-col gap-3">
                    {[...sectorPerformance].filter(s => s.totalCost > 0).sort((a, b) => b.totalCost - a.totalCost).map(s => {
                      const pct = totalCostAll > 0 ? (s.totalCost / totalCostAll) * 100 : 0;
                      const { label, color, bg } = getWeightLabel(pct);
                      return (
                        <div key={s.sector}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: SECTOR_COLORS[s.sector] || '#9CA3AF' }} />
                              <span style={{ fontSize: '13px', fontWeight: 500, color: '#cbd5e1' }}>{s.sector}</span>
                              <span style={{ fontSize: '11px', color: '#4a5568' }}>({activeCountBySector[s.sector] ?? s.positions})</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8' }}>{pct.toFixed(1)}%</span>
                              <span style={{ fontSize: '11px', fontWeight: 700, color: color, backgroundColor: bg, borderRadius: '4px', padding: '2px 6px' }}>{label}</span>
                            </div>
                          </div>
                          <div style={{ height: '4px', backgroundColor: '#1e2535', borderRadius: '4px', overflow: 'hidden' }}>
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
                  <div style={{ backgroundColor: 'rgba(30,37,53,0.5)', border: '1px solid #1e2535', borderRadius: '8px', padding: '16px' }}>
                    <h3 style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '12px', fontWeight: 700, color: '#e2e8f0', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 12px' }}>
                      <Target style={{ color: '#94a3b8' }} size={16} />
                      Rebalancing Guidance
                    </h3>
                    <ul className="flex flex-col gap-2">
                      {suggestions.map((suggestion, i) => (
                        <li key={i} style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.4 }}>{suggestion}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {/* Correlation Matrix + Insights */}
            <div style={{ marginTop: '32px', backgroundColor: '#10141c', border: '1px solid #1e2535', borderRadius: '8px', padding: '20px' }}>
              <h3 style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '12px', fontWeight: 700, color: '#e2e8f0', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 8px' }}>Sector Correlation Matrix</h3>
              <p style={{ fontSize: '11px', color: '#64748b', fontFamily: "'IBM Plex Mono',monospace", marginBottom: '16px' }}>Approximate historical correlations between your sectors. Green = low correlation (good diversification), Red = high correlation (similar risk exposure). Diagonal = same sector.</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '32px', alignItems: 'start' }}>
                {/* Matrix */}
                <div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ borderCollapse: 'collapse', fontSize: '11px', whiteSpace: 'nowrap' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #1e2535' }}>
                          <th style={{ padding: '6px 8px', textAlign: 'left', color: '#94a3b8', fontWeight: 700, fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', minWidth: '120px' }}></th>
                          {corrSectors.map(s => (
                            <th key={s} style={{ padding: '6px 6px', textAlign: 'center', color: '#94a3b8', fontWeight: 700, fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', maxWidth: '72px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={s}>
                              {s.length > 8 ? s.slice(0, 8) + '…' : s}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {corrSectors.map(row => (
                          <tr key={row}>
                            <td style={{ padding: '4px 8px', fontWeight: 600, color: '#94a3b8', borderRight: '1px solid #1e2535' }} title={row}>
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
                  <div style={{ display: 'flex', gap: '16px', marginTop: '16px', fontSize: '11px', color: '#94a3b8' }}>
                    <span><span style={{ display:'inline-block', width:10, height:10, backgroundColor:'rgba(16,185,129,0.15)', border:'1px solid rgba(16,185,129,0.3)', borderRadius:2, marginRight:4 }}/>Low (&lt;0.30)</span>
                    <span><span style={{ display:'inline-block', width:10, height:10, backgroundColor:'rgba(234,179,8,0.18)',   border:'1px solid rgba(234,179,8,0.3)',   borderRadius:2, marginRight:4 }}/>Moderate (0.30–0.50)</span>
                    <span><span style={{ display:'inline-block', width:10, height:10, backgroundColor:'rgba(249,115,22,0.18)',  border:'1px solid rgba(249,115,22,0.3)',  borderRadius:2, marginRight:4 }}/>High (0.50–0.70)</span>
                    <span><span style={{ display:'inline-block', width:10, height:10, backgroundColor:'rgba(239,68,68,0.18)',   border:'1px solid rgba(239,68,68,0.3)',   borderRadius:2, marginRight:4 }}/>Very High (&gt;0.70)</span>
                  </div>
                </div>

                {/* Insights panel */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* Portfolio correlation score */}
                  <div style={{ backgroundColor: 'rgba(30,37,53,0.5)', border: '1px solid #1e2535', borderRadius: '10px', padding: '14px 16px' }}>
                    <p style={{ fontSize: '11px', color: '#64748b', margin: '0 0 4px' }}>Portfolio Correlation Score</p>
                    <p style={{ fontSize: '24px', fontWeight: 'bold', margin: 0, color: corrInsights.weightedCorr >= 0.55 ? '#dc2626' : corrInsights.weightedCorr >= 0.40 ? '#d97706' : '#16a34a' }}>
                      {corrInsights.weightedCorr.toFixed(2)}
                    </p>
                    <p style={{ fontSize: '11px', color: '#64748b', margin: '4px 0 0' }}>
                      {corrInsights.weightedCorr >= 0.55 ? 'High — most sectors move together' : corrInsights.weightedCorr >= 0.40 ? 'Moderate — some correlated clusters' : 'Low — well diversified'}
                    </p>
                  </div>

                  {/* Risky correlated pairs */}
                  {corrInsights.riskyPairs.length > 0 && (
                    <div style={{ backgroundColor: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '10px', padding: '14px 16px' }}>
                      <p style={{ fontSize: '12px', fontWeight: 700, color: '#fbbf24', margin: '0 0 8px' }}>⚠️ Correlated Heavy Positions</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {corrInsights.riskyPairs.slice(0, 4).map(p => (
                          <div key={p.a + p.b} style={{ fontSize: '11px', color: '#fbbf24' }}>
                            <span style={{ fontWeight: 600 }}>{p.a}</span> ({p.wa.toFixed(0)}%) + <span style={{ fontWeight: 600 }}>{p.b}</span> ({p.wb.toFixed(0)}%)
                            <span style={{ float: 'right', color: '#f87171', fontWeight: 700 }}>{(p.corr * 100).toFixed(0)}% corr</span>
                            <div style={{ clear: 'both', fontSize: '10px', color: '#fbbf24' }}>{(p.wa + p.wb).toFixed(0)}% of portfolio moves together</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Best diversifiers */}
                  {corrInsights.avgCorrPerSector.length > 0 && (
                    <div style={{ backgroundColor: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '10px', padding: '14px 16px' }}>
                      <p style={{ fontSize: '12px', fontWeight: 700, color: '#34d399', margin: '0 0 8px' }}>✅ Best Diversifiers</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        {corrInsights.avgCorrPerSector.slice(0, 3).map(x => (
                          <div key={x.sector} style={{ fontSize: '11px', color: '#34d399' }}>
                            <span style={{ fontWeight: 600 }}>{x.sector}</span> ({x.pct.toFixed(0)}% of portfolio)
                            <span style={{ float: 'right', color: '#34d399', fontWeight: 700 }}>avg {(x.avgCorr * 100).toFixed(0)}% corr</span>
                          </div>
                        ))}
                      </div>
                      <p style={{ fontSize: '10px', color: '#34d399', marginTop: '6px', marginBottom: 0 }}>These sectors reduce portfolio-wide correlation the most.</p>
                    </div>
                  )}

                  {/* Under-diversified warning */}
                  {corrInsights.riskyPairs.slice(0, 1).map(p => (
                    <div key="main-risk" style={{ backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px', padding: '14px 16px' }}>
                      <p style={{ fontSize: '12px', fontWeight: 700, color: '#f87171', margin: '0 0 6px' }}>🔴 Main Concentration Risk</p>
                      <p style={{ fontSize: '11px', color: '#f87171', margin: 0 }}>
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
                    style={{ backgroundColor: '#0d1117', border: '1px solid #1e2535', borderRadius: '16px', padding: '28px', width: '480px', maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}
                    onClick={e => e.stopPropagation()}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <div>
                        <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#e2e8f0', margin: 0 }}>{selectedSector}</h3>
                        <p style={{ fontSize: '13px', color: '#64748b', margin: '2px 0 0' }}>{assets.length} position{assets.length !== 1 ? 's' : ''} · ${sectorTotal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} invested</p>
                      </div>
                      <button onClick={() => setSelectedSector(null)} style={{ border: 'none', background: '#1e2535', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', fontSize: '16px', color: '#94a3b8' }}>✕</button>
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
                                return <div style={{ background: '#10141c', border: '1px solid #1e2535', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', color: '#cbd5e1' }}><strong>{d.name}</strong><br />${d.value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} · {sectorTotal > 0 ? ((d.value / sectorTotal) * 100).toFixed(1) : 0}%</div>;
                              }
                              return null;
                            }} />
                          </RechartsPieChart>
                        </div>
                        <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
                          {[...assets].sort((a, b) => b.totalCost - a.totalCost).map((p, i) => (
                            <div key={p.symbol} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', backgroundColor: 'rgba(30,37,53,0.5)', borderRadius: '6px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ width: '10px', height: '10px', borderRadius: '3px', backgroundColor: HUE_PALETTE[i % HUE_PALETTE.length], flexShrink: 0 }} />
                                <span style={{ fontSize: '13px', fontWeight: '600', color: '#e2e8f0' }}>{p.symbol}</span>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <span style={{ fontSize: '13px', color: '#94a3b8' }}>${p.totalCost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                                <span style={{ fontSize: '11px', color: '#4a5568', marginLeft: '6px' }}>{sectorTotal > 0 ? ((p.totalCost / sectorTotal) * 100).toFixed(1) : 0}%</span>
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

      {/* Subsector Performance Section — Diversification tab */}
      {insightsTab === 'diversification' && (() => {
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
              style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: '#4a5568', fontFamily: "'IBM Plex Mono',monospace", textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer', userSelect: 'none', textAlign: right ? 'right' : 'left' }}
              onClick={() => setSubsectorSort(prev => ({ col: colKey, dir: prev.col === colKey && prev.dir === 'desc' ? 'asc' : 'desc' }))}
            >
              {label}{active ? (subsectorSort.dir === 'desc' ? ' ↓' : ' ↑') : ' ↕'}
            </th>
          );
        };

        return (
          <div className="mb-8">
            <h2 style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 16px' }}>
              <Activity style={{ color: '#64748b' }} size={16} />
              Subsector Performance
              {loadingMomentum && <span style={{ fontSize: '11px', fontWeight: 400, color: '#4a5568', marginLeft: '12px' }}>Loading momentum...</span>}
            </h2>
            <div style={{ backgroundColor: '#10141c', border: '1px solid #1e2535', borderRadius: '8px', display: 'flex' }}>
              {/* Pie */}
              <div style={{ width: '340px', flexShrink: 0, padding: '16px', borderRight: '1px solid #1e2535', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <p style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', fontFamily: "'IBM Plex Mono',monospace", textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Allocation by Subsector</p>
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
              <div style={{ flex: 1, overflow: 'auto', maxHeight: '380px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ background: '#10141c', position: 'sticky', top: 0, zIndex: 10 }}>
                    <tr>
                      <SortTh label="Subsector" colKey="subsector" right={false} />
                      <SortTh label="Alloc %" colKey="portfolioPct" />
                      <SortTh label="5d Mom" colKey="momentum5" />
                      <SortTh label="20d Mom" colKey="momentum20" />
                      <SortTh label="P&L %" colKey="pnlPct" />
                      <SortTh label="P&L $" colKey="totalPnL" />
                      <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: '#4a5568', fontFamily: "'IBM Plex Mono',monospace", textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left' }}>Holdings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((s, i) => (
                      <tr key={s.subsector} style={{ borderTop: '1px solid #1e2535' }}>
                        <td style={{ padding: '10px 16px' }}>
                          <div className="flex items-center gap-2">
                            <div style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: getColor(s.subsector, i), flexShrink: 0 }} />
                            <span style={{ fontWeight: 500, color: '#cbd5e1', whiteSpace: 'nowrap' }}>{s.subsector}</span>
                          </div>
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', color: '#94a3b8' }}>{s.portfolioPct.toFixed(1)}%</td>
                        <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                          {s.momentum5 != null
                            ? <span style={{ fontWeight: 700, color: s.momentum5 >= 0 ? '#34d399' : '#f87171' }}>
                                {s.momentum5 >= 0 ? '+' : ''}{s.momentum5.toFixed(1)}%
                              </span>
                            : <span style={{ color: '#2a3445' }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                          {s.momentum20 != null
                            ? <span style={{ fontWeight: 700, color: s.momentum20 >= 0 ? '#34d399' : '#f87171' }}>
                                {s.momentum20 >= 0 ? '+' : ''}{s.momentum20.toFixed(1)}%
                              </span>
                            : <span style={{ color: '#2a3445' }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                          <span style={{ fontWeight: 700, color: s.pnlPct >= 0 ? '#34d399' : '#f87171' }}>
                            {s.pnlPct >= 0 ? '+' : ''}{s.pnlPct.toFixed(1)}%
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                          <span style={{ fontWeight: 700, color: s.totalPnL >= 0 ? '#34d399' : '#f87171' }}>
                            {s.totalPnL >= 0 ? '+' : ''}${Math.round(s.totalPnL).toLocaleString()}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px', minWidth: 120 }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                            {s.symbols.map(sym => (
                              <span key={sym} style={{ background: 'rgba(30,37,53,0.6)', border: '1px solid #1e2535', borderRadius: 4, padding: '1px 5px', whiteSpace: 'nowrap', color: '#94a3b8', fontSize: '11px' }}>
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
          <h2 style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 16px' }}>
            <Heart style={{ color: '#64748b' }} size={16} />
            Portfolio Health
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
            <div style={{ backgroundColor: '#10141c', border: '1px solid #1e2535', borderLeft: '3px solid #8b5cf6', borderRadius: '8px', padding: '16px' }}>
              <p style={{ fontSize: '11px', color: '#64748b', fontFamily: "'IBM Plex Mono',monospace", marginBottom: '4px' }}>Diversification Score</p>
              <p style={{ fontSize: '22px', fontWeight: 700, color: '#a855f7', fontFamily: "'IBM Plex Mono',monospace" }}>{portfolioHealth.diversificationScore}/100</p>
              <p style={{ fontSize: '11px', color: '#4a5568', fontFamily: "'IBM Plex Mono',monospace" }}>Higher is better</p>
            </div>
            <div style={{ backgroundColor: '#10141c', border: '1px solid #1e2535', borderLeft: '3px solid #3b82f6', borderRadius: '8px', padding: '16px' }}>
              <p style={{ fontSize: '11px', color: '#64748b', fontFamily: "'IBM Plex Mono',monospace", marginBottom: '4px' }}>Overall Return</p>
              <p style={{ fontSize: '22px', fontWeight: 700, fontFamily: "'IBM Plex Mono',monospace", color: portfolioHealth.overallReturn >= 0 ? '#34d399' : '#f87171' }}>
                {portfolioHealth.overallReturn.toFixed(1)}%
              </p>
              <p style={{ fontSize: '11px', color: '#4a5568', fontFamily: "'IBM Plex Mono',monospace" }}>Total portfolio</p>
            </div>
            <div style={{ backgroundColor: '#10141c', border: '1px solid #1e2535', borderLeft: '3px solid #f59e0b', borderRadius: '8px', padding: '16px' }}>
              <p style={{ fontSize: '11px', color: '#64748b', fontFamily: "'IBM Plex Mono',monospace", marginBottom: '4px' }}>Concentration Risk</p>
              <p style={{ fontSize: '22px', fontWeight: 700, color: '#fbbf24', fontFamily: "'IBM Plex Mono',monospace" }}>{portfolioHealth.concentrationRisk}%</p>
              <p style={{ fontSize: '11px', color: '#4a5568', fontFamily: "'IBM Plex Mono',monospace" }}>Top 5 positions</p>
            </div>
            <div style={{ backgroundColor: '#10141c', border: '1px solid #1e2535', borderLeft: '3px solid #64748b', borderRadius: '8px', padding: '16px' }}>
              <p style={{ fontSize: '11px', color: '#64748b', fontFamily: "'IBM Plex Mono',monospace", marginBottom: '4px' }}>Dead Money</p>
              <p style={{ fontSize: '22px', fontWeight: 700, color: '#94a3b8', fontFamily: "'IBM Plex Mono',monospace" }}>{portfolioHealth.deadMoneyCount}</p>
              <p style={{ fontSize: '11px', color: '#4a5568', fontFamily: "'IBM Plex Mono',monospace" }}>Near breakeven positions</p>
            </div>
          </div>
        </div>
      )}

      {/* Tax Loss Harvesting Section — Diversification tab */}
      {insightsTab === 'diversification' && taxLossHarvesting && taxLossHarvesting.count > 0 && (
        <div className="mb-8">
          <h2 style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 16px' }}>
            <ShieldAlert style={{ color: '#64748b' }} size={16} />
            Tax Loss Harvesting Opportunities
          </h2>
          <div style={{ backgroundColor: 'rgba(239,68,68,0.06)', borderLeft: '3px solid #ef4444', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '20px', marginBottom: '16px' }}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p style={{ fontSize: '11px', color: '#64748b', fontFamily: "'IBM Plex Mono',monospace" }}>Candidates</p>
                <p style={{ fontSize: '22px', fontWeight: 700, color: '#e2e8f0', fontFamily: "'IBM Plex Mono',monospace" }}>{taxLossHarvesting.count}</p>
              </div>
              <div>
                <p style={{ fontSize: '11px', color: '#64748b', fontFamily: "'IBM Plex Mono',monospace" }}>Total Losses</p>
                <p className="text-2xl font-bold text-red-600">
                  ${taxLossHarvesting.totalLosses.toFixed(2)}
                </p>
              </div>
              <div>
                <p style={{ fontSize: '11px', color: '#64748b', fontFamily: "'IBM Plex Mono',monospace" }}>Potential Tax Savings (25%)</p>
                <p className="text-2xl font-bold text-green-600">
                  ${taxLossHarvesting.totalTaxSavings.toFixed(2)}
                </p>
              </div>
            </div>
          </div>
          <div style={{ backgroundColor: '#10141c', border: '1px solid #1e2535', borderRadius: '8px', overflow: 'hidden' }}>
            <table className="min-w-full">
              <thead style={{ background: '#10141c' }}>
                <tr>
                  <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#4a5568', fontFamily: "'IBM Plex Mono',monospace", textTransform: 'uppercase', letterSpacing: '0.08em' }}>Symbol</th>
                  <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#4a5568', fontFamily: "'IBM Plex Mono',monospace", textTransform: 'uppercase', letterSpacing: '0.08em' }}>Shares</th>
                  <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#4a5568', fontFamily: "'IBM Plex Mono',monospace", textTransform: 'uppercase', letterSpacing: '0.08em' }}>Unrealized Loss</th>
                  <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#4a5568', fontFamily: "'IBM Plex Mono',monospace", textTransform: 'uppercase', letterSpacing: '0.08em' }}>Tax Savings</th>
                </tr>
              </thead>
              <tbody>
                {taxLossHarvesting.candidates.slice(0, 10).map((candidate) => (
                  <tr key={candidate.symbol} style={{ borderTop: '1px solid #1e2535' }}>
                    <td style={{ padding: '16px 24px', whiteSpace: 'nowrap', fontSize: '13px', fontWeight: 600, color: '#cbd5e1' }}>
                      {candidate.symbol}
                    </td>
                    <td style={{ padding: '16px 24px', whiteSpace: 'nowrap', fontSize: '13px', color: '#94a3b8' }}>
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

      {/* Time-Based Insights Section — Timing tab */}
      {insightsTab === 'timing' && timeBasedInsights && (
        <div className="mb-8">
          <h2 style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 16px' }}>
            <Calendar style={{ color: '#64748b' }} size={16} />
            Time-Based Insights
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div style={{ backgroundColor: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '8px', padding: '20px' }}>
              <h3 style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '11px', fontWeight: 700, color: '#34d399', letterSpacing: '0.08em', margin: '0 0 8px' }}>Best Month</h3>
              <p style={{ fontSize: '22px', fontWeight: 700, color: '#34d399', fontFamily: "'IBM Plex Mono',monospace" }}>{timeBasedInsights.bestMonth.month}</p>
              <p style={{ fontSize: '13px', color: '#34d399', marginTop: '4px', opacity: 0.8 }}>
                ${timeBasedInsights.bestMonth.netInvested.toFixed(2)} net invested
              </p>
            </div>
            <div style={{ backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '20px' }}>
              <h3 style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '11px', fontWeight: 700, color: '#f87171', letterSpacing: '0.08em', margin: '0 0 8px' }}>Worst Month</h3>
              <p style={{ fontSize: '22px', fontWeight: 700, color: '#f87171', fontFamily: "'IBM Plex Mono',monospace" }}>{timeBasedInsights.worstMonth.month}</p>
              <p style={{ fontSize: '13px', color: '#f87171', marginTop: '4px', opacity: 0.8 }}>
                ${timeBasedInsights.worstMonth.netInvested.toFixed(2)} net invested
              </p>
            </div>
            <div style={{ backgroundColor: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '8px', padding: '20px' }}>
              <h3 style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '11px', fontWeight: 700, color: '#60a5fa', letterSpacing: '0.08em', margin: '0 0 8px' }}>Last 30 Days</h3>
              <p style={{ fontSize: '22px', fontWeight: 700, color: '#60a5fa', fontFamily: "'IBM Plex Mono',monospace" }}>{timeBasedInsights.recentActivity.trades}</p>
              <p style={{ fontSize: '13px', color: '#60a5fa', marginTop: '4px', opacity: 0.8 }}>
                {timeBasedInsights.recentActivity.buys} buys, {timeBasedInsights.recentActivity.sells} sells
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Cost Basis Insights Section — Timing tab */}
      {insightsTab === 'timing' && (
      <div>
        <h2 style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 16px' }}>
          <Target style={{ color: '#64748b' }} size={16} />
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

              const renderPositionTable = (positions: Position[], title: string, titleColor: string, accentColor: string, _bgColor: string, _borderColor: string) => (
                <div style={{ flex: 1, minWidth: '280px' }}>
                  <div style={{ backgroundColor: '#10141c', border: '1px solid #1e2535', borderLeft: `3px solid ${accentColor}`, borderRadius: '8px', overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e2535' }}>
                      <h3 style={{ fontSize: '13px', fontWeight: 700, color: titleColor, display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: 0 }}>
                        {title}
                        <span style={{ fontSize: '11px', fontWeight: 400, color: '#64748b' }}>({positions.length})</span>
                      </h3>
                    </div>
                    <div className="overflow-x-auto max-h-96 overflow-y-auto">
                      <table className="min-w-full">
                        <thead style={{ background: '#10141c', position: 'sticky', top: 0 }}>
                          <tr>
                            <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#4a5568', fontFamily: "'IBM Plex Mono',monospace", textTransform: 'uppercase', letterSpacing: '0.08em' }}>Symbol</th>
                            <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#4a5568', fontFamily: "'IBM Plex Mono',monospace", textTransform: 'uppercase', letterSpacing: '0.08em' }}>Shares</th>
                            <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#4a5568', fontFamily: "'IBM Plex Mono',monospace", textTransform: 'uppercase', letterSpacing: '0.08em' }}>Avg Cost</th>
                            <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#4a5568', fontFamily: "'IBM Plex Mono',monospace", textTransform: 'uppercase', letterSpacing: '0.08em' }}>Current</th>
                            <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#4a5568', fontFamily: "'IBM Plex Mono',monospace", textTransform: 'uppercase', letterSpacing: '0.08em' }}>P&L</th>
                          </tr>
                        </thead>
                        <tbody>
                          {positions.length > 0 ? positions.map((position) => {
                            const distancePercent = ((position.currentPrice - position.averageCost) / position.averageCost) * 100;
                            const isProfit = position.unrealizedPnL > 0;
                            const hasNoShares = position.shares <= 0;

                            return (
                              <tr key={position.symbol} style={{ borderTop: '1px solid #1e2535', opacity: hasNoShares ? 0.4 : 1 }}>
                                <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                                  <div style={{ fontSize: '13px', fontWeight: 600, color: hasNoShares ? '#4a5568' : '#cbd5e1' }}>
                                    {position.symbol}
                                  </div>
                                </td>
                                <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                                  <div style={{ fontSize: '11px', color: hasNoShares ? '#4a5568' : '#94a3b8' }}>
                                    {position.shares < 1
                                      ? position.shares.toFixed(4)
                                      : position.shares.toFixed(2)}
                                  </div>
                                </td>
                                <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                                  <div style={{ fontSize: '11px', color: hasNoShares ? '#4a5568' : '#94a3b8' }}>
                                    ${position.averageCost.toFixed(2)}
                                  </div>
                                </td>
                                <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                                  <div style={{ fontSize: '11px', color: hasNoShares ? '#4a5568' : '#94a3b8' }}>
                                    ${position.currentPrice.toFixed(2)}
                                  </div>
                                  <div style={{ fontSize: '11px', color: hasNoShares ? '#4a5568' : distancePercent >= 0 ? '#34d399' : '#f87171' }}>
                                    {distancePercent >= 0 ? '+' : ''}{distancePercent.toFixed(1)}%
                                  </div>
                                </td>
                                <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                                  <div style={{ fontSize: '13px', fontWeight: 700, color: hasNoShares ? '#4a5568' : isProfit ? '#34d399' : '#f87171' }}>
                                    ${position.unrealizedPnL.toFixed(2)}
                                  </div>
                                  <div style={{ fontSize: '11px', color: hasNoShares ? '#4a5568' : isProfit ? '#34d399' : '#f87171', opacity: 0.8 }}>
                                    {position.unrealizedPnLPercent.toFixed(1)}%
                                  </div>
                                </td>
                              </tr>
                            );
                          }) : (
                            <tr>
                              <td colSpan={5} style={{ padding: '12px', textAlign: 'center', fontSize: '13px', color: '#64748b' }}>
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
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
                  {renderPositionTable(profitPositions, '🟢 In Profit', '#34d399', '#10b981', '', '')}
                  {renderPositionTable(lossPositions, '🔴 At Loss', '#f87171', '#ef4444', '', '')}
                  {renderPositionTable(breakevenPositions, '🟡 Near Breakeven', '#fbbf24', '#f59e0b', '', '')}
                </div>
              );
            })()}
          </>
        ) : (
          <div style={{ backgroundColor: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.25)', borderLeft: '3px solid #fbbf24', borderRadius: '8px', padding: '16px' }}>
            <div className="flex items-center">
              <AlertTriangle style={{ color: '#fbbf24', marginRight: '8px' }} />
              <p style={{ color: '#fbbf24' }}>No open positions found. Upload portfolio data to see cost basis insights.</p>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Account Placement Audit Section — Account Structure tab */}
      {insightsTab === 'account' && accountPlacements.length > 0 && (() => {
        const visiblePlacements = hideInactivePlacements
          ? accountPlacements.filter(p => p.shares > 0.01)
          : accountPlacements;
        const misplaced = visiblePlacements.filter(p => p.status === 'misplaced');
        const suboptimal = visiblePlacements.filter(p => p.status === 'suboptimal');
        const optimal = visiblePlacements.filter(p => p.status === 'ok');
        const hiddenCount = accountPlacements.length - visiblePlacements.length;

        const statusBadge = (status: AccountPlacement['status']) => {
          if (status === 'ok') return (
            <span style={{ background: 'rgba(16,185,129,0.1)', color: '#34d399', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '4px', padding: '2px 8px', fontSize: '10px', fontWeight: 700, fontFamily: "'IBM Plex Mono',monospace", display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <CheckCircle size={11} /> Optimal
            </span>
          );
          if (status === 'suboptimal') return (
            <span style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.25)', borderRadius: '4px', padding: '2px 8px', fontSize: '10px', fontWeight: 700, fontFamily: "'IBM Plex Mono',monospace", display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <AlertTriangle size={11} /> Suboptimal
            </span>
          );
          return (
            <span style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '4px', padding: '2px 8px', fontSize: '10px', fontWeight: 700, fontFamily: "'IBM Plex Mono',monospace", display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <XCircle size={11} /> Misplaced
            </span>
          );
        };

        const accountBadge = (account: string) => {
          const styles: Record<string, React.CSSProperties> = {
            TFSA: { background: 'rgba(59,130,246,0.1)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)' },
            RRSP: { background: 'rgba(147,51,234,0.1)', color: '#a855f7', border: '1px solid rgba(147,51,234,0.2)' },
            FHSA: { background: 'rgba(99,102,241,0.1)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' },
            'Non-Reg': { background: 'rgba(100,116,139,0.1)', color: '#64748b', border: '1px solid rgba(100,116,139,0.2)' },
          };
          return (
            <span style={{ ...(styles[account] || styles['Non-Reg']), borderRadius: '4px', padding: '2px 8px', fontSize: '10px', fontWeight: 700, fontFamily: "'IBM Plex Mono',monospace" }}>
              {account}
            </span>
          );
        };

        const exchangeBadge = (exchange: string) => {
          const styles: Record<string, React.CSSProperties> = {
            TSX: { background: 'rgba(239,68,68,0.08)', color: '#f87171' },
            NYSE: { background: 'rgba(59,130,246,0.08)', color: '#60a5fa' },
            Crypto: { background: 'rgba(249,115,22,0.08)', color: '#fb923c' },
          };
          return (
            <span style={{ ...(styles[exchange] || { background: 'rgba(100,116,139,0.08)', color: '#64748b' }), borderRadius: '4px', padding: '2px 6px', fontSize: '10px', fontWeight: 500, fontFamily: "'IBM Plex Mono',monospace" }}>
              {exchange}
            </span>
          );
        };

        return (
          <div style={{ marginTop: '48px', marginBottom: '48px', paddingTop: '32px', borderTop: '1px solid #1e2535' }}>
            <div className="flex items-start justify-between mb-1">
              <h2 style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                <ShieldAlert style={{ color: '#64748b' }} size={16} />
                Account Placement Audit
              </h2>
              <label className="flex items-center gap-2 cursor-pointer select-none mt-1">
                <span style={{ fontSize: '13px', color: '#64748b' }}>Hide inactive</span>
                <div
                  onClick={() => setHideInactivePlacements(v => !v)}
                  style={{ position: 'relative', display: 'inline-flex', height: '20px', width: '36px', alignItems: 'center', borderRadius: '9999px', transition: 'background 0.15s', backgroundColor: hideInactivePlacements ? '#2563eb' : '#2a3445', cursor: 'pointer' }}
                >
                  <span style={{ display: 'inline-block', height: '14px', width: '14px', borderRadius: '9999px', backgroundColor: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', transition: 'transform 0.15s', transform: hideInactivePlacements ? 'translateX(18px)' : 'translateX(4px)' }} />
                </div>
              </label>
            </div>
            <p style={{ fontSize: '11px', color: '#64748b', fontFamily: "'IBM Plex Mono',monospace", margin: '8px 0 24px' }}>
              Each active position evaluated against Canadian tax-optimisation rules — TFSA for growth, RRSP for US dividend income (treaty), non-reg for eligible Canadian dividends.
            </p>

            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
              <div style={{ backgroundColor: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '8px', padding: '16px', textAlign: 'center' }}>
                <p style={{ fontSize: '28px', fontWeight: 700, color: '#34d399', fontFamily: "'IBM Plex Mono',monospace" }}>{optimal.length}</p>
                <p style={{ fontSize: '12px', color: '#34d399', fontWeight: 500, marginTop: '4px' }}>Optimally placed</p>
              </div>
              <div style={{ backgroundColor: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: '8px', padding: '16px', textAlign: 'center' }}>
                <p style={{ fontSize: '28px', fontWeight: 700, color: '#fbbf24', fontFamily: "'IBM Plex Mono',monospace" }}>{suboptimal.length}</p>
                <p style={{ fontSize: '12px', color: '#fbbf24', fontWeight: 500, marginTop: '4px' }}>Suboptimal placement</p>
              </div>
              <div style={{ backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '16px', textAlign: 'center' }}>
                <p style={{ fontSize: '28px', fontWeight: 700, color: '#f87171', fontFamily: "'IBM Plex Mono',monospace" }}>{misplaced.length}</p>
                <p style={{ fontSize: '12px', color: '#f87171', fontWeight: 500, marginTop: '4px' }}>Misplaced</p>
              </div>
            </div>

            {/* Placement table */}
            <div style={{ backgroundColor: '#10141c', border: '1px solid #1e2535', borderRadius: '8px', overflow: 'hidden' }}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead style={{ background: '#10141c', borderBottom: '1px solid #1e2535' }}>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '12px 16px', color: '#64748b', fontWeight: 700, fontSize: '11px', fontFamily: "'IBM Plex Mono',monospace" }}>Symbol</th>
                      <th style={{ textAlign: 'left', padding: '12px 16px', color: '#64748b', fontWeight: 700, fontSize: '11px', fontFamily: "'IBM Plex Mono',monospace" }}>Exchange</th>
                      <th style={{ textAlign: 'left', padding: '12px 16px', color: '#64748b', fontWeight: 700, fontSize: '11px', fontFamily: "'IBM Plex Mono',monospace" }}>Current Account</th>
                      <th style={{ textAlign: 'left', padding: '12px 16px', color: '#64748b', fontWeight: 700, fontSize: '11px', fontFamily: "'IBM Plex Mono',monospace" }}>Recommended</th>
                      <th style={{ textAlign: 'right', padding: '12px 16px', color: '#64748b', fontWeight: 700, fontSize: '11px', fontFamily: "'IBM Plex Mono',monospace" }}>Div Yield</th>
                      <th style={{ textAlign: 'right', padding: '12px 16px', color: '#64748b', fontWeight: 700, fontSize: '11px', fontFamily: "'IBM Plex Mono',monospace" }}>Mkt Value</th>
                      <th style={{ textAlign: 'left', padding: '12px 16px', color: '#64748b', fontWeight: 700, fontSize: '11px', fontFamily: "'IBM Plex Mono',monospace" }}>Status</th>
                      <th style={{ textAlign: 'left', padding: '12px 16px', color: '#64748b', fontWeight: 700, fontSize: '11px', fontFamily: "'IBM Plex Mono',monospace" }}>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiblePlacements.map((p, i) => (
                      <tr
                        key={`${p.symbol}-${p.currentAccount}-${i}`}
                        style={{
                          borderTop: '1px solid #1e2535',
                          backgroundColor:
                            p.status === 'misplaced' ? 'rgba(239,68,68,0.06)' :
                            p.status === 'suboptimal' ? 'rgba(251,191,36,0.06)' :
                            'transparent'
                        }}
                      >
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: '#cbd5e1' }}>{p.symbol}</td>
                        <td style={{ padding: '12px 16px' }}>{exchangeBadge(p.exchange)}</td>
                        <td style={{ padding: '12px 16px' }}>{accountBadge(p.currentAccount)}</td>
                        <td style={{ padding: '12px 16px' }}>
                          {p.currentAccount === p.recommendedAccount
                            ? <span style={{ color: '#4a5568', fontSize: '11px' }}>—</span>
                            : accountBadge(p.recommendedAccount)
                          }
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', color: '#94a3b8' }}>
                          {p.exchange === 'Crypto'
                            ? <span style={{ color: '#4a5568', fontSize: '11px' }}>—</span>
                            : p.dividendYield != null
                              ? <span style={{ color: p.dividendYield >= 1 ? '#34d399' : '#64748b', fontWeight: p.dividendYield >= 1 ? 600 : 400 }}>
                                  {p.dividendYield.toFixed(2)}%
                                </span>
                              : <span style={{ color: '#4a5568', fontSize: '11px' }}>—</span>
                          }
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', color: '#94a3b8' }}>
                          ${p.marketValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </td>
                        <td style={{ padding: '12px 16px' }}>{statusBadge(p.status)}</td>
                        <td style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', maxWidth: '240px' }}>{p.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {hiddenCount > 0 && (
              <p style={{ fontSize: '11px', color: '#4a5568', marginTop: '8px', textAlign: 'right' }}>
                {hiddenCount} closed position{hiddenCount !== 1 ? 's' : ''} hidden — toggle to show
              </p>
            )}

            {/* Key rules reminder */}
            <div style={{ marginTop: '16px', backgroundColor: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '8px', padding: '16px' }}>
              <p style={{ fontWeight: 700, marginBottom: '8px', color: '#60a5fa', fontSize: '13px' }}>Key placement rules</p>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: '4px', listStyle: 'disc', paddingLeft: '16px' }}>
                <li style={{ fontSize: '11px', color: '#93c5fd' }}>Canadian eligible dividends → Non-Reg (dividend tax credit often beats TFSA after tax)</li>
                <li style={{ fontSize: '11px', color: '#93c5fd' }}>US stocks → RRSP (Canada-US treaty eliminates 15% withholding; unrecoverable in TFSA)</li>
                <li style={{ fontSize: '11px', color: '#93c5fd' }}>Canadian growth stocks → TFSA (tax-free gains, no withholding drag)</li>
                <li style={{ fontSize: '11px', color: '#93c5fd' }}>Crypto → Non-Reg only (not eligible for registered accounts)</li>
                <li style={{ fontSize: '11px', color: '#93c5fd' }}>Priority: max TFSA first → max RRSP → spill into non-reg</li>
              </ul>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default Insights;
