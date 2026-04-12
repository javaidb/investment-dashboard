import React from 'react';
import TaxAccountsPlanner from '../components/TaxAccountsPlanner';
import TFSAContributionRoom from '../components/TFSAContributionRoom';

const Tax: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="dashboard-content">
        <TaxAccountsPlanner />
        <TFSAContributionRoom />
      </div>
    </div>
  );
};

export default Tax;
