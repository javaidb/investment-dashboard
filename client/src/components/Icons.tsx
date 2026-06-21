import React, { useState, useEffect, useRef } from 'react';
import { Upload, RefreshCw, AlertCircle, CheckCircle, X } from 'lucide-react';

interface IconMapping {
  symbol: string;
  type: 's' | 'c';
  filename: string;
  id: number;
  url: string;
  contentType?: string;
}

interface IconsCache {
  [key: string]: IconMapping;
}

interface AvailableIcon {
  filename: string;
  url: string;
}

const mono = "'IBM Plex Mono', 'Courier New', monospace";

const Icons: React.FC = () => {
  const [iconsCache, setIconsCache] = useState<IconsCache>({});
  const [availableIcons, setAvailableIcons] = useState<AvailableIcon[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState<string | null>(null);
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadIconsData(); }, []);

  useEffect(() => {
    if (!pickerOpen) return;
    const close = () => setPickerOpen(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [pickerOpen]);

  const loadIconsData = async () => {
    try {
      setLoading(true);
      setError(null);
      const cacheResponse = await fetch('/api/icons/cache');
      if (!cacheResponse.ok) throw new Error('Failed to load icons cache');
      const cacheData = await cacheResponse.json();
      setIconsCache(cacheData.cache || {});
      const iconsResponse = await fetch('/api/icons/available');
      if (iconsResponse.ok) {
        const iconsData = await iconsResponse.json();
        setAvailableIcons(iconsData.icons || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load icons data');
    } finally {
      setLoading(false);
    }
  };

  const handleIconChange = async (symbolKey: string, newFilename: string) => {
    try {
      setSaving(symbolKey);
      setError(null);
      const response = await fetch('/api/icons/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbolKey, filename: newFilename }),
      });
      if (!response.ok) throw new Error('Failed to update icon mapping');
      await loadIconsData();
      setSuccess(`Updated icon for ${iconsCache[symbolKey]?.symbol}`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update icon');
    } finally {
      setSaving(null);
    }
  };

  const handleFileUpload = async (symbolKey: string, file: File) => {
    try {
      setUploadingFor(symbolKey);
      setError(null);
      const formData = new FormData();
      formData.append('icon', file);
      formData.append('symbolKey', symbolKey);
      const response = await fetch('/api/icons/upload', { method: 'POST', body: formData });
      if (!response.ok) throw new Error('Failed to upload icon');
      await loadIconsData();
      setSuccess(`Uploaded new icon for ${iconsCache[symbolKey]?.symbol}`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload icon');
    } finally {
      setUploadingFor(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const triggerFileUpload = (symbolKey: string) => {
    if (fileInputRef.current) {
      fileInputRef.current.dataset.symbolKey = symbolKey;
      fileInputRef.current.click();
    }
  };

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const symbolKey = event.target.dataset.symbolKey;
    if (file && symbolKey) {
      if (!file.type.startsWith('image/')) { setError('Please select a valid image file'); return; }
      if (file.size > 5 * 1024 * 1024) { setError('File size must be less than 5MB'); return; }
      handleFileUpload(symbolKey, file);
    }
  };

  const getTypeLabel = (type: 's' | 'c') => type === 's' ? 'Stock' : 'Crypto';

  const btnSecondary: React.CSSProperties = {
    padding: '7px 14px', fontSize: '12px', fontWeight: 500, fontFamily: mono,
    color: '#94a3b8', backgroundColor: '#141820', border: '1px solid #1e2535',
    borderRadius: '4px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px',
    transition: 'all 0.15s',
  };
  const btnPrimary: React.CSSProperties = {
    ...btnSecondary, color: '#00d4aa', border: '1px solid rgba(0,212,170,0.3)', backgroundColor: 'rgba(0,212,170,0.08)',
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: mono, fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>Loading icons…</div>
          <RefreshCw style={{ width: '20px', height: '20px', color: '#00d4aa' }} className="animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', minHeight: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <div style={{ fontFamily: mono, fontSize: '18px', fontWeight: 700, color: '#e2e8f0', letterSpacing: '0.04em' }}>Icon Management</div>
          <div style={{ fontFamily: mono, fontSize: '11px', color: '#4a5568', marginTop: '4px' }}>Manage symbol icons across your portfolio</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontFamily: mono, fontSize: '11px', color: '#4a5568', padding: '6px 12px', background: '#141820', border: '1px solid #1e2535', borderRadius: '4px' }}>
            {Object.keys(iconsCache).length} symbols
          </span>
          <button style={btnSecondary} onClick={loadIconsData} disabled={loading}
            onMouseEnter={e => { e.currentTarget.style.color = '#e2e8f0'; e.currentTarget.style.borderColor = '#2a3445'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = '#1e2535'; }}>
            <RefreshCw style={{ width: '13px', height: '13px' }} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button style={btnPrimary} onClick={() => fileInputRef.current?.click()} disabled={uploadingFor !== null}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(0,212,170,0.14)'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(0,212,170,0.08)'; }}>
            <Upload style={{ width: '13px', height: '13px' }} />
            {uploadingFor ? 'Uploading…' : 'Upload New Icon'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '6px', padding: '12px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <AlertCircle style={{ width: '14px', height: '14px', color: '#f87171', flexShrink: 0 }} />
          <span style={{ fontFamily: mono, fontSize: '12px', color: '#f87171', flex: 1 }}>{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', padding: '2px' }}><X style={{ width: '13px', height: '13px' }} /></button>
        </div>
      )}

      {/* Success */}
      {success && (
        <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: '6px', padding: '12px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <CheckCircle style={{ width: '14px', height: '14px', color: '#4ade80', flexShrink: 0 }} />
          <span style={{ fontFamily: mono, fontSize: '12px', color: '#4ade80' }}>{success}</span>
        </div>
      )}

      {/* Table */}
      {Object.keys(iconsCache).length > 0 && (
        <div style={{ background: '#10141c', border: '1px solid #1e2535', borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e2535' }}>
            <div style={{ fontFamily: mono, fontSize: '14px', fontWeight: 700, color: '#e2e8f0' }}>Symbol Icons</div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e2535' }}>
                  {[['Icon', '8%'], ['Symbol', '10%'], ['Type', '10%'], ['Current File', '22%'], ['Change Icon', '38%'], ['Actions', '12%']].map(([h, w]) => (
                    <th key={h} style={{ padding: '10px 12px', fontFamily: mono, fontSize: '10px', fontWeight: 700, color: '#4a5568', letterSpacing: '0.12em', textTransform: 'uppercase', textAlign: 'center', background: '#0d111a', width: w }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(iconsCache)
                  .sort(([, a], [, b]) => a.symbol.localeCompare(b.symbol))
                  .map(([key, icon], index) => (
                  <tr key={key}
                    style={{ backgroundColor: index % 2 === 0 ? '#10141c' : '#0d111a', borderBottom: '1px solid #1e2535', transition: 'background 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(0,212,170,0.04)')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = index % 2 === 0 ? '#10141c' : '#0d111a')}
                  >
                    {/* Icon preview */}
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ width: '36px', height: '36px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#141820', borderRadius: '6px', border: '1px solid #1e2535' }}>
                        <img src={`${icon.url}?t=${Date.now()}`} alt={`${icon.symbol} icon`} style={{ width: '28px', height: '28px', objectFit: 'contain' }}
                          onError={e => { (e.target as HTMLImageElement).src = '/api/icons/image/template.png'; }} />
                      </div>
                    </td>
                    {/* Symbol */}
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <span style={{ fontFamily: mono, fontSize: '13px', fontWeight: 700, color: '#e2e8f0' }}>{icon.symbol}</span>
                    </td>
                    {/* Type */}
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <span style={{ fontFamily: mono, fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '4px', display: 'inline-block', background: icon.type === 'c' ? 'rgba(139,92,246,0.12)' : 'rgba(79,143,255,0.12)', color: icon.type === 'c' ? '#a78bfa' : '#60a5fa', border: `1px solid ${icon.type === 'c' ? 'rgba(139,92,246,0.3)' : 'rgba(79,143,255,0.3)'}` }}>
                        {getTypeLabel(icon.type)}
                      </span>
                    </td>
                    {/* Filename */}
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <span style={{ fontFamily: mono, fontSize: '11px', color: '#64748b', background: '#141820', padding: '3px 8px', borderRadius: '4px', display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {icon.filename}
                      </span>
                    </td>
                    {/* Icon picker */}
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ position: 'relative' }}>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            if (pickerOpen === key) { setPickerOpen(null); return; }
                            const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                            const pw = 320, ph = 300;
                            let left = rect.left, top = rect.bottom + 6;
                            if (left + pw > window.innerWidth - 10) left = window.innerWidth - pw - 10;
                            if (top + ph > window.innerHeight - 10) top = rect.top - ph - 6;
                            setPickerPos({ top, left });
                            setPickerOpen(key);
                          }}
                          disabled={saving === key}
                          style={{ padding: '5px 12px', fontFamily: mono, fontSize: '11px', color: '#94a3b8', background: '#141820', border: '1px solid #1e2535', borderRadius: '4px', cursor: saving === key ? 'not-allowed' : 'pointer', opacity: saving === key ? 0.5 : 1 }}
                        >
                          {saving === key ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                              <RefreshCw style={{ width: '11px', height: '11px' }} className="animate-spin" /> Saving…
                            </span>
                          ) : 'Change Icon'}
                        </button>
                        {pickerOpen === key && (
                          <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', top: pickerPos.top, left: pickerPos.left, zIndex: 1000, background: '#10141c', border: '1px solid #1e2535', borderRadius: '8px', boxShadow: '0 12px 32px rgba(0,0,0,0.5)', padding: '10px', width: '320px', maxHeight: '300px', overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '6px' }}>
                            {availableIcons.map(ai => (
                              <button key={ai.filename} title={ai.filename} onClick={() => { handleIconChange(key, ai.filename); setPickerOpen(null); }}
                                style={{ padding: '4px', border: ai.filename === icon.filename ? '2px solid #00d4aa' : '1px solid #1e2535', borderRadius: '6px', background: ai.filename === icon.filename ? 'rgba(0,212,170,0.12)' : '#141820', cursor: 'pointer' }}>
                                <img src={ai.url} alt={ai.filename} style={{ width: '32px', height: '32px', objectFit: 'contain', display: 'block' }}
                                  onError={e => { (e.target as HTMLImageElement).src = '/api/icons/image/template.png'; }} />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    {/* Upload */}
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <button onClick={() => triggerFileUpload(key)} disabled={uploadingFor === key}
                        style={{ padding: '5px 10px', fontFamily: mono, fontSize: '11px', color: '#94a3b8', background: '#141820', border: '1px solid #1e2535', borderRadius: '4px', cursor: uploadingFor === key ? 'not-allowed' : 'pointer', opacity: uploadingFor === key ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', gap: '5px', transition: 'all 0.15s' }}
                        onMouseEnter={e => { if (uploadingFor !== key) { e.currentTarget.style.color = '#e2e8f0'; e.currentTarget.style.borderColor = '#2a3445'; } }}
                        onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = '#1e2535'; }}>
                        <Upload style={{ width: '12px', height: '12px' }} />
                        {uploadingFor === key ? 'Uploading…' : 'Upload'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {Object.keys(iconsCache).length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: '#10141c', border: '1px solid #1e2535', borderRadius: '8px' }}>
          <Upload style={{ width: '40px', height: '40px', color: '#2a3445', margin: '0 auto 12px' }} />
          <div style={{ fontFamily: mono, fontSize: '14px', color: '#4a5568', marginBottom: '6px' }}>No icons found</div>
          <div style={{ fontFamily: mono, fontSize: '11px', color: '#2a3445' }}>Icons will appear here once you start using the investment dashboard.</div>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileInputChange} className="hidden" />
    </div>
  );
};

export default Icons;
