/**
 * NotificationService
 * Creates notification rows and, if the target user has an active socket,
 * delivers them in real-time via io.
 */
const { query } = require('../config/database');

// Reference to socket.io Server — set once at app startup via setIO()
let _io = null;

// Map of userId → Set<socketId> — maintained by socialHandler
const onlineUsers = new Map();

const NotificationService = {
  setIO(io) { _io = io; },

  trackSocket(userId, socketId)   { if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set()); onlineUsers.get(userId).add(socketId); },
  untrackSocket(userId, socketId) { onlineUsers.get(userId)?.delete(socketId); if (onlineUsers.get(userId)?.size === 0) onlineUsers.delete(userId); },

  isOnline(userId) { return (onlineUsers.get(userId)?.size ?? 0) > 0; },

  /**
   * Returns the Set of socketIds for a user, or an empty Set if offline.
   * Prefer this over accessing onlineUsers directly from other modules.
   */
  getSockets(userId) { return onlineUsers.get(Number(userId)) || new Set(); },

  /**
   * Create a notification and push it to the user's sockets if online.
   * @param {object} opts
   * @param {number} opts.userId  — recipient
   * @param {string} opts.type   — e.g. 'friend_request', 'game_result', 'deposit'
   * @param {string} opts.title
   * @param {string} [opts.body]
   * @param {object} [opts.metadata]
   */
  async create({ userId, type, title, body = null, metadata = null }) {
    const result = await query(
      `INSERT INTO notifications (user_id, type, title, body, metadata)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, type, title, body, metadata ? JSON.stringify(metadata) : null]
    );

    const notification = {
      id:         result.insertId,
      userId,
      type,
      title,
      body,
      metadata,
      read_at:    null,
      created_at: new Date().toISOString(),
    };

    // Real-time delivery
    if (_io) {
      const sockets = onlineUsers.get(userId);
      if (sockets) {
        for (const sid of sockets) {
          _io.to(sid).emit('notification:new', notification);
        }
      }
    }

    return notification;
  },

  async getUnread(userId) {
    return query(
      `SELECT id, type, title, body, metadata, created_at
       FROM notifications WHERE user_id = ? AND read_at IS NULL
       ORDER BY created_at DESC LIMIT 50`,
      [userId]
    );
  },

  async getAll(userId, { limit = 30, offset = 0 } = {}) {
    const safeLimit  = Math.min(Math.max(parseInt(limit)  || 30, 1), 100);
    const safeOffset = Math.max(parseInt(offset) || 0, 0);
    return query(
      `SELECT id, type, title, body, metadata, read_at, created_at
       FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`,
      [userId]
    );
  },

  async markAllRead(userId) {
    await query(
      'UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL',
      [userId]
    );
  },

  async markRead(notificationId, userId) {
    await query(
      'UPDATE notifications SET read_at = NOW() WHERE id = ? AND user_id = ?',
      [notificationId, userId]
    );
  },

  async countUnread(userId) {
    const rows = await query(
      'SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND read_at IS NULL',
      [userId]
    );
    return Number(rows[0]?.cnt ?? 0);
  },
};

module.exports = NotificationService;
