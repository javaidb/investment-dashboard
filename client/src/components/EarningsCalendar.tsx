import React, { useState } from 'react';
import { useQuery } from 'react-query';
import axios from 'axios';

interface EarningsEvent {
  symbol: string;
  date: string;
  daysUntil: number;
  isActive: boolean;
  hour: string;
  quarter: number;
  year: number;
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
}

interface Fundamentals {
  pe: number | null;
  peg: number | null;
  ps: number | null;
  eps: number | null;
  epsGrowth: number | null;
  revenueGrowth: number | null;
  dividendYield: number | null;
  recommendationKey: string | null;
  grossMargin: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];
const DAY_ABBR = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function buildCalendarGrid(year: number, month: number): (number | null)[][] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function toDateStr(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function fmtRev(v: number | null) {
  if (v == null) return '—';
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toLocaleString()}`;
}

function fmtDate(s: string) {
  const d = new Date(s);
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

const urgencyStyle = (days: number) => {
  if (days <= 3)  return { bg: '#fef2f2', border: '#fca5a5', text: '#dc2626' };
  if (days <= 7)  return { bg: '#fff7ed', border: '#fdba74', text: '#c2410c' };
  return { bg: '#ede9fe', border: '#c4b5fd', text: '#6d28d9' };
};

const recColor = (k: string | null) => {
  if (!k) return '#9ca3af';
  if (k === 'strong_buy') return '#059669';
  if (k === 'buy')        return '#16a34a';
  if (k === 'hold')       return '#ca8a04';
  return '#dc2626';
};

// ── Component ─────────────────────────────────────────────────────────────────

const EarningsCalendar: React.FC = () => {
  const today = new Date();
  const [viewMonth,  setViewMonth]  = useState(today.getMonth());
  const [viewYear,   setViewYear]   = useState(today.getFullYear());
  const [activeOnly, setActiveOnly] = useState(true);

  // Earnings events
  const { data: earningsData, isLoading } = useQuery(
    'earnings-upcoming',
    () => axios.get('/api/earnings/upcoming').then(r => r.data),
    { staleTime: 30 * 60 * 1000, cacheTime: 60 * 60 * 1000, retry: 1 }
  );
  const allEarnings: EarningsEvent[] = earningsData?.earnings || [];
  const earnings = activeOnly ? allEarnings.filter(e => e.isActive !== false) : allEarnings;
  const earningSymbols = Array.from(new Set(earnings.map(e => e.symbol)));

  // Fundamentals for each earnings symbol
  const { data: fundData } = useQuery(
    ['earnings-fundamentals', earningSymbols.join(',')],
    () => axios.post('/api/rebalancing-recommendations/fundamentals/batch', { symbols: earningSymbols })
              .then(r => r.data.fundamentals || {}),
    { enabled: earningSymbols.length > 0, staleTime: 60 * 60 * 1000, retry: 1 }
  );
  const fundamentals: Record<string, Fundamentals> = fundData || {};

  // Calendar helpers
  const todayStr = today.toISOString().split('T')[0];
  const byDate: Record<string, EarningsEvent[]> = {};
  for (const ev of earnings) {
    if (!byDate[ev.date]) byDate[ev.date] = [];
    byDate[ev.date].push(ev);
  }
  const weeks = buildCalendarGrid(viewYear, viewMonth);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  // Sort earnings soonest first for the table
  const sortedEarnings = [...earnings].sort((a, b) => a.daysUntil - b.daysUntil);

  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '16px',
      border: '1px solid #e5e7eb',
      overflow: 'hidden',
    }}>

      {/* Header */}
      <div style={{
        background: 'linear-gradient(to right, #faf5ff, #f5f3ff)',
        padding: '14px 20px',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#111827' }}>
            Earnings Calendar
          </h3>
          <p style={{ margin: '3px 0 0', fontSize: '11px', color: '#6b7280' }}>
            Next 45 days · active holdings only
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isLoading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-500" />}
          {earnings.length > 0 && (
            <span style={{
              fontSize: '12px', padding: '3px 10px', borderRadius: '20px',
              backgroundColor: '#ede9fe', color: '#7c3aed', fontWeight: '600',
            }}>
              {earnings.length} event{earnings.length !== 1 ? 's' : ''}
            </span>
          )}
          <button
            onClick={() => setActiveOnly(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '4px 11px', borderRadius: '20px', cursor: 'pointer',
              border: `1.5px solid ${activeOnly ? '#7c3aed' : '#d1d5db'}`,
              backgroundColor: activeOnly ? '#f5f3ff' : 'white',
              color: activeOnly ? '#7c3aed' : '#6b7280',
              fontSize: '12px', fontWeight: '600', transition: 'all 0.15s ease',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{
              width: '7px', height: '7px', borderRadius: '50%',
              backgroundColor: activeOnly ? '#7c3aed' : '#d1d5db',
              display: 'inline-block',
            }} />
            {activeOnly ? 'Active only' : 'All holdings'}
          </button>
        </div>
      </div>

      {/* Body: table left + calendar right — fixed shared height */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 3fr', height: '500px' }}>

        {/* ── Left: scrollable earnings table ── */}
        <div style={{
          borderRight: '1px solid #e5e7eb',
          overflowY: 'auto',
          height: '100%',
        }}>
          {sortedEarnings.length === 0 && !isLoading ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
              No upcoming earnings in the next 45 days.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e5e7eb' }}>
                  {['Ticker', 'Days', 'Date', 'EPS Est.', 'Rev. Est.', 'P/E', 'PEG', 'Rec'].map(h => (
                    <th key={h} style={{
                      padding: '8px 7px',
                      textAlign: h === 'Ticker' ? 'left' : 'center',
                      fontSize: '10px', fontWeight: '700',
                      color: '#6b7280', textTransform: 'uppercase',
                      letterSpacing: '0.4px', whiteSpace: 'nowrap',
                      backgroundColor: '#f8fafc',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedEarnings.map((ev, i) => {
                  const f = fundamentals[ev.symbol];
                  const u = urgencyStyle(ev.daysUntil);
                  const hourIcon = ev.hour === 'bmo' ? '▲' : ev.hour === 'amc' ? '▼' : '';
                  return (
                    <tr key={`${ev.symbol}-${ev.date}`} style={{
                      backgroundColor: i % 2 === 0 ? 'white' : '#f9fafb',
                      borderBottom: '1px solid #f3f4f6',
                    }}>
                      {/* Ticker */}
                      <td style={{ padding: '8px 10px' }}>
                        <div style={{ fontWeight: '700', color: '#111827' }}>{ev.symbol}</div>
                        <div style={{ fontSize: '10px', color: '#9ca3af' }}>Q{ev.quarter} {ev.year}</div>
                      </td>

                      {/* Days */}
                      <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: '2px',
                          padding: '2px 6px', borderRadius: '6px', fontSize: '11px', fontWeight: '700',
                          backgroundColor: u.bg, color: u.text, border: `1px solid ${u.border}`,
                          whiteSpace: 'nowrap',
                        }}>
                          {ev.daysUntil}d {hourIcon}
                        </span>
                      </td>

                      {/* Date */}
                      <td style={{ padding: '8px 6px', textAlign: 'center', color: '#374151', whiteSpace: 'nowrap' }}>
                        {fmtDate(ev.date)}
                      </td>

                      {/* EPS Est. */}
                      <td style={{ padding: '8px 6px', textAlign: 'center', color: '#374151', fontWeight: '600' }}>
                        {ev.epsEstimate != null ? `$${ev.epsEstimate.toFixed(2)}` : '—'}
                      </td>

                      {/* Rev Est. */}
                      <td style={{ padding: '8px 6px', textAlign: 'center', color: '#374151' }}>
                        {fmtRev(ev.revenueEstimate)}
                      </td>

                      {/* P/E */}
                      <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                        {f?.pe != null ? (
                          <span style={{
                            color: f.pe < 15 ? '#059669' : f.pe < 30 ? '#374151' : '#dc2626',
                            fontWeight: '600',
                          }}>
                            {f.pe.toFixed(1)}
                          </span>
                        ) : '—'}
                      </td>

                      {/* PEG */}
                      <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                        {f?.peg != null ? (
                          <span style={{
                            color: f.peg < 1 ? '#059669' : f.peg < 2 ? '#ca8a04' : '#dc2626',
                            fontWeight: '600',
                          }}>
                            {f.peg.toFixed(2)}
                          </span>
                        ) : '—'}
                      </td>

                      {/* Analyst Rec */}
                      <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                        {f?.recommendationKey ? (
                          <span style={{
                            fontSize: '10px', fontWeight: '700',
                            color: recColor(f.recommendationKey),
                            textTransform: 'uppercase',
                          }}>
                            {f.recommendationKey.replace('_', ' ')}
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Right: monthly calendar fills full height ── */}
        <div style={{
          padding: '12px 14px',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Month nav */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: '10px',
          }}>
            <button onClick={prevMonth} style={{
              border: '1px solid #e5e7eb', borderRadius: '6px', background: 'white',
              padding: '3px 10px', cursor: 'pointer', color: '#374151', fontWeight: '700', fontSize: '14px',
            }}>‹</button>
            <span style={{ fontWeight: '700', fontSize: '14px', color: '#111827' }}>
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button onClick={nextMonth} style={{
              border: '1px solid #e5e7eb', borderRadius: '6px', background: 'white',
              padding: '3px 10px', cursor: 'pointer', color: '#374151', fontWeight: '700', fontSize: '14px',
            }}>›</button>
          </div>

          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '3px' }}>
            {DAY_ABBR.map(d => (
              <div key={d} style={{
                textAlign: 'center', fontSize: '10px', fontWeight: '700',
                color: '#9ca3af', textTransform: 'uppercase', padding: '2px 0',
              }}>{d}</div>
            ))}
          </div>

          {/* Calendar weeks — flex-grow to fill remaining height */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {weeks.map((week, wi) => (
            <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', flex: 1 }}>
              {week.map((day, di) => {
                if (day === null) return <div key={di} />;
                const dateStr = toDateStr(viewYear, viewMonth, day);
                const events  = byDate[dateStr] || [];
                const isToday = dateStr === todayStr;
                const isPast  = dateStr < todayStr;
                const isWknd  = di === 0 || di === 6;

                return (
                  <div key={di} style={{
                    padding: '3px 4px',
                    borderRadius: '6px',
                    backgroundColor: isToday ? '#eef2ff' : isPast ? '#fafafa' : isWknd ? '#f9fafb' : 'white',
                    border: isToday ? '2px solid #6366f1' : '1px solid #f3f4f6',
                  }}>
                    <div style={{
                      fontSize: '11px', fontWeight: isToday ? '800' : '500',
                      color: isToday ? '#4f46e5' : isPast ? '#d1d5db' : '#374151',
                      marginBottom: events.length > 0 ? '2px' : 0,
                    }}>
                      {day}
                    </div>
                    {events.map((ev, ei) => {
                      const u = urgencyStyle(ev.daysUntil);
                      return (
                        <div key={ei}
                          title={`${ev.symbol} Q${ev.quarter} · ${ev.hour === 'bmo' ? 'Before open' : ev.hour === 'amc' ? 'After close' : ''}${ev.epsEstimate != null ? ` · EPS est. $${ev.epsEstimate.toFixed(2)}` : ''}`}
                          style={{
                            padding: '1px 3px', borderRadius: '3px', marginBottom: '1px',
                            fontSize: '9px', fontWeight: '700',
                            backgroundColor: u.bg, color: u.text, border: `1px solid ${u.border}`,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            cursor: 'default',
                          }}
                        >
                          {ev.hour === 'bmo' ? '▲' : ev.hour === 'amc' ? '▼' : ''} {ev.symbol}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}

          </div>{/* end weeks flex */}

          {/* Legend pinned to bottom */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '6px', paddingTop: '6px', borderTop: '1px solid #f3f4f6', flexShrink: 0 }}>
            {[
              { bg: '#fef2f2', border: '#fca5a5', text: '#dc2626', label: '≤3d' },
              { bg: '#fff7ed', border: '#fdba74', text: '#c2410c', label: '≤7d' },
              { bg: '#ede9fe', border: '#c4b5fd', text: '#6d28d9', label: 'soon' },
            ].map(({ bg, border, label }) => (
              <span key={label} style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: '#6b7280' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: bg, border: `1px solid ${border}`, display: 'inline-block' }} />
                {label}
              </span>
            ))}
            <span style={{ fontSize: '10px', color: '#9ca3af' }}>▲ pre-mkt ▼ after</span>
          </div>
        </div>

      </div>
    </div>
  );
};

export default EarningsCalendar;
