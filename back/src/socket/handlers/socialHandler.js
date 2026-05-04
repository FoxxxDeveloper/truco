/**
 * socialHandler — Socket.IO events for friends and private chat.
 *
 * Events emitted by clients:
 *   private:message   { toUserId, content }
 *   private:typing    { toUserId, isTyping }
 *
 * Events emitted by server:
 *   private:message:received  { id, senderId, senderUsername, content, created_at }
 *   private:typing:received   { fromUserId, isTyping }
 *   notification:new          (see NotificationService)
 */
const Friend              = require('../../models/Friend');
const Message             = require('../../models/Message');
const NotificationService = require('../../services/notificationService');
const logger              = require('../../config/logger');

function registerSocialHandlers(io, socket, user) {
  // Track user online presence
  NotificationService.trackSocket(user.id, socket.id);

  // ── Private message ────────────────────────────────────────────────────────
  socket.on('private:message', async ({ toUserId, content }) => {
    try {
      if (!toUserId || !content) return;
      const receiverId = parseInt(toUserId);
      if (isNaN(receiverId) || receiverId === user.id) return;

      // Security: only friends can message each other
      const areFriends = await Friend.areFriends(user.id, receiverId);
      if (!areFriends) {
        socket.emit('social:error', { error: 'Solo podés chatear con amigos' });
        return;
      }

      const msg = await Message.create(user.id, receiverId, content);
      const payload = {
        ...msg,
        senderUsername: user.username,
        senderAvatar:   user.avatar,
      };

      // Deliver to all sockets of the receiver
      socket.emit('private:message:sent', payload);
      NotificationService.onlineUsers.get(receiverId)?.forEach(sid => {
        io.to(sid).emit('private:message:received', payload);
      });
    } catch (err) {
      logger.error(`private:message from ${user.username}: ${err.message}`);
      socket.emit('social:error', { error: 'Failed to send message' });
    }
  });

  // ── Typing indicator ───────────────────────────────────────────────────────
  socket.on('private:typing', ({ toUserId, isTyping }) => {
    NotificationService.onlineUsers.get(parseInt(toUserId))?.forEach(sid => {
      io.to(sid).emit('private:typing:received', {
        fromUserId: user.id,
        username:   user.username,
        isTyping:   !!isTyping,
      });
    });
  });

  // ── Online presence broadcast ──────────────────────────────────────────────
  socket.on('disconnect', () => {
    NotificationService.untrackSocket(user.id, socket.id);
    // Broadcast "went offline" to all online friends
    Friend.getList(user.id)
      .then(friends => {
        for (const f of friends) {
          NotificationService.onlineUsers.get(f.id)?.forEach(sid => {
            io.to(sid).emit('friend:offline', { userId: user.id });
          });
        }
      })
      .catch(() => {});
  });

  // Broadcast "came online" to all friends
  Friend.getList(user.id)
    .then(friends => {
      for (const f of friends) {
        NotificationService.onlineUsers.get(f.id)?.forEach(sid => {
          io.to(sid).emit('friend:online', {
            userId:   user.id,
            username: user.username,
            avatar:   user.avatar,
          });
        });
      }
    })
    .catch(() => {});
}

module.exports = { registerSocialHandlers };
