const matchmaking = require('../../services/matchmaking');
const gameSession = require('../../services/gameSession');
const Game        = require('../../models/Game');
const { trackUserRoom, startTurnTimerPublic } = require('./gameHandler');
const { getActiveGameForUser, logActiveGameBlock } = require('../../utils/activeGame');
const logger      = require('../../config/logger');
const { assertPlayerParticipationAllowed } = require('../../utils/adminGuard');
const { isRankedEnabled } = require('../../config/features');

/**
 * Handles all matchmaking events for a connected socket.
 */
function registerMatchmakingHandlers(io, socket, user) {
  // ── JOIN QUEUE ──────────────────────────────────────────────────
  socket.on('queue:join', async (options = {}) => {
    try {
      assertPlayerParticipationAllowed(user);
    } catch (err) {
      socket.emit('queue:error', { error: err.message });
      return;
    }

    const gameOptions = normalizeGameOptions(options);

    if (!isRankedEnabled() && gameOptions.modo === 'ranked') {
      socket.emit('queue:error', {
        error: 'Las partidas ranked están deshabilitadas temporalmente.',
      });
      return;
    }

    const activeRow = await getActiveGameForUser(user.id);
    if (activeRow) {
      logActiveGameBlock(user.id, activeRow);
      socket.emit('queue:error', {
        error: 'No podés buscar partida mientras tenés una partida activa',
      });
      return;
    }

    logger.info(
      `Queue join: user=${user.username} id=${user.id} mode=${gameOptions.modo} points=${gameOptions.puntosMaximos} flor=${gameOptions.florHabilitada}`
    );

    matchmaking.enqueue(
      socket.id,
      user.id,
      user.username,
      user.elo,
      gameOptions
    );

    socket.emit('queue:joined', {
      queueSize: matchmaking.getQueueSize(),
      options: gameOptions,
    });

    const match = matchmaking.tryMatch(gameOptions);

    if (!match) return;

    try {
      await _startMatch(io, match);
    } catch (err) {
      logger.error(`_startMatch error: ${err.message}`);
    }
  });

  // ── LEAVE QUEUE ─────────────────────────────────────────────────
  socket.on('queue:leave', () => {
    matchmaking.dequeue(user.id);
    socket.emit('queue:left');
  });

  socket.on('disconnect', () => {
    matchmaking.dequeue(user.id);
  });
}

/**
 * Find the currently-connected socket for a user by their userId.
 * Used as a fallback when the socket ID stored in the queue is stale
 * (the player's socket may have reconnected with a new ID between enqueue
 * and the async completion of _startMatch).
 */
function findUserSocket(io, userId) {
  for (const [, s] of io.sockets.sockets) {
    if (s.data?.user?.id === userId) return s;
  }
  return null;
}

function normalizeGameOptions(options = {}) {
  const wantsRanked =
    options.modo === 'ranked' || options.modo === 'ranking';
  const modo =
    isRankedEnabled() && wantsRanked ? 'ranked' : 'casual';
  return {
    puntosMaximos: Number(options.puntosMaximos) === 15 ? 15 : 30,
    florHabilitada: Boolean(options.florHabilitada),
    modo,
  };
}

function sameGameOptions(a = {}, b = {}) {
  return (
    Number(a.puntosMaximos) === Number(b.puntosMaximos) &&
    Boolean(a.florHabilitada) === Boolean(b.florHabilitada) &&
    String(a.modo || 'casual') === String(b.modo || 'casual')
  );
}

async function _startMatch(io, { player1, player2, roomId }) {
  const p1Options = normalizeGameOptions(player1.gameOptions);
  const p2Options = normalizeGameOptions(player2.gameOptions);

  if (!sameGameOptions(p1Options, p2Options)) {
    logger.error(
      `Match rejected: incompatible options. P1=${JSON.stringify(p1Options)} P2=${JSON.stringify(p2Options)}`
    );

    const p1Socket = io.sockets.sockets.get(player1.socketId);
    const p2Socket = io.sockets.sockets.get(player2.socketId);

    if (p1Socket) {
      p1Socket.emit('game:error', {
        error: 'No se pudo iniciar la partida: configuración incompatible.',
      });
      p1Socket.emit('queue:left');
    }

    if (p2Socket) {
      p2Socket.emit('game:error', {
        error: 'No se pudo iniciar la partida: configuración incompatible.',
      });
      p2Socket.emit('queue:left');
    }

    return;
  }

  const gameOptions = p1Options;

  logger.info(
    `Match started: room=${roomId} mode=${gameOptions.modo} points=${gameOptions.puntosMaximos} flor=${gameOptions.florHabilitada}`
  );

  const game = await gameSession.createGame(
    roomId,
    player1.userId,
    player2.userId,
    gameOptions
  );

  game.startGame();

  // Persist to DB
  try {
    await Game.create({
      roomId,
      player1Id: player1.userId,
      player2Id: player2.userId,
    });
  } catch (err) {
    logger.error('DB game create failed: ' + err.message);
  }

  // Join both sockets to the room.
  // First try the cached socket ID; fall back to searching by userId in case
  // the player's socket reconnected with a new ID during the async DB operations.
  const p1Socket = io.sockets.sockets.get(player1.socketId) || findUserSocket(io, player1.userId);
  const p2Socket = io.sockets.sockets.get(player2.socketId) || findUserSocket(io, player2.userId);

  if (!p1Socket || !p2Socket) {
    logger.error(
      `Match aborted: socket missing. P1=${player1.userId}(${!!p1Socket}) P2=${player2.userId}(${!!p2Socket}) room=${roomId}`
    );
    // Re-enqueue whichever player is still connected so they can find a new match
    if (p1Socket) {
      matchmaking.enqueue(p1Socket.id, player1.userId, player1.username, player1.elo, player1.gameOptions);
      p1Socket.emit('queue:joined', { queueSize: matchmaking.getQueueSize(), options: player1.gameOptions });
    }
    if (p2Socket) {
      matchmaking.enqueue(p2Socket.id, player2.userId, player2.username, player2.elo, player2.gameOptions);
      p2Socket.emit('queue:joined', { queueSize: matchmaking.getQueueSize(), options: player2.gameOptions });
    }
    await gameSession.deleteGame(roomId);
    return;
  }

  p1Socket.join(roomId);
  p2Socket.join(roomId);

  // Track userId → roomId for disconnect handling
  trackUserRoom(player1.userId, roomId);
  trackUserRoom(player2.userId, roomId);

  // Send personalized views
  p1Socket.emit('game:start', {
    roomId,
    opponent: {
      id: player2.userId,
      username: player2.username,
      elo: player2.elo,
    },
    gameState: game.getPlayerView(player1.userId),
    gameOptions,
  });

  p2Socket.emit('game:start', {
    roomId,
    opponent: {
      id: player1.userId,
      username: player1.username,
      elo: player1.elo,
    },
    gameState: game.getPlayerView(player2.userId),
    gameOptions,
  });

  // Start initial turn timer
  if (startTurnTimerPublic) {
    startTurnTimerPublic(io, roomId, game);
  }
}

module.exports = { registerMatchmakingHandlers };