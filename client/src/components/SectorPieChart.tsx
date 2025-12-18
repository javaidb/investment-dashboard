import React from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip
} from 'recharts';
import CompanyIcon from './CompanyIcon';
import { useIcons } from '../hooks/useIcons';

interface Holding {
  symbol: string;
  quantity: number;
  type: string;
  companyName?: string;
  sector?: string;
  currentValue?: number;
}

interface SectorPieChartProps {
  holdings: Holding[];
}

const SectorPieChart: React.FC<SectorPieChartProps> = ({ holdings }) => {
  // Fetch icons for all holdings
  const symbolsForIcons = holdings.map(holding => ({
    symbol: holding.symbol,
    type: holding.type || 's'
  }));

  const { iconUrls } = useIcons({
    symbols: symbolsForIcons,
    enabled: holdings.length > 0
  });

  // Prepare combined data for assets list
  const combinedData = holdings
    .filter(holding => holding.quantity > 0.01 && holding.currentValue && holding.currentValue > 0)
    .map(holding => ({
      symbol: holding.symbol,
      name: holding.companyName || holding.symbol,
      value: holding.currentValue || 0,
      type: holding.type,
      iconUrl: iconUrls[holding.symbol.toUpperCase()]
    }));

  // Calculate sector allocation from holdings (excluding cryptocurrency)
  const sectorData = holdings
    .filter(holding => holding.quantity > 0.01 && holding.currentValue && holding.currentValue > 0)
    .filter(holding => holding.type !== 'c') // Exclude cryptocurrency
    .reduce((acc, holding) => {
      let sector = holding.sector;

      // If no sector, derive from type/symbol
      if (!sector) {
        if (holding.symbol?.includes('XEQT') || holding.symbol?.includes('VOO') ||
                   holding.symbol?.includes('QQQ') || holding.symbol?.includes('IBIT')) {
          sector = 'ETF - Index Fund';
        } else {
          sector = 'Unknown';
        }
      }

      acc[sector] = (acc[sector] || 0) + (holding.currentValue || 0);
      return acc;
    }, {} as {[key: string]: number});

  const sectorChartData = Object.entries(sectorData)
    .map(([sector, value]) => ({ sector, value }))
    .sort((a, b) => b.value - a.value);

  const totalSectorValue = sectorChartData.reduce((sum, sector) => sum + sector.value, 0);

  // Colors for sectors (diverse palette)
  const sectorColors: {[key: string]: string} = {
    'Tech': '#3B82F6',
    'Technology': '#3B82F6',
    'Automotive': '#10B981',
    'Consumer Cyclical': '#10B981',
    'Industrials': '#F59E0B',
    'Healthcare': '#EF4444',
    'Financial Services': '#8B5CF6',
    'Utilities': '#06B6D4',
    'Energy': '#F97316',
    'Basic Materials': '#84CC16',
    'Raw Materials': '#84CC16',
    'Real Estate': '#EC4899',
    'Communication Services': '#6366F1',
    'ETF': '#9333EA',
    'ETF - Index Fund': '#9333EA',
    'Alternative Investments': '#8B5CF6',
    'Smart Contract Platform': '#F59E0B',
    'Cryptocurrency': '#FBBF24',
    'Unknown': '#9CA3AF'
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatSectorPercent = (value: number) => {
    const percent = (value / totalSectorValue) * 100;
    return `${percent.toFixed(1)}%`;
  };

  if (holdings.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden p-6">
        <p className="text-gray-500 text-center">No holdings data available</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
      <div style={{
        background: 'linear-gradient(to right, #f8fafc, #f1f5f9)',
        padding: '20px 24px',
        borderBottom: '1px solid #e5e7eb'
      }}>
        <h3 style={{
          fontSize: '20px',
          fontWeight: 'bold',
          color: '#111827'
        }}>Portfolio by Sector</h3>
        <p style={{
          fontSize: '14px',
          color: '#6b7280',
          marginTop: '4px'
        }}>
          Diversification across industries and sectors
        </p>
      </div>

      <div style={{ padding: '24px' }}>
        {sectorChartData.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', backgroundColor: '#f9fafb', borderRadius: '8px', marginTop: '20px' }}>
            <p style={{ color: '#6b7280', fontSize: '14px' }}>Loading sector data...</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '24px' }}>
            {/* Pie Chart Section */}
            <div>
              <h4 style={{ fontSize: '14px', fontWeight: 'bold', color: '#111827', marginBottom: '12px', textAlign: 'center' }}>
                Sector Allocation
              </h4>
              <div style={{ marginBottom: '12px', textAlign: 'center' }}>
                <p style={{ fontSize: '12px', color: '#6b7280', margin: '2px 0' }}>
                  Diversification across industries
                </p>
              </div>
              <ResponsiveContainer width="100%" height={550}>
                <PieChart>
                  <Pie
                    data={sectorChartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={180}
                    innerRadius={70}
                    fill="#8884d8"
                    dataKey="value"
                    startAngle={90}
                    endAngle={-270}
                    label={(props) => {
                      const { cx, cy, midAngle, outerRadius, percent, index } = props;

                      if (percent === undefined || percent < 0.03) return null;
                      if (midAngle === undefined || cx === undefined || cy === undefined ||
                          outerRadius === undefined || index === undefined) {
                        return null;
                      }

                      const RADIAN = Math.PI / 180;
                      const startRadius = outerRadius + 5;
                      const x1 = cx + startRadius * Math.cos(-midAngle * RADIAN);
                      const y1 = cy + startRadius * Math.sin(-midAngle * RADIAN);

                      const lineLength = 35;
                      const x2 = cx + (outerRadius + lineLength) * Math.cos(-midAngle * RADIAN);
                      const y2 = cy + (outerRadius + lineLength) * Math.sin(-midAngle * RADIAN);

                      const sector = sectorChartData[index];
                      if (!sector) return null;

                      const isRightSide = Math.cos(-midAngle * RADIAN) > 0;
                      const textAnchor = isRightSide ? 'start' : 'end';
                      const textX = isRightSide ? x2 + 5 : x2 - 5;

                      return (
                        <g>
                          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#6b7280" strokeWidth={1} />
                          <text x={textX} y={y2 - 2} textAnchor={textAnchor} fill="#111827" fontSize="11px" fontWeight="600">
                            {sector.sector}
                          </text>
                          <text x={textX} y={y2 + 10} textAnchor={textAnchor} fill="#6b7280" fontSize="10px">
                            {formatSectorPercent(sector.value)}
                          </text>
                        </g>
                      );
                    }}
                  >
                    {sectorChartData.map((entry, index) => (
                      <Cell key={`sector-cell-${index}`} fill={sectorColors[entry.sector] || '#9CA3AF'} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }: any) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div style={{ backgroundColor: 'white', padding: '12px 16px', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                            <p style={{ fontWeight: 'bold', margin: '0 0 8px 0', color: '#111827' }}>{data.sector}</p>
                            <p style={{ margin: '4px 0', color: '#374151' }}><strong>Value:</strong> {formatCurrency(data.value)}</p>
                            <p style={{ margin: '4px 0', color: '#374151' }}><strong>Allocation:</strong> {formatSectorPercent(data.value)}</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>

              {/* Sector breakdown below chart */}
              <div style={{ marginTop: '24px', padding: '16px', backgroundColor: '#f9fafb', borderRadius: '12px', maxHeight: '200px', overflowY: 'auto' }}>
                <h5 style={{ fontSize: '12px', fontWeight: 'bold', color: '#111827', marginBottom: '12px' }}>
                  Sector Breakdown
                </h5>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {sectorChartData.map((sector) => (
                    <div key={sector.sector} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '12px', height: '12px', backgroundColor: sectorColors[sector.sector] || '#9CA3AF', borderRadius: '3px' }}></div>
                        <span style={{ fontSize: '11px', color: '#374151' }}>{sector.sector}</span>
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: '600', color: '#111827' }}>
                        {formatSectorPercent(sector.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Individual Assets by Sector List */}
            <div>
              <h4 style={{ fontSize: '14px', fontWeight: 'bold', color: '#111827', marginBottom: '12px' }}>
                Assets by Sector
              </h4>
              <div style={{
                maxHeight: '832px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                paddingLeft: '8px'
              }}>
                {combinedData
                  .filter(asset => asset.type !== 'c') // Exclude cryptocurrency
                  .sort((a, b) => {
                    // Get sectors for both assets
                    const sectorA = holdings.find(h => h.symbol === a.symbol)?.sector || 'Unknown';
                    const sectorB = holdings.find(h => h.symbol === b.symbol)?.sector || 'Unknown';

                    // Get total values for each sector from sectorChartData
                    const sectorATotal = sectorChartData.find(s => s.sector === sectorA)?.value || 0;
                    const sectorBTotal = sectorChartData.find(s => s.sector === sectorB)?.value || 0;

                    // First sort by sector total value (largest sectors first)
                    if (sectorATotal !== sectorBTotal) {
                      return sectorBTotal - sectorATotal;
                    }

                    // Within same sector, sort by individual asset value descending
                    return b.value - a.value;
                  })
                  .map((asset) => {
                    const sector = holdings.find(h => h.symbol === asset.symbol)?.sector || 'Unknown';
                    const sectorColor = sectorColors[sector] || '#9CA3AF';

                    return (
                      <div
                        key={asset.symbol}
                        style={{
                          padding: '8px 10px',
                          backgroundColor: '#f9fafb',
                          borderRadius: '6px',
                          borderLeft: `3px solid ${sectorColor}`,
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}
                      >
                        <CompanyIcon
                          symbol={asset.symbol}
                          iconUrl={asset.iconUrl}
                          companyName={asset.name}
                          size="xs"
                          showFallback={true}
                          showTooltip={false}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: '13px', fontWeight: '600', margin: 0, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {asset.symbol}
                          </p>
                          <p style={{ fontSize: '11px', margin: 0, color: '#6b7280' }}>
                            {sector}
                          </p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ fontSize: '13px', fontWeight: '600', color: '#111827', margin: 0, whiteSpace: 'nowrap' }}>
                            {formatCurrency(asset.value)}
                          </p>
                          <p style={{ fontSize: '11px', color: '#6b7280', margin: 0 }}>
                            {formatSectorPercent(asset.value)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SectorPieChart;
