/**
 * Limpieza idempotente de partidas pausadas/colgadas por desconexión y reinicio del servidor.
 * No depende solo de timers en memoria: usa deadlines persistidos en `partidas`.
 */
const { query } = require('../config/database');
const logger = require('../config/logger');
const Game = require('../models/Game');
const BattleService = require('./battleService');
const gameSession = require('./gameSession');

let lifecycleHooks = {
  /** (io, roomId, game) => Promise<void> */
  finishBothDisconnected: null,
  /** (io, roomId, game, abandonedUserId) => Promise<void> */
  finishAbandonWin: null,
};

function setGameLifecycleHooks(hooks = {}) {
  lifecycleHooks = { ...lifecycleHooks, ...hooks };
}

async function normalizeInconsistentFinishedPartidas() {
  const r = await query(
    `UPDATE partidas
     SET status = 'finished',
         state = 'finished',
         finished_at = COALESCE(finished_at, NOW()),
         requires_admin_resolution = 0,
         finish_reason = COALESCE(finish_reason, 'normalized_inconsistent')
     WHERE (winner_id IS NOT NULL OR finished_at IS NOT NULL OR state = 'finished')
       AND status IN ('active', 'paused')`
  );
  const n = typeof r?.affectedRows === 'number' ? r.affectedRows : 0;
  return n;
}

/**
 * Partidas con ambos deadlines vencidos → sin ganador (torneo: requiere admin).
 */
async function resolveBothDisconnectedRows(io) {
  const rows = await query(
    `SELECT room_id, player1_id, player2_id
     FROM partidas
     WHERE winner_id IS NULL
       AND (finished_at IS NULL OR finished_at = '0000-00-00 00:00:00')
       AND status IN ('active', 'paused')
       AND state IN ('waiting', 'playing')
       AND p1_reconnect_deadline_at IS NOT NULL
       AND p2_reconnect_deadline_at IS NOT NULL
       AND p1_reconnect_deadline_at < NOW()
       AND p2_reconnect_deadline_at < NOW()`
  );
  let n = 0;
  for (const p of rows) {
    try {
      const roomId = p.room_id;
      const game = await gameSession.getGame(roomId);
      const live = game && typeof game.playCard === 'function';
      if (live && lifecycleHooks.finishBothDisconnected) {
        await lifecycleHooks.finishBothDisconnected(io, roomId, game);
      } else {
        const tm = await query('SELECT id FROM tournament_matches WHERE room_id = ? LIMIT 1', [roomId]);
        const requiresAdmin = tm.length > 0;
        await BattleService.cancelChallengeForRoomNoWinner(roomId, 'both_disconnected').catch(() => {});
        await Game.closeWithoutWinner({
          roomId,
          status: 'cancelled',
          finishReason: 'both_disconnected',
          requiresAdminResolution: requiresAdmin,
        });
        await gameSession.deleteGame(roomId).catch(() => {});
        if (io) {
          io.to(roomId).emit('game:over', {
            winner: null,
            reason: 'both_disconnected',
            requiresAdminResolution: requiresAdmin,
          });
        }
        logger.warn('game cancelled both disconnected', {
          roomId,
          reason: 'both_disconnected',
          requiresAdminResolution: requiresAdmin,
        });
      }
      n += 1;
    } catch (e) {
      logger.error(`staleGameCleanup both_dc ${p.room_id}: ${e.message}`);
    }
  }
  return n;
}

/**
 * Un solo jugador agotó reconexión; el rival gana (DB o sesión viva).
 */
async function resolveSingleAbandonRows(io) {
  const rows = await query(
    `SELECT room_id, player1_id, player2_id, score_p1, score_p2,
            p1_reconnect_deadline_at, p2_reconnect_deadline_at
     FROM partidas
     WHERE winner_id IS NULL
       AND (finished_at IS NULL OR finished_at = '0000-00-00 00:00:00')
       AND status IN ('active', 'paused')
       AND state IN ('waiting', 'playing')
       AND (
         (p1_reconnect_deadline_at IS NOT NULL AND p1_reconnect_deadline_at < NOW()
          AND p2_reconnect_deadline_at IS NULL)
         OR
         (p2_reconnect_deadline_at IS NOT NULL AND p2_reconnect_deadline_at < NOW()
          AND p1_reconnect_deadline_at IS NULL)
       )`
  );

  let n = 0;
  for (const p of rows) {
    try {
      const roomId = p.room_id;
      const p1 = Number(p.player1_id);
      const p2 = Number(p.player2_id);
      let abandonedId = null;
      let winnerId = null;
      if (p.p1_reconnect_deadline_at && !p.p2_reconnect_deadline_at) {
        abandonedId = p1;
        winnerId = p2;
      } else if (p.p2_reconnect_deadline_at && !p.p1_reconnect_deadline_at) {
        abandonedId = p2;
        winnerId = p1;
      } else {
        continue;
      }

      const game = await gameSession.getGame(roomId);
      const live = game && typeof game.playCard === 'function';
      if (live && lifecycleHooks.finishAbandonWin) {
        await lifecycleHooks.finishAbandonWin(io, roomId, game, abandonedId);
      } else {
        await BattleService.settle({ roomId, winnerId }).catch((e) => {
          logger.warn(`stale settle ${roomId}: ${e.message}`);
        });
        await Game.finish({
          roomId,
          winnerId,
          scoreP1: p.score_p1,
          scoreP2: p.score_p2,
          finishReason: 'abandon_disconnect_stale',
        });
        await gameSession.deleteGame(roomId).catch(() => {});
        if (io) {
          io.to(roomId).emit('game:over', {
            winner: winnerId,
            reason: 'abandon',
            abandonedBy: abandonedId,
          });
        }
        logger.warn('game disconnect timeout resolved', {
          roomId,
          disconnectedUserId: abandonedId,
          winnerId,
          reason: 'abandon_stale',
        });
      }
      n += 1;
    } catch (e) {
      logger.error(`staleGameCleanup abandon ${p.room_id}: ${e.message}`);
    }
  }
  return n;
}

