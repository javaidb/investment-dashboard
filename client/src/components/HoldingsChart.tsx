import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  const [zoomStart, setZoomStart] = useState<number | null>(null);
  const [zoomEnd, setZoomEnd] = useState<number | null>(null);
  const [isZooming, setIsZooming] = useState(false);
  const [selectionBox, setSelectionBox] = useState<{x: number, y: number, width: number, height: number} | null>(null);
  const lastMouseMove = useRef<number>(0);
  const chartContainerRef = useRef<HTMLDivElement>(null);

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

  // Zoom handlers
  const handleMouseDown = useCallback((e: any) => {
    if (e && e.nativeEvent) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.nativeEvent.clientX - rect.left;
      const y = e.nativeEvent.clientY - rect.top;
      
      setSelectionBox({ x, y, width: 0, height: 0 });
      setIsZooming(true);
    }
  }, []);

  const handleMouseMove = useCallback((e: any) => {
    if (!isZooming || !selectionBox || !e || !e.nativeEvent) return;
    
    // Throttle mouse move events (only update every 16ms = 60fps)
    const now = Date.now();
    if (now - lastMouseMove.current < 16) return;
    lastMouseMove.current = now;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.nativeEvent.clientX - rect.left;
    const y = e.nativeEvent.clientY - rect.top;
    
    setSelectionBox(prev => {
      if (!prev) return prev;
      return {
        x: Math.min(prev.x, x),
        y: Math.min(prev.y, y),
        width: Math.abs(x - prev.x),
        height: Math.abs(y - prev.y)
      };
    });
  }, [isZooming, selectionBox]);

  const handleMouseUp = useCallback(() => {
    if (isZooming && selectionBox && selectionBox.width > 10 && selectionBox.height > 10) {
      // Convert selection box to data indices
      const chartData = historicalData || [];
      if (chartData.length > 0 && chartContainerRef.current) {
        const rect = chartContainerRef.current.getBoundingClientRect();
        const chartWidth = rect.width;
        
        // Calculate percentages based on actual chart width
        const startPercent = Math.max(0, Math.min(1, selectionBox.x / chartWidth));
        const endPercent = Math.max(0, Math.min(1, (selectionBox.x + selectionBox.width) / chartWidth));
        
        const startIndex = Math.floor(startPercent * chartData.length);
        const endIndex = Math.floor(endPercent * chartData.length);
        
        setZoomStart(Math.max(0, startIndex));
        setZoomEnd(Math.min(chartData.length - 1, endIndex));
      }
    }
    setIsZooming(false);
    setSelectionBox(null);
  }, [isZooming, selectionBox, historicalData]);

  const resetZoom = useCallback(() => {
    setZoomStart(null);
    setZoomEnd(null);
    setSelectionBox(null);
  }, []);

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

  // Filter data based on zoom selection
  const getFilteredData = (data: StockData[]) => {
    if (!data || !zoomStart || !zoomEnd) return data;
    
    const startIndex = Math.max(0, Math.floor(zoomStart));
    const endIndex = Math.min(data.length - 1, Math.ceil(zoomEnd));
    
    return data.slice(startIndex, endIndex + 1);
  };

  const filteredData = getFilteredData(historicalData || []);

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
          
          {(zoomStart !== null || zoomEnd !== null) && (
            <button
              onClick={resetZoom}
              className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
            >
              Reset Zoom
            </button>
          )}
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
          <div 
            ref={chartContainerRef}
            style={{ position: 'relative', width: '100%', height: '100%' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart 
                data={filteredData} 
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
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
          
          {/* Selection Box Overlay */}
          {selectionBox && (
            <div
              style={{
                position: 'absolute',
                left: selectionBox.x,
                top: selectionBox.y,
                width: selectionBox.width,
                height: selectionBox.height,
                border: '2px dashed #3B82F6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                pointerEvents: 'none',
                zIndex: 10
              }}
            />
          )}
        </div>
        )}
      </div>

      {/* Chart Info */}
      {filteredData && filteredData.length > 0 && (
        <div className="chart-info">
                      <div className="chart-info-item">
              <div className="chart-info-label">Current Price</div>
              <div className="chart-info-value">
                ${filteredData[filteredData.length - 1]?.close?.toFixed(2)}
              </div>
            </div>
            <div className="chart-info-item">
              <div className="chart-info-label">Change</div>
              <div className={`chart-info-value ${
                filteredData[filteredData.length - 1]?.close > filteredData[0]?.close 
                  ? 'positive' 
                  : 'negative'
              }`}>
                {((filteredData[filteredData.length - 1]?.close - filteredData[0]?.close) / filteredData[0]?.close * 100).toFixed(2)}%
              </div>
            </div>
            <div className="chart-info-item">
              <div className="chart-info-label">High</div>
              <div className="chart-info-value">
                ${Math.max(...filteredData.map((d: StockData) => d.high)).toFixed(2)}
              </div>
            </div>
            <div className="chart-info-item">
              <div className="chart-info-label">Low</div>
              <div className="chart-info-value">
                ${Math.min(...filteredData.map((d: StockData) => d.low)).toFixed(2)}
              </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default HoldingsChart; 