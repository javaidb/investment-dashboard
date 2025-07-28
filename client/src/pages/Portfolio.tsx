import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, Trash2, TrendingUp, TrendingDown } from 'lucide-react';
import axios from 'axios';

interface Portfolio {
  id: string;
  summary: {
    totalInvested: number;
    totalRealized: number;
    totalHoldings: number;
    totalQuantity: number;
  };
  holdings: Array<{
    symbol: string;
    quantity: number;
    averagePrice: number;
    totalInvested: number;
    realizedPnL: number;
    currentPrice?: number;
    currentValue?: number;
    unrealizedPnL?: number;
    totalPnL?: number;
    totalPnLPercent?: number;
  }>;
  createdAt: string;
}

const Portfolio: React.FC = () => {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const queryClient = useQueryClient();

  const { data: portfolios, isLoading } = useQuery(
    'portfolios',
    async () => {
      const response = await axios.get('/api/portfolio');
      return response.data;
    }
  );

  const uploadMutation = useMutation(
    async (file: File) => {
      const formData = new FormData();
      formData.append('trades', file);
      const response = await axios.post('/api/portfolio/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('portfolios');
        setUploadedFile(null);
      },
    }
  );

  const deleteMutation = useMutation(
    async (portfolioId: string) => {
      await axios.delete(`/api/portfolio/${portfolioId}`);
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('portfolios');
      },
    }
  );

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setUploadedFile(acceptedFiles[0]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
    },
    multiple: false,
  });

  const handleUpload = () => {
    if (uploadedFile) {
      uploadMutation.mutate(uploadedFile);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatPercentage = (value: number) => {
    return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header Section */}
      <div className="dashboard-header">
        <div className="dashboard-header-content">
          <h1 className="dashboard-title">Portfolio Management</h1>
          <p className="dashboard-subtitle">Upload and manage your investment portfolios</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="dashboard-content">
        <div className="dashboard-section">
      {/* Upload Section */}
      <div className="card">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Upload Portfolio</h2>
        
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            isDragActive
              ? 'border-primary-500 bg-primary-50'
              : 'border-gray-300 hover:border-primary-400'
          }`}
        >
          <input {...getInputProps()} />
          <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          {uploadedFile ? (
            <div>
              <p className="text-sm font-medium text-gray-900">{uploadedFile.name}</p>
              <p className="text-sm text-gray-500">
                {(uploadedFile.size / 1024).toFixed(1)} KB
              </p>
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium text-gray-900">
                {isDragActive ? 'Drop the CSV file here' : 'Drag & drop a CSV file here'}
              </p>
              <p className="text-sm text-gray-500">or click to select a file</p>
            </div>
          )}
        </div>

        {uploadedFile && (
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleUpload}
              disabled={uploadMutation.isLoading}
              className="btn btn-primary"
            >
              {uploadMutation.isLoading ? 'Uploading...' : 'Upload Portfolio'}
            </button>
          </div>
        )}

        {/* CSV Format Instructions */}
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-medium text-gray-900 mb-2">CSV Format Required</h4>
          <p className="text-sm text-gray-600 mb-2">
            Your CSV file should include these columns:
          </p>
          <div className="text-sm text-gray-600 space-y-1">
            <p>• <strong>symbol</strong> - Stock/crypto symbol (e.g., AAPL, BTC)</p>
            <p>• <strong>date</strong> - Transaction date (YYYY-MM-DD)</p>
            <p>• <strong>action</strong> - buy or sell</p>
            <p>• <strong>quantity</strong> - Number of shares/coins</p>
            <p>• <strong>total amount</strong> - Total amount in CAD (all amounts are processed as CAD)</p>
            <p>• <strong>type</strong> - 's' for stock or 'c' for crypto</p>
          </div>
          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800 font-medium">💱 Currency Conversion Note:</p>
            <p className="text-sm text-blue-700">
              All CSV amounts are processed as CAD. Current market prices (in USD) are automatically converted to CAD for accurate profit/loss calculations.
            </p>
          </div>
        </div>
      </div>

      {/* Portfolios List */}
      <div className="card">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Your Portfolios</h2>
        
        {isLoading ? (
          <div className="text-center py-8">
            <div className="loading-spinner mx-auto mb-4"></div>
            <p className="text-gray-500">Loading portfolios...</p>
          </div>
        ) : portfolios && portfolios.length > 0 ? (
          <div className="space-y-4">
            {portfolios.map((portfolio: Portfolio) => (
              <div key={portfolio.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-medium text-gray-900">
                      Portfolio {portfolio.id.slice(-6)}
                    </h3>
                    <p className="text-sm text-gray-500">
                      Created {new Date(portfolio.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteMutation.mutate(portfolio.id)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-gray-500">Total Invested</p>
                    <p className="font-medium text-gray-900">
                      {formatCurrency(portfolio.summary.totalInvested)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Realized P&L</p>
                    <p className={`font-medium ${
                      portfolio.summary.totalRealized > 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {formatCurrency(portfolio.summary.totalRealized)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Holdings</p>
                    <p className="font-medium text-gray-900">
                      {portfolio.summary.totalHoldings}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Total Quantity</p>
                    <p className="font-medium text-gray-900">
                      {portfolio.summary.totalQuantity.toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Holdings Table */}
                {portfolio.holdings && portfolio.holdings.length > 0 && (
                  <div className="mt-6">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">Holdings</h4>
                    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                            <tr>
                              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                Symbol
                              </th>
                              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                Quantity
                              </th>
                              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                Avg Price
                              </th>
                              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                Current Price
                              </th>
                              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                Total Value
                              </th>
                              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                P&L
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-100">
                            {portfolio.holdings.map((holding, index) => (
                              <tr 
                                key={holding.symbol}
                                className={`hover:bg-gray-50 transition-colors duration-150 ${
                                  index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                                }`}
                              >
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="flex items-center">
                                    <div className="flex-shrink-0 h-8 w-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                                      <span className="text-xs font-bold text-white">
                                        {holding.symbol.slice(0, 2)}
                                      </span>
                                    </div>
                                    <div className="ml-3">
                                      <div className="text-sm font-semibold text-gray-900">
                                        {holding.symbol}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="text-sm font-medium text-gray-900">
                                    {holding.quantity.toLocaleString()}
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="text-sm text-gray-900 font-medium">
                                    {formatCurrency(holding.averagePrice)}
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="text-sm text-gray-900 font-medium">
                                    {holding.currentPrice ? formatCurrency(holding.currentPrice) : (
                                      <span className="text-gray-400 italic">N/A</span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="text-sm text-gray-900 font-medium">
                                    {holding.currentValue ? formatCurrency(holding.currentValue) : (
                                      <span className="text-gray-400 italic">N/A</span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  {holding.totalPnL !== undefined ? (
                                    <div className="flex items-center space-x-2">
                                      <div className={`flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                                        holding.totalPnL > 0 
                                          ? 'bg-green-100 text-green-800' 
                                          : 'bg-red-100 text-red-800'
                                      }`}>
                                        {holding.totalPnL > 0 ? (
                                          <TrendingUp className="h-3 w-3 mr-1" />
                                        ) : (
                                          <TrendingDown className="h-3 w-3 mr-1" />
                                        )}
                                        {formatCurrency(holding.totalPnL)}
                                      </div>
                                      {holding.totalPnLPercent && (
                                        <div className={`text-xs font-medium ${
                                          holding.totalPnLPercent > 0 ? 'text-green-600' : 'text-red-600'
                                        }`}>
                                          {formatPercentage(holding.totalPnLPercent)}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-gray-400 italic text-sm">N/A</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <p className="text-gray-500">No portfolios uploaded yet</p>
            <p className="text-sm text-gray-400">Upload a CSV file to get started</p>
          </div>
        )}
      </div>
        </div>
      </div>
    </div>
  );
};

export default Portfolio; 