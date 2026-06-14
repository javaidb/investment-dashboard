import React, { useState, useEffect } from 'react';
import { Trash2, RefreshCw, Database, Clock, DollarSign, TrendingUp, FileText, CheckCircle } from 'lucide-react';
import { useCache } from '../contexts/CacheContext';

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
    sector?: string | null;
    subsector?: string[] | string | null;
    otherSectors?: string[] | null;
    conviction?: string | null;
    exchangeRate: number;
    lastUpdated: string;
    priceDate: string;
  };
}

// Predefined sector options
const SECTOR_OPTIONS = [
  'Alternative Investments',
  'Broad Market',
  'Commodities',
  'Consumer Cyclical',
  'Consumer Defensive',
  'Cryptocurrency',
  'Energy',
  'Financial Services',
  'Healthcare',
  'Industrials',
  'Materials',
  'Real Estate',
  'Tech',
  'Telecommunications',
  'Utilities'
];

// Predefined subsector options
const SUBSECTOR_OPTIONS = [
  'AI',
  'Aerospace',
  'Altcoins',
  'Asset Management',
  'Banks',
  'Battery Materials',
  'Biotech',
  'Bitcoin',
  'Clean Technology',
  'Cloud & SaaS',
  'Consumer Electronics',
  'Cybersecurity',
  'Data Centers',
  'Defense',
  'E-Commerce',
  'Electric Vehicles',
  'Fintech',
  'Fixed Income',
  'Gaming',
  'Gold',
  'Health Insurance',
  'Industrial Equipment',
  'Insurance',
  'Medical Devices',
  'Mining',
  'Natural Gas',
  'Nuclear Power',
  'Oil & Gas',
  'Payments',
  'Pharmaceuticals',
  'Pipelines',
  'Quantum Computing',
  'Robotics / Automation',
  'Search & Advertising',
  'Semiconductors',
  'Silver',
  'Social Media',
  'Space',
  'Streaming / Media',
  'Telehealth',
  'Uranium',
];

// Predefined conviction level options
const CONVICTION_OPTIONS = [
  'High',
  'Medium',
  'Low',
  'Legacy'
];

