import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ComposedChart,
  PieChart,
  Pie,
  Cell,
  Customized
} from 'recharts';

const CandlestickLayerBase: React.FC<any> = ({ xAxisMap, yAxisMap, yAxisId = 0, chartData }) => {
  if (!chartData || !xAxisMap || !yAxisMap) return null;
  const xAxis = Object.values(xAxisMap)[0] as any;
  const yAxis = (yAxisMap[yAxisId] ?? Object.values(yAxisMap)[0]) as any;
  if (!xAxis?.scale || !yAxis?.scale) return null;

  const sc = xAxis.scale;
  const isBand = typeof sc.bandwidth === 'function' && sc.bandwidth() > 0;
  const step = isBand ? sc.bandwidth() : (typeof sc.step === 'function' ? sc.step() : 10);
  const candleWidth = Math.max(2, Math.min(14, step * 0.65));

  return (
    <g>
      {(chartData as any[]).map((point, index) => {
        if (point.candleOpen === undefined || point.candleClose === undefined) return null;
        const xRaw = sc(point.date);
        if (xRaw === undefined || xRaw === null) return null;
        const xCenter = isBand ? xRaw + step / 2 : xRaw;
        const openY = yAxis.scale(point.candleOpen);
        const closeY = yAxis.scale(point.candleClose);
        if (openY === undefined || closeY === undefined) return null;
        const isUp = point.candleClose >= point.candleOpen;
        const color = isUp ? '#10b981' : '#ef4444';
        const borderColor = isUp ? '#059669' : '#dc2626';
        const bodyTop = Math.min(openY, closeY);
        const bodyHeight = Math.max(1, Math.abs(closeY - openY));
        return (
          <g key={`candle-${index}`}>
            <rect
              x={xCenter - candleWidth / 2}
              y={bodyTop}
              width={candleWidth}
              height={bodyHeight}
              fill={color}
              fillOpacity={0.85}
              stroke={borderColor}
              strokeWidth={1}
            />
          </g>
        );
      })}
    </g>
  );
};

interface DailyPortfolioRecord {
  date: string;
  totalValue: number;
  totalInvested: number;
  totalPnL: number;
  unrealizedPnL: number;
  realizedPnL: number;
  totalPnLPercent: number;
  holdings?: { [symbol: string]: any };
  transactions?: any[];
}

interface TotalPortfolioPnLData {
  portfolioId: string;
  dailyRecords: DailyPortfolioRecord[];
  totalRecords: number;
  startDate: string;
  endDate: string;
}

interface TotalPortfolioPnLChartProps {
  portfolioId: string;
}

type DateRange = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | 'ALL';

