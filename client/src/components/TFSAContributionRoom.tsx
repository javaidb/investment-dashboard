import React, { useMemo, useState, useEffect } from 'react';
import {
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';

// ─── Static TFSA room data ────────────────────────────────────────────────────
// Loaded from gitignored client/src/data/tfsa-personal.ts

import tfsaYearlyData from '../data/tfsa-personal';

// ─── Custom plan types ────────────────────────────────────────────────────────

type Frequency = 'weekly' | 'monthly';

interface ScheduleRow { amount: number; frequency: Frequency; untilDate: string; oneTimeAmount?: number; }
interface RecurringPlan {
  id: string; name: string;
  initialAmount: number; startDate: string;
  schedule: ScheduleRow[];
}

interface DraftScheduleRow { amount: string; frequency: Frequency; untilDate: string; oneTimeAmount: string; }
interface DraftPlan {
  name: string; initialAmount: string; startDate: string;
  schedule: DraftScheduleRow[];
}

const emptyDraft = (): DraftPlan => ({
  name: '', initialAmount: '', startDate: '',
  schedule: [{ amount: '', frequency: 'weekly', untilDate: '2026-12-31', oneTimeAmount: '' }],
});

// ─── TFSA Planner integration ─────────────────────────────────────────────────

interface TfsaPlannerAlloc { symbol: string; percentage: number; oneTimeAmount?: number; }
interface TfsaPlannerSegment {
  startDate: string; untilDate: string;
  amount: number; frequency: 'weekly' | 'biweekly' | 'monthly';
  allocations: TfsaPlannerAlloc[];
}

function readTfsaPlannerSegments(): TfsaPlannerSegment[] {
  try {
    const raw = localStorage.getItem('tax-accounts-planner-v1');
    if (!raw) return [];
    const accounts = JSON.parse(raw);
    const tfsa = accounts.find((a: any) => a.type === 'tfsa');
    return tfsa?.segments ?? [];
  } catch { return []; }
}

function computeTfsaPlannerTotal(segments: TfsaPlannerSegment[], wi: number): number {
  let total = 0;
  for (const seg of segments) {
    const startWI = dateStrToWeekIndex(seg.startDate);
    if (wi < startWI) continue;
    const untilWI = dateStrToWeekIndex(seg.untilDate);
    const effectiveEnd = Math.min(wi, untilWI);
    let recurring = 0;
    if (startWI <= effectiveEnd) {
      if (seg.frequency === 'weekly') {
        recurring = (effectiveEnd - startWI + 1) * seg.amount;
      } else if (seg.frequency === 'biweekly') {
        recurring = (Math.floor((effectiveEnd - startWI) / 2) + 1) * seg.amount;
      } else {
        const sd = weekIndexToApproxDate(startWI);
        const ed = weekIndexToApproxDate(effectiveEnd);
        const months = (ed.getFullYear() - sd.getFullYear()) * 12 + ed.getMonth() - sd.getMonth() + 1;
        recurring = Math.max(0, months) * seg.amount;
      }
    }
    for (const alloc of seg.allocations) {
      total += recurring * (alloc.percentage / 100) + (alloc.oneTimeAmount ?? 0);
    }
  }
  return total;
}

// Migrate plans saved with old schema (weeklyAmount → amount, add frequency)
function migratePlan(p: any): RecurringPlan {
  return {
    ...p,
    schedule: (p.schedule || []).map((r: any) => ({
      amount:        r.amount ?? r.weeklyAmount ?? 0,
      frequency:     r.frequency ?? 'weekly',
      untilDate:     r.untilDate ?? '2026-12-31',
      ...(r.oneTimeAmount ? { oneTimeAmount: r.oneTimeAmount } : {}),
    })),
  };
}

// ─── Plan computation helpers ─────────────────────────────────────────────────

function dateStrToWeekIndex(dateStr: string): number {
  if (!dateStr) return 999999;
  const date = new Date(dateStr + 'T12:00:00');
  const year = date.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / 86400000);
  return (year - 2015) * 52 + Math.min(Math.floor(dayOfYear / 7), 51);
}

function weekIndexToApproxDate(wi: number): Date {
  const year = 2015 + Math.floor(wi / 52);
  const week = wi % 52;
  return new Date(year, 0, 1 + week * 7);
}

