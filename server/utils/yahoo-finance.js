/**
 * Yahoo Finance fetch utility with automatic Canadian exchange suffix fallback.
 * Tries bare symbol first, then .TO (TSX), .V (TSXV), .CN (CSE).
 */
const axios = require('axios');

const CANADIAN_SUFFIXES = ['.TO', '.V', '.CN'];

/**
 * Fetch a Yahoo Finance chart, trying .TO / .V / .CN suffixes if the bare
 * symbol returns no data. Returns { data, resolvedSymbol } or null on failure.
 *
 * `data` is the raw Yahoo Finance response body (same as axios response.data).
 */
async function fetchYahooChart(symbol, params = {}, timeout = 8000) {
  const candidates = symbol.includes('.')
    ? [symbol]
    : [symbol, ...CANADIAN_SUFFIXES.map(s => symbol + s)];

  // Yahoo Finance v8 requires period2; default to now if not supplied
  const mergedParams = { period2: Math.floor(Date.now() / 1000), ...params };

  for (const ticker of candidates) {
    try {
      const response = await axios.get(
        `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`,
        { params: mergedParams, timeout }
      );
      const result = response.data?.chart?.result?.[0];
      if (!result) continue;

      // Require at least one non-null close price
      const closes = result.indicators?.quote?.[0]?.close ?? [];
      if (!closes.some(c => c != null)) continue;

      if (ticker !== symbol) {
        console.log(`📈 Yahoo Finance: ${symbol} → ${ticker}`);
      }
      return { data: response.data, resolvedSymbol: ticker };
    } catch (_) {
      // try next candidate
    }
  }
  return null;
}

module.exports = { fetchYahooChart };
