import React from 'react';
import { useQuery } from 'react-query';
import axios from 'axios';
import PortfolioPnLTracker from '../components/PortfolioPnLTracker';

interface PortfolioSummary {
  id: string;
  summary: {
    totalInvested: number;
    totalRealized: number;
    totalHoldings: number;
    totalQuantity: number;
  };
  createdAt: string;
  lastUpdated: string;
}

const PnLTracker: React.FC = () => {
  // Fetch list of portfolios
  const { data: portfolioSummaries, isLoading, error } = useQuery<PortfolioSummary[]>(
    'portfolios',
    async () => {
      const response = await axios.get('/api/portfolio');
      return response.data;
    }
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="dashboard-header">
          <div className="dashboard-header-content">
            <h1 className="dashboard-title">Daily P&L Tracker</h1>
            <p className="dashboard-subtitle">Track your portfolio performance day by day</p>
          </div>
        </div>
        <div className="dashboard-content">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading portfolios...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="dashboard-header">
          <div className="dashboard-header-content">
            <h1 className="dashboard-title">Daily P&L Tracker</h1>
            <p className="dashboard-subtitle">Track your portfolio performance day by day</p>
          </div>
        </div>
        <div className="dashboard-content">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h3 className="text-red-800 font-semibold">Error Loading Portfolios</h3>
            <p className="text-red-600 text-sm mt-2">
              Failed to load portfolio data. Please try again later.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!portfolioSummaries || portfolioSummaries.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="dashboard-header">
          <div className="dashboard-header-content">
            <h1 className="dashboard-title">Daily P&L Tracker</h1>
            <p className="dashboard-subtitle">Track your portfolio performance day by day</p>
          </div>
        </div>
        <div className="dashboard-content">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <h3 className="text-yellow-800 font-semibold">No Portfolio Found</h3>
            <p className="text-yellow-600 text-sm mt-2">
              Please upload a portfolio CSV file first from the Portfolio page.
            </p>
            <a
              href="/portfolio"
              className="inline-block mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Go to Portfolio Upload
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Use the first portfolio ID
  const portfolioId = portfolioSummaries[0].id;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="dashboard-content">
        <PortfolioPnLTracker portfolioId={portfolioId} />
      </div>
    </div>
  );
};

export default PnLTracker;
