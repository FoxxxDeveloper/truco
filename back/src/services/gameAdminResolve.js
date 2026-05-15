/**
 * Finaliza partidas colgadas (p. ej. status paused sin sesión activa) desde el panel admin.
 * No emite eventos socket — solo DB + liquidación batalla/torneo + borra sesión en memoria si existe.
 */
const { query } = require('../config/database');
const Game = require('../models/Game');
const BattleService = require('./battleService');
const TournamentService = require('./tournamentService');
const gameSession = require('./gameSession');
const logger = require('../config/logger');
const { partidaIsFinished, partidaNeedsAdminResolution } = require('../utils/partidaAdminStatus');

async function resolvePausedGameAsAbandon({ roomId, winnerId, adminId, reason }) {
  const rows = await query('SELECT * FROM partidas WHERE room_id = ?', [roomId]);
  if (!rows.length) {
    const err = new Error('Partida no encontrada');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const p = rows[0];

  if (partidaIsFinished(p)) {
    const err = new Error('La partida ya está finalizada');
    err.code = 'ALREADY_FINISHED';
    throw err;
  }

  if (!partidaNeedsAdminResolution(p)) {
    const err = new Error('Esta partida no está en pausa pendiente de resolución');
    err.code = 'NOT_RESOLVABLE';
    throw err;
  }

  const w = Number(winnerId);
  const p1 = Number(p.player1_id);
  const p2 = Number(p.player2_id);
  if (w !== p1 && w !== p2) {
    const err = new Error('El ganador debe ser jugador 1 o jugador 2 de la partida');
    err.code = 'BAD_WINNER';
    throw err;
  }

  await BattleService.settle({ roomId, winnerId }).catch((e) => {
    logger.warn(`resolvePausedGame settle: ${e.message}`);
  });

  const scores = { [p1]: p.score_p1, [p2]: p.score_p2 };
  await TournamentService.finishMatchFromGame(roomId, winnerId, scores).catch((e) => {
    logger.warn(`resolvePausedGame tournament: ${e.message}`);
  });

  await Game.finish({
    roomId,
    winnerId: w,
    scoreP1: p.score_p1,
    scoreP2: p.score_p2,
    finishReason: reason || 'admin_resolve_abandon',
  });

  await gameSession.deleteGame(roomId).catch(() => {});

  logger.info(`Admin ${adminId} resolve-abandon room=${roomId} winner=${w} reason=${reason || 'admin'}`);
  return { ok: true, roomId, winnerId: w, loserId: w === p1 ? p2 : p1 };
}

module.exports = { resolvePausedGameAsAbandon };
