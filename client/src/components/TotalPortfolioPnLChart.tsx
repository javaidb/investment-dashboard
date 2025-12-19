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
  ComposedChart
} from 'recharts';

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

const TotalPortfolioPnLChart: React.FC<TotalPortfolioPnLChartProps> = ({ portfolioId }) => {
  const [portfolioData, setPortfolioData] = useState<TotalPortfolioPnLData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<'totalPnL' | 'totalPnLPercent' | 'totalValue'>('totalPnL');

  useEffect(() => {
    fetchPortfolioPnLData();
  }, [portfolioId]);

  const fetchPortfolioPnLData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch from portfolio value cache
      const response = await fetch(`/api/portfolio-value/combined?period=max`, {
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        const text = await response.text();
        console.error('Response error:', text);
        throw new Error(`Failed to fetch portfolio value data: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Portfolio value data not available');
      }

      // Transform data to match expected format
      const transformedData: TotalPortfolioPnLData = {
        portfolioId: result.data.portfolioId,
        dailyRecords: result.data.data,
        totalRecords: result.data.totalDataPoints,
        startDate: result.data.data[0]?.date || '',
        endDate: result.data.data[result.data.data.length - 1]?.date || ''
      };

      setPortfolioData(transformedData);
    } catch (err: any) {
      console.error('Error fetching portfolio value data:', err);
      setError(err.message || 'Failed to load portfolio value data');
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

  const latestRecord = portfolioData.dailyRecords[portfolioData.dailyRecords.length - 1];

  // Prepare chart data - split positive/negative for area fills
  const chartData = portfolioData.dailyRecords.map(record => ({
    ...record,
    totalPnLPositive: record.totalPnL > 0 ? record.totalPnL : null,
    totalPnLNegative: record.totalPnL < 0 ? record.totalPnL : null,
    totalPnLPercentPositive: record.totalPnLPercent > 0 ? record.totalPnLPercent : null,
    totalPnLPercentNegative: record.totalPnLPercent < 0 ? record.totalPnLPercent : null
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
        {/* Metric Selector */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
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
            Total P&L ($)
          </button>
          <button
            onClick={() => setSelectedMetric('totalPnLPercent')}
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '600',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s',
              backgroundColor: selectedMetric === 'totalPnLPercent' ? '#4f46e5' : '#f3f4f6',
              color: selectedMetric === 'totalPnLPercent' ? 'white' : '#6b7280'
            }}
          >
            Total P&L (%)
          </button>
          <button
            onClick={() => setSelectedMetric('totalValue')}
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '600',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s',
              backgroundColor: selectedMetric === 'totalValue' ? '#4f46e5' : '#f3f4f6',
              color: selectedMetric === 'totalValue' ? 'white' : '#6b7280'
            }}
          >
            Total Value
          </button>
        </div>

        {/* Chart */}
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <defs>
              {/* Green gradient for positive values */}
              <linearGradient id="portfolioColorPositive" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.3}/>
                <stop offset="100%" stopColor="#10b981" stopOpacity={0.05}/>
              </linearGradient>
              {/* Red gradient for negative values */}
              <linearGradient id="portfolioColorNegative" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.05}/>
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0.3}/>
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
              style={{ fontSize: '12px' }}
            />
            <YAxis
              tickFormatter={(value) =>
                selectedMetric === 'totalPnLPercent'
                  ? `${value}%`
                  : formatCurrency(value)
              }
              stroke="#6b7280"
              style={{ fontSize: '12px' }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />

            {/* Zero line for P&L metrics */}
            {(selectedMetric === 'totalPnL' || selectedMetric === 'totalPnLPercent') && (
              <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="3 3" />
            )}

            {/* Render areas and lines for positive and negative P&L separately */}
            {selectedMetric === 'totalPnL' && (
              <>
                <Area
                  type="monotone"
                  dataKey="totalPnLPositive"
                  stroke="#10b981"
                  fill="url(#portfolioColorPositive)"
                  strokeWidth={2}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="totalPnLNegative"
                  stroke="#ef4444"
                  fill="url(#portfolioColorNegative)"
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              </>
            )}
            {selectedMetric === 'totalPnLPercent' && (
              <>
                <Area
                  type="monotone"
                  dataKey="totalPnLPercentPositive"
                  stroke="#10b981"
                  fill="url(#portfolioColorPositive)"
                  strokeWidth={2}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="totalPnLPercentNegative"
                  stroke="#ef4444"
                  fill="url(#portfolioColorNegative)"
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              </>
            )}

            {/* Line for total value metric */}
            {selectedMetric === 'totalValue' && (
              <Line
                type="monotone"
                dataKey="totalValue"
                stroke="#4f46e5"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 6, fill: '#4f46e5' }}
                name="Total Value"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>

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
};

export default TotalPortfolioPnLChart;