const TotalPortfolioPnLChart: React.FC<TotalPortfolioPnLChartProps> = ({ portfolioId }) => {
  const [portfolioData, setPortfolioData] = useState<TotalPortfolioPnLData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedView, setSelectedView] = useState<'timeline' | 'breakdown'>('timeline');
  const [dateRange, setDateRange] = useState<DateRange>('ALL');
  const [chartType, setChartType] = useState<'line' | 'candle'>('line');

  useEffect(() => {
    fetchPortfolioPnLData();
  }, [portfolioId]);

  const fetchPortfolioPnLData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch aggregated P&L data from individual asset P&L caches
      // This is the CORRECT calculation that sums up all individual asset P&L values
      const response = await fetch(`/api/pnl/portfolio/${portfolioId}/combined`, {
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        const text = await response.text();
        console.error('Response error:', text);
        throw new Error(`Failed to fetch portfolio P&L data: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Portfolio P&L data not available');
      }

      // Data is already in the correct format
      const transformedData: TotalPortfolioPnLData = {
        portfolioId: result.portfolioId,
        dailyRecords: result.dailyRecords,
        totalRecords: result.totalRecords,
        startDate: result.startDate || '',
        endDate: result.endDate || ''
      };

      setPortfolioData(transformedData);
    } catch (err: any) {
      console.error('Error fetching portfolio P&L data:', err);
      setError(err.message || 'Failed to load portfolio P&L data');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatPercent = (value: number): string => {
    return `${value.toFixed(2)}%`;
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Filter data based on selected date range
  const getFilteredData = (data: DailyPortfolioRecord[]): DailyPortfolioRecord[] => {
    if (!data || data.length === 0 || dateRange === 'ALL') {
      return data;
    }

    const today = new Date();
    let startDate = new Date();

    switch (dateRange) {
      case '1D':
        startDate.setDate(today.getDate() - 1);
        break;
      case '1W':
        startDate.setDate(today.getDate() - 7);
        break;
      case '1M':
        startDate.setMonth(today.getMonth() - 1);
        break;
      case '3M':
        startDate.setMonth(today.getMonth() - 3);
        break;
      case '6M':
        startDate.setMonth(today.getMonth() - 6);
        break;
      case '1Y':
        startDate.setFullYear(today.getFullYear() - 1);
        break;
      default:
        return data;
    }

    return data.filter(record => new Date(record.date) >= startDate);
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload as DailyPortfolioRecord;

      return (
        <div className="bg-white p-4 border border-gray-300 rounded-lg shadow-lg">
          <p className="font-semibold text-gray-800 mb-2">{formatDate(label)}</p>
          <div className="space-y-1 text-sm">
            <p className="text-gray-700">
              <span className="font-medium">Total Value:</span> {formatCurrency(data.totalValue)}
            </p>
            <p className="text-gray-700">
              <span className="font-medium">Total Invested:</span> {formatCurrency(data.totalInvested)}
            </p>
            <p className="text-gray-700">
              <span className="font-medium">Assets:</span> {data.holdings ? Object.keys(data.holdings).length : 0}
            </p>
            <div className="border-t border-gray-200 mt-2 pt-2">
              <p className={`font-semibold ${data.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                Total P&L: {formatCurrency(data.totalPnL)} ({formatPercent(data.totalPnLPercent)})
              </p>
              <p className={`text-xs ${data.unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                Unrealized: {formatCurrency(data.unrealizedPnL)}
              </p>
              {data.realizedPnL !== 0 && (
                <p className={`text-xs ${data.realizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  Realized: {formatCurrency(data.realizedPnL)}
                </p>
              )}
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 bg-white rounded-lg shadow">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading portfolio P&L data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 shadow">
        <div className="flex items-center">
          <svg className="h-6 w-6 text-yellow-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h3 className="text-yellow-800 font-semibold">Portfolio P&L Data Not Available</h3>
            <p className="text-yellow-600 text-sm mt-1">{error}</p>
            <p className="text-yellow-600 text-sm mt-1">
              Calculate P&L for individual assets first using the Calculate/Update P&L button.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!portfolioData || !portfolioData.dailyRecords || portfolioData.dailyRecords.length === 0) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 shadow">
        <p className="text-yellow-800 font-semibold">No portfolio P&L data available.</p>
        <p className="text-yellow-600 text-sm mt-2">
          Calculate P&L for your assets first using the Calculate/Update P&L button.
        </p>
      </div>
    );
  }

  // Find the latest record that has stock data (not just crypto)
  // Crypto symbols to exclude when looking for stock data
  const cryptoSymbols = ['BTC', 'ETH', 'DOGE', 'SOL', 'ZEC', 'XRP', 'ADA', 'TRUMP'];

  let latestRecord = portfolioData.dailyRecords[portfolioData.dailyRecords.length - 1];

  // Check if the latest record only has crypto
  if (latestRecord.holdings) {
    const symbols = Object.keys(latestRecord.holdings);
    const hasOnlyCrypto = symbols.every(symbol => cryptoSymbols.includes(symbol));

    if (hasOnlyCrypto && symbols.length > 0) {
      // Find the most recent record that has stocks
      for (let i = portfolioData.dailyRecords.length - 2; i >= 0; i--) {
        const record = portfolioData.dailyRecords[i];
        if (record.holdings) {
          const recordSymbols = Object.keys(record.holdings);
          const hasStocks = recordSymbols.some(symbol => !cryptoSymbols.includes(symbol));
          if (hasStocks) {
            latestRecord = record;
            console.log(`Using ${record.date} for breakdown (latest with stock data)`);
            break;
          }
        }
      }
    }
  }

  // Prepare chart data - apply date range filter and split positive/negative for area fills
  const filteredData = getFilteredData(portfolioData.dailyRecords);
  const chartData = filteredData.map((record, index) => ({
    ...record,
    totalPnLPositive: record.totalPnL > 0 ? record.totalPnL : null,
    totalPnLNegative: record.totalPnL < 0 ? record.totalPnL : null,
    unrealizedPnLPos: record.unrealizedPnL > 0 ? record.unrealizedPnL : null,
    unrealizedPnLNeg: record.unrealizedPnL < 0 ? record.unrealizedPnL : null,
    realizedPnLPos: record.realizedPnL > 0 ? record.realizedPnL : null,
    realizedPnLNeg: record.realizedPnL < 0 ? record.realizedPnL : null,
    candleOpen: index > 0 ? filteredData[index - 1].totalPnL : record.totalPnL,
    candleClose: record.totalPnL
  }));

  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '16px',
      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
      border: '1px solid #e5e7eb',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(to right, #f8fafc, #f1f5f9)',
        padding: '20px 24px',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#111827', marginBottom: '4px' }}>
            Total Portfolio P&L
          </h2>
          <p style={{ fontSize: '13px', color: '#6b7280' }}>
            From {formatDate(portfolioData.startDate)} • {portfolioData.totalRecords} days tracked
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Current Portfolio</p>
          <p style={{ fontSize: '16px', fontWeight: '600', color: '#111827' }}>
            {formatCurrency(latestRecord.totalValue)}
          </p>
          <p style={{
            fontSize: '20px',
            fontWeight: '700',
            color: latestRecord.totalPnL >= 0 ? '#166534' : '#dc2626',
            marginTop: '4px'
          }}>
            {formatCurrency(latestRecord.totalPnL)}
          </p>
          <p style={{
            fontSize: '13px',
            fontWeight: '600',
            color: latestRecord.totalPnLPercent >= 0 ? '#166534' : '#dc2626'
          }}>
            {formatPercent(latestRecord.totalPnLPercent)}
          </p>
        </div>
      </div>

      <div style={{ padding: '24px' }}>
        {/* Date Range Selector */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {(['1D', '1W', '1M', '3M', '6M', '1Y', 'ALL'] as DateRange[]).map((range) => (
            <button
              key={range}
              onClick={() => setDateRange(range)}
              style={{
                padding: '8px 14px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '600',
                border: dateRange === range ? '2px solid #4f46e5' : '1px solid #e5e7eb',
                cursor: 'pointer',
                transition: 'all 0.2s',
                backgroundColor: dateRange === range ? '#eef2ff' : 'white',
                color: dateRange === range ? '#4f46e5' : '#6b7280'
              }}
            >
              {range}
            </button>
          ))}
        </div>

        {/* View Selector */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', justifyContent: 'center' }}>
          <button
            onClick={() => setSelectedView('timeline')}
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '600',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s',
              backgroundColor: selectedView === 'timeline' ? '#4f46e5' : '#f3f4f6',
              color: selectedView === 'timeline' ? 'white' : '#6b7280'
            }}
          >
            P&L Timeline
          </button>
          <button
            onClick={() => setSelectedView('breakdown')}
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '600',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s',
              backgroundColor: selectedView === 'breakdown' ? '#4f46e5' : '#f3f4f6',
              color: selectedView === 'breakdown' ? 'white' : '#6b7280'
            }}
          >
            Asset Breakdown
          </button>
        </div>

        {/* Chart Type Toggle - only for P&L Timeline tab */}
        {selectedView === 'timeline' && (
          <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', justifyContent: 'center' }}>
            {(['line', 'candle'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setChartType(type)}
                style={{
                  padding: '6px 16px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: '600',
                  border: chartType === type ? '2px solid #4f46e5' : '1px solid #e5e7eb',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  backgroundColor: chartType === type ? '#eef2ff' : 'white',
                  color: chartType === type ? '#4f46e5' : '#6b7280'
                }}
              >
                {type === 'line' ? 'Line' : 'Candle'}
              </button>
            ))}
          </div>
        )}

        {selectedView === 'timeline' ? (
          /* Two Charts Side by Side - matching individual asset layout */
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

          {/* Total P&L Chart */}
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '12px', textAlign: 'center' }}>
              Total P&L
            </h3>
            <ResponsiveContainer width="100%" height={350}>
              <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <defs>
                  <linearGradient id="colorGreenArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.6}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.2}/>
                  </linearGradient>
                  <linearGradient id="colorRedArea" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.6}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0.2}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  }}
                  stroke="#6b7280"
                  style={{ fontSize: '11px' }}
                />
                <YAxis
                  tickFormatter={(value) => formatCurrency(value)}
                  stroke="#4b5563"
                  style={{ fontSize: '11px' }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="3 3" />

                {chartType === 'line' ? (
                  <>
                    {/* Total P&L area fills */}
                    <Area
                      type="monotone"
                      dataKey="totalPnLPositive"
                      stroke="none"
                      fill="url(#colorGreenArea)"
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="totalPnLNegative"
                      stroke="none"
                      fill="url(#colorRedArea)"
                      isAnimationActive={false}
                    />
                    {/* Total P&L line */}
                    <Line
                      type="monotone"
                      dataKey="totalPnL"
                      stroke="#4b5563"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 4, fill: '#4b5563' }}
                      isAnimationActive={false}
                      name="Total P&L"
                    />
                  </>
                ) : (
                  <>
                    {/* Invisible line for tooltip + legend */}
                    <Line
                      type="monotone"
                      dataKey="totalPnL"
                      stroke="transparent"
                      strokeWidth={0}
                      dot={false}
                      activeDot={{ r: 3, fill: '#4b5563' }}
                      isAnimationActive={false}
                      name="Total P&L"
                    />
                    {/* Candlestick layer */}
                    <Customized component={CandlestickLayerBase} yAxisId={0} chartData={chartData} />
                  </>
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Realized/Unrealized P&L Chart */}
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '12px', textAlign: 'center' }}>
              Realized vs Unrealized P&L
            </h3>
            <ResponsiveContainer width="100%" height={350}>
              <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <defs>
                  <linearGradient id="colorGreenAreaRealized" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.6}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.2}/>
                  </linearGradient>
                  <linearGradient id="colorRedAreaRealized" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.6}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0.2}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  }}
                  stroke="#6b7280"
                  style={{ fontSize: '11px' }}
                />
                <YAxis
                  tickFormatter={(value) => formatCurrency(value)}
                  stroke="#8b5cf6"
                  style={{ fontSize: '11px' }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="3 3" />

                {/* Unrealized P&L area fills */}
                <Area
                  type="monotone"
                  dataKey="unrealizedPnLPos"
                  stroke="none"
                  fill="url(#colorGreenAreaRealized)"
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="unrealizedPnLNeg"
                  stroke="none"
                  fill="url(#colorRedAreaRealized)"
                  isAnimationActive={false}
                />

                {/* Realized P&L area fills */}
                <Area
                  type="monotone"
                  dataKey="realizedPnLPos"
                  stroke="none"
                  fill="url(#colorGreenAreaRealized)"
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="realizedPnLNeg"
                  stroke="none"
                  fill="url(#colorRedAreaRealized)"
                  isAnimationActive={false}
                />

                {/* Unrealized P&L - light purple solid */}
                <Line
                  type="monotone"
                  dataKey="unrealizedPnL"
                  stroke="#a78bfa"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                  name="Unrealized P&L"
                />

                {/* Realized P&L - purple dashed */}
                <Line
                  type="monotone"
                  dataKey="realizedPnL"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                  name="Realized P&L"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

        </div>
        ) : (
          /* Asset Breakdown View - Pie Charts */
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* Unrealized P&L Breakdown */}
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '12px', textAlign: 'center' }}>
                Unrealized P&L by Asset
              </h3>
              {renderPieChart('unrealized', latestRecord)}
            </div>

            {/* Realized P&L Breakdown */}
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '12px', textAlign: 'center' }}>
                Realized P&L by Asset
              </h3>
              {renderPieChart('realized', latestRecord)}
            </div>
          </div>
        )}

        {/* Summary Stats - shown for both views */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '24px',
          marginTop: '24px',
          paddingTop: '24px',
          borderTop: '1px solid #e5e7eb'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: '22px',
              fontWeight: '700',
              color: '#111827',
              marginBottom: '4px',
              fontFamily: 'Futura, "Trebuchet MS", Arial, sans-serif'
            }}>
              {formatCurrency(latestRecord.totalValue)}
            </div>
            <div style={{
              fontSize: '12px',
              color: '#6b7280',
              backgroundColor: '#f3f4f6',
              padding: '2px 8px',
              borderRadius: '12px',
              display: 'inline-block',
              border: '1px solid #e5e7eb'
            }}>
              Total Value
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: '22px',
              fontWeight: '700',
              color: '#111827',
              marginBottom: '4px',
              fontFamily: 'Futura, "Trebuchet MS", Arial, sans-serif'
            }}>
              {formatCurrency(latestRecord.totalInvested)}
            </div>
            <div style={{
              fontSize: '12px',
              color: '#6b7280',
              backgroundColor: '#f3f4f6',
              padding: '2px 8px',
              borderRadius: '12px',
              display: 'inline-block',
              border: '1px solid #e5e7eb'
            }}>
              Total Invested
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: '22px',
              fontWeight: '700',
              color: latestRecord.unrealizedPnL >= 0 ? '#166534' : '#dc2626',
              marginBottom: '4px',
              fontFamily: 'Futura, "Trebuchet MS", Arial, sans-serif'
            }}>
              {formatCurrency(latestRecord.unrealizedPnL)}
            </div>
            <div style={{
              fontSize: '12px',
              color: '#6b7280',
              backgroundColor: '#f3f4f6',
              padding: '2px 8px',
              borderRadius: '12px',
              display: 'inline-block',
              border: '1px solid #e5e7eb'
            }}>
              Unrealized P&L
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: '22px',
              fontWeight: '700',
              color: latestRecord.realizedPnL >= 0 ? '#166534' : '#dc2626',
              marginBottom: '4px',
              fontFamily: 'Futura, "Trebuchet MS", Arial, sans-serif'
            }}>
              {formatCurrency(latestRecord.realizedPnL)}
            </div>
            <div style={{
              fontSize: '12px',
              color: '#6b7280',
              backgroundColor: '#f3f4f6',
              padding: '2px 8px',
              borderRadius: '12px',
              display: 'inline-block',
              border: '1px solid #e5e7eb'
            }}>
              Realized P&L
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // Helper function to render pie charts for positive/negative contributions
  function renderPieChart(type: 'unrealized' | 'realized', latestRecord: DailyPortfolioRecord) {
    if (!latestRecord.holdings) {
      return <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>No holdings data available</div>;
    }

    // Get holdings data and separate into positive and negative P&L
    const holdings = latestRecord.holdings;
    const positiveData: Array<{ name: string; value: number }> = [];
    const negativeData: Array<{ name: string; value: number }> = [];
    let totalPnL = 0;

    Object.entries(holdings).forEach(([symbol, holdingData]: [string, any]) => {
      const value = type === 'unrealized'
        ? (holdingData.unrealizedPnL || 0)
        : (holdingData.realizedPnL || 0);

      totalPnL += value;

      if (value > 0.01) {
        positiveData.push({ name: symbol, value });
      } else if (value < -0.01) {
        negativeData.push({ name: symbol, value: Math.abs(value) });
      }
    });

    // Sort by value descending
    positiveData.sort((a, b) => b.value - a.value);
    negativeData.sort((a, b) => b.value - a.value);

    // Green color shades for positive contributors
    const GREEN_COLORS = [
      '#10b981', '#059669', '#047857', '#065f46', '#064e3b',
      '#34d399', '#6ee7b7', '#a7f3d0', '#16a34a', '#15803d'
    ];

    // Red color shades for negative contributors
    const RED_COLORS = [
      '#ef4444', '#dc2626', '#b91c1c', '#991b1b', '#7f1d1d',
      '#f87171', '#fca5a5', '#fecaca', '#e11d48', '#be123c'
    ];

    return (
      <>
        {/* Total P&L Display */}
        <div style={{
          textAlign: 'center',
          marginBottom: '20px',
          padding: '16px',
          backgroundColor: totalPnL >= 0 ? '#f0fdf4' : '#fef2f2',
          borderRadius: '8px'
        }}>
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', fontWeight: '600' }}>
            Total {type === 'unrealized' ? 'Unrealized' : 'Realized'} P&L
          </div>
          <div style={{
            fontSize: '28px',
            fontWeight: '700',
            color: totalPnL >= 0 ? '#166534' : '#dc2626',
            fontFamily: 'Futura, "Trebuchet MS", Arial, sans-serif'
          }}>
            {formatCurrency(totalPnL)}
          </div>
        </div>

        {/* Two Pie Charts Side by Side */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {/* Positive Contributors Pie Chart */}
          <div>
            <h4 style={{ fontSize: '13px', fontWeight: '600', color: '#166534', marginBottom: '12px', textAlign: 'center' }}>
              Positive (+{formatCurrency(positiveData.reduce((sum, d) => sum + d.value, 0))})
            </h4>
            {positiveData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={positiveData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry: any) => {
                        const total = positiveData.reduce((sum, d) => sum + d.value, 0);
                        const pct = ((entry.value || 0) / total) * 100;
                        return pct > 8 ? entry.name : '';
                      }}
                      outerRadius={80}
                      dataKey="value"
                    >
                      {positiveData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={GREEN_COLORS[index % GREEN_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
                {/* Legend */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr',
                  gap: '6px',
                  fontSize: '11px',
                  marginTop: '12px',
                  maxHeight: '120px',
                  overflowY: 'auto'
                }}>
                  {positiveData.slice(0, 8).map((entry, index) => (
                    <div key={entry.name} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{
                        width: '12px',
                        height: '12px',
                        backgroundColor: GREEN_COLORS[index % GREEN_COLORS.length],
                        borderRadius: '2px',
                        flexShrink: 0
                      }} />
                      <span style={{ color: '#374151', fontWeight: '500' }}>{entry.name}:</span>
                      <span style={{ color: '#166534', fontWeight: '600', marginLeft: 'auto' }}>
                        {formatCurrency(entry.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280', fontSize: '12px' }}>
                No positive contributors
              </div>
            )}
          </div>

          {/* Negative Contributors Pie Chart */}
          <div>
            <h4 style={{ fontSize: '13px', fontWeight: '600', color: '#dc2626', marginBottom: '12px', textAlign: 'center' }}>
              Negative ({formatCurrency(-negativeData.reduce((sum, d) => sum + d.value, 0))})
            </h4>
            {negativeData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={negativeData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry: any) => {
                        const total = negativeData.reduce((sum, d) => sum + d.value, 0);
                        const pct = ((entry.value || 0) / total) * 100;
                        return pct > 8 ? entry.name : '';
                      }}
                      outerRadius={80}
                      dataKey="value"
                    >
                      {negativeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={RED_COLORS[index % RED_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrency(-value)} />
                  </PieChart>
                </ResponsiveContainer>
                {/* Legend */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr',
                  gap: '6px',
                  fontSize: '11px',
                  marginTop: '12px',
                  maxHeight: '120px',
                  overflowY: 'auto'
                }}>
                  {negativeData.slice(0, 8).map((entry, index) => (
                    <div key={entry.name} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{
                        width: '12px',
                        height: '12px',
                        backgroundColor: RED_COLORS[index % RED_COLORS.length],
                        borderRadius: '2px',
                        flexShrink: 0
                      }} />
                      <span style={{ color: '#374151', fontWeight: '500' }}>{entry.name}:</span>
                      <span style={{ color: '#dc2626', fontWeight: '600', marginLeft: 'auto' }}>
                        {formatCurrency(-entry.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280', fontSize: '12px' }}>
                No negative contributors
              </div>
            )}
          </div>
        </div>

        {positiveData.length === 0 && negativeData.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
            No {type} P&L data available
          </div>
        )}
      </>
    );
  }
};

export default TotalPortfolioPnLChart;
