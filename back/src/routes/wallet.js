/**
 * Wallet routes
 * All endpoints require authentication.
 * All monetary amounts are re-validated server-side — never trust client input.
 */
const express  = require('express');
const rateLimit = require('express-rate-limit');
const WalletService  = require('../services/walletService');
const authMiddleware = require('../middleware/auth');
const logger         = require('../config/logger');
const { query }      = require('../config/database');

const router = express.Router();

// Stricter rate limit on financial endpoints
const financialLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many financial requests, try again later' },
});

router.use(authMiddleware);

// GET /api/wallet — current balance (auto-creates wallet if missing)
router.get('/', async (req, res) => {
  try {
    let wallet = await WalletService.getBalance(req.user.id);
    if (!wallet) {
      await WalletService.init(req.user.id);
      wallet = { balance: 0, reserved: 0 };
    }
    return res.json(wallet);
  } catch (err) {
    logger.error('wallet GET: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/wallet/transactions — paginated history
router.get('/transactions', async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;
    const txs = await WalletService.getHistory(req.user.id, { limit, offset });
    return res.json({ transactions: txs });
  } catch (err) {
    logger.error('wallet transactions: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/wallet/deposit/request — create a pending deposit request (→ Telegram)
router.post('/deposit/request', financialLimit, async (req, res) => {
  try {
    const amount = parseFloat(req.body.amount);
    if (!isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const { v4: uuidv4 } = require('uuid');
    const token     = uuidv4().replace(/-/g, ''); // 32-char hex token
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await query(
      `INSERT INTO telegram_requests (user_id, type, amount, token, expires_at)
       VALUES (?, 'deposit', ?, ?, ?)`,
      [req.user.id, amount, token, expiresAt]
    );

    // In production: send Telegram message to admin here
    // e.g., telegramBot.sendMessage(ADMIN_CHAT_ID, `Deposit request: $${amount}\nUser: ${req.user.username}\nToken: ${token}\nConfirm: /confirm_${token}`)

    return res.status(201).json({
      message: 'Deposit request created. An admin will process it shortly.',
      token,   // shown to user so they can reference it
      amount,
      expiresAt,
    });
  } catch (err) {
    logger.error('deposit request: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/wallet/withdraw/request — request withdrawal
router.post('/withdraw/request', financialLimit, async (req, res) => {
  try {
    const amount = parseFloat(req.body.amount);
    if (!isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const { v4: uuidv4 } = require('uuid');
    const token     = uuidv4().replace(/-/g, '');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    // Immediately lock the funds to prevent double-withdraw
    const { transactionId } = await WalletService.requestWithdrawal(
      req.user.id,
      amount,
      `withdrawal_request:${token}`
    );

    await query(
      `INSERT INTO telegram_requests (user_id, type, amount, token, expires_at)
       VALUES (?, 'withdrawal', ?, ?, ?)`,
      [req.user.id, amount, token, expiresAt]
    );

    // In production: notify admin via Telegram
    // telegramBot.sendMessage(ADMIN_CHAT_ID, `Withdrawal: $${amount}\nUser: ${req.user.username}\nToken: ${token}`)

    return res.status(201).json({
      message: 'Withdrawal request created. An admin will process it shortly.',
      token,
      transactionId,
      amount,
      expiresAt,
    });
  } catch (err) {
    if (err.message === 'Insufficient balance') {
      return res.status(400).json({ error: 'Insufficient balance' });
    }
    logger.error('withdraw request: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
