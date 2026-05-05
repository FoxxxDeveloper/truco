/**
 * socialHandler — Socket.IO events for friends and private chat.
 *
 * Events emitted by clients:
 *   private:message   { toUserId, text }
 *   private:typing    { toUserId, isTyping }
 *
 * Events emitted by server:
 *   private:message:received  { id, from: { id, username }, to: { id }, text, createdAt }
 *   private:message:sent      (same payload, echoed to sender)
 *   private:typing:received   { fromUserId, isTyping }
 *   private:error             { error }
 *   friend:online             { userId, username, avatar }
 *   friend:offline            { userId }
 *   notification:new          (see NotificationService)
 */
const Friend              = require('../../models/Friend');
const Message             = require('../../models/Message');
const GeneralMessage      = require('../../models/GeneralMessage');
const NotificationService = require('../../services/notificationService');
const logger              = require('../../config/logger');

const MAX_MSG_LENGTH     = 500;
const GENERAL_RATE_MS    = 1500; // min ms between general messages per user
const generalLastSent    = new Map(); // userId → timestamp

/**
 * Emit an event to every socket belonging to a userId.
 * Safe: if the user is offline (empty Set) this is a no-op.
 */
function emitToUser(io, userId, event, payload) {
  for (const sid of NotificationService.getSockets(userId)) {
    io.to(sid).emit(event, payload);
  }
}

function registerSocialHandlers(io, socket, user) {
  // Track user online presence
  NotificationService.trackSocket(user.id, socket.id);

  // ── Private message ────────────────────────────────────────────────────────
  socket.on('private:message', async (data) => {
    try {
      const { toUserId, text } = data || {};

      // ── Input validation ──
      if (!toUserId) {
        return socket.emit('private:error', { error: 'Destinatario inválido' });
      }
      const receiverId = Number(toUserId);
      if (!Number.isInteger(receiverId) || receiverId <= 0) {
        return socket.emit('private:error', { error: 'Destinatario inválido' });
      }
      if (receiverId === user.id) {
        return socket.emit('private:error', { error: 'No podés enviarte mensajes a vos mismo' });
      }
      if (typeof text !== 'string' || text.trim().length === 0) {
        return socket.emit('private:error', { error: 'El mensaje no puede estar vacío' });
      }
      const trimmed = text.trim().substring(0, MAX_MSG_LENGTH);

      // ── Friends-only guard ──
      const areFriends = await Friend.areFriends(user.id, receiverId);
      if (!areFriends) {
        return socket.emit('private:error', { error: 'Solo podés chatear con amigos' });
      }

      // ── Persist ──
      const msg = await Message.create(user.id, receiverId, trimmed);

      // ── Unified payload ──
      const payload = {
        id:        msg.id,
        from:      { id: user.id, username: user.username },
        to:        { id: receiverId },
        text:      trimmed,
        createdAt: msg.created_at,
        // Legacy aliases kept so existing frontend code (senderId/content) still works
        senderId:        user.id,
        senderUsername:  user.username,
        content:         trimmed,
        created_at:      msg.created_at,
      };

      // ── Deliver ──
      // Echo to sender (all tabs/sockets of this user)
      emitToUser(io, user.id, 'private:message:sent', payload);
      // Push to receiver (if online; no-op if offline — message is already in DB)
      emitToUser(io, receiverId, 'private:message:received', payload);

    } catch (err) {
      logger.error(`private:message from ${user.username}: ${err.message}`);
      socket.emit('private:error', { error: 'No se pudo enviar el mensaje' });
    }
  });

  // ── General chat ──────────────────────────────────────────────────────────
  socket.on('general:message', async (data) => {
    try {
      // Banned/suspended users cannot send
      if (user.status !== 'active') {
        return socket.emit('general:error', { error: 'Tu cuenta no puede enviar mensajes' });
      }

      const { text } = data || {};
      if (typeof text !== 'string' || text.trim().length === 0) {
        return socket.emit('general:error', { error: 'El mensaje no puede estar vacío' });
      }
      const trimmed = text.trim().substring(0, MAX_MSG_LENGTH);

      // Rate limit per user
      const now = Date.now();
      const last = generalLastSent.get(user.id) || 0;
      if (now - last < GENERAL_RATE_MS) {
        return socket.emit('general:error', { error: 'Estás enviando mensajes muy rápido' });
      }
      generalLastSent.set(user.id, now);

      const msg = await GeneralMessage.create(user.id, trimmed);

      const payload = {
        id:        msg.id,
        from:      { id: user.id, username: user.username, avatar: user.avatar || null },
        text:      trimmed,
        createdAt: msg.createdAt,
      };

      // Broadcast to all connected clients
      io.emit('general:message', payload);
    } catch (err) {
      logger.error(`general:message from ${user.username}: ${err.message}`);
      socket.emit('general:error', { error: 'No se pudo enviar el mensaje' });
    }
  });

  // ── Typing indicator ───────────────────────────────────────────────────────
  socket.on('private:typing', (data) => {
    try {
      const { toUserId, isTyping } = data || {};
      if (!toUserId) return;
      const receiverId = Number(toUserId);
      if (!Number.isInteger(receiverId) || receiverId <= 0 || receiverId === user.id) return;

      emitToUser(io, receiverId, 'private:typing:received', {
        fromUserId: user.id,
        username:   user.username,
        isTyping:   !!isTyping,
      });
    } catch (err) {
      logger.error(`private:typing from ${user.username}: ${err.message}`);
      // Typing errors are non-critical — no client emit needed
    }
  });

  // ── Online presence broadcast ──────────────────────────────────────────────
  socket.on('disconnect', () => {
    NotificationService.untrackSocket(user.id, socket.id);
    Friend.getList(user.id)
      .then(friends => {
        for (const f of friends) {
          emitToUser(io, f.id, 'friend:offline', { userId: user.id });
        }
      })
      .catch(() => {});
  });

  // Broadcast "came online" to all friends
  Friend.getList(user.id)
    .then(friends => {
      for (const f of friends) {
        emitToUser(io, f.id, 'friend:online', {
          userId:   user.id,
          username: user.username,
          avatar:   user.avatar,
        });
      }
    })
    .catch(() => {});
}

module.exports = { registerSocialHandlers };
