/**
 * Social routes — Friends, notifications, private messages
 */
const express             = require('express');
const authMiddleware      = require('../middleware/auth');
const Friend              = require('../models/Friend');
const Message             = require('../models/Message');
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

// GET /api/social/friends/requests
router.get('/friends/requests', async (req, res) => {
  try {
    const requests = await Friend.getPendingReceived(req.user.id);
    return res.json({ requests });
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

    await Friend.sendRequest(req.user.id, targetId);

    // Notify target
    await NotificationService.create({
      userId:   targetId,
      type:     'friend_request',
      title:    `${req.user.username} quiere ser tu amigo`,
      metadata: { fromId: req.user.id, fromUsername: req.user.username },
    });

    return res.json({ ok: true });
  } catch (err) {
    logger.error('send friend request: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/social/friends/:userId/accept
router.put('/friends/:userId/accept', async (req, res) => {
  try {
    const requesterId = parseInt(req.params.userId);
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

// GET /api/social/messages/:userId — conversation history
router.get('/messages/:userId', async (req, res) => {
  try {
    const otherId = parseInt(req.params.userId);
    if (isNaN(otherId)) return res.status(400).json({ error: 'Invalid userId' });

    // Only friends can chat (optional security rule)
    const areFriends = await Friend.areFriends(req.user.id, otherId);
    if (!areFriends) return res.status(403).json({ error: 'Not friends' });

    const messages = await Message.getConversation(req.user.id, otherId, req.query);
    // Mark messages from other user as read
    await Message.markRead(otherId, req.user.id);
    return res.json({ messages });
  } catch (err) {
    logger.error('get messages: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/social/messages/unread-count
router.get('/messages/unread-count', async (req, res) => {
  try {
    const count = await Message.unreadCount(req.user.id);
    return res.json({ count });
  } catch (err) {
    logger.error('unread count: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
