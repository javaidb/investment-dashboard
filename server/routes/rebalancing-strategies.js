const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// File-based storage for rebalancing strategies
const STRATEGIES_FILE = path.join(__dirname, '../data/cache', 'rebalancing-strategies.json');

// Ensure strategies file exists
function ensureStrategiesFile() {
  try {
    const strategiesDir = path.dirname(STRATEGIES_FILE);
    if (!fs.existsSync(strategiesDir)) {
      fs.mkdirSync(strategiesDir, { recursive: true });
    }

    if (!fs.existsSync(STRATEGIES_FILE)) {
      fs.writeFileSync(STRATEGIES_FILE, JSON.stringify({ strategies: [] }, null, 2));
    }
  } catch (error) {
    console.error('Error ensuring strategies file:', error);
    throw error;
  }
}

// Load all strategies
function loadStrategies() {
  try {
    ensureStrategiesFile();
    const data = fs.readFileSync(STRATEGIES_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading strategies:', error);
    return { strategies: [] };
  }
}

// Save strategies
function saveStrategies(strategiesData) {
  try {
    ensureStrategiesFile();
    fs.writeFileSync(STRATEGIES_FILE, JSON.stringify(strategiesData, null, 2));
  } catch (error) {
    console.error('Error saving strategies:', error);
    throw error;
  }
}

// GET /api/strategies - Get all saved strategies
router.get('/', (req, res) => {
  try {
    const data = loadStrategies();
    res.json(data.strategies);
  } catch (error) {
    console.error('Error fetching strategies:', error);
    res.status(500).json({ error: 'Failed to fetch strategies' });
  }
});

// POST /api/strategies - Save a new strategy or overwrite existing
router.post('/', (req, res) => {
  try {
    const { name, adjustments, description, overwrite, existingId } = req.body;

    if (!name || !adjustments) {
      return res.status(400).json({ error: 'Name and adjustments are required' });
    }

    const data = loadStrategies();

    // If overwrite mode and existingId provided, update that strategy
    if (overwrite && existingId) {
      const existingIndex = data.strategies.findIndex(s => s.id === existingId);

      if (existingIndex === -1) {
        return res.status(404).json({ error: 'Strategy to overwrite not found' });
      }

      // Update the existing strategy
      const updatedStrategy = {
        ...data.strategies[existingIndex],
        name,
        description: description || '',
        adjustments,
        updatedAt: new Date().toISOString()
      };

      data.strategies[existingIndex] = updatedStrategy;
      saveStrategies(data);

      return res.json({ ...updatedStrategy, overwritten: true });
    }

    // Check for duplicate names when creating new strategy
    const existingIndex = data.strategies.findIndex(s => s.name === name);
    if (existingIndex !== -1) {
      return res.status(400).json({
        error: 'A strategy with this name already exists',
        existingStrategy: data.strategies[existingIndex]
      });
    }

    const newStrategy = {
      id: Date.now().toString(),
      name,
      description: description || '',
      adjustments,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    data.strategies.push(newStrategy);
    saveStrategies(data);

    res.status(201).json(newStrategy);
  } catch (error) {
    console.error('Error saving strategy:', error);
    res.status(500).json({ error: 'Failed to save strategy' });
  }
});

// PUT /api/strategies/:id - Update an existing strategy
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, adjustments, description } = req.body;

    const data = loadStrategies();
    const strategyIndex = data.strategies.findIndex(s => s.id === id);

    if (strategyIndex === -1) {
      return res.status(404).json({ error: 'Strategy not found' });
    }

    // Check if new name conflicts with another strategy
    if (name && name !== data.strategies[strategyIndex].name) {
      const duplicateIndex = data.strategies.findIndex(s => s.name === name && s.id !== id);
      if (duplicateIndex !== -1) {
        return res.status(400).json({ error: 'A strategy with this name already exists' });
      }
    }

    // Update strategy
    const updatedStrategy = {
      ...data.strategies[strategyIndex],
      name: name || data.strategies[strategyIndex].name,
      adjustments: adjustments || data.strategies[strategyIndex].adjustments,
      description: description !== undefined ? description : data.strategies[strategyIndex].description,
      updatedAt: new Date().toISOString()
    };

    data.strategies[strategyIndex] = updatedStrategy;
    saveStrategies(data);

    res.json(updatedStrategy);
  } catch (error) {
    console.error('Error updating strategy:', error);
    res.status(500).json({ error: 'Failed to update strategy' });
  }
});

// DELETE /api/strategies/:id - Delete a strategy
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const data = loadStrategies();

    const strategyIndex = data.strategies.findIndex(s => s.id === id);

    if (strategyIndex === -1) {
      return res.status(404).json({ error: 'Strategy not found' });
    }

    const deletedStrategy = data.strategies[strategyIndex];
    data.strategies.splice(strategyIndex, 1);
    saveStrategies(data);

    res.json({ message: 'Strategy deleted successfully', strategy: deletedStrategy });
  } catch (error) {
    console.error('Error deleting strategy:', error);
    res.status(500).json({ error: 'Failed to delete strategy' });
  }
});

module.exports = router;
