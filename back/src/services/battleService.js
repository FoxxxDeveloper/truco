/**
 * BattleService — Wrapper sobre challengeService con validaciones adicionales
 * para las "Batallas Competitivas".
 *
 * Reutiliza la tabla `challenges` con los campos extendidos.
 * Conceptualmente: challenge = battle room.
 */
const { v4: uuidv4 } = require('uuid');
const { withTransaction, query } = require('../config/database');
const WalletService = require('./walletService');
const VerificationService = require('./verificationService');
const NotificationService = require('./notificationService');
const logger = require('../config/logger');
const { auditLog } = require('../config/logger');

const BATTLE_TTL_MS   = 15 * 60 * 1000; // 15 minutos
const MIN_BET         = 2500;
const COMMISSION_RATE = 0.10;

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcPrize(amount) {
  const pool       = parseFloat(amount) * 2;
  const commission = parseFloat((pool * COMMISSION_RATE).toFixed(2));
  const prize      = parseFloat((pool - commission).toFixed(2));
  return { pool, commission, prize };
}

/**
 * Checks if a userId has any active game in gameSession (in-memory check is not
 * reliable across processes, so we check the DB `games` table for ongoing games).
 */
async function hasActiveGame(userId) {
  const rows = await query(
    `SELECT id FROM partidas
     WHERE (player1_id = ? OR player2_id = ?)
       AND status = 'active'
       AND challenge_id IS NOT NULL
     LIMIT 1`,
    [userId, userId]
  );
  return rows.length > 0;
}

async function hasOpenBattle(userId) {
  const rows = await query(
    "SELECT id FROM challenges WHERE creator_id = ? AND status = 'open' LIMIT 1",
    [userId]
  );
  return rows.length > 0;
}

// ── Public API ────────────────────────────────────────────────────────────────

