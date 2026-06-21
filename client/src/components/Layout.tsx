import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from 'react-query';
import axios from 'axios';
import { useCache } from '../contexts/CacheContext';
import { POSITION_ROLES, SIZING_RULES } from '../data/portfolio-framework';
import type { PositionFramework, PositionRole } from '../data/portfolio-framework';
import {
  Upload,
  Database,
  Image,
  PieChart,
  Activity,
  Calculator,
  Eye,
  LineChart,
  Newspaper,
  Lightbulb,
  Receipt,
  Waves,
  Settings,
  Search,
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

type NavigationItem = {
  name: string;
  href: string;
  icon: React.ComponentType<any>;
  desc?: string;
};

type NavigationSeparator = {
  type: 'separator';
  label?: string;
};

type NavigationElement = NavigationItem | NavigationSeparator;

const mono = "'IBM Plex Mono', 'Courier New', monospace";

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { latestPortfolio, recurringInvestments } = useCache();
  const [adminOpen, setAdminOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [rsiActiveOnly, setRsiActiveOnly] = useState(true);
  const [confluenceSel, setConfluenceSel] = useState<string | null>(null);
  const [alertsKey, setAlertsKey] = useState(0);
  const [clock, setClock] = useState('');
  const [nowMs, setNowMs] = useState(Date.now());
  const adminRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const navigation: NavigationElement[] = [
    { name: 'Overview', href: '/breakdown', icon: PieChart, desc: 'Portfolio summary and holdings' },
    { name: 'Targets', href: '/allocation', icon: PieChart, desc: 'Price targets, upside, framework allocation, simulator' },
    { name: 'Timing', href: '/timing', icon: Activity, desc: 'Allocation drift, analyst targets, timing signals' },
    { type: 'separator', label: 'Analysis' },
    { name: 'Watchlist', href: '/watchlist', icon: Eye, desc: 'Monitor holdings and watchlist' },
    { name: 'P&L Tracker', href: '/pnl', icon: LineChart, desc: 'Daily P&L history and benchmark' },
    { name: 'Insights', href: '/insights', icon: Lightbulb, desc: 'Timing, market, diversification, account' },
    { name: 'NewsBoard', href: '/newsboard', icon: Newspaper, desc: 'Signals, earnings, market conditions' },
    { name: 'Tax', href: '/tax', icon: Receipt, desc: 'TFSA room and account planning' },
    { type: 'separator', label: 'Other' },
    { name: 'Risk', href: '/ratios', icon: Calculator, desc: 'Sharpe, beta, drawdown, risk metrics' },
    { name: 'Analysis', href: '/analysis', icon: Activity, desc: 'Technical analysis' },
    { name: 'FIB', href: '/fib', icon: Waves, desc: 'Fibonacci retracement analysis' },
    { type: 'separator', label: 'Data' },
    { name: 'Upload', href: '/portfolio', icon: Upload, desc: 'Upload CSV portfolio files' },
  ];

  const adminItems: NavigationItem[] = [
    { name: 'Cache', href: '/cache', icon: Database, desc: 'Cache stats and management' },
    { name: 'Icons', href: '/icons', icon: Image, desc: 'Manage company/crypto icons' },
  ];

  const isActive = (path: string) => location.pathname === path;

  // Clock
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setNowMs(now.getTime());
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Close admin dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (adminRef.current && !adminRef.current.contains(e.target as Node)) {
        setAdminOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
        setSearchQuery('');
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [searchOpen]);

  const allNavItems = [...navigation.filter(i => !('type' in i)) as NavigationItem[], ...adminItems];
  const filteredNav = searchQuery.trim()
    ? allNavItems.filter(item =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.desc || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allNavItems;

  // Determine Canadian market open (9:30–16:00 ET Mon–Fri)
  const getMarketStatus = () => {
    const now = new Date();
    const day = now.getDay();
    const etHour = now.getUTCHours() - 4; // rough ET offset (EDT)
    const etMin = now.getUTCMinutes();
    const etTime = etHour + etMin / 60;
    if (day === 0 || day === 6) return { label: 'MKT CLOSED', color: '#4a5568' };
    if (etTime >= 9.5 && etTime < 16) return { label: 'MKT OPEN', color: '#22c55e' };
    if (etTime >= 4 && etTime < 9.5) return { label: 'PRE-MKT', color: '#f59e0b' };
    return { label: 'AFTER-HRS', color: '#f59e0b' };
  };

  const mkt = getMarketStatus();

  const portfolioTotals = useMemo(() => {
    if (!latestPortfolio?.holdings) return null;
    const h: any[] = latestPortfolio.holdings;
    const cv  = h.reduce((s, x) => s + (x.currentValue || 0), 0);
    const tai = h.reduce((s, x) => s + (x.totalAmountInvested || x.totalInvested || 0), 0);
    const as_ = h.reduce((s, x) => s + (x.amountSold || 0), 0);
    const up  = h.reduce((s, x) => s + (x.unrealizedPnL || 0), 0);
    const rp  = h.reduce((s, x) => s + (x.realizedPnL || 0), 0);
    const ri  = (recurringInvestments as any)?.totals;
    const totalCV  = cv  + (ri?.currentValue   || 0);
    const totalTAI = tai + (ri?.totalInvested  || 0);
    const totalPnL = (up + rp) + (ri?.profitLoss || 0);
    const ni  = totalTAI - as_;
    const den = (totalPnL >= 0 && ni > 0) ? ni : (totalTAI || 1);
    return { totalCV, totalTAI, totalPnL, pct: (totalPnL / den) * 100 };
  }, [latestPortfolio, recurringInvestments]);

  const portfolioSymbols = useMemo(
    () => (latestPortfolio?.holdings as any[] | undefined)?.map((h: any) => h.symbol) ?? [],
    [latestPortfolio]
  );

  const activeSymbols = useMemo(
    () => (latestPortfolio?.holdings as any[] | undefined)
      ?.filter((h: any) => (h.quantity || 0) > 1e-6)
      .map((h: any) => h.symbol) ?? [],
    [latestPortfolio]
  );

  const { data: dailyChangesData } = useQuery(
    ['sidebar-daily-changes', portfolioSymbols.join(',')],
    async () => {
      if (!portfolioSymbols.length) return {};
      const res = await axios.post('/api/portfolio/cache/daily-changes', { symbols: portfolioSymbols });
      return res.data.dailyChanges || {};
    },
    { enabled: portfolioSymbols.length > 0, staleTime: 300_000, cacheTime: 900_000, retry: 1 }
  );

  const { data: rsiData } = useQuery(
    ['sidebar-rsi', portfolioSymbols.join(',')],
    async () => {
      if (!portfolioSymbols.length) return {};
      const res = await axios.post('/api/portfolio/cache/rsi-data', { symbols: portfolioSymbols });
      return res.data.rsiData || {};
    },
    { enabled: portfolioSymbols.length > 0, staleTime: 600_000, cacheTime: 1_800_000, retry: 1 }
  );

  const { data: accountBreakdownData } = useQuery(
    'sidebar-account-breakdown',
    () => axios.get('/api/portfolio/account-breakdown').then(r => r.data),
    { staleTime: 300_000, cacheTime: 900_000, refetchInterval: 600_000, retry: 1 }
  );

  const { data: cacheFreshnessData } = useQuery(
    'sidebar-cache-freshness',
    () => axios.get('/api/portfolio/cache/freshness').then(r => r.data),
    { staleTime: 0, cacheTime: 120_000, refetchInterval: 60_000, retry: 1 }
  );

  const { data: earningsEventsData } = useQuery(
    'sidebar-earnings-events',
    () => axios.get('/api/earnings/upcoming').then(r => r.data),
    { staleTime: 30 * 60 * 1000, cacheTime: 60 * 60 * 1000, retry: 1 }
  );

  const { data: dividendEventsData } = useQuery(
    'sidebar-dividend-events',
    () => axios.get('/api/earnings/dividends').then(r => r.data),
    { staleTime: 60 * 60 * 1000, cacheTime: 12 * 60 * 60 * 1000, retry: 1 }
  );

  const finnhubActiveSymbols = useMemo(
    () => activeSymbols.filter(s => !s.match(/\.(TO|V|CN)$/i)).slice(0, 15),
    [activeSymbols]
  );

  const { data: analystTargetsData } = useQuery(
    ['sidebar-analyst-targets', finnhubActiveSymbols.join(',')],
    () => axios.post('/api/analyst/price-targets/batch', { symbols: finnhubActiveSymbols }).then(r => r.data),
    { enabled: finnhubActiveSymbols.length > 0, staleTime: 60 * 60_000, cacheTime: 24 * 60 * 60_000, retry: 1 }
  );

  const { data: fibBatchData } = useQuery(
    ['fibonacci-batch', activeSymbols.join(','), '6m'],
    () => axios.get('/api/fibonacci/batch', { params: { symbols: activeSymbols.join(','), period: '6m' } }).then(r => r.data),
    { enabled: activeSymbols.length > 0, staleTime: 30 * 60_000, cacheTime: 60 * 60_000, retry: 1 }
  );

  const { data: confluenceSparkData } = useQuery(
    ['confluence-spark', confluenceSel],
    async () => {
      const res = await axios.get(`/api/portfolio/cache/historical/${confluenceSel}?period=1y`);
      const raw: { date: string; close: number }[] = res.data?.data ?? [];
      if (!raw.length) return null;
      const sorted = raw.sort((a, b) => a.date.localeCompare(b.date));
      const all = sorted.map(d => d.close);
      const ma = (arr: number[], n: number): (number | null)[] =>
        arr.map((_, i) => i < n - 1 ? null : arr.slice(i - n + 1, i + 1).reduce((s, v) => s + v, 0) / n);
      const ma200 = ma(all, 200);
      const ma50  = ma(all, 50);
      const start = Math.max(0, all.length - 63); // last ~3 months
      return { prices: all.slice(start), ma200: ma200.slice(start), ma50: ma50.slice(start) };
    },
    { enabled: !!confluenceSel, staleTime: 30 * 60_000, cacheTime: 60 * 60_000, retry: 1 }
  );

  const holdingsForRecs = useMemo(() =>
    (latestPortfolio?.holdings as any[] ?? [])
      .filter((h: any) => (h.quantity ?? 0) > 1e-6)
      .sort((a: any, b: any) => (b.currentValue ?? 0) - (a.currentValue ?? 0))
      .slice(0, 40)
      .map((h: any) => ({
        symbol:            h.symbol,
        currentInvestment: h.totalAmountInvested ?? h.totalInvested ?? 0,
        unrealizedPnL:     h.unrealizedPnL ?? 0,
        realizedPnL:       h.realizedPnL   ?? 0,
      })),
    [latestPortfolio]
  );

  // Uses the same React Query cache key as Timing.tsx — free when that page was visited
  const { data: timingRecsData } = useQuery(
    ['timing-recs', holdingsForRecs.map(h => h.symbol).join(',')],
    () => axios.post('/api/rebalancing-recommendations/all-active', { holdings: holdingsForRecs }).then(r => r.data),
    { enabled: holdingsForRecs.length > 0, staleTime: 10 * 60_000, cacheTime: 30 * 60_000, retry: 1 }
  );

  const { data: ytdChangesData } = useQuery(
    ['sidebar-ytd-changes', portfolioSymbols.join(',')],
    async () => {
      if (!portfolioSymbols.length) return {};
      const res = await axios.post('/api/portfolio/cache/ytd-changes', { symbols: portfolioSymbols });
      return res.data.ytdChanges || {};
    },
    { enabled: portfolioSymbols.length > 0, staleTime: 3_600_000, cacheTime: 7_200_000, retry: 1 }
  );

  const accountValues = useMemo(() => {
    if (!latestPortfolio?.holdings || !accountBreakdownData?.symbolShares) return null;
    const symbolShares = accountBreakdownData.symbolShares as Record<string, Record<string, number>>;
    const totals: Record<string, number> = { TFSA: 0, RRSP: 0, FHSA: 0, 'Non-Reg': 0 };

    // Trade-based holdings distributed by share fraction per account
    for (const h of latestPortfolio.holdings as any[]) {
      const cv = h.currentValue || 0;
      if (cv <= 0) continue;
      const dist = symbolShares[h.symbol];
      if (!dist) { totals['Non-Reg'] += cv; continue; }
      const totalShares = Object.values(dist).reduce((s: number, v: any) => s + Math.max(0, v as number), 0);
      if (totalShares <= 0) { totals['Non-Reg'] += cv; continue; }
      for (const acct of ['TFSA', 'RRSP', 'FHSA', 'Non-Reg']) {
        totals[acct] += cv * (Math.max(0, dist[acct] || 0) / totalShares);
      }
    }

    // Recurring investments: split each investment's current value equally across its accounts.
    // These are registered-account mutual funds (e.g. Scotia Bank) that have no individual trades.
    for (const inv of (recurringInvestments as any)?.investments ?? []) {
      const cv = inv.currentValue || 0;
      const accounts: string[] = inv.accounts || [];
      if (!inv.enabled || cv <= 0 || accounts.length === 0) continue;
      const share = cv / accounts.length;
      for (const acct of accounts) {
        if (acct in totals) totals[acct] += share;
      }
    }

    return totals;
  }, [latestPortfolio, accountBreakdownData, recurringInvestments]);

  const todayStats = useMemo(() => {
    if (!portfolioTotals || !dailyChangesData || !latestPortfolio?.holdings) return null;
    const h: any[] = latestPortfolio.holdings;
    let dollarChange = 0;
    let totalCV = 0;
    h.forEach((holding: any) => {
      const cv = holding.currentValue || 0;
      const changes = dailyChangesData[holding.symbol];
      const pct = Array.isArray(changes) ? changes[changes.length - 1] : (typeof changes === 'number' ? changes : null);
      if (pct != null && cv > 0) {
        dollarChange += cv * (pct / (100 + pct));
      }
      totalCV += cv;
    });
    const pct = totalCV > 0 ? (dollarChange / (totalCV - dollarChange)) * 100 : 0;
    return { dollarChange, pct };
  }, [portfolioTotals, dailyChangesData, latestPortfolio]);

  const ytdStats = useMemo(() => {
    if (!ytdChangesData || !latestPortfolio?.holdings) return null;
    const h: any[] = latestPortfolio.holdings;
    const totalCV = h.reduce((s, x) => s + (x.currentValue || 0), 0);
    if (totalCV === 0) return null;

    let weightedYTD = 0;
    let coveredCV = 0;
    h.forEach((holding: any) => {
      const cv = holding.currentValue || 0;
      const ytd = ytdChangesData[holding.symbol];
      if (ytd != null && cv > 0) { weightedYTD += ytd * cv; coveredCV += cv; }
    });
    if (coveredCV === 0) return null;

    const portfolioYTD = weightedYTD / coveredCV;
    const spyYTD = ytdChangesData['SPY'] ?? null;
    const vsSnp = spyYTD != null ? portfolioYTD - spyYTD : null;
    return { portfolioYTD, spyYTD, vsSnp };
  }, [ytdChangesData, latestPortfolio]);

  const holdingsForHistory = useMemo(() => {
    if (!latestPortfolio?.holdings) return [];
    return (latestPortfolio.holdings as any[])
      .filter((h: any) => (h.quantity || 0) > 0)
      .map((h: any) => ({
        symbol: h.symbol,
        quantity: h.quantity || 0,
        costBasis: (h.totalAmountInvested || h.totalInvested || 0) - (h.amountSold || 0),
      }));
  }, [latestPortfolio]);

  const { data: portfolioHistory } = useQuery(
    ['sidebar-portfolio-history', holdingsForHistory.map(h => `${h.symbol}:${h.quantity}`).join(',')],
    async () => {
      if (!holdingsForHistory.length) return [];
      const res = await axios.post('/api/portfolio/cache/portfolio-history', { holdings: holdingsForHistory });
      return (res.data.history || []) as { date: string; value: number; pnl: number }[];
    },
    { enabled: holdingsForHistory.length > 0, staleTime: 1_800_000, cacheTime: 3_600_000, retry: 1 }
  );

  // Trading-only P&L — matches exactly what's in the historical chart
  // (recurring investments aren't in the history endpoint, so using
  // portfolioTotals.totalPnL would create a large offset mismatch).
  const tradingPnL = useMemo(() => {
    if (!latestPortfolio?.holdings) return null;
    return (latestPortfolio.holdings as any[]).reduce(
      (s: number, h: any) => s + (h.unrealizedPnL || 0) + (h.realizedPnL || 0), 0
    );
  }, [latestPortfolio]);

  const sparkline = useMemo(() => {
    if (!portfolioHistory?.length || portfolioHistory.length < 2) return null;
    const dates = portfolioHistory.map(d => d.date);
    const rawValues = portfolioHistory.map(d => d.value);
    const base = rawValues[0];
    const values = rawValues.map(v => v - base);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const W = 200, H = 44;
    const toY = (v: number) => H - ((v - min) / range) * (H - 6) - 3;
    const zeroY = Math.max(0, Math.min(H, toY(0)));
    const pts = values.map((v, i) => [((i / (values.length - 1)) * W), toY(v)] as [number, number]);
    const linePath = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const fillPath = `${linePath} L ${W},${zeroY} L 0,${zeroY} Z`;
    const pct = base !== 0 ? ((rawValues[rawValues.length - 1] - base) / base) * 100 : 0;
    const lastY = pts[pts.length - 1][1];
    const MONTH_LETTERS = ['J','F','M','A','M','J','J','A','S','O','N','D'];
    const monthTicks: { pct: number; label: string }[] = [];
    let prevMonth = new Date(dates[0]).getMonth();
    dates.forEach((dateStr, i) => {
      if (i === 0) return;
      const month = new Date(dateStr).getMonth();
      if (month !== prevMonth) {
        monthTicks.push({ pct: (i / (dates.length - 1)) * 100, label: MONTH_LETTERS[month] });
        prevMonth = month;
      }
    });
    return { linePath, fillPath, zeroY, W, H, pct, lastY, monthTicks };
  }, [portfolioHistory]);

  const upcomingEvents = useMemo(() => {
    type EventItem = {
      symbol: string; date: string; daysUntil: number;
      type: 'earn' | 'div';
      quarter?: number; year?: number; hour?: string;
      amount?: number | null;
    };
    const events: EventItem[] = [];

    const earnings: any[] = earningsEventsData?.earnings || [];
    for (const e of earnings.filter((e: any) => e.isActive !== false)) {
      events.push({ symbol: e.symbol, date: e.date, daysUntil: e.daysUntil, type: 'earn', quarter: e.quarter, year: e.year, hour: e.hour });
    }

    const divs: any[] = dividendEventsData?.dividends || [];
    for (const d of divs) {
      events.push({ symbol: d.symbol, date: d.date, daysUntil: d.daysUntil, type: 'div', amount: d.amount });
    }

    return events.sort((a, b) => a.daysUntil - b.daysUntil).slice(0, 24);
  }, [earningsEventsData, dividendEventsData]);

  const actionAlerts = useMemo(() => {
    type AlertItem = { symbol: string; detail: string; active: boolean };
    type AlertGroup = { id: string; level: 'urgent' | 'warn' | 'info' | 'ok'; label: string; time: string; items: AlertItem[]; category: 'targets' | 'indicators' | 'observations' };
    const groups: AlertGroup[] = [];
    const activeSet = new Set(activeSymbols);

    if (rsiData) {
      const overbought: AlertItem[] = [];
      const oversold: AlertItem[] = [];
      Object.entries(rsiData as Record<string, number>).forEach(([sym, rsi]) => {
        if (rsi >= 70) overbought.push({ symbol: sym, detail: `${rsi.toFixed(0)}`, active: activeSet.has(sym) });
        else if (rsi <= 30) oversold.push({ symbol: sym, detail: `${rsi.toFixed(0)}`, active: activeSet.has(sym) });
      });
      if (overbought.length) groups.push({ id: 'rsi-ob', level: 'urgent', label: 'Overbought',   time: 'RSI ≥70', items: overbought, category: 'observations' });
      if (oversold.length)   groups.push({ id: 'rsi-os', level: 'ok',     label: 'Oversold Zone', time: 'RSI ≤30', items: oversold,   category: 'observations' });
    }

    if (dailyChangesData && latestPortfolio?.holdings) {
      const risers: AlertItem[] = [];
      const droppers: AlertItem[] = [];
      (latestPortfolio.holdings as any[]).forEach((h: any) => {
        const changes = dailyChangesData[h.symbol];
        const pct = Array.isArray(changes) ? changes[changes.length - 1] : (typeof changes === 'number' ? changes : null);
        if (pct == null) return;
        const isActive = (h.quantity || 0) > 1e-6;
        if (pct <= -3) droppers.push({ symbol: h.symbol, detail: `${pct.toFixed(1)}%`, active: isActive });
        else if (pct >= 3) risers.push({ symbol: h.symbol, detail: `+${pct.toFixed(1)}%`, active: isActive });
      });
      risers.sort((a, b) => parseFloat(b.detail) - parseFloat(a.detail));
      droppers.sort((a, b) => parseFloat(a.detail) - parseFloat(b.detail));
      if (risers.length)   groups.push({ id: 'movers-up', level: 'info', label: 'Up 3%+ Today',   time: 'Today', items: risers,   category: 'observations' });
      if (droppers.length) groups.push({ id: 'movers-dn', level: 'info', label: 'Down 3%+ Today', time: 'Today', items: droppers, category: 'observations' });
    }

    upcomingEvents.filter(e => e.type === 'earn' && e.daysUntil <= 7).forEach(e => {
      const detail = `Q${e.quarter} ${e.year}${e.hour === 'bmo' ? ' · pre-mkt' : e.hour === 'amc' ? ' · after-cls' : ''}`;
      const timeLabel = e.daysUntil === 0 ? 'Today' : e.daysUntil === 1 ? 'Tomorrow' : `${e.daysUntil}d`;
      groups.push({ id: `earn-${e.symbol}-${e.date}`, level: 'warn', label: `${e.symbol} Earnings`, time: timeLabel, items: [{ symbol: e.symbol, detail, active: activeSet.has(e.symbol) }], category: 'observations' });
    });

    // ── Timing signals (scenario-based, metric-driven) ───────────────────
    if (timingRecsData?.recommendations) {
      const recs: any[] = timingRecsData.recommendations;

      const momentumDip:   AlertItem[] = [];
      const valueRecover:  AlertItem[] = [];
      const primeDip:      AlertItem[] = [];
      const cheapEntry:    AlertItem[] = [];
      const uptrendCont:   AlertItem[] = [];
      const reversalSetup: AlertItem[] = [];
      const below200MA:    AlertItem[] = [];
      const below50MA:     AlertItem[] = [];

      for (const rec of recs) {
        if (rec.timing === 'ERROR' || rec.timing === 'INSUFFICIENT_DATA') continue;
        const ind      = rec.indicators ?? {};
        const isActive = activeSet.has(rec.symbol);

        const rsi    = ind.rsi           != null ? +ind.rsi           : null;
        const mom5   = ind.momentum5     != null ? +ind.momentum5     : null;
        const mom20  = ind.momentum20    != null ? +ind.momentum20    : null;
        const mom252 = ind.momentum252   != null ? +ind.momentum252   : null;
        const rs     = ind.relativeStrength != null ? +ind.relativeStrength : null;
        const cmf    = ind.cmf           != null ? +ind.cmf           : null;
        const bolB   = ind.bollingerB    != null ? +ind.bollingerB    : null;
        const adx    = ind.adx           != null ? +ind.adx           : null;
        const macd   = ind.macdBullish;
        const d200   = ind.distanceFromMA200 != null ? parseFloat(ind.distanceFromMA200) : null;
        const d50    = ind.distanceFromMA50  != null ? parseFloat(ind.distanceFromMA50)  : null;
        const distH  = ind.distanceFromHigh  != null ? +ind.distanceFromHigh  : null;
        const pe     = ind.fundamentals?.pe  != null ? +ind.fundamentals.pe : null;

        // ── Momentum Dip: strong long-term performer, short-term pullback ──
        // Long-term strength (1Y mom >10% or RS vs SPY >5%) + short-term weakness
        // (BB%B <0.30 or RSI <48 or 20d mom negative) + structure intact (d200 >-8%)
        const hasLTStrength = (mom252 != null && mom252 > 10) || (rs != null && rs > 5);
        const hasSTWeakness = (bolB != null && bolB < 0.30) || (rsi != null && rsi < 48) || (mom20 != null && mom20 < 0);
        const structuralOk  = d200 != null && d200 > -8;
        const notDistrib    = cmf == null || cmf > -0.1;
        if (hasLTStrength && hasSTWeakness && structuralOk && notDistrib) {
          const dp: string[] = [];
          if (rs    != null) dp.push(`RS ${rs >= 0 ? '+' : ''}${rs.toFixed(0)}%`);
          else if (mom252 != null) dp.push(`1Y ${mom252 >= 0 ? '+' : ''}${mom252.toFixed(0)}%`);
          if (bolB  != null && bolB < 0.30) dp.push(`BB ${bolB.toFixed(2)}`);
          else if (rsi != null && rsi < 48) dp.push(`RSI ${rsi.toFixed(0)}`);
          momentumDip.push({ symbol: rec.symbol, detail: dp.join(' · '), active: isActive });
        }

        // ── Value Recovery: below 200MA but momentum + buying pressure returning ──
        // Price still suppressed (d200 <-3%) but short-term momentum flipping positive
        // and accumulation starting (CMF >0.05 or MACD bullish), RSI not yet extended
        const belowMA         = d200 != null && d200 < -3;
        const momTurning      = mom20 != null && mom20 > 0;
        const buyingReturning = (cmf != null && cmf > 0.05) || macd === true;
        const rsiRoom         = rsi == null || rsi < 60;
        if (belowMA && momTurning && buyingReturning && rsiRoom) {
          const dp: string[] = [];
          dp.push(`200MA ${d200!.toFixed(1)}%`);
          if (cmf != null && cmf > 0.05) dp.push(`CMF +${cmf.toFixed(2)}`);
          else if (macd === true)         dp.push('MACD ▲');
          valueRecover.push({ symbol: rec.symbol, detail: dp.join(' · '), active: isActive });
        }

        // ── Prime Dip: quality name significantly off highs, floor forming ──
        // Meaningfully off highs (distH <-20%) + below 200MA but not in freefall (-35% to -5%)
        // + price stopped falling this week (mom5 >0) + RSI has room to run (28–62)
        // + smart money not actively distributing (cmf >-0.1)
        const offHighs    = distH != null && distH < -20;
        const belowMA200  = d200 != null && d200 <= -5 && d200 >= -35;
        const floorSignal = mom5 != null && mom5 > 0;
        const rsiPrime    = rsi != null && rsi >= 28 && rsi <= 62;
        const notFleeing  = cmf == null || cmf > -0.1;
        if (offHighs && belowMA200 && floorSignal && rsiPrime && notFleeing) {
          const dp: string[] = [];
          dp.push(`${distH!.toFixed(0)}% off hi`);
          dp.push(`200MA ${d200!.toFixed(1)}%`);
          if (rsi != null) dp.push(`RSI ${rsi.toFixed(0)}`);
          primeDip.push({ symbol: rec.symbol, detail: dp.join(' · '), active: isActive });
        }

        // ── Cheap Entry: attractive P/E + technical timing confirmation ──
        // Reasonable valuation (P/E 0–22) with MACD bullish, neutral/positive flow,
        // and RSI in the entry zone (28–58) — room to run, not overextended
        const hasValue    = pe != null && pe > 0 && pe < 22;
        const techConfirm = macd === true;
        const flowOk      = cmf == null || cmf > -0.05;
        const rsiEntry    = rsi != null && rsi >= 28 && rsi <= 58;
        if (hasValue && techConfirm && flowOk && rsiEntry) {
          const dp: string[] = [];
          dp.push(`P/E ${pe!.toFixed(1)}x`);
          if (cmf != null && cmf > 0) dp.push(`CMF +${cmf.toFixed(2)}`);
          if (rsi != null)             dp.push(`RSI ${rsi.toFixed(0)}`);
          cheapEntry.push({ symbol: rec.symbol, detail: dp.join(' · '), active: isActive });
        }

        // ── Uptrend: confirmed trend — ride or add on dips ──
        // MACD bullish + ADX >18 (trend has direction) + positive 20d momentum
        // + price 0–28% above 200MA (healthy range) + flow not distributing
        const trendStrong = macd === true && adx != null && adx > 18;
        const trendMom    = mom20 != null && mom20 > 0;
        const trendRange  = d200 != null && d200 >= 0 && d200 <= 28;
        const trendFlow   = cmf == null || cmf > -0.05;
        if (trendStrong && trendMom && trendRange && trendFlow) {
          const dp: string[] = [];
          dp.push(`ADX ${adx!.toFixed(0)}`);
          if (cmf != null) dp.push(`CMF ${cmf >= 0 ? '+' : ''}${cmf.toFixed(2)}`);
          uptrendCont.push({ symbol: rec.symbol, detail: dp.join(' · '), active: isActive });
        }

        // ── Reversal Setup: deeply oversold + early buying pressure ──
        // RSI <33 or BB%B <0.12 (at/below lower band) + CMF positive (buyers present)
        // + positive 5d momentum (very recent uptick confirming the turn)
        const deepOversold = (rsi != null && rsi < 33) || (bolB != null && bolB < 0.12);
        const earlyBuyers  = cmf != null && cmf > 0;
        const recentTick   = mom5 != null && mom5 > 0;
        if (deepOversold && earlyBuyers && recentTick) {
          const dp: string[] = [];
          if (bolB != null && bolB < 0.12)  dp.push(`BB ${bolB.toFixed(2)}`);
          else if (rsi != null)              dp.push(`RSI ${rsi.toFixed(0)}`);
          dp.push(`CMF +${cmf!.toFixed(2)}`);
          reversalSetup.push({ symbol: rec.symbol, detail: dp.join(' · '), active: isActive });
        }

        // ── MA support — active holdings near/below each moving average ──
        if (isActive) {
          if (d200 != null && d200 <= 2)
            below200MA.push({ symbol: rec.symbol, detail: `${d200 >= 0 ? '+' : ''}${d200.toFixed(1)}%`, active: true });
          if (d50 != null && d50 <= 2)
            below50MA.push({ symbol: rec.symbol, detail: `${d50 >= 0 ? '+' : ''}${d50.toFixed(1)}%`, active: true });
        }
      }

      if (momentumDip.length)   groups.push({ id: 'sig-dip',      level: 'ok',   label: 'Momentum Dip',  time: 'momentum+range',  items: momentumDip,    category: 'indicators' });
      if (valueRecover.length)  groups.push({ id: 'sig-recovery', level: 'ok',   label: 'Value Recovery', time: 'trend+momentum',  items: valueRecover,   category: 'indicators' });
      if (primeDip.length)      groups.push({ id: 'sig-prime',    level: 'info', label: 'Prime Dip',      time: 'range+200MA',     items: primeDip,       category: 'indicators' });
      if (cheapEntry.length)    groups.push({ id: 'sig-value',    level: 'ok',   label: 'Cheap Entry',    time: 'P/E+technical',   items: cheapEntry,     category: 'indicators' });
      if (uptrendCont.length)   groups.push({ id: 'sig-trend',    level: 'ok',   label: 'Uptrend',        time: 'trend+activity',  items: uptrendCont,    category: 'indicators' });
      if (reversalSetup.length) groups.push({ id: 'sig-reversal', level: 'info', label: 'Reversal Setup', time: 'range+activity',  items: reversalSetup,  category: 'indicators' });
      if (below200MA.length)    groups.push({ id: 'ma-below200',  level: 'info', label: '≤ 200MA',        time: '+2%',             items: below200MA,     category: 'indicators' });
      if (below50MA.length)     groups.push({ id: 'ma-below50',   level: 'info', label: '≤ 50MA',         time: '+2%',             items: below50MA,      category: 'indicators' });
    }

    // ── Fibonacci support zone alerts ────────────────────────────────────────
    if (fibBatchData && Array.isArray(fibBatchData)) {
      // nearestLevelLabel uses % from swing low; convert to standard retrace-from-high labels
      const FROM_HIGH: Record<string, string> = {
        '100%': '0%', '78.6%': '23.6%', '61.8%': '38.2%',
        '50%': '50%', '38.2%': '61.8%', '23.6%': '78.6%', '0%': '100%',
      };

      const goldenZone:  AlertItem[] = [];
      const supportZone: AlertItem[] = [];

      for (const fd of fibBatchData as any[]) {
        if (!fd?.zone || !fd?.holding) continue;
        if (!activeSet.has(fd.symbol)) continue;
        if (fd.holding.bounceStatus === 'breaking') continue;

        const { fibLabel } = fd.zone;
        const { bounceStatus, nearestLevelLabel } = fd.holding;
        const retraceLabel = FROM_HIGH[nearestLevelLabel] ?? nearestLevelLabel;

        if (fibLabel === '50% – 61.8%') {
          goldenZone.push({ symbol: fd.symbol, detail: `${retraceLabel}${bounceStatus === 'bouncing' ? ' ↑' : ''}`, active: true });
        } else if (fibLabel === '38.2% – 50%' || fibLabel === '61.8% – 78.6%') {
          supportZone.push({ symbol: fd.symbol, detail: retraceLabel, active: true });
        }
      }

      if (goldenZone.length)  groups.push({ id: 'fib-golden',  level: 'ok',   label: 'Fib Golden Zone', time: '50–61.8%', items: goldenZone,  category: 'indicators' });
      if (supportZone.length) groups.push({ id: 'fib-support', level: 'info', label: 'Fib Support',      time: 'zone',     items: supportZone, category: 'indicators' });
    }

    // ── Price target approaching + framework exit conditions ─────────────────
    // Both blocks feed into shared nearTargetItems / exitItems pushed at the end.
    const nearTargetItems: AlertItem[] = [];
    const exitItems:       AlertItem[] = [];

    // Price targets (user-set or analyst) — approaching or already exceeded
    if (latestPortfolio?.holdings) {
      const FALLBACK_RATE = 1.38;
      let storedTargets: Record<string, number> = {};
      try { storedTargets = JSON.parse(localStorage.getItem('timing-user-targets') ?? '{}'); } catch {}
      const analystTargets = analystTargetsData?.targets ?? {};

      (latestPortfolio.holdings as any[]).forEach((h: any) => {
        if ((h.quantity || 0) <= 1e-6) return;
        const cadPrice = (h.currentValue || 0) > 0 && (h.quantity || 0) > 0
          ? h.currentValue / h.quantity : null;
        if (!cadPrice) return;

        let targetCAD: number | null = null;
        if (storedTargets[h.symbol] != null) {
          targetCAD = storedTargets[h.symbol];
        } else if (analystTargets[h.symbol]?.targetMean != null) {
          targetCAD = analystTargets[h.symbol].targetMean * FALLBACK_RATE;
        } else {
          // Fallback: avgCost × 1.5 (mirrors PriceTargetsCard default target)
          // Derive avgCost in CAD: currentValue - unrealizedPnL = total invested (CAD)
          const totalInvestedCAD = (h.currentValue ?? 0) - (h.unrealizedPnL ?? 0);
          const avgCostCAD = (h.quantity ?? 0) > 0 ? totalInvestedCAD / h.quantity : 0;
          if (avgCostCAD > 0) targetCAD = avgCostCAD * 1.5;
        }
        if (targetCAD == null || targetCAD <= 0) return;

        const pctToTarget = ((targetCAD - cadPrice) / cadPrice) * 100;
        if (pctToTarget >= 0 && pctToTarget <= 5) {
          nearTargetItems.push({ symbol: h.symbol, detail: `${pctToTarget.toFixed(1)}% away`, active: true });
        } else if (pctToTarget < 0) {
          exitItems.push({ symbol: h.symbol, detail: `+${Math.abs(pctToTarget).toFixed(0)}% over`, active: true });
        }
      });
    }

    // ── Allocation status ────────────────────────────────────────────────────
    if (latestPortfolio?.holdings) {
      const holdings: any[] = latestPortfolio.holdings;
      const totalCV = holdings.reduce((s, h) => s + (h.currentValue || 0), 0);
      // Match Allocation tab: use equity sleeve (exclude crypto type='c') as denominator
      const sleeveCV = holdings
        .filter(h => (h.quantity || 0) > 1e-6 && h.type !== 'c')
        .reduce((s, h) => s + (h.currentValue || 0), 0);
      const pctDenom = sleeveCV > 0 ? sleeveCV : totalCV;
      if (totalCV > 0) {
        let posOverrides: Record<string, any> = {};
        try { posOverrides = JSON.parse(localStorage.getItem('portfolio-framework-overrides') ?? '{}'); } catch {}

        // Inline resolve: apply localStorage overrides on top of POSITION_ROLES
        // Mirrors FrameworkAllocationView: also handles override-only symbols (no POSITION_ROLES entry)
        const resolvefw = (sym: string): PositionFramework | null => {
          const base = POSITION_ROLES[sym];
          const ov = posOverrides[sym];
          if (!base) {
            if (!ov?.role) return null;
            const rule = SIZING_RULES[ov.role as PositionRole];
            return {
              sector: ov.sector ?? 'Unknown',
              role: ov.role as PositionRole,
              targetMin: rule.min, targetMax: rule.max,
              verdict: ov.verdict === null ? undefined : ov.verdict,
              buildTarget: ov.buildTarget ?? undefined,
            };
          }
          if (!ov) return base;
          const role: PositionRole = ov.role ?? base.role;
          const rule = SIZING_RULES[role];
          return {
            ...base, role,
            sector: ov.sector ?? base.sector,
            targetMin: rule.min, targetMax: rule.max,
            buildTarget: 'buildTarget' in ov ? (ov.buildTarget ?? undefined) : (ov.role ? undefined : base.buildTarget),
            verdict: 'verdict' in ov ? (ov.verdict ?? undefined) : base.verdict,
          };
        };

        const underweight: AlertItem[] = [];
        const building:    AlertItem[] = [];
        const overweight:  AlertItem[] = [];
        const trimming:    AlertItem[] = [];
        const decide:      AlertItem[] = [];

        holdings.forEach((h: any) => {
          const held = (h.quantity || 0) > 1e-6;
          if (!held) return;
          const fw = resolvefw(h.symbol);
          if (!fw) return;
          const pct = ((h.currentValue || 0) / pctDenom) * 100;

          if (fw.verdict === 'sell') {
            const ec = posOverrides[h.symbol]?.exitCondition as { type: 'now' | 'pnl' | 'custom'; pnlPct?: number; breakeven?: boolean; note?: string } | undefined;

            if (!ec || ec.type === 'now') {
              exitItems.push({ symbol: h.symbol, detail: 'exit NOW', active: true });
            } else if (ec.type === 'pnl') {
              const exitTarget = ec.pnlPct ?? 0;
              if (h.unrealizedPnL == null || h.currentValue == null) {
                // Price data unavailable — can't determine if target is reached
              } else {
              // Use current CAD cost basis (currentValue - unrealizedPnL) to match allocation view's denominator
              const costBasis = h.currentValue - h.unrealizedPnL;
              const currentPnLPct = costBasis > 0 ? (h.unrealizedPnL / costBasis) * 100 : 0;
              const gap = exitTarget - currentPnLPct;
              const reached = exitTarget >= 0 ? currentPnLPct >= exitTarget : currentPnLPct <= exitTarget;
              const approaching = !reached && Math.abs(gap) <= 5;
              const targetLabel = (ec.breakeven || exitTarget === 0) ? 'BE' : `${exitTarget > 0 ? '+' : ''}${exitTarget}%`;
              if (reached) {
                exitItems.push({ symbol: h.symbol, detail: `${targetLabel} hit`, active: true });
              } else if (approaching) {
                nearTargetItems.push({ symbol: h.symbol, detail: `${Math.abs(gap).toFixed(1)}% to ${targetLabel}`, active: true });
              }
              } // end else (price data available)
            } else {
              // custom condition — show in exit with truncated note
              exitItems.push({ symbol: h.symbol, detail: ec.note ? ec.note.slice(0, 18) : 'condition', active: true });
            }
          } else if (fw.verdict === 'decide') {
            decide.push({ symbol: h.symbol, detail: 'decide', active: true });
          } else if (fw.buildTarget) {
            if (pct < fw.buildTarget - 0.5)
              building.push({ symbol: h.symbol, detail: `${pct.toFixed(1)}%→${fw.buildTarget}%`, active: true });
            else if (pct > fw.buildTarget + 0.5)
              trimming.push({ symbol: h.symbol, detail: `${pct.toFixed(1)}%↓${fw.buildTarget}%`, active: true });
          } else {
            if (pct < fw.targetMin - 0.5)
              underweight.push({ symbol: h.symbol, detail: `${pct.toFixed(1)}→${fw.targetMin}%`, active: true });
            else if (pct > fw.targetMax + 1)
              overweight.push({ symbol: h.symbol, detail: `${pct.toFixed(1)}↑${fw.targetMax}%`, active: true });
          }
        });

        if (underweight.length || building.length) groups.push({ id: 'alloc-uw',   level: 'info',   label: 'Underweight', time: 'alloc',   items: [...underweight, ...building], category: 'targets'      });
        if (overweight.length)  groups.push({ id: 'alloc-ow',   level: 'warn',   label: 'Overweight',  time: 'alloc',   items: overweight, category: 'targets'      });
        if (trimming.length)    groups.push({ id: 'alloc-trim', level: 'warn',   label: 'Trim target', time: 'alloc',   items: trimming,   category: 'observations' });
        if (decide.length)      groups.push({ id: 'alloc-dec',  level: 'warn',   label: 'Decide',      time: 'verdict', items: decide,     category: 'observations' });
      }
    }

    // Push Near Target and Exit after both blocks have contributed
    if (nearTargetItems.length) groups.push({ id: 'near-target', level: 'warn',   label: 'Near Target', time: 'target', items: nearTargetItems, category: 'targets'      });
    if (exitItems.length)       groups.push({ id: 'alloc-exit',  level: 'urgent', label: 'Exit',        time: 'now',    items: exitItems,       category: 'targets'      });

    return groups;
  }, [rsiData, activeSymbols, dailyChangesData, latestPortfolio, upcomingEvents, analystTargetsData, timingRecsData, fibBatchData, alertsKey]);

  // Arrow-key cycling through confluence tickers
  useEffect(() => {
    if (!confluenceSel) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const targetSyms = new Set(actionAlerts.filter(g => g.category === 'targets').flatMap(g => g.items.map(i => i.symbol)));
      const indSyms    = new Set(actionAlerts.filter(g => g.category === 'indicators').flatMap(g => g.items.map(i => i.symbol)));
      const obsSyms    = new Set(actionAlerts.filter(g => g.category === 'observations').flatMap(g => g.items.map(i => i.symbol)));
      const SIG_IDS  = new Set(['sig-dip', 'sig-recovery', 'sig-prime', 'sig-value', 'sig-trend', 'sig-reversal']);
      const bullSyms = new Set(
        actionAlerts.filter(g => SIG_IDS.has(g.id)).flatMap(g => g.items.map(i => i.symbol))
          .filter(sym => actionAlerts.filter(g => g.items.some(i => i.symbol === sym)).length >= 2)
      );
      const syms = Array.from(new Set([
        ...Array.from(bullSyms),
        ...Array.from(targetSyms).filter(s => indSyms.has(s) || obsSyms.has(s)),
      ])).sort((a, b) => {
        const secA = [targetSyms.has(a), indSyms.has(a), obsSyms.has(a)].filter(Boolean).length;
        const secB = [targetSyms.has(b), indSyms.has(b), obsSyms.has(b)].filter(Boolean).length;
        if (secB !== secA) return secB - secA;
        const cardsA = actionAlerts.filter(g => g.items.some(i => i.symbol === a)).length;
        const cardsB = actionAlerts.filter(g => g.items.some(i => i.symbol === b)).length;
        return cardsB - cardsA;
      });
      if (syms.length < 2) return;
      e.preventDefault();
      const idx = syms.indexOf(confluenceSel);
      const next = e.key === 'ArrowRight'
        ? syms[(idx + 1) % syms.length]
        : syms[(idx - 1 + syms.length) % syms.length];
      setConfluenceSel(next);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [confluenceSel, actionAlerts]);

  const fmtCAD = (v: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(v);

  const currentPage = (() => {
    const all = [...navigation.filter(i => !('type' in i)) as NavigationItem[], ...adminItems];
    return all.find(i => i.href === location.pathname)?.name ?? 'Dashboard';
  })();

  const today = new Date().toLocaleDateString('en-CA', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <div style={{
      height: '100vh',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      background: '#0a0c10',
    }}>

      {/* ── STICKY TOP BAR ── */}
      <div style={{
        flexShrink: 0,
        height: '52px',
        background: '#0d111a',
        borderBottom: '1px solid #1e2535',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: '16px',
        paddingRight: '16px',
        gap: '0',
        zIndex: 100,
      }}>
        {/* Brand + Data Sources */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 'none' }}>
          {/* Lightbulb icon — no container box */}
          <Lightbulb className="brain-glow-animate" style={{ width: '22px', height: '22px', color: '#00d4aa', flexShrink: 0 }} />

          {/* "PORTFOLIO INTEL" wordmark */}
          <span style={{
            fontFamily: mono, fontSize: '13px', fontWeight: 700,
            color: '#00d4aa', letterSpacing: '0.14em',
            textTransform: 'uppercase' as const,
            textShadow: '0 0 12px rgba(0,212,170,0.45)',
          }}>Portfolio Intel</span>

          {/* Separator */}
          <span style={{ fontFamily: mono, fontSize: '14px', color: '#1e2a38', fontWeight: 300 }}>×</span>

          {/* Data sourced by label + logos */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontFamily: mono, fontSize: '9px', color: '#64748b', letterSpacing: '0.14em', textTransform: 'uppercase' as const, whiteSpace: 'nowrap' as const }}>
              data sourced by
            </span>
            <img src="/icons/WS.png" alt="Wealthsimple" style={{ height: '24px', width: 'auto', opacity: 0.9 }} />
            <img src="/icons/QS.png" alt="Questrade" style={{ height: '24px', width: 'auto', opacity: 0.9 }} />
          </div>
        </div>

        {/* Current page — center */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
          <span style={{ fontFamily: mono, fontSize: '13px', color: '#2a3445', letterSpacing: '0.08em' }}>/</span>
          <span style={{ fontFamily: mono, fontSize: '15px', fontWeight: 700, color: '#cbd5e1', letterSpacing: '0.12em', textTransform: 'uppercase' as const }}>{currentPage}</span>
        </div>

        {/* Right: date · market · clock */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: '15%', justifyContent: 'flex-end' }}>
          <span style={{ fontFamily: mono, fontSize: '12px', fontWeight: 600, color: '#64748b', letterSpacing: '0.04em' }}>{today}</span>
          <span style={{ width: '1px', height: '16px', background: '#1e2535' }} />
          <span style={{
            fontFamily: mono, fontSize: '11px', fontWeight: 700,
            padding: '3px 9px', borderRadius: '2px', letterSpacing: '0.1em',
            backgroundColor: `${mkt.color}18`, color: mkt.color, border: `1px solid ${mkt.color}35`
          }}>
            {mkt.label}
          </span>
          <span style={{ fontFamily: mono, fontSize: '16px', fontWeight: 700, color: '#e2e8f0', letterSpacing: '0.08em', minWidth: '88px', textAlign: 'right' as const }}>
            {clock}
          </span>
        </div>
      </div>

      {/* ── THREE-COLUMN GRID ── */}
      <div style={{
        flex: 1,
        overflow: 'hidden',
        display: 'grid',
        gridTemplateColumns: '15% 70% 15%',
      }}>

      {/* ── LEFT SIDEBAR ── */}
      <aside style={{
        background: '#10141c',
        borderRight: '1px solid #1e2535',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Total Portfolio section */}
        <div style={{ padding: '14px 16px 16px', borderBottom: '1px solid #1e2535', flexShrink: 0 }}>
          <div style={{ fontFamily: mono, fontSize: '11px', fontWeight: 700, letterSpacing: '0.14em', color: '#4a5568', textTransform: 'uppercase' as const, marginBottom: '12px' }}>
            Total Portfolio
          </div>
          <div style={{ textAlign: 'center' }}>
            {portfolioTotals ? (
              <>
                {/* Main value */}
                <div style={{ fontFamily: mono, fontSize: '32px', fontWeight: 700, color: '#e2e8f0', lineHeight: 1.1 }}>
                  {fmtCAD(portfolioTotals.totalCV)}
                </div>

                {/* Today's change */}
                {todayStats ? (
                  <div style={{ fontFamily: mono, fontSize: '16px', fontWeight: 700, color: todayStats.dollarChange >= 0 ? '#22c55e' : '#ef4444', marginTop: '8px' }}>
                    {todayStats.dollarChange >= 0 ? '▲' : '▼'} {fmtCAD(Math.abs(todayStats.dollarChange))}&nbsp;&nbsp;{todayStats.pct >= 0 ? '+' : ''}{todayStats.pct.toFixed(2)}% today
                  </div>
                ) : (
                  <div style={{ fontFamily: mono, fontSize: '15px', color: '#4a5568', marginTop: '8px' }}>— today</div>
                )}

                {/* YTD / All-time / vs S&P row */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', alignItems: 'center', marginTop: '8px', flexWrap: 'wrap' as const }}>
                  <span style={{ fontFamily: mono, fontSize: '13px', color: '#64748b' }}>YTD:</span>
                  <span style={{ fontFamily: mono, fontSize: '14px', fontWeight: 700, color: ytdStats ? (ytdStats.portfolioYTD >= 0 ? '#22c55e' : '#ef4444') : '#4a5568' }}>
                    {ytdStats ? `${ytdStats.portfolioYTD >= 0 ? '+' : ''}${ytdStats.portfolioYTD.toFixed(1)}%` : '—'}
                  </span>
                  <span style={{ color: '#2a3445', fontSize: '13px' }}>|</span>
                  <span style={{ fontFamily: mono, fontSize: '13px', color: '#64748b' }}>All:</span>
                  <span style={{ fontFamily: mono, fontSize: '14px', fontWeight: 700, color: portfolioTotals.pct >= 0 ? '#22c55e' : '#ef4444' }}>
                    {`${portfolioTotals.pct >= 0 ? '+' : ''}${portfolioTotals.pct.toFixed(1)}%`}
                  </span>
                  <span style={{ color: '#2a3445', fontSize: '13px' }}>|</span>
                  <span style={{ fontFamily: mono, fontSize: '13px', color: '#64748b' }}>vs S&amp;P:</span>
                  <span style={{ fontFamily: mono, fontSize: '14px', fontWeight: 700, color: ytdStats?.vsSnp != null ? (ytdStats.vsSnp >= 0 ? '#22c55e' : '#ef4444') : '#4a5568' }}>
                    {ytdStats?.vsSnp != null ? `${ytdStats.vsSnp >= 0 ? '+' : ''}${ytdStats.vsSnp.toFixed(1)}%` : '—'}
                  </span>
                </div>

                {/* 90-day P&L sparkline */}
                {sparkline && (
                  <div style={{ marginTop: '10px', width: '100%', position: 'relative' }}>
                    <svg
                      width="100%"
                      height={sparkline.H}
                      viewBox={`0 0 ${sparkline.W} ${sparkline.H}`}
                      preserveAspectRatio="none"
                      style={{ display: 'block' }}
                    >
                      <defs>
                        <clipPath id="sp-above">
                          <rect x="0" y="0" width={sparkline.W} height={sparkline.zeroY} />
                        </clipPath>
                        <clipPath id="sp-below">
                          <rect x="0" y={sparkline.zeroY} width={sparkline.W} height={sparkline.H - sparkline.zeroY} />
                        </clipPath>
                      </defs>
                      {/* Green — above zero */}
                      <path d={sparkline.fillPath} fill="rgba(34,197,94,0.10)" clipPath="url(#sp-above)" />
                      <path d={sparkline.linePath} fill="none" stroke="#22c55e" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" clipPath="url(#sp-above)" />
                      {/* Red — below zero */}
                      <path d={sparkline.fillPath} fill="rgba(239,68,68,0.10)" clipPath="url(#sp-below)" />
                      <path d={sparkline.linePath} fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" clipPath="url(#sp-below)" />
                      {/* Zero baseline — only when chart straddles zero */}
                      {sparkline.zeroY > 1 && sparkline.zeroY < sparkline.H - 1 && (
                        <line x1="0" y1={sparkline.zeroY} x2={sparkline.W} y2={sparkline.zeroY}
                          stroke="rgba(255,255,255,0.12)" strokeWidth="0.5" strokeDasharray="3,3" />
                      )}
                    </svg>
                    {/* Month-start labels */}
                    {sparkline.monthTicks.length > 0 && (
                      <div style={{ position: 'relative', height: '14px', marginTop: '1px' }}>
                        {sparkline.monthTicks.map(({ pct, label }, idx) => (
                          <span key={idx} style={{
                            position: 'absolute',
                            left: `${Math.min(96, pct)}%`,
                            transform: 'translateX(-50%)',
                            fontSize: '11px',
                            fontFamily: mono,
                            fontWeight: 700,
                            color: '#374151',
                            lineHeight: 1,
                            pointerEvents: 'none',
                          }}>{label}</span>
                        ))}
                      </div>
                    )}
                    {/* % label — HTML overlay so it isn't stretched by preserveAspectRatio="none" */}
                    <div style={{
                      position: 'absolute',
                      right: 0,
                      top: `${Math.max(0, Math.min(sparkline.H - 14, (sparkline.lastY / sparkline.H) * sparkline.H - 10))}px`,
                      fontFamily: mono,
                      fontSize: '9px',
                      fontWeight: 700,
                      color: sparkline.pct >= 0 ? '#22c55e' : '#ef4444',
                      lineHeight: 1,
                      pointerEvents: 'none',
                    }}>
                      {sparkline.pct >= 0 ? '+' : ''}{sparkline.pct.toFixed(1)}%
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontFamily: mono, fontSize: '26px', fontWeight: 700, color: '#2a3445' }}>—</div>
            )}
          </div>
        </div>

        {/* Cache health grid */}
        {activeSymbols.length > 0 && (() => {
          const freshness: Record<string, string | null> = cacheFreshnessData?.freshness || {};
          const FIFTEEN_MIN = 15 * 60 * 1000;
          const now = nowMs;
          return (
            <div style={{ padding: '10px 16px 12px', borderBottom: '1px solid #1e2535', flexShrink: 0 }}>
              <div style={{ fontFamily: mono, fontSize: '10px', fontWeight: 700, letterSpacing: '0.14em', color: '#4a5568', textTransform: 'uppercase' as const, marginBottom: '8px' }}>
                Price Cache
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, minmax(0, 1fr))', gap: '3px' }}>
                {activeSymbols.map(sym => {
                  const ts = freshness[sym];
                  const age = ts ? now - new Date(ts).getTime() : Infinity;
                  const fresh = age < FIFTEEN_MIN;
                  const ageMin = isFinite(age) ? Math.floor(age / 60000) : null;
                  const tip = ageMin !== null ? `${sym} · ${ageMin}m ago` : `${sym} · no cache`;
                  const label = sym.replace(/\.(TO|V|CN)$/, '');
                  return (
                    <div
                      key={sym}
                      title={tip}
                      style={{
                        borderRadius: '2px',
                        backgroundColor: fresh ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)',
                        border: `1px solid ${fresh ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)'}`,
                        color: fresh ? '#4ade80' : '#f87171',
                        fontFamily: mono,
                        fontSize: '7px',
                        fontWeight: 700,
                        letterSpacing: '0.02em',
                        textAlign: 'center' as const,
                        padding: '2px 1px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap' as const,
                        cursor: 'default',
                        lineHeight: 1.2,
                      }}
                    >
                      {label}
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontFamily: mono, fontSize: '9px', color: '#4a5568' }}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '1px', backgroundColor: '#22c55e', display: 'inline-block' }} />
                  fresh
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontFamily: mono, fontSize: '9px', color: '#4a5568' }}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '1px', backgroundColor: '#ef4444', display: 'inline-block' }} />
                  stale (&gt;15m)
                </span>
              </div>
            </div>
          );
        })()}

        {/* Accounts section */}
        {(() => {
          const ACCOUNTS = [
            { key: 'TFSA',    label: 'TFSA',    tagColor: '#22c55e', tagBg: 'rgba(34,197,94,0.10)',   tagBorder: 'rgba(34,197,94,0.25)'   },
            { key: 'FHSA',    label: 'FHSA',    tagColor: '#f59e0b', tagBg: 'rgba(245,158,11,0.10)', tagBorder: 'rgba(245,158,11,0.25)'  },
            { key: 'RRSP',    label: 'RRSP',    tagColor: '#4f8fff', tagBg: 'rgba(79,143,255,0.10)',  tagBorder: 'rgba(79,143,255,0.25)'  },
            { key: 'Non-Reg', label: 'Non-Reg', tagColor: '#e2e8f0', tagBg: 'rgba(226,232,240,0.08)', tagBorder: 'rgba(226,232,240,0.18)' },
          ];
          const total = accountValues ? Object.values(accountValues).reduce((s, v) => s + v, 0) : 0;
          return (
            <div style={{ padding: '10px 16px 12px', borderBottom: '1px solid #1e2535', flexShrink: 0 }}>
              <div style={{ fontFamily: mono, fontSize: '10px', fontWeight: 700, letterSpacing: '0.14em', color: '#4a5568', textTransform: 'uppercase' as const, marginBottom: '8px' }}>
                Accounts
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {ACCOUNTS.map(({ key, label, tagColor, tagBg, tagBorder }) => {
                  const val = accountValues?.[key] ?? 0;
                  const hasVal = accountValues && val > 0;
                  return (
                    <div key={key} style={{
                      padding: '5px 7px', borderRadius: '4px',
                      background: '#141820', border: '1px solid #1e2535',
                      display: 'flex', flexDirection: 'column', gap: '3px',
                      flex: '1 1 0', minWidth: 0,
                    }}>
                      <span style={{ fontFamily: mono, fontSize: '8px', fontWeight: 700, padding: '1px 4px', borderRadius: '2px', color: tagColor, background: tagBg, border: `1px solid ${tagBorder}`, letterSpacing: '0.06em', alignSelf: 'flex-start', whiteSpace: 'nowrap' }}>
                        {label}
                      </span>
                      <span style={{ fontFamily: mono, fontSize: '11px', fontWeight: 700, color: hasVal ? tagColor : '#2a3445', whiteSpace: 'nowrap' }}>
                        {hasVal ? fmtCAD(val) : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Views section */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 16px 4px', flexShrink: 0 }}>
            <div style={{ fontFamily: mono, fontSize: '11px', fontWeight: 700, letterSpacing: '0.14em', color: '#4a5568', textTransform: 'uppercase' as const }}>
              Views
            </div>
          </div>
          <div style={{ padding: '4px 0' }}>
            {navigation.map((item, index) => {
              if ('type' in item) {
                return (
                  <div key={`sep-${index}`} style={{ padding: '10px 16px 3px' }}>
                    {item.label && (
                      <div style={{ fontFamily: mono, fontSize: '10px', fontWeight: 700, color: '#2a3445', letterSpacing: '0.14em', textTransform: 'uppercase' as const }}>
                        {item.label}
                      </div>
                    )}
                  </div>
                );
              }
              const navItem = item as NavigationItem;
              const active = isActive(navItem.href);
              return (
                <Link
                  key={navItem.href}
                  to={navItem.href}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '7px 10px',
                    margin: '1px 14px',
                    textDecoration: 'none',
                    color: active ? '#00d4aa' : '#94a3b8',
                    backgroundColor: active ? 'rgba(0,212,170,0.08)' : 'transparent',
                    borderRadius: '4px',
                    transition: 'all 0.12s',
                    fontSize: '13px',
                    fontWeight: active ? 600 : 400,
                    fontFamily: "'IBM Plex Sans', sans-serif",
                  }}
                  onMouseEnter={e => { if (!active) { e.currentTarget.style.backgroundColor = 'rgba(0,212,170,0.04)'; e.currentTarget.style.color = '#e2e8f0'; } }}
                  onMouseLeave={e => { if (!active) { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#94a3b8'; } }}
                >
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: active ? '#00d4aa' : '#2a3445', flexShrink: 0, display: 'inline-block' }} />
                  {navItem.name}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Bottom: Admin + Cmd+K */}
        <div style={{ flexShrink: 0, borderTop: '1px solid #1e2535' }}>
          {/* Admin section */}
          <div ref={adminRef} style={{ position: 'relative' }}>
            <div style={{ padding: '6px 0' }}>
              {adminItems.map(item => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '7px 10px',
                      margin: '1px 14px',
                      textDecoration: 'none',
                      color: active ? '#00d4aa' : '#94a3b8',
                      backgroundColor: active ? 'rgba(0,212,170,0.08)' : 'transparent',
                      borderRadius: '4px',
                      fontSize: '13px',
                      fontWeight: active ? 600 : 400,
                      fontFamily: "'IBM Plex Sans', sans-serif",
                      transition: 'all 0.12s',
                    }}
                    onMouseEnter={e => { if (!active) { e.currentTarget.style.backgroundColor = 'rgba(0,212,170,0.04)'; e.currentTarget.style.color = '#e2e8f0'; } }}
                    onMouseLeave={e => { if (!active) { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#94a3b8'; } }}
                  >
                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: active ? '#00d4aa' : '#2a3445', flexShrink: 0, display: 'inline-block' }} />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Cmd+K */}
          <div style={{ padding: '10px 14px', borderTop: '1px solid #1e2535' }}>
            <button
              onClick={() => setSearchOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '7px 10px',
                borderRadius: '4px',
                border: '1px solid #1e2535',
                backgroundColor: '#141820',
                cursor: 'pointer',
                fontFamily: mono,
                fontSize: '11px',
                color: '#4a5568',
                textAlign: 'left' as const,
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#00d4aa')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = '#1e2535')}
            >
              <Search style={{ width: '12px', height: '12px', flexShrink: 0 }} />
              <span style={{ flex: 1 }}>Quick nav…</span>
              <kbd style={{ fontFamily: mono, fontSize: '10px', padding: '1px 4px', border: '1px solid #1e2535', borderRadius: '2px', color: '#4a5568' }}>⌘K</kbd>
            </button>
          </div>
        </div>
      </aside>

      {/* ── CENTER (main content) ── */}
      <main style={{
        height: '100%',
        overflowY: 'auto',
        background: '#0a0c10',
      }}>
        {children}
      </main>

      {/* ── RIGHT PANEL ── */}
      <aside style={{
        background: '#10141c',
        borderLeft: '1px solid #1e2535',
        height: '100%',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Action Alerts — fills all available space, pushes fixed sections to bottom */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', borderBottom: '1px solid #1e2535' }}>
          {/* Header */}
          <div style={{ padding: '12px 14px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ fontFamily: mono, fontSize: '10px', fontWeight: 700, color: '#4a5568', letterSpacing: '0.14em', textTransform: 'uppercase' as const }}>Action Alerts</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                onClick={() => setAlertsKey(k => k + 1)}
                title="Refresh alerts"
                style={{ background: 'rgba(79,143,255,0.08)', border: '1px solid rgba(79,143,255,0.2)', cursor: 'pointer', padding: '2px 6px', borderRadius: '3px', color: '#4f8fff', lineHeight: 1, fontSize: '12px', fontFamily: mono, transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(79,143,255,0.18)'; e.currentTarget.style.borderColor = 'rgba(79,143,255,0.45)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(79,143,255,0.08)'; e.currentTarget.style.borderColor = 'rgba(79,143,255,0.2)'; }}
              >↻</button>
              {actionAlerts.length > 0 && (
                <span style={{ fontFamily: mono, fontSize: '9px', fontWeight: 700, padding: '1px 6px', borderRadius: '2px', background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}>
                  {actionAlerts.length}
                </span>
              )}
            </div>
          </div>

          {/* Scrollable body */}
          <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 14px 12px' }}>
            {actionAlerts.length === 0 ? (
              <div style={{ fontFamily: mono, fontSize: '11px', color: '#2a3445' }}>— no alerts</div>
            ) : (() => {
              const LEVEL_COLORS = {
                urgent: { dot: '#ef4444', text: '#ef4444', bg: 'rgba(239,68,68,0.07)',  border: 'rgba(239,68,68,0.22)',  pill: 'rgba(239,68,68,0.12)'  },
                warn:   { dot: '#f59e0b', text: '#f59e0b', bg: 'rgba(245,158,11,0.07)', border: 'rgba(245,158,11,0.22)', pill: 'rgba(245,158,11,0.12)' },
                info:   { dot: '#4f8fff', text: '#4f8fff', bg: 'rgba(79,143,255,0.07)', border: 'rgba(79,143,255,0.22)', pill: 'rgba(79,143,255,0.12)' },
                ok:     { dot: '#22c55e', text: '#22c55e', bg: 'rgba(34,197,94,0.06)',  border: 'rgba(34,197,94,0.22)',  pill: 'rgba(34,197,94,0.10)'  },
              };

              const targetGroups      = actionAlerts.filter(g => g.category === 'targets');
              const indicatorGroups   = actionAlerts.filter(g => g.category === 'indicators');
              const observationGroups = actionAlerts.filter(g => g.category === 'observations');

              const targetSymbols      = new Set(targetGroups.flatMap(g => g.items.map(i => i.symbol)));
              const indicatorSymbols   = new Set(indicatorGroups.flatMap(g => g.items.map(i => i.symbol)));
              const observationSymbols = new Set(observationGroups.flatMap(g => g.items.map(i => i.symbol)));

              // Confluence: multiple independent signals must agree on the same ticker.
              // Scenario tickers only qualify if they appear in 2+ cards total —
              // a single scenario card is just a signal, not confluence.
              // Target tickers (exit, alloc) still need a second signal (unchanged).
              const SCENARIO_IDS = new Set(['sig-dip', 'sig-recovery', 'sig-prime', 'sig-value', 'sig-trend', 'sig-reversal']);
              const scenarioSymbols = new Set(
                actionAlerts.filter(g => SCENARIO_IDS.has(g.id)).flatMap(g => g.items.map(i => i.symbol))
              );
              const multiCardScenarioSyms = Array.from(scenarioSymbols).filter(sym =>
                actionAlerts.filter(g => g.items.some(i => i.symbol === sym)).length >= 2
              );
              const cryptoHoldingSymbols = new Set(
                (latestPortfolio?.holdings as any[] ?? [])
                  .filter((h: any) => h.type === 'c')
                  .map((h: any) => h.symbol as string)
              );
              const confluenceSyms = Array.from(new Set([
                ...multiCardScenarioSyms,
                ...Array.from(targetSymbols).filter(s => indicatorSymbols.has(s) || observationSymbols.has(s)),
              ])).filter(s => !cryptoHoldingSymbols.has(s) || s === 'BTC' || s === 'ETH')
              .sort((a, b) => {
                const secA = [targetSymbols.has(a), indicatorSymbols.has(a), observationSymbols.has(a)].filter(Boolean).length;
                const secB = [targetSymbols.has(b), indicatorSymbols.has(b), observationSymbols.has(b)].filter(Boolean).length;
                if (secB !== secA) return secB - secA;
                const cardsA = actionAlerts.filter(g => g.items.some(i => i.symbol === a)).length;
                const cardsB = actionAlerts.filter(g => g.items.some(i => i.symbol === b)).length;
                return cardsB - cardsA;
              });

              const sel = confluenceSel;
              const filterBySel = (gs: typeof actionAlerts) =>
                sel ? gs.filter(g => g.items.some(i => i.symbol === sel)) : gs;

              const BUY_IDS  = new Set(['alloc-uw', 'ma-below200', 'ma-below50', 'rsi-os', 'fib-golden', 'fib-support', 'sig-dip', 'sig-recovery', 'sig-prime', 'sig-value', 'sig-trend', 'sig-reversal']);
              const SELL_IDS = new Set(['alloc-ow', 'alloc-exit', 'alloc-trim', 'rsi-ob', 'near-target']);
              const labelColor = (id: string) =>
                BUY_IDS.has(id)  ? '#4ade80' :
                SELL_IDS.has(id) ? '#f87171' :
                '#e2e8f0';

              const renderGroup = (group: typeof actionAlerts[number]) => {
                const colors = LEVEL_COLORS[group.level];
                const lc = labelColor(group.id);
                return (
                  <div key={`${group.id}-${sel ?? ''}`} style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: '4px', padding: '6px 9px', animation: sel ? '_cardIn 0.18s cubic-bezier(0.4,0,0.2,1) both' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: group.items.length ? '5px' : 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '5px', height: '5px', borderRadius: '50%', flexShrink: 0, backgroundColor: lc }} />
                        <span style={{ fontFamily: mono, fontSize: '10px', fontWeight: 700, color: lc, letterSpacing: '0.04em' }}>{group.label}</span>
                      </div>
                      <span style={{ fontFamily: mono, fontSize: '9px', color: colors.text }}>{group.time}</span>
                    </div>
                    {group.items.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '3px', paddingLeft: '11px' }}>
                        {group.items.map(item => {
                          const isPurple  = sel === item.symbol;
                          const isGreyed  = sel !== null && sel !== item.symbol;
                          const bg        = isPurple ? 'rgba(168,85,247,0.15)' : isGreyed ? 'rgba(148,163,184,0.05)' : item.active ? colors.pill : 'rgba(148,163,184,0.10)';
                          const border    = isPurple ? 'rgba(168,85,247,0.4)'  : isGreyed ? 'rgba(148,163,184,0.12)' : item.active ? colors.border : 'rgba(148,163,184,0.28)';
                          const symColor  = isPurple ? '#a855f7' : isGreyed ? '#2a3445' : item.active ? '#e2e8f0' : '#94a3b8';
                          const detColor  = isPurple ? '#c084fc' : isGreyed ? '#1e2535' : item.active ? colors.text : '#64748b';
                          return (
                            <span key={item.symbol} style={{ fontFamily: mono, fontSize: '10px', background: bg, border: `1px solid ${border}`, borderRadius: '2px', padding: '2px 7px', whiteSpace: 'nowrap' as const, transition: 'all 0.15s' }}>
                              <span style={{ color: symColor, fontWeight: 600 }}>{item.symbol}</span>
                              <span style={{ color: detColor }}> {item.detail}</span>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              };

              const sectionSep = (label: string) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '6px 0 2px' }}>
                  <div style={{ flex: 1, height: '1px', background: '#1e2535' }} />
                  <span style={{ fontFamily: mono, fontSize: '8px', fontWeight: 700, color: '#2a3445', letterSpacing: '0.12em', textTransform: 'uppercase' as const, flexShrink: 0 }}>{label}</span>
                  <div style={{ flex: 1, height: '1px', background: '#1e2535' }} />
                </div>
              );

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>

                  {/* ── keyframes ── */}
                  <style>{`
                    @keyframes _tickerSlide {
                      from { opacity: 0; transform: translateY(-6px) scaleY(0.94); }
                      to   { opacity: 1; transform: translateY(0) scaleY(1); }
                    }
                    @keyframes _cardIn {
                      from { opacity: 0; transform: translateY(5px); }
                      to   { opacity: 1; transform: translateY(0); }
                    }
                  `}</style>

                  {/* ── CONFLUENCE ── */}
                  {confluenceSyms.length > 0 && (
                    <>
                      <div style={{ fontFamily: mono, fontSize: '9px', fontWeight: 700, color: '#00d4aa', letterSpacing: '0.14em', textTransform: 'uppercase' as const, padding: '4px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#00d4aa', flexShrink: 0 }} />
                        Confluence
                        <span style={{ fontFamily: mono, fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '2px', background: 'rgba(0,212,170,0.12)', color: '#00d4aa', border: '1px solid rgba(0,212,170,0.25)' }}>{confluenceSyms.length}</span>
                      </div>
                      <div style={{ background: 'rgba(0,212,170,0.05)', border: '1px solid rgba(0,212,170,0.2)', borderRadius: '4px', padding: '6px 9px', display: 'flex', flexWrap: 'wrap' as const, gap: '4px' }}>
                        {(() => {
                          const pScore = (sym: string) => {
                            const symGs = actionAlerts.filter(g => g.items.some(i => i.symbol === sym));
                            const sec   = [targetSymbols.has(sym), indicatorSymbols.has(sym), observationSymbols.has(sym)].filter(Boolean).length;
                            const urgentBonus    = symGs.some(g => g.level === 'urgent')                         ? 15 : 0;
                            const rsiBonus       = symGs.some(g => g.id === 'rsi-os' || g.id === 'rsi-ob')       ?  8 : 0;
                            const nearBonus      = symGs.some(g => g.id === 'near-target')                        ?  5 : 0;
                            // Scenario card bonuses — each scenario a ticker appears in adds weight
                            const scenarioIds    = ['sig-dip', 'sig-recovery', 'sig-prime', 'sig-value', 'sig-trend', 'sig-reversal'] as const;
                            const scenarioCount  = scenarioIds.filter(id => symGs.some(g => g.id === id)).length;
                            const scenarioBonus  = scenarioCount * 6;
                            // Recovery bonus: below 200MA with positive daily change = early momentum
                            const recoveryBonus  = (() => {
                              if (!symGs.some(g => g.id === 'sig-recovery' || g.id === 'ma-below200')) return 0;
                              const raw    = (dailyChangesData as any)?.[sym];
                              const recent = Array.isArray(raw) ? raw[raw.length - 1] : (typeof raw === 'number' ? raw : null);
                              return recent != null && recent > 0 ? 6 : 0;
                            })();
                            // Momentum alignment: positive 20d momentum while below 200MA = early recovery
                            const timingRec     = (timingRecsData as any)?.recommendations?.find((r: any) => r.symbol === sym);
                            const mom20v        = timingRec?.indicators?.momentum20;
                            const d200raw       = timingRec?.indicators?.distanceFromMA200;
                            const d200nv        = d200raw != null ? parseFloat(d200raw) : null;
                            const momentumBonus = (mom20v != null && +mom20v > 3 && d200nv != null && d200nv < 0) ? 7 : 0;
                            return sec * 10 + symGs.length + urgentBonus + rsiBonus + nearBonus + scenarioBonus + recoveryBonus + momentumBonus;
                          };
                          const pScores = confluenceSyms.map(pScore);
                          // Only scale relative to green/red chips — yellow and teal are excluded from effect
                          const scaledIdxs = confluenceSyms.map((sym, i) => {
                            const gs = actionAlerts.filter(g => g.items.some(item => item.symbol === sym));
                            const b = gs.some(g => BUY_IDS.has(g.id));
                            const s = gs.some(g => SELL_IDS.has(g.id));
                            return (b !== s) ? i : -1;
                          }).filter(i => i >= 0);
                          const scaledScores = scaledIdxs.map(i => pScores[i]);
                          const maxP = scaledScores.length ? Math.max(...scaledScores) : 1;
                          const minP = scaledScores.length ? Math.min(...scaledScores) : 0;
                          return confluenceSyms.map((sym, idx) => {
                            const isSelected = sel === sym;
                            const symGroups = actionAlerts.filter(g => g.items.some(i => i.symbol === sym));
                            const hasBuy  = symGroups.some(g => BUY_IDS.has(g.id));
                            const hasSell = symGroups.some(g => SELL_IDS.has(g.id));
                            const t = maxP > minP ? (pScores[idx] - minP) / (maxP - minP) : 1;
                            const isHigh = !isSelected && t > 0.7;
                            const isBuyOnly  = hasBuy && !hasSell;
                            const isSellOnly = hasSell && !hasBuy;
                            // Brightness/prominence only for pure green or pure red
                            const tickerColor = isSelected      ? '#a855f7'
                              : (hasBuy && hasSell)             ? '#f59e0b'
                              : isBuyOnly                       ? (isHigh ? '#86efac' : '#4ade80')
                              : isSellOnly                      ? (isHigh ? '#fca5a5' : '#f87171')
                              : '#00d4aa';
                            const chipOpacity = isSelected || (!isBuyOnly && !isSellOnly)
                              ? 1
                              : 0.15 + t * 0.85;
                            const textShadow = (isBuyOnly || isSellOnly) && !isSelected && t > 0.82
                              ? `0 0 7px ${tickerColor}` : 'none';
                            return (
                              <span
                                key={sym}
                                onClick={() => setConfluenceSel(isSelected ? null : sym)}
                                style={{
                                  fontFamily: mono, fontSize: '10px', fontWeight: 700, padding: '2px 8px',
                                  borderRadius: '2px', cursor: 'pointer', whiteSpace: 'nowrap' as const,
                                  background: isSelected ? 'rgba(168,85,247,0.18)' : 'rgba(0,212,170,0.10)',
                                  border: `1px solid ${isSelected ? 'rgba(168,85,247,0.45)' : 'rgba(0,212,170,0.3)'}`,
                                  color: tickerColor,
                                  opacity: chipOpacity,
                                  textShadow,
                                  transition: 'all 0.15s',
                                }}
                              >
                                {sym}
                              </span>
                            );
                          });
                        })()}
                      </div>

                      {/* ── SPARKLINE ── */}
                      {confluenceSel && confluenceSparkData && (() => {
                        const { prices, ma200, ma50 } = confluenceSparkData;
                        const n = prices.length;

                        const selHolding = (latestPortfolio?.holdings as any[])?.find((h: any) => h.symbol === confluenceSel);
                        // averagePrice is in CAD; convert to chart currency via implied rate
                        // (historical prices are in native currency — USD for US stocks, CAD for .TO etc.)
                        const cadPerShare = (selHolding?.currentValue ?? 0) > 0 && (selHolding?.quantity ?? 0) > 0
                          ? selHolding.currentValue / selHolding.quantity : null;
                        const lastHistPrice = prices[prices.length - 1];
                        const impliedRate = cadPerShare != null && lastHistPrice > 0 ? cadPerShare / lastHistPrice : 1;
                        const avgPrice: number | null = selHolding?.averagePrice != null && selHolding.averagePrice > 0
                          ? selHolding.averagePrice / impliedRate : null;

                        // Expand y-range to include all visible MA values and avg cost
                        const maVals = [...ma200, ...ma50].filter((v): v is number => v != null);
                        const allVals = [...prices, ...maVals, ...(avgPrice != null ? [avgPrice] : [])];
                        const min = Math.min(...allVals), max = Math.max(...allVals);
                        const range = max - min || 1;
                        const W = 200, H = 120, PAD = 7, PAD_X = 10;
                        const toY = (v: number) => H - ((v - min) / range) * (H - PAD * 2) - PAD;
                        const xOf  = (i: number) => PAD_X + (i / (n - 1)) * (W - PAD_X * 2);

                        // Price line + fill
                        const pts  = prices.map((p, i) => [xOf(i), toY(p)] as [number, number]);
                        const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
                        const fill = `${line} L${W - PAD_X},${H} L${PAD_X},${H} Z`;
                        const last = pts[pts.length - 1];
                        const isUp = prices[prices.length - 1] >= prices[0];
                        const priceStroke = '#c084fc';

                        // MA path builder — skips null segments
                        const maPath = (vals: (number | null)[]) => {
                          let d = '', pen = false;
                          vals.forEach((v, i) => {
                            if (v == null) { pen = false; return; }
                            const seg = `${xOf(i).toFixed(1)},${toY(v).toFixed(1)}`;
                            d += pen ? ` L${seg}` : `M${seg}`;
                            pen = true;
                          });
                          return d;
                        };

                        const path200 = maPath(ma200);
                        const path50  = maPath(ma50);

                        // Current vs MA
                        const lastPrice  = prices[prices.length - 1];
                        const lastMA200  = [...ma200].reverse().find(v => v != null) ?? null;
                        const lastMA50   = [...ma50].reverse().find(v => v != null)  ?? null;
                        const abv200 = lastMA200 != null ? lastPrice >= lastMA200 : null;
                        const abv50  = lastMA50  != null ? lastPrice >= lastMA50  : null;
                        const pct3m  = ((prices[prices.length - 1] - prices[0]) / prices[0]) * 100;

                        // Label y positions for last visible MA point
                        const label200Y = lastMA200 != null ? toY(lastMA200) : null;
                        const label50Y  = lastMA50  != null ? toY(lastMA50)  : null;
                        const avgY      = avgPrice  != null ? toY(avgPrice)  : null;

                        return (
                          <div key={`spark-${confluenceSel}`} style={{ marginTop: '8px', animation: '_tickerSlide 0.2s cubic-bezier(0.4,0,0.2,1)' }}>
                            <div style={{ position: 'relative' }}>
                              <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block' }}>
                                <defs>
                                  <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={priceStroke} stopOpacity="0.10" />
                                    <stop offset="100%" stopColor={priceStroke} stopOpacity="0" />
                                  </linearGradient>
                                </defs>
                                <path d={fill} fill="url(#spark-grad)" />
                                {/* 200MA moving line — blue */}
                                {path200 && <path d={path200} fill="none" stroke="#3b82f6" strokeWidth="1.2" strokeLinejoin="round" opacity="0.9" />}
                                {/* 50MA moving line — orange */}
                                {path50  && <path d={path50}  fill="none" stroke="#f97316" strokeWidth="1.2" strokeLinejoin="round" opacity="0.9" />}
                                {/* Avg cost line — green dashed */}
                                {avgY != null && (
                                  <line x1={PAD_X} y1={avgY.toFixed(1)} x2={W - PAD_X} y2={avgY.toFixed(1)} stroke="#22c55e" strokeWidth="1" strokeDasharray="3,3" opacity="0.85" />
                                )}
                                {/* Price line */}
                                <path d={line} fill="none" stroke={priceStroke} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
                                <circle cx={last[0].toFixed(1)} cy={last[1].toFixed(1)} r="2.5" fill={priceStroke} />
                              </svg>
                            </div>
                            {/* Legend row */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', padding: '5px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.06)' }}>
                              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                  <div style={{ width: 16, height: 2.5, background: priceStroke, borderRadius: 1 }} />
                                  <span style={{ fontFamily: mono, fontSize: '10px', color: priceStroke, fontWeight: 700 }}>Price</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                  <div style={{ width: 16, height: 2.5, background: '#3b82f6', borderRadius: 1 }} />
                                  <span style={{ fontFamily: mono, fontSize: '10px', color: '#3b82f6', fontWeight: 700 }}>200MA {abv200 != null ? (abv200 ? '▲' : '▼') : ''}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                  <div style={{ width: 16, height: 2.5, background: '#f97316', borderRadius: 1 }} />
                                  <span style={{ fontFamily: mono, fontSize: '10px', color: '#f97316', fontWeight: 700 }}>50MA {abv50 != null ? (abv50 ? '▲' : '▼') : ''}</span>
                                </div>
                                {avgY != null && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <svg width="16" height="8" style={{ flexShrink: 0 }}><line x1="0" y1="4" x2="16" y2="4" stroke="#22c55e" strokeWidth="1.5" strokeDasharray="3,2" /></svg>
                                    <span style={{ fontFamily: mono, fontSize: '10px', color: '#22c55e', fontWeight: 700 }}>Avg</span>
                                  </div>
                                )}
                              </div>
                              <span style={{ fontFamily: mono, fontSize: '11px', fontWeight: 700, color: pct3m >= 0 ? priceStroke : '#f87171' }}>
                                {pct3m >= 0 ? '▲' : '▼'} {Math.abs(pct3m).toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        );
                      })()}

                      {/* ── CONFLUENCE TICKER SUMMARY CARD ── */}
                      {confluenceSel && (() => {
                        const tickerGroups = actionAlerts.filter(g => g.items.some(i => i.symbol === confluenceSel));
                        return (
                          <div
                            key={confluenceSel}
                            style={{
                              background: 'rgba(0,212,170,0.04)',
                              border: '1px solid rgba(0,212,170,0.28)',
                              borderRadius: '6px',
                              overflow: 'hidden',
                              marginTop: '4px',
                              animation: '_tickerSlide 0.22s cubic-bezier(0.4,0,0.2,1)',
                              transformOrigin: 'top',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderBottom: '1px solid rgba(0,212,170,0.15)', background: 'rgba(0,212,170,0.07)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00d4aa', boxShadow: '0 0 6px rgba(0,212,170,0.6)', flexShrink: 0 }} />
                                <span style={{ fontFamily: mono, fontSize: '12px', fontWeight: 700, color: '#00d4aa', letterSpacing: '0.1em' }}>{confluenceSel}</span>
                                <span style={{ fontFamily: mono, fontSize: '8px', color: '#4a5568', letterSpacing: '0.1em' }}>{tickerGroups.length} ALERT{tickerGroups.length !== 1 ? 'S' : ''}</span>
                              </div>
                              <button
                                onClick={() => setConfluenceSel(null)}
                                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#4a5568', fontFamily: mono, fontSize: '11px', padding: '1px 4px', borderRadius: '2px', lineHeight: 1, transition: 'color 0.15s' }}
                                onMouseEnter={e => (e.currentTarget.style.color = '#94a3b8')}
                                onMouseLeave={e => (e.currentTarget.style.color = '#4a5568')}
                              >✕</button>
                            </div>
                            <div style={{ padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              {tickerGroups.map(g => {
                                const item = g.items.find(i => i.symbol === confluenceSel)!;
                                const lc = LEVEL_COLORS[g.level];
                                return (
                                  <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 8px', borderRadius: '3px', background: lc.bg, border: `1px solid ${lc.border}` }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                      <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: labelColor(g.id), flexShrink: 0 }} />
                                      <span style={{ fontFamily: mono, fontSize: '10px', fontWeight: 700, color: labelColor(g.id) }}>{g.label}</span>
                                    </div>
                                    <span style={{ fontFamily: mono, fontSize: '9px', color: lc.text }}>{item.detail}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  )}

                  {/* ── TARGETS ── */}
                  {(() => { const gs = filterBySel(targetGroups); return gs.length > 0 && (<>{sectionSep('Targets')}{gs.map(renderGroup)}</>); })()}

                  {/* ── INDICATORS ── */}
                  {(() => { const gs = filterBySel(indicatorGroups); return gs.length > 0 && (<>{sectionSep('Indicators')}{gs.map(renderGroup)}</>); })()}

                  {/* ── OBSERVATIONS ── */}
                  {(() => { const gs = filterBySel(observationGroups); return gs.length > 0 && (<>{sectionSep('Observations')}{gs.map(renderGroup)}</>); })()}

                </div>
              );
            })()}
          </div>
          {/* bottom fade — implies scrollable content */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 28, background: 'linear-gradient(to top, #10141c 0%, transparent 100%)', pointerEvents: 'none', zIndex: 2 }} />
          </div>
        </div>

        {/* Momentum RSI Scanner */}
        <div style={{ padding: '12px 14px', borderBottom: '1px solid #1e2535', flexShrink: 0, maxHeight: confluenceSel ? '0' : '500px', opacity: confluenceSel ? 0 : 1, overflow: 'hidden', transition: 'max-height 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.2s ease' }}>
          {/* Header row with toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ fontFamily: mono, fontSize: '10px', fontWeight: 700, color: '#4a5568', letterSpacing: '0.14em', textTransform: 'uppercase' as const }}>
              Momentum RSI (14)
            </div>
            <div style={{ display: 'flex', borderRadius: '3px', overflow: 'hidden', border: '1px solid #1e2535' }}>
              {(['Active', 'All'] as const).map(label => {
                const on = label === 'Active' ? rsiActiveOnly : !rsiActiveOnly;
                return (
                  <button
                    key={label}
                    onClick={() => setRsiActiveOnly(label === 'Active')}
                    style={{
                      fontFamily: mono, fontSize: '9px', fontWeight: 600,
                      padding: '2px 7px', border: 'none', cursor: 'pointer',
                      background: on ? '#00d4aa18' : 'transparent',
                      color: on ? '#00d4aa' : '#4a5568',
                      letterSpacing: '0.06em',
                      transition: 'all 0.12s',
                    }}
                  >{label}</button>
                );
              })}
            </div>
          </div>

          {/* Scrollable list */}
          {rsiData && Object.keys(rsiData).length > 0 ? (() => {
            const activeSet = new Set(activeSymbols);
            const entries = Object.entries(rsiData as Record<string, number>)
              .filter(([sym]) => !rsiActiveOnly || activeSet.has(sym))
              .sort(([, a], [, b]) => b - a);
            return (
              <>
                <div style={{ position: 'relative' }}>
                <div style={{ maxHeight: '200px', overflowY: 'auto', paddingRight: '2px' }}>
                  {entries.length === 0 ? (
                    <div style={{ fontFamily: mono, fontSize: '11px', color: '#2a3445' }}>— no data</div>
                  ) : entries.map(([symbol, rsi]) => {
                    const isOverbought = rsi >= 70;
                    const isOversold = rsi <= 40;
                    const barColor = isOverbought ? '#22c55e' : isOversold ? '#ef4444' : '#4f8fff';
                    const labelColor = isOverbought ? '#ef4444' : isOversold ? '#ef4444' : '#e2e8f0';
                    const valColor = isOverbought ? '#f59e0b' : isOversold ? '#ef4444' : '#e2e8f0';
                    return (
                      <div key={symbol} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '7px' }}>
                        <div style={{ fontFamily: mono, fontSize: '10px', fontWeight: 600, width: '50px', flexShrink: 0, color: labelColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{symbol}</div>
                        <div style={{ flex: 1, height: '4px', minHeight: '4px', maxHeight: '4px', background: '#1e2535', alignSelf: 'center' }}>
                          <div style={{ height: '4px', width: `${Math.min(rsi, 100)}%`, background: barColor }} />
                        </div>
                        <div style={{ fontFamily: mono, fontSize: '10px', width: '26px', textAlign: 'right' as const, color: valColor }}>{rsi}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 24, background: 'linear-gradient(to top, #10141c 0%, transparent 100%)', pointerEvents: 'none' }} />
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px', paddingTop: '6px', borderTop: '1px solid #1e2535', flexWrap: 'wrap' as const }}>
                  <span style={{ fontFamily: mono, fontSize: '9px', color: '#ef4444' }}>▼ &lt;40 oversold</span>
                  <span style={{ fontFamily: mono, fontSize: '9px', color: '#4f8fff' }}>— neutral</span>
                  <span style={{ fontFamily: mono, fontSize: '9px', color: '#f59e0b' }}>▲ &gt;70 overbought</span>
                </div>
              </>
            );
          })() : (
            <div style={{ fontFamily: mono, fontSize: '11px', color: '#2a3445' }}>— no data</div>
          )}
        </div>

        {/* Upcoming Events */}
        <div style={{ padding: '12px 14px', borderBottom: '1px solid #1e2535', flexShrink: 0, maxHeight: confluenceSel ? '0' : '700px', opacity: confluenceSel ? 0 : 1, overflow: 'hidden', transition: 'max-height 0.38s cubic-bezier(0.4,0,0.2,1), opacity 0.22s ease' }}>
          <div style={{ fontFamily: mono, fontSize: '10px', fontWeight: 700, color: '#4a5568', letterSpacing: '0.14em', textTransform: 'uppercase' as const, marginBottom: '10px' }}>
            Upcoming Events
          </div>
          <div style={{ position: 'relative' }}>
          <div style={{ maxHeight: '228px', overflowY: 'auto', paddingRight: '2px' }}>
            {upcomingEvents.length === 0 ? (
              <div style={{ fontFamily: mono, fontSize: '11px', color: '#2a3445' }}>— no upcoming events</div>
            ) : upcomingEvents.map((ev, i) => {
              const d = new Date(ev.date + 'T12:00:00');
              const monthAbbr = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
              const dayNum = d.getDate();
              const typeColor  = ev.type === 'earn' ? '#a855f7' : '#22c55e';
              const typeBg     = ev.type === 'earn' ? 'rgba(168,85,247,0.12)' : 'rgba(34,197,94,0.10)';
              const typeBorder = ev.type === 'earn' ? 'rgba(168,85,247,0.2)'  : 'rgba(34,197,94,0.2)';
              const title = ev.type === 'earn'
                ? `${ev.symbol} Earnings Q${ev.quarter ?? ''}`
                : `${ev.symbol} Dividend`;
              const badgeLabel = ev.type === 'earn' ? 'EARNINGS' : 'DIV';
              let subLine = '';
              if (ev.type === 'earn') {
                subLine = `Q${ev.quarter} ${ev.year}`;
                if (ev.hour === 'bmo') subLine += ' · pre-mkt';
                else if (ev.hour === 'amc') subLine += ' · after-cls';
              } else {
                subLine = ev.amount != null
                  ? `$${Number(ev.amount).toFixed(2)}/share · ex-date ${monthAbbr} ${dayNum}`
                  : `ex-dividend date`;
              }
              return (
                <div
                  key={`${ev.symbol}-${ev.date}-${ev.type}`}
                  style={{
                    display: 'flex', gap: '10px', padding: '7px 0', alignItems: 'flex-start',
                    borderBottom: i < upcomingEvents.length - 1 ? '1px solid rgba(30,37,53,0.5)' : 'none',
                  }}
                >
                  {/* Date column — month abbr + large day number */}
                  <div style={{ fontFamily: mono, fontSize: '9px', color: '#94a3b8', width: '36px', flexShrink: 0, lineHeight: 1.4, textAlign: 'center' as const }}>
                    {monthAbbr}
                    <span style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#e2e8f0' }}>{dayNum}</span>
                  </div>
                  {/* Body */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '11px', fontWeight: 500, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, paddingRight: '4px' }}>
                        {title}
                      </div>
                      <span style={{ fontFamily: mono, fontSize: '9px', padding: '1px 5px', borderRadius: '2px', flexShrink: 0, background: typeBg, color: typeColor, border: `1px solid ${typeBorder}` }}>
                        {badgeLabel}
                      </span>
                    </div>
                    <div style={{ fontFamily: mono, fontSize: '9px', color: '#00d4aa', marginTop: '2px' }}>
                      {subLine}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 24, background: 'linear-gradient(to top, #10141c 0%, transparent 100%)', pointerEvents: 'none' }} />
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 14px', borderTop: '1px solid #1e2535', flexShrink: 0, maxHeight: confluenceSel ? '0' : '60px', opacity: confluenceSel ? 0 : 1, overflow: 'hidden', transition: 'max-height 0.3s ease, opacity 0.15s ease' }}>
          <div style={{ fontFamily: mono, fontSize: '10px', color: '#1e2535', textAlign: 'center' as const }}>
            Portfolio Intelligence v2
          </div>
        </div>
      </aside>

      </div>{/* end three-column grid */}

      {/* ── CMD+K SEARCH MODAL (fixed, outside grid flow) ── */}
      {searchOpen && (
        <div
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '10vh' }}
          onClick={e => { if (e.target === e.currentTarget) setSearchOpen(false); }}
        >
          <div style={{ backgroundColor: '#10141c', border: '1px solid #1e2535', borderRadius: '6px', boxShadow: '0 25px 60px rgba(0,0,0,0.6)', width: '100%', maxWidth: '520px', overflow: 'hidden' }}>
            {/* Input */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid #1e2535', gap: '10px' }}>
              <Search style={{ width: '16px', height: '16px', color: '#4a5568', flexShrink: 0 }} />
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && filteredNav.length > 0) {
                    navigate(filteredNav[0].href);
                    setSearchOpen(false);
                    setSearchQuery('');
                  }
                }}
                placeholder="Navigate to a page…"
                style={{ flex: 1, border: 'none', outline: 'none', fontFamily: mono, fontSize: '14px', color: '#e2e8f0', backgroundColor: 'transparent' }}
              />
              <span style={{ fontFamily: mono, fontSize: '10px', color: '#4a5568', padding: '1px 5px', border: '1px solid #1e2535', borderRadius: '2px' }}>Esc</span>
            </div>

            {/* Results */}
            <div style={{ maxHeight: '340px', overflowY: 'auto' }}>
              {filteredNav.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', fontFamily: mono, color: '#4a5568', fontSize: '12px' }}>
                  No match for "{searchQuery}"
                </div>
              ) : (
                filteredNav.map(item => (
                  <Link
                    key={item.href}
                    to={item.href}
                    onClick={() => { setSearchOpen(false); setSearchQuery(''); }}
                    style={{ display: 'flex', flexDirection: 'column', padding: '10px 16px', borderBottom: '1px solid #1e2535', textDecoration: 'none', transition: 'background-color 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(0,212,170,0.06)')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <span style={{ fontFamily: mono, fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>{item.name}</span>
                    <span style={{ fontFamily: mono, fontSize: '11px', color: '#4a5568', marginTop: '2px' }}>{item.desc}</span>
                  </Link>
                ))
              )}
            </div>

            <div style={{ padding: '8px 16px', borderTop: '1px solid #1e2535', display: 'flex', gap: '14px' }}>
              <span style={{ fontFamily: mono, fontSize: '10px', color: '#4a5568' }}>
                <kbd style={{ border: '1px solid #1e2535', borderRadius: '2px', padding: '1px 4px', backgroundColor: '#141820', color: '#94a3b8', fontSize: '10px' }}>⌘K</kbd> open
              </span>
              <span style={{ fontFamily: mono, fontSize: '10px', color: '#4a5568' }}>
                <kbd style={{ border: '1px solid #1e2535', borderRadius: '2px', padding: '1px 4px', backgroundColor: '#141820', color: '#94a3b8', fontSize: '10px' }}>↵</kbd> navigate
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;
