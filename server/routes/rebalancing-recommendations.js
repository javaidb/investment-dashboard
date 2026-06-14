const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const historicalDataCache = require('../historical-cache');
const { fetchYahooChart } = require('../utils/yahoo-finance');
const { isCanadianFundCode, fetchCanadianFundHistory } = require('../services/recurring-investments');
const router = express.Router();

const CANADIAN_SUFFIXES = ['.TO', '.V', '.CN'];
const KNOWN_CRYPTOS = new Set(['BTC','ETH','ADA','SOL','DOT','LINK','UNI','MATIC','AVAX','ATOM','LTC','BCH','XRP','DOGE','SHIB','TRX','ETC','FIL','NEAR','ALGO','TRUMP']);

// --- Module-level caches ---
// Fundamentals (P/E, EPS, analyst recommendations) from Finnhub — 24h in-memory TTL
const fundamentalsCache = {};

// File-backed dividend yield cache — 7-day TTL, survives server restarts
const DIVIDEND_CACHE_FILE = path.join(__dirname, '../data/cache/dividend-cache.json');

function loadDividendCache() {
  try {
    if (fs.existsSync(DIVIDEND_CACHE_FILE)) {
      const stored = JSON.parse(fs.readFileSync(DIVIDEND_CACHE_FILE, 'utf8'));
      const TTL_7D = 7 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      for (const [symbol, entry] of Object.entries(stored)) {
        if (now - entry.fetchedAt < TTL_7D) {
          // Pre-populate in-memory cache so getFundamentals won't refetch
          fundamentalsCache[symbol] = { data: entry.data, fetchedAt: entry.fetchedAt };
        }
      }
      console.log(`📦 Loaded dividend cache: ${Object.keys(stored).length} symbols`);
    }
  } catch (e) {
    console.warn('⚠️ Could not load dividend cache:', e.message);
  }
}

function saveDividendCache() {
  try {
    const dir = path.dirname(DIVIDEND_CACHE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // Persist only the entries that are currently in fundamentalsCache and have data
    const toSave = {};
    for (const [symbol, entry] of Object.entries(fundamentalsCache)) {
      if (!entry.skipped && entry.data) toSave[symbol] = entry;
    }
    fs.writeFileSync(DIVIDEND_CACHE_FILE, JSON.stringify(toSave, null, 2));
  } catch (e) {
    console.warn('⚠️ Could not save dividend cache:', e.message);
  }
}

loadDividendCache();
// SPY annual momentum — 1-hour TTL so we don't refetch on every request
const spyMomCache = { value: null, timestamp: 0 };

// Fetch Alpha Vantage OVERVIEW data for a stock symbol, with 7-day in-memory cache.
// Returns {} for crypto (no earnings data) or on API error.
// Calculate beta from daily returns regression against SPY (252-day window).
// Both asset and SPY prices are already available — no API call needed.
function calculateBeta(assetPrices, spyPrices) {
  const len = Math.min(assetPrices.length - 1, spyPrices.length - 1, 252);
  if (len < 30) return null;

  const assetReturns = [];
  const spyReturns   = [];
  for (let i = 0; i < len; i++) {
    if (assetPrices[i + 1] > 0) assetReturns.push((assetPrices[i] - assetPrices[i + 1]) / assetPrices[i + 1]);
    if (spyPrices[i + 1]   > 0) spyReturns.push((spyPrices[i]   - spyPrices[i + 1])   / spyPrices[i + 1]);
  }
  const n = Math.min(assetReturns.length, spyReturns.length);
  if (n < 30) return null;

  const spyMean   = spyReturns.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const assetMean = assetReturns.slice(0, n).reduce((a, b) => a + b, 0) / n;

  let cov = 0, varSpy = 0;
  for (let i = 0; i < n; i++) {
    const dSpy   = spyReturns[i]   - spyMean;
    const dAsset = assetReturns[i] - assetMean;
    cov    += dSpy * dAsset;
    varSpy += dSpy * dSpy;
  }
  if (varSpy === 0) return null;
  return parseFloat((cov / varSpy).toFixed(2));
}

// Fetch SPY's 252-day momentum as a benchmark for relative-strength calculation.
// Cached for 1 hour — SPY data is already in Yahoo Finance cache after first use.

/**
 * Look up historical data for a symbol, trying Canadian exchange suffixes when
 * the bare symbol has no cache entry.  If nothing is cached at all, fetch from
 * Yahoo Finance (with automatic suffix fallback) and store the result so future
 * calls are instant.
 *
 * Returns { historicalData, resolvedSymbol, isCanadian }
 */
async function resolveSymbolData(symbol) {
  // 0. Canadian Fundserv codes (e.g. BNS397) — fetch from Barchart, not Yahoo Finance
  if (isCanadianFundCode(symbol)) {
    const cached = historicalDataCache.get(symbol);
    if (cached?.data?.length >= 60) {
      return { historicalData: cached.data, resolvedSymbol: symbol, isCanadian: true };
    }
    try {
      const startDate = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000);
      const rows = await fetchCanadianFundHistory(symbol, startDate);
      if (rows.length > 0) {
        const points = rows.map(r => ({ date: r.date, open: r.close, high: r.close, low: r.close, close: r.close, volume: 0 }));
        historicalDataCache.set(symbol, points, { symbol, currency: 'CAD' });
        return { historicalData: points, resolvedSymbol: symbol, isCanadian: true };
      }
    } catch (err) {
      console.warn(`⚠️ Barchart fetch failed for ${symbol}: ${err.message}`);
    }
    return { historicalData: null, resolvedSymbol: symbol, isCanadian: true };
  }

  // 1. Try exact match in cache
  const direct = historicalDataCache.get(symbol);
  if (direct?.data?.length >= 60) {
    const isCanadian = CANADIAN_SUFFIXES.some(s => symbol.endsWith(s));
    return { historicalData: direct.data, resolvedSymbol: symbol, isCanadian };
  }

  // 2. Try Canadian-suffixed variants already in cache (bare symbol like "VCX"
  //    may have been stored as "VCX.V" from a previous fetch)
  if (!symbol.includes('.')) {
    for (const suffix of CANADIAN_SUFFIXES) {
      const candidate = symbol + suffix;
      const cached = historicalDataCache.get(candidate);
      if (cached?.data?.length >= 60) {
        console.log(`📦 Cache hit: ${symbol} → ${candidate}`);
        return { historicalData: cached.data, resolvedSymbol: candidate, isCanadian: true };
      }
    }
  }

  // 3. Nothing in cache — fetch from Yahoo Finance (tries suffixes automatically)
  try {
    console.log(`🌐 Fetching historical data for ${symbol} from Yahoo Finance…`);
    const ONE_YEAR_AGO = Math.floor((Date.now() - 2 * 365 * 24 * 60 * 60 * 1000) / 1000);
    const result = await fetchYahooChart(
      symbol,
      { period1: ONE_YEAR_AGO, interval: '1d' },
      12000
    );
    if (!result) return { historicalData: null, resolvedSymbol: symbol, isCanadian: false };

    const raw = result.data.chart.result[0];
    const timestamps = raw.timestamp || [];
    const ohlcv = raw.indicators.quote[0];
    const adjClose = raw.indicators.adjclose?.[0]?.adjclose || [];

    const points = [];
    for (let i = 0; i < timestamps.length; i++) {
      const close = adjClose[i] ?? ohlcv.close?.[i];
      if (close == null) continue;
      points.push({
        date: new Date(timestamps[i] * 1000).toISOString().split('T')[0],
        open:   ohlcv.open?.[i]   ?? close,
        high:   ohlcv.high?.[i]   ?? close,
        low:    ohlcv.low?.[i]    ?? close,
        close,
        volume: ohlcv.volume?.[i] ?? 0,
      });
    }

    if (points.length > 0) {
      const meta = raw.meta || {};
      historicalDataCache.set(result.resolvedSymbol, points, {
        longName: meta.longName || meta.shortName || result.resolvedSymbol,
        symbol: result.resolvedSymbol,
        currency: meta.currency,
        exchangeName: meta.exchangeName || meta.fullExchangeName,
      });
      console.log(`✅ Cached ${points.length} data points for ${result.resolvedSymbol}`);
    }

    const isCanadian = CANADIAN_SUFFIXES.some(s => result.resolvedSymbol.endsWith(s));
    return { historicalData: points.length >= 60 ? points : null, resolvedSymbol: result.resolvedSymbol, isCanadian };
  } catch (err) {
    console.warn(`⚠️ Yahoo Finance fetch failed for ${symbol}: ${err.message}`);
    return { historicalData: null, resolvedSymbol: symbol, isCanadian: false };
  }
}

