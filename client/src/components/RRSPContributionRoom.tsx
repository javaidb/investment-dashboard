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

import rrspYearlyData from '../data/rrsp-personal';

// ─── Week index helpers (mirrors TFSAContributionRoom) ────────────────────────

const WEEKS_PER_YEAR = 52;
const BASE_YEAR = 2015;

function dateStrToWeekIndex(dateStr: string): number {
  if (!dateStr) return 999999;
  const date = new Date(dateStr + 'T12:00:00');
  const year = date.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / 86400000);
  return (year - BASE_YEAR) * 52 + Math.min(Math.floor(dayOfYear / 7), 51);
}

function weekIndexToApproxDate(wi: number): Date {
  const year = BASE_YEAR + Math.floor(wi / 52);
  const week = wi % 52;
  return new Date(year, 0, 1 + week * 7);
}

function currentWeekIndex(): number {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / 86400000);
  return (now.getFullYear() - BASE_YEAR) * 52 + Math.min(Math.floor(dayOfYear / 7), 51);
}
const TODAY_WEEK = currentWeekIndex();

// ─── RRSP planner integration (reads from TaxAccountsPlanner localStorage) ───

interface RrspPlannerAlloc { symbol: string; percentage: number; oneTimeAmount?: number; }
interface RrspPlannerSegment {
  startDate: string; untilDate: string;
  amount: number; frequency: 'weekly' | 'biweekly' | 'monthly';
  allocations: RrspPlannerAlloc[];
}

function readRrspPlannerSegments(): RrspPlannerSegment[] {
  try {
    const raw = localStorage.getItem('tax-accounts-planner-v1');
    if (!raw) return [];
    const accounts = JSON.parse(raw);
    const rrsp = accounts.find((a: any) => a.type === 'rrsp');
    return rrsp?.segments ?? [];
  } catch { return []; }
}

