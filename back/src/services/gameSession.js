/**
 * GameSessionManager
 * Stores active TrucoGame instances in memory (with optional Redis persistence).
 * This is the authoritative source of truth for in-progress games.
 */
const { TrucoGame } = require('../game/TrucoGame');
const redis = require('../config/redis');
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
    await redis.set(`game:${roomId}`, JSON.stringify(game.toJSON()), { EX: SESSION_TTL });
  } catch (_) {
    // Redis unavailable — in-memory store is sufficient for single-process
  }
}

async function _restore(roomId) {
  try {
    const raw = await redis.get(`game:${roomId}`);
    if (!raw) return null;
    // Note: we restore basic state only; full class restoration not needed as
    // TrucoGame is stored in-memory and Redis is for reconnection recovery.
    logger.info(`Game restored from Redis: ${roomId}`);
    return JSON.parse(raw); // plain object, not TrucoGame instance
  } catch (_) {
    return null;
  }
}

module.exports = { createGame, getGame, saveGame, evictGame, deleteGame };
