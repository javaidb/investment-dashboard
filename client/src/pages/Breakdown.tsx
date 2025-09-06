import React from 'react';
import PortfolioSummary from '../components/PortfolioSummary';

const Breakdown: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header Section */}
      <div className="dashboard-header">
        <div className="dashboard-header-content">
          <h1 className="dashboard-title">Portfolio Breakdown</h1>
          <p className="dashboard-subtitle">Detailed view of your portfolio composition and performance</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="dashboard-content">
        <div className="max-w-5xl mx-auto">
          <div className="dashboard-section">
            {/* Portfolio Summary with embedded Holdings Chart */}
            <PortfolioSummary />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Breakdown;