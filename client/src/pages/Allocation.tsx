import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from 'react-query';
import axios from 'axios';
import { TrendingUp, Target, Calendar, AlertTriangle, Save, FolderOpen, Trash2, CheckCircle, XCircle, Clock, Activity } from 'lucide-react';
import FrameworkAllocationView from '../components/FrameworkAllocationView';
import PriceTargetsCard from '../components/PriceTargetsCard';

// ── palette ────────────────────────────────────────────────────────────────
const C = {
  bg:       '#0a0c10',
  card:     '#10141c',
  inner:    '#141820',
  border:   '#1e2535',
  text:     '#e2e8f0',
  sub:      '#94a3b8',
  dim:      '#4a5568',
  green:    '#10b981',
  red:      '#f43f5e',
  blue:     '#3b82f6',
  accent:   '#00d4aa',
  mono:     "'IBM Plex Mono', 'Courier New', monospace",
};

// ── types ──────────────────────────────────────────────────────────────────
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
  adjustments: { [symbol: string]: number };
  createdAt: string;
  updatedAt: string;
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
    rsi?: number;
    momentum20?: number;
    distanceFromMA200?: string;
  };
  reasons: string[];
}

// ── tiny helpers ───────────────────────────────────────────────────────────
const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, ...style }}>
    {children}
  </div>
);

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 700, color: C.dim, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
    {children}
  </div>
);

const Tag: React.FC<{ children: React.ReactNode; color?: string; bg?: string }> = ({ children, color = C.sub, bg = C.inner }) => (
  <span style={{ fontFamily: C.mono, fontSize: 10, fontWeight: 600, color, background: bg, border: `1px solid ${C.border}`, borderRadius: 3, padding: '2px 6px' }}>
    {children}
  </span>
);

const DarkInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input
    {...props}
    style={{
      width: '100%', padding: '8px 12px', background: C.inner, border: `1px solid ${C.border}`,
      borderRadius: 6, color: C.text, fontFamily: C.mono, fontSize: 13,
      outline: 'none', boxSizing: 'border-box', ...props.style,
    }}
  />
);

