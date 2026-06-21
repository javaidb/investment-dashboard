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
        backgroundColor: '#10141c',
        borderRadius: '8px',
        border: '1px solid #1e2535',
        padding: '20px',
      }}>
        <div className="text-center py-4">
          <div className="loading-spinner mx-auto mb-2"></div>
          <p style={{ color: '#64748b', fontSize: '13px' }}>Loading watchlist...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        backgroundColor: '#10141c',
        borderRadius: '8px',
        border: '1px solid #1e2535',
        padding: '20px',
      }}>
        <p style={{ color: '#f87171', fontSize: '13px' }}>Failed to load watchlist</p>
      </div>
    );
  }

  const activeSymbols = watchlistData?.active || [];
  const inactiveSymbols = watchlistData?.inactive || [];
  const customSymbols = watchlistData?.custom || [];

  return (
    <div style={{
      backgroundColor: '#10141c',
      borderRadius: '8px',
      border: '1px solid #1e2535',
      padding: '18px 20px',
    }}>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{
          fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
          fontSize: '11px',
          fontWeight: 700,
          color: '#94a3b8',
          letterSpacing: '0.12em',
          textTransform: 'uppercase' as const,
          marginBottom: '3px'
        }}>
          Watchlists
        </h2>
        <p style={{
          fontSize: '11px',
          color: '#4a5568',
          fontFamily: "'IBM Plex Mono', monospace"
        }}>
          Active · Sold positions · Custom symbols
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
              fontSize: '11px',
              fontWeight: 700,
              color: '#94a3b8',
              fontFamily: "'IBM Plex Mono', monospace",
              letterSpacing: '0.08em',
              textTransform: 'uppercase' as const
            }}>
              Active Holdings ({activeSymbols.length})
            </h3>
          </div>

          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            minHeight: '40px',
            maxHeight: '196px',
            overflowY: 'auto',
            paddingRight: '4px'
          }}>
            {activeSymbols.length > 0 ? (
              activeSymbols.map((symbol) => (
                <span
                  key={symbol}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '4px 10px',
                    fontSize: '12px',
                    fontWeight: 600,
                    fontFamily: "'IBM Plex Mono', monospace",
                    color: '#34d399',
                    backgroundColor: 'rgba(16,185,129,0.08)',
                    borderRadius: '4px',
                    border: '1px solid rgba(16,185,129,0.2)',
                    flexShrink: 0
                  }}
                >
                  {symbol}
                </span>
              ))
            ) : (
              <p style={{
                fontSize: '12px',
                color: '#4a5568',
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
              fontSize: '11px',
              fontWeight: 700,
              color: '#94a3b8',
              fontFamily: "'IBM Plex Mono', monospace",
              letterSpacing: '0.08em',
              textTransform: 'uppercase' as const
            }}>
              Sold Positions ({inactiveSymbols.length})
            </h3>
          </div>

          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            minHeight: '40px',
            maxHeight: '196px',
            overflowY: 'auto',
            paddingRight: '4px'
          }}>
            {inactiveSymbols.length > 0 ? (
              inactiveSymbols.map((symbol) => (
                <span
                  key={symbol}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '4px 10px',
                    fontSize: '12px',
                    fontWeight: 600,
                    fontFamily: "'IBM Plex Mono', monospace",
                    color: '#64748b',
                    backgroundColor: 'rgba(100,116,139,0.08)',
                    borderRadius: '4px',
                    border: '1px solid rgba(100,116,139,0.2)',
                    flexShrink: 0
                  }}
                >
                  {symbol}
                </span>
              ))
            ) : (
              <p style={{
                fontSize: '12px',
                color: '#4a5568',
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
              fontSize: '11px',
              fontWeight: 700,
              color: '#94a3b8',
              fontFamily: "'IBM Plex Mono', monospace",
              letterSpacing: '0.08em',
              textTransform: 'uppercase' as const
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
                placeholder="e.g., AAPL"
                disabled={isAdding}
                style={{
                  flex: 1,
                  padding: '7px 10px',
                  fontSize: '12px',
                  fontFamily: "'IBM Plex Mono', monospace",
                  background: '#0a0c10',
                  border: '1px solid #1e2535',
                  borderRadius: '4px',
                  outline: 'none',
                  color: '#cbd5e1',
                  transition: 'border-color 0.2s',
                }}
                onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                onBlur={(e) => e.target.style.borderColor = '#1e2535'}
              />
              <button
                type="submit"
                disabled={isAdding || !newSymbol.trim()}
                style={{
                  padding: '7px 14px',
                  fontSize: '12px',
                  fontWeight: 600,
                  fontFamily: "'IBM Plex Mono', monospace",
                  color: isAdding || !newSymbol.trim() ? '#4a5568' : '#93c5fd',
                  backgroundColor: isAdding || !newSymbol.trim() ? 'rgba(100,116,139,0.08)' : 'rgba(59,130,246,0.12)',
                  border: `1px solid ${isAdding || !newSymbol.trim() ? '#1e2535' : 'rgba(59,130,246,0.3)'}`,
                  borderRadius: '4px',
                  cursor: isAdding || !newSymbol.trim() ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (!isAdding && newSymbol.trim()) {
                    e.currentTarget.style.backgroundColor = 'rgba(59,130,246,0.2)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isAdding && newSymbol.trim()) {
                    e.currentTarget.style.backgroundColor = 'rgba(59,130,246,0.12)';
                  }
                }}
              >
                {isAdding ? 'Adding...' : 'Add'}
              </button>
            </div>
            {addError && (
              <p style={{
                marginTop: '4px',
                fontSize: '11px',
                color: '#f87171',
                fontFamily: "'IBM Plex Mono', monospace"
              }}>
                {addError}
              </p>
            )}
          </form>

          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            minHeight: '40px',
            maxHeight: '196px',
            overflowY: 'auto',
            paddingRight: '4px'
          }}>
            {customSymbols.length > 0 ? (
              customSymbols.map((symbol) => (
                <span
                  key={symbol}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 10px',
                    fontSize: '12px',
                    fontWeight: 600,
                    fontFamily: "'IBM Plex Mono', monospace",
                    color: '#60a5fa',
                    backgroundColor: 'rgba(59,130,246,0.08)',
                    borderRadius: '4px',
                    border: '1px solid rgba(59,130,246,0.2)',
                    flexShrink: 0
                  }}
                >
                  {symbol}
                  <button
                    onClick={() => handleRemoveCustomSymbol(symbol)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '14px',
                      height: '14px',
                      marginLeft: '2px',
                      backgroundColor: 'transparent',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      color: '#60a5fa',
                      fontSize: '14px',
                      lineHeight: '1',
                      padding: '0',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(59,130,246,0.2)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    title={`Remove ${symbol}`}
                  >
                    ×
                  </button>
                </span>
              ))
            ) : (
              <p style={{
                fontSize: '12px',
                color: '#4a5568',
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
        paddingTop: '14px',
        borderTop: '1px solid #1e2535',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{
          fontSize: '12px',
          color: '#4a5568',
          fontFamily: "'IBM Plex Mono', monospace"
        }}>
          <span style={{ fontWeight: 700, color: '#64748b' }}>
            {watchlistData?.totalSymbols || 0}
          </span>
          {' '}total symbols tracked
        </div>
        <div style={{
          fontSize: '11px',
          color: '#374151',
          fontFamily: "'IBM Plex Mono', monospace"
        }}>
          Updated on portfolio changes
        </div>
      </div>
    </div>
  );
};

export default Watchlists;
