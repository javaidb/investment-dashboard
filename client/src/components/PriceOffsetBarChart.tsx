import React, { useState, useEffect } from 'react';
import { useQuery } from 'react-query';
import axios from 'axios';
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
  usdPrice?: number;
  exchangeRate?: number;
}

interface PriceOffsetBarChartProps {
  holdings: Holding[];
}

const PriceOffsetBarChart: React.FC<PriceOffsetBarChartProps> = ({ holdings }) => {
  const [sma200Values, setSma200Values] = useState<{[symbol: string]: number}>({});

  // Fetch icons for all holdings
  const symbolsForIcons = holdings.map(holding => ({
    symbol: holding.symbol,
    type: holding.type || 's'
  }));

  const { iconUrls } = useIcons({
    symbols: symbolsForIcons,
    enabled: holdings.length > 0
  });

  // Fetch 1-year historical data for all holdings to calculate 200-day SMA
  const { data: historicalAverages } = useQuery(
    ['200day-sma', holdings.map(h => h.symbol).join(',')],
    async () => {
      const averages: {[symbol: string]: number} = {};

      await Promise.all(holdings.filter(h => h.quantity > 0.01).map(async (holding) => {
        try {
          // Request 1 year of data to ensure we have at least 200 trading days
          const response = await axios.get(`/api/portfolio/cache/historical/${holding.symbol}?period=1y`);
          const data = response.data.data || [];

          if (data.length > 0) {
            // Calculate 200-day SMA (or use all available data if less than 200 days)
            const last200Days = data.slice(-200);
            const sum = last200Days.reduce((acc: number, item: any) => acc + item.close, 0);
            const average = sum / last200Days.length;
            averages[holding.symbol] = average;

            if (holding.symbol === 'MSTR') {
              console.log(`📊 MSTR 200-day SMA (USD):`, average);
              console.log(`📊 MSTR latest historical price (USD):`, data[data.length - 1]?.close);
              console.log(`📊 MSTR data points:`, data.length);
              console.log(`📊 MSTR data points used for SMA:`, last200Days.length);
              console.log(`📊 MSTR date range:`, data[0]?.date, 'to', data[data.length - 1]?.date);
            }
          }
        } catch (error) {
          console.warn(`Failed to get 200-day SMA for ${holding.symbol}:`, error);
        }
      }));

      return averages;
    },
    {
      enabled: holdings.length > 0,
      staleTime: 300000, // 5 minutes
    }
  );

  // Update state when data is loaded
  useEffect(() => {
    if (historicalAverages) {
      setSma200Values(historicalAverages);
    }
  }, [historicalAverages]);

  // Prepare data for the chart - calculate offset from 200-day SMA as percentage
  // Filter out holdings where quantity is 0 or very close to 0

  const chartData = holdings
    .filter(holding => holding.quantity > 0.01)
    .map(holding => {
      // Both currentPrice and historical cache should be in the SAME currency
      // Since historical cache stores native prices (USD for US stocks, CAD for CA stocks)
      // and currentPrice is already converted to CAD for display...
      // We need to determine what currency the historical data is in

      const isCanadianStock = holding.symbol.endsWith('.TO');
      const currentPriceCAD = holding.currentPrice || 0;
      const exchangeRate = holding.exchangeRate || 1.4;

      // Historical cache stores:
      // - CAD prices for Canadian stocks (.TO)
      // - USD prices for US stocks and crypto
      const sma200 = sma200Values[holding.symbol];

      let currentPrice, sma200Value, offsetPercent;

      if (isCanadianStock) {
        // Canadian stock: both already in CAD
        currentPrice = currentPriceCAD;
        sma200Value = sma200 || currentPriceCAD;
        offsetPercent = sma200Value !== 0 ? ((currentPrice - sma200Value) / sma200Value) * 100 : 0;
      } else {
        // US stock/crypto: historical is USD, but currentPrice is CAD
        // Convert historical USD to CAD to match currentPrice
        const sma200CAD = sma200 ? sma200 * exchangeRate : currentPriceCAD;
        currentPrice = currentPriceCAD;
        sma200Value = sma200CAD;
        offsetPercent = sma200Value !== 0 ? ((currentPrice - sma200Value) / sma200Value) * 100 : 0;
      }

      return {
        symbol: holding.symbol,
        offset: offsetPercent,
        currentPrice: currentPrice,
        sma200: sma200Value,
        companyName: holding.companyName,
        type: holding.type,
        iconUrl: iconUrls[holding.symbol.toUpperCase()],
        weeklyChangePercent: holding.weeklyChangePercent,
        // Debug fields
        _debugCurrentCAD: currentPriceCAD,
        _debugHistoricalRaw: sma200,
        _debugUsedCurrent: currentPrice,
        _debugUsedAvg: sma200Value,
        _debugExchangeRate: exchangeRate,
        _debugIsCanadian: isCanadianStock
      };
    })
    .sort((a, b) => a.offset - b.offset); // Sort by offset (lowest to highest)

  // Find the grey zone (where offset is between -5% and +5%)
  const firstGreyIndex = chartData.findIndex(item => item.offset > -5);
  const lastGreyIndex = chartData.findIndex(item => item.offset >= 5);
  const greyZoneStart = firstGreyIndex >= 0 ? chartData[firstGreyIndex].symbol : null;
  const greyZoneEnd = lastGreyIndex >= 0 ? chartData[lastGreyIndex - 1]?.symbol : chartData[chartData.length - 1]?.symbol;


  const formatPercent = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  };

  const formatTooltip = (value: number, name: string, props: any) => {
    const data = props.payload;
    return [
      `Offset: ${formatPercent(value)}`,
      `Current (CAD): $${data._debugUsedCurrent?.toFixed(2) || 'N/A'}`,
      `200-day SMA (CAD): $${data._debugUsedAvg?.toFixed(2) || 'N/A'}`,
      `Historical (raw): $${data._debugHistoricalRaw?.toFixed(2) || 'N/A'}`,
      `Exchange Rate: ${data._debugExchangeRate?.toFixed(4) || 'N/A'}`,
      `Is Canadian: ${data._debugIsCanadian ? 'Yes' : 'No'}`
    ];
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

    return (
      <g>
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
        }}>Price Offset from 200-Day SMA</h3>
        <p style={{
          fontSize: '14px',
          color: '#6b7280',
          marginTop: '4px'
        }}>
          Shows how much current price differs from 200-day simple moving average. Green = above SMA, Red = below SMA.
        </p>
      </div>

      <div style={{ padding: '24px' }}>
        <ResponsiveContainer width="100%" height={500}>
          <BarChart
            data={chartData}
            margin={{ top: 80, right: 20, left: 20, bottom: 100 }}
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
              tickFormatter={(value) => formatPercent(value)}
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
            {/* Grey background for neutral zone (±5%) */}
            {greyZoneStart && greyZoneEnd && (
              <ReferenceArea
                x1={greyZoneStart}
                x2={greyZoneEnd}
                fill="#F3F4F6"
                fillOpacity={0.5}
              />
            )}
            <Bar dataKey="offset" radius={[8, 8, 0, 0]}>
              {chartData.map((entry, index) => {
                let color;
                if (entry.offset > -5 && entry.offset < 5) {
                  color = '#9CA3AF'; // Grey for values within 5% of average
                } else if (entry.offset >= 5) {
                  color = '#10B981'; // Green for 5%+ above average
                } else {
                  color = '#EF4444'; // Red for 5%+ below average
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
          <span style={{ color: '#6b7280' }}>≥5% above 200-day SMA</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '16px',
            height: '16px',
            backgroundColor: '#9CA3AF',
            borderRadius: '4px'
          }}></div>
          <span style={{ color: '#6b7280' }}>Within ±5% of 200-day SMA</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '16px',
            height: '16px',
            backgroundColor: '#EF4444',
            borderRadius: '4px'
          }}></div>
          <span style={{ color: '#6b7280' }}>≥5% below 200-day SMA</span>
        </div>
      </div>
    </div>
  );
};

export default PriceOffsetBarChart;
