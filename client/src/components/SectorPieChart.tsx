import React, { useState } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import CompanyIcon from './CompanyIcon';
import { useIcons } from '../hooks/useIcons';

interface Holding {
  symbol: string;
  quantity: number;
  type: string;
  companyName?: string;
  sector?: string;
  subsector?: string | string[] | null;
  currentValue?: number;
}

interface SectorPieChartProps {
  holdings: Holding[];
}

const HUE_PALETTE = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#F97316','#84CC16','#EC4899','#6366F1','#FBBF24','#a78bfa'];

const SectorPieChart: React.FC<SectorPieChartProps> = ({ holdings }) => {
  const [selectedSector, setSelectedSector] = useState<string | null>(null);

  // Fetch icons for all holdings
  const symbolsForIcons = holdings.map(holding => ({
    symbol: holding.symbol,
    type: holding.type || 's'
  }));

  const { iconUrls } = useIcons({
    symbols: symbolsForIcons,
    enabled: holdings.length > 0
  });

  // Prepare combined data for assets list
  const combinedData = holdings
    .filter(holding => holding.quantity > 0.01 && holding.currentValue && holding.currentValue > 0)
    .map(holding => ({
      symbol: holding.symbol,
      name: holding.companyName || holding.symbol,
      value: holding.currentValue || 0,
      type: holding.type,
      iconUrl: iconUrls[holding.symbol.toUpperCase()]
    }));

  // Calculate sector allocation from holdings (excluding cryptocurrency)
  const sectorData = holdings
    .filter(holding => holding.quantity > 0.01 && holding.currentValue && holding.currentValue > 0)
    .filter(holding => holding.type !== 'c') // Exclude cryptocurrency
    .reduce((acc, holding) => {
      let sector = holding.sector;

      // If no sector, derive from type/symbol
      if (!sector) {
        if (holding.symbol?.includes('XEQT') || holding.symbol?.includes('VOO') ||
                   holding.symbol?.includes('QQQ') || holding.symbol?.includes('IBIT')) {
          sector = 'ETF - Index Fund';
        } else {
          sector = 'Unknown';
        }
      }

      acc[sector] = (acc[sector] || 0) + (holding.currentValue || 0);
      return acc;
    }, {} as {[key: string]: number});

  const sectorChartData = Object.entries(sectorData)
    .map(([sector, value]) => ({ sector, value }))
    .sort((a, b) => b.value - a.value);

  const totalSectorValue = sectorChartData.reduce((sum, sector) => sum + sector.value, 0);

  // Colors for sectors (diverse palette)
  const sectorColors: {[key: string]: string} = {
    'Tech': '#3B82F6',
    'Consumer Cyclical': '#10B981',
    'Industrials': '#F59E0B',
    'Healthcare': '#EF4444',
    'Financial Services': '#8B5CF6',
    'Utilities': '#06B6D4',
    'Energy': '#F97316',
    'Materials': '#84CC16',
    'Real Estate': '#EC4899',
    'Telecommunications': '#6366F1',
    'ETF': '#9333EA',
    'Alternative Investments': '#8B5CF6',
    'Cryptocurrency': '#FBBF24',
    'Unknown': '#9CA3AF'
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatSectorPercent = (value: number) => {
    const percent = (value / totalSectorValue) * 100;
    return `${percent.toFixed(1)}%`;
  };

  const mono = "'IBM Plex Mono', 'Courier New', monospace";

  if (holdings.length === 0) {
    return (
      <div style={{ backgroundColor: '#10141c', borderRadius: '6px', border: '1px solid #1e2535', padding: '16px', textAlign: 'center' }}>
        <p style={{ fontFamily: mono, color: '#4a5568', fontSize: '12px' }}>No holdings data available</p>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: '#10141c', borderRadius: '6px', border: '1px solid #1e2535', overflow: 'hidden' }}>
      <div style={{ background: '#141820', padding: '12px 20px', borderBottom: '1px solid #1e2535' }}>
        <div style={{ fontFamily: mono, fontSize: '11px', fontWeight: 700, color: '#4a5568', letterSpacing: '0.14em', textTransform: 'uppercase' as const }}>Portfolio by Sector</div>
        <p style={{ fontFamily: mono, fontSize: '11px', color: '#4a5568', marginTop: '2px', margin: '2px 0 0' }}>Diversification across industries</p>
      </div>

      <div style={{ padding: '16px' }}>
        {sectorChartData.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center' }}>
            <p style={{ fontFamily: mono, color: '#4a5568', fontSize: '12px' }}>Loading sector data…</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '16px' }}>
            {/* Pie Chart Section */}
            <div>
              <div style={{ fontFamily: mono, fontSize: '11px', fontWeight: 600, color: '#4a5568', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: '4px', textAlign: 'center' }}>Sector Allocation</div>
              <ResponsiveContainer width="100%" height={480}>
                <PieChart>
                  <Pie
                    data={sectorChartData}
                    cx="50%" cy="50%" labelLine={false} outerRadius={165} innerRadius={65}
                    fill="#8884d8" dataKey="value" startAngle={90} endAngle={-270}
                    style={{ cursor: 'pointer' }}
                    onClick={(data: any) => setSelectedSector(data.sector)}
                    label={(props) => {
                      const { cx, cy, midAngle, outerRadius, percent, index } = props;
                      if (percent === undefined || percent < 0.03) return null;
                      if (midAngle === undefined || cx === undefined || cy === undefined || outerRadius === undefined || index === undefined) return null;
                      const RADIAN = Math.PI / 180;
                      const x1 = cx + (outerRadius + 5) * Math.cos(-midAngle * RADIAN);
                      const y1 = cy + (outerRadius + 5) * Math.sin(-midAngle * RADIAN);
                      const x2 = cx + (outerRadius + 35) * Math.cos(-midAngle * RADIAN);
                      const y2 = cy + (outerRadius + 35) * Math.sin(-midAngle * RADIAN);
                      const sector = sectorChartData[index];
                      if (!sector) return null;
                      const isRight = Math.cos(-midAngle * RADIAN) > 0;
                      const textAnchor = isRight ? 'start' : 'end';
                      const textX = isRight ? x2 + 5 : x2 - 5;
                      return (
                        <g>
                          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#1e2535" strokeWidth={1} />
                          <text x={textX} y={y2 - 2} textAnchor={textAnchor} fill="#e2e8f0" fontSize="11px" fontWeight="600" fontFamily={mono}>{sector.sector}</text>
                          <text x={textX} y={y2 + 10} textAnchor={textAnchor} fill="#4a5568" fontSize="10px" fontFamily={mono}>{formatSectorPercent(sector.value)}</text>
                        </g>
                      );
                    }}
                  >
                    {sectorChartData.map((entry, index) => (
                      <Cell key={`sector-cell-${index}`} fill={sectorColors[entry.sector] || '#9CA3AF'} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }: any) => {
                      if (active && payload?.length) {
                        const data = payload[0].payload;
                        return (
                          <div style={{ backgroundColor: '#10141c', padding: '10px 14px', border: '1px solid #1e2535', borderRadius: '4px' }}>
                            <p style={{ fontFamily: mono, fontWeight: 700, margin: '0 0 4px', color: '#e2e8f0', fontSize: '12px' }}>{data.sector}</p>
                            <p style={{ fontFamily: mono, margin: '2px 0', color: '#94a3b8', fontSize: '11px' }}>Value: {formatCurrency(data.value)}</p>
                            <p style={{ fontFamily: mono, margin: '2px 0', color: '#94a3b8', fontSize: '11px' }}>Alloc: {formatSectorPercent(data.value)}</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>

              {/* Sector breakdown list below chart */}
              <div style={{ marginTop: '8px', padding: '10px', backgroundColor: '#141820', borderRadius: '4px', maxHeight: '180px', overflowY: 'auto' }}>
                <div style={{ fontFamily: mono, fontSize: '10px', fontWeight: 600, color: '#4a5568', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: '8px' }}>Sector Breakdown</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {sectorChartData.map((sector) => (
                    <div
                      key={sector.sector}
                      onClick={() => setSelectedSector(sector.sector)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '3px 6px', borderRadius: '3px', transition: 'background 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1e2535')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '8px', height: '8px', backgroundColor: sectorColors[sector.sector] || '#9CA3AF', borderRadius: '2px', flexShrink: 0 }}></div>
                        <span style={{ fontFamily: mono, fontSize: '11px', color: '#94a3b8' }}>{sector.sector}</span>
                      </div>
                      <span style={{ fontFamily: mono, fontSize: '11px', fontWeight: 600, color: '#e2e8f0' }}>{formatSectorPercent(sector.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Individual Assets by Sector List */}
            <div>
              <div style={{ fontFamily: mono, fontSize: '11px', fontWeight: 600, color: '#4a5568', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: '8px' }}>Assets by Sector</div>
              <div style={{ maxHeight: '700px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {combinedData
                  .filter(asset => asset.type !== 'c')
                  .sort((a, b) => {
                    const sectorA = holdings.find(h => h.symbol === a.symbol)?.sector || 'Unknown';
                    const sectorB = holdings.find(h => h.symbol === b.symbol)?.sector || 'Unknown';
                    const sectorATotal = sectorChartData.find(s => s.sector === sectorA)?.value || 0;
                    const sectorBTotal = sectorChartData.find(s => s.sector === sectorB)?.value || 0;
                    if (sectorATotal !== sectorBTotal) return sectorBTotal - sectorATotal;
                    return b.value - a.value;
                  })
                  .map((asset) => {
                    const holding = holdings.find(h => h.symbol === asset.symbol);
                    const sector = holding?.sector || 'Unknown';
                    const rawSub = holding?.subsector;
                    const subsector = Array.isArray(rawSub) ? rawSub[0] : rawSub;
                    const sectorColor = sectorColors[sector] || '#9CA3AF';
                    return (
                      <div key={asset.symbol} style={{ padding: '6px 10px', backgroundColor: '#141820', borderRadius: '4px', borderLeft: `3px solid ${sectorColor}`, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <CompanyIcon symbol={asset.symbol} iconUrl={asset.iconUrl} companyName={asset.name} size="xs" showFallback={true} showTooltip={false} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontFamily: mono, fontSize: '12px', fontWeight: 600, margin: 0, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{asset.symbol}</p>
                          <p style={{ fontFamily: mono, fontSize: '10px', margin: 0, color: '#4a5568' }}>{sector}{subsector ? ` / ${subsector}` : ''}</p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ fontFamily: mono, fontSize: '12px', fontWeight: 600, color: '#e2e8f0', margin: 0, whiteSpace: 'nowrap' }}>{formatCurrency(asset.value)}</p>
                          <p style={{ fontFamily: mono, fontSize: '10px', color: '#4a5568', margin: 0 }}>{formatSectorPercent(asset.value)}</p>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sector drilldown modal */}
      {selectedSector && (() => {
        const sectorHoldings = holdings.filter(h => h.sector === selectedSector && (h.quantity ?? 0) > 0.001 && (h.currentValue ?? 0) > 0);
        const sectorTotal = sectorHoldings.reduce((s, h) => s + (h.currentValue ?? 0), 0);
        const subsectorMap: Record<string, number> = {};
        for (const h of sectorHoldings) {
          const sub = (Array.isArray(h.subsector) ? h.subsector[0] : h.subsector) || 'Other';
          subsectorMap[sub] = (subsectorMap[sub] ?? 0) + (h.currentValue ?? 0);
        }
        const subsectorData = Object.entries(subsectorMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

        return (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setSelectedSector(null)}>
            <div style={{ backgroundColor: '#10141c', border: '1px solid #1e2535', borderRadius: '8px', padding: '24px', width: '460px', maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <div style={{ fontFamily: mono, fontSize: '16px', fontWeight: 700, color: '#e2e8f0', margin: 0 }}>{selectedSector}</div>
                  <p style={{ fontFamily: mono, fontSize: '12px', color: '#4a5568', margin: '3px 0 0' }}>{sectorHoldings.length} position{sectorHoldings.length !== 1 ? 's' : ''} · {formatCurrency(sectorTotal)}</p>
                </div>
                <button onClick={() => setSelectedSector(null)} style={{ border: '1px solid #1e2535', background: '#141820', borderRadius: '4px', padding: '5px 10px', cursor: 'pointer', fontSize: '14px', color: '#94a3b8', fontFamily: mono }}>✕</button>
              </div>
              {subsectorData.length > 0 ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <PieChart width={200} height={200}>
                      <Pie data={subsectorData} cx={100} cy={100} innerRadius={45} outerRadius={85} dataKey="value" startAngle={90} endAngle={-270}>
                        {subsectorData.map((_, i) => <Cell key={i} fill={HUE_PALETTE[i % HUE_PALETTE.length]} />)}
                      </Pie>
                      <Tooltip content={({ active, payload }: any) => {
                        if (active && payload?.length) {
                          const d = payload[0].payload;
                          return (
                            <div style={{ background: '#10141c', border: '1px solid #1e2535', borderRadius: '4px', padding: '8px 12px', fontFamily: mono, fontSize: '12px', color: '#e2e8f0' }}>
                              <strong>{d.name}</strong><br />{formatCurrency(d.value)} · {sectorTotal > 0 ? ((d.value / sectorTotal) * 100).toFixed(1) : 0}%
                            </div>
                          );
                        }
                        return null;
                      }} />
                    </PieChart>
                  </div>
                  <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '180px', overflowY: 'auto' }}>
                    {subsectorData.map((s, i) => (
                      <div key={s.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 8px', backgroundColor: '#141820', borderRadius: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: HUE_PALETTE[i % HUE_PALETTE.length], flexShrink: 0 }} />
                          <span style={{ fontFamily: mono, fontSize: '12px', fontWeight: 600, color: '#e2e8f0' }}>{s.name}</span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontFamily: mono, fontSize: '12px', color: '#94a3b8' }}>{formatCurrency(s.value)}</span>
                          <span style={{ fontFamily: mono, fontSize: '10px', color: '#4a5568', marginLeft: '6px' }}>{sectorTotal > 0 ? ((s.value / sectorTotal) * 100).toFixed(1) : 0}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p style={{ textAlign: 'center', fontFamily: mono, color: '#4a5568', fontSize: '12px', padding: '20px 0' }}>No active positions</p>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default SectorPieChart;
