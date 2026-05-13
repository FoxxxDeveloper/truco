const { query } = require('../config/database');

const GeneralMessage = {
  /**
   * Save a general chat message.
   */
  async create(userId, content) {
    const safe = content.trim().substring(0, 500);
    const result = await query(
      'INSERT INTO general_messages (user_id, content) VALUES (?, ?)',
      [userId, safe]
    );
    return { id: result.insertId, userId, content: safe, createdAt: new Date().toISOString() };
  },

  /**
   * Fetch recent messages with sender info, oldest-first.
   */
  async getRecent(limit = 50) {
    // mysql2 execute() + LIMIT ? can throw "Incorrect arguments to mysqld_stmt_execute"
    // on some MySQL builds — same pattern as Ranking.getGlobal.
    const safeLimit = Math.min(Math.max(Math.floor(Number(limit)) || 50, 1), 100);
    const rows = await query(
      `SELECT gm.id, gm.content, gm.created_at,
              u.id AS user_id, u.username, u.avatar
       FROM general_messages gm
       JOIN usuarios u ON u.id = gm.user_id
       ORDER BY gm.created_at DESC
       LIMIT ${safeLimit}`,
      []
    );
    // Return in ASC order (oldest first for display)
    return rows.reverse().map(r => ({
      id:        r.id,
      from:      { id: r.user_id, username: r.username, avatar: r.avatar || null },
      text:      r.content,
      createdAt: r.created_at,
    }));
  },
};

module.exports = GeneralMessage;