function computeRrspPlannerTotal(segments: RrspPlannerSegment[], wi: number): number {
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

// ─── Base weekly chart data ───────────────────────────────────────────────────

interface ChartPoint {
  weekIndex: number; year: number; week: number;
  room: number; annualLimit: number; isYearStart: boolean;
  depositedQT: number | null; depositedWS: number | null;
  recurring: number | null;
}

function generateBaseData() {
  const data: Omit<ChartPoint, 'depositedQT' | 'depositedWS' | 'recurring'>[] = [];
  rrspYearlyData.forEach((entry) => {
    const yearOffset = entry.year - BASE_YEAR;
    for (let week = 0; week < WEEKS_PER_YEAR; week++) {
      data.push({
        weekIndex: yearOffset * WEEKS_PER_YEAR + week,
        year: entry.year, week: week + 1,
        room: entry.cumulative, annualLimit: entry.annualLimit, isYearStart: week === 0,
      });
    }
  });
  return data;
}

const baseData = generateBaseData();
const yearTicks = rrspYearlyData.map(entry => (entry.year - BASE_YEAR) * WEEKS_PER_YEAR);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (v: number) => '$' + Math.round(v).toLocaleString('en-US');

// ─── Tooltip ─────────────────────────────────────────────────────────────────

const CustomTooltip: React.FC<{ active?: boolean; payload?: any[] }> = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;
  const d: ChartPoint = payload[0].payload;
  const totalContributed = (d.depositedQT ?? 0) + (d.depositedWS ?? 0) + (d.recurring ?? 0);
  return (
    <div style={{
      background: '#1e293b', border: '1px solid #334155', borderRadius: '8px',
      padding: '10px 14px', color: '#f1f5f9', fontSize: '0.875rem', lineHeight: 1.75, minWidth: '210px',
    }}>
      <div style={{ fontWeight: 700, marginBottom: '4px', color: '#e2e8f0' }}>{d.year} &mdash; Week {d.week}</div>
      <div style={{ color: '#93c5fd' }}>Room:&nbsp;<strong>{fmt(d.room)}</strong></div>
      {d.depositedQT != null && <div style={{ color: '#34d399' }}>Questrade RRSP:&nbsp;<strong>{fmt(d.depositedQT)}</strong></div>}
      {d.depositedWS != null && <div style={{ color: '#e2e8f0' }}>Wealthsimple RRSP:&nbsp;<strong>{fmt(d.depositedWS)}</strong></div>}
      {d.recurring != null && d.recurring > 0 && <div style={{ color: '#f87171' }}>Recurring plans:&nbsp;<strong>{fmt(d.recurring)}</strong></div>}
      {totalContributed > 0 && (
        <>
          <div style={{ borderTop: '1px solid #334155', margin: '4px 0' }} />
          <div style={{ color: '#e2e8f0' }}>Total contributed:&nbsp;<strong>{fmt(totalContributed)}</strong></div>
          <div style={{ color: '#f59e0b', fontSize: '0.82em' }}>Remaining:&nbsp;<strong>{fmt(d.room - totalContributed)}</strong></div>
        </>
      )}
      {d.isYearStart && <div style={{ color: '#a78bfa', fontSize: '0.8em', marginTop: '2px' }}>+{fmt(d.annualLimit)} added Jan 1</div>}
    </div>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────

interface WeeklyDeposit { weekIndex: number; weeklyTotal: number; cumulative: number; }

const RRSPContributionRoom: React.FC = () => {
  const [qtDepositsByWeek, setQtDepositsByWeek] = useState<Map<number, number>>(new Map());
  const [wsDepositsByWeek, setWsDepositsByWeek] = useState<Map<number, number>>(new Map());
  const [totalQT, setTotalQT] = useState(0);
  const [totalWS, setTotalWS] = useState(0);
  const [loadingDeposits, setLoadingDeposits] = useState(true);
  const [rrspSegments, setRrspSegments] = useState<RrspPlannerSegment[]>(readRrspPlannerSegments);

  useEffect(() => {
    fetch('/api/tax/rrsp-contributions')
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
      .catch(err => console.error('Failed to load RRSP contribution data:', err))
      .finally(() => setLoadingDeposits(false));
  }, []);

  useEffect(() => {
    const handler = () => setRrspSegments(readRrspPlannerSegments());
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
      const recurringTotal = computeRrspPlannerTotal(rrspSegments, pt.weekIndex);
      return {
        ...pt,
        depositedQT: lastQT > 0 ? lastQT : null,
        depositedWS: lastWS > 0 ? lastWS : null,
        recurring: recurringTotal > 0 ? recurringTotal : null,
      };
    });
  }, [qtDepositsByWeek, wsDepositsByWeek, rrspSegments]);

  const totalRecurring = computeRrspPlannerTotal(rrspSegments, TODAY_WEEK);
  const totalContributed = totalQT + totalWS + totalRecurring;
  const totalRoom = rrspYearlyData[rrspYearlyData.length - 1].cumulative;

  const xTickFormatter = (wi: number) => {
    const idx = yearTicks.indexOf(wi);
    return idx !== -1 ? String(rrspYearlyData[idx].year) : '';
  };

  return (
    <div style={{ background: '#0f172a', borderRadius: '12px', padding: '28px 32px 20px', boxShadow: '0 4px 24px rgba(0,0,0,0.4)' }}>

      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#f1f5f9' }}>RRSP Contribution Room</h2>
        <p style={{ margin: '4px 0 0', fontSize: '0.875rem', color: '#64748b' }}>
          Room vs. RRSP contributions (Questrade + Wealthsimple) + recurring plans · 52 weekly points per year
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '20px' }}>
        {[
          { label: `Total Room (${rrspYearlyData[rrspYearlyData.length - 1].year})`, value: fmt(totalRoom),              color: '#93c5fd' },
          { label: 'Questrade RRSP',       value: loadingDeposits ? '…' : fmt(totalQT), color: '#34d399' },
          { label: 'Wealthsimple RRSP',    value: loadingDeposits ? '…' : fmt(totalWS), color: '#e2e8f0' },
          { label: 'Recurring plans',      value: fmt(totalRecurring),                   color: '#f87171' },
          { label: 'Total contributed',    value: fmt(totalContributed),                 color: '#cbd5e1' },
          { label: 'Remaining room',       value: fmt(totalRoom - totalContributed),     color: '#f59e0b' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '10px 16px' }}>
            <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: '2px' }}>{label}</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={650}>
        <ComposedChart data={chartData} margin={{ top: 24, right: 16, left: 16, bottom: 0 }}>
          <defs>
            <linearGradient id="rrspRoomGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="rrspQTGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#10b981" stopOpacity={0.55} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.1}  />
            </linearGradient>
            <linearGradient id="rrspWSGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#ffffff" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#ffffff" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="rrspRecurringGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.6}  />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0.1}  />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="weekIndex" ticks={yearTicks} tickFormatter={xTickFormatter}
            tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={{ stroke: '#334155' }} tickLine={false} interval={0} />
          <YAxis tickFormatter={fmt} domain={[0, 'auto']}
            tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={{ stroke: '#334155' }} tickLine={false} width={90} />

          <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#475569', strokeWidth: 1 }} />
          <Legend wrapperStyle={{ paddingTop: '12px', fontSize: '0.85rem', color: '#94a3b8' }} />

          <Area name="RRSP Room" type="stepAfter" dataKey="room"
            stroke="#3b82f6" fill="url(#rrspRoomGrad)" strokeWidth={2.5}
            dot={false} activeDot={{ r: 4, fill: '#60a5fa', stroke: '#1e40af', strokeWidth: 2 }}
            isAnimationActive={false} />

          <Area name="Questrade RRSP" type="monotone" dataKey="depositedQT"
            stackId="contributions" stroke="#10b981" fill="url(#rrspQTGrad)" strokeWidth={2}
            dot={false} activeDot={{ r: 4, fill: '#34d399', stroke: '#065f46', strokeWidth: 2 }}
            connectNulls={false} isAnimationActive={false} />

          <Area name="Wealthsimple RRSP" type="monotone" dataKey="depositedWS"
            stackId="contributions" stroke="#ffffff" fill="url(#rrspWSGrad)" strokeWidth={2}
            dot={false} activeDot={{ r: 4, fill: '#ffffff', stroke: '#94a3b8', strokeWidth: 2 }}
            connectNulls={false} isAnimationActive={false} />

          <Area name="Recurring plans" type="monotone" dataKey="recurring"
            stackId="contributions" stroke="#ef4444" fill="url(#rrspRecurringGrad)" strokeWidth={2}
            dot={false} activeDot={{ r: 4, fill: '#f87171', stroke: '#7f1d1d', strokeWidth: 2 }}
            connectNulls={false} isAnimationActive={false} />

          <ReferenceLine x={TODAY_WEEK} stroke="#a855f7" strokeWidth={2} strokeDasharray="4 3"
            label={{ value: 'Today', position: 'top', fill: '#a855f7', fontSize: 11 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export default RRSPContributionRoom;
