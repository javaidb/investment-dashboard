import React, { useState } from 'react';
import { useQuery } from 'react-query';
import axios from 'axios';
import MarketRegimeCard from './MarketRegimeCard';
import EarningsCalendar from './EarningsCalendar';

interface RelativeStrengthEntry {
  sector: string | null;
  sectorEtf: string | null;
  isActive: boolean;
  '3m': number | null;
  '6m': number | null;
  '12m': number | null;
  '3mRaw': number | null;
  '6mRaw': number | null;
  '12mRaw': number | null;
  '3mVsSector': number | null;
  '6mVsSector': number | null;
  '12mVsSector': number | null;
  '3mSectorRet': number | null;
  '6mSectorRet': number | null;
  '12mSectorRet': number | null;
}

const pct = (v: number | null | undefined, dec = 1) =>
  v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(dec)}%`;

const DeltaBadge: React.FC<{ value: number | null | undefined; title?: string }> = ({ value, title }) => {
  if (value == null) return <span style={{ color: '#4a5568', fontSize: '11px' }}>—</span>;
  const pos = value >= 0;
  return (
    <span
      title={title}
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '4px',
        fontSize: '10px',
        fontWeight: '700',
        fontFamily: "'IBM Plex Mono',monospace",
        backgroundColor: pos ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
        color: pos ? '#34d399' : '#f87171',
        border: `1px solid ${pos ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
        whiteSpace: 'nowrap',
      }}
    >
      {pct(value, 1)}
    </span>
  );
};

