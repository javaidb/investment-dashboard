import React, { useState, useMemo } from 'react';
import { useQuery } from 'react-query';
import axios from 'axios';
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { useCache } from '../contexts/CacheContext';
import CompanyIcon from '../components/CompanyIcon';
import { TrendingUp, TrendingDown, Minus, RefreshCw, ChevronRight } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FibLevels {
  level0: number;
  level236: number;
  level382: number;
  level500: number;
  level618: number;
  level786: number;
  level1000: number;
}

interface FibZone {
  pct: number;      // 0–100: where current price sits in [swingLow, swingHigh]
  fibLabel: string;
  signal: string;
  color: string;
}

interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface HoldingStrength {
  nearestLevelKey: string;
  nearestLevelLabel: string;
  nearestLevelPrice: number;
  distancePct: number;
  consecutiveDays: number;
  holdingAbove: boolean;
  strength: 'strong' | 'moderate' | 'weak' | 'none';
  bounceStatus: 'bouncing' | 'sitting' | 'breaking';
  volumeRatio: number;
  volumeConfirmed: boolean;
}

interface FibData {
  symbol: string;
  requestedSymbol: string;
  period: string;
  currency: string;
  swingHigh: number;
  swingLow: number;
  currentPrice: number;
  levels: FibLevels;
  zone: FibZone;
  holding: HoldingStrength | null;
  candles?: Candle[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PERIOD_OPTIONS = [
  { value: '3m', label: '3M' },
  { value: '6m', label: '6M' },
  { value: '1y', label: '1Y' },
  { value: '2y', label: '2Y' },
];

// Each entry: the fib retracement % label + where it sits on the 0–100 position bar
// barPct = (level_price - swingLow) / (swingHigh - swingLow) * 100
// = (1 - fibRetracePct/100) * 100
const FIB_CONFIG = [
  { levelKey: 'level1000', retracePct: 0,    barPct: 100,  label: '0%',    color: '#8b5cf6' },
  { levelKey: 'level786',  retracePct: 23.6, barPct: 76.4, label: '23.6%', color: '#f97316' },
  { levelKey: 'level618',  retracePct: 38.2, barPct: 61.8, label: '38.2%', color: '#eab308' },
  { levelKey: 'level500',  retracePct: 50,   barPct: 50.0, label: '50%',   color: '#6b7280' },
  { levelKey: 'level382',  retracePct: 61.8, barPct: 38.2, label: '61.8%', color: '#22c55e' },
  { levelKey: 'level236',  retracePct: 78.6, barPct: 21.4, label: '78.6%', color: '#3b82f6' },
  { levelKey: 'level0',    retracePct: 100,  barPct: 0,    label: '100%',  color: '#ef4444' },
];

// ---------------------------------------------------------------------------
// Candlestick custom shape for recharts Bar
// ---------------------------------------------------------------------------

const CandleBar: React.FC<any> = (props) => {
  const { x, y, width, height } = props;
  // recharts passes data fields directly as props for custom shapes
  const open  = props.open  ?? props.payload?.open;
  const close = props.close ?? props.payload?.close;
  const high  = props.high  ?? props.payload?.high;
  const low   = props.low   ?? props.payload?.low;

  if (height == null || height <= 0 || high == null || low == null || open == null || close == null) {
    return null;
  }

  const range = high - low;
  if (range === 0) return null;

  // y = screen pixel of high (top), y + height = screen pixel of low (bottom)
  const openY  = y + ((high - open)  / range) * height;
  const closeY = y + ((high - close) / range) * height;
  const isUp   = close >= open;
  const fill   = isUp ? '#22c55e' : '#ef4444';
  const cx     = x + width / 2;
  const barW   = Math.max(width - 2, 1);

  return (
    <g>
      {/* Wick: full high-to-low range */}
      <line x1={cx} y1={y} x2={cx} y2={y + height} stroke={fill} strokeWidth={1} />
      {/* Body: open-to-close */}
      <rect
        x={cx - barW / 2}
        y={Math.min(openY, closeY)}
        width={barW}
        height={Math.max(Math.abs(closeY - openY), 1)}
        fill={fill}
        stroke={fill}
        strokeWidth={0.5}
      />
    </g>
  );
};

// ---------------------------------------------------------------------------
// Tooltip for candlestick chart
// ---------------------------------------------------------------------------

const CandleTooltip: React.FC<any> = ({ active, payload, currency }) => {
  if (!active || !payload || !payload[0]) return null;
  const d = payload[0].payload as Candle;
  if (!d) return null;
  const fmt = (v: number) =>
    v.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const isUp = d.close >= d.open;
  return (
    <div style={{
      background: '#1e293b', border: '1px solid #334155', borderRadius: 8,
      padding: '10px 14px', fontSize: 12, color: '#e2e8f0', minWidth: 160,
    }}>
      <div style={{ color: '#94a3b8', marginBottom: 6, fontWeight: 600 }}>{d.date}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 16px' }}>
        <span style={{ color: '#64748b' }}>O</span><span>{fmt(d.open)}</span>
        <span style={{ color: '#64748b' }}>H</span><span style={{ color: '#22c55e' }}>{fmt(d.high)}</span>
        <span style={{ color: '#64748b' }}>L</span><span style={{ color: '#ef4444' }}>{fmt(d.low)}</span>
        <span style={{ color: '#64748b' }}>C</span>
        <span style={{ color: isUp ? '#22c55e' : '#ef4444', fontWeight: 700 }}>{fmt(d.close)}</span>
      </div>
      <div style={{ color: '#64748b', marginTop: 6 }}>{currency}</div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Master candlestick chart with Fib levels
// ---------------------------------------------------------------------------

interface MasterChartProps {
  data: FibData;
}

const MasterChart: React.FC<MasterChartProps> = ({ data }) => {
  const { candles = [], swingHigh, swingLow, levels, currentPrice } = data;

  const chartData = useMemo(() =>
    candles.map(c => ({
      ...c,
      range: [c.low, c.high] as [number, number],
    })),
    [candles]
  );

  const padding = (swingHigh - swingLow) * 0.05;
  const yDomain: [number, number] = [
    Math.max(0, swingLow - padding),
    swingHigh + padding,
  ];

  const tickInterval = Math.max(1, Math.floor(chartData.length / 7));

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
  };

  const formatPrice = (v: number) => v.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div style={{ background: '#0f172a', borderRadius: 12, padding: '16px 8px 8px', width: '100%' }}>
      {/* Fib level legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px', marginBottom: 12, padding: '0 8px' }}>
        {FIB_CONFIG.map(cfg => {
          const price = levels[cfg.levelKey as keyof FibLevels];
          return (
            <div key={cfg.levelKey} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
              <div style={{ width: 20, height: 2, background: cfg.color, opacity: 0.9 }} />
              <span style={{ color: cfg.color, fontWeight: 600 }}>{cfg.label}</span>
              <span style={{ color: '#64748b' }}>{formatPrice(price)}</span>
            </div>
          );
        })}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
          <div style={{ width: 20, height: 2, background: '#ffffff', opacity: 0.9, borderTop: '2px dashed #ffffff' }} />
          <span style={{ color: '#ffffff', fontWeight: 600 }}>Current</span>
          <span style={{ color: '#64748b' }}>{formatPrice(currentPrice)}</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={420}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 60, left: 10, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />

          <XAxis
            dataKey="date"
            interval={tickInterval}
            tickFormatter={formatDate}
            tick={{ fill: '#475569', fontSize: 11 }}
            axisLine={{ stroke: '#1e293b' }}
            tickLine={false}
          />

          <YAxis
            domain={yDomain}
            orientation="right"
            tickFormatter={formatPrice}
            tick={{ fill: '#475569', fontSize: 11 }}
            axisLine={{ stroke: '#1e293b' }}
            tickLine={false}
            width={80}
          />

          <Tooltip content={<CandleTooltip currency={data.currency} />} />

          {/* Fibonacci level reference lines */}
          {FIB_CONFIG.map(cfg => {
            const price = levels[cfg.levelKey as keyof FibLevels];
            return (
              <ReferenceLine
                key={cfg.levelKey}
                y={price}
                stroke={cfg.color}
                strokeDasharray="5 3"
                strokeWidth={1.5}
                strokeOpacity={0.8}
                label={{
                  value: cfg.label,
                  position: 'insideTopRight',
                  fill: cfg.color,
                  fontSize: 10,
                  fontWeight: 700,
                  dx: -4,
                }}
              />
            );
          })}

          {/* Current price line */}
          <ReferenceLine
            y={currentPrice}
            stroke="#ffffff"
            strokeDasharray="3 3"
            strokeWidth={1}
            strokeOpacity={0.6}
          />

          {/* Candlestick bars (ranged) */}
          <Bar
            dataKey="range"
            shape={<CandleBar />}
            isAnimationActive={false}
            barSize={6}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tier classification
// barPct = ((currentPrice - swingLow) / range) * 100
//   barPct 38.2–50  → price at 50–61.8% retracement → PRIME (golden zone)
//   barPct 21.4–38.2 or 50–61.8 → approaching / near golden zone → SECONDARY
//   barPct > 61.8   → minimal pullback, still in uptrend → UPTREND
//   barPct < 21.4   → deep / broken trend → CAUTION
// ---------------------------------------------------------------------------

type Tier = 'prime' | 'secondary' | 'uptrend' | 'caution';

function getTier(barPct: number): Tier {
  if (barPct >= 38.2 && barPct <= 50)  return 'prime';
  if (barPct > 50    && barPct <= 61.8) return 'secondary';
  if (barPct >= 21.4 && barPct <  38.2) return 'secondary';
  if (barPct > 61.8)                    return 'uptrend';
  return 'caution';
}

const TIER_META: Record<Tier, { label: string; color: string; bg: string; border: string; muted: boolean }> = {
  prime:     { label: 'Golden Zone — Watch',    color: '#92400e', bg: '#fffbeb', border: '#f59e0b', muted: false },
  secondary: { label: 'Near Golden Zone',       color: '#374151', bg: '#f9fafb', border: '#d1d5db', muted: false },
  uptrend:   { label: 'In Uptrend',             color: '#9ca3af', bg: '#f9fafb', border: '#e5e7eb', muted: true  },
  caution:   { label: 'Deep Retracement',       color: '#9ca3af', bg: '#fafafa', border: '#e5e7eb', muted: true  },
};

// ---------------------------------------------------------------------------
// Asset Fibonacci position bar
// ---------------------------------------------------------------------------

interface FibBarProps {
  pct: number;       // 0–100 position of current price in range
  tier: Tier;
}

const FibBar: React.FC<FibBarProps> = ({ pct, tier }) => {
  const clampedPct = Math.max(0, Math.min(100, pct));
  const isPrime = tier === 'prime';

  return (
    <div style={{ position: 'relative', height: 14, marginTop: 8 }}>
      {/* Base track */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 7,
        background: '#e5e7eb',
      }} />

      {/* Golden zone highlight band (barPct 38.2–50) */}
      <div style={{
        position: 'absolute',
        left: '38.2%', width: '11.8%',
        top: 0, bottom: 0,
        background: '#fbbf24',
        opacity: 0.35,
        borderRadius: 2,
      }} />

      {/* Fib level tick marks */}
      {FIB_CONFIG.map(cfg => (
        <div key={cfg.levelKey} style={{
          position: 'absolute',
          left: `${cfg.barPct}%`,
          top: 0, bottom: 0,
          width: 1.5,
          background: cfg.color,
          opacity: 0.6,
          transform: 'translateX(-50%)',
        }} />
      ))}

      {/* Current price dot */}
      <div style={{
        position: 'absolute',
        left: `${clampedPct}%`,
        top: '50%',
        transform: 'translate(-50%, -50%)',
        width: isPrime ? 14 : 11,
        height: isPrime ? 14 : 11,
        borderRadius: '50%',
        background: isPrime ? '#f59e0b' : tier === 'secondary' ? '#6b7280' : '#d1d5db',
        border: `2px solid ${isPrime ? '#ffffff' : '#ffffff'}`,
        boxShadow: isPrime ? '0 0 8px #f59e0b' : 'none',
        zIndex: 1,
      }} />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Asset card (bottom grid)
// ---------------------------------------------------------------------------

interface AssetCardProps {
  fibData: FibData;
  isSelected: boolean;
  onClick: () => void;
}

const AssetCard: React.FC<AssetCardProps> = ({ fibData, isSelected, onClick }) => {
  const { symbol, currentPrice, swingHigh, swingLow, zone, currency } = fibData;
  const tier = getTier(zone.pct);
  const tm = TIER_META[tier];
  const isPrime = tier === 'prime';
  const isMuted = tm.muted && !isSelected;

  const fmt = (v: number) => v.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div
      onClick={onClick}
      style={{
        background: isSelected ? '#1e293b' : (isPrime ? '#fffbeb' : tm.bg),
        border: isSelected
          ? '2px solid #f59e0b'
          : isPrime
          ? '2px solid #f59e0b'
          : `1px solid ${tm.border}`,
        borderRadius: 12,
        padding: 16,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        position: 'relative',
        opacity: isMuted ? 0.55 : 1,
        boxShadow: isPrime && !isSelected ? '0 0 12px #fbbf2440' : 'none',
      }}
    >
      {/* Prime badge */}
      {isPrime && (
        <div style={{
          position: 'absolute', top: -1, right: 10,
          background: '#f59e0b', color: '#ffffff',
          fontSize: 9, fontWeight: 800, letterSpacing: '0.05em',
          padding: '2px 7px', borderRadius: '0 0 6px 6px',
        }}>
          WATCH
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <CompanyIcon symbol={symbol} size="sm" />
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: isSelected ? '#f1f5f9' : (isMuted ? '#9ca3af' : '#111827') }}>
            {symbol}
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>{currency}</div>
        </div>
      </div>

      {/* Price */}
      <div style={{
        fontSize: 17, fontWeight: 700, marginBottom: 6,
        color: isSelected ? '#f1f5f9' : (isMuted ? '#9ca3af' : '#111827'),
      }}>
        {fmt(currentPrice)}
      </div>

      {/* Zone label */}
      <div style={{ fontSize: 10, color: isMuted ? '#9ca3af' : tm.color, fontWeight: 600, marginBottom: 6 }}>
        {zone.fibLabel}
      </div>

      {/* Holding strength + bounce + volume */}
      {fibData.holding && (
        <div style={{ marginBottom: 7 }}>
          {/* Pip row + day count */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
            <div style={{ display: 'flex', gap: 3 }}>
              {[1, 2, 3, 4, 5].map(i => {
                const filled = i <= fibData.holding!.consecutiveDays;
                const pipColor =
                  fibData.holding!.strength === 'strong'   ? '#22c55e' :
                  fibData.holding!.strength === 'moderate' ? '#f59e0b' :
                  fibData.holding!.strength === 'weak'     ? '#9ca3af' : '#e5e7eb';
                return (
                  <div key={i} style={{
                    width: 8, height: 8, borderRadius: 2,
                    background: filled ? pipColor : '#e5e7eb',
                  }} />
                );
              })}
            </div>
            <span style={{ fontSize: 10, color: isMuted ? '#d1d5db' : '#6b7280' }}>
              {fibData.holding.consecutiveDays === 0
                ? 'Not holding'
                : `${fibData.holding.consecutiveDays}d ${fibData.holding.holdingAbove ? 'above' : 'below'} ${fibData.holding.nearestLevelLabel}`}
            </span>
          </div>

          {/* Bounce status + volume on one row */}
          <div style={{ display: 'flex', gap: 5 }}>
            {/* Bounce badge */}
            {(() => {
              const bs = fibData.holding!.bounceStatus;
              const cfg = bs === 'bouncing'
                ? { label: '↑ Bouncing', bg: '#dcfce7', color: '#16a34a' }
                : bs === 'breaking'
                ? { label: '↓ Breaking', bg: '#fee2e2', color: '#dc2626' }
                : { label: '→ Sitting',  bg: '#f3f4f6', color: '#6b7280' };
              return (
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: '2px 6px',
                  borderRadius: 4, background: isMuted ? '#f3f4f6' : cfg.bg,
                  color: isMuted ? '#9ca3af' : cfg.color,
                }}>
                  {cfg.label}
                </span>
              );
            })()}

            {/* Volume badge */}
            {fibData.holding.volumeRatio > 0 && (
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '2px 6px',
                borderRadius: 4,
                background: isMuted ? '#f3f4f6' : fibData.holding.volumeConfirmed ? '#dcfce7' : '#f3f4f6',
                color: isMuted ? '#9ca3af' : fibData.holding.volumeConfirmed ? '#16a34a' : '#6b7280',
              }}>
                Vol {fibData.holding.volumeRatio.toFixed(1)}x
              </span>
            )}
          </div>
        </div>
      )}

      {/* Fib position bar */}
      <FibBar pct={zone.pct} tier={tier} />

      {/* Low / High labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 9, color: '#9ca3af' }}>
        <span>L {fmt(swingLow)}</span>
        <span>{zone.pct.toFixed(1)}%</span>
        <span>H {fmt(swingHigh)}</span>
      </div>

      {isSelected && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4, marginTop: 8,
          fontSize: 10, color: '#f59e0b', fontWeight: 600,
        }}>
          <ChevronRight size={12} />
          Viewing in chart
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

const Fib: React.FC = () => {
  const { holdings: cachedHoldings, isLoading: holdingsLoading } = useCache();
  const [period, setPeriod] = useState<string>('6m');
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  // Derive portfolio symbols + their types
  const portfolioAssets = useMemo(() => {
    if (!cachedHoldings) return [];
    return Object.entries(cachedHoldings).map(([sym, data]: [string, any]) => ({
      symbol: sym,
      type: data.type || (
        ['BTC','ETH','ADA','SOL','DOT','LINK','UNI','MATIC','AVAX','ATOM','LTC','BCH','XRP','DOGE','SHIB'].includes(sym.toUpperCase())
          ? 'c' : 's'
      ),
    }));
  }, [cachedHoldings]);

  const symbols = useMemo(() => portfolioAssets.map(a => a.symbol), [portfolioAssets]);

  // Batch fetch Fibonacci data for all holdings
  const { data: batchData, isLoading: batchLoading, error: batchError, refetch: refetchBatch } = useQuery<FibData[]>(
    ['fibonacci-batch', symbols.join(','), period],
    async () => {
      if (symbols.length === 0) return [];
      const res = await axios.get('/api/fibonacci/batch', {
        params: { symbols: symbols.join(','), period },
      });
      return res.data;
    },
    {
      enabled: symbols.length > 0,
      staleTime: 25 * 60 * 1000,
      cacheTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
    }
  );

  // Auto-select the first symbol when batch data loads
  const effectiveSelected = selectedSymbol ?? batchData?.[0]?.symbol ?? null;

  // Fetch detailed data (with candles) for the selected symbol
  const { data: masterData, isLoading: masterLoading } = useQuery<FibData>(
    ['fibonacci-master', effectiveSelected, period],
    async () => {
      const res = await axios.get(`/api/fibonacci/${effectiveSelected}?period=${period}`);
      return res.data;
    },
    {
      enabled: !!effectiveSelected,
      staleTime: 25 * 60 * 1000,
      cacheTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
    }
  );

  // Group and sort by tier: prime first, muted tiers last
  const groupedBatch = useMemo(() => {
    if (!batchData) return { prime: [], secondary: [], uptrend: [], caution: [] } as Record<Tier, FibData[]>;
    const groups: Record<Tier, FibData[]> = { prime: [], secondary: [], uptrend: [], caution: [] };
    for (const fd of batchData) {
      groups[getTier(fd.zone.pct)].push(fd);
    }
    // Within prime: sort closest to golden zone center (44.1%)
    const goldenCenter = 44.1;
    groups.prime.sort((a, b) => Math.abs(a.zone.pct - goldenCenter) - Math.abs(b.zone.pct - goldenCenter));
    // Within secondary: same — closest to golden zone first
    groups.secondary.sort((a, b) => Math.abs(a.zone.pct - goldenCenter) - Math.abs(b.zone.pct - goldenCenter));
    return groups;
  }, [batchData]);

  const sortedBatch = useMemo(() =>
    [...groupedBatch.prime, ...groupedBatch.secondary, ...groupedBatch.uptrend, ...groupedBatch.caution],
    [groupedBatch]
  );

  const isLoading = holdingsLoading || batchLoading || (symbols.length > 0 && !batchData && !batchError);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="dashboard-header">
        <div className="dashboard-header-content">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 className="dashboard-title">Fibonacci Retracement</h1>
              <p className="dashboard-subtitle">
                Identify key support &amp; resistance levels across your portfolio
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Period selector */}
              <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 8, padding: 2, gap: 2 }}>
                {PERIOD_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => { setPeriod(opt.value); setSelectedSymbol(null); }}
                    style={{
                      padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                      fontSize: 13, fontWeight: 600,
                      background: period === opt.value ? '#ffffff' : 'transparent',
                      color: period === opt.value ? '#111827' : '#6b7280',
                      boxShadow: period === opt.value ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <button
                onClick={() => refetchBatch()}
                disabled={batchLoading}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
                  background: '#3b82f6', color: '#ffffff', border: 'none', borderRadius: 8,
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                <RefreshCw size={14} style={{ animation: batchLoading ? 'spin 1s linear infinite' : 'none' }} />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="dashboard-content">

        {/* How to interpret */}
        <div style={{
          background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10,
          padding: '12px 16px', marginBottom: 16, fontSize: 12, color: '#1e40af', lineHeight: 1.6,
        }}>
          <strong>How to read this:</strong> Fibonacci retracement maps where a price sits between its recent swing low (0%) and swing high (100%).
          After a rally, prices often pull back to key levels before resuming — <strong>61.8% (the golden ratio)</strong> is the strongest support zone,
          followed by <strong>38.2%</strong> and <strong>50%</strong>. A price holding above <strong>23.6%</strong> signals a strong trend with minimal pullback.
          Prices below <strong>78.6%</strong> suggest a deep retracement where a trend reversal is possible.
          Click any asset card to view its candlestick chart with all levels overlaid.
        </div>

        {/* Loading skeleton */}
        {isLoading && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6b7280' }}>
            <RefreshCw size={32} style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }} />
            <p>Loading Fibonacci analysis for your portfolio...</p>
          </div>
        )}

        {!isLoading && symbols.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6b7280' }}>
            <p>No portfolio holdings found. Upload your portfolio CSV first.</p>
          </div>
        )}

        {!isLoading && symbols.length > 0 && (
          <>
            {/* Master Chart */}
            <div className="dashboard-section" style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: '#111827', margin: 0 }}>
                  {effectiveSelected || 'Select an asset below'}
                </h2>
                {masterData && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: masterData.zone.color + '22',
                    border: `1px solid ${masterData.zone.color}44`,
                    borderRadius: 20, padding: '3px 10px',
                  }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: masterData.zone.color }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: masterData.zone.color }}>
                      {masterData.zone.fibLabel}
                    </span>
                  </div>
                )}
                {masterData && (
                  <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 4 }}>
                    {masterData.zone.signal}
                  </span>
                )}
              </div>

              {masterLoading && (
                <div style={{
                  background: '#0f172a', borderRadius: 12, height: 460,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <RefreshCw size={24} color="#475569" style={{ animation: 'spin 1s linear infinite' }} />
                </div>
              )}

              {!masterLoading && masterData?.candles && (
                <MasterChart data={masterData} />
              )}

              {!masterLoading && !masterData && effectiveSelected && (
                <div style={{
                  background: '#0f172a', borderRadius: 12, height: 200,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569',
                }}>
                  Could not load chart data for {effectiveSelected}
                </div>
              )}
            </div>

            {/* Portfolio asset grid */}
            <div className="dashboard-section">
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <h2 style={{ fontSize: 16, fontWeight: 700, color: '#111827', margin: 0 }}>
                    Portfolio Positions
                  </h2>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>
                    Click any card to view in chart
                  </span>
                </div>

                {batchError && (
                  <div style={{
                    padding: '16px', background: '#fef2f2', border: '1px solid #fecaca',
                    borderRadius: 8, color: '#dc2626', fontSize: 13, marginBottom: 12,
                  }}>
                    <strong>Error loading Fibonacci data:</strong>{' '}
                    {(batchError as any)?.response?.data?.error
                      || (batchError as any)?.response?.data?.message
                      || (batchError as any)?.message
                      || 'Unknown error — check that the server was restarted after the update.'}
                  </div>
                )}
                {!batchError && sortedBatch.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9ca3af' }}>
                    No Fibonacci data returned — all symbol lookups may have failed.
                  </div>
                )}

                {(['prime', 'secondary', 'uptrend', 'caution'] as Tier[]).map(tier => {
                  const items = groupedBatch[tier];
                  if (items.length === 0) return null;
                  const tm = TIER_META[tier];
                  const tierLabels: Record<Tier, string> = {
                    prime:     '🟡 Golden Zone (50–61.8% retracement) — primary watch list',
                    secondary: 'Nearby — approaching or just outside golden zone',
                    uptrend:   'In Uptrend — minimal pullback, no entry setup yet',
                    caution:   'Deep / Broken — retraced beyond 78.6%',
                  };
                  return (
                    <div key={tier} style={{ marginBottom: 24 }}>
                      <div style={{
                        fontSize: 12, fontWeight: 700,
                        color: tier === 'prime' ? '#92400e' : '#6b7280',
                        marginBottom: 10, paddingBottom: 6,
                        borderBottom: `2px solid ${tier === 'prime' ? '#f59e0b' : '#e5e7eb'}`,
                      }}>
                        {tierLabels[tier]}
                        <span style={{ fontWeight: 400, marginLeft: 8 }}>({items.length})</span>
                      </div>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                        gap: 10,
                      }}>
                        {items.map(fd => (
                          <AssetCard
                            key={fd.symbol}
                            fibData={fd}
                            isSelected={fd.symbol === effectiveSelected}
                            onClick={() => setSelectedSymbol(fd.symbol)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </>
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default Fib;
