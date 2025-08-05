import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

interface CacheData {
  holdings: Record<string, any>;
  portfolios: any[];
  latestPortfolio: any | null;
  holdingsTimestamp: Date | null;
  portfolioTimestamp: Date | null;
  isLoading: boolean;
  error: string | null;
}

interface CacheContextType extends CacheData {
  refreshCache: () => Promise<void>;
}

const CacheContext = createContext<CacheContextType | undefined>(undefined);

export const CacheProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [holdings, setHoldings] = useState<Record<string, any>>({});
  const [portfolios, setPortfolios] = useState<any[]>([]);
  const [latestPortfolio, setLatestPortfolio] = useState<any | null>(null);
  const [holdingsTimestamp, setHoldingsTimestamp] = useState<Date | null>(null);
  const [portfolioTimestamp, setPortfolioTimestamp] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCacheData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      console.log('🔄 CacheProvider: Loading cache data...');

      // Load portfolios and holdings cache in parallel
      const [portfoliosResponse, cacheResponse] = await Promise.all([
        axios.get('/api/portfolio'),
        axios.get('/api/portfolio/cache/data')
      ]);

      // Set portfolios data
      const portfoliosData = portfoliosResponse.data;
      setPortfolios(portfoliosData);
      
      if (portfoliosData && portfoliosData.length > 0) {
        const latest = portfoliosData[portfoliosData.length - 1];
        setLatestPortfolio(latest);
        setPortfolioTimestamp(new Date(latest.lastUpdated || latest.createdAt));
        
        // Load detailed portfolio data with error handling
        try {
          const portfolioDetailResponse = await axios.get(`/api/portfolio/${latest.id}`);
          setLatestPortfolio(portfolioDetailResponse.data);
          console.log('✅ CacheProvider: Portfolio details loaded successfully');
        } catch (portfolioError) {
          console.warn('⚠️ CacheProvider: Failed to load portfolio details, using summary data:', portfolioError);
          // Keep the summary data if detailed fetch fails
        }
      }

      // Set holdings cache data
      const cacheData = cacheResponse.data;
      setHoldings(cacheData.cache || {});
      
      // Find most recent cache timestamp
      if (cacheData.cache && Object.keys(cacheData.cache).length > 0) {
        const latestCacheTime = Math.max(...Object.values(cacheData.cache).map((item: any) => 
          new Date(item.lastUpdated || item.fetchedAt || 0).getTime()
        ));
        setHoldingsTimestamp(new Date(latestCacheTime));
      }

      console.log('✅ CacheProvider: Cache data loaded successfully');
    } catch (err) {
      console.error('❌ CacheProvider: Failed to load cache data:', err);
      
      let errorMessage = 'Failed to load cache data';
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'object' && err !== null && 'response' in err) {
        const axiosError = err as any;
        errorMessage = `API Error ${axiosError.response?.status}: ${axiosError.response?.data?.error || axiosError.message}`;
      }
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshCache = async () => {
    await loadCacheData();
  };

  useEffect(() => {
    loadCacheData();
  }, []);

  const value: CacheContextType = {
    holdings,
    portfolios,
    latestPortfolio,
    holdingsTimestamp,
    portfolioTimestamp,
    isLoading,
    error,
    refreshCache
  };

  return (
    <CacheContext.Provider value={value}>
      {children}
    </CacheContext.Provider>
  );
};

export const useCache = () => {
  const context = useContext(CacheContext);
  if (context === undefined) {
    throw new Error('useCache must be used within a CacheProvider');
  }
  return context;
};