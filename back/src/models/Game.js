const { query } = require('../config/database');

const Game = {
  async create({ roomId, player1Id, player2Id }) {
    const result = await query(
      'INSERT INTO partidas (room_id, player1_id, player2_id, state, started_at) VALUES (?, ?, ?, ?, NOW())',
      [roomId, player1Id, player2Id, 'playing']
    );
    return result.insertId;
  },

  /**
   * Partida normal con ganador.
   * @param {{ roomId, winnerId, scoreP1, scoreP2, finishReason?: string|null }} p
   */
  async finish({ roomId, winnerId, scoreP1, scoreP2, finishReason = 'completed' }) {
    const header = await query(
      `UPDATE partidas
       SET state = 'finished',
           status = 'finished',
           winner_id = ?,
           score_p1 = ?,
           score_p2 = ?,
           finished_at = NOW(),
           p1_disconnected_at = NULL,
           p2_disconnected_at = NULL,
           p1_reconnect_deadline_at = NULL,
           p2_reconnect_deadline_at = NULL,
           requires_admin_resolution = 0,
           finish_reason = ?
       WHERE room_id = ?
         AND winner_id IS NULL
         AND finished_at IS NULL`,
      [winnerId, scoreP1, scoreP2, finishReason || 'completed', roomId]
    );
    return Number(header?.affectedRows ?? 0);
  },

  /**
   * Cierra sin ganador deportivo (doble desconexión, anulación segura).
   */
  async closeWithoutWinner({
    roomId,
    status = 'cancelled',
    finishReason = 'both_disconnected',
    requiresAdminResolution = false,
  }) {
    await query(
      `UPDATE partidas
       SET state = 'finished',
           status = ?,
           winner_id = NULL,
           finished_at = NOW(),
           p1_disconnected_at = NULL,
           p2_disconnected_at = NULL,
           p1_reconnect_deadline_at = NULL,
           p2_reconnect_deadline_at = NULL,
           finish_reason = ?,
           requires_admin_resolution = ?
       WHERE room_id = ?
         AND winner_id IS NULL
         AND finished_at IS NULL`,
      [status, finishReason, requiresAdminResolution ? 1 : 0, roomId]
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
