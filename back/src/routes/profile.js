/**
 * Profile routes
 * GET  /api/profile/me              — own profile (full)
 * GET  /api/users/:id/public        — public profile by numeric ID
 * GET  /api/profile/:username       — public profile by username
 * PUT  /api/profile                 — update bio (avatar → PUT /avatar-choice)
 * PUT  /api/profile/avatar-choice   — avatar TrucoFX (avataaars:…)
 * POST /api/profile/avatar          — upload avatar file (legacy; UI no lo usa)
 * GET  /api/games/active            — reconnectable games for current user
 * GET  /api/games/history           — game history (paginated)
 */
const path           = require('path');
const fs             = require('fs');
const express        = require('express');
const multer         = require('multer');
const authMiddleware = require('../middleware/auth');
const optionalAuth = require('../middleware/optionalAuth');
const logger         = require('../config/logger');
const { query }      = require('../config/database');
const Friend         = require('../models/Friend');
const { validateAvataaarsAvatarString } = require('../utils/avataaarsAvatarValidate');

/** Solo avataaars locales (JSON en base64url). Legacy lo renderiza el front. */
function isValidTrucoFxAvatar(avatar) {
  if (avatar == null || typeof avatar !== 'string') return false;
  const t = avatar.trim();
  return validateAvataaarsAvatarString(t);
}

const router = express.Router();

const CREDIT_EPS = 1e-6;

/** Agrupa montos de apuestas por challenge (reference = challenge.id). */
function buildBetTxMap(txRows) {
  const map = new Map();
  for (const r of txRows || []) {
    const key = String(r.reference);
    if (!map.has(key)) {
      map.set(key, { bet_win: 0, bet_loss: 0, bet_refund: 0 });
    }
    const o = map.get(key);
    const amt = parseFloat(r.total) || 0;
    if (r.type === 'bet_win') o.bet_win += amt;
    else if (r.type === 'bet_loss') o.bet_loss += amt;
    else if (r.type === 'bet_refund') o.bet_refund += amt;
  }
  return map;
}

/**
 * credits_delta > 0 ganancia neta (premio acreditado en bet_win o estimado).
 * credits_delta < 0 monto apostado perdido (bet_loss o stake).
 */
function resolveMatchCredits({ row, result, txMap }) {
  const chId = row.challenge_id != null ? String(row.challenge_id) : null;
  const stake = parseFloat(row.challenge_amount) || 0;
  const prizeDb = row.prize_amount != null ? parseFloat(row.prize_amount) : NaN;
  const comm = row.commission_amount != null ? parseFloat(row.commission_amount) : NaN;

  let credits_delta = null;
  let has_credit_movement = false;
  let stake_amount = stake > CREDIT_EPS ? stake : null;
  let prize_amount =
    Number.isFinite(prizeDb) && prizeDb > CREDIT_EPS ? parseFloat(prizeDb.toFixed(2)) : null;

  const agg = chId && txMap ? txMap.get(chId) : null;

  if (agg && agg.bet_refund > CREDIT_EPS && result === 'unknown') {
    credits_delta = parseFloat(agg.bet_refund.toFixed(2));
    has_credit_movement = Math.abs(credits_delta) > CREDIT_EPS;
    return { credits_delta, has_credit_movement, stake_amount, prize_amount };
  }

  if (result === 'won' && agg && agg.bet_win > CREDIT_EPS) {
    const prizeCredited = agg.bet_win;
    const net =
      stake > CREDIT_EPS
        ? parseFloat((prizeCredited - stake).toFixed(2))
        : parseFloat(prizeCredited.toFixed(2));
    credits_delta = net;
    has_credit_movement = Math.abs(net) > CREDIT_EPS;
    if (!prize_amount) prize_amount = parseFloat(prizeCredited.toFixed(2));
    return { credits_delta, has_credit_movement, stake_amount, prize_amount };
  }
  if (result === 'lost' && agg && agg.bet_loss > CREDIT_EPS) {
    credits_delta = -parseFloat(agg.bet_loss.toFixed(2));
    has_credit_movement = Math.abs(credits_delta) > CREDIT_EPS;
    if (!stake_amount) stake_amount = agg.bet_loss;
    return { credits_delta, has_credit_movement, stake_amount, prize_amount };
  }

  if (chId && stake > CREDIT_EPS) {
    if (result === 'won') {
      let grossPrize = prize_amount;
      if (!grossPrize || grossPrize <= CREDIT_EPS) {
        const c = Number.isFinite(comm) && comm >= 0 ? comm : parseFloat((stake * 2 * 0.05).toFixed(2));
        grossPrize = parseFloat((stake * 2 - c).toFixed(2));
      }
      if (grossPrize > CREDIT_EPS) {
        credits_delta = parseFloat((grossPrize - stake).toFixed(2));
        has_credit_movement = Math.abs(credits_delta) > CREDIT_EPS;
        prize_amount = grossPrize;
      }
    } else if (result === 'lost') {
      credits_delta = -parseFloat(stake.toFixed(2));
      has_credit_movement = Math.abs(credits_delta) > CREDIT_EPS;
    }
  }

  if (credits_delta != null && Math.abs(credits_delta) <= CREDIT_EPS) {
    credits_delta = null;
    has_credit_movement = false;
  }

  return { credits_delta, has_credit_movement, stake_amount, prize_amount };
}

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

