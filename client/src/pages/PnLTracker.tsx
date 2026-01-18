import React from 'react';
import PortfolioPnLTracker from '../components/PortfolioPnLTracker';

// Master portfolio ID - single source of truth (matches backend)
const MASTER_PORTFOLIO_ID = 'master-portfolio';

const PnLTracker: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="dashboard-content">
        <PortfolioPnLTracker portfolioId={MASTER_PORTFOLIO_ID} />
      </div>
    </div>
  );
};

export default PnLTracker;
