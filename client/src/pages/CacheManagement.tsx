import React, { useState, useEffect } from 'react';
import { Trash2, RefreshCw, Database, Clock, DollarSign } from 'lucide-react';

interface CacheStats {
  totalEntries: number;
  symbols: string[];
  cacheFile: string;
}

interface CacheData {
  [symbol: string]: {
    symbol: string;
    price: number;
    usdPrice: number;
    cadPrice: number;
    companyName: string;
    exchangeRate: number;
    lastUpdated: string;
    priceDate: string;
  };
}

interface CacheEntry {
  symbol: string;
  price: number;
  usdPrice: number;
  cadPrice: number;
  companyName: string;
  exchangeRate: number;
  lastUpdated: string;
  priceDate: string;
}

const CacheManagement: React.FC = () => {
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [cacheData, setCacheData] = useState<CacheData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cacheEntries, setCacheEntries] = useState<CacheEntry[]>([]);

  useEffect(() => {
    loadCacheStats();
  }, []);

  const loadCacheStats = async () => {
    try {
      setLoading(true);
      
      // Load cache stats
      const statsResponse = await fetch('/api/portfolio/cache/stats');
      if (!statsResponse.ok) {
        throw new Error('Failed to load cache statistics');
      }
      const statsData = await statsResponse.json();
      setCacheStats(statsData.cache);
      
      // Load full cache data
      const dataResponse = await fetch('/api/portfolio/cache/data');
      if (dataResponse.ok) {
        const fullData = await dataResponse.json();
        setCacheData(fullData.cache);
      }
      
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cache');
    } finally {
      setLoading(false);
    }
  };

  const clearCache = async () => {
    if (!window.confirm('Are you sure you want to clear all cache entries? This will force fresh API calls on next load.')) {
      return;
    }

    try {
      setLoading(true);
      const response = await fetch('/api/portfolio/cache/clear', {
        method: 'DELETE'
      });
      if (!response.ok) {
        throw new Error('Failed to clear cache');
      }
      await loadCacheStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear cache');
    } finally {
      setLoading(false);
    }
  };

  const deleteCacheEntry = async (symbol: string) => {
    try {
      const response = await fetch(`/api/portfolio/cache/${symbol}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        throw new Error('Failed to delete cache entry');
      }
      await loadCacheStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete cache entry');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white p-6">
        <div className="max-w-6xl mx-auto">
          <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4">
              <h1 className="text-2xl font-bold text-white">Cache Management</h1>
            </div>
            <div className="p-6">
              <div className="flex justify-center items-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden mb-6">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">Cache Management</h1>
                <p className="text-blue-100">Manage holdings data cache for improved performance</p>
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={loadCacheStats}
                  className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Refresh</span>
                </button>
                <button
                  onClick={clearCache}
                  className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Clear All</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Cache Statistics */}
        {cacheStats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Database className="h-8 w-8 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Total Entries</p>
                  <p className="text-2xl font-bold text-gray-900">{cacheStats.totalEntries}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Clock className="h-8 w-8 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Cache File</p>
                  <p className="text-sm font-mono text-gray-900 truncate">{cacheStats.cacheFile}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <DollarSign className="h-8 w-8 text-purple-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Cached Symbols</p>
                  <p className="text-2xl font-bold text-gray-900">{cacheStats.symbols.length}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Cache Entries */}
        {cacheStats && cacheStats.symbols.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Cached Holdings</h2>
              <p className="text-sm text-gray-600">Holdings data stored in cache for fallback use</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Symbol
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Company
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      USD Price
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      CAD Price
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Exchange Rate
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Last Updated
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                                 <tbody className="bg-white divide-y divide-gray-200">
                   {cacheStats.symbols.map((symbol) => {
                     const entry = cacheData?.[symbol];
                     return (
                       <tr key={symbol} className="hover:bg-gray-50">
                         <td className="px-6 py-4 whitespace-nowrap">
                           <div className="text-sm font-medium text-gray-900">{symbol}</div>
                         </td>
                         <td className="px-6 py-4 whitespace-nowrap">
                           <div className="text-sm text-gray-500">{entry?.companyName || '-'}</div>
                         </td>
                         <td className="px-6 py-4 whitespace-nowrap">
                           <div className="text-sm text-gray-900">{entry?.usdPrice ? `$${entry.usdPrice.toFixed(2)}` : '-'}</div>
                         </td>
                         <td className="px-6 py-4 whitespace-nowrap">
                           <div className="text-sm text-gray-900">{entry?.cadPrice ? `$${entry.cadPrice.toFixed(2)}` : '-'}</div>
                         </td>
                         <td className="px-6 py-4 whitespace-nowrap">
                           <div className="text-sm text-gray-900">{entry?.exchangeRate ? entry.exchangeRate.toFixed(2) : '-'}</div>
                         </td>
                         <td className="px-6 py-4 whitespace-nowrap">
                           <div className="text-sm text-gray-500">{entry?.lastUpdated ? formatDate(entry.lastUpdated) : '-'}</div>
                         </td>
                         <td className="px-6 py-4 whitespace-nowrap">
                           <button
                             onClick={() => deleteCacheEntry(symbol)}
                             className="text-red-600 hover:text-red-900 text-sm font-medium"
                           >
                             <Trash2 className="w-4 h-4" />
                           </button>
                         </td>
                       </tr>
                     );
                   })}
                 </tbody>
              </table>
            </div>
          </div>
        )}

        {cacheStats && cacheStats.totalEntries === 0 && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-12 text-center">
            <Database className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No cache entries</h3>
            <p className="mt-1 text-sm text-gray-500">
              The cache is empty. Holdings data will be fetched fresh from APIs.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CacheManagement; 