// ── Avatar TrucoFX (solo string avataaars:…) ────────────────────────────────────
router.put('/avatar-choice', authMiddleware, async (req, res) => {
  try {
    const { avatar } = req.body;
    if (avatar == null || typeof avatar !== 'string') {
      return res.status(400).json({ error: 'Avatar inválido' });
    }
    const trimmed = avatar.trim();
    if (!isValidTrucoFxAvatar(trimmed)) {
      return res.status(400).json({ error: 'Avatar inválido' });
    }
    await query('UPDATE usuarios SET avatar = ? WHERE id = ?', [trimmed, req.user.id]);
    return res.json({ ok: true, avatar: trimmed });
  } catch (err) {
    logger.error('profile avatar-choice: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ── Public profile by username (optional auth → friendshipStatus) ─────────────
router.get('/:username', optionalAuth, async (req, res) => {
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

    let friendshipStatus = null;
    if (req.user) {
      friendshipStatus =
        user.id === req.user.id ? 'self' : await Friend.getFriendshipStatus(req.user.id, user.id);
    }

    return res.json({ ...user, friendshipStatus });
  } catch (err) {
    logger.error('profile :username: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ── Update own profile (solo bio; avatar → PUT /avatar-choice) ───────────────
router.put('/', authMiddleware, async (req, res) => {
  try {
    const allowed = ['bio'];
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
         AND p.status IN ('active','paused')
         AND IFNULL(p.requires_admin_resolution, 0) = 0
         AND NOT (
           p.status = 'paused'
           AND p.p1_reconnect_deadline_at IS NOT NULL
           AND p.p2_reconnect_deadline_at IS NOT NULL
           AND p.p1_reconnect_deadline_at < NOW()
           AND p.p2_reconnect_deadline_at < NOW()
         )`,
      [req.user.id, req.user.id]
    );
    return res.json({ games: rows });
  } catch (err) {
    logger.error('active games: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ── Game history (paginated, enriched) — GET /api/profile/me/game-history | /me/matches | /api/me/matches ──
async function matchHistoryHandler(req, res) {
  try {
    const limitRaw = parseInt(String(req.query.limit ?? ''), 10);
    const pageRaw = parseInt(String(req.query.page ?? ''), 10);
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 20, 1), 50);
    const page = Math.max(Number.isFinite(pageRaw) ? pageRaw : 1, 1);
    const offset = (page - 1) * limit;
    const uid = req.user.id;

    let extraWhere = '';
    const extraParams = [];
    if (req.query.dateFrom) {
      extraWhere += ' AND COALESCE(p.finished_at, p.created_at) >= ?';
      extraParams.push(String(req.query.dateFrom));
    }
    if (req.query.dateTo) {
      extraWhere += ' AND COALESCE(p.finished_at, p.created_at) < DATE_ADD(?, INTERVAL 1 DAY)';
      extraParams.push(String(req.query.dateTo));
    }
    const rivalQ = (req.query.rival || '').trim();
    if (rivalQ) {
      const like = `%${rivalQ.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
      extraWhere += ' AND (u1.username LIKE ? OR u2.username LIKE ?)';
      extraParams.push(like, like);
    }
    const resultFilter = String(req.query.result || '').toLowerCase();
    if (resultFilter === 'won') {
      extraWhere += ' AND p.winner_id = ?';
      extraParams.push(uid);
    } else if (resultFilter === 'lost') {
      extraWhere += ' AND p.winner_id IS NOT NULL AND p.winner_id <> ?';
      extraParams.push(uid);
    } else if (resultFilter === 'unknown' || resultFilter === 'draw') {
      extraWhere += ' AND p.winner_id IS NULL';
    }

    const modeFilter = String(req.query.mode || '').toLowerCase();
    let modeHaving = '';
    if (modeFilter === 'tournament') {
      modeHaving = ` AND EXISTS (
        SELECT 1 FROM tournament_matches tm0
        WHERE (tm0.partida_id = p.id OR tm0.room_id = p.room_id) AND tm0.tournament_id IS NOT NULL
      )`;
    } else if (modeFilter === 'battle') {
      modeHaving = ` AND p.challenge_id IS NOT NULL
        AND NOT (IFNULL(c.source,'') = 'friend_challenge' OR IFNULL(c.invite_type,'') = 'friend_duel')`;
    } else if (modeFilter === 'competitive_friend') {
      modeHaving = ` AND p.challenge_id IS NOT NULL
        AND (IFNULL(c.source,'') = 'friend_challenge' OR IFNULL(c.invite_type,'') = 'friend_duel')
        AND IFNULL(c.amount,0) > 0`;
    } else if (modeFilter === 'classic_friend') {
      modeHaving = ` AND p.challenge_id IS NOT NULL
        AND (IFNULL(c.source,'') = 'friend_challenge' OR IFNULL(c.invite_type,'') = 'friend_duel')
        AND IFNULL(c.amount,0) <= 0`;
    }

    const cntRows = await query(
      `SELECT COUNT(*) AS cnt FROM partidas p
       JOIN usuarios u1 ON u1.id = p.player1_id
       JOIN usuarios u2 ON u2.id = p.player2_id
       LEFT JOIN challenges c ON c.id = p.challenge_id
       WHERE (p.player1_id = ? OR p.player2_id = ?) AND p.state = 'finished'
         ${extraWhere}${modeHaving}`,
      [uid, uid, ...extraParams]
    );
    const total = Number(cntRows[0]?.cnt ?? 0);

    // LIMIT/OFFSET: no usar ? aquí — MySQL 8.0.22+ con mysql2 puede fallar con
    // "Incorrect arguments to mysqld_stmt_execute" al enlazar LIMIT como DOUBLE.
    const limInt = Math.floor(limit);
    const offInt = Math.floor(offset);

    const rows = await query(
      `SELECT p.id AS partida_id, p.room_id, p.player1_id, p.player2_id,
              p.score_p1, p.score_p2, p.state, p.status, p.winner_id,
              p.challenge_id, p.created_at, p.started_at, p.finished_at,
              u1.username AS p1_username, u1.avatar AS p1_avatar,
              u2.username AS p2_username, u2.avatar AS p2_avatar,
              c.amount AS challenge_amount, c.status AS challenge_status,
              c.source AS challenge_source, c.invite_type, c.game_config AS challenge_game_config,
              c.prize_amount, c.commission_amount,
              (SELECT tm.tournament_id FROM tournament_matches tm
                 WHERE (tm.partida_id = p.id OR tm.room_id = p.room_id) AND tm.tournament_id IS NOT NULL
                 ORDER BY tm.id DESC LIMIT 1) AS tournament_id,
              (SELECT tm.round_number FROM tournament_matches tm
                 WHERE (tm.partida_id = p.id OR tm.room_id = p.room_id) AND tm.tournament_id IS NOT NULL
                 ORDER BY tm.id DESC LIMIT 1) AS tournament_round,
              (SELECT t.name FROM tournament_matches tm
                 JOIN tournaments t ON t.id = tm.tournament_id
                 WHERE (tm.partida_id = p.id OR tm.room_id = p.room_id) AND tm.tournament_id IS NOT NULL
                 ORDER BY tm.id DESC LIMIT 1) AS tournament_name
       FROM partidas p
       JOIN usuarios u1 ON u1.id = p.player1_id
       JOIN usuarios u2 ON u2.id = p.player2_id
       LEFT JOIN challenges c ON c.id = p.challenge_id
       WHERE (p.player1_id = ? OR p.player2_id = ?)
         AND p.state = 'finished'
         ${extraWhere}${modeHaving}
       ORDER BY COALESCE(p.finished_at, p.created_at) DESC
       LIMIT ${limInt} OFFSET ${offInt}`,
      [uid, uid, ...extraParams]
    );

    const challengeIds = [...new Set((rows || []).map((r) => r.challenge_id).filter(Boolean))];
    let txRows = [];
    if (challengeIds.length) {
      const ph = challengeIds.map(() => '?').join(',');
      txRows = await query(
        `SELECT reference, type, COALESCE(SUM(amount), 0) AS total
         FROM transactions
         WHERE user_id = ? AND status = 'completed'
           AND type IN ('bet_win', 'bet_loss', 'bet_refund')
           AND reference IN (${ph})
         GROUP BY reference, type`,
        [uid, ...challengeIds]
      );
    }
    const txMap = buildBetTxMap(txRows);

    const parseCfg = (raw) => {
      if (!raw) return {};
      if (typeof raw === 'object') return raw;
      try {
        return JSON.parse(raw);
      } catch {
        return {};
      }
    };

    const matches = (rows || []).map((row) => {
      const p1 = Number(row.player1_id);
      const isP1 = p1 === Number(uid);
      const oppId = isP1 ? row.player2_id : row.player1_id;
      const oppUsername = isP1 ? row.p2_username : row.p1_username;
      const oppAvatar = isP1 ? row.p2_avatar : row.p1_avatar;
      const sMe = isP1 ? Number(row.score_p1 ?? 0) : Number(row.score_p2 ?? 0);
      const sOp = isP1 ? Number(row.score_p2 ?? 0) : Number(row.score_p1 ?? 0);
      const w = row.winner_id != null ? Number(row.winner_id) : null;
      let result = 'unknown';
      if (w === Number(uid)) result = 'won';
      else if (w != null) result = 'lost';
      else result = 'unknown';

      const cfg = parseCfg(row.challenge_game_config);
      let mode = 'unknown';
      let mode_label = 'Partida';
      if (row.tournament_id) {
        mode = 'tournament';
        mode_label = 'Torneo';
      } else if (row.challenge_id) {
        const src = row.challenge_source || '';
        const inv = row.invite_type || '';
        const amt = parseFloat(row.challenge_amount) || 0;
        if (src === 'friend_challenge' || inv === 'friend_duel') {
          if (amt > 0) {
            mode = 'competitive_friend';
            mode_label = 'Competitiva';
          } else {
            mode = 'classic_friend';
            mode_label = 'Amistosa';
          }
        } else {
          mode = 'battle';
          mode_label = amt > 0 ? 'Batalla competitiva' : 'Batalla';
        }
      } else if (cfg && (cfg.modo === 'ranked' || cfg.modo === 'apuesta')) {
        mode = 'ranked';
        mode_label = 'Ranking';
      } else if (cfg && cfg.modo === 'casual') {
        mode = 'casual';
        mode_label = 'Casual';
      }

      const creditMeta = row.challenge_id
        ? resolveMatchCredits({ row, result, txMap })
        : {
            credits_delta: null,
            has_credit_movement: false,
            stake_amount: null,
            prize_amount: null,
          };

      return {
        partida_id: row.partida_id,
        challenge_id: row.challenge_id || null,
        room_id: row.room_id,
        created_at: row.created_at,
        started_at: row.started_at,
        finished_at: row.finished_at,
        state: row.state,
        status: row.status,
        winner_id: row.winner_id,
        opponent: { id: oppId, username: oppUsername, avatar: oppAvatar },
        score_me: sMe,
        score_opponent: sOp,
        result,
        puntos_maximos: cfg.puntosMaximos ?? null,
        flor_habilitada: cfg.florHabilitada ?? null,
        mode,
        mode_label,
        challenge: row.challenge_id
          ? {
              id: row.challenge_id,
              amount: row.challenge_amount,
              prize_amount: row.prize_amount,
              status: row.challenge_status,
            }
          : null,
        tournament:
          row.tournament_id
            ? {
                id: row.tournament_id,
                name: row.tournament_name,
                round: row.tournament_round,
              }
            : null,
        credits_delta: creditMeta.credits_delta,
        has_credit_movement: creditMeta.has_credit_movement,
        credits_label: null,
        stake_amount: creditMeta.stake_amount,
        prize_amount: creditMeta.prize_amount,
        elo_delta: null,
        finish_reason: null,
      };
    });

    return res.json({
      matches,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err) {
    logger.error('Match history failed', {
      userId: req.user?.id,
      error: err.message,
    });
    return res.status(500).json({ error: 'Server error' });
  }
}

router.get('/me/game-history', authMiddleware, matchHistoryHandler);
router.get('/me/matches', authMiddleware, matchHistoryHandler);

module.exports = router;
module.exports.matchHistoryHandler = matchHistoryHandler;
