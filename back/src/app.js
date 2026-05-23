const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const {
  corsOptions,
  getSocketCors,
  refreshAllowedOrigins,
  allowedOrigins,
} = require('./config/cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { isProduction } = require('./config/rateLimitEnv');

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
const authMiddleware     = require('./middleware/auth');
const socialRoutes       = require('./routes/social');
const telegramRoutes     = require('./routes/telegram');
const adminRoutes        = require('./routes/admin');
const verificationRoutes = require('./routes/verification');
const usersRoutes        = require('./routes/users');
const tournamentRoutes   = require('./routes/tournaments');
const BattleService      = require('./services/battleService');
const staleGameCleanup   = require('./services/staleGameCleanup');
const gameHandlerModule  = require('./socket/handlers/gameHandler');
const { startTournamentScheduler, stopTournamentScheduler } = require('./services/tournamentScheduler');

const app    = express();
const server = http.createServer(app);

// ── SECURITY ──────────────────────────────────────────────────────
app.use(helmet());
app.set('trust proxy', 1);

// ── CORS (CLIENT_ORIGIN / CORS_ORIGINS — ver src/config/cors.js) ───
refreshAllowedOrigins();
app.use(cors(corsOptions));

// ── BODY PARSING ──────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));

// ── STATIC FILES ──────────────────────────────────────────────────
app.use('/uploads', express.static(require('path').join(__dirname, '../uploads')));

// ── LOGGING ───────────────────────────────────────────────────────
app.use(morgan('combined', {
  stream: { write: (msg) => logger.info(msg.trim()) },
}));

// ── GLOBAL RATE LIMIT (todas las rutas /api/* salvo skip) ─────────
// En desarrollo: mucho más permisivo (HMR, Strict Mode, muchas pestañas).
// En producción: tope razonable por IP para absorber picos sin bloquear uso normal.
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 500 : 12000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/api/health' || req.originalUrl === '/api/health',
}));

// ── ROUTES ────────────────────────────────────────────────────────
app.use('/api/auth',         authRoutes);
app.use('/api/ranking',      rankingRoutes);
app.use('/api/wallet',       walletRoutes);
app.use('/api/challenges',   challengeRoutes);
app.use('/api/battles',      battlesRoutes);
app.use('/api/profile',      profileRoutes);
app.get('/api/me/matches', authMiddleware, profileRoutes.matchHistoryHandler);
app.use('/api/social',       socialRoutes);
app.use('/api/telegram',     telegramRoutes);
app.use('/api/admin',        adminRoutes);
app.use('/api/verification', verificationRoutes);
app.use('/api/users',        usersRoutes);
app.use('/api/tournaments',  tournamentRoutes);

app.get('/api/health', (_req, res) => res.json({
  status: 'ok',
  ts: Date.now(),
  cors: {
    allowedCount: allowedOrigins.length,
    origins: allowedOrigins,
  },
}));

// 404 handler
app.use((_req, res) => res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' }));

// Centralized error handler (must be LAST middleware)
app.use(errorHandler);

// ── SOCKET.IO ─────────────────────────────────────────────────────
const io = new Server(server, {
  cors: getSocketCors(),
  transports: ['websocket', 'polling'],
  pingTimeout: 20000,
  pingInterval: 25000,
});

app.set('io', io);

setupSocketIO(io);
startTournamentScheduler(io);

staleGameCleanup.setGameLifecycleHooks({
  finishBothDisconnected: gameHandlerModule.finishBothDisconnectedForPublic,
  finishAbandonWin: gameHandlerModule.finishAbandonForPublic,
});

function shutdownSchedulers() {
  try {
    stopTournamentScheduler();
  } catch (e) {
    logger.warn('stopTournamentScheduler: ' + e.message);
  }
}
process.once('SIGINT', shutdownSchedulers);
process.once('SIGTERM', shutdownSchedulers);

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

  staleGameCleanup.resolveExpiredDisconnectedGames(io).catch(err =>
    logger.error('Stale games cold start: ' + err.message)
  );
  setInterval(() => {
    staleGameCleanup.resolveExpiredDisconnectedGames(io).catch(err =>
      logger.error('Stale games cron: ' + err.message)
    );
  }, 60 * 1000);

  server.listen(PORT, () => {
    logger.info(`Truco server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
  });
}

start().catch(err => {
  logger.error('Fatal startup error: ' + err.message);
  process.exit(1);
});

module.exports = { app, server };
