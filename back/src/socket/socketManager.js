const jwt = require('jsonwebtoken');
const User = require('../models/User');
const matchmaking = require('../services/matchmaking');
const NotificationService = require('../services/notificationService');
const { registerMatchmakingHandlers } = require('./handlers/matchmakingHandler');
const { registerGameHandlers, userRooms } = require('./handlers/gameHandler');
const { registerChatHandlers }        = require('./handlers/chatHandler');
const { registerSocialHandlers }      = require('./handlers/socialHandler');
const { registerBattleHandlers }      = require('./handlers/battleHandler');
const logger = require('../config/logger');

/**
 * Presence system.
 * status: 'lobby' | 'in_game' | 'disconnected'
 * userId → { status, since }
 */
const presenceMap = new Map();

function getPresence(userId) {
  return presenceMap.get(userId) || { status: 'offline' };
}

function setPresence(userId, status) {
  presenceMap.set(userId, { status, since: Date.now() });
}

// Expose for gameHandler to call when a game starts/ends
function markInGame(userId)   { setPresence(userId, 'in_game'); }
function markInLobby(userId)  { setPresence(userId, 'lobby'); }
function markOffline(userId)  { presenceMap.delete(userId); }

/**
 * Attaches Socket.IO middleware and registers all event handlers.
 * @param {import('socket.io').Server} io
 */
function setupSocketIO(io) {
  // Inject io into NotificationService for real-time delivery
  NotificationService.setIO(io);

  // ── AUTH MIDDLEWARE ────────────────────────────────────────────
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);
      if (!user) return next(new Error('User not found'));
      socket.data.user = user;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  // ── CONNECTION ─────────────────────────────────────────────────
  io.on('connection', (socket) => {
    const user = socket.data.user;
    logger.info(`Socket connected: ${user.username} [${socket.id}]`);

    // Set initial presence
    const inGame = userRooms.has(user.id);
    setPresence(user.id, inGame ? 'in_game' : 'lobby');

    // Register all handlers
    registerMatchmakingHandlers(io, socket, user);
    registerGameHandlers(io, socket, user);
    registerChatHandlers(io, socket, user);
    registerSocialHandlers(io, socket, user);
    registerBattleHandlers(io, socket, user);

    // Presence query from clients
    socket.on('presence:get', ({ userIds }) => {
      if (!Array.isArray(userIds)) return;
      const result = {};
      for (const id of userIds.slice(0, 50)) { // max 50 at once
        result[id] = getPresence(id);
      }
      socket.emit('presence:update', result);
    });

    // ── DISCONNECT ───────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      logger.info(`Socket disconnected: ${user.username} [${reason}]`);
      matchmaking.removeBySocketId(socket.id);
      // Mark as offline only if no other socket for same user
      setPresence(user.id, 'disconnected');
      // Per-game and social disconnect logic is handled in gameHandler and socialHandler
    });
  });
}

module.exports = setupSocketIO;
module.exports.markInGame  = markInGame;
module.exports.markInLobby = markInLobby;
module.exports.markOffline = markOffline;
module.exports.getPresence = getPresence;
