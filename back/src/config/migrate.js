require('dotenv').config();

const mysql2 = require('mysql2/promise');
const logger = require('./logger');

const DB_NAME = process.env.DB_NAME || 'truco_db';

/**
 * Migración segura:
 * - Crea tablas si no existen.
 * - Agrega columnas faltantes si ya tenías una DB vieja.
 * - Evita usar "ADD COLUMN IF NOT EXISTS" porque no siempre funciona en MySQL/MariaDB.
 */

// ─── Core tables ──────────────────────────────────────────────────────────────
const CORE_TABLES = `
CREATE TABLE IF NOT EXISTS usuarios (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  username            VARCHAR(50)  NOT NULL UNIQUE,
  email               VARCHAR(120) NOT NULL UNIQUE,
  password            VARCHAR(255) NOT NULL,
  avatar              VARCHAR(255) DEFAULT NULL,
  bio                 VARCHAR(500) DEFAULT NULL,
  role                ENUM('user','admin') NOT NULL DEFAULT 'user',
  status              ENUM('active','banned','suspended') NOT NULL DEFAULT 'active',
  telegram_user_id    BIGINT       DEFAULT NULL,
  telegram_linked_at  DATETIME     DEFAULT NULL,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ranking (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL UNIQUE,
  elo         INT NOT NULL DEFAULT 1000,
  wins        INT NOT NULL DEFAULT 0,
  losses      INT NOT NULL DEFAULT 0,
  draws       INT NOT NULL DEFAULT 0,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS partidas (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  room_id             VARCHAR(36)  NOT NULL UNIQUE,
  player1_id          INT          NOT NULL,
  player2_id          INT          NOT NULL,
  winner_id           INT          DEFAULT NULL,
  state               ENUM('waiting','playing','finished') NOT NULL DEFAULT 'waiting',
  status              ENUM('active','paused','abandoned','finished','cancelled') NOT NULL DEFAULT 'active',
  challenge_id        VARCHAR(36)  DEFAULT NULL,
  score_p1            INT          NOT NULL DEFAULT 0,
  score_p2            INT          NOT NULL DEFAULT 0,
  p1_disconnected_at  DATETIME     DEFAULT NULL,
  p2_disconnected_at  DATETIME     DEFAULT NULL,
  started_at          DATETIME     DEFAULT NULL,
  finished_at         DATETIME     DEFAULT NULL,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (player1_id) REFERENCES usuarios(id),
  FOREIGN KEY (player2_id) REFERENCES usuarios(id),
  FOREIGN KEY (winner_id)  REFERENCES usuarios(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS historial_partidas (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  partida_id       INT NOT NULL,
  round_number     INT NOT NULL,
  winner_id        INT DEFAULT NULL,
  truco_value      INT NOT NULL DEFAULT 1,
  envido_points_p1 INT NOT NULL DEFAULT 0,
  envido_points_p2 INT NOT NULL DEFAULT 0,
  played_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (partida_id) REFERENCES partidas(id) ON DELETE CASCADE
) ENGINE=InnoDB;
`;

// ─── Wallet & economy tables ─────────────────────────────────────────────────
const WALLET_TABLES = `
CREATE TABLE IF NOT EXISTS wallet (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT            NOT NULL,
  balance     DECIMAL(15,2)  NOT NULL DEFAULT 0.00,
  reserved    DECIMAL(15,2)  NOT NULL DEFAULT 0.00,
  updated_at  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_wallet_user (user_id),
  FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS transactions (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  user_id          INT            NOT NULL,
  type             ENUM('deposit','withdrawal','bet_lock','bet_win','bet_refund','commission','refund','prize') NOT NULL,
  amount           DECIMAL(15,2)  NOT NULL,
  status           ENUM('pending','completed','cancelled','failed','rejected') NOT NULL DEFAULT 'pending',
  reference        VARCHAR(255)   DEFAULT NULL,
  metadata         JSON           DEFAULT NULL,
  idempotency_key  VARCHAR(128)   DEFAULT NULL,
  created_at       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tx_user   (user_id),
  INDEX idx_tx_status (status),
  UNIQUE KEY uk_tx_idempotency (idempotency_key),
  FOREIGN KEY (user_id) REFERENCES usuarios(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS challenges (
  id               VARCHAR(36)    NOT NULL PRIMARY KEY,
  creator_id       INT            NOT NULL,
  opponent_id      INT            DEFAULT NULL,
  amount           DECIMAL(15,2)  NOT NULL,
  commission_rate  DECIMAL(5,4)   NOT NULL DEFAULT 0.0500,
  status           ENUM('open','accepted','active','finished','cancelled','expired') NOT NULL DEFAULT 'open',
  is_private       TINYINT(1)     NOT NULL DEFAULT 0,
  room_id          VARCHAR(36)    DEFAULT NULL,
  winner_id        INT            DEFAULT NULL,
  creator_tx_id    INT            DEFAULT NULL,
  opponent_tx_id   INT            DEFAULT NULL,
  game_config      JSON           DEFAULT NULL,
  expires_at       DATETIME       NOT NULL,
  created_at       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_challenge_creator (creator_id),
  INDEX idx_challenge_status  (status),
  FOREIGN KEY (creator_id)  REFERENCES usuarios(id),
  FOREIGN KEY (opponent_id) REFERENCES usuarios(id),
  FOREIGN KEY (winner_id)   REFERENCES usuarios(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS telegram_requests (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  user_id          INT            NOT NULL,
  type             ENUM('deposit','withdrawal') NOT NULL,
  amount           DECIMAL(15,2)  NOT NULL,
  token            VARCHAR(64)    NOT NULL,
  status           ENUM('pending','confirmed','rejected','expired') NOT NULL DEFAULT 'pending',
  admin_message_id BIGINT         DEFAULT NULL,
  notes            TEXT           DEFAULT NULL,
  created_at       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at       DATETIME       NOT NULL,
  UNIQUE KEY uk_tg_token (token),
  INDEX idx_tg_user   (user_id),
  INDEX idx_tg_status (status),
  FOREIGN KEY (user_id) REFERENCES usuarios(id)
) ENGINE=InnoDB;
`;

