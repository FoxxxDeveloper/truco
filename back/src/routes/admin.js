/**
 * Admin routes — protected by authMiddleware + adminAuth.
 * All mutations are recorded in admin_logs.
 */
const express = require('express');
const authMiddleware = require('../middleware/auth');
const adminAuth      = require('../middleware/adminAuth');
const { query }      = require('../config/database');
const logger         = require('../config/logger');

const router = express.Router();
router.use(authMiddleware, adminAuth);

// ── Helper: write audit log ───────────────────────────────────────
async function auditAdmin(adminId, action, targetType, targetId, before, after, reason, ip) {
  try {
    await query(
      `INSERT INTO admin_logs (admin_id, action, target_type, target_id, before_data, after_data, reason, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        adminId, action, targetType, String(targetId),
        before ? JSON.stringify(before) : null,
        after  ? JSON.stringify(after)  : null,
        reason || null,
        ip     || null,
      ]
    );
  } catch (err) {
    logger.error('admin_log insert failed: ' + err.message);
  }
}

// ── GET /api/admin/dashboard ─────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    const [users]          = await query('SELECT COUNT(*) AS cnt FROM usuarios');
    const [activeGames]    = await query("SELECT COUNT(*) AS cnt FROM partidas WHERE status = 'active'");
    const [pendingTxs]     = await query("SELECT COUNT(*) AS cnt FROM transactions WHERE status = 'pending'");
    const [totalBalance]   = await query('SELECT COALESCE(SUM(balance),0) AS total FROM wallet');
    const [openChallenges] = await query("SELECT COUNT(*) AS cnt FROM challenges WHERE status = 'open'");

    return res.json({
      users:          Number(users.cnt),
      activeGames:    Number(activeGames.cnt),
      pendingTxs:     Number(pendingTxs.cnt),
      totalBalance:   parseFloat(totalBalance.total),
      openChallenges: Number(openChallenges.cnt),
    });
  } catch (err) {
    logger.error('admin dashboard: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/admin/users ──────────────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const { limit = 50, offset = 0, search = '' } = req.query;
    const lim = Math.min(Number(limit), 200);
    const off = Number(offset);

    let sql = `
      SELECT u.id, u.username, u.email, u.role, u.status, u.created_at,
             r.elo, r.wins, r.losses,
             w.balance, w.reserved
      FROM usuarios u
      LEFT JOIN ranking r ON r.user_id = u.id
      LEFT JOIN wallet  w ON w.user_id = u.id
    `;
    const params = [];
    if (search) {
      sql += ' WHERE u.username LIKE ? OR u.email LIKE ?';
      params.push(`%${search}%`, `%${search}%`);
    }
    sql += ` ORDER BY u.id DESC LIMIT ${lim} OFFSET ${off}`;

    const users = await query(sql, params);
    return res.json({ users });
  } catch (err) {
    logger.error('admin list users: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ── PATCH /api/admin/users/:id ────────────────────────────────────
// Update role or status
router.patch('/users/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { role, status, reason } = req.body;

    const allowed = {};
    if (role   && ['user','admin'].includes(role))                       allowed.role   = role;
    if (status && ['active','banned','suspended'].includes(status))      allowed.status = status;

    if (Object.keys(allowed).length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    const [before] = await query('SELECT role, status FROM usuarios WHERE id = ?', [userId]);
    if (!before) return res.status(404).json({ error: 'User not found' });

    const setClauses = Object.keys(allowed).map(k => `${k} = ?`).join(', ');
    await query(`UPDATE usuarios SET ${setClauses} WHERE id = ?`, [...Object.values(allowed), userId]);

    await auditAdmin(req.user.id, 'update_user', 'user', userId, before, allowed, reason, req.ip);
    return res.json({ ok: true });
  } catch (err) {
    logger.error('admin update user: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/admin/users/:id/adjust ─────────────────────────────
// Manual balance adjustment (audited)
router.post('/users/:id/adjust', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const amount = parseFloat(req.body.amount);
    const { reason } = req.body;

    if (!isFinite(amount) || amount === 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    if (!reason?.trim()) {
      return res.status(400).json({ error: 'Reason required for balance adjustments' });
    }

    // Auto-create wallet if user doesn't have one yet
    await query('INSERT IGNORE INTO wallet (user_id, balance, reserved) VALUES (?, 0.00, 0.00)', [userId]);

    const [wallet] = await query('SELECT balance FROM wallet WHERE user_id = ?', [userId]);
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });

    const before = parseFloat(wallet.balance);
    const after  = before + amount;
    if (after < 0) return res.status(400).json({ error: 'Adjustment would result in negative balance' });

    await query('UPDATE wallet SET balance = balance + ? WHERE user_id = ?', [amount, userId]);
    await query(
      `INSERT INTO transactions (user_id, type, amount, status, reference)
       VALUES (?, ?, ?, 'completed', ?)`,
      [userId, amount > 0 ? 'deposit' : 'withdrawal', Math.abs(amount), `Admin adjustment: ${reason}`]
    );

    await auditAdmin(req.user.id, 'adjust_balance', 'user', userId,
      { balance: before }, { balance: after, adjustment: amount }, reason, req.ip);

    return res.json({ ok: true, newBalance: after });
  } catch (err) {
    logger.error('admin adjust balance: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/admin/transactions ───────────────────────────────────
router.get('/transactions', async (req, res) => {
  try {
    const { limit = 50, offset = 0, status } = req.query;
    const lim = Math.min(Number(limit), 200);
    const off = Number(offset);

    let sql = `
      SELECT t.*, u.username
      FROM transactions t
      JOIN usuarios u ON u.id = t.user_id
    `;
    const params = [];
    if (status) { sql += ' WHERE t.status = ?'; params.push(status); }
    sql += ` ORDER BY t.created_at DESC LIMIT ${lim} OFFSET ${off}`;

    const txs = await query(sql, params);
    return res.json({ transactions: txs });
  } catch (err) {
    logger.error('admin list txs: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/admin/transactions/:id/approve ──────────────────────
router.post('/transactions/:id/approve', async (req, res) => {
  try {
    const txId = parseInt(req.params.id);
    const [tx] = await query('SELECT * FROM transactions WHERE id = ?', [txId]);
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    if (tx.status !== 'pending') return res.status(400).json({ error: 'Transaction is not pending' });

    await query("UPDATE transactions SET status = 'completed' WHERE id = ?", [txId]);
    if (tx.type === 'deposit') {
      await query('UPDATE wallet SET balance = balance + ? WHERE user_id = ?', [tx.amount, tx.user_id]);
    } else if (tx.type === 'withdrawal') {
      await query('UPDATE wallet SET reserved = GREATEST(0, reserved - ?) WHERE user_id = ?', [tx.amount, tx.user_id]);
    }

    await auditAdmin(req.user.id, 'approve_tx', 'transaction', txId,
      { status: 'pending' }, { status: 'completed' }, 'Admin approved', req.ip);

    return res.json({ ok: true });
  } catch (err) {
    logger.error('admin approve tx: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/admin/transactions/:id/reject ───────────────────────
router.post('/transactions/:id/reject', async (req, res) => {
  try {
    const txId = parseInt(req.params.id);
    const { reason } = req.body;
    const [tx] = await query('SELECT * FROM transactions WHERE id = ?', [txId]);
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    if (tx.status !== 'pending') return res.status(400).json({ error: 'Transaction is not pending' });

    await query("UPDATE transactions SET status = 'failed' WHERE id = ?", [txId]);
    // Refund reserved funds for withdrawals
    if (tx.type === 'withdrawal') {
      await query('UPDATE wallet SET balance = balance + ?, reserved = GREATEST(0, reserved - ?) WHERE user_id = ?',
        [tx.amount, tx.amount, tx.user_id]);
    }

    await auditAdmin(req.user.id, 'reject_tx', 'transaction', txId,
      { status: 'pending' }, { status: 'failed' }, reason || 'Admin rejected', req.ip);

    return res.json({ ok: true });
  } catch (err) {
    logger.error('admin reject tx: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/admin/games ──────────────────────────────────────────
router.get('/games', async (req, res) => {
  try {
    const { limit = 50, offset = 0, status } = req.query;
    const lim = Math.min(Number(limit), 200);

    let sql = `
      SELECT p.*, 
             u1.username AS player1_username,
             u2.username AS player2_username,
             w.username  AS winner_username
      FROM partidas p
      JOIN usuarios u1 ON u1.id = p.player1_id
      JOIN usuarios u2 ON u2.id = p.player2_id
      LEFT JOIN usuarios w ON w.id = p.winner_id
    `;
    const params = [];
    if (status) { sql += ' WHERE p.status = ?'; params.push(status); }
    sql += ` ORDER BY p.created_at DESC LIMIT ${lim} OFFSET ${Number(offset)}`;

    const games = await query(sql, params);
    return res.json({ games });
  } catch (err) {
    logger.error('admin list games: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/admin/logs ───────────────────────────────────────────
router.get('/logs', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const safeLogLimit = Math.min(Number(limit), 200);
    const safeLogOffset = Math.max(Number(offset), 0);
    const logs = await query(
      `SELECT al.*, u.username AS admin_username
       FROM admin_logs al JOIN usuarios u ON u.id = al.admin_id
       ORDER BY al.created_at DESC LIMIT ${safeLogLimit} OFFSET ${safeLogOffset}`,
      []
    );
    return res.json({ logs });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
