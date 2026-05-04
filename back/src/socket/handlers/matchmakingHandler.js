const matchmaking = require('../../services/matchmaking');
const gameSession = require('../../services/gameSession');
const Game        = require('../../models/Game');
const { trackUserRoom, startTurnTimerPublic } = require('./gameHandler');
const logger      = require('../../config/logger');

/**
 * Handles all matchmaking events for a connected socket.
 */
function registerMatchmakingHandlers(io, socket, user) {
  // ── JOIN QUEUE ──────────────────────────────────────────────────
  socket.on('queue:join', (options = {}) => {
    const gameOptions = normalizeGameOptions(options);

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

    /**
     * IMPORTANT:
     * tryMatch debe buscar un rival compatible con estas opciones.
     * Si tu service todavía no acepta argumentos, abajo te dejo cómo corregirlo.
     */
    const match = matchmaking.tryMatch(gameOptions);

    if (!match) return;

    _startMatch(io, match);
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

function normalizeGameOptions(options = {}) {
  return {
    puntosMaximos: Number(options.puntosMaximos) === 15 ? 15 : 30,
    florHabilitada: Boolean(options.florHabilitada),
    modo: options.modo === 'ranked' ? 'ranked' : 'casual',
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

  // Join both sockets to the room
  const p1Socket = io.sockets.sockets.get(player1.socketId);
  const p2Socket = io.sockets.sockets.get(player2.socketId);

  if (p1Socket) p1Socket.join(roomId);
  if (p2Socket) p2Socket.join(roomId);

  // Track userId → roomId for disconnect handling
  trackUserRoom(player1.userId, roomId);
  trackUserRoom(player2.userId, roomId);

  // Send personalized views
  if (p1Socket) {
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
  }

  if (p2Socket) {
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
  }

  // Start initial turn timer
  if (startTurnTimerPublic) {
    startTurnTimerPublic(io, roomId, game);
  }
}

module.exports = { registerMatchmakingHandlers };