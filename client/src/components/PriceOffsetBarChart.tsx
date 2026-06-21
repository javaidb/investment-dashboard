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

      await Promise.all(holdings.map(async (holding) => {
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
  // Include all holdings (active, inactive, and custom)

  const chartData = holdings
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
      <div style={{ backgroundColor: '#10141c', borderRadius: '8px', border: '1px solid #1e2535', padding: '24px' }}>
        <p style={{ color: '#64748b', textAlign: 'center', fontSize: '14px' }}>No holdings data available</p>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: '#10141c', borderRadius: '8px', border: '1px solid #1e2535', overflow: 'hidden' }}>
      <div style={{
        background: '#10141c',
        padding: '16px 20px',
        borderBottom: '1px solid #1e2535'
      }}>
        <h3 style={{
          fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
          fontSize: '11px',
          fontWeight: 700,
          color: '#94a3b8',
          letterSpacing: '0.12em',
          textTransform: 'uppercase' as const
        }}>Price Offset from 200-Day SMA</h3>
        <p style={{
          fontSize: '11px',
          color: '#4a5568',
          marginTop: '3px',
          fontFamily: "'IBM Plex Mono', monospace"
        }}>
          Green = above SMA · Red = below SMA · Grey = within ±5%
        </p>
      </div>

      <div style={{ padding: '20px' }}>
        <ResponsiveContainer width="100%" height={500}>
          <BarChart
            data={chartData}
            margin={{ top: 20, right: 20, left: 20, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" />
            <XAxis
              type="category"
              dataKey="symbol"
              stroke="#4a5568"
              tick={{ fill: '#64748b' }}
              fontSize={12}
              fontWeight={600}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis
              type="number"
              stroke="#4a5568"
              tick={{ fill: '#64748b' }}
              fontSize={12}
              tickFormatter={(value) => formatPercent(value)}
              domain={['dataMin', 'dataMax']}
            />
            <Tooltip
              formatter={formatTooltip}
              contentStyle={{
                backgroundColor: '#10141c',
                border: '1px solid #1e2535',
                borderRadius: '6px',
                color: '#cbd5e1'
              }}
              labelStyle={{ color: '#94a3b8' }}
              cursor={{ fill: 'rgba(59, 130, 246, 0.08)' }}
            />
            <ReferenceLine y={0} stroke="#2a3445" strokeWidth={2} />
            {greyZoneStart && greyZoneEnd && (
              <ReferenceArea
                x1={greyZoneStart}
                x2={greyZoneEnd}
                fill="#1e2535"
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
        padding: '12px 20px',
        borderTop: '1px solid #1e2535',
        display: 'flex',
        justifyContent: 'center',
        gap: '24px',
        fontSize: '12px',
        fontFamily: "'IBM Plex Mono', monospace"
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '12px', height: '12px', backgroundColor: '#10B981', borderRadius: '3px' }}></div>
          <span style={{ color: '#64748b' }}>≥5% above SMA</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '12px', height: '12px', backgroundColor: '#475569', borderRadius: '3px' }}></div>
          <span style={{ color: '#64748b' }}>Within ±5%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '12px', height: '12px', backgroundColor: '#EF4444', borderRadius: '3px' }}></div>
          <span style={{ color: '#64748b' }}>≥5% below SMA</span>
        </div>
      </div>
    </div>
  );
};

export default PriceOffsetBarChart;
