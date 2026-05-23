const { query } = require('../config/database');

const Friend = {
  /**
   * Send a friend request from `fromId` to `toId`.
   * Inserts two rows (canonical pair) if not already present.
   */
  async sendRequest(fromId, toId) {
    if (fromId === toId) throw new Error('Cannot add yourself as a friend');

    // Use smaller id as user_id for the canonical row
    const [u, f] = fromId < toId ? [fromId, toId] : [toId, fromId];

    await query(
      `INSERT INTO friends (user_id, friend_id, status, requested_by)
       VALUES (?, ?, 'pending', ?)
       ON DUPLICATE KEY UPDATE
         status = IF(status = 'blocked', status, 'pending'),
         requested_by = VALUES(requested_by)`,
      [u, f, fromId]
    );
  },

  async acceptRequest(fromId, toId) {
    const [u, f] = fromId < toId ? [fromId, toId] : [toId, fromId];
    const result = await query(
      `UPDATE friends SET status = 'accepted'
       WHERE user_id = ? AND friend_id = ? AND status = 'pending' AND requested_by = ?`,
      [u, f, fromId]   // fromId is the one who *receives* the request (opposite of requested_by)
    );
    // The receiver of the request accepts: requested_by is the *sender*, so receiver is the other user
    if (result.affectedRows === 0) {
      // Try the other direction
      const res2 = await query(
        `UPDATE friends SET status = 'accepted'
         WHERE user_id = ? AND friend_id = ? AND status = 'pending' AND requested_by != ?`,
        [u, f, fromId]
      );
      if (res2.affectedRows === 0) throw new Error('No pending request to accept');
    }
  },

  async remove(userId, friendId) {
    const [u, f] = userId < friendId ? [userId, friendId] : [friendId, userId];
    await query('DELETE FROM friends WHERE user_id = ? AND friend_id = ?', [u, f]);
  },

  async getList(userId) {
    return query(
      `SELECT u.id, u.username, u.avatar, r.elo,
              f.status, f.created_at, f.requested_by
       FROM friends f
       JOIN usuarios u ON u.id = IF(f.user_id = ?, f.friend_id, f.user_id)
       LEFT JOIN ranking r ON r.user_id = u.id
       WHERE (f.user_id = ? OR f.friend_id = ?) AND f.status = 'accepted'`,
      [userId, userId, userId]
    );
  },

  async getPendingReceived(userId) {
    return query(
      `SELECT u.id, u.username, u.avatar, r.elo, f.created_at
       FROM friends f
       JOIN usuarios u ON u.id = f.requested_by
       LEFT JOIN ranking r ON r.user_id = u.id
       WHERE (f.user_id = ? OR f.friend_id = ?)
         AND f.status = 'pending' AND f.requested_by != ?`,
      [userId, userId, userId]
    );
  },

  async areFriends(userId1, userId2) {
    const [u, f] = userId1 < userId2 ? [userId1, userId2] : [userId2, userId1];
    const rows = await query(
      "SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ? AND status = 'accepted'",
      [u, f]
    );
    return rows.length > 0;
  },

  async getRelationship(userId1, userId2) {
    const [u, f] = userId1 < userId2 ? [userId1, userId2] : [userId2, userId1];
    const rows = await query(
      'SELECT status, requested_by FROM friends WHERE user_id = ? AND friend_id = ?',
      [u, f]
    );
    return rows[0] || null;
  },

  /**
   * Friendship from viewer's perspective toward target.
   * @returns {'self'|'friends'|'none'|'request_sent'|'request_received'|'blocked'}
   */
  async getFriendshipStatus(viewerId, targetId) {
    const v = Number(viewerId);
    const t = Number(targetId);
    if (!v || !t) return 'none';
    if (v === t) return 'self';
    const rel = await Friend.getRelationship(v, t);
    if (!rel) return 'none';
    if (rel.status === 'accepted') return 'friends';
    if (rel.status === 'blocked') return 'blocked';
    if (rel.status === 'pending') {
      return Number(rel.requested_by) === v ? 'request_sent' : 'request_received';
    }
    return 'none';
  },

  /** Outgoing pending requests (I am the sender). */
  async getPendingSent(userId) {
    return query(
      `SELECT u.id, u.username, u.avatar, r.elo, f.created_at,
              IF(f.user_id = f.requested_by, f.friend_id, f.user_id) AS to_user_id
       FROM friends f
       JOIN usuarios u ON u.id = IF(f.user_id = f.requested_by, f.friend_id, f.user_id)
       LEFT JOIN ranking r ON r.user_id = u.id
       WHERE f.status = 'pending'
         AND f.requested_by = ?
         AND u.id != ?`,
      [userId, userId]
    );
  },
};

module.exports = Friend;
