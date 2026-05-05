/**
 * chatHandler — In-game chat with rate limiting, spam prevention and
 * room-membership validation.
 *
 * Security: validates that the sender is an active player in the target room
 * before broadcasting any message or reaction.
 *
 * Rate limit: max 2 messages per 2 seconds per socket (sliding window).
 */
const { securityLog }  = require('../../config/logger');
const gameSession      = require('../../services/gameSession');
const { isValidRoomId } = require('../../middleware/errorHandler');

// Per-socket message timestamps (sliding window rate limiter)
// socketId → number[] (timestamps in ms)
const msgTimestamps = new Map();

const RATE_WINDOW_MS = 2000;  // window length
const RATE_MAX       = 2;     // max messages per window
const MAX_LEN        = 200;   // max message length in chars

// Basic spam patterns (add more as needed)
const SPAM_PATTERNS = [
  /(.)\1{9,}/,       // 10+ repeated chars: "aaaaaaaaaa"
  /https?:\/\//i,    // links (no URLs in game chat)
];

function isSpam(text) {
  return SPAM_PATTERNS.some(p => p.test(text));
}

function checkRateLimit(socketId) {
  const now = Date.now();
  const ts  = (msgTimestamps.get(socketId) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (ts.length >= RATE_MAX) return false;
  ts.push(now);
  msgTimestamps.set(socketId, ts);
  return true;
}

/**
 * Returns the active game if roomId is valid and user is one of its players.
 * Returns null otherwise (and optionally emits chat:error).
 */
async function _getAuthorizedGame(socket, user, roomId) {
  if (!isValidRoomId(roomId)) {
    socket.emit('chat:error', { error: 'Sala inválida' });
    return null;
  }

  const game = await gameSession.getGame(roomId);
  if (!game) {
    socket.emit('chat:error', { error: 'Sala no encontrada' });
    return null;
  }

  // Ensure the sender is actually a player in this game
  const playerIds = game.players.map(Number);
  if (!playerIds.includes(Number(user.id))) {
    securityLog('chat_unauthorized_room', {
      userId: user.id,
      socketId: socket.id,
      roomId,
    });
    socket.emit('chat:error', { error: 'No sos jugador de esta partida' });
    return null;
  }

  return game;
}

function registerChatHandlers(io, socket, user) {
  socket.on('chat:message', async ({ roomId, text }) => {
    if (typeof text !== 'string') return;
    const sanitized = text.trim().substring(0, MAX_LEN);
    if (!sanitized) return;

    // Room membership check
    const game = await _getAuthorizedGame(socket, user, roomId);
    if (!game) return;

    // Rate limit
    if (!checkRateLimit(socket.id)) {
      securityLog('chat_rate_limit', { userId: user.id, socketId: socket.id, roomId });
      socket.emit('chat:error', { error: 'Despacio — enviás mensajes muy rápido' });
      return;
    }

    // Spam filter
    if (isSpam(sanitized)) {
      securityLog('chat_spam', { userId: user.id, socketId: socket.id, roomId, text: sanitized });
      socket.emit('chat:error', { error: 'Mensaje bloqueado por filtro de spam' });
      return;
    }

    io.to(roomId).emit('chat:message', {
      from:      { id: user.id, username: user.username },
      text:      sanitized,
      createdAt: new Date().toISOString(),
    });
  });

  socket.on('chat:reaction', async ({ roomId, reaction }) => {
    const allowed = ['👍','👎','😂','😤','🃏','🔥','👏','🤔'];
    if (!allowed.includes(reaction)) return;

    // Room membership check
    const game = await _getAuthorizedGame(socket, user, roomId);
    if (!game) return;

    // Reactions also rate-limited
    if (!checkRateLimit(socket.id)) return;

    io.to(roomId).emit('chat:reaction', {
      from:      { id: user.id, username: user.username },
      reaction,
      createdAt: new Date().toISOString(),
    });
  });

  socket.on('disconnect', () => {
    msgTimestamps.delete(socket.id);
  });
}

module.exports = { registerChatHandlers };
