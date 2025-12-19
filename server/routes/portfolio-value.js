const express = require('express');
const router = express.Router();
const portfolioValueCache = require('../portfolio-value-cache');
const portfolioValuePreloader = require('../portfolio-value-preloader');

/**
 * Portfolio Value API Routes
 *
 * Endpoints for accessing portfolio value over time data
 */

// GET /api/portfolio-value/stats - Get cache statistics
router.get('/stats', (req, res) => {
  try {
    const stats = portfolioValueCache.getStats();
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error getting portfolio value cache stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get cache statistics',
      message: error.message
    });
  }
});

// GET /api/portfolio-value/:portfolioId - Get portfolio value over time
router.get('/:portfolioId', (req, res) => {
  try {
    const { portfolioId } = req.params;
    const { period } = req.query; // Optional: 1m, 3m, 6m, 1y, max

    const data = portfolioValueCache.get(portfolioId, period || 'max');

    if (!data) {
      return res.status(404).json({
        success: false,
        error: 'Portfolio value data not found',
        message: `No cached data found for portfolio ${portfolioId}`
      });
    }

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error getting portfolio value:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get portfolio value data',
      message: error.message
    });
  }
});

// POST /api/portfolio-value/calculate - Calculate/recalculate portfolio value
router.post('/calculate', async (req, res) => {
  try {
    const { portfolioId = 'combined', tradingHoldingsOnly = false } = req.body;

    console.log(`🔄 Calculating portfolio value for ${portfolioId}...`);

    const result = await portfolioValuePreloader.calculatePortfolioValue(portfolioId, tradingHoldingsOnly);

    if (result.success) {
      res.json({
        success: true,
        message: 'Portfolio value calculated successfully',
        data: result
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to calculate portfolio value',
        message: result.message
      });
    }
  } catch (error) {
    console.error('Error calculating portfolio value:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate portfolio value',
      message: error.message
    });
  }
});

// POST /api/portfolio-value/refresh - Refresh all portfolio value caches
router.post('/refresh', async (req, res) => {
  try {
    console.log('🔄 Refreshing portfolio value cache...');

    const result = await portfolioValuePreloader.prePopulatePortfolioValue();

    if (result.success) {
      res.json({
        success: true,
        message: 'Portfolio value cache refreshed successfully',
        data: result
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to refresh portfolio value cache',
        message: result.message
      });
    }
  } catch (error) {
    console.error('Error refreshing portfolio value cache:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh portfolio value cache',
      message: error.message
    });
  }
});

// DELETE /api/portfolio-value/:portfolioId - Clear cache for specific portfolio
router.delete('/:portfolioId', (req, res) => {
  try {
    const { portfolioId } = req.params;

    const cleared = portfolioValueCache.clear(portfolioId);

    if (cleared) {
      res.json({
        success: true,
        message: `Cache cleared for portfolio ${portfolioId}`
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Portfolio not found',
        message: `No cached data found for portfolio ${portfolioId}`
      });
    }
  } catch (error) {
    console.error('Error clearing portfolio value cache:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear cache',
      message: error.message
    });
  }
});

// DELETE /api/portfolio-value - Clear all portfolio value caches
router.delete('/', (req, res) => {
  try {
    const count = portfolioValueCache.clearAll();

    res.json({
      success: true,
      message: `Cleared ${count} portfolio value cache entries`
    });
  } catch (error) {
    console.error('Error clearing all portfolio value caches:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear all caches',
      message: error.message
    });
  }
});

// GET /api/portfolio-value/preloader/status - Get preloader status
router.get('/preloader/status', (req, res) => {
  try {
    const status = portfolioValuePreloader.getStatus();

    res.json({
      success: true,
      status
    });
  } catch (error) {
    console.error('Error getting preloader status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get preloader status',
      message: error.message
    });
  }
});

module.exports = router;