// ── component ──────────────────────────────────────────────────────────────
const Allocation: React.FC = () => {
  const [positions, setPositions] = useState<Position[]>([]);
  const [recurringInvestments, setRecurringInvestments] = useState<RecurringInvestment[]>([]);
  const [loading, setLoading] = useState(true);
  const [symbolSubsectors, setSymbolSubsectors] = useState<Record<string, string[]>>({});
  const [symbolMomentum, setSymbolMomentum] = useState<Record<string, number>>({});
  const [symbolMomentum5, setSymbolMomentum5] = useState<Record<string, number>>({});

  const [adjustments, setAdjustments] = useState<{ [symbol: string]: number }>({});
  const [showAdjustments, setShowAdjustments] = useState(false);
  const [searchSymbol, setSearchSymbol] = useState('');

  const [savedStrategies, setSavedStrategies] = useState<RebalancingStrategy[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [strategyName, setStrategyName] = useState('');
  const [strategyDescription, setStrategyDescription] = useState('');
  const [saveError, setSaveError] = useState('');
  const [selectedStrategyToOverwrite, setSelectedStrategyToOverwrite] = useState<string>('');

  const [holdingFilter, setHoldingFilter] = useState<'active' | 'all'>('active');

  // Same key as NewsBoard — served from React Query cache when NewsBoard was visited
  const { data: watchlistData } = useQuery(
    'watchlist-data',
    async () => {
      const res = await axios.get('/api/watchlist');
      return res.data as { active: string[]; inactive: string[]; custom: string[] };
    },
    { staleTime: 5 * 60_000, cacheTime: 30 * 60_000 }
  );

  const [recommendations, setRecommendations] = useState<RebalancingRecommendation[]>([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [showRecommendations, setShowRecommendations] = useState(false);

  useEffect(() => {
    fetchData();
    fetchSavedStrategies();
    fetchSubsectorData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/portfolio/insights');
      const data = await response.json();
      setPositions(data.positions || []);
      setRecurringInvestments(data.recurringInvestments || []);
    } catch (error) {
      console.error('Error fetching allocation data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSubsectorData = async () => {
    try {
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
        fetchMomentumData(Object.keys(map));
      }
    } catch (e) {
      console.error('Error fetching subsector data:', e);
    }
  };

  const fetchMomentumData = async (symbols: string[]) => {
    if (symbols.length === 0) return;
    try {
      const holdings = symbols.map(sym => ({ symbol: sym, currentInvestment: 0, unrealizedPnL: 0, realizedPnL: 0 }));
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

  const saveStrategy = async () => {
    try {
      setSaveError('');
      if (!strategyName.trim()) { setSaveError('Please enter a strategy name'); return; }
      if (Object.keys(adjustments).length === 0) { setSaveError('Please make at least one adjustment before saving'); return; }
      const overwrite = selectedStrategyToOverwrite !== '';
      const existingId = selectedStrategyToOverwrite || null;
      const response = await fetch('/api/strategies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: strategyName, description: strategyDescription, adjustments, overwrite, existingId }),
      });
      const responseData = await response.json();
      if (!response.ok) {
        setSaveError(responseData.error || 'Failed to save strategy');
        return;
      }
      await fetchSavedStrategies();
      setShowSaveModal(false);
      setStrategyName(''); setStrategyDescription(''); setSaveError(''); setSelectedStrategyToOverwrite('');
    } catch {
      setSaveError('Failed to save strategy');
    }
  };

  const loadStrategy = (strategy: RebalancingStrategy) => {
    setAdjustments(strategy.adjustments);
    setShowLoadModal(false);
    setShowAdjustments(true);
  };

  const deleteStrategy = async (id: string) => {
    if (!window.confirm('Delete this strategy?')) return;
    try {
      const response = await fetch(`/api/strategies/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete strategy');
      await fetchSavedStrategies();
    } catch {
      alert('Failed to delete strategy');
    }
  };

  const fetchRecommendations = async () => {
    if (Object.keys(adjustments).length === 0) { setRecommendations([]); setShowRecommendations(false); return; }
    try {
      setLoadingRecommendations(true);
      const currentAllocations: { [symbol: string]: number } = {};
      positions.forEach(p => { currentAllocations[p.symbol] = p.totalCost; });
      recurringInvestments.forEach(r => { currentAllocations[r.symbol] = r.totalInvested; });
      const response = await fetch('/api/rebalancing-recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adjustments, currentAllocations }),
      });
      if (!response.ok) throw new Error('Failed to fetch recommendations');
      const data = await response.json();
      setRecommendations(data.recommendations || []);
      setShowRecommendations(true);
    } catch {
      setRecommendations([]);
    } finally {
      setLoadingRecommendations(false);
    }
  };

  // ── derived ──────────────────────────────────────────────────────────────
  const allAssets = [
    ...positions.filter(p => p.shares > 0).map(p => ({
      symbol: p.symbol, totalCost: p.totalCost, currentValue: p.marketValue,
      unrealizedPnL: p.unrealizedPnL, isRecurring: false,
    })),
    ...recurringInvestments.map(r => ({
      symbol: r.symbol, totalCost: r.totalInvested, currentValue: r.currentValue,
      unrealizedPnL: r.currentValue - r.totalInvested, isRecurring: true,
    })),
  ];

  const grandTotalInvested = showAdjustments
    ? allAssets.reduce((s, a) => s + (adjustments[a.symbol] !== undefined ? adjustments[a.symbol] : a.totalCost), 0)
    : allAssets.reduce((s, a) => s + a.totalCost, 0);

  const originalTotal = allAssets.reduce((s, a) => s + a.totalCost, 0);

  // ── Framework positions helper ───────────────────────────────────────────
  const positionSymbols = useMemo(() => new Set(positions.map(p => p.symbol)), [positions]);

  const watchlistExtras = useMemo(() => {
    if (holdingFilter !== 'all' || !watchlistData) return [];
    const allWatchSyms = [
      ...(watchlistData.active   ?? []),
      ...(watchlistData.inactive ?? []),
      ...(watchlistData.custom   ?? []),
    ];
    return Array.from(new Set(allWatchSyms))
      .filter(sym => !positionSymbols.has(sym))
      .map(sym => ({ symbol: sym, shares: 0, marketValue: 0, totalCost: 0, sector: undefined as string | undefined, type: 's' as const, realizedPnL: 0, currentPrice: 0, averagePrice: undefined as number | undefined }));
  }, [holdingFilter, watchlistData, positionSymbols]);

  // ── loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ background: C.bg, minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: `2px solid ${C.border}`, borderTopColor: C.accent, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
          <p style={{ fontFamily: C.mono, fontSize: 12, color: C.dim, marginTop: 16, letterSpacing: '0.1em' }}>LOADING ALLOCATION…</p>
        </div>
      </div>
    );
  }

  const frameworkPositions = [
    ...positions.map(p => {
      if (showAdjustments && adjustments[p.symbol] !== undefined) {
        const simulatedCost = adjustments[p.symbol];
        if ((p.shares ?? 0) < 0.001 || (p.marketValue ?? 0) < 1) {
          return { symbol: p.symbol, shares: simulatedCost > 0 ? 1 : 0, marketValue: simulatedCost, totalCost: simulatedCost, sector: p.sector, type: p.type, realizedPnL: p.realizedPnL ?? 0, currentPrice: p.currentPrice, averagePrice: p.averageCost };
        }
        const ratio = p.totalCost > 0 ? simulatedCost / p.totalCost : 0;
        return { symbol: p.symbol, shares: simulatedCost > 0 ? p.shares : 0, marketValue: p.marketValue * ratio, totalCost: simulatedCost, sector: p.sector, type: p.type, realizedPnL: p.realizedPnL ?? 0, currentPrice: p.currentPrice, averagePrice: p.averageCost };
      }
      return { symbol: p.symbol, shares: p.shares, marketValue: p.marketValue, totalCost: p.totalCost, sector: p.sector, type: p.type, realizedPnL: p.realizedPnL ?? 0, currentPrice: p.currentPrice, averagePrice: p.averageCost };
    }),
    ...(showAdjustments
      ? Object.entries(adjustments)
          .filter(([sym, amt]) => amt > 0 && !positions.some(p => p.symbol === sym))
          .map(([sym, amt]) => ({ symbol: sym, shares: 1, marketValue: amt, totalCost: amt, sector: undefined as string | undefined, type: 's' as const, realizedPnL: 0 }))
      : []),
  ];

  // ── btn styles ───────────────────────────────────────────────────────────
  const btnPrimary = (color = C.blue) => ({
    background: color, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px',
    fontFamily: C.mono, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
    letterSpacing: '0.06em',
  } as React.CSSProperties);

  const btnGhost = {
    background: C.inner, color: C.sub, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 14px',
    fontFamily: C.mono, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
    letterSpacing: '0.06em',
  } as React.CSSProperties;

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ background: C.bg, minHeight: '100%' }}>
      {/* ── page header ── */}
      <div style={{ background: C.card, borderBottom: `1px solid ${C.border}`, padding: '12px 20px' }}>
        <div style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 700, color: C.sub, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Targets
        </div>
        <div style={{ fontSize: 11, color: C.dim, marginTop: 2, fontFamily: C.mono }}>
          Price Targets · Upside · Framework · Simulator · Rebalancing
        </div>
      </div>

      {/* ── content ── */}
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* ── no data state ── */}
        {positions.length === 0 && recurringInvestments.length === 0 && (
          <Card style={{ padding: 32, textAlign: 'center' }}>
            <AlertTriangle size={24} style={{ color: C.dim, marginBottom: 12 }} />
            <p style={{ fontFamily: C.mono, fontSize: 12, color: C.dim }}>No positions found. Upload portfolio data to see allocation.</p>
          </Card>
        )}

        {/* ── Price Targets & Upside ── */}
        <PriceTargetsCard />

        {/* ── Framework Allocation View ── */}
        {(positions.length > 0 || recurringInvestments.length > 0) && (
          <Card>
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <SectionLabel>Portfolio Framework Allocation</SectionLabel>
                <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, marginTop: 4 }}>
                  Anchor · Supporting · Speculative — with sector targets and sizing compliance
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {showAdjustments && Object.keys(adjustments).length > 0 && (
                  <Tag color={C.blue}>Simulated View</Tag>
                )}
                <div style={{ display: 'flex', borderRadius: 4, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
                  {(['active', 'all'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setHoldingFilter(f)}
                      style={{
                        fontFamily: C.mono, fontSize: 10, fontWeight: holdingFilter === f ? 700 : 400,
                        padding: '3px 10px', cursor: 'pointer', letterSpacing: '0.06em',
                        color: holdingFilter === f ? C.text : C.dim,
                        background: holdingFilter === f ? 'rgba(148,163,184,0.12)' : 'transparent',
                        border: 'none', textTransform: 'uppercase' as const, transition: 'all 0.12s',
                      }}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ padding: 16 }}>
              <FrameworkAllocationView
                positions={frameworkPositions}
                symbolSubsectors={symbolSubsectors}
                symbolMomentum5={symbolMomentum5}
                symbolMomentum20={symbolMomentum}
                showAll={holdingFilter === 'all'}
              />
            </div>
          </Card>
        )}

        {/* ── Rebalancing Simulator ── */}
        {(positions.length > 0 || recurringInvestments.length > 0) && (
          <Card>
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <SectionLabel>Portfolio Rebalancing Simulator</SectionLabel>
                <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, marginTop: 4 }}>Adjust asset investments to see how framework targets change</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={btnPrimary('#7c3aed')} onClick={() => setShowLoadModal(true)}>
                  <FolderOpen size={13} /> Load
                </button>
                <button
                  style={showAdjustments ? btnPrimary(C.blue) : btnGhost}
                  onClick={() => setShowAdjustments(!showAdjustments)}
                >
                  {showAdjustments ? 'Hide Simulator' : 'Show Simulator'}
                </button>
              </div>
            </div>

            {showAdjustments && (
              <div style={{ padding: 16 }}>
                {/* Totals row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, padding: '10px 14px', background: C.inner, borderRadius: 6, border: `1px solid ${C.border}` }}>
                  <div style={{ display: 'flex', gap: 24 }}>
                    <div>
                      <div style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>Original</div>
                      <div style={{ fontFamily: C.mono, fontSize: 14, fontWeight: 600, color: C.text }}>${originalTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                    <div>
                      <div style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>Adjusted</div>
                      <div style={{ fontFamily: C.mono, fontSize: 14, fontWeight: 600, color: grandTotalInvested > originalTotal ? C.green : grandTotalInvested < originalTotal ? C.red : C.text }}>
                        ${grandTotalInvested.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      style={{ ...btnPrimary(C.blue), opacity: Object.keys(adjustments).length === 0 || loadingRecommendations ? 0.5 : 1, cursor: Object.keys(adjustments).length === 0 ? 'not-allowed' : 'pointer' }}
                      onClick={fetchRecommendations}
                      disabled={Object.keys(adjustments).length === 0 || loadingRecommendations}
                    >
                      <Activity size={13} />
                      {loadingRecommendations ? 'Analyzing…' : 'Get Recommendations'}
                    </button>
                    <button
                      style={{ ...btnPrimary('#059669'), opacity: Object.keys(adjustments).length === 0 ? 0.5 : 1, cursor: Object.keys(adjustments).length === 0 ? 'not-allowed' : 'pointer' }}
                      onClick={() => setShowSaveModal(true)}
                      disabled={Object.keys(adjustments).length === 0}
                    >
                      <Save size={13} /> Save
                    </button>
                    <button
                      style={{ background: '#1a0a0a', color: C.red, border: `1px solid #3a1515`, borderRadius: 6, padding: '8px 14px', fontFamily: C.mono, fontSize: 12, fontWeight: 600, cursor: 'pointer', letterSpacing: '0.06em' }}
                      onClick={() => { setAdjustments({}); setSearchSymbol(''); setRecommendations([]); setShowRecommendations(false); }}
                    >
                      Reset
                    </button>
                  </div>
                </div>

                {/* Search */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Search asset to adjust</div>
                  <DarkInput
                    type="text"
                    value={searchSymbol}
                    onChange={(e) => setSearchSymbol(e.target.value.toUpperCase())}
                    placeholder="AAPL, BTC, XIU.TO…"
                  />
                </div>

                {/* Asset cards */}
                {(() => {
                  const extraAdjusted = Object.keys(adjustments)
                    .filter(sym => !allAssets.some(a => a.symbol === sym))
                    .map(sym => ({ symbol: sym, totalCost: 0, currentValue: 0, unrealizedPnL: 0, isRecurring: false as const }));

                  const filtered = [...allAssets, ...extraAdjusted]
                    .filter(a => adjustments[a.symbol] !== undefined || searchSymbol === '' || a.symbol.includes(searchSymbol))
                    .sort((a, b) => {
                      const aAdj = adjustments[a.symbol] !== undefined;
                      const bAdj = adjustments[b.symbol] !== undefined;
                      if (aAdj && !bAdj) return -1;
                      if (!aAdj && bAdj) return 1;
                      return b.totalCost - a.totalCost;
                    });

                  const isNewSymbol = searchSymbol && !allAssets.some(a => a.symbol === searchSymbol) && !adjustments[searchSymbol];

                  if (filtered.length === 0) {
                    return (
                      <div style={{ textAlign: 'center', padding: '32px 0', color: C.dim, fontFamily: C.mono, fontSize: 12 }}>
                        {isNewSymbol ? (
                          <div>
                            <p style={{ marginBottom: 12 }}>"{searchSymbol}" not in portfolio</p>
                            <button style={btnPrimary(C.blue)} onClick={() => setAdjustments({ ...adjustments, [searchSymbol]: 0 })}>
                              + Add {searchSymbol} to simulation
                            </button>
                          </div>
                        ) : (
                          <p>{searchSymbol ? `No match for "${searchSymbol}"` : 'Search for an asset above'}</p>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div>
                      {isNewSymbol && (
                        <div style={{ marginBottom: 10 }}>
                          <button style={btnPrimary(C.blue)} onClick={() => setAdjustments({ ...adjustments, [searchSymbol]: 0 })}>
                            + Add {searchSymbol} to simulation
                          </button>
                        </div>
                      )}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10, maxHeight: 380, overflowY: 'auto' }}>
                        {filtered.map((asset) => {
                          const isNew = !allAssets.some(a => a.symbol === asset.symbol);
                          const currentVal = adjustments[asset.symbol] !== undefined ? adjustments[asset.symbol] : asset.totalCost;
                          const diff = currentVal - asset.totalCost;
                          return (
                            <div key={asset.symbol} style={{ background: C.inner, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12 }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 700, color: C.text }}>{asset.symbol}</span>
                                  {isNew && <Tag color={C.green}>New</Tag>}
                                  {!isNew && asset.isRecurring && <Tag color={C.blue}>DCA</Tag>}
                                </div>
                                {(diff !== 0 || isNew) && (
                                  <button
                                    style={{ background: 'none', border: 'none', color: C.red, fontFamily: C.mono, fontSize: 10, cursor: 'pointer', padding: '2px 4px' }}
                                    onClick={() => { const n = { ...adjustments }; delete n[asset.symbol]; setAdjustments(n); }}
                                  >
                                    {isNew ? 'Remove' : 'Reset'}
                                  </button>
                                )}
                              </div>
                              <div style={{ marginBottom: 8 }}>
                                <div style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, marginBottom: 4 }}>Invested Amount</div>
                                <input
                                  type="number"
                                  value={currentVal.toFixed(2)}
                                  onChange={(e) => setAdjustments({ ...adjustments, [asset.symbol]: parseFloat(e.target.value) || 0 })}
                                  step="100"
                                  style={{ width: '100%', padding: '6px 10px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: C.mono, fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
                                />
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: C.mono, fontSize: 10 }}>
                                <span style={{ color: C.dim }}>Original: ${asset.totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                {diff !== 0 && (
                                  <span style={{ color: diff > 0 ? C.green : C.red, fontWeight: 600 }}>
                                    {diff > 0 ? '+' : ''}${diff.toLocaleString(undefined, { maximumFractionDigits: 0 })}
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
          </Card>
        )}

        {/* ── Recommendations ── */}
        {showRecommendations && recommendations.length > 0 && (
          <Card>
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Activity size={14} style={{ color: C.blue }} />
              <div>
                <SectionLabel>Timing Recommendations</SectionLabel>
                <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, marginTop: 3 }}>Technical analysis (200-day MA · RSI · Momentum)</div>
              </div>
            </div>
            <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
              {recommendations.map((rec) => {
                const timingColor = {
                  EXCELLENT: C.green,
                  GOOD: C.blue,
                  NEUTRAL: '#f59e0b',
                  POOR: C.red,
                  INSUFFICIENT_DATA: C.dim,
                  ERROR: C.dim,
                }[rec.timing] ?? C.dim;

                const timingIcon = {
                  EXCELLENT: <CheckCircle size={12} />,
                  GOOD: <CheckCircle size={12} />,
                  NEUTRAL: <Clock size={12} />,
                  POOR: <XCircle size={12} />,
                  INSUFFICIENT_DATA: <AlertTriangle size={12} />,
                  ERROR: <AlertTriangle size={12} />,
                }[rec.timing];

                return (
                  <div key={rec.symbol} style={{ background: C.inner, border: `1px solid ${C.border}`, borderLeft: `3px solid ${timingColor}`, borderRadius: 6, padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: timingColor }}>
                        {timingIcon}
                        <span style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 700, color: C.text }}>{rec.symbol}</span>
                      </div>
                      <Tag color={rec.action === 'BUY' ? C.green : C.red} bg={rec.action === 'BUY' ? '#0a2a1a' : '#2a0a0a'}>
                        {rec.action}
                      </Tag>
                    </div>
                    <div style={{ fontFamily: C.mono, fontSize: 10, color: timingColor, fontWeight: 700, letterSpacing: '0.08em' }}>
                      {rec.timing} <span style={{ color: C.dim, fontWeight: 400 }}>· {rec.confidence}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      {[['Current', rec.currentInvestment], ['Target', rec.targetInvestment]].map(([lbl, val]) => (
                        <div key={String(lbl)} style={{ background: C.bg, borderRadius: 4, padding: '6px 8px' }}>
                          <div style={{ fontFamily: C.mono, fontSize: 9, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{lbl}</div>
                          <div style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 600, color: C.text }}>${(Number(val) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontFamily: C.mono, fontSize: 10, color: C.sub }}>{rec.recommendation}</div>
                    {rec.reasons && rec.reasons.length > 0 && (
                      <details>
                        <summary style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, cursor: 'pointer', letterSpacing: '0.06em' }}>Key Factors ({rec.reasons.length})</summary>
                        <ul style={{ marginTop: 4, paddingLeft: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {rec.reasons.map((r, i) => (
                            <li key={i} style={{ fontFamily: C.mono, fontSize: 10, color: C.sub }}>{r}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                    {rec.indicators && Object.keys(rec.indicators).length > 0 && (
                      <details>
                        <summary style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, cursor: 'pointer', letterSpacing: '0.06em' }}>Technical Indicators</summary>
                        <div style={{ marginTop: 4, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                          {rec.indicators.currentPrice != null && <div style={{ fontFamily: C.mono, fontSize: 10, color: C.sub }}>Price: <span style={{ color: C.text }}>${rec.indicators.currentPrice.toFixed(2)}</span></div>}
                          {rec.indicators.sma200 != null && <div style={{ fontFamily: C.mono, fontSize: 10, color: C.sub }}>200MA: <span style={{ color: C.text }}>${rec.indicators.sma200.toFixed(2)}</span></div>}
                          {rec.indicators.rsi != null && <div style={{ fontFamily: C.mono, fontSize: 10, color: C.sub }}>RSI: <span style={{ color: C.text }}>{rec.indicators.rsi.toFixed(1)}</span></div>}
                          {rec.indicators.momentum20 != null && <div style={{ fontFamily: C.mono, fontSize: 10, color: C.sub }}>Mom: <span style={{ color: rec.indicators.momentum20 > 0 ? C.green : C.red }}>{rec.indicators.momentum20.toFixed(1)}%</span></div>}
                        </div>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* ── Holding Period Breakdown ── */}
        {positions.filter(p => p.shares > 0 && p.holdingDays !== undefined).length > 0 && (() => {
          const active = positions.filter(p => p.shares > 0 && p.holdingDays !== undefined);
          const groups = [
            { label: 'Short Term', sub: '< 3 months', filter: (p: Position) => (p.holdingDays ?? 0) < 90, accent: C.blue },
            { label: 'Medium Term', sub: '3–12 months', filter: (p: Position) => (p.holdingDays ?? 0) >= 90 && (p.holdingDays ?? 0) < 365, accent: '#f59e0b' },
            { label: 'Long Term', sub: '> 1 year', filter: (p: Position) => (p.holdingDays ?? 0) >= 365, accent: C.green },
          ].map(g => {
            const members = active.filter(g.filter);
            const totalValue = members.reduce((s, p) => s + p.marketValue, 0);
            const avgReturn = members.length > 0 ? members.reduce((s, p) => s + p.unrealizedPnLPercent, 0) / members.length : 0;
            return { ...g, members, totalValue, avgReturn };
          });

          return (
            <Card>
              <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                <Calendar size={14} style={{ color: C.sub }} />
                <div>
                  <SectionLabel>Holding Period Breakdown</SectionLabel>
                  <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, marginTop: 3 }}>Performance grouped by duration</div>
                </div>
              </div>
              <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                {groups.map((g, i) => (
                  <div key={i} style={{ background: C.inner, border: `1px solid ${C.border}`, borderLeft: `3px solid ${g.accent}`, borderRadius: 6, padding: 14 }}>
                    <div style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 2 }}>{g.label}</div>
                    <div style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, marginBottom: 12 }}>{g.sub}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
                      <div>
                        <div style={{ fontFamily: C.mono, fontSize: 18, fontWeight: 700, color: C.text }}>{g.members.length}</div>
                        <div style={{ fontFamily: C.mono, fontSize: 9, color: C.dim, textTransform: 'uppercase' }}>positions</div>
                      </div>
                      <div>
                        <div style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 600, color: C.text }}>${g.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                        <div style={{ fontFamily: C.mono, fontSize: 9, color: C.dim, textTransform: 'uppercase' }}>value</div>
                      </div>
                      <div>
                        <div style={{ fontFamily: C.mono, fontSize: 14, fontWeight: 700, color: g.avgReturn >= 0 ? C.green : C.red }}>
                          {g.avgReturn >= 0 ? '+' : ''}{g.avgReturn.toFixed(1)}%
                        </div>
                        <div style={{ fontFamily: C.mono, fontSize: 9, color: C.dim, textTransform: 'uppercase' }}>avg ret</div>
                      </div>
                    </div>
                    {g.members.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {g.members.map(p => (
                          <span key={p.symbol} style={{ fontFamily: C.mono, fontSize: 10, fontWeight: 600, color: p.unrealizedPnLPercent >= 0 ? C.green : C.red, background: p.unrealizedPnLPercent >= 0 ? '#0a2a1a' : '#2a0a0a', border: `1px solid ${p.unrealizedPnLPercent >= 0 ? '#1a4a2a' : '#4a1a1a'}`, borderRadius: 3, padding: '2px 5px' }}>
                            {p.symbol}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, fontStyle: 'italic' }}>No positions</p>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          );
        })()}
      </div>

      {/* ── Save Strategy Modal ── */}
      {showSaveModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setShowSaveModal(false)}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 24, width: 420, maxWidth: '100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 16 }}>Save Rebalancing Strategy</div>
            {saveError && <div style={{ background: '#2a0a0a', border: `1px solid #4a1a1a`, borderRadius: 6, padding: '8px 12px', color: C.red, fontFamily: C.mono, fontSize: 12, marginBottom: 12 }}>{saveError}</div>}

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Overwrite existing (optional)</div>
              <select
                value={selectedStrategyToOverwrite}
                onChange={(e) => {
                  setSelectedStrategyToOverwrite(e.target.value);
                  if (e.target.value) {
                    const s = savedStrategies.find(s => s.id === e.target.value);
                    if (s) { setStrategyName(s.name); setStrategyDescription(s.description); }
                  }
                }}
                style={{ width: '100%', padding: '8px 12px', background: C.inner, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: C.mono, fontSize: 12, outline: 'none' }}
              >
                <option value="">Create New</option>
                {savedStrategies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Strategy Name *</div>
              <DarkInput value={strategyName} onChange={e => setStrategyName(e.target.value)} placeholder="e.g., Increase Tech Holdings" />
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Description (optional)</div>
              <textarea
                value={strategyDescription}
                onChange={e => setStrategyDescription(e.target.value)}
                placeholder="Notes about this strategy…"
                rows={3}
                style={{ width: '100%', padding: '8px 12px', background: C.inner, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: C.mono, fontSize: 12, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ background: C.inner, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 12px', marginBottom: 16, fontFamily: C.mono, fontSize: 11, color: C.dim }}>
              {Object.keys(adjustments).length} assets modified
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ ...btnPrimary('#059669'), flex: 1, justifyContent: 'center' }} onClick={saveStrategy}>
                {selectedStrategyToOverwrite ? 'Overwrite' : 'Save Strategy'}
              </button>
              <button style={{ ...btnGhost, flex: 1, justifyContent: 'center' }} onClick={() => { setShowSaveModal(false); setSaveError(''); setStrategyName(''); setStrategyDescription(''); setSelectedStrategyToOverwrite(''); }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Load Strategy Modal ── */}
      {showLoadModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setShowLoadModal(false)}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 24, width: 560, maxWidth: '100%', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 16 }}>Load Rebalancing Strategy</div>

            {savedStrategies.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <FolderOpen size={32} style={{ color: C.dim, marginBottom: 12 }} />
                <p style={{ fontFamily: C.mono, fontSize: 12, color: C.dim }}>No saved strategies</p>
                <p style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, marginTop: 4 }}>Create adjustments and save them to reuse later</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {savedStrategies.map(s => (
                  <div key={s.id} style={{ background: C.inner, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 2 }}>{s.name}</div>
                        {s.description && <div style={{ fontFamily: C.mono, fontSize: 11, color: C.sub, marginBottom: 6 }}>{s.description}</div>}
                        <div style={{ display: 'flex', gap: 16, fontFamily: C.mono, fontSize: 10, color: C.dim }}>
                          <span>{Object.keys(s.adjustments).length} assets</span>
                          <span>{new Date(s.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginLeft: 12 }}>
                        <button style={btnPrimary(C.blue)} onClick={() => loadStrategy(s)}>Load</button>
                        <button
                          style={{ background: '#1a0a0a', color: C.red, border: `1px solid #3a1515`, borderRadius: 6, padding: '8px 10px', fontFamily: C.mono, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                          onClick={() => deleteStrategy(s.id)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button style={{ ...btnGhost, width: '100%', justifyContent: 'center' }} onClick={() => setShowLoadModal(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default Allocation;
