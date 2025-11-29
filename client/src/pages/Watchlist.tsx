import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import axios from 'axios';
import { useCache } from '../contexts/CacheContext';
import HoldingsChartWrapper from '../components/HoldingsChartWrapper';
import ProfitLossBarChart from '../components/ProfitLossBarChart';
import PriceOffsetBarChart from '../components/PriceOffsetBarChart';

interface Holding {
  symbol: string;
  quantity: number;
  averagePrice: number;
  totalInvested: number;
  totalAmountInvested?: number;
  realizedPnL: number;
  amountSold?: number;
  type: string;
  currency: string;
  companyName?: string;
  currentPrice?: number;
  currentValue?: number;
  unrealizedPnL?: number;
  totalPnL?: number;
  totalPnLPercent?: number;
  usdPrice?: number;
  exchangeRate?: number;
  cacheUsed?: boolean;
  weeklyChangePercent?: number;
  currentPosition?: number;
  lastWeekPosition?: number;
  positionChange?: 'up' | 'down' | 'same' | 'new';
}

const Watchlist: React.FC = () => {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [weeklyChanges, setWeeklyChanges] = useState<{[symbol: string]: number}>({});

  const queryClient = useQueryClient();
  const {
    holdings: cachedHoldings,
    latestPortfolio,
    recurringInvestments,
    isLoading,
    error: cacheError,
  } = useCache();

  // Use React Query for persistent portfolio cache that survives browser sessions
  const { data: persistentPortfolio } = useQuery(
    'persistent-portfolio-cache',
    () => ({ holdings: cachedHoldings, portfolio: latestPortfolio }),
    {
      enabled: !!latestPortfolio && !!cachedHoldings && Object.keys(cachedHoldings).length > 0,
      staleTime: Infinity,
      cacheTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      refetchInterval: false,
    }
  );

  // Use persistent data if available, fallback to cache context
  const activeHoldings = persistentPortfolio?.holdings || cachedHoldings;
  const activePortfolio = persistentPortfolio?.portfolio || latestPortfolio;

  // Fetch weekly changes from historical cache
  const { data: weeklyChangesData } = useQuery(
    ['weekly-changes-batch', activePortfolio?.holdings?.map((h: Holding) => h.symbol).join(',')],
    async () => {
      if (!activePortfolio?.holdings || activePortfolio.holdings.length === 0) return {};

      console.log('🔄 Fetching weekly changes for', activePortfolio.holdings.length, 'holdings via batch endpoint');
      const symbols = activePortfolio.holdings.map((h: Holding) => h.symbol);

      try {
        const response = await axios.post('/api/portfolio/cache/weekly-changes', { symbols });
        console.log('✅ Weekly changes batch response:', response.data);
        return response.data.weeklyChanges || {};
      } catch (error) {
        console.error('❌ Failed to fetch weekly changes batch:', error);
        return {};
      }
    },
    {
      enabled: !!activePortfolio?.holdings && activePortfolio.holdings.length > 0,
      staleTime: 300000, // 5 minutes
      cacheTime: 900000, // 15 minutes
      retry: 1
    }
  );

  // Update weekly changes when data is available
  useEffect(() => {
    if (weeklyChangesData) {
      setWeeklyChanges(weeklyChangesData);
    }
  }, [weeklyChangesData]);

  // Update holdings when activePortfolio or weekly changes change
  useEffect(() => {
    if (activePortfolio?.holdings) {
      const sortedHoldings = [...activePortfolio.holdings].map((holding: Holding) => ({
        ...holding,
        weeklyChangePercent: weeklyChanges[holding.symbol] || holding.weeklyChangePercent
      })).sort((a, b) => {
        const aValue = (a.totalPnL || 0);
        const bValue = (b.totalPnL || 0);
        return bValue - aValue;
      });
      setHoldings(sortedHoldings);
    }
  }, [activePortfolio, weeklyChanges]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header Section */}
      <div className="dashboard-header">
        <div className="dashboard-header-content">
          <h1 className="dashboard-title">Watchlist</h1>
          <p className="dashboard-subtitle">Monitor your portfolio performance and asset allocation</p>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ padding: '1rem 0.5rem' }}>
        <div style={{ maxWidth: '2000px', margin: '0 auto' }}>
          <div style={{ marginBottom: '1rem' }}>

            {/* Holdings Chart */}
            {holdings.length > 0 && (
              <div style={{
                backgroundColor: 'white',
                borderRadius: '16px',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
                border: '1px solid #e5e7eb',
                overflow: 'hidden',
                width: '100%',
                marginBottom: '24px'
              }}>
                <HoldingsChartWrapper />
              </div>
            )}

            {/* Profit/Loss Bar Chart */}
            {holdings.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <ProfitLossBarChart holdings={holdings} />
              </div>
            )}

            {/* Price Offset Bar Chart */}
            {holdings.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <PriceOffsetBarChart holdings={holdings} />
              </div>
            )}

            {/* Empty State */}
            {holdings.length === 0 && !isLoading && (
              <div className="card text-center py-12">
                <p className="text-gray-500">No holdings data available</p>
                <p className="text-sm text-gray-400 mt-2">Upload portfolio data to see your watchlist</p>
              </div>
            )}

            {/* Loading State */}
            {isLoading && (
              <div className="card text-center py-12">
                <div className="loading-spinner mx-auto mb-4"></div>
                <p className="text-gray-500">Loading watchlist...</p>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};

export default Watchlist;
