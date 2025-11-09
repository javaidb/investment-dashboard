import React, { useState, useEffect, useRef } from 'react';
import { Upload, Save, RefreshCw, AlertCircle, CheckCircle, X } from 'lucide-react';

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

const Icons: React.FC = () => {
  const [iconsCache, setIconsCache] = useState<IconsCache>({});
  const [availableIcons, setAvailableIcons] = useState<AvailableIcon[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadIconsData();
  }, []);

  const loadIconsData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Load icons cache directly from the cache file via a new endpoint
      const cacheResponse = await fetch('/api/icons/cache');
      if (!cacheResponse.ok) {
        throw new Error('Failed to load icons cache');
      }
      const cacheData = await cacheResponse.json();
      
      // The cache data should already be in the correct format
      setIconsCache(cacheData.cache || {});

      // Load available icons
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
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symbolKey,
          filename: newFilename,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update icon mapping');
      }

      // Refresh the data
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

      const response = await fetch('/api/icons/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to upload icon');
      }

      // Refresh the data
      await loadIconsData();
      setSuccess(`Uploaded new icon for ${iconsCache[symbolKey]?.symbol}`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload icon');
    } finally {
      setUploadingFor(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('Please select a valid image file');
        return;
      }
      
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError('File size must be less than 5MB');
        return;
      }

      handleFileUpload(symbolKey, file);
    }
  };

  const getTypeLabel = (type: 's' | 'c') => {
    return type === 's' ? 'Stock' : 'Crypto';
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mr-3" />
          <span className="text-lg text-gray-600">Loading icons...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="dashboard-header">
        <div className="dashboard-header-content">
          <h1 className="dashboard-title">Icon Management</h1>
          <p className="dashboard-subtitle">Manage symbol icons across your portfolio</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="dashboard-content">
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          {/* Status Messages */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center">
              <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
              <span className="text-red-700">{error}</span>
              <button
                onClick={() => setError(null)}
                className="ml-auto text-red-500 hover:text-red-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {success && (
            <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4 flex items-center">
              <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
              <span className="text-green-700">{success}</span>
            </div>
          )}

          {/* Actions Bar */}
          <div className="mb-6 flex gap-3 items-center justify-between">
            <div className="flex gap-3">
              <button
                onClick={loadIconsData}
                disabled={loading}
                className="flex items-center px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFor !== null}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <Upload className="w-4 h-4 mr-2" />
                {uploadingFor ? 'Uploading...' : 'Upload New Icon'}
              </button>
            </div>
            <div className="text-sm text-gray-600 bg-white px-4 py-2 rounded-lg border border-gray-200">
              {Object.keys(iconsCache).length} symbols
            </div>
          </div>

          {/* Icons Table */}
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
              }}>Symbol Icons</h3>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full" style={{backgroundColor: 'white'}}>
                <thead>
                  <tr style={{backgroundColor: '#f8fafc', borderBottom: '2px solid #e5e7eb'}}>
                    <th className="text-center py-3 px-4 text-xs font-semibold text-gray-700 uppercase" style={{width: '80px'}}>
                      Icon
                    </th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-gray-700 uppercase">
                      Symbol
                    </th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-gray-700 uppercase" style={{width: '120px'}}>
                      Type
                    </th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-gray-700 uppercase">
                      Current Filename
                    </th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-gray-700 uppercase" style={{width: '300px'}}>
                      Change Icon
                    </th>
                    <th className="text-center py-3 px-6 text-xs font-semibold text-gray-700 uppercase" style={{width: '140px'}}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {Object.entries(iconsCache)
                    .sort(([, a], [, b]) => a.symbol.localeCompare(b.symbol))
                    .map(([key, icon], index) => (
                    <tr
                      key={key}
                      style={{
                        backgroundColor: index % 2 === 0 ? '#ffffff' : '#f9fafb',
                        transition: 'background-color 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f9ff'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = index % 2 === 0 ? '#ffffff' : '#f9fafb'}
                    >
                      {/* Icon Preview */}
                      <td className="py-3 px-4 text-center">
                        <div style={{
                          width: '40px',
                          height: '40px',
                          margin: '0 auto',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: '#f9fafb',
                          borderRadius: '8px',
                          border: '1px solid #e5e7eb'
                        }}>
                          <img
                            src={`${icon.url}?t=${Date.now()}`}
                            alt={`${icon.symbol} icon`}
                            style={{
                              width: '32px',
                              height: '32px',
                              objectFit: 'contain'
                            }}
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = '/api/icons/image/template.png';
                            }}
                          />
                        </div>
                      </td>

                      {/* Symbol */}
                      <td className="py-3 px-6">
                        <div style={{
                          fontSize: '15px',
                          fontWeight: '600',
                          color: '#111827'
                        }}>
                          {icon.symbol}
                        </div>
                      </td>

                      {/* Type */}
                      <td className="py-3 px-6">
                        <span style={{
                          fontSize: '13px',
                          fontWeight: '600',
                          padding: '4px 12px',
                          borderRadius: '12px',
                          backgroundColor: icon.type === 'c' ? '#f3e8ff' : '#dbeafe',
                          color: icon.type === 'c' ? '#7c3aed' : '#2563eb',
                          border: `1px solid ${icon.type === 'c' ? '#c4b5fd' : '#93c5fd'}`
                        }}>
                          {getTypeLabel(icon.type)}
                        </span>
                      </td>

                      {/* Current Filename */}
                      <td className="py-3 px-6">
                        <div style={{
                          fontSize: '13px',
                          color: '#6b7280',
                          fontFamily: 'monospace',
                          backgroundColor: '#f9fafb',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          display: 'inline-block'
                        }}>
                          {icon.filename}
                        </div>
                      </td>

                      {/* Icon Selector */}
                      <td className="py-3 px-6">
                        <select
                          value={icon.filename}
                          onChange={(e) => handleIconChange(key, e.target.value)}
                          disabled={saving === key}
                          style={{
                            width: '100%',
                            padding: '6px 10px',
                            fontSize: '13px',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            backgroundColor: 'white',
                            cursor: saving === key ? 'not-allowed' : 'pointer',
                            opacity: saving === key ? 0.5 : 1
                          }}
                        >
                          {availableIcons.map((availableIcon) => (
                            <option key={availableIcon.filename} value={availableIcon.filename}>
                              {availableIcon.filename}
                            </option>
                          ))}
                        </select>
                        {saving === key && (
                          <div className="flex items-center mt-1 text-xs text-blue-600">
                            <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                            Saving...
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-6 text-center">
                        <button
                          onClick={() => triggerFileUpload(key)}
                          disabled={uploadingFor === key}
                          style={{
                            padding: '6px 12px',
                            fontSize: '13px',
                            fontWeight: '500',
                            color: '#374151',
                            backgroundColor: 'white',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            cursor: uploadingFor === key ? 'not-allowed' : 'pointer',
                            opacity: uploadingFor === key ? 0.5 : 1,
                            transition: 'all 0.2s',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                          onMouseEnter={(e) => {
                            if (uploadingFor !== key) {
                              e.currentTarget.style.backgroundColor = '#f9fafb';
                              e.currentTarget.style.borderColor = '#9ca3af';
                            }
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'white';
                            e.currentTarget.style.borderColor = '#d1d5db';
                          }}
                        >
                          <Upload style={{ width: '14px', height: '14px' }} />
                          {uploadingFor === key ? 'Uploading...' : 'Upload'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileInputChange}
            className="hidden"
          />

          {/* Empty State */}
          {Object.keys(iconsCache).length === 0 && !loading && (
            <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
              <div className="text-gray-400 mb-4">
                <Upload className="w-12 h-12 mx-auto" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No icons found</h3>
              <p className="text-gray-500">
                Icons will appear here once you start using the investment dashboard.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Icons;