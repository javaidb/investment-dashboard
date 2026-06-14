const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const QUESTRADE_DIR = path.join(__dirname, '../uploads/questrade');
const WEALTHSIMPLE_DIR = path.join(__dirname, '../uploads/wealthsimple');

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
// Returns TFSA deposits from Questrade and Wealthsimple, grouped by week with cumulative totals.
router.get('/questrade-deposits', async (req, res) => {
  try {
    const qtDeposits = [];
    const wsDeposits = [];

    // ── Questrade: filter to rows where Account Type contains "TFSA" ──────────
    if (fs.existsSync(QUESTRADE_DIR)) {
      const files = fs.readdirSync(QUESTRADE_DIR).filter(f => f.toLowerCase().endsWith('.csv'));
      for (const file of files) {
        await new Promise((resolve, reject) => {
          fs.createReadStream(path.join(QUESTRADE_DIR, file))
            .pipe(csv())
            .on('data', (row) => {
              const activityType = (row['Activity Type'] || row['activity type'] || '').trim();
              if (activityType !== 'Deposits') return;

              const accountType = (row['Account Type'] || row['account type'] || '').trim().toUpperCase();
              if (!accountType.includes('TFSA')) return;

              const dateStr = (row['Transaction Date'] || row['transaction date'] || '').trim();
              const netAmount = parseFloat(row['Net Amount'] || row['net amount'] || '0');
              const currency = (row['Currency'] || row['currency'] || 'CAD').trim().toUpperCase();

              if (!dateStr || isNaN(netAmount) || netAmount <= 0) return;

              const date = new Date(dateStr);
              if (isNaN(date.getTime())) return;

              qtDeposits.push({ date, amount: netAmount, currency, source: file });
            })
            .on('end', resolve)
            .on('error', reject);
        });
      }
    }

    // ── Wealthsimple: TFSA deposits from both CSV formats ────────────────────
    if (fs.existsSync(WEALTHSIMPLE_DIR)) {
      const wsFiles = fs.readdirSync(WEALTHSIMPLE_DIR).filter(f => f.toLowerCase().endsWith('.csv'));
      for (const file of wsFiles) {
        await new Promise((resolve, reject) => {
          const rows = [];
          fs.createReadStream(path.join(WEALTHSIMPLE_DIR, file))
            .pipe(csv())
            .on('data', (row) => rows.push(row))
            .on('end', () => {
              if (rows.length === 0) return resolve();

              const firstRow = rows[0];
              const hasAccountTypeCol = 'account_type' in firstRow;

              for (const row of rows) {
                let isTfsa = false;
                let dateStr = '';
                let amount = 0;

                if (hasAccountTypeCol) {
                  // New activities-export format
                  const acctType = (row['account_type'] || '').trim().toUpperCase();
                  if (!acctType.includes('TFSA')) continue;
                  isTfsa = true;

                  const activityType = (row['activity_type'] || '').trim();
                  if (activityType !== 'MoneyMovement') continue;

                  dateStr = (row['transaction_date'] || '').trim();
                  amount = parseFloat(row['net_cash_amount'] || '0');
                } else {
                  // Old monthly-statement format — check filename for TFSA
                  if (!file.toUpperCase().includes('TFSA')) continue;
                  isTfsa = true;

                  const txn = (row['transaction'] || '').trim().toUpperCase();
                  if (txn !== 'CONT') continue;

                  dateStr = (row['date'] || '').trim();
                  amount = parseFloat(row['amount'] || '0');
                }

                if (!isTfsa || !dateStr || isNaN(amount) || amount <= 0) continue;

                const date = new Date(dateStr);
                if (isNaN(date.getTime())) continue;

                wsDeposits.push({ date, amount, currency: 'CAD', source: file });
              }
              resolve();
            })
            .on('error', reject);
        });
      }
    }

    // Helper: aggregate deposits array into sorted weekly cumulative array
    function aggregateWeekly(deposits) {
      deposits.sort((a, b) => a.date - b.date);
      const weekMap = new Map();
      for (const dep of deposits) {
        const weekIndex = dateToWeekIndex(dep.date);
        const existing = weekMap.get(weekIndex) || { weekIndex, weeklyTotal: 0, date: dep.date };
        existing.weeklyTotal += dep.amount;
        weekMap.set(weekIndex, existing);
      }
      const weekly = Array.from(weekMap.values()).sort((a, b) => a.weekIndex - b.weekIndex);
      let cumulative = 0;
      for (const w of weekly) { cumulative += w.weeklyTotal; w.cumulative = cumulative; }
      return { weekly, total: cumulative };
    }

    const qt = aggregateWeekly(qtDeposits);
    const ws = aggregateWeekly(wsDeposits);

    res.json({
      weeklyDepositsQuestrade: qt.weekly,
      totalQuestrade: qt.total,
      weeklyDepositsWealthsimple: ws.weekly,
      totalWealthsimple: ws.total,
    });
  } catch (err) {
    console.error('❌ Tax route error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
