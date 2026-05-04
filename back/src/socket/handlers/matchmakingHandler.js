const matchmaking = require('../../services/matchmaking');
const gameSession = require('../../services/gameSession');
const Game        = require('../../models/Game');
const { trackUserRoom, startTurnTimerPublic } = require('./gameHandler');
const logger      = require('../../config/logger');

/**
 * Handles all matchmaking and game events for a connected socket.
 */
function registerMatchmakingHandlers(io, socket, user) {
  // ── JOIN QUEUE ──────────────────────────────────────────────────
  socket.on('queue:join', (options = {}) => {
    const gameOptions = {
      puntosMaximos: options.puntosMaximos || 30,
      florHabilitada: options.florHabilitada || false,
      modo: options.modo || 'casual',
    };
    matchmaking.enqueue(socket.id, user.id, user.username, user.elo, gameOptions);
    socket.emit('queue:joined', { queueSize: matchmaking.getQueueSize() });

    const match = matchmaking.tryMatch();
    if (!match) return;

    _startMatch(io, match);
  });

  // ── LEAVE QUEUE ─────────────────────────────────────────────────
  socket.on('queue:leave', () => {
    matchmaking.dequeue(user.id);
    socket.emit('queue:left');
  });
}

async function _startMatch(io, { player1, player2, roomId }) {
  // Merge game options: player1's preferences take priority
  const gameOptions = {
    puntosMaximos: player1.gameOptions?.puntosMaximos || 30,
    florHabilitada: player1.gameOptions?.florHabilitada || false,
    modo: player1.gameOptions?.modo || 'casual',
  };
  const game = await gameSession.createGame(roomId, player1.userId, player2.userId, gameOptions);
  game.startGame();

  // Persist to DB
  try {
    await Game.create({ roomId, player1Id: player1.userId, player2Id: player2.userId });
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
      opponent: { id: player2.userId, username: player2.username, elo: player2.elo },
      gameState: game.getPlayerView(player1.userId),
    });
  }
  if (p2Socket) {
    p2Socket.emit('game:start', {
      roomId,
      opponent: { id: player1.userId, username: player1.username, elo: player1.elo },
      gameState: game.getPlayerView(player2.userId),
    });
  }

  // Start initial turn timer
  if (startTurnTimerPublic) startTurnTimerPublic(io, roomId, game);
}

module.exports = { registerMatchmakingHandlers };
