import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from 'react-query';
import axios from 'axios';
import { useCache } from '../contexts/CacheContext';

const mono = "'IBM Plex Mono', 'Courier New', monospace";

type ColDoc = { what: string; signals: string[] };
const COLUMN_DOCS: Record<string, ColDoc> = {
  TICKER: {
    what: 'Asset symbol with current CAD price and an entry-pattern badge.',
    signals: ['⚡ strong entry — reversal + buying pressure + bullish MACD', '★ prime dip — quality asset down 20–55% from its highs', '◎ recovery — bottomed weeks ago, still climbing back', '↑ trend — steady confirmed uptrend (ADX >15)', '↗ extended — >20% above 200MA, pullback risk'],
  },
  ACTION: {
    what: 'Synthesised trade recommendation from buy/sell scores and signal pattern.',
    signals: ['⚡ BUY NOW — buy score ≥70', '⚠ SELL NOW — sell score ≥70', '↗ WATCH BUY — buy score 55–69', '↓ WATCH SELL — sell score 55–69', '◈ HOLD — no strong signal either way'],
  },
  BUY: {
    what: 'Composite buy signal (0–100) — weighted blend of 16 technical and fundamental indicators including RSI, moving averages, MACD, CMF, safety, and P/E.',
    signals: ['≥70 — strong buy, high conviction', '55–69 — moderate buy signal', '45–54 — neutral zone', '<30 — poor conditions for buying'],
  },
  SELL: {
    what: 'Composite sell signal (0–100) — mirrors the buy score with inverted weights. Both can be elevated at the same time on volatile assets.',
    signals: ['≥70 — strong sell, high conviction', '55–69 — moderate sell signal', '<30 — poor conditions for selling'],
  },
  '200MA': {
    what: '% above (+) or below (−) the 200-day moving average — the single most important long-term trend anchor.',
    signals: ['< −15% — deep below: value zone (green)', '−15% to 0% — healthy pullback', '0% to +15% — above: healthy uptrend', '> +15% — extended: pullback risk (red)'],
  },
  '50MA': {
    what: '% above/below the 50-day moving average — medium-term support and resistance.',
    signals: ['< −12% — well below: potential support zone', 'Near 0% — testing the average (key level)', '> +10% — extended short-term above the average'],
  },
  '20MA': {
    what: '% above/below the 20-day moving average — short-term momentum gauge.',
    signals: ['Below (−) — short-term bearish pressure', 'Above (+) — short-term bullish momentum', 'Crossing from below → above = early buy signal'],
  },
  MACD: {
    what: 'Moving Average Convergence Divergence — compares a fast 12-day EMA to a slow 26-day EMA to measure whether momentum is building or fading. When the fast EMA pulls ahead, acceleration is happening.',
    signals: ['▲ bullish — MACD crossed above signal line, momentum building', '▼ bearish — crossed below, momentum fading or reversing', 'ADX ≥25 — real trend in motion, trust the signal', 'ADX <15 — sideways chop, MACD less reliable'],
  },
  RSI: {
    what: 'Relative Strength Index (14-period) — oscillates 0–100, measuring whether recent price moves are overdone in either direction.',
    signals: ['≤30 — oversold: contrarian buy zone', '30–50 — recovering / building momentum', '50–70 — neutral to bullish', '≥70 — overbought: consider taking profit'],
  },
  AVG: {
    what: 'Your average cost per share in CAD — weighted average of all buy transactions for this holding.',
    signals: ['Below current PRICE → position is profitable (green PRICE)', 'Above current PRICE → position is underwater (red PRICE)', 'Derived from total CAD invested ÷ shares held'],
  },
  PRICE: {
    what: 'Current market price in CAD.',
    signals: ['Green — above your average cost (unrealised gain)', 'Red — below your average cost (underwater)', 'Colour is relative to your AVG cost basis'],
  },
  'MOM 20D': {
    what: '20-day price momentum — how much the price has moved over the past 20 trading days.',
    signals: ['> +10% — strong recent momentum', '0% to +10% — mild positive', '< 0% — declining price pressure', '↑ rev — 5-day turned positive while 20-day still negative (early reversal)'],
  },
  '52W↓': {
    what: '% below the 52-week high — how far the price has dropped from its annual peak. Always negative.',
    signals: ['< −25% — deep dip zone: historically strong risk/reward', '−10% to −25% — moderate pullback', 'Near 0% — at or near annual highs', 'R/R shown alongside: ≥3× means asymmetric upside'],
  },
  '52W↑': {
    what: '% above the 52-week low — how far above the annual floor the price currently sits.',
    signals: ['Near 0% — at annual lows: max risk/reward opportunity', '< +20% — recently bounced, still near lows', '+50%+ — already significantly recovered (late entry)'],
  },
  CMF: {
    what: 'Chaikin Money Flow (20-period) — detects whether institutional money is flowing into or out of an asset by combining price action with volume.',
    signals: ['≥ +0.25 — strong accumulation (heavy buying pressure)', '+0.10 to +0.24 — accumulation', '−0.09 to +0.09 — neutral flow', '≤ −0.10 — distribution (institutional selling)'],
  },
  SAFE: {
    what: 'Safety score (0–100) — composite risk rating: 50% volatility + 20% max drawdown + 30% ATR. Used to scale buy/sell signal confidence.',
    signals: ['≥70 — low risk: signals carry full weight', '50–69 — moderate risk', '30–49 — elevated risk', '<30 — high risk: needs extra confirmation before acting'],
  },
  'P/E': {
    what: 'Trailing price-to-earnings ratio — how expensive the stock is relative to its last 12 months of earnings.',
    signals: ['≤18 — value territory', '18–25 — fairly valued', '25–35 — premium valuation', '≥35 — expensive, priced for strong future growth', 'Analyst consensus (Finnhub) shown as sub-text'],
  },
  '3M SPAN': {
    what: '60-day price sparkline (≈ 3 months of trading days), normalised so the oldest visible point = 0.',
    signals: ['Green line/fill — price is above the 60-day starting level', 'Red line/fill — price is below the 60-day starting level', 'Dot at the right edge marks the current price level'],
  },
  PROFIT: {
    what: 'Your total unrealised + realised P&L in CAD for this holding.',
    signals: ['Green — you are up overall on this position', 'Red — you are down overall', 'Use alongside ACTION signal: let winners run or cut losers'],
  },
  ADX: {
    what: 'Average Directional Index — measures trend strength regardless of direction. A rising ADX means price is trending strongly, not just drifting sideways.',
    signals: ['≥40 — very strong trend, high conviction', '≥25 — confirmed trend, trade with momentum', '15–24 — weak or emerging trend', '<15 — ranging / choppy, avoid trend signals'],
  },
  'MOM 1Y': {
    what: '1-year (252 trading day) momentum — how much the stock has moved over the past year.',
    signals: ['> +20% — strong outperformer, momentum persists', '0% to +20% — mild positive', '< 0% — underperformer vs prior year'],
  },
  'RS/SPY': {
    what: 'Relative strength vs the S&P 500 — 1-year asset momentum minus SPY\'s 1-year momentum.',
    signals: ['Positive — beating the market (stock/sector strength)', 'Negative — lagging the market', 'Use for rotation: buy relative winners, avoid laggards'],
  },
  'BB%B': {
    what: 'Bollinger Bands %B — shows where price sits within its volatility envelope. 0 = lower band, 1 = upper band.',
    signals: ['≤0.2 — at lower band: oversold, potential bounce', '0.2–0.8 — inside bands: normal range', '≥0.8 — at upper band: overbought, potential fade'],
  },
  VOLAT: {
    what: 'Annualised volatility — how much the price swings day-to-day, expressed as a yearly % (std dev × √252).',
    signals: ['<20% — stable, predictable asset', '20–40% — normal range', '>40% — high volatility, expect wider daily swings'],
  },
  'VOL%': {
    what: 'Current trading volume vs the 20-day average — flags unusual activity that can confirm or invalidate price moves.',
    signals: ['>+100% — major spike: breakout or panic selling', '+50% to +100% — elevated, worth noting', 'Near 0% — normal activity', '<−30% — low conviction, moves less reliable'],
  },
  'R/R': {
    what: 'Risk/Reward ratio — (52w high − price) ÷ (price − 52w low). Compares potential upside to potential downside from the current price.',
    signals: ['≥3× — asymmetric: large upside vs limited downside', '1–3× — balanced risk/reward', '<1× — limited upside, price near annual highs'],
  },
  'ATR%': {
    what: 'Average True Range as % of price (14-period) — the typical daily price swing. Feeds the SAFE score and informs position sizing.',
    signals: ['<1% — calm, tight daily moves', '1–3% — normal daily range', '>3% — wide daily swings, size positions carefully'],
  },
  BETA: {
    what: 'Beta vs SPY (252-day regression) — how much this asset tends to move relative to the broader market.',
    signals: ['<0.8 — defensive: less volatile than the market', '~1.0 — moves in line with the market', '>1.3 — amplified: more volatile, higher risk and reward'],
  },
  EPS: {
    what: 'Trailing 12-month earnings per share with year-over-year growth rate shown as sub-text.',
    signals: ['Positive + growing — healthy, expanding business', 'Positive + declining — slowing growth, watch closely', 'Negative — company currently losing money'],
  },
  REC: {
    what: 'Analyst consensus recommendation from Finnhub — aggregated view from sell-side analysts based on price targets.',
    signals: ['Strong Buy / Buy — majority bullish', 'Hold — mixed or neutral outlook', 'Sell / Strong Sell — majority bearish', 'Note: analysts often lag the market by weeks or months'],
  },
};
const C = {
  bg: '#0a0c10', card: '#10141c', inner: '#141820',
  border: '#1e2535', text: '#e2e8f0', sub: '#94a3b8', dim: '#4a5568',
  accent: '#00d4aa', a2: '#4f8fff',
  up: '#22c55e', down: '#ef4444', warn: '#f59e0b',
};

