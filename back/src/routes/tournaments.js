/**
 * Tournament routes — /api/tournaments
 *
 * Rutas de usuario (todas requieren JWT válido):
 *   GET    /api/tournaments                              → listar torneos
 *   GET    /api/tournaments/:id                          → detalle
 *   GET    /api/tournaments/:id/bracket                  → bracket
 *   POST   /api/tournaments/:id/register                 → inscribirse
 *   DELETE /api/tournaments/:id/register                 → cancelar inscripción
 *   POST   /api/tournaments/:id/checkin                  → hacer check-in
 *   POST   /api/tournaments/:id/matches/:matchId/ready   → marcar listo
 *
 * Las rutas de administración (admin) se registran en routes/admin.js
 * siguiendo el patrón del repo, bajo /api/admin/tournaments/...
 */
'use strict';

const express             = require('express');
const rateLimit           = require('express-rate-limit');
const authMiddleware      = require('../middleware/auth');
const TournamentService   = require('../services/tournamentService');
const logger              = require('../config/logger');

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authMiddleware);

// Rate limit moderado para acciones de torneo (registro, check-in, ready)
const tournamentActionLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Demasiadas solicitudes, esperá un momento' },
});

// ── Error handler centralizado ────────────────────────────────────────────────

// Mensajes de error que deben retornar 400 (errores de usuario, no de servidor)
const USER_ERRORS = [
  'Torneo no encontrado',
  'El torneo no está abierto para inscripción',
  'Ya estás inscripto en este torneo',
  'No estás inscripto en este torneo',
  'El check-in no está abierto',
  'El bracket ya fue generado',
  'No hay jugadores suficientes para generar el bracket',
  'No sos jugador de este cruce',
  'El cruce no está listo',
  'El cruce no existe en este torneo',
  'Ganador inválido',
  'No se puede modificar un torneo iniciado',
  'Estado inválido',
  'Nombre obligatorio',
  'max_players debe estar',
  'puntos_maximos debe ser',
  'turn_seconds debe estar',
  'reconnect_seconds debe estar',
  'Formato inválido',
  'Fase inválida',
  'Nada que actualizar',
  'No podés retirarte de un torneo que ya comenzó',
  'No podés hacer check-in con tu estado actual',
  'Este cruce ya fue finalizado',
  'Este cruce ya tiene un ganador',
  'No se puede pasar de',
  'bracket generado',
  'Ningún jugador está listo',
  'direct_qualify',
];

function handleRouteError(res, err, context) {
  const isUserError = USER_ERRORS.some(msg => err.message.includes(msg));
  if (isUserError) {
    return res.status(400).json({ error: err.message });
  }
  logger.error(`tournaments ${context}: ${err.message}`);
  return res.status(500).json({ error: 'Error interno' });
}

// ── GET /api/tournaments ──────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const tournaments = await TournamentService.listTournaments(req.user.id);
    return res.json({ tournaments });
  } catch (err) {
    return handleRouteError(res, err, 'list');
  }
});

// ── GET /api/tournaments/:id ──────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const tournament = await TournamentService.getTournament(
      Number(req.params.id),
      req.user.id
    );
    return res.json({ tournament });
  } catch (err) {
    if (err.message === 'Torneo no encontrado') return res.status(404).json({ error: err.message });
    return handleRouteError(res, err, 'get');
  }
});

// ── GET /api/tournaments/:id/bracket ─────────────────────────────────────────
router.get('/:id/bracket', async (req, res) => {
  try {
    const result = await TournamentService.getBracket(Number(req.params.id));
    return res.json({ bracket: result });
  } catch (err) {
    if (err.message === 'Torneo no encontrado') return res.status(404).json({ error: err.message });
    return handleRouteError(res, err, 'bracket');
  }
});

// ── POST /api/tournaments/:id/register ───────────────────────────────────────
router.post('/:id/register', tournamentActionLimit, async (req, res) => {
  try {
    const result = await TournamentService.register(
      Number(req.params.id),
      req.user.id
    );
    return res.status(201).json({ ok: true, registration: result });
  } catch (err) {
    return handleRouteError(res, err, 'register');
  }
});

// ── DELETE /api/tournaments/:id/register ─────────────────────────────────────
router.delete('/:id/register', tournamentActionLimit, async (req, res) => {
  try {
    const result = await TournamentService.unregister(
      Number(req.params.id),
      req.user.id
    );
    return res.json({ ok: true, registration: result });
  } catch (err) {
    return handleRouteError(res, err, 'unregister');
  }
});

// ── POST /api/tournaments/:id/checkin ────────────────────────────────────────
router.post('/:id/checkin', tournamentActionLimit, async (req, res) => {
  try {
    const result = await TournamentService.checkin(
      Number(req.params.id),
      req.user.id
    );
    return res.json({ ok: true, registration: result });
  } catch (err) {
    return handleRouteError(res, err, 'checkin');
  }
});

// ── POST /api/tournaments/:id/matches/:matchId/ready ─────────────────────────
// Jugador presiona "Listo" en su cruce.
// Si result.bothReady === true → frontend llama al socket para iniciar partida (Etapa 4).
router.post('/:id/matches/:matchId/ready', tournamentActionLimit, async (req, res) => {
  try {
    const result = await TournamentService.setPlayerReady(
      Number(req.params.id),
      Number(req.params.matchId),
      req.user.id
    );
    return res.json({ ok: true, result });
  } catch (err) {
    return handleRouteError(res, err, 'ready');
  }
});

module.exports = router;
module.exports.handleRouteError = handleRouteError;
module.exports.USER_ERRORS      = USER_ERRORS;
