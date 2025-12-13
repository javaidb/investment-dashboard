import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
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

interface Trade {
  symbol: string;
  date: string;
  action: 'buy' | 'sell';
  quantity: number;
  price: number;
  total: number;
  type: 's' | 'c';
  currency: string;
}

const PortfolioPnLTracker: React.FC<PortfolioPnLTrackerProps> = ({ portfolioId }) => {
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [calculatingSymbol, setCalculatingSymbol] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [selectedSymbolTrades, setSelectedSymbolTrades] = useState<Trade[]>([]);

  useEffect(() => {
    fetchSummary();
  }, [portfolioId]);

  useEffect(() => {
    if (selectedSymbol) {
      fetchTradesForSymbol(selectedSymbol);
    }
  }, [selectedSymbol]);

  const fetchTradesForSymbol = async (symbol: string) => {
    try {
      // Fetch from cached portfolio endpoint
      const response = await fetch(`/api/portfolio/${portfolioId}/cached`);
      const portfolio = await response.json();

      if (portfolio && portfolio.trades) {
        const symbolTrades = portfolio.trades
          .filter((t: Trade) => t.symbol === symbol)
          .sort((a: Trade, b: Trade) => new Date(b.date).getTime() - new Date(a.date).getTime()); // Most recent first
        setSelectedSymbolTrades(symbolTrades);
      } else {
        setSelectedSymbolTrades([]);
      }
    } catch (err) {
      console.error('Error fetching trades:', err);
      setSelectedSymbolTrades([]);
    }
  };

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

      if (data.assets && data.assets.length > 0) {
        const firstAssetWithData = data.assets.find((a: AssetSummary) => a.hasPnLData);
        if (firstAssetWithData && !selectedSymbol) {
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

  const calculatePnL = async () => {
    try {
      setCalculating(true);
      setError(null);

      // Step 1: Fetch historical price data for all assets first
      console.log('Step 1: Fetching historical price data...');
      const fetchHistoricalResponse = await fetch(`/api/pnl/fetch-historical/${portfolioId}`, {
        method: 'POST'
      });

      const historicalData = await fetchHistoricalResponse.json();
      console.log('Historical data fetch response:', historicalData);

      if (historicalData.success) {
        console.log(`Fetched historical data for ${historicalData.fetched || 0} assets`);
      }

      // Step 2: Calculate P&L using the fetched historical data
      console.log('Step 2: Calculating P&L...');
      const response = await fetch(`/api/pnl/calculate/${portfolioId}`, {
        method: 'POST'
      });

      const data = await response.json();
      console.log('Calculate P&L response:', data);

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to calculate P&L');
      }

      // Refresh the summary after calculation
      await fetchSummary();

      const message = `Successfully calculated P&L!\n\nHistorical data: ${historicalData.fetched || 0} fetched, ${historicalData.failed || 0} failed\nP&L calculation: ${data.processed || 0} succeeded, ${data.failed || 0} failed`;
      alert(message);
    } catch (err: any) {
      console.error('Error calculating P&L:', err);
      setError(err.message || 'Failed to calculate P&L');
    } finally {
      setCalculating(false);
    }
  };

  const calculateMissingAssets = async () => {
    if (!summary) return;

    const missingAssets = summary.assets.filter(a => !a.hasPnLData);

    if (missingAssets.length === 0) {
      alert('All assets already have P&L data calculated!');
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
          } else {
            failCount++;
          }
        } catch (err: any) {
          failCount++;
        }
      }

      setBatchProgress(null);
      setCalculatingSymbol(null);

      await fetchSummary();

      alert(`Calculation complete!\\n\\nSuccessful: ${successCount}\\nFailed: ${failCount}`);
    } catch (err: any) {
      console.error('Batch calculation error:', err);
      setError(err.message || 'Batch calculation failed');
    } finally {
      setCalculating(false);
      setBatchProgress(null);
      setCalculatingSymbol(null);
    }
  };

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatPercent = (value: number): string => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  const getAssetIcon = (symbol: string) => {
    return `/api/icons/symbol/${symbol}`;
  };

  if (loading) {
    return (
      <div className="dashboard-content">
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div className="loading-spinner" style={{ margin: '0 auto 20px' }}></div>
          <p style={{ color: '#6b7280' }}>Loading P&L data...</p>
        </div>
      </div>
    );
  }

  // Sort assets by type (stocks first, then crypto) and then by total P&L (highest to lowest)
  const assetsWithData = (summary?.assets.filter(a => a.hasPnLData) || []).sort((a, b) => {
    // First sort by type: stocks ('s') before crypto ('c')
    if (a.assetInfo?.type !== b.assetInfo?.type) {
      return a.assetInfo?.type === 's' ? -1 : 1;
    }
    // Then sort by total P&L (highest to lowest, + to -)
    return (b.totalPnL || 0) - (a.totalPnL || 0);
  });
  const assetsWithoutData = summary?.assets.filter(a => !a.hasPnLData) || [];

  return (
    <div>
      <div className="dashboard-header">
        <div className="dashboard-header-content">
          <h1 className="dashboard-title">Daily P&L Tracker</h1>
          <p className="dashboard-subtitle">Track performance day by day since first purchase</p>
        </div>
        <button
          onClick={calculatePnL}
          disabled={calculating}
          style={{
            padding: '12px 24px',
            backgroundColor: calculating ? '#9ca3af' : '#4f46e5',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: calculating ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s'
          }}
        >
          {calculating ? (
            <>
              <div className="loading-spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }}></div>
              Calculating...
            </>
          ) : (
            <>
              <span>🔄</span>
              Calculate / Update P&L
            </>
          )}
        </button>
      </div>

      <div className="dashboard-content">
        {batchProgress && (
          <div className="card" style={{ marginBottom: '20px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div className="loading-spinner" style={{ width: '20px', height: '20px' }}></div>
              <div>
                <p style={{ fontSize: '14px', fontWeight: '600', color: '#1e40af' }}>Processing {calculatingSymbol}...</p>
                <p style={{ fontSize: '12px', color: '#3b82f6' }}>{batchProgress.current} of {batchProgress.total} completed</p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="card" style={{ marginBottom: '20px', backgroundColor: '#fee2e2', border: '1px solid #fecaca' }}>
            <p style={{ fontSize: '14px', fontWeight: '600', color: '#991b1b' }}>Error</p>
            <p style={{ fontSize: '12px', color: '#dc2626' }}>{error}</p>
          </div>
        )}

        {summary && summary.portfolioTotals && (
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
            border: '1px solid #e5e7eb',
            overflow: 'hidden',
            marginBottom: '24px'
          }}>
            <div style={{
              background: 'linear-gradient(to right, #f8fafc, #f1f5f9)',
              padding: '20px 24px',
              borderBottom: '1px solid #e5e7eb'
            }}>
              <h3 style={{
                fontSize: '20px',
                fontWeight: 'bold',
                color: '#111827'
              }}>Daily P&L Summary</h3>
            </div>

            <div style={{
              padding: '30px 24px',
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '24px',
              alignItems: 'center'
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: '28px',
                  fontWeight: '700',
                  color: '#111827',
                  marginBottom: '4px',
                  fontFamily: 'Futura, "Trebuchet MS", Arial, sans-serif'
                }}>
                  {formatCurrency(summary.portfolioTotals.totalValue)}
                </div>
                <div style={{
                  fontSize: '12px',
                  color: '#6b7280',
                  backgroundColor: '#f3f4f6',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  display: 'inline-block',
                  border: '1px solid #e5e7eb'
                }}>
                  Current Value
                </div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                  {summary.portfolioTotals.assetsWithData} assets
                </div>
              </div>

              <div style={{ textAlign: 'center' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  marginBottom: '4px'
                }}>
                  <div style={{
                    fontSize: '28px',
                    fontWeight: '700',
                    color: summary.portfolioTotals.totalPnL >= 0 ? '#166534' : '#dc2626',
                    fontFamily: 'Futura, "Trebuchet MS", Arial, sans-serif'
                  }}>
                    {formatCurrency(summary.portfolioTotals.totalPnL)}
                  </div>
                  <div style={{
                    fontSize: '14px',
                    fontWeight: '600',
                    color: summary.portfolioTotals.totalPnL >= 0 ? '#166534' : '#dc2626',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2px'
                  }}>
                    {summary.portfolioTotals.totalPnL >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                    {((summary.portfolioTotals.totalPnL / (summary.portfolioTotals.totalValue - summary.portfolioTotals.totalPnL)) * 100).toFixed(2)}%
                  </div>
                </div>
                <div style={{
                  fontSize: '12px',
                  color: '#6b7280',
                  backgroundColor: '#f3f4f6',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  display: 'inline-block',
                  border: '1px solid #e5e7eb'
                }}>
                  Total P&L
                </div>
              </div>

              <div style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: '28px',
                  fontWeight: '700',
                  color: summary.portfolioTotals.totalUnrealizedPnL >= 0 ? '#166534' : '#dc2626',
                  marginBottom: '4px',
                  fontFamily: 'Futura, "Trebuchet MS", Arial, sans-serif'
                }}>
                  {formatCurrency(summary.portfolioTotals.totalUnrealizedPnL)}
                </div>
                <div style={{
                  fontSize: '12px',
                  color: '#6b7280',
                  backgroundColor: '#f3f4f6',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  display: 'inline-block',
                  border: '1px solid #e5e7eb'
                }}>
                  Unrealized P&L
                </div>
              </div>

              <div style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: '28px',
                  fontWeight: '700',
                  color: summary.portfolioTotals.totalRealizedPnL >= 0 ? '#166534' : '#dc2626',
                  marginBottom: '4px',
                  fontFamily: 'Futura, "Trebuchet MS", Arial, sans-serif'
                }}>
                  {formatCurrency(summary.portfolioTotals.totalRealizedPnL)}
                </div>
                <div style={{
                  fontSize: '12px',
                  color: '#6b7280',
                  backgroundColor: '#f3f4f6',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  display: 'inline-block',
                  border: '1px solid #e5e7eb'
                }}>
                  Realized P&L
                </div>
              </div>
            </div>
          </div>
        )}

        {summary && assetsWithoutData.length > 0 && (
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
            border: '1px solid #e5e7eb',
            padding: '24px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div>
              <p style={{ fontSize: '16px', fontWeight: '700', color: '#111827', marginBottom: '4px' }}>
                {assetsWithoutData.length} assets need P&L calculation
              </p>
              <p style={{ fontSize: '14px', color: '#6b7280' }}>Calculate historical P&L for complete performance view</p>
            </div>
            <button
              onClick={calculateMissingAssets}
              disabled={calculating}
              style={{
                padding: '12px 24px',
                backgroundColor: calculating ? '#9ca3af' : '#4f46e5',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: calculating ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
              }}
              onMouseEnter={(e) => !calculating && (e.currentTarget.style.backgroundColor = '#4338ca')}
              onMouseLeave={(e) => !calculating && (e.currentTarget.style.backgroundColor = '#4f46e5')}
            >
              {calculating ? 'Calculating...' : 'Calculate Missing'}
            </button>
          </div>
        )}

        {selectedSymbol && (
          <div style={{ marginBottom: '24px' }}>
            <DailyPnLChart symbol={selectedSymbol} />
          </div>
        )}

        {assetsWithData.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: selectedSymbol ? '1fr 1fr' : '1fr', gap: '24px', marginBottom: '24px' }}>
            <div style={{
              backgroundColor: 'white',
              borderRadius: '16px',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
              border: '1px solid #e5e7eb',
              overflow: 'hidden'
            }}>
              <div style={{
                background: 'linear-gradient(to right, #f8fafc, #f1f5f9)',
                padding: '20px 24px',
                borderBottom: '1px solid #e5e7eb'
              }}>
                <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#111827', marginBottom: '4px' }}>
                  Assets with P&L Data
                </h2>
                <p style={{ fontSize: '14px', color: '#6b7280' }}>
                  {assetsWithData.length} of {summary?.totalSymbols} assets tracked
                </p>
              </div>

              <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '500px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', backgroundColor: '#f9fafb' }}>Asset</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', backgroundColor: '#f9fafb' }}>Shares</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', backgroundColor: '#f9fafb' }}>Value</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', backgroundColor: '#f9fafb' }}>Total P&L</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', backgroundColor: '#f9fafb' }}>P&L %</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', backgroundColor: '#f9fafb' }}>Days</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', backgroundColor: '#f9fafb' }}>Chart</th>
                  </tr>
                </thead>
                <tbody>
                  {assetsWithData.map((asset, index) => (
                    <tr
                      key={asset.symbol}
                      style={{
                        borderBottom: index === assetsWithData.length - 1 ? 'none' : '1px solid #f3f4f6',
                        backgroundColor: selectedSymbol === asset.symbol ? '#eff6ff' : 'transparent'
                      }}
                    >
                      <td style={{ padding: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <img
                            src={getAssetIcon(asset.symbol)}
                            alt={asset.symbol}
                            style={{ width: '36px', height: '36px', borderRadius: '8px' }}
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${asset.symbol}&size=36&background=667eea&color=fff&bold=true`;
                            }}
                          />
                          <div>
                            <div style={{ fontSize: '15px', fontWeight: '600', color: '#1f2937' }}>{asset.symbol}</div>
                            <div style={{
                              fontSize: '11px',
                              fontWeight: '600',
                              color: asset.assetInfo?.type === 's' ? '#2563eb' : '#7c3aed',
                              backgroundColor: asset.assetInfo?.type === 's' ? '#dbeafe' : '#f3e8ff',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              display: 'inline-block',
                              marginTop: '4px'
                            }}>
                              {asset.assetInfo?.type === 's' ? 'Stock' : 'Crypto'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '16px', textAlign: 'right', fontSize: '14px', color: '#374151' }}>
                        {asset.currentShares?.toFixed(4)}
                      </td>
                      <td style={{ padding: '16px', textAlign: 'right', fontSize: '14px', fontWeight: '600', color: '#1f2937' }}>
                        {formatCurrency(asset.currentValue || 0)}
                      </td>
                      <td style={{ padding: '16px', textAlign: 'right', fontSize: '14px', fontWeight: '600', color: (asset.totalPnL || 0) >= 0 ? '#10b981' : '#ef4444' }}>
                        {formatCurrency(asset.totalPnL || 0)}
                      </td>
                      <td style={{ padding: '16px', textAlign: 'right' }}>
                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '13px',
                          fontWeight: '600',
                          backgroundColor: (asset.totalPnLPercent || 0) >= 0 ? '#d1fae5' : '#fee2e2',
                          color: (asset.totalPnLPercent || 0) >= 0 ? '#065f46' : '#991b1b'
                        }}>
                          {(asset.totalPnLPercent || 0) >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                          {formatPercent(asset.totalPnLPercent || 0)}
                        </div>
                      </td>
                      <td style={{ padding: '16px', textAlign: 'center', fontSize: '13px', color: '#6b7280' }}>
                        {asset.recordCount}
                      </td>
                      <td style={{ padding: '16px', textAlign: 'center' }}>
                        <button
                          onClick={() => setSelectedSymbol(asset.symbol)}
                          className={selectedSymbol === asset.symbol ? 'btn-primary' : ''}
                          style={{
                            backgroundColor: selectedSymbol === asset.symbol ? undefined : '#f3f4f6',
                            color: selectedSymbol === asset.symbol ? undefined : '#6b7280',
                            border: 'none',
                            padding: '8px 16px',
                            borderRadius: '8px',
                            fontSize: '13px',
                            fontWeight: '500',
                            cursor: 'pointer'
                          }}
                        >
                          {selectedSymbol === asset.symbol ? 'Viewing' : 'View'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </div>

            {/* Trades Table */}
            {selectedSymbol && selectedSymbolTrades.length > 0 && (
              <div style={{
                backgroundColor: 'white',
                borderRadius: '16px',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
                border: '1px solid #e5e7eb',
                overflow: 'hidden'
              }}>
                <div style={{
                  background: 'linear-gradient(to right, #f8fafc, #f1f5f9)',
                  padding: '20px 24px',
                  borderBottom: '1px solid #e5e7eb',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}>
                  <img
                    src={getAssetIcon(selectedSymbol)}
                    alt={selectedSymbol}
                    style={{ width: '40px', height: '40px', borderRadius: '8px' }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${selectedSymbol}&size=40&background=667eea&color=fff&bold=true`;
                    }}
                  />
                  <div>
                    <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#111827', marginBottom: '4px' }}>
                      {selectedSymbol} Trades
                    </h2>
                    <p style={{ fontSize: '14px', color: '#6b7280' }}>
                      {selectedSymbolTrades.length} transactions
                    </p>
                  </div>
                </div>

                <div style={{ overflowY: 'auto', maxHeight: '500px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                      <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', backgroundColor: '#f9fafb' }}>Date</th>
                        <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', backgroundColor: '#f9fafb' }}>Action</th>
                        <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', backgroundColor: '#f9fafb' }}>Quantity</th>
                        <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', backgroundColor: '#f9fafb' }}>Running Total</th>
                        <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', backgroundColor: '#f9fafb' }}>Price</th>
                        <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', backgroundColor: '#f9fafb' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedSymbolTrades.map((trade, index) => {
                        // Calculate running total (since trades are sorted most recent first, we need to reverse calculate)
                        let runningTotal = 0;
                        for (let i = selectedSymbolTrades.length - 1; i >= index; i--) {
                          const t = selectedSymbolTrades[i];
                          if (t.action === 'buy') {
                            runningTotal += t.quantity;
                          } else {
                            runningTotal -= t.quantity;
                          }
                        }

                        return (
                        <tr
                          key={index}
                          style={{
                            borderBottom: index === selectedSymbolTrades.length - 1 ? 'none' : '1px solid #f3f4f6'
                          }}
                        >
                          <td style={{ padding: '12px 16px', fontSize: '13px', color: '#374151' }}>
                            {new Date(trade.date).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <div style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: '600',
                              backgroundColor: trade.action === 'buy' ? '#d1fae5' : '#fee2e2',
                              color: trade.action === 'buy' ? '#065f46' : '#991b1b'
                            }}>
                              <div style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                backgroundColor: trade.action === 'buy' ? '#10b981' : '#ef4444'
                              }} />
                              {trade.action.toUpperCase()}
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '13px', fontWeight: '600', color: '#111827' }}>
                            {trade.quantity.toFixed(4)}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '13px', fontWeight: '700', color: runningTotal >= 0 ? '#059669' : '#dc2626' }}>
                            {runningTotal.toFixed(4)}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '13px', color: '#6b7280' }}>
                            {formatCurrency(trade.price)}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '14px', fontWeight: '600', color: '#111827' }}>
                            {formatCurrency(trade.total)}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {assetsWithoutData.length > 0 && (
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
            border: '1px solid #e5e7eb',
            overflow: 'hidden'
          }}>
            <div style={{
              background: 'linear-gradient(to right, #f8fafc, #f1f5f9)',
              padding: '20px 24px',
              borderBottom: '1px solid #e5e7eb'
            }}>
              <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#111827' }}>
                Assets Pending Calculation ({assetsWithoutData.length})
              </h3>
            </div>
            <div style={{ padding: '24px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {assetsWithoutData.map(asset => (
                  <div key={asset.symbol} style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    backgroundColor: '#f3f4f6',
                    fontSize: '13px',
                    color: '#6b7280',
                    fontWeight: '600',
                    border: '1px solid #e5e7eb'
                  }}>
                    {asset.symbol}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PortfolioPnLTracker;
