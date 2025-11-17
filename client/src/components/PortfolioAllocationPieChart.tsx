import React, { useState } from 'react';
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
  weeklyChangePercent?: number | null;
  usdPrice?: number;
  exchangeRate?: number;
}

interface PortfolioAllocationPieChartProps {
  holdings: Holding[];
}

const PortfolioAllocationPieChart: React.FC<PortfolioAllocationPieChartProps> = ({ holdings }) => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // Fetch icons for all holdings
  const symbolsForIcons = holdings.map(holding => ({
    symbol: holding.symbol,
    type: holding.type || 's'
  }));

  const { iconUrls } = useIcons({
    symbols: symbolsForIcons,
    enabled: holdings.length > 0
  });

  // Prepare data for pie chart - group by asset with current value
  const assetData = holdings
    .filter(holding => holding.quantity > 0.01 && holding.currentValue && holding.currentValue > 0)
    .map(holding => {
      // Determine category
      let category = 'Stock';
      if (holding.type === 'c') {
        category = 'Crypto';
      } else if (holding.symbol.includes('XEQT') || holding.symbol.includes('VOO') || holding.symbol.includes('QQQ')) {
        category = 'ETF';
      }

      return {
        symbol: holding.symbol,
        name: holding.companyName || holding.symbol,
        value: holding.currentValue || 0,
        category: category,
        type: holding.type,
        iconUrl: iconUrls[holding.symbol.toUpperCase()]
      };
    })
    .sort((a, b) => {
      // First, sort by category to group them together
      const categoryOrder: {[key: string]: number} = { 'Crypto': 0, 'ETF': 1, 'Stock': 2 };
      if (categoryOrder[a.category] !== categoryOrder[b.category]) {
        return categoryOrder[a.category] - categoryOrder[b.category];
      }
      // Within same category, sort by value descending
      return b.value - a.value;
    });

  // Calculate totals by category
  const categoryTotals = assetData.reduce((acc, asset) => {
    acc[asset.category] = (acc[asset.category] || 0) + asset.value;
    return acc;
  }, {} as {[key: string]: number});

  const totalValue = assetData.reduce((sum, asset) => sum + asset.value, 0);

  // Colors for categories
  const categoryColors: {[key: string]: string} = {
    'Crypto': '#F59E0B',
    'ETF': '#3B82F6',
    'Stock': '#10B981'
  };

  // Colors for individual assets (varying shades)
  const assetColors = assetData.map(asset => {
    const baseColor = categoryColors[asset.category];
    // Could add variation here if needed
    return baseColor;
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercent = (value: number) => {
    const percent = (value / totalValue) * 100;
    return `${percent.toFixed(1)}%`;
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div style={{
          backgroundColor: 'white',
          padding: '12px 16px',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <CompanyIcon
              symbol={data.symbol}
              iconUrl={data.iconUrl}
              companyName={data.name}
              size="xs"
              showFallback={true}
              showTooltip={false}
            />
            <div>
              <p style={{ fontWeight: 'bold', margin: 0, color: '#111827' }}>{data.symbol}</p>
              <p style={{ fontSize: '12px', margin: 0, color: '#6b7280' }}>{data.category}</p>
            </div>
          </div>
          <p style={{ margin: '4px 0', color: '#374151' }}>
            <strong>Value:</strong> {formatCurrency(data.value)}
          </p>
          <p style={{ margin: '4px 0', color: '#374151' }}>
            <strong>Allocation:</strong> {formatPercent(data.value)}
          </p>
        </div>
      );
    }
    return null;
  };

  // Custom label to show asset symbols with lines
  const renderCustomLabel = (props: any) => {
    const { cx, cy, midAngle, outerRadius, percent, index } = props;

    // Only show label if slice is large enough (> 2%)
    if (percent < 0.02) return null;

    const RADIAN = Math.PI / 180;

    // Position for line start (edge of pie)
    const startRadius = outerRadius + 5;
    const x1 = cx + startRadius * Math.cos(-midAngle * RADIAN);
    const y1 = cy + startRadius * Math.sin(-midAngle * RADIAN);

    // Position for line end and label
    const lineLength = 35;
    const x2 = cx + (outerRadius + lineLength) * Math.cos(-midAngle * RADIAN);
    const y2 = cy + (outerRadius + lineLength) * Math.sin(-midAngle * RADIAN);

    const asset = assetData[index];
    if (!asset) return null;

    // Determine text anchor based on which side of the pie
    const isRightSide = Math.cos(-midAngle * RADIAN) > 0;
    const textAnchor = isRightSide ? 'start' : 'end';
    const textX = isRightSide ? x2 + 5 : x2 - 5;

    return (
      <g>
        {/* Line from pie edge to label */}
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="#6b7280"
          strokeWidth={1}
        />
        {/* Asset symbol */}
        <text
          x={textX}
          y={y2 - 2}
          textAnchor={textAnchor}
          fill="#111827"
          fontSize="12px"
          fontWeight="600"
        >
          {asset.symbol}
        </text>
        {/* Percentage */}
        <text
          x={textX}
          y={y2 + 10}
          textAnchor={textAnchor}
          fill="#6b7280"
          fontSize="11px"
        >
          {formatPercent(asset.value)}
        </text>
      </g>
    );
  };

  const onPieEnter = (_: any, index: number) => {
    setActiveIndex(index);
  };

  const onPieLeave = () => {
    setActiveIndex(null);
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
        }}>Portfolio Allocation by Asset</h3>
        <p style={{
          fontSize: '14px',
          color: '#6b7280',
          marginTop: '4px'
        }}>
          Current value distribution across all holdings
        </p>
      </div>

      <div style={{ padding: '24px' }}>
        {/* Main layout: Assets on left, Pie charts on right */}
        <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr 1fr', gap: '24px' }}>
          {/* Left side: Individual assets breakdown */}
          <div>
            <h4 style={{ fontSize: '14px', fontWeight: 'bold', color: '#111827', marginBottom: '12px' }}>
              Individual Assets
            </h4>
            <div style={{
              maxHeight: '500px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              paddingRight: '8px'
            }}>
              {assetData.map((asset, index) => (
                <div
                  key={asset.symbol}
                  style={{
                    padding: '8px 10px',
                    backgroundColor: '#f9fafb',
                    borderRadius: '6px',
                    borderLeft: `3px solid ${categoryColors[asset.category]}`,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    opacity: activeIndex === null || activeIndex === index ? 1 : 0.6,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(null)}
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
                      {asset.category}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '13px', fontWeight: '600', color: '#111827', margin: 0, whiteSpace: 'nowrap' }}>
                      {formatCurrency(asset.value)}
                    </p>
                    <p style={{ fontSize: '11px', color: '#6b7280', margin: 0 }}>
                      {formatPercent(asset.value)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Center: Current Allocation Pie chart */}
          <div>
            <h4 style={{ fontSize: '14px', fontWeight: 'bold', color: '#111827', marginBottom: '12px', textAlign: 'center' }}>
              Current Allocation
            </h4>
            <ResponsiveContainer width="100%" height={550}>
              <PieChart>
                <Pie
                  data={assetData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={renderCustomLabel}
                  outerRadius={180}
                  innerRadius={70}
                  fill="#8884d8"
                  dataKey="value"
                  onMouseEnter={onPieEnter}
                  onMouseLeave={onPieLeave}
                  startAngle={90}
                  endAngle={-270}
                >
                  {assetData.map((entry, index) => {
                    const isActive = activeIndex === null || activeIndex === index;
                    return (
                      <Cell
                        key={`cell-${index}`}
                        fill={categoryColors[entry.category]}
                        opacity={isActive ? 1 : 0.6}
                      />
                    );
                  })}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Right: Target Allocation Pie chart */}
          <div>
            <h4 style={{ fontSize: '14px', fontWeight: 'bold', color: '#111827', marginBottom: '12px', textAlign: 'center' }}>
              Target Allocation
            </h4>
            <ResponsiveContainer width="100%" height={550}>
              <PieChart>
                <Pie
                  data={[
                    { category: 'Crypto', value: 20, label: '20%' },
                    { category: 'ETF', value: 40, label: '40%' },
                    { category: 'Stock', value: 40, label: '40%' }
                  ]}
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
                    const { cx, cy, midAngle, innerRadius, outerRadius, value } = props;

                    if (midAngle === undefined || cx === undefined || cy === undefined ||
                        innerRadius === undefined || outerRadius === undefined) {
                      return null;
                    }

                    const RADIAN = Math.PI / 180;
                    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                    const x = cx + radius * Math.cos(-midAngle * RADIAN);
                    const y = cy + radius * Math.sin(-midAngle * RADIAN);

                    return (
                      <text
                        x={x}
                        y={y}
                        fill="white"
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize="16px"
                        fontWeight="bold"
                      >
                        {`${value}%`}
                      </text>
                    );
                  }}
                >
                  {[
                    { category: 'Crypto', value: 20 },
                    { category: 'ETF', value: 40 },
                    { category: 'Stock', value: 40 }
                  ].map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={categoryColors[entry.category]}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div style={{ marginTop: '16px', textAlign: 'center' }}>
              <p style={{ fontSize: '12px', color: '#6b7280', margin: '4px 0' }}>
                <strong>Recommended Split:</strong>
              </p>
              <p style={{ fontSize: '11px', color: '#6b7280', margin: '2px 0' }}>
                Crypto: 20% • ETF: 40% • Stock: 40%
              </p>
            </div>
          </div>
        </div>

        {/* Category breakdown - below everything */}
        <div style={{
          marginTop: '24px',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '16px'
        }}>
          {Object.entries(categoryTotals).map(([category, value]) => (
            <div key={category} style={{
              padding: '16px',
              backgroundColor: '#f9fafb',
              borderRadius: '8px',
              border: `2px solid ${categoryColors[category]}`
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <div style={{
                  width: '16px',
                  height: '16px',
                  backgroundColor: categoryColors[category],
                  borderRadius: '4px'
                }}></div>
                <span style={{ fontWeight: 'bold', color: '#111827' }}>{category}</span>
              </div>
              <p style={{ fontSize: '18px', fontWeight: 'bold', color: '#111827', margin: '4px 0' }}>
                {formatCurrency(value)}
              </p>
              <p style={{ fontSize: '14px', color: '#6b7280', margin: 0 }}>
                {formatPercent(value)} of portfolio
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PortfolioAllocationPieChart;
