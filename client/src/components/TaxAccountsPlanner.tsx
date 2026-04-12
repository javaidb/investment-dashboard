import React, { useState, useMemo, useEffect } from 'react';
import {
  ComposedChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_YEAR = 2015;

const PRESET_FUNDS = [
  { symbol: 'BNS397', name: 'NASDAQ Index Fund' },
  { symbol: 'BNS381', name: 'Canadian Equity Index Fund' },
  { symbol: 'BNS387', name: 'International Equity Index Fund' },
  { symbol: 'BNS362', name: 'Scotia Resource Fund' },
  { symbol: 'SPY',    name: 'S&P 500 ETF' },
  { symbol: 'VTI',    name: 'US Total Market' },
  { symbol: 'XBB.TO', name: 'Canadian Bond Index' },
  { symbol: 'VAB.TO', name: 'Canadian Aggregate Bond' },
  { symbol: 'ZSP.TO', name: 'S&P 500 (CAD-hedged)' },
];

const FUND_COLORS: Record<string, string> = {
  'BNS397': '#818cf8',
  'BNS381': '#f59e0b',
  'BNS387': '#34d399',
  'BNS362': '#e879f9',
  'SPY':    '#f87171',
  'VTI':    '#60a5fa',
  'XBB.TO': '#a78bfa',
  'VAB.TO': '#fb923c',
  'ZSP.TO': '#22d3ee',
};
const COLOR_POOL = ['#818cf8','#f59e0b','#34d399','#f87171','#60a5fa','#a78bfa','#fb923c','#22d3ee','#e879f9'];
const fundColor = (symbol: string, index: number) => FUND_COLORS[symbol] ?? COLOR_POOL[index % COLOR_POOL.length];

// ─── Types ────────────────────────────────────────────────────────────────────

type AccountType = 'tfsa' | 'rrsp' | 'fhsa';
type Frequency = 'weekly' | 'biweekly' | 'monthly';

interface FundAllocation { symbol: string; percentage: number; oneTimeAmount?: number; }

interface AccountSegment {
  id: string;
  startDate: string;
  untilDate: string;
  amount: number;
  frequency: Frequency;
  dayOfWeek?: string;
  allocations: FundAllocation[];
}

interface TaxAccount {
  type: AccountType;
  label: string;
  color: string;
  segments: AccountSegment[];
}

interface DraftAllocation { symbol: string; percentage: string; oneTimeAmount: string; }
interface DraftSegment {
  startDate: string;
  untilDate: string;
  amount: string;
  frequency: Frequency;
  dayOfWeek: string;
  allocations: DraftAllocation[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dateStrToWI(dateStr: string): number {
  if (!dateStr) return 999999;
  const date = new Date(dateStr + 'T12:00:00');
  const year = date.getFullYear();
  const soy = new Date(year, 0, 1);
  const doy = Math.floor((date.getTime() - soy.getTime()) / 86400000);
  return (year - BASE_YEAR) * 52 + Math.min(Math.floor(doy / 7), 51);
}

function wiToDate(wi: number): Date {
  const year = BASE_YEAR + Math.floor(wi / 52);
  const week = wi % 52;
  return new Date(year, 0, 1 + week * 7);
}

function currentWI(): number {
  const now = new Date();
  const soy = new Date(now.getFullYear(), 0, 1);
  const doy = Math.floor((now.getTime() - soy.getTime()) / 86400000);
  return (now.getFullYear() - BASE_YEAR) * 52 + Math.min(Math.floor(doy / 7), 51);
}

function computeContribs(segments: AccountSegment[], wi: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const seg of segments) {
    const startWI = dateStrToWI(seg.startDate);
    if (wi < startWI) continue;
    const untilWI = dateStrToWI(seg.untilDate);
    const effectiveEnd = Math.min(wi, untilWI);
    let recurring = 0;
    if (startWI <= effectiveEnd) {
      if (seg.frequency === 'weekly') {
        recurring = (effectiveEnd - startWI + 1) * seg.amount;
      } else if (seg.frequency === 'biweekly') {
        recurring = (Math.floor((effectiveEnd - startWI) / 2) + 1) * seg.amount;
      } else {
        const sd = wiToDate(startWI);
        const ed = wiToDate(effectiveEnd);
        const months = (ed.getFullYear() - sd.getFullYear()) * 12 + ed.getMonth() - sd.getMonth() + 1;
        recurring = Math.max(0, months) * seg.amount;
      }
    }
    for (const alloc of seg.allocations) {
      const fundRecurring = recurring * (alloc.percentage / 100);
      const fundOneTime   = alloc.oneTimeAmount ?? 0;
      out[alloc.symbol] = (out[alloc.symbol] ?? 0) + fundRecurring + fundOneTime;
    }
  }
  return out;
}

function buildChartData(segments: AccountSegment[]) {
  if (!segments.length) return { points: [], funds: [] };
  const startWIs = segments.map(s => dateStrToWI(s.startDate));
  const endWIs   = segments.map(s => dateStrToWI(s.untilDate));
  const minWI    = Math.min(...startWIs);
  const maxWI    = Math.max(...endWIs, minWI + 52);
  const fundSet  = new Set<string>();
  segments.forEach(s => s.allocations.forEach(a => fundSet.add(a.symbol)));
  const funds = Array.from(fundSet);
  const points: any[] = [];
  for (let wi = minWI; wi <= maxWI; wi++) {
    const c = computeContribs(segments, wi);
    const d = wiToDate(wi);
    const pt: any = { wi, year: d.getFullYear() };
    for (const sym of funds) pt[sym] = Math.round(c[sym] ?? 0);
    points.push(pt);
  }
  return { points, funds };
}

// ─── Storage & defaults ───────────────────────────────────────────────────────

const STORAGE_KEY = 'tax-accounts-planner-v1';

const DEFAULT_ACCOUNTS: TaxAccount[] = [
  {
    type: 'tfsa', label: 'TFSA', color: '#34d399',
    segments: [{
      id: 'default-tfsa-1',
      startDate: '2025-09-17', untilDate: '2026-12-31',
      amount: 600, frequency: 'weekly',
      allocations: [
        { symbol: 'BNS397', percentage: 66.7, oneTimeAmount: 14750 },
        { symbol: 'BNS381', percentage: 29.2, oneTimeAmount: 4750  },
        { symbol: 'BNS387', percentage: 4.1,  oneTimeAmount: 500   },
      ],
    }],
  },
  { type: 'fhsa', label: 'FHSA', color: '#f59e0b', segments: [] },
  { type: 'rrsp', label: 'RRSP', color: '#60a5fa', segments: [] },
];

// Migrate old ETF symbols to BNS fund codes
const SYMBOL_MIGRATION: Record<string, string> = {
  'QQQ':    'BNS397',
  'XIU.TO': 'BNS381',
  'XEF.TO': 'BNS387',
};

function migrateSymbols(accounts: TaxAccount[]): TaxAccount[] {
  return accounts.map(acc => ({
    ...acc,
    segments: acc.segments.map(seg => ({
      ...seg,
      allocations: seg.allocations.map(a => ({
        ...a,
        symbol: SYMBOL_MIGRATION[a.symbol] ?? a.symbol,
      })),
    })),
  }));
}

function loadAccounts(): TaxAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ACCOUNTS;
    const parsed: TaxAccount[] = JSON.parse(raw);
    const loaded = (['tfsa', 'fhsa', 'rrsp'] as AccountType[]).map(type => {
      const saved = parsed.find(a => a.type === type);
      const def   = DEFAULT_ACCOUNTS.find(a => a.type === type)!;
      const acc   = saved ? { ...def, ...saved } : def;
      return { ...acc, segments: acc.segments.slice().sort((a, b) => a.startDate.localeCompare(b.startDate)) };
    });
    return migrateSymbols(loaded);
  } catch { return DEFAULT_ACCOUNTS; }
}

