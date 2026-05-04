/**
 * Telegram Bot Webhook
 *
 * Setup:
 *   1. Create a bot via @BotFather → get TELEGRAM_BOT_TOKEN
 *   2. Set TELEGRAM_BOT_SECRET and TELEGRAM_ADMIN_CHAT_ID in .env
 *   3. Register webhook:
 *      curl -X POST https://api.telegram.org/bot<TOKEN>/setWebhook \
 *        -d url=https://yourserver.com/api/telegram/webhook \
 *        -d secret_token=<TELEGRAM_BOT_SECRET>
 *
 * Flow:
 *   User requests deposit in app → token generated → admin gets Telegram message
 *   Admin types /confirm <token> in bot chat
 *   Bot webhook fires → backend credits user balance
 *
 * Security:
 *   - Webhook protected by X-Telegram-Bot-Api-Secret-Token header (Telegram sends it automatically)
 *   - Only commands from the configured ADMIN_CHAT_ID are honored for /confirm and /reject
 *   - Idempotency key prevents double-processing
 *   - All amounts re-read from DB (never from the Telegram message)
 */
const express        = require('express');
const WalletService  = require('../services/walletService');
const NotificationService = require('../services/notificationService');
const logger         = require('../config/logger');
const { query }      = require('../config/database');

const router = express.Router();

const BOT_SECRET    = process.env.TELEGRAM_BOT_SECRET    || '';
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID || '';
const BOT_TOKEN     = process.env.TELEGRAM_BOT_TOKEN     || '';

// ── Telegram API helper ────────────────────────────────────────────────────────
async function sendTelegramMessage(chatId, text) {
  if (!BOT_TOKEN) return; // bot not configured
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      }
    );
    if (!res.ok) logger.warn('Telegram sendMessage failed: ' + res.status);
  } catch (err) {
    logger.error('Telegram sendMessage error: ' + err.message);
  }
}

