const express = require('express');
const historicalDataCache = require('../historical-cache');
const router = express.Router();

// ---------------------------------------------------------------------------
// Fibonacci math
// ---------------------------------------------------------------------------

function calcFibLevels(swingHigh, swingLow) {
  const range = swingHigh - swingLow;
  return {
    level0:    swingLow,
    level236:  swingHigh - 0.236 * range,
    level382:  swingHigh - 0.382 * range,
    level500:  swingHigh - 0.500 * range,
    level618:  swingHigh - 0.618 * range,
    level786:  swingHigh - 0.786 * range,
    level1000: swingHigh,
  };
}

function getZoneInfo(currentPrice, levels, swingHigh, swingLow) {
  const range = swingHigh - swingLow;
  if (range === 0) return { pct: 50, fibLabel: 'No Range', signal: 'flat', color: '#6b7280' };

  const pct = ((currentPrice - swingLow) / range) * 100;

  let fibLabel, signal, color;
  if (currentPrice >= levels.level236) {
    fibLabel = 'Above 23.6%';
    signal = 'Minimal Retracement — strong trend';
    color = '#22c55e';
  } else if (currentPrice >= levels.level382) {
    fibLabel = '23.6% – 38.2%';
    signal = 'Mild Pullback — potential continuation';
    color = '#86efac';
  } else if (currentPrice >= levels.level500) {
    fibLabel = '38.2% – 50%';
    signal = 'Moderate Retracement — watch for support';
    color = '#eab308';
  } else if (currentPrice >= levels.level618) {
    fibLabel = '50% – 61.8%';
    signal = 'Golden Zone — key support level';
    color = '#f97316';
  } else if (currentPrice >= levels.level786) {
    fibLabel = '61.8% – 78.6%';
    signal = 'Deep Retracement — reversal probability high';
    color = '#ef4444';
  } else {
    fibLabel = 'Below 78.6%';
    signal = 'Extreme Retracement — possible trend change';
    color = '#7f1d1d';
  }

  return { pct: Math.round(pct * 10) / 10, fibLabel, signal, color };
}

// ---------------------------------------------------------------------------
// Holding-strength: how many consecutive daily closes have stayed near
// the closest Fibonacci level (within 3% tolerance)
// ---------------------------------------------------------------------------

const LEVEL_LABELS = {
  level0: '100%', level236: '78.6%', level382: '61.8%',
  level500: '50%', level618: '38.2%', level786: '23.6%', level1000: '0%',
};

function computeHoldingStrength(candles, levels) {
  if (!candles || candles.length < 2) return null;

  const currentPrice = candles[candles.length - 1].close;

  // Find the nearest Fibonacci level to the current price
  let nearestKey = null;
  let nearestPrice = null;
  let minDistPct = Infinity;

  for (const [key, price] of Object.entries(levels)) {
    const distPct = Math.abs(currentPrice - price) / price * 100;
    if (distPct < minDistPct) {
      minDistPct = distPct;
      nearestKey = key;
      nearestPrice = price;
    }
  }

  if (!nearestPrice) return null;

  // --- Consecutive days holding (within 3% of level) ---
  const TOLERANCE_PCT = 3;
  const maxLookback = Math.min(candles.length, 20);
  let consecutiveDays = 0;

  for (let i = candles.length - 1; i >= candles.length - maxLookback; i--) {
    const distPct = Math.abs(candles[i].close - nearestPrice) / nearestPrice * 100;
    if (distPct <= TOLERANCE_PCT) {
      consecutiveDays++;
    } else {
      break;
    }
  }

  const recentSlice = candles.slice(-(Math.max(consecutiveDays, 1)));
  const holdingAbove = recentSlice.every(c => c.close >= nearestPrice * 0.985);

  const strength =
    consecutiveDays >= 5 ? 'strong' :
    consecutiveDays >= 3 ? 'moderate' :
    consecutiveDays >= 1 ? 'weak' : 'none';

  // --- Bounce vs sitting vs breaking (last 5 candles) ---
  const last5 = candles.slice(-5);
  const wickTol = nearestPrice * 0.015; // wick tolerance: 1.5%
  const closeTol = nearestPrice * 0.02;  // close tolerance: 2%

  let bounceCount = 0;
  let breakCount  = 0;

  for (const c of last5) {
    const wickTouchedLevel = c.low  <= nearestPrice + wickTol;
    const closedAbove      = c.close >= nearestPrice - closeTol;
    const candleRange      = c.high - c.low;
    const strongClose      = candleRange > 0 && (c.close - c.low) / candleRange >= 0.4;

    if (wickTouchedLevel && closedAbove && strongClose) {
      bounceCount++;
    } else if (c.close < nearestPrice - closeTol) {
      breakCount++;
    }
  }

  const bounceStatus =
    bounceCount >= 1  ? 'bouncing' :
    breakCount  >= 2  ? 'breaking' :
    'sitting';

  // --- Volume: compare near-level days vs 20-day average ---
  const vol20   = candles.slice(-20);
  const avgVol  = vol20.reduce((s, c) => s + (c.volume || 0), 0) / vol20.length;

  const nearDays = last5.filter(
    c => Math.abs(c.close - nearestPrice) / nearestPrice * 100 <= TOLERANCE_PCT
  );
  const nearAvgVol = nearDays.length > 0
    ? nearDays.reduce((s, c) => s + (c.volume || 0), 0) / nearDays.length
    : 0;

  const volumeRatio     = avgVol > 0 ? parseFloat((nearAvgVol / avgVol).toFixed(2)) : 0;
  const volumeConfirmed = volumeRatio >= 1.2;

  return {
    nearestLevelKey:   nearestKey,
    nearestLevelLabel: LEVEL_LABELS[nearestKey] || nearestKey,
    nearestLevelPrice: nearestPrice,
    distancePct:       parseFloat(minDistPct.toFixed(1)),
    consecutiveDays,
    holdingAbove,
    strength,
    bounceStatus,   // 'bouncing' | 'sitting' | 'breaking'
    volumeRatio,    // ratio vs 20-day average (1.0 = average, 1.4 = 40% above)
    volumeConfirmed,
  };
}

