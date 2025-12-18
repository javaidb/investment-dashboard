import React, { useState, useEffect } from 'react';
import { useQuery } from 'react-query';
import axios from 'axios';

interface Holding {
  symbol: string;
  companyName?: string;
  currentPrice?: number;
  usdPrice?: number;
  exchangeRate?: number;
  type: string;
}

interface MAStatus {
  symbol: string;
  companyName: string;
  currentPrice: number;
  ma200Week: number;
  ma50Week: number;
  percentFrom200MA: number;
  percentFrom50MA: number;
  isBelow200MA: boolean;
  isBelow50MA: boolean;
}

interface Below200WeekMAProps {
  holdings: Holding[];
}

const Below200WeekMA: React.FC<Below200WeekMAProps> = ({ holdings }) => {
  const [maStatusList, setMaStatusList] = useState<MAStatus[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [lastCalculatedSymbols, setLastCalculatedSymbols] = useState<string>('');

  // Calculate 200-week MA for a given dataset
  const calculate200WeekMA = (data: any[]): number | null => {
    const targetPeriod = 1000; // 200 weeks * 5 trading days per week
    if (!data || data.length === 0) return null;

    // Use last data point
    const lastIndex = data.length - 1;
    const actualPeriod = Math.min(targetPeriod, lastIndex + 1);

    const slice = data.slice(Math.max(0, lastIndex - actualPeriod + 1), lastIndex + 1);
    const sum = slice.reduce((acc: number, curr: any) => acc + curr.close, 0);
    const ma = sum / slice.length;

    return ma;
  };

  // Calculate 50-week MA for a given dataset
  const calculate50WeekMA = (data: any[]): number | null => {
    const targetPeriod = 250; // 50 weeks * 5 trading days per week
    if (!data || data.length === 0) return null;

    // Use last data point
    const lastIndex = data.length - 1;
    const actualPeriod = Math.min(targetPeriod, lastIndex + 1);

    const slice = data.slice(Math.max(0, lastIndex - actualPeriod + 1), lastIndex + 1);
    const sum = slice.reduce((acc: number, curr: any) => acc + curr.close, 0);
    const ma = sum / slice.length;

    return ma;
  };

  // Fetch MA data for all holdings
  useEffect(() => {
    const fetchMAData = async () => {
      if (holdings.length === 0) {
        console.log('⚠️ Below200WeekMA: No holdings provided');
        return;
      }

      // Create a unique key from holdings symbols to detect changes
      const currentSymbols = holdings.map(h => h.symbol).sort().join(',');

      // Skip if we've already calculated for these exact holdings
      if (currentSymbols === lastCalculatedSymbols) {
        console.log('⏭️ Below200WeekMA: Skipping - already calculated for these holdings');
        return;
      }

      console.log(`🔍 Below200WeekMA: Starting calculation for ${holdings.length} holdings`);
      setIsCalculating(true);
      const results: MAStatus[] = [];

      for (const holding of holdings) {
        try {
          // Fetch historical data from cache
          const response = await axios.get(`/api/portfolio/cache/historical/${holding.symbol}`, {
            params: { period: 'max' }
          });

          const data = response.data.data || [];
          if (data.length === 0) {
            console.log(`⚠️ ${holding.symbol}: No historical data available`);
            continue;
          }

          // Sort data chronologically
          data.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

          // For crypto, convert USD historical data to CAD using exchange rate
          const exchangeRate = holding.exchangeRate || 1.4;
          let processedData = data;

          if (holding.type === 'c') {
            // Convert all USD prices to CAD for crypto
            processedData = data.map((point: any) => ({
              ...point,
              close: point.close * exchangeRate,
              open: point.open * exchangeRate,
              high: point.high * exchangeRate,
              low: point.low * exchangeRate
            }));
            console.log(`💱 ${holding.symbol}: Converted historical USD data to CAD using rate ${exchangeRate.toFixed(4)}`);
          }

          // Calculate both MAs using CAD-converted data for crypto
          const ma200Week = calculate200WeekMA(processedData);
          const ma50Week = calculate50WeekMA(processedData);

          if (!ma200Week || !ma50Week) {
            console.log(`⚠️ ${holding.symbol}: Could not calculate moving averages`);
            continue;
          }
          if (!holding.currentPrice) {
            console.log(`⚠️ ${holding.symbol}: No current price available`);
            continue;
          }

          // Calculate percentages from both MAs (all in CAD now)
          const percentFrom200MA = ((holding.currentPrice - ma200Week) / ma200Week) * 100;
          const percentFrom50MA = ((holding.currentPrice - ma50Week) / ma50Week) * 100;
          const isBelow200MA = holding.currentPrice < ma200Week;
          const isBelow50MA = holding.currentPrice < ma50Week;

          console.log(`📊 ${holding.symbol}: Current $${holding.currentPrice.toFixed(2)} CAD, 200W MA $${ma200Week.toFixed(2)} CAD (${percentFrom200MA.toFixed(2)}%), 50W MA $${ma50Week.toFixed(2)} CAD (${percentFrom50MA.toFixed(2)}%)`);

          // Include if close to or below either MA (within 20% above or below)
          if (percentFrom200MA <= 20 || percentFrom50MA <= 20) {
            results.push({
              symbol: holding.symbol,
              companyName: holding.companyName || holding.symbol,
              currentPrice: holding.currentPrice,
              ma200Week,
              ma50Week,
              percentFrom200MA,
              percentFrom50MA,
              isBelow200MA,
              isBelow50MA
            });
            console.log(`✅ ${holding.symbol}: Added to list (200W: ${percentFrom200MA.toFixed(2)}%, 50W: ${percentFrom50MA.toFixed(2)}%)`);
          } else {
            console.log(`❌ ${holding.symbol}: Not added - too far above both MAs`);
          }
        } catch (error) {
          console.error(`Failed to fetch MA data for ${holding.symbol}:`, error);
        }
      }

      // Sort by percentage from 200W MA (most below first)
      results.sort((a, b) => a.percentFrom200MA - b.percentFrom200MA);
      console.log(`✅ Below200WeekMA: Calculation complete. Found ${results.length} assets within 20% of their MAs`);
      console.log('Assets found:', results.map(r => `${r.symbol} (200W: ${r.percentFrom200MA.toFixed(2)}%, 50W: ${r.percentFrom50MA.toFixed(2)}%)`).join(', '));

      setMaStatusList(results);
      setLastCalculatedSymbols(currentSymbols);
      setIsCalculating(false);
    };

    fetchMAData();
  }, [holdings, lastCalculatedSymbols]);

  if (isCalculating) {
    return (
      <div style={{
        backgroundColor: 'white',
        borderRadius: '16px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
        border: '1px solid #e5e7eb',
        padding: '24px',
        marginBottom: '24px'
      }}>
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div className="loading-spinner" style={{ margin: '0 auto 16px' }}></div>
          <p style={{ color: '#6b7280', fontSize: '14px' }}>Calculating 50-week and 200-week moving averages...</p>
        </div>
      </div>
    );
  }

  if (maStatusList.length === 0) {
    return (
      <div style={{
        backgroundColor: 'white',
        borderRadius: '16px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
        border: '1px solid #e5e7eb',
        padding: '24px',
        marginBottom: '24px'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '16px'
        }}>
          <div style={{
            width: '4px',
            height: '24px',
            backgroundColor: '#9333EA',
            borderRadius: '2px'
          }}></div>
          <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#111827', margin: 0 }}>
            Moving Average Analysis
          </h2>
        </div>
        <p style={{ color: '#6b7280', fontSize: '14px', textAlign: 'center', padding: '20px 0' }}>
          No holdings are currently near or below their moving averages
        </p>
      </div>
    );
  }

  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '16px',
      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
      border: '1px solid #e5e7eb',
      padding: '24px',
      marginBottom: '24px'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '20px'
      }}>
        <div style={{
          width: '4px',
          height: '24px',
          backgroundColor: '#9333EA',
          borderRadius: '2px'
        }}></div>
        <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#111827', margin: 0 }}>
          Moving Average Analysis
        </h2>
        <span style={{
          backgroundColor: '#F3E8FF',
          color: '#9333EA',
          padding: '4px 12px',
          borderRadius: '12px',
          fontSize: '12px',
          fontWeight: '600'
        }}>
          {maStatusList.length} {maStatusList.length === 1 ? 'stock' : 'stocks'}
        </span>
      </div>

      {/* Description */}
      <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '20px' }}>
        Assets trading near or below their 50-week and 200-week moving averages (within 20% range)
      </p>

      {/* Two-Column Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>

        {/* Below 50-Week MA Column */}
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#F59E0B', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '3px', height: '20px', backgroundColor: '#F59E0B', borderRadius: '2px' }}></span>
            Below 50-Week MA
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                    Symbol
                  </th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: '11px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                    Price
                  </th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: '11px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                    50W MA
                  </th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: '11px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                    Distance
                  </th>
                </tr>
              </thead>
              <tbody>
                {maStatusList
                  .filter(item => item.percentFrom50MA <= 20)
                  .sort((a, b) => a.percentFrom50MA - b.percentFrom50MA)
                  .map((item, index, arr) => (
                    <tr
                      key={item.symbol}
                      style={{
                        borderBottom: index < arr.length - 1 ? '1px solid #f3f4f6' : 'none',
                        transition: 'background-color 0.2s',
                        backgroundColor: item.isBelow50MA ? '#FFF7ED' : 'transparent'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#FEF3C7'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = item.isBelow50MA ? '#FFF7ED' : 'transparent'}
                    >
                      <td style={{ padding: '12px', fontSize: '13px', fontWeight: '600', color: '#111827' }}>
                        {item.symbol}
                      </td>
                      <td style={{ padding: '12px', fontSize: '13px', color: '#374151', textAlign: 'right' }}>
                        ${item.currentPrice.toFixed(2)}
                      </td>
                      <td style={{ padding: '12px', fontSize: '13px', color: '#F59E0B', textAlign: 'right', fontWeight: '500' }}>
                        ${item.ma50Week.toFixed(2)}
                      </td>
                      <td style={{
                        padding: '12px',
                        fontSize: '13px',
                        textAlign: 'right',
                        fontWeight: '600',
                        color: item.percentFrom50MA < 0 ? '#EF4444' : item.percentFrom50MA < 5 ? '#F59E0B' : '#10B981'
                      }}>
                        {item.percentFrom50MA > 0 ? '+' : ''}{item.percentFrom50MA.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {maStatusList.filter(item => item.percentFrom50MA <= 20).length === 0 && (
              <p style={{ color: '#9ca3af', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>
                No assets near or below 50W MA
              </p>
            )}
          </div>
        </div>

        {/* Below 200-Week MA Column */}
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#9333EA', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '3px', height: '20px', backgroundColor: '#9333EA', borderRadius: '2px' }}></span>
            Below 200-Week MA
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                    Symbol
                  </th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: '11px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                    Price
                  </th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: '11px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                    200W MA
                  </th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: '11px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                    Distance
                  </th>
                </tr>
              </thead>
              <tbody>
                {maStatusList
                  .filter(item => item.percentFrom200MA <= 20)
                  .sort((a, b) => a.percentFrom200MA - b.percentFrom200MA)
                  .map((item, index, arr) => (
                    <tr
                      key={item.symbol}
                      style={{
                        borderBottom: index < arr.length - 1 ? '1px solid #f3f4f6' : 'none',
                        transition: 'background-color 0.2s',
                        backgroundColor: item.isBelow200MA ? '#FAF5FF' : 'transparent'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F3E8FF'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = item.isBelow200MA ? '#FAF5FF' : 'transparent'}
                    >
                      <td style={{ padding: '12px', fontSize: '13px', fontWeight: '600', color: '#111827' }}>
                        {item.symbol}
                      </td>
                      <td style={{ padding: '12px', fontSize: '13px', color: '#374151', textAlign: 'right' }}>
                        ${item.currentPrice.toFixed(2)}
                      </td>
                      <td style={{ padding: '12px', fontSize: '13px', color: '#9333EA', textAlign: 'right', fontWeight: '500' }}>
                        ${item.ma200Week.toFixed(2)}
                      </td>
                      <td style={{
                        padding: '12px',
                        fontSize: '13px',
                        textAlign: 'right',
                        fontWeight: '600',
                        color: item.percentFrom200MA < 0 ? '#EF4444' : item.percentFrom200MA < 5 ? '#F59E0B' : '#10B981'
                      }}>
                        {item.percentFrom200MA > 0 ? '+' : ''}{item.percentFrom200MA.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {maStatusList.filter(item => item.percentFrom200MA <= 20).length === 0 && (
              <p style={{ color: '#9ca3af', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>
                No assets near or below 200W MA
              </p>
            )}
          </div>
        </div>

      </div>

      {/* Footer note */}
      <div style={{
        marginTop: '20px',
        padding: '12px 16px',
        backgroundColor: '#F9FAFB',
        borderRadius: '8px',
        fontSize: '12px',
        color: '#6b7280'
      }}>
        <strong>Note:</strong> Moving averages are trend indicators. The 50-week MA shows medium-term trends, while the 200-week MA indicates long-term trends. Prices below these levels may signal potential opportunities or bearish trends.
      </div>
    </div>
  );
};

export default Below200WeekMA;
