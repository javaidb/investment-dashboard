import React, { useMemo, useState, useCallback, useRef } from 'react';
import { ChevronDown, ChevronUp, X, SlidersHorizontal, Cpu, Heart, Zap, Landmark, ShoppingCart, Factory, Radio, Package, Globe, Bitcoin, LucideIcon, PieChart as PieIcon } from 'lucide-react';
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

// ── Sector override management ────────────────────────────────────────────

interface SectorOverride {
  exitSector?: boolean;
  intentionalOW?: boolean;
  min?: number;
  max?: number;
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

const STATUS_BADGE: Record<PositionStatus, { label: string; cls: string }> = {
  'on-target':  { label: 'On target',  cls: 'bg-green-100 text-green-700' },
  'building':   { label: 'Building',   cls: 'bg-amber-100 text-amber-700' },
  'oversized':  { label: 'Oversized',  cls: 'bg-red-100 text-red-700' },
  'undersized': { label: 'Undersized', cls: 'bg-yellow-100 text-yellow-700' },
  'not-held':   { label: 'Not held',   cls: 'bg-gray-100 text-gray-500' },
  'trimming':   { label: 'Trimming',   cls: 'bg-orange-100 text-orange-700' },
  'sell':       { label: 'Exit',       cls: 'bg-red-100 text-red-700' },
  'decide':     { label: 'Decide',     cls: 'bg-violet-100 text-violet-700' },
  'unassigned': { label: 'Unassigned', cls: 'bg-gray-100 text-gray-400' },
};

// Suggested total sleeve allocation per role type
// Anchors dominate, supporting complements, speculative stays small
const ROLE_SLEEVE_TARGETS: Record<PositionRole, { min: number; max: number }> = {
  Anchor:      { min: 40, max: 55 }, // 3-5 positions × 8-12% — core of the portfolio
  Supporting:  { min: 20, max: 30 }, // 4-6 positions × 4-6% — sector exposure
  Speculative: { min: 10, max: 20 }, // 4-8 positions × 2-3% — asymmetric upside, limited risk
};

const ROLE_BADGE: Record<PositionRole, string> = {
  Anchor:      'bg-indigo-100 text-indigo-700',
  Supporting:  'bg-green-100 text-green-700',
  Speculative: 'bg-amber-100 text-amber-700',
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
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-6">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Sector Target Allocation — drag dividers to adjust
      </p>
      <div ref={containerRef} className="relative h-10 flex rounded-lg overflow-visible select-none">
        {activeSectors.map((sector, i) => {
          const target = getTarget(sector);
          const widthPct = (maxes[i] / totalMax) * 100;
          const leftPct = cumPct;
          cumPct += widthPct;
          return (
            <React.Fragment key={sector}>
              <div
                className="relative flex items-center justify-center overflow-hidden"
                style={{
                  width: `${widthPct}%`,
                  backgroundColor: colors[sector] ?? '#6b7280',
                  opacity: 0.85,
                  borderRadius: i === 0 ? '6px 0 0 6px' : i === activeSectors.length - 1 ? '0 6px 6px 0' : undefined,
                }}
              >
                <span className="text-white text-[10px] font-semibold truncate px-1 drop-shadow-sm leading-tight text-center">
                  {sector}<br />{target?.min}–{target?.max}%
                </span>
              </div>
              {i < activeSectors.length - 1 && (
                <div
                  className="absolute top-0 bottom-0 w-3 cursor-col-resize z-10 flex items-center justify-center group"
                  style={{ left: `calc(${leftPct + widthPct}% - 6px)` }}
                  onMouseDown={e => handleMouseDown(e, i)}
                >
                  <div className="w-0.5 h-full bg-white/60 group-hover:bg-white transition-colors" />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
      <p className="text-xs text-gray-400 mt-2">
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

const FrameworkAllocationView: React.FC<Props> = ({ positions, symbolSubsectors = {}, symbolMomentum5 = {}, symbolMomentum20 = {} }) => {
  const [tableOpen,       setTableOpen]       = useState(false);
  const [editSymbol,      setEditSymbol]       = useState<string | null>(null);
  const [editSectorName,  setEditSectorName]   = useState<string | null>(null);
  const [overrides,       setOverrides]        = useState<OverrideMap>(loadOverrides);
  const [sectorOverrides, setSectorOverrides]  = useState<Record<string, SectorOverride>>(loadSectorOverrides);
  const [view,            setView]            = useState<'allocation' | 'pnl' | 'buys'>('allocation');
  const [pieOpenSector,   setPieOpenSector]   = useState<string | null>(null);

  // Sector override helpers
  const applySectorOverride = useCallback((sector: string, ov: Partial<SectorOverride>) => {
    setSectorOverrides(prev => {
      const next = { ...prev, [sector]: { ...prev[sector], ...ov } };
      localStorage.setItem(SECTOR_OV_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const getEffTarget = useCallback((sector: string) =>
    getEffectiveSectorTarget(sector, sectorOverrides), [sectorOverrides]);

  // Position override helpers
  const applyOverride = useCallback((symbol: string, change: PositionOverride) => {
    setOverrides(prev => {
      const next = { ...prev, [symbol]: { ...prev[symbol], ...change } };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearOverride = useCallback((symbol: string) => {
    setOverrides(prev => {
      const next = { ...prev }; delete next[symbol];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
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
      if (p.shares > 0.001 && p.marketValue > 0 && p.type !== 'c') heldBySymbol[p.symbol] = p;
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
    const orderedSectors = [...SECTOR_ORDER, ...extraSectors]; // SECTOR_ORDER always included so empty framework sectors still get a card

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
  }, [positions, effectiveRoles, overrides]);

  const allPositionsForTable = useMemo(() => {
    const heldBySymbol: Record<string, SlimPosition> = {};
    for (const p of positions) {
      if (p.shares > 0.001 && p.marketValue > 0 && p.type !== 'c') heldBySymbol[p.symbol] = p;
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
  }, [positions, effectiveRoles, overrides]);

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

    // Framework sectors always render (even empty) so sliders button is accessible
    const isFrameworkSector = sector in SECTOR_TARGETS;
    if (!isFrameworkSector && sPs.length === 0) return null;

    const sectorDollar = sPs.filter(p => !p.isExcluded).reduce((s, p) => s + p.marketValue, 0);

    // Sum of each position's role minimum — if this exceeds the sector minimum, the targets conflict
    const posMinSum = sPs
      .filter(p => !p.isExcluded && p.fw && p.status !== 'sell' && p.status !== 'unassigned')
      .reduce((sum, p) => sum + (p.fw!.targetMin), 0);
    const hasConflict = hasTarget && posMinSum > target!.max;
    const SectorIcon   = SECTOR_ICONS[sector] ?? null;
    const sectorColor  = SECTOR_COLORS[sector];

    // Zone bar always fills full card width — barMax = max(target.max, actual) so no gray tail.
    // Blue bar scales within that same range so both bars share the same axis.
    const barMax    = hasTarget ? Math.max(target!.max, sectorPct, 0.01) : Math.max(sectorPct, 0.01);
    const redPct    = hasTarget ? (target!.min  / barMax) * 100 : 0;
    const greenPct  = hasTarget ? ((target!.max - target!.min) / barMax) * 100 : 0;
    const overPct   = hasTarget && sectorPct > target!.max
      ? ((sectorPct - target!.max) / barMax) * 100
      : 0;
    const overColor = target?.intentionalOW ? '#c084fc' : '#fbbf24';
    // Blue bar: how far along the bar the actual value is (always ≤ 100%)
    const blueFill  = Math.min((sectorPct / barMax) * 100, 100);

    // Compute subsector breakdown for this sector's held positions
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
        className={`rounded-xl border-2 shadow-sm p-4 ${isExitSector ? 'bg-red-50' : 'bg-white'}`}
        style={{ borderColor: isExitSector ? '#fca5a5' : (sectorColor ? sectorColor + 'cc' : '#e5e7eb') }}
      >
        {/* Card header */}
        <div className="flex items-start justify-between mb-2">
          <div>
            <div className={`flex items-center gap-1.5 font-bold text-sm ${isExitSector ? 'text-red-700' : 'text-gray-900'}`}>
              {SectorIcon && <SectorIcon size={13} className="flex-shrink-0 opacity-70" />}
              {sector}
            </div>
            {hasTarget && (
              <p className="text-xs text-gray-400 mt-0.5">
                Target {target!.min}–{target!.max}%
                {target?.intentionalOW && <span className="ml-1 text-violet-400">· Intentional OW</span>}
              </p>
            )}
            {isExitSector && <p className="text-xs text-red-400 mt-0.5">Exit zone</p>}
            {hasConflict && (
              <p className="text-xs text-amber-600 mt-0.5" title={`Position minimums sum to ${posMinSum.toFixed(1)}% vs sector max ${target!.max}%`}>
                ⚠ Position mins ({posMinSum.toFixed(0)}%) exceed sector max ({target!.max}%)
              </p>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            {subsectorSlices.length > 0 && (
              <button
                onClick={e => { e.stopPropagation(); setPieOpenSector(prev => prev === sector ? null : sector); }}
                title="Show subsector breakdown"
                className={`p-1 rounded transition-colors ${pieOpen ? 'text-indigo-500 bg-indigo-50' : 'text-gray-300 hover:text-gray-600 hover:bg-gray-100'}`}
              >
                <PieIcon size={13} />
              </button>
            )}
            <button
              onClick={e => { e.stopPropagation(); setEditSectorName(sector); }}
              title="Edit sector targets"
              className="p-1 rounded text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <SlidersHorizontal size={13} />
            </button>
          </div>
        </div>

        {/* Subsector pie breakdown */}
        {pieOpen && subsectorSlices.length > 0 && (
          <div className="mb-3 flex flex-col items-center gap-2 border-t border-dashed border-gray-100 pt-3">
            <PieChart width={140} height={140}>
              <Pie
                data={subsectorSlices}
                cx={65}
                cy={65}
                innerRadius={35}
                outerRadius={65}
                dataKey="value"
                stroke="none"
              >
                {subsectorSlices.map((s, i) => <Cell key={i} fill={s.color} />)}
              </Pie>
              <Tooltip
                content={({ payload }) => {
                  if (!payload?.length) return null;
                  const s = payload[0].payload as typeof subsectorSlices[0];
                  const total = subsectorSlices.reduce((sum, x) => sum + x.value, 0);
                  return (
                    <div className="bg-white border border-gray-200 rounded shadow-md p-2 text-xs max-w-[160px]">
                      <div className="font-semibold mb-1" style={{ color: s.color }}>{s.name}</div>
                      <div className="text-gray-400 mb-1">{((s.value / total) * 100).toFixed(0)}% of sector</div>
                      <div className="flex flex-wrap gap-0.5">
                        {s.symbols.map(sym => (
                          <span key={sym} className="bg-gray-100 text-gray-700 rounded px-1 py-0.5 font-mono">{sym}</span>
                        ))}
                      </div>
                    </div>
                  );
                }}
              />
            </PieChart>
            <div className="w-full space-y-0.5">
              {subsectorSlices.map((s, i) => {
                const total = subsectorSlices.reduce((sum, x) => sum + x.value, 0);
                return (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="text-gray-600 truncate">{s.name}</span>
                    </div>
                    <span className="text-gray-400 flex-shrink-0 ml-1">{((s.value / total) * 100).toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Allocation bars */}
        {hasTarget && (
          <div className="mb-3 space-y-1">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xl font-bold text-gray-900">{fmtPct(sectorPct)}</span>
              <span className="text-xs text-gray-400">{fmtCAD(sectorDollar)}</span>
            </div>

            {/* Blue actual bar */}
            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${blueFill}%`, backgroundColor: '#3b82f6' }} />
            </div>

            {/* Zone bar — always fills full width */}
            <div className="h-2.5 rounded-full overflow-hidden flex">
              <div style={{ width: `${redPct}%`,   backgroundColor: '#f87171', flexShrink: 0 }} />
              <div style={{ width: `${greenPct}%`, backgroundColor: '#4ade80', flexShrink: 0 }} />
              {overPct > 0 && <div style={{ width: `${overPct}%`, backgroundColor: overColor, flexShrink: 0 }} />}
            </div>

            {/* Min/max tick labels positioned at their actual % within bar */}
            <div className="relative h-3.5">
              <span className="absolute text-[10px] text-gray-400 -translate-x-1/2"
                style={{ left: `${redPct}%` }}>{target!.min}%</span>
              <span className="absolute text-[10px] text-gray-400 -translate-x-1/2"
                style={{ left: `${redPct + greenPct}%` }}>{target!.max}%</span>
            </div>
          </div>
        )}

        {/* Position rows */}
        {view === 'buys' ? (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                <th className="text-[10px] text-gray-300 font-normal text-left pb-1" />
                <th className="text-[10px] text-gray-300 font-normal text-right pb-1 pl-3">Cur</th>
                <th className="text-[10px] text-gray-300 font-normal text-right pb-1 pl-3">Avg</th>
                <th className="text-[10px] text-gray-300 font-normal text-right pb-1 pl-3">5d</th>
                <th className="text-[10px] text-gray-300 font-normal text-right pb-1 pl-3">20d</th>
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
                const curColor       = (() => {
                  if (cur == null || avg == null) return 'text-gray-300';
                  if (cur < avg) return 'text-green-600';
                  if (cur <= avg * 1.10) return 'text-yellow-500';
                  return 'text-gray-400';
                })();
                const fmtPrice       = (n: number | undefined) => n == null ? '—' : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                const fmtMom         = (n: number | undefined) => n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
                const momColor       = (n: number | undefined) => n == null ? 'text-gray-300' : n > 5 ? 'text-blue-500' : n > 0 ? 'text-green-600' : 'text-red-500';
                return (
                  <React.Fragment key={p.symbol}>
                    {showDivider && (
                      <tr><td colSpan={5} className="py-0.5"><div className="border-t border-dashed border-gray-200" /></td></tr>
                    )}
                    <tr
                      onClick={() => setEditSymbol(p.symbol)}
                      title="Click to assign role, sector, or verdict"
                      className={`cursor-pointer hover:bg-gray-50 transition-colors ${isUnassigned ? 'opacity-60' : ''}`}
                    >
                      <td className="py-1 pr-2">
                        <div className="flex items-center gap-1.5">
                          {p.fw
                            ? <span className="flex-shrink-0" style={{ color: SIZING_RULES[p.fw.role].color }}>{ROLE_ICONS[p.fw.role]}</span>
                            : <span className="flex-shrink-0 text-gray-300">○</span>
                          }
                          <span className={`font-semibold ${isUnassigned ? 'text-gray-400' : 'text-gray-800'}`}>{p.symbol}</span>
                          {overrides[p.symbol] && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />}
                        </div>
                      </td>
                      <td className={`py-1 pl-3 text-right font-mono tabular-nums whitespace-nowrap ${curColor}`}>
                        {fmtPrice(cur)}
                      </td>
                      <td className={`py-1 pl-3 text-right font-mono tabular-nums whitespace-nowrap ${avg == null ? 'text-gray-300' : 'text-gray-600'}`}>
                        {fmtPrice(avg)}
                      </td>
                      <td className={`py-1 pl-3 text-right font-mono tabular-nums whitespace-nowrap ${momColor(mom5)}`}>
                        {fmtMom(mom5)}
                      </td>
                      <td className={`py-1 pl-3 text-right font-mono tabular-nums whitespace-nowrap ${momColor(mom20)}`}>
                        {fmtMom(mom20)}
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        ) : view === 'pnl' ? (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                <th className="text-[10px] text-gray-300 font-normal text-left pb-1" />
                <th className="text-[10px] text-gray-300 font-normal text-right pb-1 pl-3">Unrlzd</th>
                <th className="text-[10px] text-gray-300 font-normal text-right pb-1 pl-3">%</th>
                <th className="text-[10px] text-indigo-300 font-semibold text-right pb-1 pl-3">BE%</th>
                <th className="text-[10px] text-gray-300 font-normal text-right pb-1 pl-3">Rld</th>
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
                const beColor        = rld === 0
                  ? 'text-gray-300'
                  : beDiff > 15 ? 'text-blue-500'
                  : beDiff > 5  ? 'text-green-600'
                  : beDiff >= -5 ? 'text-yellow-500'
                  : 'text-red-500';
                return (
                  <React.Fragment key={p.symbol}>
                    {showDivider && (
                      <tr><td colSpan={5} className="py-0.5"><div className="border-t border-dashed border-gray-200" /></td></tr>
                    )}
                    <tr
                      onClick={() => setEditSymbol(p.symbol)}
                      title="Click to assign role, sector, or verdict"
                      className={`cursor-pointer hover:bg-gray-50 transition-colors ${isUnassigned ? 'opacity-60' : ''}`}
                    >
                      <td className="py-1 pr-2">
                        <div className="flex items-center gap-1.5">
                          {p.fw
                            ? <span className="flex-shrink-0" style={{ color: SIZING_RULES[p.fw.role].color }}>{ROLE_ICONS[p.fw.role]}</span>
                            : <span className="flex-shrink-0 text-gray-300">○</span>
                          }
                          <span className={`font-semibold ${isUnassigned ? 'text-gray-400' : 'text-gray-800'}`}>{p.symbol}</span>
                          {overrides[p.symbol] && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />}
                        </div>
                      </td>
                      <td className={`py-1 pl-3 text-right font-mono tabular-nums whitespace-nowrap ${unrlzd > 500 ? 'text-blue-500' : uPos ? 'text-green-600' : 'text-red-500'}`}>
                        {uPos ? '+' : ''}{fmtCAD(unrlzd)}
                      </td>
                      <td className={`py-1 pl-3 text-right font-mono tabular-nums whitespace-nowrap ${unrlzdPct > 50 ? 'text-blue-500' : uPos ? 'text-green-600' : 'text-red-500'}`}>
                        {uPos ? '+' : ''}{unrlzdPct.toFixed(1)}%
                      </td>
                      <td className={`py-1 pl-3 text-right font-mono tabular-nums whitespace-nowrap ${beColor}`}>
                        {rld === 0 ? '0%' : `${bePct >= 0 ? '+' : ''}${bePct.toFixed(1)}%`}
                      </td>
                      <td className={`py-1 pl-3 text-right font-mono tabular-nums whitespace-nowrap ${rld === 0 ? 'text-gray-300' : rPos ? 'text-green-500' : 'text-red-400'}`}>
                        {rld === 0 ? '$0' : `${rPos ? '+' : ''}${fmtCAD(rld)}`}
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="space-y-1">
            {sPs.map((p, i) => {
              const isExit         = p.status === 'sell' || p.status === 'decide';
              const isUnassigned   = p.status === 'unassigned';
              const prev           = i > 0 ? sPs[i - 1] : null;
              const prevExit       = prev && (prev.status === 'sell' || prev.status === 'decide');
              const prevUnassigned = prev?.status === 'unassigned';
              const showDivider    = ((isExit && !prevExit) || (isUnassigned && !prevUnassigned)) && i > 0;
              return (
                <React.Fragment key={p.symbol}>
                  {showDivider && <div className="border-t border-dashed border-gray-200 my-1" />}
                  <button
                    onClick={() => setEditSymbol(p.symbol)}
                    title="Click to assign role, sector, or verdict"
                    className={`w-full flex items-center justify-between rounded px-1 py-0.5 -mx-1 transition-colors hover:bg-gray-100 text-left ${isUnassigned ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      {p.fw
                        ? <span className="text-xs flex-shrink-0" style={{ color: SIZING_RULES[p.fw.role].color }}>{ROLE_ICONS[p.fw.role]}</span>
                        : <span className="text-xs flex-shrink-0 text-gray-300">○</span>
                      }
                      <span className={`font-semibold text-xs truncate ${isUnassigned ? 'text-gray-400' : 'text-gray-800'}`}>{p.symbol}</span>
                      {overrides[p.symbol] && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-xs text-gray-600 font-mono">
                        <span className="text-gray-400">({fmtCAD(p.marketValue)})</span>
                        {!p.isExcluded && <>{' '}{fmtPct(p.currentPct)}</>}
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_BADGE[p.status].cls}`}>
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

  // Sector settings modal state
  const editSectorTarget = editSectorName ? getEffTarget(editSectorName) : null;

  const commitSectorRange = useCallback((sector: string, minStr: string, maxStr: string) => {
    const min = parseFloat(minStr);
    const max = parseFloat(maxStr);
    if (!isNaN(min) && !isNaN(max) && max >= min) {
      const ov: SectorOverride = { min, max };
      if (max > 0) ov.exitSector = false; // setting a real range clears exit zone
      applySectorOverride(sector, ov);
    }
  }, [applySectorOverride]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
          {(['allocation', 'pnl', 'buys'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${view === v ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {v === 'allocation' ? 'Allocation' : v === 'pnl' ? 'P&L' : 'Buys'}
            </button>
          ))}
        </div>
        {hasOverrides && (
          <button onClick={resetAll} className="text-xs text-gray-400 hover:text-red-500 transition-colors">Reset all customizations</button>
        )}
      </div>

      {/* A. Overview stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {(['Anchor', 'Supporting', 'Speculative'] as PositionRole[]).map(role => {
          const { count, pct } = roleSummary[role];
          const rule = SIZING_RULES[role];
          return (
            <div key={role} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-1">
                <span style={{ color: rule.color }} className="text-lg">{ROLE_ICONS[role]}</span>
                <span className="font-semibold text-gray-700 text-sm">{role}s</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{count}</p>
              <p className="text-sm text-gray-500 mt-0.5">{fmtPct(pct)} of sleeve</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Target {ROLE_SLEEVE_TARGETS[role].min}–{ROLE_SLEEVE_TARGETS[role].max}%
              </p>
              <p className="text-xs text-gray-300 mt-0.5">{rule.min}–{rule.max}% per position</p>
            </div>
          );
        })}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-gray-400 text-lg">◻</span>
            <span className="font-semibold text-gray-700 text-sm">Sleeve Total</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{fmtCAD(sleeveValue)}</p>
          <p className="text-sm text-gray-500 mt-0.5">
            {keepCount} kept · {exitCount} to exit{unassignedCount > 0 ? ` · ${unassignedCount} unassigned` : ''}
          </p>
        </div>
      </div>

      {/* B. Sector Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
        {orderedSectors.map(s => renderSectorCard(s))}
      </div>

      {/* C. Draggable sector allocation bar */}
      <DraggableAllocationBar
        sectors={orderedSectors}
        getTarget={getEffTarget}
        applyOv={(sector, ov) => applySectorOverride(sector, ov)}
        colors={SECTOR_COLORS}
      />

      {/* D. Position Sizing Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <button className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors" onClick={() => setTableOpen(o => !o)}>
          <span className="font-semibold text-gray-800 text-sm">Position Sizing Compliance</span>
          {tableOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </button>

        {tableOpen && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Symbol</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Sector</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Role</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Current %</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Current $</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Target Range</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {allPositionsForTable.map((p, i) => {
                  const isExit = p.fw?.verdict === 'sell' || p.fw?.verdict === 'decide';
                  const isUnassigned = p.status === 'unassigned';
                  const prev = i > 0 ? allPositionsForTable[i - 1] : null;
                  const prevExit = prev?.fw?.verdict === 'sell' || prev?.fw?.verdict === 'decide';
                  const prevUnassigned = prev?.status === 'unassigned';
                  return (
                    <React.Fragment key={p.symbol}>
                      {isExit && !prevExit && !prevUnassigned && (
                        <tr><td colSpan={7} className="px-4 py-1.5 bg-red-50 text-xs font-semibold text-red-600 uppercase tracking-wide">Exit / Decide</td></tr>
                      )}
                      {isUnassigned && !prevUnassigned && (
                        <tr><td colSpan={7} className="px-4 py-1.5 bg-gray-50 text-xs font-semibold text-gray-400 uppercase tracking-wide">Unassigned — click to classify</td></tr>
                      )}
                      <tr
                        className={`hover:bg-gray-50 cursor-pointer ${isExit ? 'bg-red-50/30' : isUnassigned ? 'bg-gray-50/50' : ''}`}
                        onClick={() => setEditSymbol(p.symbol)}
                      >
                        <td className={`px-4 py-2.5 font-semibold ${isUnassigned ? 'text-gray-400' : 'text-gray-900'}`}>
                          <div className="flex items-center gap-1.5">
                            {p.symbol}
                            {overrides[p.symbol] && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">{p.sector}</td>
                        <td className="px-4 py-2.5">
                          {p.fw
                            ? <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${ROLE_BADGE[p.fw.role]}`}>{ROLE_ICONS[p.fw.role]} {p.fw.role}</span>
                            : <span className="text-gray-300 text-xs">—</span>
                          }
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-gray-700">
                          {p.marketValue > 0 && !p.isExcluded ? fmtPct(p.currentPct) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-600">
                          {p.marketValue > 0 ? fmtCAD(p.marketValue) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-500 text-xs">
                          {!p.fw || p.fw.verdict === 'sell' ? '—' : (p.fw.buildTarget
                            ? `${p.fw.targetMin}–${p.fw.targetMax}% (→ ${p.fw.buildTarget}%)`
                            : `${p.fw.targetMin}–${p.fw.targetMax}%`)}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[p.status].cls}`}>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setEditSymbol(null)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 w-80 max-w-[90vw]" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-5">
              <div>
                <p className="font-bold text-gray-900 text-base">{editSymbol}</p>
                <p className="text-xs text-gray-400 mt-0.5">{editSector}{editFw ? ` · ${editFw.role}` : ' · Unassigned'}</p>
              </div>
              <div className="flex items-center gap-1">
                {overrides[editSymbol] && (
                  <button onClick={() => clearOverride(editSymbol)} className="text-xs text-gray-400 hover:text-red-500 transition-colors px-2 py-1 rounded hover:bg-red-50">Reset</button>
                )}
                <button onClick={() => setEditSymbol(null)} className="p-1 text-gray-400 hover:text-gray-600 rounded"><X size={15} /></button>
              </div>
            </div>

            <div className="mb-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Role</p>
              <div className="grid grid-cols-3 gap-2">
                {(['Anchor', 'Supporting', 'Speculative'] as PositionRole[]).map(role => {
                  const rule = SIZING_RULES[role];
                  const selected = editFw?.role === role;
                  return (
                    <button key={role} onClick={() => applyOverride(editSymbol, { role })}
                      className={`py-2 rounded-lg text-xs font-semibold border-2 transition-all ${selected ? 'text-white border-transparent' : 'border-gray-200 text-gray-600 hover:border-gray-300 bg-white'}`}
                      style={selected ? { backgroundColor: rule.color } : {}}>
                      <div className="text-base leading-none mb-1">{ROLE_ICONS[role]}</div>
                      <div>{rule.label}</div>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-gray-400 mt-2">
                {editFw ? `Target: ${SIZING_RULES[editFw.role].min}–${SIZING_RULES[editFw.role].max}% of sleeve` : 'Select a role to assign a target range'}
              </p>
            </div>

            <div className="mb-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Sector</p>
              <select value={editSector ?? ''} onChange={e => applyOverride(editSymbol, { sector: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
                {SECTOR_ORDER.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="mb-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Build Target %</p>
              <div className="flex items-center gap-2">
                <input
                  type="number" min="0" max="100" step="0.5"
                  placeholder="e.g. 8"
                  defaultValue={editFw?.buildTarget ?? overrides[editSymbol!]?.buildTarget ?? ''}
                  key={editSymbol}
                  onChange={e => {
                    const v = e.target.value;
                    applyOverride(editSymbol!, { buildTarget: v === '' ? null : parseFloat(v) });
                  }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                {(editFw?.buildTarget != null || overrides[editSymbol!]?.buildTarget != null) && (
                  <button onClick={() => applyOverride(editSymbol!, { buildTarget: null })}
                    className="text-xs text-gray-400 hover:text-red-500 whitespace-nowrap">Clear</button>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1">Building if below · Trimming if above</p>
            </div>
            {editFw && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Verdict</p>
                <div className="grid grid-cols-3 gap-2">
                  {MODAL_VERDICTS.map(({ value, label, color }) => {
                    const selected = (editFw.verdict ?? null) === value;
                    return (
                      <button key={label} onClick={() => applyOverride(editSymbol, { verdict: value })}
                        className={`py-2 rounded-lg text-xs font-semibold border-2 transition-all ${selected ? 'text-white border-transparent' : 'border-gray-200 text-gray-600 hover:border-gray-300 bg-white'}`}
                        style={selected ? { backgroundColor: color } : {}}>
                        {label}
                      </button>
                    );
                  })}
                </div>

                {/* Exit condition — shown only when Exit verdict is active */}
                {editFw.verdict === 'sell' && (() => {
                  const ec = overrides[editSymbol!]?.exitCondition;
                  const ecType = ec?.type ?? 'now';
                  return (
                    <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-100">
                      <p className="text-xs font-semibold text-red-500 mb-2">Exit condition</p>
                      <div className="grid grid-cols-3 gap-1.5 mb-2">
                        {(['now', 'pnl', 'custom'] as const).map(type => (
                          <button
                            key={type}
                            onClick={() => applyOverride(editSymbol!, { exitCondition: { type, pnlPct: ec?.pnlPct, note: ec?.note } })}
                            className={`py-1.5 rounded text-xs font-semibold border transition-all ${ecType === type ? 'bg-red-500 text-white border-transparent' : 'border-red-200 text-red-500 bg-white hover:bg-red-50'}`}
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
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-red-400 whitespace-nowrap">P&L %</span>
                              <input
                                type="number" step="5" placeholder="-20"
                                key={editSymbol + '-pnlPct'}
                                defaultValue={ec?.pnlPct ?? ''}
                                disabled={beOn}
                                onBlur={e => applyOverride(editSymbol!, { exitCondition: { ...ec, type: 'pnl', pnlPct: parseFloat(e.target.value) || 0 } })}
                                className="flex-1 min-w-0 border border-red-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-red-300 disabled:opacity-40 disabled:cursor-not-allowed"
                              />
                              <span className="text-xs text-red-400">%</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="text-xs text-red-400">Breakeven</span>
                                {beOn && <span className="ml-1.5 text-[10px] text-red-300 font-mono">{computedBEpct >= 0 ? '+' : ''}{computedBEpct}%</span>}
                              </div>
                              <button
                                onClick={() => applyOverride(editSymbol!, { exitCondition: { ...ec, type: 'pnl', breakeven: !beOn, pnlPct: !beOn ? computedBEpct : ec?.pnlPct } })}
                                className={`relative inline-flex h-4 w-7 rounded-full transition-colors ${beOn ? 'bg-red-500' : 'bg-gray-200'}`}
                              >
                                <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform mt-0.5 ${beOn ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
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
                          className="w-full border border-red-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-red-300"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setEditSectorName(null)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 w-80 max-w-[90vw]" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-2">
                {(() => { const Icon = SECTOR_ICONS[editSectorName]; return Icon ? <Icon size={16} style={{ color: SECTOR_COLORS[editSectorName] }} /> : null; })()}
                <p className="font-bold text-gray-900">{editSectorName}</p>
              </div>
              <button onClick={() => setEditSectorName(null)} className="p-1 text-gray-400 hover:text-gray-600 rounded"><X size={15} /></button>
            </div>

            {/* Target range — uncontrolled, applies on blur */}
            {(() => {
              const t = editSectorTarget;
              let minRef = String(t?.min ?? 0);
              let maxRef = String(t?.max ?? 0);
              return (
                <div className="mb-5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Target Range (%)</p>
                  <p className="text-xs text-gray-400 mb-3">Changes apply when you leave each field</p>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <label className="text-xs text-gray-400 mb-1 block">Min</label>
                      <input
                        key={`${editSectorName}-min`}
                        type="number" min="0" max="100" step="0.5"
                        defaultValue={t?.min ?? 0}
                        onChange={e => { minRef = e.target.value; }}
                        onBlur={() => commitSectorRange(editSectorName!, minRef, maxRef)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      />
                    </div>
                    <span className="text-gray-300 mt-5">—</span>
                    <div className="flex-1">
                      <label className="text-xs text-gray-400 mb-1 block">Max</label>
                      <input
                        key={`${editSectorName}-max`}
                        type="number" min="0" max="100" step="0.5"
                        defaultValue={t?.max ?? 0}
                        onChange={e => { maxRef = e.target.value; }}
                        onBlur={() => commitSectorRange(editSectorName!, minRef, maxRef)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      />
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Toggles */}
            <div className="space-y-3 mb-6">
              {/* Exit zone toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">Exit Zone</p>
                  <p className="text-xs text-gray-400">No new capital; wind down all positions</p>
                </div>
                <button
                  onClick={() => applySectorOverride(editSectorName, { exitSector: !editSectorTarget?.exitSector })}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${editSectorTarget?.exitSector ? 'bg-red-500' : 'bg-gray-200'}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${editSectorTarget?.exitSector ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </div>

              {/* Intentional OW toggle */}
              {!editSectorTarget?.exitSector && (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Intentional Overweight</p>
                    <p className="text-xs text-gray-400">Over-target shown in purple, not yellow</p>
                  </div>
                  <button
                    onClick={() => applySectorOverride(editSectorName, { intentionalOW: !editSectorTarget?.intentionalOW })}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${editSectorTarget?.intentionalOW ? 'bg-violet-500' : 'bg-gray-200'}`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${editSectorTarget?.intentionalOW ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={() => setEditSectorName(null)}
              className="w-full py-2 text-sm rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
            >Done</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FrameworkAllocationView;
