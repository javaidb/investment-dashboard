import React from 'react';
import { useIcons } from '../hooks/useIcons';
import CompanyIcon from './CompanyIcon';

const IconTest: React.FC = () => {
  const testSymbols = [
    { symbol: 'AAPL', type: 's' },
    { symbol: 'MSFT', type: 's' },
    { symbol: 'BTC', type: 'c' },
    { symbol: 'ETH', type: 'c' }
  ];

  const { iconUrls, isLoading, error } = useIcons({
    symbols: testSymbols,
    enabled: true
  });

  console.log('IconTest - iconUrls:', iconUrls);
  console.log('IconTest - isLoading:', isLoading);
  console.log('IconTest - error:', error);

  return (
    <div className="p-6 bg-white rounded-lg shadow">
      <h3 className="text-lg font-semibold mb-4">Icon Test</h3>
      
      <div className="mb-4">
        <p>Loading: {isLoading ? 'Yes' : 'No'}</p>
        <p>Error: {error ? String(error) : 'None'}</p>
        <p>Icon URLs: {JSON.stringify(iconUrls, null, 2)}</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {testSymbols.map(({ symbol, type }) => (
          <div key={symbol} className="text-center">
            <CompanyIcon
              symbol={symbol}
              iconUrl={iconUrls[symbol.toUpperCase()]}
              companyName={symbol}
              size="10x10"
              showFallback={true}
            />
            <p className="mt-2 text-sm">{symbol}</p>
            <p className="text-xs text-gray-500">
              URL: {iconUrls[symbol.toUpperCase()] || 'None'}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default IconTest;