// Helper to calculate simple moving average
function calculateSMA(prices, period) {
  if (!prices || prices.length < period) return null;
  const slice = prices.slice(0, period);
  const sum = slice.reduce((acc, price) => acc + price, 0);
  return sum / period;
}

// Helper to calculate RSI (Relative Strength Index)
function calculateRSI(prices, period = 14) {
  if (!prices || prices.length < period + 1) return null;

  let gains = 0;
  let losses = 0;

  // Calculate initial average gain/loss
  for (let i = 1; i <= period; i++) {
    const change = prices[i - 1] - prices[i];
    if (change > 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));

  return rsi;
}

// Helper to calculate momentum (rate of change over period)
function calculateMomentum(prices, period = 20) {
  if (!prices || prices.length < period) return null;

  const currentPrice = prices[0];
  const pastPrice = prices[period - 1];

  return ((currentPrice - pastPrice) / pastPrice) * 100;
}

// Helper to calculate EMA — values must be oldest-first, returns array
function calculateEMAArray(values, period) {
  if (!values || values.length < period) return [];
  const k = 2 / (period + 1);
  const emas = [];
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  emas.push(ema);
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    emas.push(ema);
  }
  return emas;
}

// MACD — prices newest-first. Returns { macd, signal, histogram, bullish } or null
function calculateMACD(prices) {
  if (!prices || prices.length < 35) return null;
  const reversed = [...prices].reverse(); // oldest first
  const ema12 = calculateEMAArray(reversed, 12);
  const ema26 = calculateEMAArray(reversed, 26);
  if (!ema12.length || !ema26.length) return null;

  // Align: ema12[0] = reversed[11], ema26[0] = reversed[25]. Offset = 14.
  const offset = 14;
  const macdValues = [];
  for (let i = 0; i < ema26.length; i++) {
    macdValues.push(ema12[i + offset] - ema26[i]);
  }
  if (macdValues.length < 9) return null;

  const signal9 = calculateEMAArray(macdValues, 9);
  const macdLine = macdValues[macdValues.length - 1];
  const signalLine = signal9[signal9.length - 1];
  const histogram = macdLine - signalLine;
  return { macd: macdLine, signal: signalLine, histogram, bullish: macdLine > signalLine };
}

// Bollinger %B — prices newest-first. 0 = lower band, 1 = upper band, >1 = above.
function calculateBollingerB(prices, period = 20) {
  if (!prices || prices.length < period) return null;
  const slice = prices.slice(0, period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / period;
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return null;
  const upper = mean + 2 * stdDev;
  const lower = mean - 2 * stdDev;
  return (prices[0] - lower) / (upper - lower);
}

// ADX — sortedData newest-first with {close, high, low}. Returns ADX number or null.
function calculateADX(sortedData, period = 14) {
  if (!sortedData || sortedData.length < period * 2 + 1) return null;
  const data = [...sortedData].reverse(); // oldest first

  const trs = [], plusDMs = [], minusDMs = [];
  for (let i = 1; i < data.length; i++) {
    const high = data[i].high || data[i].close;
    const low = data[i].low || data[i].close;
    const prevClose = data[i - 1].close;
    const prevHigh = data[i - 1].high || data[i - 1].close;
    const prevLow = data[i - 1].low || data[i - 1].close;

    trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    plusDMs.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDMs.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  if (trs.length < period) return null;

  // Wilder's smoothing
  const wilderSmooth = (arr) => {
    let sum = arr.slice(0, period).reduce((a, b) => a + b, 0);
    const out = [sum];
    for (let i = period; i < arr.length; i++) {
      sum = sum - sum / period + arr[i];
      out.push(sum);
    }
    return out;
  };

  const sTR = wilderSmooth(trs);
  const sPlusDM = wilderSmooth(plusDMs);
  const sMinusDM = wilderSmooth(minusDMs);

  const dx = [];
  for (let i = 0; i < sTR.length; i++) {
    if (sTR[i] === 0) continue;
    const plusDI = (sPlusDM[i] / sTR[i]) * 100;
    const minusDI = (sMinusDM[i] / sTR[i]) * 100;
    const sum = plusDI + minusDI;
    dx.push(sum > 0 ? (Math.abs(plusDI - minusDI) / sum) * 100 : 0);
  }
  if (dx.length < period) return null;

  const adxSmoothed = wilderSmooth(dx);
  return adxSmoothed[adxSmoothed.length - 1] / period; // Normalize back from Wilder accumulation
}

// Max drawdown — closePrices newest-first, capped at 2 years (504 trading days).
// Older crashes (e.g. 2008) shouldn't penalise a stock's current risk profile.
// Returns worst peak-to-trough as a positive % (e.g. 42 = 42% drawdown).
function calculateMaxDrawdown(closePrices) {
  if (!closePrices || closePrices.length < 2) return 0;
  const window = closePrices.slice(0, Math.min(closePrices.length, 504)); // 2yr cap
  const prices = [...window].reverse(); // oldest-first for correct peak tracking
  let peak = prices[0];
  let maxDD = 0;
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > peak) peak = prices[i];
    else {
      const dd = ((peak - prices[i]) / peak) * 100;
      if (dd > maxDD) maxDD = dd;
    }
  }
  return maxDD;
}

// 14-period ATR as % of current price — sortedData newest-first with {high,low,close}.
function calculateATRPercent(sortedData, currentPrice) {
  if (!sortedData || sortedData.length < 15 || !currentPrice) return null;
  let atrSum = 0;
  for (let i = 0; i < 14; i++) {
    const bar  = sortedData[i];
    const prev = sortedData[i + 1];
    const high = bar.high ?? bar.close;
    const low  = bar.low  ?? bar.close;
    atrSum += Math.max(high - low, Math.abs(high - prev.close), Math.abs(low - prev.close));
  }
  return ((atrSum / 14) / currentPrice) * 100;
}

// Chaikin Money Flow (CMF) — 20-period by default. sortedData newest-first with {high,low,close,volume}.
// Returns a value between -1 and +1. Positive = net accumulation, negative = net distribution.
function calculateCMF(sortedData, period = 20) {
  if (!sortedData || sortedData.length < period) return null;
  let mfvSum = 0;
  let volSum = 0;
  for (let i = 0; i < period; i++) {
    const { high, low, close, volume } = sortedData[i];
    if (high == null || low == null || close == null || volume == null) continue;
    const range = high - low;
    const mfm = range === 0 ? 0 : (2 * close - high - low) / range;
    mfvSum += mfm * volume;
    volSum += volume;
  }
  return volSum === 0 ? null : mfvSum / volSum;
}

