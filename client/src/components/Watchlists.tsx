import React, { useState } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import axios from 'axios';

interface WatchlistData {
  active: string[];
  inactive: string[];
  custom: string[];
  totalSymbols: number;
}

const Watchlists: React.FC = () => {
  const [newSymbol, setNewSymbol] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const queryClient = useQueryClient();

  const { data: watchlistData, isLoading, error } = useQuery<WatchlistData>(
    'watchlist',
    async () => {
      const response = await axios.get('/api/portfolio/watchlist');
      return response.data.watchlist;
    },
    {
      staleTime: 300000, // 5 minutes
      cacheTime: 900000, // 15 minutes
      retry: 1
    }
  );

  const handleAddCustomSymbol = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newSymbol.trim()) {
      setAddError('Please enter a symbol');
      return;
    }

    setIsAdding(true);
    setAddError('');

    try {
      const response = await axios.post('/api/portfolio/watchlist/custom/add', {
        symbol: newSymbol.trim()
      });

      if (response.data.success) {
        // Refresh the watchlist data
        queryClient.invalidateQueries('watchlist');
        setNewSymbol('');
      }
    } catch (err: any) {
      setAddError(err.response?.data?.error || 'Failed to add symbol');
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveCustomSymbol = async (symbol: string) => {
    try {
      await axios.delete(`/api/portfolio/watchlist/custom/remove/${symbol}`);
      queryClient.invalidateQueries('watchlist');
    } catch (err) {
      console.error('Failed to remove custom symbol:', err);
    }
  };

  if (isLoading) {
    return (
      <div style={{
        backgroundColor: 'white',
        borderRadius: '16px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
        border: '1px solid #e5e7eb',
        padding: '20px',
        marginBottom: '24px'
      }}>
        <div className="text-center py-4">
          <div className="loading-spinner mx-auto mb-2"></div>
          <p className="text-gray-500 text-sm">Loading watchlist...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        backgroundColor: 'white',
        borderRadius: '16px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
        border: '1px solid #e5e7eb',
        padding: '20px',
        marginBottom: '24px'
      }}>
        <p className="text-red-500 text-sm">Failed to load watchlist</p>
      </div>
    );
  }

  const activeSymbols = watchlistData?.active || [];
  const inactiveSymbols = watchlistData?.inactive || [];
  const customSymbols = watchlistData?.custom || [];

  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '16px',
      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
      border: '1px solid #e5e7eb',
      padding: '20px',
      marginBottom: '24px'
    }}>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{
          fontSize: '18px',
          fontWeight: '700',
          color: '#1f2937',
          marginBottom: '4px'
        }}>
          Watchlists
        </h2>
        <p style={{
          fontSize: '14px',
          color: '#6b7280'
        }}>
          Track your active, inactive, and custom portfolio symbols
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: '20px'
      }}>
        {/* Active Symbols */}
        <div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '12px'
          }}>
            <div style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: '#10b981'
            }}></div>
            <h3 style={{
              fontSize: '14px',
              fontWeight: '600',
              color: '#374151'
            }}>
              Active Holdings ({activeSymbols.length})
            </h3>
          </div>

          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            minHeight: '40px'
          }}>
            {activeSymbols.length > 0 ? (
              activeSymbols.map((symbol) => (
                <span
                  key={symbol}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '6px 12px',
                    fontSize: '13px',
                    fontWeight: '600',
                    color: '#059669',
                    backgroundColor: '#d1fae5',
                    borderRadius: '8px',
                    border: '1px solid #a7f3d0'
                  }}
                >
                  {symbol}
                </span>
              ))
            ) : (
              <p style={{
                fontSize: '13px',
                color: '#9ca3af',
                fontStyle: 'italic'
              }}>
                No active holdings
              </p>
            )}
          </div>
        </div>

        {/* Inactive Symbols */}
        <div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '12px'
          }}>
            <div style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: '#9ca3af'
            }}></div>
            <h3 style={{
              fontSize: '14px',
              fontWeight: '600',
              color: '#374151'
            }}>
              Sold Positions ({inactiveSymbols.length})
            </h3>
          </div>

          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            minHeight: '40px'
          }}>
            {inactiveSymbols.length > 0 ? (
              inactiveSymbols.map((symbol) => (
                <span
                  key={symbol}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '6px 12px',
                    fontSize: '13px',
                    fontWeight: '600',
                    color: '#6b7280',
                    backgroundColor: '#f3f4f6',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb'
                  }}
                >
                  {symbol}
                </span>
              ))
            ) : (
              <p style={{
                fontSize: '13px',
                color: '#9ca3af',
                fontStyle: 'italic'
              }}>
                No sold positions
              </p>
            )}
          </div>
        </div>

        {/* Custom Symbols */}
        <div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '12px'
          }}>
            <div style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: '#3b82f6'
            }}></div>
            <h3 style={{
              fontSize: '14px',
              fontWeight: '600',
              color: '#374151'
            }}>
              Custom Watchlist ({customSymbols.length})
            </h3>
          </div>

          {/* Add Symbol Form */}
          <form onSubmit={handleAddCustomSymbol} style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={newSymbol}
                onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
                placeholder="Enter symbol (e.g., AAPL)"
                disabled={isAdding}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  fontSize: '13px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                }}
                onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
              />
              <button
                type="submit"
                disabled={isAdding || !newSymbol.trim()}
                style={{
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: 'white',
                  backgroundColor: isAdding || !newSymbol.trim() ? '#9ca3af' : '#3b82f6',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: isAdding || !newSymbol.trim() ? 'not-allowed' : 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (!isAdding && newSymbol.trim()) {
                    e.currentTarget.style.backgroundColor = '#2563eb';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isAdding && newSymbol.trim()) {
                    e.currentTarget.style.backgroundColor = '#3b82f6';
                  }
                }}
              >
                {isAdding ? 'Adding...' : 'Add'}
              </button>
            </div>
            {addError && (
              <p style={{
                marginTop: '4px',
                fontSize: '12px',
                color: '#ef4444'
              }}>
                {addError}
              </p>
            )}
          </form>

          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            minHeight: '40px'
          }}>
            {customSymbols.length > 0 ? (
              customSymbols.map((symbol) => (
                <span
                  key={symbol}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    fontSize: '13px',
                    fontWeight: '600',
                    color: '#1e40af',
                    backgroundColor: '#dbeafe',
                    borderRadius: '8px',
                    border: '1px solid #93c5fd'
                  }}
                >
                  {symbol}
                  <button
                    onClick={() => handleRemoveCustomSymbol(symbol)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '16px',
                      height: '16px',
                      marginLeft: '2px',
                      backgroundColor: 'transparent',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      color: '#1e40af',
                      fontSize: '14px',
                      lineHeight: '1',
                      padding: '0',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#93c5fd'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    title={`Remove ${symbol}`}
                  >
                    ×
                  </button>
                </span>
              ))
            ) : (
              <p style={{
                fontSize: '13px',
                color: '#9ca3af',
                fontStyle: 'italic'
              }}>
                No custom symbols. Add one above!
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div style={{
        marginTop: '16px',
        paddingTop: '16px',
        borderTop: '1px solid #e5e7eb',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{
          fontSize: '13px',
          color: '#6b7280'
        }}>
          <span style={{ fontWeight: '600', color: '#374151' }}>
            {watchlistData?.totalSymbols || 0}
          </span>
          {' '}total symbols tracked
        </div>
        <div style={{
          fontSize: '12px',
          color: '#9ca3af'
        }}>
          Updated on portfolio changes
        </div>
      </div>
    </div>
  );
};

export default Watchlists;
