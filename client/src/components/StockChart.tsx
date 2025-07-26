import React, { useState, useEffect } from 'react';
import { useQuery } from 'react-query';
import axios from 'axios';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  Brush
} from 'recharts';
import { Search, ZoomIn, ZoomOut, Calendar, TrendingUp } from 'lucide-react';

interface StockData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface SearchResult {
  symbol: string;
  name: string;
  type: string;
  region: string;
  currency: string;
}

interface StockChartProps {
  defaultSymbol?: string;
}

const StockChart: React.FC<StockChartProps> = ({ defaultSymbol = 'AAPL' }) => {
  const [selectedSymbol, setSelectedSymbol] = useState(defaultSymbol);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [timeRange, setTimeRange] = useState('1M'); // 1D, 1W, 1M, 3M, 1Y, ALL

  // Fetch stock search results
  const { data: searchData, refetch: refetchSearch } = useQuery(
    ['stockSearch', searchQuery],
    async () => {
      if (searchQuery.length < 2) return [];
      const response = await axios.get(`/api/stocks/search/${searchQuery}`);
      return response.data;
    },
    {
      enabled: searchQuery.length >= 2,
      staleTime: 300000, // 5 minutes
    }
  );

  // Fetch historical data
  const { data: historicalData, isLoading, error } = useQuery(
    ['stockHistorical', selectedSymbol, timeRange],
    async () => {
      const response = await axios.get(`/api/stocks/historical/${selectedSymbol}`, {
        params: {
          outputsize: timeRange === 'ALL' ? 'full' : 'compact'
        }
      });
      return response.data;
    },
    {
      staleTime: 300000, // 5 minutes
      refetchInterval: 300000, // Refetch every 5 minutes
    }
  );

  // Update search results when search data changes
  useEffect(() => {
    if (searchData) {
      setSearchResults(searchData);
    }
  }, [searchData]);

  // Filter data based on time range
  const getFilteredData = (data: StockData[]) => {
    if (!data) return [];
    
    const now = new Date();
    const ranges = {
      '1D': 1,
      '1W': 7,
      '1M': 30,
      '3M': 90,
      '1Y': 365,
      'ALL': Infinity
    };
    
    const daysToShow = ranges[timeRange as keyof typeof ranges];
    if (daysToShow === Infinity) return data;
    
    const cutoffDate = new Date(now.getTime() - daysToShow * 24 * 60 * 60 * 1000);
    return data.filter(item => new Date(item.date) >= cutoffDate);
  };

  const filteredData = getFilteredData(historicalData || []);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query.length >= 2) {
      refetchSearch();
    }
  };

  const handleSymbolSelect = (symbol: string) => {
    setSelectedSymbol(symbol);
    setShowSearch(false);
    setSearchQuery('');
  };

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

  if (error) {
    return (
      <div className="card h-96 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-2">Failed to load stock data</p>
          <p className="text-gray-500 text-sm">Please check the symbol and try again</p>
        </div>
      </div>
    );
  }

  return (
    <div className="stock-chart-container">
      {/* Header with search and controls */}
      <div className="chart-header">
        <div className="chart-controls">
          <div className="search-container">
            <input
              type="text"
              placeholder="Search stocks..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              onFocus={() => setShowSearch(true)}
              className="search-input"
            />
            <Search className="search-icon" />
            
            {/* Search Results Dropdown */}
            {showSearch && searchResults.length > 0 && (
              <div className="search-results">
                {searchResults.map((result) => (
                  <button
                    key={result.symbol}
                    onClick={() => handleSymbolSelect(result.symbol)}
                    className="search-result-item"
                  >
                    <div className="stock-symbol">{result.symbol}</div>
                    <div className="stock-name">{result.name}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#111827' }}>
            {selectedSymbol}
          </div>
        </div>

        {/* Time Range Selector */}
        <div className="time-range-buttons">
          {['1D', '1W', '1M', '3M', '1Y', 'ALL'].map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`time-range-btn ${timeRange === range ? 'active' : ''}`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="chart-container">
        {isLoading ? (
          <div className="chart-loading">
            <div className="loading-spinner"></div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={filteredData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
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
              <Brush dataKey="date" height={30} stroke="#3B82F6" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Chart Info */}
      {filteredData.length > 0 && (
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
              ${Math.max(...filteredData.map(d => d.high)).toFixed(2)}
            </div>
          </div>
          <div className="chart-info-item">
            <div className="chart-info-label">Low</div>
            <div className="chart-info-value">
              ${Math.min(...filteredData.map(d => d.low)).toFixed(2)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockChart; 