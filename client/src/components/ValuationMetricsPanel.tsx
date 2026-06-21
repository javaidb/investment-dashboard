import React from 'react';
import { useQuery } from 'react-query';
import axios from 'axios';
import { useCache } from '../contexts/CacheContext';

interface FundamentalsData {
  pe: number | null;
  peg: number | null;
  ps: number | null;
  pfcf: number | null;
  evEbitda: number | null;
  debtEquity: number | null;
  roe: number | null;
  roa: number | null;
  grossMargin: number | null;
  netMargin: number | null;
  eps: number | null;
  epsGrowth: number | null;
  revenueGrowth: number | null;
  dividendYield: number | null;
  recommendationKey: string | null;
  recommendationMean: number | null;
  analystCounts: { strongBuy: number; buy: number; hold: number; sell: number; strongSell: number; total: number } | null;
}

// ── Formatting helpers ────────────────────────────────────────────────────────

const f1 = (v: number | null, dec = 1) =>
  v == null ? '—' : v.toFixed(dec);

const pct = (v: number | null) =>
  v == null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;

const recLabel = (k: string | null) =>
  k ? k.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()) : '—';

const recColor = (k: string | null) => {
  if (!k) return '#4a5568';
  if (k === 'strong_buy') return '#34d399';
  if (k === 'buy')        return '#34d399';
  if (k === 'hold')       return '#fbbf24';
  return '#f87171';
};

// ── Column definitions ────────────────────────────────────────────────────────

interface ColDef {
  key: string;
  label: string;
  tip: string;
  render: (f: FundamentalsData) => React.ReactNode;
  sortValue: (f: FundamentalsData) => number;
  align?: 'left' | 'center';
}

