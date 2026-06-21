import React from 'react';
import PortfolioSummary from '../components/PortfolioSummary';
import PortfolioRiskCard from '../components/PortfolioRiskCard';

const Breakdown: React.FC = () => {
  return (
    <div style={{ background: '#0a0c10', minHeight: '100%' }}>
      {/* Page header */}
      <div style={{ background: '#10141c', borderBottom: '1px solid #1e2535', padding: '12px 20px' }}>
        <div style={{ fontFamily: "'IBM Plex Mono', 'Courier New', monospace", fontSize: '12px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase' as const }}>
          Breakdown
        </div>
        <div style={{ fontSize: '11px', color: '#4a5568', marginTop: '2px', fontFamily: "'IBM Plex Mono', monospace" }}>
          Portfolio composition · Holdings · Sector allocation
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <PortfolioRiskCard />
        <PortfolioSummary />
      </div>
    </div>
  );
};

export default Breakdown;