// ── signal flags ──────────────────────────────────────────────────────────────

type SigKey = 'strongEntry' | 'modEntry' | 'recovery' | 'trend' | 'prime' | 'extended';

const SIG_FLAGS: Record<SigKey, { label: string; color: string }> = {
  strongEntry: { label: '⚡ entry',   color: C.up       },
  modEntry:    { label: '↗ entry',    color: '#86efac'  },
  recovery:    { label: '◎ recovery', color: C.a2       },
  trend:       { label: '↑ trend',    color: C.warn     },
  prime:       { label: '★ prime',    color: '#c084fc'  },
  extended:    { label: '↗ extended', color: '#fb923c'  },
};

function getRecSignal(rec: any): SigKey | null {
  const ind = rec.indicators;
  if (!ind) return null;
  const reversal      = ind.momentum5 != null && ind.momentum20 != null && ind.momentum5 > 0 && ind.momentum20 < 0;
  const accumStrong   = (ind.cmf ?? -1) >= 0.10;
  const accumWeak     = (ind.cmf ?? -1) > 0;
  const bullish       = ind.macdBullish === true;
  const d200          = parseFloat(ind.distanceFromMA200 ?? '0');
  const mom5v         = ind.momentum5 ?? null;
  const mom20v        = ind.momentum20 ?? null;
  const adxV          = ind.adx ?? 0;
  const accumTrend    = (ind.cmf ?? -1) > -0.05;
  const dip           = ind.distanceFromHigh ?? 0;
  const dipFromLow    = ind.distanceFromLow ?? 100;
  const safety        = ind.safetyScore ?? 0;
  const isStrong      = reversal && accumStrong && bullish;
  const isModerate    = (reversal && bullish && accumWeak) || (reversal && accumStrong);
  const isExtended    = d200 > 20;
  const isRecovery    = !reversal && mom5v != null && mom20v != null && mom5v > 0 && mom20v > 0 && mom20v < 8 && d200 < 0 && bullish && accumWeak;
  const isTrend       = !reversal && !isRecovery && mom20v != null && mom20v > 0 && bullish && adxV > 15 && d200 >= 0 && d200 <= 30 && accumTrend;
  const isPrimeDip    = safety >= 40 && dip <= -20 && dip >= -55 && d200 <= -8 && d200 >= -35;
  const isPrimeSupport = safety >= 55 && dipFromLow <= 12 && d200 <= -3 && d200 >= -25;
  const isPrime       = !reversal && !isRecovery && !isTrend && (isPrimeDip || isPrimeSupport);
  if (isTrend)    return 'trend';
  if (isExtended) return 'extended';
  if (isStrong)   return 'strongEntry';
  if (isModerate) return 'modEntry';
  if (isPrime)    return 'prime';
  if (isRecovery) return 'recovery';
  return null;
}

// ── group system ──────────────────────────────────────────────────────────────

type GroupId = 0 | 1 | 2 | 3 | 4;
const GROUP_META = [
  { label: 'Strong Buy',    scoreLabel: 'buy ≥ 70',         color: '#34d399', bg: 'rgba(52,211,153,0.07)',  border: 'rgba(52,211,153,0.22)'  },
  { label: 'Strong Sell',   scoreLabel: 'sell ≥ 70',        color: '#f87171', bg: 'rgba(248,113,113,0.07)', border: 'rgba(248,113,113,0.22)' },
  { label: 'Moderate Buy',  scoreLabel: 'buy 45–69',        color: '#86efac', bg: 'rgba(74,222,128,0.04)',  border: 'rgba(74,222,128,0.18)'  },
  { label: 'Moderate Sell', scoreLabel: 'sell 45–69',       color: C.warn,    bg: 'rgba(245,158,11,0.04)',  border: 'rgba(245,158,11,0.18)'  },
  { label: 'Hold',          scoreLabel: 'no strong signal', color: C.a2,      bg: 'rgba(79,143,255,0.04)',  border: 'rgba(79,143,255,0.14)'  },
] as const;