function computePlanAtWeek(plan: RecurringPlan, wi: number): number {
  const startWI = dateStrToWeekIndex(plan.startDate);
  if (wi < startWI) return 0;
  let cumulative = plan.initialAmount;
  let currentWI = startWI + 1; // first recurring payment is the week after the initial deposit

  for (const row of plan.schedule) {
    const untilWI = dateStrToWeekIndex(row.untilDate);
    if (currentWI > wi) break; // segment hasn't started yet

    // One-time amount is added at the start of the segment
    if (row.oneTimeAmount) cumulative += row.oneTimeAmount;

    const effectiveEnd = Math.min(wi, untilWI);
    if (currentWI <= effectiveEnd) {
      if (row.frequency === 'weekly') {
        cumulative += (effectiveEnd - currentWI + 1) * row.amount;
      } else {
        // Monthly: count calendar months from segment start to effective end (inclusive)
        const sd = weekIndexToApproxDate(currentWI);
        const ed = weekIndexToApproxDate(effectiveEnd);
        const months = (ed.getFullYear() - sd.getFullYear()) * 12 + ed.getMonth() - sd.getMonth() + 1;
        cumulative += Math.max(0, months) * row.amount;
      }
    }
    currentWI = untilWI + 1;
    if (currentWI > wi) break;
  }
  return cumulative;
}

// ─── Weekly base chart data ───────────────────────────────────────────────────

const WEEKS_PER_YEAR = 52;

function currentWeekIndex(): number {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / 86400000);
  return (now.getFullYear() - 2015) * 52 + Math.min(Math.floor(dayOfYear / 7), 51);
}
const TODAY_WEEK = currentWeekIndex();

interface ChartPoint {
  weekIndex: number; year: number; week: number;
  room: number; annualLimit: number; isYearStart: boolean;
  depositedQT: number | null; depositedWS: number | null;
  recurring: number | null; planTotal: number | null;
}

function generateBaseData() {
  const data: Omit<ChartPoint, 'depositedQT' | 'depositedWS' | 'recurring' | 'planTotal'>[] = [];
  tfsaYearlyData.forEach((entry, i) => {
    for (let week = 0; week < WEEKS_PER_YEAR; week++) {
      data.push({
        weekIndex: i * WEEKS_PER_YEAR + week,
        year: entry.year, week: week + 1,
        room: entry.cumulative, annualLimit: entry.annualLimit, isYearStart: week === 0,
      });
    }
  });
  return data;
}

const baseData = generateBaseData();
const yearTicks = tfsaYearlyData.map((_, i) => i * WEEKS_PER_YEAR);

// ─── Shared styles ────────────────────────────────────────────────────────────

const fmt = (v: number) => '$' + Math.round(v).toLocaleString('en-US');

const inputStyle: React.CSSProperties = {
  background: '#0f172a', border: '1px solid #475569', borderRadius: '6px',
  color: '#f1f5f9', padding: '6px 10px', fontSize: '0.875rem', outline: 'none',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle, cursor: 'pointer', appearance: 'none' as any,
};

// ─── Tooltip ─────────────────────────────────────────────────────────────────