// Safety Score 0–100. Weights: volatility 50%, maxDrawdown 20%, atrPercent 30%.
function calculateSafetyScore(volatility, maxDrawdown, atrPercent) {
  const volScore = volatility < 15 ? 1.0 : volatility < 25 ? 0.8 : volatility < 40 ? 0.6 : volatility < 60 ? 0.35 : 0.1;
  const ddScore  = maxDrawdown < 20 ? 1.0 : maxDrawdown < 35 ? 0.8 : maxDrawdown < 50 ? 0.6 : maxDrawdown < 65 ? 0.35 : 0.1;
  if (atrPercent == null) {
    return Math.round((volScore * 0.50 + ddScore * 0.20) / 0.70 * 100);
  }
  const atrScore = atrPercent < 1.0 ? 1.0 : atrPercent < 2.0 ? 0.8 : atrPercent < 3.5 ? 0.6 : atrPercent < 6.0 ? 0.35 : 0.1;
  return Math.round((volScore * 0.50 + ddScore * 0.20 + atrScore * 0.30) * 100);
}

// Simple throttle: enforce minimum gap between Finnhub calls to avoid rate limiting (60/min free tier).
let _lastFinnhubMs = 0;
async function finnhubGet(url) {
  const gap = 200; // ms between calls — 5/sec max, well under 60/min
  const wait = gap - (Date.now() - _lastFinnhubMs);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  _lastFinnhubMs = Date.now();
  return axios.get(url, { timeout: 8000 });
}

// Fetch fundamentals (P/E, EPS, analyst recommendations) from Finnhub with 24h in-memory cache.
// Returns null for crypto and on fetch failure. Canadian suffixes are stripped before querying.
async function getFundamentals(symbol) {
  if (KNOWN_CRYPTOS.has(symbol.toUpperCase()) || symbol.includes('-USD')) return null;

  const bare = symbol.replace(/\.(TO|V|CN)$/i, '');
  const now = Date.now();
  const TTL = 24 * 60 * 60 * 1000;
  const RETRY_TTL = 5 * 60 * 1000; // retry rate-limited/transient failures after 5 min
  const cached = fundamentalsCache[bare];
  if (cached) {
    if (cached.skipped && (now - cached.fetchedAt < (cached.transient ? RETRY_TTL : TTL))) return null;
    if (!cached.skipped && now - cached.fetchedAt < TTL) return cached.data;
  }

  const FINNHUB_KEY = process.env.FINNHUB_API_KEY;
  if (!FINNHUB_KEY) return null;

  try {
    const [metricsRes, recsRes] = await Promise.all([
      finnhubGet(`https://finnhub.io/api/v1/stock/metric?symbol=${bare}&metric=all&token=${FINNHUB_KEY}`),
      finnhubGet(`https://finnhub.io/api/v1/stock/recommendation?symbol=${bare}&token=${FINNHUB_KEY}`),
    ]);

    const m = metricsRes.data?.metric;
    if (!m) {
      fundamentalsCache[bare] = { skipped: true, fetchedAt: now };
      return null;
    }

    const pe = m.peNormalizedAnnual ?? m.peAnnual ?? m.peTTM ?? m.peBasicExclExtraTTM ?? m.peExclExtraTTM ?? m.peInclExtraTTM ?? null;
    const eps = m.epsTTM ?? null;
    const epsGrowth = m.epsGrowthTTMYoy ?? null;
    const revenueGrowth = m.revenueGrowthTTMYoy ?? null;
    const dividendYield = m.currentDividendYieldTTM ?? null;

    const rec = recsRes.data?.[0];
    const { strongBuy = 0, buy = 0, hold = 0, sell = 0, strongSell = 0 } = rec ?? {};
    const total = strongBuy + buy + hold + sell + strongSell;
    const recommendationMean = total > 0
      ? (1 * strongBuy + 2 * buy + 3 * hold + 4 * sell + 5 * strongSell) / total
      : null;
    const recommendationKey = recommendationMean == null ? null
      : recommendationMean <= 1.5 ? 'strong_buy'
      : recommendationMean <= 2.5 ? 'buy'
      : recommendationMean <= 3.5 ? 'hold'
      : recommendationMean <= 4.5 ? 'sell' : 'strong_sell';
    const analystCounts = rec ? { strongBuy, buy, hold, sell, strongSell, total } : null;

    const data = { pe, eps, epsGrowth, revenueGrowth, dividendYield, recommendationMean, recommendationKey, analystCounts };
    fundamentalsCache[bare] = { data, fetchedAt: now };
    saveDividendCache();
    console.log(`📋 Fundamentals: ${bare} P/E=${pe?.toFixed(1)}, rec=${recommendationKey}`);
    return data;
  } catch (err) {
    const status = err.response?.status;
    const transient = status === 429 || (status >= 500 && status < 600) || !status;
    console.warn(`⚠️  Fundamentals fetch failed for ${bare}: HTTP ${status ?? 'timeout/network'} — ${transient ? 'retry in 5min' : 'skipping permanently'}`);
    fundamentalsCache[bare] = { skipped: true, transient, fetchedAt: now };
    return null;
  }
}