function getActionLabel(rec: any): { label: string; color: string; bg: string } {
  const b = rec.buyScore ?? 0, s = rec.sellScore ?? 0;
  if (b >= 70)               return { label: '⚡ BUY NOW',    color: C.up,      bg: 'rgba(34,197,94,0.08)'   };
  if (s >= 70)               return { label: '⚠ SELL NOW',   color: C.down,    bg: 'rgba(239,68,68,0.08)'   };
  if (b >= 55 && b - s >= 15) return { label: '↗ WATCH BUY',  color: '#86efac', bg: 'rgba(134,239,172,0.05)' };
  if (s >= 55 && s - b >= 15) return { label: '↓ WATCH SELL', color: C.warn,    bg: 'rgba(245,158,11,0.05)'  };
  return                            { label: '◈  HOLD',        color: C.dim,     bg: 'transparent'             };
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

const Sparkline: React.FC<{ prices: number[]; id: string }> = ({ prices, id }) => {
  const W = 78, H = 28;
  if (!Array.isArray(prices) || prices.length < 5) return <span style={{ fontFamily: mono, fontSize: 8, color: C.dim }}>—</span>;
  const base = prices[0];
  const norm = prices.map(p => (p - base) / (base || 1));
  const lo = Math.min(...norm, 0), hi = Math.max(...norm, 0);
  const rng = (hi - lo) || 0.001;
  const sx = (i: number) => (i / (norm.length - 1)) * (W - 2) + 1;
  const sy = (v: number) => H - 1 - ((v - lo) / rng) * (H - 2);
  const zy = sy(0);
  const path = norm.map((v, i) => `${i === 0 ? 'M' : 'L'}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join('');
  const area = `${path}L${sx(norm.length - 1).toFixed(1)},${zy.toFixed(1)}L${sx(0).toFixed(1)},${zy.toFixed(1)}Z`;
  const last = norm[norm.length - 1];
  return (
    <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <clipPath id={`${id}-a`}><rect x={0} y={0} width={W} height={zy} /></clipPath>
        <clipPath id={`${id}-b`}><rect x={0} y={zy} width={W} height={H} /></clipPath>
      </defs>
      <line x1={1} y1={zy} x2={W - 1} y2={zy} stroke={C.border} strokeWidth={0.75} />
      <path d={area} fill="rgba(34,197,94,0.10)" stroke="none" clipPath={`url(#${id}-a)`} />
      <path d={area} fill="rgba(239,68,68,0.10)" stroke="none" clipPath={`url(#${id}-b)`} />
      <path d={path} fill="none" stroke={C.up}   strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" clipPath={`url(#${id}-a)`} />
      <path d={path} fill="none" stroke={C.down} strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" clipPath={`url(#${id}-b)`} />
      <circle cx={sx(norm.length - 1)} cy={sy(last)} r={1.75} fill={last >= 0 ? C.up : C.down} />
    </svg>
  );
};

function getGroupId(rec: any): GroupId {
  if (rec.buyScore == null || rec.sellScore == null) return 4;
  const b = rec.buyScore as number, s = rec.sellScore as number;
  if (b >= 70) return 0;
  if (s >= 70) return 1;
  if (b >= 55 && b - s >= 15) return 2;
  if (s >= 55 && s - b >= 15) return 3;
  return 4;
}

// ── colour helpers ─────────────────────────────────────────────────────────────

const cMADist  = (v: number | null | undefined) => v == null ? C.dim : v <= -10 ? C.up   : v >= 15   ? C.down  : C.sub;
const cRSI     = (v: number | null | undefined) => v == null ? C.dim : v < 30   ? C.up   : v > 70    ? C.down  : C.warn;
const cMom     = (v: number | null | undefined, lo = 5, hi = 5) => v == null ? C.dim : v > hi ? C.up : v < -lo ? C.down : C.sub;
const cADX     = (v: number | null | undefined) => v == null ? C.dim : v >= 40  ? C.accent : v >= 20 ? C.warn  : C.dim;
const cBB      = (v: number | null | undefined) => v == null ? C.dim : v < 0.2  ? C.up   : v > 0.8   ? C.down  : C.sub;
const cCMF     = (v: number | null | undefined) => v == null ? C.dim : v >= 0.25 ? '#34d399' : v >= 0.10 ? C.up : v >= 0 ? C.sub : v >= -0.10 ? C.warn : C.down;
const cVol     = (v: number | null | undefined) => v == null ? C.dim : v < 20   ? C.up   : v > 40    ? C.down  : C.warn;
const cVolR    = (v: number | null | undefined) => v == null ? C.dim : v >= 100 ? '#34d399' : v >= 50 ? C.up   : v >= -20 ? C.sub : C.warn;
const cSafety  = (v: number | null | undefined) => v == null ? C.dim : v >= 70  ? C.up   : v >= 50   ? C.warn  : v >= 30 ? '#fb923c' : C.down;
const cRR      = (v: number | null | undefined) => v == null ? C.dim : v >= 3   ? '#34d399' : v >= 2  ? C.up   : v >= 1  ? C.warn   : v >= 0.5 ? '#fb923c' : C.down;
const cATR     = (v: number | null | undefined) => v == null ? C.dim : v < 1    ? C.up   : v < 2     ? C.sub   : v < 3.5 ? '#fb923c' : C.down;
const cBeta    = (v: number | null | undefined) => v == null ? C.dim : v < 0.8  ? C.up   : v < 1.2   ? C.sub   : v < 1.6 ? '#fb923c' : C.down;
const cPE      = (v: number | null | undefined) => v == null ? C.dim : v <= 15  ? '#34d399' : v <= 25 ? C.up   : v <= 35 ? C.warn   : v <= 50 ? '#fb923c' : C.down;
const cBuy     = (v: number | null)             => v == null ? C.dim : v >= 75  ? '#34d399' : v >= 60  ? C.up   : v >= 45 ? C.warn   : v >= 30 ? '#fb923c' : C.down;
const cSell    = (v: number | null)             => v == null ? C.dim : v >= 75  ? '#f87171' : v >= 60  ? '#fb923c' : v >= 45 ? C.warn : v >= 30 ? C.up : '#34d399';
const cRec     = (k: string | null | undefined) => !k ? C.dim : (k === 'strong_buy' || k === 'buy') ? C.up : k === 'hold' ? C.warn : C.down;

// ── primitives ────────────────────────────────────────────────────────────────

const MicroPill: React.FC<{ color: string; bg: string; border: string; children: React.ReactNode }> = ({ color, bg, border, children }) => (
  <span style={{ fontFamily: mono, fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 2, letterSpacing: '0.06em', color, background: bg, border: `1px solid ${border}`, whiteSpace: 'nowrap' }}>
    {children}
  </span>
);

const Skel: React.FC = () => (
  <div style={{ height: 22, borderRadius: 3, background: C.inner, border: `1px solid ${C.border}`, marginBottom: 2 }} />
);

// ── TimingSignals ─────────────────────────────────────────────────────────────

const FILTER_DEFS = [
  { key: 'all',         label: 'All',          color: C.sub,     border: C.border },
  { key: 'strongEntry', label: '⚡ entry',     color: C.up,      border: 'rgba(34,197,94,0.35)'    },
  { key: 'modEntry',    label: '↗ entry',      color: '#86efac', border: 'rgba(134,239,172,0.3)'   },
  { key: 'recovery',    label: '◎ recovery',   color: C.a2,      border: 'rgba(79,143,255,0.35)'   },
  { key: 'trend',       label: '↑ trend',      color: C.warn,    border: 'rgba(245,158,11,0.35)'   },
  { key: 'prime',       label: '★ prime',      color: '#c084fc', border: 'rgba(192,132,252,0.35)'  },
  { key: 'extended',    label: '↗ extended',   color: '#fb923c', border: 'rgba(251,146,60,0.35)'   },
];

const TimingSignals: React.FC<{ recsData: any; recsLoading: boolean; holdingsBySymbol: Map<string, any>; holdingFilter: 'active' | 'all'; setHoldingFilter: (f: 'active' | 'all') => void }> = ({ recsData, recsLoading, holdingsBySymbol, holdingFilter, setHoldingFilter }) => {
  const [legendFilter, setLegendFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'condensed' | 'expanded'>('condensed');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [headerPopup, setHeaderPopup] = useState<{ label: string; content: ColDoc; x: number; y: number } | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!headerPopup) return;
    const dismiss = (e: MouseEvent) => {
      if (popupRef.current && popupRef.current.contains(e.target as Node)) return;
      setHeaderPopup(null);
    };
    document.addEventListener('mousedown', dismiss);
    return () => document.removeEventListener('mousedown', dismiss);
  }, [headerPopup]);

  const handleHeaderClick = (e: React.MouseEvent<HTMLTableCellElement>, label: string) => {
    e.stopPropagation();
    if (headerPopup?.label === label) { setHeaderPopup(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const PW = 300;
    let x = rect.left;
    if (x + PW > window.innerWidth - 10) x = window.innerWidth - PW - 10;
    setHeaderPopup({ label, content: COLUMN_DOCS[label] ?? { what: '', signals: [] }, x, y: rect.bottom + 7 });
  };

  const onHd = (label: string) => (e: React.MouseEvent<HTMLTableCellElement>) => handleHeaderClick(e, label);

  const { baseRows, flagCounts, actionableCount } = useMemo(() => {
    const recs: any[] = recsData?.recommendations ?? [];
    const valid = recs.filter(r => r.indicators && Object.keys(r.indicators).length > 0 && r.timing !== 'ERROR');
    const fc: Record<SigKey, number> = { strongEntry: 0, modEntry: 0, recovery: 0, trend: 0, prime: 0, extended: 0 };
    valid.forEach(r => { const s = getRecSignal(r); if (s) fc[s]++; });
    const actionable = valid.filter(r => (r.buyScore ?? 0) >= 65 || (r.sellScore ?? 0) >= 65).length;
    const sorted = [...valid].sort((a, b) => {
      const ga = getGroupId(a), gb = getGroupId(b);
      if (ga !== gb) return ga - gb;
      const sa = (ga === 0 || ga === 2) ? (a.buyScore ?? 0) : (ga === 1 || ga === 3) ? (a.sellScore ?? 0) : Math.max(a.buyScore ?? 0, a.sellScore ?? 0);
      const sb = (gb === 0 || gb === 2) ? (b.buyScore ?? 0) : (gb === 1 || gb === 3) ? (b.sellScore ?? 0) : Math.max(b.buyScore ?? 0, b.sellScore ?? 0);
      return sb - sa;
    });
    return { baseRows: sorted, flagCounts: fc, actionableCount: actionable };
  }, [recsData]);

  const rows = useMemo(() => {
    const q = searchQuery.trim().toUpperCase();
    const sigFiltered = legendFilter === 'all' ? baseRows : baseRows.filter(r => getRecSignal(r) === legendFilter);
    if (!q) return sigFiltered;
    return sigFiltered.filter(r => {
      const sym = typeof r.symbol === 'string' ? r.symbol.trim().toUpperCase() : '';
      return sym.startsWith(q);
    });
  }, [baseRows, legendFilter, searchQuery]);

  const thStyle = (w: number, align: 'left' | 'right' | 'center' = 'right', tip?: string, groupBorder = false): React.CSSProperties => ({
    fontFamily: mono, fontSize: 11, fontWeight: 600, color: C.sub, letterSpacing: '0.09em',
    textAlign: align, padding: '5px 6px', whiteSpace: 'nowrap', cursor: 'default',
    minWidth: w, width: w,
    borderLeft: groupBorder ? `1px solid ${C.border}` : undefined,
  });

  const tdStyle = (align: 'left' | 'right' | 'center' = 'right', groupBorder = false): React.CSSProperties => ({
    padding: '4px 6px',
    borderBottom: `1px solid rgba(30,37,53,0.35)`,
    borderLeft: groupBorder ? `1px solid rgba(30,37,53,0.4)` : undefined,
    verticalAlign: 'middle',
    textAlign: align,
  });

  const thStyleC = (w: number, align: 'left' | 'right' | 'center' = 'right', gb = false): React.CSSProperties => ({
    fontFamily: mono, fontSize: 11, fontWeight: 600, color: C.sub, letterSpacing: '0.09em',
    textAlign: 'center', padding: '8px 12px', whiteSpace: 'nowrap', cursor: 'default',
    minWidth: w, width: w,
    borderLeft: gb ? `1px solid ${C.border}` : undefined,
  });

  const tdStyleC = (align: 'left' | 'right' | 'center' = 'right', gb = false): React.CSSProperties => ({
    padding: '9px 12px',
    borderBottom: `1px solid rgba(30,37,53,0.4)`,
    borderLeft: gb ? `1px solid rgba(30,37,53,0.45)` : undefined,
    verticalAlign: 'middle',
    textAlign: align,
  });

  const dash = <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>—</span>;

  const num = (v: number | null | undefined, fmt: (n: number) => string, color: string) =>
    v == null ? dash : <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 600, color }}>{fmt(v)}</span>;

  const TOTAL_COLS = viewMode === 'condensed' ? 20 : 27;

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{ padding: '12px 16px 10px', flexShrink: 0 }}>
        <div style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: C.dim, textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span>Timing Signals — Technical &amp; Sentiment</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {actionableCount > 0 && (
              <MicroPill color={C.warn} bg="rgba(245,158,11,0.10)" border="rgba(245,158,11,0.25)">{actionableCount} ACTIONABLE</MicroPill>
            )}
            {/* Ticker search */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <svg style={{ position: 'absolute', left: 8, pointerEvents: 'none', opacity: searchQuery ? 0.9 : 0.45 }} width={12} height={12} viewBox="0 0 16 16" fill="none">
                <circle cx="6.5" cy="6.5" r="5" stroke={C.sub} strokeWidth="1.6"/>
                <line x1="10.5" y1="10.5" x2="14" y2="14" stroke={C.sub} strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search ticker…"
                style={{
                  fontFamily: mono, fontSize: 11, padding: '4px 26px 4px 26px',
                  background: searchQuery ? 'rgba(148,163,184,0.07)' : C.inner,
                  border: `1px solid ${searchQuery ? C.sub : C.border}`,
                  borderRadius: 4, color: C.text, outline: 'none', width: 170,
                  letterSpacing: '0.07em', textTransform: 'uppercase',
                  transition: 'border-color 0.15s, background 0.15s, width 0.2s',
                  boxShadow: searchQuery ? `0 0 0 2px rgba(148,163,184,0.10)` : 'none',
                }}
                onFocus={e => { e.currentTarget.style.width = '200px'; e.currentTarget.style.borderColor = C.sub; }}
                onBlur={e => { e.currentTarget.style.width = searchQuery ? '200px' : '170px'; if (!searchQuery) e.currentTarget.style.borderColor = C.border; }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{ position: 'absolute', right: 7, background: 'none', border: 'none', cursor: 'pointer', color: C.sub, fontSize: 14, padding: 0, lineHeight: 1, display: 'flex', alignItems: 'center' }}
                >×</button>
              )}
            </div>
            {/* Active / All switch */}
            <div style={{ display: 'flex', borderRadius: 3, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
              {(['active', 'all'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setHoldingFilter(f)}
                  style={{
                    fontFamily: mono, fontSize: 10, fontWeight: holdingFilter === f ? 700 : 400,
                    padding: '2px 9px', cursor: 'pointer', letterSpacing: '0.06em',
                    color: holdingFilter === f ? C.text : C.dim,
                    background: holdingFilter === f ? 'rgba(148,163,184,0.12)' : 'transparent',
                    border: 'none', textTransform: 'uppercase', transition: 'all 0.12s',
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
            {/* Condensed / Expanded toggle */}
            {(['condensed', 'expanded'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                style={{
                  fontFamily: mono, fontSize: 11, fontWeight: viewMode === mode ? 700 : 500,
                  padding: '2px 9px', borderRadius: 2, letterSpacing: '0.06em', cursor: 'pointer',
                  color: viewMode === mode ? C.text : C.sub,
                  background: viewMode === mode ? 'rgba(148,163,184,0.10)' : 'transparent',
                  border: `1px solid ${viewMode === mode ? C.sub : C.border}`,
                  textTransform: 'uppercase',
                  transition: 'all 0.12s',
                }}
              >
                {mode === 'condensed' ? '≡ Condensed' : '⊞ Expanded'}
              </button>
            ))}
          </div>
        </div>

        {/* Filter legend */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {FILTER_DEFS.map(f => {
            const count = f.key === 'all' ? baseRows.length : (flagCounts[f.key as SigKey] ?? 0);
            const active = legendFilter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setLegendFilter(prev => prev === f.key ? 'all' : f.key)}
                style={{
                  fontFamily: mono, fontSize: 9, fontWeight: active ? 700 : 500,
                  padding: '2px 8px', borderRadius: 2, letterSpacing: '0.06em', cursor: 'pointer',
                  color: f.color,
                  background: active ? `${f.border}20` : 'transparent',
                  border: `1px solid ${active ? f.border : C.border}`,
                  opacity: active ? 1 : 0.65,
                  transition: 'all 0.12s',
                }}
              >
                {f.label}{count > 0 ? ` (${count})` : ''}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Table ── */}
      {recsLoading ? (
        <div style={{ padding: '0 16px', flexShrink: 0 }}>
          {[1,2,3,4,5,6,7,8].map(i => <Skel key={i} />)}
        </div>
      ) : rows.length === 0 ? (
        <div style={{ fontFamily: mono, fontSize: 11, color: C.dim, padding: '12px 16px' }}>
          {recsData ? '— no assets match this filter' : '— timing data loads on first visit · check back in ~30 seconds'}
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          {viewMode === 'expanded' && <table style={{ borderCollapse: 'collapse', minWidth: 1700 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: C.card }}>
              {/* Group header row */}
              <tr style={{ borderBottom: `1px solid rgba(30,37,53,0.6)` }}>
                {[
                  { label: 'Identity',     span: 2, color: C.dim,    gb: false },
                  { label: 'Verdict',      span: 2, color: '#818cf8', gb: true  },
                  { label: 'Trend',        span: 4, color: C.a2,     gb: true  },
                  { label: 'Momentum',     span: 5, color: C.warn,   gb: true  },
                  { label: 'Range',        span: 3, color: '#c084fc', gb: true  },
                  { label: 'Activity',     span: 3, color: C.accent, gb: true  },
                  { label: 'Risk',         span: 4, color: C.down,   gb: true  },
                  { label: 'Fundamentals', span: 3, color: C.accent, gb: true  },
                  { label: 'P&L',          span: 1, color: C.up,     gb: true  },
                ].map(g => (
                  <th key={g.label} colSpan={g.span} style={{ padding: '3px 6px', textAlign: 'center', fontFamily: mono, fontSize: 10, fontWeight: 700, color: g.color, letterSpacing: '0.14em', textTransform: 'uppercase', borderLeft: g.gb ? `1px solid ${C.border}` : undefined }}>
                    {g.label}
                  </th>
                ))}
              </tr>
              {/* Column header row */}
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {([
                  { label: 'TICKER',  w: 58, align: 'left'   as const, gb: false },
                  { label: 'PRICE',   w: 62, align: 'right'  as const, gb: false },
                  { label: 'BUY',     w: 52, align: 'center' as const, gb: true  },
                  { label: 'SELL',    w: 52, align: 'center' as const, gb: false },
                  { label: '200MA',   w: 52, align: 'right'  as const, gb: true  },
                  { label: '50MA',    w: 46, align: 'right'  as const, gb: false },
                  { label: '20MA',    w: 46, align: 'right'  as const, gb: false },
                  { label: 'ADX',     w: 36, align: 'right'  as const, gb: false },
                  { label: 'RSI',     w: 32, align: 'right'  as const, gb: true  },
                  { label: 'MOM 20D', w: 54, align: 'right'  as const, gb: false },
                  { label: 'MACD',    w: 36, align: 'center' as const, gb: false },
                  { label: 'MOM 1Y',  w: 52, align: 'right'  as const, gb: false },
                  { label: 'RS/SPY',  w: 52, align: 'right'  as const, gb: false },
                  { label: '52W↓',    w: 48, align: 'right'  as const, gb: true  },
                  { label: '52W↑',    w: 46, align: 'right'  as const, gb: false },
                  { label: 'BB%B',    w: 38, align: 'right'  as const, gb: false },
                  { label: 'CMF',     w: 42, align: 'right'  as const, gb: true  },
                  { label: 'VOLAT',   w: 46, align: 'right'  as const, gb: false },
                  { label: 'VOL%',    w: 46, align: 'right'  as const, gb: false },
                  { label: 'SAFE',    w: 38, align: 'right'  as const, gb: true  },
                  { label: 'R/R',     w: 36, align: 'right'  as const, gb: false },
                  { label: 'ATR%',    w: 42, align: 'right'  as const, gb: false },
                  { label: 'BETA',    w: 36, align: 'right'  as const, gb: false },
                  { label: 'P/E',     w: 42, align: 'right'  as const, gb: true  },
                  { label: 'REC',     w: 66, align: 'center' as const, gb: false },
                  { label: 'EPS',     w: 54, align: 'right'  as const, gb: false },
                  { label: 'PROFIT',  w: 68, align: 'right'  as const, gb: true  },
                ] as const).map(col => (
                  <th
                    key={col.label}
                    style={{ ...thStyle(col.w, col.align, undefined, col.gb), cursor: 'pointer', color: headerPopup?.label === col.label ? C.text : C.sub, transition: 'color 0.12s' }}
                    onClick={onHd(col.label)}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(() => {
                const elements: React.ReactNode[] = [];
                let lastGroup: GroupId | null = null;

                rows.forEach(rec => {
                  const gid = getGroupId(rec);
                  if (gid !== lastGroup) {
                    lastGroup = gid;
                    const g = GROUP_META[gid];
                    elements.push(
                      <tr key={`sep-${gid}`}>
                        <td colSpan={TOTAL_COLS} style={{ padding: '4px 8px', background: g.bg, borderTop: `1px solid ${g.border}`, borderBottom: `1px solid ${g.border}` }}>
                          <span style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, color: g.color, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{g.label}</span>
                          <span style={{ fontFamily: mono, fontSize: 8, color: C.dim, marginLeft: 8 }}>{g.scoreLabel}</span>
                        </td>
                      </tr>
                    );
                  }

                  const ind = rec.indicators ?? {};
                  const sig = getRecSignal(rec);
                  const rowBg = sig === 'strongEntry' ? 'rgba(34,197,94,0.04)' : sig === 'modEntry' ? 'rgba(134,239,172,0.03)' : sig === 'trend' ? 'rgba(245,158,11,0.04)' : sig === 'extended' ? 'rgba(251,146,60,0.04)' : sig === 'prime' ? 'rgba(192,132,252,0.04)' : sig === 'recovery' ? 'rgba(79,143,255,0.04)' : undefined;
                  const rowBorderColor = sig ? SIG_FLAGS[sig].color : 'transparent';

                  const d200  = ind.distanceFromMA200 != null ? parseFloat(ind.distanceFromMA200) : null;
                  const d50   = ind.distanceFromMA50  != null ? parseFloat(ind.distanceFromMA50)  : null;
                  const d20   = ind.distanceFromMA20  != null ? parseFloat(ind.distanceFromMA20)  : null;
                  const rsi   = ind.rsi       != null ? +ind.rsi       : null;
                  const mom20 = ind.momentum20 != null ? +ind.momentum20 : null;
                  const mom252 = ind.momentum252 ?? null;
                  const rs    = ind.relativeStrength ?? null;
                  const distH = ind.distanceFromHigh ?? null;
                  const distL = ind.distanceFromLow  ?? null;
                  const bolB  = ind.bollingerB ?? null;
                  const adx   = ind.adx        ?? null;
                  const cmf   = ind.cmf        ?? null;
                  const vol   = ind.volatility  ?? null;
                  const volT  = ind.volumeTrend ?? null;
                  const safe  = ind.safetyScore ?? null;
                  const rr    = ind.riskReward  ?? null;
                  const atr   = ind.atrPercent  ?? null;
                  const beta  = ind.beta        ?? null;
                  const fund  = ind.fundamentals ?? null;
                  const cadPx = ind.cadPrice    ?? null;
                  const profit = (rec.unrealizedPnL ?? 0) + (rec.realizedPnL ?? 0);
                  const topReason = (rec.reasons ?? [])[0] ?? rec.recommendation ?? '';

                  elements.push(
                    <tr key={rec.symbol} title={topReason} style={{ background: rowBg }}>

                      {/* TICKER — left border as signal indicator */}
                      <td style={{ ...tdStyle('left'), boxShadow: `inset 3px 0 0 ${rowBorderColor}`, paddingLeft: 9 }}>
                        <div style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, color: C.text }}>{rec.symbol}</div>
                        {cadPx != null && <div style={{ fontFamily: mono, fontSize: 8, color: C.dim }}>C${cadPx.toFixed(2)}</div>}
                        {sig && <div style={{ fontFamily: mono, fontSize: 8, fontWeight: 700, color: SIG_FLAGS[sig].color, marginTop: 1 }}>{SIG_FLAGS[sig].label}</div>}
                      </td>

                      {/* PRICE — separate cell kept for alignment */}
                      <td style={tdStyle('right')}>
                        {cadPx != null
                          ? <span style={{ fontFamily: mono, fontSize: 10, color: C.sub }}>C${(+cadPx).toFixed(2)}</span>
                          : dash}
                      </td>

                      {/* BUY */}
                      <td style={{ ...tdStyle('center'), borderLeft: `1px solid rgba(30,37,53,0.4)` }}>
                        <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 700, color: cBuy(rec.buyScore) }}>{rec.buyScore ?? '—'}</span>
                      </td>

                      {/* SELL */}
                      <td style={tdStyle('center')}>
                        <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 700, color: cSell(rec.sellScore) }}>{rec.sellScore ?? '—'}</span>
                      </td>

                      {/* 200MA */}
                      <td style={{ ...tdStyle('right'), borderLeft: `1px solid rgba(30,37,53,0.4)` }}>
                        {num(d200, v => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`, cMADist(d200))}
                      </td>

                      {/* 50MA */}
                      <td style={tdStyle('right')}>
                        {num(d50, v => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`, cMADist(d50))}
                      </td>

                      {/* 20MA */}
                      <td style={tdStyle('right')}>
                        {num(d20, v => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`, cMADist(d20))}
                      </td>

                      {/* ADX */}
                      <td style={tdStyle('right')}>
                        {num(adx, v => v.toFixed(0), cADX(adx))}
                      </td>

                      {/* RSI */}
                      <td style={{ ...tdStyle('right'), borderLeft: `1px solid rgba(30,37,53,0.4)` }}>
                        {num(rsi, v => v.toFixed(0), cRSI(rsi))}
                      </td>

                      {/* MOM 20D */}
                      <td style={tdStyle('right')}>
                        {mom20 != null
                          ? <div>
                              <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 600, color: cMom(mom20) }}>{mom20 >= 0 ? '+' : ''}{mom20.toFixed(1)}%</span>
                              {ind.momentum5 != null && ind.momentum5 > 0 && mom20 < 0 && (
                                <div style={{ fontFamily: mono, fontSize: 7, fontWeight: 700, color: '#34d399' }}>↑ rev</div>
                              )}
                            </div>
                          : dash}
                      </td>

                      {/* MACD */}
                      <td style={tdStyle('center')}>
                        {ind.macdBullish != null
                          ? <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 700, color: ind.macdBullish ? C.accent : C.down }}>{ind.macdBullish ? '▲' : '▼'}</span>
                          : dash}
                      </td>

                      {/* MOM 1Y */}
                      <td style={tdStyle('right')}>
                        {num(mom252, v => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`, cMom(mom252, 15, 20))}
                      </td>

                      {/* RS/SPY */}
                      <td style={tdStyle('right')}>
                        {num(rs, v => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`, cMom(rs, 5, 5))}
                      </td>

                      {/* 52W↓ */}
                      <td style={{ ...tdStyle('right'), borderLeft: `1px solid rgba(30,37,53,0.4)` }}>
                        {num(distH, v => `${v.toFixed(0)}%`, distH != null && distH <= -25 ? C.up : distH != null && distH >= -5 ? C.down : C.sub)}
                      </td>

                      {/* 52W↑ */}
                      <td style={tdStyle('right')}>
                        {distL != null
                          ? <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 600, color: distL <= 10 ? C.up : distL <= 30 ? C.sub : distL <= 60 ? '#fb923c' : C.down }}>+{distL.toFixed(0)}%</span>
                          : dash}
                      </td>

                      {/* BB%B */}
                      <td style={tdStyle('right')}>
                        {num(bolB, v => v.toFixed(2), cBB(bolB))}
                      </td>

                      {/* CMF */}
                      <td style={{ ...tdStyle('right'), borderLeft: `1px solid rgba(30,37,53,0.4)` }}>
                        {cmf != null
                          ? <div>
                              <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 600, color: cCMF(cmf) }}>{cmf >= 0 ? '+' : ''}{cmf.toFixed(2)}</span>
                              {(cmf >= 0.10 || cmf <= -0.10) && (
                                <div style={{ fontFamily: mono, fontSize: 7, fontWeight: 700, color: cmf > 0 ? '#34d399' : C.down }}>{cmf >= 0.10 ? 'accum' : 'distr'}</div>
                              )}
                            </div>
                          : dash}
                      </td>

                      {/* VOLATILITY */}
                      <td style={tdStyle('right')}>
                        {num(vol, v => `${v.toFixed(1)}%`, cVol(vol))}
                      </td>

                      {/* VOL RATIO */}
                      <td style={tdStyle('right')}>
                        {num(volT, v => `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`, cVolR(volT))}
                      </td>

                      {/* SAFETY */}
                      <td style={{ ...tdStyle('right'), borderLeft: `1px solid rgba(30,37,53,0.4)` }}>
                        {num(safe, v => String(v), cSafety(safe))}
                      </td>

                      {/* R/R */}
                      <td style={tdStyle('right')}>
                        {num(rr, v => `${v.toFixed(1)}x`, cRR(rr))}
                      </td>

                      {/* ATR% */}
                      <td style={tdStyle('right')}>
                        {num(atr, v => `${v.toFixed(2)}%`, cATR(atr))}
                      </td>

                      {/* BETA */}
                      <td style={tdStyle('right')}>
                        {num(beta, v => v.toFixed(2), cBeta(beta))}
                      </td>

                      {/* P/E */}
                      <td style={{ ...tdStyle('right'), borderLeft: `1px solid rgba(30,37,53,0.4)` }}>
                        {fund?.pe != null
                          ? <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 600, color: cPE(fund.pe) }}>{fund.pe.toFixed(1)}x</span>
                          : dash}
                      </td>

                      {/* REC */}
                      <td style={tdStyle('center')}>
                        {fund?.recommendationKey
                          ? <span style={{ fontFamily: mono, fontSize: 8, fontWeight: 700, color: cRec(fund.recommendationKey), letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                              {fund.recommendationKey.replace('_', ' ')}
                            </span>
                          : dash}
                      </td>

                      {/* EPS */}
                      <td style={tdStyle('right')}>
                        {fund?.eps != null
                          ? <div>
                              <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 600, color: C.sub }}>${fund.eps.toFixed(2)}</span>
                              {fund.epsGrowth != null && (
                                <div style={{ fontFamily: mono, fontSize: 8, color: fund.epsGrowth >= 0 ? C.up : C.down }}>{fund.epsGrowth >= 0 ? '+' : ''}{fund.epsGrowth.toFixed(1)}%</div>
                              )}
                            </div>
                          : dash}
                      </td>

                      {/* PROFIT */}
                      <td style={{ ...tdStyle('right'), borderLeft: `1px solid rgba(30,37,53,0.4)` }}>
                        {(rec.unrealizedPnL != null || rec.realizedPnL != null)
                          ? <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 600, color: profit >= 0 ? C.up : C.down }}>
                              {profit >= 0 ? '+' : ''}${Math.round(Math.abs(profit)).toLocaleString()}
                            </span>
                          : dash}
                      </td>

                    </tr>
                  );
                });

                return elements;
              })()}
            </tbody>
          </table>}

          {viewMode === 'condensed' && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 24px 20px' }}>
            <table style={{ borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: C.card }}>
                <tr style={{ borderBottom: `1px solid rgba(30,37,53,0.6)` }}>
                  {[
                    { label: 'Identity',      span: 1, color: C.dim,    gb: false },
                    { label: 'Position',      span: 4, color: C.sub,    gb: true  },
                    { label: 'Action',        span: 1, color: '#818cf8', gb: true  },
                    { label: 'Verdict',       span: 2, color: '#818cf8', gb: true  },
                    { label: 'Trend',         span: 3, color: C.a2,     gb: true  },
                    { label: 'Momentum',      span: 3, color: C.warn,   gb: true  },
                    { label: 'Range',         span: 3, color: '#c084fc', gb: true  },
                    { label: 'Activity',      span: 1, color: C.accent, gb: true  },
                    { label: 'Risk',          span: 1, color: C.down,   gb: true  },
                    { label: 'Fundamentals',  span: 1, color: C.accent, gb: true  },
                  ].map(g => (
                    <th key={g.label} colSpan={g.span} style={{ padding: '5px 12px', textAlign: 'center', fontFamily: mono, fontSize: 10, fontWeight: 700, color: g.color, letterSpacing: '0.14em', textTransform: 'uppercase', borderLeft: g.gb ? `1px solid ${C.border}` : undefined }}>
                      {g.label}
                    </th>
                  ))}
                </tr>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {([
                    { label: 'TICKER',   w: 82,  align: 'left'   as const, gb: false },
                    { label: '3M SPAN',  w: 88,  align: 'center' as const, gb: true  },
                    { label: 'AVG',      w: 62,  align: 'right'  as const, gb: false },
                    { label: 'PRICE',    w: 62,  align: 'right'  as const, gb: false },
                    { label: 'PROFIT',   w: 76,  align: 'right'  as const, gb: false },
                    { label: 'ACTION',   w: 148, align: 'left'   as const, gb: true  },
                    { label: 'BUY',      w: 58,  align: 'center' as const, gb: true  },
                    { label: 'SELL',     w: 58,  align: 'center' as const, gb: false },
                    { label: '200MA',    w: 56,  align: 'right'  as const, gb: true  },
                    { label: '50MA',     w: 50,  align: 'right'  as const, gb: false },
                    { label: '20MA',     w: 50,  align: 'right'  as const, gb: false },
                    { label: 'MACD',     w: 78,  align: 'center' as const, gb: true  },
                    { label: 'RSI',      w: 40,  align: 'right'  as const, gb: false },
                    { label: 'MOM 20D',  w: 84,  align: 'right'  as const, gb: false },
                    { label: '52W↓',     w: 92,  align: 'right'  as const, gb: true  },
                    { label: '52W↑',     w: 50,  align: 'right'  as const, gb: false },
                    { label: 'BB%B',     w: 44,  align: 'right'  as const, gb: false },
                    { label: 'CMF',      w: 92,  align: 'right'  as const, gb: true  },
                    { label: 'SAFE',     w: 44,  align: 'right'  as const, gb: true  },
                    { label: 'P/E',      w: 100, align: 'right'  as const, gb: true  },
                  ] as const).map(col => (
                    <th
                      key={col.label}
                      style={{ ...thStyleC(col.w, col.align, col.gb), cursor: 'pointer', color: headerPopup?.label === col.label ? C.text : C.sub, transition: 'color 0.12s' }}
                      onClick={onHd(col.label)}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const elements: React.ReactNode[] = [];
                  let lastGroupC: GroupId | null = null;

                  rows.forEach(rec => {
                    const gid = getGroupId(rec);
                    if (gid !== lastGroupC) {
                      if (lastGroupC !== null) {
                        elements.push(
                          <tr key={`gap-c-${gid}`}>
                            <td colSpan={20} style={{ height: 10, background: C.bg, padding: 0 }} />
                          </tr>
                        );
                      }
                      lastGroupC = gid;
                      const g = GROUP_META[gid];
                      elements.push(
                        <tr key={`sep-c-${gid}`}>
                          <td colSpan={20} style={{ padding: '6px 12px', background: g.bg, borderTop: `1px solid ${g.border}`, borderBottom: `1px solid ${g.border}` }}>
                            <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, color: g.color, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{g.label}</span>
                            <span style={{ fontFamily: mono, fontSize: 9, color: C.dim, marginLeft: 8 }}>{g.scoreLabel}</span>
                          </td>
                        </tr>
                      );
                    }

                    const ind = rec.indicators ?? {};
                    const sig = getRecSignal(rec);
                    const action = getActionLabel(rec);
                    const topReason = (rec.reasons ?? [])[0] ?? rec.recommendation ?? '';
                    const shortReason = topReason.length > 46 ? topReason.slice(0, 44) + '…' : topReason;
                    const rowBg = sig === 'strongEntry' ? 'rgba(34,197,94,0.04)' : sig === 'modEntry' ? 'rgba(134,239,172,0.03)' : sig === 'trend' ? 'rgba(245,158,11,0.04)' : sig === 'extended' ? 'rgba(251,146,60,0.04)' : sig === 'prime' ? 'rgba(192,132,252,0.04)' : sig === 'recovery' ? 'rgba(79,143,255,0.04)' : undefined;
                    const rowBorderColor = sig ? SIG_FLAGS[sig].color : 'transparent';

                    const d200  = ind.distanceFromMA200 != null ? parseFloat(ind.distanceFromMA200) : null;
                    const d50   = ind.distanceFromMA50  != null ? parseFloat(ind.distanceFromMA50)  : null;
                    const d20   = ind.distanceFromMA20  != null ? parseFloat(ind.distanceFromMA20)  : null;
                    const rsi   = ind.rsi        != null ? +ind.rsi        : null;
                    const mom20 = ind.momentum20 != null ? +ind.momentum20 : null;
                    const distH = ind.distanceFromHigh ?? null;
                    const distL = ind.distanceFromLow  ?? null;
                    const bolB  = ind.bollingerB   ?? null;
                    const adx   = ind.adx         ?? null;
                    const cmf   = ind.cmf         ?? null;
                    const volT  = ind.volumeTrend ?? null;
                    const safe  = ind.safetyScore ?? null;
                    const rr    = ind.riskReward  ?? null;
                    const fund  = ind.fundamentals ?? null;
                    const cadPx = ind.cadPrice    ?? null;
                    const profit = (rec.unrealizedPnL ?? 0) + (rec.realizedPnL ?? 0);
                    const holding = holdingsBySymbol.get(rec.symbol);
                    const avgCost: number | null = (holding?.averagePrice ?? 0) > 0 ? holding.averagePrice : null;
                    const currPrice: number | null = cadPx != null ? +cadPx : null;
                    const priceVsAvg = avgCost != null && currPrice != null ? (currPrice >= avgCost ? C.up : C.down) : C.sub;

                    elements.push(
                      <tr key={`c-${rec.symbol}`} style={{ background: rowBg }}>

                        {/* TICKER */}
                        <td style={{ ...tdStyleC('left'), boxShadow: `inset 3px 0 0 ${rowBorderColor}`, paddingLeft: 11 }}>
                          <div style={{ fontFamily: mono, fontSize: 12, fontWeight: 700, color: C.text }}>{rec.symbol}</div>
                          {sig && <div style={{ fontFamily: mono, fontSize: 8.5, fontWeight: 700, color: SIG_FLAGS[sig].color, marginTop: 2 }}>{SIG_FLAGS[sig].label}</div>}
                        </td>

                        {/* 3M SPARKLINE */}
                        <td style={{ ...tdStyleC('center'), padding: '6px 5px', borderLeft: `1px solid rgba(30,37,53,0.45)` }}>
                          <Sparkline prices={rec.sparkline?.prices} id={`sp-${rec.symbol}`} />
                        </td>

                        {/* AVG PRICE */}
                        <td style={tdStyleC('right')}>
                          {avgCost != null
                            ? <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 600, color: C.sub }}>C${avgCost.toFixed(2)}</span>
                            : dash}
                        </td>

                        {/* CURR PRICE */}
                        <td style={tdStyleC('right')}>
                          {currPrice != null
                            ? <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 600, color: priceVsAvg }}>C${currPrice.toFixed(2)}</span>
                            : dash}
                        </td>

                        {/* PROFIT */}
                        <td style={tdStyleC('right')}>
                          {(rec.unrealizedPnL != null || rec.realizedPnL != null)
                            ? <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 600, color: profit >= 0 ? C.up : C.down }}>
                                {profit >= 0 ? '+' : ''}${Math.round(Math.abs(profit)).toLocaleString()}
                              </span>
                            : dash}
                        </td>

                        {/* ACTION */}
                        <td style={{ ...tdStyleC('left', true), background: action.bg }}>
                          <div style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, color: action.color }}>{action.label}</div>
                          {shortReason && <div style={{ fontFamily: mono, fontSize: 8, color: C.sub, marginTop: 3, lineHeight: 1.4, maxWidth: 132 }}>{shortReason}</div>}
                        </td>

                        {/* BUY */}
                        <td style={tdStyleC('center', true)}>
                          <span style={{ fontFamily: mono, fontSize: 15, fontWeight: 700, color: cBuy(rec.buyScore) }}>{rec.buyScore ?? '—'}</span>
                        </td>

                        {/* SELL */}
                        <td style={tdStyleC('center')}>
                          <span style={{ fontFamily: mono, fontSize: 15, fontWeight: 700, color: cSell(rec.sellScore) }}>{rec.sellScore ?? '—'}</span>
                        </td>

                        {/* 200MA */}
                        <td style={tdStyleC('right', true)}>
                          {num(d200, v => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`, cMADist(d200))}
                        </td>

                        {/* 50MA */}
                        <td style={tdStyleC('right')}>
                          {num(d50, v => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`, cMADist(d50))}
                        </td>

                        {/* 20MA */}
                        <td style={tdStyleC('right')}>
                          {num(d20, v => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`, cMADist(d20))}
                        </td>

                        {/* MACD + ADX inline */}
                        <td style={tdStyleC('center', true)}>
                          {ind.macdBullish != null
                            ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                                <span style={{ fontFamily: mono, fontSize: 15, fontWeight: 700, color: ind.macdBullish ? C.accent : C.down }}>{ind.macdBullish ? '▲' : '▼'}</span>
                                {adx != null && <>
                                  <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>·</span>
                                  <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 600, color: cADX(adx) }}>ADX {adx.toFixed(0)}</span>
                                </>}
                              </div>
                            : dash}
                        </td>

                        {/* RSI */}
                        <td style={tdStyleC('right')}>
                          <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 600, color: cRSI(rsi) }}>{rsi != null ? rsi.toFixed(0) : '—'}</span>
                        </td>

                        {/* MOM 20D + rev inline */}
                        <td style={tdStyleC('right')}>
                          {mom20 != null
                            ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5 }}>
                                <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 600, color: cMom(mom20) }}>{mom20 >= 0 ? '+' : ''}{mom20.toFixed(1)}%</span>
                                {ind.momentum5 != null && ind.momentum5 > 0 && mom20 < 0 && <>
                                  <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>·</span>
                                  <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, color: '#34d399' }}>↑ rev</span>
                                </>}
                              </div>
                            : dash}
                        </td>

                        {/* 52W↓ + R/R inline */}
                        <td style={tdStyleC('right', true)}>
                          {distH != null
                            ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5 }}>
                                <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 600, color: distH <= -25 ? C.up : distH >= -5 ? C.down : C.sub }}>{distH.toFixed(0)}%</span>
                                {rr != null && <>
                                  <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>·</span>
                                  <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 600, color: cRR(rr) }}>R/R {rr.toFixed(1)}x</span>
                                </>}
                              </div>
                            : dash}
                        </td>

                        {/* 52W↑ */}
                        <td style={tdStyleC('right')}>
                          {distL != null
                            ? <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 600, color: distL <= 10 ? C.up : distL <= 30 ? C.sub : distL <= 60 ? '#fb923c' : C.down }}>+{distL.toFixed(0)}%</span>
                            : dash}
                        </td>

                        {/* BB%B */}
                        <td style={tdStyleC('right')}>
                          {num(bolB, v => v.toFixed(2), cBB(bolB))}
                        </td>

                        {/* CMF + VOL% inline */}
                        <td style={tdStyleC('right', true)}>
                          {cmf != null
                            ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5 }}>
                                <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 600, color: cCMF(cmf) }}>{cmf >= 0 ? '+' : ''}{cmf.toFixed(2)}</span>
                                {volT != null && <>
                                  <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>·</span>
                                  <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 600, color: cVolR(volT) }}>vol {volT >= 0 ? '+' : ''}{volT.toFixed(0)}%</span>
                                </>}
                              </div>
                            : dash}
                        </td>

                        {/* SAFE */}
                        <td style={tdStyleC('right', true)}>
                          <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 600, color: cSafety(safe) }}>{safe != null ? String(safe) : '—'}</span>
                        </td>

                        {/* P/E + REC inline */}
                        <td style={tdStyleC('right', true)}>
                          {fund?.pe != null
                            ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5 }}>
                                <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 600, color: cPE(fund.pe) }}>{fund.pe.toFixed(1)}x</span>
                                {fund.recommendationKey && <>
                                  <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>·</span>
                                  <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, color: cRec(fund.recommendationKey), letterSpacing: '0.04em', textTransform: 'uppercase' }}>{fund.recommendationKey.replace('_', ' ')}</span>
                                </>}
                              </div>
                            : fund?.recommendationKey
                            ? <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, color: cRec(fund.recommendationKey), letterSpacing: '0.04em', textTransform: 'uppercase' }}>{fund.recommendationKey.replace('_', ' ')}</span>
                            : dash}
                        </td>


                      </tr>
                    );
                  });

                  return elements;
                })()}
              </tbody>
            </table>
            </div>
          )}
        </div>
      )}

      {/* ── Column description popup ── */}
      {headerPopup && (
        <div
          ref={popupRef}
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: headerPopup.x,
            top: headerPopup.y,
            zIndex: 9999,
            width: 300,
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 7,
            padding: '12px 15px 13px',
            boxShadow: '0 20px 56px rgba(0,0,0,0.65), 0 0 0 1px rgba(30,37,53,0.5)',
            animation: 'timingHeaderIn 0.17s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <div style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, color: C.accent, letterSpacing: '0.13em', textTransform: 'uppercase', marginBottom: 9 }}>
            {headerPopup.label}
          </div>
          <div style={{ height: 1, background: C.border, marginBottom: 10 }} />
          {headerPopup.content.what && (
            <div style={{ fontFamily: mono, fontSize: 11, color: C.text, lineHeight: 1.6, opacity: 0.75, marginBottom: headerPopup.content.signals.length > 0 ? 11 : 0 }}>
              {headerPopup.content.what}
            </div>
          )}
          {headerPopup.content.signals.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {headerPopup.content.signals.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ fontFamily: mono, fontSize: 10, color: C.accent, marginTop: 1, flexShrink: 0, opacity: 0.6 }}>·</span>
                  <span style={{ fontFamily: mono, fontSize: 11, color: C.sub, lineHeight: 1.45 }}>{s}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Legend key ── */}
      <div style={{ padding: '7px 16px', borderTop: `1px solid ${C.border}`, flexShrink: 0, display: 'flex', flexWrap: 'wrap', gap: '2px 14px' }}>
        {[
          'BUY/SELL 0–100 · ≥70 strong signal',
          '200/50/20MA % vs avg · green = below (value)',
          'RSI ≤30 oversold · ≥70 overbought',
          'MACD ▲ bullish · ▼ bearish',
          'MOM 1Y annual · RS/SPY outperformance vs market',
          'BB%B ≤.2 lower band · ≥.8 upper band',
          'CMF ≥+.10 accum · ≤−.10 distribution',
          'SAFE volatility+drawdown+ATR score · ≥70 low risk',
          'R/R ≥3 asymmetric upside · ATR% daily range',
          'Hover row for top signal reason',
        ].map(t => (
          <span key={t} style={{ fontFamily: mono, fontSize: 7.5, color: C.dim }}>{t}</span>
        ))}
      </div>
    </div>
  );
};

