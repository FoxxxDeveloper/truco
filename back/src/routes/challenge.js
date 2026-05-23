/**
 * Challenge (Reto) routes
 *
 * POST   /api/challenges/friend/classic — reto amistoso a un amigo (sin apuesta)
 * GET    /api/challenges/friend/pending  — retos entrantes pendientes
 * POST   /api/challenges                 — reto con apuesta (público o duelo amigo + isPrivate)
 * GET    /api/challenges                 — listar retos públicos abiertos
 * GET    /api/challenges/mine            — creados por el usuario
 * POST   /api/challenges/:id/reject      — rechazar (invitado)
 * POST   /api/challenges/:id/accept      — aceptar
 * DELETE /api/challenges/:id             — cancelar (solo creador)
 */
const express              = require('express');
const ChallengeService     = require('../services/challengeService');
const authMiddleware         = require('../middleware/auth');
const logger                 = require('../config/logger');
const { query }              = require('../config/database');
const Friend                 = require('../models/Friend');
const NotificationService    = require('../services/notificationService');

const { assertPlayerParticipationAllowed } = require('../utils/adminGuard');

const router = express.Router();
router.use(authMiddleware);

router.use((req, res, next) => {
  if (req.method === 'POST') {
    try {
      assertPlayerParticipationAllowed(req.user);
    } catch (err) {
      return res.status(403).json({ error: err.message });
    }
  }
  next();
});

function userErr(err) {
  const m = (err.message || '').toLowerCase();
  return [
    'insufficient', 'challenge not found', 'challenge is', 'challenge has expired',
    'cannot accept', 'specific player', 'only the creator', 'cannot cancel',
    'no podés', 'solo podés', 'necesitás verificar', 'verificación', 'mayor de edad',
    'este reto', 'inválid', 'invalid', 'monto mínimo', 'destinatario',
    'partida activa', 'amigos',
  ].some((k) => m.includes(k));
}

function parseGameConfig(body) {
  const { gameConfig = {} } = body;
  return {
    puntosMaximos: Number(gameConfig.puntosMaximos) === 15 ? 15 : 30,
    florHabilitada: !!gameConfig.florHabilitada,
    turnTimeoutSecs: gameConfig.turnTimeoutSecs,
    reconnectGraceSecs: gameConfig.reconnectGraceSecs,
  };
}

async function pushFriendChallengeNotify(challengeId, targetUserId, meta) {
  const payload = { challengeId, ...meta };
  NotificationService.emitToUser(targetUserId, 'friend_challenge:received', payload);
  try {
    await NotificationService.create({
      userId: targetUserId,
      type:   'friend_challenge',
      title:  `${meta.creatorUsername} te retó`,
      body:   meta.kind === 'classic'
        ? 'Partida amistosa'
        : `Reto competitivo — ${Number(meta.amount || 0).toLocaleString('es-AR')} cr`,
      metadata: payload,
    });
  } catch (e) {
    logger.warn('friend challenge notification: ' + e.message);
  }
}

