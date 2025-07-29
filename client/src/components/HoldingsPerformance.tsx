import React from 'react';
import { useQuery, useMutation } from 'react-query';
import axios from 'axios';
import { TrendingUp, TrendingDown, DollarSign, BarChart3, Wifi, WifiOff, Clock, RefreshCw } from 'lucide-react';

interface Holding {
  symbol: string;
  quantity: number;
  averagePrice: number;
  totalInvested: number;
  currentPrice?: number;
  currentValue?: number;
  totalPnL?: number;
  totalPnLPercent?: number;
  type?: string;
  cacheUsed?: boolean;
  lastUpdated?: string;
  companyName?: string;
}

interface Portfolio {
  id: string;
  summary: {
    totalInvested: number;
    totalRealized: number;
    totalHoldings: number;
    totalQuantity: number;
  };
  holdings: Holding[];
  createdAt: string;
}

const HoldingsPerformance: React.FC = () => {
  const { data: portfolios, isLoading, error, refetch } = useQuery(
    'portfolios',
    async () => {
      try {
        const response = await axios.get('/api/portfolio');
        console.log('Portfolio data received:', response.data);
        return response.data;
      } catch (error) {
        console.error('Error fetching portfolios:', error);
        throw error;
      }
    },
    {
      refetchInterval: 300000, // Refetch every 5 minutes
      retry: 3,
      retryDelay: 1000,
    }
  );

  // Auto-process uploaded files if no portfolios exist
  const { mutate: processUploaded } = useMutation(
    async () => {
      const response = await axios.post('/api/portfolio/process-uploaded');
      return response.data;
    },
    {
      onSuccess: () => {
        refetch(); // Refetch portfolios after processing
      },
      onError: (error) => {
        console.error('Error processing uploaded files:', error);
      }
    }
  );

  // Auto-process files when component mounts if no portfolios exist
  React.useEffect(() => {
    if (!isLoading && (!portfolios || portfolios.length === 0)) {
      console.log('No portfolios found, attempting to process uploaded files...');
      processUploaded();
    }
  }, [isLoading, portfolios, processUploaded]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'CAD',
    }).format(amount);
  };

  const formatPercentage = (value: number) => {
    return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  // Helper function to check if data is fresh (less than 5 minutes old)
  const isDataFresh = (lastUpdated?: string) => {
    if (!lastUpdated) return false;
    const now = new Date();
    const updated = new Date(lastUpdated);
    const diffMinutes = (now.getTime() - updated.getTime()) / (1000 * 60);
    return diffMinutes < 5;
  };

  // Helper function to format relative time
  const formatRelativeTime = (lastUpdated?: string) => {
    if (!lastUpdated) return 'Unknown';
    const now = new Date();
    const updated = new Date(lastUpdated);
    const diffMinutes = Math.floor((now.getTime() - updated.getTime()) / (1000 * 60));
    
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  // Helper function to get overall data freshness status
  const getOverallDataStatus = (holdings: Holding[]) => {
    if (!holdings || holdings.length === 0) return { isLive: false, freshCount: 0, totalCount: 0 };
    
    const freshCount = holdings.filter(h => isDataFresh(h.lastUpdated)).length;
    const totalCount = holdings.length;
    const isLive = freshCount === totalCount;
    
    return { isLive, freshCount, totalCount };
  };

  if (isLoading) {
    return (
      <div className="holdings-performance">
        <div className="holdings-performance-header">
          <h3>Holdings Performance (3D)</h3>
          <p>Loading your portfolio data...</p>
        </div>
        <div className="holdings-performance-grid">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="holding-card skeleton">
              <div className="skeleton-line" style={{ width: '60%' }}></div>
              <div className="skeleton-line" style={{ width: '40%' }}></div>
              <div className="skeleton-line" style={{ width: '80%' }}></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !portfolios || portfolios.length === 0) {
    return (
      <div className="holdings-performance">
        <div className="holdings-performance-header">
          <div className="header-top">
            <h3>Holdings Performance (3D)</h3>
            <div className="live-indicator">
              <div className="live-status cached">
                <Clock className="live-icon" />
                <span>No Data</span>
              </div>
            </div>
          </div>
          <p>No portfolio data available</p>
        </div>
        <div className="holdings-performance-empty">
          <BarChart3 className="empty-icon" />
          <p>Upload your portfolio to see performance data</p>
          <p className="text-sm text-gray-400 mt-2">
            Go to Portfolio page to upload your CSV files
          </p>
          {error ? (
            <p className="text-sm text-red-500 mt-2">
              Error: Failed to load portfolio data
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  // Get the most recent portfolio
  const latestPortfolio = portfolios[0];
  const holdings = latestPortfolio.holdings || [];

  // Filter holdings that have current price data and sort by performance
  const holdingsWithData = holdings
    .filter((holding: Holding) => holding.currentPrice && holding.totalPnLPercent !== undefined)
    .sort((a: Holding, b: Holding) => (b.totalPnLPercent || 0) - (a.totalPnLPercent || 0))
    .slice(0, 6); // Show top 6 performers

  if (holdingsWithData.length === 0) {
    return (
      <div className="holdings-performance">
        <div className="holdings-performance-header">
          <h3>Holdings Performance (3D)</h3>
          <p>No holdings with current price data</p>
        </div>
        <div className="holdings-performance-empty">
          <DollarSign className="empty-icon" />
          <p>Price data is being updated...</p>
        </div>
      </div>
    );
  }

  // Get overall data status
  const dataStatus = getOverallDataStatus(holdingsWithData);

  return (
    <div className="holdings-performance">
      <div className="holdings-performance-header">
        <div className="header-top">
          <h3>Holdings Performance (3D)</h3>
          <div className="live-indicator">
            {dataStatus.isLive ? (
              <div className="live-status live">
                <Wifi className="live-icon" />
                <span>Live</span>
              </div>
            ) : (
              <div className="live-status cached">
                <Clock className="live-icon" />
                <span>{dataStatus.freshCount}/{dataStatus.totalCount} Fresh</span>
              </div>
            )}
            <button 
              onClick={() => refetch()}
              className="refresh-button"
              title="Refresh data"
            >
              <RefreshCw className="refresh-icon" />
            </button>
          </div>
        </div>
        <p>Your top performing holdings</p>
        <div className="data-info">
          <span className="info-text">
            <Wifi className="info-icon" /> Live: Real-time data (≤5 min old)
          </span>
          <span className="info-text">
            <Clock className="info-icon" /> Cached: Data from cache (may be older)
          </span>
        </div>
      </div>
      
      <div className="holdings-performance-grid">
        {holdingsWithData.map((holding: Holding) => (
          <div key={holding.symbol} className="holding-card">
            <div className="holding-header">
              <div className="holding-symbol">
                <div className="symbol-icon">
                  {holding.symbol.slice(0, 2)}
                </div>
                <div className="symbol-info">
                  <span className="symbol-text">{holding.symbol}</span>
                  <span className="quantity-text">
                    {holding.quantity.toLocaleString()} {holding.type === 'c' ? 'coins' : 'shares'}
                  </span>
                </div>
              </div>
              <div className="holding-price">
                <span className="current-price">{formatCurrency(holding.currentPrice || 0)}</span>
                <div className="data-freshness">
                  {isDataFresh(holding.lastUpdated) ? (
                    <div className="freshness-indicator fresh">
                      <Wifi className="freshness-icon" />
                      <span className="freshness-text">Live</span>
                    </div>
                  ) : (
                    <div className="freshness-indicator cached">
                      <Clock className="freshness-icon" />
                      <span className="freshness-text">{formatRelativeTime(holding.lastUpdated)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="holding-performance">
              <div className="performance-row">
                <span className="label">Invested:</span>
                <span className="value">{formatCurrency(holding.totalInvested)}</span>
              </div>
              <div className="performance-row">
                <span className="label">Current:</span>
                <span className="value">{formatCurrency(holding.currentValue || 0)}</span>
              </div>
              <div className="performance-row total-pnl">
                <span className="label">P&L:</span>
                <div className="pnl-value">
                  <span className={`pnl-amount ${(holding.totalPnL || 0) > 0 ? 'positive' : 'negative'}`}>
                    {formatCurrency(holding.totalPnL || 0)}
                  </span>
                  <span className={`pnl-percent ${(holding.totalPnLPercent || 0) > 0 ? 'positive' : 'negative'}`}>
                    {holding.totalPnLPercent && holding.totalPnLPercent > 0 ? (
                      <TrendingUp className="trend-icon" />
                    ) : (
                      <TrendingDown className="trend-icon" />
                    )}
                    {formatPercentage(holding.totalPnLPercent || 0)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HoldingsPerformance; 