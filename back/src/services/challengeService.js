/**
 * ChallengeService — Wagered match lifecycle.
 *
 * Flow:
 *   createChallenge  → locks creator funds, creates open challenge
 *   acceptChallenge  → locks opponent funds, challenge → accepted, game starts
 *   cancelChallenge  → refunds creator, challenge → cancelled
 *   expireOldChallenges → refunds expired open challenges (run periodically)
 *   settleChallengeGame → called by game engine on game over
 */
const { v4: uuidv4 } = require('uuid');
const { withTransaction, query } = require('../config/database');
const WalletService = require('./walletService');
const logger = require('../config/logger');

const CHALLENGE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const ChallengeService = {
  /**
   * Create a new reto.
   * Atomically locks creator funds and creates the challenge record.
   */
  async createChallenge({ creatorId, amount, isPrivate = false, opponentId = null, gameConfig = {} }) {
    const n = parseFloat(amount);
    if (!isFinite(n) || n <= 0) throw new Error('Invalid amount');

    const challengeId = uuidv4();
    const expiresAt   = new Date(Date.now() + CHALLENGE_TTL_MS);
    const reference   = `challenge:${challengeId}`;

    return withTransaction(async (conn) => {
      // Lock creator's funds (may throw if insufficient)
      const creatorTxId = await WalletService.lockFunds(creatorId, n, reference, conn);

      await conn.execute(
        `INSERT INTO challenges
           (id, creator_id, opponent_id, amount, is_private, game_config, creator_tx_id, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          challengeId,
          creatorId,
          opponentId || null,
          n,
          isPrivate ? 1 : 0,
          JSON.stringify(gameConfig),
          creatorTxId,
          expiresAt,
        ]
      );

      return { challengeId, amount: n, expiresAt };
    });
  },

  /**
   * Accept an open challenge.
   * Atomically locks opponent's funds, creates a room, updates challenge status.
   * Returns everything needed to start the game.
   */
  async acceptChallenge({ challengeId, opponentId }) {
    return withTransaction(async (conn) => {
      // Fetch and lock challenge row
      const [rows] = await conn.execute(
        'SELECT * FROM challenges WHERE id = ? FOR UPDATE',
        [challengeId]
      );
      if (!rows.length) throw new Error('Challenge not found');
      const ch = rows[0];

      if (ch.status !== 'open') throw new Error(`Challenge is already ${ch.status}`);
      if (new Date() > new Date(ch.expires_at)) throw new Error('Challenge has expired');
      if (ch.creator_id === opponentId)  throw new Error('Cannot accept your own challenge');
      if (ch.opponent_id && ch.opponent_id !== opponentId) {
        throw new Error('This challenge is for a specific player');
      }

      const amount    = parseFloat(ch.amount);
      const roomId    = uuidv4();
      const reference = `challenge:${challengeId}`;

      // Lock opponent funds
      const opponentTxId = await WalletService.lockFunds(opponentId, amount, reference, conn);

      await conn.execute(
        `UPDATE challenges
         SET status = 'accepted', opponent_id = ?, opponent_tx_id = ?, room_id = ?
         WHERE id = ?`,
        [opponentId, opponentTxId, roomId, challengeId]
      );

      return {
        roomId,
        amount,
        creatorId:      ch.creator_id,
        opponentId,
        commissionRate: parseFloat(ch.commission_rate),
        gameConfig:     ch.game_config ? JSON.parse(ch.game_config) : {},
      };
    });
  },

  /**
   * Cancel an open challenge (only creator, only while open).
   * Refunds creator funds.
   */
  async cancelChallenge(challengeId, userId) {
    // First verify ownership outside transaction for a clear error message
    const [rows] = await query('SELECT * FROM challenges WHERE id = ?', [challengeId]);
    if (!rows || !rows.length) throw new Error('Challenge not found');
    const ch = rows[0];
    if (ch.creator_id !== userId)  throw new Error('Only the creator can cancel this challenge');
    if (ch.status !== 'open')      throw new Error(`Cannot cancel — challenge is ${ch.status}`);

    await withTransaction(async (conn) => {
      const [locked] = await conn.execute(
        "SELECT status FROM challenges WHERE id = ? FOR UPDATE", [challengeId]
      );
      if (!locked.length || locked[0].status !== 'open') {
        throw new Error('Challenge status changed — cannot cancel');
      }
      await conn.execute(
        "UPDATE challenges SET status = 'cancelled' WHERE id = ?", [challengeId]
      );
    });

    // Refund outside the lock to avoid long tx (lockFunds doesn't need the challenge lock)
    await WalletService.refundLocked(userId, parseFloat(ch.amount), `challenge_cancelled:${challengeId}`);
  },

  /**
   * Expire open challenges past their deadline and refund creators.
   * Safe to call repeatedly (idempotent via status check).
   */
  async expireOldChallenges() {
    const expired = await query(
      "SELECT id, creator_id, amount FROM challenges WHERE status = 'open' AND expires_at < NOW()"
    );
    let count = 0;
    for (const ch of expired) {
      try {
        // Try to flip status atomically
        const changed = await withTransaction(async (conn) => {
          const [row] = await conn.execute(
            "SELECT status FROM challenges WHERE id = ? FOR UPDATE", [ch.id]
          );
          if (!row.length || row[0].status !== 'open') return false;
          await conn.execute(
            "UPDATE challenges SET status = 'expired' WHERE id = ?", [ch.id]
          );
          return true;
        });

        if (changed) {
          await WalletService.refundLocked(
            ch.creator_id, parseFloat(ch.amount), `challenge_expired:${ch.id}`
          );
          count++;
        }
      } catch (err) {
        logger.error(`Failed to expire challenge ${ch.id}: ${err.message}`);
      }
    }
    return count;
  },

  /**
   * Settle the wallet after a wagered game finishes.
   * Returns settlement info or null if this room has no associated challenge.
   */
  async settleChallengeGame({ roomId, winnerId }) {
    const rows = await query(
      "SELECT * FROM challenges WHERE room_id = ? AND status = 'accepted'",
      [roomId]
    );
    if (!rows.length) return null; // not a wagered game — nothing to do

    const ch = rows[0];
    const loserId = ch.creator_id === winnerId ? ch.opponent_id : ch.creator_id;

    const result = await WalletService.settleGame({
      winnerId,
      loserId,
      betAmount:      parseFloat(ch.amount),
      commissionRate: parseFloat(ch.commission_rate),
      challengeId:    ch.id,
    });

    await query(
      "UPDATE challenges SET status = 'finished', winner_id = ? WHERE id = ?",
      [winnerId, ch.id]
    );

    return result; // { prize, commission }
  },

  /** Get open (public) challenges, optionally by amount range */
  async listOpen({ minAmount = 0, maxAmount = 999999, limit = 20 } = {}) {
    return query(
      `SELECT c.id, c.amount, c.commission_rate, c.expires_at, c.game_config,
              u.username AS creator_username, u.avatar AS creator_avatar,
              r.elo AS creator_elo
       FROM challenges c
       JOIN usuarios u ON u.id = c.creator_id
       LEFT JOIN ranking r ON r.user_id = c.creator_id
       WHERE c.status = 'open' AND c.is_private = 0
         AND c.amount BETWEEN ? AND ? AND c.expires_at > NOW()
       ORDER BY c.created_at DESC LIMIT ?`,
      [minAmount, maxAmount, Math.min(parseInt(limit) || 20, 50)]
    );
  },
};

module.exports = ChallengeService;
