require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const logger         = require('./config/logger');
const { testConnection } = require('./config/database');
const setupSocketIO  = require('./socket/socketManager');
const { errorHandler } = require('./middleware/errorHandler');

const authRoutes         = require('./routes/auth');
const rankingRoutes      = require('./routes/ranking');
const walletRoutes       = require('./routes/wallet');
const challengeRoutes    = require('./routes/challenge');
const battlesRoutes      = require('./routes/battles');
const profileRoutes      = require('./routes/profile');
const socialRoutes       = require('./routes/social');
const telegramRoutes     = require('./routes/telegram');
const adminRoutes        = require('./routes/admin');
const verificationRoutes = require('./routes/verification');
const usersRoutes        = require('./routes/users');
const BattleService      = require('./services/battleService');

const app    = express();
const server = http.createServer(app);

// ── SECURITY ──────────────────────────────────────────────────────
app.use(helmet());
app.set('trust proxy', 1);

// ── CORS ──────────────────────────────────────────────────────────
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',').map(o => o.trim());

const corsOptions = {
  origin(origin, cb) {
    // Allow requests with no origin (curl, mobile apps, same-origin)
    if (!origin) return cb(null, true);
    // In development, allow any localhost port
    if (process.env.NODE_ENV !== 'production' && /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
      return cb(null, true);
    }
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true,
};
app.use(cors(corsOptions));

// ── BODY PARSING ──────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));

// ── STATIC FILES ──────────────────────────────────────────────────
app.use('/uploads', express.static(require('path').join(__dirname, '../uploads')));

// ── LOGGING ───────────────────────────────────────────────────────
app.use(morgan('combined', {
  stream: { write: (msg) => logger.info(msg.trim()) },
}));

// ── GLOBAL RATE LIMIT ─────────────────────────────────────────────
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
}));

// ── ROUTES ────────────────────────────────────────────────────────
app.use('/api/auth',         authRoutes);
app.use('/api/ranking',      rankingRoutes);
app.use('/api/wallet',       walletRoutes);
app.use('/api/challenges',   challengeRoutes);
app.use('/api/battles',      battlesRoutes);
app.use('/api/profile',      profileRoutes);
app.use('/api/social',       socialRoutes);
app.use('/api/telegram',     telegramRoutes);
app.use('/api/admin',        adminRoutes);
app.use('/api/verification', verificationRoutes);
app.use('/api/users',        usersRoutes);

app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));

// 404 handler
app.use((_req, res) => res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' }));

// Centralized error handler (must be LAST middleware)
app.use(errorHandler);

// ── SOCKET.IO ─────────────────────────────────────────────────────
const io = new Server(server, {
  cors: corsOptions,
  transports: ['websocket', 'polling'],
  pingTimeout: 20000,
  pingInterval: 25000,
});

setupSocketIO(io);

// ── START ─────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT) || 3001;

async function start() {
  const dbOk = await testConnection();
  if (!dbOk) {
    logger.warn('Starting without DB connection — some features unavailable');
  }

  // Cron: expire old battle rooms every 2 minutes
  setInterval(() => {
    BattleService.expireOld().catch(err => logger.error('Expire battles cron: ' + err.message));
  }, 2 * 60 * 1000);

  server.listen(PORT, () => {
    logger.info(`Truco server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
  });
}

start().catch(err => {
  logger.error('Fatal startup error: ' + err.message);
  process.exit(1);
});

module.exports = { app, server };