// ---------------------------------------------------------------------------
// Core analysis — reads only from the existing historical cache
// ---------------------------------------------------------------------------

const PERIOD_MAP = {
  '3m': '3m',
  '6m': '6m',
  '1y': '1y',
  '2y': 'max', // historicalCache doesn't have a 2y period key; use max
};

function computeFib(symbol, period) {
  const cachePeriod = PERIOD_MAP[period] || '6m';
  const cached = historicalDataCache.get(symbol, cachePeriod);

  if (!cached || !cached.data || cached.data.length === 0) {
    return null;
  }

  const candles = cached.data.filter(
    c => c.open != null && c.high != null && c.low != null && c.close != null
  );

  if (candles.length === 0) return null;

  const swingHigh = Math.max(...candles.map(c => c.high));
  const swingLow  = Math.min(...candles.map(c => c.low));
  const currentPrice = candles[candles.length - 1].close;
  const currency = cached.symbol?.assetInfo?.currency || 'USD';

  const levels  = calcFibLevels(swingHigh, swingLow);
  const zone    = getZoneInfo(currentPrice, levels, swingHigh, swingLow);
  const holding = computeHoldingStrength(candles, levels);

  return {
    symbol,
    period,
    currency,
    swingHigh,
    swingLow,
    currentPrice,
    levels,
    zone,
    holding,
    candles: candles.slice(-120), // last ~6 months for chart display
  };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// GET /api/fibonacci/batch?symbols=AAPL,BTC,...&period=6m
// MUST be before /:symbol so Express doesn't treat 'batch' as a symbol param
router.get('/batch', (req, res) => {
  const raw = req.query.symbols || '';
  const symbols = raw.split(',').map(s => s.trim()).filter(Boolean);
  const period  = req.query.period || '6m';

  if (symbols.length === 0) {
    return res.status(400).json({ error: 'symbols query param required (comma-separated)' });
  }

  const results = symbols
    .map(sym => {
      try { return computeFib(sym, period); } catch { return null; }
    })
    .filter(Boolean)
    .map(({ candles: _omit, ...rest }) => rest); // strip candles from batch response

  res.json(results);
});

// GET /api/fibonacci/:symbol?period=6m
router.get('/:symbol', (req, res) => {
  const { symbol } = req.params;
  const period = req.query.period || '6m';

  if (!PERIOD_MAP[period]) {
    return res.status(400).json({ error: `Invalid period. Use: ${Object.keys(PERIOD_MAP).join(', ')}` });
  }

  const data = computeFib(symbol, period);
  if (!data) {
    return res.status(404).json({
      error: `No historical data found for ${symbol}. It may not be in the cache yet.`,
    });
  }

  res.json(data);
});

module.exports = router;