// Analyze a single asset for timing recommendations
async function analyzeAssetTiming(symbol, adjustment, currentInvestment) {
  // Determine if we're buying or selling (outside try for error handling)
  const isAdding = adjustment > currentInvestment;
  const isRemoving = adjustment < currentInvestment;
  const amount = Math.abs(adjustment - currentInvestment);

  try {
    // Get historical data — tries bare symbol, then Canadian suffixes, then fetches from Yahoo
    const { historicalData, resolvedSymbol, isCanadian } = await resolveSymbolData(symbol);

    console.log(`📊 Analyzing ${symbol} (resolved: ${resolvedSymbol}): Found ${historicalData ? historicalData.length : 0} data points`);

    // Fetch SPY data for relative strength + beta calculation
    const spyData = await resolveSymbolData('SPY');
    const spyPrices = spyData?.historicalData
      ? [...spyData.historicalData].sort((a, b) => new Date(b.date) - new Date(a.date)).map(d => d.close)
      : [];

    // Fetch fundamentals in parallel — non-blocking, null for crypto/failure
    const fundamentals = await getFundamentals(symbol);

    // Cache SPY 252-day momentum for 1 hour
    let spyMom252 = null;
    if (spyMomCache.value !== null && Date.now() - spyMomCache.timestamp < 60 * 60 * 1000) {
      spyMom252 = spyMomCache.value;
    } else if (spyPrices.length >= 252) {
      spyMom252 = calculateMomentum(spyPrices, 252);
      spyMomCache.value = spyMom252;
      spyMomCache.timestamp = Date.now();
    }

    if (!historicalData || !Array.isArray(historicalData) || historicalData.length < 60) {
      console.log(`⚠️ ${symbol}: Insufficient data (${historicalData ? historicalData.length : 0} points, need 60+)`);
      return {
        symbol,
        action: isAdding ? 'BUY' : isRemoving ? 'SELL' : 'HOLD',
        amount,
        currentInvestment,
        targetInvestment: adjustment,
        timing: 'INSUFFICIENT_DATA',
        recommendation: `Not enough historical data for analysis (have ${historicalData ? historicalData.length : 0} days, need 60+). Asset may need data preloading.`,
        confidence: 'low',
        indicators: {},
        reasons: []
      };
    }

    // Sort historical data by date (most recent first)
    const sortedData = [...historicalData].sort((a, b) => new Date(b.date) - new Date(a.date));

    // Extract close prices and volumes
    const closePrices = sortedData.map(d => d.close);
    const volumes = sortedData.map(d => d.volume || 0);

    const currentPrice = closePrices[0];
    const currentVolume = volumes[0];

    // For Canadian stocks the historical prices are already in CAD — no conversion needed.
    // For US stocks/crypto, look up the CAD price from the holdings cache.
    const holdingsCache = require('../cache');
    const cachedHolding = holdingsCache?.cache?.get(symbol) || holdingsCache?.cache?.get(resolvedSymbol);
    const exchangeRate = cachedHolding?.exchangeRate || 1.35;
    let cadPrice;
    if (isCanadian) {
      cadPrice = currentPrice;                                         // already CAD
    } else {
      cadPrice = cachedHolding?.cadPrice ?? (currentPrice * exchangeRate); // convert USD → CAD
    }

    // Calculate technical indicators
    const sma200 = calculateSMA(closePrices, 200); // 200-day MA (approximation for weekly)
    const sma50 = calculateSMA(closePrices, 50);
    const sma20 = calculateSMA(closePrices, 20);
    const rsi = calculateRSI(closePrices, 14);
    const momentum5   = calculateMomentum(closePrices, 5);
    const momentum20  = calculateMomentum(closePrices, 20);
    const momentum50  = calculateMomentum(closePrices, 50);
    const momentum252 = calculateMomentum(closePrices, 252);

    // Determine position relative to 200MA and 50MA
    const aboveMA200 = currentPrice > sma200;
    const distanceFromMA200 = ((currentPrice - sma200) / sma200) * 100;
    const distanceFromMA50 = sma50 ? ((currentPrice - sma50) / sma50) * 100 : null;

    // Calculate Volatility (standard deviation of returns)
    const returns = [];
    for (let i = 0; i < Math.min(60, closePrices.length - 1); i++) {
      returns.push((closePrices[i] - closePrices[i + 1]) / closePrices[i + 1]);
    }
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance) * Math.sqrt(252) * 100; // Annualized volatility as percentage

    // Calculate 52-week High/Low
    const last252Days = closePrices.slice(0, Math.min(252, closePrices.length));
    const weekHigh52 = Math.max(...last252Days);
    const weekLow52 = Math.min(...last252Days);
    const distanceFromHigh = ((currentPrice - weekHigh52) / weekHigh52) * 100;
    const distanceFromLow = ((currentPrice - weekLow52) / weekLow52) * 100;

    // Debug log for checking 52w range calculation
    if (symbol === 'GOOGL' || Math.abs(distanceFromHigh) < 0.1) {
      console.log(`📊 52w Range Debug for ${symbol}:`, {
        currentPrice: currentPrice.toFixed(2),
        weekHigh52: weekHigh52.toFixed(2),
        weekLow52: weekLow52.toFixed(2),
        distanceFromHigh: distanceFromHigh.toFixed(2) + '%',
        distanceFromLow: distanceFromLow.toFixed(2) + '%',
        daysOfData: last252Days.length
      });
    }

    // Calculate Volume Trend (current volume vs 20-day average)
    const last20Volumes = volumes.slice(0, Math.min(20, volumes.length));
    const avgVolume = last20Volumes.reduce((a, b) => a + b, 0) / last20Volumes.length;
    const volumeTrend = avgVolume > 0 ? ((currentVolume - avgVolume) / avgVolume) * 100 : 0;
    const cmf = calculateCMF(sortedData);

    // New indicators
    const distanceFromMA20 = sma20 ? ((currentPrice - sma20) / sma20) * 100 : null;
    const macdResult = calculateMACD(closePrices);
    const bollingerB = calculateBollingerB(closePrices);
    const adx = calculateADX(sortedData);
    const maxDrawdown  = calculateMaxDrawdown(closePrices);
    const atrPercent   = calculateATRPercent(sortedData, currentPrice);
    const safetyScore  = calculateSafetyScore(volatility, maxDrawdown, atrPercent);

    // Analyze timing
    let timing = 'NEUTRAL';
    let recommendation = '';
    let confidence = 'medium';
    const reasons = [];

    if (isAdding) {
      // BUYING LOGIC
      let buyScore = 0;

      // Check if below 200MA (good buying opportunity)
      if (!aboveMA200 && distanceFromMA200 > -10) {
        buyScore += 3;
        reasons.push(`Trading ${Math.abs(distanceFromMA200).toFixed(1)}% below 200-MA at $${currentPrice.toFixed(2)} (support at $${sma200.toFixed(2)})`);
      } else if (!aboveMA200 && distanceFromMA200 <= -10) {
        buyScore += 2;
        reasons.push(`Deep value: ${Math.abs(distanceFromMA200).toFixed(1)}% below 200-MA (high risk/reward)`);
      } else if (aboveMA200 && distanceFromMA200 < 5) {
        buyScore += 1;
        reasons.push(`Just above 200-MA support (+${distanceFromMA200.toFixed(1)}%)`);
      } else if (aboveMA200 && distanceFromMA200 > 15) {
        buyScore -= 2;
        reasons.push(`Extended ${distanceFromMA200.toFixed(1)}% above 200-MA (pullback likely)`);
      }

      // Check RSI (oversold = good buy)
      if (rsi < 30) {
        buyScore += 3;
        reasons.push(`RSI deeply oversold at ${rsi.toFixed(1)} (panic selling, strong bounce potential)`);
      } else if (rsi >= 30 && rsi < 40) {
        buyScore += 2;
        reasons.push(`RSI at ${rsi.toFixed(1)} approaching oversold (early entry opportunity)`);
      } else if (rsi >= 40 && rsi < 50) {
        buyScore += 1;
        reasons.push(`RSI neutral at ${rsi.toFixed(1)} (no extreme sentiment)`);
      } else if (rsi >= 50 && rsi < 65) {
        reasons.push(`RSI at ${rsi.toFixed(1)} showing modest strength (neutral for entry)`);
      } else if (rsi >= 65 && rsi < 75) {
        buyScore -= 1;
        reasons.push(`RSI at ${rsi.toFixed(1)} getting overbought (late to the party)`);
      } else if (rsi >= 75) {
        buyScore -= 3;
        reasons.push(`RSI extremely overbought at ${rsi.toFixed(1)} (correction imminent, wait for dip)`);
      }

      // Check momentum with specific values
      if (momentum20 > 5 && momentum50 > 5) {
        buyScore += 2;
        reasons.push(`Strong upward momentum: +${momentum20.toFixed(1)}% (20d), +${momentum50.toFixed(1)}% (50d) - trend is your friend`);
      } else if (momentum20 > 0 && momentum50 > 0) {
        buyScore += 1;
        reasons.push(`Positive momentum building: +${momentum20.toFixed(1)}% (20d), +${momentum50.toFixed(1)}% (50d)`);
      } else if (momentum20 < -10 && momentum50 < -15) {
        buyScore += 3;
        reasons.push(`Severely oversold: ${momentum20.toFixed(1)}% (20d), ${momentum50.toFixed(1)}% (50d) - strong reversal setup`);
      } else if (momentum20 < -5 && momentum50 < -10) {
        buyScore += 2;
        reasons.push(`Negative momentum: ${momentum20.toFixed(1)}% (20d), ${momentum50.toFixed(1)}% (50d) - potential bottom forming`);
      } else if (momentum20 < 0 && momentum50 > 0) {
        reasons.push(`Short-term weakness (${momentum20.toFixed(1)}%) but long-term uptrend intact (+${momentum50.toFixed(1)}%)`);
      } else if (momentum20 > 0 && momentum50 < 0) {
        buyScore += 1;
        reasons.push(`Recent turnaround: +${momentum20.toFixed(1)}% (20d) reversing from ${momentum50.toFixed(1)}% (50d) decline`);
      }

      // Check moving average crossovers with specific context
      if (sma20 > sma50 && sma50 > sma200) {
        buyScore += 2;
        reasons.push(`Golden alignment: 20-MA ($${sma20.toFixed(2)}) > 50-MA ($${sma50.toFixed(2)}) > 200-MA ($${sma200.toFixed(2)}) - strong uptrend`);
      } else if (sma20 < sma50 && sma50 < sma200) {
        reasons.push(`All MAs in bearish alignment - downtrend still active (risky entry)`);
      } else if (currentPrice > sma20 && sma20 > sma50) {
        buyScore += 1;
        reasons.push(`Price above 20-MA and 50-MA (short-term strength building)`);
      } else if (currentPrice < sma20 && sma20 < sma50) {
        reasons.push(`Price below short-term MAs (weakness persists, wait for stabilization)`);
      }

      // Additional price action context
      const priceVs20MA = ((currentPrice - sma20) / sma20) * 100;
      if (priceVs20MA < -5) {
        buyScore += 1;
        reasons.push(`Price ${Math.abs(priceVs20MA).toFixed(1)}% below 20-MA (short-term dip opportunity)`);
      }

      // Determine timing with more nuanced descriptions
      if (buyScore >= 7) {
        timing = 'EXCELLENT';
        confidence = 'high';
        recommendation = `Excellent buy opportunity - multiple technical indicators aligned for entry.`;
      } else if (buyScore >= 4) {
        timing = 'GOOD';
        confidence = 'medium';
        recommendation = `Good entry point - favorable technical setup with manageable risk.`;
      } else if (buyScore >= 1) {
        timing = 'NEUTRAL';
        confidence = 'medium';
        recommendation = `Moderate timing - mixed signals suggest waiting for clearer confirmation.`;
      } else {
        timing = 'POOR';
        confidence = 'low';
        recommendation = `Poor entry timing - technical indicators suggest asset is overextended. Wait for pullback.`;
      }

    } else if (isRemoving) {
      // SELLING LOGIC
      let sellScore = 0;

      // Check if above 200MA (good to take profits)
      if (aboveMA200 && distanceFromMA200 > 20) {
        sellScore += 3;
        reasons.push(`Extended ${distanceFromMA200.toFixed(1)}% above 200-MA at $${currentPrice.toFixed(2)} (strong profit zone, take gains)`);
      } else if (aboveMA200 && distanceFromMA200 > 10) {
        sellScore += 2;
        reasons.push(`Trading ${distanceFromMA200.toFixed(1)}% above 200-MA ($${sma200.toFixed(2)} support) - good profit-taking level`);
      } else if (aboveMA200 && distanceFromMA200 < 5) {
        sellScore += 1;
        reasons.push(`Just above 200-MA support (+${distanceFromMA200.toFixed(1)}%) - marginal profit zone`);
      } else if (!aboveMA200 && distanceFromMA200 > -5) {
        reasons.push(`At 200-MA support (${distanceFromMA200.toFixed(1)}%) - selling here locks in losses, better to wait`);
      } else if (!aboveMA200) {
        sellScore -= 2;
        reasons.push(`Below 200-MA by ${Math.abs(distanceFromMA200).toFixed(1)}% - selling in loss territory, consider holding for recovery`);
      }

      // Check RSI (overbought = good sell)
      if (rsi > 80) {
        sellScore += 4;
        reasons.push(`RSI extremely overbought at ${rsi.toFixed(1)} (euphoria phase, sell into strength)`);
      } else if (rsi >= 70 && rsi <= 80) {
        sellScore += 3;
        reasons.push(`RSI overbought at ${rsi.toFixed(1)} (rally getting stretched, excellent exit)`);
      } else if (rsi >= 60 && rsi < 70) {
        sellScore += 2;
        reasons.push(`RSI at ${rsi.toFixed(1)} approaching overbought (momentum peaking, good to trim)`);
      } else if (rsi >= 50 && rsi < 60) {
        sellScore += 1;
        reasons.push(`RSI at ${rsi.toFixed(1)} neutral-bullish (moderate exit opportunity)`);
      } else if (rsi >= 40 && rsi < 50) {
        reasons.push(`RSI neutral at ${rsi.toFixed(1)} (no urgency to sell, wait for strength)`);
      } else if (rsi >= 30 && rsi < 40) {
        sellScore -= 1;
        reasons.push(`RSI weakening at ${rsi.toFixed(1)} (selling into weakness, poor timing)`);
      } else if (rsi < 30) {
        sellScore -= 3;
        reasons.push(`RSI oversold at ${rsi.toFixed(1)} (worst time to sell, capitulation near)`);
      }

      // Check momentum with detailed context
      if (momentum20 < -10 && momentum50 < -10) {
        sellScore += 3;
        reasons.push(`Severe downtrend: ${momentum20.toFixed(1)}% (20d), ${momentum50.toFixed(1)}% (50d) - cut losses before further decline`);
      } else if (momentum20 < -5 && momentum50 < -5) {
        sellScore += 2;
        reasons.push(`Declining momentum: ${momentum20.toFixed(1)}% (20d), ${momentum50.toFixed(1)}% (50d) - trend turning negative`);
      } else if (momentum20 < 0 && momentum50 < 0) {
        sellScore += 1;
        reasons.push(`Both timeframes negative: ${momentum20.toFixed(1)}% (20d), ${momentum50.toFixed(1)}% (50d) - weakening`);
      } else if (momentum20 > 10 && momentum50 > 10) {
        sellScore -= 2;
        reasons.push(`Strong uptrend continues: +${momentum20.toFixed(1)}% (20d), +${momentum50.toFixed(1)}% (50d) - let winners run`);
      } else if (momentum20 > 5 && momentum50 > 5) {
        sellScore -= 1;
        reasons.push(`Positive momentum: +${momentum20.toFixed(1)}% (20d), +${momentum50.toFixed(1)}% (50d) - uptrend intact`);
      } else if (momentum20 < 0 && momentum50 > 5) {
        sellScore += 2;
        reasons.push(`Recent weakness: ${momentum20.toFixed(1)}% (20d) despite +${momentum50.toFixed(1)}% (50d) - early warning sign`);
      } else if (momentum20 > 0 && momentum50 < 0) {
        reasons.push(`Short-term bounce (+${momentum20.toFixed(1)}%) in downtrend (${momentum50.toFixed(1)}%) - rally to sell into`);
      }

      // Check for bearish crossover and MA positioning
      if (sma20 < sma50 && sma50 < sma200 && currentPrice < sma200) {
        sellScore += 3;
        reasons.push(`Death cross formation: all MAs bearish, price below 200-MA - confirmed downtrend, exit now`);
      } else if (sma20 < sma50 && currentPrice < sma200) {
        sellScore += 2;
        reasons.push(`Bearish MA crossover with price below 200-MA - trend weakening, reduce exposure`);
      } else if (currentPrice < sma20 && sma20 < sma50) {
        sellScore += 1;
        reasons.push(`Price broke below 20-MA and 50-MA - short-term trend has turned`);
      } else if (sma20 > sma50 && sma50 > sma200 && currentPrice > sma200) {
        sellScore -= 2;
        reasons.push(`Golden cross intact: strong uptrend across all timeframes - premature to sell`);
      }

      // Additional context for price vs 20-MA
      const priceVs20MA = ((currentPrice - sma20) / sma20) * 100;
      if (priceVs20MA > 10) {
        sellScore += 2;
        reasons.push(`Price ${priceVs20MA.toFixed(1)}% above 20-MA (short-term extension, take profits)`);
      } else if (priceVs20MA < -5) {
        sellScore -= 1;
        reasons.push(`Price ${Math.abs(priceVs20MA).toFixed(1)}% below 20-MA (selling weakness, not strength)`);
      }

      // Determine timing with nuanced descriptions
      if (sellScore >= 8) {
        timing = 'EXCELLENT';
        confidence = 'high';
        recommendation = `Excellent exit opportunity - asset showing multiple red flags. Take profits now.`;
      } else if (sellScore >= 5) {
        timing = 'GOOD';
        confidence = 'medium';
        recommendation = `Good time to trim position - momentum weakening, lock in gains while you can.`;
      } else if (sellScore >= 2) {
        timing = 'NEUTRAL';
        confidence = 'medium';
        recommendation = `Moderate exit timing - no strong sell pressure yet, can wait for better signals.`;
      } else if (sellScore >= 0) {
        timing = 'NEUTRAL';
        confidence = 'low';
        recommendation = `Neutral timing - mixed signals, consider holding unless you need to raise cash.`;
      } else {
        timing = 'POOR';
        confidence = 'low';
        recommendation = `Poor exit timing - selling into weakness. Better to hold for recovery or bounce.`;
      }
    }

    return {
      symbol,
      action: isAdding ? 'BUY' : isRemoving ? 'SELL' : 'HOLD',
      amount,
      currentInvestment,
      targetInvestment: adjustment,
      timing,
      recommendation,
      confidence,
      indicators: {
        currentPrice,
        cadPrice,
        exchangeRate,
        sma200,
        sma50,
        sma20,
        rsi,
        momentum20,
        momentum50,
        aboveMA200,
        distanceFromMA200: distanceFromMA200.toFixed(2) + '%',
        distanceFromMA50: distanceFromMA50 !== null ? distanceFromMA50.toFixed(2) + '%' : null,
        distanceFromMA20: distanceFromMA20 !== null ? distanceFromMA20.toFixed(2) + '%' : null,
        volatility: volatility,
        weekHigh52: weekHigh52,
        weekLow52: weekLow52,
        distanceFromHigh: distanceFromHigh,
        distanceFromLow: distanceFromLow,
        volumeTrend: volumeTrend,
        macdBullish: macdResult ? macdResult.bullish : null,
        macdHistogram: macdResult ? macdResult.histogram : null,
        bollingerB: bollingerB,
        adx: adx,
        momentum5: momentum5,
        momentum252: momentum252,
        cmf: cmf,
        safetyScore: safetyScore,
        atrPercent: atrPercent,
        // Relative strength vs SPY (asset mom252 − SPY mom252). Positive = outperforming.
        relativeStrength: (momentum252 != null && spyMom252 != null)
          ? parseFloat((momentum252 - spyMom252).toFixed(2)) : null,
        // Beta calculated from regression of daily returns vs SPY (252-day window)
        beta: spyPrices.length >= 30 ? calculateBeta(closePrices, spyPrices) : null,
        fundamentals: fundamentals ? {
          pe: fundamentals.pe,
          eps: fundamentals.eps,
          epsGrowth: fundamentals.epsGrowth,
          revenueGrowth: fundamentals.revenueGrowth,
          dividendYield: fundamentals.dividendYield,
          recommendationMean: fundamentals.recommendationMean,
          recommendationKey: fundamentals.recommendationKey,
          analystCounts: fundamentals.analystCounts,
        } : null,
        riskReward: (() => {
          const denom = currentPrice - weekLow52;
          if (denom <= 0) return 10;
          return Math.min(parseFloat(((weekHigh52 - currentPrice) / denom).toFixed(2)), 10);
        })(),
      },
      reasons
    };

  } catch (error) {
    console.error(`Error analyzing ${symbol}:`, error.message, error.stack);
    return {
      symbol,
      action: isAdding ? 'BUY' : isRemoving ? 'SELL' : 'HOLD',
      amount,
      currentInvestment,
      targetInvestment: adjustment,
      timing: 'ERROR',
      recommendation: `Error analyzing asset: ${error.message}`,
      confidence: 'low',
      indicators: {},
      reasons: []
    };
  }
}

