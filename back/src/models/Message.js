const { query } = require('../config/database');

const Message = {
  /**
   * Persist a private message between two users.
   */
  async create(senderId, receiverId, content) {
    if (!content || content.trim().length === 0) throw new Error('Empty message');
    const sanitized = content.trim().substring(0, 1000); // max 1000 chars
    const result = await query(
      'INSERT INTO private_messages (sender_id, receiver_id, content) VALUES (?, ?, ?)',
      [senderId, receiverId, sanitized]
    );
    return {
      id:          result.insertId,
      sender_id:   senderId,
      receiver_id: receiverId,
      content:     sanitized,
      created_at:  new Date().toISOString(),
    };
  },

  /**
   * Conversation between two users, newest-first.
   */
  async getConversation(userId1, userId2, { limit = 50, before = null } = {}) {
    limit = Math.min(Math.max(parseInt(limit) || 50, 1), 100);
    const params = [userId1, userId2, userId2, userId1];
    let sql = `
      SELECT id, sender_id, receiver_id, content, read_at, created_at
      FROM private_messages
      WHERE (sender_id = ? AND receiver_id = ?)
         OR (sender_id = ? AND receiver_id = ?)`;
    if (before) {
      sql += ' AND id < ?';
      params.push(parseInt(before));
    }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);
    return query(sql, params);
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
};

module.exports = Message;
