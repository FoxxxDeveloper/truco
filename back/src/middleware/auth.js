const jwt    = require('jsonwebtoken');
const logger = require('../config/logger');

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    logger.warn('auth failed: missing token', { ip: req.ip, path: req.path });
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = header.slice(7);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    logger.warn('auth failed: invalid token', { ip: req.ip, path: req.path, reason: err.message });
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = authMiddleware;