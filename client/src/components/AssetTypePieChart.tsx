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
  sector?: string;
  currentPrice?: number;
  currentValue?: number;
  unrealizedPnL?: number;
  totalPnL?: number;
  totalPnLPercent?: number;
  weeklyChangePercent?: number | number[] | null;
  usdPrice?: number;
  exchangeRate?: number;
}

interface RecurringInvestment {
  symbol: string;
  name: string;
  currentValue: number;
  totalInvested: number;
}

interface AssetTypePieChartProps {
  holdings: Holding[];
  recurringInvestments?: RecurringInvestment[];
}

const AssetTypePieChart: React.FC<AssetTypePieChartProps> = ({ holdings, recurringInvestments = [] }) => {
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
      } else if (holding.symbol.includes('XEQT') || holding.symbol.includes('VOO') || holding.symbol.includes('QQQ') || holding.symbol.includes('IBIT')) {
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
    });

  // Add recurring investments as separate category (red)
  const recurringData = recurringInvestments
    .filter(inv => inv.currentValue > 0)
    .map(inv => ({
      symbol: inv.symbol,
      name: inv.name,
      value: inv.currentValue,
      category: 'Index Fund',
      type: 's',
      iconUrl: iconUrls[inv.symbol.toUpperCase()]
    }));

  // Combine both datasets
  const combinedData = [...assetData, ...recurringData]
    .sort((a, b) => {
      // First, sort by category to group them together
      const categoryOrder: {[key: string]: number} = { 'Crypto': 0, 'ETF': 1, 'Index Fund': 2, 'Stock': 3 };
      if (categoryOrder[a.category] !== categoryOrder[b.category]) {
        return categoryOrder[a.category] - categoryOrder[b.category];
      }
      // Within same category, sort by value descending
      return b.value - a.value;
    });

  // Calculate totals by category (using combined data)
  const categoryTotals = combinedData.reduce((acc, asset) => {
    acc[asset.category] = (acc[asset.category] || 0) + asset.value;
    return acc;
  }, {} as {[key: string]: number});

  const totalValue = combinedData.reduce((sum, asset) => sum + asset.value, 0);

  // Colors for categories
  const categoryColors: {[key: string]: string} = {
    'Crypto': '#F59E0B',
    'ETF': '#3B82F6',
    'Stock': '#10B981',
    'Index Fund': '#DC2626',  // Red for recurring investments
    'ETF + Index Fund': '#9333EA'  // Purple for combined target allocation
  };

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

    const asset = combinedData[index];
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
        }}>Portfolio by Asset Type</h3>
        <p style={{
          fontSize: '14px',
          color: '#6b7280',
          marginTop: '4px'
        }}>
          Current vs target allocation across asset categories
        </p>
      </div>

      <div style={{ padding: '24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '24px' }}>
          {/* Individual Assets List */}
          <div>
            <h4 style={{ fontSize: '14px', fontWeight: 'bold', color: '#111827', marginBottom: '12px' }}>
              Individual Assets
            </h4>
            <div style={{
              maxHeight: '832px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              paddingRight: '8px'
            }}>
              {combinedData.map((asset, index) => (
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

          {/* Pie Chart Section */}
          <div>
            <h4 style={{ fontSize: '14px', fontWeight: 'bold', color: '#111827', marginBottom: '12px', textAlign: 'center' }}>
              Current vs Target Allocation
            </h4>
            <div style={{ marginBottom: '12px', textAlign: 'center' }}>
              <p style={{ fontSize: '12px', color: '#6b7280', margin: '2px 0' }}>
                <span style={{ fontWeight: '600' }}>Target:</span> Crypto 15% • ETF/Index 50% • Stock 35%
              </p>
            </div>
            <ResponsiveContainer width="100%" height={550}>
              <PieChart>
                <defs>
                  <linearGradient id="etfIndexGradient" x1="0%" y1="50%" x2="100%" y2="50%">
                    <stop offset="0%" stopColor="#DC2626" />
                    <stop offset="100%" stopColor="#3B82F6" />
                  </linearGradient>
                </defs>

                {/* Background: Target Allocation (semi-transparent, slightly larger radius) */}
                <Pie
                  data={[
                    { category: 'Crypto', value: 15, label: '15%' },
                    { category: 'ETF + Index Fund', value: 50, label: '50%' },
                    { category: 'Stock', value: 35, label: '35%' }
                  ]}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={200}
                  innerRadius={60}
                  fill="#8884d8"
                  dataKey="value"
                  startAngle={90}
                  endAngle={-270}
                >
                  {[
                    { category: 'Crypto', value: 15 },
                    { category: 'ETF + Index Fund', value: 50 },
                    { category: 'Stock', value: 35 }
                  ].map((entry, index) => (
                    <Cell
                      key={`target-cell-${index}`}
                      fill={entry.category === 'ETF + Index Fund' ? 'url(#etfIndexGradient)' : categoryColors[entry.category]}
                      opacity={0.35}
                      stroke="#ffffff"
                      strokeWidth={3}
                    />
                  ))}
                </Pie>

                {/* Foreground: Current Allocation (smaller radius to show target behind) */}
                <Pie
                  data={combinedData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={renderCustomLabel}
                  outerRadius={175}
                  innerRadius={75}
                  fill="#8884d8"
                  dataKey="value"
                  onMouseEnter={onPieEnter}
                  onMouseLeave={onPieLeave}
                  startAngle={90}
                  endAngle={-270}
                >
                  {combinedData.map((entry, index) => {
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

            {/* Category breakdown cards below chart */}
            <div style={{
              marginTop: '24px',
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '12px'
            }}>
              {Object.entries(categoryTotals).map(([category, value]) => (
                <div
                  key={category}
                  style={{
                    padding: '16px',
                    backgroundColor: '#f9fafb',
                    borderRadius: '12px',
                    borderLeft: `4px solid ${categoryColors[category]}`,
                    transition: 'all 0.2s',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={() => {
                    const index = combinedData.findIndex(d => d.category === category);
                    if (index !== -1) setActiveIndex(index);
                  }}
                  onMouseLeave={() => setActiveIndex(null)}
                >
                  <p style={{
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#6b7280',
                    margin: '0 0 8px 0'
                  }}>
                    {category}
                  </p>
                  <p style={{
                    fontSize: '20px',
                    fontWeight: 'bold',
                    color: '#111827',
                    margin: '0 0 4px 0'
                  }}>
                    {formatCurrency(value)}
                  </p>
                  <p style={{
                    fontSize: '13px',
                    color: '#6b7280',
                    margin: 0
                  }}>
                    {formatPercent(value)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssetTypePieChart;