const BattleService = {

  /**
   * Crea una nueva sala de batalla.
   * Reserva los fondos del creador (balance → reserved).
   */
  async create({ creatorId, amount, visibility = 'public', gameConfig = {} }) {
    const n = parseFloat(amount);
    if (!isFinite(n) || !Number.isInteger(n) || n < MIN_BET) {
      throw new Error(`El monto mínimo es ${MIN_BET} créditos y debe ser un número entero`);
    }

    // ✅ VERIFICATION GATE: User must be verified adult to create battles
    try {
      await VerificationService.requireVerifiedAdult(creatorId);
    } catch (err) {
      throw new Error(err.message); // Re-throw with same message
    }

    // Anti-abuse validations
    const [activeGame, openBattle] = await Promise.all([
      hasActiveGame(creatorId),
      hasOpenBattle(creatorId),
    ]);
    if (activeGame)  throw new Error('No podés crear una sala mientras estás en una partida activa');
    if (openBattle)  throw new Error('Ya tenés una sala abierta. Cancelala antes de crear otra');

    const battleId  = uuidv4();
    const expiresAt = new Date(Date.now() + BATTLE_TTL_MS);
    const ref       = `battle:${battleId}`;

    // Generate invite code for private rooms
    const inviteCode = visibility === 'private'
      ? Math.random().toString(36).slice(2, 10).toUpperCase()
      : null;

    const normalizedConfig = {
      puntosMaximos:       Number(gameConfig.puntosMaximos) === 15 ? 15 : 30,
      florHabilitada:      Boolean(gameConfig.florHabilitada),
      modo:                'apuesta',
      turnTimeoutSecs:     30,
      reconnectGraceSecs:  60,
    };

    const { prize } = calcPrize(n);

    return withTransaction(async (conn) => {
      // Lock creator funds
      const creatorTxId = await WalletService.lockFunds(creatorId, n, ref, conn);

      await conn.execute(
        `INSERT INTO challenges
           (id, creator_id, amount, commission_rate, is_private, invite_code,
            game_config, creator_tx_id, prize_amount, expires_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
        [
          battleId, creatorId, n, COMMISSION_RATE,
          visibility === 'private' ? 1 : 0,
          inviteCode,
          JSON.stringify(normalizedConfig),
          creatorTxId,
          prize,
          expiresAt,
        ]
      );

      auditLog('battle_create', { creatorId, battleId, amount: n, visibility });
      return { battleId, amount: n, prize, inviteCode, expiresAt };
    });
  },

  /**
   * Cancela una sala abierta (solo el creador, solo mientras está open).
   * El cambio de estado y la liberación del saldo reservado ocurren en una
   * única transacción SQL — si algo falla se hace rollback completo.
   */
  async cancel(battleId, userId) {
    return withTransaction(async (conn) => {
      // Lock the challenge row to prevent races with accept/expire
      const [locked] = await conn.execute(
        'SELECT id, creator_id, amount, status FROM challenges WHERE id = ? FOR UPDATE',
        [battleId]
      );
      if (!locked.length) throw new Error('Sala no encontrada');
      const b = locked[0];

      if (b.creator_id !== userId) throw new Error('Solo el creador puede cancelar la sala');
      if (b.status !== 'open')     throw new Error(`No podés cancelar una sala en estado ${b.status}`);

      // 1. Mark challenge as cancelled
      await conn.execute(
        "UPDATE challenges SET status = 'cancelled' WHERE id = ?",
        [battleId]
      );

      // 2. Release reserved funds — lock wallet row, verify reserved >= amount, refund
      const amount = parseFloat(b.amount);
      const [walletRows] = await conn.execute(
        'SELECT reserved FROM wallet WHERE user_id = ? FOR UPDATE',
        [userId]
      );
      if (!walletRows.length) throw new Error('Billetera no encontrada');
      if (parseFloat(walletRows[0].reserved) < amount) {
        throw new Error('Fondos reservados insuficientes — no se puede reembolsar');
      }

      await conn.execute(
        'UPDATE wallet SET reserved = reserved - ?, balance = balance + ? WHERE user_id = ?',
        [amount, amount, userId]
      );

      // 3. Record the refund transaction
      await conn.execute(
        `INSERT INTO transactions (user_id, type, amount, status, reference)
         VALUES (?, 'bet_refund', ?, 'completed', ?)`,
        [userId, amount, `battle_cancelled:${battleId}`]
      );

      auditLog('battle_cancel', { userId, battleId, amount });
      return { ok: true };
    });
  },

  /**
   * Acepta una sala pública. ACID — solo un usuario puede aceptar.
   * Crea la partida y devuelve roomId + info para iniciar el juego por socket.
   */
  async accept({ battleId, opponentId }) {
    // ✅ VERIFICATION GATE: User must be verified adult to accept battles
    try {
      await VerificationService.requireVerifiedAdult(opponentId);
    } catch (err) {
      throw new Error(err.message); // Re-throw with same message
    }

    return withTransaction(async (conn) => {
      // Lock row to prevent race condition
      const [rows] = await conn.execute(
        'SELECT * FROM challenges WHERE id = ? FOR UPDATE',
        [battleId]
      );
      if (!rows.length) throw new Error('Sala no encontrada');
      const b = rows[0];

      if (b.status !== 'open')      throw new Error('Sala ya aceptada, cancelada o expirada');
      if (new Date() > new Date(b.expires_at)) throw new Error('La sala expiró');
      if (b.creator_id === opponentId) throw new Error('No podés aceptar tu propia sala');
      if (b.opponent_id && b.opponent_id !== opponentId) {
        throw new Error('Esta sala es privada y no es tuya');
      }

      const amount = parseFloat(b.amount);
      const roomId = uuidv4();
      const ref    = `battle:${b.id}`;

      // Lock opponent funds
      const opponentTxId = await WalletService.lockFunds(opponentId, amount, ref, conn);

      const { prize, commission } = calcPrize(amount);
      const now = new Date();

      await conn.execute(
        `UPDATE challenges
         SET status = 'accepted', opponent_id = ?, opponent_tx_id = ?,
             room_id = ?, prize_amount = ?, commission_amount = ?, accepted_at = ?
         WHERE id = ?`,
        [opponentId, opponentTxId, roomId, prize, commission, now, battleId]
      );

      auditLog('battle_accept', { opponentId, battleId, roomId, amount });
      return {
        roomId,
        battleId:   b.id,
        amount,
        prize,
        creatorId:  b.creator_id,
        opponentId,
        gameConfig: typeof b.game_config === 'string' ? JSON.parse(b.game_config) : (b.game_config || {}),
      };
    });
  },

  /**
   * Acepta una sala privada por invite_code.
   */
  async acceptByCode({ inviteCode, opponentId }) {
    const rows = await query(
      "SELECT * FROM challenges WHERE invite_code = ? AND is_private = 1",
      [inviteCode.toUpperCase()]
    );
    if (!rows.length) throw new Error('Código inválido o sala no encontrada');
    return this.accept({ battleId: rows[0].id, opponentId });
  },

  /**
   * Liquida la apuesta al finalizar la partida.
   * Todo ocurre en una única transacción:
   *   1. SELECT challenge FOR UPDATE → garantiza que solo un settle procede.
   *   2. Wallets bloqueadas FOR UPDATE en orden ascendente de userId (evita deadlock).
   *   3. reserved liberado, premio acreditado, transactions insertadas.
   *   4. challenge marcado 'finished'.
   * Si la sala no existe o ya fue liquidada, retorna null (no-op).
   */
  async settle({ roomId, winnerId }) {
    let settled = null;

    await withTransaction(async (conn) => {
      // 1. Lock the challenge row — prevents concurrent settle() from double-settling
      const [rows] = await conn.execute(
        "SELECT * FROM challenges WHERE room_id = ? AND status IN ('accepted','active') FOR UPDATE",
        [roomId]
      );
      if (!rows.length) return; // already settled or not found — no-op

      const b          = rows[0];
      const loserId    = b.creator_id === winnerId ? b.opponent_id : b.creator_id;
      const betAmount  = parseFloat(b.amount);
      const commRate   = parseFloat(b.commission_rate || COMMISSION_RATE);

      if (!isFinite(commRate) || commRate < 0 || commRate >= 1) {
        throw new Error('Invalid commission rate on challenge ' + b.id);
      }

      // 2. Lock wallets in ascending userId order to prevent deadlock
      const [firstId, secondId] = winnerId < loserId
        ? [winnerId, loserId]
        : [loserId, winnerId];

      const [w1] = await conn.execute(
        'SELECT user_id, reserved FROM wallet WHERE user_id = ? FOR UPDATE', [firstId]
      );
      const [w2] = await conn.execute(
        'SELECT user_id, reserved FROM wallet WHERE user_id = ? FOR UPDATE', [secondId]
      );

      const wallets = Object.fromEntries([...w1, ...w2].map(r => [r.user_id, r]));
      const winnerW = wallets[winnerId];
      const loserW  = wallets[loserId];

      if (!winnerW || !loserW) throw new Error('One or more wallets not found');
      if (parseFloat(winnerW.reserved) < betAmount) {
        throw new Error(`Winner reserved (${winnerW.reserved}) < betAmount (${betAmount})`);
      }
      if (parseFloat(loserW.reserved) < betAmount) {
        throw new Error(`Loser reserved (${loserW.reserved}) < betAmount (${betAmount})`);
      }

      const commission = parseFloat((betAmount * 2 * commRate).toFixed(2));
      const prize      = parseFloat((betAmount * 2 - commission).toFixed(2));

      // 3. Update wallets
      await conn.execute(
        'UPDATE wallet SET reserved = reserved - ?, balance = balance + ? WHERE user_id = ?',
        [betAmount, prize, winnerId]
      );
      await conn.execute(
        'UPDATE wallet SET reserved = reserved - ? WHERE user_id = ?',
        [betAmount, loserId]
      );

      // 4. Insert transaction records
      await conn.execute(
        `INSERT INTO transactions (user_id, type, amount, status, reference)
         VALUES (?, 'bet_win', ?, 'completed', ?)`,
        [winnerId, prize, b.id]
      );
      await conn.execute(
        `INSERT INTO transactions (user_id, type, amount, status, reference)
         VALUES (?, 'bet_loss', ?, 'completed', ?)`,
        [loserId, betAmount, b.id]
      );

      // 5. Mark challenge finished — inside the same transaction
      await conn.execute(
        `UPDATE challenges
         SET status = 'finished', winner_id = ?, prize_amount = ?,
             commission_amount = ?, finished_at = NOW()
         WHERE id = ?`,
        [winnerId, prize, commission, b.id]
      );

      auditLog('battle_settle', { roomId, winnerId, loserId, betAmount, prize, commission, challengeId: b.id });
      settled = { prize, commission, battleId: b.id, loserId, betAmount };
    });

    if (!settled) return null;

    // Notifications outside the transaction (non-critical)
    const { prize, battleId, loserId, betAmount } = settled;
    await Promise.all([
      NotificationService.create({
        userId:   winnerId,
        type:     'game_result',
        title:    '¡Ganaste la batalla! 🏆',
        body:     `Premio acreditado: ${prize.toFixed(0)} créditos`,
        metadata: { battleId, roomId, result: 'win', prize },
      }),
      NotificationService.create({
        userId:   loserId,
        type:     'game_result',
        title:    'Perdiste la batalla',
        body:     `Tu rival ganó. Perdiste ${parseFloat(betAmount).toFixed(0)} créditos`,
        metadata: { battleId, roomId, result: 'loss' },
      }),
    ]).catch(() => {});

    return settled;
  },

  /**
   * Reembolsa ambos jugadores (error antes de iniciar / error del servidor).
   */
  async refund(battleId, reason = 'server_error') {
    const rows = await query('SELECT * FROM challenges WHERE id = ?', [battleId]);
    if (!rows.length) return;
    const b = rows[0];
    if (['refunded', 'finished', 'cancelled'].includes(b.status)) return;

    await withTransaction(async (conn) => {
      const [locked] = await conn.execute(
        'SELECT status FROM challenges WHERE id = ? FOR UPDATE', [battleId]
      );
      if (!locked.length) return;
      if (['refunded', 'finished', 'cancelled'].includes(locked[0].status)) return;

      await conn.execute(
        "UPDATE challenges SET status = 'refunded' WHERE id = ?", [battleId]
      );
    });

    const amount = parseFloat(b.amount);
    await WalletService.refundLocked(b.creator_id, amount, `battle_refund:${battleId}:${reason}`).catch(() => {});
    if (b.opponent_id) {
      await WalletService.refundLocked(b.opponent_id, amount, `battle_refund:${battleId}:${reason}`).catch(() => {});
    }
    auditLog('battle_refund', { battleId, reason });
  },

  /**
   * Cron: expira salas abiertas que pasaron su deadline.
   */
  async expireOld() {
    const expired = await query(
      "SELECT id, creator_id, amount FROM challenges WHERE status = 'open' AND expires_at < NOW()"
    );
    for (const b of expired) {
      try {
        const changed = await withTransaction(async (conn) => {
          const [row] = await conn.execute(
            "SELECT status FROM challenges WHERE id = ? FOR UPDATE", [b.id]
          );
          if (!row.length || row[0].status !== 'open') return false;
          await conn.execute(
            "UPDATE challenges SET status = 'expired' WHERE id = ?", [b.id]
          );
          return true;
        });
        if (changed) {
          await WalletService.refundLocked(
            b.creator_id, parseFloat(b.amount), `battle_expired:${b.id}`
          );
          logger.info(`Battle expired & refunded: ${b.id}`);
        }
      } catch (err) {
        logger.error(`Expire battle ${b.id}: ${err.message}`);
      }
    }
    return expired.length;
  },

  // ── Queries ────────────────────────────────────────────────────────────────

  /** Salas públicas abiertas (excluye las del propio usuario) */
  async listPublic(userId) {
    return query(
      `SELECT c.id, c.amount, c.commission_rate, c.expires_at, c.game_config, c.prize_amount,
              u.username AS creator_username, r.elo AS creator_elo
       FROM challenges c
       JOIN usuarios u ON u.id = c.creator_id
       LEFT JOIN ranking r ON r.user_id = c.creator_id
       WHERE c.status = 'open' AND c.is_private = 0
         AND c.creator_id != ? AND c.expires_at > NOW()
       ORDER BY c.created_at DESC LIMIT 30`,
      [userId]
    );
  },

  /** Todas las salas donde el usuario es creador o aceptante */
  async listMine(userId) {
    return query(
      `SELECT c.*, u1.username AS creator_username, u2.username AS opponent_username
       FROM challenges c
       JOIN usuarios u1 ON u1.id = c.creator_id
       LEFT JOIN usuarios u2 ON u2.id = c.opponent_id
       WHERE c.creator_id = ? OR c.opponent_id = ?
       ORDER BY c.created_at DESC LIMIT 50`,
      [userId, userId]
    );
  },

  /** Batalla activa actual del usuario (partida en curso) */
  async getActive(userId) {
    const rows = await query(
      `SELECT c.*, u1.username AS creator_username, u2.username AS opponent_username
       FROM challenges c
       JOIN usuarios u1 ON u1.id = c.creator_id
       LEFT JOIN usuarios u2 ON u2.id = c.opponent_id
       WHERE (c.creator_id = ? OR c.opponent_id = ?)
         AND c.status IN ('accepted','active')
       ORDER BY c.accepted_at DESC LIMIT 1`,
      [userId, userId]
    );
    return rows[0] || null;
  },

  /** Historial paginado */
  async getHistory(userId, { limit = 20, offset = 0 } = {}) {
    const safeLimit  = Math.min(Math.max(parseInt(limit)  || 20, 1), 100);
    const safeOffset = Math.max(parseInt(offset) || 0, 0);
    return query(
      `SELECT c.id, c.amount, c.prize_amount, c.status, c.winner_id,
              c.created_at, c.finished_at, c.game_config,
              u1.username AS creator_username,
              u2.username AS opponent_username
       FROM challenges c
       JOIN usuarios u1 ON u1.id = c.creator_id
       LEFT JOIN usuarios u2 ON u2.id = c.opponent_id
       WHERE (c.creator_id = ? OR c.opponent_id = ?)
         AND c.status IN ('finished','cancelled','expired','refunded')
       ORDER BY c.created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`,
      [userId, userId]
    );
  },

  /** Detalle de una sala */
  async getById(battleId) {
    const rows = await query(
      `SELECT c.*, u1.username AS creator_username, u2.username AS opponent_username
       FROM challenges c
       JOIN usuarios u1 ON u1.id = c.creator_id
       LEFT JOIN usuarios u2 ON u2.id = c.opponent_id
       WHERE c.id = ?`,
      [battleId]
    );
    return rows[0] || null;
  },

  calcPrize,
};

module.exports = BattleService;