// ─── Social tables ───────────────────────────────────────────────────────────
const SOCIAL_TABLES = `
CREATE TABLE IF NOT EXISTS friends (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  user_id      INT NOT NULL,
  friend_id    INT NOT NULL,
  status       ENUM('pending','accepted','blocked') NOT NULL DEFAULT 'pending',
  requested_by INT NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_friendship (user_id, friend_id),
  INDEX idx_friends_friend (friend_id),
  FOREIGN KEY (user_id)   REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (friend_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS private_messages (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  sender_id   INT  NOT NULL,
  receiver_id INT  NOT NULL,
  content     TEXT NOT NULL,
  read_at     DATETIME DEFAULT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pm_sender   (sender_id),
  INDEX idx_pm_receiver (receiver_id),
  INDEX idx_pm_convo    (sender_id, receiver_id),
  FOREIGN KEY (sender_id)   REFERENCES usuarios(id),
  FOREIGN KEY (receiver_id) REFERENCES usuarios(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notifications (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT          NOT NULL,
  type       VARCHAR(64)  NOT NULL,
  title      VARCHAR(255) NOT NULL,
  body       TEXT         DEFAULT NULL,
  read_at    DATETIME     DEFAULT NULL,
  metadata   JSON         DEFAULT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notif_user   (user_id),
  INDEX idx_notif_unread (user_id, read_at),
  FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;
`;

// ─── Admin tables ────────────────────────────────────────────────────────────
const ADMIN_TABLES = `
CREATE TABLE IF NOT EXISTS admin_logs (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  admin_id    INT          NOT NULL,
  action      VARCHAR(100) NOT NULL,
  target_type VARCHAR(50)  DEFAULT NULL,
  target_id   VARCHAR(64)  DEFAULT NULL,
  before_data JSON         DEFAULT NULL,
  after_data  JSON         DEFAULT NULL,
  reason      TEXT         DEFAULT NULL,
  ip          VARCHAR(64)  DEFAULT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_al_admin  (admin_id),
  INDEX idx_al_target (target_type, target_id),
  FOREIGN KEY (admin_id) REFERENCES usuarios(id)
) ENGINE=InnoDB;
`;

// ─── General chat table ─────────────────────────────────────────────────────
const GENERAL_CHAT_TABLE = `
CREATE TABLE IF NOT EXISTS general_messages (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT          NOT NULL,
  content    VARCHAR(500) NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_gm_created (created_at),
  FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;
`;

// ─── Identity verification tables ───────────────────────────────────────────
const VERIFICATION_TABLES = `
CREATE TABLE IF NOT EXISTS user_verifications (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  user_id            INT NOT NULL,
  identity_status    ENUM('unverified','pending','verified','rejected') NOT NULL DEFAULT 'unverified',
  age_verified       TINYINT(1) NOT NULL DEFAULT 0,
  date_of_birth      DATE DEFAULT NULL,
  legal_first_name   VARCHAR(100) DEFAULT NULL,
  legal_last_name    VARCHAR(100) DEFAULT NULL,
  document_type      ENUM('dni','passport','cuit','other') DEFAULT NULL,
  document_number    VARCHAR(50) DEFAULT NULL,
  country            VARCHAR(50) DEFAULT NULL,
  province           VARCHAR(50) DEFAULT NULL,
  rejection_reason   TEXT DEFAULT NULL,
  reviewed_by        INT DEFAULT NULL,
  reviewed_at        DATETIME DEFAULT NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_uv_user (user_id),
  INDEX idx_uv_status (identity_status),
  FOREIGN KEY (user_id)     REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;
`;

