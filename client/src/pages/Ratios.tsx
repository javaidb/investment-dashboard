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
  positionSize?: number;
  recommendation?: string;
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

        const holdings = response.data.holdings || [];

        // Calculate total invested across all holdings
        const totalInvestedAcrossAll = holdings.reduce((sum: number, h: HoldingWithRisk) => sum + (h.totalInvested || 0), 0);

        // Add position size percentage and recommendation to each holding
        const holdingsWithPositionSize = holdings.map((h: HoldingWithRisk) => {
          const positionSize = totalInvestedAcrossAll > 0 ? (h.totalInvested / totalInvestedAcrossAll) * 100 : 0;

          // Determine recommendation based on Quick Decision Framework
          let recommendation = 'HOLD';

          // SELL IMMEDIATELY: Sharpe < 0 + Volatility > 50% + Currently losing money
          if (h.sharpeRatio !== null && h.sharpeRatio < 0 &&
              h.volatility !== null && h.volatility > 50 &&
              h.totalPnL !== null && h.totalPnL < 0) {
            recommendation = 'SELL';
          }
          // SELL IMMEDIATELY: Max Drawdown > 40% + Current loss + Negative Sharpe
          else if (h.maxDrawdown !== null && h.maxDrawdown > 40 &&
                   h.totalPnL !== null && h.totalPnL < 0 &&
                   h.sharpeRatio !== null && h.sharpeRatio < 0) {
            recommendation = 'SELL';
          }
          // SELL IMMEDIATELY: Sharpe < -2 (very poor risk-adjusted returns)
          else if (h.sharpeRatio !== null && h.sharpeRatio < -2) {
            recommendation = 'SELL';
          }
          // STRONG REDUCE: Sharpe < 0.5 + Max Drawdown > 30%
          else if (h.sharpeRatio !== null && h.sharpeRatio < 0.5 &&
                   h.maxDrawdown !== null && h.maxDrawdown > 30) {
            recommendation = 'REDUCE';
          }
          // STRONG REDUCE: Current loss > 20% + Volatility > 70%
          else if (h.totalPnLPercent !== null && h.totalPnLPercent < -20 &&
                   h.volatility !== null && h.volatility > 70) {
            recommendation = 'REDUCE';
          }
          // STRONG REDUCE: Max Drawdown > 50% (even if profitable)
          else if (h.maxDrawdown !== null && h.maxDrawdown > 50) {
            recommendation = 'REDUCE';
          }
          // HOLD/ADD: Sharpe > 1.5 (even with high volatility)
          else if (h.sharpeRatio !== null && h.sharpeRatio > 1.5) {
            recommendation = 'HOLD/ADD';
          }
          // HOLD/ADD: Sharpe > 1 + Max Drawdown < 20%
          else if (h.sharpeRatio !== null && h.sharpeRatio > 1 &&
                   h.maxDrawdown !== null && h.maxDrawdown < 20) {
            recommendation = 'HOLD/ADD';
          }
          // HOLD/ADD: Current profit + Low volatility + Positive Sharpe
          else if (h.totalPnL !== null && h.totalPnL > 0 &&
                   h.volatility !== null && h.volatility < 30 &&
                   h.sharpeRatio !== null && h.sharpeRatio > 0) {
            recommendation = 'HOLD/ADD';
          }

          return {
            ...h,
            positionSize,
            recommendation
          };
        });

        // Separate holdings with shares from those without
        const withShares = holdingsWithPositionSize.filter((h: any) => h.quantity > 0.01);
        const withoutShares = holdingsWithPositionSize.filter((h: any) => h.quantity <= 0.01);

        // Sort by risk level (Low -> Medium -> High -> Very High -> Unknown)
        const riskOrder: {[key: string]: number} = {
          'Low': 1,
          'Medium': 2,
          'High': 3,
          'Very High': 4,
          'Unknown': 5
        };

        withShares.sort((a: HoldingWithRisk, b: HoldingWithRisk) => {
          const aOrder = riskOrder[a.riskLevel] || 5;
          const bOrder = riskOrder[b.riskLevel] || 5;

          // First sort by risk level
          if (aOrder !== bOrder) {
            return aOrder - bOrder;
          }

          // Then sort by profit/loss (descending - highest profit first)
          const aPnL = a.totalPnL || 0;
          const bPnL = b.totalPnL || 0;
          return bPnL - aPnL;
        });

        withoutShares.sort((a: HoldingWithRisk, b: HoldingWithRisk) => {
          const aOrder = riskOrder[a.riskLevel] || 5;
          const bOrder = riskOrder[b.riskLevel] || 5;

          // First sort by risk level
          if (aOrder !== bOrder) {
            return aOrder - bOrder;
          }

          // Then sort by profit/loss (descending - highest profit first)
          const aPnL = a.totalPnL || 0;
          const bPnL = b.totalPnL || 0;
          return bPnL - aPnL;
        });

        setRiskData([...withShares, ...withoutShares]);
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
        <div className="max-w-5xl mx-auto">
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
              width: '100%',
              maxWidth: 'fit-content',
              margin: '0 auto'
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
                      <th className="text-center py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 12px', width: '60px'}}>
                        #
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 20px'}}>
                        Symbol
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 20px', width: '60px'}}>
                        Icon
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 20px'}}>
                        Company
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 20px'}}>
                        Type
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 20px'}}>
                        Shares
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 20px'}}>
                        Current Value
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 20px'}}>
                        Net Invested
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 20px'}}>
                        Position Size %
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 20px'}}>
                        Sharpe Ratio
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 20px'}}>
                        Max Drawdown %
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 20px'}}>
                        Profit $
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 20px'}}>
                        Volatility %
                      </th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 20px'}}>
                        Beta
                      </th>
                      <th className="text-center py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 20px'}}>
                        Risk Level
                      </th>
                      <th className="text-center py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 20px'}}>
                        Recommendation
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {riskData.map((holding, index) => {
                      // Check if this is the first holding without shares (separator needed)
                      const isFirstWithoutShares = holding.quantity <= 0.01 && (index === 0 || riskData[index - 1].quantity > 0.01);

                      return (
                        <React.Fragment key={holding.symbol}>
                          {isFirstWithoutShares && (
                            <tr style={{backgroundColor: '#f3f4f6', height: '2px'}}>
                              <td colSpan={16} style={{padding: '24px 24px 12px 24px', backgroundColor: '#f9fafb', borderTop: '2px solid #d1d5db'}}>
                                <div style={{
                                  fontSize: '14px',
                                  fontWeight: '600',
                                  color: '#6b7280',
                                  textAlign: 'center',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.05em'
                                }}>
                                  Assets with No Shares
                                </div>
                              </td>
                            </tr>
                          )}
                          <tr style={{
                            backgroundColor: index % 2 === 0 ? '#ffffff' : '#f9fafb',
                            borderBottom: '1px solid #f3f4f6',
                            transition: 'all 0.2s ease',
                            opacity: holding.quantity <= 0.01 ? 0.6 : 1
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
                        <td className="py-4 px-6" style={{padding: '16px 20px'}}>
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
                        <td className="py-4 px-6" style={{padding: '16px 20px'}}>
                          <div style={{
                            fontSize: '14px',
                            color: '#6b7280',
                            fontStyle: 'italic'
                          }}>
                            {holding.companyName}
                          </div>
                        </td>
                        <td className="py-4 px-6" style={{padding: '16px 20px'}}>
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
                        <td className="py-4 px-6" style={{padding: '16px 20px'}}>
                          <div style={{
                            fontSize: '16px',
                            fontWeight: '600',
                            color: '#111827'
                          }}>
                            {Number.isInteger(holding.quantity) ? holding.quantity.toLocaleString() : holding.quantity?.toFixed(4)}
                          </div>
                        </td>
                        <td className="py-4 px-6" style={{padding: '16px 20px'}}>
                          <div style={{
                            fontSize: '16px',
                            fontWeight: '600',
                            color: '#111827'
                          }}>
                            {holding.currentValue ? `C$${holding.currentValue.toFixed(2)}` : 'N/A'}
                          </div>
                        </td>
                        <td className="py-4 px-6" style={{padding: '16px 20px'}}>
                          <div style={{
                            fontSize: '16px',
                            fontWeight: '600',
                            color: '#111827'
                          }}>
                            {holding.totalInvested ? `C$${holding.totalInvested.toFixed(2)}` : 'N/A'}
                          </div>
                        </td>
                        <td className="py-4 px-6" style={{padding: '16px 20px'}}>
                          <div style={{
                            fontSize: '16px',
                            fontWeight: '600',
                            color: holding.positionSize === undefined ? '#6b7280' :
                                   (holding.riskLevel === 'Very High' && holding.positionSize > 2) ? '#dc2626' :
                                   (holding.riskLevel === 'High' && holding.positionSize > 3) ? '#dc2626' :
                                   (holding.riskLevel === 'Medium' && holding.positionSize > 5) ? '#d97706' :
                                   (holding.riskLevel === 'Low' && holding.positionSize > 10) ? '#d97706' : '#111827'
                          }}>
                            {holding.positionSize !== undefined ? `${holding.positionSize.toFixed(2)}%` : 'N/A'}
                          </div>
                        </td>
                        <td className="py-4 px-6" style={{padding: '16px 20px'}}>
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
                        <td className="py-4 px-6" style={{padding: '16px 20px'}}>
                          <div style={{
                            fontSize: '16px',
                            fontWeight: '600',
                            color: holding.maxDrawdown === null ? '#6b7280' :
                                   holding.maxDrawdown > 40 ? '#dc2626' :
                                   holding.maxDrawdown > 20 ? '#d97706' : '#111827'
                          }}>
                            {holding.maxDrawdown !== null ? `${holding.maxDrawdown.toFixed(2)}%` : 'N/A'}
                          </div>
                        </td>
                        <td className="py-4 px-6" style={{padding: '16px 20px'}}>
                          <div style={{
                            fontSize: '16px',
                            fontWeight: '600',
                            color: holding.totalPnL === null || holding.totalPnL === undefined ? '#6b7280' :
                                   holding.totalPnL >= 0 ? '#166534' : '#dc2626'
                          }}>
                            {holding.totalPnL !== null && holding.totalPnL !== undefined ? `C$${holding.totalPnL.toFixed(2)}` : 'N/A'}
                          </div>
                        </td>
                        <td className="py-4 px-6" style={{padding: '16px 20px'}}>
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
                        <td className="py-4 px-6" style={{padding: '16px 20px'}}>
                          <div style={{
                            fontSize: '16px',
                            fontWeight: '600',
                            color: holding.beta === null ? '#6b7280' :
                                   holding.beta > 3 ? '#dc2626' : '#111827'
                          }}>
                            {holding.beta !== null ? holding.beta.toFixed(2) : 'N/A'}
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
                        <td className="py-4 px-6" style={{padding: '16px 20px', textAlign: 'center'}}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '8px 16px',
                            borderRadius: '16px',
                            fontSize: '13px',
                            fontWeight: '700',
                            backgroundColor: holding.recommendation === 'SELL' ? '#fecaca' :
                                           holding.recommendation === 'REDUCE' ? '#fed7aa' : '#dcfce7',
                            color: holding.recommendation === 'SELL' ? '#991b1b' :
                                   holding.recommendation === 'REDUCE' ? '#9a3412' : '#166534',
                            border: `2px solid ${holding.recommendation === 'SELL' ? '#fca5a5' :
                                                 holding.recommendation === 'REDUCE' ? '#fdba74' : '#bbf7d0'}`
                          }}>
                            {holding.recommendation || 'HOLD'}
                          </span>
                        </td>
                      </tr>
                        </React.Fragment>
                      );
                    })}
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

                {/* Risk Indicator Rankings */}
                <div style={{
                  marginTop: '24px',
                  padding: '24px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #fef9c3 0%, #fef3c7 100%)',
                  border: '2px solid #fbbf24'
                }}>
                  <h4 style={{
                    fontSize: '20px',
                    fontWeight: 'bold',
                    color: '#92400e',
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <svg style={{width: '24px', height: '24px'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                    </svg>
                    Risk Indicator Rankings: Which Metrics Matter Most?
                  </h4>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr',
                    gap: '16px'
                  }}>
                    {/* #1 Sharpe Ratio */}
                    <div style={{
                      padding: '16px',
                      backgroundColor: 'white',
                      borderRadius: '8px',
                      border: '2px solid #10b981'
                    }}>
                      <div style={{display: 'flex', alignItems: 'start', gap: '12px'}}>
                        <div style={{
                          fontSize: '24px',
                          fontWeight: 'bold',
                          color: '#10b981',
                          minWidth: '32px'
                        }}>1.</div>
                        <div style={{flex: 1}}>
                          <div style={{fontSize: '16px', fontWeight: '700', color: '#059669', marginBottom: '8px'}}>
                            Sharpe Ratio ⭐⭐⭐⭐⭐ (MOST SIGNIFICANT)
                          </div>
                          <div style={{fontSize: '13px', color: '#6b7280', marginBottom: '8px'}}>
                            <strong>Why #1:</strong> Only metric combining risk AND return. Tells you if you're compensated for risk taken.
                          </div>
                          <div style={{fontSize: '12px', color: '#059669', lineHeight: '1.6'}}>
                            <div>• &lt;0: Losing money, sell immediately</div>
                            <div>• 0-1: Returns barely justify risk</div>
                            <div>• 1-2: Good risk-adjusted returns, hold</div>
                            <div>• &gt;2: Excellent, definitely keep</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* #2 Max Drawdown */}
                    <div style={{
                      padding: '16px',
                      backgroundColor: 'white',
                      borderRadius: '8px',
                      border: '2px solid #f59e0b'
                    }}>
                      <div style={{display: 'flex', alignItems: 'start', gap: '12px'}}>
                        <div style={{
                          fontSize: '24px',
                          fontWeight: 'bold',
                          color: '#f59e0b',
                          minWidth: '32px'
                        }}>2.</div>
                        <div style={{flex: 1}}>
                          <div style={{fontSize: '16px', fontWeight: '700', color: '#d97706', marginBottom: '8px'}}>
                            Max Drawdown % ⭐⭐⭐⭐ (VERY SIGNIFICANT)
                          </div>
                          <div style={{fontSize: '13px', color: '#6b7280', marginBottom: '8px'}}>
                            <strong>Why #2:</strong> Shows worst-case historical loss. Reveals if you can stomach the downside.
                          </div>
                          <div style={{fontSize: '12px', color: '#d97706', lineHeight: '1.6'}}>
                            <div>• &lt;10%: Safe, stable investment</div>
                            <div>• 10-20%: Normal market fluctuations</div>
                            <div>• 20-40%: High risk, size positions small</div>
                            <div>• &gt;40%: Extreme risk, could lose half your value</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* #3 Current Profit/Loss */}
                    <div style={{
                      padding: '16px',
                      backgroundColor: 'white',
                      borderRadius: '8px',
                      border: '2px solid #3b82f6'
                    }}>
                      <div style={{display: 'flex', alignItems: 'start', gap: '12px'}}>
                        <div style={{
                          fontSize: '24px',
                          fontWeight: 'bold',
                          color: '#3b82f6',
                          minWidth: '32px'
                        }}>3.</div>
                        <div style={{flex: 1}}>
                          <div style={{fontSize: '16px', fontWeight: '700', color: '#2563eb', marginBottom: '8px'}}>
                            Current Profit/Loss $ ⭐⭐⭐ (SIGNIFICANT)
                          </div>
                          <div style={{fontSize: '13px', color: '#6b7280', marginBottom: '8px'}}>
                            <strong>Why #3:</strong> Real money in your pocket. Context-dependent - combine with Sharpe Ratio.
                          </div>
                          <div style={{fontSize: '12px', color: '#2563eb', lineHeight: '1.6'}}>
                            <div>• Green + Good Sharpe: Winner, hold</div>
                            <div>• Green + Bad Sharpe: Got lucky, take profits</div>
                            <div>• Red + Bad Sharpe: Loser, sell now</div>
                            <div>• Red + Good Sharpe: Temporary dip, maybe hold</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* #4 Volatility */}
                    <div style={{
                      padding: '16px',
                      backgroundColor: 'white',
                      borderRadius: '8px',
                      border: '2px solid #8b5cf6'
                    }}>
                      <div style={{display: 'flex', alignItems: 'start', gap: '12px'}}>
                        <div style={{
                          fontSize: '24px',
                          fontWeight: 'bold',
                          color: '#8b5cf6',
                          minWidth: '32px'
                        }}>4.</div>
                        <div style={{flex: 1}}>
                          <div style={{fontSize: '16px', fontWeight: '700', color: '#7c3aed', marginBottom: '8px'}}>
                            Volatility % ⭐⭐ (MODERATELY SIGNIFICANT)
                          </div>
                          <div style={{fontSize: '13px', color: '#6b7280', marginBottom: '8px'}}>
                            <strong>Why #4:</strong> Measures swings but not direction. High volatility isn't bad if you're making money.
                          </div>
                          <div style={{fontSize: '12px', color: '#7c3aed', lineHeight: '1.6'}}>
                            <div>• &lt;30%: Can hold larger positions (5-10%)</div>
                            <div>• 30-50%: Limit position size (3-5%)</div>
                            <div>• 50-100%: Small positions only (1-3%)</div>
                            <div>• &gt;100%: Extreme risk, tiny positions (&lt;1%)</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Quick Decision Framework */}
                  <div style={{
                    marginTop: '20px',
                    padding: '16px',
                    backgroundColor: '#fee2e2',
                    borderRadius: '8px',
                    border: '1px solid #fca5a5'
                  }}>
                    <div style={{fontSize: '14px', fontWeight: '700', color: '#991b1b', marginBottom: '12px'}}>
                      ⚡ Quick Decision Framework
                    </div>
                    <div style={{fontSize: '13px', color: '#7f1d1d', lineHeight: '1.7'}}>
                      <div style={{marginBottom: '8px'}}>
                        <strong>SELL IMMEDIATELY:</strong> Sharpe &lt; 0 + Volatility &gt; 50% + Currently losing money
                      </div>
                      <div style={{marginBottom: '8px'}}>
                        <strong>STRONG REDUCE:</strong> Max Drawdown &gt; 40% + Current loss + Negative Sharpe
                      </div>
                      <div>
                        <strong>HOLD/ADD:</strong> Sharpe &gt; 1.5 (even with high volatility) + Positive profit
                      </div>
                    </div>
                  </div>

                  <div style={{
                    marginTop: '16px',
                    padding: '12px',
                    backgroundColor: 'white',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#6b7280',
                    fontStyle: 'italic'
                  }}>
                    💡 <strong>Pro Tip:</strong> Sharpe Ratio is king because it's the only forward-looking metric.
                    A high-volatility stock with a great Sharpe (like some tech stocks) is better than a stable stock losing money.
                  </div>
                </div>

                {/* Sample Sharpe Ratio Calculation */}
                <div style={{
                  marginTop: '24px',
                  padding: '24px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)',
                  border: '2px solid #38bdf8'
                }}>
                  <h4 style={{
                    fontSize: '20px',
                    fontWeight: 'bold',
                    color: '#075985',
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <svg style={{width: '24px', height: '24px'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    Sample Calculation: Sharpe Ratio for AAPL
                  </h4>

                  <div style={{
                    padding: '20px',
                    backgroundColor: 'white',
                    borderRadius: '8px',
                    border: '1px solid #7dd3fc'
                  }}>
                    {/* Step 1 */}
                    <div style={{marginBottom: '20px'}}>
                      <div style={{fontSize: '14px', fontWeight: '700', color: '#0369a1', marginBottom: '8px'}}>
                        Step 1: Get Daily Prices (Last 10 days shown)
                      </div>
                      <div style={{fontSize: '13px', color: '#374151', fontFamily: 'monospace', lineHeight: '1.8'}}>
                        <div>Day 1: $225.00</div>
                        <div>Day 2: $228.50 → Daily return = (228.50 - 225.00) / 225.00 = <strong>+1.56%</strong></div>
                        <div>Day 3: $227.80 → Daily return = (227.80 - 228.50) / 228.50 = <strong>-0.31%</strong></div>
                        <div>Day 4: $230.20 → Daily return = (230.20 - 227.80) / 227.80 = <strong>+1.05%</strong></div>
                        <div>Day 5: $229.50 → Daily return = (229.50 - 230.20) / 230.20 = <strong>-0.30%</strong></div>
                        <div style={{color: '#6b7280', marginTop: '4px'}}>... (continues for 90 days total)</div>
                      </div>
                    </div>

                    {/* Step 2 */}
                    <div style={{marginBottom: '20px', paddingTop: '16px', borderTop: '1px solid #e5e7eb'}}>
                      <div style={{fontSize: '14px', fontWeight: '700', color: '#0369a1', marginBottom: '8px'}}>
                        Step 2: Calculate Average Daily Return
                      </div>
                      <div style={{fontSize: '13px', color: '#374151', lineHeight: '1.6'}}>
                        <div>Sum of all daily returns: <strong style={{color: '#059669'}}>+15.8%</strong></div>
                        <div>Number of days: <strong>90 days</strong></div>
                        <div>Average daily return = 15.8% / 90 = <strong style={{color: '#059669'}}>+0.176%</strong></div>
                        <div style={{marginTop: '8px', padding: '8px', backgroundColor: '#f0fdf4', borderRadius: '4px', border: '1px solid #bbf7d0'}}>
                          <strong>Annualized Return</strong> = 0.176% × 252 trading days = <strong style={{color: '#059669'}}>+44.3%</strong>
                        </div>
                      </div>
                    </div>

                    {/* Step 3 */}
                    <div style={{marginBottom: '20px', paddingTop: '16px', borderTop: '1px solid #e5e7eb'}}>
                      <div style={{fontSize: '14px', fontWeight: '700', color: '#0369a1', marginBottom: '8px'}}>
                        Step 3: Calculate Volatility (Standard Deviation)
                      </div>
                      <div style={{fontSize: '13px', color: '#374151', lineHeight: '1.6'}}>
                        <div>Variance = Average of (each return - mean)²</div>
                        <div style={{fontFamily: 'monospace', fontSize: '12px', color: '#6b7280', marginTop: '4px'}}>
                          = [(1.56% - 0.176%)² + (-0.31% - 0.176%)² + (1.05% - 0.176%)² + ...] / 90
                        </div>
                        <div style={{marginTop: '8px'}}>Daily Variance = <strong>0.000487</strong></div>
                        <div>Daily Volatility = √0.000487 = <strong>2.21%</strong></div>
                        <div style={{marginTop: '8px', padding: '8px', backgroundColor: '#fef3c7', borderRadius: '4px', border: '1px solid #fde68a'}}>
                          <strong>Annualized Volatility</strong> = 2.21% × √252 = <strong style={{color: '#d97706'}}>35.1%</strong>
                        </div>
                      </div>
                    </div>

                    {/* Step 4 */}
                    <div style={{paddingTop: '16px', borderTop: '1px solid #e5e7eb'}}>
                      <div style={{fontSize: '14px', fontWeight: '700', color: '#0369a1', marginBottom: '8px'}}>
                        Step 4: Calculate Sharpe Ratio
                      </div>
                      <div style={{fontSize: '13px', color: '#374151', lineHeight: '1.6'}}>
                        <div>Formula: <code style={{backgroundColor: '#f3f4f6', padding: '2px 6px', borderRadius: '4px'}}>Sharpe = (Return - Risk-Free Rate) / Volatility</code></div>
                        <div style={{marginTop: '8px'}}>Annualized Return = <strong style={{color: '#059669'}}>44.3%</strong></div>
                        <div>Risk-Free Rate (4% bonds) = <strong>4.0%</strong></div>
                        <div>Annualized Volatility = <strong style={{color: '#d97706'}}>35.1%</strong></div>
                        <div style={{marginTop: '12px', padding: '16px', backgroundColor: '#dcfce7', borderRadius: '8px', border: '2px solid #22c55e'}}>
                          <div style={{fontSize: '15px', fontWeight: '700', color: '#166534', marginBottom: '8px'}}>
                            Final Sharpe Ratio Calculation:
                          </div>
                          <div style={{fontSize: '14px', color: '#166534', fontFamily: 'monospace'}}>
                            Sharpe = (44.3% - 4.0%) / 35.1%
                          </div>
                          <div style={{fontSize: '14px', color: '#166534', fontFamily: 'monospace'}}>
                            Sharpe = 40.3% / 35.1%
                          </div>
                          <div style={{fontSize: '20px', fontWeight: '800', color: '#166534', marginTop: '8px'}}>
                            Sharpe Ratio = <span style={{fontSize: '24px'}}>1.15</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Interpretation */}
                    <div style={{marginTop: '16px', padding: '12px', backgroundColor: '#f0f9ff', borderRadius: '8px', border: '1px solid #7dd3fc'}}>
                      <div style={{fontSize: '13px', fontWeight: '600', color: '#0369a1', marginBottom: '6px'}}>
                        📊 What This Means:
                      </div>
                      <div style={{fontSize: '12px', color: '#0c4a6e', lineHeight: '1.6'}}>
                        A Sharpe Ratio of <strong>1.15</strong> means AAPL generates <strong>1.15% of excess return for every 1% of risk</strong> taken.
                        This is <strong>good</strong> (1.0-2.0 range) - the stock is delivering solid risk-adjusted returns.
                        You're being adequately compensated for the 35% volatility you're experiencing.
                      </div>
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
