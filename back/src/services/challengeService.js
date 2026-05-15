/**
 * ChallengeService — Wagered match lifecycle + retos entre amigos (clásico / competitivo).
 *
 * Flow:
 *   createChallenge  → locks creator funds, creates open challenge
 *   createClassicFriendChallenge → amount 0, amistoso, sin wallet
 *   acceptChallenge  → locks opponent funds (si amount > 0), room_id
 *   cancelChallenge  → refunds creator (si amount > 0)
 *   rejectChallenge  → invitee rejects; refund creator if había apuesta
 *   expireOldChallenges → refunds expired open challenges
 *   settleChallengeGame → legacy helper (juegos por challenge legacy)
 */
const { v4: uuidv4 } = require('uuid');
const { withTransaction, query } = require('../config/database');
const WalletService = require('./walletService');
const VerificationService = require('./verificationService');
const { getActiveGameForUser } = require('../utils/activeGame');
const logger = require('../config/logger');

const CHALLENGE_TTL_MS = 10 * 60 * 1000; // 10 minutes — retos públicos
const FRIEND_CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes — retos a un amigo
const MIN_BET = 2500;
const COMMISSION = 0.10;

function calcPrizeFromAmount(amount) {
  const pool = parseFloat(amount) * 2;
  const commission = parseFloat((pool * COMMISSION).toFixed(2));
  const prize = parseFloat((pool - commission).toFixed(2));
  return { prize, commission };
}

async function assertNoActivePartida(userId) {
  const active = await getActiveGameForUser(userId);
  if (active) {
    logger.warn('active game check blocked user', {
      userId,
      roomId: active.room_id,
      state: active.state,
      status: active.status,
      winner_id: active.winner_id,
      finished_at: active.finished_at,
    });
    throw new Error('No podés retar mientras estás en una partida activa');
  }
}

