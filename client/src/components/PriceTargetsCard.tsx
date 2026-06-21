import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useQuery } from 'react-query';
import axios from 'axios';
import { useCache } from '../contexts/CacheContext';

const mono = "'IBM Plex Mono', 'Courier New', monospace";
const C = {
  bg: '#0a0c10', card: '#10141c', inner: '#141820',
  border: '#1e2535', text: '#e2e8f0', sub: '#94a3b8', dim: '#4a5568',
  accent: '#00d4aa', a2: '#4f8fff',
  up: '#22c55e', down: '#ef4444', warn: '#f59e0b',
};

// ── localStorage ─────────────────────────────────────────────────────────────

const TARGETS_KEY = 'timing-user-targets';
function loadTargets(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(TARGETS_KEY) ?? '{}'); }
  catch { return {}; }
}
function persistTargets(t: Record<string, number>) {
  localStorage.setItem(TARGETS_KEY, JSON.stringify(t));
}

const FRAMEWORK_KEY = 'portfolio-framework-overrides';
function loadFrameworkOverrides(): Record<string, any> {
  try { return JSON.parse(localStorage.getItem(FRAMEWORK_KEY) ?? '{}'); }
  catch { return {}; }
}

// ── primitives ────────────────────────────────────────────────────────────────

const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: 16 }}>
    {children}
  </div>
);

const CardTitle: React.FC<{ children: React.ReactNode; badge?: React.ReactNode }> = ({ children, badge }) => (
  <div style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: C.dim, textTransform: 'uppercase', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <span>{children}</span>
    {badge}
  </div>
);

const MicroPill: React.FC<{ color: string; bg: string; border: string; children: React.ReactNode }> = ({ color, bg, border, children }) => (
  <span style={{ fontFamily: mono, fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 2, letterSpacing: '0.06em', color, background: bg, border: `1px solid ${border}`, whiteSpace: 'nowrap' }}>
    {children}
  </span>
);

const Skel: React.FC<{ height?: number }> = ({ height = 14 }) => (
  <div style={{ height, borderRadius: 3, background: C.inner, border: `1px solid ${C.border}` }} />
);

// ── types & constants ────────────────────────────────────────────────────────

type TargetSource = 'custom' | 'analyst' | 'fallback';

interface TargetRow {
  sym: string;
  cadCurrentPrice: number;
  targetCAD: number;
  upside: number;
  source: TargetSource;
  analystCount: number | null;
  avgCostCAD: number;
  allocPct: number;
}

const MULT_COLOR: Record<TargetSource, string> = {
  custom:   C.a2,
  analyst:  C.a2,
  fallback: C.warn,
};

const FALLBACK_RATE = 1.38;
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

// ── editable target cell (self-contained edit state) ─────────────────────────

