/**
 * GameSessionManager
 * Stores active TrucoGame instances in memory (with optional Redis persistence).
 * This is the authoritative source of truth for in-progress games.
 */
const { TrucoGame } = require('../game/TrucoGame');
const redis = require('../config/redis');
const { query } = require('../config/database');
const logger = require('../config/logger');

const SESSION_TTL = 60 * 60 * 2; // 2 hours

// In-memory map of roomId → TrucoGame
const games = new Map();

/**
 * Create a new game session.
 */
async function createGame(roomId, player1Id, player2Id, options = {}) {
  const game = new TrucoGame(roomId, player1Id, player2Id, options);
  games.set(roomId, game);
  await _persist(roomId, game);
  logger.info(`Game created: ${roomId} [${player1Id} vs ${player2Id}]`);
  return game;
}

/**
 * Get a game by roomId. Tries memory first, then Redis.
 */
async function getGame(roomId) {
  if (games.has(roomId)) return games.get(roomId);
  // Try restore from Redis
  return await _restore(roomId);
}

/**
 * Save current state to Redis.
 */
async function saveGame(roomId) {
  const game = games.get(roomId);
  if (!game) return;
  await _persist(roomId, game);
}

/**
 * Remove a game from memory (keep in Redis for reconnection window).
 */
function evictGame(roomId) {
  games.delete(roomId);
}

/**
 * Fully delete a game from both memory and Redis.
 */
async function deleteGame(roomId) {
  games.delete(roomId);
  await redis.del(`game:${roomId}`);
  logger.info(`Game deleted: ${roomId}`);
}

async function _persist(roomId, game) {
  try {
    const snap =
      typeof game.toPersistenceSnapshot === 'function' ? game.toPersistenceSnapshot() : game.toJSON();
    await redis.set(`game:${roomId}`, JSON.stringify(snap), { EX: SESSION_TTL });
  } catch (_) {
    // Redis unavailable — in-memory store is sufficient for single-process
  }
}

/**
 * MySQL dice que la partida ya no es jugable → no rehidratar desde Redis.
 */
async function _partidaAllowsRestore(roomId) {
  try {
    const rows = await query(
      `SELECT status, state, winner_id, finished_at, IFNULL(requires_admin_resolution, 0) AS req_admin
       FROM partidas WHERE room_id = ? LIMIT 1`,
      [roomId]
    );
    if (!rows.length) return true;
    const p = rows[0];
    if (p.winner_id != null || p.finished_at != null) return false;
    if (Number(p.req_admin) === 1) return false;
    if (['finished', 'cancelled', 'abandoned'].includes(p.status)) return false;
    if (p.state === 'finished') return false;
    return true;
  } catch (e) {
    logger.warn('partida restore check failed', { roomId, err: e.message });
    return true;
  }
}

async function _restore(roomId) {
  try {
    if (!(await _partidaAllowsRestore(roomId))) {
      await redis.del(`game:${roomId}`).catch(() => {});
      logger.info('Game restore skipped: partida closed in MySQL', { roomId });
      return null;
    }
    const raw = await redis.get(`game:${roomId}`);
    if (!raw) return null;
    let data;
    try {
      data = JSON.parse(raw);
    } catch (_) {
      return null;
    }
    const restored = TrucoGame.fromPersistenceSnapshot(data);
    if (restored) {
      games.set(roomId, restored);
      logger.info(`Game restored from Redis (TrucoGame): ${roomId}`);
      return restored;
    }
    logger.warn('Game restore from Redis failed (missing hands or bad snapshot)', { roomId });
    return null;
  } catch (_) {
    return null;
  }
}

module.exports = { createGame, getGame, saveGame, evictGame, deleteGame };
