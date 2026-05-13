/**
 * Sets req.user when a valid Bearer token is present; otherwise req.user = null.
 * Never returns 401 (unlike authMiddleware).
 */
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../config/logger');

async function optionalAuth(req, res, next) {
  req.user = null;
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next();
  }
  const token = header.slice(7);
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return next();
  }
  try {
    const user = await User.findById(decoded.id);
    if (!user || user.status === 'banned' || user.status === 'suspended') {
      return next();
    }
    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status,
      elo: user.elo,
    };
  } catch (err) {
    logger.warn('optionalAuth DB error', { path: req.path, message: err.message });
  }
  return next();
}

module.exports = optionalAuth;
