import React from 'react';
import AssetTypePieChart from './AssetTypePieChart';
import SectorPieChart from './SectorPieChart';

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

interface PortfolioAllocationPieChartProps {
  holdings: Holding[];
  recurringInvestments?: RecurringInvestment[];
}

const PortfolioAllocationPieChart: React.FC<PortfolioAllocationPieChartProps> = ({ holdings, recurringInvestments = [] }) => {
  if (holdings.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden p-6">
        <p className="text-gray-500 text-center">No holdings data available</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
      {/* Section 1: Portfolio by Asset Type */}
      <AssetTypePieChart holdings={holdings} recurringInvestments={recurringInvestments} />

      {/* Section 2: Portfolio by Sector */}
      <SectorPieChart holdings={holdings} />
    </div>
  );
};

export default PortfolioAllocationPieChart;
