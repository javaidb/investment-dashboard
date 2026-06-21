import React from 'react';
import { useCache } from '../contexts/CacheContext';

const RecurringInvestments: React.FC = () => {
  const { recurringInvestments, isLoading } = useCache();

  const panel: React.CSSProperties = {
    backgroundColor: '#141820', borderRadius: '6px', border: '1px solid #1e2535', overflow: 'hidden', width: '100%', marginBottom: '14px'
  };
  const mono = "'IBM Plex Mono', 'Courier New', monospace";

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 2 }).format(value);

  const formatPercent = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

  if (isLoading) {
    return (
      <div style={panel}>
        <div style={{ padding: '12px 20px', fontFamily: mono, fontSize: '12px', color: '#4a5568' }}>
          Loading recurring investments…
        </div>
      </div>
    );
  }

  if (!recurringInvestments?.investments?.length) {
    return (
      <div style={panel}>
        <div style={{ padding: '12px 20px', fontFamily: mono, fontSize: '12px', color: '#4a5568' }}>
          No recurring investments configured.
        </div>
      </div>
    );
  }

  const { investments, totals } = recurringInvestments;
  const enabledInvestments = investments.filter((inv: any) => inv.enabled);

  if (!enabledInvestments.length) return null;

  const thStyle: React.CSSProperties = {
    fontFamily: mono, backgroundColor: '#141820', color: '#4a5568', fontSize: '11px',
    fontWeight: 600, padding: '0 12px 7px', textTransform: 'uppercase', letterSpacing: '0.14em',
    textAlign: 'left', whiteSpace: 'nowrap',
  };
  const tdStyle: React.CSSProperties = {
    fontFamily: mono, fontSize: '12px', color: '#e2e8f0', padding: '8px 12px',
    borderBottom: '1px solid #1e2535', whiteSpace: 'nowrap',
  };

  return (
    <div style={panel}>
      {/* Header */}
      <div style={{ background: '#141820', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: mono, fontSize: '12px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Recurring Investments
        </div>
        <div style={{ fontFamily: mono, fontSize: '11px', color: '#4a5568', backgroundColor: '#0a0c10', padding: '3px 10px', borderRadius: '2px', border: '1px solid #1e2535' }}>
          {enabledInvestments.length} fund{enabledInvestments.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Compact table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: '#141820' }}>
          <thead>
            <tr>
              <th style={thStyle}>Fund</th>
              <th style={thStyle}>Symbol</th>
              <th style={thStyle}>Acct</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Initial</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Recurring</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Count</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Total Invested</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Price</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Current Value</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>P/L</th>
            </tr>
          </thead>
          <tbody>
            {enabledInvestments.map((inv: any, idx: number) => {
              const pnlColor = inv.profitLoss >= 0 ? '#22c55e' : '#ef4444';
              const rowBg = '#141820';
              return (
                <tr key={inv.id} style={{ backgroundColor: rowBg, borderLeft: '3px solid #C8102E' }}>
                  <td style={{ ...tdStyle, backgroundColor: rowBg, fontWeight: 600, color: '#e2e8f0', maxWidth: '180px' }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={inv.name}>{inv.name}</div>
                  </td>
                  <td style={{ ...tdStyle, backgroundColor: rowBg }}>
                    <span style={{ fontFamily: mono, fontSize: '12px', fontWeight: 700, color: '#ef4444', letterSpacing: '0.04em' }}>{inv.symbol}</span>
                    <div style={{ fontSize: '10px', color: '#4a5568', marginTop: '1px' }}>{inv.institution}</div>
                  </td>
                  <td style={{ ...tdStyle, backgroundColor: rowBg }}>
                    <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                      {(inv.accounts || []).map((acc: string) => {
                        const c = acc === 'TFSA'    ? { bg: 'rgba(34,197,94,0.12)',   text: '#22c55e', border: 'rgba(34,197,94,0.25)'   }
                               : acc === 'FHSA'    ? { bg: 'rgba(245,158,11,0.12)', text: '#f59e0b', border: 'rgba(245,158,11,0.25)' }
                               : acc === 'RRSP'    ? { bg: 'rgba(79,143,255,0.12)',  text: '#4f8fff', border: 'rgba(79,143,255,0.25)'  }
                               : /* Non-Reg */       { bg: 'rgba(226,232,240,0.08)', text: '#e2e8f0', border: 'rgba(226,232,240,0.18)' };
                        return (
                          <span key={acc} style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}`, padding: '1px 5px', borderRadius: '2px', fontSize: '10px', fontWeight: 700, fontFamily: mono, letterSpacing: '0.06em' }}>{acc}</span>
                        );
                      })}
                    </div>
                  </td>
                  <td style={{ ...tdStyle, backgroundColor: rowBg, textAlign: 'right', color: '#94a3b8' }}>{formatCurrency(inv.initialAmount)}</td>
                  <td style={{ ...tdStyle, backgroundColor: rowBg, textAlign: 'right', color: '#94a3b8' }}>
                    {formatCurrency(inv.recurringAmount)}<span style={{ color: '#4a5568' }}>/{inv.frequency}</span>
                  </td>
                  <td style={{ ...tdStyle, backgroundColor: rowBg, textAlign: 'right', color: '#94a3b8' }}>{inv.contributionCount}×</td>
                  <td style={{ ...tdStyle, backgroundColor: rowBg, textAlign: 'right', color: '#94a3b8' }}>{formatCurrency(inv.totalInvested)}</td>
                  <td style={{ ...tdStyle, backgroundColor: rowBg, textAlign: 'right', color: '#e2e8f0' }}>{formatCurrency(inv.currentPrice)}</td>
                  <td style={{ ...tdStyle, backgroundColor: rowBg, textAlign: 'right', color: '#e2e8f0', fontWeight: 600 }}>{formatCurrency(inv.currentValue)}</td>
                  <td style={{ ...tdStyle, backgroundColor: rowBg, textAlign: 'right' }}>
                    <div style={{ color: pnlColor, fontWeight: 700 }}>{formatCurrency(inv.profitLoss)}</div>
                    <div style={{ fontSize: '11px', color: pnlColor }}>{formatPercent(inv.profitLossPercent)}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div style={{ padding: '6px 16px', borderTop: '1px solid #1e2535', fontFamily: mono, fontSize: '10px', color: '#4a5568' }}>
        Started {enabledInvestments[0]?.initialDate || 'N/A'} · Auto-calculated · Edit recurring-investments.json to modify
      </div>
    </div>
  );
};

export default RecurringInvestments;
