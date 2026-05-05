const jwt    = require('jsonwebtoken');
const User   = require('../models/User');
const logger = require('../config/logger');

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    logger.warn('auth failed: missing token', { ip: req.ip, path: req.path });
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = header.slice(7);

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    logger.warn('auth failed: invalid token', { ip: req.ip, path: req.path, reason: err.message });
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Verify user still exists and is active in DB.
  // This catches banned/suspended users who already have a valid token.
  let user;
  try {
    user = await User.findById(decoded.id);
  } catch (err) {
    logger.error('auth middleware DB error', { ip: req.ip, path: req.path });
    return res.status(500).json({ error: 'Server error' });
  }

  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  if (user.status === 'banned') {
    logger.warn('auth blocked: banned user', { userId: user.id, path: req.path });
    return res.status(403).json({ error: 'Tu cuenta fue suspendida permanentemente' });
  }

  if (user.status === 'suspended') {
    logger.warn('auth blocked: suspended user', { userId: user.id, path: req.path });
    return res.status(403).json({ error: 'Tu cuenta está suspendida temporalmente' });
  }

  // Attach fresh DB data (not just JWT claims) so routes get up-to-date role/status
  req.user = {
    id:       user.id,
    username: user.username,
    email:    user.email,
    role:     user.role,
    status:   user.status,
    elo:      user.elo,
  };
  next();
}

module.exports = authMiddleware;