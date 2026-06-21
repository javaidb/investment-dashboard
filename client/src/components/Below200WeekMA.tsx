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
      console.log(`📋 Symbols to process: ${holdings.map(h => h.symbol).join(', ')}`);
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
        backgroundColor: '#10141c',
        borderRadius: '8px',
        border: '1px solid #1e2535',
        padding: '24px',
      }}>
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div className="loading-spinner" style={{ margin: '0 auto 16px' }}></div>
          <p style={{ color: '#64748b', fontSize: '13px', fontFamily: "'IBM Plex Mono', monospace" }}>Calculating 50-week and 200-week moving averages...</p>
        </div>
      </div>
    );
  }

  if (maStatusList.length === 0) {
    return (
      <div style={{
        backgroundColor: '#10141c',
        borderRadius: '8px',
        border: '1px solid #1e2535',
        padding: '18px 20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <div style={{ width: '3px', height: '18px', backgroundColor: '#9333EA', borderRadius: '2px' }}></div>
          <h2 style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase' as const, margin: 0 }}>
            Moving Average Analysis
          </h2>
        </div>
        <p style={{ color: '#4a5568', fontSize: '12px', textAlign: 'center', padding: '16px 0', fontFamily: "'IBM Plex Mono', monospace" }}>
          No holdings are currently near or below their moving averages
        </p>
      </div>
    );
  }

  return (
    <div style={{
      backgroundColor: '#10141c',
      borderRadius: '8px',
      border: '1px solid #1e2535',
      padding: '18px 20px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
        <div style={{ width: '3px', height: '18px', backgroundColor: '#9333EA', borderRadius: '2px' }}></div>
        <h2 style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase' as const, margin: 0 }}>
          Moving Average Analysis
        </h2>
        <span style={{
          backgroundColor: 'rgba(147,51,234,0.1)',
          color: '#a855f7',
          padding: '2px 10px',
          borderRadius: '4px',
          fontSize: '11px',
          fontWeight: 600,
          fontFamily: "'IBM Plex Mono', monospace",
          border: '1px solid rgba(147,51,234,0.2)'
        }}>
          {maStatusList.length} {maStatusList.length === 1 ? 'asset' : 'assets'}
        </span>
      </div>

      {/* Description */}
      <p style={{ color: '#4a5568', fontSize: '11px', marginBottom: '16px', fontFamily: "'IBM Plex Mono', monospace" }}>
        Assets trading near or below 50W / 200W moving averages (within 20% range)
      </p>

      {/* Two-Column Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

        {/* Below 50-Week MA Column */}
        <div>
          <h3 style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', fontWeight: 700, color: '#F59E0B', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
            <span style={{ width: '3px', height: '14px', backgroundColor: '#F59E0B', borderRadius: '2px' }}></span>
            50-Week MA
          </h3>
          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '252px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#10141c', zIndex: 1 }}>
                <tr style={{ borderBottom: '1px solid #1e2535' }}>
                  <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#4a5568', textTransform: 'uppercase' as const, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.08em' }}>Symbol</th>
                  <th style={{ padding: '6px 10px', textAlign: 'right', fontSize: '10px', fontWeight: 700, color: '#4a5568', textTransform: 'uppercase' as const, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.08em' }}>Price</th>
                  <th style={{ padding: '6px 10px', textAlign: 'right', fontSize: '10px', fontWeight: 700, color: '#4a5568', textTransform: 'uppercase' as const, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.08em' }}>50W MA</th>
                  <th style={{ padding: '6px 10px', textAlign: 'right', fontSize: '10px', fontWeight: 700, color: '#4a5568', textTransform: 'uppercase' as const, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.08em' }}>Dist.</th>
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
                        borderBottom: index < arr.length - 1 ? '1px solid #131720' : 'none',
                        transition: 'background-color 0.15s',
                        backgroundColor: item.isBelow50MA ? 'rgba(245,158,11,0.05)' : 'transparent'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(245,158,11,0.08)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = item.isBelow50MA ? 'rgba(245,158,11,0.05)' : 'transparent'; }}
                    >
                      <td style={{ padding: '10px', fontSize: '12px', fontWeight: 700, color: '#cbd5e1', fontFamily: "'IBM Plex Mono', monospace" }}>{item.symbol}</td>
                      <td style={{ padding: '10px', fontSize: '12px', color: '#94a3b8', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}>${item.currentPrice.toFixed(2)}</td>
                      <td style={{ padding: '10px', fontSize: '12px', color: '#F59E0B', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}>${item.ma50Week.toFixed(2)}</td>
                      <td style={{ padding: '10px', fontSize: '12px', textAlign: 'right', fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: item.percentFrom50MA < 0 ? '#f87171' : item.percentFrom50MA < 5 ? '#fbbf24' : '#34d399' }}>
                        {item.percentFrom50MA > 0 ? '+' : ''}{item.percentFrom50MA.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {maStatusList.filter(item => item.percentFrom50MA <= 20).length === 0 && (
              <p style={{ color: '#4a5568', fontSize: '12px', textAlign: 'center', padding: '16px 0', fontFamily: "'IBM Plex Mono', monospace" }}>No assets near or below 50W MA</p>
            )}
          </div>
        </div>

        {/* Below 200-Week MA Column */}
        <div>
          <h3 style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', fontWeight: 700, color: '#a855f7', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
            <span style={{ width: '3px', height: '14px', backgroundColor: '#9333EA', borderRadius: '2px' }}></span>
            200-Week MA
          </h3>
          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '252px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#10141c', zIndex: 1 }}>
                <tr style={{ borderBottom: '1px solid #1e2535' }}>
                  <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#4a5568', textTransform: 'uppercase' as const, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.08em' }}>Symbol</th>
                  <th style={{ padding: '6px 10px', textAlign: 'right', fontSize: '10px', fontWeight: 700, color: '#4a5568', textTransform: 'uppercase' as const, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.08em' }}>Price</th>
                  <th style={{ padding: '6px 10px', textAlign: 'right', fontSize: '10px', fontWeight: 700, color: '#4a5568', textTransform: 'uppercase' as const, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.08em' }}>200W MA</th>
                  <th style={{ padding: '6px 10px', textAlign: 'right', fontSize: '10px', fontWeight: 700, color: '#4a5568', textTransform: 'uppercase' as const, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.08em' }}>Dist.</th>
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
                        borderBottom: index < arr.length - 1 ? '1px solid #131720' : 'none',
                        transition: 'background-color 0.15s',
                        backgroundColor: item.isBelow200MA ? 'rgba(147,51,234,0.05)' : 'transparent'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(147,51,234,0.08)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = item.isBelow200MA ? 'rgba(147,51,234,0.05)' : 'transparent'; }}
                    >
                      <td style={{ padding: '10px', fontSize: '12px', fontWeight: 700, color: '#cbd5e1', fontFamily: "'IBM Plex Mono', monospace" }}>{item.symbol}</td>
                      <td style={{ padding: '10px', fontSize: '12px', color: '#94a3b8', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}>${item.currentPrice.toFixed(2)}</td>
                      <td style={{ padding: '10px', fontSize: '12px', color: '#a855f7', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}>${item.ma200Week.toFixed(2)}</td>
                      <td style={{ padding: '10px', fontSize: '12px', textAlign: 'right', fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: item.percentFrom200MA < 0 ? '#f87171' : item.percentFrom200MA < 5 ? '#fbbf24' : '#34d399' }}>
                        {item.percentFrom200MA > 0 ? '+' : ''}{item.percentFrom200MA.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {maStatusList.filter(item => item.percentFrom200MA <= 20).length === 0 && (
              <p style={{ color: '#4a5568', fontSize: '12px', textAlign: 'center', padding: '16px 0', fontFamily: "'IBM Plex Mono', monospace" }}>No assets near or below 200W MA</p>
            )}
          </div>
        </div>

      </div>

      {/* Footer note */}
      <div style={{
        marginTop: '16px',
        padding: '10px 14px',
        backgroundColor: 'rgba(30,37,53,0.5)',
        borderRadius: '6px',
        fontSize: '11px',
        color: '#4a5568',
        fontFamily: "'IBM Plex Mono', monospace",
        border: '1px solid #1e2535'
      }}>
        50W MA = medium-term trend · 200W MA = long-term trend. Prices near or below these levels may signal potential buying opportunities or bearish continuation.
      </div>
    </div>
  );
};

export default Below200WeekMA;
