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

const SECTOR_OPTIONS = [
  'Alternative Investments', 'Broad Market', 'Commodities', 'Consumer Cyclical',
  'Consumer Defensive', 'Cryptocurrency', 'Energy', 'Financial Services', 'Healthcare',
  'Industrials', 'Materials', 'Real Estate', 'Tech', 'Telecommunications', 'Utilities'
];

const SUBSECTOR_OPTIONS = [
  'AI', 'Aerospace', 'Altcoins', 'Asset Management', 'Banks', 'Battery Materials', 'Biotech',
  'Bitcoin', 'Clean Technology', 'Cloud & SaaS', 'Consumer Electronics', 'Cybersecurity',
  'Data Centers', 'Defense', 'E-Commerce', 'Electric Vehicles', 'Fintech', 'Fixed Income',
  'Gaming', 'Gold', 'Health Insurance', 'Industrial Equipment', 'Insurance', 'Medical Devices',
  'Mining', 'Natural Gas', 'Nuclear Power', 'Oil & Gas', 'Payments', 'Pharmaceuticals',
  'Pipelines', 'Quantum Computing', 'Robotics / Automation', 'Search & Advertising',
  'Semiconductors', 'Silver', 'Social Media', 'Space', 'Streaming / Media', 'Telehealth', 'Uranium',
];

const CONVICTION_OPTIONS = ['High', 'Medium', 'Low', 'Legacy'];