const CustomTooltip: React.FC<{ active?: boolean; payload?: any[] }> = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;
  const d: ChartPoint = payload[0].payload;
  const totalIn = (d.depositedQT ?? 0) + (d.depositedWS ?? 0) + (d.recurring ?? 0) + (d.planTotal ?? 0);
  return (
    <div style={{
      background: '#1e293b', border: '1px solid #334155', borderRadius: '8px',
      padding: '10px 14px', color: '#f1f5f9', fontSize: '0.875rem', lineHeight: 1.75, minWidth: '210px',
    }}>
      <div style={{ fontWeight: 700, marginBottom: '4px', color: '#e2e8f0' }}>{d.year} &mdash; Week {d.week}</div>
      <div style={{ color: '#93c5fd' }}>Room:&nbsp;<strong>{fmt(d.room)}</strong></div>
      {d.depositedQT != null && <div style={{ color: '#34d399' }}>Questrade:&nbsp;<strong>{fmt(d.depositedQT)}</strong></div>}
      {d.depositedWS != null && <div style={{ color: '#e2e8f0' }}>Wealthsimple:&nbsp;<strong>{fmt(d.depositedWS)}</strong></div>}
      {d.recurring != null && <div style={{ color: '#f87171' }}>Bank transfers:&nbsp;<strong>{fmt(d.recurring)}</strong></div>}
      {d.planTotal != null && d.planTotal > 0 && <div style={{ color: '#a78bfa' }}>Custom plans:&nbsp;<strong>{fmt(d.planTotal)}</strong></div>}
      {totalIn > 0 && (
        <>
          <div style={{ borderTop: '1px solid #334155', margin: '4px 0' }} />
          <div style={{ color: '#e2e8f0' }}>Total in:&nbsp;<strong>{fmt(totalIn)}</strong></div>
          <div style={{ color: '#f59e0b', fontSize: '0.82em' }}>Remaining:&nbsp;<strong>{fmt(d.room - totalIn)}</strong></div>
        </>
      )}
      {d.isYearStart && <div style={{ color: '#a78bfa', fontSize: '0.8em', marginTop: '2px' }}>+{fmt(d.annualLimit)} added Jan 1</div>}
    </div>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────

interface WeeklyDeposit { weekIndex: number; weeklyTotal: number; cumulative: number; }
const STORAGE_KEY = 'tfsa-custom-plans';

const TFSAContributionRoom: React.FC = () => {
  const [qtDepositsByWeek, setQtDepositsByWeek] = useState<Map<number, number>>(new Map());
  const [wsDepositsByWeek, setWsDepositsByWeek] = useState<Map<number, number>>(new Map());
  const [totalQT, setTotalQT] = useState(0);
  const [totalWS, setTotalWS] = useState(0);
  const [loadingDeposits, setLoadingDeposits] = useState(true);

  const [plans, setPlans] = useState<RecurringPlan[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]').map(migratePlan); }
    catch { return []; }
  });
  const [showForm, setShowForm]     = useState(false);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [draft, setDraft]           = useState<DraftPlan>(emptyDraft());

  const [tfsaSegments, setTfsaSegments] = useState<TfsaPlannerSegment[]>(readTfsaPlannerSegments);

  useEffect(() => {
    fetch('/api/tax/questrade-deposits')
      .then(r => r.json())
      .then((data: {
        weeklyDepositsQuestrade: WeeklyDeposit[]; totalQuestrade: number;
        weeklyDepositsWealthsimple: WeeklyDeposit[]; totalWealthsimple: number;
      }) => {
        const qtMap = new Map<number, number>();
        for (const w of data.weeklyDepositsQuestrade) qtMap.set(w.weekIndex, w.cumulative);
        setQtDepositsByWeek(qtMap);
        setTotalQT(data.totalQuestrade);

        const wsMap = new Map<number, number>();
        for (const w of data.weeklyDepositsWealthsimple) wsMap.set(w.weekIndex, w.cumulative);
        setWsDepositsByWeek(wsMap);
        setTotalWS(data.totalWealthsimple);
      })
      .catch(err => console.error('Failed to load deposit data:', err))
      .finally(() => setLoadingDeposits(false));
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
  }, [plans]);

  useEffect(() => {
    const handler = () => setTfsaSegments(readTfsaPlannerSegments());
    window.addEventListener('tax-accounts-updated', handler);
    return () => window.removeEventListener('tax-accounts-updated', handler);
  }, []);

  const chartData: ChartPoint[] = useMemo(() => {
    let lastQT = 0;
    let lastWS = 0;
    return baseData.map(pt => {
      const qt = qtDepositsByWeek.get(pt.weekIndex);
      if (qt !== undefined) lastQT = qt;
      const ws = wsDepositsByWeek.get(pt.weekIndex);
      if (ws !== undefined) lastWS = ws;
      const planTotal = plans.reduce((s, p) => s + computePlanAtWeek(p, pt.weekIndex), 0);
      const recurringTotal = computeTfsaPlannerTotal(tfsaSegments, pt.weekIndex);
      return {
        ...pt,
        depositedQT: lastQT > 0 ? lastQT : null,
        depositedWS: lastWS > 0 ? lastWS : null,
        recurring: recurringTotal > 0 ? recurringTotal : null,
        planTotal: planTotal > 0 ? planTotal : null,
      };
    });
  }, [qtDepositsByWeek, wsDepositsByWeek, plans, tfsaSegments]);

  const totalDeposited = totalQT + totalWS;
  const totalRecurring = computeTfsaPlannerTotal(tfsaSegments, TODAY_WEEK);
  const totalCustom     = plans.reduce((s, p) => s + computePlanAtWeek(p, TODAY_WEEK), 0);
  const totalContributed = totalDeposited + totalRecurring + totalCustom;
  const totalRoom       = tfsaYearlyData[tfsaYearlyData.length - 1].cumulative;

  // ── Form handlers ─────────────────────────────────────────────────────────

  const openAdd = () => { setDraft(emptyDraft()); setEditingId(null); setShowForm(true); };

  const openEdit = (plan: RecurringPlan) => {
    setDraft({
      name: plan.name,
      initialAmount: String(plan.initialAmount),
      startDate: plan.startDate,
      schedule: plan.schedule.map(r => ({ amount: String(r.amount), frequency: r.frequency, untilDate: r.untilDate, oneTimeAmount: r.oneTimeAmount ? String(r.oneTimeAmount) : '' })),
    });
    setEditingId(plan.id);
    setShowForm(true);
  };

  const cancelForm = () => { setShowForm(false); setDraft(emptyDraft()); setEditingId(null); };

  const savePlan = () => {
    const init = parseFloat(draft.initialAmount);
    if (!draft.startDate || isNaN(init)) return;
    const planData = {
      name: draft.name || (editingId ? plans.find(p => p.id === editingId)?.name ?? '' : '') || `Plan ${plans.length + 1}`,
      initialAmount: init,
      startDate: draft.startDate,
      schedule: draft.schedule
        .filter(r => r.amount !== '' && r.untilDate)
        .map(r => ({ amount: parseFloat(r.amount) || 0, frequency: r.frequency, untilDate: r.untilDate, ...(r.oneTimeAmount ? { oneTimeAmount: parseFloat(r.oneTimeAmount) } : {}) })),
    };
    if (editingId) {
      setPlans(prev => prev.map(p => p.id === editingId ? { ...planData, id: editingId } : p));
    } else {
      setPlans(prev => [...prev, { ...planData, id: Date.now().toString() }]);
    }
    cancelForm();
  };

  const deletePlan = (id: string) => setPlans(prev => prev.filter(p => p.id !== id));

  const updateRow = (i: number, field: keyof DraftScheduleRow, val: string) =>
    setDraft(d => { const s = [...d.schedule]; s[i] = { ...s[i], [field]: val }; return { ...d, schedule: s }; });

  const addRow = () =>
    setDraft(d => ({ ...d, schedule: [...d.schedule, { amount: '', frequency: 'weekly', untilDate: '2026-12-31', oneTimeAmount: '' }] }));

  const removeRow = (i: number) =>
    setDraft(d => ({ ...d, schedule: d.schedule.filter((_, idx) => idx !== i) }));


  const xTickFormatter = (wi: number) => {
    const idx = yearTicks.indexOf(wi);
    return idx !== -1 ? String(tfsaYearlyData[idx].year) : '';
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ background: '#0f172a', borderRadius: '12px', padding: '28px 32px 20px', boxShadow: '0 4px 24px rgba(0,0,0,0.4)' }}>

      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#f1f5f9' }}>TFSA Contribution Room</h2>
        <p style={{ margin: '4px 0 0', fontSize: '0.875rem', color: '#64748b' }}>
          Room vs. TFSA deposits (Questrade + Wealthsimple) + recurring plans · 52 weekly points per year
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '20px' }}>
        {[
          { label: 'Total Room (2026)',          value: fmt(totalRoom),         color: '#93c5fd' },
          { label: 'Questrade deposits',         value: loadingDeposits ? '…' : fmt(totalQT), color: '#34d399' },
          { label: 'Wealthsimple deposits',      value: loadingDeposits ? '…' : fmt(totalWS), color: '#e2e8f0' },
          { label: 'Recurring bank transfers',   value: fmt(totalRecurring),    color: '#f87171' },
          { label: 'Custom plans (to date)',     value: fmt(totalCustom),       color: '#a78bfa' },
          { label: 'Total contributed',          value: fmt(totalContributed),  color: '#cbd5e1' },
          { label: 'Remaining room',             value: fmt(totalRoom - totalContributed), color: '#f59e0b' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '10px 16px' }}>
            <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: '2px' }}>{label}</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── Custom Plans section ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Custom Plans
        </span>
        <div style={{ flex: 1, height: '1px', background: '#1e293b' }} />
      </div>

      {/* Saved plans */}
      {plans.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
          {plans.map(p => (
            <div key={p.id} style={{
              background: '#1e293b', border: '1px solid #475569', borderRadius: '20px',
              padding: '4px 10px 4px 14px', fontSize: '0.8rem', color: '#e2e8f0',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}>
              <span style={{ color: '#ffffff', fontWeight: 600 }}>●</span>
              <span style={{ fontWeight: 600 }}>{p.name}:</span>
              <span style={{ color: '#94a3b8' }}>
                {fmt(p.initialAmount)} from {p.startDate}
                {p.schedule.map(r => `${r.oneTimeAmount ? ` +${fmt(r.oneTimeAmount)} once,` : ''} ${fmt(r.amount)}/${r.frequency === 'weekly' ? 'wk' : 'mo'}→${r.untilDate}`).join(' ·')}
              </span>
              <button onClick={() => openEdit(p)}
                style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: '0.8rem', padding: '0 2px' }}>
                Edit
              </button>
              <button onClick={() => deletePlan(p.id)}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1rem', padding: '0' }}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add Plan button */}
      {!showForm && (
        <button onClick={openAdd} style={{
          background: 'transparent', border: '1px dashed #475569', borderRadius: '8px',
          color: '#94a3b8', cursor: 'pointer', fontSize: '0.85rem', padding: '8px 18px', marginBottom: '20px',
        }}>
          + Add Plan
        </button>
      )}

      {/* Plan form */}
      {showForm && (
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '20px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span style={{ fontWeight: 600, color: '#f1f5f9', fontSize: '0.95rem' }}>
              {editingId ? 'Edit Plan' : 'New Contribution Plan'}
            </span>
            <button onClick={cancelForm} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1.2rem' }}>×</button>
          </div>

          {/* Name */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: '4px' }}>Plan name (optional)</label>
            <input style={{ ...inputStyle, width: '220px' }} placeholder={`Plan ${plans.length + 1}`}
              value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
          </div>

          {/* Initial deposit */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: '4px' }}>Initial deposit</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ color: '#64748b' }}>$</span>
              <input style={{ ...inputStyle, width: '120px' }} type="number" placeholder="10000" min="0"
                value={draft.initialAmount} onChange={e => setDraft(d => ({ ...d, initialAmount: e.target.value }))} />
              <span style={{ color: '#64748b', fontSize: '0.85rem' }}>on</span>
              <input style={{ ...inputStyle, width: '150px', colorScheme: 'dark' } as React.CSSProperties} type="date"
                value={draft.startDate} onChange={e => setDraft(d => ({ ...d, startDate: e.target.value }))} />
            </div>
          </div>

          {/* Schedule rows */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: '8px' }}>Schedule</label>
            {draft.schedule.map((row, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                <span style={{ color: '#64748b', fontSize: '0.85rem' }}>$</span>
                <input style={{ ...inputStyle, width: '90px' }} type="number" placeholder="300" min="0"
                  value={row.amount} onChange={e => updateRow(i, 'amount', e.target.value)} />
                <select style={{ ...selectStyle, width: '90px' }}
                  value={row.frequency} onChange={e => updateRow(i, 'frequency', e.target.value)}>
                  <option value="weekly">/ week</option>
                  <option value="monthly">/ month</option>
                </select>
                <span style={{ color: '#64748b', fontSize: '0.85rem' }}>until</span>
                <input style={{ ...inputStyle, width: '150px', colorScheme: 'dark' } as React.CSSProperties} type="date"
                  value={row.untilDate} onChange={e => updateRow(i, 'untilDate', e.target.value)} />
                <span style={{ color: '#475569', fontSize: '0.75rem', padding: '0 2px' }}>+&nbsp;one-time</span>
                <span style={{ color: '#64748b', fontSize: '0.85rem' }}>$</span>
                <input style={{ ...inputStyle, width: '90px' }} type="number" placeholder="0" min="0"
                  value={row.oneTimeAmount} onChange={e => updateRow(i, 'oneTimeAmount', e.target.value)} />
                {draft.schedule.length > 1 && (
                  <button onClick={() => removeRow(i)}
                    style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1.1rem' }}>×</button>
                )}
              </div>
            ))}
            <button onClick={addRow} style={{
              background: 'none', border: '1px dashed #334155', borderRadius: '6px',
              color: '#64748b', cursor: 'pointer', fontSize: '0.8rem', padding: '4px 12px', marginTop: '2px',
            }}>+ Add segment</button>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
            <button onClick={savePlan} style={{
              background: '#334155', border: 'none', borderRadius: '6px',
              color: '#f1f5f9', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, padding: '8px 20px',
            }}>{editingId ? 'Save Changes' : 'Save Plan'}</button>
            <button onClick={cancelForm} style={{
              background: 'none', border: '1px solid #334155', borderRadius: '6px',
              color: '#64748b', cursor: 'pointer', fontSize: '0.875rem', padding: '8px 16px',
            }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Chart */}
      <ResponsiveContainer width="100%" height={650}>
        <ComposedChart data={chartData} margin={{ top: 24, right: 16, left: 16, bottom: 0 }}>
          <defs>
            <linearGradient id="tfsa-roomGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="tfsa-depositGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#10b981" stopOpacity={0.55} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.1}  />
            </linearGradient>
            <linearGradient id="tfsa-wsDepositGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#ffffff" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#ffffff" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="tfsa-recurringGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.6}  />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0.1}  />
            </linearGradient>
            <linearGradient id="tfsa-planGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#8b5cf6" stopOpacity={0.55} />
              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.1}  />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="weekIndex" ticks={yearTicks} tickFormatter={xTickFormatter}
            tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={{ stroke: '#334155' }} tickLine={false} interval={0} />
          <YAxis tickFormatter={fmt} domain={[0, 'auto']}
            tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={{ stroke: '#334155' }} tickLine={false} width={90} />

          <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#475569', strokeWidth: 1 }} />
          <Legend wrapperStyle={{ paddingTop: '12px', fontSize: '0.85rem', color: '#94a3b8' }} />

          <Area name="TFSA Room" type="stepAfter" dataKey="room"
            stroke="#3b82f6" fill="url(#tfsa-roomGrad)" strokeWidth={2.5}
            dot={false} activeDot={{ r: 4, fill: '#60a5fa', stroke: '#1e40af', strokeWidth: 2 }}
            isAnimationActive={false} />

          <Area name="Questrade deposits" type="monotone" dataKey="depositedQT"
            stackId="contributions" stroke="#10b981" fill="url(#tfsa-depositGrad)" strokeWidth={2}
            dot={false} activeDot={{ r: 4, fill: '#34d399', stroke: '#065f46', strokeWidth: 2 }}
            connectNulls={false} isAnimationActive={false} />

          <Area name="Wealthsimple deposits" type="monotone" dataKey="depositedWS"
            stackId="contributions" stroke="#ffffff" fill="url(#tfsa-wsDepositGrad)" strokeWidth={2}
            dot={false} activeDot={{ r: 4, fill: '#ffffff', stroke: '#94a3b8', strokeWidth: 2 }}
            connectNulls={false} isAnimationActive={false} />

          <Area name="Recurring bank transfers" type="monotone" dataKey="recurring"
            stackId="contributions" stroke="#ef4444" fill="url(#tfsa-recurringGrad)" strokeWidth={2}
            dot={false} activeDot={{ r: 4, fill: '#f87171', stroke: '#7f1d1d', strokeWidth: 2 }}
            connectNulls={false} isAnimationActive={false} />

          <Area name="Custom plans" type="monotone" dataKey="planTotal"
            stackId="contributions" stroke="#8b5cf6" fill="url(#tfsa-planGrad)" strokeWidth={2}
            dot={false} activeDot={{ r: 4, fill: '#a78bfa', stroke: '#4c1d95', strokeWidth: 2 }}
            connectNulls={false} isAnimationActive={false} />

          <ReferenceLine x={TODAY_WEEK} stroke="#a855f7" strokeWidth={2} strokeDasharray="4 3"
            label={{ value: 'Today', position: 'top', fill: '#a855f7', fontSize: 11 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export default TFSAContributionRoom;