// POST /api/rebalancing-recommendations - Get timing recommendations for adjusted assets
router.post('/', async (req, res) => {
  try {
    const { adjustments, currentAllocations } = req.body;

    if (!adjustments || typeof adjustments !== 'object') {
      return res.status(400).json({ error: 'Adjustments object is required' });
    }

    if (!currentAllocations || typeof currentAllocations !== 'object') {
      return res.status(400).json({ error: 'Current allocations object is required' });
    }

    // Analyze each adjusted asset
    const recommendations = [];

    for (const [symbol, targetAmount] of Object.entries(adjustments)) {
      const currentAmount = currentAllocations[symbol] || 0;

      // Only analyze if there's actually a change
      if (Math.abs(targetAmount - currentAmount) > 0.01) {
        const analysis = await analyzeAssetTiming(symbol, targetAmount, currentAmount);
        recommendations.push(analysis);
      }
    }

    // Sort by timing quality (EXCELLENT > GOOD > NEUTRAL > POOR)
    const timingOrder = { EXCELLENT: 0, GOOD: 1, NEUTRAL: 2, POOR: 3, INSUFFICIENT_DATA: 4, ERROR: 5 };
    recommendations.sort((a, b) => {
      const orderDiff = timingOrder[a.timing] - timingOrder[b.timing];
      if (orderDiff !== 0) return orderDiff;
      // Within same timing, prioritize larger amounts
      return b.amount - a.amount;
    });

    res.json({
      recommendations,
      summary: {
        total: recommendations.length,
        excellent: recommendations.filter(r => r.timing === 'EXCELLENT').length,
        good: recommendations.filter(r => r.timing === 'GOOD').length,
        neutral: recommendations.filter(r => r.timing === 'NEUTRAL').length,
        poor: recommendations.filter(r => r.timing === 'POOR').length,
        buys: recommendations.filter(r => r.action === 'BUY').length,
        sells: recommendations.filter(r => r.action === 'SELL').length
      }
    });

  } catch (error) {
    console.error('Error generating rebalancing recommendations:', error);
    res.status(500).json({ error: 'Failed to generate recommendations' });
  }
});

