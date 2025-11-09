import React, { useState, useEffect } from 'react';
import { useCache } from '../contexts/CacheContext';
import axios from 'axios';
import CompanyIcon from '../components/CompanyIcon';
import { useIcons } from '../hooks/useIcons';

interface RiskMetrics {
  sharpeRatio: number | null;
  volatility: number | null;
  beta: number | null;
  maxDrawdown: number | null;
  totalReturn: number | null;
  riskLevel: string;
}

interface HoldingWithRisk {
  symbol: string;
  companyName: string;
  quantity: number;
  totalInvested: number;
  currentValue: number;
  totalPnL: number;
  totalPnLPercent: number;
  type: string;
  currentPrice?: number;
  sharpeRatio: number | null;
  volatility: number | null;
  beta: number | null;
  maxDrawdown: number | null;
  totalReturn: number | null;
  riskLevel: string;
}

const Ratios: React.FC = () => {
  const { latestPortfolio, isLoading: cacheLoading } = useCache();
  const [riskData, setRiskData] = useState<HoldingWithRisk[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch icons for all holdings
  const symbolsForIcons = riskData.length > 0 ? riskData.map(holding => ({
    symbol: holding.symbol,
    type: holding.type || 's'
  })) : [];

  const { iconUrls } = useIcons({
    symbols: symbolsForIcons,
    enabled: riskData.length > 0
  });

  useEffect(() => {
    const fetchRiskMetrics = async () => {
      if (!latestPortfolio?.id) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        console.log('📊 Fetching risk metrics for portfolio:', latestPortfolio.id);

        const response = await axios.get(`/api/portfolio/${latestPortfolio.id}/risk-metrics`);
        console.log('✅ Risk metrics received:', response.data);

        setRiskData(response.data.holdings || []);
      } catch (err: any) {
        console.error('❌ Error fetching risk metrics:', err);
        setError(err.response?.data?.error || 'Failed to load risk metrics');
      } finally {
        setIsLoading(false);
      }
    };

    fetchRiskMetrics();
  }, [latestPortfolio?.id]);

  if (cacheLoading || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading risk metrics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="dashboard-header">
          <div className="dashboard-header-content">
            <h1 className="dashboard-title">Risk & Reward Ratios</h1>
            <p className="dashboard-subtitle">Analyze risk metrics for your holdings</p>
          </div>
        </div>
        <div className="dashboard-content">
          <div className="max-w-7xl mx-auto">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800">Error: {error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!riskData || riskData.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="dashboard-header">
          <div className="dashboard-header-content">
            <h1 className="dashboard-title">Risk & Reward Ratios</h1>
            <p className="dashboard-subtitle">Analyze risk metrics for your holdings</p>
          </div>
        </div>
        <div className="dashboard-content">
          <div className="max-w-7xl mx-auto">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-yellow-800">No holdings data available. Please upload your portfolio CSV files.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header Section */}
      <div className="dashboard-header">
        <div className="dashboard-header-content">
          <h1 className="dashboard-title">Risk & Reward Ratios</h1>
          <p className="dashboard-subtitle">Traditional metrics for assessing risk and reward for each holding</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="dashboard-content">
        <div className="max-w-full mx-auto px-4">
          <div className="dashboard-section">
            {/* Info Box */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <h3 className="text-sm font-semibold text-blue-900 mb-2">Understanding the Metrics</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-blue-800">
                <div>
                  <strong>Sharpe Ratio:</strong> Risk-adjusted returns. Higher is better. &gt;1 is good, &gt;2 is excellent.
                </div>
                <div>
                  <strong>Volatility:</strong> Annualized price fluctuation (%). Lower = more stable.
                </div>
                <div>
                  <strong>Beta:</strong> Volatility vs market. ~1.0 = market average, &gt;1 = more volatile.
                </div>
                <div>
                  <strong>Max Drawdown:</strong> Worst peak-to-trough decline (%). Shows maximum historical loss.
                </div>
                <div>
                  <strong>Risk Level:</strong> Overall risk classification based on volatility patterns.
                </div>
              </div>
            </div>

            {/* Table */}
            <div style={{
              backgroundColor: 'white',
              borderRadius: '16px',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
              border: '1px solid #e5e7eb',
              overflow: 'hidden',
              width: '100%'
            }}>
              <div style={{
                background: 'linear-gradient(to right, #f8fafc, #f1f5f9)',
                padding: '20px 24px',
                borderBottom: '1px solid #e5e7eb'
              }}>
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                  <h3 style={{
                    fontSize: '20px',
                    fontWeight: 'bold',
                    color: '#111827'
                  }}>Risk Metrics Breakdown</h3>
                  <div style={{
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#6b7280',
                    backgroundColor: 'white',
                    padding: '6px 12px',
                    borderRadius: '20px',
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
                  }}>{riskData.length} assets</div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full" style={{backgroundColor: 'white', border: '1px solid #e5e7eb'}}>
                  <thead>
                    <tr style={{backgroundColor: '#f8fafc', borderBottom: '2px solid #e5e7eb'}}>
                      <th className="text-center py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 12px', width: '80px'}}>
                        #
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                        Symbol
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px', width: '80px'}}>
                        Icon
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                        Company
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                        Type
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                        Shares
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                        Current Price
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                        Sharpe Ratio
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                        Volatility %
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                        Beta
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                        Max Drawdown %
                      </th>
                      <th className="text-center py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                        Risk Level
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {riskData.map((holding, index) => (
                      <tr key={holding.symbol} style={{
                        backgroundColor: index % 2 === 0 ? '#ffffff' : '#f9fafb',
                        borderBottom: '1px solid #f3f4f6',
                        transition: 'all 0.2s ease'
                      }} onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#f0f9ff';
                      }} onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = index % 2 === 0 ? '#ffffff' : '#f9fafb';
                      }}>
                        <td className="py-4 px-6" style={{padding: '16px 12px', textAlign: 'center'}}>
                          <div style={{
                            fontSize: '16px',
                            fontWeight: '700',
                            color: '#111827',
                            fontFamily: 'Futura, "Trebuchet MS", Arial, sans-serif'
                          }}>
                            {index + 1}
                          </div>
                        </td>
                        <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                          <div style={{
                            fontSize: '16px',
                            fontWeight: '600',
                            color: '#111827'
                          }}>
                            {holding.symbol}
                          </div>
                        </td>
                        <td className="py-4 px-6" style={{padding: '20px 24px', textAlign: 'center'}}>
                          <CompanyIcon
                            symbol={holding.symbol}
                            iconUrl={iconUrls[holding.symbol.toUpperCase()]}
                            companyName={holding.companyName}
                            size="10x10"
                            showFallback={true}
                            showTooltip={false}
                          />
                        </td>
                        <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                          <div style={{
                            fontSize: '14px',
                            color: '#6b7280',
                            fontStyle: 'italic'
                          }}>
                            {holding.companyName}
                          </div>
                        </td>
                        <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                          <div style={{
                            fontSize: '14px',
                            fontWeight: '600',
                            padding: '6px 12px',
                            borderRadius: '16px',
                            backgroundColor: holding.type === 'c' ? '#f3e8ff' : '#dbeafe',
                            color: holding.type === 'c' ? '#7c3aed' : '#2563eb',
                            border: `1px solid ${holding.type === 'c' ? '#c4b5fd' : '#93c5fd'}`
                          }}>
                            {holding.type === 'c' ? 'Crypto' : 'Stock'}
                          </div>
                        </td>
                        <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                          <div style={{
                            fontSize: '16px',
                            fontWeight: '600',
                            color: '#111827'
                          }}>
                            {Number.isInteger(holding.quantity) ? holding.quantity.toLocaleString() : holding.quantity?.toFixed(4)}
                          </div>
                        </td>
                        <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                          <div style={{
                            fontSize: '16px',
                            fontWeight: '600',
                            color: '#111827'
                          }}>
                            {holding.currentPrice ? `C$${holding.currentPrice.toFixed(2)}` : 'N/A'}
                          </div>
                        </td>
                        <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                          <div style={{
                            fontSize: '16px',
                            fontWeight: '600',
                            color: holding.sharpeRatio === null ? '#6b7280' :
                                   holding.sharpeRatio >= 2 ? '#166534' :
                                   holding.sharpeRatio >= 1 ? '#059669' :
                                   holding.sharpeRatio >= 0 ? '#6b7280' : '#dc2626'
                          }}>
                            {holding.sharpeRatio !== null ? holding.sharpeRatio.toFixed(2) : 'N/A'}
                          </div>
                        </td>
                        <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                          <div style={{
                            fontSize: '16px',
                            fontWeight: '600',
                            color: holding.volatility === null ? '#6b7280' :
                                   holding.volatility > 50 ? '#dc2626' :
                                   holding.volatility > 30 ? '#d97706' : '#111827'
                          }}>
                            {holding.volatility !== null ? `${holding.volatility.toFixed(2)}%` : 'N/A'}
                          </div>
                        </td>
                        <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                          <div style={{
                            fontSize: '16px',
                            fontWeight: '600',
                            color: '#111827'
                          }}>
                            {holding.beta !== null ? holding.beta.toFixed(2) : 'N/A'}
                          </div>
                        </td>
                        <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                          <div style={{
                            fontSize: '16px',
                            fontWeight: '600',
                            color: '#dc2626'
                          }}>
                            {holding.maxDrawdown !== null ? `${holding.maxDrawdown.toFixed(2)}%` : 'N/A'}
                          </div>
                        </td>
                        <td className="py-4 px-6" style={{padding: '20px 24px', textAlign: 'center'}}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '6px 12px',
                            borderRadius: '16px',
                            fontSize: '12px',
                            fontWeight: '600',
                            backgroundColor: holding.riskLevel === 'Low' ? '#dcfce7' :
                                           holding.riskLevel === 'Medium' ? '#fef3c7' :
                                           holding.riskLevel === 'High' ? '#fed7aa' : '#fecaca',
                            color: holding.riskLevel === 'Low' ? '#166534' :
                                   holding.riskLevel === 'Medium' ? '#92400e' :
                                   holding.riskLevel === 'High' ? '#9a3412' : '#991b1b',
                            border: `1px solid ${holding.riskLevel === 'Low' ? '#bbf7d0' :
                                                 holding.riskLevel === 'Medium' ? '#fde68a' :
                                                 holding.riskLevel === 'High' ? '#fdba74' : '#fca5a5'}`
                          }}>
                            {holding.riskLevel}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* How to Use These Metrics - Guide */}
            <div style={{
              backgroundColor: 'white',
              borderRadius: '16px',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
              border: '1px solid #e5e7eb',
              overflow: 'hidden',
              marginTop: '24px'
            }}>
              {/* Header */}
              <div style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                padding: '24px',
                color: 'white'
              }}>
                <h3 style={{
                  fontSize: '24px',
                  fontWeight: 'bold',
                  marginBottom: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}>
                  <svg style={{width: '28px', height: '28px'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  How to Use These Risk Metrics
                </h3>
                <p style={{fontSize: '14px', opacity: 0.9}}>
                  A complete guide to interpreting your portfolio's risk/reward ratios and making informed selling decisions
                </p>
              </div>

              {/* Content */}
              <div style={{padding: '32px'}}>
                {/* Metric Explanations Grid */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                  gap: '24px',
                  marginBottom: '32px'
                }}>
                  {/* Sharpe Ratio */}
                  <div style={{
                    padding: '20px',
                    borderRadius: '12px',
                    backgroundColor: '#f0fdf4',
                    border: '2px solid #bbf7d0'
                  }}>
                    <h4 style={{fontSize: '18px', fontWeight: 'bold', color: '#166534', marginBottom: '12px'}}>
                      📊 Sharpe Ratio
                    </h4>
                    <p style={{fontSize: '14px', color: '#166534', marginBottom: '12px'}}>
                      <strong>What it means:</strong> Return per unit of risk taken (higher is better)
                    </p>
                    <div style={{fontSize: '13px', color: '#166534', lineHeight: '1.6'}}>
                      <div style={{marginBottom: '8px'}}>
                        <span style={{fontWeight: '600', color: '#065f46'}}>• &gt;2:</span> Excellent - HOLD
                      </div>
                      <div style={{marginBottom: '8px'}}>
                        <span style={{fontWeight: '600', color: '#059669'}}>• 1-2:</span> Good - HOLD
                      </div>
                      <div style={{marginBottom: '8px'}}>
                        <span style={{fontWeight: '600', color: '#6b7280'}}>• 0-1:</span> Mediocre - REVIEW
                      </div>
                      <div>
                        <span style={{fontWeight: '600', color: '#dc2626'}}>• &lt;0:</span> Losing - SELL
                      </div>
                    </div>
                  </div>

                  {/* Volatility */}
                  <div style={{
                    padding: '20px',
                    borderRadius: '12px',
                    backgroundColor: '#fef3c7',
                    border: '2px solid #fde68a'
                  }}>
                    <h4 style={{fontSize: '18px', fontWeight: 'bold', color: '#92400e', marginBottom: '12px'}}>
                      📈 Volatility %
                    </h4>
                    <p style={{fontSize: '14px', color: '#92400e', marginBottom: '12px'}}>
                      <strong>What it means:</strong> How much the price swings (annualized)
                    </p>
                    <div style={{fontSize: '13px', color: '#92400e', lineHeight: '1.6'}}>
                      <div style={{marginBottom: '8px'}}>
                        <span style={{fontWeight: '600'}}>• &lt;15%:</span> Low (stable stocks)
                      </div>
                      <div style={{marginBottom: '8px'}}>
                        <span style={{fontWeight: '600'}}>• 15-30%:</span> Medium (blue-chips)
                      </div>
                      <div style={{marginBottom: '8px'}}>
                        <span style={{fontWeight: '600'}}>• 30-50%:</span> High (growth stocks)
                      </div>
                      <div>
                        <span style={{fontWeight: '600'}}>• &gt;50%:</span> Very High (crypto, meme stocks)
                      </div>
                    </div>
                  </div>

                  {/* Beta */}
                  <div style={{
                    padding: '20px',
                    borderRadius: '12px',
                    backgroundColor: '#dbeafe',
                    border: '2px solid #93c5fd'
                  }}>
                    <h4 style={{fontSize: '18px', fontWeight: 'bold', color: '#1e40af', marginBottom: '12px'}}>
                      🎯 Beta
                    </h4>
                    <p style={{fontSize: '14px', color: '#1e40af', marginBottom: '12px'}}>
                      <strong>What it means:</strong> How much the stock moves vs. the market
                    </p>
                    <div style={{fontSize: '13px', color: '#1e40af', lineHeight: '1.6'}}>
                      <div style={{marginBottom: '8px'}}>
                        <span style={{fontWeight: '600'}}>• Beta = 1:</span> Moves with market
                      </div>
                      <div style={{marginBottom: '8px'}}>
                        <span style={{fontWeight: '600'}}>• Beta &gt; 1:</span> More volatile (amplifies swings)
                      </div>
                      <div style={{marginBottom: '8px'}}>
                        <span style={{fontWeight: '600'}}>• Beta &lt; 1:</span> Less volatile (defensive)
                      </div>
                      <div>
                        <span style={{fontWeight: '600', color: '#dc2626'}}>• Beta &gt; 3:</span> Extreme risk
                      </div>
                    </div>
                  </div>

                  {/* Max Drawdown */}
                  <div style={{
                    padding: '20px',
                    borderRadius: '12px',
                    backgroundColor: '#fee2e2',
                    border: '2px solid #fca5a5'
                  }}>
                    <h4 style={{fontSize: '18px', fontWeight: 'bold', color: '#991b1b', marginBottom: '12px'}}>
                      📉 Max Drawdown %
                    </h4>
                    <p style={{fontSize: '14px', color: '#991b1b', marginBottom: '12px'}}>
                      <strong>What it means:</strong> Biggest peak-to-trough loss in data period
                    </p>
                    <div style={{fontSize: '13px', color: '#991b1b', lineHeight: '1.6'}}>
                      <div style={{marginBottom: '8px'}}>
                        <span style={{fontWeight: '600'}}>• &lt;10%:</span> Low risk - stable
                      </div>
                      <div style={{marginBottom: '8px'}}>
                        <span style={{fontWeight: '600'}}>• 10-20%:</span> Moderate - acceptable
                      </div>
                      <div style={{marginBottom: '8px'}}>
                        <span style={{fontWeight: '600'}}>• 20-40%:</span> High - risky
                      </div>
                      <div>
                        <span style={{fontWeight: '600'}}>• &gt;40%:</span> Extreme - very risky
                      </div>
                    </div>
                  </div>
                </div>

                {/* Selling Strategy Section */}
                <div style={{
                  marginTop: '32px',
                  padding: '24px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
                  border: '2px solid #fca5a5'
                }}>
                  <h4 style={{
                    fontSize: '20px',
                    fontWeight: 'bold',
                    color: '#991b1b',
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <svg style={{width: '24px', height: '24px'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    When to Sell: Red Flag Combinations
                  </h4>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                    gap: '16px'
                  }}>
                    <div style={{
                      padding: '16px',
                      backgroundColor: 'white',
                      borderRadius: '8px',
                      border: '1px solid #fca5a5'
                    }}>
                      <div style={{fontSize: '14px', fontWeight: '600', color: '#dc2626', marginBottom: '8px'}}>
                        🚨 IMMEDIATE SELL
                      </div>
                      <div style={{fontSize: '13px', color: '#6b7280', lineHeight: '1.5'}}>
                        Negative Sharpe + High Volatility (&gt;50%) + Negative Returns
                      </div>
                    </div>
                    <div style={{
                      padding: '16px',
                      backgroundColor: 'white',
                      borderRadius: '8px',
                      border: '1px solid #fed7aa'
                    }}>
                      <div style={{fontSize: '14px', fontWeight: '600', color: '#ea580c', marginBottom: '8px'}}>
                        ⚠️ STRONG REDUCE
                      </div>
                      <div style={{fontSize: '13px', color: '#6b7280', lineHeight: '1.5'}}>
                        Max Drawdown &gt;40% + Current losses
                      </div>
                    </div>
                    <div style={{
                      padding: '16px',
                      backgroundColor: 'white',
                      borderRadius: '8px',
                      border: '1px solid #fde68a'
                    }}>
                      <div style={{fontSize: '14px', fontWeight: '600', color: '#d97706', marginBottom: '8px'}}>
                        💡 TAKE PROFITS
                      </div>
                      <div style={{fontSize: '13px', color: '#6b7280', lineHeight: '1.5'}}>
                        Volatility &gt;150% even if winning - lock in gains
                      </div>
                    </div>
                  </div>
                </div>

                {/* Position Sizing Rules */}
                <div style={{
                  marginTop: '24px',
                  padding: '24px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
                  border: '2px solid #93c5fd'
                }}>
                  <h4 style={{
                    fontSize: '20px',
                    fontWeight: 'bold',
                    color: '#1e40af',
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <svg style={{width: '24px', height: '24px'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    Position Sizing by Risk Level
                  </h4>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '12px'
                  }}>
                    <div style={{padding: '12px', backgroundColor: '#dcfce7', borderRadius: '8px', border: '1px solid #bbf7d0'}}>
                      <div style={{fontSize: '13px', fontWeight: '600', color: '#166534'}}>Low Risk</div>
                      <div style={{fontSize: '12px', color: '#166534'}}>Max 10% per position</div>
                    </div>
                    <div style={{padding: '12px', backgroundColor: '#fef3c7', borderRadius: '8px', border: '1px solid #fde68a'}}>
                      <div style={{fontSize: '13px', fontWeight: '600', color: '#92400e'}}>Medium Risk</div>
                      <div style={{fontSize: '12px', color: '#92400e'}}>Max 5% per position</div>
                    </div>
                    <div style={{padding: '12px', backgroundColor: '#fed7aa', borderRadius: '8px', border: '1px solid #fdba74'}}>
                      <div style={{fontSize: '13px', fontWeight: '600', color: '#9a3412'}}>High Risk</div>
                      <div style={{fontSize: '12px', color: '#9a3412'}}>Max 3% per position</div>
                    </div>
                    <div style={{padding: '12px', backgroundColor: '#fecaca', borderRadius: '8px', border: '1px solid #fca5a5'}}>
                      <div style={{fontSize: '13px', fontWeight: '600', color: '#991b1b'}}>Very High Risk</div>
                      <div style={{fontSize: '12px', color: '#991b1b'}}>Max 1-2% per position</div>
                    </div>
                  </div>
                </div>

                {/* Footer Notes */}
                <div style={{
                  marginTop: '24px',
                  padding: '16px',
                  backgroundColor: '#f9fafb',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: '#6b7280'
                }}>
                  <p style={{marginBottom: '4px'}}>
                    <strong>Note:</strong> Metrics calculated using 90 days of historical price data. Minimum 30 days required.
                  </p>
                  <p>
                    Risk-free rate assumed at 4% for Sharpe Ratio calculations. Beta calculated relative to market volatility (18%).
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Ratios;
