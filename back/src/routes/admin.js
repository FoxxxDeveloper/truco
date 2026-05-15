/**
 * Admin routes — protected by authMiddleware + adminAuth.
 * All mutations are recorded in admin_logs.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const authMiddleware      = require('../middleware/auth');
const adminAuth           = require('../middleware/adminAuth');
const { query }           = require('../config/database');
const logger              = require('../config/logger');
const VerificationService = require('../services/verificationService');
const { resolvePausedGameAsAbandon } = require('../services/gameAdminResolve');
const staleGameCleanup = require('../services/staleGameCleanup');
const { enrichPartidaAdminRow } = require('../utils/partidaAdminStatus');

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

function buildAdminUserFilters(q) {
  const where = [];
  const params = [];
  const s = (q.search || '').trim();
  if (s) {
    if (/^\d+$/.test(s)) {
      where.push('(u.id = ? OR u.username LIKE ? OR u.email LIKE ?)');
      params.push(parseInt(s, 10), `%${s}%`, `%${s}%`);
    } else {
      where.push('(u.username LIKE ? OR u.email LIKE ?)');
      params.push(`%${s}%`, `%${s}%`);
    }
  }
  if (q.status && ['active', 'banned', 'suspended'].includes(String(q.status))) {
    where.push('u.status = ?');
    params.push(q.status);
  }
  if (q.role && ['user', 'admin'].includes(String(q.role))) {
    where.push('u.role = ?');
    params.push(q.role);
  }
  const vs = q.verificationStatus;
  if (vs === 'verified') {
    where.push(`uv.identity_status = 'verified'`);
  } else if (vs === 'pending') {
    where.push(`uv.identity_status = 'pending'`);
  } else if (vs === 'rejected') {
    where.push(`uv.identity_status = 'rejected'`);
  } else if (vs === 'unverified') {
    where.push(`(uv.id IS NULL OR uv.identity_status = 'unverified')`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return { whereSql, params };
}

function mapUserRowToApi(row) {
  const doc = row.v_document_number;
  let masked = null;
  if (doc) {
    const str = String(doc);
    masked = str.length <= 3 ? '•'.repeat(str.length) : '•'.repeat(str.length - 3) + str.slice(-3);
  }
  const verification = {
    identity_status: row.v_identity_status || 'unverified',
    age_verified: !!row.v_age_verified,
    legal_first_name: row.v_legal_first_name || null,
    legal_last_name: row.v_legal_last_name || null,
    document_type: row.v_document_type || null,
    document_number_masked: masked,
    date_of_birth: row.v_date_of_birth || null,
    country: row.v_country || null,
    province: row.v_province || null,
    rejection_reason: row.v_rejection_reason || null,
    reviewed_at: row.v_reviewed_at || null,
    reviewed_by: row.v_reviewed_by || null,
    reviewer_username: row.v_reviewer_username || null,
  };
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    role: row.role,
    status: row.status,
    created_at: row.created_at,
    elo: row.elo,
    wins: row.wins,
    losses: row.losses,
    balance: row.balance,
    reserved: row.reserved,
    pendingWithdrawal: parseFloat(row.pending_withdrawal || 0),
    verification,
  };
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
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const { whereSql, params: filterParams } = buildAdminUserFilters(req.query);

    const countSql = `
      SELECT COUNT(*) AS cnt
      FROM usuarios u
      LEFT JOIN user_verifications uv ON uv.user_id = u.id
      ${whereSql}
    `;
    const [{ cnt: total }] = await query(countSql, filterParams);

    const listSql = `
      SELECT u.id, u.username, u.email, u.role, u.status, u.created_at,
             r.elo, r.wins, r.losses,
             COALESCE(w.balance, 0) AS balance,
             COALESCE(w.reserved, 0) AS reserved,
             (SELECT COALESCE(SUM(tw.amount), 0) FROM transactions tw
              WHERE tw.user_id = u.id AND tw.type = 'withdrawal' AND tw.status = 'pending') AS pending_withdrawal,
             uv.identity_status AS v_identity_status,
             uv.age_verified AS v_age_verified,
             uv.legal_first_name AS v_legal_first_name,
             uv.legal_last_name AS v_legal_last_name,
             uv.document_type AS v_document_type,
             uv.document_number AS v_document_number,
             uv.date_of_birth AS v_date_of_birth,
             uv.country AS v_country,
             uv.province AS v_province,
             uv.rejection_reason AS v_rejection_reason,
             uv.reviewed_at AS v_reviewed_at,
             uv.reviewed_by AS v_reviewed_by,
             adm.username AS v_reviewer_username
      FROM usuarios u
      LEFT JOIN ranking r ON r.user_id = u.id
      LEFT JOIN wallet w ON w.user_id = u.id
      LEFT JOIN user_verifications uv ON uv.user_id = u.id
      LEFT JOIN usuarios adm ON adm.id = uv.reviewed_by
      ${whereSql}
      ORDER BY u.id DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    const rows = await query(listSql, filterParams);
    const users = rows.map(mapUserRowToApi);
    const totalPages = Math.max(1, Math.ceil(Number(total) / limit));

    return res.json({
      users,
      pagination: { page, limit, total: Number(total), totalPages },
    });
  } catch (err) {
    logger.error('admin list users: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ── PATCH /api/admin/users/:id ────────────────────────────────────
router.patch('/users/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) return res.status(400).json({ error: 'Invalid user id' });

    const {
      username, email, role, status, password, reason,
    } = req.body;

    const [beforeFull] = await query(
      'SELECT id, username, email, role, status FROM usuarios WHERE id = ?',
      [userId]
    );
    if (!beforeFull) return res.status(404).json({ error: 'User not found' });

    const allowed = {};
    if (username !== undefined) {
      const u = String(username).trim();
      if (u.length < 3 || u.length > 50) return res.status(400).json({ error: 'Username inválido' });
      const [taken] = await query('SELECT id FROM usuarios WHERE username = ? AND id <> ?', [u, userId]);
      if (taken) return res.status(409).json({ error: 'Username ya en uso' });
      allowed.username = u;
    }
    if (email !== undefined) {
      const em = String(email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return res.status(400).json({ error: 'Email inválido' });
      const [takenE] = await query('SELECT id FROM usuarios WHERE email = ? AND id <> ?', [em, userId]);
      if (takenE) return res.status(409).json({ error: 'Email ya en uso' });
      allowed.email = em;
    }
    if (role !== undefined) {
      if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: 'Rol inválido' });
      if (Number(userId) === Number(req.user.id) && role === 'user') {
        const [{ n }] = await query(
          "SELECT COUNT(*) AS n FROM usuarios WHERE role = 'admin' AND status = 'active' AND id <> ?",
          [userId]
        );
        if (Number(n) < 1) {
          return res.status(400).json({ error: 'No podés quitarte el rol admin: no hay otro administrador activo' });
        }
      }
      allowed.role = role;
    }
    if (status !== undefined) {
      if (!['active', 'banned', 'suspended'].includes(status)) return res.status(400).json({ error: 'Estado inválido' });
      if (Number(userId) === Number(req.user.id) && status !== 'active') {
        const [{ n }] = await query(
          "SELECT COUNT(*) AS n FROM usuarios WHERE role = 'admin' AND status = 'active' AND id <> ?",
          [userId]
        );
        if (Number(n) < 1) {
          return res.status(400).json({ error: 'No podés desactivar tu cuenta: sos el único administrador activo' });
        }
      }
      allowed.status = status;
    }

    let passwordChanged = false;
    if (password !== undefined && String(password).trim() !== '') {
      if (String(password).length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
      const hash = await bcrypt.hash(String(password).trim(), 12);
      allowed.password = hash;
      passwordChanged = true;
    }

    if (Object.keys(allowed).length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    const setClauses = Object.keys(allowed).map((k) => `${k} = ?`).join(', ');
    const values = [...Object.values(allowed), userId];
    await query(`UPDATE usuarios SET ${setClauses} WHERE id = ?`, values);

    const afterAudit = { ...allowed };
    if (passwordChanged) afterAudit.password = '[redacted]';

    await auditAdmin(req.user.id, 'update_user', 'user', userId,
      { username: beforeFull.username, email: beforeFull.email, role: beforeFull.role, status: beforeFull.status },
      afterAudit, reason, req.ip);

    const [updated] = await query(
      `SELECT u.id, u.username, u.email, u.role, u.status, u.created_at,
              r.elo, r.wins, r.losses,
              COALESCE(w.balance,0) AS balance, COALESCE(w.reserved,0) AS reserved
       FROM usuarios u
       LEFT JOIN ranking r ON r.user_id = u.id
       LEFT JOIN wallet w ON w.user_id = u.id
       WHERE u.id = ?`,
      [userId]
    );
    return res.json({ ok: true, user: updated });
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

function buildAdminTxFilters(q) {
  const where = [];
  const params = [];
  if (q.status) {
    where.push('t.status = ?');
    params.push(q.status);
  }
  if (q.type) {
    where.push('t.type = ?');
    params.push(q.type);
  }
  if (q.userId) {
    const uid = parseInt(q.userId, 10);
    if (!isNaN(uid)) {
      where.push('t.user_id = ?');
      params.push(uid);
    }
  }
  const s = (q.search || '').trim();
  if (s) {
    if (/^\d+$/.test(s)) {
      where.push('(t.user_id = ? OR u.username LIKE ? OR u.email LIKE ?)');
      params.push(parseInt(s, 10), `%${s}%`, `%${s}%`);
    } else {
      where.push('(u.username LIKE ? OR u.email LIKE ?)');
      params.push(`%${s}%`, `%${s}%`);
    }
  }
  if (q.dateFrom) {
    where.push('t.created_at >= ?');
    params.push(q.dateFrom);
  }
  if (q.dateTo) {
    where.push('t.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(q.dateTo);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return { whereSql, params };
}

function parseTxMetadata(raw) {
  if (raw == null) return null;
  try {
    if (Buffer.isBuffer(raw)) return JSON.parse(raw.toString());
    if (typeof raw === 'object') return raw;
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

function mapTxAdminRow(row) {
  const verification = {
    identity_status: row.v_identity_status || 'unverified',
    age_verified: !!row.v_age_verified,
    legal_first_name: row.v_legal_first_name || null,
    legal_last_name: row.v_legal_last_name || null,
    document_type: row.v_document_type || null,
    document_number_masked: row.v_document_number
      ? (String(row.v_document_number).length <= 3
        ? '•'.repeat(String(row.v_document_number).length)
        : '•'.repeat(String(row.v_document_number).length - 3) + String(row.v_document_number).slice(-3))
      : null,
    date_of_birth: row.v_date_of_birth || null,
    country: row.v_country || null,
    province: row.v_province || null,
  };
  return {
    id: row.id,
    user_id: row.user_id,
    username: row.username,
    email: row.email,
    type: row.type,
    amount: row.amount,
    status: row.status,
    reference: row.reference,
    metadata: parseTxMetadata(row.metadata),
    created_at: row.created_at,
    updated_at: row.updated_at,
    verification,
  };
}

// ── GET /api/admin/transactions ───────────────────────────────────
router.get('/transactions', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;

    const { whereSql, params: filterParams } = buildAdminTxFilters(req.query);

    const countSql = `
      SELECT COUNT(*) AS cnt
      FROM transactions t
      JOIN usuarios u ON u.id = t.user_id
      LEFT JOIN user_verifications uv ON uv.user_id = t.user_id
      ${whereSql}
    `;
    const [{ cnt: total }] = await query(countSql, filterParams);

    const listSql = `
      SELECT t.*, u.username, u.email,
             uv.identity_status AS v_identity_status,
             uv.age_verified AS v_age_verified,
             uv.legal_first_name AS v_legal_first_name,
             uv.legal_last_name AS v_legal_last_name,
             uv.document_type AS v_document_type,
             uv.document_number AS v_document_number,
             uv.date_of_birth AS v_date_of_birth,
             uv.country AS v_country,
             uv.province AS v_province
      FROM transactions t
      JOIN usuarios u ON u.id = t.user_id
      LEFT JOIN user_verifications uv ON uv.user_id = t.user_id
      ${whereSql}
      ORDER BY t.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    const rows = await query(listSql, filterParams);
    const transactions = rows.map(mapTxAdminRow);
    const totalPages = Math.max(1, Math.ceil(Number(total) / limit));

    return res.json({
      transactions,
      pagination: { page, limit, total: Number(total), totalPages },
    });
  } catch (err) {
    logger.error('admin list txs: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/admin/transactions/:id/approve ──────────────────────
router.post('/transactions/:id/approve', async (req, res) => {
  try {
    const txId = parseInt(req.params.id, 10);
    const [tx] = await query('SELECT * FROM transactions WHERE id = ?', [txId]);
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    if (tx.status !== 'pending') return res.status(400).json({ error: 'Transaction is not pending' });

    if (tx.type === 'withdrawal') {
      const v = await VerificationService.getStatus(tx.user_id);
      if (v.identity_status !== 'verified' || !v.age_verified) {
        return res.status(400).json({ error: 'Usuario no verificado. No se puede aprobar el retiro.' });
      }
    }

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

// ── POST /api/admin/games/:roomId/resolve-abandon ───────────────
router.post('/games/:roomId/resolve-abandon', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { winnerId, reason } = req.body;
    if (!winnerId) return res.status(400).json({ error: 'winnerId requerido' });

    const result = await resolvePausedGameAsAbandon({
      roomId,
      winnerId: Number(winnerId),
      adminId: req.user.id,
      reason: reason || 'admin_resolve_paused',
    });

    await auditAdmin(req.user.id, 'resolve_abandon_game', 'partida', roomId,
      { note: 'paused_or_stuck' }, { winnerId: result.winnerId }, reason || null, req.ip);

    return res.json(result);
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'ALREADY_FINISHED') return res.status(400).json({ error: err.message });
    if (err.code === 'NOT_RESOLVABLE') return res.status(400).json({ error: err.message });
    if (err.code === 'BAD_WINNER') return res.status(400).json({ error: err.message });
    logger.error('admin resolve game: ' + err.message);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
});

// ── POST /api/admin/games/cleanup-stale ─────────────────────────
router.post('/games/cleanup-stale', async (req, res) => {
  try {
    const io = req.app.get('io');
    const raw = req.body?.orphanStaleMinutes;
    const orphanStaleMinutes = Number.isFinite(Number(raw)) ? Number(raw) : 43200;
    const result = await staleGameCleanup.runAdminCleanupStaleGames(io, { orphanStaleMinutes });
    await auditAdmin(
      req.user.id,
      'cleanup_stale_games',
      'system',
      'games',
      null,
      result,
      req.body?.reason || null,
      req.ip
    );
    return res.json(result);
  } catch (err) {
    logger.error('admin cleanup stale games: ' + err.message);
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

    const rows = await query(sql, params);
    const games = rows.map(enrichPartidaAdminRow);
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

// ── GET /api/admin/verifications ─────────────────────────────────
// List verification requests filtered by status (default: pending)
router.get('/verifications', async (req, res) => {
  try {
    const { status = 'pending', limit = 50, offset = 0 } = req.query;
    const allowed = ['unverified','pending','verified','rejected','all'];
    const safeStatus = allowed.includes(status) ? status : 'pending';
    const lim = Math.min(Number(limit), 200);
    const off = Math.max(Number(offset), 0);

    let sql = `
      SELECT uv.user_id, uv.identity_status, uv.age_verified, uv.date_of_birth,
             uv.legal_first_name, uv.legal_last_name,
             uv.document_type,
             CONCAT(REPEAT('•', GREATEST(0, LENGTH(uv.document_number) - 3)),
                    RIGHT(uv.document_number, 3)) AS document_number_masked,
             uv.country, uv.province, uv.rejection_reason,
             uv.reviewed_by, uv.reviewed_at, uv.created_at, uv.updated_at,
             u.username, u.email,
             a.username AS reviewer_username
      FROM user_verifications uv
      JOIN usuarios u ON u.id = uv.user_id
      LEFT JOIN usuarios a ON a.id = uv.reviewed_by
    `;
    const params = [];
    if (safeStatus !== 'all') {
      sql += ' WHERE uv.identity_status = ?';
      params.push(safeStatus);
    }
    sql += ` ORDER BY uv.created_at DESC LIMIT ${lim} OFFSET ${off}`;

    const rows = await query(sql, params);
    return res.json({ verifications: rows });
  } catch (err) {
    logger.error('admin verifications list: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/admin/verifications/:userId/approve ─────────────────
router.post('/verifications/:userId/approve', async (req, res) => {
  try {
    const targetId = parseInt(req.params.userId);
    if (isNaN(targetId)) return res.status(400).json({ error: 'Invalid userId' });

    await VerificationService.approveVerification(req.user.id, targetId);

    await auditAdmin(req.user.id, 'verify_approve', 'user_verification', targetId,
      { identity_status: 'pending' }, { identity_status: 'verified', age_verified: true },
      null, req.ip);

    return res.json({ ok: true, message: 'Verificación aprobada' });
  } catch (err) {
    const userErrors = ['menor de edad', 'No hay solicitud', 'estado'];
    if (userErrors.some(e => err.message.includes(e))) {
      return res.status(400).json({ error: err.message });
    }
    logger.error('admin verify approve: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/admin/verifications/:userId/reject ──────────────────
router.post('/verifications/:userId/reject', async (req, res) => {
  try {
    const targetId = parseInt(req.params.userId);
    if (isNaN(targetId)) return res.status(400).json({ error: 'Invalid userId' });

    const { reason } = req.body;
    await VerificationService.rejectVerification(req.user.id, targetId, reason);

    await auditAdmin(req.user.id, 'verify_reject', 'user_verification', targetId,
      { identity_status: 'pending' }, { identity_status: 'rejected', reason },
      reason, req.ip);

    return res.json({ ok: true, message: 'Verificación rechazada' });
  } catch (err) {
    const userErrors = ['obligatorio', 'No hay solicitud', 'estado'];
    if (userErrors.some(e => err.message.includes(e))) {
      return res.status(400).json({ error: err.message });
    }
    logger.error('admin verify reject: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// TOURNAMENT ADMIN ROUTES  —  /api/admin/tournaments/...
// ═══════════════════════════════════════════════════════════════════
const TournamentService = require('../services/tournamentService');
const { USER_ERRORS }   = require('./tournaments');

function handleTournamentAdminError(res, err, context) {
  if (USER_ERRORS.some(msg => err.message.includes(msg))) {
    return res.status(400).json({ error: err.message });
  }
  logger.error(`admin tournaments ${context}: ${err.message}`);
  return res.status(500).json({ error: 'Error interno' });
}

// ── POST /api/admin/tournaments — crear torneo ────────────────────
router.post('/tournaments', async (req, res) => {
  try {
    const result = await TournamentService.createTournament(req.user.id, req.body);
    await auditAdmin(req.user.id, 'tournament_create', 'tournament', result.tournamentId,
      null, { name: req.body.name }, null, req.ip);
    return res.status(201).json(result);
  } catch (err) {
    return handleTournamentAdminError(res, err, 'create');
  }
});

// ── PATCH /api/admin/tournaments/:id — editar torneo ─────────────
router.patch('/tournaments/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const result = await TournamentService.updateTournament(id, req.user.id, req.body);
    await auditAdmin(req.user.id, 'tournament_update', 'tournament', id,
      null, req.body, null, req.ip);
    return res.json(result);
  } catch (err) {
    return handleTournamentAdminError(res, err, 'update');
  }
});

// ── POST /api/admin/tournaments/:id/open ─────────────────────────
router.post('/tournaments/:id/open', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const result = await TournamentService.setTournamentStatus(id, req.user.id, 'open');
    await auditAdmin(req.user.id, 'tournament_open', 'tournament', id, null, null, null, req.ip);
    return res.json(result);
  } catch (err) {
    return handleTournamentAdminError(res, err, 'open');
  }
});

// ── POST /api/admin/tournaments/:id/start-checkin ────────────────
router.post('/tournaments/:id/start-checkin', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const result = await TournamentService.setTournamentStatus(id, req.user.id, 'checkin');
    await auditAdmin(req.user.id, 'tournament_checkin', 'tournament', id, null, null, null, req.ip);
    return res.json(result);
  } catch (err) {
    return handleTournamentAdminError(res, err, 'start-checkin');
  }
});

// ── POST /api/admin/tournaments/:id/generate-bracket ─────────────
router.post('/tournaments/:id/generate-bracket', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const result = await TournamentService.generateBracket(id, req.user.id);
    await auditAdmin(req.user.id, 'tournament_bracket', 'tournament', id, null, result, null, req.ip);
    return res.json(result);
  } catch (err) {
    return handleTournamentAdminError(res, err, 'generate-bracket');
  }
});

// ── POST /api/admin/tournaments/:id/start ────────────────────────
router.post('/tournaments/:id/start', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const result = await TournamentService.startTournament(id, req.user.id);
    await auditAdmin(req.user.id, 'tournament_start', 'tournament', id, null, null, null, req.ip);
    return res.json(result);
  } catch (err) {
    return handleTournamentAdminError(res, err, 'start');
  }
});

// ── POST /api/admin/tournaments/:id/cancel ───────────────────────
router.post('/tournaments/:id/cancel', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { reason } = req.body;
    const result = await TournamentService.setTournamentStatus(id, req.user.id, 'cancelled');
    await auditAdmin(req.user.id, 'tournament_cancel', 'tournament', id, null, null, reason || null, req.ip);
    return res.json(result);
  } catch (err) {
    return handleTournamentAdminError(res, err, 'cancel');
  }
});

// ── POST /api/admin/tournaments/:id/matches/:matchId/force-result ─
router.post('/tournaments/:id/matches/:matchId/force-result', async (req, res) => {
  try {
    const tId     = Number(req.params.id);
    const mId     = Number(req.params.matchId);
    const { winnerId, reason = 'admin_decision' } = req.body;

    if (!winnerId) return res.status(400).json({ error: 'winnerId es obligatorio' });

    const result = await TournamentService.forceResult(
      tId, mId, Number(winnerId), req.user.id, reason
    );
    await auditAdmin(req.user.id, 'tournament_force_result', 'tournament_match', mId,
      null, { winnerId, reason }, reason, req.ip);
    return res.json(result);
  } catch (err) {
    return handleTournamentAdminError(res, err, 'force-result');
  }
});

// ── POST /api/admin/tournaments/:id/matches/:matchId/resolve-absence
router.post('/tournaments/:id/matches/:matchId/resolve-absence', async (req, res) => {
  try {
    const tId = Number(req.params.id);
    const mId = Number(req.params.matchId);
    const result = await TournamentService.resolveAbsence(tId, mId, req.user.id);
    await auditAdmin(req.user.id, 'tournament_resolve_absence', 'tournament_match', mId,
      null, null, null, req.ip);
    return res.json(result);
  } catch (err) {
    return handleTournamentAdminError(res, err, 'resolve-absence');
  }
});

module.exports = router;
