import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart,
  Line,
  Area,
  AreaChart,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';

interface Transaction {
  action: 'buy' | 'sell';
  quantity: number;
  price: number;
  total: number;
  time: string;
}

interface DailyRecord {
  date: string;
  shares: number;
  costBasis: number;
  rollingCostBasis?: number; // Dynamic cost basis for breakeven price (changes with transactions)
  marketValue: number;
  unrealizedPnL: number;
  realizedPnL: number;
  totalPnL: number;
  totalPnLPercent: number;
  closePrice: number;
  transactions?: Transaction[];
}

interface AssetInfo {
  symbol: string;
  type: 's' | 'c';
  currency: string;
  firstPurchaseDate: string;
}

interface PnLData {
  symbol: string;
  assetInfo: AssetInfo;
  dailyRecords: DailyRecord[];
  lastModified: string;
  totalRecords: number;
  filteredRecords: number;
}

interface DailyPnLChartProps {
  symbol: string;
  startDate?: string;
  endDate?: string;
}

type DateRange = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | 'ALL';

const DailyPnLChart: React.FC<DailyPnLChartProps> = ({ symbol, startDate, endDate }) => {
  const [pnlData, setPnlData] = useState<PnLData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<'totalPnL' | 'marketValueAndShares'>('totalPnL');
  const [dateRange, setDateRange] = useState<DateRange>('ALL');

  useEffect(() => {
    fetchPnLData();
  }, [symbol, startDate, endDate]);

  const fetchPnLData = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const response = await fetch(`/api/pnl/symbol/${symbol}?${params.toString()}`, {
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        const text = await response.text();
        console.error('Response error:', text);
        throw new Error(`Failed to fetch PnL data: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'PnL data not available');
      }

      setPnlData(data);
    } catch (err: any) {
      console.error('Error fetching PnL data:', err);
      setError(err.message || 'Failed to load PnL data');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const formatPercent = (value: number | null | undefined): string => {
    if (value === null || value === undefined) {
      return '0.00%';
    }
    return `${value.toFixed(2)}%`;
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Filter data based on selected date range
  const getFilteredData = (data: DailyRecord[]): DailyRecord[] => {
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
      const data = payload[0].payload as DailyRecord;
      const breakevenPrice = data.shares > 0 ? (data.costBasis - data.realizedPnL) / data.shares : 0;

      return (
        <div className="bg-white p-4 border border-gray-300 rounded-lg shadow-lg">
          <p className="font-semibold text-gray-800 mb-2">{formatDate(label)}</p>
          <div className="space-y-1 text-sm">
            <p className="text-gray-700">
              <span className="font-medium">Shares:</span> {data.shares.toFixed(4)}
            </p>
            <p className="text-gray-700">
              <span className="font-medium">Close Price:</span> {formatCurrency(data.closePrice)}
            </p>
            {breakevenPrice > 0 && (
              <p className="text-gray-700">
                <span className="font-medium">Breakeven Price:</span> {formatCurrency(breakevenPrice)}
              </p>
            )}
            <p className="text-gray-700">
              <span className="font-medium">Market Value:</span> {formatCurrency(data.marketValue)}
            </p>
            <p className="text-gray-700">
              <span className="font-medium">Cost Basis:</span> {formatCurrency(data.costBasis)}
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
            {data.transactions && data.transactions.length > 0 && (
              <div className="border-t border-gray-200 mt-2 pt-2">
                <p className="font-medium text-gray-800 text-xs mb-1">Transactions:</p>
                {data.transactions.map((txn, idx) => (
                  <p key={idx} className="text-xs text-gray-600">
                    {txn.action.toUpperCase()}: {txn.quantity.toFixed(4)} @ {formatCurrency(txn.price)}
                  </p>
                ))}
              </div>
            )}
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
          <p className="mt-4 text-gray-600">Loading PnL data for {symbol}...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 shadow">
        <div className="flex items-center">
          <svg className="h-6 w-6 text-red-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h3 className="text-red-800 font-semibold">Error Loading PnL Data</h3>
            <p className="text-red-600 text-sm mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!pnlData || !pnlData.dailyRecords || pnlData.dailyRecords.length === 0) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 shadow">
        <p className="text-yellow-800">No PnL data available for {symbol}.</p>
        <p className="text-yellow-600 text-sm mt-2">
          Make sure to calculate PnL first using the Calculate PnL button.
        </p>
      </div>
    );
  }

  const latestRecord = pnlData.dailyRecords[pnlData.dailyRecords.length - 1];

  // Apply date range filter
  const filteredRecords = getFilteredData(pnlData.dailyRecords);

  // Prepare chart data - add transaction markers and split positive/negative for area fills
  // Use null instead of 0 to avoid drawing flat lines at the x-axis
  const chartData = filteredRecords.map(record => ({
    ...record,
    hasTransaction: record.transactions && record.transactions.length > 0,
    totalPnLPositive: record.totalPnL > 0 ? record.totalPnL : null,
    totalPnLNegative: record.totalPnL < 0 ? record.totalPnL : null,
    totalPnLPercentPositive: record.totalPnLPercent > 0 ? record.totalPnLPercent : null,
    totalPnLPercentNegative: record.totalPnLPercent < 0 ? record.totalPnLPercent : null,
    // Add positive/negative splits for realized and unrealized P&L
    unrealizedPnLPositive: record.unrealizedPnL > 0 ? record.unrealizedPnL : null,
    unrealizedPnLNegative: record.unrealizedPnL < 0 ? record.unrealizedPnL : null,
    realizedPnLPositive: record.realizedPnL > 0 ? record.realizedPnL : null,
    realizedPnLNegative: record.realizedPnL < 0 ? record.realizedPnL : null,
    // Calculate breakeven price: what price needed to sell remaining shares to break even overall
    // Formula: (costBasis - realizedPnL) / shares
    // This accounts for profit/loss already realized from past sales
    breakevenPrice: record.shares > 0
      ? (record.costBasis - record.realizedPnL) / record.shares
      : 0,
    // Split unrealized/realized for positive/negative fills
    unrealizedPnLPos: record.unrealizedPnL > 0 ? record.unrealizedPnL : null,
    unrealizedPnLNeg: record.unrealizedPnL < 0 ? record.unrealizedPnL : null,
    realizedPnLPos: record.realizedPnL > 0 ? record.realizedPnL : null,
    realizedPnLNeg: record.realizedPnL < 0 ? record.realizedPnL : null,
    // For market value chart: create separate ranges for profit and loss areas
    // Profit area: when MV > CB, fill from CB to MV (array format)
    // Loss area: when MV < CB, fill from MV to CB (array format)
    profitAreaRange: record.marketValue > record.costBasis ? [record.costBasis, record.marketValue] : null,
    lossAreaRange: record.marketValue < record.costBasis ? [record.marketValue, record.costBasis] : null
  }));

  // Calculate Y-axis domain for price chart (cap at 1.5x max price)
  const maxPrice = Math.max(...chartData.map(d => d.closePrice));
  const priceCap = maxPrice * 1.5;

  // Clip breakeven prices to the cap to prevent axis from stretching
  const clippedChartData = chartData.map(d => ({
    ...d,
    breakevenPrice: Math.min(d.breakevenPrice, priceCap)
  }));

  // Always cap the axis at 1.5x max price
  const priceAxisDomain: [number, number] = [0, priceCap];

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img
            src={`/api/icons/symbol/${symbol}/image?type=${pnlData.assetInfo.type}`}
            alt={symbol}
            style={{ width: '40px', height: '40px', borderRadius: '8px' }}
            onError={(e) => {
              (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${symbol}&size=40&background=667eea&color=fff&bold=true`;
            }}
          />
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#111827', marginBottom: '4px' }}>
              {symbol} - Daily P&L Chart
            </h2>
            <p style={{ fontSize: '13px', color: '#6b7280' }}>
              From {formatDate(pnlData.assetInfo.firstPurchaseDate)} • {pnlData.totalRecords} days tracked
            </p>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Current Position</p>
          <p style={{ fontSize: '16px', fontWeight: '600', color: '#111827' }}>
            {latestRecord.shares.toFixed(4)} shares
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

        {/* Metric Selector */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', justifyContent: 'center' }}>
          <button
            onClick={() => setSelectedMetric('totalPnL')}
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '600',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s',
              backgroundColor: selectedMetric === 'totalPnL' ? '#4f46e5' : '#f3f4f6',
              color: selectedMetric === 'totalPnL' ? 'white' : '#6b7280'
            }}
          >
            P&L Analysis
          </button>
          <button
            onClick={() => setSelectedMetric('marketValueAndShares')}
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '600',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s',
              backgroundColor: selectedMetric === 'marketValueAndShares' ? '#4f46e5' : '#f3f4f6',
              color: selectedMetric === 'marketValueAndShares' ? 'white' : '#6b7280'
            }}
          >
            Market Value & Shares
          </button>
        </div>

        {/* Charts */}
        {selectedMetric === 'totalPnL' ? (
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
                    yAxisId="left"
                    tickFormatter={(value) => formatCurrency(value)}
                    stroke="#4b5563"
                    style={{ fontSize: '11px' }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <ReferenceLine yAxisId="left" y={0} stroke="#9ca3af" strokeDasharray="3 3" />

                  {/* Total P&L area fills */}
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="totalPnLPositive"
                    stroke="none"
                    fill="url(#colorGreenArea)"
                    isAnimationActive={false}
                  />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="totalPnLNegative"
                    stroke="none"
                    fill="url(#colorRedArea)"
                    isAnimationActive={false}
                  />

                  {/* Total P&L line - solid dark grey */}
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="totalPnL"
                    stroke="#4b5563"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={false}
                    isAnimationActive={false}
                    name="Total P&L"
                  />

                  {/* Transaction dots */}
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="totalPnL"
                    stroke="transparent"
                    strokeWidth={0}
                    dot={(props: any) => {
                      const { cx, cy, payload } = props;
                      if (payload.hasTransaction && payload.transactions) {
                        const hasBuy = payload.transactions.some((t: Transaction) => t.action === 'buy');
                        const hasSell = payload.transactions.some((t: Transaction) => t.action === 'sell');

                        if (hasBuy && hasSell) {
                          return (
                            <g>
                              <circle cx={cx} cy={cy} r={4} fill="#10b981" stroke="#fff" strokeWidth={2} />
                              <circle cx={cx} cy={cy + 5} r={2} fill="#ef4444" stroke="#fff" strokeWidth={1} />
                            </g>
                          );
                        }
                        if (hasBuy) {
                          return <circle cx={cx} cy={cy} r={4} fill="#10b981" stroke="#fff" strokeWidth={2} />;
                        }
                        if (hasSell) {
                          return <circle cx={cx} cy={cy} r={4} fill="#ef4444" stroke="#fff" strokeWidth={2} />;
                        }
                      }
                      return <></>;
                    }}
                    activeDot={{ r: 5 }}
                    name="Transactions"
                  />
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
                    yAxisId="left"
                    tickFormatter={(value) => formatCurrency(value)}
                    stroke="#8b5cf6"
                    style={{ fontSize: '11px' }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <ReferenceLine yAxisId="left" y={0} stroke="#9ca3af" strokeDasharray="3 3" />

                  {/* Unrealized P&L area fills */}
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="unrealizedPnLPos"
                    stroke="none"
                    fill="url(#colorGreenAreaRealized)"
                    isAnimationActive={false}
                  />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="unrealizedPnLNeg"
                    stroke="none"
                    fill="url(#colorRedAreaRealized)"
                    isAnimationActive={false}
                  />

                  {/* Realized P&L area fills */}
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="realizedPnLPos"
                    stroke="none"
                    fill="url(#colorGreenAreaRealized)"
                    isAnimationActive={false}
                  />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="realizedPnLNeg"
                    stroke="none"
                    fill="url(#colorRedAreaRealized)"
                    isAnimationActive={false}
                  />

                  {/* Unrealized P&L - light purple solid */}
                  <Line
                    yAxisId="left"
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
                    yAxisId="left"
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* Market Value Chart */}
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '12px', textAlign: 'center' }}>
                Market Value
              </h3>
              <ResponsiveContainer width="100%" height={350}>
                <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <defs>
                    {/* Green gradient for profit (market value > cost basis) */}
                    <linearGradient id="profitAreaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.6}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.2}/>
                    </linearGradient>
                    {/* Red gradient for loss (market value < cost basis) */}
                    <linearGradient id="lossAreaGradient" x1="0" y1="0" x2="0" y2="1">
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
                    yAxisId="left"
                    tickFormatter={(value) => formatCurrency(value)}
                    stroke="#3b82f6"
                    style={{ fontSize: '11px' }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />

                  {/* Green area when profitable (fills from CB to MV) */}
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="profitAreaRange"
                    fill="url(#profitAreaGradient)"
                    stroke="none"
                    isAnimationActive={false}
                    connectNulls={false}
                  />

                  {/* Red area when loss (fills from MV to CB) */}
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="lossAreaRange"
                    fill="url(#lossAreaGradient)"
                    stroke="none"
                    isAnimationActive={false}
                    connectNulls={false}
                  />

                  {/* Market Value line */}
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="marketValue"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5 }}
                    isAnimationActive={false}
                    name="Market Value"
                  />

                  {/* Cost Basis line */}
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="costBasis"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                    activeDot={{ r: 5 }}
                    isAnimationActive={false}
                    name="Cost Basis"
                  />

                  {/* Transaction dots */}
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="marketValue"
                    stroke="transparent"
                    strokeWidth={0}
                    dot={(props: any) => {
                      const { cx, cy, payload } = props;
                      if (payload.hasTransaction && payload.transactions) {
                        const hasBuy = payload.transactions.some((t: Transaction) => t.action === 'buy');
                        const hasSell = payload.transactions.some((t: Transaction) => t.action === 'sell');

                        if (hasBuy && hasSell) {
                          return (
                            <g>
                              <circle cx={cx} cy={cy} r={4} fill="#10b981" stroke="#fff" strokeWidth={2} />
                              <circle cx={cx} cy={cy + 5} r={2} fill="#ef4444" stroke="#fff" strokeWidth={1} />
                            </g>
                          );
                        }
                        if (hasBuy) {
                          return <circle cx={cx} cy={cy} r={4} fill="#10b981" stroke="#fff" strokeWidth={2} />;
                        }
                        if (hasSell) {
                          return <circle cx={cx} cy={cy} r={4} fill="#ef4444" stroke="#fff" strokeWidth={2} />;
                        }
                      }
                      return <></>;
                    }}
                    activeDot={false}
                    name="Transactions"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Shares Chart */}
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '12px', textAlign: 'center' }}>
                Shares & Price
              </h3>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={clippedChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
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
                    yAxisId="left"
                    tickFormatter={(value) => value.toFixed(4)}
                    stroke="#84cc16"
                    style={{ fontSize: '11px' }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickFormatter={(value) => formatCurrency(value)}
                    stroke="#9ca3af"
                    style={{ fontSize: '11px' }}
                    domain={priceAxisDomain}
                    label={{
                      value: 'Price',
                      angle: 90,
                      position: 'insideRight',
                      style: { fill: '#9ca3af', fontSize: '11px' }
                    }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />

                  {/* Shares line */}
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="shares"
                    stroke="#84cc16"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5 }}
                    isAnimationActive={false}
                    name="Shares"
                  />

                  {/* Current Price line */}
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="closePrice"
                    stroke="#9ca3af"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5 }}
                    isAnimationActive={false}
                    name="Price"
                  />

                  {/* Breakeven Price line */}
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="breakevenPrice"
                    stroke="#6b7280"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                    activeDot={{ r: 5 }}
                    isAnimationActive={false}
                    name="Breakeven Price"
                  />

                  {/* Transaction dots */}
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="shares"
                    stroke="transparent"
                    strokeWidth={0}
                    dot={(props: any) => {
                      const { cx, cy, payload } = props;
                      if (payload.hasTransaction && payload.transactions) {
                        const hasBuy = payload.transactions.some((t: Transaction) => t.action === 'buy');
                        const hasSell = payload.transactions.some((t: Transaction) => t.action === 'sell');

                        if (hasBuy && hasSell) {
                          return (
                            <g>
                              <circle cx={cx} cy={cy} r={4} fill="#10b981" stroke="#fff" strokeWidth={2} />
                              <circle cx={cx} cy={cy + 5} r={2} fill="#ef4444" stroke="#fff" strokeWidth={1} />
                            </g>
                          );
                        }
                        if (hasBuy) {
                          return <circle cx={cx} cy={cy} r={4} fill="#10b981" stroke="#fff" strokeWidth={2} />;
                        }
                        if (hasSell) {
                          return <circle cx={cx} cy={cy} r={4} fill="#ef4444" stroke="#fff" strokeWidth={2} />;
                        }
                      }
                      return <></>;
                    }}
                    activeDot={false}
                    name="Transactions"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Summary Stats */}
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
              {formatCurrency(latestRecord.marketValue)}
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
              Market Value
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
              {formatCurrency(latestRecord.costBasis)}
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
              Cost Basis
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
};

export default DailyPnLChart;
