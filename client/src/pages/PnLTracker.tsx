import React from 'react';
import PortfolioPnLTracker from '../components/PortfolioPnLTracker';

// Master portfolio ID - single source of truth (matches backend)
const MASTER_PORTFOLIO_ID = 'master-portfolio';

const PnLTracker: React.FC = () => {
  return (
    <div style={{ background: '#0a0c10', minHeight: '100%' }}>
      <PortfolioPnLTracker portfolioId={MASTER_PORTFOLIO_ID} />
    </div>
  );
};

export default PnLTracker;
