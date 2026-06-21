import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import DailyPnLChart from './DailyPnLChart';
import TotalPortfolioPnLChart from './TotalPortfolioPnLChart';

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
  folder?: string;
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

  const getAssetIcon = (symbol: string, type: 's' | 'c' = 's') => {
    return `/api/icons/symbol/${symbol}/image?type=${type}`;
  };

  const getSourceBadge = (folder?: string) => {
    if (!folder) return null;

    let imageName = '';
    let alt = '';

    if (folder === 'wealthsimple') {
      imageName = 'WS.png';
      alt = 'Wealthsimple';
    } else if (folder === 'questrade') {
      imageName = 'QS.png';
      alt = 'Questrade';
    } else if (folder === 'crypto') {
      imageName = 'BB.png';
      alt = 'Crypto';
    } else {
      return null;
    }

    return (
      <img
        src={`/api/icons/image/${imageName}`}
        alt={alt}
        title={alt}
        style={{
          width: '20px',
          height: '20px',
          objectFit: 'contain',
          display: 'inline-block',
          verticalAlign: 'middle'
        }}
        onError={(e) => {
          // Fallback to text if image fails to load
          const target = e.target as HTMLImageElement;
          target.style.display = 'none';
          const textBadge = document.createElement('span');
          textBadge.textContent = imageName.replace('.png', '');
          textBadge.style.cssText = 'font-size: 9px; font-weight: 700; padding: 2px 5px; border-radius: 4px; background: #f3f4f6; color: #6b7280;';
          target.parentNode?.insertBefore(textBadge, target);
        }}
      />
    );
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div className="loading-spinner" style={{ margin: '0 auto 20px' }}></div>
        <p style={{ color: '#64748b', fontFamily: "'IBM Plex Mono', monospace", fontSize: '13px' }}>Loading P&L data...</p>
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
      {/* Header */}
      <div style={{ background: '#10141c', borderBottom: '1px solid #1e2535', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: "'IBM Plex Mono', 'Courier New', monospace", fontSize: '12px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase' as const }}>
            Daily P&L Tracker
          </div>
          <div style={{ fontSize: '11px', color: '#4a5568', marginTop: '2px', fontFamily: "'IBM Plex Mono', monospace" }}>
            Track performance day by day since first purchase
          </div>
        </div>
        <button
          onClick={calculatePnL}
          disabled={calculating}
          style={{
            padding: '7px 16px',
            backgroundColor: calculating ? 'rgba(100,116,139,0.1)' : 'rgba(79,70,229,0.15)',
            color: calculating ? '#4a5568' : '#818cf8',
            border: `1px solid ${calculating ? '#1e2535' : 'rgba(79,70,229,0.35)'}`,
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 700,
            fontFamily: "'IBM Plex Mono', monospace",
            cursor: calculating ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s'
          }}
        >
          {calculating ? (
            <>
              <div className="loading-spinner" style={{ width: '12px', height: '12px', borderWidth: '2px' }}></div>
              Calculating...
            </>
          ) : (
            'Calculate / Update P&L'
          )}
        </button>
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {batchProgress && (
          <div style={{ backgroundColor: '#10141c', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '8px', padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div className="loading-spinner" style={{ width: '16px', height: '16px' }}></div>
              <div>
                <p style={{ fontSize: '13px', fontWeight: 700, color: '#60a5fa', fontFamily: "'IBM Plex Mono', monospace" }}>Processing {calculatingSymbol}...</p>
                <p style={{ fontSize: '11px', color: '#4a5568', fontFamily: "'IBM Plex Mono', monospace" }}>{batchProgress.current} of {batchProgress.total} completed</p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div style={{ backgroundColor: '#10141c', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '16px' }}>
            <p style={{ fontSize: '13px', fontWeight: 700, color: '#f87171', fontFamily: "'IBM Plex Mono', monospace", marginBottom: '4px' }}>Error</p>
            <p style={{ fontSize: '12px', color: '#64748b', fontFamily: "'IBM Plex Mono', monospace" }}>{error}</p>
          </div>
        )}

        {summary && summary.portfolioTotals && (
          <div style={{ backgroundColor: '#10141c', borderRadius: '8px', border: '1px solid #1e2535', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #1e2535' }}>
              <h3 style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase' as const }}>Daily P&L Summary</h3>
            </div>
            <div style={{ padding: '20px 18px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', alignItems: 'center' }}>
              {[
                { label: 'Current Value', value: formatCurrency(summary.portfolioTotals.totalValue), color: '#e2e8f0', sub: `${summary.portfolioTotals.assetsWithData} assets` },
                { label: 'Total P&L', value: formatCurrency(summary.portfolioTotals.totalPnL), color: summary.portfolioTotals.totalPnL >= 0 ? '#34d399' : '#f87171', sub: `${((summary.portfolioTotals.totalPnL / (summary.portfolioTotals.totalValue - summary.portfolioTotals.totalPnL)) * 100).toFixed(2)}%` },
                { label: 'Unrealized P&L', value: formatCurrency(summary.portfolioTotals.totalUnrealizedPnL), color: summary.portfolioTotals.totalUnrealizedPnL >= 0 ? '#34d399' : '#f87171', sub: null },
                { label: 'Realized P&L', value: formatCurrency(summary.portfolioTotals.totalRealizedPnL), color: summary.portfolioTotals.totalRealizedPnL >= 0 ? '#34d399' : '#f87171', sub: null },
              ].map(({ label, value, color, sub }) => (
                <div key={label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '22px', fontWeight: 700, color, marginBottom: '6px', fontFamily: "'IBM Plex Mono', monospace" }}>{value}</div>
                  <div style={{ fontSize: '10px', color: '#64748b', backgroundColor: 'rgba(30,37,53,0.6)', padding: '2px 8px', borderRadius: '4px', display: 'inline-block', border: '1px solid #1e2535', fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>{label}</div>
                  {sub && <div style={{ fontSize: '11px', color: '#4a5568', marginTop: '4px', fontFamily: "'IBM Plex Mono', monospace" }}>{sub}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {summary && assetsWithoutData.length > 0 && (
          <div style={{ backgroundColor: '#10141c', border: '1px solid rgba(251,191,36,0.2)', borderRadius: '8px', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: '13px', fontWeight: 700, color: '#fbbf24', fontFamily: "'IBM Plex Mono', monospace", marginBottom: '3px' }}>
                {assetsWithoutData.length} assets need P&L calculation
              </p>
              <p style={{ fontSize: '11px', color: '#4a5568', fontFamily: "'IBM Plex Mono', monospace" }}>Calculate historical P&L for complete performance view</p>
            </div>
            <button
              onClick={calculateMissingAssets}
              disabled={calculating}
              style={{
                padding: '6px 14px',
                backgroundColor: calculating ? 'rgba(100,116,139,0.1)' : 'rgba(251,191,36,0.12)',
                color: calculating ? '#4a5568' : '#fbbf24',
                border: `1px solid ${calculating ? '#1e2535' : 'rgba(251,191,36,0.3)'}`,
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 700,
                fontFamily: "'IBM Plex Mono', monospace",
                cursor: calculating ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {calculating ? 'Calculating...' : 'Calculate Missing'}
            </button>
          </div>
        )}

        {/* Charts Section - Portfolio Total and Individual Symbol Side by Side */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: selectedSymbol ? '1fr 1fr' : '1fr',
          gap: '24px',
          marginBottom: '24px'
        }}>
          {/* Total Portfolio P&L Chart */}
          <TotalPortfolioPnLChart portfolioId={portfolioId} />

          {/* Individual Symbol P&L Chart */}
          {selectedSymbol && (
            <DailyPnLChart symbol={selectedSymbol} />
          )}
        </div>

        {assetsWithData.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: selectedSymbol ? '1fr 1fr' : '1fr', gap: '14px' }}>
            <div style={{ backgroundColor: '#10141c', borderRadius: '8px', border: '1px solid #1e2535', overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #1e2535' }}>
                <h2 style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase' as const, marginBottom: '2px' }}>
                  Assets with P&L Data
                </h2>
                <p style={{ fontSize: '11px', color: '#4a5568', fontFamily: "'IBM Plex Mono', monospace" }}>
                  {assetsWithData.length} of {summary?.totalSymbols} assets tracked
                </p>
              </div>

              <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '500px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#10141c' }}>
                  <tr style={{ borderBottom: '1px solid #1e2535' }}>
                    {['Asset','Type','Status','Shares','Value','Total P&L','P&L %','Days','Chart'].map((h, i) => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: i === 0 ? 'left' : i >= 3 && i <= 7 ? 'right' : 'center', fontSize: '10px', fontWeight: 700, color: '#4a5568', textTransform: 'uppercase' as const, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.08em', background: '#10141c', whiteSpace: 'nowrap' as const }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {assetsWithData.map((asset, index) => (
                    <tr
                      key={asset.symbol}
                      style={{
                        borderBottom: index === assetsWithData.length - 1 ? 'none' : '1px solid #131720',
                        backgroundColor: selectedSymbol === asset.symbol ? 'rgba(59,130,246,0.08)' : 'transparent',
                        cursor: 'pointer'
                      }}
                      onClick={() => setSelectedSymbol(asset.symbol)}
                    >
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <img
                            src={getAssetIcon(asset.symbol, asset.assetInfo?.type)}
                            alt={asset.symbol}
                            style={{ width: '28px', height: '28px', borderRadius: '6px' }}
                            onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${asset.symbol}&size=28&background=667eea&color=fff&bold=true`; }}
                          />
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#cbd5e1', fontFamily: "'IBM Plex Mono', monospace" }}>
                            {asset.symbol}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <div style={{ fontSize: '10px', fontWeight: 700, color: asset.assetInfo?.type === 's' ? '#60a5fa' : '#a78bfa', backgroundColor: asset.assetInfo?.type === 's' ? 'rgba(37,99,235,0.12)' : 'rgba(124,58,237,0.12)', padding: '3px 8px', borderRadius: '4px', display: 'inline-block', fontFamily: "'IBM Plex Mono', monospace", border: `1px solid ${asset.assetInfo?.type === 's' ? 'rgba(37,99,235,0.25)' : 'rgba(124,58,237,0.25)'}` }}>
                          {asset.assetInfo?.type === 's' ? 'Stock' : 'Crypto'}
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <div style={{ fontSize: '10px', fontWeight: 700, color: (asset.currentShares || 0) >= 0.0001 ? '#34d399' : '#64748b', backgroundColor: (asset.currentShares || 0) >= 0.0001 ? 'rgba(16,185,129,0.1)' : 'rgba(100,116,139,0.1)', padding: '3px 8px', borderRadius: '4px', display: 'inline-block', fontFamily: "'IBM Plex Mono', monospace", border: `1px solid ${(asset.currentShares || 0) >= 0.0001 ? 'rgba(16,185,129,0.25)' : 'rgba(100,116,139,0.2)'}` }}>
                          {(asset.currentShares || 0) >= 0.0001 ? 'Active' : 'Inactive'}
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '12px', color: '#94a3b8', fontFamily: "'IBM Plex Mono', monospace" }}>
                        {asset.currentShares?.toFixed(4)}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '12px', fontWeight: 700, color: '#cbd5e1', fontFamily: "'IBM Plex Mono', monospace" }}>
                        {formatCurrency(asset.currentValue || 0)}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '12px', fontWeight: 700, color: (asset.totalPnL || 0) >= 0 ? '#34d399' : '#f87171', fontFamily: "'IBM Plex Mono', monospace" }}>
                        {formatCurrency(asset.totalPnL || 0)}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", backgroundColor: (asset.totalPnLPercent || 0) >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: (asset.totalPnLPercent || 0) >= 0 ? '#34d399' : '#f87171', border: `1px solid ${(asset.totalPnLPercent || 0) >= 0 ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}` }}>
                          {(asset.totalPnLPercent || 0) >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                          {formatPercent(asset.totalPnLPercent || 0)}
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: '12px', color: '#64748b', fontFamily: "'IBM Plex Mono', monospace" }}>
                        {asset.recordCount}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedSymbol(asset.symbol); }}
                          style={{
                            backgroundColor: selectedSymbol === asset.symbol ? 'rgba(59,130,246,0.15)' : 'rgba(30,37,53,0.6)',
                            color: selectedSymbol === asset.symbol ? '#60a5fa' : '#64748b',
                            border: `1px solid ${selectedSymbol === asset.symbol ? 'rgba(59,130,246,0.35)' : '#1e2535'}`,
                            padding: '4px 12px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 700,
                            fontFamily: "'IBM Plex Mono', monospace",
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
              <div style={{ backgroundColor: '#10141c', borderRadius: '8px', border: '1px solid #1e2535', overflow: 'hidden' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid #1e2535', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <img
                    src={getAssetIcon(selectedSymbol, assetsWithData.find(a => a.symbol === selectedSymbol)?.assetInfo?.type)}
                    alt={selectedSymbol}
                    style={{ width: '28px', height: '28px', borderRadius: '6px' }}
                    onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${selectedSymbol}&size=28&background=667eea&color=fff&bold=true`; }}
                  />
                  <div>
                    <h2 style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase' as const }}>
                      {selectedSymbol} Trades
                    </h2>
                    <p style={{ fontSize: '11px', color: '#4a5568', fontFamily: "'IBM Plex Mono', monospace" }}>
                      {selectedSymbolTrades.length} transactions
                    </p>
                  </div>
                </div>
                <div style={{ overflowY: 'auto', maxHeight: '500px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#10141c' }}>
                      <tr style={{ borderBottom: '1px solid #1e2535' }}>
                        {['Date','Action','Source','Quantity','Running Total','Price','Total'].map((h, i) => (
                          <th key={h} style={{ padding: '8px 12px', textAlign: i === 0 || i === 1 || i === 2 ? 'left' : 'right', fontSize: '10px', fontWeight: 700, color: '#4a5568', textTransform: 'uppercase' as const, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.08em', background: '#10141c', whiteSpace: 'nowrap' as const }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selectedSymbolTrades.map((trade, index) => {
                        let runningTotal = 0;
                        for (let i = selectedSymbolTrades.length - 1; i >= index; i--) {
                          const t = selectedSymbolTrades[i];
                          runningTotal += t.action === 'buy' ? t.quantity : -t.quantity;
                        }
                        return (
                          <tr key={index} style={{ borderBottom: index === selectedSymbolTrades.length - 1 ? 'none' : '1px solid #131720' }}>
                            <td style={{ padding: '9px 12px', fontSize: '11px', color: '#94a3b8', fontFamily: "'IBM Plex Mono', monospace" }}>
                              {new Date(trade.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </td>
                            <td style={{ padding: '9px 12px' }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", backgroundColor: trade.action === 'buy' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: trade.action === 'buy' ? '#34d399' : '#f87171', border: `1px solid ${trade.action === 'buy' ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}` }}>
                                <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: trade.action === 'buy' ? '#34d399' : '#f87171' }} />
                                {trade.action.toUpperCase()}
                              </div>
                            </td>
                            <td style={{ padding: '9px 12px' }}>{getSourceBadge(trade.folder)}</td>
                            <td style={{ padding: '9px 12px', textAlign: 'right', fontSize: '12px', fontWeight: 700, color: '#cbd5e1', fontFamily: "'IBM Plex Mono', monospace" }}>{trade.quantity.toFixed(4)}</td>
                            <td style={{ padding: '9px 12px', textAlign: 'right', fontSize: '12px', fontWeight: 700, color: runningTotal >= 0 ? '#34d399' : '#f87171', fontFamily: "'IBM Plex Mono', monospace" }}>{runningTotal.toFixed(4)}</td>
                            <td style={{ padding: '9px 12px', textAlign: 'right', fontSize: '12px', color: '#64748b', fontFamily: "'IBM Plex Mono', monospace" }}>{formatCurrency(trade.price)}</td>
                            <td style={{ padding: '9px 12px', textAlign: 'right', fontSize: '12px', fontWeight: 700, color: '#cbd5e1', fontFamily: "'IBM Plex Mono', monospace" }}>{formatCurrency(trade.total)}</td>
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
          <div style={{ backgroundColor: '#10141c', borderRadius: '8px', border: '1px solid #1e2535', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #1e2535' }}>
              <h3 style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase' as const }}>
                Assets Pending Calculation ({assetsWithoutData.length})
              </h3>
            </div>
            <div style={{ padding: '16px 18px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {assetsWithoutData.map(asset => (
                  <div key={asset.symbol} style={{ padding: '4px 10px', borderRadius: '4px', backgroundColor: 'rgba(100,116,139,0.08)', fontSize: '12px', color: '#64748b', fontWeight: 700, border: '1px solid rgba(100,116,139,0.2)', fontFamily: "'IBM Plex Mono', monospace" }}>
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