// POST /api/rebalancing-recommendations/all-active - Get timing recommendations for all active holdings
router.post('/all-active', async (req, res) => {
  try {
    const { holdings } = req.body;

    if (!holdings || !Array.isArray(holdings)) {
      return res.status(400).json({ error: 'Holdings array is required' });
    }

    console.log(`🔄 Analyzing ${holdings.length} active holdings for timing recommendations`);

    // Analyze each holding
    const recommendations = [];

    for (const holding of holdings) {
      const { symbol, currentInvestment, unrealizedPnL, realizedPnL } = holding;

      if (!symbol || currentInvestment === undefined) {
        console.warn(`⚠️ Skipping invalid holding:`, holding);
        continue;
      }

      // Analyze each asset - for active holdings, we assume no change (HOLD)
      // but we still want the technical analysis
      try {
        const analysis = await analyzeAssetTiming(symbol, currentInvestment, currentInvestment);

        // Calculate 0-100 buy/sell scores
        const { buyScore, sellScore } = calculateBuySellScore(analysis);

        // Calculate total profit
        const totalProfit = (unrealizedPnL || 0) + (realizedPnL || 0);

        recommendations.push({
          ...analysis,
          buyScore,
          sellScore,
          unrealizedPnL: unrealizedPnL || 0,
          realizedPnL: realizedPnL || 0,
          totalProfit,
        });
      } catch (error) {
        console.error(`❌ Error analyzing ${symbol}:`, error.message);
        // Add error entry
        recommendations.push({
          symbol,
          action: 'HOLD',
          amount: 0,
          currentInvestment,
          targetInvestment: currentInvestment,
          timing: 'ERROR',
          recommendation: `Error analyzing asset: ${error.message}`,
          confidence: 'low',
          indicators: {},
          reasons: [],
          buyScore: null,
          sellScore: null,
          unrealizedPnL: 0,
          realizedPnL: 0,
          totalProfit: 0,
        });
      }
    }

    // Sort by best score (buy or sell) descending, ties broken by absolute profit
    recommendations.sort((a, b) => {
      const bestA = Math.max(a.buyScore ?? 0, a.sellScore ?? 0);
      const bestB = Math.max(b.buyScore ?? 0, b.sellScore ?? 0);
      if (bestB !== bestA) return bestB - bestA;
      return Math.abs(b.totalProfit || 0) - Math.abs(a.totalProfit || 0);
    });

    res.json({
      recommendations,
      summary: {
        total: recommendations.length,
        strongBuys: recommendations.filter(r => (r.buyScore ?? 0) >= 70).length,
        strongSells: recommendations.filter(r => (r.sellScore ?? 0) >= 70).length,
        analyzed: recommendations.filter(r => r.timing !== 'ERROR' && r.timing !== 'INSUFFICIENT_DATA').length,
      }
    });

  } catch (error) {
    console.error('Error generating all-active recommendations:', error);
    res.status(500).json({ error: 'Failed to generate recommendations' });
  }
});

