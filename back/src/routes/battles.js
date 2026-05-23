/**
 * Battles routes — /api/battles
 * Battles = Batallas Competitivas (salas con apuesta de créditos)
 *
 * GET    /api/battles              — salas públicas disponibles
 * POST   /api/battles              — crear sala
 * GET    /api/battles/my           — mis salas (creadas o aceptadas)
 * GET    /api/battles/active       — batalla activa del usuario
 * GET    /api/battles/history      — historial paginado
 * GET    /api/battles/:id          — detalle de sala
 * POST   /api/battles/:id/accept   — aceptar sala pública
 * DELETE /api/battles/:id          — cancelar sala propia
 * POST   /api/battles/join/:code   — unirse por código privado
 */
const express      = require('express');
const rateLimit    = require('express-rate-limit');
const BattleService = require('../services/battleService');
const authMiddleware = require('../middleware/auth');
const logger         = require('../config/logger');

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

const battleLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Demasiadas solicitudes, esperá un momento' },
});

// GET /api/battles — salas públicas abiertas
router.get('/', async (req, res) => {
  try {
    const battles = await BattleService.listPublic(req.user.id);
    const formatted = battles.map(b => _formatPublic(b));
    return res.json({ battles: formatted });
  } catch (err) {
    logger.error('battles list: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/battles — crear sala
router.post('/', battleLimit, async (req, res) => {
  try {
    const { amount, visibility = 'public', gameConfig = {} } = req.body;

    if (!amount) return res.status(400).json({ error: 'El monto es obligatorio' });

    const n = parseFloat(amount);
    if (!isFinite(n) || !Number.isInteger(n)) {
      return res.status(400).json({ error: 'El monto debe ser un número entero' });
    }
    if (n < 2500) {
      return res.status(400).json({ error: 'El monto mínimo es 2500 créditos' });
    }
    if (!['public', 'private'].includes(visibility)) {
      return res.status(400).json({ error: 'Visibilidad inválida' });
    }

    const result = await BattleService.create({
      creatorId:  req.user.id,
      amount:     n,
      visibility,
      gameConfig,
    });

    return res.status(201).json(result);
  } catch (err) {
    const userErrors = [
      'mínimo', 'entero', 'No podés', 'Ya tenés', 'Insufficient', 'Wallet not found',
      'verificar', 'verificación', 'pendiente', 'rechazada', 'mayor de edad', 'soporte',
    ];
    if (userErrors.some(e => err.message.toLowerCase().includes(e.toLowerCase()))) {
      return res.status(400).json({ error: err.message });
    }
    logger.error('battles create: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/battles/my
router.get('/my', async (req, res) => {
  try {
    const battles = await BattleService.listMine(req.user.id);
    return res.json({ battles: battles.map(b => _formatMine(b, req.user.id)) });
  } catch (err) {
    logger.error('battles my: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/battles/active
router.get('/active', async (req, res) => {
  try {
    const battle = await BattleService.getActive(req.user.id);
    return res.json({ battle: battle ? _formatMine(battle, req.user.id) : null });
  } catch (err) {
    logger.error('battles active: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/battles/history
router.get('/history', async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;
    const history = await BattleService.getHistory(req.user.id, { limit, offset });
    return res.json({ history: history.map(b => _formatHistory(b, req.user.id)) });
  } catch (err) {
    logger.error('battles history: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/battles/join/:code — sala privada por código
router.post('/join/:code', battleLimit, async (req, res) => {
  try {
    const { code } = req.params;
    if (!code || code.length < 4) return res.status(400).json({ error: 'Código inválido' });

    const result = await BattleService.acceptByCode({
      inviteCode: code,
      opponentId: req.user.id,
    });

    // Trigger game start via socket (emitted by socket handler)
    return res.json({ ...result, battleAccepted: true });
  } catch (err) {
    const userErrors = [
      'no encontrada', 'inválido', 'expiró', 'propia', 'cancelada', 'Insufficient', 'Wallet not found', 'balance',
      'verificar', 'verificación', 'pendiente', 'rechazada', 'mayor de edad', 'soporte',
    ];
    if (userErrors.some(e => err.message.toLowerCase().includes(e.toLowerCase()))) {
      return res.status(400).json({ error: err.message });
    }
    logger.error('battles join code: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/battles/:id
router.get('/:id', async (req, res) => {
  try {
    const battle = await BattleService.getById(req.params.id);
    if (!battle) return res.status(404).json({ error: 'Sala no encontrada' });
    return res.json({ battle: _formatMine(battle, req.user.id) });
  } catch (err) {
    logger.error('battles get: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/battles/:id/accept — aceptar sala pública
router.post('/:id/accept', battleLimit, async (req, res) => {
  try {
    const result = await BattleService.accept({
      battleId:   req.params.id,
      opponentId: req.user.id,
    });
    // roomId returned so frontend can navigate / socket can start game
    return res.json(result);
  } catch (err) {
    const userErrors = [
      'aceptada', 'expiró', 'propia', 'cancelada', 'Insufficient', 'no encontrada',
      'privada', 'estado', 'Sala ya', 'Wallet not found', 'balance',
      'verificar', 'verificación', 'pendiente', 'rechazada', 'mayor de edad', 'soporte',
    ];
    if (userErrors.some(e => err.message.toLowerCase().includes(e.toLowerCase()))) {
      return res.status(400).json({ error: err.message });
    }
    logger.error('battles accept: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/battles/:id — cancelar sala propia
router.delete('/:id', battleLimit, async (req, res) => {
  try {
    await BattleService.cancel(req.params.id, req.user.id);
    return res.json({ ok: true, message: 'Sala cancelada. Tu saldo fue liberado' });
  } catch (err) {
    const userErrors = ['no encontrada', 'creador', 'cancelar', 'estado'];
    if (userErrors.some(e => err.message.toLowerCase().includes(e.toLowerCase()))) {
      return res.status(400).json({ error: err.message });
    }
    logger.error('battles cancel: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ── Formatters (hide commission internals from players) ────────────────────────

function _formatPublic(b) {
  const config = typeof b.game_config === 'string' ? JSON.parse(b.game_config) : (b.game_config || {});
  const amount = parseFloat(b.amount);
  const { prize } = BattleService.calcPrize(amount);
  return {
    id:               b.id,
    amount,
    prize,
    netGain:          parseFloat((prize - amount).toFixed(2)),
    expiresAt:        b.expires_at,
    creatorUsername:  b.creator_username,
    creatorElo:       b.creator_elo,
    config: {
      puntosMaximos:    config.puntosMaximos || 30,
      florHabilitada:   config.florHabilitada || false,
      turnTimeoutSecs:  config.turnTimeoutSecs || 30,
      reconnectGraceSecs: config.reconnectGraceSecs || 60,
    },
  };
}

function _formatMine(b, userId) {
  const config  = typeof b.game_config === 'string' ? JSON.parse(b.game_config) : (b.game_config || {});
  const amount  = parseFloat(b.amount);
  const { prize } = BattleService.calcPrize(amount);
  const iCreated = b.creator_id === userId;
  const rival    = iCreated ? b.opponent_username : b.creator_username;
  return {
    id:          b.id,
    amount,
    prize,
    netGain:     parseFloat((prize - amount).toFixed(2)),
    status:      b.status,
    iCreator:    iCreated,
    rival:       rival || null,
    inviteCode:  b.invite_code || null,
    isPrivate:   !!b.is_private,
    roomId:      b.room_id || null,
    winnerId:    b.winner_id || null,
    iWon:        b.winner_id === userId,
    expiresAt:   b.expires_at,
    acceptedAt:  b.accepted_at,
    finishedAt:  b.finished_at,
    createdAt:   b.created_at,
    config: {
      puntosMaximos:   config.puntosMaximos || 30,
      florHabilitada:  config.florHabilitada || false,
      turnTimeoutSecs: config.turnTimeoutSecs || 30,
      reconnectGraceSecs: config.reconnectGraceSecs || 60,
    },
  };
}

function _formatHistory(b, userId) {
  const formatted = _formatMine(b, userId);
  formatted.hasCreditMovement = false;
  formatted.creditsDelta = null;
  formatted.resultText = null;

  if (b.status !== 'finished') {
    return formatted;
  }

  const amount = formatted.amount;
  const prizeDb = parseFloat(b.prize_amount);
  const prizeFinal =
    Number.isFinite(prizeDb) && prizeDb > 0 ? prizeDb : formatted.prize;

  if (!(amount > 0)) {
    return formatted;
  }

  const netGain = parseFloat((prizeFinal - amount).toFixed(2));

  if (formatted.iWon) {
    if (!(netGain > 1e-6)) return formatted;
    formatted.creditsDelta = netGain;
    formatted.hasCreditMovement = true;
    formatted.resultText = `Ganaste +${netGain.toLocaleString('es-AR')} créditos`;
  } else {
    formatted.creditsDelta = -amount;
    formatted.hasCreditMovement = true;
    formatted.resultText = `Perdiste ${amount.toLocaleString('es-AR')} créditos`;
  }
  return formatted;
}

module.exports = router;
