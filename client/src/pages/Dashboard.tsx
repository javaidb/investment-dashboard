import React from 'react';
import StockChart from '../components/StockChart';
import TrendingStocks from '../components/TrendingStocks';
import PortfolioSummary from '../components/PortfolioSummary';

const Dashboard: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header Section */}
      <div className="dashboard-header">
        <div className="dashboard-header-content">
          <h1 className="dashboard-title">Investment Dashboard</h1>
          <p className="dashboard-subtitle">Track your investments and discover new opportunities</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="dashboard-content">
        <div className="dashboard-grid">
          {/* Left Column - Stock Chart and Trending Stocks */}
          <div className="dashboard-left-column">
            <div className="dashboard-section">
              {/* Main Interactive Stock Chart */}
              <div className="card">
                <div className="card-header">
                  <h2 className="card-title">Stock Analysis</h2>
                  <p className="card-subtitle">Search and analyze any stock with interactive charts</p>
                </div>
                <div className="card-body">
                  <StockChart defaultSymbol="AAPL" />
                </div>
              </div>
            </div>
            
            <div className="dashboard-section">
              {/* Trending Stocks with Mini Charts */}
              <div className="card">
                <div className="card-header">
                  <h2 className="card-title">Trending Stocks</h2>
                  <p className="card-subtitle">Top performing stocks with 24-hour performance</p>
                </div>
                <div className="card-body">
                  <TrendingStocks />
                </div>
              </div>
            </div>
          </div>
          
          {/* Right Column - Portfolio Summary */}
          <div className="dashboard-right-column">
            <div className="dashboard-section">
              {/* Portfolio Summary */}
              <PortfolioSummary />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard; 