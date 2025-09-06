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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Icons Management</h1>
        <p className="text-gray-600">
          Manage symbol-to-icon mappings. You can change existing assignments or upload new icons.
        </p>
      </div>

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

      {/* Actions */}
      <div className="mb-6 flex gap-4">
        <button
          onClick={loadIconsData}
          disabled={loading}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Icons Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Object.entries(iconsCache).map(([key, icon]) => (
          <div key={key} className="bg-white rounded-lg shadow-md p-6">
            {/* Symbol Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{icon.symbol}</h3>
                <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
                  {getTypeLabel(icon.type)}
                </span>
              </div>
              <span className="text-xs text-gray-400">ID: {icon.id}</span>
            </div>

            {/* Current Icon Display */}
            <div className="mb-4">
              <img
                src={`${icon.url}?t=${Date.now()}`}
                alt={`${icon.symbol} icon`}
                className="w-10 h-10 mx-auto object-contain border rounded-lg"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/api/icons/image/template.png';
                }}
              />
              <p className="text-xs text-gray-500 text-center mt-1">{icon.filename}</p>
            </div>

            {/* Icon Selection */}
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Choose from available icons:
                </label>
                <select
                  value={icon.filename}
                  onChange={(e) => handleIconChange(key, e.target.value)}
                  disabled={saving === key}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                >
                  {availableIcons.map((availableIcon) => (
                    <option key={availableIcon.filename} value={availableIcon.filename}>
                      {availableIcon.filename}
                    </option>
                  ))}
                </select>
              </div>

              {/* Upload New Icon */}
              <div className="pt-2 border-t">
                <button
                  onClick={() => triggerFileUpload(key)}
                  disabled={uploadingFor === key}
                  className="w-full flex items-center justify-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {uploadingFor === key ? 'Uploading...' : 'Upload New'}
                </button>
              </div>

              {/* Save Status */}
              {saving === key && (
                <div className="flex items-center justify-center text-sm text-blue-600">
                  <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                  Saving...
                </div>
              )}
            </div>
          </div>
        ))}
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
        <div className="text-center py-12">
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
  );
};

export default Icons;