// Score a single indicator component, returning 0.0–1.0
// Used for both buy and sell scoring (direction is baked into the lookup tables)
function scoreComponent(value, breakpoints) {
  // breakpoints: [[threshold, score], ...] sorted descending for buy, ascending for sell
  // Returns the score for the first matching threshold
  if (value == null) return null;
  for (const [threshold, score] of breakpoints) {
    if (value <= threshold) return score;
  }
  return breakpoints[breakpoints.length - 1][1];
}

// Calculate buy and sell scores (0–100) from technical indicators
function calculateBuySellScore(analysis) {
  if (analysis.timing === 'ERROR' || analysis.timing === 'INSUFFICIENT_DATA') {
    return { buyScore: null, sellScore: null };
  }

  const ind = analysis.indicators;
  if (!ind || Object.keys(ind).length === 0) return { buyScore: null, sellScore: null };

  const d200 = ind.distanceFromMA200 ? parseFloat(ind.distanceFromMA200) : null;
  const d50  = ind.distanceFromMA50  ? parseFloat(ind.distanceFromMA50)  : null;
  const d20  = ind.distanceFromMA20  ? parseFloat(ind.distanceFromMA20)  : null;
  const { rsi, momentum5, momentum20, macdBullish, bollingerB, adx, distanceFromHigh, safetyScore, riskReward, cmf } = ind;
  const fund = ind.fundamentals ?? null;

  // Weights — computeScore normalises by totalWeight so these don't need to sum to any fixed number.
  // safety and rr are added alongside the existing indicators.
  const W = { rsi: 22, ma200: 15, ma50: 15, ma20: 6, macd: 15, boll: 10, mom: 10, hi52: 3, adx: 8, safety: 20, rr: 10, momRev: 13, volConf: 8, trend: 15, pe: 8, recMean: 8 };

  // --- BUY components (0.0 = terrible time to buy, 1.0 = ideal) ---
  const buy = {};

  // RSI: oversold = great buy, overbought = terrible
  if (rsi != null) {
    buy.rsi = rsi <= 20 ? 1.00 : rsi <= 30 ? 0.87 : rsi <= 40 ? 0.68 : rsi <= 50 ? 0.50
            : rsi <= 60 ? 0.32 : rsi <= 70 ? 0.16 : rsi <= 80 ? 0.06 : 0.00;
  }

  // vs 200MA: below = value zone, extended above = bad entry
  if (d200 != null) {
    buy.ma200 = d200 <= -25 ? 1.00 : d200 <= -15 ? 0.88 : d200 <= -8 ? 0.73 : d200 <= -2 ? 0.58
              : d200 <= 5  ? 0.40 : d200 <= 15 ? 0.22 : d200 <= 25 ? 0.10 : 0.02;
  }

  // vs 50MA
  if (d50 != null) {
    buy.ma50 = d50 <= -15 ? 1.00 : d50 <= -8 ? 0.82 : d50 <= -3 ? 0.64 : d50 <= 0 ? 0.50
             : d50 <= 5 ? 0.35 : d50 <= 12 ? 0.18 : 0.05;
  }

  // vs 20MA
  if (d20 != null) {
    buy.ma20 = d20 <= -8 ? 1.00 : d20 <= -4 ? 0.80 : d20 <= -1 ? 0.62 : d20 <= 2 ? 0.47
             : d20 <= 6 ? 0.27 : 0.10;
  }

  // MACD: bullish crossover = momentum turning up
  if (macdBullish != null) {
    buy.macd = macdBullish ? 0.72 : 0.28;
  }

  // Bollinger %B: near/below lower band = mean-reversion buy
  if (bollingerB != null) {
    buy.boll = bollingerB <= 0 ? 1.00 : bollingerB <= 0.2 ? 0.82 : bollingerB <= 0.4 ? 0.57
             : bollingerB <= 0.6 ? 0.37 : bollingerB <= 0.8 ? 0.20 : bollingerB <= 1.0 ? 0.06 : 0.00;
  }

  // Mom 20d: deeply negative = contrarian buy; mildly positive = healthy momentum; very extended = avoid
  if (momentum20 != null) {
    buy.mom = momentum20 <= -20 ? 0.90 : momentum20 <= -10 ? 0.75 : momentum20 <= -4 ? 0.60
            : momentum20 <= 2 ? 0.50 : momentum20 <= 8 ? 0.52 : momentum20 <= 18 ? 0.38 : 0.18;
  }

  // vs 52w High: far below high = undervalued relative to recent range
  if (distanceFromHigh != null) {
    buy.hi52 = distanceFromHigh <= -40 ? 1.00 : distanceFromHigh <= -25 ? 0.75 : distanceFromHigh <= -15 ? 0.52
             : distanceFromHigh <= -5 ? 0.32 : 0.10;
  }

  // ADX as a certainty multiplier: low ADX = no real trend (uncertain signal), moderate = developing
  if (adx != null) {
    buy.adx = adx < 15 ? 0.35 : adx <= 25 ? 0.55 : adx <= 40 ? 0.65 : 0.55;
  }

  // Safety: safer asset = more confident buy signal (penalises high-risk entries on volatile names)
  if (safetyScore != null) {
    buy.safety = safetyScore / 100;
  }

  // R/R: high ratio = price near 52w low = asymmetric upside = better buy
  if (riskReward != null) {
    buy.rr = riskReward >= 3 ? 1.00 : riskReward >= 2 ? 0.80 : riskReward >= 1 ? 0.60 : riskReward >= 0.5 ? 0.35 : 0.10;
  }

  // Momentum reversal: short-term (5d) turning positive while medium-term (20d) still negative
  // = price bouncing off a low — classic entry signal
  if (momentum5 != null && momentum20 != null) {
    buy.momRev = momentum5 > 5  && momentum20 < -5  ? 1.00   // strong bounce from oversold
               : momentum5 > 3  && momentum20 < 0   ? 0.85   // clear reversal starting
               : momentum5 > 0  && momentum20 < 0   ? 0.70   // early signs of turning
               : momentum5 > 0  && momentum20 >= 0  ? 0.45   // both positive, trend — not a fresh entry
               : momentum5 < 0  && momentum20 >= 0  ? 0.35   // dip in uptrend (possible entry)
               : 0.10;                                         // both negative — falling knife
  }

  // Volume confirmation via CMF (Chaikin Money Flow, 20-period).
  // Positive = net accumulation over 20 days, negative = net distribution.
  if (cmf != null) {
    buy.volConf = cmf >= 0.25 ? 0.95 : cmf >= 0.10 ? 0.78 : cmf >= 0 ? 0.58
                : cmf >= -0.10 ? 0.40 : cmf >= -0.25 ? 0.20 : 0.05;
  }

  // Trend quality: steady uptrend (healthy momentum, confirmed by MACD + ADX, not overextended above 200MA).
  // Rewards assets like XEQT that are consistently trending up but never "oversold".
  // Conditions mirror the ↑ trend badge: mom20>0, macdBullish, adx>15, d200 in [0,30], cmf>-0.05.
  if (momentum20 != null && macdBullish != null && adx != null && d200 != null) {
    const trendMom   = momentum20 > 0;
    const trendMacd  = macdBullish === true;
    const trendAdx   = adx > 15;
    const trendD200  = d200 >= 0 && d200 <= 30;
    const trendCmf   = cmf == null || cmf > -0.05;
    const trendScore = [trendMom, trendMacd, trendAdx, trendD200, trendCmf].filter(Boolean).length;
    buy.trend = trendScore === 5 ? 0.85   // full trend signal
              : trendScore >= 4  ? 0.65   // strong but missing one condition
              : trendScore >= 3  ? 0.45   // partial trend
              : trendScore >= 2  ? 0.30
              : 0.15;                      // no trend — neutral/negative
  }

  // Fundamentals (skipped for crypto / assets without coverage)
  if (fund) {
    if (fund.pe != null && fund.pe > 0) {
      const pe = fund.pe;
      buy.pe = pe <= 12 ? 1.00 : pe <= 18 ? 0.82 : pe <= 25 ? 0.60 : pe <= 35 ? 0.38 : pe <= 50 ? 0.18 : 0.05;
    }
    if (fund.recommendationMean != null) {
      const rm = fund.recommendationMean;
      buy.recMean = rm <= 1.5 ? 0.95 : rm <= 2.0 ? 0.80 : rm <= 2.5 ? 0.62 : rm <= 3.0 ? 0.45
                  : rm <= 3.5 ? 0.28 : rm <= 4.0 ? 0.15 : 0.05;
    }
  }

  // --- SELL components (0.0 = terrible time to sell, 1.0 = ideal) ---
  const sell = {};

  if (rsi != null) {
    sell.rsi = rsi >= 85 ? 1.00 : rsi >= 75 ? 0.87 : rsi >= 65 ? 0.68 : rsi >= 55 ? 0.50
             : rsi >= 45 ? 0.32 : rsi >= 35 ? 0.16 : rsi >= 25 ? 0.06 : 0.00;
  }

  if (d200 != null) {
    sell.ma200 = d200 >= 30 ? 1.00 : d200 >= 20 ? 0.88 : d200 >= 12 ? 0.73 : d200 >= 5 ? 0.57
               : d200 >= 0 ? 0.40 : d200 >= -10 ? 0.22 : d200 >= -20 ? 0.10 : 0.02;
  }

  if (d50 != null) {
    sell.ma50 = d50 >= 20 ? 1.00 : d50 >= 12 ? 0.82 : d50 >= 6 ? 0.64 : d50 >= 0 ? 0.50
              : d50 >= -5 ? 0.32 : d50 >= -12 ? 0.16 : 0.05;
  }

  if (d20 != null) {
    sell.ma20 = d20 >= 10 ? 1.00 : d20 >= 5 ? 0.80 : d20 >= 2 ? 0.60 : d20 >= 0 ? 0.47
              : d20 >= -4 ? 0.27 : 0.10;
  }

  if (macdBullish != null) {
    sell.macd = macdBullish ? 0.28 : 0.72;
  }

  if (bollingerB != null) {
    sell.boll = bollingerB >= 1.0 ? 1.00 : bollingerB >= 0.8 ? 0.85 : bollingerB >= 0.6 ? 0.62
              : bollingerB >= 0.4 ? 0.40 : bollingerB >= 0.2 ? 0.20 : 0.05;
  }

  if (momentum20 != null) {
    const baseMom = momentum20 >= 15 ? 0.15 : momentum20 >= 5 ? 0.30 : momentum20 >= 0 ? 0.45
                  : momentum20 >= -8 ? 0.68 : 0.90;
    // Below 200MA + falling: risky assets should cut losses.
    // Below 200MA + rising: recovery in progress — trust momentum direction (sell.safety handles riskiness).
    if (d200 != null && d200 < 0 && safetyScore != null && momentum20 <= 0) {
      const recoverFactor = safetyScore / 100; // 0 = risky → sell, 1 = safe → hold
      sell.mom = 0.15 + (1 - recoverFactor) * 0.55; // safe ≈ 0.15, risky ≈ 0.70
    } else {
      sell.mom = baseMom;
    }
  }

  if (distanceFromHigh != null) {
    sell.hi52 = distanceFromHigh >= -3 ? 1.00 : distanceFromHigh >= -8 ? 0.80 : distanceFromHigh >= -15 ? 0.55
              : distanceFromHigh >= -25 ? 0.30 : 0.10;
  }

  if (adx != null) {
    sell.adx = adx > 30 && macdBullish   ? 0.10   // strong confirmed uptrend — resist selling
             : adx > 30 && !macdBullish  ? 0.82   // strong confirmed downtrend — sell confirmed
             : adx > 20 && macdBullish   ? 0.25   // moderate uptrend
             : adx > 20 && !macdBullish  ? 0.68   // moderate downtrend
             : 0.48;                               // no clear trend — neutral
  }

  // Safety: lower safety = riskier asset = slightly stronger sell signal (trim before drawdown)
  if (safetyScore != null) {
    sell.safety = 1 - (safetyScore / 100);
  }

  // R/R: low ratio = price near 52w high = limited upside remaining = better sell
  if (riskReward != null) {
    sell.rr = riskReward < 0.5 ? 1.00 : riskReward < 1 ? 0.80 : riskReward < 2 ? 0.55 : riskReward < 3 ? 0.30 : 0.10;
  }

  // Fundamentals (skipped for crypto / assets without coverage)
  if (fund) {
    if (fund.pe != null && fund.pe > 0) {
      const pe = fund.pe;
      sell.pe = pe >= 50 ? 0.90 : pe >= 35 ? 0.72 : pe >= 25 ? 0.52 : pe >= 18 ? 0.32 : pe >= 12 ? 0.18 : 0.05;
    }
    if (fund.recommendationMean != null) {
      const rm = fund.recommendationMean;
      sell.recMean = rm >= 4.5 ? 0.95 : rm >= 4.0 ? 0.80 : rm >= 3.5 ? 0.62 : rm >= 3.0 ? 0.45
                   : rm >= 2.5 ? 0.28 : rm >= 2.0 ? 0.15 : 0.05;
    }
  }

  // Debug: log sell components for key symbols
  if (analysis.symbol === 'MSFT' || analysis.symbol === 'AMD') {
    console.log(`[${analysis.symbol} sell debug]`, { d200, momentum20, safetyScore, rsi, sell });
  }

  // Weighted average → 0–100
  const computeScore = (components) => {
    let weightedSum = 0;
    let totalWeight = 0;
    for (const [key, val] of Object.entries(components)) {
      if (val != null && W[key] != null) {
        weightedSum += val * W[key];
        totalWeight += W[key];
      }
    }
    return totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) : null;
  };

  return {
    buyScore: computeScore(buy),
    sellScore: computeScore(sell),
  };
}

module.exports = router;
module.exports.analyzeAssetTiming = analyzeAssetTiming;
module.exports.calculateBuySellScore = calculateBuySellScore;
module.exports.getFundamentals = getFundamentals;
