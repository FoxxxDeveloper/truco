/**
 * Profile routes
 * GET  /api/profile/me              — own profile (full)
 * GET  /api/users/:id/public        — public profile by numeric ID
 * GET  /api/profile/:username       — public profile by username
 * PUT  /api/profile                 — update bio / avatar URL
 * POST /api/profile/avatar          — upload avatar file (multipart)
 * GET  /api/games/active            — reconnectable games for current user
 * GET  /api/games/history           — game history (paginated)
 */
const path           = require('path');
const fs             = require('fs');
const express        = require('express');
const multer         = require('multer');
const authMiddleware = require('../middleware/auth');
const logger         = require('../config/logger');
const { query }      = require('../config/database');

const router = express.Router();

// ── Multer config for avatar uploads ─────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, '../../uploads/avatars');
// Ensure directory exists
try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch (_) {}

const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase() || '.jpg';
    const safe = ext.replace(/[^.a-z0-9]/gi, '');
    cb(null, `avatar_${req.user.id}_${Date.now()}${safe}`);
  },
});
const avatarUpload = multer({
  storage: avatarStorage,
  limits:  { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Solo se permiten imágenes JPG, PNG, WebP o GIF'));
  },
});

// ── Own profile ───────────────────────────────────────────────────────────────
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const rows = await query(
      `SELECT u.id, u.username, u.email, u.avatar, u.bio,
              u.telegram_user_id IS NOT NULL AS telegram_linked,
              r.elo, r.wins, r.losses, r.draws,
              w.balance, w.reserved
       FROM usuarios u
       LEFT JOIN ranking r ON r.user_id = u.id
       LEFT JOIN wallet w  ON w.user_id = u.id
       WHERE u.id = ?`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const user = rows[0];
    const total = (user.wins || 0) + (user.losses || 0);
    user.winrate     = total > 0 ? parseFloat(((user.wins / total) * 100).toFixed(1)) : 0;
    user.balance     = parseFloat(user.balance ?? 0);
    user.reserved    = parseFloat(user.reserved ?? 0);
    user.elo         = Number(user.elo ?? 1000);
    user.wins        = Number(user.wins ?? 0);
    user.losses      = Number(user.losses ?? 0);
    user.draws       = Number(user.draws ?? 0);

    return res.json(user);
  } catch (err) {
    logger.error('profile me: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ── Public profile by username ────────────────────────────────────────────────
router.get('/:username', async (req, res) => {
  try {
    const rows = await query(
      `SELECT u.id, u.username, u.avatar, u.bio, u.created_at,
              r.elo, r.wins, r.losses, r.draws
       FROM usuarios u
       LEFT JOIN ranking r ON r.user_id = u.id
       WHERE u.username = ?`,
      [req.params.username]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const user = rows[0];
    const total = (user.wins || 0) + (user.losses || 0);
    user.winrate = total > 0 ? parseFloat(((user.wins / total) * 100).toFixed(1)) : 0;
    user.elo     = Number(user.elo ?? 1000);
    user.wins    = Number(user.wins ?? 0);
    user.losses  = Number(user.losses ?? 0);
    user.draws   = Number(user.draws ?? 0);

    return res.json(user);
  } catch (err) {
    logger.error('profile :username: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ── Update own profile ────────────────────────────────────────────────────────
router.put('/', authMiddleware, async (req, res) => {
  try {
    const allowed = ['bio', 'avatar'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    // bio max length
    if (updates.bio && updates.bio.length > 500) {
      return res.status(400).json({ error: 'Bio max 500 chars' });
    }
    if (updates.avatar && typeof updates.avatar !== 'string') {
      return res.status(400).json({ error: 'Invalid avatar' });
    }

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values     = [...Object.values(updates), req.user.id];
    await query(`UPDATE usuarios SET ${setClauses} WHERE id = ?`, values);

    return res.json({ ok: true, updated: updates });
  } catch (err) {
    logger.error('profile PUT: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ── Avatar file upload ────────────────────────────────────────────────────────
router.post('/avatar', authMiddleware, (req, res) => {
  avatarUpload.single('avatar')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Error al subir imagen' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ningún archivo' });
    }
    try {
      const avatarUrl = `/uploads/avatars/${req.file.filename}`;
      await query('UPDATE usuarios SET avatar = ? WHERE id = ?', [avatarUrl, req.user.id]);
      return res.json({ ok: true, avatarUrl });
    } catch (dbErr) {
      // Remove uploaded file if DB update fails
      fs.unlink(req.file.path, () => {});
      logger.error('avatar upload db: ' + dbErr.message);
      return res.status(500).json({ error: 'Server error' });
    }
  });
});

// ── Link Telegram account ─────────────────────────────────────────────────────
// Called by the Telegram bot after user sends /link <token> in the bot chat.
// (The token is generated when the user clicks "Link Telegram" in the app.)
router.post('/link-telegram', authMiddleware, async (req, res) => {
  try {
    const { telegramUserId } = req.body;
    if (!telegramUserId) return res.status(400).json({ error: 'telegramUserId required' });
    await query(
      'UPDATE usuarios SET telegram_user_id = ?, telegram_linked_at = NOW() WHERE id = ?',
      [telegramUserId, req.user.id]
    );
    return res.json({ ok: true });
  } catch (err) {
    logger.error('link telegram: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ── Active games (reconnectable) ──────────────────────────────────────────────
router.get('/me/active-games', authMiddleware, async (req, res) => {
  try {
    const rows = await query(
      `SELECT p.room_id, p.status, p.score_p1, p.score_p2,
              p.p1_disconnected_at, p.p2_disconnected_at,
              u1.username AS player1_username, u1.avatar AS player1_avatar,
              u2.username AS player2_username, u2.avatar AS player2_avatar,
              p.challenge_id, c.amount AS bet_amount
       FROM partidas p
       JOIN usuarios u1 ON u1.id = p.player1_id
       JOIN usuarios u2 ON u2.id = p.player2_id
       LEFT JOIN challenges c ON c.id = p.challenge_id
       WHERE (p.player1_id = ? OR p.player2_id = ?)
         AND p.state = 'playing'
         AND p.status IN ('active','paused')`,
      [req.user.id, req.user.id]
    );
    return res.json({ games: rows });
  } catch (err) {
    logger.error('active games: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ── Game history ──────────────────────────────────────────────────────────────
router.get('/me/game-history', authMiddleware, async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 20, 50);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    const rows = await query(
      `SELECT p.room_id, p.score_p1, p.score_p2, p.started_at, p.finished_at,
              p.state, p.status,
              u1.username AS player1_username,
              u2.username AS player2_username,
              p.winner_id,
              c.amount AS bet_amount
       FROM partidas p
       JOIN usuarios u1 ON u1.id = p.player1_id
       JOIN usuarios u2 ON u2.id = p.player2_id
       LEFT JOIN challenges c ON c.id = p.challenge_id
       WHERE (p.player1_id = ? OR p.player2_id = ?)
         AND p.state = 'finished'
       ORDER BY p.finished_at DESC
       LIMIT ? OFFSET ?`,
      [req.user.id, req.user.id, limit, offset]
    );

    return res.json({ games: rows });
  } catch (err) {
    logger.error('game history: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
