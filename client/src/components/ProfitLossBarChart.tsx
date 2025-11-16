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
  ReferenceLine,
  LabelList
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
}

interface ProfitLossBarChartProps {
  holdings: Holding[];
}

const ProfitLossBarChart: React.FC<ProfitLossBarChartProps> = ({ holdings }) => {
  // Fetch icons for all holdings
  const symbolsForIcons = holdings.map(holding => ({
    symbol: holding.symbol,
    type: holding.type || 's'
  }));

  const { iconUrls } = useIcons({
    symbols: symbolsForIcons,
    enabled: holdings.length > 0
  });

  // Prepare data for the chart - sort by P&L (least to most profitable)
  // Filter out holdings where quantity is 0 or very close to 0
  const chartData = holdings
    .filter(holding => holding.quantity > 0.01) // Only include holdings with meaningful quantity
    .map(holding => ({
      symbol: holding.symbol,
      pnl: holding.totalPnL || 0,
      companyName: holding.companyName,
      type: holding.type,
      iconUrl: iconUrls[holding.symbol.toUpperCase()]
    }))
    .sort((a, b) => a.pnl - b.pnl); // Sort ascending by P&L (least to most profitable)

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatTooltip = (value: number, name: string, props: any) => {
    return [formatCurrency(value), 'Profit/Loss'];
  };

  // Custom label component to render icons at the tip of bars
  const CustomLabel = (props: any) => {
    const { x, y, width, height, value, index } = props;
    const data = chartData[index];

    if (!data) return null;

    const isPositive = value >= 0;
    const iconSize = 40; // Match the CompanyIcon's hardcoded size

    // Position icon at the end of the bar (vertical layout)
    // For positive bars: y is at top, y + height is at bottom (x-axis) - we want icon BELOW x-axis
    // For negative bars: y is at x-axis (top of bar), y + height is at bottom - we want icon ABOVE x-axis
    const iconX = x + width / 2 - iconSize / 2; // Center horizontally on the bar
    const iconY = isPositive
      ? y + height + 8  // BELOW x-axis for positive bars (y + height is at x-axis)
      : y + height - iconSize - 8; // ABOVE x-axis for negative bars

    return (
      <g>
        <foreignObject
          x={iconX}
          y={iconY}
          width={iconSize}
          height={iconSize}
        >
          <div style={{ width: `${iconSize}px`, height: `${iconSize}px`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CompanyIcon
              symbol={data.symbol}
              iconUrl={data.iconUrl}
              companyName={data.companyName}
              size="xs"
              showFallback={true}
              showTooltip={false}
            />
          </div>
        </foreignObject>
      </g>
    );
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
        }}>Profit/Loss by Asset</h3>
        <p style={{
          fontSize: '14px',
          color: '#6b7280',
          marginTop: '4px'
        }}>
          Green bars show profits, red bars show losses. Asset icons at bar tips.
        </p>
      </div>

      <div style={{ padding: '24px' }}>
        <ResponsiveContainer width="100%" height={500}>
          <BarChart
            data={chartData}
            margin={{ top: 60, right: 20, left: 20, bottom: 60 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis
              type="category"
              dataKey="symbol"
              stroke="#6B7280"
              fontSize={12}
              fontWeight={600}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis
              type="number"
              stroke="#6B7280"
              fontSize={12}
              tickFormatter={(value) => formatCurrency(value)}
              ticks={(() => {
                // Calculate min and max PnL values
                const values = chartData.map(d => d.pnl);
                const minValue = Math.min(...values);
                const maxValue = Math.max(...values);

                // Round to nearest 500
                const minTick = Math.floor(minValue / 500) * 500;
                const maxTick = Math.ceil(maxValue / 500) * 500;

                // Generate ticks every $500
                const ticks = [];
                for (let i = minTick; i <= maxTick; i += 500) {
                  ticks.push(i);
                }
                return ticks;
              })()}
            />
            <Tooltip
              formatter={formatTooltip}
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #E5E7EB',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              }}
              cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
            />
            <ReferenceLine y={0} stroke="#9CA3AF" strokeWidth={2} />
            <Bar dataKey="pnl" radius={[8, 8, 0, 0]}>
              {chartData.map((entry, index) => {
                let color;
                if (entry.pnl > -50 && entry.pnl < 50) {
                  color = '#9CA3AF'; // Grey for values between -50 and 50
                } else if (entry.pnl >= 50) {
                  color = '#10B981'; // Green for profit >= 50
                } else {
                  color = '#EF4444'; // Red for loss <= -50
                }
                return (
                  <Cell
                    key={`cell-${index}`}
                    fill={color}
                  />
                );
              })}
              <LabelList content={<CustomLabel />} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div style={{
        padding: '16px 24px',
        borderTop: '1px solid #e5e7eb',
        display: 'flex',
        justifyContent: 'center',
        gap: '24px',
        fontSize: '14px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '16px',
            height: '16px',
            backgroundColor: '#10B981',
            borderRadius: '4px'
          }}></div>
          <span style={{ color: '#6b7280' }}>Profit ≥ C$50</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '16px',
            height: '16px',
            backgroundColor: '#9CA3AF',
            borderRadius: '4px'
          }}></div>
          <span style={{ color: '#6b7280' }}>Neutral (-C$50 to C$50)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '16px',
            height: '16px',
            backgroundColor: '#EF4444',
            borderRadius: '4px'
          }}></div>
          <span style={{ color: '#6b7280' }}>Loss ≤ -C$50</span>
        </div>
      </div>
    </div>
  );
};

export default ProfitLossBarChart;
