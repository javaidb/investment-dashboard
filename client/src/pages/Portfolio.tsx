import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, Trash2, TrendingUp, TrendingDown, RefreshCw, AlertCircle } from 'lucide-react';
import axios from 'axios';

interface PortfolioSummary {
  id: string;
  summary: {
    totalInvested: number;
    totalRealized: number;
    totalHoldings: number;
    totalQuantity: number;
  };
  createdAt: string;
  lastUpdated: string;
}

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
    companyName?: string;
    cacheUsed?: boolean;
  }>;
  createdAt: string;
  lastUpdated: string;
}

interface FileTrackingStatus {
  success: boolean;
  stats: {
    totalFiles: number;
    trackedFiles: number;
    processedFiles: number;
    unprocessedFiles: number;
  };
  changes: {
    hasChanges: boolean;
    newFiles: Array<{ name: string; type: string }>;
    modifiedFiles: Array<{ name: string; type: string }>;
    deletedFiles: Array<{ name: string }>;
  };
  message: string;
}

const mono = "'IBM Plex Mono', 'Courier New', monospace";

const Portfolio: React.FC = () => {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const queryClient = useQueryClient();

  const { data: fileTrackingStatus, isLoading: isLoadingFileStatus, refetch: refetchFileStatus } = useQuery<FileTrackingStatus>(
    'fileTrackingStatus',
    async () => (await axios.get('/api/portfolio/files/tracking/stats')).data,
    { refetchInterval: 30000, staleTime: 10000 }
  );

  const { data: portfolioSummaries, isLoading: isLoadingSummaries } = useQuery<PortfolioSummary[]>(
    'portfolios',
    async () => (await axios.get('/api/portfolio')).data
  );

  const { data: portfolios, isLoading: isLoadingDetails } = useQuery<Portfolio[]>(
    ['portfolios-detailed', portfolioSummaries],
    async () => {
      if (!portfolioSummaries || portfolioSummaries.length === 0) return [];
      return Promise.all(
        portfolioSummaries.map(async (summary) => {
          try {
            return (await axios.get(`/api/portfolio/${summary.id}`)).data;
          } catch {
            return { ...summary, holdings: [], lastUpdated: new Date().toISOString() };
          }
        })
      );
    },
    { enabled: !!portfolioSummaries && portfolioSummaries.length > 0 }
  );

  const isLoading = isLoadingSummaries || isLoadingDetails;

  const uploadMutation = useMutation(
    async (file: File) => {
      const formData = new FormData();
      formData.append('trades', file);
      return (await axios.post('/api/portfolio/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
    },
    { onSuccess: () => { queryClient.invalidateQueries('portfolios'); setUploadedFile(null); } }
  );

  const deleteMutation = useMutation(
    async (portfolioId: string) => { await axios.delete(`/api/portfolio/${portfolioId}`); },
    { onSuccess: () => queryClient.invalidateQueries('portfolios') }
  );

  const autoProcessMutation = useMutation(
    async () => (await axios.post('/api/portfolio/auto-process')).data,
    { onSuccess: () => { queryClient.invalidateQueries('portfolios'); refetchFileStatus(); } }
  );

  const onDrop = useCallback((acceptedFiles: File[]) => { setUploadedFile(acceptedFiles[0]); }, []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'text/csv': ['.csv'] }, multiple: false });

  const handleUpload = () => { if (uploadedFile) uploadMutation.mutate(uploadedFile); };

  const fmtCAD = (v: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(v);
  const fmtPct = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;

  const card: React.CSSProperties = {
    background: '#10141c', border: '1px solid #1e2535', borderRadius: '8px',
    padding: '20px', marginBottom: '20px',
  };

  const btnSecondary: React.CSSProperties = {
    padding: '7px 14px', fontSize: '12px', fontWeight: 500, fontFamily: mono,
    color: '#94a3b8', backgroundColor: '#141820', border: '1px solid #1e2535',
    borderRadius: '4px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px',
    transition: 'all 0.15s',
  };
  const btnPrimary: React.CSSProperties = {
    ...btnSecondary, color: '#00d4aa', border: '1px solid rgba(0,212,170,0.3)', backgroundColor: 'rgba(0,212,170,0.08)',
  };

  const sectionLabel: React.CSSProperties = {
    fontFamily: mono, fontSize: '10px', fontWeight: 700, color: '#4a5568',
    letterSpacing: '0.12em', textTransform: 'uppercase',
  };

  return (
    <div style={{ padding: '24px', minHeight: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontFamily: mono, fontSize: '18px', fontWeight: 700, color: '#e2e8f0', letterSpacing: '0.04em' }}>Portfolio Management</div>
        <div style={{ fontFamily: mono, fontSize: '11px', color: '#4a5568', marginTop: '4px' }}>Upload and manage your investment portfolios</div>
      </div>

      {/* File Status */}
      {fileTrackingStatus && (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ fontFamily: mono, fontSize: '13px', fontWeight: 700, color: '#e2e8f0' }}>File Status</div>
            <button style={btnSecondary} onClick={() => refetchFileStatus()} disabled={isLoadingFileStatus}
              onMouseEnter={e => { e.currentTarget.style.color = '#e2e8f0'; e.currentTarget.style.borderColor = '#2a3445'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = '#1e2535'; }}>
              <RefreshCw style={{ width: '12px', height: '12px' }} className={isLoadingFileStatus ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
            {[
              { label: 'Total Files',  value: fileTrackingStatus.stats.totalFiles,       color: '#60a5fa' },
              { label: 'Processed',    value: fileTrackingStatus.stats.processedFiles,    color: '#4ade80' },
              { label: 'Unprocessed', value: fileTrackingStatus.stats.unprocessedFiles,  color: '#fb923c' },
              { label: 'Changes',      value: fileTrackingStatus.changes.newFiles.length + fileTrackingStatus.changes.modifiedFiles.length, color: '#a78bfa' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ textAlign: 'center', padding: '12px', background: '#141820', border: '1px solid #1e2535', borderRadius: '6px' }}>
                <div style={{ fontFamily: mono, fontSize: '22px', fontWeight: 700, color }}>{value}</div>
                <div style={{ ...sectionLabel, marginTop: '4px' }}>{label}</div>
              </div>
            ))}
          </div>

          {fileTrackingStatus.changes.hasChanges && (
            <div style={{ background: 'rgba(251,146,60,0.07)', border: '1px solid rgba(251,146,60,0.25)', borderRadius: '6px', padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <AlertCircle style={{ width: '15px', height: '15px', color: '#fb923c', flexShrink: 0, marginTop: '1px' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: mono, fontSize: '12px', fontWeight: 700, color: '#fb923c', marginBottom: '6px' }}>File Changes Detected</div>
                <div style={{ fontFamily: mono, fontSize: '11px', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {fileTrackingStatus.changes.newFiles.length > 0 && <span>New: {fileTrackingStatus.changes.newFiles.map(f => f.name).join(', ')}</span>}
                  {fileTrackingStatus.changes.modifiedFiles.length > 0 && <span>Modified: {fileTrackingStatus.changes.modifiedFiles.map(f => f.name).join(', ')}</span>}
                  {fileTrackingStatus.changes.deletedFiles.length > 0 && <span>Deleted: {fileTrackingStatus.changes.deletedFiles.map(f => f.name).join(', ')}</span>}
                </div>
              </div>
              <button style={{ ...btnPrimary, opacity: autoProcessMutation.isLoading ? 0.6 : 1 }}
                onClick={() => autoProcessMutation.mutate()} disabled={autoProcessMutation.isLoading}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(0,212,170,0.14)'; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(0,212,170,0.08)'; }}>
                <RefreshCw style={{ width: '12px', height: '12px' }} className={autoProcessMutation.isLoading ? 'animate-spin' : ''} />
                {autoProcessMutation.isLoading ? 'Processing…' : 'Auto-Process'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Upload */}
      <div style={card}>
        <div style={{ fontFamily: mono, fontSize: '13px', fontWeight: 700, color: '#e2e8f0', marginBottom: '14px' }}>Upload Portfolio</div>

        <div
          {...getRootProps()}
          style={{
            border: `2px dashed ${isDragActive ? '#00d4aa' : '#1e2535'}`,
            borderRadius: '8px', padding: '36px', textAlign: 'center', cursor: 'pointer',
            background: isDragActive ? 'rgba(0,212,170,0.05)' : '#0d111a',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { if (!isDragActive) (e.currentTarget as HTMLDivElement).style.borderColor = '#2a3445'; }}
          onMouseLeave={e => { if (!isDragActive) (e.currentTarget as HTMLDivElement).style.borderColor = '#1e2535'; }}
        >
          <input {...getInputProps()} />
          <Upload style={{ width: '36px', height: '36px', color: isDragActive ? '#00d4aa' : '#2a3445', margin: '0 auto 12px' }} />
          {uploadedFile ? (
            <>
              <div style={{ fontFamily: mono, fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>{uploadedFile.name}</div>
              <div style={{ fontFamily: mono, fontSize: '11px', color: '#64748b', marginTop: '4px' }}>{(uploadedFile.size / 1024).toFixed(1)} KB</div>
            </>
          ) : (
            <>
              <div style={{ fontFamily: mono, fontSize: '13px', color: '#94a3b8' }}>{isDragActive ? 'Drop the CSV file here' : 'Drag & drop a CSV file here'}</div>
              <div style={{ fontFamily: mono, fontSize: '11px', color: '#4a5568', marginTop: '4px' }}>or click to select a file</div>
            </>
          )}
        </div>

        {uploadedFile && (
          <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'flex-end' }}>
            <button style={{ ...btnPrimary, opacity: uploadMutation.isLoading ? 0.6 : 1 }}
              onClick={handleUpload} disabled={uploadMutation.isLoading}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(0,212,170,0.14)'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(0,212,170,0.08)'; }}>
              <Upload style={{ width: '12px', height: '12px' }} />
              {uploadMutation.isLoading ? 'Uploading…' : 'Upload Portfolio'}
            </button>
          </div>
        )}

        {/* CSV Format Guide */}
        <div style={{ marginTop: '20px', padding: '16px', background: '#0d111a', border: '1px solid #1e2535', borderRadius: '6px' }}>
          <div style={{ fontFamily: mono, fontSize: '12px', fontWeight: 700, color: '#e2e8f0', marginBottom: '6px' }}>CSV Format Support</div>
          <div style={{ fontFamily: mono, fontSize: '11px', color: '#64748b', marginBottom: '14px' }}>
            The system automatically processes CSV files from both crypto exchanges and Wealthsimple:
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ borderLeft: '3px solid #60a5fa', paddingLeft: '12px' }}>
              <div style={{ fontFamily: mono, fontSize: '11px', fontWeight: 700, color: '#60a5fa', marginBottom: '6px' }}>Crypto Exchange Format</div>
              <div style={{ fontFamily: mono, fontSize: '10px', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <span>• <strong style={{ color: '#94a3b8' }}>symbol</strong> — Crypto symbol (e.g., BTC, ETH)</span>
                <span>• <strong style={{ color: '#94a3b8' }}>date</strong> — Transaction date (YYYY-MM-DD)</span>
                <span>• <strong style={{ color: '#94a3b8' }}>action</strong> — buy or sell</span>
                <span>• <strong style={{ color: '#94a3b8' }}>quantity</strong> — Number of coins</span>
                <span>• <strong style={{ color: '#94a3b8' }}>total amount</strong> — Total amount in CAD</span>
                <span>• <strong style={{ color: '#94a3b8' }}>type</strong> — 'c' for crypto</span>
              </div>
            </div>

            <div style={{ borderLeft: '3px solid #4ade80', paddingLeft: '12px' }}>
              <div style={{ fontFamily: mono, fontSize: '11px', fontWeight: 700, color: '#4ade80', marginBottom: '6px' }}>Wealthsimple Format</div>
              <div style={{ fontFamily: mono, fontSize: '10px', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <span>• <strong style={{ color: '#94a3b8' }}>date</strong> — Transaction date (YYYY-MM-DD)</span>
                <span>• <strong style={{ color: '#94a3b8' }}>transaction</strong> — BUY or SELL (only these are processed)</span>
                <span>• <strong style={{ color: '#94a3b8' }}>description</strong> — Contains symbol and shares info</span>
                <span>• <strong style={{ color: '#94a3b8' }}>amount</strong> — Transaction amount in CAD (negative for BUY, positive for SELL)</span>
                <span>• <strong style={{ color: '#94a3b8' }}>balance</strong> — Account balance (ignored)</span>
              </div>
              <div style={{ fontFamily: mono, fontSize: '10px', color: '#4a5568', marginTop: '6px' }}>
                Examples: "TSLA - Tesla Inc: Bought 1.0000 shares" → Symbol: TSLA, Quantity: 1.0
              </div>
            </div>
          </div>

          <div style={{ marginTop: '12px', padding: '10px 14px', background: 'rgba(79,143,255,0.07)', border: '1px solid rgba(79,143,255,0.2)', borderRadius: '5px' }}>
            <div style={{ fontFamily: mono, fontSize: '10px', fontWeight: 700, color: '#60a5fa', marginBottom: '3px' }}>File Organization</div>
            <div style={{ fontFamily: mono, fontSize: '10px', color: '#64748b' }}>
              Place crypto CSV files in the <code style={{ color: '#94a3b8' }}>crypto/</code> folder and Wealthsimple CSV files in the <code style={{ color: '#94a3b8' }}>wealthsimple/</code> folder. Empty files are automatically ignored.
            </div>
          </div>

          <div style={{ marginTop: '8px', padding: '10px 14px', background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '5px' }}>
            <div style={{ fontFamily: mono, fontSize: '10px', fontWeight: 700, color: '#4ade80', marginBottom: '3px' }}>Currency Conversion</div>
            <div style={{ fontFamily: mono, fontSize: '10px', color: '#64748b' }}>
              All CSV amounts are processed as CAD. Current market prices (in USD) are automatically converted to CAD for accurate P&L calculations.
            </div>
          </div>
        </div>
      </div>

      {/* Portfolios List */}
      <div style={card}>
        <div style={{ fontFamily: mono, fontSize: '13px', fontWeight: 700, color: '#e2e8f0', marginBottom: '16px' }}>Your Portfolios</div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#4a5568', fontFamily: mono, fontSize: '12px' }}>
            <RefreshCw style={{ width: '20px', height: '20px', color: '#00d4aa', margin: '0 auto 10px', animation: 'spin 1s linear infinite' }} />
            Loading portfolios…
          </div>
        ) : portfolios && portfolios.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {portfolios.map((portfolio: Portfolio) => (
              <div key={portfolio.id} style={{ background: '#0d111a', border: '1px solid #1e2535', borderRadius: '6px', padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <div>
                    <div style={{ fontFamily: mono, fontSize: '13px', fontWeight: 700, color: '#e2e8f0' }}>Portfolio {portfolio.id.slice(-6)}</div>
                    <div style={{ fontFamily: mono, fontSize: '10px', color: '#4a5568', marginTop: '2px' }}>
                      Created {new Date(portfolio.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <button onClick={() => deleteMutation.mutate(portfolio.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4a5568', padding: '4px', transition: 'color 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#4a5568')}>
                    <Trash2 style={{ width: '16px', height: '16px' }} />
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' }}>
                  {[
                    { label: 'Total Invested', value: fmtCAD(portfolio.summary.totalInvested), color: '#e2e8f0' },
                    { label: 'Realized P&L',   value: fmtCAD(portfolio.summary.totalRealized), color: portfolio.summary.totalRealized >= 0 ? '#4ade80' : '#f87171' },
                    { label: 'Holdings',        value: portfolio.summary.totalHoldings, color: '#e2e8f0' },
                    { label: 'Total Quantity',  value: portfolio.summary.totalQuantity.toLocaleString(), color: '#e2e8f0' },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ padding: '10px 12px', background: '#141820', border: '1px solid #1e2535', borderRadius: '5px' }}>
                      <div style={{ ...sectionLabel, marginBottom: '4px' }}>{label}</div>
                      <div style={{ fontFamily: mono, fontSize: '13px', fontWeight: 700, color }}>{value}</div>
                    </div>
                  ))}
                </div>

                {portfolio.holdings && portfolio.holdings.length > 0 && (
                  <div>
                    <div style={{ ...sectionLabel, marginBottom: '8px' }}>Holdings</div>
                    <div style={{ background: '#141820', border: '1px solid #1e2535', borderRadius: '5px', overflow: 'hidden' }}>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid #1e2535' }}>
                              {['Symbol', 'Quantity', 'Avg Price', 'Current Price', 'Total Value', 'P&L'].map(h => (
                                <th key={h} style={{ padding: '9px 14px', fontFamily: mono, fontSize: '10px', fontWeight: 700, color: '#4a5568', letterSpacing: '0.1em', textTransform: 'uppercase', textAlign: 'left', background: '#0d111a' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {portfolio.holdings.map((holding, idx) => (
                              <tr key={holding.symbol}
                                style={{ backgroundColor: idx % 2 === 0 ? '#141820' : '#10141c', borderBottom: '1px solid #1e2535', transition: 'background 0.15s' }}
                                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(0,212,170,0.04)')}
                                onMouseLeave={e => (e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#141820' : '#10141c')}
                              >
                                <td style={{ padding: '10px 14px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{ width: '30px', height: '30px', background: 'rgba(0,212,170,0.12)', border: '1px solid rgba(0,212,170,0.25)', borderRadius: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                      <span style={{ fontFamily: mono, fontSize: '9px', fontWeight: 700, color: '#00d4aa' }}>{holding.symbol.slice(0, 2)}</span>
                                    </div>
                                    <span style={{ fontFamily: mono, fontSize: '13px', fontWeight: 700, color: '#e2e8f0' }}>{holding.symbol}</span>
                                  </div>
                                </td>
                                <td style={{ padding: '10px 14px', fontFamily: mono, fontSize: '12px', color: '#94a3b8' }}>
                                  {holding.quantity.toLocaleString()}
                                </td>
                                <td style={{ padding: '10px 14px', fontFamily: mono, fontSize: '12px', color: '#94a3b8' }}>
                                  {fmtCAD(holding.averagePrice)}
                                </td>
                                <td style={{ padding: '10px 14px', fontFamily: mono, fontSize: '12px', color: '#94a3b8' }}>
                                  {holding.currentPrice ? fmtCAD(holding.currentPrice) : <span style={{ color: '#2a3445', fontStyle: 'italic' }}>N/A</span>}
                                </td>
                                <td style={{ padding: '10px 14px', fontFamily: mono, fontSize: '12px', color: '#94a3b8' }}>
                                  {holding.currentValue ? fmtCAD(holding.currentValue) : <span style={{ color: '#2a3445', fontStyle: 'italic' }}>N/A</span>}
                                </td>
                                <td style={{ padding: '10px 14px' }}>
                                  {holding.totalPnL !== undefined ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <span style={{ fontFamily: mono, fontSize: '11px', fontWeight: 600, padding: '3px 9px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px', background: holding.totalPnL >= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: holding.totalPnL >= 0 ? '#4ade80' : '#f87171', border: `1px solid ${holding.totalPnL >= 0 ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}` }}>
                                        {holding.totalPnL >= 0 ? <TrendingUp style={{ width: '10px', height: '10px' }} /> : <TrendingDown style={{ width: '10px', height: '10px' }} />}
                                        {fmtCAD(holding.totalPnL)}
                                      </span>
                                      {holding.totalPnLPercent !== undefined && (
                                        <span style={{ fontFamily: mono, fontSize: '11px', fontWeight: 600, color: holding.totalPnLPercent >= 0 ? '#4ade80' : '#f87171' }}>
                                          {fmtPct(holding.totalPnLPercent)}
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span style={{ fontFamily: mono, fontSize: '11px', color: '#2a3445', fontStyle: 'italic' }}>N/A</span>
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
          <div style={{ textAlign: 'center', padding: '48px 20px' }}>
            <FileText style={{ width: '40px', height: '40px', color: '#2a3445', margin: '0 auto 12px' }} />
            <div style={{ fontFamily: mono, fontSize: '13px', color: '#4a5568', marginBottom: '6px' }}>No portfolios uploaded yet</div>
            <div style={{ fontFamily: mono, fontSize: '11px', color: '#2a3445' }}>Upload a CSV file to get started</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Portfolio;
