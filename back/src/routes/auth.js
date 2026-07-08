const express      = require('express');
const jwt          = require('jsonwebtoken');
const User         = require('../models/User');
const Ranking      = require('../models/Ranking');
const WalletService = require('../services/walletService');
const rateLimit    = require('express-rate-limit');
const logger       = require('../config/logger');
const { isProduction } = require('../config/rateLimitEnv');

const router = express.Router();

/** Login y registro NO comparten contador (antes un mismo limiter agotaba intentos mezclados). */
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 12 : 300,
  message: { error: 'Demasiados intentos de registro. Probá más tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 30 : 400,
  message: { error: 'Demasiados intentos de inicio de sesión. Probá más tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/auth/register
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields required' });
    }
    if (username.length < 3 || username.length > 50) {
      return res.status(400).json({ error: 'Username must be 3–50 characters' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email' });
    }

    const existingUser = await User.findByEmail(email);
    if (existingUser) return res.status(409).json({ error: 'Email already registered' });

    const existingUsername = await User.findByUsername(username);
    if (existingUsername) return res.status(409).json({ error: 'Username taken' });

    const id = await User.create({ username, email, password });
    // Create initial ranking and wallet entries for the new user
    await Promise.all([
      Ranking.initForUser(id),
      WalletService.init(id),
    ]);
    const user = await User.findById(id);

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role || 'user' },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return res.status(201).json({ token, user: User.toPublic(user) });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/login
// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'All fields required' });
    }

    const user = await User.findByEmail(email);

    if (!user) {
      return res.status(401).json({ message: 'Usuario o contraseña incorrectos.' });
    }

    const valid = await User.verifyPassword(password, user.password);

    if (!valid) {
      return res.status(401).json({ message: 'Usuario o contraseña incorrectos.' });
    }

    if (user.status === 'banned') {
      return res.status(403).json({ error: 'Account banned. Contact support.' });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'Account suspended. Contact support.' });
    }

    if (!process.env.JWT_SECRET) {
      logger.error('JWT_SECRET is not configured');
      return res.status(500).json({ error: 'JWT_SECRET not configured' });
    }

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role || 'user',
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
      }
    );

    const publicUser = await User.findById(user.id);

    return res.json({
      token,
      user: User.toPublic(publicUser),
    });
  } catch (err) {
    logger.error('login error: ' + err.message, { ip: req.ip });

    return res.status(500).json({
      error: 'Server error',
      detail: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
});

// GET /api/auth/me
router.get('/me', require('../middleware/auth'), async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({ user: User.toPublic(user) });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