const TargetCell: React.FC<{
  row: TargetRow;
  onSetTarget: (sym: string, val: number) => void;
  onClearTarget: (sym: string) => void;
}> = ({ row, onSetTarget, onClearTarget }) => {
  const [editMode, setEditMode] = useState<'price' | 'mult' | null>(null);
  const [editValue, setEditValue] = useState('');

  // % gain/loss from avg cost to target (e.g. avg=$50, target=$75 → +50%)
  const pct = row.avgCostCAD > 0
    ? ((row.targetCAD - row.avgCostCAD) / row.avgCostCAD * 100).toFixed(1)
    : null;
  const multColor = MULT_COLOR[row.source];

  const startPrice = () => { setEditMode('price'); setEditValue(row.targetCAD.toFixed(2)); };
  const startMult  = () => { setEditMode('mult');  setEditValue(pct ?? '0'); };

  const commit = () => {
    const v = parseFloat(editValue);
    if (!isNaN(v)) {
      if (editMode === 'price' && v > 0) onSetTarget(row.sym, v);
      else if (editMode === 'mult' && row.avgCostCAD > 0) onSetTarget(row.sym, row.avgCostCAD * (1 + v / 100));
    }
    setEditMode(null);
  };
  const cancel = () => setEditMode(null);
  const keyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter')  commit();
    if (e.key === 'Escape') cancel();
  };

  const inputBase: React.CSSProperties = {
    fontFamily: mono, fontSize: 13, fontWeight: 800, color: C.text,
    background: C.inner, border: `1px solid ${C.accent}`, borderRadius: 3,
    padding: '2px 4px', outline: 'none', textAlign: 'right',
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, width: 150, flexShrink: 0 }}>
      {/* Price field */}
      {editMode === 'price' ? (
        <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
          onBlur={commit} onKeyDown={keyDown} style={{ ...inputBase, width: 76 }} />
      ) : (
        <div title="click to edit target price" onClick={startPrice}
          style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <span style={{ fontFamily: mono, fontSize: 14, fontWeight: 800, color: C.text, borderBottom: '1px dashed #2a3445' }}>
            C${row.targetCAD.toFixed(2)}
          </span>
          {row.source === 'custom' && (
            <span title="clear" onClick={e => { e.stopPropagation(); onClearTarget(row.sym); }}
              style={{ fontFamily: mono, fontSize: 11, color: C.dim, cursor: 'pointer' }}>×</span>
          )}
        </div>
      )}

      {/* % from avg field */}
      {pct && (
        editMode === 'mult' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
              onBlur={commit} onKeyDown={keyDown} style={{ ...inputBase, width: 44 }} />
            <span style={{ fontFamily: mono, fontSize: 14, fontWeight: 800, color: multColor }}>%</span>
          </div>
        ) : (
          <span title="% from avg cost · click to edit" onClick={startMult}
            style={{ fontFamily: mono, fontSize: 14, fontWeight: 800, color: multColor,
              borderBottom: `1px dashed ${multColor}40`, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {+pct >= 0 ? '+' : ''}{pct}%
          </span>
        )
      )}
    </div>
  );
};

// ── main component (self-contained, fetches its own data) ────────────────────

