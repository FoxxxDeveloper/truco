/**
 * chatHandler — In-game chat with rate limiting and spam prevention.
 *
 * Rate limit: max 2 messages per 2 seconds per socket (sliding window).
 * Banned words list is intentionally minimal — extend as needed.
 */
const { securityLog } = require('../../config/logger');

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

function registerChatHandlers(io, socket, user) {
  socket.on('chat:message', ({ roomId, text }) => {
    if (!roomId || typeof text !== 'string') return;
    const sanitized = text.trim().substring(0, MAX_LEN);
    if (!sanitized) return;

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
      from: { id: user.id, username: user.username },
      text: sanitized,
      timestamp: Date.now(),
    });
  });

  socket.on('chat:reaction', ({ roomId, reaction }) => {
    const allowed = ['👍','👎','😂','😤','🃏','🔥','👏','🤔'];
    if (!allowed.includes(reaction)) return;

    // Reactions also rate-limited
    if (!checkRateLimit(socket.id)) return;

    io.to(roomId).emit('chat:reaction', {
      from: { id: user.id, username: user.username },
      reaction,
      timestamp: Date.now(),
    });
  });

  socket.on('disconnect', () => {
    msgTimestamps.delete(socket.id);
  });
}

module.exports = { registerChatHandlers };
