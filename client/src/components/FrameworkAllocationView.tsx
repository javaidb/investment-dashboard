import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp, X, SlidersHorizontal, Cpu, Heart, Zap, Landmark, ShoppingCart, Factory, Radio, Package, Globe, Bitcoin, Lock, LucideIcon, PieChart as PieIcon } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip } from 'recharts';
import {
  POSITION_ROLES,
  SECTOR_TARGETS,
  SIZING_RULES,
  SECTOR_ORDER,
  ROLE_ICONS,
  PositionRole,
  PositionFramework,
  SectorTarget,
} from '../data/portfolio-framework';

// ── Dark palette ───────────────────────────────────────────────────────────
const D = {
  bg:     '#0a0c10',
  card:   '#10141c',
  inner:  '#141820',
  border: '#1e2535',
  text:   '#e2e8f0',
  sub:    '#94a3b8',
  dim:    '#4a5568',
  dimmer: '#2d3748',
  green:  '#10b981',
  red:    '#f43f5e',
  blue:   '#3b82f6',
  yellow: '#f59e0b',
  orange: '#fb923c',
  violet: '#8b5cf6',
  indigo: '#6366f1',
  mono:   "'IBM Plex Mono', 'Courier New', monospace",
} as const;

// ── Sector override management ────────────────────────────────────────────

interface SectorOverride {
  exitSector?: boolean;
  intentionalOW?: boolean;
  min?: number;
  max?: number;
}

const TARGETS_KEY = 'timing-user-targets';
function loadPriceTargets(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(TARGETS_KEY) ?? '{}'); }
  catch { return {}; }
}

const SECTOR_OV_KEY = 'portfolio-framework-sector-overrides';

function loadSectorOverrides(): Record<string, SectorOverride> {
  try { return JSON.parse(localStorage.getItem(SECTOR_OV_KEY) ?? '{}'); }
  catch { return {}; }
}

function getEffectiveSectorTarget(sector: string, ovs: Record<string, SectorOverride>): SectorTarget | undefined {
  const base = SECTOR_TARGETS[sector];
  const ov = ovs[sector];
  if (!ov) return base;
  return {
    min: ov.min ?? base?.min ?? 0,
    max: ov.max ?? base?.max ?? 0,
    intentionalOW: 'intentionalOW' in ov ? ov.intentionalOW : base?.intentionalOW,
    maxAllowed: base?.maxAllowed,
    exitSector: 'exitSector' in ov ? ov.exitSector : base?.exitSector,
  };
}

// ── Position override management ──────────────────────────────────────────

interface ExitCondition {
  type: 'now' | 'pnl' | 'custom';
  pnlPct?: number;
  breakeven?: boolean;
  note?: string;
}

interface PositionOverride {
  role?: PositionRole;
  sector?: string;
  verdict?: 'sell' | 'decide' | null;
  buildTarget?: number | null;
  exitCondition?: ExitCondition | null;
}

function fmtExitLabel(ec?: ExitCondition | null): string {
  if (!ec || ec.type === 'now') return 'Exit NOW';
  if (ec.type === 'pnl') {
    if (ec.breakeven) return ec.pnlPct != null ? `Exit @ BE (${ec.pnlPct >= 0 ? '+' : ''}${ec.pnlPct.toFixed(1)}%)` : 'Exit @ BE';
    return ec.pnlPct != null ? `Exit @ ${ec.pnlPct >= 0 ? '+' : ''}${ec.pnlPct}% P&L` : 'Exit @ P&L%';
  }
  return ec.note ? `Exit when: ${ec.note}` : 'Exit (condition)';
}

type OverrideMap = Record<string, PositionOverride>;
const STORAGE_KEY = 'portfolio-framework-overrides';

function loadOverrides(): OverrideMap {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'); }
  catch { return {}; }
}

const LOCKS_KEY = 'portfolio-framework-locks';
function loadLocks(): Set<string> {
  try {
    const arr = JSON.parse(localStorage.getItem(LOCKS_KEY) ?? '[]');
    return new Set(Array.isArray(arr) ? arr : []);
  } catch { return new Set(); }
}

function resolvePosition(base: PositionFramework, override?: PositionOverride): PositionFramework {
  if (!override) return base;
  const role = override.role ?? base.role;
  const rule = SIZING_RULES[role];
  return {
    ...base, role,
    sector: override.sector ?? base.sector,
    targetMin: rule.min, targetMax: rule.max,
    buildTarget: 'buildTarget' in override
      ? (override.buildTarget ?? undefined)
      : (override.role ? undefined : base.buildTarget),
    verdict: 'verdict' in override ? (override.verdict === null ? undefined : override.verdict) : base.verdict,
  };
}

// ── Types ─────────────────────────────────────────────────────────────────

interface SlimPosition {
  symbol: string;
  shares: number;
  marketValue: number;
  totalCost: number;
  sector?: string;
  type?: string;
  realizedPnL?: number;
  currentPrice?: number;
  averagePrice?: number;
}

type PositionStatus = 'on-target' | 'undersized' | 'oversized' | 'building' | 'trimming' | 'not-held' | 'sell' | 'decide' | 'unassigned';

interface PositionData {
  symbol: string;
  sector: string;
  marketValue: number;
  currentPct: number;
  isExcluded: boolean;
  fw: PositionFramework | null;
  status: PositionStatus;
}

interface Props {
  positions: SlimPosition[];
  symbolSubsectors?: Record<string, string[]>;
  symbolMomentum5?: Record<string, number>;
  symbolMomentum20?: Record<string, number>;
  showAll?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function getPositionStatus(currentPct: number, fw: PositionFramework | null, held: boolean): PositionStatus {
  if (!fw) return held ? 'unassigned' : 'not-held';
  if (fw.verdict === 'sell') return held ? 'sell' : 'not-held';
  if (fw.verdict === 'decide') return held ? 'decide' : 'not-held';
  if (!held) return 'not-held';
  if (fw.buildTarget) {
    if (currentPct < fw.buildTarget) return 'building';
    if (currentPct > fw.buildTarget) return 'trimming';
    return 'on-target';
  }
  if (currentPct > fw.targetMax + 1) return 'oversized';
  if (currentPct < fw.targetMin - 0.5) return 'undersized';
  return 'on-target';
}

// ── Constants ─────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<PositionStatus, { label: string; style: React.CSSProperties }> = {
  'on-target':  { label: 'On target',  style: { background: '#0a2a1a', color: D.green,  border: '1px solid #1a4a2a' } },
  'building':   { label: 'Building',   style: { background: '#1a1500', color: D.yellow, border: '1px solid #2a2500' } },
  'oversized':  { label: 'Oversized',  style: { background: '#2a0a0a', color: D.red,    border: '1px solid #4a1a1a' } },
  'undersized': { label: 'Undersized', style: { background: '#1a1500', color: '#eab308',border: '1px solid #2a2500' } },
  'not-held':   { label: 'Not held',   style: { background: D.inner,   color: D.dim,    border: `1px solid ${D.border}` } },
  'trimming':   { label: 'Trimming',   style: { background: '#2a1000', color: D.orange, border: '1px solid #4a2000' } },
  'sell':       { label: 'Exit',       style: { background: '#2a0a0a', color: D.red,    border: '1px solid #4a1a1a' } },
  'decide':     { label: 'Decide',     style: { background: '#1a0a2a', color: D.violet, border: '1px solid #2a1a4a' } },
  'unassigned': { label: 'Unassigned', style: { background: D.inner,   color: D.dimmer, border: `1px solid ${D.border}` } },
};

const ROLE_SLEEVE_TARGETS: Record<PositionRole, { min: number; max: number }> = {
  Anchor:      { min: 40, max: 55 },
  Supporting:  { min: 20, max: 30 },
  Speculative: { min: 10, max: 20 },
};

const ROLE_BADGE_STYLE: Record<PositionRole, React.CSSProperties> = {
  Anchor:      { background: '#0a0a2a', color: D.indigo, border: '1px solid #1a1a4a' },
  Supporting:  { background: '#0a2a1a', color: D.green,  border: '1px solid #1a4a2a' },
  Speculative: { background: '#1a1500', color: D.yellow, border: '1px solid #2a2500' },
};

const ROLE_ORDER: Record<PositionRole, number> = { Anchor: 0, Supporting: 1, Speculative: 2 };

const SECTOR_ICONS: Record<string, LucideIcon> = {
  'Tech':               Cpu,
  'Healthcare':         Heart,
  'Energy':             Zap,
  'Financial Services': Landmark,
  'Consumer Cyclical':  ShoppingCart,
  'Industrials':        Factory,
  'Telecommunications': Radio,
  'Materials':          Package,
  'Broad Market':       Globe,
  'Cryptocurrency':     Bitcoin,
};

const SECTOR_COLORS: Record<string, string> = {
  'Tech':               '#6366f1',
  'Healthcare':         '#ec4899',
  'Energy':             '#f97316',
  'Financial Services': '#22c55e',
  'Consumer Cyclical':  '#a855f7',
  'Industrials':        '#78716c',
  'Telecommunications': '#06b6d4',
  'Materials':          '#d97706',
  'Broad Market':       '#14b8a6',
  'Cryptocurrency':     '#eab308',
};

