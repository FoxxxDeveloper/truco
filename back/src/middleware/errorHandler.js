/**
 * Centralized error handler for the Express app.
 *
 * Error categories:
 *   - AppError:        known, operational errors (bad input, insufficient balance, etc.)
 *   - ValidationError: Joi / express-validator failures
 *   - JWT errors:      expired / invalid token
 *   - Generic 500:     unexpected programming errors (always log full stack)
 *
 * Money errors NEVER leak internal details to the client.
 */
const logger = require('../config/logger');

// ─── Typed application errors ─────────────────────────────────────────────────

class AppError extends Error {
  /**
   * @param {string} message    - Safe to send to clients
   * @param {number} statusCode
   * @param {string} [code]     - Machine-readable code for the frontend
   */
  constructor(message, statusCode = 400, code = 'APP_ERROR') {
    super(message);
    this.name       = 'AppError';
    this.statusCode = statusCode;
    this.code       = code;
    this.isOperational = true; // Don't page the on-call engineer for this
  }
}

class InsufficientFundsError extends AppError {
  constructor() {
    super('Saldo insuficiente', 402, 'INSUFFICIENT_FUNDS');
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

class ForbiddenError extends AppError {
  constructor(msg = 'Access denied') {
    super(msg, 403, 'FORBIDDEN');
  }
}

class RateLimitError extends AppError {
  constructor() {
    super('Too many requests — slow down', 429, 'RATE_LIMIT');
  }
}

// ─── Express error middleware ─────────────────────────────────────────────────

function errorHandler(err, req, res, _next) {
  // Already responded
  if (res.headersSent) return;

  const isProd = process.env.NODE_ENV === 'production';

  // ── Operational errors (expected) ─────────────────────────────────────────
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      error: err.message,
      code:  err.code,
    });
  }

  // ── JWT errors ─────────────────────────────────────────────────────────────
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Invalid or expired token', code: 'AUTH_INVALID' });
  }

  // ── MySQL errors ───────────────────────────────────────────────────────────
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'Duplicate entry', code: 'DUPLICATE' });
  }

  // ── Wallet / money errors (known messages) ────────────────────────────────
  if (/insufficient balance/i.test(err.message)) {
    return res.status(402).json({ error: 'Saldo insuficiente', code: 'INSUFFICIENT_FUNDS' });
  }

  // ── Unknown / programming errors ──────────────────────────────────────────
  logger.error('Unhandled error', {
    message:  err.message,
    stack:    err.stack,
    path:     req.path,
    method:   req.method,
    userId:   req.user?.id,
    ip:       req.ip,
  });

  return res.status(500).json({
    error: isProd ? 'Error interno del servidor' : err.message,
    code:  'INTERNAL_ERROR',
  });
}

// ─── Socket.IO error wrapper ──────────────────────────────────────────────────

/**
 * Wrap an async socket event handler so errors are caught and sent back
 * as `socket:error` instead of crashing the process.
 *
 * Usage:
 *   socket.on('game:playCard', socketWrap(async (data) => { ... }, socket));
 */
function socketWrap(fn, socket, eventName = 'unknown') {
  return async function wrappedHandler(data) {
    try {
      // Basic input sanitization — reject non-objects, oversized payloads
      if (data !== undefined && (typeof data !== 'object' || Array.isArray(data))) {
        logger.warn(`Socket: non-object payload on ${eventName} from user ${socket.data.user?.id}`);
        return socket.emit('game:error', { error: 'Invalid payload', code: 'BAD_INPUT' });
      }
      await fn(data);
    } catch (err) {
      if (err.isOperational) {
        socket.emit('game:error', { error: err.message, code: err.code });
      } else {
        logger.error(`Socket handler error [${eventName}]: ${err.message}`, {
          stack:  err.stack,
          userId: socket.data.user?.id,
          data,
        });
        socket.emit('game:error', { error: 'Error interno', code: 'INTERNAL_ERROR' });
      }
    }
  };
}

// ─── Input validation helpers ─────────────────────────────────────────────────

/**
 * Validate that a string looks like a UUID or short alphanumeric ID.
 * Prevents log injection and unexpected queries.
 */
function isValidRoomId(id) {
  return typeof id === 'string' && /^[a-f0-9-]{8,40}$/i.test(id);
}

function isValidCardId(id) {
  return typeof id === 'string' && /^[a-z0-9_]{2,20}$/.test(id);
}

function isValidBetType(bt) {
  const valid = ['envido', 'real_envido', 'falta_envido', 'truco', 'retruco', 'vale_cuatro', 'flor', 'contraflor', 'contraflor_al_resto'];
  return typeof bt === 'string' && valid.includes(bt);
}

function isValidResponse(r) {
  return ['accept', 'reject', 'raise'].includes(r);
}

module.exports = {
  AppError,
  InsufficientFundsError,
  NotFoundError,
  ForbiddenError,
  RateLimitError,
  errorHandler,
  socketWrap,
  isValidRoomId,
  isValidCardId,
  isValidBetType,
  isValidResponse,
};