const mono = "'IBM Plex Mono', 'Courier New', monospace";

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

  useEffect(() => { loadCacheStats(); }, []);

  const loadCacheStats = async () => {
    try {
      setLoading(true);
      const statsResponse = await fetch('/api/portfolio/cache/stats');
      if (!statsResponse.ok) throw new Error('Failed to load cache statistics');
      const statsData = await statsResponse.json();
      setCacheStats(statsData.cache);
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
    if (!window.confirm('This will refresh all portfolio and holdings data with fresh API calls. Continue?')) return;
    try {
      setRefreshingPortfolio(true);
      setError(null);
      await refreshCache();
      await loadCacheStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh portfolio data');
    } finally {
      setRefreshingPortfolio(false);
    }
  };

  const clearCache = async () => {
    if (!window.confirm('Are you sure you want to clear all cache entries?')) return;
    try {
      setLoading(true);
      const response = await fetch('/api/portfolio/cache/clear', { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to clear cache');
      await loadCacheStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear cache');
    } finally {
      setLoading(false);
    }
  };

  const deleteCacheEntry = async (symbol: string) => {
    try {
      const response = await fetch(`/api/portfolio/cache/${symbol}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete cache entry');
      await loadCacheStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete cache entry');
    }
  };

  const startEditingSector = (symbol: string, currentSector?: string | null) => {
    setEditingSector(symbol); setEditSectorValue(currentSector || '');
  };
  const cancelEditingSector = () => { setEditingSector(null); setEditSectorValue(''); };
  const saveSector = async (symbol: string) => {
    try {
      const response = await fetch(`/api/portfolio/cache/${symbol}/sector`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sector: editSectorValue || null })
      });
      if (!response.ok) throw new Error('Failed to update sector');
      if (cacheData) setCacheData({ ...cacheData, [symbol]: { ...cacheData[symbol], sector: editSectorValue || null } });
      setEditingSector(null); setEditSectorValue('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to update sector'); }
  };

  const startEditingSubsector = (symbol: string, currentSubsector?: string[] | string | null) => {
    setEditingSubsector(symbol);
    if (Array.isArray(currentSubsector)) setEditSubsectorValue(currentSubsector[0] || '');
    else if (typeof currentSubsector === 'string' && currentSubsector) setEditSubsectorValue(currentSubsector);
    else setEditSubsectorValue('');
  };
  const cancelEditingSubsector = () => { setEditingSubsector(null); setEditSubsectorValue(''); };
  const saveSubsector = async (symbol: string) => {
    try {
      const response = await fetch(`/api/portfolio/cache/${symbol}/subsector`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subsector: editSubsectorValue || null })
      });
      if (!response.ok) throw new Error('Failed to update subsector');
      if (cacheData) setCacheData({ ...cacheData, [symbol]: { ...cacheData[symbol], subsector: editSubsectorValue || null } });
      setEditingSubsector(null); setEditSubsectorValue('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to update subsector'); }
  };

  const startEditingOtherSectors = (symbol: string, current?: string[] | null) => {
    setEditingOtherSectors(symbol); setEditOtherSectorsValue(Array.isArray(current) ? current : []);
  };
  const cancelEditingOtherSectors = () => { setEditingOtherSectors(null); setEditOtherSectorsValue([]); };
  const toggleOtherSectorOption = (option: string) => {
    setEditOtherSectorsValue(prev => prev.includes(option) ? prev.filter(s => s !== option) : [...prev, option]);
  };
  const saveOtherSectors = async (symbol: string) => {
    try {
      const response = await fetch(`/api/portfolio/cache/${symbol}/other-sectors`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otherSectors: editOtherSectorsValue.length > 0 ? editOtherSectorsValue : null })
      });
      if (!response.ok) throw new Error('Failed to update other sectors');
      if (cacheData) setCacheData({ ...cacheData, [symbol]: { ...cacheData[symbol], otherSectors: editOtherSectorsValue.length > 0 ? editOtherSectorsValue : null } });
      setEditingOtherSectors(null); setEditOtherSectorsValue([]);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to update other sectors'); }
  };

  const startEditingConviction = (symbol: string, currentConviction?: string | null) => {
    setEditingConviction(symbol); setEditConvictionValue(currentConviction || '');
  };
  const cancelEditingConviction = () => { setEditingConviction(null); setEditConvictionValue(''); };
  const saveConviction = async (symbol: string) => {
    try {
      const response = await fetch(`/api/portfolio/cache/${symbol}/conviction`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conviction: editConvictionValue || null })
      });
      if (!response.ok) throw new Error('Failed to update conviction level');
      if (cacheData) setCacheData({ ...cacheData, [symbol]: { ...cacheData[symbol], conviction: editConvictionValue || null } });
      setEditingConviction(null); setEditConvictionValue('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to update conviction level'); }
  };

  const formatDate = (dateString: string) => new Date(dateString).toLocaleString();

  const btnSecondary: React.CSSProperties = {
    padding: '7px 14px', fontSize: '12px', fontWeight: 500, fontFamily: mono,
    color: '#94a3b8', backgroundColor: '#141820', border: '1px solid #1e2535',
    borderRadius: '4px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px',
    transition: 'all 0.15s',
  };
  const btnPrimary: React.CSSProperties = {
    ...btnSecondary, color: '#00d4aa', border: '1px solid rgba(0,212,170,0.3)', backgroundColor: 'rgba(0,212,170,0.08)',
  };
  const btnDanger: React.CSSProperties = {
    ...btnSecondary, color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.07)',
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: mono, fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>Loading cache data…</div>
          <RefreshCw style={{ width: '20px', height: '20px', color: '#00d4aa', animation: 'spin 1s linear infinite' }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', minHeight: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <div style={{ fontFamily: mono, fontSize: '18px', fontWeight: 700, color: '#e2e8f0', letterSpacing: '0.04em' }}>Cache Management</div>
          <div style={{ fontFamily: mono, fontSize: '11px', color: '#4a5568', marginTop: '4px' }}>Manage and monitor your portfolio data cache</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button style={btnSecondary} onClick={loadCacheStats}
            onMouseEnter={e => { e.currentTarget.style.color = '#e2e8f0'; e.currentTarget.style.borderColor = '#2a3445'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = '#1e2535'; }}>
            <RefreshCw style={{ width: '13px', height: '13px' }} /> Refresh Stats
          </button>
          <button style={{ ...btnPrimary, opacity: refreshingPortfolio ? 0.6 : 1, cursor: refreshingPortfolio ? 'not-allowed' : 'pointer' }}
            onClick={refreshPortfolioData} disabled={refreshingPortfolio}
            onMouseEnter={e => { if (!refreshingPortfolio) { e.currentTarget.style.backgroundColor = 'rgba(0,212,170,0.14)'; } }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(0,212,170,0.08)'; }}>
            <RefreshCw style={{ width: '13px', height: '13px' }} className={refreshingPortfolio ? 'animate-spin' : ''} />
            {refreshingPortfolio ? 'Refreshing…' : 'Refresh Cache'}
          </button>
          <button style={btnDanger} onClick={clearCache}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.12)'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.07)'; }}>
            <Trash2 style={{ width: '13px', height: '13px' }} /> Clear All
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '6px', padding: '12px 16px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontFamily: mono, fontSize: '12px', color: '#f87171', flex: 1 }}>{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', padding: '2px' }}>✕</button>
        </div>
      )}

      {/* Stats cards */}
      {cacheStats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
          {[
            { icon: Database, label: 'Total Entries', value: cacheStats.totalEntries, sub: 'Active', subColor: '#00d4aa', iconBg: 'rgba(0,212,170,0.15)', iconColor: '#00d4aa' },
            { icon: DollarSign, label: 'Cached Symbols', value: cacheStats.symbols.length, sub: 'Holdings tracked', subColor: '#64748b', iconBg: 'rgba(139,92,246,0.15)', iconColor: '#a78bfa' },
            { icon: FileText, label: 'Cache File', value: cacheStats.cacheFile.split('\\').pop() ?? '—', sub: 'File-based storage', subColor: '#64748b', iconBg: 'rgba(34,197,94,0.12)', iconColor: '#4ade80', isPath: true },
          ].map(({ icon: Icon, label, value, sub, subColor, iconBg, iconColor, isPath }) => (
            <div key={label} style={{ background: '#10141c', border: '1px solid #1e2535', borderRadius: '8px', padding: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon style={{ width: '20px', height: '20px', color: iconColor }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: mono, fontSize: '10px', fontWeight: 700, color: '#4a5568', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '4px' }}>{label}</div>
                <div style={{ fontFamily: mono, fontSize: isPath ? '12px' : '22px', fontWeight: 700, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={isPath ? cacheStats.cacheFile : undefined}>{value}</div>
                <div style={{ fontFamily: mono, fontSize: '10px', color: subColor, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {label === 'Total Entries' && <CheckCircle style={{ width: '10px', height: '10px' }} />}
                  {label === 'Cached Symbols' && <TrendingUp style={{ width: '10px', height: '10px' }} />}
                  {label === 'Cache File' && <Clock style={{ width: '10px', height: '10px' }} />}
                  {sub}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      {cacheStats && cacheStats.symbols.length > 0 && (
        <div style={{ background: '#10141c', border: '1px solid #1e2535', borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e2535' }}>
            <div style={{ fontFamily: mono, fontSize: '14px', fontWeight: 700, color: '#e2e8f0' }}>Cached Holdings</div>
            <div style={{ fontFamily: mono, fontSize: '11px', color: '#4a5568', marginTop: '2px' }}>Current price data stored in cache</div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e2535' }}>
                  {['Symbol', 'Company', 'Sector', 'Subsector', 'Other Sectors', 'Conviction', 'USD Price', 'CAD Price', 'FX Rate', 'Last Updated', 'Actions'].map((h, i) => (
                    <th key={h} style={{ padding: '10px 12px', fontFamily: mono, fontSize: '10px', fontWeight: 700, color: '#4a5568', letterSpacing: '0.12em', textTransform: 'uppercase', textAlign: i === 1 ? 'left' : 'center', background: '#0d111a', width: [7,13,9,9,9,7,9,10,7,16,9][i]+'%' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cacheStats.symbols.sort((a, b) => a.localeCompare(b)).map((symbol, index) => {
                  const entry = cacheData?.[symbol];
                  return (
                    <tr key={symbol}
                      style={{ backgroundColor: index % 2 === 0 ? '#10141c' : '#0d111a', borderBottom: '1px solid #1e2535', transition: 'background 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(0,212,170,0.04)')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = index % 2 === 0 ? '#10141c' : '#0d111a')}
                    >
                      {/* Symbol */}
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <span style={{ fontFamily: mono, fontSize: '13px', fontWeight: 700, color: '#e2e8f0' }}>{symbol}</span>
                      </td>
                      {/* Company */}
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ fontFamily: mono, fontSize: '11px', color: '#64748b', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={entry?.companyName}>{entry?.companyName || '—'}</span>
                      </td>
                      {/* Sector */}
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        {editingSector === symbol ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            <select value={editSectorValue} onChange={e => setEditSectorValue(e.target.value)} style={{ fontFamily: mono, fontSize: '11px', padding: '3px 6px', background: '#141820', border: '1px solid #1e2535', borderRadius: '4px', color: '#e2e8f0', width: '100%' }}>
                              <option value="">— Select —</option>
                              {SECTOR_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button onClick={() => saveSector(symbol)} style={{ flex: 1, padding: '3px 6px', fontFamily: mono, fontSize: '10px', color: '#00d4aa', background: 'rgba(0,212,170,0.1)', border: '1px solid rgba(0,212,170,0.3)', borderRadius: '3px', cursor: 'pointer' }}>Save</button>
                              <button onClick={cancelEditingSector} style={{ flex: 1, padding: '3px 6px', fontFamily: mono, fontSize: '10px', color: '#64748b', background: '#141820', border: '1px solid #1e2535', borderRadius: '3px', cursor: 'pointer' }}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <span onClick={() => startEditingSector(symbol, entry?.sector)} style={{ fontFamily: mono, fontSize: '11px', padding: '3px 8px', background: entry?.sector ? 'rgba(0,212,170,0.08)' : '#141820', border: `1px solid ${entry?.sector ? 'rgba(0,212,170,0.2)' : '#1e2535'}`, borderRadius: '4px', color: entry?.sector ? '#94a3b8' : '#4a5568', cursor: 'pointer', display: 'inline-block' }} title="Click to edit">{entry?.sector || 'Not set'}</span>
                        )}
                      </td>
                      {/* Subsector */}
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        {editingSubsector === symbol ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            <div style={{ maxHeight: '140px', overflowY: 'auto', background: '#141820', border: '1px solid #1e2535', borderRadius: '4px', padding: '4px', textAlign: 'left' }}>
                              {['', ...SUBSECTOR_OPTIONS].map(opt => (
                                <label key={opt || '__none'} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '2px 4px', cursor: 'pointer', fontFamily: mono, fontSize: '10px', color: opt ? '#94a3b8' : '#4a5568', borderRadius: '2px', background: editSubsectorValue === opt ? 'rgba(0,212,170,0.08)' : 'transparent' }}>
                                  <input type="radio" name={`sub-${symbol}`} checked={editSubsectorValue === opt} onChange={() => setEditSubsectorValue(opt)} style={{ cursor: 'pointer' }} />
                                  {opt || 'None'}
                                </label>
                              ))}
                            </div>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button onClick={() => saveSubsector(symbol)} style={{ flex: 1, padding: '3px 6px', fontFamily: mono, fontSize: '10px', color: '#00d4aa', background: 'rgba(0,212,170,0.1)', border: '1px solid rgba(0,212,170,0.3)', borderRadius: '3px', cursor: 'pointer' }}>Save</button>
                              <button onClick={cancelEditingSubsector} style={{ flex: 1, padding: '3px 6px', fontFamily: mono, fontSize: '10px', color: '#64748b', background: '#141820', border: '1px solid #1e2535', borderRadius: '3px', cursor: 'pointer' }}>Cancel</button>
                            </div>
                          </div>
                        ) : (() => {
                          const rawSub = entry?.subsector;
                          const display = Array.isArray(rawSub) ? rawSub[0] || null : (rawSub as string | null) || null;
                          return <span onClick={() => startEditingSubsector(symbol, entry?.subsector)} style={{ fontFamily: mono, fontSize: '11px', padding: '3px 8px', background: display ? 'rgba(0,212,170,0.08)' : '#141820', border: `1px solid ${display ? 'rgba(0,212,170,0.2)' : '#1e2535'}`, borderRadius: '4px', color: display ? '#94a3b8' : '#4a5568', cursor: 'pointer', display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }} title={display || 'Click to edit'}>{display || 'Not set'}</span>;
                        })()}
                      </td>
                      {/* Other Sectors */}
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        {editingOtherSectors === symbol ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            <div style={{ maxHeight: '140px', overflowY: 'auto', background: '#141820', border: '1px solid #1e2535', borderRadius: '4px', padding: '4px', textAlign: 'left' }}>
                              {SECTOR_OPTIONS.map(opt => (
                                <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '2px 4px', cursor: 'pointer', fontFamily: mono, fontSize: '10px', color: '#94a3b8', borderRadius: '2px', background: editOtherSectorsValue.includes(opt) ? 'rgba(0,212,170,0.08)' : 'transparent' }}>
                                  <input type="checkbox" checked={editOtherSectorsValue.includes(opt)} onChange={() => toggleOtherSectorOption(opt)} style={{ cursor: 'pointer' }} />
                                  {opt}
                                </label>
                              ))}
                            </div>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button onClick={() => saveOtherSectors(symbol)} style={{ flex: 1, padding: '3px 6px', fontFamily: mono, fontSize: '10px', color: '#00d4aa', background: 'rgba(0,212,170,0.1)', border: '1px solid rgba(0,212,170,0.3)', borderRadius: '3px', cursor: 'pointer' }}>Save</button>
                              <button onClick={cancelEditingOtherSectors} style={{ flex: 1, padding: '3px 6px', fontFamily: mono, fontSize: '10px', color: '#64748b', background: '#141820', border: '1px solid #1e2535', borderRadius: '3px', cursor: 'pointer' }}>Cancel</button>
                            </div>
                          </div>
                        ) : (() => {
                          const others = entry?.otherSectors;
                          const display = Array.isArray(others) && others.length > 0 ? others.join(', ') : null;
                          return <span onClick={() => startEditingOtherSectors(symbol, entry?.otherSectors)} style={{ fontFamily: mono, fontSize: '11px', padding: '3px 8px', background: display ? 'rgba(0,212,170,0.08)' : '#141820', border: `1px solid ${display ? 'rgba(0,212,170,0.2)' : '#1e2535'}`, borderRadius: '4px', color: display ? '#94a3b8' : '#4a5568', cursor: 'pointer', display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }} title={display || 'Click to edit'}>{display || 'Not set'}</span>;
                        })()}
                      </td>
                      {/* Conviction */}
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        {editingConviction === symbol ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            <select value={editConvictionValue} onChange={e => setEditConvictionValue(e.target.value)} style={{ fontFamily: mono, fontSize: '11px', padding: '3px 6px', background: '#141820', border: '1px solid #1e2535', borderRadius: '4px', color: '#e2e8f0', width: '100%' }}>
                              <option value="">— Select —</option>
                              {CONVICTION_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button onClick={() => saveConviction(symbol)} style={{ flex: 1, padding: '3px 6px', fontFamily: mono, fontSize: '10px', color: '#00d4aa', background: 'rgba(0,212,170,0.1)', border: '1px solid rgba(0,212,170,0.3)', borderRadius: '3px', cursor: 'pointer' }}>Save</button>
                              <button onClick={cancelEditingConviction} style={{ flex: 1, padding: '3px 6px', fontFamily: mono, fontSize: '10px', color: '#64748b', background: '#141820', border: '1px solid #1e2535', borderRadius: '3px', cursor: 'pointer' }}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <span onClick={() => startEditingConviction(symbol, entry?.conviction)} style={{ fontFamily: mono, fontSize: '11px', padding: '3px 8px', background: entry?.conviction ? 'rgba(0,212,170,0.08)' : '#141820', border: `1px solid ${entry?.conviction ? 'rgba(0,212,170,0.2)' : '#1e2535'}`, borderRadius: '4px', color: entry?.conviction ? '#94a3b8' : '#4a5568', cursor: 'pointer', display: 'inline-block' }} title="Click to edit">{entry?.conviction || 'Not set'}</span>
                        )}
                      </td>
                      {/* USD Price */}
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <span style={{ fontFamily: mono, fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>
                          {entry?.usdPrice ? `$${entry.usdPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                        </span>
                      </td>
                      {/* CAD Price */}
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <span style={{ fontFamily: mono, fontSize: '13px', fontWeight: 600, color: '#00d4aa' }}>
                          {entry?.cadPrice ? `$${entry.cadPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                        </span>
                      </td>
                      {/* FX Rate */}
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <span style={{ fontFamily: mono, fontSize: '11px', padding: '3px 8px', borderRadius: '4px', background: '#141820', border: '1px solid #1e2535', color: '#64748b', display: 'inline-block' }}>
                          {entry?.exchangeRate ? entry.exchangeRate.toFixed(4) : '—'}
                        </span>
                      </td>
                      {/* Last Updated */}
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <span style={{ fontFamily: mono, fontSize: '10px', color: '#4a5568' }}>
                          {entry?.lastUpdated ? formatDate(entry.lastUpdated) : '—'}
                        </span>
                      </td>
                      {/* Delete */}
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <button onClick={() => deleteCacheEntry(symbol)} title={`Delete ${symbol}`} style={{ padding: '5px 10px', fontFamily: mono, fontSize: '11px', color: '#f87171', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '4px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px', transition: 'all 0.15s' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.13)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.07)'; }}>
                          <Trash2 style={{ width: '12px', height: '12px' }} /> Del
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
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <Database style={{ width: '40px', height: '40px', color: '#2a3445', margin: '0 auto 12px' }} />
          <div style={{ fontFamily: mono, fontSize: '14px', color: '#4a5568', marginBottom: '8px' }}>No Cache Entries</div>
          <div style={{ fontFamily: mono, fontSize: '11px', color: '#2a3445', marginBottom: '20px' }}>Holdings data will be fetched fresh from APIs on next portfolio load.</div>
          <button style={btnPrimary} onClick={refreshPortfolioData}>
            <RefreshCw style={{ width: '13px', height: '13px' }} /> Initialize Cache
          </button>
        </div>
      )}
    </div>
  );
};

export default CacheManagement;