const cols: ColDef[] = [
  {
    key: 'pe', label: 'P/E', align: 'center',
    tip: 'Price / Earnings (TTM). Lower = cheaper on earnings.',
    sortValue: f => f.pe ?? Infinity,
    render: f => {
      const v = f.pe;
      const color = v == null ? '#4a5568' : v < 15 ? '#34d399' : v < 30 ? '#94a3b8' : '#f87171';
      return <span style={{ color, fontWeight: v != null ? '700' : '400' }}>{f1(v)}</span>;
    },
  },
  {
    key: 'peg', label: 'PEG', align: 'center',
    tip: 'P/E ÷ EPS growth rate. < 1 = potentially undervalued relative to growth.',
    sortValue: f => f.peg ?? Infinity,
    render: f => {
      const v = f.peg;
      const color = v == null ? '#4a5568' : v < 1 ? '#34d399' : v < 2 ? '#fbbf24' : '#f87171';
      return <span style={{ color, fontWeight: v != null ? '700' : '400' }}>{f1(v, 2)}</span>;
    },
  },
  {
    key: 'ps', label: 'P/S', align: 'center',
    tip: 'Price / Sales (TTM). Useful for unprofitable or high-growth companies.',
    sortValue: f => f.ps ?? Infinity,
    render: f => <span style={{ color: f.ps == null ? '#4a5568' : '#94a3b8' }}>{f1(f.ps)}</span>,
  },
  {
    key: 'pfcf', label: 'P/FCF', align: 'center',
    tip: 'Price / Free Cash Flow. Measures how much you pay for actual cash generation.',
    sortValue: f => f.pfcf ?? Infinity,
    render: f => {
      const v = f.pfcf;
      const color = v == null ? '#4a5568' : v < 20 ? '#34d399' : v < 40 ? '#94a3b8' : '#f87171';
      return <span style={{ color }}>{f1(v)}</span>;
    },
  },
  {
    key: 'ev', label: 'EV/EBITDA', align: 'center',
    tip: 'Enterprise Value / EBITDA. Common acquisition metric — < 10 often considered value.',
    sortValue: f => f.evEbitda ?? Infinity,
    render: f => {
      const v = f.evEbitda;
      const color = v == null ? '#4a5568' : v < 10 ? '#34d399' : v < 20 ? '#94a3b8' : '#f87171';
      return <span style={{ color }}>{f1(v)}</span>;
    },
  },
  {
    key: 'de', label: 'D/E', align: 'center',
    tip: 'Total Debt / Total Equity. < 1 = conservative leverage.',
    sortValue: f => f.debtEquity ?? Infinity,
    render: f => {
      const v = f.debtEquity;
      const color = v == null ? '#4a5568' : v < 0.5 ? '#34d399' : v < 1.5 ? '#94a3b8' : '#f87171';
      return <span style={{ color }}>{f1(v, 2)}</span>;
    },
  },
  {
    key: 'roe', label: 'ROE', align: 'center',
    tip: 'Return on Equity (TTM). How efficiently the company generates profit from shareholders\' equity.',
    sortValue: f => f.roe ?? -Infinity,
    render: f => {
      const v = f.roe;
      const color = v == null ? '#4a5568' : v > 0.2 ? '#34d399' : v > 0 ? '#94a3b8' : '#f87171';
      return <span style={{ color, fontWeight: v != null ? '600' : '400' }}>{pct(v)}</span>;
    },
  },
  {
    key: 'roa', label: 'ROA', align: 'center',
    tip: 'Return on Assets (TTM). Profitability relative to total assets.',
    sortValue: f => f.roa ?? -Infinity,
    render: f => {
      const v = f.roa;
      const color = v == null ? '#4a5568' : v > 0.05 ? '#34d399' : v > 0 ? '#94a3b8' : '#f87171';
      return <span style={{ color }}>{pct(v)}</span>;
    },
  },
  {
    key: 'gross', label: 'Gross %', align: 'center',
    tip: 'Gross profit margin (TTM). Higher = stronger pricing power / lower cost of goods.',
    sortValue: f => f.grossMargin ?? -Infinity,
    render: f => {
      const v = f.grossMargin;
      const color = v == null ? '#4a5568' : v > 0.5 ? '#34d399' : v > 0.3 ? '#94a3b8' : '#f87171';
      return <span style={{ color }}>{pct(v)}</span>;
    },
  },
  {
    key: 'net', label: 'Net %', align: 'center',
    tip: 'Net profit margin (TTM). Bottom-line profitability after all expenses.',
    sortValue: f => f.netMargin ?? -Infinity,
    render: f => {
      const v = f.netMargin;
      const color = v == null ? '#4a5568' : v > 0.15 ? '#34d399' : v > 0 ? '#94a3b8' : '#f87171';
      return <span style={{ color }}>{pct(v)}</span>;
    },
  },
  {
    key: 'epsGr', label: 'EPS Gr.', align: 'center',
    tip: 'EPS growth YoY (TTM). Trailing earnings growth rate.',
    sortValue: f => f.epsGrowth ?? -Infinity,
    render: f => {
      const v = f.epsGrowth;
      const color = v == null ? '#4a5568' : v > 0.1 ? '#34d399' : v > 0 ? '#94a3b8' : '#f87171';
      return <span style={{ color, fontWeight: v != null ? '600' : '400' }}>{pct(v)}</span>;
    },
  },
  {
    key: 'revGr', label: 'Rev Gr.', align: 'center',
    tip: 'Revenue growth YoY (TTM). Top-line growth rate.',
    sortValue: f => f.revenueGrowth ?? -Infinity,
    render: f => {
      const v = f.revenueGrowth;
      const color = v == null ? '#4a5568' : v > 0.1 ? '#34d399' : v > 0 ? '#94a3b8' : '#f87171';
      return <span style={{ color }}>{pct(v)}</span>;
    },
  },
  {
    key: 'yield', label: 'Yield', align: 'center',
    tip: 'Dividend yield (TTM).',
    sortValue: f => f.dividendYield ?? -Infinity,
    render: f => {
      const v = f.dividendYield;
      return <span style={{ color: v && v > 0 ? '#34d399' : '#4a5568' }}>
        {v && v > 0 ? `${v.toFixed(2)}%` : '—'}
      </span>;
    },
  },
  {
    key: 'rec', label: 'Rec', align: 'center',
    tip: 'Analyst consensus recommendation (1=Strong Buy → 5=Strong Sell).',
    sortValue: f => f.recommendationMean ?? Infinity,
    render: f => (
      <span style={{ color: recColor(f.recommendationKey), fontWeight: '700', fontSize: '11px', textTransform: 'uppercase' }}>
        {recLabel(f.recommendationKey)}
      </span>
    ),
  },
  {
    key: 'ana_sb', label: 'SB', align: 'center',
    tip: 'Strong Buy analyst count.',
    sortValue: f => f.analystCounts?.strongBuy ?? -Infinity,
    render: f => {
      const v = f.analystCounts?.strongBuy;
      return v != null && v > 0
        ? <span style={{ fontWeight: '700', color: '#34d399', fontSize: '12px' }}>{v}</span>
        : <span style={{ color: '#4a5568' }}>—</span>;
    },
  },
  {
    key: 'ana_b', label: 'B', align: 'center',
    tip: 'Buy analyst count.',
    sortValue: f => f.analystCounts?.buy ?? -Infinity,
    render: f => {
      const v = f.analystCounts?.buy;
      return v != null && v > 0
        ? <span style={{ fontWeight: '700', color: '#34d399', fontSize: '12px' }}>{v}</span>
        : <span style={{ color: '#4a5568' }}>—</span>;
    },
  },
  {
    key: 'ana_h', label: 'H', align: 'center',
    tip: 'Hold analyst count.',
    sortValue: f => f.analystCounts?.hold ?? -Infinity,
    render: f => {
      const v = f.analystCounts?.hold;
      return v != null && v > 0
        ? <span style={{ fontWeight: '700', color: '#fbbf24', fontSize: '12px' }}>{v}</span>
        : <span style={{ color: '#4a5568' }}>—</span>;
    },
  },
  {
    key: 'ana_s', label: 'S', align: 'center',
    tip: 'Sell analyst count.',
    sortValue: f => f.analystCounts?.sell ?? -Infinity,
    render: f => {
      const v = f.analystCounts?.sell;
      return v != null && v > 0
        ? <span style={{ fontWeight: '700', color: '#f87171', fontSize: '12px' }}>{v}</span>
        : <span style={{ color: '#4a5568' }}>—</span>;
    },
  },
  {
    key: 'ana_ss', label: 'SS', align: 'center',
    tip: 'Strong Sell analyst count.',
    sortValue: f => f.analystCounts?.strongSell ?? -Infinity,
    render: f => {
      const v = f.analystCounts?.strongSell;
      return v != null && v > 0
        ? <span style={{ fontWeight: '700', color: '#f87171', fontSize: '12px' }}>{v}</span>
        : <span style={{ color: '#4a5568' }}>—</span>;
    },
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

const ValuationMetricsPanel: React.FC = () => {
  const { latestPortfolio } = useCache();
  const [sortKey, setSortKey] = React.useState<string | null>(null);
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('asc');

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const stockSymbols: string[] = (latestPortfolio?.holdings || [])
    .filter((h: any) => h.type !== 'c' && (h.quantity || 0) > 0.01)
    .map((h: any) => h.symbol);

  const { data, isLoading } = useQuery(
    ['valuation-fundamentals', stockSymbols.join(',')],
    async () => {
      if (stockSymbols.length === 0) return { fundamentals: {} };
      const res = await axios.post('/api/rebalancing-recommendations/fundamentals/batch', { symbols: stockSymbols });
      return res.data;
    },
    { enabled: stockSymbols.length > 0, staleTime: 60 * 60 * 1000, cacheTime: 2 * 60 * 60 * 1000, retry: 1 }
  );

  if (stockSymbols.length === 0) return null;

  const fundamentals: Record<string, FundamentalsData> = data?.fundamentals || {};
  const loaded = Object.keys(fundamentals).length;
  const sortedRows = (() => {
    const base = stockSymbols.filter((s: string) => fundamentals[s]);
    if (!sortKey) return base;
    if (sortKey === 'symbol') {
      return [...base].sort((a, b) => sortDir === 'asc' ? a.localeCompare(b) : b.localeCompare(a));
    }
    const col = cols.find(c => c.key === sortKey);
    if (!col) return base;
    return [...base].sort((a, b) => {
      const av = col.sortValue(fundamentals[a]);
      const bv = col.sortValue(fundamentals[b]);
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  })();
  const rows = sortedRows;
  const noData = stockSymbols.filter((s: string) => !fundamentals[s]);

  return (
    <div style={{ backgroundColor: '#10141c', borderRadius: '16px', border: '1px solid #1e2535', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{
        background: '#10141c',
        padding: '14px 20px',
        borderBottom: '1px solid #1e2535',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <h3 style={{ margin: 0, fontFamily: "'IBM Plex Mono','Courier New',monospace", fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Valuation Metrics</h3>
          <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b' }}>
            Hover column headers for definitions ·{' '}
            {isLoading ? 'Loading…' : `${loaded} / ${stockSymbols.length} stocks`}
          </p>
        </div>
        <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(16,185,129,0.12)', color: '#34d399', border: '1px solid rgba(16,185,129,0.25)', fontWeight: 700, fontFamily: "'IBM Plex Mono',monospace" }}>
          via Finnhub
        </span>
      </div>

      {/* Loading state */}
      {isLoading && loaded === 0 ? (
        <div style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '10px', color: '#64748b', fontSize: '13px' }}>
          <div className="loading-spinner" />
          Fetching fundamentals (rate-limited — takes ~20s for full portfolio)…
        </div>
      ) : (
        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '420px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', tableLayout: 'auto' }}>
            <thead style={{ background: '#10141c', position: 'sticky', top: 0, zIndex: 10 }}>
              <tr style={{ borderBottom: '1px solid #1e2535' }}>
                {/* Symbol column — sortable */}
                <th
                  onClick={() => handleSort('symbol')}
                  style={{
                    padding: '9px 14px', textAlign: 'left',
                    color: sortKey === 'symbol' ? '#60a5fa' : '#4a5568',
                    fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                    fontFamily: "'IBM Plex Mono',monospace",
                    background: '#10141c', whiteSpace: 'nowrap',
                    position: 'sticky', left: 0, zIndex: 2, cursor: 'pointer', userSelect: 'none',
                  }}
                >
                  Symbol {sortKey === 'symbol' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                </th>
                {cols.map(c => {
                  const active = sortKey === c.key;
                  return (
                    <th
                      key={c.key}
                      title={c.tip}
                      onClick={() => handleSort(c.key)}
                      style={{
                        padding: '9px 8px', textAlign: c.align ?? 'center',
                        fontSize: '10px', fontWeight: 700,
                        color: active ? '#60a5fa' : '#4a5568',
                        textTransform: 'uppercase', letterSpacing: '0.08em',
                        fontFamily: "'IBM Plex Mono',monospace",
                        background: '#10141c', whiteSpace: 'nowrap',
                        cursor: 'pointer', userSelect: 'none',
                      }}
                    >
                      {c.label} {active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((symbol, i) => {
                const f = fundamentals[symbol];
                return (
                  <tr key={symbol} style={{
                    backgroundColor: i % 2 === 0 ? '#10141c' : 'rgba(30,37,53,0.5)',
                    borderBottom: '1px solid #131720',
                  }}>
                    {/* Sticky symbol column */}
                    <td style={{
                      padding: '9px 14px', fontWeight: '700', fontSize: '13px', color: '#e2e8f0',
                      whiteSpace: 'nowrap', position: 'sticky', left: 0, zIndex: 1,
                      backgroundColor: i % 2 === 0 ? '#10141c' : 'rgba(30,37,53,0.5)',
                    }}>
                      {symbol}
                    </td>
                    {cols.map(c => (
                      <td key={c.key} style={{ padding: '9px 8px', textAlign: c.align ?? 'center', whiteSpace: 'nowrap' }}>
                        {c.render(f)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Stocks with no data */}
          {noData.length > 0 && (
            <div style={{ padding: '8px 16px', fontSize: '11px', color: '#4a5568', borderTop: '1px solid #131720' }}>
              No Finnhub data: {noData.join(', ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ValuationMetricsPanel;