// ── Main ──────────────────────────────────────────────────────────────────────

const Timing: React.FC = () => {
  const { latestPortfolio } = useCache();
  const [holdingFilter, setHoldingFilter] = useState<'active' | 'all'>('active');

  const { data: watchlistData } = useQuery(
    'timing-watchlist',
    () => axios.get('/api/portfolio/watchlist').then(r => r.data.watchlist),
    { staleTime: 5 * 60_000, cacheTime: 15 * 60_000 }
  );

  // All active holdings sorted by value
  const sortedActive: any[] = useMemo(() => {
    const h = (latestPortfolio?.holdings as any[]) ?? [];
    return h
      .filter((x: any) => (x.quantity ?? 0) > 1e-6)
      .sort((a: any, b: any) => (b.currentValue ?? 0) - (a.currentValue ?? 0));
  }, [latestPortfolio]);

  // "active" = current holdings only; "all" = active + inactive + custom watchlist
  const activeHoldings: any[] = useMemo(() => {
    if (holdingFilter === 'active') return sortedActive;
    const activeSymbols = new Set(sortedActive.map((h: any) => h.symbol));
    const inactiveSymbols: string[] = (watchlistData?.inactive ?? []).filter((s: string) => !activeSymbols.has(s));
    const customSymbols: string[] = (watchlistData?.custom ?? []).filter((s: string) => !activeSymbols.has(s));
    const extras = [...inactiveSymbols, ...customSymbols].map((symbol: string) => ({
      symbol, totalAmountInvested: 0, unrealizedPnL: 0, realizedPnL: 0, currentValue: 0, quantity: 0,
    }));
    return [...sortedActive, ...extras];
  }, [sortedActive, holdingFilter, watchlistData]);

  const holdingsForRecs = useMemo(() =>
    activeHoldings.map(h => ({
      symbol:            h.symbol,
      currentInvestment: h.totalAmountInvested ?? h.totalInvested ?? 0,
      unrealizedPnL:     h.unrealizedPnL ?? 0,
      realizedPnL:       h.realizedPnL   ?? 0,
    })),
    [activeHoldings]
  );

  const holdingsBySymbol = useMemo(() => {
    const m = new Map<string, any>();
    sortedActive.forEach(h => m.set(h.symbol, h));
    return m;
  }, [sortedActive]);

  const { data: recsData, isLoading: recsLoading } = useQuery(
    ['timing-recs', holdingsForRecs.map(h => h.symbol).join(',')],
    () => axios.post('/api/rebalancing-recommendations/all-active', { holdings: holdingsForRecs }).then(r => r.data),
    { enabled: holdingsForRecs.length > 0, staleTime: 10 * 60_000, cacheTime: 30 * 60_000, retry: 1 }
  );

  return (
    <div style={{
      padding: 16,
      height: '100%',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      background: C.bg,
    }}>
      <TimingSignals recsData={recsData} recsLoading={recsLoading} holdingsBySymbol={holdingsBySymbol} holdingFilter={holdingFilter} setHoldingFilter={setHoldingFilter} />
    </div>
  );
};

export default Timing;
