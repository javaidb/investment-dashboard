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
  LabelList,
  ReferenceArea
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
  // Include all holdings (active, inactive, and custom)
  const chartData = holdings
    .map(holding => ({
      symbol: holding.symbol,
      pnl: holding.totalPnL || 0,
      companyName: holding.companyName,
      type: holding.type,
      iconUrl: iconUrls[holding.symbol.toUpperCase()],
      weeklyChangePercent: holding.weeklyChangePercent, // Add weekly change data
      quantity: holding.quantity
    }))
    .sort((a, b) => a.pnl - b.pnl); // Sort ascending by P&L (least to most profitable)

  // Find the grey zone (where P&L is between -50 and 50)
  const firstGreyIndex = chartData.findIndex(item => item.pnl > -50);
  const lastGreyIndex = chartData.findIndex(item => item.pnl >= 50);
  const greyZoneStart = firstGreyIndex >= 0 ? chartData[firstGreyIndex].symbol : null;
  const greyZoneEnd = lastGreyIndex >= 0 ? chartData[lastGreyIndex - 1]?.symbol : chartData[chartData.length - 1]?.symbol;


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

  // Custom background component to highlight bars with negative profit but positive weekly change
  const CustomBackground = (props: any) => {
    const { x, y, width, height, index } = props;
    const entry = chartData[index];

    // Safety check: return empty rect if entry doesn't exist
    if (!entry) {
      return <rect x={x} y={y} width={width} height={height} fill="none" />;
    }

    const isNegativeProfit = entry.pnl < 0;
    const isPositiveWeeklyChange = entry.weeklyChangePercent && entry.weeklyChangePercent > 0;
    const isInGreyZone = entry.pnl > -50 && entry.pnl < 50;

    // Highlight background if negative profit but positive weekly change, but NOT in grey zone
    if (isNegativeProfit && isPositiveWeeklyChange && !isInGreyZone) {
      return (
        <rect
          x={x}
          y={0}
          width={width}
          height={y + height}
          fill="#10B981"
          fillOpacity={0.15}
        />
      );
    }
    return <rect x={x} y={y} width={width} height={height} fill="none" />;
  };

  // Custom label component to render icons and arrows at the tip of bars
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

    // Use weekly change percentage for arrow direction and length
    const weeklyChange = data.weeklyChangePercent;
    const hasWeeklyData = weeklyChange !== null && weeklyChange !== undefined;

    // Calculate arrow properties based on weekly change percentage magnitude
    const weeklyChangeMagnitude = hasWeeklyData ? Math.abs(weeklyChange) : 0;
    const maxArrowLength = 40; // Maximum arrow length in pixels
    const minArrowLength = 12; // Minimum arrow length in pixels
    // Scale arrow length based on weekly change percentage (linear scale for percentages)
    // Arrow grows longer as percentage increases
    const arrowLength = hasWeeklyData
      ? Math.min(maxArrowLength, Math.max(minArrowLength, weeklyChangeMagnitude * 3))
      : minArrowLength;

    // Arrow color and direction based on WEEKLY CHANGE (not P&L)
    const isWeeklyUp = hasWeeklyData && weeklyChange >= 0;
    const arrowColor = isWeeklyUp ? '#10B981' : '#EF4444'; // Green for up, red for down

    // Position arrow at the tip of the bar (the end furthest from zero)
    const arrowX = x + width / 2;
    // For vertical bars in Recharts:
    // - Positive values: y is at the bar top (tip), y + height is at x-axis
    // - Negative values: y is at the bar BOTTOM (tip), y + height is at x-axis
    // Arrow starts just outside the bar tip
    let arrowStartY;
    if (value >= 0) {
      // Positive value: bar top (y) is the tip, arrow extends upward from just above it
      arrowStartY = y - 8;
    } else {
      // Negative value: y is at the tip (bottom), arrow extends downward from just below it
      arrowStartY = y + 8;
    }

    // Only show arrow if we have weekly data
    const showArrow = hasWeeklyData;

    // Determine asset type and color
    const assetTypeColors: {[key: string]: string} = {
      'Crypto': '#F59E0B',
      'ETF': '#3B82F6',
      'Stock': '#10B981',
      'Index Fund': '#DC2626'
    };

    let assetType = 'Stock';
    if (data.type === 'c') {
      assetType = 'Crypto';
    } else if (data.symbol.includes('XEQT') || data.symbol.includes('VOO') || data.symbol.includes('QQQ') || data.symbol.includes('IBIT')) {
      assetType = 'ETF';
    }

    const assetTypeColor = assetTypeColors[assetType];

    // Asset type indicator line position (at the tip of the bar)
    const indicatorLineY = isPositive ? y : y;
    const indicatorLineWidth = width * 0.8; // 80% of bar width
    const indicatorLineX = x + (width - indicatorLineWidth) / 2;

    return (
      <g>
        {/* Asset type indicator - rounded rectangle matching bar tip curvature */}
        {/* Black outline */}
        <rect
          x={x}
          y={isPositive ? y : y - 6}
          width={width}
          height={6}
          fill="#000000"
          rx={8}
          ry={8}
        />
        {/* Colored indicator on top */}
        <rect
          x={x + 1}
          y={isPositive ? y + 1 : y - 5}
          width={width - 2}
          height={4}
          fill={assetTypeColor}
          rx={7}
          ry={7}
        />

        {/* Arrow - based on weekly change, always at tip of bar */}
        {showArrow && (
          <>
            {weeklyChangeMagnitude < 5 ? (
              // Small change (<5%): show only arrowhead, no tail
              isWeeklyUp ? (
                // UP arrowhead only
                <polygon
                  points={`${arrowX},${isPositive ? arrowStartY - 8 : arrowStartY - 8} ${arrowX - 5},${isPositive ? arrowStartY + 2 : arrowStartY + 2} ${arrowX + 5},${isPositive ? arrowStartY + 2 : arrowStartY + 2}`}
                  fill={arrowColor}
                />
              ) : (
                // DOWN arrowhead only
                <polygon
                  points={`${arrowX},${isPositive ? arrowStartY + 8 : arrowStartY + 8} ${arrowX - 5},${isPositive ? arrowStartY - 2 : arrowStartY - 2} ${arrowX + 5},${isPositive ? arrowStartY - 2 : arrowStartY - 2}`}
                  fill={arrowColor}
                />
              )
            ) : (
              // Large change (>=5%): show full arrow with tail
              <>
                {isPositive ? (
                  // For positive P&L bars: arrow extends UPWARD from tip
                  isWeeklyUp ? (
                    // Positive weekly change: UP arrow (tip at top)
                    <g>
                      <line
                        x1={arrowX}
                        y1={arrowStartY}
                        x2={arrowX}
                        y2={arrowStartY - arrowLength}
                        stroke={arrowColor}
                        strokeWidth={2}
                      />
                      <polygon
                        points={`${arrowX},${arrowStartY - arrowLength - 5} ${arrowX - 4},${arrowStartY - arrowLength + 2} ${arrowX + 4},${arrowStartY - arrowLength + 2}`}
                        fill={arrowColor}
                      />
                    </g>
                  ) : (
                    // Negative weekly change: DOWN arrow (arrowhead at bar tip, extends upward)
                    <g>
                      <line
                        x1={arrowX}
                        y1={arrowStartY}
                        x2={arrowX}
                        y2={arrowStartY - arrowLength}
                        stroke={arrowColor}
                        strokeWidth={2}
                      />
                      <polygon
                        points={`${arrowX},${arrowStartY + 5} ${arrowX - 4},${arrowStartY - 2} ${arrowX + 4},${arrowStartY - 2}`}
                        fill={arrowColor}
                      />
                    </g>
                  )
                ) : (
                  // For negative P&L bars: arrow extends DOWNWARD from tip
                  isWeeklyUp ? (
                    // Positive weekly change: UP arrow (arrowhead at bar tip, extends downward)
                    <g>
                      <line
                        x1={arrowX}
                        y1={arrowStartY}
                        x2={arrowX}
                        y2={arrowStartY + arrowLength}
                        stroke={arrowColor}
                        strokeWidth={2}
                      />
                      <polygon
                        points={`${arrowX},${arrowStartY - 5} ${arrowX - 4},${arrowStartY + 2} ${arrowX + 4},${arrowStartY + 2}`}
                        fill={arrowColor}
                      />
                    </g>
                  ) : (
                    // Negative weekly change: DOWN arrow (tip at bottom)
                    <g>
                      <line
                        x1={arrowX}
                        y1={arrowStartY}
                        x2={arrowX}
                        y2={arrowStartY + arrowLength}
                        stroke={arrowColor}
                        strokeWidth={2}
                      />
                      <polygon
                        points={`${arrowX},${arrowStartY + arrowLength + 5} ${arrowX - 4},${arrowStartY + arrowLength - 2} ${arrowX + 4},${arrowStartY + arrowLength - 2}`}
                        fill={arrowColor}
                      />
                    </g>
                  )
                )}
              </>
            )}
          </>
        )}

        {/* Icon */}
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
          Green bars show profits, red bars show losses. Green background highlights indicate negative P&L with rising momentum - consider buying opportunities.
        </p>
      </div>

      <div style={{ padding: '24px' }}>
        <ResponsiveContainer width="100%" height={500}>
          <BarChart
            data={chartData}
            margin={{ top: 20, right: 20, left: 20, bottom: 20 }}
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
              domain={(() => {
                const values = chartData.map(d => d.pnl);
                const minValue = Math.min(...values);
                const maxValue = Math.max(...values);
                const minTick = Math.floor(minValue / 500) * 500;
                const maxTick = Math.ceil(maxValue / 500) * 500;
                return [minTick, maxTick];
              })()}
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
            {/* Grey background for neutral zone (-$50 to $50) */}
            {greyZoneStart && greyZoneEnd && (
              <ReferenceArea
                x1={greyZoneStart}
                x2={greyZoneEnd}
                fill="#F3F4F6"
                fillOpacity={0.5}
              />
            )}
            <Bar dataKey="pnl" radius={[8, 8, 0, 0]} background={<CustomBackground />}>
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
