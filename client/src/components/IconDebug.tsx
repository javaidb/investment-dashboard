import React from 'react';
import { useIcons } from '../hooks/useIcons';
import CompanyIcon from './CompanyIcon';

const IconDebug: React.FC = () => {
  const { iconUrls, isLoading, error, hasIcons } = useIcons({
    symbols: [
      { symbol: 'AAPL', type: 's' },
      { symbol: 'TSLA', type: 's' },
      { symbol: 'BTC', type: 'c' }
    ]
  });

  console.log('IconDebug - iconUrls:', iconUrls);
  console.log('IconDebug - isLoading:', isLoading);
  console.log('IconDebug - error:', error);
  console.log('IconDebug - hasIcons:', hasIcons);

  return (
    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
      <h3 className="text-lg font-bold mb-4">Icon Debug Component</h3>
      
      <div className="mb-4">
        <p><strong>Loading:</strong> {isLoading ? 'Yes' : 'No'}</p>
        <p><strong>Error:</strong> {error ? error.toString() : 'None'}</p>
        <p><strong>Has Icons:</strong> {hasIcons ? 'Yes' : 'No'}</p>
        <p><strong>Icon URLs:</strong> {JSON.stringify(iconUrls, null, 2)}</p>
      </div>

      <div className="flex gap-4">
        <div className="text-center">
          <CompanyIcon
            symbol="AAPL"
            iconUrl={iconUrls['AAPL']}
            companyName="Apple Inc."
            size="10x10"
            showFallback={true}
          />
          <p className="mt-2 text-sm">AAPL</p>
          <p className="text-xs text-gray-500">{iconUrls['AAPL'] || 'No URL'}</p>
        </div>
        
        <div className="text-center">
          <CompanyIcon
            symbol="TSLA"
            iconUrl={iconUrls['TSLA']}
            companyName="Tesla Inc."
            size="10x10"
            showFallback={true}
          />
          <p className="mt-2 text-sm">TSLA</p>
          <p className="text-xs text-gray-500">{iconUrls['TSLA'] || 'No URL'}</p>
        </div>

        <div className="text-center">
          <CompanyIcon
            symbol="BTC"
            iconUrl={iconUrls['BTC']}
            companyName="Bitcoin"
            size="10x10"
            showFallback={true}
          />
          <p className="mt-2 text-sm">BTC</p>
          <p className="text-xs text-gray-500">{iconUrls['BTC'] || 'No URL'}</p>
        </div>
      </div>
    </div>
  );
};

export default IconDebug;