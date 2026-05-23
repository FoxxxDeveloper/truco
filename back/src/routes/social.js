/**
 * Social routes — Friends, notifications, private messages
 */
const express             = require('express');
const authMiddleware      = require('../middleware/auth');
const Friend              = require('../models/Friend');
const Message             = require('../models/Message');
const GeneralMessage      = require('../models/GeneralMessage');
const NotificationService = require('../services/notificationService');
const logger              = require('../config/logger');
const { query }           = require('../config/database');

const router = express.Router();
router.use(authMiddleware);

// ── Friends ────────────────────────────────────────────────────────────────────

// GET /api/social/friends
router.get('/friends', async (req, res) => {
  try {
    const friends = await Friend.getList(req.user.id);
    return res.json({ friends });
  } catch (err) {
    logger.error('get friends: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/social/friends/requests — received (incoming) + sent (outgoing)
router.get('/friends/requests', async (req, res) => {
  try {
    const received = await Friend.getPendingReceived(req.user.id);
    const sent = await Friend.getPendingSent(req.user.id);
    return res.json({ received, sent, requests: received });
  } catch (err) {
    logger.error('get friend requests: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/social/friends/:userId/request
router.post('/friends/:userId/request', async (req, res) => {
  try {
    const targetId = parseInt(req.params.userId);
    if (isNaN(targetId) || targetId === req.user.id) {
      return res.status(400).json({ error: 'Invalid user' });
    }

    // Verify target exists
    const [target] = await query('SELECT id, username FROM usuarios WHERE id = ?', [targetId]);
    if (!target) return res.status(404).json({ error: 'User not found' });

    const rel = await Friend.getRelationship(req.user.id, targetId);
    if (rel?.status === 'accepted') {
      return res.status(400).json({ error: 'Ya son amigos' });
    }
    if (rel?.status === 'pending') {
      if (Number(rel.requested_by) === Number(req.user.id)) {
        return res.status(400).json({ error: 'Ya enviaste una solicitud pendiente' });
      }
      return res.status(400).json({
        error: 'Ya recibiste una solicitud de este usuario. Revisá la pestaña Solicitudes.',
      });
    }
    if (rel?.status === 'blocked') {
      return res.status(400).json({ error: 'No se puede enviar solicitud' });
    }

    await Friend.sendRequest(req.user.id, targetId);

    // Notify target
    await NotificationService.create({
      userId:   targetId,
      type:     'friend_request',
      title:    `${req.user.username} quiere ser tu amigo`,
      metadata: { fromId: req.user.id, fromUsername: req.user.username },
    });

    return res.json({ ok: true, friendshipStatus: 'request_sent' });
  } catch (err) {
    logger.error('send friend request: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/social/friends/:userId/accept
router.put('/friends/:userId/accept', async (req, res) => {
  try {
    const requesterId = parseInt(req.params.userId);
    const existing = await Friend.getFriendshipStatus(req.user.id, requesterId);
    if (existing === 'friends') {
      return res.json({ ok: true, alreadyAccepted: true });
    }
    await Friend.acceptRequest(req.user.id, requesterId);

    // Notify requester
    await NotificationService.create({
      userId:   requesterId,
      type:     'friend_accepted',
      title:    `${req.user.username} aceptó tu solicitud de amistad`,
      metadata: { userId: req.user.id, username: req.user.username },
    });

    return res.json({ ok: true });
  } catch (err) {
    if (err.message.includes('No pending')) {
      return res.status(400).json({ error: err.message });
    }
    logger.error('accept friend: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/social/friends/:userId
router.delete('/friends/:userId', async (req, res) => {
  try {
    await Friend.remove(req.user.id, parseInt(req.params.userId));
    return res.json({ ok: true });
  } catch (err) {
    logger.error('remove friend: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ── Notifications ──────────────────────────────────────────────────────────────

// GET /api/social/notifications
router.get('/notifications', async (req, res) => {
  try {
    const { limit = 30, offset = 0 } = req.query;
    const notifications = await NotificationService.getAll(req.user.id, { limit, offset });
    const unreadCount   = await NotificationService.countUnread(req.user.id);
    return res.json({ notifications, unreadCount });
  } catch (err) {
    logger.error('get notifications: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/social/notifications/read-all
router.put('/notifications/read-all', async (req, res) => {
  try {
    await NotificationService.markAllRead(req.user.id);
    return res.json({ ok: true });
  } catch (err) {
    logger.error('mark all read: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/social/notifications/:id/read
router.put('/notifications/:id/read', async (req, res) => {
  try {
    await NotificationService.markRead(parseInt(req.params.id), req.user.id);
    return res.json({ ok: true });
  } catch (err) {
    logger.error('mark read: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ── Private messages ───────────────────────────────────────────────────────────

// IMPORTANT: static sub-paths MUST be defined before /:userId to avoid route shadowing.

// GET /api/social/messages/unread-summary — per-sender unread counts
router.get('/messages/unread-summary', async (req, res) => {
  try {
    const summary = await Message.unreadSummary(req.user.id);
    return res.json(summary);
  } catch (err) {
    logger.error('unread summary: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/social/messages/unread-count — total unread count
router.get('/messages/unread-count', async (req, res) => {
  try {
    const count = await Message.unreadCount(req.user.id);
    return res.json({ count });
  } catch (err) {
    logger.error('unread count: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/social/messages/:userId — conversation history
router.get('/messages/:userId', async (req, res) => {
  try {
    const otherId = parseInt(req.params.userId);
    if (isNaN(otherId)) return res.status(400).json({ error: 'Invalid userId' });

    const areFriends = await Friend.areFriends(req.user.id, otherId);
    if (!areFriends) return res.status(403).json({ error: 'Not friends' });

    const messages = await Message.getConversation(req.user.id, otherId, req.query);
    logger.info(`[chat] GET messages/:friendId count=${messages.length} me=${req.user.id} other=${otherId}`);
    // Auto-mark messages from other user as read when conversation is fetched
    await Message.markRead(otherId, req.user.id);
    return res.json({ messages });
  } catch (err) {
    logger.error('get messages: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/social/messages/:userId/read — explicit mark-read (called when chat is open)
router.post('/messages/:userId/read', async (req, res) => {
  try {
    const otherId = parseInt(req.params.userId);
    if (isNaN(otherId)) return res.status(400).json({ error: 'Invalid userId' });
    await Message.markRead(otherId, req.user.id);
    return res.json({ ok: true });
  } catch (err) {
    logger.error('mark messages read: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ── General messages ───────────────────────────────────────────────────────────

// GET /api/social/general-messages?limit=50
router.get('/general-messages', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const messages = await GeneralMessage.getRecent(limit);
    logger.info(`[chat] GET general-messages count=${messages.length} userId=${req.user.id}`);
    return res.json({ messages });
  } catch (err) {
    logger.error('get general messages: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
