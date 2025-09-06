import { useState, useEffect } from 'react';
import { useQuery } from 'react-query';

interface IconData {
  symbol: string;
  type: string;
  filename?: string;
  source?: string;
  contentType?: string;
  size?: number;
  timestamp: number;
  url?: string;
  failed?: boolean;
}

interface IconsResponse {
  success: boolean;
  icons: Record<string, IconData | null>;
}

interface UseIconsOptions {
  symbols: { symbol: string; type?: string }[];
  enabled?: boolean;
}

export const useIcons = ({ symbols, enabled = true }: UseIconsOptions) => {
  const [iconUrls, setIconUrls] = useState<Record<string, string>>({});

  // Create a stable key for the symbols array
  const symbolsKey = symbols
    .map(s => `${s.symbol}_${s.type || 's'}`)
    .sort()
    .join(',');

  console.log('🔍 useIcons hook called:', {
    symbols,
    symbolsKey,
    enabled,
    symbolsLength: symbols.length
  });

  const { data, isLoading, error } = useQuery<IconsResponse>(
    ['icons', symbolsKey],
    async () => {
      if (symbols.length === 0) {
        return { success: true, icons: {} };
      }

      const response = await fetch('/api/icons/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symbols: symbols.map(s => ({
            symbol: s.symbol,
            type: s.type || 's'
          }))
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch icons: ${response.status}`);
      }

      return response.json();
    },
    {
      enabled: enabled && symbols.length > 0,
      staleTime: 7 * 24 * 60 * 60 * 1000, // 7 days
      cacheTime: 30 * 24 * 60 * 60 * 1000, // 30 days
      refetchOnWindowFocus: false,
      retry: 1,
    }
  );

  // Process icon data and create URLs
  useEffect(() => {
    console.log('🔍 useIcons processing data:', data);
    if (data?.success && data.icons) {
      const urls: Record<string, string> = {};
      
      Object.entries(data.icons).forEach(([symbol, iconData]) => {
        if (iconData && !iconData.failed && iconData.url) {
          urls[symbol.toUpperCase()] = iconData.url;
          console.log(`🔍 Adding icon URL for ${symbol.toUpperCase()}: ${iconData.url}`);
        } else {
          console.log(`🔍 Skipping icon for ${symbol}:`, iconData);
        }
      });
      
      console.log('🔍 Final iconUrls:', urls);
      setIconUrls(urls);
    }
  }, [data]);

  return {
    iconUrls,
    isLoading,
    error,
    hasIcons: Object.keys(iconUrls).length > 0
  };
};

// Hook for single icon
export const useIcon = (symbol: string, type: string = 's') => {
  const { iconUrls, isLoading, error } = useIcons({
    symbols: [{ symbol, type }],
  });

  return {
    iconUrl: iconUrls[symbol.toUpperCase()],
    isLoading,
    error
  };
};

export default useIcons;