router.post('/friend/classic', async (req, res) => {
  try {
    const { challengedId, puntosMaximos, florHabilitada } = req.body || {};
    const tid = parseInt(challengedId, 10);
    if (!Number.isFinite(tid) || tid <= 0) {
      return res.status(400).json({ error: 'Destinatario inválido' });
    }
    const result = await ChallengeService.createClassicFriendChallenge({
      creatorId:    req.user.id,
      challengedId: tid,
      gameConfig:   { puntosMaximos, florHabilitada },
    });
    await pushFriendChallengeNotify(result.challengeId, tid, {
      creatorId: req.user.id,
      creatorUsername: req.user.username,
      kind: 'classic',
      amount: 0,
      puntosMaximos: Number(puntosMaximos) === 15 ? 15 : 30,
      florHabilitada: !!florHabilitada,
      expiresAt: result.expiresAt,
    });
    return res.status(201).json(result);
  } catch (err) {
    if (userErr(err)) return res.status(400).json({ error: err.message });
    logger.error('friend classic challenge: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.get('/friend/pending', async (req, res) => {
  try {
    const rows = await ChallengeService.listPendingFriendForUser(req.user.id);
    return res.json({ challenges: rows });
  } catch (err) {
    logger.error('friend pending challenges: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.get('/friend/conversation/:peerId', async (req, res) => {
  try {
    const peerId = parseInt(req.params.peerId, 10);
    if (!Number.isFinite(peerId) || peerId <= 0) {
      return res.status(400).json({ error: 'Usuario inválido' });
    }
    const ok = await Friend.areFriends(req.user.id, peerId);
    if (!ok) return res.status(403).json({ error: 'Solo podés ver retos con amigos' });
    const rows = await ChallengeService.listFriendChallengesBetweenUsers(req.user.id, peerId);
    return res.json({ challenges: rows });
  } catch (err) {
    logger.error('friend conversation challenges: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { amount, isPrivate = false, opponentId = null, gameConfig = {} } = req.body;

    if (!amount) return res.status(400).json({ error: 'amount is required' });
    const parsedAmount = parseFloat(amount);
    if (!isFinite(parsedAmount) || parsedAmount < 2500) {
      return res.status(400).json({ error: 'El monto mínimo para apostar es 2500 créditos' });
    }

    if (opponentId && parseInt(opponentId) === req.user.id) {
      return res.status(400).json({ error: 'Cannot challenge yourself' });
    }

    const friendDuel = !!isPrivate && !!opponentId;
    if (friendDuel) {
      const ok = await Friend.areFriends(req.user.id, parseInt(opponentId, 10));
      if (!ok) return res.status(403).json({ error: 'Solo podés retar a amigos' });
    }

    const gc = parseGameConfig(req.body);
    const result = await ChallengeService.createChallenge({
      creatorId:  req.user.id,
      amount,
      isPrivate:  !!isPrivate,
      opponentId: opponentId ? parseInt(opponentId, 10) : null,
      gameConfig: gc,
      friendDuel,
    });

    if (friendDuel && opponentId) {
      await pushFriendChallengeNotify(result.challengeId, parseInt(opponentId, 10), {
        creatorId: req.user.id,
        creatorUsername: req.user.username,
        kind: 'competitive',
        amount: result.amount,
        puntosMaximos: gc.puntosMaximos,
        florHabilitada: gc.florHabilitada,
        expiresAt: result.expiresAt,
      });
    }

    return res.status(201).json(result);
  } catch (err) {
    if (err.message.startsWith('Insufficient')) {
      return res.status(400).json({ error: err.message });
    }
    if (userErr(err)) return res.status(400).json({ error: err.message });
    logger.error('create challenge: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

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

router.post('/:id/reject', async (req, res) => {
  try {
    await ChallengeService.rejectChallenge(req.params.id, req.user.id);
    return res.json({ ok: true });
  } catch (err) {
    if (userErr(err)) return res.status(400).json({ error: err.message });
    logger.error('reject challenge: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/accept', async (req, res) => {
  try {
    const result = await ChallengeService.acceptChallenge({
      challengeId: req.params.id,
      opponentId:  req.user.id,
    });
    return res.json({
      ...result,
      challengeId: req.params.id,
      battleId:    result.battleId || req.params.id,
    });
  } catch (err) {
    const clientErrors = ['Challenge not found', 'Challenge is', 'Challenge has expired', 'Cannot accept', 'specific player', 'Insufficient', 'Este reto', 'No podés', 'Necesitás verificar', 'verificación', 'mayor de edad', 'partida activa'];
    if (clientErrors.some((e) => err.message.startsWith(e) || err.message.includes(e))) {
      return res.status(400).json({ error: err.message });
    }
    logger.error('accept challenge: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

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
