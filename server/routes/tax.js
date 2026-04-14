const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const QUESTRADE_DIR = path.join(__dirname, '../uploads/questrade');

// Convert a Date to the weekIndex used by the frontend chart.
// weekIndex = (year - BASE_YEAR) * 52 + weekOfYear (0-indexed, 0-51)
const BASE_YEAR = 2015;
function dateToWeekIndex(date) {
  const year = date.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const dayOfYear = Math.floor((date - startOfYear) / 86400000); // ms per day
  const weekOfYear = Math.min(Math.floor(dayOfYear / 7), 51);
  return (year - BASE_YEAR) * 52 + weekOfYear;
}

// GET /api/tax/questrade-deposits
// Returns every deposit row from all Questrade CSVs, grouped by week with cumulative totals.
router.get('/questrade-deposits', async (req, res) => {
  try {
    if (!fs.existsSync(QUESTRADE_DIR)) {
      return res.json({ deposits: [], weeklyDeposits: [], total: 0 });
    }

    const files = fs.readdirSync(QUESTRADE_DIR).filter(f => f.toLowerCase().endsWith('.csv'));
    const deposits = [];

    for (const file of files) {
      await new Promise((resolve, reject) => {
        fs.createReadStream(path.join(QUESTRADE_DIR, file))
          .pipe(csv())
          .on('data', (row) => {
            const activityType = (row['Activity Type'] || row['activity type'] || '').trim();
            if (activityType !== 'Deposits') return;

            const dateStr = (row['Transaction Date'] || row['transaction date'] || '').trim();
            const netAmount = parseFloat(row['Net Amount'] || row['net amount'] || '0');
            const currency = (row['Currency'] || row['currency'] || 'CAD').trim().toUpperCase();

            if (!dateStr || isNaN(netAmount) || netAmount <= 0) return;

            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return;

            deposits.push({ date, amount: netAmount, currency, source: file });
          })
          .on('end', resolve)
          .on('error', reject);
      });
    }

    // Sort chronologically
    deposits.sort((a, b) => a.date - b.date);

    // Aggregate by weekIndex
    const weekMap = new Map();
    for (const dep of deposits) {
      const weekIndex = dateToWeekIndex(dep.date);
      const existing = weekMap.get(weekIndex) || { weekIndex, weeklyTotal: 0, date: dep.date };
      existing.weeklyTotal += dep.amount;
      weekMap.set(weekIndex, existing);
    }

    // Build sorted array with running cumulative
    const weeklyDeposits = Array.from(weekMap.values()).sort((a, b) => a.weekIndex - b.weekIndex);
    let cumulative = 0;
    for (const w of weeklyDeposits) {
      cumulative += w.weeklyTotal;
      w.cumulative = cumulative;
    }

    res.json({
      deposits: deposits.map(d => ({
        date: d.date.toISOString().slice(0, 10),
        amount: d.amount,
        currency: d.currency,
        source: d.source,
      })),
      weeklyDeposits,
      total: cumulative,
    });
  } catch (err) {
    console.error('❌ Tax route error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
