const express = require('express');
const router = express.Router();
const {
  getAllRecurringInvestments,
  updateRecurringInvestment,
  addRecurringInvestment,
  deleteRecurringInvestment,
  loadConfig
} = require('../services/recurring-investments');

/**
 * GET /api/recurring-investments
 * Get all recurring investments with calculated metrics
 */
router.get('/', async (req, res) => {
  try {
    const data = await getAllRecurringInvestments();
    res.json(data);
  } catch (error) {
    console.error('Error fetching recurring investments:', error);
    // Return empty data instead of 500 error to prevent breaking portfolio display
    res.json({
      investments: [],
      totals: {
        totalInvested: 0,
        currentValue: 0,
        profitLoss: 0,
        profitLossPercent: 0
      }
    });
  }
});

/**
 * GET /api/recurring-investments/config
 * Get raw configuration (for editing)
 */
router.get('/config', async (req, res) => {
  try {
    const config = await loadConfig();
    res.json(config);
  } catch (error) {
    console.error('Error fetching config:', error);
    res.status(500).json({ error: 'Failed to fetch configuration' });
  }
});

/**
 * POST /api/recurring-investments
 * Add a new recurring investment
 */
router.post('/', async (req, res) => {
  try {
    const investment = await addRecurringInvestment(req.body);
    res.json(investment);
  } catch (error) {
    console.error('Error adding recurring investment:', error);
    res.status(500).json({ error: 'Failed to add recurring investment' });
  }
});

/**
 * PUT /api/recurring-investments/:id
 * Update an existing recurring investment
 */
router.put('/:id', async (req, res) => {
  try {
    const investment = await updateRecurringInvestment(req.params.id, req.body);
    res.json(investment);
  } catch (error) {
    console.error('Error updating recurring investment:', error);
    res.status(404).json({ error: error.message });
  }
});

/**
 * DELETE /api/recurring-investments/:id
 * Delete a recurring investment
 */
router.delete('/:id', async (req, res) => {
  try {
    await deleteRecurringInvestment(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting recurring investment:', error);
    res.status(500).json({ error: 'Failed to delete recurring investment' });
  }
});

module.exports = router;
