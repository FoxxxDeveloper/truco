/**
 * Partida "activa" = el usuario sigue en juego (no finalizada en DB).
 * Ignora filas inconsistentes (p. ej. status active pero ya hay ganador o finished_at).
 */
const { query } = require('../config/database');

async function getActiveGameForUser(userId) {
  const uid = parseInt(userId, 10);
  if (!Number.isFinite(uid) || uid <= 0) return null;
  const rows = await query(
    `SELECT id, room_id, state, status, winner_id, finished_at, challenge_id
     FROM partidas
     WHERE (player1_id = ? OR player2_id = ?)
       AND winner_id IS NULL
       AND finished_at IS NULL
       AND state IN ('waiting', 'playing')
       AND state NOT IN ('finished')
       AND status IN ('active', 'paused')
       AND status NOT IN ('finished', 'abandoned', 'cancelled')
       AND IFNULL(requires_admin_resolution, 0) = 0
       AND NOT (
         status = 'paused'
         AND p1_reconnect_deadline_at IS NOT NULL
         AND p2_reconnect_deadline_at IS NOT NULL
         AND p1_reconnect_deadline_at < NOW()
         AND p2_reconnect_deadline_at < NOW()
       )
     ORDER BY created_at DESC
     LIMIT 1`,
    [uid, uid]
  );
  return rows[0] || null;
}

async function userHasActiveGame(userId) {
  const row = await getActiveGameForUser(userId);
  return Boolean(row);
}

module.exports = {
  getActiveGameForUser,
  userHasActiveGame,
};