const PriceTargetsCard: React.FC = () => {
  const { latestPortfolio } = useCache();
  const [userTargets, setUserTargets] = useState<Record<string, number>>(loadTargets);
  const scrollRef    = useRef<HTMLDivElement>(null);
  const [hasMoreBelow, setHasMoreBelow] = useState(true);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setHasMoreBelow(el.scrollHeight - el.scrollTop > el.clientHeight + 2);
  }, []);

  useEffect(() => {
    const handler = () => setUserTargets(loadTargets());
    window.addEventListener('investment-dashboard:framework-wrote-targets', handler);
    return () => window.removeEventListener('investment-dashboard:framework-wrote-targets', handler);
  }, []);

  const onSetTarget = useCallback((sym: string, val: number) => {
    setUserTargets(prev => {
      const n = { ...prev, [sym]: val };
      persistTargets(n);

      const frameworkOvs = loadFrameworkOverrides();
      const symOv = frameworkOvs[sym];
      if (symOv?.verdict === 'sell') {
        const holdings: any[] = (latestPortfolio?.holdings as any[]) ?? [];
        const holding = holdings.find((h: any) => h.symbol === sym);
        const avgCost = holding?.averagePrice ?? (
          holding ? (holding.totalAmountInvested ?? holding.totalInvested ?? 0) / Math.max(holding.quantity ?? 1, 1e-9) : 0
        );
        if (avgCost > 0) {
          const pnlPct = parseFloat(((val - avgCost) / avgCost * 100).toFixed(1));
          const updatedOv = { ...symOv, exitCondition: { ...(symOv.exitCondition ?? {}), type: 'pnl', pnlPct, breakeven: false } };
          localStorage.setItem(FRAMEWORK_KEY, JSON.stringify({ ...frameworkOvs, [sym]: updatedOv }));
          window.dispatchEvent(new CustomEvent('investment-dashboard:targets-wrote-framework'));
        }
      }

      return n;
    });
  }, [latestPortfolio]);

  const onClearTarget = useCallback((sym: string) => {
    setUserTargets(prev => {
      const rest = { ...prev };
      delete rest[sym];
      persistTargets(rest);

      const frameworkOvs = loadFrameworkOverrides();
      const symOv = frameworkOvs[sym];
      if (symOv?.verdict === 'sell' && symOv?.exitCondition?.type === 'pnl') {
        const restOv = { ...symOv };
        delete restOv.exitCondition;
        localStorage.setItem(FRAMEWORK_KEY, JSON.stringify({ ...frameworkOvs, [sym]: restOv }));
        window.dispatchEvent(new CustomEvent('investment-dashboard:targets-wrote-framework'));
      }

      return rest;
    });
  }, []);

  const activeHoldings = useMemo(() => {
    const h = (latestPortfolio?.holdings as any[]) ?? [];
    return h.filter(x => (x.quantity ?? 0) > 1e-6).sort((a, b) => (b.currentValue ?? 0) - (a.currentValue ?? 0));
  }, [latestPortfolio]);

  const allSymbols = useMemo(() => activeHoldings.map(h => h.symbol), [activeHoldings]);

  const finnhubSymbols = useMemo(() =>
    activeHoldings
      .filter(h => h.type === 's' && !h.symbol.match(/\.(TO|V|CN)$/i))
      .slice(0, 15)
      .map(h => h.symbol),
    [activeHoldings]
  );

  const cadPriceMap = useMemo<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    activeHoldings.forEach(h => {
      if ((h.currentValue ?? 0) > 0 && (h.quantity ?? 0) > 1e-9)
        m[h.symbol] = h.currentValue / h.quantity;
    });
    return m;
  }, [activeHoldings]);

  const avgCostMap = useMemo<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    activeHoldings.forEach(h => {
      const avg = h.averagePrice ?? ((h.totalAmountInvested ?? h.totalInvested ?? 0) / Math.max(h.quantity ?? 1, 1e-9));
      if (avg > 0) m[h.symbol] = avg;
    });
    return m;
  }, [activeHoldings]);

  const allocPctMap = useMemo<Record<string, number>>(() => {
    const totalCV = activeHoldings.reduce((s, h) => s + (h.currentValue ?? 0), 0);
    if (totalCV === 0) return {};
    const m: Record<string, number> = {};
    activeHoldings.forEach(h => { m[h.symbol] = ((h.currentValue ?? 0) / totalCV) * 100; });
    return m;
  }, [activeHoldings]);

  const { data: analystData } = useQuery(
    ['targets-analyst', finnhubSymbols.join(',')],
    () => axios.post('/api/analyst/price-targets/batch', { symbols: finnhubSymbols }).then(r => r.data),
    { enabled: finnhubSymbols.length > 0, staleTime: 60 * 60_000, cacheTime: 24 * 60 * 60_000, retry: 1 }
  );

  const rows = useMemo<TargetRow[]>(() => {
    const targets = analystData?.targets ?? {};
    const result: TargetRow[] = [];

    for (const sym of allSymbols) {
      const cadPrice = cadPriceMap[sym];
      const avgCost  = avgCostMap[sym];
      if (!cadPrice || cadPrice <= 0) continue;

      let targetCAD: number, source: TargetSource, analystCount: number | null = null;

      if (userTargets[sym] != null) {
        targetCAD = userTargets[sym];
        source    = 'custom';
      } else if (targets[sym]?.targetMean != null) {
        const t  = targets[sym];
        targetCAD    = +t.targetMean * FALLBACK_RATE;
        analystCount = t.analystCount ?? null;
        source       = 'analyst';
      } else if (avgCost && avgCost > 0) {
        targetCAD = avgCost * 1.5;
        source    = 'fallback';
      } else {
        continue;
      }

      const upside   = ((targetCAD - cadPrice) / cadPrice) * 100;
      const allocPct = allocPctMap[sym] ?? 0;

      result.push({ sym, cadCurrentPrice: cadPrice, targetCAD, upside, source, analystCount, avgCostCAD: avgCost ?? 0, allocPct });
    }

    return result.sort((a, b) => a.upside - b.upside);
  }, [allSymbols, analystData, cadPriceMap, avgCostMap, allocPctMap, userTargets]);

  // Re-evaluate arrow visibility when rows change (col2 may grow/shrink)
  useEffect(() => { onScroll(); }, [rows.length, onScroll]);

  const counts = useMemo(() => ({
    custom:   rows.filter(r => r.source === 'custom').length,
    analyst:  rows.filter(r => r.source === 'analyst').length,
    fallback: rows.filter(r => r.source === 'fallback').length,
  }), [rows]);

  // Fixed target-line position shared across all rows:
  // if any asset is above its target (negative upside), park the line at 75%
  // so over-target dots visibly overflow to the right.
  // Otherwise put it at the far right (98%) — everyone is still below target.
  const targetLinePos = rows.some(r => r.upside < 0) ? 75 : 98;

  const colHeaders = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0 7px', borderBottom: `1px solid #2a3445`, marginBottom: 2 }}>
      <div style={{ fontFamily: mono, fontSize: 9, fontWeight: 600, color: C.dim, letterSpacing: '0.1em', width: 72, flexShrink: 0 }}>TICKER</div>
      <div style={{ fontFamily: mono, fontSize: 9, fontWeight: 600, color: C.dim, letterSpacing: '0.1em', width: 160, flexShrink: 0, textAlign: 'right' }}>AVG → NOW</div>
      <div style={{ fontFamily: mono, fontSize: 9, fontWeight: 600, color: C.dim, letterSpacing: '0.1em', flex: 1, textAlign: 'center', padding: '0 14px 0 28px' }}>RANGE</div>
      <div style={{ fontFamily: mono, fontSize: 9, fontWeight: 600, color: C.dim, letterSpacing: '0.1em', width: 52, flexShrink: 0, textAlign: 'right' }}>UPSIDE</div>
      <div style={{ fontFamily: mono, fontSize: 9, fontWeight: 600, color: C.dim, letterSpacing: '0.1em', width: 150, flexShrink: 0, textAlign: 'right' }}>TARGET · %AVG ✎</div>
      <div style={{ fontFamily: mono, fontSize: 9, fontWeight: 600, color: C.dim, letterSpacing: '0.1em', width: 44, flexShrink: 0, textAlign: 'right' }}>ALLOC</div>
    </div>
  );

  const renderRow = (row: TargetRow) => {
    const tc = MULT_COLOR[row.source];
    // left edge = avg cost, targetLinePos = target price
    // dot travels from 0 (at avg) to targetLinePos (at target) or beyond
    const dotPct = (() => {
      if (row.cadCurrentPrice < row.avgCostCAD || row.targetCAD <= row.avgCostCAD) return 2;
      return clamp(
        ((row.cadCurrentPrice - row.avgCostCAD) / (row.targetCAD - row.avgCostCAD)) * targetLinePos,
        2, 98
      );
    })();
    return (
      <div key={row.sym} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderBottom: `1px solid rgba(30,37,53,0.5)` }}>
        <div style={{ fontFamily: mono, fontSize: 13, fontWeight: 800, color: C.text, width: 72, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {row.sym}
        </div>
        <div style={{ width: 160, flexShrink: 0, fontFamily: mono, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.sub }}>
            {row.avgCostCAD > 0 ? `C$${row.avgCostCAD.toFixed(2)}` : '—'}
          </span>
          <span style={{ fontSize: 11, color: C.dim }}>→</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: C.accent }}>
            {row.cadCurrentPrice > 0 ? `C$${row.cadCurrentPrice.toFixed(2)}` : '—'}
          </span>
          {row.avgCostCAD > 0 && row.cadCurrentPrice > 0 && (
            <span style={{ fontSize: 13, lineHeight: 1, color: row.cadCurrentPrice >= row.avgCostCAD ? C.up : C.down }}>
              {row.cadCurrentPrice >= row.avgCostCAD ? '▲' : '▼'}
            </span>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0, padding: '0 14px 0 28px' }}>
        <svg width="100%" height="18" style={{ display: 'block' }}>
          <rect x="0" y="8" width="100%" height="2" fill={C.border} rx="1" />
          <rect x="0" y="8" width={`${dotPct}%`} height="2" fill="rgba(79,143,255,0.65)" rx="1" />
          <rect x={`${targetLinePos}%`} y="4" width="2" height="10" fill={tc} rx="1" transform="translate(-1,0)" />
          <circle cx={`${dotPct}%`} cy="9" r="5" fill={C.accent} stroke={C.card} strokeWidth="2" />
        </svg>
        </div>
        <div style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, color: row.upside >= 0 ? C.up : C.down, width: 52, flexShrink: 0, textAlign: 'right' }}>
          {row.upside > 1000 ? '>1000%' : `${row.upside >= 0 ? '+' : ''}${row.upside.toFixed(1)}%`}
        </div>
        <TargetCell row={row} onSetTarget={onSetTarget} onClearTarget={onClearTarget} />
        <div style={{ fontFamily: mono, fontSize: 10, color: C.sub, width: 44, flexShrink: 0, textAlign: 'right' }}>
          {row.allocPct > 0 ? `${row.allocPct.toFixed(1)}%` : '—'}
        </div>
      </div>
    );
  };

  const col1 = rows.slice(0, 15);
  const col2 = rows.slice(15);

  return (
    <Card>
      <CardTitle badge={
        <span style={{ display: 'flex', gap: 5 }}>
          {counts.analyst  > 0 && <MicroPill color={C.a2}    bg="rgba(79,143,255,0.10)"  border="rgba(79,143,255,0.25)">{counts.analyst} ANALYST</MicroPill>}
          {counts.custom   > 0 && <MicroPill color={C.accent} bg="rgba(0,212,170,0.10)"   border="rgba(0,212,170,0.25)">{counts.custom} CUSTOM</MicroPill>}
          {counts.fallback > 0 && <MicroPill color={C.warn}   bg="rgba(245,158,11,0.10)"  border="rgba(245,158,11,0.25)">{counts.fallback} EST</MicroPill>}
        </span>
      }>
        Price Targets &amp; Upside
      </CardTitle>

      {rows.length === 0 ? (
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[1,2,3,4,5,6,7,8].map(i => <Skel key={i} height={28} />)}
          </div>
          <div style={{ width: 1, background: C.border, flexShrink: 0 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[1,2,3,4,5,6,7,8].map(i => <Skel key={i} height={28} />)}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 16 }}>
          {/* Left column — first 15 rows, fixed */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {colHeaders}
            <div>{col1.map(renderRow)}</div>
          </div>

          <div style={{ width: 1, background: C.border, flexShrink: 0, alignSelf: 'stretch' }} />

          {/* Right column — remaining rows, scrollable */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {colHeaders}
            <div style={{ position: 'relative' }}>
              <div
                ref={scrollRef}
                onScroll={onScroll}
                style={{ maxHeight: 480, overflowY: col2.length > 0 ? 'auto' : 'hidden' }}
              >
                {col2.length > 0 ? col2.map(renderRow) : (
                  <div style={{ fontFamily: mono, fontSize: 10, color: C.dim, padding: '16px 0', textAlign: 'center' }}>— fewer than 16 holdings —</div>
                )}
              </div>
              {/* Scroll-more arrow — fades out when at bottom */}
              {col2.length > 0 && (
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  height: 28,
                  background: `linear-gradient(to bottom, transparent, ${C.card})`,
                  display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 2,
                  pointerEvents: 'none',
                  opacity: hasMoreBelow ? 1 : 0,
                  transition: 'opacity 0.2s',
                }}>
                  <span style={{ fontFamily: mono, fontSize: 20, color: C.sub, lineHeight: 1 }}>⌄</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

export default PriceTargetsCard;
