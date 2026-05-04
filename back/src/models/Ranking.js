const { query } = require('../config/database');

// mysql2 may return BigInt for COUNT(*) — always normalize to Number
const num = (v) => (v == null ? null : Number(v));

const Ranking = {
  async getGlobal(limit = 50) {
    const rows = await query(
      `SELECT r.elo, r.wins, r.losses, r.draws, u.username, u.id as userId
       FROM ranking r
       JOIN usuarios u ON u.id = r.user_id
       ORDER BY r.elo DESC
       LIMIT ?`,
      [limit]
    );
    return rows.map(r => ({ ...r, elo: num(r.elo), wins: num(r.wins), losses: num(r.losses), draws: num(r.draws), userId: num(r.userId) }));
  },

  async getByUserId(userId) {
    const rows = await query('SELECT * FROM ranking WHERE user_id = ?', [userId]);
    if (!rows[0]) return null;
    const r = rows[0];
    return { id: num(r.id), user_id: num(r.user_id), elo: num(r.elo), wins: num(r.wins), losses: num(r.losses), draws: num(r.draws) };
  },

  async initForUser(userId) {
    await query(
      'INSERT IGNORE INTO ranking (user_id, elo, wins, losses, draws) VALUES (?, 1000, 0, 0, 0)',
      [userId]
    );
  },

  async updateAfterGame({ winnerId, loserId, newWinnerElo, newLoserElo }) {
    await query(
      'UPDATE ranking SET elo = ?, wins = wins + 1 WHERE user_id = ?',
      [newWinnerElo, winnerId]
    );
    await query(
      'UPDATE ranking SET elo = ?, losses = losses + 1 WHERE user_id = ?',
      [newLoserElo, loserId]
    );
  },

  async getUserRank(userId) {
    const check = await query('SELECT elo FROM ranking WHERE user_id = ?', [userId]);
    if (!check.length) return null;
    const rows = await query(
      'SELECT COUNT(*) AS cnt FROM ranking WHERE elo > ?',
      [check[0].elo]
    );
    return num(rows[0]?.cnt ?? 0) + 1;
  },
};

module.exports = Ranking;