const CacheManagement: React.FC = () => {
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [cacheData, setCacheData] = useState<CacheData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshingPortfolio, setRefreshingPortfolio] = useState(false);
  const [editingSector, setEditingSector] = useState<string | null>(null);
  const [editSectorValue, setEditSectorValue] = useState<string>('');
  const [editingSubsector, setEditingSubsector] = useState<string | null>(null);
  const [editSubsectorValue, setEditSubsectorValue] = useState<string>('');
  const [editingOtherSectors, setEditingOtherSectors] = useState<string | null>(null);
  const [editOtherSectorsValue, setEditOtherSectorsValue] = useState<string[]>([]);
  const [editingConviction, setEditingConviction] = useState<string | null>(null);
  const [editConvictionValue, setEditConvictionValue] = useState<string>('');

  const { refreshCache } = useCache();

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

  const refreshPortfolioData = async () => {
    if (!window.confirm('This will refresh all portfolio and holdings data with fresh API calls. Continue?')) {
      return;
    }

    try {
      setRefreshingPortfolio(true);
      setError(null);
      
      console.log('🔄 Cache Management: Refreshing portfolio data...');
      await refreshCache(); // This will trigger fresh API calls
      await loadCacheStats(); // Reload cache stats to reflect changes
      
      console.log('✅ Cache Management: Portfolio refresh completed');
    } catch (err) {
      console.error('❌ Cache Management: Portfolio refresh failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to refresh portfolio data');
    } finally {
      setRefreshingPortfolio(false);
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

  const startEditingSector = (symbol: string, currentSector?: string | null) => {
    setEditingSector(symbol);
    setEditSectorValue(currentSector || '');
  };

  const cancelEditingSector = () => {
    setEditingSector(null);
    setEditSectorValue('');
  };

  const saveSector = async (symbol: string) => {
    try {
      const response = await fetch(`/api/portfolio/cache/${symbol}/sector`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sector: editSectorValue || null })
      });

      if (!response.ok) {
        throw new Error('Failed to update sector');
      }

      // Update local cache data
      if (cacheData) {
        setCacheData({
          ...cacheData,
          [symbol]: {
            ...cacheData[symbol],
            sector: editSectorValue || null
          }
        });
      }

      setEditingSector(null);
      setEditSectorValue('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update sector');
    }
  };

  const startEditingSubsector = (symbol: string, currentSubsector?: string[] | string | null) => {
    setEditingSubsector(symbol);
    if (Array.isArray(currentSubsector)) {
      setEditSubsectorValue(currentSubsector[0] || '');
    } else if (typeof currentSubsector === 'string' && currentSubsector) {
      setEditSubsectorValue(currentSubsector);
    } else {
      setEditSubsectorValue('');
    }
  };

  const cancelEditingSubsector = () => {
    setEditingSubsector(null);
    setEditSubsectorValue('');
  };

  const saveSubsector = async (symbol: string) => {
    try {
      const response = await fetch(`/api/portfolio/cache/${symbol}/subsector`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subsector: editSubsectorValue || null })
      });

      if (!response.ok) throw new Error('Failed to update subsector');

      if (cacheData) {
        setCacheData({
          ...cacheData,
          [symbol]: { ...cacheData[symbol], subsector: editSubsectorValue || null }
        });
      }

      setEditingSubsector(null);
      setEditSubsectorValue('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update subsector');
    }
  };

  const startEditingOtherSectors = (symbol: string, current?: string[] | null) => {
    setEditingOtherSectors(symbol);
    setEditOtherSectorsValue(Array.isArray(current) ? current : []);
  };

  const cancelEditingOtherSectors = () => {
    setEditingOtherSectors(null);
    setEditOtherSectorsValue([]);
  };

  const toggleOtherSectorOption = (option: string) => {
    setEditOtherSectorsValue(prev =>
      prev.includes(option) ? prev.filter(s => s !== option) : [...prev, option]
    );
  };

  const saveOtherSectors = async (symbol: string) => {
    try {
      const response = await fetch(`/api/portfolio/cache/${symbol}/other-sectors`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otherSectors: editOtherSectorsValue.length > 0 ? editOtherSectorsValue : null })
      });

      if (!response.ok) throw new Error('Failed to update other sectors');

      if (cacheData) {
        setCacheData({
          ...cacheData,
          [symbol]: { ...cacheData[symbol], otherSectors: editOtherSectorsValue.length > 0 ? editOtherSectorsValue : null }
        });
      }

      setEditingOtherSectors(null);
      setEditOtherSectorsValue([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update other sectors');
    }
  };

  const startEditingConviction = (symbol: string, currentConviction?: string | null) => {
    setEditingConviction(symbol);
    setEditConvictionValue(currentConviction || '');
  };

  const cancelEditingConviction = () => {
    setEditingConviction(null);
    setEditConvictionValue('');
  };

  const saveConviction = async (symbol: string) => {
    try {
      const response = await fetch(`/api/portfolio/cache/${symbol}/conviction`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ conviction: editConvictionValue || null })
      });

      if (!response.ok) {
        throw new Error('Failed to update conviction level');
      }

      // Update local cache data
      if (cacheData) {
        setCacheData({
          ...cacheData,
          [symbol]: {
            ...cacheData[symbol],
            conviction: editConvictionValue || null
          }
        });
      }

      setEditingConviction(null);
      setEditConvictionValue('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update conviction level');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="dashboard-header">
          <div className="dashboard-header-content">
            <h1 className="dashboard-title">Cache Management</h1>
            <p className="dashboard-subtitle">Loading cache statistics...</p>
          </div>
        </div>
        <div className="dashboard-content">
          <div className="max-w-7xl mx-auto">
            <div className="flex justify-center items-center h-64">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mx-auto mb-4"></div>
                <p className="text-gray-600">Loading cache data...</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="dashboard-header">
        <div className="dashboard-header-content">
          <div className="flex items-center justify-between w-full">
            <div>
              <h1 className="dashboard-title">Cache Management</h1>
              <p className="dashboard-subtitle">Manage and monitor your portfolio data cache</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={loadCacheStats}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  backgroundColor: 'white',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f9fafb';
                  e.currentTarget.style.borderColor = '#9ca3af';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'white';
                  e.currentTarget.style.borderColor = '#d1d5db';
                }}
              >
                <RefreshCw style={{ width: '16px', height: '16px' }} />
                <span>Refresh Stats</span>
              </button>
              <button
                onClick={refreshPortfolioData}
                disabled={refreshingPortfolio}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: 'white',
                  backgroundColor: '#3b82f6',
                  border: '1px solid #3b82f6',
                  borderRadius: '8px',
                  cursor: refreshingPortfolio ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  opacity: refreshingPortfolio ? 0.6 : 1
                }}
                onMouseEnter={(e) => {
                  if (!refreshingPortfolio) {
                    e.currentTarget.style.backgroundColor = '#2563eb';
                    e.currentTarget.style.borderColor = '#2563eb';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#3b82f6';
                  e.currentTarget.style.borderColor = '#3b82f6';
                }}
              >
                <RefreshCw style={{ width: '16px', height: '16px' }} className={refreshingPortfolio ? 'animate-spin' : ''} />
                <span>{refreshingPortfolio ? 'Refreshing...' : 'Refresh Cache'}</span>
              </button>
              <button
                onClick={clearCache}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#dc2626',
                  backgroundColor: 'white',
                  border: '1px solid #fecaca',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#fef2f2';
                  e.currentTarget.style.borderColor = '#dc2626';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'white';
                  e.currentTarget.style.borderColor = '#fecaca';
                }}
              >
                <Trash2 style={{ width: '16px', height: '16px' }} />
                <span>Clear All</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="dashboard-content">
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-4 mb-6 shadow-sm">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-4 flex-1">
                <h3 className="text-sm font-semibold text-red-800">Error Loading Cache</h3>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
              <button
                onClick={() => setError(null)}
                className="flex-shrink-0 text-red-400 hover:text-red-600"
              >
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Cache Statistics */}
        {cacheStats && (
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
            border: '1px solid #e5e7eb',
            overflow: 'hidden',
            marginBottom: '24px'
          }}>
            {/* Header */}
            <div style={{
              background: 'linear-gradient(to right, #f8fafc, #f1f5f9)',
              padding: '20px 24px',
              borderBottom: '1px solid #e5e7eb'
            }}>
              <h3 style={{
                fontSize: '20px',
                fontWeight: 'bold',
                color: '#111827'
              }}>Cache Statistics</h3>
              <p style={{
                fontSize: '14px',
                color: '#6b7280',
                marginTop: '4px'
              }}>Overview of cached portfolio data</p>
            </div>

            {/* Stats Grid */}
            <div style={{
              padding: '24px',
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '24px'
            }}>
              {/* Total Entries */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                padding: '16px',
                backgroundColor: '#f9fafb',
                borderRadius: '12px',
                border: '1px solid #e5e7eb'
              }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  background: 'linear-gradient(to bottom right, #3b82f6, #2563eb)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <Database style={{ width: '24px', height: '24px', color: 'white' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: '12px',
                    fontWeight: '500',
                    color: '#6b7280',
                    marginBottom: '4px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>Total Entries</div>
                  <div style={{
                    fontSize: '24px',
                    fontWeight: '700',
                    color: '#111827'
                  }}>{cacheStats.totalEntries}</div>
                  <div style={{
                    fontSize: '11px',
                    color: '#10b981',
                    marginTop: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    <CheckCircle style={{ width: '12px', height: '12px' }} />
                    <span>Active</span>
                  </div>
                </div>
              </div>

              {/* Cached Symbols */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                padding: '16px',
                backgroundColor: '#f9fafb',
                borderRadius: '12px',
                border: '1px solid #e5e7eb'
              }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  background: 'linear-gradient(to bottom right, #8b5cf6, #7c3aed)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <DollarSign style={{ width: '24px', height: '24px', color: 'white' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: '12px',
                    fontWeight: '500',
                    color: '#6b7280',
                    marginBottom: '4px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>Cached Symbols</div>
                  <div style={{
                    fontSize: '24px',
                    fontWeight: '700',
                    color: '#111827'
                  }}>{cacheStats.symbols.length}</div>
                  <div style={{
                    fontSize: '11px',
                    color: '#6b7280',
                    marginTop: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    <TrendingUp style={{ width: '12px', height: '12px' }} />
                    <span>Holdings tracked</span>
                  </div>
                </div>
              </div>

              {/* Cache Location */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                padding: '16px',
                backgroundColor: '#f9fafb',
                borderRadius: '12px',
                border: '1px solid #e5e7eb'
              }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  background: 'linear-gradient(to bottom right, #10b981, #059669)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <FileText style={{ width: '24px', height: '24px', color: 'white' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '12px',
                    fontWeight: '500',
                    color: '#6b7280',
                    marginBottom: '4px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>Cache Location</div>
                  <div style={{
                    fontSize: '13px',
                    fontWeight: '600',
                    color: '#111827',
                    fontFamily: 'monospace',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }} title={cacheStats.cacheFile}>
                    {cacheStats.cacheFile.split('\\').pop()}
                  </div>
                  <div style={{
                    fontSize: '11px',
                    color: '#6b7280',
                    marginTop: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    <Clock style={{ width: '12px', height: '12px' }} />
                    <span>File-based storage</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Cache Entries */}
        {cacheStats && cacheStats.symbols.length > 0 && (
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
            border: '1px solid #e5e7eb',
            overflow: 'hidden'
          }}>
            {/* Table Header */}
            <div style={{
              background: 'linear-gradient(to right, #f8fafc, #f1f5f9)',
              padding: '20px 24px',
              borderBottom: '1px solid #e5e7eb'
            }}>
              <h3 style={{
                fontSize: '20px',
                fontWeight: 'bold',
                color: '#111827'
              }}>Cached Holdings</h3>
              <p style={{
                fontSize: '14px',
                color: '#6b7280',
                marginTop: '4px'
              }}>Current price data stored in cache</p>
            </div>

            <div className="overflow-x-auto">
              <table style={{backgroundColor: 'white', width: '100%', tableLayout: 'fixed'}}>
                <thead>
                  <tr style={{backgroundColor: '#f8fafc', borderBottom: '2px solid #e5e7eb'}}>
                    <th className="text-center py-3 px-6 text-xs font-semibold text-gray-700 uppercase" style={{width: '7%'}}>
                      Symbol
                    </th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-gray-700 uppercase" style={{width: '13%'}}>
                      Company
                    </th>
                    <th className="text-center py-3 px-6 text-xs font-semibold text-gray-700 uppercase" style={{width: '9%'}}>
                      Sector
                    </th>
                    <th className="text-center py-3 px-6 text-xs font-semibold text-gray-700 uppercase" style={{width: '9%'}}>
                      Subsector
                    </th>
                    <th className="text-center py-3 px-6 text-xs font-semibold text-gray-700 uppercase" style={{width: '9%'}}>
                      Other Sectors
                    </th>
                    <th className="text-center py-3 px-6 text-xs font-semibold text-gray-700 uppercase" style={{width: '7%'}}>
                      Conviction
                    </th>
                    <th className="text-center py-3 px-6 text-xs font-semibold text-gray-700 uppercase" style={{width: '9%'}}>
                      USD Price
                    </th>
                    <th className="text-center py-3 px-6 text-xs font-semibold text-gray-700 uppercase" style={{width: '10%'}}>
                      CAD Price
                    </th>
                    <th className="text-center py-3 px-6 text-xs font-semibold text-gray-700 uppercase" style={{width: '7%'}}>
                      FX Rate
                    </th>
                    <th className="text-center py-3 px-6 text-xs font-semibold text-gray-700 uppercase" style={{width: '16%'}}>
                      Last Updated
                    </th>
                    <th className="text-center py-3 px-6 text-xs font-semibold text-gray-700 uppercase" style={{width: '9%'}}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cacheStats.symbols.sort((a, b) => a.localeCompare(b)).map((symbol, index) => {
                    const entry = cacheData?.[symbol];
                    return (
                      <tr
                        key={symbol}
                        style={{
                          backgroundColor: index % 2 === 0 ? '#ffffff' : '#f9fafb',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f9ff'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = index % 2 === 0 ? '#ffffff' : '#f9fafb'}
                      >
                        <td className="py-3 px-6 text-center">
                          <div style={{
                            fontSize: '15px',
                            fontWeight: '600',
                            color: '#111827'
                          }}>
                            {symbol}
                          </div>
                        </td>
                        <td className="py-3 px-6">
                          <div style={{
                            fontSize: '13px',
                            color: '#6b7280',
                            maxWidth: '300px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }} title={entry?.companyName}>
                            {entry?.companyName || '-'}
                          </div>
                        </td>
                        {/* Sector column with edit functionality */}
                        <td className="py-3 px-6 text-center">
                          {editingSector === symbol ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center' }}>
                              <select
                                value={editSectorValue}
                                onChange={(e) => setEditSectorValue(e.target.value)}
                                style={{
                                  fontSize: '12px',
                                  padding: '4px 8px',
                                  border: '1px solid #d1d5db',
                                  borderRadius: '6px',
                                  backgroundColor: 'white',
                                  width: '100%'
                                }}
                              >
                                <option value="">-- Select Sector --</option>
                                {SECTOR_OPTIONS.map(sector => (
                                  <option key={sector} value={sector}>{sector}</option>
                                ))}
                              </select>
                              <div style={{ display: 'flex', gap: '4px', width: '100%' }}>
                                <button
                                  onClick={() => saveSector(symbol)}
                                  style={{
                                    flex: 1,
                                    padding: '4px 8px',
                                    fontSize: '11px',
                                    fontWeight: '500',
                                    color: 'white',
                                    backgroundColor: '#10b981',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Save
                                </button>
                                <button
                                  onClick={cancelEditingSector}
                                  style={{
                                    flex: 1,
                                    padding: '4px 8px',
                                    fontSize: '11px',
                                    fontWeight: '500',
                                    color: '#6b7280',
                                    backgroundColor: '#f3f4f6',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div
                              onClick={() => startEditingSector(symbol, entry?.sector)}
                              style={{
                                cursor: 'pointer',
                                padding: '4px 8px',
                                fontSize: '12px',
                                fontWeight: '500',
                                color: entry?.sector ? '#374151' : '#9ca3af',
                                backgroundColor: entry?.sector ? '#f3f4f6' : '#fafafa',
                                border: '1px solid #e5e7eb',
                                borderRadius: '6px',
                                display: 'inline-block',
                                transition: 'all 0.2s'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = '#e5e7eb';
                                e.currentTarget.style.borderColor = '#d1d5db';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = entry?.sector ? '#f3f4f6' : '#fafafa';
                                e.currentTarget.style.borderColor = '#e5e7eb';
                              }}
                              title="Click to edit sector"
                            >
                              {entry?.sector || 'Not set'}
                            </div>
                          )}
                        </td>
                        {/* Subsector column — single select */}
                        <td className="py-3 px-6 text-center">
                          {editingSubsector === symbol ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center' }}>
                              <div style={{
                                maxHeight: '160px',
                                overflowY: 'auto',
                                border: '1px solid #d1d5db',
                                borderRadius: '6px',
                                backgroundColor: 'white',
                                width: '100%',
                                padding: '4px',
                                textAlign: 'left'
                              }}>
                                <label style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                  padding: '2px 4px',
                                  cursor: 'pointer',
                                  fontSize: '11px',
                                  color: '#9ca3af',
                                  borderRadius: '3px',
                                  backgroundColor: editSubsectorValue === '' ? '#eff6ff' : 'transparent'
                                }}>
                                  <input
                                    type="radio"
                                    name={`subsector-${symbol}`}
                                    checked={editSubsectorValue === ''}
                                    onChange={() => setEditSubsectorValue('')}
                                    style={{ cursor: 'pointer' }}
                                  />
                                  None
                                </label>
                                {SUBSECTOR_OPTIONS.map(option => (
                                  <label key={option} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    padding: '2px 4px',
                                    cursor: 'pointer',
                                    fontSize: '11px',
                                    color: '#374151',
                                    borderRadius: '3px',
                                    backgroundColor: editSubsectorValue === option ? '#eff6ff' : 'transparent'
                                  }}>
                                    <input
                                      type="radio"
                                      name={`subsector-${symbol}`}
                                      checked={editSubsectorValue === option}
                                      onChange={() => setEditSubsectorValue(option)}
                                      style={{ cursor: 'pointer' }}
                                    />
                                    {option}
                                  </label>
                                ))}
                              </div>
                              <div style={{ display: 'flex', gap: '4px', width: '100%' }}>
                                <button
                                  onClick={() => saveSubsector(symbol)}
                                  style={{
                                    flex: 1,
                                    padding: '4px 8px',
                                    fontSize: '11px',
                                    fontWeight: '500',
                                    color: 'white',
                                    backgroundColor: '#10b981',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Save
                                </button>
                                <button
                                  onClick={cancelEditingSubsector}
                                  style={{
                                    flex: 1,
                                    padding: '4px 8px',
                                    fontSize: '11px',
                                    fontWeight: '500',
                                    color: '#6b7280',
                                    backgroundColor: '#f3f4f6',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            (() => {
                              const rawSub = entry?.subsector;
                              const displayText = Array.isArray(rawSub) ? rawSub[0] || null : (rawSub as string | null) || null;
                              return (
                                <div
                                  onClick={() => startEditingSubsector(symbol, entry?.subsector)}
                                  style={{
                                    cursor: 'pointer',
                                    padding: '4px 8px',
                                    fontSize: '11px',
                                    fontWeight: '500',
                                    color: displayText ? '#374151' : '#9ca3af',
                                    backgroundColor: displayText ? '#f3f4f6' : '#fafafa',
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '6px',
                                    display: 'inline-block',
                                    maxWidth: '100%',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    transition: 'all 0.2s'
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = '#e5e7eb';
                                    e.currentTarget.style.borderColor = '#d1d5db';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = displayText ? '#f3f4f6' : '#fafafa';
                                    e.currentTarget.style.borderColor = '#e5e7eb';
                                  }}
                                  title={displayText || 'Click to edit subsector'}
                                >
                                  {displayText || 'Not set'}
                                </div>
                              );
                            })()
                          )}
                        </td>
                        {/* Other Sectors column — multi select */}
                        <td className="py-3 px-6 text-center">
                          {editingOtherSectors === symbol ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center' }}>
                              <div style={{
                                maxHeight: '160px',
                                overflowY: 'auto',
                                border: '1px solid #d1d5db',
                                borderRadius: '6px',
                                backgroundColor: 'white',
                                width: '100%',
                                padding: '4px',
                                textAlign: 'left'
                              }}>
                                {SECTOR_OPTIONS.map(option => (
                                  <label key={option} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    padding: '2px 4px',
                                    cursor: 'pointer',
                                    fontSize: '11px',
                                    color: '#374151',
                                    borderRadius: '3px',
                                    backgroundColor: editOtherSectorsValue.includes(option) ? '#eff6ff' : 'transparent'
                                  }}>
                                    <input
                                      type="checkbox"
                                      checked={editOtherSectorsValue.includes(option)}
                                      onChange={() => toggleOtherSectorOption(option)}
                                      style={{ cursor: 'pointer' }}
                                    />
                                    {option}
                                  </label>
                                ))}
                              </div>
                              <div style={{ display: 'flex', gap: '4px', width: '100%' }}>
                                <button
                                  onClick={() => saveOtherSectors(symbol)}
                                  style={{
                                    flex: 1,
                                    padding: '4px 8px',
                                    fontSize: '11px',
                                    fontWeight: '500',
                                    color: 'white',
                                    backgroundColor: '#10b981',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Save
                                </button>
                                <button
                                  onClick={cancelEditingOtherSectors}
                                  style={{
                                    flex: 1,
                                    padding: '4px 8px',
                                    fontSize: '11px',
                                    fontWeight: '500',
                                    color: '#6b7280',
                                    backgroundColor: '#f3f4f6',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            (() => {
                              const others = entry?.otherSectors;
                              const displayText = Array.isArray(others) && others.length > 0 ? others.join(', ') : null;
                              return (
                                <div
                                  onClick={() => startEditingOtherSectors(symbol, entry?.otherSectors)}
                                  style={{
                                    cursor: 'pointer',
                                    padding: '4px 8px',
                                    fontSize: '11px',
                                    fontWeight: '500',
                                    color: displayText ? '#374151' : '#9ca3af',
                                    backgroundColor: displayText ? '#f3f4f6' : '#fafafa',
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '6px',
                                    display: 'inline-block',
                                    maxWidth: '100%',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    transition: 'all 0.2s'
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = '#e5e7eb';
                                    e.currentTarget.style.borderColor = '#d1d5db';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = displayText ? '#f3f4f6' : '#fafafa';
                                    e.currentTarget.style.borderColor = '#e5e7eb';
                                  }}
                                  title={displayText || 'Click to edit other sectors'}
                                >
                                  {displayText || 'Not set'}
                                </div>
                              );
                            })()
                          )}
                        </td>
                        {/* Conviction column with edit functionality */}
                        <td className="py-3 px-6 text-center">
                          {editingConviction === symbol ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center' }}>
                              <select
                                value={editConvictionValue}
                                onChange={(e) => setEditConvictionValue(e.target.value)}
                                style={{
                                  fontSize: '12px',
                                  padding: '4px 8px',
                                  border: '1px solid #d1d5db',
                                  borderRadius: '6px',
                                  backgroundColor: 'white',
                                  width: '100%'
                                }}
                              >
                                <option value="">-- Select Conviction --</option>
                                {CONVICTION_OPTIONS.map(conviction => (
                                  <option key={conviction} value={conviction}>{conviction}</option>
                                ))}
                              </select>
                              <div style={{ display: 'flex', gap: '4px', width: '100%' }}>
                                <button
                                  onClick={() => saveConviction(symbol)}
                                  style={{
                                    flex: 1,
                                    padding: '4px 8px',
                                    fontSize: '11px',
                                    fontWeight: '500',
                                    color: 'white',
                                    backgroundColor: '#10b981',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Save
                                </button>
                                <button
                                  onClick={cancelEditingConviction}
                                  style={{
                                    flex: 1,
                                    padding: '4px 8px',
                                    fontSize: '11px',
                                    fontWeight: '500',
                                    color: '#6b7280',
                                    backgroundColor: '#f3f4f6',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div
                              onClick={() => startEditingConviction(symbol, entry?.conviction)}
                              style={{
                                cursor: 'pointer',
                                padding: '4px 8px',
                                fontSize: '12px',
                                fontWeight: '500',
                                color: entry?.conviction ? '#374151' : '#9ca3af',
                                backgroundColor: entry?.conviction ? '#f3f4f6' : '#fafafa',
                                border: '1px solid #e5e7eb',
                                borderRadius: '6px',
                                display: 'inline-block',
                                transition: 'all 0.2s'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = '#e5e7eb';
                                e.currentTarget.style.borderColor = '#d1d5db';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = entry?.conviction ? '#f3f4f6' : '#fafafa';
                                e.currentTarget.style.borderColor = '#e5e7eb';
                              }}
                              title="Click to edit conviction level"
                            >
                              {entry?.conviction || 'Not set'}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-6 text-center">
                          <div style={{
                            fontSize: '14px',
                            fontWeight: '600',
                            color: '#111827'
                          }}>
                            {entry?.usdPrice ? `$${entry.usdPrice.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : '-'}
                          </div>
                        </td>
                        <td className="py-3 px-6 text-center">
                          <div style={{
                            fontSize: '14px',
                            fontWeight: '600',
                            color: '#6b7280'
                          }}>
                            {entry?.cadPrice ? `$${entry.cadPrice.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : '-'}
                          </div>
                        </td>
                        <td className="py-3 px-6 text-center">
                          <span style={{
                            fontSize: '13px',
                            fontWeight: '600',
                            padding: '4px 12px',
                            borderRadius: '12px',
                            backgroundColor: '#f3f4f6',
                            color: '#374151',
                            border: '1px solid #d1d5db',
                            display: 'inline-block'
                          }}>
                            {entry?.exchangeRate ? entry.exchangeRate.toFixed(4) : '-'}
                          </span>
                        </td>
                        <td className="py-3 px-6 text-center">
                          <div style={{
                            fontSize: '12px',
                            color: '#6b7280'
                          }}>
                            {entry?.lastUpdated ? formatDate(entry.lastUpdated) : '-'}
                          </div>
                        </td>
                        <td className="py-3 px-6 text-center">
                          <button
                            onClick={() => deleteCacheEntry(symbol)}
                            title={`Delete ${symbol} from cache`}
                            style={{
                              padding: '6px 12px',
                              fontSize: '13px',
                              fontWeight: '500',
                              color: '#dc2626',
                              backgroundColor: 'white',
                              border: '1px solid #fecaca',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#fef2f2';
                              e.currentTarget.style.borderColor = '#dc2626';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'white';
                              e.currentTarget.style.borderColor = '#fecaca';
                            }}
                          >
                            <Trash2 style={{ width: '14px', height: '14px' }} />
                            Delete
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
          <div className="dashboard-section text-center py-16">
            <div className="flex flex-col items-center">
              <div className="h-20 w-20 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                <Database className="h-10 w-10 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Cache Entries</h3>
              <p className="text-sm text-gray-600 mb-6 max-w-md">
                The cache is empty. Holdings data will be fetched fresh from APIs on next portfolio load.
              </p>
              <button
                onClick={refreshPortfolioData}
                className="btn-primary"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Initialize Cache</span>
              </button>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
};

export default CacheManagement; 