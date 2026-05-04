const mysql2 = require('mysql2/promise');
const logger = require('./logger');

let pool = null;

function getPool() {
  if (!pool) {
    pool = mysql2.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'truco_db',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      timezone: '+00:00',
    });
    logger.info('MySQL connection pool created');
  }
  return pool;
}

async function query(sql, params) {
  const db = getPool();
  const [results] = await db.execute(sql, params);
  return results;
}

/**
 * Run `fn(conn)` inside an ACID transaction.
 * Automatically commits on success, rolls back on error.
 * Always releases the connection back to the pool.
 *
 * Usage:
 *   const result = await withTransaction(async (conn) => {
 *     const [rows] = await conn.execute('SELECT ... FOR UPDATE', [id]);
 *     await conn.execute('UPDATE ...', [...]);
 *     return rows[0];
 *   });
 */
async function withTransaction(fn) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function testConnection() {
  try {
    const db = getPool();
    const conn = await db.getConnection();
    conn.release();
    logger.info('MySQL connection successful');
    return true;
  } catch (err) {
    logger.error('MySQL connection failed: ' + err.message);
    return false;
  }
}

module.exports = { getPool, query, withTransaction, testConnection };
