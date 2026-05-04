/**
 * Matchmaking Queue
 * Simple FIFO queue. Players enter and are matched when two are waiting.
 * Optional: extend with ELO-range matching.
 */
const { v4: uuidv4 } = require('uuid');
const logger = require('../config/logger');

// { socketId, userId, username, elo, gameOptions, joinedAt }
const queue = [];

function enqueue(socketId, userId, username, elo = 1000, gameOptions = {}) {
  // Prevent duplicate entries
  const existing = queue.findIndex(p => p.userId === userId);
  if (existing !== -1) queue.splice(existing, 1);

  queue.push({ socketId, userId, username, elo, gameOptions, joinedAt: Date.now() });
  logger.info(`Matchmaking: ${username} joined queue (size: ${queue.length})`);
}

function dequeue(userId) {
  const idx = queue.findIndex(p => p.userId === userId);
  if (idx !== -1) {
    queue.splice(idx, 1);
    logger.info(`Matchmaking: user ${userId} left queue`);
  }
}

/**
 * Try to match two players.
 * Returns null or { player1, player2, roomId }
 */
function tryMatch() {
  if (queue.length < 2) return null;

  const player1 = queue.shift();
  const player2 = queue.shift();
  const roomId = uuidv4();

  logger.info(`Matched: ${player1.username} vs ${player2.username} → room ${roomId}`);
  return { player1, player2, roomId };
}

function getQueueSize() {
  return queue.length;
}

function removeBySocketId(socketId) {
  const idx = queue.findIndex(p => p.socketId === socketId);
  if (idx !== -1) {
    const p = queue.splice(idx, 1)[0];
    logger.info(`Matchmaking: socket ${socketId} removed from queue (${p.username})`);
  }
}

module.exports = { enqueue, dequeue, tryMatch, getQueueSize, removeBySocketId };
