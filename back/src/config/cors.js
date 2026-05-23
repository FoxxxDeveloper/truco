/**
 * CORS allowlist — orígenes sin path (Origin del navegador nunca incluye /test).
 * Variables: CLIENT_ORIGIN o CORS_ORIGINS (comma-separated).
 */
const path = require('path');

// Cargar .env con ruta absoluta (no depende del cwd de PM2)
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const logger = require('./logger');

const CORS_REJECT_MSG = 'Origen no permitido por CORS';

const PRODUCTION_ORIGIN_FALLBACK = [
  'https://trucofx.com',
  'https://www.trucofx.com',
];

/** @param {string} raw */
function normalizeOrigin(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let o = raw.trim().replace(/^["']|["']$/g, '');
  if (!o) return null;
  try {
    const url = new URL(o.includes('://') ? o : `https://${o}`);
    return `${url.protocol}//${url.host}`;
  } catch {
    return o.replace(/\/+$/, '');
  }
}

function loadAllowedOrigins() {
  const raw = process.env.CLIENT_ORIGIN || process.env.CORS_ORIGINS || '';
  const list = raw
    .split(',')
    .map((part) => normalizeOrigin(part))
    .filter(Boolean);

  const fromFrontend = normalizeOrigin(process.env.FRONTEND_URL || '');
  if (fromFrontend && !list.includes(fromFrontend)) {
    list.push(fromFrontend);
  }

  if (list.length === 0 && process.env.NODE_ENV !== 'production') {
    list.push('http://localhost:5173');
  }

  if (list.length === 0 && process.env.NODE_ENV === 'production') {
    logger.warn(
      'CORS: CLIENT_ORIGIN vacío en producción — usando fallback trucofx.com / www',
    );
    list.push(...PRODUCTION_ORIGIN_FALLBACK);
  }

  return [...new Set(list)];
}

let allowedOrigins = loadAllowedOrigins();

function refreshAllowedOrigins() {
  allowedOrigins = loadAllowedOrigins();
  return allowedOrigins;
}

const clientOriginSet = Boolean(
  (process.env.CLIENT_ORIGIN || process.env.CORS_ORIGINS || '').trim(),
);

logger.info('CORS allowed origins loaded', {
  allowedOrigins,
  frontendUrl: process.env.FRONTEND_URL || null,
  nodeEnv: process.env.NODE_ENV,
  clientOriginSet,
  envPath: path.join(__dirname, '../../.env'),
});

function isOriginAllowed(origin) {
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  return normalized != null && allowedOrigins.includes(normalized);
}

function corsOriginCallback(origin, callback) {
  if (!origin) return callback(null, true);

  if (process.env.NODE_ENV !== 'production' && /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
    return callback(null, origin);
  }

  if (isOriginAllowed(origin)) {
    return callback(null, origin);
  }

  logger.warn('CORS origin rejected', {
    origin,
    normalizedOrigin: normalizeOrigin(origin),
    allowedOrigins,
    nodeEnv: process.env.NODE_ENV,
    clientOriginSet,
  });

  return callback(new Error(CORS_REJECT_MSG));
}

const corsOptions = {
  origin: corsOriginCallback,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
};

function getSocketCors() {
  return {
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    methods: ['GET', 'POST'],
    credentials: true,
  };
}

module.exports = {
  get allowedOrigins() {
    return allowedOrigins;
  },
  corsOptions,
  getSocketCors,
  refreshAllowedOrigins,
  CORS_REJECT_MSG,
  normalizeOrigin,
  isOriginAllowed,
};
