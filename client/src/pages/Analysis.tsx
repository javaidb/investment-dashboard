import React from 'react';
import TrendAnalysis from '../components/TrendAnalysis';

const Analysis: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header Section */}
      <div className="dashboard-header">
        <div className="dashboard-header-content">
          <h1 className="dashboard-title">Trend Analysis</h1>
          <p className="dashboard-subtitle">Analyze portfolio trends and detect notable changes in asset performance</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="dashboard-content">
        <div className="max-w-7xl mx-auto">
          <div className="dashboard-section">
            {/* Trend Analysis Component */}
            <TrendAnalysis />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Analysis;