async function columnExists(conn, tableName, columnName) {
  const [rows] = await conn.query(
    `
    SELECT COUNT(*) AS count
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = ?
      AND TABLE_NAME = ?
      AND COLUMN_NAME = ?
    `,
    [DB_NAME, tableName, columnName]
  );

  return Number(rows[0].count) > 0;
}

async function addColumnIfMissing(conn, tableName, columnName, definition) {
  const exists = await columnExists(conn, tableName, columnName);

  if (exists) {
    logger.info(`SKIP: ${tableName}.${columnName} already exists`);
    return;
  }

  await conn.query(`ALTER TABLE \`${tableName}\` ADD COLUMN ${definition}`);
  logger.info(`ADD: ${tableName}.${columnName}`);
}

async function indexExists(conn, tableName, indexName) {
  const [rows] = await conn.query(
    `
    SELECT COUNT(*) AS count
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = ?
      AND TABLE_NAME = ?
      AND INDEX_NAME = ?
    `,
    [DB_NAME, tableName, indexName]
  );

  return Number(rows[0].count) > 0;
}

async function addIndexIfMissing(conn, tableName, indexName, sql) {
  const exists = await indexExists(conn, tableName, indexName);

  if (exists) {
    logger.info(`SKIP: index ${tableName}.${indexName} already exists`);
    return;
  }

  await conn.query(sql);
  logger.info(`ADD: index ${tableName}.${indexName}`);
}

async function runStatements(conn, sqlBlock) {
  const statements = sqlBlock
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await conn.query(statement);
    logger.info('OK: ' + statement.split('\n')[0].trim().substring(0, 80));
  }
}

async function runAdditiveMigrations(conn) {
  // usuarios: columnas nuevas para perfil/admin/telegram
  await addColumnIfMissing(conn, 'usuarios', 'avatar', 'avatar VARCHAR(255) DEFAULT NULL');
  await addColumnIfMissing(conn, 'usuarios', 'bio', 'bio VARCHAR(500) DEFAULT NULL');
  await addColumnIfMissing(conn, 'usuarios', 'role', "role ENUM('user','admin') NOT NULL DEFAULT 'user'");
  await addColumnIfMissing(conn, 'usuarios', 'status', "status ENUM('active','banned','suspended') NOT NULL DEFAULT 'active'");
  await addColumnIfMissing(conn, 'usuarios', 'telegram_user_id', 'telegram_user_id BIGINT DEFAULT NULL');
  await addColumnIfMissing(conn, 'usuarios', 'telegram_linked_at', 'telegram_linked_at DATETIME DEFAULT NULL');

  // partidas: columnas nuevas para reconexión/challenges
  await addColumnIfMissing(conn, 'partidas', 'status', "status ENUM('active','paused','abandoned','finished','cancelled') NOT NULL DEFAULT 'active'");
  await addColumnIfMissing(conn, 'partidas', 'challenge_id', 'challenge_id VARCHAR(36) DEFAULT NULL');
  await addColumnIfMissing(conn, 'partidas', 'p1_disconnected_at', 'p1_disconnected_at DATETIME DEFAULT NULL');
  await addColumnIfMissing(conn, 'partidas', 'p2_disconnected_at', 'p2_disconnected_at DATETIME DEFAULT NULL');

  // wallet: por si venías de una versión vieja
  await addColumnIfMissing(conn, 'wallet', 'reserved', 'reserved DECIMAL(15,2) NOT NULL DEFAULT 0.00');

  // Índices útiles si la tabla existía antes.
  await addIndexIfMissing(
    conn,
    'wallet',
    'uk_wallet_user',
    'ALTER TABLE `wallet` ADD UNIQUE KEY uk_wallet_user (user_id)'
  );
}

async function migrate() {
  let conn;

  try {
    conn = await mysql2.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT, 10) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      multipleStatements: false,
    });

    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );

    logger.info(`Database '${DB_NAME}' ready`);

    await conn.query(`USE \`${DB_NAME}\``);

    await runStatements(conn, CORE_TABLES);
    await runStatements(conn, WALLET_TABLES);
    await runStatements(conn, SOCIAL_TABLES);
    await runStatements(conn, ADMIN_TABLES);
    await runStatements(conn, GENERAL_CHAT_TABLE);
    await runStatements(conn, VERIFICATION_TABLES);

    await runAdditiveMigrations(conn);

    logger.info('Migration complete ✓');
  } catch (err) {
    logger.error('Migration failed: ' + err.message);
    process.exitCode = 1;
  } finally {
    if (conn) {
      await conn.end();
    }

    process.exit(process.exitCode || 0);
  }
}

migrate();