// ── Webhook endpoint ───────────────────────────────────────────────────────────
router.post('/webhook', async (req, res) => {
  // 1. Verify Telegram secret header (prevents spoofed requests)
  const incomingSecret = req.headers['x-telegram-bot-api-secret-token'];
  if (BOT_SECRET && incomingSecret !== BOT_SECRET) {
    logger.warn('Telegram webhook: invalid secret');
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Telegram always expects 200 OK immediately
  res.status(200).json({ ok: true });

  const update = req.body;
  const message = update?.message;
  if (!message || !message.text) return;

  const chatId = String(message.chat.id);
  const text   = message.text.trim();

  // ── User: /link <token>  (called from user's own chat with the bot) ──────────
  const linkMatch = text.match(/^\/link\s+([a-zA-Z0-9_-]+)$/i);
  if (linkMatch) {
    const linkToken = linkMatch[1];
    // Store telegram_user_id linking
    const rows = await query(
      "SELECT user_id FROM telegram_requests WHERE token = ? AND status = 'pending' AND type = 'deposit' LIMIT 1",
      [linkToken]
    ).catch(() => []);
    if (rows.length) {
      const userId = rows[0].user_id;
      await query(
        'UPDATE usuarios SET telegram_user_id = ?, telegram_linked_at = NOW() WHERE id = ?',
        [message.from.id, userId]
      ).catch(() => {});
      await sendTelegramMessage(chatId, '✅ Cuenta vinculada correctamente. Tus depósitos y retiros serán procesados aquí.');
    } else {
      await sendTelegramMessage(chatId, '❌ Token inválido o expirado.');
    }
    return;
  }

  // ── Admin commands — only allowed from admin chat ─────────────────────────────
  if (chatId !== String(ADMIN_CHAT_ID)) return;

  // /confirm <token>
  const confirmMatch = text.match(/^\/confirm\s+([a-f0-9]{32,})$/i);
  if (confirmMatch) {
    const token = confirmMatch[1];
    await handleAdminConfirm(token, chatId);
    return;
  }

  // /reject <token> [reason]
  const rejectMatch = text.match(/^\/reject\s+([a-f0-9]{32,})(.*)$/i);
  if (rejectMatch) {
    const token  = rejectMatch[1];
    const reason = rejectMatch[2].trim() || 'Rechazado por el administrador';
    await handleAdminReject(token, reason, chatId);
    return;
  }

  // /pending — list pending requests
  if (text === '/pending') {
    const rows = await query(
      `SELECT t.id, t.type, t.amount, t.token, t.created_at, u.username
       FROM telegram_requests t
       JOIN usuarios u ON u.id = t.user_id
       WHERE t.status = 'pending' AND t.expires_at > NOW()
       ORDER BY t.created_at ASC LIMIT 10`
    ).catch(() => []);

    if (!rows.length) {
      await sendTelegramMessage(chatId, 'No hay solicitudes pendientes.');
    } else {
      const lines = rows.map(r =>
        `• [${r.type.toUpperCase()}] ${r.username} $${r.amount}\n  Token: <code>${r.token}</code>`
      ).join('\n\n');
      await sendTelegramMessage(chatId, `<b>Solicitudes pendientes:</b>\n\n${lines}`);
    }
    return;
  }
});

async function handleAdminConfirm(token, adminChatId) {
  try {
    const rows = await query(
      "SELECT * FROM telegram_requests WHERE token = ? AND status = 'pending'",
      [token]
    );
    if (!rows.length) {
      await sendTelegramMessage(adminChatId, `❌ Token no encontrado: ${token}`);
      return;
    }

    const req = rows[0];
    if (new Date() > new Date(req.expires_at)) {
      await sendTelegramMessage(adminChatId, `⏰ Solicitud expirada: ${token}`);
      await query("UPDATE telegram_requests SET status = 'expired' WHERE id = ?", [req.id]);
      return;
    }

    const idempotencyKey = `tg_confirm:${req.id}`;

    if (req.type === 'deposit') {
      const result = await WalletService.deposit(
        req.user_id, parseFloat(req.amount), `telegram_deposit:${token}`, idempotencyKey
      );
      await query("UPDATE telegram_requests SET status = 'confirmed' WHERE id = ?", [req.id]);

      // Notify user
      const [user] = await query('SELECT username FROM usuarios WHERE id = ?', [req.user_id]);
      await NotificationService.create({
        userId:   req.user_id,
        type:     'deposit',
        title:    `Depósito confirmado: $${req.amount}`,
        body:     `Tu depósito de $${req.amount} fue acreditado.`,
        metadata: { amount: req.amount, newBalance: result.balance },
      });

      await sendTelegramMessage(adminChatId,
        `✅ Depósito confirmado.\nUsuario: ${user?.username}\nMonto: $${req.amount}\nToken: ${token}`
      );

      // Notify user's Telegram if linked
      const [tgUser] = await query('SELECT telegram_user_id FROM usuarios WHERE id = ?', [req.user_id]);
      if (tgUser?.telegram_user_id) {
        await sendTelegramMessage(tgUser.telegram_user_id, `✅ Depósito de $${req.amount} acreditado en tu cuenta.`);
      }

    } else if (req.type === 'withdrawal') {
      // Find the pending withdrawal transaction
      const txRows = await query(
        "SELECT id FROM transactions WHERE user_id = ? AND type = 'withdrawal' AND status = 'pending' AND reference LIKE ? LIMIT 1",
        [req.user_id, `%${token}%`]
      );
      if (txRows.length) {
        await WalletService.confirmWithdrawal(txRows[0].id);
      }
      await query("UPDATE telegram_requests SET status = 'confirmed' WHERE id = ?", [req.id]);

      const [user] = await query('SELECT username FROM usuarios WHERE id = ?', [req.user_id]);
      await NotificationService.create({
        userId: req.user_id,
        type:   'withdrawal',
        title:  `Retiro procesado: $${req.amount}`,
        body:   `Tu retiro de $${req.amount} fue procesado exitosamente.`,
        metadata: { amount: req.amount },
      });

      await sendTelegramMessage(adminChatId,
        `✅ Retiro confirmado.\nUsuario: ${user?.username}\nMonto: $${req.amount}\nToken: ${token}`
      );
    }
  } catch (err) {
    logger.error('Telegram confirm error: ' + err.message);
    await sendTelegramMessage(adminChatId, `❌ Error al confirmar: ${err.message}`);
  }
}

async function handleAdminReject(token, reason, adminChatId) {
  try {
    const rows = await query(
      "SELECT * FROM telegram_requests WHERE token = ? AND status = 'pending'",
      [token]
    );
    if (!rows.length) {
      await sendTelegramMessage(adminChatId, `❌ Token no encontrado: ${token}`);
      return;
    }
    const req = rows[0];

    if (req.type === 'withdrawal') {
      // Return funds to balance
      const txRows = await query(
        "SELECT id FROM transactions WHERE user_id = ? AND type = 'withdrawal' AND status = 'pending' LIMIT 1",
        [req.user_id]
      );
      if (txRows.length) {
        await WalletService.rejectWithdrawal(txRows[0].id);
      }
    }

    await query(
      "UPDATE telegram_requests SET status = 'rejected', notes = ? WHERE id = ?",
      [reason, req.id]
    );

    const [user] = await query('SELECT username FROM usuarios WHERE id = ?', [req.user_id]);
    await NotificationService.create({
      userId:   req.user_id,
      type:     req.type === 'deposit' ? 'deposit' : 'withdrawal',
      title:    `${req.type === 'deposit' ? 'Depósito' : 'Retiro'} rechazado: $${req.amount}`,
      body:     reason,
      metadata: { amount: req.amount, reason },
    });

    await sendTelegramMessage(adminChatId,
      `⚠️ Solicitud rechazada.\nUsuario: ${user?.username}\nMonto: $${req.amount}\nMotivo: ${reason}`
    );
  } catch (err) {
    logger.error('Telegram reject error: ' + err.message);
    await sendTelegramMessage(adminChatId, `❌ Error al rechazar: ${err.message}`);
  }
}

module.exports = router;
