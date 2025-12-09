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
  ReferenceLine,
  Line
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
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [show200WeekMA, setShow200WeekMA] = useState<boolean>(false);
  const [show50WeekMA, setShow50WeekMA] = useState<boolean>(false);
  const lastMouseMove = useRef<number>(0);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // Fetch historical data ENTIRELY from cache as requested
  const { data: historicalData, isLoading, error } = useQuery(
    ['holdingHistorical', selectedHolding?.symbol, selectedHolding?.type],
    async () => {
      if (!selectedHolding) return [];
      
      console.log(`📊 Fetching historical data for ${selectedHolding.symbol} ENTIRELY from cache`);
      
      // Use cache endpoint to read entirely from cache
      const response = await axios.get(`/api/portfolio/cache/historical/${selectedHolding.symbol}`, {
        params: {
          period: 'max' // Get maximum available data from cache
        }
      });
      
      const data = response.data.data || [];
      console.log(`📊 Retrieved ${data.length} data points from cache for ${selectedHolding.symbol}, sorted earliest to latest`);
      
      // Ensure data is sorted from earliest to latest (ascending chronological order)
      data.sort((a: StockData, b: StockData) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      return data;
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

  const resetDateRange = useCallback(() => {
    setStartDate('');
    setEndDate('');
    resetZoom();
  }, [resetZoom]);

  const setDateRangePreset = useCallback((months: number) => {
    if (!historicalData || historicalData.length === 0) return;

    const latestDate = new Date(historicalData[historicalData.length - 1].date);
    const presetStartDate = new Date(latestDate);
    presetStartDate.setMonth(presetStartDate.getMonth() - months);

    const earliestDate = new Date(historicalData[0].date);
    const actualStartDate = presetStartDate > earliestDate ? presetStartDate : earliestDate;

    // Debug logging
    console.log('🔍 setDateRangePreset DEBUG:', {
      months,
      historicalDataLength: historicalData.length,
      latestDateFromData: historicalData[historicalData.length - 1].date,
      latestDateParsed: latestDate.toISOString(),
      actualStartDate: actualStartDate.toISOString().split('T')[0],
      endDate: latestDate.toISOString().split('T')[0],
    });

    setStartDate(actualStartDate.toISOString().split('T')[0]);
    setEndDate(latestDate.toISOString().split('T')[0]);
    resetZoom();
  }, [historicalData, resetZoom]);

  const setDateRangeWeeks = useCallback((weeks: number) => {
    if (!historicalData || historicalData.length === 0) return;

    const latestDate = new Date(historicalData[historicalData.length - 1].date);
    const presetStartDate = new Date(latestDate);
    presetStartDate.setDate(presetStartDate.getDate() - (weeks * 7));

    const earliestDate = new Date(historicalData[0].date);
    const actualStartDate = presetStartDate > earliestDate ? presetStartDate : earliestDate;

    setStartDate(actualStartDate.toISOString().split('T')[0]);
    setEndDate(latestDate.toISOString().split('T')[0]);
    resetZoom();
  }, [historicalData, resetZoom]);

  // Set default date range when historical data loads - show ALL data by default
  useEffect(() => {
    if (historicalData && historicalData.length > 0 && !startDate && !endDate) {
      // Default to ALL data - no date filtering
      // Don't set startDate and endDate, leave them empty to show all data
    }
  }, [historicalData, startDate, endDate]);

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

  // Calculate 200-week moving average on FULL dataset (before filtering)
  // Using ~1000 trading days as 200 weeks has ~260 trading days per year, so 200 weeks ≈ ~770 trading days
  // For periods < 200 weeks, use all available data up to that point
  const calculate200WeekMA = (data: StockData[]) => {
    const targetPeriod = 1000; // 200 weeks * 5 trading days per week
    if (!data || data.length === 0) return [];

    return data.map((item, index) => {
      // Use the minimum of target period or all available data up to current point
      const actualPeriod = Math.min(targetPeriod, index + 1);

      const slice = data.slice(Math.max(0, index - actualPeriod + 1), index + 1);
      const sum = slice.reduce((acc, curr) => acc + curr.close, 0);
      const ma = sum / slice.length;

      return { ...item, ma200Week: ma };
    });
  };

  // Calculate 50-week moving average on FULL dataset (before filtering)
  // Using ~250 trading days as 50 weeks ≈ ~250 trading days
  const calculate50WeekMA = (data: StockData[]) => {
    const targetPeriod = 250; // 50 weeks * 5 trading days per week
    if (!data || data.length === 0) return [];

    return data.map((item, index) => {
      // Use the minimum of target period or all available data up to current point
      const actualPeriod = Math.min(targetPeriod, index + 1);

      const slice = data.slice(Math.max(0, index - actualPeriod + 1), index + 1);
      const sum = slice.reduce((acc, curr) => acc + curr.close, 0);
      const ma = sum / slice.length;

      return { ...item, ma50Week: ma };
    });
  };

  // Calculate MAs on full dataset first
  let dataWithMA = historicalData || [];
  if (show200WeekMA) {
    dataWithMA = calculate200WeekMA(dataWithMA);
  }
  if (show50WeekMA) {
    dataWithMA = calculate50WeekMA(dataWithMA);
  }

  // Filter data based on date range or zoom selection (AFTER MA calculation)
  const getFilteredData = (data: StockData[]) => {
    if (!data) return data;

    let filtered = data;

    // First apply date range filtering if dates are selected
    if (startDate || endDate) {
      filtered = data.filter(item => {
        const itemDate = new Date(item.date);
        const start = startDate ? new Date(startDate) : new Date(0);
        const end = endDate ? new Date(endDate) : new Date();

        return itemDate >= start && itemDate <= end;
      });
    }

    // Then apply zoom selection if it exists
    if (zoomStart !== null && zoomEnd !== null && filtered.length > 0) {
      const startIndex = Math.max(0, Math.floor(zoomStart));
      const endIndex = Math.min(filtered.length - 1, Math.ceil(zoomEnd));
      filtered = filtered.slice(startIndex, endIndex + 1);
    }

    return filtered;
  };

  const filteredData = getFilteredData(dataWithMA);

  // Check if a holding is an ETF (same logic as in Breakdown tab)
  const isETF = (holding: Holding): boolean => {
    return holding.type === 's' && (
      holding.symbol.includes('XEQT') ||
      holding.symbol.includes('VOO') ||
      holding.symbol.includes('QQQ') ||
      holding.symbol.includes('IBIT')
    );
  };

  // Get asset category: 'crypto', 'etf', or 'stock'
  const getAssetCategory = (holding: Holding): 'crypto' | 'etf' | 'stock' => {
    if (holding.type === 'c') return 'crypto';
    if (isETF(holding)) return 'etf';
    return 'stock';
  };

  // Sort holdings by asset type, then alphabetically
  const sortedHoldings = [...holdings].sort((a, b) => {
    const catA = getAssetCategory(a);
    const catB = getAssetCategory(b);

    // Sort order: crypto, etf, stock
    const order = { crypto: 0, etf: 1, stock: 2 };
    if (order[catA] !== order[catB]) {
      return order[catA] - order[catB];
    }
    // Then sort alphabetically by symbol
    return a.symbol.localeCompare(b.symbol);
  });

  // Get color based on asset category
  const getAssetColor = (holding: Holding): string => {
    const category = getAssetCategory(holding);
    if (category === 'crypto') return '#F59E0B'; // Orange for crypto
    if (category === 'etf') return '#3B82F6';    // Blue for ETFs
    return '#10B981';                              // Green for stocks
  };

  // Get emoji for asset category
  const getAssetEmoji = (holding: Holding): string => {
    const category = getAssetCategory(holding);
    if (category === 'crypto') return '🟠'; // Orange circle for crypto
    if (category === 'etf') return '🔵';    // Blue circle for ETFs
    return '🟢';                            // Green circle for stocks
  };

  // Auto-select first holding if none selected
  useEffect(() => {
    if (holdings.length > 0 && !selectedHolding) {
      setSelectedHolding(sortedHoldings[0]);
    }
  }, [holdings, selectedHolding]);

  if (holdings.length === 0) {
    return (
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Holdings Analysis (Stocks & Crypto)</h2>
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
        {/* First row: Dropdown and Title side by side */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '1rem', 
          marginBottom: '1rem'
        }}>
          <div className="search-container" style={{ position: 'relative' }}>
            <select
              value={selectedHolding?.symbol || ''}
              onChange={(e) => {
                const holding = sortedHoldings.find(h => h.symbol === e.target.value);
                setSelectedHolding(holding || null);
              }}
              className="search-input"
              style={{ width: '16rem' }}
            >
              {sortedHoldings.map((holding) => (
                <option key={holding.symbol} value={holding.symbol}>
                  {getAssetEmoji(holding)} {holding.symbol} - {holding.companyName}
                </option>
              ))}
            </select>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {selectedHolding && (
              <div style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor: getAssetColor(selectedHolding)
              }}></div>
            )}
            <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#111827' }}>
              {selectedHolding?.symbol || 'Select Holding'}
            </div>
          </div>
        </div>

        {/* Second row: Date Range Controls */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.75rem',
          flexWrap: 'wrap'
        }}>
          {/* Date Range Inputs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              max={endDate || undefined}
              style={{ width: '115px' }}
            />
            <span className="text-gray-400 text-xs">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              min={startDate || undefined}
              style={{ width: '115px' }}
            />
          </div>
          
          {/* Preset Buttons */}
          <div className="time-range-buttons">
            <button
              onClick={() => setDateRangeWeeks(1)}
              className="time-range-btn"
            >
              1W
            </button>
            <button
              onClick={() => setDateRangePreset(1)}
              className="time-range-btn"
            >
              1M
            </button>
            <button
              onClick={() => setDateRangePreset(3)}
              className="time-range-btn"
            >
              3M
            </button>
            <button
              onClick={() => setDateRangePreset(6)}
              className="time-range-btn"
            >
              6M
            </button>
            <button
              onClick={() => setDateRangePreset(12)}
              className="time-range-btn"
            >
              1Y
            </button>
            <button
              onClick={() => setDateRangePreset(36)}
              className="time-range-btn"
            >
              3Y
            </button>

            <button
              onClick={resetDateRange}
              className={`time-range-btn ${(!startDate && !endDate) ? 'active' : ''}`}
            >
              ALL
            </button>
          </div>
          
          {(zoomStart !== null || zoomEnd !== null) && (
            <button
              onClick={resetZoom}
              className="px-2 py-1 text-xs bg-orange-100 text-orange-700 rounded hover:bg-orange-200 transition-all font-medium"
            >
              Reset Zoom
            </button>
          )}

          {/* 50-Week MA Toggle */}
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            cursor: 'pointer',
            marginLeft: 'auto'
          }}>
            <input
              type="checkbox"
              checked={show50WeekMA}
              onChange={(e) => setShow50WeekMA(e.target.checked)}
              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: '500' }}>
              50-Week MA
            </span>
          </label>

          {/* 200-Week MA Toggle */}
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            cursor: 'pointer'
          }}>
            <input
              type="checkbox"
              checked={show200WeekMA}
              onChange={(e) => setShow200WeekMA(e.target.checked)}
              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: '500' }}>
              200-Week MA
            </span>
          </label>
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

              {/* 50-Week Moving Average Line */}
              {show50WeekMA && (
                <Line
                  type="monotone"
                  dataKey="ma50Week"
                  stroke="#F59E0B"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              )}

              {/* 200-Week Moving Average Line */}
              {show200WeekMA && (
                <Line
                  type="monotone"
                  dataKey="ma200Week"
                  stroke="#9333EA"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              )}

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