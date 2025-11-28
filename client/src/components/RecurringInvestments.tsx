import React from 'react';
import { useCache } from '../contexts/CacheContext';

const RecurringInvestments: React.FC = () => {
  const { recurringInvestments, isLoading } = useCache();

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">Recurring Investments</h2>
        <div className="text-center py-4 text-gray-500">Loading recurring investments...</div>
      </div>
    );
  }

  if (!recurringInvestments || !recurringInvestments.investments || recurringInvestments.investments.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">Recurring Investments</h2>
        <div className="text-center py-4 text-gray-500">
          No recurring investments configured. Edit the config file to add your index funds.
        </div>
      </div>
    );
  }

  const { investments, totals } = recurringInvestments;
  const enabledInvestments = investments.filter((inv: any) => inv.enabled);

  if (enabledInvestments.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">Recurring Investments</h2>
        <div className="text-center py-4 text-gray-500">
          All recurring investments are currently disabled.
        </div>
      </div>
    );
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 2
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '16px',
      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
      border: '1px solid #e5e7eb',
      overflow: 'hidden',
      width: '100%',
      marginBottom: '24px'
    }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(to right, #C8102E, #EE0000)',
        padding: '20px 24px',
        borderBottom: '1px solid #A00000'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{
              fontSize: '20px',
              fontWeight: 'bold',
              color: 'white',
              marginBottom: '4px'
            }}>Recurring Investments</h2>
            <p style={{
              fontSize: '14px',
              color: 'white',
              opacity: 0.95
            }}>Automated Index Fund Contributions</p>
          </div>
          <div style={{
            backgroundColor: 'white',
            padding: '8px 16px',
            borderRadius: '20px',
            fontSize: '14px',
            fontWeight: '600',
            color: '#C8102E',
            border: '2px solid white'
          }}>
            {enabledInvestments.length} Fund{enabledInvestments.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Totals Summary */}
      <div style={{
        padding: '20px 24px',
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '24px',
        backgroundColor: '#fef2f2',
        borderBottom: '1px solid #fecaca'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontSize: '28px',
            fontWeight: '700',
            color: '#991b1b',
            marginBottom: '4px',
            fontFamily: 'Futura, "Trebuchet MS", Arial, sans-serif'
          }}>
            {formatCurrency(totals.totalInvested)}
          </div>
          <div style={{
            fontSize: '12px',
            color: '#991b1b',
            backgroundColor: 'white',
            padding: '2px 8px',
            borderRadius: '12px',
            display: 'inline-block',
            border: '1px solid #f87171'
          }}>
            Total Invested
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontSize: '28px',
            fontWeight: '700',
            color: '#991b1b',
            marginBottom: '4px',
            fontFamily: 'Futura, "Trebuchet MS", Arial, sans-serif'
          }}>
            {formatCurrency(totals.currentValue)}
          </div>
          <div style={{
            fontSize: '12px',
            color: '#991b1b',
            backgroundColor: 'white',
            padding: '2px 8px',
            borderRadius: '12px',
            display: 'inline-block',
            border: '1px solid #f87171'
          }}>
            Current Value
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontSize: '28px',
            fontWeight: '700',
            color: totals.profitLoss >= 0 ? '#166534' : '#dc2626',
            marginBottom: '4px',
            fontFamily: 'Futura, "Trebuchet MS", Arial, sans-serif'
          }}>
            {formatCurrency(totals.profitLoss)}
          </div>
          <div style={{
            fontSize: '12px',
            color: '#991b1b',
            backgroundColor: 'white',
            padding: '2px 8px',
            borderRadius: '12px',
            display: 'inline-block',
            border: '1px solid #f87171'
          }}>
            Total P/L
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontSize: '28px',
            fontWeight: '700',
            color: totals.profitLossPercent >= 0 ? '#166534' : '#dc2626',
            marginBottom: '4px',
            fontFamily: 'Futura, "Trebuchet MS", Arial, sans-serif'
          }}>
            {formatPercent(totals.profitLossPercent)}
          </div>
          <div style={{
            fontSize: '12px',
            color: '#991b1b',
            backgroundColor: 'white',
            padding: '2px 8px',
            borderRadius: '12px',
            display: 'inline-block',
            border: '1px solid #f87171'
          }}>
            Return
          </div>
        </div>
      </div>

      {/* Individual Investments */}
      <div style={{ padding: '24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {enabledInvestments.map((investment: any, index: number) => (
            <div key={investment.id} style={{
              backgroundColor: index % 2 === 0 ? '#ffffff' : '#fef2f2',
              border: '2px solid #fecaca',
              borderRadius: '12px',
              padding: '16px 24px',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '24px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(220, 38, 38, 0.15)';
              e.currentTarget.style.borderColor = '#f87171';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = 'none';
              e.currentTarget.style.borderColor = '#fecaca';
            }}>
              {/* Fund Name - Fixed Width */}
              <div style={{ width: '250px', flexShrink: 0 }}>
                <h3 style={{
                  fontSize: '16px',
                  fontWeight: '700',
                  color: '#991b1b',
                  marginBottom: '2px'
                }}>{investment.name}</h3>
                <div style={{
                  fontSize: '12px',
                  color: '#dc2626',
                  fontWeight: '500'
                }}>
                  {investment.symbol} · {investment.institution}
                </div>
              </div>

              {/* Vertical Separator */}
              <div style={{
                width: '2px',
                height: '50px',
                backgroundColor: '#fecaca',
                flexShrink: 0
              }}></div>

              {/* Stats in single row - Aligned columns */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1.2fr 0.9fr 1.1fr 1fr 1.3fr 1.3fr',
                gap: '16px',
                flex: 1,
                alignItems: 'center'
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: '#991b1b', fontWeight: '600', marginBottom: '4px' }}>Initial</div>
                  <div style={{ fontWeight: '700', color: '#dc2626', fontSize: '14px' }}>{formatCurrency(investment.initialAmount)}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: '#991b1b', fontWeight: '600', marginBottom: '4px' }}>Recurring</div>
                  <div style={{ fontWeight: '700', color: '#dc2626', fontSize: '14px' }}>
                    {formatCurrency(investment.recurringAmount)}/{investment.frequency}
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: '#991b1b', fontWeight: '600', marginBottom: '4px' }}>Count</div>
                  <div style={{ fontWeight: '700', color: '#dc2626', fontSize: '14px' }}>{investment.contributionCount}x</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: '#991b1b', fontWeight: '600', marginBottom: '4px' }}>Total Invested</div>
                  <div style={{ fontWeight: '700', color: '#dc2626', fontSize: '14px' }}>{formatCurrency(investment.totalInvested)}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: '#991b1b', fontWeight: '600', marginBottom: '4px' }}>Price</div>
                  <div style={{ fontWeight: '700', color: '#dc2626', fontSize: '14px' }}>{formatCurrency(investment.currentPrice)}</div>
                </div>
                <div style={{
                  textAlign: 'center',
                  padding: '8px 12px',
                  backgroundColor: investment.profitLoss >= 0 ? '#dcfce7' : '#fef2f2',
                  borderRadius: '8px',
                  border: investment.profitLoss >= 0 ? '1px solid #bbf7d0' : '1px solid #fecaca'
                }}>
                  <div style={{ fontSize: '10px', color: '#991b1b', fontWeight: '600', marginBottom: '4px' }}>Profit/Loss</div>
                  <div style={{
                    fontWeight: '700',
                    color: investment.profitLoss >= 0 ? '#166534' : '#dc2626',
                    fontSize: '14px'
                  }}>
                    {formatCurrency(investment.profitLoss)}
                  </div>
                  <div style={{ fontSize: '11px', marginTop: '2px', color: investment.profitLoss >= 0 ? '#166534' : '#dc2626' }}>
                    ({formatPercent(investment.profitLossPercent)})
                  </div>
                </div>
                <div style={{
                  textAlign: 'center',
                  padding: '8px 12px',
                  backgroundColor: '#fff5f5',
                  borderRadius: '8px',
                  border: '2px solid #fecaca'
                }}>
                  <div style={{ fontSize: '10px', color: '#991b1b', fontWeight: '600', marginBottom: '4px' }}>Current Value</div>
                  <div style={{
                    fontWeight: '700',
                    color: '#dc2626',
                    fontSize: '14px'
                  }}>
                    {formatCurrency(investment.currentValue)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: '12px 24px',
        backgroundColor: '#fef2f2',
        borderTop: '1px solid #fecaca',
        fontSize: '11px',
        color: '#991b1b',
        textAlign: 'center'
      }}>
        Started tracking from {enabledInvestments[0]?.initialDate || 'N/A'} ·
        Auto-calculated contributions based on frequency ·
        Edit recurring-investments.json to modify
      </div>
    </div>
  );
};

export default RecurringInvestments;
