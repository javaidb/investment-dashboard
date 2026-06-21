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

      let data = response.data.data || [];
      console.log(`📊 Retrieved ${data.length} data points from cache for ${selectedHolding.symbol}, sorted earliest to latest`);

      // Ensure data is sorted from earliest to latest (ascending chronological order)
      data.sort((a: StockData, b: StockData) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // For crypto, convert USD historical data to CAD
      if (selectedHolding.type === 'c') {
        // Get exchange rate from holdings cache
        const cacheResponse = await axios.get('/api/portfolio/cache/data');
        const cachedPrice = cacheResponse.data.cache?.[selectedHolding.symbol];
        const exchangeRate = cachedPrice?.exchangeRate || 1.4;

        console.log(`💱 ${selectedHolding.symbol}: Converting historical USD data to CAD using rate ${exchangeRate.toFixed(4)}`);

        data = data.map((point: StockData) => ({
          ...point,
          close: point.close * exchangeRate,
          open: point.open * exchangeRate,
          high: point.high * exchangeRate,
          low: point.low * exchangeRate
        }));
      }

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
      <div style={{ backgroundColor: '#10141c', border: '1px solid #1e2535', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #1e2535' }}>
          <h2 style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase' as const }}>Holdings Analysis</h2>
          <p style={{ fontSize: '11px', color: '#4a5568', marginTop: '2px', fontFamily: "'IBM Plex Mono', monospace" }}>No holdings available</p>
        </div>
        <div style={{ padding: '16px', textAlign: 'center' }}>
          <p style={{ color: '#4a5568', fontSize: '13px', padding: '24px 0', fontFamily: "'IBM Plex Mono', monospace" }}>No holdings data available to analyze</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: '#10141c', border: '1px solid #1e2535', borderRadius: '8px', overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid #1e2535' }}>
        {/* First row: Dropdown and Title side by side */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '1rem', 
          marginBottom: '1rem'
        }}>
          <div style={{ position: 'relative' }}>
            <select
              value={selectedHolding?.symbol || ''}
              onChange={(e) => {
                const holding = sortedHoldings.find(h => h.symbol === e.target.value);
                setSelectedHolding(holding || null);
              }}
              style={{
                width: '16rem',
                padding: '6px 10px',
                background: '#0a0c10',
                border: '1px solid #1e2535',
                borderRadius: '4px',
                color: '#cbd5e1',
                fontSize: '13px',
                fontFamily: "'IBM Plex Mono', monospace",
                outline: 'none',
                cursor: 'pointer'
              }}
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
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: getAssetColor(selectedHolding)
              }}></div>
            )}
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '14px', fontWeight: 700, color: '#e2e8f0', letterSpacing: '0.05em' }}>
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
              max={endDate || undefined}
              style={{ width: '115px', padding: '4px 8px', background: '#0a0c10', border: '1px solid #1e2535', borderRadius: '4px', color: '#94a3b8', fontSize: '11px', fontFamily: "'IBM Plex Mono', monospace", outline: 'none' }}
            />
            <span style={{ color: '#4a5568', fontSize: '11px', fontFamily: "'IBM Plex Mono', monospace" }}>to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              min={startDate || undefined}
              style={{ width: '115px', padding: '4px 8px', background: '#0a0c10', border: '1px solid #1e2535', borderRadius: '4px', color: '#94a3b8', fontSize: '11px', fontFamily: "'IBM Plex Mono', monospace", outline: 'none' }}
            />
          </div>

          {/* Preset Buttons */}
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' as const }}>
            {(['1W', '1M', '3M', '6M', '1Y', '3Y', 'ALL'] as const).map((label) => {
              const isActive = label === 'ALL' && !startDate && !endDate;
              const handleClick = () => {
                if (label === '1W') setDateRangeWeeks(1);
                else if (label === '1M') setDateRangePreset(1);
                else if (label === '3M') setDateRangePreset(3);
                else if (label === '6M') setDateRangePreset(6);
                else if (label === '1Y') setDateRangePreset(12);
                else if (label === '3Y') setDateRangePreset(36);
                else resetDateRange();
              };
              return (
                <button
                  key={label}
                  onClick={handleClick}
                  style={{
                    padding: '3px 10px',
                    fontSize: '11px',
                    fontWeight: 600,
                    fontFamily: "'IBM Plex Mono', monospace",
                    border: `1px solid ${isActive ? 'rgba(59,130,246,0.4)' : '#1e2535'}`,
                    borderRadius: '4px',
                    background: isActive ? 'rgba(59,130,246,0.12)' : 'transparent',
                    color: isActive ? '#60a5fa' : '#64748b',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                  onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = 'rgba(59,130,246,0.06)'; e.currentTarget.style.color = '#93c5fd'; } }}
                  onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#64748b'; } }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          
          {(zoomStart !== null || zoomEnd !== null) && (
            <button
              onClick={resetZoom}
              style={{ padding: '3px 10px', fontSize: '11px', fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace", background: 'rgba(251,146,60,0.1)', color: '#fb923c', border: '1px solid rgba(251,146,60,0.3)', borderRadius: '4px', cursor: 'pointer' }}
            >
              Reset Zoom
            </button>
          )}

          {/* 50-Week MA Toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', marginLeft: 'auto' }}>
            <input
              type="checkbox"
              checked={show50WeekMA}
              onChange={(e) => setShow50WeekMA(e.target.checked)}
              style={{ width: '13px', height: '13px', cursor: 'pointer', accentColor: '#F59E0B' }}
            />
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace" }}>50W MA</span>
          </label>

          {/* 200-Week MA Toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={show200WeekMA}
              onChange={(e) => setShow200WeekMA(e.target.checked)}
              style={{ width: '13px', height: '13px', cursor: 'pointer', accentColor: '#9333EA' }}
            />
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace" }}>200W MA</span>
          </label>
        </div>
      </div>

      {/* Chart */}
      <div style={{ height: '24rem', marginBottom: '1.5rem', padding: '0 16px' }}>
        {isLoading ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="loading-spinner"></div>
          </div>
        ) : error ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: '#f87171', marginBottom: '8px', fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px' }}>Failed to load chart data</p>
              <p style={{ color: '#4a5568', fontSize: '12px', fontFamily: "'IBM Plex Mono', monospace" }}>Please try again later</p>
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
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" />
              <XAxis
                dataKey="date"
                tickFormatter={formatXAxis}
                stroke="#4a5568"
                tick={{ fill: '#64748b' }}
                fontSize={11}
              />
              <YAxis
                domain={['dataMin - 1', 'dataMax + 1']}
                stroke="#4a5568"
                tick={{ fill: '#64748b' }}
                fontSize={11}
                tickFormatter={(value) => `$${value.toFixed(0)}`}
              />
              <Tooltip
                formatter={formatTooltip}
                labelFormatter={(label) => new Date(label).toLocaleDateString()}
                contentStyle={{
                  backgroundColor: '#10141c',
                  border: '1px solid #1e2535',
                  borderRadius: '6px',
                  color: '#cbd5e1'
                }}
                labelStyle={{ color: '#94a3b8' }}
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', padding: '0 16px 16px' }}>
          {[
            { label: 'Current Price', value: `$${filteredData[filteredData.length - 1]?.close?.toFixed(2)}`, color: '#e2e8f0' },
            {
              label: 'Change',
              value: `${((filteredData[filteredData.length - 1]?.close - filteredData[0]?.close) / filteredData[0]?.close * 100).toFixed(2)}%`,
              color: filteredData[filteredData.length - 1]?.close > filteredData[0]?.close ? '#34d399' : '#f87171'
            },
            { label: 'High', value: `$${Math.max(...filteredData.map((d: StockData) => d.high)).toFixed(2)}`, color: '#e2e8f0' },
            { label: 'Low', value: `$${Math.min(...filteredData.map((d: StockData) => d.low)).toFixed(2)}`, color: '#e2e8f0' }
          ].map(({ label, value, color }) => (
            <div key={label} style={{ textAlign: 'center', padding: '10px', backgroundColor: 'rgba(30,37,53,0.5)', borderRadius: '6px', border: '1px solid #1e2535' }}>
              <div style={{ color: '#4a5568', fontSize: '10px', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '4px', fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700 }}>{label}</div>
              <div style={{ fontWeight: 700, color, fontSize: '14px', fontFamily: "'IBM Plex Mono', monospace" }}>{value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default HoldingsChart; 