const MODAL_VERDICTS = [
  { value: null,              label: 'Keep',   color: '#22c55e' },
  { value: 'sell' as const,   label: 'Exit',   color: '#ef4444' },
  { value: 'decide' as const, label: 'Decide', color: '#8b5cf6' },
];

// ── Static Asset Allocation Bar ───────────────────────────────────────────

const StaticAssetBar: React.FC<{
  positions: { symbol: string; shares?: number; marketValue: number; sector?: string }[];
  colors: Record<string, string>;
  sectorOrder: string[];
}> = ({ positions, colors, sectorOrder }) => {
  const held = positions.filter(p => (p.shares ?? 0) >= 0.001 && p.marketValue > 0);
  const total = held.reduce((s, p) => s + p.marketValue, 0) || 1;

  const sorted = [...held].sort((a, b) => {
    const ai = sectorOrder.indexOf(a.sector ?? '');
    const bi = sectorOrder.indexOf(b.sector ?? '');
    if (ai !== bi) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    return b.marketValue - a.marketValue;
  });

  return (
    <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
      <p style={{ fontFamily: D.mono, fontSize: 11, fontWeight: 700, color: D.sub, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
        Actual Asset Allocation
      </p>
      <div style={{ position: 'relative', height: 40, display: 'flex', borderRadius: 6, overflow: 'hidden', userSelect: 'none' }}>
        {sorted.map((p, i) => {
          const widthPct = (p.marketValue / total) * 100;
          const hex = colors[p.sector ?? ''] ?? '#6b7280';
          const r = parseInt(hex.slice(1, 3), 16);
          const g = parseInt(hex.slice(3, 5), 16);
          const b = parseInt(hex.slice(5, 7), 16);
          return (
            <div
              key={p.symbol}
              title={`${p.symbol} — ${widthPct.toFixed(1)}%`}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: `${widthPct}%`,
                background: `rgba(${r}, ${g}, ${b}, 0.1)`,
                border: `1px solid rgba(${r}, ${g}, ${b}, 0.35)`,
                borderRadius: i === 0 ? '6px 0 0 6px' : i === sorted.length - 1 ? '0 6px 6px 0' : undefined,
                overflow: 'hidden',
              }}
            >
              <div style={{ width: '100%', overflow: 'hidden', textAlign: 'center', padding: '0 4px', lineHeight: 1.3 }}>
                <div style={{ color: hex, fontSize: 10, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.symbol}</div>
                <div style={{ color: hex, fontSize: 10, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.8 }}>{widthPct.toFixed(1)}%</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Draggable Sector Allocation Bar ───────────────────────────────────────

const DraggableAllocationBar: React.FC<{
  sectors: string[];
  getTarget: (s: string) => SectorTarget | undefined;
  applyOv: (sector: string, ov: SectorOverride) => void;
  colors: Record<string, string>;
}> = ({ sectors, getTarget, applyOv, colors }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ idx: number; startX: number; startMaxes: number[] } | null>(null);

  const activeSectors = sectors.filter(s => {
    const t = getTarget(s);
    return t && !t.exitSector;
  });

  const maxes = activeSectors.map(s => getTarget(s)?.max ?? 0);
  const totalMax = maxes.reduce((a, b) => a + b, 0) || 100;

  const handleMouseDown = (e: React.MouseEvent, idx: number) => {
    e.preventDefault();
    if (!containerRef.current) return;
    dragRef.current = { idx, startX: e.clientX, startMaxes: [...maxes] };

    const onMove = (me: MouseEvent) => {
      if (!dragRef.current || !containerRef.current) return;
      const containerWidth = containerRef.current.offsetWidth;
      const dx = me.clientX - dragRef.current.startX;
      const dPct = (dx / containerWidth) * totalMax;

      const newMaxes = [...dragRef.current.startMaxes];
      const li = dragRef.current.idx;
      const ri = li + 1;

      const newLeft  = Math.max(1, newMaxes[li] + dPct);
      const newRight = Math.max(1, newMaxes[ri] - dPct);
      if (newLeft + newRight !== newMaxes[li] + newMaxes[ri]) return;

      newMaxes[li] = newLeft;
      newMaxes[ri] = newRight;

      const leftSector  = activeSectors[li];
      const rightSector = activeSectors[ri];
      const lt = getTarget(leftSector);
      const rt = getTarget(rightSector);
      const lRatio = lt && lt.max ? lt.min / lt.max : 0.6;
      const rRatio = rt && rt.max ? rt.min / rt.max : 0.6;

      applyOv(leftSector,  { max: Math.round(newLeft),  min: Math.max(0, Math.round(newLeft  * lRatio)) });
      applyOv(rightSector, { max: Math.round(newRight), min: Math.max(0, Math.round(newRight * rRatio)) });
    };

    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  let cumPct = 0;
  return (
    <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
      <p style={{ fontFamily: D.mono, fontSize: 11, fontWeight: 700, color: D.sub, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
        Sector Target Allocation — drag dividers to adjust
      </p>
      <div ref={containerRef} style={{ position: 'relative', height: 40, display: 'flex', borderRadius: 6, overflow: 'visible', userSelect: 'none' }}>
        {activeSectors.map((sector, i) => {
          const target = getTarget(sector);
          const widthPct = (maxes[i] / totalMax) * 100;
          const leftPct = cumPct;
          cumPct += widthPct;
          const hex = colors[sector] ?? '#6b7280';
          const r = parseInt(hex.slice(1, 3), 16);
          const g = parseInt(hex.slice(3, 5), 16);
          const b = parseInt(hex.slice(5, 7), 16);
          return (
            <React.Fragment key={sector}>
              <div
                style={{
                  position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', width: `${widthPct}%`,
                  background: `rgba(${r}, ${g}, ${b}, 0.1)`,
                  border: `1px solid rgba(${r}, ${g}, ${b}, 0.35)`,
                  borderRadius: i === 0 ? '6px 0 0 6px' : i === activeSectors.length - 1 ? '0 6px 6px 0' : undefined,
                }}
              >
                <div style={{ width: '100%', overflow: 'hidden', textAlign: 'center', padding: '0 4px', lineHeight: 1.3 }}>
                  <div style={{ color: hex, fontSize: 10, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sector}</div>
                  <div style={{ color: hex, fontSize: 10, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.8 }}>{target?.min}–{target?.max}%</div>
                </div>
              </div>
              {i < activeSectors.length - 1 && (
                <div
                  style={{ position: 'absolute', top: 0, bottom: 0, width: 12, cursor: 'col-resize', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', left: `calc(${leftPct + widthPct}% - 6px)` }}
                  onMouseDown={e => handleMouseDown(e, i)}
                >
                  <div style={{ width: 2, height: '100%', background: 'rgba(255,255,255,0.15)' }} />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
      <p style={{ fontFamily: D.mono, fontSize: 10, color: D.dim, marginTop: 8 }}>
        Drag dividers to adjust target ranges. Min scales proportionally.
      </p>
    </div>
  );
};

// ── Component ─────────────────────────────────────────────────────────────

const SUBSECTOR_COLORS: Record<string, string> = {
  'AI': '#6366F1', 'Semiconductors': '#3B82F6', 'Cloud & SaaS': '#0EA5E9',
  'Cybersecurity': '#06B6D4', 'Quantum Computing': '#8B5CF6', 'Social Media': '#EC4899',
  'Search & Advertising': '#F59E0B', 'Consumer Electronics': '#10B981',
  'Bitcoin': '#F97316', 'Altcoins': '#FBBF24', 'Defense': '#475569',
  'Electric Vehicles': '#22C55E', 'Aerospace': '#94A3B8', 'Oil & Gas': '#92400E',
  'Natural Gas': '#D97706', 'Pipelines': '#78716C', 'Uranium': '#84CC16',
  'Nuclear Power': '#A3E635', 'Pharmaceuticals': '#EF4444', 'Biotech': '#F43F5E',
  'Medical Devices': '#F87171', 'Health Insurance': '#FB7185', 'Telehealth': '#FDA4AF',
  'Fintech': '#A78BFA', 'Payments': '#7C3AED', 'Banks': '#5B21B6',
  'Insurance': '#4C1D95', 'Asset Management': '#6D28D9', 'Fixed Income': '#64748B',
  'Gold': '#CA8A04', 'Silver': '#CBD5E1', 'Battery Materials': '#4ADE80',
  'Mining': '#166534', 'E-Commerce': '#34D399', 'Gaming': '#2DD4BF',
  'Industrial Equipment': '#FB923C', 'Clean Technology': '#059669',
  'Data Centers': '#67E8F9', 'Space': '#818CF8', 'Robotics / Automation': '#C084FC',
  'Streaming / Media': '#F9A8D4',
};
const SUB_FALLBACK = ['#E879F9','#FCD34D','#6EE7B7','#93C5FD','#FCA5A1','#A5B4FC'];
function subColor(name: string, idx: number) {
  return SUBSECTOR_COLORS[name] ?? SUB_FALLBACK[idx % SUB_FALLBACK.length];
}

const FrameworkAllocationView: React.FC<Props> = ({ positions, symbolSubsectors = {}, symbolMomentum5 = {}, symbolMomentum20 = {}, showAll = false }) => {
  const [tableOpen,       setTableOpen]       = useState(false);
  const [editSymbol,      setEditSymbol]       = useState<string | null>(null);
  const [editSectorName,  setEditSectorName]   = useState<string | null>(null);
  const [overrides,       setOverrides]        = useState<OverrideMap>(loadOverrides);
  const [sectorOverrides, setSectorOverrides]  = useState<Record<string, SectorOverride>>(loadSectorOverrides);
  const [locks,           setLocks]           = useState<Set<string>>(loadLocks);
  const [view,            setView]            = useState<'allocation' | 'pnl' | 'buys'>('allocation');
  const [pieOpenSector,   setPieOpenSector]   = useState<string | null>(null);

  useEffect(() => {
    const handler = () => setOverrides(loadOverrides());
    window.addEventListener('investment-dashboard:targets-wrote-framework', handler);
    return () => window.removeEventListener('investment-dashboard:targets-wrote-framework', handler);
  }, []);

  const applySectorOverride = useCallback((sector: string, ov: Partial<SectorOverride>) => {
    setSectorOverrides(prev => {
      const next = { ...prev, [sector]: { ...prev[sector], ...ov } };
      localStorage.setItem(SECTOR_OV_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const getEffTarget = useCallback((sector: string) =>
    getEffectiveSectorTarget(sector, sectorOverrides), [sectorOverrides]);

  const applyOverride = useCallback((symbol: string, change: PositionOverride) => {
    const pos = positions.find(p => p.symbol === symbol);

    setOverrides(prev => {
      const prevOv = prev[symbol];
      const next = { ...prev, [symbol]: { ...prev[symbol], ...change } };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));

      const newOv = next[symbol];
      const ec = newOv?.exitCondition;
      const hadSellPnl = prevOv?.verdict === 'sell' && prevOv?.exitCondition?.type === 'pnl' && prevOv?.exitCondition?.pnlPct != null;
      const hasExitPnl = newOv?.verdict === 'sell' && ec?.type === 'pnl';

      if (hasExitPnl) {
        const avgPrice = pos?.averagePrice;
        if (avgPrice && avgPrice > 0) {
          let pnlPct = ec!.pnlPct;
          if (ec!.breakeven && (pos!.totalCost ?? 0) > 0) {
            pnlPct = -((pos!.realizedPnL ?? 0) / pos!.totalCost) * 100;
          }
          if (pnlPct != null && !isNaN(pnlPct)) {
            const impliedPrice = avgPrice * (1 + pnlPct / 100);
            const targets = loadPriceTargets();
            localStorage.setItem(TARGETS_KEY, JSON.stringify({ ...targets, [symbol]: impliedPrice }));
            window.dispatchEvent(new CustomEvent('investment-dashboard:framework-wrote-targets'));
          }
        }
      } else if (hadSellPnl && !hasExitPnl) {
        const targets = loadPriceTargets();
        if (symbol in targets) {
          const rest = { ...targets };
          delete rest[symbol];
          localStorage.setItem(TARGETS_KEY, JSON.stringify(rest));
          window.dispatchEvent(new CustomEvent('investment-dashboard:framework-wrote-targets'));
        }
      }

      return next;
    });
  }, [positions]);

  const clearOverride = useCallback((symbol: string) => {
    setOverrides(prev => {
      const prevOv = prev[symbol];
      const next = { ...prev }; delete next[symbol];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));

      if (prevOv?.verdict === 'sell') {
        const targets = loadPriceTargets();
        if (symbol in targets) {
          const rest = { ...targets };
          delete rest[symbol];
          localStorage.setItem(TARGETS_KEY, JSON.stringify(rest));
          window.dispatchEvent(new CustomEvent('investment-dashboard:framework-wrote-targets'));
        }
      }

      return next;
    });
  }, []);

  const toggleLock = useCallback((symbol: string) => {
    setLocks(prev => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol); else next.add(symbol);
      localStorage.setItem(LOCKS_KEY, JSON.stringify(Array.from(next)));
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setOverrides({});
  }, []);

  const effectiveRoles = useMemo<Record<string, PositionFramework>>(() => {
    const result: Record<string, PositionFramework> = {};
    for (const [sym, base] of Object.entries(POSITION_ROLES)) {
      result[sym] = resolvePosition(base, overrides[sym]);
    }
    for (const [sym, ov] of Object.entries(overrides)) {
      if (!(sym in result) && ov.role) {
        const rule = SIZING_RULES[ov.role];
        result[sym] = {
          sector: ov.sector ?? 'Unknown',
          role: ov.role,
          targetMin: rule.min,
          targetMax: rule.max,
          verdict: ov.verdict === null ? undefined : ov.verdict,
          buildTarget: ov.buildTarget ?? undefined,
        };
      }
    }
    return result;
  }, [overrides]);

  const { sleeveValue, sectorData, orderedSectors, roleSummary, keepCount, exitCount, unassignedCount } = useMemo(() => {
    const heldBySymbol: Record<string, SlimPosition> = {};
    for (const p of positions) {
      if ((showAll ? (p.shares ?? 0) >= 0 : (p.shares > 0.001 && p.marketValue > 0)) && p.type !== 'c') heldBySymbol[p.symbol] = p;
    }

    const sleeveValue = Object.keys(heldBySymbol)
      .filter(sym => heldBySymbol[sym].type !== 'c' && !effectiveRoles[sym]?.excludeFromSleeve)
      .reduce((sum, sym) => sum + heldBySymbol[sym].marketValue, 0);

    const buildPD = (sym: string): PositionData => {
      const p   = heldBySymbol[sym];
      const fw  = effectiveRoles[sym] ?? null;
      const isExcluded = p.type === 'c' || !!fw?.excludeFromSleeve;
      const currentPct = !isExcluded && sleeveValue > 0 ? (p.marketValue / sleeveValue) * 100 : 0;
      const sector = overrides[sym]?.sector ?? p.sector ?? fw?.sector ?? 'Unknown';
      return { symbol: sym, sector, marketValue: p.marketValue, currentPct, isExcluded, fw, status: getPositionStatus(currentPct, fw, true) };
    };

    const positionDataHeld = Object.keys(heldBySymbol).map(buildPD);

    const extraSectors = Array.from(new Set(positionDataHeld.map(p => p.sector))).filter(s => !SECTOR_ORDER.includes(s)).sort();
    const orderedSectors = [...SECTOR_ORDER, ...extraSectors];

    const sectorData: Record<string, { positions: PositionData[]; sectorPct: number }> = {};
    for (const sector of orderedSectors) {
      const sPs = positionDataHeld
        .filter(p => p.sector === sector)
        .sort((a, b) => {
          const aU = a.status === 'unassigned', bU = b.status === 'unassigned';
          if (aU !== bU) return aU ? 1 : -1;
          const aE = a.status === 'sell' || a.status === 'decide';
          const bE = b.status === 'sell' || b.status === 'decide';
          if (aE !== bE) return aE ? 1 : -1;
          return (a.fw ? ROLE_ORDER[a.fw.role] : 3) - (b.fw ? ROLE_ORDER[b.fw.role] : 3);
        });
      const sectorPct = sPs.filter(p => !p.isExcluded && p.status !== 'unassigned').reduce((sum, p) => sum + p.currentPct, 0);
      sectorData[sector] = { positions: sPs, sectorPct };
    }

    const roleSummary: Record<PositionRole, { count: number; pct: number; targetMinSum: number; targetMaxSum: number }> = {
      Anchor:      { count: 0, pct: 0, targetMinSum: 0, targetMaxSum: 0 },
      Supporting:  { count: 0, pct: 0, targetMinSum: 0, targetMaxSum: 0 },
      Speculative: { count: 0, pct: 0, targetMinSum: 0, targetMaxSum: 0 },
    };
    for (const p of positionDataHeld) {
      if (p.fw && p.status !== 'sell' && p.status !== 'decide' && !p.isExcluded) {
        roleSummary[p.fw.role].count++;
        roleSummary[p.fw.role].pct += p.currentPct;
        roleSummary[p.fw.role].targetMinSum += p.fw.targetMin;
        roleSummary[p.fw.role].targetMaxSum += p.fw.targetMax;
      }
    }

    const keepCount       = positionDataHeld.filter(p => p.status !== 'sell' && p.status !== 'decide' && p.status !== 'unassigned').length;
    const exitCount       = positionDataHeld.filter(p => p.status === 'sell' || p.status === 'decide').length;
    const unassignedCount = positionDataHeld.filter(p => p.status === 'unassigned').length;

    return { sleeveValue, sectorData, orderedSectors, roleSummary, keepCount, exitCount, unassignedCount };
  }, [positions, effectiveRoles, overrides, showAll]);

  const allPositionsForTable = useMemo(() => {
    const heldBySymbol: Record<string, SlimPosition> = {};
    for (const p of positions) {
      if ((showAll ? (p.shares ?? 0) >= 0 : (p.shares > 0.001 && p.marketValue > 0)) && p.type !== 'c') heldBySymbol[p.symbol] = p;
    }
    const sv = Object.keys(heldBySymbol)
      .filter(sym => heldBySymbol[sym].type !== 'c' && !effectiveRoles[sym]?.excludeFromSleeve)
      .reduce((sum, sym) => sum + heldBySymbol[sym].marketValue, 0);

    const fromFramework = Object.entries(effectiveRoles).map(([sym, fw]) => {
      const held = sym in heldBySymbol;
      const p    = held ? heldBySymbol[sym] : null;
      const isExcluded  = p?.type === 'c' || !!fw.excludeFromSleeve;
      const currentPct  = held && !isExcluded && sv > 0 ? (p!.marketValue / sv) * 100 : 0;
      const sector = overrides[sym]?.sector ?? p?.sector ?? fw.sector;
      return { symbol: sym, sector, marketValue: p?.marketValue ?? 0, currentPct, isExcluded, fw: fw as PositionFramework | null, status: getPositionStatus(currentPct, fw, held) };
    });

    const unassigned = Object.keys(heldBySymbol)
      .filter(sym => !(sym in effectiveRoles))
      .map(sym => {
        const p = heldBySymbol[sym];
        const isExcluded = p.type === 'c';
        const currentPct = !isExcluded && sv > 0 ? (p.marketValue / sv) * 100 : 0;
        const sector = overrides[sym]?.sector ?? p.sector ?? 'Unknown';
        return { symbol: sym, sector, marketValue: p.marketValue, currentPct, isExcluded, fw: null as PositionFramework | null, status: 'unassigned' as PositionStatus };
      });

    return [...fromFramework, ...unassigned].sort((a, b) => {
      const aU = a.status === 'unassigned', bU = b.status === 'unassigned';
      if (aU !== bU) return aU ? 1 : -1;
      const aE = a.fw?.verdict === 'sell' || a.fw?.verdict === 'decide';
      const bE = b.fw?.verdict === 'sell' || b.fw?.verdict === 'decide';
      if (aE !== bE) return aE ? 1 : -1;
      if (a.sector !== b.sector) {
        const ai = SECTOR_ORDER.indexOf(a.sector), bi = SECTOR_ORDER.indexOf(b.sector);
        if (ai === -1 && bi === -1) return a.sector.localeCompare(b.sector);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      }
      return (a.fw ? ROLE_ORDER[a.fw.role] : 3) - (b.fw ? ROLE_ORDER[b.fw.role] : 3);
    });
  }, [positions, effectiveRoles, overrides, showAll]);

  const rawBySymbol = useMemo(() => {
    const m: Record<string, SlimPosition> = {};
    for (const p of positions) m[p.symbol] = p;
    return m;
  }, [positions]);

  const hasOverrides  = Object.keys(overrides).length > 0;
  const editFw        = editSymbol ? (effectiveRoles[editSymbol] ?? null) : null;
  const editSector    = editSymbol
    ? (overrides[editSymbol]?.sector ?? positions.find(p => p.symbol === editSymbol)?.sector ?? editFw?.sector ?? 'Unknown')
    : null;

  const fmtPct = (n: number) => `${n.toFixed(1)}%`;
  const fmtCAD = (n: number) => `$${Math.round(n).toLocaleString()}`;

  const renderSectorCard = (sector: string) => {
    const entry = sectorData[sector];
    const sPs = entry?.positions ?? [];
    const sectorPct = entry?.sectorPct ?? 0;

    const target    = getEffTarget(sector);
    const isExitSector = !!target?.exitSector;
    const hasTarget    = !!target && !isExitSector;

    const isFrameworkSector = sector in SECTOR_TARGETS;
    if (!isFrameworkSector && sPs.length === 0) return null;

    const sectorDollar = sPs.filter(p => !p.isExcluded).reduce((s, p) => s + p.marketValue, 0);

    const posMinSum = sPs
      .filter(p => !p.isExcluded && p.fw && p.status !== 'sell' && p.status !== 'unassigned')
      .reduce((sum, p) => sum + (p.fw!.targetMin), 0);
    const hasConflict = hasTarget && posMinSum > target!.max;
    const SectorIcon   = SECTOR_ICONS[sector] ?? null;
    const sectorColor  = SECTOR_COLORS[sector];

    const barMax    = hasTarget ? Math.max(target!.max, sectorPct, 0.01) : Math.max(sectorPct, 0.01);
    const redPct    = hasTarget ? (target!.min  / barMax) * 100 : 0;
    const greenPct  = hasTarget ? ((target!.max - target!.min) / barMax) * 100 : 0;
    const overPct   = hasTarget && sectorPct > target!.max
      ? ((sectorPct - target!.max) / barMax) * 100
      : 0;
    const overColor = target?.intentionalOW ? '#7c3aed' : '#b45309';
    const blueFill  = Math.min((sectorPct / barMax) * 100, 100);

    const subsectorTotals: Record<string, { value: number; symbols: string[] }> = {};
    for (const p of sPs) {
      if (p.isExcluded || p.marketValue <= 0) continue;
      const subs = symbolSubsectors[p.symbol] ?? [];
      const bucket = subs.length === 0 ? ['Other'] : subs;
      for (const sub of bucket) {
        if (!subsectorTotals[sub]) subsectorTotals[sub] = { value: 0, symbols: [] };
        subsectorTotals[sub].value += p.marketValue / bucket.length;
        if (!subsectorTotals[sub].symbols.includes(p.symbol)) subsectorTotals[sub].symbols.push(p.symbol);
      }
    }
    const subsectorSlices = Object.entries(subsectorTotals)
      .filter(([, d]) => d.value > 0)
      .sort((a, b) => b[1].value - a[1].value)
      .map(([name, d], idx) => ({ name, value: d.value, symbols: d.symbols, color: subColor(name, idx) }));
    const pieOpen = pieOpenSector === sector;

    return (
      <div
        key={sector}
        style={{
          background: isExitSector ? '#1a0a0a' : D.card,
          border: `2px solid ${isExitSector ? '#4a1a1a' : (sectorColor ? sectorColor + '66' : D.border)}`,
          borderRadius: 10,
          padding: 14,
        }}
      >
        {/* Card header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13, color: isExitSector ? D.red : D.text }}>
              {SectorIcon && <SectorIcon size={13} style={{ flexShrink: 0, opacity: 0.8 }} />}
              {sector}
            </div>
            {hasTarget && (
              <p style={{ fontFamily: D.mono, fontSize: 10, color: D.sub, marginTop: 2 }}>
                Target {target!.min}–{target!.max}%
                {target?.intentionalOW && <span style={{ marginLeft: 4, color: D.violet }}>· Intentional OW</span>}
              </p>
            )}
            {isExitSector && <p style={{ fontFamily: D.mono, fontSize: 10, color: D.red, marginTop: 2 }}>Exit zone</p>}
            {hasConflict && (
              <p style={{ fontFamily: D.mono, fontSize: 10, color: D.yellow, marginTop: 2 }} title={`Position minimums sum to ${posMinSum.toFixed(1)}% vs sector max ${target!.max}%`}>
                ⚠ mins ({posMinSum.toFixed(0)}%) exceed max ({target!.max}%)
              </p>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {subsectorSlices.length > 0 && (
              <button
                onClick={e => { e.stopPropagation(); setPieOpenSector(prev => prev === sector ? null : sector); }}
                title="Show subsector breakdown"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 4, color: pieOpen ? D.indigo : D.dimmer }}
              >
                <PieIcon size={13} />
              </button>
            )}
            <button
              onClick={e => { e.stopPropagation(); setEditSectorName(sector); }}
              title="Edit sector targets"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 4, color: D.dimmer }}
            >
              <SlidersHorizontal size={13} />
            </button>
          </div>
        </div>

        {/* Subsector pie breakdown */}
        {pieOpen && subsectorSlices.length > 0 && (
          <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, borderTop: `1px dashed ${D.border}`, paddingTop: 12 }}>
            <PieChart width={140} height={140}>
              <Pie data={subsectorSlices} cx={65} cy={65} innerRadius={35} outerRadius={65} dataKey="value" stroke="none">
                {subsectorSlices.map((s, i) => <Cell key={i} fill={s.color} />)}
              </Pie>
              <Tooltip
                content={({ payload }) => {
                  if (!payload?.length) return null;
                  const s = payload[0].payload as typeof subsectorSlices[0];
                  const total = subsectorSlices.reduce((sum, x) => sum + x.value, 0);
                  return (
                    <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 6, padding: '8px 10px', fontSize: 11, maxWidth: 160 }}>
                      <div style={{ fontWeight: 700, marginBottom: 4, color: s.color, fontFamily: D.mono }}>{s.name}</div>
                      <div style={{ color: D.dim, fontFamily: D.mono, marginBottom: 4 }}>{((s.value / total) * 100).toFixed(0)}% of sector</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                        {s.symbols.map(sym => (
                          <span key={sym} style={{ background: D.inner, color: D.sub, borderRadius: 3, padding: '1px 4px', fontFamily: D.mono, fontSize: 10 }}>{sym}</span>
                        ))}
                      </div>
                    </div>
                  );
                }}
              />
            </PieChart>
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 3 }}>
              {subsectorSlices.map((s, i) => {
                const total = subsectorSlices.reduce((sum, x) => sum + x.value, 0);
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, backgroundColor: s.color }} />
                      <span style={{ color: D.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: D.mono, fontSize: 10 }}>{s.name}</span>
                    </div>
                    <span style={{ color: D.dim, flexShrink: 0, marginLeft: 4, fontFamily: D.mono, fontSize: 10 }}>{((s.value / total) * 100).toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Allocation bars */}
        {hasTarget && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontFamily: D.mono, fontSize: 20, fontWeight: 700, color: D.text }}>{fmtPct(sectorPct)}</span>
              <span style={{ fontFamily: D.mono, fontSize: 11, color: D.dim }}>{fmtCAD(sectorDollar)}</span>
            </div>
            {/* Blue actual bar */}
            <div style={{ height: 5, borderRadius: 3, background: D.inner, overflow: 'hidden', marginBottom: 3 }}>
              <div style={{ height: '100%', borderRadius: 3, width: `${blueFill}%`, background: D.blue, transition: 'width 0.3s' }} />
            </div>
            {/* Zone bar */}
            <div style={{ height: 8, borderRadius: 3, overflow: 'hidden', display: 'flex' }}>
              <div style={{ width: `${redPct}%`, background: '#7f1d1d', flexShrink: 0 }} />
              <div style={{ width: `${greenPct}%`, background: '#14532d', flexShrink: 0 }} />
              {overPct > 0 && <div style={{ width: `${overPct}%`, background: overColor, flexShrink: 0 }} />}
            </div>
            {/* Tick labels */}
            <div style={{ position: 'relative', height: 14, marginTop: 2 }}>
              <span style={{ position: 'absolute', fontFamily: D.mono, fontSize: 9, color: D.dim, transform: 'translateX(-50%)', left: `${redPct}%` }}>{target!.min}%</span>
              <span style={{ position: 'absolute', fontFamily: D.mono, fontSize: 9, color: D.dim, transform: 'translateX(-50%)', left: `${redPct + greenPct}%` }}>{target!.max}%</span>
            </div>
          </div>
        )}

        {/* Position rows */}
        {view === 'buys' ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ fontFamily: D.mono, fontSize: 9, color: D.sub, fontWeight: 600, textAlign: 'left', paddingBottom: 4 }} />
                {['Cur', 'Avg', '5d', '20d'].map(h => (
                  <th key={h} style={{ fontFamily: D.mono, fontSize: 9, color: D.sub, fontWeight: 600, textAlign: 'right', paddingBottom: 4, paddingLeft: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sPs.map((p, i) => {
                const isExit         = p.status === 'sell' || p.status === 'decide';
                const isUnassigned   = p.status === 'unassigned';
                const prev           = i > 0 ? sPs[i - 1] : null;
                const prevExit       = prev && (prev.status === 'sell' || prev.status === 'decide');
                const prevUnassigned = prev?.status === 'unassigned';
                const showDivider    = ((isExit && !prevExit) || (isUnassigned && !prevUnassigned)) && i > 0;
                const raw            = rawBySymbol[p.symbol];
                const cur            = raw?.currentPrice;
                const avg            = raw?.averagePrice;
                const mom5           = symbolMomentum5[p.symbol];
                const mom20          = symbolMomentum20[p.symbol];
                const curColor       = cur == null || avg == null ? D.dim : cur < avg ? D.green : cur <= avg * 1.10 ? D.yellow : D.dim;
                const fmtPrice       = (n: number | undefined) => n == null ? '—' : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                const fmtMom         = (n: number | undefined) => n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
                const momColor       = (n: number | undefined) => n == null ? D.dimmer : n > 5 ? D.blue : n > 0 ? D.green : D.red;
                return (
                  <React.Fragment key={p.symbol}>
                    {showDivider && (
                      <tr><td colSpan={5} style={{ padding: '2px 0' }}><div style={{ borderTop: `1px dashed ${D.border}` }} /></td></tr>
                    )}
                    <tr
                      onClick={() => setEditSymbol(p.symbol)}
                      title="Click to assign role, sector, or verdict"
                      style={{ cursor: 'pointer', opacity: isUnassigned ? 0.5 : 1, background: locks.has(p.symbol) ? 'rgba(245,158,11,0.05)' : 'transparent' }}
                    >
                      <td style={{ padding: '3px 6px 3px 0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          {p.fw
                            ? <span style={{ flexShrink: 0, color: SIZING_RULES[p.fw.role].color }}>{ROLE_ICONS[p.fw.role]}</span>
                            : <span style={{ flexShrink: 0, color: D.dimmer }}>○</span>
                          }
                          <span style={{ fontWeight: 600, color: isUnassigned ? D.dim : D.text, fontFamily: D.mono, fontSize: 11 }}>{p.symbol}</span>
                          {locks.has(p.symbol) && <Lock size={9} style={{ color: '#f59e0b', flexShrink: 0 }} />}
                          {overrides[p.symbol] && <span style={{ width: 6, height: 6, borderRadius: '50%', background: D.indigo, flexShrink: 0 }} />}
                        </div>
                      </td>
                      <td style={{ padding: '3px 0 3px 8px', textAlign: 'right', fontFamily: D.mono, whiteSpace: 'nowrap', color: curColor }}>{fmtPrice(cur)}</td>
                      <td style={{ padding: '3px 0 3px 8px', textAlign: 'right', fontFamily: D.mono, whiteSpace: 'nowrap', color: avg == null ? D.dimmer : D.dim }}>{fmtPrice(avg)}</td>
                      <td style={{ padding: '3px 0 3px 8px', textAlign: 'right', fontFamily: D.mono, whiteSpace: 'nowrap', color: momColor(mom5) }}>{fmtMom(mom5)}</td>
                      <td style={{ padding: '3px 0 3px 8px', textAlign: 'right', fontFamily: D.mono, whiteSpace: 'nowrap', color: momColor(mom20) }}>{fmtMom(mom20)}</td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        ) : view === 'pnl' ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ fontFamily: D.mono, fontSize: 9, color: D.sub, fontWeight: 600, textAlign: 'left', paddingBottom: 4 }} />
                {['Unrlzd', '%', 'BE%', 'Rld'].map((h, i) => (
                  <th key={h} style={{ fontFamily: D.mono, fontSize: 9, color: i === 2 ? D.indigo : D.sub, fontWeight: 600, textAlign: 'right', paddingBottom: 4, paddingLeft: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sPs.map((p, i) => {
                const isExit         = p.status === 'sell' || p.status === 'decide';
                const isUnassigned   = p.status === 'unassigned';
                const prev           = i > 0 ? sPs[i - 1] : null;
                const prevExit       = prev && (prev.status === 'sell' || prev.status === 'decide');
                const prevUnassigned = prev?.status === 'unassigned';
                const showDivider    = ((isExit && !prevExit) || (isUnassigned && !prevUnassigned)) && i > 0;
                const raw            = rawBySymbol[p.symbol];
                const unrlzd         = raw ? raw.marketValue - raw.totalCost : 0;
                const rld            = raw ? (raw.realizedPnL ?? 0) : 0;
                const unrlzdPct      = raw && raw.totalCost > 0 ? (unrlzd / raw.totalCost) * 100 : 0;
                const bePct          = raw && raw.totalCost > 0 ? -(rld / raw.totalCost) * 100 : 0;
                const beDiff         = unrlzdPct - bePct;
                const uPos           = unrlzd >= 0;
                const rPos           = rld >= 0;
                const beColor        = rld === 0 ? D.dimmer : beDiff > 15 ? D.blue : beDiff > 5 ? D.green : beDiff >= -5 ? D.yellow : D.red;
                return (
                  <React.Fragment key={p.symbol}>
                    {showDivider && (
                      <tr><td colSpan={5} style={{ padding: '2px 0' }}><div style={{ borderTop: `1px dashed ${D.border}` }} /></td></tr>
                    )}
                    <tr onClick={() => setEditSymbol(p.symbol)} title="Click to assign role, sector, or verdict" style={{ cursor: 'pointer', opacity: isUnassigned ? 0.5 : 1, background: locks.has(p.symbol) ? 'rgba(245,158,11,0.05)' : 'transparent' }}>
                      <td style={{ padding: '3px 6px 3px 0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          {p.fw
                            ? <span style={{ flexShrink: 0, color: SIZING_RULES[p.fw.role].color }}>{ROLE_ICONS[p.fw.role]}</span>
                            : <span style={{ flexShrink: 0, color: D.dimmer }}>○</span>
                          }
                          <span style={{ fontWeight: 600, color: isUnassigned ? D.dim : D.text, fontFamily: D.mono, fontSize: 11 }}>{p.symbol}</span>
                          {locks.has(p.symbol) && <Lock size={9} style={{ color: '#f59e0b', flexShrink: 0 }} />}
                          {overrides[p.symbol] && <span style={{ width: 6, height: 6, borderRadius: '50%', background: D.indigo, flexShrink: 0 }} />}
                        </div>
                      </td>
                      <td style={{ padding: '3px 0 3px 8px', textAlign: 'right', fontFamily: D.mono, whiteSpace: 'nowrap', color: unrlzd > 500 ? D.blue : uPos ? D.green : D.red }}>
                        {uPos ? '+' : ''}{fmtCAD(unrlzd)}
                      </td>
                      <td style={{ padding: '3px 0 3px 8px', textAlign: 'right', fontFamily: D.mono, whiteSpace: 'nowrap', color: unrlzdPct > 50 ? D.blue : uPos ? D.green : D.red }}>
                        {uPos ? '+' : ''}{unrlzdPct.toFixed(1)}%
                      </td>
                      <td style={{ padding: '3px 0 3px 8px', textAlign: 'right', fontFamily: D.mono, whiteSpace: 'nowrap', color: beColor }}>
                        {rld === 0 ? '0%' : `${bePct >= 0 ? '+' : ''}${bePct.toFixed(1)}%`}
                      </td>
                      <td style={{ padding: '3px 0 3px 8px', textAlign: 'right', fontFamily: D.mono, whiteSpace: 'nowrap', color: rld === 0 ? D.dimmer : rPos ? D.green : D.red }}>
                        {rld === 0 ? '$0' : `${rPos ? '+' : ''}${fmtCAD(rld)}`}
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {sPs.map((p, i) => {
              const isExit         = p.status === 'sell' || p.status === 'decide';
              const isUnassigned   = p.status === 'unassigned';
              const prev           = i > 0 ? sPs[i - 1] : null;
              const prevExit       = prev && (prev.status === 'sell' || prev.status === 'decide');
              const prevUnassigned = prev?.status === 'unassigned';
              const showDivider    = ((isExit && !prevExit) || (isUnassigned && !prevUnassigned)) && i > 0;
              return (
                <React.Fragment key={p.symbol}>
                  {showDivider && <div style={{ borderTop: `1px dashed ${D.border}`, margin: '3px 0' }} />}
                  <button
                    onClick={() => setEditSymbol(p.symbol)}
                    title="Click to assign role, sector, or verdict"
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: 4, padding: '3px 4px', margin: '0 -4px', border: 'none', cursor: 'pointer', background: locks.has(p.symbol) ? 'rgba(245,158,11,0.05)' : 'none', textAlign: 'left', opacity: isUnassigned ? 0.5 : 1 }}
                    onMouseEnter={e => { e.currentTarget.style.background = D.inner; }}
                    onMouseLeave={e => { e.currentTarget.style.background = locks.has(p.symbol) ? 'rgba(245,158,11,0.05)' : 'none'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                      {p.fw
                        ? <span style={{ fontSize: 11, flexShrink: 0, color: SIZING_RULES[p.fw.role].color }}>{ROLE_ICONS[p.fw.role]}</span>
                        : <span style={{ fontSize: 11, flexShrink: 0, color: D.dimmer }}>○</span>
                      }
                      <span style={{ fontWeight: 600, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isUnassigned ? D.dim : D.text, fontFamily: D.mono }}>{p.symbol}</span>
                      {locks.has(p.symbol) && <Lock size={9} style={{ color: '#f59e0b', flexShrink: 0 }} />}
                      {overrides[p.symbol] && <span style={{ width: 6, height: 6, borderRadius: '50%', background: D.indigo, flexShrink: 0 }} />}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <span style={{ fontFamily: D.mono, fontSize: 10, color: D.dim }}>
                        <span style={{ color: D.dimmer }}>({fmtCAD(p.marketValue)})</span>
                        {!p.isExcluded && <> {fmtPct(p.currentPct)}</>}
                      </span>
                      <span style={{ fontFamily: D.mono, fontSize: 10, padding: '2px 6px', borderRadius: 3, fontWeight: 600, ...STATUS_BADGE[p.status].style }}>
                        {p.status === 'sell'
                          ? fmtExitLabel(overrides[p.symbol]?.exitCondition)
                          : (p.status === 'building' || p.status === 'trimming') && p.fw?.buildTarget
                            ? `${STATUS_BADGE[p.status].label} → ${p.fw.buildTarget}%`
                            : STATUS_BADGE[p.status].label}
                      </span>
                    </div>
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const editSectorTarget = editSectorName ? getEffTarget(editSectorName) : null;

  const commitSectorRange = useCallback((sector: string, minStr: string, maxStr: string) => {
    const min = parseFloat(minStr);
    const max = parseFloat(maxStr);
    if (!isNaN(min) && !isNaN(max) && max >= min) {
      const ov: SectorOverride = { min, max };
      if (max > 0) ov.exitSector = false;
      applySectorOverride(sector, ov);
    }
  }, [applySectorOverride]);

  // ── input style helper ─────────────────────────────────────────────────
  const inputSt: React.CSSProperties = {
    width: '100%', padding: '8px 12px', background: D.inner, border: `1px solid ${D.border}`,
    borderRadius: 6, color: D.text, fontFamily: D.mono, fontSize: 12, outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div>
      {/* View toggle + reset */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: D.inner, borderRadius: 8, padding: 3, border: `1px solid ${D.border}` }}>
          {(['allocation', 'pnl', 'buys'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: '5px 14px', borderRadius: 5, border: 'none', cursor: 'pointer',
                fontFamily: D.mono, fontSize: 11, fontWeight: 600, transition: 'all 0.15s',
                background: view === v ? D.card : 'transparent',
                color: view === v ? D.text : D.dim,
                boxShadow: view === v ? `0 1px 3px rgba(0,0,0,0.4)` : 'none',
              }}
            >
              {v === 'allocation' ? 'Allocation' : v === 'pnl' ? 'P&L' : 'Buys'}
            </button>
          ))}
        </div>
        {hasOverrides && (
          <button onClick={resetAll} style={{ background: 'none', border: 'none', fontFamily: D.mono, fontSize: 11, color: D.dim, cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.color = D.red; }}
            onMouseLeave={e => { e.currentTarget.style.color = D.dim; }}
          >
            Reset all customizations
          </button>
        )}
      </div>

      {/* A. Overview stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, marginBottom: 16 }}>
        {(['Anchor', 'Supporting', 'Speculative'] as PositionRole[]).map(role => {
          const { count, pct } = roleSummary[role];
          const rule = SIZING_RULES[role];
          return (
            <div key={role} style={{ background: D.inner, border: `1px solid ${D.border}`, borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ color: rule.color, fontSize: 16 }}>{ROLE_ICONS[role]}</span>
                <span style={{ fontFamily: D.mono, fontWeight: 700, color: D.sub, fontSize: 11 }}>{role}s</span>
              </div>
              <p style={{ fontFamily: D.mono, fontSize: 22, fontWeight: 700, color: D.text, margin: 0 }}>{count}</p>
              <p style={{ fontFamily: D.mono, fontSize: 11, color: D.dim, marginTop: 3 }}>{fmtPct(pct)} of sleeve</p>
              <p style={{ fontFamily: D.mono, fontSize: 10, color: D.dimmer, marginTop: 2 }}>
                Target {ROLE_SLEEVE_TARGETS[role].min}–{ROLE_SLEEVE_TARGETS[role].max}%
              </p>
              <p style={{ fontFamily: D.mono, fontSize: 10, color: D.dimmer, marginTop: 1 }}>{rule.min}–{rule.max}% per position</p>
            </div>
          );
        })}
        <div style={{ background: D.inner, border: `1px solid ${D.border}`, borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{ color: D.dim, fontSize: 16 }}>◻</span>
            <span style={{ fontFamily: D.mono, fontWeight: 700, color: D.sub, fontSize: 11 }}>Sleeve Total</span>
          </div>
          <p style={{ fontFamily: D.mono, fontSize: 22, fontWeight: 700, color: D.text, margin: 0 }}>{fmtCAD(sleeveValue)}</p>
          <p style={{ fontFamily: D.mono, fontSize: 11, color: D.dim, marginTop: 3 }}>
            {keepCount} kept · {exitCount} to exit{unassignedCount > 0 ? ` · ${unassignedCount} unassigned` : ''}
          </p>
        </div>
      </div>

      {/* B. Sector Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10, marginBottom: 16 }}>
        {orderedSectors.map(s => renderSectorCard(s))}
      </div>

      {/* C. Draggable sector allocation bar */}
      <DraggableAllocationBar
        sectors={orderedSectors}
        getTarget={getEffTarget}
        applyOv={(sector, ov) => applySectorOverride(sector, ov)}
        colors={SECTOR_COLORS}
      />

      {/* C2. Static actual asset allocation bar */}
      <StaticAssetBar
        positions={positions}
        colors={SECTOR_COLORS}
        sectorOrder={orderedSectors}
      />

      {/* D. Position Sizing Table */}
      <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 8, overflow: 'hidden' }}>
        <button
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', border: 'none', background: 'none', cursor: 'pointer' }}
          onMouseEnter={e => { e.currentTarget.style.background = D.inner; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
          onClick={() => setTableOpen(o => !o)}
        >
          <span style={{ fontFamily: D.mono, fontWeight: 700, color: D.sub, fontSize: 12 }}>Position Sizing Compliance</span>
          {tableOpen ? <ChevronUp size={15} style={{ color: D.dim }} /> : <ChevronDown size={15} style={{ color: D.dim }} />}
        </button>

        {tableOpen && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ minWidth: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead style={{ background: D.inner, borderTop: `1px solid ${D.border}` }}>
                <tr>
                  {['Symbol', 'Sector', 'Role', 'Current %', 'Current $', 'Target Range', 'Status'].map((h, i) => (
                    <th key={h} style={{ padding: '8px 14px', fontFamily: D.mono, fontSize: 10, fontWeight: 700, color: D.sub, letterSpacing: '0.1em', textTransform: 'uppercase', textAlign: i >= 3 && i <= 5 ? 'right' : 'left' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allPositionsForTable.map((p, i) => {
                  const isExit = p.fw?.verdict === 'sell' || p.fw?.verdict === 'decide';
                  const isUnassigned = p.status === 'unassigned';
                  const prev = i > 0 ? allPositionsForTable[i - 1] : null;
                  const prevExit = prev?.fw?.verdict === 'sell' || prev?.fw?.verdict === 'decide';
                  const prevUnassigned = prev?.status === 'unassigned';
                  return (
                    <React.Fragment key={p.symbol}>
                      {isExit && !prevExit && !prevUnassigned && (
                        <tr><td colSpan={7} style={{ padding: '6px 14px', background: '#1a0a0a', fontFamily: D.mono, fontSize: 10, fontWeight: 700, color: D.red, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Exit / Decide</td></tr>
                      )}
                      {isUnassigned && !prevUnassigned && (
                        <tr><td colSpan={7} style={{ padding: '6px 14px', background: D.inner, fontFamily: D.mono, fontSize: 10, fontWeight: 700, color: D.sub, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Unassigned — click to classify</td></tr>
                      )}
                      <tr
                        style={{ cursor: 'pointer', background: isExit ? '#150808' : isUnassigned ? D.inner + '80' : 'transparent', borderTop: `1px solid ${D.border}` }}
                        onMouseEnter={e => { e.currentTarget.style.background = D.inner; }}
                        onMouseLeave={e => { e.currentTarget.style.background = isExit ? '#150808' : isUnassigned ? D.inner + '80' : 'transparent'; }}
                        onClick={() => setEditSymbol(p.symbol)}
                      >
                        <td style={{ padding: '8px 14px', fontFamily: D.mono, fontWeight: 700, color: isUnassigned ? D.dim : D.text }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            {p.symbol}
                            {locks.has(p.symbol) && <Lock size={9} style={{ color: '#f59e0b', flexShrink: 0 }} />}
                            {overrides[p.symbol] && <span style={{ width: 6, height: 6, borderRadius: '50%', background: D.indigo, flexShrink: 0 }} />}
                          </div>
                        </td>
                        <td style={{ padding: '8px 14px', fontFamily: D.mono, color: D.dim, fontSize: 11 }}>{p.sector}</td>
                        <td style={{ padding: '8px 14px' }}>
                          {p.fw
                            ? <span style={{ fontFamily: D.mono, fontSize: 10, padding: '2px 7px', borderRadius: 3, fontWeight: 700, ...ROLE_BADGE_STYLE[p.fw.role] }}>{ROLE_ICONS[p.fw.role]} {p.fw.role}</span>
                            : <span style={{ color: D.dimmer, fontFamily: D.mono, fontSize: 11 }}>—</span>
                          }
                        </td>
                        <td style={{ padding: '8px 14px', textAlign: 'right', fontFamily: D.mono, color: D.sub }}>
                          {p.marketValue > 0 && !p.isExcluded ? fmtPct(p.currentPct) : '—'}
                        </td>
                        <td style={{ padding: '8px 14px', textAlign: 'right', fontFamily: D.mono, color: D.dim }}>
                          {p.marketValue > 0 ? fmtCAD(p.marketValue) : '—'}
                        </td>
                        <td style={{ padding: '8px 14px', textAlign: 'right', fontFamily: D.mono, color: D.dim, fontSize: 11 }}>
                          {!p.fw || p.fw.verdict === 'sell' ? '—' : (p.fw.buildTarget
                            ? `${p.fw.targetMin}–${p.fw.targetMax}% (→ ${p.fw.buildTarget}%)`
                            : `${p.fw.targetMin}–${p.fw.targetMax}%`)}
                        </td>
                        <td style={{ padding: '8px 14px' }}>
                          <span style={{ fontFamily: D.mono, fontSize: 10, padding: '2px 7px', borderRadius: 3, fontWeight: 600, ...STATUS_BADGE[p.status].style }}>
                            {p.status === 'building' && p.fw?.buildTarget ? `Building → ${p.fw.buildTarget}%` : STATUS_BADGE[p.status].label}
                          </span>
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* E. Position edit modal */}
      {editSymbol && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={() => setEditSymbol(null)}>
          <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 14, padding: 24, width: 320, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <p style={{ fontFamily: D.mono, fontWeight: 700, color: D.text, fontSize: 15, margin: 0 }}>{editSymbol}</p>
                <p style={{ fontFamily: D.mono, fontSize: 11, color: D.dim, marginTop: 3 }}>{editSector}{editFw ? ` · ${editFw.role}` : ' · Unassigned'}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {overrides[editSymbol] && (
                  <button onClick={() => clearOverride(editSymbol)} style={{ background: 'none', border: 'none', fontFamily: D.mono, fontSize: 11, color: D.dim, cursor: 'pointer', padding: '4px 8px', borderRadius: 4 }}
                    onMouseEnter={e => { e.currentTarget.style.color = D.red; }}
                    onMouseLeave={e => { e.currentTarget.style.color = D.dim; }}
                  >Reset</button>
                )}
                <button onClick={() => setEditSymbol(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: D.dim }}><X size={15} /></button>
              </div>
            </div>

            {/* Lock toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', marginBottom: 20, borderRadius: 8, border: `1px solid ${locks.has(editSymbol) ? 'rgba(245,158,11,0.35)' : D.border}`, background: locks.has(editSymbol) ? 'rgba(245,158,11,0.07)' : D.inner }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: D.mono, fontSize: 12, fontWeight: 700, color: locks.has(editSymbol) ? '#f59e0b' : D.sub }}>
                  <Lock size={12} />
                  Hold — Do Not Sell
                </div>
                <p style={{ fontFamily: D.mono, fontSize: 10, color: D.dim, marginTop: 3 }}>Locks verdict; marks as long-term hold</p>
              </div>
              <button
                onClick={() => toggleLock(editSymbol)}
                style={{ position: 'relative', display: 'inline-flex', height: 20, width: 36, borderRadius: 10, border: 'none', cursor: 'pointer', background: locks.has(editSymbol) ? '#f59e0b' : D.dimmer, flexShrink: 0, transition: 'background 0.2s' }}
              >
                <span style={{ position: 'absolute', width: 14, height: 14, borderRadius: '50%', background: '#fff', top: 3, left: locks.has(editSymbol) ? 19 : 3, transition: 'left 0.2s' }} />
              </button>
            </div>

            <div style={{ marginBottom: 20 }}>
              <p style={{ fontFamily: D.mono, fontSize: 10, fontWeight: 700, color: D.dim, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Role</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {(['Anchor', 'Supporting', 'Speculative'] as PositionRole[]).map(role => {
                  const rule = SIZING_RULES[role];
                  const selected = editFw?.role === role;
                  return (
                    <button key={role} onClick={() => applyOverride(editSymbol, { role })}
                      style={{
                        padding: '8px 4px', borderRadius: 8, fontFamily: D.mono, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: `2px solid ${selected ? rule.color : D.border}`,
                        background: selected ? rule.color + '22' : D.inner, color: selected ? rule.color : D.sub, transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ fontSize: 16, marginBottom: 3 }}>{ROLE_ICONS[role]}</div>
                      <div>{rule.label}</div>
                    </button>
                  );
                })}
              </div>
              <p style={{ fontFamily: D.mono, fontSize: 10, color: D.dim, marginTop: 8 }}>
                {editFw ? `Target: ${SIZING_RULES[editFw.role].min}–${SIZING_RULES[editFw.role].max}% of sleeve` : 'Select a role to assign a target range'}
              </p>
            </div>

            <div style={{ marginBottom: 20 }}>
              <p style={{ fontFamily: D.mono, fontSize: 10, fontWeight: 700, color: D.dim, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Sector</p>
              <select value={editSector ?? ''} onChange={e => applyOverride(editSymbol, { sector: e.target.value })}
                style={{ ...inputSt }}>
                {SECTOR_ORDER.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 20 }}>
              <p style={{ fontFamily: D.mono, fontSize: 10, fontWeight: 700, color: D.dim, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Build Target %</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="number" min="0" max="100" step="0.5"
                  placeholder="e.g. 8"
                  defaultValue={editFw?.buildTarget ?? overrides[editSymbol!]?.buildTarget ?? ''}
                  key={editSymbol}
                  onChange={e => { const v = e.target.value; applyOverride(editSymbol!, { buildTarget: v === '' ? null : parseFloat(v) }); }}
                  style={{ ...inputSt, flex: 1 }}
                />
                {(editFw?.buildTarget != null || overrides[editSymbol!]?.buildTarget != null) && (
                  <button onClick={() => applyOverride(editSymbol!, { buildTarget: null })}
                    style={{ background: 'none', border: 'none', fontFamily: D.mono, fontSize: 11, color: D.dim, cursor: 'pointer', whiteSpace: 'nowrap' }}>Clear</button>
                )}
              </div>
              <p style={{ fontFamily: D.mono, fontSize: 10, color: D.dim, marginTop: 4 }}>Building if below · Trimming if above</p>
            </div>

            {editFw && (
              <div style={{ opacity: locks.has(editSymbol) ? 0.4 : 1, pointerEvents: locks.has(editSymbol) ? 'none' : 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <p style={{ fontFamily: D.mono, fontSize: 10, fontWeight: 700, color: D.dim, letterSpacing: '0.12em', textTransform: 'uppercase', margin: 0 }}>Verdict</p>
                  {locks.has(editSymbol) && <span style={{ fontFamily: D.mono, fontSize: 9, color: '#f59e0b' }}>— unlock to change</span>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  {MODAL_VERDICTS.map(({ value, label, color }) => {
                    const selected = (editFw.verdict ?? null) === value;
                    return (
                      <button key={label} onClick={() => applyOverride(editSymbol, { verdict: value })}
                        style={{
                          padding: '8px 4px', borderRadius: 8, fontFamily: D.mono, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                          border: `2px solid ${selected ? color : D.border}`,
                          background: selected ? color + '22' : D.inner, color: selected ? color : D.sub, transition: 'all 0.15s',
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                {editFw.verdict === 'sell' && (() => {
                  const ec = overrides[editSymbol!]?.exitCondition;
                  const ecType = ec?.type ?? 'now';
                  return (
                    <div style={{ marginTop: 12, padding: '10px 12px', background: '#1a0808', border: '1px solid #3a1a1a', borderRadius: 8 }}>
                      <p style={{ fontFamily: D.mono, fontSize: 10, fontWeight: 700, color: D.red, marginBottom: 8 }}>Exit condition</p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
                        {(['now', 'pnl', 'custom'] as const).map(type => (
                          <button
                            key={type}
                            onClick={() => applyOverride(editSymbol!, { exitCondition: { type, pnlPct: ec?.pnlPct, note: ec?.note } })}
                            style={{
                              padding: '5px 4px', borderRadius: 6, fontFamily: D.mono, fontSize: 10, fontWeight: 700, cursor: 'pointer', border: `1px solid ${ecType === type ? D.red : '#3a1a1a'}`,
                              background: ecType === type ? '#3a0808' : '#140808', color: ecType === type ? D.red : D.dim,
                            }}
                          >
                            {type === 'now' ? 'Now' : type === 'pnl' ? 'P&L %' : 'Custom'}
                          </button>
                        ))}
                      </div>
                      {ecType === 'pnl' && (() => {
                        const pos = positions.find(p => p.symbol === editSymbol);
                        const computedBEpct = pos && pos.totalCost > 0
                          ? parseFloat((-(pos.realizedPnL ?? 0) / pos.totalCost * 100).toFixed(1))
                          : 0;
                        const beOn = !!ec?.breakeven;
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontFamily: D.mono, fontSize: 10, color: D.red, whiteSpace: 'nowrap' }}>P&L %</span>
                              <input
                                type="number" step="5" placeholder="-20"
                                key={editSymbol + '-pnlPct'}
                                defaultValue={ec?.pnlPct ?? ''}
                                disabled={beOn}
                                onBlur={e => applyOverride(editSymbol!, { exitCondition: { ...ec, type: 'pnl', pnlPct: parseFloat(e.target.value) || 0 } })}
                                style={{ flex: 1, minWidth: 0, padding: '5px 8px', background: D.bg, border: '1px solid #3a1a1a', borderRadius: 5, color: D.text, fontFamily: D.mono, fontSize: 11, outline: 'none', opacity: beOn ? 0.4 : 1 }}
                              />
                              <span style={{ fontFamily: D.mono, fontSize: 10, color: D.red }}>%</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div>
                                <span style={{ fontFamily: D.mono, fontSize: 10, color: D.red }}>Breakeven</span>
                                {beOn && <span style={{ marginLeft: 6, fontFamily: D.mono, fontSize: 10, color: D.dim }}>{computedBEpct >= 0 ? '+' : ''}{computedBEpct}%</span>}
                              </div>
                              <button
                                onClick={() => applyOverride(editSymbol!, { exitCondition: { ...ec, type: 'pnl', breakeven: !beOn, pnlPct: !beOn ? computedBEpct : ec?.pnlPct } })}
                                style={{ position: 'relative', display: 'inline-flex', height: 18, width: 32, borderRadius: 9, border: 'none', cursor: 'pointer', background: beOn ? D.red : D.dimmer, transition: 'background 0.2s' }}
                              >
                                <span style={{ position: 'absolute', width: 13, height: 13, borderRadius: '50%', background: '#fff', top: 2.5, left: beOn ? 16 : 2, transition: 'left 0.2s' }} />
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                      {ecType === 'custom' && (
                        <input
                          type="text" placeholder="e.g. breaks below 200d MA"
                          key={editSymbol + '-note'}
                          defaultValue={ec?.note ?? ''}
                          onBlur={e => applyOverride(editSymbol!, { exitCondition: { type: 'custom', pnlPct: ec?.pnlPct, note: e.target.value } })}
                          style={{ width: '100%', padding: '5px 8px', background: D.bg, border: '1px solid #3a1a1a', borderRadius: 5, color: D.text, fontFamily: D.mono, fontSize: 11, outline: 'none', boxSizing: 'border-box' }}
                        />
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* F. Sector settings modal */}
      {editSectorName && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={() => setEditSectorName(null)}>
          <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 14, padding: 24, width: 320, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {(() => { const Icon = SECTOR_ICONS[editSectorName]; return Icon ? <Icon size={15} style={{ color: SECTOR_COLORS[editSectorName] }} /> : null; })()}
                <p style={{ fontFamily: D.mono, fontWeight: 700, color: D.text, fontSize: 14, margin: 0 }}>{editSectorName}</p>
              </div>
              <button onClick={() => setEditSectorName(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: D.dim }}><X size={15} /></button>
            </div>

            {(() => {
              const t = editSectorTarget;
              let minRef = String(t?.min ?? 0);
              let maxRef = String(t?.max ?? 0);
              return (
                <div style={{ marginBottom: 20 }}>
                  <p style={{ fontFamily: D.mono, fontSize: 10, fontWeight: 700, color: D.dim, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>Target Range (%)</p>
                  <p style={{ fontFamily: D.mono, fontSize: 10, color: D.dimmer, marginBottom: 12 }}>Changes apply when you leave each field</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontFamily: D.mono, fontSize: 10, color: D.dim, display: 'block', marginBottom: 4 }}>Min</label>
                      <input key={`${editSectorName}-min`} type="number" min="0" max="100" step="0.5" defaultValue={t?.min ?? 0}
                        onChange={e => { minRef = e.target.value; }}
                        onBlur={() => commitSectorRange(editSectorName!, minRef, maxRef)}
                        style={{ ...inputSt }} />
                    </div>
                    <span style={{ color: D.dimmer, marginTop: 18 }}>—</span>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontFamily: D.mono, fontSize: 10, color: D.dim, display: 'block', marginBottom: 4 }}>Max</label>
                      <input key={`${editSectorName}-max`} type="number" min="0" max="100" step="0.5" defaultValue={t?.max ?? 0}
                        onChange={e => { maxRef = e.target.value; }}
                        onBlur={() => commitSectorRange(editSectorName!, minRef, maxRef)}
                        style={{ ...inputSt }} />
                    </div>
                  </div>
                </div>
              );
            })()}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontFamily: D.mono, fontSize: 12, fontWeight: 600, color: D.text, margin: 0 }}>Exit Zone</p>
                  <p style={{ fontFamily: D.mono, fontSize: 10, color: D.dim, marginTop: 2 }}>No new capital; wind down all positions</p>
                </div>
                <button
                  onClick={() => applySectorOverride(editSectorName, { exitSector: !editSectorTarget?.exitSector })}
                  style={{ position: 'relative', display: 'inline-flex', height: 20, width: 36, borderRadius: 10, border: 'none', cursor: 'pointer', background: editSectorTarget?.exitSector ? D.red : D.dimmer, flexShrink: 0, transition: 'background 0.2s' }}
                >
                  <span style={{ position: 'absolute', width: 14, height: 14, borderRadius: '50%', background: '#fff', top: 3, left: editSectorTarget?.exitSector ? 19 : 3, transition: 'left 0.2s' }} />
                </button>
              </div>

              {!editSectorTarget?.exitSector && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ fontFamily: D.mono, fontSize: 12, fontWeight: 600, color: D.text, margin: 0 }}>Intentional Overweight</p>
                    <p style={{ fontFamily: D.mono, fontSize: 10, color: D.dim, marginTop: 2 }}>Over-target shown in purple, not yellow</p>
                  </div>
                  <button
                    onClick={() => applySectorOverride(editSectorName, { intentionalOW: !editSectorTarget?.intentionalOW })}
                    style={{ position: 'relative', display: 'inline-flex', height: 20, width: 36, borderRadius: 10, border: 'none', cursor: 'pointer', background: editSectorTarget?.intentionalOW ? D.violet : D.dimmer, flexShrink: 0, transition: 'background 0.2s' }}
                  >
                    <span style={{ position: 'absolute', width: 14, height: 14, borderRadius: '50%', background: '#fff', top: 3, left: editSectorTarget?.intentionalOW ? 19 : 3, transition: 'left 0.2s' }} />
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={() => setEditSectorName(null)}
              style={{ width: '100%', padding: '10px', border: `1px solid ${D.border}`, borderRadius: 8, background: D.inner, color: D.sub, fontFamily: D.mono, fontSize: 12, cursor: 'pointer' }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FrameworkAllocationView;
