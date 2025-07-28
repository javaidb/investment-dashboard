import React, { useState, useEffect } from 'react';
import { useQuery } from 'react-query';
import axios from 'axios';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  ReferenceLine
} from 'recharts';

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

interface StockData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Trade {
  symbol: string;
  date: string;
  action: 'buy' | 'sell';
  quantity: number;
  price: number;
}

interface HoldingsChartProps {
  holdings: Holding[];
  trades: Trade[];
}

const HoldingsChart: React.FC<HoldingsChartProps> = ({ holdings, trades }) => {
  const [selectedHolding, setSelectedHolding] = useState<Holding | null>(null);

  // Fetch maximum historical data for selected holding
  const { data: historicalData, isLoading, error } = useQuery(
    ['holdingHistorical', selectedHolding?.symbol],
    async () => {
      if (!selectedHolding) return [];
      
      const response = await axios.get(`/api/stocks/yahoo/historical/${selectedHolding.symbol}`, {
        params: {
          range: 'max', // Maximum historical data
          interval: '1d'
        }
      });
      return response.data;
    },
    {
      enabled: !!selectedHolding,
      staleTime: 300000,
      refetchInterval: 300000,
    }
  );

  const formatTooltip = (value: any, name: string) => {
    if (name === 'close') return [`$${value.toFixed(2)}`, 'Close'];
    if (name === 'volume') return [value.toLocaleString(), 'Volume'];
    return [value, name];
  };

  const formatXAxis = (tickItem: string) => {
    const date = new Date(tickItem);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  };

  // Filter trades for selected holding and match with chart dates
  const holdingTrades = trades.filter(trade => 
    selectedHolding && trade.symbol === selectedHolding.symbol
  );

  // Find matching chart dates for trade dates
  const transactionLines = holdingTrades.map(trade => {
    const tradeDate = new Date(trade.date);
    const matchingChartDate = historicalData?.find((chartPoint: StockData) => {
      const chartDate = new Date(chartPoint.date);
      return tradeDate.toDateString() === chartDate.toDateString();
    });
    
    return {
      ...trade,
      chartDate: matchingChartDate?.date || trade.date
    };
  }).filter(trade => trade.chartDate);

  // Auto-select first holding if none selected
  useEffect(() => {
    if (holdings.length > 0 && !selectedHolding) {
      setSelectedHolding(holdings[0]);
    }
  }, [holdings, selectedHolding]);

  if (holdings.length === 0) {
    return (
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Holdings Analysis</h2>
          <p className="card-subtitle">No holdings available</p>
        </div>
        <div className="card-body">
          <div className="text-center py-8">
            <p className="text-gray-500">No holdings data available to analyze</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <div className="chart-controls">
          <div className="search-container">
            <select
              value={selectedHolding?.symbol || ''}
              onChange={(e) => {
                const holding = holdings.find(h => h.symbol === e.target.value);
                setSelectedHolding(holding || null);
              }}
              className="search-input"
            >
              {holdings.map((holding) => (
                <option key={holding.symbol} value={holding.symbol}>
                  {holding.symbol} - {holding.companyName}
                </option>
              ))}
            </select>
          </div>
          
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#111827' }}>
            {selectedHolding?.symbol || 'Select Holding'}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="chart-container">
        {isLoading ? (
          <div className="chart-loading">
            <div className="loading-spinner"></div>
          </div>
        ) : error ? (
          <div className="chart-loading">
            <div className="text-center">
              <p className="text-red-500 mb-2">Failed to load chart data</p>
              <p className="text-gray-500 text-sm">Please try again later</p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={historicalData || []} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <defs>
                <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis 
                dataKey="date" 
                tickFormatter={formatXAxis}
                stroke="#6B7280"
                fontSize={12}
              />
              <YAxis 
                domain={['dataMin - 1', 'dataMax + 1']}
                stroke="#6B7280"
                fontSize={12}
                tickFormatter={(value) => `$${value.toFixed(0)}`}
              />
              <Tooltip 
                formatter={formatTooltip}
                labelFormatter={(label) => new Date(label).toLocaleDateString()}
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #E5E7EB',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}
              />
              <Area
                type="monotone"
                dataKey="close"
                stroke="#3B82F6"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorPrice)"
              />
              
              {/* Transaction Lines */}
              {transactionLines.map((trade, index) => (
                <ReferenceLine
                  key={`${trade.chartDate}-${index}`}
                  x={trade.chartDate}
                  stroke={trade.action === 'buy' ? '#10B981' : '#EF4444'}
                  strokeDasharray="3 3"
                  strokeWidth={2}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Chart Info */}
      {historicalData && historicalData.length > 0 && (
        <div className="chart-info">
          <div className="chart-info-item">
            <div className="chart-info-label">Current Price</div>
            <div className="chart-info-value">
              ${historicalData[historicalData.length - 1]?.close?.toFixed(2)}
            </div>
          </div>
          <div className="chart-info-item">
            <div className="chart-info-label">Change</div>
            <div className={`chart-info-value ${
              historicalData[historicalData.length - 1]?.close > historicalData[0]?.close 
                ? 'positive' 
                : 'negative'
            }`}>
              {((historicalData[historicalData.length - 1]?.close - historicalData[0]?.close) / historicalData[0]?.close * 100).toFixed(2)}%
            </div>
          </div>
          <div className="chart-info-item">
            <div className="chart-info-label">High</div>
            <div className="chart-info-value">
              ${Math.max(...historicalData.map((d: StockData) => d.high)).toFixed(2)}
            </div>
          </div>
          <div className="chart-info-item">
            <div className="chart-info-label">Low</div>
            <div className="chart-info-value">
              ${Math.min(...historicalData.map((d: StockData) => d.low)).toFixed(2)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HoldingsChart; 