const ChallengeService = {
  /**
   * Reto competitivo con apuesta (público o duelo a amigo con is_private + opponentId).
   * Si friendDuel=true: TTL 5 min, source=friend_challenge, challenged_id=opponentId.
   */
  async createChallenge({
    creatorId,
    amount,
    isPrivate = false,
    opponentId = null,
    gameConfig = {},
    friendDuel = false,
  }) {
    const n = parseFloat(amount);
    if (!isFinite(n) || n <= 0) throw new Error('Invalid amount');
    if (n < MIN_BET) throw new Error(`El monto mínimo para apostar es ${MIN_BET} créditos`);

    await assertNoActivePartida(creatorId);
    await VerificationService.requireVerifiedAdult(creatorId);

    const challengeId = uuidv4();
    const ttl = friendDuel ? FRIEND_CHALLENGE_TTL_MS : CHALLENGE_TTL_MS;
    const expiresAt = new Date(Date.now() + ttl);
    const reference = `challenge:${challengeId}`;
    const { prize } = calcPrizeFromAmount(n);

    const normalizedConfig = {
      puntosMaximos: Number(gameConfig.puntosMaximos) === 15 ? 15 : 30,
      florHabilitada: !!gameConfig.florHabilitada,
      modo: 'apuesta',
      turnTimeoutSecs: gameConfig.turnTimeoutSecs ?? 30,
      reconnectGraceSecs: gameConfig.reconnectGraceSecs ?? 60,
      friendChallengeMode: friendDuel ? 'competitive' : undefined,
    };

    return withTransaction(async (conn) => {
      const creatorTxId = await WalletService.lockFunds(creatorId, n, reference, conn);

      if (friendDuel && opponentId) {
        const challenged = parseInt(opponentId, 10);
        await conn.execute(
          `INSERT INTO challenges
             (id, creator_id, opponent_id, challenged_id, amount, commission_rate, is_private,
              game_config, creator_tx_id, expires_at, source, invite_type, prize_amount)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'friend_challenge', 'friend_duel', ?)`,
          [
            challengeId,
            creatorId,
            challenged,
            challenged,
            n,
            COMMISSION,
            1,
            JSON.stringify(normalizedConfig),
            creatorTxId,
            expiresAt,
            prize,
          ]
        );
      } else {
        await conn.execute(
          `INSERT INTO challenges
             (id, creator_id, opponent_id, amount, commission_rate, is_private, game_config, creator_tx_id, expires_at, prize_amount)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            challengeId,
            creatorId,
            opponentId || null,
            n,
            COMMISSION,
            isPrivate ? 1 : 0,
            JSON.stringify(normalizedConfig),
            creatorTxId,
            expiresAt,
            prize,
          ]
        );
      }

      return { challengeId, amount: n, expiresAt };
    });
  },

  /**
   * Partida amistosa 1v1 entre amigos — sin apuesta ni movimientos de wallet.
   */
  async createClassicFriendChallenge({ creatorId, challengedId, gameConfig = {} }) {
    const Friend = require('../models/Friend');
    const cid = parseInt(challengedId, 10);
    if (!Number.isFinite(cid) || cid <= 0) throw new Error('Destinatario inválido');
    if (Number(creatorId) === cid) throw new Error('No podés retarte a vos mismo');
    const ok = await Friend.areFriends(creatorId, cid);
    if (!ok) throw new Error('Solo podés retar a amigos');

    await assertNoActivePartida(creatorId);
    await assertNoActivePartida(cid);

    const challengeId = uuidv4();
    const expiresAt = new Date(Date.now() + FRIEND_CHALLENGE_TTL_MS);
    const cfg = {
      puntosMaximos: Number(gameConfig.puntosMaximos) === 15 ? 15 : 30,
      florHabilitada: !!gameConfig.florHabilitada,
      modo: 'casual',
      friendChallengeMode: 'classic',
      turnTimeoutSecs: gameConfig.turnTimeoutSecs ?? 30,
      reconnectGraceSecs: gameConfig.reconnectGraceSecs ?? 60,
    };

    await withTransaction(async (conn) => {
      await conn.execute(
        `INSERT INTO challenges
           (id, creator_id, opponent_id, challenged_id, amount, commission_rate, is_private,
            game_config, creator_tx_id, expires_at, status, source, invite_type, prize_amount)
         VALUES (?, ?, ?, ?, 0, 0, 1, ?, NULL, ?, 'open', 'friend_challenge', 'friend_duel', 0)`,
        [challengeId, creatorId, cid, cid, JSON.stringify(cfg), expiresAt]
      );
    });

    return { challengeId, expiresAt };
  },

  async acceptChallenge({ challengeId, opponentId }) {
    return withTransaction(async (conn) => {
      const [rows] = await conn.execute(
        'SELECT * FROM challenges WHERE id = ? FOR UPDATE',
        [challengeId]
      );
      if (!rows.length) throw new Error('Challenge not found');
      const ch = rows[0];

      if (ch.status !== 'open') throw new Error(`Challenge is already ${ch.status}`);
      if (new Date() > new Date(ch.expires_at)) throw new Error('Challenge has expired');
      if (ch.creator_id === opponentId) throw new Error('Cannot accept your own challenge');
      if (ch.opponent_id && Number(ch.opponent_id) !== Number(opponentId)) {
        throw new Error('This challenge is for a specific player');
      }
      if (ch.challenged_id && Number(ch.challenged_id) !== Number(opponentId)) {
        throw new Error('Este reto no es para vos');
      }

      await assertNoActivePartida(opponentId);

      const amount = parseFloat(ch.amount);
      if (amount > 0) {
        await VerificationService.requireVerifiedAdult(opponentId);
      }

      const roomId = uuidv4();
      const reference = `challenge:${challengeId}`;

      let opponentTxId = null;
      if (amount > 0) {
        opponentTxId = await WalletService.lockFunds(opponentId, amount, reference, conn);
      }

      await conn.execute(
        `UPDATE challenges
         SET status = 'accepted', opponent_id = ?, opponent_tx_id = ?, room_id = ?
         WHERE id = ?`,
        [opponentId, opponentTxId, roomId, challengeId]
      );

      return {
        battleId: challengeId,
        roomId,
        amount,
        creatorId: ch.creator_id,
        opponentId,
        commissionRate: parseFloat(ch.commission_rate),
        gameConfig: typeof ch.game_config === 'string' ? JSON.parse(ch.game_config) : (ch.game_config || {}),
      };
    });
  },

  async cancelChallenge(challengeId, userId) {
    const rows = await query('SELECT * FROM challenges WHERE id = ?', [challengeId]);
    if (!rows || !rows.length) throw new Error('Challenge not found');
    const ch = rows[0];
    if (ch.creator_id !== userId) throw new Error('Only the creator can cancel this challenge');
    if (ch.status !== 'open') throw new Error(`Cannot cancel — challenge is ${ch.status}`);

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

    const amt = parseFloat(ch.amount);
    if (amt > 0) {
      await WalletService.refundLocked(userId, amt, `challenge_cancelled:${challengeId}`);
    }
  },

  /**
   * El invitado rechaza un reto abierto (no aplica al creador — usa cancel).
   */
  async rejectChallenge(challengeId, userId) {
    const rows = await query('SELECT * FROM challenges WHERE id = ?', [challengeId]);
    if (!rows || !rows.length) throw new Error('Challenge not found');
    const ch = rows[0];
    if (ch.status !== 'open') throw new Error(`No se puede rechazar — estado ${ch.status}`);
    const invitee = ch.opponent_id != null ? Number(ch.opponent_id) : null;
    const challenged = ch.challenged_id != null ? Number(ch.challenged_id) : null;
    const okUser = (invitee && invitee === Number(userId)) || (challenged && challenged === Number(userId));
    if (!okUser) throw new Error('No podés rechazar este reto');

    await withTransaction(async (conn) => {
      const [locked] = await conn.execute(
        "SELECT status FROM challenges WHERE id = ? FOR UPDATE", [challengeId]
      );
      if (!locked.length || locked[0].status !== 'open') {
        throw new Error('El reto ya no está pendiente');
      }
      await conn.execute(
        "UPDATE challenges SET status = 'rejected' WHERE id = ?", [challengeId]
      );
    });

    const amt = parseFloat(ch.amount);
    if (amt > 0) {
      await WalletService.refundLocked(ch.creator_id, amt, `challenge_rejected:${challengeId}`);
    }

    try {
      const NotificationService = require('./notificationService');
      NotificationService.emitToUser(ch.creator_id, 'friend_challenge:updated', {
        challengeId,
        status: 'rejected',
        toastFor: 'creator',
      });
      NotificationService.emitToUser(Number(userId), 'friend_challenge:updated', {
        challengeId,
        status: 'rejected',
      });
    } catch (_) {
      /* ignore */
    }
  },

  async expireOldChallenges() {
    const expired = await query(
      "SELECT id, creator_id, amount FROM challenges WHERE status = 'open' AND expires_at < NOW()"
    );
    let count = 0;
    for (const ch of expired) {
      try {
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
          const amt = parseFloat(ch.amount);
          if (amt > 0) {
            await WalletService.refundLocked(
              ch.creator_id, amt, `challenge_expired:${ch.id}`
            );
          }
          count++;
        }
      } catch (err) {
        logger.error(`Failed to expire challenge ${ch.id}: ${err.message}`);
      }
    }
    return count;
  },

  /** Retos pendientes donde el usuario es el invitado (oponente designado). */
  async listPendingFriendForUser(userId) {
    const uid = parseInt(userId, 10);
    return query(
      `SELECT c.*, u.username AS creator_username, u.avatar AS creator_avatar
       FROM challenges c
       JOIN usuarios u ON u.id = c.creator_id
       WHERE c.status = 'open' AND c.expires_at > NOW()
         AND (c.source = 'friend_challenge' OR c.invite_type = 'friend_duel')
         AND (c.opponent_id = ? OR c.challenged_id = ?)
       ORDER BY c.created_at DESC LIMIT 10`,
      [uid, uid]
    );
  },

  /**
   * Retos entre dos amigos (historial reciente de la conversación).
   */
  async listFriendChallengesBetweenUsers(userId, peerId) {
    const uid = parseInt(userId, 10);
    const pid = parseInt(peerId, 10);
    if (!Number.isFinite(uid) || !Number.isFinite(pid)) return [];
    return query(
      `SELECT c.*,
              cr.username AS creator_username, cr.avatar AS creator_avatar
       FROM challenges c
       JOIN usuarios cr ON cr.id = c.creator_id
       WHERE (c.source = 'friend_challenge' OR c.invite_type = 'friend_duel')
         AND (
           (c.creator_id = ? AND (c.challenged_id = ? OR c.opponent_id = ?))
           OR (c.creator_id = ? AND (c.challenged_id = ? OR c.opponent_id = ?))
         )
       ORDER BY c.created_at DESC
       LIMIT 40`,
      [uid, pid, pid, pid, uid, uid]
    );
  },

  async settleChallengeGame({ roomId, winnerId }) {
    const rows = await query(
      "SELECT * FROM challenges WHERE room_id = ? AND status IN ('accepted','active')",
      [roomId]
    );
    if (!rows.length) return null;

    const ch = rows[0];
    const bet = parseFloat(ch.amount);
    const loserId = ch.creator_id === winnerId ? ch.opponent_id : ch.creator_id;

    if (bet <= 0) {
      await query(
        "UPDATE challenges SET status = 'finished', winner_id = ? WHERE id = ?",
        [winnerId, ch.id]
      );
      return { prize: 0, commission: 0, casual: true };
    }

    const result = await WalletService.settleGame({
      winnerId,
      loserId,
      betAmount: bet,
      commissionRate: parseFloat(ch.commission_rate),
      challengeId: ch.id,
    });

    await query(
      "UPDATE challenges SET status = 'finished', winner_id = ? WHERE id = ?",
      [winnerId, ch.id]
    );

    return result;
  },

  async listOpen({ minAmount = 0, maxAmount = 999999, limit = 20 } = {}) {
    const safeLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 50);
    return query(
      `SELECT c.id, c.amount, c.commission_rate, c.expires_at, c.game_config,
              u.username AS creator_username, u.avatar AS creator_avatar,
              r.elo AS creator_elo
       FROM challenges c
       JOIN usuarios u ON u.id = c.creator_id
       LEFT JOIN ranking r ON r.user_id = c.creator_id
       WHERE c.status = 'open' AND c.is_private = 0
         AND c.source = 'public_room'
         AND c.amount BETWEEN ? AND ? AND c.expires_at > NOW()
       ORDER BY c.created_at DESC LIMIT ${safeLimit}`,
      [minAmount, maxAmount]
    );
  },
};

module.exports = ChallengeService;
