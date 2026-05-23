/**

 * Partida "activa" = el usuario sigue en juego (no finalizada en DB).

 * Fuente única para retos, batallas, matchmaking y /me/active-games.

 */

const { query } = require('../config/database');

const logger = require('../config/logger');



/** finish_reason que nunca deben bloquear retos/batallas aunque status siga mal. */

const TERMINAL_FINISH_REASONS = [

  'both_disconnected',

  'afk_abandon',

  'stale_active_cleanup',

  'abandon_disconnect',

  'abandon_disconnect_stale',

  'normalized_inconsistent',

  'normalized_admin_resolution',

  'requires_admin_resolution_cleanup',

  'manual_admin_cancel',

  'cancelled',

  'completed',

  'admin_resolve_abandon',

  'admin_resolve_paused',

];



/** SQL fragment (leading AND …) para partidas jugables. */

const ACTIVE_PARTIDA_SQL = `

  AND winner_id IS NULL

  AND finished_at IS NULL

  AND state IN ('waiting', 'playing')

  AND status IN ('active', 'paused')

  AND IFNULL(requires_admin_resolution, 0) = 0

  AND (

    finish_reason IS NULL

    OR finish_reason NOT IN (${TERMINAL_FINISH_REASONS.map(() => '?').join(', ')})

  )

  AND NOT (

    status = 'paused'

    AND (

      (p1_reconnect_deadline_at IS NOT NULL AND p1_reconnect_deadline_at < NOW())

      OR (p2_reconnect_deadline_at IS NOT NULL AND p2_reconnect_deadline_at < NOW())

    )

  )

`;



const ACTIVE_PARTIDA_PARAMS = [...TERMINAL_FINISH_REASONS];



async function getActiveGameForUser(userId) {

  const uid = parseInt(userId, 10);

  if (!Number.isFinite(uid) || uid <= 0) return null;

  const rows = await query(

    `SELECT id, room_id, state, status, winner_id, finished_at, challenge_id,

            finish_reason, requires_admin_resolution,

            p1_reconnect_deadline_at, p2_reconnect_deadline_at,

            p1_disconnected_at, p2_disconnected_at,

            player1_id, player2_id, created_at, started_at

     FROM partidas

     WHERE (player1_id = ? OR player2_id = ?)

       ${ACTIVE_PARTIDA_SQL}

     ORDER BY created_at DESC

     LIMIT 1`,

    [uid, uid, ...ACTIVE_PARTIDA_PARAMS]

  );

  return rows[0] || null;

}



async function userHasActiveGame(userId) {

  const row = await getActiveGameForUser(userId);

  return Boolean(row);

}



function logActiveGameBlock(userId, active) {

  logger.warn('active game check blocked user', {

    userId,

    partidaId: active?.id,

    roomId: active?.room_id,

    state: active?.state,

    status: active?.status,

    winner_id: active?.winner_id,

    finished_at: active?.finished_at,

    finish_reason: active?.finish_reason,

    requires_admin_resolution: active?.requires_admin_resolution,

    p1_disconnected_at: active?.p1_disconnected_at,

    p2_disconnected_at: active?.p2_disconnected_at,

    p1_reconnect_deadline_at: active?.p1_reconnect_deadline_at,

    p2_reconnect_deadline_at: active?.p2_reconnect_deadline_at,

    created_at: active?.created_at,

    started_at: active?.started_at,

    player1_id: active?.player1_id,

    player2_id: active?.player2_id,

  });

}



/**

 * Diagnóstico: por qué una fila cuenta o no como activa (admin / debug).

 */

function explainPartidaRow(row, userId) {

  if (!row) {

    return { blocks: false, reasons: ['no_row'] };

  }

  const reasons = [];

  const uid = Number(userId);

  if (Number(row.player1_id) !== uid && Number(row.player2_id) !== uid) {

    reasons.push('user_not_in_partida');

  }

  if (row.winner_id != null) reasons.push('has_winner_id');

  if (row.finished_at != null) reasons.push('has_finished_at');

  if (!['waiting', 'playing'].includes(row.state)) reasons.push(`state_${row.state}`);

  if (!['active', 'paused'].includes(row.status)) reasons.push(`status_${row.status}`);

  if (Number(row.requires_admin_resolution) === 1) reasons.push('requires_admin_resolution');

  if (row.finish_reason && TERMINAL_FINISH_REASONS.includes(row.finish_reason)) {

    reasons.push(`terminal_finish_reason_${row.finish_reason}`);

  }

  if (row.status === 'paused') {

    const p1exp =

      row.p1_reconnect_deadline_at && new Date(row.p1_reconnect_deadline_at) < new Date();

    const p2exp =

      row.p2_reconnect_deadline_at && new Date(row.p2_reconnect_deadline_at) < new Date();

    if (p1exp || p2exp) reasons.push('paused_reconnect_deadline_expired');

  }

  const blocks = reasons.length === 0;

  return { blocks, reasons: blocks ? ['matches_ACTIVE_PARTIDA_SQL'] : reasons };

}



async function explainActiveGameForUser(userId) {

  const uid = parseInt(userId, 10);

  if (!Number.isFinite(uid) || uid <= 0) {

    return { userId, blocking: null, recent: [], rawActivePaused: [] };

  }



  const recent = await query(

    `SELECT id, room_id, player1_id, player2_id, winner_id, state, status,

            finished_at, finish_reason, requires_admin_resolution,

            p1_reconnect_deadline_at, p2_reconnect_deadline_at,

            p1_disconnected_at, p2_disconnected_at,

            created_at, started_at

     FROM partidas

     WHERE (player1_id = ? OR player2_id = ?)

     ORDER BY created_at DESC

     LIMIT 50`,

    [uid, uid]

  );



  const rawActivePaused = await query(

    `SELECT id, room_id, player1_id, player2_id, winner_id, state, status,

            finished_at, finish_reason, requires_admin_resolution,

            p1_reconnect_deadline_at, p2_reconnect_deadline_at,

            created_at, started_at

     FROM partidas

     WHERE (player1_id = ? OR player2_id = ?)

       AND status IN ('active', 'paused')

     ORDER BY created_at DESC`,

    [uid, uid]

  );



  const blocking = await getActiveGameForUser(uid);

  const analyses = rawActivePaused.map((row) => ({

    partidaId: row.id,

    roomId: row.room_id,

    ...explainPartidaRow(row, uid),

  }));



  return {

    userId: uid,

    blocking,

    blockingExplain: blocking ? explainPartidaRow(blocking, uid) : null,

    recent,

    rawActivePaused,

    analyses,

    recommendation: blocking

      ? 'Ejecutar POST /api/admin/games/cleanup-stale o esperar cron (60s). Si persiste, revisar partidaId en blocking.'

      : 'Sin bloqueo por getActiveGameForUser.',

  };

}



module.exports = {

  TERMINAL_FINISH_REASONS,

  ACTIVE_PARTIDA_SQL,

  ACTIVE_PARTIDA_PARAMS,

  getActiveGameForUser,

  userHasActiveGame,

  logActiveGameBlock,

  explainPartidaRow,

  explainActiveGameForUser,

};


