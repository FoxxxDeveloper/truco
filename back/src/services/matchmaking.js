/**
 * Matchmaking Queue
 *
 * Antes era FIFO simple: agarraba los primeros 2 jugadores sin importar modo/configuración.
 * Ahora separa correctamente por:
 * - modo: casual / ranked
 * - puntosMaximos: 15 / 30
 * - florHabilitada: true / false
 *
 * Regla:
 * casual solo con casual
 * ranked solo con ranked
 * 15 solo con 15
 * 30 solo con 30
 * con flor solo con con flor
 * sin flor solo con sin flor
 */

const { v4: uuidv4 } = require('uuid');
const logger = require('../config/logger');

// { socketId, userId, username, elo, gameOptions, joinedAt }
const queue = [];

function normalizeGameOptions(gameOptions = {}) {
  return {
    modo: gameOptions.modo === 'ranked' ? 'ranked' : 'casual',
    puntosMaximos: Number(gameOptions.puntosMaximos) === 15 ? 15 : 30,
    florHabilitada: Boolean(gameOptions.florHabilitada),
    reconnectGraceSecs: 60,
  };
}

function sameGameOptions(a = {}, b = {}) {
  const optionsA = normalizeGameOptions(a);
  const optionsB = normalizeGameOptions(b);

  return (
    optionsA.modo === optionsB.modo &&
    optionsA.puntosMaximos === optionsB.puntosMaximos &&
    optionsA.florHabilitada === optionsB.florHabilitada
  );
}

function getQueueKey(gameOptions = {}) {
  const options = normalizeGameOptions(gameOptions);

  return [
    options.modo,
    options.puntosMaximos,
    options.florHabilitada ? 'flor' : 'sin_flor',
  ].join(':');
}

function enqueue(socketId, userId, username, elo = 1000, gameOptions = {}) {
  const normalizedOptions = normalizeGameOptions(gameOptions);

  // Prevent duplicate entries from same user
  const existing = queue.findIndex((p) => Number(p.userId) === Number(userId));

  if (existing !== -1) {
    queue.splice(existing, 1);
  }

  queue.push({
    socketId,
    userId,
    username,
    elo,
    gameOptions: normalizedOptions,
    queueKey: getQueueKey(normalizedOptions),
    joinedAt: Date.now(),
  });

  logger.info(
    `Matchmaking: ${username} joined queue ` +
    `[${getQueueKey(normalizedOptions)}] ` +
    `(size: ${queue.length})`
  );
}

function dequeue(userId) {
  const idx = queue.findIndex((p) => Number(p.userId) === Number(userId));

  if (idx !== -1) {
    const player = queue.splice(idx, 1)[0];

    logger.info(
      `Matchmaking: user ${userId} left queue ` +
      `[${player.queueKey || getQueueKey(player.gameOptions)}]`
    );
  }
}

/**
 * Try to match two compatible players.
 *
 * Si recibe preferredOptions, intenta matchear a un jugador compatible con esa configuración.
 * Si no recibe nada, busca el primer par compatible dentro de toda la cola.
 *
 * Returns null or { player1, player2, roomId }
 */
function tryMatch(preferredOptions = null) {
  if (queue.length < 2) return null;

  const normalizedPreferredOptions = preferredOptions
    ? normalizeGameOptions(preferredOptions)
    : null;

  // Caso normal: acaba de entrar un jugador y queremos buscarle rival compatible.
  if (normalizedPreferredOptions) {
    const queueKey = getQueueKey(normalizedPreferredOptions);

    const compatiblePlayers = queue
      .map((player, index) => ({ player, index }))
      .filter(({ player }) => {
        return (
          player.queueKey === queueKey ||
          sameGameOptions(player.gameOptions, normalizedPreferredOptions)
        );
      })
      .sort((a, b) => a.player.joinedAt - b.player.joinedAt);

    if (compatiblePlayers.length < 2) {
      logger.info(
        `Matchmaking: no compatible match yet for [${queueKey}] ` +
        `(compatible: ${compatiblePlayers.length}, total queue: ${queue.length})`
      );
      return null;
    }

    const first = compatiblePlayers[0];
    const second = compatiblePlayers[1];

    return createMatchFromIndexes(first.index, second.index);
  }

  // Fallback: buscar cualquier par compatible en toda la cola.
  for (let i = 0; i < queue.length; i += 1) {
    for (let j = i + 1; j < queue.length; j += 1) {
      if (sameGameOptions(queue[i].gameOptions, queue[j].gameOptions)) {
        return createMatchFromIndexes(i, j);
      }
    }
  }

  return null;
}

function createMatchFromIndexes(indexA, indexB) {
  // Borrar primero el índice mayor para no romper el índice menor.
  const [high, low] = indexA > indexB ? [indexA, indexB] : [indexB, indexA];

  const player2 = queue.splice(high, 1)[0];
  const player1 = queue.splice(low, 1)[0];

  const roomId = uuidv4();

  logger.info(
    `Matched: ${player1.username} vs ${player2.username} ` +
    `[${getQueueKey(player1.gameOptions)}] → room ${roomId}`
  );

  return {
    player1,
    player2,
    roomId,
  };
}

function getQueueSize() {
  return queue.length;
}

function getQueueSnapshot() {
  return queue.map((p) => ({
    userId: p.userId,
    username: p.username,
    elo: p.elo,
    socketId: p.socketId,
    gameOptions: p.gameOptions,
    queueKey: p.queueKey || getQueueKey(p.gameOptions),
    joinedAt: p.joinedAt,
  }));
}

function removeBySocketId(socketId) {
  const idx = queue.findIndex((p) => p.socketId === socketId);

  if (idx !== -1) {
    const p = queue.splice(idx, 1)[0];

    logger.info(
      `Matchmaking: socket ${socketId} removed from queue ` +
      `(${p.username}) [${p.queueKey || getQueueKey(p.gameOptions)}]`
    );
  }
}

module.exports = {
  enqueue,
  dequeue,
  tryMatch,
  getQueueSize,
  getQueueSnapshot,
  removeBySocketId,
  normalizeGameOptions,
  sameGameOptions,
  getQueueKey,
};