const MarketInsightsTab: React.FC = () => {
  const [activeOnly, setActiveOnly] = useState(true);

  const { data, isLoading } = useQuery<{ success: boolean; relativeStrength: Record<string, RelativeStrengthEntry> }>(
    'market-regime',
    async () => {
      const res = await axios.get('/api/market/regime');
      return res.data;
    },
    { staleTime: 30 * 60 * 1000, cacheTime: 60 * 60 * 1000, retry: 1 }
  );

  const rs = data?.relativeStrength || {};
  const allSymbols = Object.keys(rs).filter(s => rs[s]['3mRaw'] !== null || rs[s]['3m'] !== null);
  // isActive === undefined means stale cache (built before the field was added) — show by default
  const symbols = activeOnly ? allSymbols.filter(s => rs[s].isActive !== false) : allSymbols;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Market Conditions */}
      <MarketRegimeCard />

      {/* Sector ETF Comparison Table */}
      <div style={{
        backgroundColor: '#10141c',
        borderRadius: '8px',
        border: '1px solid #1e2535',
        overflow: 'hidden',
      }}>
        <div style={{
          background: '#10141c',
          padding: '14px 20px',
          borderBottom: '1px solid #1e2535',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}>
          <div>
            <h3 style={{ margin: 0, fontFamily: "'IBM Plex Mono','Courier New',monospace", fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
              Sector ETF Comparison
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: '11px', color: '#64748b' }}>
              Return vs SPY and vs sector ETF (XLK, XLV, XLF…) · hover for context
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {isLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#64748b' }}>
                <div className="loading-spinner"></div>
                Loading…
              </div>
            )}
            {/* Active-only toggle */}
            <button
              onClick={() => setActiveOnly(v => !v)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                borderRadius: '20px',
                border: `1.5px solid ${activeOnly ? '#60a5fa' : '#1e2535'}`,
                backgroundColor: activeOnly ? 'rgba(59,130,246,0.12)' : '#10141c',
                color: activeOnly ? '#60a5fa' : '#64748b',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{
                display: 'inline-block',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: activeOnly ? '#60a5fa' : '#1e2535',
              }} />
              {activeOnly ? 'Active only' : 'All holdings'}
            </button>
          </div>
        </div>

        {symbols.length === 0 && !isLoading ? (
          <div style={{ padding: '24px', color: '#4a5568', fontSize: '13px', textAlign: 'center' }}>
            No historical data yet — calculate P&L first to populate the historical cache.
          </div>
        ) : (
          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '420px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead style={{ background: '#10141c', position: 'sticky', top: 0, zIndex: 10 }}>
                <tr style={{ borderBottom: '1px solid #1e2535' }}>
                  {['Symbol', 'Sector', 'ETF', '3M raw', '3M vs SPY', '3M vs ETF', '6M raw', '6M vs SPY', '6M vs ETF', '12M raw', '12M vs SPY', '12M vs ETF'].map(h => (
                    <th key={h} style={{ background: '#10141c',
                      padding: '10px 12px',
                      textAlign: h === 'Symbol' || h === 'Sector' || h === 'ETF' ? 'left' : 'center',
                      fontSize: '10px',
                      fontWeight: 700,
                      color: '#4a5568',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      fontFamily: "'IBM Plex Mono',monospace",
                      whiteSpace: 'nowrap',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {symbols
                  .sort((a, b) => (rs[b]['3mVsSector'] ?? rs[b]['3m'] ?? -999) - (rs[a]['3mVsSector'] ?? rs[a]['3m'] ?? -999))
                  .map((symbol, i) => {
                    const r = rs[symbol];
                    return (
                      <tr key={symbol} style={{
                        backgroundColor: i % 2 === 0 ? '#10141c' : 'rgba(30,37,53,0.5)',
                        borderBottom: '1px solid #131720',
                      }}>
                        <td style={{ padding: '10px 12px', fontWeight: '700', color: '#e2e8f0' }}>{symbol}</td>
                        <td style={{ padding: '10px 12px', color: '#64748b', fontSize: '12px', whiteSpace: 'nowrap' }}>
                          {r.sector || <span style={{ color: '#4a5568' }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          {r.sectorEtf ? (
                            <span style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontFamily: "'IBM Plex Mono',monospace",
                              background: 'rgba(59,130,246,0.12)',
                              color: '#60a5fa',
                              border: '1px solid rgba(59,130,246,0.25)',
                            }}>
                              {r.sectorEtf}
                            </span>
                          ) : <span style={{ color: '#4a5568', fontSize: '11px' }}>—</span>}
                        </td>

                        {/* 3M */}
                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                          <DeltaBadge value={r['3mRaw']} />
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                          <DeltaBadge value={r['3m']} title={`SPY 3M: ${pct(r['3mRaw'] != null && r['3m'] != null ? r['3mRaw'] - r['3m'] : undefined)}`} />
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                          <DeltaBadge value={r['3mVsSector']} title={r.sectorEtf ? `${r.sectorEtf} 3M: ${pct(r['3mSectorRet'])}` : 'No sector ETF'} />
                        </td>

                        {/* 6M */}
                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                          <DeltaBadge value={r['6mRaw']} />
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                          <DeltaBadge value={r['6m']} title={`SPY 6M: ${pct(r['6mRaw'] != null && r['6m'] != null ? r['6mRaw'] - r['6m'] : undefined)}`} />
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                          <DeltaBadge value={r['6mVsSector']} title={r.sectorEtf ? `${r.sectorEtf} 6M: ${pct(r['6mSectorRet'])}` : 'No sector ETF'} />
                        </td>

                        {/* 12M */}
                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                          <DeltaBadge value={r['12mRaw']} />
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                          <DeltaBadge value={r['12m']} title={`SPY 12M: ${pct(r['12mRaw'] != null && r['12m'] != null ? r['12mRaw'] - r['12m'] : undefined)}`} />
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                          <DeltaBadge value={r['12mVsSector']} title={r.sectorEtf ? `${r.sectorEtf} 12M: ${pct(r['12mSectorRet'])}` : 'No sector ETF'} />
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Earnings Calendar */}
      <EarningsCalendar />

    </div>
  );
};

export default MarketInsightsTab;
