import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
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

const DailyPnLChart: React.FC<DailyPnLChartProps> = ({ symbol, startDate, endDate }) => {
  const [pnlData, setPnlData] = useState<PnLData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<'totalPnL' | 'totalPnLPercent' | 'marketValue'>('totalPnL');

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

  const formatPercent = (value: number): string => {
    return `${value.toFixed(2)}%`;
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload as DailyRecord;

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

  // Prepare chart data - add transaction markers
  const chartData = pnlData.dailyRecords.map(record => ({
    ...record,
    hasTransaction: record.transactions && record.transactions.length > 0
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img
            src={`/api/icons/symbol/${symbol}`}
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
            onClick={() => setSelectedMetric('marketValue')}
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '600',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s',
              backgroundColor: selectedMetric === 'marketValue' ? '#4f46e5' : '#f3f4f6',
              color: selectedMetric === 'marketValue' ? 'white' : '#6b7280'
            }}
          >
            Market Value
          </button>
        </div>

        {/* Chart */}
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
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
                selectedMetric === 'totalPnLPercent' ? `${value}%` : formatCurrency(value)
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

            <Line
              type="monotone"
              dataKey={selectedMetric}
              stroke="#4f46e5"
              strokeWidth={2}
              dot={(props: any) => {
                const { cx, cy, payload } = props;
                if (payload.hasTransaction && payload.transactions) {
                  // Check if there are any buy transactions on this day
                  const hasBuy = payload.transactions.some((t: Transaction) => t.action === 'buy');
                  const hasSell = payload.transactions.some((t: Transaction) => t.action === 'sell');

                  // If both buy and sell, show a split color dot (green on top, red on bottom)
                  if (hasBuy && hasSell) {
                    return (
                      <g>
                        <circle cx={cx} cy={cy} r={5} fill="#10b981" stroke="#fff" strokeWidth={2} />
                        <circle cx={cx} cy={cy + 6} r={3} fill="#ef4444" stroke="#fff" strokeWidth={1} />
                      </g>
                    );
                  }
                  // Buy = green dot
                  if (hasBuy) {
                    return (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={5}
                        fill="#10b981"
                        stroke="#fff"
                        strokeWidth={2}
                      />
                    );
                  }
                  // Sell = red dot
                  if (hasSell) {
                    return (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={5}
                        fill="#ef4444"
                        stroke="#fff"
                        strokeWidth={2}
                      />
                    );
                  }
                }
                return <></>;
              }}
              activeDot={{ r: 6, fill: '#4f46e5' }}
              name={
                selectedMetric === 'totalPnL'
                  ? 'Total P&L'
                  : selectedMetric === 'totalPnLPercent'
                  ? 'Total P&L %'
                  : 'Market Value'
              }
            />
          </LineChart>
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
