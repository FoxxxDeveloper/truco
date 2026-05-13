/**
 * WalletService — All monetary operations are ACID-safe.
 *
 * Security rules:
 *  1. Every write uses withTransaction + SELECT ... FOR UPDATE.
 *  2. Wallets locked in ascending userId order to prevent deadlocks.
 *  3. All amounts validated as finite positive numbers before touching the DB.
 *  4. No amount is ever taken from client input without server re-validation.
 */
const { withTransaction, query } = require('../config/database');
const { auditLog } = require('../config/logger');

// ── Input guard ───────────────────────────────────────────────────────────────
function assertPositive(amount, label = 'amount') {
  const n = parseFloat(amount);
  if (!isFinite(n) || n <= 0) throw new Error(`${label} must be a positive number (got ${amount})`);
  return parseFloat(n.toFixed(2));
}

// ── Public API ────────────────────────────────────────────────────────────────

const WalletService = {
  /**
   * Create a wallet row for a new user (called at registration).
   * conn is optional — pass it if already inside a transaction.
   */
  async init(userId, conn = null) {
    const exec = conn
      ? (sql, p) => conn.execute(sql, p)
      : (sql, p) => query(sql, p).then(r => [r]);
    await exec('INSERT IGNORE INTO wallet (user_id, balance, reserved) VALUES (?, 0.00, 0.00)', [userId]);
  },

  /** Get wallet balance for a user. Returns null if wallet doesn't exist. */
  async getBalance(userId) {
    const rows = await query('SELECT balance, reserved FROM wallet WHERE user_id = ?', [userId]);
    if (!rows.length) return null;
    // Sum pending withdrawals separately so UI can show "pendiente de retiro"
    const pendingRows = await query(
      "SELECT COALESCE(SUM(amount),0) AS total FROM transactions WHERE user_id = ? AND type = 'withdrawal' AND status = 'pending'",
      [userId]
    );
    const pendingWithdrawal = parseFloat(pendingRows[0]?.total || 0);
    return {
      balance:            parseFloat(rows[0].balance),
      reserved:           parseFloat(rows[0].reserved),
      pendingWithdrawal,
    };
  },

  /**
   * Admin-confirmed deposit — credits balance atomically.
   * ONLY callable from server-side trusted code (Telegram webhook + admin signature).
   *
   * @param {string} [idempotencyKey] - unique key to prevent duplicate deposits
   */
  async deposit(userId, amount, reference, idempotencyKey = null) {
    amount = assertPositive(amount, 'deposit amount');

    return withTransaction(async (conn) => {
      // Check idempotency: if key already exists, return existing result (no-op)
      if (idempotencyKey) {
        const [existing] = await conn.execute(
          "SELECT id FROM transactions WHERE idempotency_key = ?",
          [idempotencyKey]
        );
        if (existing.length) return { alreadyProcessed: true };
      }

      // Lock wallet row
      const [rows] = await conn.execute(
        'SELECT id FROM wallet WHERE user_id = ? FOR UPDATE',
        [userId]
      );
      if (!rows.length) throw new Error('Wallet not found for user ' + userId);

      await conn.execute(
        'UPDATE wallet SET balance = balance + ? WHERE user_id = ?',
        [amount, userId]
      );

      await conn.execute(
        `INSERT INTO transactions (user_id, type, amount, status, reference, idempotency_key)
         VALUES (?, 'deposit', ?, 'completed', ?, ?)`,
        [userId, amount, reference, idempotencyKey]
      );

      const [updated] = await conn.execute(
        'SELECT balance, reserved FROM wallet WHERE user_id = ?', [userId]
      );
      const result = {
        balance:  parseFloat(updated[0].balance),
        reserved: parseFloat(updated[0].reserved),
      };
      auditLog('deposit', { userId, amount, reference, idempotencyKey, newBalance: result.balance });
      return result;
    });
  },

  /**
   * Request a withdrawal.
   * Immediately moves funds from balance → reserved (locked), creates a pending tx.
   * Actual release of funds to user happens after admin confirms via Telegram.
   */
  async requestWithdrawal(userId, amount, reference) {
    amount = assertPositive(amount, 'withdrawal amount');

    return withTransaction(async (conn) => {
      const [rows] = await conn.execute(
        'SELECT balance, reserved FROM wallet WHERE user_id = ? FOR UPDATE',
        [userId]
      );
      if (!rows.length) throw new Error('Wallet not found');

      const balance = parseFloat(rows[0].balance);
      if (balance < amount) throw new Error('Insufficient balance');

      // Lock the withdrawal amount immediately to prevent double-withdrawal
      await conn.execute(
        'UPDATE wallet SET balance = balance - ?, reserved = reserved + ? WHERE user_id = ?',
        [amount, amount, userId]
      );

      const [tx] = await conn.execute(
        `INSERT INTO transactions (user_id, type, amount, status, reference)
         VALUES (?, 'withdrawal', ?, 'pending', ?)`,
        [userId, amount, reference]
      );

      auditLog('withdrawal_requested', { userId, amount, reference, transactionId: tx.insertId });
      return { transactionId: tx.insertId };
    });
  },

  /**
   * Complete a pending withdrawal (admin confirmed).
   * Clears the reserved amount (funds have left the platform).
   */
  async confirmWithdrawal(transactionId) {
    return withTransaction(async (conn) => {
      const [rows] = await conn.execute(
        "SELECT * FROM transactions WHERE id = ? AND type = 'withdrawal' AND status = 'pending' FOR UPDATE",
        [transactionId]
      );
      if (!rows.length) throw new Error('Pending withdrawal not found');
      const tx = rows[0];

      await conn.execute(
        'UPDATE wallet SET reserved = reserved - ? WHERE user_id = ?',
        [parseFloat(tx.amount), tx.user_id]
      );

      await conn.execute(
        "UPDATE transactions SET status = 'completed' WHERE id = ?",
        [transactionId]
      );

      return { userId: tx.user_id, amount: parseFloat(tx.amount) };
    });
  },

  /**
   * Reject a pending withdrawal (admin rejected).
   * Returns funds from reserved → balance.
   */
  async rejectWithdrawal(transactionId) {
    return withTransaction(async (conn) => {
      const [rows] = await conn.execute(
        "SELECT * FROM transactions WHERE id = ? AND type = 'withdrawal' AND status = 'pending' FOR UPDATE",
        [transactionId]
      );
      if (!rows.length) throw new Error('Pending withdrawal not found');
      const tx = rows[0];

      await conn.execute(
        'UPDATE wallet SET reserved = reserved - ?, balance = balance + ? WHERE user_id = ?',
        [parseFloat(tx.amount), parseFloat(tx.amount), tx.user_id]
      );

      await conn.execute(
        "UPDATE transactions SET status = 'cancelled' WHERE id = ?",
        [transactionId]
      );

      return { userId: tx.user_id, amount: parseFloat(tx.amount) };
    });
  },

  /**
   * Lock funds for a bet (balance → reserved).
   * MUST be called inside an existing transaction (`conn` required).
   * Returns the new transaction row ID.
   */
  async lockFunds(userId, amount, reference, conn) {
    amount = assertPositive(amount, 'lock amount');

    // Auto-create wallet if doesn't exist (e.g. legacy users)
    await conn.execute(
      'INSERT IGNORE INTO wallet (user_id, balance, reserved) VALUES (?, 0.00, 0.00)',
      [userId]
    );

    const [rows] = await conn.execute(
      'SELECT balance, reserved FROM wallet WHERE user_id = ? FOR UPDATE',
      [userId]
    );
    if (!rows.length) throw new Error('Wallet not found for user ' + userId);

    const balance = parseFloat(rows[0].balance);
    if (balance < amount) throw new Error(`Insufficient balance for user ${userId} (has ${balance}, needs ${amount})`);

    await conn.execute(
      'UPDATE wallet SET balance = balance - ?, reserved = reserved + ? WHERE user_id = ?',
      [amount, amount, userId]
    );

    const [tx] = await conn.execute(
      `INSERT INTO transactions (user_id, type, amount, status, reference)
       VALUES (?, 'bet_lock', ?, 'completed', ?)`,
      [userId, amount, reference]
    );

    return tx.insertId;
  },

  /**
   * Refund reserved funds back to balance (cancelled / expired challenge).
   */
  async refundLocked(userId, amount, reference) {
    amount = assertPositive(amount, 'refund amount');

    return withTransaction(async (conn) => {
      const [rows] = await conn.execute(
        'SELECT reserved FROM wallet WHERE user_id = ? FOR UPDATE',
        [userId]
      );
      if (!rows.length) throw new Error('Wallet not found');

      if (parseFloat(rows[0].reserved) < amount) {
        throw new Error('Reserved amount mismatch — cannot refund more than reserved');
      }

      await conn.execute(
        'UPDATE wallet SET reserved = reserved - ?, balance = balance + ? WHERE user_id = ?',
        [amount, amount, userId]
      );

      await conn.execute(
        `INSERT INTO transactions (user_id, type, amount, status, reference)
         VALUES (?, 'bet_refund', ?, 'completed', ?)`,
        [userId, amount, reference]
      );
    });
  },

  /**
   * Settle a finished wagered game.
   * Atomically:
   *   - Winner: reserved - betAmount, balance + prize (prize = betAmount*2 - commission)
   *   - Loser:  reserved - betAmount
   *
   * Wallets locked in ascending userId order to prevent deadlocks.
   */
  async settleGame({ winnerId, loserId, betAmount, commissionRate = 0.05, challengeId }) {
    betAmount = assertPositive(betAmount, 'betAmount');
    if (!isFinite(commissionRate) || commissionRate < 0 || commissionRate >= 1) {
      throw new Error('Invalid commission rate');
    }

    return withTransaction(async (conn) => {
      // Lock in ascending userId order — prevents deadlock when two settle calls race
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

      const commission = parseFloat((betAmount * 2 * commissionRate).toFixed(2));
      const prize      = parseFloat((betAmount * 2 - commission).toFixed(2));

      // Winner: remove reserved, add prize
      await conn.execute(
        'UPDATE wallet SET reserved = reserved - ?, balance = balance + ? WHERE user_id = ?',
        [betAmount, prize, winnerId]
      );

      // Loser: remove reserved
      await conn.execute(
        'UPDATE wallet SET reserved = reserved - ? WHERE user_id = ?',
        [betAmount, loserId]
      );

      // Transaction records
      await conn.execute(
        `INSERT INTO transactions (user_id, type, amount, status, reference)
         VALUES (?, 'bet_win', ?, 'completed', ?)`,
        [winnerId, prize, challengeId]
      );
      await conn.execute(
        `INSERT INTO transactions (user_id, type, amount, status, reference)
         VALUES (?, 'bet_loss', ?, 'completed', ?)`,
        [loserId, betAmount, challengeId]
      );

      auditLog('settle_game', { winnerId, loserId, betAmount, prize, commission, challengeId });
      return { prize, commission };
    });
  },

  /**
   * Cancel a pending withdrawal (user-initiated or admin-rejected).
   * Returns funds from reserved → balance.
   */
  async cancelWithdrawal(transactionId, userId) {
    return withTransaction(async (conn) => {
      const [rows] = await conn.execute(
        "SELECT * FROM transactions WHERE id = ? AND type = 'withdrawal' AND status = 'pending' FOR UPDATE",
        [transactionId]
      );
      if (!rows.length) throw new Error('Pending withdrawal not found');
      const tx = rows[0];

      // Only the owner can cancel (or admin passes userId = null to skip check)
      if (userId !== null && tx.user_id !== userId) {
        throw new Error('Unauthorized');
      }

      await conn.execute(
        'UPDATE wallet SET reserved = reserved - ?, balance = balance + ? WHERE user_id = ?',
        [parseFloat(tx.amount), parseFloat(tx.amount), tx.user_id]
      );

      await conn.execute(
        "UPDATE transactions SET status = 'cancelled' WHERE id = ?",
        [transactionId]
      );

      auditLog('withdrawal_cancelled', { userId: tx.user_id, transactionId });
      return { userId: tx.user_id, amount: parseFloat(tx.amount) };
    });
  },

  /**
   * Debit playable balance for a tournament entry fee (inside an open transaction).
   * Does not use `reserved` — funds are spent immediately (completed tx).
   * Idempotent when `idempotency_key` matches an existing row.
   *
   * @returns {{ transactionId: number, alreadyProcessed?: boolean }}
   */
  async debitTournamentEntry(conn, userId, amount, reference, idempotencyKey) {
    amount = assertPositive(amount, 'tournament entry amount');
    if (!idempotencyKey || String(idempotencyKey).length < 8) {
      throw new Error('idempotencyKey required for tournament entry');
    }

    await conn.execute(
      'INSERT IGNORE INTO wallet (user_id, balance, reserved) VALUES (?, 0.00, 0.00)',
      [userId]
    );

    const [rows] = await conn.execute(
      'SELECT balance FROM wallet WHERE user_id = ? FOR UPDATE',
      [userId]
    );
    if (!rows.length) throw new Error('Wallet not found for user ' + userId);

    const [dup] = await conn.execute(
      'SELECT id FROM transactions WHERE idempotency_key = ?',
      [idempotencyKey]
    );
    if (dup.length) return { transactionId: dup[0].id, alreadyProcessed: true };

    const balance = parseFloat(rows[0].balance);
    if (balance < amount) {
      throw new Error('Saldo insuficiente para inscribirte a este torneo.');
    }

    await conn.execute(
      'UPDATE wallet SET balance = balance - ? WHERE user_id = ?',
      [amount, userId]
    );

    try {
      const [tx] = await conn.execute(
        `INSERT INTO transactions (user_id, type, amount, status, reference, idempotency_key)
         VALUES (?, 'tournament_entry', ?, 'completed', ?, ?)`,
        [userId, amount, reference, idempotencyKey]
      );
      auditLog('tournament_entry', { userId, amount, reference, idempotencyKey, transactionId: tx.insertId });
      return { transactionId: tx.insertId };
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY' || e.errno === 1062) {
        await conn.execute(
          'UPDATE wallet SET balance = balance + ? WHERE user_id = ?',
          [amount, userId]
        );
        const [again] = await conn.execute(
          'SELECT id FROM transactions WHERE idempotency_key = ?',
          [idempotencyKey]
        );
        if (again.length) {
          return { transactionId: again[0].id, alreadyProcessed: true };
        }
      }
      throw e;
    }
  },

  /**
   * Refund tournament entry (inside an open transaction). Idempotent via idempotency_key.
   */
  async creditTournamentRefund(conn, userId, amount, reference, idempotencyKey) {
    amount = assertPositive(amount, 'tournament refund amount');
    if (!idempotencyKey || String(idempotencyKey).length < 8) {
      throw new Error('idempotencyKey required for tournament refund');
    }

    await conn.execute(
      'INSERT IGNORE INTO wallet (user_id, balance, reserved) VALUES (?, 0.00, 0.00)',
      [userId]
    );

    const [rows] = await conn.execute(
      'SELECT id FROM wallet WHERE user_id = ? FOR UPDATE',
      [userId]
    );
    if (!rows.length) throw new Error('Wallet not found for user ' + userId);

    const [dup] = await conn.execute(
      'SELECT id FROM transactions WHERE idempotency_key = ?',
      [idempotencyKey]
    );
    if (dup.length) return { transactionId: dup[0].id, alreadyProcessed: true };

    await conn.execute(
      'UPDATE wallet SET balance = balance + ? WHERE user_id = ?',
      [amount, userId]
    );

    try {
      const [tx] = await conn.execute(
        `INSERT INTO transactions (user_id, type, amount, status, reference, idempotency_key)
         VALUES (?, 'tournament_refund', ?, 'completed', ?, ?)`,
        [userId, amount, reference, idempotencyKey]
      );
      auditLog('tournament_refund', { userId, amount, reference, idempotencyKey, transactionId: tx.insertId });
      return { transactionId: tx.insertId };
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY' || e.errno === 1062) {
        await conn.execute(
          'UPDATE wallet SET balance = balance - ? WHERE user_id = ?',
          [amount, userId]
        );
        const [again] = await conn.execute(
          'SELECT id FROM transactions WHERE idempotency_key = ?',
          [idempotencyKey]
        );
        if (again.length) {
          return { transactionId: again[0].id, alreadyProcessed: true };
        }
      }
      throw e;
    }
  },

  /** Transaction history for a user (paginated). */
  async getHistory(userId, { limit = 20, offset = 0 } = {}) {
    // Interpolate as safe integer literals — mysql2 prepared-statement placeholders
    // for LIMIT/OFFSET are unreliable on some MySQL 8 configurations.
    const safeLimit  = Math.min(Math.max(parseInt(limit,  10) || 20, 1), 100);
    const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);
    return query(
      `SELECT id, type, amount, status, reference, created_at
       FROM transactions WHERE user_id = ? ORDER BY created_at DESC
       LIMIT ${safeLimit} OFFSET ${safeOffset}`,
      [userId]
    );
  },
};

module.exports = WalletService;
