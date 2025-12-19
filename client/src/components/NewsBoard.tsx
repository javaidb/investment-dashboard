import React, { useState } from 'react';
import { useQuery } from 'react-query';
import axios from 'axios';

interface NewsItem {
  id: string;
  symbol: string;
  assetName: string;
  type: 'momentum_signal' | 'warning' | 'achievement';
  title: string;
  message: string;
  timestamp: Date;
  metadata: {
    currentPrice?: number;
    wma200?: number;
    weeklyChanges?: number[];
    percentBelow200WMA?: number;
  };
}

interface NewsResponse {
  items: NewsItem[];
  lastUpdated: string;
}

const NewsBoard: React.FC = () => {
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'momentum_signal' | 'warning' | 'achievement'>('all');

  const { data, isLoading, error, refetch } = useQuery<NewsResponse>(
    'newsboard',
    async () => {
      const response = await axios.get('/api/newsboard/events');
      return response.data;
    },
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 30 * 60 * 1000, // 30 minutes
      refetchOnWindowFocus: false,
      refetchOnMount: true,
      refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
    }
  );

  const getTypeStyles = (type: NewsItem['type']) => {
    switch (type) {
      case 'momentum_signal':
        return {
          badge: 'bg-gradient-to-r from-green-500 to-emerald-600 text-white',
          border: 'border-l-4 border-green-500',
          icon: '📈',
          glow: 'shadow-green-500/20',
        };
      case 'warning':
        return {
          badge: 'bg-gradient-to-r from-amber-500 to-orange-600 text-white',
          border: 'border-l-4 border-amber-500',
          icon: '⚠️',
          glow: 'shadow-amber-500/20',
        };
      case 'achievement':
        return {
          badge: 'bg-gradient-to-r from-blue-500 to-purple-600 text-white',
          border: 'border-l-4 border-blue-500',
          icon: '🎯',
          glow: 'shadow-blue-500/20',
        };
      default:
        return {
          badge: 'bg-gray-500 text-white',
          border: 'border-l-4 border-gray-500',
          icon: '📋',
          glow: 'shadow-gray-500/20',
        };
    }
  };

  const filteredItems = data?.items.filter((item: NewsItem) =>
    selectedFilter === 'all' || item.type === selectedFilter
  ) || [];

  const formatTimestamp = (timestamp: Date) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="bg-gradient-to-r from-slate-800/50 to-slate-700/50 backdrop-blur-sm rounded-2xl p-8 border border-slate-600/30 shadow-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
                <span className="text-4xl">📊</span>
                NewsBoard
              </h1>
              <p className="text-slate-300 text-lg">
                Stay informed about important events with your portfolio assets
              </p>
              {data?.lastUpdated && (
                <p className="text-slate-400 text-sm mt-2">
                  Last updated: {new Date(data.lastUpdated).toLocaleString()}
                </p>
              )}
            </div>
            <button
              onClick={() => refetch()}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg hover:shadow-xl transform hover:scale-105 font-medium"
            >
              🔄 Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="flex gap-3 overflow-x-auto pb-2">
          {[
            { key: 'all', label: 'All Events', icon: '📋', count: data?.items.length || 0 },
            { key: 'momentum_signal', label: 'Momentum Signals', icon: '📈', count: data?.items.filter((i: NewsItem) => i.type === 'momentum_signal').length || 0 },
            { key: 'warning', label: 'Warnings', icon: '⚠️', count: data?.items.filter((i: NewsItem) => i.type === 'warning').length || 0 },
            { key: 'achievement', label: 'Achievements', icon: '🎯', count: data?.items.filter((i: NewsItem) => i.type === 'achievement').length || 0 },
          ].map((filter) => (
            <button
              key={filter.key}
              onClick={() => setSelectedFilter(filter.key as any)}
              className={`px-6 py-3 rounded-xl font-medium transition-all whitespace-nowrap flex items-center gap-2 ${
                selectedFilter === filter.key
                  ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-500/30 scale-105'
                  : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 border border-slate-600/30'
              }`}
            >
              <span>{filter.icon}</span>
              <span>{filter.label}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                selectedFilter === filter.key ? 'bg-white/20' : 'bg-slate-700'
              }`}>
                {filter.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* News Items */}
      <div className="max-w-7xl mx-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-slate-400 text-lg">Loading news events...</p>
            </div>
          </div>
        ) : error ? (
          <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-8 text-center">
            <p className="text-red-400 text-lg">❌ Failed to load news events</p>
            <p className="text-red-300/70 mt-2">{(error as Error).message}</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="bg-slate-800/30 border border-slate-600/30 rounded-xl p-12 text-center backdrop-blur-sm">
            <p className="text-slate-400 text-xl mb-2">📭 No events to display</p>
            <p className="text-slate-500">
              {selectedFilter === 'all'
                ? 'Your portfolio is quiet right now. Check back later!'
                : `No ${selectedFilter.replace('_', ' ')} events at this time.`}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredItems.map((item: NewsItem) => {
              const styles = getTypeStyles(item.type);
              return (
                <div
                  key={item.id}
                  className={`bg-gradient-to-r from-slate-800/80 to-slate-800/60 backdrop-blur-sm rounded-xl ${styles.border} overflow-hidden transition-all hover:shadow-2xl hover:${styles.glow} hover:scale-[1.02] transform duration-200`}
                >
                  <div className="p-6">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">{styles.icon}</span>
                        <div>
                          <div className="flex items-center gap-3 mb-1">
                            <h3 className="text-xl font-bold text-white">{item.symbol}</h3>
                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${styles.badge}`}>
                              {item.type.replace('_', ' ').toUpperCase()}
                            </span>
                          </div>
                          <p className="text-slate-400 text-sm">{item.assetName}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-slate-400 text-sm">{formatTimestamp(item.timestamp)}</p>
                      </div>
                    </div>

                    {/* Message */}
                    <div className="bg-slate-900/40 rounded-lg p-4 mb-4 border border-slate-700/30">
                      <h4 className="text-lg font-semibold text-white mb-2">{item.title}</h4>
                      <p className="text-slate-300 leading-relaxed">{item.message}</p>
                    </div>

                    {/* Metadata */}
                    {item.metadata && (
                      <div className="flex flex-wrap gap-4">
                        {item.metadata.currentPrice && (
                          <div className="bg-slate-900/60 rounded-lg px-4 py-2 border border-slate-700/30">
                            <p className="text-slate-400 text-xs mb-1">Current Price</p>
                            <p className="text-white font-semibold">${item.metadata.currentPrice.toFixed(2)}</p>
                          </div>
                        )}
                        {item.metadata.wma200 && (
                          <div className="bg-slate-900/60 rounded-lg px-4 py-2 border border-slate-700/30">
                            <p className="text-slate-400 text-xs mb-1">200 WMA</p>
                            <p className="text-white font-semibold">${item.metadata.wma200.toFixed(2)}</p>
                          </div>
                        )}
                        {item.metadata.percentBelow200WMA !== undefined && (
                          <div className="bg-slate-900/60 rounded-lg px-4 py-2 border border-slate-700/30">
                            <p className="text-slate-400 text-xs mb-1">Below 200 WMA</p>
                            <p className="text-amber-400 font-semibold">{item.metadata.percentBelow200WMA.toFixed(2)}%</p>
                          </div>
                        )}
                        {item.metadata.weeklyChanges && item.metadata.weeklyChanges.length > 0 && (
                          <div className="bg-slate-900/60 rounded-lg px-4 py-2 border border-slate-700/30">
                            <p className="text-slate-400 text-xs mb-1">Weekly Change</p>
                            <p className={`font-semibold text-lg ${item.metadata.weeklyChanges[0] >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {item.metadata.weeklyChanges[0] >= 0 ? '+' : ''}{item.metadata.weeklyChanges[0].toFixed(2)}%
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default NewsBoard;
