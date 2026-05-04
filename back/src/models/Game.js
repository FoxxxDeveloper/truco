const { query } = require('../config/database');

const Game = {
  async create({ roomId, player1Id, player2Id }) {
    const result = await query(
      'INSERT INTO partidas (room_id, player1_id, player2_id, state, started_at) VALUES (?, ?, ?, ?, NOW())',
      [roomId, player1Id, player2Id, 'playing']
    );
    return result.insertId;
  },

  async finish({ roomId, winnerId, scoreP1, scoreP2 }) {
    await query(
      'UPDATE partidas SET state = ?, winner_id = ?, score_p1 = ?, score_p2 = ?, finished_at = NOW() WHERE room_id = ?',
      ['finished', winnerId, scoreP1, scoreP2, roomId]
    );
  },

  async addRoundHistory({ roomId, roundNumber, winnerId, trucoValue, envidoPtsP1, envidoPtsP2 }) {
    const rows = await query('SELECT id FROM partidas WHERE room_id = ?', [roomId]);
    if (!rows.length) return;
    const partidaId = rows[0].id;
    await query(
      'INSERT INTO historial_partidas (partida_id, round_number, winner_id, truco_value, envido_points_p1, envido_points_p2) VALUES (?, ?, ?, ?, ?, ?)',
      [partidaId, roundNumber, winnerId, trucoValue, envidoPtsP1, envidoPtsP2]
    );
  },

  async findByRoomId(roomId) {
    const rows = await query('SELECT * FROM partidas WHERE room_id = ?', [roomId]);
    return rows[0] || null;
  },
};

module.exports = Game;