/**
 * Partidas muy viejas sin deadlines (pre-migración / datos rotos).
 * Requiere umbral alto por defecto; usar admin con `orphanStaleMinutes` bajo solo en local/test.
 */
async function cancelAncientOrphanPartidas({ staleMinutes = 43200 } = {}) {
  const rows = await query(
    `SELECT room_id
     FROM partidas
     WHERE winner_id IS NULL
       AND (finished_at IS NULL OR finished_at = '0000-00-00 00:00:00')
       AND status IN ('active', 'paused')
       AND state IN ('waiting', 'playing')
       AND created_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
       AND p1_reconnect_deadline_at IS NULL
       AND p2_reconnect_deadline_at IS NULL`,
    [staleMinutes]
  );

  let n = 0;
  for (const { room_id: roomId } of rows) {
    try {
      await BattleService.cancelChallengeForRoomNoWinner(roomId, 'stale_active_cleanup').catch(() => {});
      const r = await query(
        `UPDATE partidas
         SET state = 'finished',
             status = 'cancelled',
             winner_id = NULL,
             finished_at = NOW(),
             finish_reason = 'stale_active_cleanup',
             requires_admin_resolution = 0,
             p1_disconnected_at = NULL,
             p2_disconnected_at = NULL,
             p1_reconnect_deadline_at = NULL,
             p2_reconnect_deadline_at = NULL
         WHERE room_id = ?
           AND winner_id IS NULL
           AND (finished_at IS NULL OR finished_at = '0000-00-00 00:00:00')`,
        [roomId]
      );
      n += typeof r?.affectedRows === 'number' ? r.affectedRows : 0;
      await gameSession.deleteGame(roomId).catch(() => {});
    } catch (e) {
      logger.error(`stale orphan ${roomId}: ${e.message}`);
    }
  }
  return n;
}

async function resolveExpiredDisconnectedGames(io = null) {
  const normalizedFinished = await normalizeInconsistentFinishedPartidas();
  const resolvedBoth = await resolveBothDisconnectedRows(io);
  const resolvedAbandoned = await resolveSingleAbandonRows(io);
  if (normalizedFinished || resolvedBoth || resolvedAbandoned) {
    logger.info('stale games cleanup tick', {
      normalizedFinished,
      resolvedBoth,
      resolvedSingleAbandon: resolvedAbandoned,
    });
  }
  return { normalizedFinished, resolvedBoth, resolvedAbandoned };
}

/**
 * Admin / manual: normaliza + deadlines + opcional huérfanas antiguas (minutos configurables).
 */
async function runAdminCleanupStaleGames(io = null, { orphanStaleMinutes = 43200 } = {}) {
  const normalizedFinished = await normalizeInconsistentFinishedPartidas();
  const resolvedBoth = await resolveBothDisconnectedRows(io);
  const resolvedAbandoned = await resolveSingleAbandonRows(io);
  const cancelledStale = await cancelAncientOrphanPartidas({ staleMinutes: orphanStaleMinutes });
  logger.info('stale games cleanup', {
    normalizedFinished,
    cancelledStale,
    resolvedAbandoned: resolvedAbandoned + resolvedBoth,
  });
  return {
    normalizedFinished,
    cancelledStale,
    resolvedAbandoned: resolvedAbandoned + resolvedBoth,
    resolvedBoth,
    singleAbandon: resolvedAbandoned,
  };
}

module.exports = {
  setGameLifecycleHooks,
  resolveExpiredDisconnectedGames,
  runAdminCleanupStaleGames,
  normalizeInconsistentFinishedPartidas,
};
