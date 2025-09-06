import React from 'react';

interface CompanyIconProps {
  symbol: string;
  iconUrl?: string;
  companyName?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | '10x10';
  className?: string;
  showFallback?: boolean;
  showTooltip?: boolean;
}

const CompanyIcon: React.FC<CompanyIconProps> = ({
  symbol,
  iconUrl,
  companyName,
  size = '10x10',
  className = '',
  showFallback = true,
  showTooltip = true
}) => {
  const sizeClasses = {
    xs: 'w-4 h-4',
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
    '10x10': 'w-10 h-10'
  };

  const textSizes = {
    xs: 'text-xs',
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
    '10x10': 'text-xs'
  };

  const baseClasses = `${sizeClasses[size]} ${className} flex-shrink-0`;

  // If we have an icon URL, display the image
  if (iconUrl) {
    return (
      <div className={`${baseClasses} relative group`} style={{ width: '40px', height: '40px' }}>
        <img
          src={iconUrl}
          alt={`${companyName || symbol} logo`}
          className="w-full h-full object-contain rounded-lg shadow-sm"
          style={{ width: '40px', height: '40px' }}
          onError={(e) => {
            // If image fails to load, hide it and show fallback
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            const fallback = target.nextElementSibling as HTMLElement;
            if (fallback) {
              fallback.style.display = 'flex';
            }
          }}
        />
        
        {/* Fallback that's initially hidden */}
        {showFallback && (
          <div 
            className={`${baseClasses} rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 text-white font-semibold items-center justify-center ${textSizes[size]} absolute inset-0`}
            style={{ display: 'none', width: '40px', height: '40px' }}
          >
            {symbol.slice(0, 2).toUpperCase()}
          </div>
        )}
        
        {/* Tooltip on hover */}
        {showTooltip && (
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
            {companyName || symbol}
          </div>
        )}
      </div>
    );
  }

  // No icon URL - show fallback or placeholder
  if (showFallback) {
    return (
      <div 
        className={`${baseClasses} rounded-lg bg-gradient-to-br from-blue-400 to-purple-600 text-white font-semibold flex items-center justify-center ${textSizes[size]} group relative border-2 border-blue-300`}
        style={{ width: '40px', height: '40px' }}
      >
        {symbol.slice(0, 2).toUpperCase()}
        
        {/* Tooltip on hover */}
        {showTooltip && (
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
            {companyName || symbol} (fallback)
          </div>
        )}
      </div>
    );
  }

  // No fallback - return nothing
  return null;
};

export default CompanyIcon;