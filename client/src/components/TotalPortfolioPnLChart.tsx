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

interface BenchmarkPoint { date: string; returnPct: number; }

const TotalPortfolioPnLChart: React.FC<TotalPortfolioPnLChartProps> = ({ portfolioId }) => {
  const [portfolioData, setPortfolioData] = useState<TotalPortfolioPnLData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedView, setSelectedView] = useState<'timeline' | 'breakdown' | 'benchmark'>('timeline');
  const [dateRange, setDateRange] = useState<DateRange>('ALL');
  const [chartType, setChartType] = useState<'line' | 'candle'>('line');
  const [benchmarkData, setBenchmarkData] = useState<{ spy: BenchmarkPoint[]; xiu: BenchmarkPoint[] } | null>(null);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);

  useEffect(() => {
    fetchPortfolioPnLData();
  }, [portfolioId]);

  useEffect(() => {
    if (selectedView === 'benchmark' && !benchmarkData && portfolioData) {
      fetchBenchmarkData();
    }
  // eslint-disable-next-line
  }, [selectedView, portfolioData]);

  const fetchBenchmarkData = async () => {
    if (!portfolioData || benchmarkData) return;
    setBenchmarkLoading(true);
    try {
      const [spyRes, xiuRes] = await Promise.all([
        fetch('/api/historical/stock/SPY?period=max'),
        fetch('/api/historical/stock/XIU.TO?period=max'),
      ]);
      const [spyRaw, xiuRaw] = await Promise.all([spyRes.json(), xiuRes.json()]);

      const startDate = portfolioData.startDate;

      const normalize = (prices: { date: string; close: number }[]): BenchmarkPoint[] => {
        const filtered = (prices || [])
          .filter(p => p.date >= startDate && p.close > 0)
          .sort((a, b) => a.date.localeCompare(b.date));
        if (filtered.length === 0) return [];
        const basePrice = filtered[0].close;
        return filtered.map(p => ({
          date: p.date,
          returnPct: ((p.close - basePrice) / basePrice) * 100,
        }));
      };

      setBenchmarkData({
        spy: normalize(spyRaw.data || []),
        xiu: normalize(xiuRaw.data || []),
      });
    } catch (e) {
      console.error('Benchmark data fetch failed:', e);
    } finally {
      setBenchmarkLoading(false);
    }
  };

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
        <div style={{ backgroundColor: '#10141c', padding: '14px', border: '1px solid #1e2535', borderRadius: '8px' }}>
          <p style={{ fontWeight: 700, color: '#cbd5e1', marginBottom: '8px', fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px' }}>{formatDate(label)}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <p style={{ color: '#94a3b8', fontSize: '12px', fontFamily: "'IBM Plex Mono', monospace" }}>
              <span className="font-medium">Total Value:</span> {formatCurrency(data.totalValue)}
            </p>
            <p style={{ color: '#94a3b8', fontSize: '12px', fontFamily: "'IBM Plex Mono', monospace" }}>
              <span className="font-medium">Total Invested:</span> {formatCurrency(data.totalInvested)}
            </p>
            <p style={{ color: '#94a3b8', fontSize: '12px', fontFamily: "'IBM Plex Mono', monospace" }}>
              <span className="font-medium">Assets:</span> {data.holdings ? Object.keys(data.holdings).length : 0}
            </p>
            <div style={{ borderTop: '1px solid #1e2535', marginTop: '8px', paddingTop: '8px' }}>
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '256px', backgroundColor: '#10141c', borderRadius: '8px', border: '1px solid #1e2535' }}>
        <div className="text-center">
          <div className="loading-spinner" style={{ margin: '0 auto' }}></div>
          <p style={{ marginTop: '16px', color: '#64748b', fontFamily: "'IBM Plex Mono', monospace", fontSize: '13px' }}>Loading portfolio P&L data...</p>
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
      backgroundColor: '#10141c',
      borderRadius: '8px',
      border: '1px solid #1e2535',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        background: '#10141c',
        padding: '20px 24px',
        borderBottom: '1px solid #1e2535',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div>
          <h2 style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', marginBottom: '4px', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Total Portfolio P&L
          </h2>
          <p style={{ fontSize: '13px', color: '#64748b' }}>
            From {formatDate(portfolioData.startDate)} • {portfolioData.totalRecords} days tracked
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Current Portfolio</p>
          <p style={{ fontSize: '16px', fontWeight: '600', color: '#e2e8f0' }}>
            {formatCurrency(latestRecord.totalValue)}
          </p>
          <p style={{
            fontSize: '20px',
            fontWeight: '700',
            color: latestRecord.totalPnL >= 0 ? '#34d399' : '#f87171',
            marginTop: '4px'
          }}>
            {formatCurrency(latestRecord.totalPnL)}
          </p>
          <p style={{
            fontSize: '13px',
            fontWeight: '600',
            color: latestRecord.totalPnLPercent >= 0 ? '#34d399' : '#f87171'
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
                border: dateRange === range ? '2px solid rgba(79,70,229,0.5)' : '1px solid #1e2535',
                cursor: 'pointer',
                transition: 'all 0.2s',
                backgroundColor: dateRange === range ? 'rgba(79,70,229,0.15)' : 'rgba(30,37,53,0.6)',
                color: dateRange === range ? '#818cf8' : '#64748b'
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
              backgroundColor: selectedView === 'timeline' ? '#4f46e5' : 'rgba(30,37,53,0.6)',
              color: selectedView === 'timeline' ? 'white' : '#64748b'
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
              backgroundColor: selectedView === 'breakdown' ? '#4f46e5' : 'rgba(30,37,53,0.6)',
              color: selectedView === 'breakdown' ? 'white' : '#64748b'
            }}
          >
            Asset Breakdown
          </button>
          <button
            onClick={() => setSelectedView('benchmark')}
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '600',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s',
              backgroundColor: selectedView === 'benchmark' ? '#059669' : 'rgba(30,37,53,0.6)',
              color: selectedView === 'benchmark' ? 'white' : '#64748b'
            }}
          >
            vs Benchmark
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
                  border: chartType === type ? '2px solid rgba(79,70,229,0.5)' : '1px solid #1e2535',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  backgroundColor: chartType === type ? 'rgba(79,70,229,0.15)' : 'rgba(30,37,53,0.6)',
                  color: chartType === type ? '#818cf8' : '#64748b'
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
            <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#94a3b8', marginBottom: '12px', textAlign: 'center' }}>
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
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  }}
                  stroke="#4a5568"
                  tick={{ fill: '#64748b' }}
                  style={{ fontSize: '11px' }}
                />
                <YAxis
                  tickFormatter={(value) => formatCurrency(value)}
                  stroke="#4a5568"
                  tick={{ fill: '#64748b' }}
                  style={{ fontSize: '11px' }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ color: '#64748b' }} />
                <ReferenceLine y={0} stroke="#4a5568" strokeDasharray="3 3" />

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
                      stroke="#94a3b8"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 4, fill: '#94a3b8' }}
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
                      activeDot={{ r: 3, fill: '#94a3b8' }}
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
            <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#94a3b8', marginBottom: '12px', textAlign: 'center' }}>
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
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  }}
                  stroke="#4a5568"
                  tick={{ fill: '#64748b' }}
                  style={{ fontSize: '11px' }}
                />
                <YAxis
                  tickFormatter={(value) => formatCurrency(value)}
                  stroke="#4a5568"
                  tick={{ fill: '#64748b' }}
                  style={{ fontSize: '11px' }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ color: '#64748b' }} />
                <ReferenceLine y={0} stroke="#4a5568" strokeDasharray="3 3" />

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
        ) : selectedView === 'benchmark' ? (
          /* Benchmark Comparison View */
          benchmarkLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '350px' }}>
              <div style={{ textAlign: 'center', color: '#64748b' }}>
                <div className="loading-spinner" style={{ margin: '0 auto 12px' }}></div>
                Loading SPY and XIU.TO benchmark data...
              </div>
            </div>
          ) : (
            (() => {
              // Build merged dataset: portfolio % return + SPY + XIU aligned by date
              const portfolioReturns = getFilteredData(portfolioData.dailyRecords).map(r => ({
                date: r.date,
                portfolioReturn: r.totalPnLPercent,
              }));

              const spyMap = new Map((benchmarkData?.spy || []).map(p => [p.date, p.returnPct]));
              const xiuMap = new Map((benchmarkData?.xiu || []).map(p => [p.date, p.returnPct]));

              const mergedData = portfolioReturns.map(r => ({
                date: r.date,
                portfolioReturn: r.portfolioReturn,
                spyReturn: spyMap.get(r.date) ?? null,
                xiuReturn: xiuMap.get(r.date) ?? null,
              }));

              const latest = mergedData[mergedData.length - 1] || {};
              const portfolioFinal = latest.portfolioReturn ?? 0;
              const spyFinal = latest.spyReturn ?? null;
              const xiuFinal = latest.xiuReturn ?? null;

              return (
                <div>
                  {/* Summary badges */}
                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
                    {[
                      { label: 'Your Portfolio', value: portfolioFinal, color: '#4f46e5' },
                      { label: 'SPY (S&P 500)', value: spyFinal, color: '#f59e0b' },
                      { label: 'XIU.TO (TSX 60)', value: xiuFinal, color: '#06b6d4' },
                    ].map(({ label, value, color }) => (
                      <div key={label} style={{
                        padding: '8px 16px',
                        borderRadius: '8px',
                        border: `2px solid ${color}20`,
                        backgroundColor: `${color}10`,
                        textAlign: 'center',
                        minWidth: '140px'
                      }}>
                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>{label}</div>
                        <div style={{
                          fontSize: '20px',
                          fontWeight: '700',
                          color: value === null ? '#4a5568' : value >= 0 ? '#34d399' : '#f87171',
                          marginTop: '2px'
                        }}>
                          {value === null ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`}
                        </div>
                      </div>
                    ))}
                  </div>
                  <ResponsiveContainer width="100%" height={380}>
                    <ComposedChart data={mergedData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(v) => {
                          const d = new Date(v);
                          return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
                        }}
                        stroke="#4a5568"
                        tick={{ fill: '#64748b' }}
                        style={{ fontSize: '11px' }}
                      />
                      <YAxis
                        tickFormatter={(v) => `${v.toFixed(0)}%`}
                        stroke="#4a5568"
                        tick={{ fill: '#64748b' }}
                        style={{ fontSize: '11px' }}
                      />
                      <Tooltip
                        formatter={(value: any, name: string) => [
                          value !== null ? `${(value as number).toFixed(2)}%` : '—',
                          name
                        ]}
                        labelFormatter={(label) => formatDate(label)}
                        contentStyle={{ backgroundColor: '#10141c', border: '1px solid #1e2535', borderRadius: '6px', color: '#cbd5e1' }}
                        labelStyle={{ color: '#94a3b8' }}
                      />
                      <Legend wrapperStyle={{ color: '#64748b' }} />
                      <ReferenceLine y={0} stroke="#4a5568" strokeDasharray="3 3" />
                      <Line
                        type="monotone"
                        dataKey="portfolioReturn"
                        stroke="#4f46e5"
                        strokeWidth={2.5}
                        dot={false}
                        name="Your Portfolio"
                        isAnimationActive={false}
                      />
                      {(benchmarkData?.spy || []).length > 0 && (
                        <Line
                          type="monotone"
                          dataKey="spyReturn"
                          stroke="#f59e0b"
                          strokeWidth={2}
                          strokeDasharray="6 3"
                          dot={false}
                          name="SPY (S&P 500)"
                          isAnimationActive={false}
                        />
                      )}
                      {(benchmarkData?.xiu || []).length > 0 && (
                        <Line
                          type="monotone"
                          dataKey="xiuReturn"
                          stroke="#06b6d4"
                          strokeWidth={2}
                          strokeDasharray="4 2"
                          dot={false}
                          name="XIU.TO (TSX 60)"
                          isAnimationActive={false}
                        />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                  <p style={{ textAlign: 'center', fontSize: '11px', color: '#4a5568', marginTop: '8px' }}>
                    All returns normalized to 0% at your portfolio start date ({portfolioData.startDate})
                  </p>
                </div>
              );
            })()
          )
        ) : (
          /* Asset Breakdown View - Pie Charts */
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* Unrealized P&L Breakdown */}
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#94a3b8', marginBottom: '12px', textAlign: 'center' }}>
                Unrealized P&L by Asset
              </h3>
              {renderPieChart('unrealized', latestRecord)}
            </div>

            {/* Realized P&L Breakdown */}
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#94a3b8', marginBottom: '12px', textAlign: 'center' }}>
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
          borderTop: '1px solid #1e2535'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: '22px',
              fontWeight: '700',
              color: '#e2e8f0',
              marginBottom: '4px',
              fontFamily: 'Futura, "Trebuchet MS", Arial, sans-serif'
            }}>
              {formatCurrency(latestRecord.totalValue)}
            </div>
            <div style={{
              fontSize: '12px',
              color: '#64748b',
              backgroundColor: 'rgba(30,37,53,0.6)',
              padding: '2px 8px',
              borderRadius: '12px',
              display: 'inline-block',
              border: '1px solid #1e2535'
            }}>
              Total Value
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: '22px',
              fontWeight: '700',
              color: '#e2e8f0',
              marginBottom: '4px',
              fontFamily: 'Futura, "Trebuchet MS", Arial, sans-serif'
            }}>
              {formatCurrency(latestRecord.totalInvested)}
            </div>
            <div style={{
              fontSize: '12px',
              color: '#64748b',
              backgroundColor: 'rgba(30,37,53,0.6)',
              padding: '2px 8px',
              borderRadius: '12px',
              display: 'inline-block',
              border: '1px solid #1e2535'
            }}>
              Total Invested
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: '22px',
              fontWeight: '700',
              color: latestRecord.unrealizedPnL >= 0 ? '#34d399' : '#f87171',
              marginBottom: '4px',
              fontFamily: 'Futura, "Trebuchet MS", Arial, sans-serif'
            }}>
              {formatCurrency(latestRecord.unrealizedPnL)}
            </div>
            <div style={{
              fontSize: '12px',
              color: '#64748b',
              backgroundColor: 'rgba(30,37,53,0.6)',
              padding: '2px 8px',
              borderRadius: '12px',
              display: 'inline-block',
              border: '1px solid #1e2535'
            }}>
              Unrealized P&L
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: '22px',
              fontWeight: '700',
              color: latestRecord.realizedPnL >= 0 ? '#34d399' : '#f87171',
              marginBottom: '4px',
              fontFamily: 'Futura, "Trebuchet MS", Arial, sans-serif'
            }}>
              {formatCurrency(latestRecord.realizedPnL)}
            </div>
            <div style={{
              fontSize: '12px',
              color: '#64748b',
              backgroundColor: 'rgba(30,37,53,0.6)',
              padding: '2px 8px',
              borderRadius: '12px',
              display: 'inline-block',
              border: '1px solid #1e2535'
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
      return <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>No holdings data available</div>;
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
          backgroundColor: 'rgba(16,22,28,0.95)',
          borderRadius: '8px'
        }}>
          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', fontWeight: '600' }}>
            Total {type === 'unrealized' ? 'Unrealized' : 'Realized'} P&L
          </div>
          <div style={{
            fontSize: '28px',
            fontWeight: '700',
            color: totalPnL >= 0 ? '#34d399' : '#f87171',
            fontFamily: 'Futura, "Trebuchet MS", Arial, sans-serif'
          }}>
            {formatCurrency(totalPnL)}
          </div>
        </div>

        {/* Two Pie Charts Side by Side */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {/* Positive Contributors Pie Chart */}
          <div>
            <h4 style={{ fontSize: '13px', fontWeight: '600', color: '#34d399', marginBottom: '12px', textAlign: 'center' }}>
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
                      <span style={{ color: '#94a3b8', fontWeight: '500' }}>{entry.name}:</span>
                      <span style={{ color: '#34d399', fontWeight: '600', marginLeft: 'auto' }}>
                        {formatCurrency(entry.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b', fontSize: '12px' }}>
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
                      <span style={{ color: '#94a3b8', fontWeight: '500' }}>{entry.name}:</span>
                      <span style={{ color: '#f87171', fontWeight: '600', marginLeft: 'auto' }}>
                        {formatCurrency(-entry.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b', fontSize: '12px' }}>
                No negative contributors
              </div>
            )}
          </div>
        </div>

        {positiveData.length === 0 && negativeData.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            No {type} P&L data available
          </div>
        )}
      </>
    );
  }
};

export default TotalPortfolioPnLChart;
