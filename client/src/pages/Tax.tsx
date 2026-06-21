import React from 'react';
import TaxAccountsPlanner from '../components/TaxAccountsPlanner';
import TFSAContributionRoom from '../components/TFSAContributionRoom';
import RRSPContributionRoom from '../components/RRSPContributionRoom';

const Tax: React.FC = () => {
  return (
    <div style={{ background: '#0a0c10', minHeight: '100%' }}>
      <div style={{ background: '#10141c', borderBottom: '1px solid #1e2535', padding: '12px 20px' }}>
        <div style={{ fontFamily: "'IBM Plex Mono', 'Courier New', monospace", fontSize: 12, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase' as const }}>
          Tax
        </div>
        <div style={{ fontSize: 11, color: '#4a5568', marginTop: 2, fontFamily: "'IBM Plex Mono', monospace" }}>
          TFSA · RRSP · Account planning
        </div>
      </div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <TaxAccountsPlanner />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'start' }}>
          <TFSAContributionRoom />
          <RRSPContributionRoom />
        </div>
      </div>
    </div>
  );
};

export default Tax;
