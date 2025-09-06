import React from 'react';
import StockChart from '../components/StockChart';
import TrendingStocks from '../components/TrendingStocks';
import HoldingsPerformance from '../components/HoldingsPerformance';

const Trends: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header Section */}
      <div className="dashboard-header">
        <div className="dashboard-header-content">
          <h1 className="dashboard-title">Market Trends</h1>
          <p className="dashboard-subtitle">Track market trends and analyze stock performance</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="dashboard-content">
        <div className="max-w-6xl mx-auto">
          <div className="dashboard-section">
            {/* Main Interactive Stock Chart */}
            <div className="flex justify-center">
              <div className="card w-full">
                <div className="card-header">
                  <h2 className="card-title">Stock Analysis</h2>
                  <p className="card-subtitle">Search and analyze any stock with interactive charts</p>
                </div>
                <div className="card-body">
                  <StockChart defaultSymbol="AAPL" />
                </div>
              </div>
            </div>
          </div>
          
          <div className="dashboard-section">
            {/* Trending Stocks and Holdings Performance Side by Side */}
            <div style={{ display: 'flex', gap: '1.5rem', width: '100%' }}>
              {/* Trending Stocks */}
              <div className="card" style={{ flex: 1 }}>
                <div className="card-header">
                  <h2 className="card-title">Trending Stocks</h2>
                  <p className="card-subtitle">Top performing stocks with 24-hour performance</p>
                </div>
                <div className="card-body">
                  <TrendingStocks />
                </div>
              </div>
              
              {/* Holdings Performance */}
              <div className="card" style={{ flex: 1 }}>
                <div className="card-header">
                  <h2 className="card-title">Holdings Performance</h2>
                  <p className="card-subtitle">Your top performing holdings over the last 3 days</p>
                </div>
                <div className="card-body">
                  <HoldingsPerformance />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Trends;