const { query } = require('../config/database');

/** Normalize a DB row to a consistent payload shape. */
function normalizeRow(r) {
  return {
    id:         r.id,
    from:       {
      id:       r.sender_id,
      username: r.sender_username || null,
      avatar:   r.sender_avatar || null,
    },
    to:         { id: r.receiver_id },
    text:       r.content,
    // backward-compat aliases
    senderId:   r.sender_id,
    content:    r.content,
    createdAt:  r.created_at,
    created_at: r.created_at,
    readAt:     r.read_at,
    read_at:    r.read_at,
  };
}

const Message = {
  /**
   * Persist a private message between two users.
   */
  async create(senderId, receiverId, content) {
    if (!content || content.trim().length === 0) throw new Error('Empty message');
    const sanitized = content.trim().substring(0, 1000);
    const result = await query(
      'INSERT INTO private_messages (sender_id, receiver_id, content) VALUES (?, ?, ?)',
      [senderId, receiverId, sanitized]
    );
    return normalizeRow({
      id:          result.insertId,
      sender_id:   senderId,
      receiver_id: receiverId,
      content:     sanitized,
      created_at:  new Date().toISOString(),
      read_at:     null,
    });
  },

  /**
   * Conversation between two users, oldest-first (correct chat order).
   */
  async getConversation(userId1, userId2, { limit = 50, before = null } = {}) {
    const safeLimit = Math.min(Math.max(Math.floor(Number(limit)) || 50, 1), 100);
    const params = [userId1, userId2, userId2, userId1];
    let sql = `
      SELECT pm.id, pm.sender_id, pm.receiver_id, pm.content, pm.read_at, pm.created_at,
             su.username AS sender_username, su.avatar AS sender_avatar
      FROM private_messages pm
      JOIN usuarios su ON su.id = pm.sender_id
      WHERE (pm.sender_id = ? AND pm.receiver_id = ?)
         OR (pm.sender_id = ? AND pm.receiver_id = ?)`;
    if (before) {
      sql += ' AND pm.id < ?';
      params.push(parseInt(before));
    }
    sql += ` ORDER BY created_at DESC LIMIT ${safeLimit}`;
    const rows = await query(sql, params);
    // Reverse so oldest message is first (correct chronological display)
    return rows.reverse().map(normalizeRow);
  },

  /** Mark all messages from sender to receiver as read */
  async markRead(senderId, receiverId) {
    await query(
      'UPDATE private_messages SET read_at = NOW() WHERE sender_id = ? AND receiver_id = ? AND read_at IS NULL',
      [senderId, receiverId]
    );
  },

  /** Count unread messages for a user */
  async unreadCount(userId) {
    const rows = await query(
      'SELECT COUNT(*) AS cnt FROM private_messages WHERE receiver_id = ? AND read_at IS NULL',
      [userId]
    );
    return Number(rows[0]?.cnt ?? 0);
  },

  /**
   * Per-sender unread counts for a user.
   * Returns { unreadByUser: { "5": 2, "9": 1 }, totalUnread: 3 }
   */
  async unreadSummary(userId) {
    const rows = await query(
      `SELECT sender_id, COUNT(*) AS cnt
       FROM private_messages
       WHERE receiver_id = ? AND read_at IS NULL
       GROUP BY sender_id`,
      [userId]
    );
    const unreadByUser = {};
    let totalUnread = 0;
    for (const r of rows) {
      unreadByUser[r.sender_id] = Number(r.cnt);
      totalUnread += Number(r.cnt);
    }
    return { unreadByUser, totalUnread };
  },
};

module.exports = Message;
