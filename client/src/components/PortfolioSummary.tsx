import React, { useState, useEffect } from 'react';

interface Trade {
  symbol: string;
  date: string;
  action: 'buy' | 'sell';
  quantity: number;
  price: number;
}

interface Holding {
  symbol: string;
  quantity: number;
  averagePrice: number;
  totalInvested: number;
  totalAmountInvested?: number; // Total amount ever invested (all buy transactions)
  realizedPnL: number;
  amountSold?: number; // Total amount sold in CAD
  type: string; // 's' for stock, 'c' for crypto
  currency: string; // 'CAD' for Canadian dollars
  companyName?: string;
  currentPrice?: number; // Now in CAD
  currentValue?: number; // Now in CAD
  unrealizedPnL?: number; // Now in CAD
  totalPnL?: number; // Now in CAD
  totalPnLPercent?: number;
  usdPrice?: number; // USD price for reference
  exchangeRate?: number; // Exchange rate used for conversion
  cacheUsed?: boolean; // Flag to indicate if cache was used
}

interface PortfolioSummary {
  totalInvested: number;
  totalRealized: number;
  totalAmountSold?: number;
  totalHoldings: number;
  totalQuantity: number;
  currentTotalValue?: number;
  totalUnrealizedPnL?: number;
  totalPnL?: number;
  totalPnLPercent?: number;
}

