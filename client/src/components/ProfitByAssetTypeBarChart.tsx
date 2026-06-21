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
  weeklyChangePercent?: number | number[];
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
  // Include all holdings (even sold ones) to show total P&L including realized gains/losses
  holdings.forEach(holding => {
      const profit = holding.totalPnL || 0;
      const invested = holding.totalInvested || 0;
      const currentValue = holding.currentValue || 0;
      // Handle both array and single number for weeklyChangePercent
      const weeklyChangeRaw = holding.weeklyChangePercent;
      const weeklyChange = Array.isArray(weeklyChangeRaw) ? weeklyChangeRaw[2] : weeklyChangeRaw; // Use latest value if array

      let category = 'Stock';
      if (holding.type === 'c') {
        category = 'Crypto';
      } else if (holding.symbol.includes('XEQT') || holding.symbol.includes('VOO') || holding.symbol.includes('QQQ') || holding.symbol.includes('IBIT')) {
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
    const labelY = isPositive ? y - 10 : y + height - 14;

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
        arrowColor = '#22c55e';
      } else if (weeklyChange < 0) {
        arrow = '↓';
        arrowColor = '#ef4444';
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
          fill={isPositive ? '#22c55e' : '#ef4444'}
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
      const mono = "'IBM Plex Mono', monospace";
      return (
        <div style={{ backgroundColor: '#10141c', padding: '10px 14px', border: '1px solid #1e2535', borderRadius: '4px' }}>
          <p style={{ fontFamily: mono, fontWeight: 700, margin: '0 0 6px', color: '#e2e8f0', fontSize: '12px' }}>{data.category}</p>
          <p style={{ fontFamily: mono, margin: '3px 0', color: data.profit >= 0 ? '#22c55e' : '#ef4444', fontWeight: 600, fontSize: '12px' }}>
            P&L: {formatCurrency(data.profit)}
          </p>
          <p style={{ fontFamily: mono, margin: '3px 0', color: data.profit >= 0 ? '#22c55e' : '#ef4444', fontWeight: 700, fontSize: '12px' }}>
            Return: {formatPercent(data.percentPnL)}
          </p>
          {data.weeklyChange !== null && data.weeklyChange !== undefined && (
            <p style={{ fontFamily: mono, margin: '3px 0', color: data.weeklyChange >= 0 ? '#22c55e' : '#ef4444', fontWeight: 600, fontSize: '11px', borderTop: '1px solid #1e2535', paddingTop: '5px', marginTop: '5px' }}>
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

  const mono = "'IBM Plex Mono', 'Courier New', monospace";

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#10141c', borderRadius: '6px', border: '1px solid #1e2535', overflow: 'hidden' }}>
      <div style={{ background: '#141820', padding: '12px 20px', borderBottom: '1px solid #1e2535' }}>
        <div style={{ fontFamily: mono, fontSize: '11px', fontWeight: 700, color: '#4a5568', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Profit by Type</div>
        <p style={{ fontFamily: mono, fontSize: '11px', color: '#4a5568', marginTop: '2px', margin: '2px 0 0' }}>
          P&L by asset category · green = rising momentum on negative P&L
        </p>
      </div>

      <div style={{ padding: '16px 12px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, minHeight: '240px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 20, right: 50, left: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" />
              <XAxis dataKey="category" stroke="#4a5568" fontSize={12} fontFamily={mono} fontWeight={600} angle={-35} textAnchor="end" height={60} tick={{ fill: '#94a3b8' }} />
              <YAxis stroke="#4a5568" fontSize={11} fontFamily={mono} tickFormatter={(v) => formatCurrency(v)} width={80} tick={{ fill: '#94a3b8' }} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0} stroke="#1e2535" strokeWidth={2} />
              <Bar dataKey="profit" radius={[4, 4, 0, 0]} label={renderCustomLabel}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={categoryColors[entry.category]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
          {chartData.map(({ category, profit, percentPnL, weeklyChange }) => (
            <div key={category} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', backgroundColor: '#141820', borderRadius: '4px', borderLeft: `3px solid ${categoryColors[category]}` }}>
              <span style={{ fontFamily: mono, color: '#94a3b8', fontWeight: 600, fontSize: '12px' }}>{category}:</span>
              <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontFamily: mono, color: profit >= 0 ? '#22c55e' : '#ef4444', fontWeight: 700, fontSize: '13px' }}>{formatCurrency(profit)}</span>
                  {weeklyChange !== null && weeklyChange !== undefined && (
                    <span style={{ fontFamily: mono, color: weeklyChange >= 0 ? '#22c55e' : '#ef4444', fontSize: '13px', fontWeight: 700 }}>
                      {weeklyChange > 0 ? '↑' : weeklyChange < 0 ? '↓' : '→'}
                    </span>
                  )}
                </div>
                <span style={{ fontFamily: mono, color: profit >= 0 ? '#22c55e' : '#ef4444', fontWeight: 600, fontSize: '11px' }}>{formatPercent(percentPnL)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ProfitByAssetTypeBarChart;
