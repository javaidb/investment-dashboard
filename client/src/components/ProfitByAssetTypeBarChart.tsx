import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine
} from 'recharts';

interface Holding {
  symbol: string;
  quantity: number;
  type: string;
  totalPnL?: number;
  totalInvested?: number;
  weeklyChangePercent?: number;
  currentValue?: number;
}

interface RecurringInvestment {
  symbol: string;
  name: string;
  currentValue: number;
  totalInvested: number;
  profitLoss?: number;
}

interface ProfitByAssetTypeBarChartProps {
  holdings: Holding[];
  recurringInvestments?: RecurringInvestment[];
}

const ProfitByAssetTypeBarChart: React.FC<ProfitByAssetTypeBarChartProps> = ({
  holdings,
  recurringInvestments = []
}) => {
  // Calculate profit, invested, and weekly change by asset type
  const profitByType: {[key: string]: number} = {
    'Crypto': 0,
    'ETF': 0,
    'Stock': 0,
    'Index Fund': 0
  };

  const investedByType: {[key: string]: number} = {
    'Crypto': 0,
    'ETF': 0,
    'Stock': 0,
    'Index Fund': 0
  };

  const weeklyChangeByType: {[key: string]: {totalChange: number, totalValue: number}} = {
    'Crypto': {totalChange: 0, totalValue: 0},
    'ETF': {totalChange: 0, totalValue: 0},
    'Stock': {totalChange: 0, totalValue: 0},
    'Index Fund': {totalChange: 0, totalValue: 0}
  };

  // Sum up profits, invested amounts, and weekly changes from holdings
  holdings
    .filter(holding => holding.quantity > 0.01)
    .forEach(holding => {
      const profit = holding.totalPnL || 0;
      const invested = holding.totalInvested || 0;
      const currentValue = holding.currentValue || 0;
      const weeklyChange = holding.weeklyChangePercent || null;

      let category = 'Stock';
      if (holding.type === 'c') {
        category = 'Crypto';
      } else if (holding.symbol.includes('XEQT') || holding.symbol.includes('VOO') || holding.symbol.includes('QQQ')) {
        category = 'ETF';
      }

      profitByType[category] += profit;
      investedByType[category] += invested;

      // Calculate weighted weekly change
      if (weeklyChange !== null && weeklyChange !== undefined && currentValue > 0) {
        weeklyChangeByType[category].totalChange += weeklyChange * currentValue;
        weeklyChangeByType[category].totalValue += currentValue;
      }
    });

  // Add recurring investments profit and invested amounts
  recurringInvestments.forEach(inv => {
    // Use profitLoss if available (which includes realized), otherwise calculate unrealized
    const profit = inv.profitLoss !== undefined ? inv.profitLoss : (inv.currentValue - inv.totalInvested) || 0;
    profitByType['Index Fund'] += profit;
    investedByType['Index Fund'] += inv.totalInvested;

    // Calculate weekly change for index funds based on current return
    // Estimate weekly change from overall return (assuming steady growth over time)
    const currentValue = inv.currentValue || 0;
    const totalInvested = inv.totalInvested || 0;
    if (currentValue > 0 && totalInvested > 0) {
      const overallReturnPercent = ((currentValue - totalInvested) / totalInvested) * 100;
      // Estimate weekly change as roughly 1/52 of annual return (rough approximation)
      const estimatedWeeklyChange = overallReturnPercent / 52;

      weeklyChangeByType['Index Fund'].totalChange += estimatedWeeklyChange * currentValue;
      weeklyChangeByType['Index Fund'].totalValue += currentValue;
    }
  });

  // Prepare chart data - filter out categories with zero profit
  const chartData = Object.entries(profitByType)
    .filter(([_, value]) => value !== 0)
    .map(([category, profit]) => {
      const invested = investedByType[category];
      const percentPnL = invested > 0 ? (profit / invested) * 100 : 0;

      // Calculate weighted average weekly change
      const weeklyData = weeklyChangeByType[category];
      const weeklyChange = weeklyData.totalValue > 0
        ? weeklyData.totalChange / weeklyData.totalValue
        : null;

      return {
        category,
        profit: Math.round(profit * 100) / 100, // Round to 2 decimal places
        percentPnL: Math.round(percentPnL * 100) / 100, // Round to 2 decimal places
        weeklyChange: weeklyChange !== null ? Math.round(weeklyChange * 100) / 100 : null
      };
    })
    .sort((a, b) => b.profit - a.profit); // Sort by profit descending

  // Colors matching the pie chart
  const categoryColors: {[key: string]: string} = {
    'Crypto': '#F59E0B',
    'ETF': '#3B82F6',
    'Stock': '#10B981',
    'Index Fund': '#DC2626'
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
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  // Custom label to show percentage on bar tips with weekly change arrow
  const renderCustomLabel = (props: any): React.ReactElement<SVGElement> => {
    const { x, y, width, height, value, index } = props;
    const data = chartData[index];

    const isPositive = value >= 0;
    const labelY = isPositive ? y - 10 : y + height + 20;

    // Return empty text element if no data
    if (!data) {
      return <text />;
    }

    const weeklyChange = data.weeklyChange;
    let arrow = '';
    let arrowColor = '#6b7280';

    if (weeklyChange !== null && weeklyChange !== undefined) {
      if (weeklyChange > 0) {
        arrow = '↑';
        arrowColor = '#166534';
      } else if (weeklyChange < 0) {
        arrow = '↓';
        arrowColor = '#dc2626';
      } else {
        arrow = '→';
        arrowColor = '#6b7280';
      }
    }

    return (
      <g>
        <text
          x={x + width / 2}
          y={labelY}
          fill={isPositive ? '#166534' : '#dc2626'}
          textAnchor="middle"
          fontSize="14px"
          fontWeight="700"
        >
          {formatPercent(data.percentPnL)}
        </text>
        {arrow && (
          <text
            x={x + width / 2 + 45}
            y={labelY}
            fill={arrowColor}
            textAnchor="middle"
            fontSize="16px"
            fontWeight="700"
          >
            {arrow}
          </text>
        )}
      </g>
    );
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
          <p style={{ fontWeight: 'bold', margin: 0, color: '#111827', marginBottom: '8px' }}>
            {data.category}
          </p>
          <p style={{ margin: '4px 0', color: data.profit >= 0 ? '#166534' : '#dc2626', fontWeight: '600' }}>
            P&L: {formatCurrency(data.profit)}
          </p>
          <p style={{ margin: '4px 0', color: data.profit >= 0 ? '#166534' : '#dc2626', fontWeight: '700', fontSize: '14px' }}>
            Return: {formatPercent(data.percentPnL)}
          </p>
          {data.weeklyChange !== null && data.weeklyChange !== undefined && (
            <p style={{
              margin: '4px 0',
              color: data.weeklyChange >= 0 ? '#166534' : '#dc2626',
              fontWeight: '600',
              fontSize: '13px',
              borderTop: '1px solid #e5e7eb',
              paddingTop: '6px',
              marginTop: '6px'
            }}>
              Weekly: {formatPercent(data.weeklyChange)} {data.weeklyChange > 0 ? '↑' : data.weeklyChange < 0 ? '↓' : '→'}
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  if (chartData.length === 0) {
    return null; // Don't render if no data
  }

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden" style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        background: 'linear-gradient(to right, #f8fafc, #f1f5f9)',
        padding: '20px 24px',
        borderBottom: '1px solid #e5e7eb'
      }}>
        <h3 style={{
          fontSize: '20px',
          fontWeight: 'bold',
          color: '#111827',
          margin: 0
        }}>Profit by Type</h3>
        <p style={{
          fontSize: '14px',
          color: '#6b7280',
          marginTop: '4px',
          margin: 0
        }}>
          P&L breakdown by asset category
        </p>
      </div>

      <div style={{ padding: '24px 16px', flex: 1, display: 'flex', flexDirection: 'column', minHeight: '400px' }}>
        <div style={{ flex: 1, minHeight: '350px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 20, right: 60, left: 5, bottom: 80 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis
                dataKey="category"
                stroke="#6B7280"
                fontSize={13}
                fontWeight={600}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis
                stroke="#6B7280"
                fontSize={12}
                tickFormatter={(value) => formatCurrency(value)}
                width={70}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0} stroke="#9CA3AF" strokeWidth={2} />
              <Bar dataKey="profit" radius={[8, 8, 0, 0]} label={renderCustomLabel}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={categoryColors[entry.category]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div style={{
          marginTop: '20px',
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '12px',
          fontSize: '13px'
        }}>
          {chartData.map(({ category, profit, percentPnL, weeklyChange }) => (
            <div key={category} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              backgroundColor: '#f9fafb',
              borderRadius: '8px',
              borderLeft: `4px solid ${categoryColors[category]}`
            }}>
              <span style={{ color: '#6b7280', fontWeight: '600' }}>{category}:</span>
              <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{
                    color: profit >= 0 ? '#166534' : '#dc2626',
                    fontWeight: '700',
                    fontSize: '14px'
                  }}>
                    {formatCurrency(profit)}
                  </span>
                  {weeklyChange !== null && weeklyChange !== undefined && (
                    <span style={{
                      color: weeklyChange >= 0 ? '#166534' : '#dc2626',
                      fontSize: '14px',
                      fontWeight: '700'
                    }}>
                      {weeklyChange > 0 ? '↑' : weeklyChange < 0 ? '↓' : '→'}
                    </span>
                  )}
                </div>
                <span style={{
                  color: profit >= 0 ? '#166534' : '#dc2626',
                  fontWeight: '600',
                  fontSize: '12px'
                }}>
                  {formatPercent(percentPnL)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ProfitByAssetTypeBarChart;
