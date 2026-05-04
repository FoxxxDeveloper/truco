const { createClient } = require('redis');
const logger = require('./logger');

let client = null;
let connected = false;
let warnedOnce = false; // only log Redis unavailability once

async function getRedis() {
  if (client && connected) return client;
  // Already tried and failed — skip retry, use memory
  if (client === false) return null;

  const redisClient = createClient({
    socket: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      reconnectStrategy: false, // don't keep retrying
    },
    password: process.env.REDIS_PASSWORD || undefined,
  });

  redisClient.on('error', () => {
    connected = false;
  });

  redisClient.on('connect', () => {
    logger.info('Redis connected');
    connected = true;
    warnedOnce = false;
  });

  try {
    await redisClient.connect();
    client = redisClient;
  } catch (_err) {
    if (!warnedOnce) {
      logger.warn('Redis not available — using in-memory session store (fine for development)');
      warnedOnce = true;
    }
    client = false; // mark as permanently unavailable this run
  }

  return client || null;
}

// In-memory fallback store when Redis is not available
const memStore = new Map();

const redisProxy = {
  async set(key, value, options = {}) {
    const c = await getRedis();
    if (c) {
      const opts = {};
      if (options.EX) opts.EX = options.EX;
      return c.set(key, value, opts);
    }
    memStore.set(key, { value, expires: options.EX ? Date.now() + options.EX * 1000 : null });
  },

  async get(key) {
    const c = await getRedis();
    if (c) return c.get(key);
    const item = memStore.get(key);
    if (!item) return null;
    if (item.expires && item.expires < Date.now()) {
      memStore.delete(key);
      return null;
    }
    return item.value;
  },

  async del(key) {
    const c = await getRedis();
    if (c) return c.del(key);
    memStore.delete(key);
  },

  async exists(key) {
    const c = await getRedis();
    if (c) return c.exists(key);
    return memStore.has(key) ? 1 : 0;
  },
};

module.exports = redisProxy;
