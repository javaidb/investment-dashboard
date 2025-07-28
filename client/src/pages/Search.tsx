import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { Search as SearchIcon, TrendingUp, TrendingDown } from 'lucide-react';
import axios from 'axios';

interface SearchResult {
  symbol: string;
  name: string;
  type: 'stock' | 'crypto';
  price?: number;
  change?: number;
  changePercent?: number;
}

interface SearchResponse {
  query: string;
  total: number;
  results: SearchResult[];
}

const Search: React.FC = () => {
  const [query, setQuery] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const { data: searchResults, isLoading, error } = useQuery<SearchResponse | null>(
    ['search', searchTerm],
    async () => {
      if (!searchTerm || searchTerm.length < 2) return null;
      const response = await axios.get(`/api/search/${searchTerm}`);
      return response.data;
    },
    {
      enabled: searchTerm.length >= 2,
      staleTime: 300000, // 5 minutes
    }
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchTerm(query);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header Section */}
      <div className="dashboard-header">
        <div className="dashboard-header-content">
          <h1 className="dashboard-title">Search Investments</h1>
          <p className="dashboard-subtitle">Find stocks and cryptocurrencies to invest in</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="dashboard-content">
        <div className="dashboard-section">
      {/* Search Form */}
      <div className="card">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Search Investments</h2>
        <form onSubmit={handleSearch} className="flex gap-4">
          <div className="flex-1 relative">
            <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for stocks or cryptocurrencies..."
              className="input pl-10"
            />
          </div>
          <button
            type="submit"
            disabled={query.length < 2}
            className="btn btn-primary px-6"
          >
            Search
          </button>
        </form>
      </div>

      {/* Search Results */}
      {searchTerm && (
        <div className="card">
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Search Results for "{searchTerm}"
            </h3>
            
            {isLoading && (
              <div className="text-center py-8">
                <div className="loading-spinner mx-auto mb-4"></div>
                <p className="text-gray-500">Searching...</p>
              </div>
            )}

            {error ? (
              <div className="text-center py-8">
                <p className="text-red-500">Failed to search. Please try again.</p>
              </div>
            ) : searchResults && searchResults.results && searchResults.results.length > 0 ? (
              <div className="space-y-3">
                {searchResults.results.map((result: SearchResult) => (
                  <div
                    key={`${result.type}-${result.symbol}`}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="flex-shrink-0">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          result.type === 'stock' ? 'bg-blue-100' : 'bg-orange-100'
                        }`}>
                          <span className={`text-sm font-medium ${
                            result.type === 'stock' ? 'text-blue-600' : 'text-orange-600'
                          }`}>
                            {result.type === 'stock' ? 'S' : 'C'}
                          </span>
                        </div>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{result.symbol}</p>
                        <p className="text-sm text-gray-500">{result.name}</p>
                        <span className={`badge ${
                          result.type === 'stock' ? 'badge-primary' : 'badge-warning'
                        }`}>
                          {result.type === 'stock' ? 'Stock' : 'Crypto'}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      {result.price ? (
                        <>
                          <p className="font-medium text-gray-900">
                            ${result.price.toFixed(2)}
                          </p>
                          {result.changePercent && (
                            <div className="flex items-center justify-end">
                              {result.changePercent > 0 ? (
                                <TrendingUp className="h-4 w-4 text-green-500" />
                              ) : (
                                <TrendingDown className="h-4 w-4 text-red-500" />
                              )}
                              <span
                                className={`ml-1 text-sm ${
                                  result.changePercent > 0
                                    ? 'text-green-600'
                                    : 'text-red-600'
                                }`}
                              >
                                {result.changePercent > 0 ? '+' : ''}
                                {result.changePercent.toFixed(2)}%
                              </span>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-sm text-gray-500">Price unavailable</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : searchResults && searchResults.results && searchResults.results.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">No results found for "{searchTerm}"</p>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Search Tips */}
      <div className="card">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Search Tips</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Stocks</h4>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Use ticker symbols (e.g., AAPL, MSFT)</li>
              <li>• Search by company name</li>
              <li>• Examples: Apple, Microsoft, Tesla</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Cryptocurrencies</h4>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Use coin symbols (e.g., BTC, ETH)</li>
              <li>• Search by coin name</li>
              <li>• Examples: Bitcoin, Ethereum, Cardano</li>
            </ul>
          </div>
        </div>
        </div>
        </div>
      </div>
    </div>
  );
};

export default Search; 