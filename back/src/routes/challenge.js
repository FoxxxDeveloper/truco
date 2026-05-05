/**
 * Challenge (Reto) routes
 * POST   /api/challenges          — create a challenge
 * GET    /api/challenges          — list open public challenges
 * POST   /api/challenges/:id/accept — accept a challenge
 * DELETE /api/challenges/:id      — cancel your own challenge
 */
const express        = require('express');
const ChallengeService = require('../services/challengeService');
const authMiddleware   = require('../middleware/auth');
const logger           = require('../config/logger');
const { query }        = require('../config/database');

const router = express.Router();
router.use(authMiddleware);

// POST /api/challenges
router.post('/', async (req, res) => {
  try {
    const { amount, isPrivate = false, opponentId = null, gameConfig = {} } = req.body;

    if (!amount) return res.status(400).json({ error: 'amount is required' });
    const parsedAmount = parseFloat(amount);
    if (!isFinite(parsedAmount) || parsedAmount < 2500) {
      return res.status(400).json({ error: 'El monto mínimo para apostar es 2500 créditos' });
    }

    // Security: opponentId cannot be self
    if (opponentId && parseInt(opponentId) === req.user.id) {
      return res.status(400).json({ error: 'Cannot challenge yourself' });
    }

    const result = await ChallengeService.createChallenge({
      creatorId:  req.user.id,
      amount,
      isPrivate:  !!isPrivate,
      opponentId: opponentId ? parseInt(opponentId) : null,
      gameConfig,
    });

    return res.status(201).json(result);
  } catch (err) {
    if (err.message.startsWith('Insufficient')) {
      return res.status(400).json({ error: err.message });
    }
    logger.error('create challenge: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/challenges
router.get('/', async (req, res) => {
  try {
    const { minAmount = 0, maxAmount = 999999, limit = 20 } = req.query;
    const challenges = await ChallengeService.listOpen({ minAmount, maxAmount, limit });
    return res.json({ challenges });
  } catch (err) {
    logger.error('list challenges: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/challenges/mine — challenges created by current user
router.get('/mine', async (req, res) => {
  try {
    const rows = await query(
      `SELECT c.*, u.username AS opponent_username
       FROM challenges c
       LEFT JOIN usuarios u ON u.id = c.opponent_id
       WHERE c.creator_id = ?
       ORDER BY c.created_at DESC LIMIT 20`,
      [req.user.id]
    );
    return res.json({ challenges: rows });
  } catch (err) {
    logger.error('mine challenges: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/challenges/:id/accept
router.post('/:id/accept', async (req, res) => {
  try {
    const result = await ChallengeService.acceptChallenge({
      challengeId: req.params.id,
      opponentId:  req.user.id,
    });
    // The caller (matchmakingHandler / frontend) uses roomId to join the game
    return res.json(result);
  } catch (err) {
    const clientErrors = ['Challenge not found', 'Challenge is', 'Challenge has expired', 'Cannot accept', 'specific player', 'Insufficient'];
    if (clientErrors.some(e => err.message.startsWith(e) || err.message.includes(e))) {
      return res.status(400).json({ error: err.message });
    }
    logger.error('accept challenge: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/challenges/:id
router.delete('/:id', async (req, res) => {
  try {
    await ChallengeService.cancelChallenge(req.params.id, req.user.id);
    return res.json({ ok: true });
  } catch (err) {
    if (err.message.includes('not found') || err.message.includes('creator') || err.message.includes('Cannot cancel')) {
      return res.status(400).json({ error: err.message });
    }
    logger.error('cancel challenge: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
