import React, { useState, useEffect } from 'react';
import DailyPnLChart from './DailyPnLChart';

interface AssetSummary {
  symbol: string;
  assetInfo?: {
    symbol: string;
    type: 's' | 'c';
    currency: string;
    firstPurchaseDate: string;
  };
  latestDate?: string;
  currentShares?: number;
  currentValue?: number;
  totalPnL?: number;
  totalPnLPercent?: number;
  unrealizedPnL?: number;
  realizedPnL?: number;
  recordCount?: number;
  hasPnLData: boolean;
}

interface PortfolioSummary {
  portfolioId: string;
  totalSymbols: number;
  assets: AssetSummary[];
  portfolioTotals: {
    totalValue: number;
    totalPnL: number;
    totalUnrealizedPnL: number;
    totalRealizedPnL: number;
    assetsWithData: number;
    assetsWithoutData: number;
  };
}

interface PortfolioPnLTrackerProps {
  portfolioId: string;
}

const PortfolioPnLTracker: React.FC<PortfolioPnLTrackerProps> = ({ portfolioId }) => {
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [showChart, setShowChart] = useState(false);
  const [calculatingSymbol, setCalculatingSymbol] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);

  useEffect(() => {
    fetchSummary();
  }, [portfolioId]);

  const fetchSummary = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/pnl/portfolio/${portfolioId}/summary`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch PnL summary');
      }

      if (!data.success) {
        throw new Error(data.error || 'PnL summary not available');
      }

      setSummary(data);

      // Auto-select first symbol with data
      if (data.assets && data.assets.length > 0) {
        const firstAssetWithData = data.assets.find((a: AssetSummary) => a.hasPnLData);
        if (firstAssetWithData) {
          setSelectedSymbol(firstAssetWithData.symbol);
        }
      }
    } catch (err: any) {
      console.error('Error fetching PnL summary:', err);
      setError(err.message || 'Failed to load PnL summary');
    } finally {
      setLoading(false);
    }
  };

  const calculateMissingAssets = async () => {
    if (!summary) return;

    const missingAssets = summary.assets.filter(a => !a.hasPnLData);

    if (missingAssets.length === 0) {
      alert('All assets already have PnL data calculated!');
      return;
    }

    if (!window.confirm(`Calculate P&L for ${missingAssets.length} missing assets?\n\nThis will process one asset at a time and may take a few minutes.\n\nAssets: ${missingAssets.map(a => a.symbol).join(', ')}`)) {
      return;
    }

    try {
      setCalculating(true);
      setError(null);
      setBatchProgress({ current: 0, total: missingAssets.length });

      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < missingAssets.length; i++) {
        const asset = missingAssets[i];
        setCalculatingSymbol(asset.symbol);
        setBatchProgress({ current: i + 1, total: missingAssets.length });

        try {
          const response = await fetch(`/api/pnl/update/${asset.symbol}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ portfolioId }),
          });

          const data = await response.json();

          if (data.success) {
            successCount++;
            console.log(`✅ ${asset.symbol}: ${data.recordCount} records calculated`);
          } else {
            failCount++;
            console.error(`❌ ${asset.symbol}: ${data.error}`);
          }
        } catch (err: any) {
          failCount++;
          console.error(`❌ ${asset.symbol}:`, err.message);
        }
      }

      setBatchProgress(null);
      setCalculatingSymbol(null);

      // Refresh summary to show new data
      await fetchSummary();

      alert(`Batch calculation complete!\n\nSuccessful: ${successCount}\nFailed: ${failCount}`);
    } catch (err: any) {
      console.error('Batch calculation error:', err);
      setError(err.message || 'Batch calculation failed');
    } finally {
      setCalculating(false);
      setBatchProgress(null);
      setCalculatingSymbol(null);
    }
  };

  const calculatePnL = async () => {
    try {
      setCalculating(true);
      setError(null);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout

      const response = await fetch(`/api/pnl/calculate/${portfolioId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('Non-JSON response:', text);
        throw new Error('Server returned an invalid response. Check browser console for details.');
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to calculate PnL');
      }

      if (!data.success) {
        throw new Error(data.error || 'PnL calculation failed');
      }

      // Refresh summary after calculation
      await fetchSummary();

      alert(`PnL calculation complete!\nProcessed: ${data.processed} assets\nFailed: ${data.failed} assets`);
    } catch (err: any) {
      console.error('Error calculating PnL:', err);

      let errorMessage = err.message || 'Failed to calculate PnL';

      if (err.name === 'AbortError') {
        errorMessage = 'Calculation timed out after 2 minutes. This may indicate missing historical data or server issues.';
      }

      setError(errorMessage);
      alert(`Error: ${errorMessage}\n\nNote: If you see a timeout, try refreshing the page - some assets may have been calculated successfully.`);
    } finally {
      setCalculating(false);
    }
  };

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const formatPercent = (value: number): string => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 bg-white rounded-lg shadow">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading portfolio PnL data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header and Actions */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Daily P&L Tracker</h1>
            <p className="text-gray-600 mt-1">Track your portfolio performance day by day</p>
            {batchProgress && (
              <p className="text-sm text-indigo-600 mt-2 font-medium">
                Processing {calculatingSymbol}... ({batchProgress.current} of {batchProgress.total})
              </p>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={calculateMissingAssets}
              disabled={calculating}
              className={`px-6 py-3 rounded-lg font-semibold text-white transition-colors ${
                calculating
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {calculating && batchProgress ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {batchProgress.current}/{batchProgress.total}
                </span>
              ) : (
                'Calculate Missing'
              )}
            </button>
            <button
              onClick={calculatePnL}
              disabled={calculating}
              className={`px-6 py-3 rounded-lg font-semibold text-white transition-colors ${
                calculating
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              {calculating && !batchProgress ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Updating...
                </span>
              ) : (
                'Update All'
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <p className="text-red-800 font-semibold">Error</p>
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {/* Portfolio Totals */}
        {summary && summary.portfolioTotals && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-gray-200">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4">
              <p className="text-xs text-blue-600 font-medium">Total Portfolio Value</p>
              <p className="text-2xl font-bold text-blue-800 mt-1">
                {formatCurrency(summary.portfolioTotals.totalValue)}
              </p>
            </div>
            <div className={`rounded-lg p-4 ${
              summary.portfolioTotals.totalPnL >= 0
                ? 'bg-gradient-to-br from-green-50 to-green-100'
                : 'bg-gradient-to-br from-red-50 to-red-100'
            }`}>
              <p className={`text-xs font-medium ${
                summary.portfolioTotals.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                Total P&L
              </p>
              <p className={`text-2xl font-bold mt-1 ${
                summary.portfolioTotals.totalPnL >= 0 ? 'text-green-800' : 'text-red-800'
              }`}>
                {formatCurrency(summary.portfolioTotals.totalPnL)}
              </p>
            </div>
            <div className={`rounded-lg p-4 ${
              summary.portfolioTotals.totalUnrealizedPnL >= 0
                ? 'bg-gradient-to-br from-emerald-50 to-emerald-100'
                : 'bg-gradient-to-br from-orange-50 to-orange-100'
            }`}>
              <p className={`text-xs font-medium ${
                summary.portfolioTotals.totalUnrealizedPnL >= 0 ? 'text-emerald-600' : 'text-orange-600'
              }`}>
                Unrealized P&L
              </p>
              <p className={`text-2xl font-bold mt-1 ${
                summary.portfolioTotals.totalUnrealizedPnL >= 0 ? 'text-emerald-800' : 'text-orange-800'
              }`}>
                {formatCurrency(summary.portfolioTotals.totalUnrealizedPnL)}
              </p>
            </div>
            <div className={`rounded-lg p-4 ${
              summary.portfolioTotals.totalRealizedPnL >= 0
                ? 'bg-gradient-to-br from-teal-50 to-teal-100'
                : 'bg-gradient-to-br from-pink-50 to-pink-100'
            }`}>
              <p className={`text-xs font-medium ${
                summary.portfolioTotals.totalRealizedPnL >= 0 ? 'text-teal-600' : 'text-pink-600'
              }`}>
                Realized P&L
              </p>
              <p className={`text-2xl font-bold mt-1 ${
                summary.portfolioTotals.totalRealizedPnL >= 0 ? 'text-teal-800' : 'text-pink-800'
              }`}>
                {formatCurrency(summary.portfolioTotals.totalRealizedPnL)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Asset List */}
      {summary && summary.assets && summary.assets.length > 0 && (
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Assets</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Symbol</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Shares</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Value</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total P&L</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">P&L %</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Records</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {summary.assets.map((asset) => (
                  <tr
                    key={asset.symbol}
                    className={`hover:bg-gray-50 transition-colors ${
                      selectedSymbol === asset.symbol ? 'bg-indigo-50' : ''
                    }`}
                  >
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="font-semibold text-gray-800">{asset.symbol}</div>
                      {asset.assetInfo?.firstPurchaseDate && (
                        <div className="text-xs text-gray-500">
                          Since {formatDate(asset.assetInfo.firstPurchaseDate)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        asset.assetInfo?.type === 's'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-purple-100 text-purple-800'
                      }`}>
                        {asset.assetInfo?.type === 's' ? 'Stock' : 'Crypto'}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-right text-sm text-gray-700">
                      {asset.hasPnLData ? asset.currentShares?.toFixed(4) : '-'}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-semibold text-gray-800">
                      {asset.hasPnLData ? formatCurrency(asset.currentValue || 0) : '-'}
                    </td>
                    <td className={`px-4 py-4 whitespace-nowrap text-right text-sm font-semibold ${
                      asset.hasPnLData
                        ? (asset.totalPnL || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                        : 'text-gray-400'
                    }`}>
                      {asset.hasPnLData ? formatCurrency(asset.totalPnL || 0) : '-'}
                    </td>
                    <td className={`px-4 py-4 whitespace-nowrap text-right text-sm font-semibold ${
                      asset.hasPnLData
                        ? (asset.totalPnLPercent || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                        : 'text-gray-400'
                    }`}>
                      {asset.hasPnLData ? formatPercent(asset.totalPnLPercent || 0) : '-'}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-gray-600">
                      {asset.hasPnLData ? asset.recordCount : '-'}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-center">
                      {asset.hasPnLData ? (
                        <button
                          onClick={() => {
                            setSelectedSymbol(asset.symbol);
                            setShowChart(true);
                          }}
                          className="text-indigo-600 hover:text-indigo-900 font-medium text-sm"
                        >
                          View Chart
                        </button>
                      ) : (
                        <span className="text-gray-400 text-sm">No data</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Chart Display */}
      {showChart && selectedSymbol && (
        <div>
          <div className="flex justify-end mb-2">
            <button
              onClick={() => setShowChart(false)}
              className="text-gray-600 hover:text-gray-800 font-medium text-sm"
            >
              Hide Chart
            </button>
          </div>
          <DailyPnLChart symbol={selectedSymbol} />
        </div>
      )}
    </div>
  );
};

export default PortfolioPnLTracker;
