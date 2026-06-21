import React, { useState } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip
} from 'recharts';
import CompanyIcon from './CompanyIcon';
import { useIcons } from '../hooks/useIcons';

interface Holding {
  symbol: string;
  quantity: number;
  averagePrice: number;
  totalInvested: number;
  totalAmountInvested?: number;
  realizedPnL: number;
  amountSold?: number;
  type: string;
  currency: string;
  companyName?: string;
  sector?: string;
  currentPrice?: number;
  currentValue?: number;
  unrealizedPnL?: number;
  totalPnL?: number;
  totalPnLPercent?: number;
  weeklyChangePercent?: number | number[] | null;
  usdPrice?: number;
  exchangeRate?: number;
}

interface RecurringInvestment {
  symbol: string;
  name: string;
  currentValue: number;
  totalInvested: number;
}

interface AssetTypePieChartProps {
  holdings: Holding[];
  recurringInvestments?: RecurringInvestment[];
}

const AssetTypePieChart: React.FC<AssetTypePieChartProps> = ({ holdings, recurringInvestments = [] }) => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // Fetch icons for all holdings
  const symbolsForIcons = holdings.map(holding => ({
    symbol: holding.symbol,
    type: holding.type || 's'
  }));

  const { iconUrls } = useIcons({
    symbols: symbolsForIcons,
    enabled: holdings.length > 0
  });

  // Prepare data for pie chart - group by asset with current value
  const assetData = holdings
    .filter(holding => holding.quantity > 0.01 && holding.currentValue && holding.currentValue > 0)
    .map(holding => {
      // Determine category
      let category = 'Stock';
      if (holding.type === 'c') {
        category = 'Crypto';
      } else if (holding.symbol.includes('XEQT') || holding.symbol.includes('VOO') || holding.symbol.includes('QQQ') || holding.symbol.includes('IBIT')) {
        category = 'ETF';
      }

      return {
        symbol: holding.symbol,
        name: holding.companyName || holding.symbol,
        value: holding.currentValue || 0,
        category: category,
        type: holding.type,
        iconUrl: iconUrls[holding.symbol.toUpperCase()]
      };
    });

  // Add recurring investments as separate category (red)
  const recurringData = recurringInvestments
    .filter(inv => inv.currentValue > 0)
    .map(inv => ({
      symbol: inv.symbol,
      name: inv.name,
      value: inv.currentValue,
      category: 'Index Fund',
      type: 's',
      iconUrl: iconUrls[inv.symbol.toUpperCase()]
    }));

  // Combine both datasets
  const combinedData = [...assetData, ...recurringData]
    .sort((a, b) => {
      // First, sort by category to group them together
      const categoryOrder: {[key: string]: number} = { 'Crypto': 0, 'ETF': 1, 'Index Fund': 2, 'Stock': 3 };
      if (categoryOrder[a.category] !== categoryOrder[b.category]) {
        return categoryOrder[a.category] - categoryOrder[b.category];
      }
      // Within same category, sort by value descending
      return b.value - a.value;
    });

  // Calculate totals by category (using combined data)
  const categoryTotals = combinedData.reduce((acc, asset) => {
    acc[asset.category] = (acc[asset.category] || 0) + asset.value;
    return acc;
  }, {} as {[key: string]: number});

  const totalValue = combinedData.reduce((sum, asset) => sum + asset.value, 0);

  // Colors for categories
  const categoryColors: {[key: string]: string} = {
    'Crypto': '#F59E0B',
    'ETF': '#3B82F6',
    'Stock': '#10B981',
    'Index Fund': '#DC2626',  // Red for recurring investments
    'ETF + Index Fund': '#9333EA'  // Purple for combined target allocation
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercent = (value: number) => {
    const percent = (value / totalValue) * 100;
    return `${percent.toFixed(1)}%`;
  };

  const targetAllocations: {[key: string]: number} = {
    'Crypto': 10,
    'Stock': 40
  };
  const etfIndexTarget = 50;
  const etfIndexCombinedPct = totalValue > 0
    ? (((categoryTotals['ETF'] || 0) + (categoryTotals['Index Fund'] || 0)) / totalValue) * 100
    : 0;

  const mono = "'IBM Plex Mono', monospace";
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div style={{ backgroundColor: '#10141c', padding: '10px 14px', border: '1px solid #1e2535', borderRadius: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <CompanyIcon symbol={data.symbol} iconUrl={data.iconUrl} companyName={data.name} size="xs" showFallback={true} showTooltip={false} />
            <div>
              <p style={{ fontFamily: mono, fontWeight: 700, margin: 0, color: '#e2e8f0', fontSize: '12px' }}>{data.symbol}</p>
              <p style={{ fontFamily: mono, fontSize: '11px', margin: 0, color: '#4a5568' }}>{data.category}</p>
            </div>
          </div>
          <p style={{ fontFamily: mono, margin: '3px 0', color: '#94a3b8', fontSize: '11px' }}>Value: {formatCurrency(data.value)}</p>
          <p style={{ fontFamily: mono, margin: '3px 0', color: '#94a3b8', fontSize: '11px' }}>Alloc: {formatPercent(data.value)}</p>
        </div>
      );
    }
    return null;
  };

  // Custom label to show asset symbols with lines
  const renderCustomLabel = (props: any) => {
    const { cx, cy, midAngle, outerRadius, percent, index } = props;

    // Only show label if slice is large enough (> 2%)
    if (percent < 0.02) return null;

    const RADIAN = Math.PI / 180;

    // Position for line start (edge of pie)
    const startRadius = outerRadius + 5;
    const x1 = cx + startRadius * Math.cos(-midAngle * RADIAN);
    const y1 = cy + startRadius * Math.sin(-midAngle * RADIAN);

    // Position for line end and label
    const lineLength = 35;
    const x2 = cx + (outerRadius + lineLength) * Math.cos(-midAngle * RADIAN);
    const y2 = cy + (outerRadius + lineLength) * Math.sin(-midAngle * RADIAN);

    const asset = combinedData[index];
    if (!asset) return null;

    // Determine text anchor based on which side of the pie
    const isRightSide = Math.cos(-midAngle * RADIAN) > 0;
    const textAnchor = isRightSide ? 'start' : 'end';
    const textX = isRightSide ? x2 + 5 : x2 - 5;

    return (
      <g>
        {/* Line from pie edge to label */}
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#1e2535" strokeWidth={1} />
        <text x={textX} y={y2 - 2} textAnchor={textAnchor} fill="#e2e8f0" fontSize="12px" fontWeight="600" fontFamily="'IBM Plex Mono', monospace">
          {asset.symbol}
        </text>
        <text x={textX} y={y2 + 10} textAnchor={textAnchor} fill="#4a5568" fontSize="11px" fontFamily="'IBM Plex Mono', monospace">
          {formatPercent(asset.value)}
        </text>
      </g>
    );
  };

  const onPieEnter = (_: any, index: number) => {
    setActiveIndex(index);
  };

  const onPieLeave = () => {
    setActiveIndex(null);
  };

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
        <div style={{ fontFamily: mono, fontSize: '11px', fontWeight: 700, color: '#4a5568', letterSpacing: '0.14em', textTransform: 'uppercase' as const }}>Portfolio by Asset Type</div>
        <p style={{ fontFamily: mono, fontSize: '11px', color: '#4a5568', marginTop: '2px', margin: '2px 0 0' }}>
          Current vs target allocation
        </p>
      </div>

      <div style={{ padding: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '16px' }}>
          {/* Individual Assets List */}
          <div>
            <div style={{ fontFamily: mono, fontSize: '11px', fontWeight: 600, color: '#4a5568', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: '8px' }}>
              Individual Assets
            </div>
            <div style={{ maxHeight: '600px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', paddingRight: '4px' }}>
              {combinedData.map((asset, index) => (
                <div
                  key={asset.symbol}
                  style={{ padding: '6px 10px', backgroundColor: '#141820', borderRadius: '4px', borderLeft: `3px solid ${categoryColors[asset.category]}`, cursor: 'pointer', opacity: activeIndex === null || activeIndex === index ? 1 : 0.5, display: 'flex', alignItems: 'center', gap: '8px' }}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(null)}
                >
                  <CompanyIcon symbol={asset.symbol} iconUrl={asset.iconUrl} companyName={asset.name} size="xs" showFallback={true} showTooltip={false} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontFamily: mono, fontSize: '12px', fontWeight: 600, margin: 0, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{asset.symbol}</p>
                    <p style={{ fontFamily: mono, fontSize: '10px', margin: 0, color: '#4a5568' }}>{asset.category}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontFamily: mono, fontSize: '12px', fontWeight: 600, color: '#e2e8f0', margin: 0, whiteSpace: 'nowrap' }}>{formatCurrency(asset.value)}</p>
                    <p style={{ fontFamily: mono, fontSize: '10px', color: '#4a5568', margin: 0 }}>{formatPercent(asset.value)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pie Chart Section */}
          <div>
            <div style={{ fontFamily: mono, fontSize: '11px', fontWeight: 600, color: '#4a5568', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: '4px', textAlign: 'center' }}>
              Current vs Target Allocation
            </div>
            <div style={{ marginBottom: '8px', textAlign: 'center' }}>
              <p style={{ fontFamily: mono, fontSize: '11px', color: '#4a5568', margin: '2px 0' }}>
                Target: Crypto 10% · ETF/Index 50% · Stock 40%
              </p>
            </div>
            <ResponsiveContainer width="100%" height={480}>
              <PieChart>
                <defs>
                  <linearGradient id="etfIndexGradient" x1="0%" y1="50%" x2="100%" y2="50%">
                    <stop offset="0%" stopColor="#DC2626" />
                    <stop offset="100%" stopColor="#3B82F6" />
                  </linearGradient>
                </defs>

                <Pie
                  data={[{ category: 'Crypto', value: 10 }, { category: 'ETF + Index Fund', value: 50 }, { category: 'Stock', value: 40 }]}
                  cx="50%" cy="50%" labelLine={false} outerRadius={185} innerRadius={55} fill="#8884d8" dataKey="value" startAngle={90} endAngle={-270}
                >
                  {[{ category: 'Crypto', value: 10 }, { category: 'ETF + Index Fund', value: 50 }, { category: 'Stock', value: 40 }].map((entry, index) => (
                    <Cell key={`target-cell-${index}`} fill={entry.category === 'ETF + Index Fund' ? 'url(#etfIndexGradient)' : categoryColors[entry.category]} opacity={0.2} stroke="#0a0c10" strokeWidth={2} />
                  ))}
                </Pie>

                <Pie
                  data={combinedData}
                  cx="50%" cy="50%" labelLine={false} label={renderCustomLabel}
                  outerRadius={160} innerRadius={65} fill="#8884d8" dataKey="value"
                  onMouseEnter={onPieEnter} onMouseLeave={onPieLeave} startAngle={90} endAngle={-270}
                >
                  {combinedData.map((entry, index) => {
                    const isActive = activeIndex === null || activeIndex === index;
                    return (
                      <Cell
                        key={`cell-${index}`}
                        fill={categoryColors[entry.category]}
                        opacity={isActive ? 1 : 0.6}
                      />
                    );
                  })}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>

            {/* Category breakdown cards below chart */}
            <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
              {Object.entries(categoryTotals).map(([category, value]) => (
                <div
                  key={category}
                  style={{ padding: '10px 12px', backgroundColor: '#141820', borderRadius: '4px', borderLeft: `3px solid ${categoryColors[category]}`, cursor: 'pointer' }}
                  onMouseEnter={() => { const index = combinedData.findIndex(d => d.category === category); if (index !== -1) setActiveIndex(index); }}
                  onMouseLeave={() => setActiveIndex(null)}
                >
                  <p style={{ fontFamily: mono, fontSize: '11px', fontWeight: 600, color: '#4a5568', margin: '0 0 4px 0', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>{category}</p>
                  <p style={{ fontFamily: mono, fontSize: '16px', fontWeight: 700, color: '#e2e8f0', margin: '0 0 2px 0' }}>{formatCurrency(value)}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <p style={{ fontFamily: mono, fontSize: '12px', color: '#94a3b8', margin: 0 }}>{formatPercent(value)}</p>
                    {(() => {
                      const currentPct = totalValue > 0 ? (value / totalValue) * 100 : 0;
                      let target: number | null = null;
                      let comparePct = currentPct;
                      let targetLabel = '';
                      if (category === 'ETF' || category === 'Index Fund') {
                        target = etfIndexTarget; comparePct = etfIndexCombinedPct; targetLabel = `${etfIndexTarget}% combined`;
                      } else if (targetAllocations[category] !== undefined) {
                        target = targetAllocations[category]; targetLabel = `${target}% target`;
                      }
                      if (target === null) return null;
                      const isAbove = comparePct > target;
                      return (
                        <span style={{ fontFamily: mono, display: 'flex', alignItems: 'center', gap: '2px', color: isAbove ? '#ef4444' : '#22c55e', fontSize: '11px', fontWeight: 600 }}>
                          {isAbove ? '▲' : '▼'} {targetLabel}
                        </span>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssetTypePieChart;
