import React from 'react';
import { useQuery } from 'react-query';
import axios from 'axios';

interface RiskMetrics {
  annualReturn: number;
  annualizedVolatility: number;
  sharpe: number | null;
  sortino: number | null;
  calmar: number | null;
  maxDrawdown: number;
  riskFreeRate: number;
  dayCount: number;
  startDate: string;
  endDate: string;
}

const PORTFOLIO_ID = 'master-portfolio';

const MetricBox: React.FC<{
  label: string;
  value: string;
  subLabel?: string;
  color?: string;
  tooltip: string;
}> = ({ label, value, subLabel, color = '#e2e8f0', tooltip }) => (
  <div
    title={tooltip}
    style={{
      backgroundColor: '#141820',
      borderRadius: '4px',
      border: '1px solid #1e2535',
      padding: '12px 16px',
      textAlign: 'center',
      cursor: 'help',
      minWidth: '110px',
      transition: 'border-color 0.15s',
    }}
    onMouseEnter={e => (e.currentTarget.style.borderColor = '#00d4aa')}
    onMouseLeave={e => (e.currentTarget.style.borderColor = '#1e2535')}
  >
    <div style={{
      fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
      fontSize: '11px',
      fontWeight: 600,
      color: '#4a5568',
      textTransform: 'uppercase',
      letterSpacing: '0.14em',
      marginBottom: '8px',
    }}>
      {label}
    </div>
    <div style={{
      fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
      fontSize: '22px',
      fontWeight: 600,
      color,
    }}>
      {value}
    </div>
    {subLabel && (
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', color: '#4a5568', marginTop: '3px', letterSpacing: '0.06em' }}>{subLabel}</div>
    )}
  </div>
);

const interpretSharpe = (v: number | null) => {
  if (v === null) return { color: '#4a5568', label: '—' };
  if (v >= 2) return { color: '#00d4aa', label: 'Excellent' };
  if (v >= 1) return { color: '#22c55e', label: 'Good' };
  if (v >= 0.5) return { color: '#f59e0b', label: 'Adequate' };
  if (v >= 0) return { color: '#f97316', label: 'Weak' };
  return { color: '#ef4444', label: 'Negative' };
};

const PortfolioRiskCard: React.FC = () => {
  const { data, isLoading, error } = useQuery(
    ['portfolio-risk-metrics', PORTFOLIO_ID],
    async () => {
      const res = await axios.get(`/api/pnl/portfolio/${PORTFOLIO_ID}/risk-metrics`);
      return res.data;
    },
    {
      staleTime: 5 * 60 * 1000,
      cacheTime: 15 * 60 * 1000,
      retry: 1,
    }
  );

  if (isLoading) {
    return (
      <div style={{
        padding: '14px 20px',
        backgroundColor: '#10141c',
        borderRadius: '6px',
        border: '1px solid #1e2535',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}>
        <div className="animate-spin rounded-full h-4 w-4 border-b-2" style={{ borderColor: '#00d4aa' }}></div>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', color: '#4a5568', letterSpacing: '0.06em' }}>
          Loading risk metrics…
        </span>
      </div>
    );
  }

  if (error || !data?.success) {
    return null;
  }

  const m: RiskMetrics = data.metrics;
  const sharpeInfo = interpretSharpe(m.sharpe);

  return (
    <div style={{
      backgroundColor: '#10141c',
      borderRadius: '6px',
      border: '1px solid #1e2535',
      padding: '14px 20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div>
          <div style={{
            fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
            fontSize: '12px',
            fontWeight: 700,
            color: '#94a3b8',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            marginBottom: '4px',
          }}>
            Portfolio Risk Metrics
          </div>
          <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', color: '#4a5568', margin: 0, letterSpacing: '0.04em' }}>
            {m.dayCount} trading days · {m.startDate} → {m.endDate} · risk-free: {m.riskFreeRate.toFixed(1)}%
          </p>
        </div>
        <div style={{
          fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
          fontSize: '11px',
          fontWeight: 600,
          padding: '3px 10px',
          borderRadius: '2px',
          backgroundColor: `${sharpeInfo.color}18`,
          color: sharpeInfo.color,
          border: `1px solid ${sharpeInfo.color}35`,
          letterSpacing: '0.08em',
        }}>
          SHARPE · {sharpeInfo.label}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <MetricBox
          label="Annual Return"
          value={`${m.annualReturn >= 0 ? '+' : ''}${m.annualReturn.toFixed(1)}%`}
          color={m.annualReturn >= 0 ? '#22c55e' : '#ef4444'}
          tooltip="Annualized portfolio return based on daily P&L records"
        />
        <MetricBox
          label="Sharpe Ratio"
          value={m.sharpe !== null ? m.sharpe.toFixed(2) : '—'}
          subLabel=">1 = good"
          color={sharpeInfo.color}
          tooltip="Risk-adjusted return: (Annual Return − Risk-Free Rate) / Annual Volatility. Higher is better."
        />
        <MetricBox
          label="Sortino Ratio"
          value={m.sortino !== null ? m.sortino.toFixed(2) : '—'}
          subLabel=">1 = good"
          color={m.sortino !== null ? (m.sortino >= 1 ? '#22c55e' : m.sortino >= 0.5 ? '#f59e0b' : '#ef4444') : '#4a5568'}
          tooltip="Like Sharpe but only penalizes downside volatility."
        />
        <MetricBox
          label="Calmar Ratio"
          value={m.calmar !== null ? m.calmar.toFixed(2) : '—'}
          subLabel=">1 = good"
          color={m.calmar !== null ? (m.calmar >= 1 ? '#22c55e' : m.calmar >= 0 ? '#f59e0b' : '#ef4444') : '#4a5568'}
          tooltip="Annual return divided by max drawdown."
        />
        <MetricBox
          label="Max Drawdown"
          value={`${m.maxDrawdown.toFixed(1)}%`}
          color={m.maxDrawdown < -20 ? '#ef4444' : m.maxDrawdown < -10 ? '#f59e0b' : '#94a3b8'}
          tooltip="Largest peak-to-trough decline in portfolio value."
        />
        <MetricBox
          label="Annual Volatility"
          value={`${m.annualizedVolatility.toFixed(1)}%`}
          subLabel="annualized"
          color={m.annualizedVolatility > 30 ? '#ef4444' : m.annualizedVolatility > 15 ? '#f59e0b' : '#94a3b8'}
          tooltip="Annualized standard deviation of daily returns."
        />
      </div>
    </div>
  );
};

export default PortfolioRiskCard;
