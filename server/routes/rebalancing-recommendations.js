const express = require('express');
const axios = require('axios');
const historicalDataCache = require('../historical-cache');
const router = express.Router();

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

// Analyze a single asset for timing recommendations
async function analyzeAssetTiming(symbol, adjustment, currentInvestment) {
  // Determine if we're buying or selling (outside try for error handling)
  const isAdding = adjustment > currentInvestment;
  const isRemoving = adjustment < currentInvestment;
  const amount = Math.abs(adjustment - currentInvestment);

  try {
    // Get historical data for the asset
    const cachedData = historicalDataCache.get(symbol);
    const historicalData = cachedData?.data || null;

    console.log(`📊 Analyzing ${symbol}: Found ${historicalData ? historicalData.length : 0} data points`);

    if (!historicalData || !Array.isArray(historicalData) || historicalData.length < 200) {
      console.log(`⚠️ ${symbol}: Insufficient data (${historicalData ? historicalData.length : 0} points, need 200+)`);
      return {
        symbol,
        action: isAdding ? 'BUY' : isRemoving ? 'SELL' : 'HOLD',
        amount,
        currentInvestment,
        targetInvestment: adjustment,
        timing: 'INSUFFICIENT_DATA',
        recommendation: `Not enough historical data for analysis (have ${historicalData ? historicalData.length : 0} days, need 200+). Asset may need data preloading.`,
        confidence: 'low',
        indicators: {},
        reasons: []
      };
    }

    // Extract close prices (most recent first)
    const closePrices = [...historicalData]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .map(d => d.close);

    const currentPrice = closePrices[0];

    // Calculate technical indicators
    const sma200 = calculateSMA(closePrices, 200); // 200-day MA (approximation for weekly)
    const sma50 = calculateSMA(closePrices, 50);
    const sma20 = calculateSMA(closePrices, 20);
    const rsi = calculateRSI(closePrices, 14);
    const momentum20 = calculateMomentum(closePrices, 20);
    const momentum50 = calculateMomentum(closePrices, 50);

    // Determine position relative to 200MA
    const aboveMA200 = currentPrice > sma200;
    const distanceFromMA200 = ((currentPrice - sma200) / sma200) * 100;

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
        sma200,
        sma50,
        sma20,
        rsi,
        momentum20,
        momentum50,
        aboveMA200,
        distanceFromMA200: distanceFromMA200.toFixed(2) + '%'
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

module.exports = router;
