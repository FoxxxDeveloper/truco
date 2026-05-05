/**
 * Users routes
 * GET /api/users/:id/public  — public profile by numeric user ID
 */
const express        = require('express');
const authMiddleware = require('../middleware/auth');
const logger         = require('../config/logger');
const { query }      = require('../config/database');

const router = express.Router();

// GET /api/users/:id/public
router.get('/:id/public', authMiddleware, async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (!userId || userId <= 0) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const rows = await query(
      `SELECT u.id, u.username, u.avatar, u.bio, u.created_at,
              r.elo, r.wins, r.losses, r.draws,
              uv.identity_status
       FROM usuarios u
       LEFT JOIN ranking r ON r.user_id = u.id
       LEFT JOIN user_verifications uv ON uv.user_id = u.id
       WHERE u.id = ?`,
      [userId]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    const u = rows[0];
    const total = (u.wins || 0) + (u.losses || 0);
    return res.json({
      id:              u.id,
      username:        u.username,
      avatar:          u.avatar || null,
      bio:             u.bio    || null,
      createdAt:       u.created_at,
      elo:             Number(u.elo    ?? 1000),
      wins:            Number(u.wins   ?? 0),
      losses:          Number(u.losses ?? 0),
      draws:           Number(u.draws  ?? 0),
      winrate:         total > 0 ? parseFloat(((u.wins / total) * 100).toFixed(1)) : 0,
      identity_status: u.identity_status || 'unverified',
    });
  } catch (err) {
    logger.error('users/:id/public: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
