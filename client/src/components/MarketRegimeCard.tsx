import React from 'react';
import { useQuery } from 'react-query';
import axios from 'axios';

interface MarketData {
  regime: string;
  regimeColor: string;
  vix: number | null;
  vixLevel: string;
  spy: {
    current: number | null;
    sma50: number | null;
    sma200: number | null;
    ytdReturn: number | null;
    return3m: number | null;
    return6m: number | null;
    return12m: number | null;
  };
  relativeStrength: {
    [symbol: string]: { '3m': number | null; '6m': number | null; '12m': number | null };
  };
}

const pct = (v: number | null, dec = 1) =>
  v === null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(dec)}%`;

const vixDescription: Record<string, { label: string; color: string; desc: string }> = {
  LOW_FEAR:   { label: 'Calm',     color: '#059669', desc: 'VIX < 15 — market is complacent, expect low vol' },
  NORMAL:     { label: 'Normal',   color: '#16a34a', desc: 'VIX 15–20 — healthy market conditions' },
  ELEVATED:   { label: 'Nervous',  color: '#d97706', desc: 'VIX 20–30 — some fear in the market, be cautious' },
  HIGH_FEAR:  { label: 'Fearful',  color: '#dc2626', desc: 'VIX > 30 — high fear, potential opportunity or risk' },
  UNKNOWN:    { label: '—',        color: '#9ca3af', desc: '' },
};

const regimeDesc: Record<string, string> = {
  BULL:        'Price above 50MA above 200MA — strong uptrend, favour buys',
  BEAR:        'Price below 50MA below 200MA — downtrend, be defensive',
  RECOVERING:  'Price above 200MA but mixed MAs — recovery in progress, selective buys',
  CORRECTING:  'Price below 200MA — correction underway, wait for stabilization',
  UNKNOWN:     '',
};

const MarketRegimeCard: React.FC = () => {
  const { data, isLoading } = useQuery<{ success: boolean } & MarketData>(
    'market-regime',
    async () => {
      const res = await axios.get('/api/market/regime');
      return res.data;
    },
    { staleTime: 30 * 60 * 1000, cacheTime: 60 * 60 * 1000, retry: 1 }
  );

  if (isLoading) {
    return (
      <div style={{ padding: '16px', backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', display: 'flex', gap: '10px', alignItems: 'center', color: '#6b7280', fontSize: '13px' }}>
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-500"></div>
        Loading market conditions…
      </div>
    );
  }

  if (!data?.success) return null;

  const { regime, regimeColor, vix, vixLevel, spy } = data;
  const vixInfo = vixDescription[vixLevel] || vixDescription.UNKNOWN;

  const spyAbove50  = spy.current && spy.sma50  ? spy.current > spy.sma50  : null;
  const spyAbove200 = spy.current && spy.sma200 ? spy.current > spy.sma200 : null;

  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '16px',
      border: `2px solid ${regimeColor}30`,
      overflow: 'hidden',
      marginBottom: '24px',
    }}>
      {/* Header */}
      <div style={{
        background: `linear-gradient(to right, ${regimeColor}15, ${regimeColor}05)`,
        padding: '14px 20px',
        borderBottom: `1px solid ${regimeColor}20`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#111827' }}>
            Market Conditions
          </h3>
          <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#6b7280' }}>
            SPY trend analysis — shapes all buy/sell signals
          </p>
        </div>
        <div style={{
          padding: '6px 14px',
          borderRadius: '20px',
          backgroundColor: `${regimeColor}20`,
          border: `1.5px solid ${regimeColor}`,
          color: regimeColor,
          fontSize: '13px',
          fontWeight: '800',
          letterSpacing: '0.5px',
        }}>
          {regime}
        </div>
      </div>

      <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>

        {/* Regime box */}
        <div style={{ gridColumn: 'span 2', padding: '12px 16px', backgroundColor: `${regimeColor}08`, borderRadius: '10px', border: `1px solid ${regimeColor}20` }}>
          <div style={{ fontSize: '11px', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase', marginBottom: '4px' }}>Market Regime</div>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>{regimeDesc[regime]}</div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            {[
              { label: 'Above 50MA', val: spyAbove50 },
              { label: 'Above 200MA', val: spyAbove200 },
            ].map(({ label, val }) => (
              <span key={label} style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '6px',
                backgroundColor: val === null ? '#f3f4f6' : val ? '#dcfce7' : '#fef2f2',
                color: val === null ? '#9ca3af' : val ? '#16a34a' : '#dc2626',
                fontWeight: '600',
              }}>
                {val === null ? '—' : val ? '✓' : '✗'} {label}
              </span>
            ))}
          </div>
        </div>

        {/* VIX */}
        <div style={{ padding: '12px 16px', backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px solid #e5e7eb', textAlign: 'center' }} title={vixInfo.desc}>
          <div style={{ fontSize: '11px', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase', marginBottom: '4px' }}>VIX (Fear Index)</div>
          <div style={{ fontSize: '24px', fontWeight: '800', color: vixInfo.color, fontFamily: 'Futura, sans-serif' }}>
            {vix !== null ? vix.toFixed(1) : '—'}
          </div>
          <div style={{ fontSize: '11px', color: vixInfo.color, fontWeight: '600', marginTop: '2px' }}>{vixInfo.label}</div>
        </div>

        {/* SPY YTD */}
        <div style={{ padding: '12px 16px', backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px solid #e5e7eb', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase', marginBottom: '4px' }}>SPY YTD</div>
          <div style={{ fontSize: '22px', fontWeight: '800', color: (spy.ytdReturn ?? 0) >= 0 ? '#059669' : '#dc2626', fontFamily: 'Futura, sans-serif' }}>
            {pct(spy.ytdReturn)}
          </div>
          <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>Year to date</div>
        </div>

        {/* SPY 3M */}
        <div style={{ padding: '12px 16px', backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px solid #e5e7eb', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase', marginBottom: '4px' }}>SPY 3M</div>
          <div style={{ fontSize: '22px', fontWeight: '800', color: (spy.return3m ?? 0) >= 0 ? '#059669' : '#dc2626', fontFamily: 'Futura, sans-serif' }}>
            {pct(spy.return3m)}
          </div>
          <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>vs 3 months ago</div>
        </div>

        {/* SPY 12M */}
        <div style={{ padding: '12px 16px', backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px solid #e5e7eb', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase', marginBottom: '4px' }}>SPY 12M</div>
          <div style={{ fontSize: '22px', fontWeight: '800', color: (spy.return12m ?? 0) >= 0 ? '#059669' : '#dc2626', fontFamily: 'Futura, sans-serif' }}>
            {pct(spy.return12m)}
          </div>
          <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>vs 12 months ago</div>
        </div>

      </div>

      {/* Relative Strength vs SPY for holdings */}
      {Object.keys(data.relativeStrength).length > 0 && (
        <div style={{ padding: '0 20px 16px' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
            Holdings Relative to SPY (+ = outperforming)
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {Object.entries(data.relativeStrength)
              .sort((a, b) => (b[1]['3m'] ?? -999) - (a[1]['3m'] ?? -999))
              .map(([symbol, rs]) => {
                const rs3m = rs['3m'];
                const color = rs3m === null ? '#9ca3af' : rs3m >= 5 ? '#059669' : rs3m >= 0 ? '#16a34a' : rs3m >= -5 ? '#d97706' : '#dc2626';
                return (
                  <div key={symbol} title={`3M: ${pct(rs['3m'])} | 6M: ${pct(rs['6m'])} | 12M: ${pct(rs['12m'])}`} style={{
                    padding: '4px 10px',
                    borderRadius: '8px',
                    backgroundColor: rs3m === null ? '#f3f4f6' : rs3m >= 0 ? '#dcfce7' : '#fef2f2',
                    border: `1px solid ${color}30`,
                    cursor: 'help',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}>
                    <span style={{ fontSize: '12px', fontWeight: '700', color: '#111827' }}>{symbol}</span>
                    <span style={{ fontSize: '12px', fontWeight: '600', color }}>
                      {pct(rs3m, 0)} 3M
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
};

export default MarketRegimeCard;