const PortfolioSummary: React.FC = () => {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPortfolioData();
  }, []);

  const loadPortfolioData = async () => {
    try {
      setLoading(true);
      
      // Process uploaded CSV files instead of sample data
      const uploadResponse = await fetch('/api/portfolio/process-uploaded', {
        method: 'POST',
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to process uploaded portfolio data');
      }

      const uploadResult = await uploadResponse.json();
      
      // Get the portfolio with current prices
      const portfolioResponse = await fetch(`/api/portfolio/${uploadResult.portfolioId}`);
      if (!portfolioResponse.ok) {
        throw new Error('Failed to fetch portfolio data');
      }

             const portfolioData = await portfolioResponse.json();
       
       try {
         // Extract trades data
         const portfolioTrades = (portfolioData.trades || []).map((trade: any) => ({
           symbol: trade.symbol,
           date: trade.date,
           action: trade.action,
           quantity: trade.quantity,
           price: trade.price
         }));
         setTrades(portfolioTrades);
         
         // Ensure holdings data is properly formatted with null checks
         const safeHoldings = (portfolioData.holdings || []).map((holding: any) => ({
           symbol: holding.symbol || 'UNKNOWN',
           quantity: holding.quantity || 0,
           averagePrice: holding.averagePrice || 0,
           totalInvested: holding.totalInvested || 0,
           totalAmountInvested: holding.totalAmountInvested || holding.totalInvested || 0, // Use totalAmountInvested if available, fallback to totalInvested
           realizedPnL: holding.realizedPnL || 0,
           amountSold: holding.amountSold || 0,
           type: holding.type || 's', // Default to stock if type is missing
           currency: holding.currency || 'CAD', // Default to CAD
           companyName: holding.companyName || holding.symbol || 'UNKNOWN',
           currentPrice: holding.currentPrice || null,
           currentValue: holding.currentValue || null,
           unrealizedPnL: holding.unrealizedPnL || null,
           totalPnL: holding.totalPnL || null,
           totalPnLPercent: holding.totalPnLPercent || null,
           cacheUsed: holding.cacheUsed || false
         }));
         
         // Sort holdings by P&L amount (highest to lowest)
         const sortedHoldings = safeHoldings.sort((a: Holding, b: Holding) => {
           const aPnL = a.totalPnL || 0;
           const bPnL = b.totalPnL || 0;
           return bPnL - aPnL; // Descending order (highest P&L first)
         });
         
         setHoldings(sortedHoldings);
         
         // Calculate summary with current values
         const currentTotalValue = safeHoldings.reduce((sum: number, h: Holding) => 
           sum + (h.currentValue || 0), 0);
         const totalUnrealizedPnL = safeHoldings.reduce((sum: number, h: Holding) => 
           sum + (h.unrealizedPnL || 0), 0);
         const totalPnL = totalUnrealizedPnL + (portfolioData.summary?.totalRealized || 0);
         const totalPnLPercent = (portfolioData.summary?.totalInvested || 0) > 0 ? 
           (totalPnL / (portfolioData.summary?.totalInvested || 1)) * 100 : 0;

         setSummary({
           totalInvested: portfolioData.summary?.totalInvested || 0,
           totalRealized: portfolioData.summary?.totalRealized || 0,
           totalAmountSold: portfolioData.summary?.totalAmountSold || 0,
           totalHoldings: portfolioData.summary?.totalHoldings || 0,
           totalQuantity: portfolioData.summary?.totalQuantity || 0,
           currentTotalValue,
           totalUnrealizedPnL,
           totalPnL,
           totalPnLPercent
         });
       } catch (processingError) {
         console.error('Error processing portfolio data:', processingError);
         setError('Failed to process portfolio data');
       }

         } catch (err) {
       console.error('Portfolio loading error:', err);
       
       // Try to get cache data as fallback
       try {
         console.log('🔄 Attempting to load cached data as fallback...');
         const cacheResponse = await fetch('/api/portfolio/cache/data');
         if (cacheResponse.ok) {
           const cacheData = await cacheResponse.json();
           console.log('📦 Found cached data:', cacheData);
           
           // Create holdings from cache data with actual prices
           const cachedHoldings: Holding[] = Object.entries(cacheData.cache).map(([symbol, data]: [string, any]) => {
             const isCrypto = symbol === 'BTC' || symbol === 'ETH' || symbol === 'DOGE' || symbol === 'ADA' || symbol === 'SOL';
             
             return {
               symbol: symbol,
               quantity: 1, // Default quantity for display purposes
               averagePrice: 0,
               totalInvested: 0,
               totalAmountInvested: 0,
               realizedPnL: 0,
               amountSold: 0,
               type: isCrypto ? 'c' : 's',
               currency: 'CAD',
               companyName: data.companyName || symbol,
               currentPrice: data.cadPrice || undefined,
               currentValue: data.cadPrice || undefined, // For display, use price as value
               unrealizedPnL: undefined,
               totalPnL: undefined,
               totalPnLPercent: undefined,
               cacheUsed: true
             };
           });
           
           // Sort by symbol for better organization
           const sortedCachedHoldings = cachedHoldings.sort((a, b) => a.symbol.localeCompare(b.symbol));
           
           setHoldings(sortedCachedHoldings);
           setSummary({
             totalInvested: 0,
             totalRealized: 0,
             totalAmountSold: 0,
             totalHoldings: cachedHoldings.length,
             totalQuantity: cachedHoldings.length,
             currentTotalValue: 0,
             totalUnrealizedPnL: 0,
             totalPnL: 0,
             totalPnLPercent: 0
           });
           setError('Using cached data - portfolio information may be incomplete');
         } else {
           throw new Error('Cache not available');
         }
       } catch (fallbackError) {
         console.error('Cache fallback failed:', fallbackError);
         setError('Failed to load portfolio data and cache fallback failed');
       }
     } finally {
       setLoading(false);
     }
  };

  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined || isNaN(value)) {
      return 'C$0.00';
    }
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
    }).format(value);
  };

  const formatPercentage = (value: number | null | undefined) => {
    if (value === null || value === undefined || isNaN(value)) {
      return '0.00%';
    }
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  const safeToFixed = (value: number | null | undefined, decimals: number = 4) => {
    if (value === null || value === undefined || isNaN(value)) {
      return '0.0000';
    }
    return value.toFixed(decimals);
  };

  const calculateNetInvested = (totalInvested: number | undefined, amountSold: number | undefined) => {
    return (totalInvested || 0) - (amountSold || 0);
  };



  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">Portfolio Summary</h2>
              <p className="text-blue-100 text-sm">Loading your investment data...</p>
            </div>
            <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
            </div>
          </div>
        </div>
        <div className="p-6">
          <div className="flex justify-center items-center h-32">
            <div className="animate-pulse space-y-3">
              <div className="h-4 bg-gray-200 rounded w-48"></div>
              <div className="h-4 bg-gray-200 rounded w-32"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="bg-gradient-to-r from-red-600 to-pink-600 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">Portfolio Summary</h2>
              <p className="text-red-100 text-sm">Error loading portfolio data</p>
            </div>
            <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
          </div>
        </div>
        <div className="p-6">
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Failed to Load Portfolio</h3>
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
      {/* Header with gradient */}
      <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 px-6 py-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-black/10"></div>
        <div className="relative z-10">
          <h2 className="text-3xl font-bold text-white mb-2 drop-shadow-lg">Portfolio Summary</h2>
          <p className="text-indigo-100 text-base font-medium">Current holdings and performance based on sample trades</p>
          <div className="mt-3 text-sm text-indigo-200 bg-indigo-800/30 px-4 py-2 rounded-lg inline-block">
            💱 All amounts converted from USD to CAD for accurate P&L calculations • 📊 Holdings sorted by P&L (highest first) • 💰 Net Invested = Total Invested - Amount Sold
          </div>
        </div>
      </div>

      <div className="p-6 bg-gradient-to-br from-gray-50 to-white" style={{width: '100%', maxWidth: '100%'}}>
        {summary && (
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
            border: '1px solid #e5e7eb',
            overflow: 'hidden',
            width: '100%',
            marginBottom: '24px'
          }}>
            <div style={{
              background: 'linear-gradient(to right, #f8fafc, #f1f5f9)',
              padding: '20px 24px',
              borderBottom: '1px solid #e5e7eb'
            }}>
              <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                <h3 style={{
                  fontSize: '20px',
                  fontWeight: 'bold',
                  color: '#111827'
                }}>Portfolio Summary</h3>
              </div>
            </div>
            <div style={{
              padding: '20px 24px',
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '24px',
              alignItems: 'center'
            }}>
              <div style={{textAlign: 'center'}}>
                <div style={{
                  fontSize: '16px',
                  fontWeight: '600',
                  color: '#111827',
                  marginBottom: '4px'
                }}>
                  {formatCurrency(summary.currentTotalValue)}
                </div>
                <div style={{
                  fontSize: '12px',
                  color: '#6b7280',
                  backgroundColor: '#f3f4f6',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  display: 'inline-block'
                }}>
                  Net Value in All Holdings by Market
                </div>
              </div>
              <div style={{textAlign: 'center'}}>
                <div style={{
                  fontSize: '16px',
                  fontWeight: '600',
                  color: '#111827',
                  marginBottom: '4px'
                }}>
                  {formatCurrency(summary.totalInvested - (summary.totalAmountSold || 0))}
                </div>
                <div style={{
                  fontSize: '12px',
                  color: '#6b7280',
                  backgroundColor: '#f3f4f6',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  display: 'inline-block',
                  marginRight: '8px'
                }}>
                  Net Spent
                </div>
                <span style={{
                  fontSize: '12px',
                  color: '#6b7280',
                  fontWeight: '500'
                }}>
                  (<span style={{color: '#dc2626'}}>{formatCurrency(summary.totalInvested)}</span> - <span style={{color: '#166534'}}>{formatCurrency(summary.totalAmountSold || 0)}</span>)
                </span>
              </div>
              <div style={{textAlign: 'center'}}>
                <div style={{
                  fontSize: '16px',
                  fontWeight: '600',
                  color: summary.totalPnL && summary.totalPnL >= 0 ? '#166534' : '#dc2626',
                  marginBottom: '4px'
                }}>
                  {formatCurrency(summary.totalPnL)}
                </div>
                <div style={{
                  fontSize: '12px',
                  color: '#6b7280',
                  backgroundColor: '#f3f4f6',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  display: 'inline-block'
                }}>
                  P&L
                </div>
              </div>
              <div style={{textAlign: 'center'}}>
                <div style={{
                  fontSize: '16px',
                  fontWeight: '600',
                  color: summary.totalPnLPercent && summary.totalPnLPercent >= 0 ? '#166534' : '#dc2626',
                  marginBottom: '4px'
                }}>
                  {formatPercentage(summary.totalPnLPercent)}
                </div>
                <div style={{
                  fontSize: '12px',
                  color: '#6b7280',
                  backgroundColor: '#f3f4f6',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  display: 'inline-block'
                }}>
                  P&L %
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Holdings Table */}
        {holdings.length > 0 && (
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
            border: '1px solid #e5e7eb',
            overflow: 'hidden',
            width: '100%',
            maxWidth: '100%',
            marginTop: '0',
            marginBottom: '0',
            gridColumn: '1 / -1'
          }}>
            <div style={{
              background: 'linear-gradient(to right, #f8fafc, #f1f5f9)',
              padding: '20px 24px',
              borderBottom: '1px solid #e5e7eb'
            }}>
              <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                <h3 style={{
                  fontSize: '20px',
                  fontWeight: 'bold',
                  color: '#111827'
                }}>Holdings Breakdown</h3>
                <div style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#6b7280',
                  backgroundColor: 'white',
                  padding: '6px 12px',
                  borderRadius: '20px',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
                }}>{holdings.length} assets</div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full" style={{backgroundColor: 'white', border: '1px solid #e5e7eb'}}>
                <thead>
                  <tr style={{backgroundColor: '#f8fafc', borderBottom: '2px solid #e5e7eb'}}>
                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                      Symbol
                    </th>
                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                      Company
                    </th>
                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                      Type
                    </th>
                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                      Shares
                    </th>
                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                      Current Price
                    </th>
                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                      Current Value
                    </th>
                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                      Net Invested
                    </th>
                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                      Total Invested
                    </th>
                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                      Amount Sold ($)
                    </th>
                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                      P&L ↓
                    </th>
                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider" style={{backgroundColor: '#f8fafc', color: '#374151', fontSize: '12px', fontWeight: '600', padding: '16px 24px'}}>
                      Cache
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {holdings.map((holding, index) => (
                    <tr key={holding.symbol} style={{
                      backgroundColor: index % 2 === 0 ? '#ffffff' : '#f9fafb',
                      borderBottom: '1px solid #f3f4f6',
                      transition: 'all 0.2s ease'
                    }} onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#f0f9ff';
                    }} onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = index % 2 === 0 ? '#ffffff' : '#f9fafb';
                    }}>
                      <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                        <div style={{
                          fontSize: '16px',
                          fontWeight: '600',
                          color: '#111827'
                        }}>
                          {holding.symbol}
                        </div>
                      </td>
                      <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                        <div style={{
                          fontSize: '14px',
                          color: '#6b7280',
                          fontStyle: 'italic'
                        }}>
                          {holding.companyName}
                        </div>
                      </td>
                      <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                        <div style={{
                          fontSize: '14px',
                          fontWeight: '600',
                          padding: '6px 12px',
                          borderRadius: '16px',
                          backgroundColor: holding.type === 'c' ? '#f3e8ff' : '#dbeafe',
                          color: holding.type === 'c' ? '#7c3aed' : '#2563eb',
                          border: `1px solid ${holding.type === 'c' ? '#c4b5fd' : '#93c5fd'}`
                        }}>
                          {holding.type === 'c' ? 'Crypto' : 'Stock'}
                        </div>
                      </td>
                      <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                        <div style={{
                          fontSize: '16px',
                          fontWeight: '600',
                          color: '#111827'
                        }}>
                          {Number.isInteger(holding.quantity) ? holding.quantity.toLocaleString() : safeToFixed(holding.quantity)}
                        </div>
                      </td>
                      <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                        <div style={{
                          fontSize: '16px',
                          fontWeight: '600',
                          color: '#111827'
                        }}>
                          {formatCurrency(holding.currentPrice)}
                        </div>
                      </td>
                      <td className="py-4 px-6" style={{
                        padding: '20px 24px', 
                        backgroundColor: (() => {
                          const netInvested = calculateNetInvested(holding.totalAmountInvested, holding.amountSold);
                          const currentValue = holding.currentValue || 0;
                          return currentValue > netInvested ? '#dcfce7' : '#fef2f2';
                        })()
                      }}>
                        <div style={{
                          fontSize: '16px',
                          fontWeight: '600',
                          color: (() => {
                            const netInvested = calculateNetInvested(holding.totalAmountInvested, holding.amountSold);
                            const currentValue = holding.currentValue || 0;
                            return currentValue > netInvested ? '#166534' : '#dc2626';
                          })()
                        }}>
                          {formatCurrency(holding.currentValue)}
                        </div>
                      </td>
                      <td className="py-4 px-6" style={{
                        padding: '20px 24px', 
                        backgroundColor: holding.quantity <= 0.01 ? '#f3e8ff' : '#e0f2fe'
                      }}>
                        <div style={{
                          fontSize: '16px',
                          fontWeight: '600',
                          color: holding.quantity <= 0.01 ? '#7c3aed' : '#111827'
                        }}>
                          {formatCurrency(calculateNetInvested(holding.totalAmountInvested, holding.amountSold))}
                        </div>
                      </td>
                      <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                        <div style={{
                          fontSize: '16px',
                          fontWeight: '600',
                          color: '#111827'
                        }}>
                          {formatCurrency(holding.totalAmountInvested)}
                        </div>
                      </td>
                      <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                        <div style={{
                          fontSize: '16px',
                          fontWeight: '600',
                          color: '#111827'
                        }}>
                          {formatCurrency(holding.amountSold || 0)}
                        </div>
                      </td>
                      <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                        <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '8px 16px',
                            borderRadius: '20px',
                            fontSize: '14px',
                            fontWeight: '600',
                            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                            backgroundColor: (holding.totalPnL && holding.totalPnL >= 0) ? '#dcfce7' : '#fef2f2',
                            color: (holding.totalPnL && holding.totalPnL >= 0) ? '#166534' : '#dc2626',
                            border: `2px solid ${(holding.totalPnL && holding.totalPnL >= 0) ? '#bbf7d0' : '#fecaca'}`
                          }}>
                            {(holding.totalPnL && holding.totalPnL >= 0) ? (
                              <svg style={{width: '16px', height: '16px', marginRight: '8px'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                              </svg>
                            ) : (
                              <svg style={{width: '16px', height: '16px', marginRight: '8px'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0v-8m0 8l-8-8-4 4-6-6" />
                              </svg>
                            )}
                            {formatCurrency(holding.totalPnL)}
                          </div>
                          {holding.totalPnLPercent !== null && holding.totalPnLPercent !== undefined && (
                            <div style={{
                              fontSize: '14px',
                              fontWeight: '600',
                              padding: '6px 12px',
                              borderRadius: '16px',
                              backgroundColor: holding.totalPnLPercent >= 0 ? '#f0fdf4' : '#fef2f2',
                              color: holding.totalPnLPercent >= 0 ? '#166534' : '#dc2626',
                              border: `1px solid ${holding.totalPnLPercent >= 0 ? '#bbf7d0' : '#fecaca'}`
                            }}>
                              {formatPercentage(holding.totalPnLPercent)}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-6" style={{padding: '20px 24px'}}>
                        {holding.cacheUsed && (
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '4px 8px',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: '500',
                            backgroundColor: '#fef3c7',
                            color: '#92400e',
                            border: '1px solid #fde68a'
                          }}>
                            <svg style={{width: '12px', height: '12px', marginRight: '4px'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Cached
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}


      </div>
    </div>
  );
};

export default PortfolioSummary; 