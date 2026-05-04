const winston = require('winston');
const path    = require('path');
const fs      = require('fs');

// Ensure logs/ dir exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

const isProd = process.env.NODE_ENV === 'production';

// ── Base logger ───────────────────────────────────────────────────────────────
const logger = winston.createLogger({
  level: isProd ? 'info' : 'debug',
  format: isProd
    // Structured JSON for log aggregators (CloudWatch, Loki, ELK)
    ? winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      )
    // Human-readable in development
    : winston.format.combine(
        winston.format.timestamp({ format: 'HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
          const extra = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
          return `[${timestamp}] ${level}: ${stack || message}${extra}`;
        })
      ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log',    level: 'error', maxsize: 10_485_760, maxFiles: 5 }),
    new winston.transports.File({ filename: 'logs/combined.log',               maxsize: 10_485_760, maxFiles: 10 }),
  ],
});

// ── Audit logger — immutable record of every money movement ──────────────────
// Written to a separate file, never to console, append-only.
const auditLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/audit.log', maxsize: 52_428_800, maxFiles: 30, tailable: true }),
  ],
});

/**
 * Record a money-related event.
 * @param {string} event   - e.g. 'deposit', 'bet_lock', 'settle_game', 'refund'
 * @param {object} data    - userId, amount, challengeId, etc.
 */
function auditLog(event, data) {
  auditLogger.info({ event, ...data });
}

// ── Security logger — suspicious activity ────────────────────────────────────
const secLogger = winston.createLogger({
  level: 'warn',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/security.log', maxsize: 10_485_760, maxFiles: 10 }),
    new winston.transports.Console({ level: 'warn' }),
  ],
});

/**
 * Log a suspicious / anti-cheat event.
 * @param {string} event   - e.g. 'play_out_of_turn', 'invalid_card', 'rate_limit_hit'
 * @param {object} data    - userId, socketId, roomId, ip, etc.
 */
function securityLog(event, data) {
  secLogger.warn({ event, ...data });
}

module.exports = logger;
module.exports.auditLog    = auditLog;
module.exports.securityLog = securityLog;
