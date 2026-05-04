const express = require('express');
const Ranking = require('../models/Ranking');
const authMiddleware = require('../middleware/auth');
const logger = require('../config/logger');

const router = express.Router();

// GET /api/ranking — public leaderboard
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const ranking = await Ranking.getGlobal(limit);
    return res.json({ ranking });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/ranking/me — authenticated user's rank
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const rankRow = await Ranking.getByUserId(req.user.id);
    if (!rankRow) return res.status(404).json({ error: 'No ranking yet' });
    const rank = await Ranking.getUserRank(req.user.id);
    return res.json({ ...rankRow, rank });
  } catch (err) {
    logger.error('/ranking/me error: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