function nextMonday(): string {
  const d = new Date();
  const day = d.getDay(); // 0=Sun, 1=Mon, ...
  const daysUntilMonday = day === 1 ? 7 : (8 - day) % 7;
  d.setDate(d.getDate() + daysUntilMonday);
  return d.toISOString().slice(0, 10);
}

const emptyDraft = (): DraftSegment => ({
  startDate: nextMonday(), untilDate: '2026-12-31',
  amount: '', frequency: 'weekly', dayOfWeek: 'Monday',
  allocations: [{ symbol: 'QQQ', percentage: '100', oneTimeAmount: '' }],
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const fmt = (v: number) => '$' + Math.round(v).toLocaleString('en-US');

const inp: React.CSSProperties = {
  background: '#0f172a', border: '1px solid #475569', borderRadius: '6px',
  color: '#f1f5f9', padding: '6px 10px', fontSize: '0.875rem', outline: 'none',
};
const sel: React.CSSProperties = { ...inp, cursor: 'pointer' };

// ─── AccountColumn sub-component ─────────────────────────────────────────────

interface AccountColumnProps {
  acc: TaxAccount;
  total: number;
  formOpen: boolean;
  onAddSegment: () => void;
  onEditSegment: (seg: AccountSegment) => void;
  onDeleteSegment: (id: string) => void;
}

const AccountColumn: React.FC<AccountColumnProps> = ({ acc, total, formOpen, onAddSegment, onEditSegment, onDeleteSegment }) => {
  const { points, funds } = useMemo(() => buildChartData(acc.segments), [acc.segments]);

  const xTicks = useMemo(() =>
    points.filter((p, i, arr) => i === arr.findIndex(q => q.year === p.year)).map(p => p.wi),
    [points],
  );

  return (
    <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0' }}>

      {/* Account header */}
      <div style={{
        background: '#1e293b', border: `1.5px solid ${acc.color}30`,
        borderRadius: '10px', padding: '14px 16px', marginBottom: '12px',
      }}>
        <div style={{ fontSize: '0.7rem', color: acc.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
          {acc.label}
        </div>
        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f1f5f9' }}>{fmt(total)}</div>
        <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
          {acc.segments.length} segment{acc.segments.length !== 1 ? 's' : ''} · to date
        </div>
      </div>

      {/* Segments */}
      <div style={{ flex: 1 }}>
        {acc.segments.length === 0 && !formOpen && (
          <p style={{ color: '#334155', fontSize: '0.8rem', margin: '0 0 10px', fontStyle: 'italic' }}>No segments yet</p>
        )}

        {acc.segments.map((seg) => (
          <div key={seg.id} style={{
            background: '#1e293b', border: '1px solid #1e293b',
            borderRadius: '8px', padding: '10px 12px', marginBottom: '6px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: '4px' }}>
                  {seg.startDate} → {seg.untilDate}
                </div>
                <div style={{ fontSize: '0.82rem', color: acc.color, fontWeight: 600, marginBottom: '4px' }}>
                  {fmt(seg.amount)}/{seg.frequency === 'weekly' ? 'wk' : seg.frequency === 'biweekly' ? '2wk' : 'mo'}
                  {seg.dayOfWeek && seg.frequency !== 'monthly' && <span style={{ color: '#64748b', fontWeight: 400 }}> · {seg.dayOfWeek}s</span>}
                </div>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {seg.allocations.map((a, ai) => (
                    <span key={a.symbol} style={{
                      background: `${fundColor(a.symbol, ai)}18`,
                      border: `1px solid ${fundColor(a.symbol, ai)}40`,
                      borderRadius: '10px', padding: '1px 7px',
                      fontSize: '0.68rem', color: fundColor(a.symbol, ai),
                    }}>
                      {a.symbol} {a.percentage}%{a.oneTimeAmount ? ` +${fmt(a.oneTimeAmount)}` : ''}
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0 }}>
                <button onClick={() => onEditSegment(seg)}
                  style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: '0.75rem', padding: '2px 4px' }}>
                  Edit
                </button>
                <button onClick={() => onDeleteSegment(seg.id)}
                  style={{ background: 'none', border: 'none', color: '#334155', cursor: 'pointer', fontSize: '0.9rem', padding: '2px 4px' }}>
                  ×
                </button>
              </div>
            </div>
          </div>
        ))}

        {!formOpen && (
          <button onClick={onAddSegment} style={{
            background: 'transparent', border: '1px dashed #334155', borderRadius: '8px',
            color: '#475569', cursor: 'pointer', fontSize: '0.8rem', padding: '6px 14px',
            width: '100%', marginBottom: '14px',
          }}>
            + Add Segment
          </button>
        )}
      </div>

      {/* Chart */}
      {points.length > 0 ? (
        <div>
          <div style={{ fontSize: '0.7rem', color: '#475569', marginBottom: '6px' }}>
            Cumulative contributions by fund
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={points} margin={{ top: 2, right: 8, left: 0, bottom: 0 }}>
              <defs>
                {funds.map((sym, fi) => (
                  <linearGradient key={sym} id={`g-${acc.type}-${sym.replace(/\./g, '-')}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={fundColor(sym, fi)} stopOpacity={0.55} />
                    <stop offset="95%" stopColor={fundColor(sym, fi)} stopOpacity={0.06} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="wi" ticks={xTicks}
                tickFormatter={wi => String(wiToDate(wi).getFullYear())}
                tick={{ fill: '#64748b', fontSize: 10 }} axisLine={{ stroke: '#1e293b' }} tickLine={false} interval={0} />
              <YAxis tickFormatter={v => '$' + (v >= 1000 ? `${Math.round(v / 1000)}k` : v)}
                tick={{ fill: '#64748b', fontSize: 10 }} axisLine={{ stroke: '#1e293b' }} tickLine={false} width={48} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9', fontSize: '0.8rem' }}
                formatter={(value: number, name: string) => [fmt(value), name]}
                labelFormatter={(wi: number) => { const d = wiToDate(wi); return `${d.getFullYear()} W${(wi % 52) + 1}`; }}
              />
              <Legend wrapperStyle={{ paddingTop: '8px', fontSize: '0.75rem', color: '#94a3b8' }} />
              {funds.map((sym, fi) => (
                <Area key={sym} name={sym} type="monotone" dataKey={sym}
                  stackId="stack"
                  stroke={fundColor(sym, fi)}
                  fill={`url(#g-${acc.type}-${sym.replace(/\./g, '-')})`}
                  strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div style={{
          height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#0a111e', borderRadius: '8px', border: '1px dashed #1e293b',
        }}>
          <span style={{ color: '#334155', fontSize: '0.8rem' }}>Add a segment to see chart</span>
        </div>
      )}
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const TaxAccountsPlanner: React.FC = () => {
  const [accounts, setAccounts]       = useState<TaxAccount[]>(loadAccounts);
  const [formAccount, setFormAccount] = useState<AccountType | null>(null);
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [draft, setDraft]             = useState<DraftSegment>(emptyDraft());

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
    window.dispatchEvent(new CustomEvent('tax-accounts-updated'));

    // Sync fund allocations to recurring-investments.json
    const plannerData: Record<string, any[]> = {};
    for (const acc of accounts) plannerData[acc.type] = acc.segments;
    fetch('/api/recurring-investments/sync-from-planner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(plannerData),
    }).then(() => {
      window.dispatchEvent(new CustomEvent('recurring-investments-synced'));
    }).catch(err => console.warn('Failed to sync recurring investments:', err));
  }, [accounts]);

  const TODAY_WI = currentWI();

  const accountTotals = useMemo(() =>
    Object.fromEntries(
      accounts.map(a => [a.type, Object.values(computeContribs(a.segments, TODAY_WI)).reduce((s, v) => s + v, 0)])
    ) as Record<AccountType, number>,
    [accounts, TODAY_WI],
  );

  // ── Form handlers ─────────────────────────────────────────────────────────

  const openAdd = (type: AccountType) => {
    setDraft(emptyDraft());
    setEditingId(null);
    setFormAccount(type);
  };

  const openEdit = (type: AccountType, seg: AccountSegment) => {
    setDraft({
      startDate: seg.startDate, untilDate: seg.untilDate,
      amount: String(seg.amount), frequency: seg.frequency, dayOfWeek: seg.dayOfWeek ?? 'Monday',
      allocations: seg.allocations.map(a => ({ symbol: a.symbol, percentage: String(a.percentage), oneTimeAmount: a.oneTimeAmount ? String(a.oneTimeAmount) : '' })),
    });
    setEditingId(seg.id);
    setFormAccount(type);
  };

  const cancelForm = () => { setFormAccount(null); setEditingId(null); setDraft(emptyDraft()); };

  const saveSeg = () => {
    if (!formAccount || !draft.startDate || draft.amount === '') return;
    const amt = parseFloat(draft.amount);
    if (isNaN(amt)) return;
    const seg: AccountSegment = {
      id: editingId ?? Date.now().toString(),
      startDate: draft.startDate,
      untilDate: draft.untilDate,
      amount: amt,
      frequency: draft.frequency,
      ...(['weekly', 'biweekly'].includes(draft.frequency) ? { dayOfWeek: draft.dayOfWeek } : {}),
      allocations: draft.allocations
        .filter(a => a.symbol && a.percentage !== '')
        .map(a => ({ symbol: a.symbol, percentage: parseFloat(a.percentage) || 0, ...(a.oneTimeAmount ? { oneTimeAmount: parseFloat(a.oneTimeAmount) } : {}) })),
    };
    setAccounts(prev => prev.map(acc => {
      if (acc.type !== formAccount) return acc;
      const segs = editingId
        ? acc.segments.map(s => s.id === editingId ? seg : s)
        : [...acc.segments, seg];
      return { ...acc, segments: segs.slice().sort((a, b) => a.startDate.localeCompare(b.startDate)) };
    }));
    cancelForm();
  };

  const deleteSeg = (type: AccountType, id: string) =>
    setAccounts(prev => prev.map(acc =>
      acc.type === type ? { ...acc, segments: acc.segments.filter(s => s.id !== id) } : acc,
    ));

  const updateAlloc = (i: number, field: keyof DraftAllocation, val: string) =>
    setDraft(d => { const a = [...d.allocations]; a[i] = { ...a[i], [field]: val }; return { ...d, allocations: a }; });

  const addAlloc    = () => setDraft(d => ({ ...d, allocations: [...d.allocations, { symbol: '', percentage: '', oneTimeAmount: '' }] }));
  const removeAlloc = (i: number) => setDraft(d => ({ ...d, allocations: d.allocations.filter((_, idx) => idx !== i) }));

  const allocTotal    = draft.allocations.reduce((s, a) => s + (parseFloat(a.percentage) || 0), 0);
  const formAccObj    = accounts.find(a => a.type === formAccount);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ background: '#0f172a', borderRadius: '12px', padding: '28px 32px 24px', boxShadow: '0 4px 24px rgba(0,0,0,0.4)', marginBottom: '28px' }}>

      {/* Header */}
      <div style={{ marginBottom: '22px' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#f1f5f9' }}>Registered Account Contributions</h2>
        <p style={{ margin: '4px 0 0', fontSize: '0.875rem', color: '#64748b' }}>
          Projected contribution growth by fund — TFSA · RRSP · FHSA
        </p>
      </div>

      {/* Three columns side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', alignItems: 'start' }}>
        {accounts.map(acc => (
          <AccountColumn
            key={acc.type}
            acc={acc}
            total={accountTotals[acc.type]}
            formOpen={formAccount === acc.type}
            onAddSegment={() => openAdd(acc.type)}
            onEditSegment={seg => openEdit(acc.type, seg)}
            onDeleteSegment={id => deleteSeg(acc.type, id)}
          />
        ))}
      </div>

      {/* Full-width segment form */}
      {formAccount && formAccObj && (
        <div style={{ background: '#1e293b', border: `1px solid ${formAccObj.color}40`, borderRadius: '10px', padding: '20px', marginTop: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span style={{ fontWeight: 600, color: '#f1f5f9', fontSize: '0.95rem' }}>
              <span style={{ color: formAccObj.color }}>{formAccObj.label}</span>
              {' '}— {editingId ? 'Edit Segment' : 'New Segment'}
            </span>
            <button onClick={cancelForm} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1.2rem' }}>×</button>
          </div>

          {/* Date range + recurring + one-time */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
            <label style={{ fontSize: '0.75rem', color: '#64748b' }}>From</label>
            <input type="date" style={{ ...inp, width: '148px', colorScheme: 'dark' } as React.CSSProperties}
              value={draft.startDate} onChange={e => setDraft(d => ({ ...d, startDate: e.target.value }))} />
            <label style={{ fontSize: '0.75rem', color: '#64748b' }}>to</label>
            <input type="date" style={{ ...inp, width: '148px', colorScheme: 'dark' } as React.CSSProperties}
              value={draft.untilDate} onChange={e => setDraft(d => ({ ...d, untilDate: e.target.value }))} />
            <span style={{ color: '#475569' }}>·</span>
            <span style={{ color: '#64748b', fontSize: '0.85rem' }}>$</span>
            <input type="number" style={{ ...inp, width: '90px' }} placeholder="600" min="0"
              value={draft.amount} onChange={e => setDraft(d => ({ ...d, amount: e.target.value }))} />
            <select style={{ ...sel, width: '110px' }}
              value={draft.frequency} onChange={e => setDraft(d => ({ ...d, frequency: e.target.value as Frequency }))}>
              <option value="weekly">/ week</option>
              <option value="biweekly">/ 2 weeks</option>
              <option value="monthly">/ month</option>
            </select>
            {['weekly', 'biweekly'].includes(draft.frequency) && (
              <>
                <label style={{ fontSize: '0.75rem', color: '#64748b' }}>on</label>
                <select style={{ ...sel, width: '112px' }}
                  value={draft.dayOfWeek} onChange={e => setDraft(d => ({ ...d, dayOfWeek: e.target.value }))}>
                  {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(day => (
                    <option key={day} value={day}>{day}</option>
                  ))}
                </select>
              </>
            )}
          </div>

          {/* Fund allocations */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
              <label style={{ fontSize: '0.75rem', color: '#64748b' }}>Fund Allocations</label>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: Math.abs(allocTotal - 100) < 0.6 ? '#34d399' : '#f59e0b' }}>
                {allocTotal.toFixed(1)}% {Math.abs(allocTotal - 100) < 0.6 ? '✓' : '⚠ must total 100%'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '6px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.68rem', color: '#475569', width: '160px' }}>FUND</span>
              <span style={{ fontSize: '0.68rem', color: '#475569', width: '70px' }}>RECURRING %</span>
              <span style={{ fontSize: '0.68rem', color: '#475569', width: '100px' }}>ONE-TIME $</span>
            </div>
            {draft.allocations.map((alloc, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <input
                  style={{ ...inp, width: '160px' }}
                  list="fund-suggestions"
                  placeholder="QQQ or custom"
                  value={alloc.symbol}
                  onChange={e => updateAlloc(i, 'symbol', e.target.value.toUpperCase())}
                />
                <input type="number" style={{ ...inp, width: '60px' }} placeholder="0" min="0" max="100" step="0.1"
                  value={alloc.percentage} onChange={e => updateAlloc(i, 'percentage', e.target.value)} />
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>%</span>
                <span style={{ fontSize: '0.8rem', color: '#475569' }}>+</span>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>$</span>
                <input type="number" style={{ ...inp, width: '90px' }} placeholder="0" min="0"
                  value={alloc.oneTimeAmount} onChange={e => updateAlloc(i, 'oneTimeAmount', e.target.value)} />
                {alloc.symbol && (
                  <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: fundColor(alloc.symbol, i), flexShrink: 0 }} />
                )}
                {draft.allocations.length > 1 && (
                  <button onClick={() => removeAlloc(i)}
                    style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '1.1rem' }}>×</button>
                )}
              </div>
            ))}
            <datalist id="fund-suggestions">
              {PRESET_FUNDS.map(f => <option key={f.symbol} value={f.symbol}>{f.name}</option>)}
            </datalist>
            <button onClick={addAlloc} style={{
              background: 'none', border: '1px dashed #334155', borderRadius: '6px',
              color: '#64748b', cursor: 'pointer', fontSize: '0.8rem', padding: '4px 12px', marginTop: '2px',
            }}>+ Add fund</button>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
            <button onClick={saveSeg} style={{
              background: '#334155', border: 'none', borderRadius: '6px',
              color: '#f1f5f9', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, padding: '8px 20px',
            }}>{editingId ? 'Save Changes' : 'Add Segment'}</button>
            <button onClick={cancelForm} style={{
              background: 'none', border: '1px solid #334155', borderRadius: '6px',
              color: '#64748b', cursor: 'pointer', fontSize: '0.875rem', padding: '8px 16px',
            }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaxAccountsPlanner;
