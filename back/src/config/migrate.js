require('dotenv').config();

const mysql2 = require('mysql2/promise');
const logger = require('./logger');

const DB_NAME = process.env.DB_NAME || 'truco_db';

/**
 * Migración segura:
 * - Crea tablas si no existen.
 * - Agrega columnas faltantes si venís de una DB vieja.
 * - Actualiza ENUMs necesarios.
 * - Evita usar ADD COLUMN IF NOT EXISTS porque no siempre funciona igual en MySQL/MariaDB.
 */

// ─────────────────────────────────────────────────────────────
// CORE TABLES
// ─────────────────────────────────────────────────────────────

const CORE_TABLES = `
CREATE TABLE IF NOT EXISTS usuarios (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  username            VARCHAR(50)  NOT NULL UNIQUE,
  email               VARCHAR(120) NOT NULL UNIQUE,
  password            VARCHAR(255) NOT NULL,
  avatar              TEXT         DEFAULT NULL,
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
  p1_reconnect_deadline_at DATETIME DEFAULT NULL,
  p2_reconnect_deadline_at DATETIME DEFAULT NULL,
  finish_reason       VARCHAR(80) DEFAULT NULL,
  requires_admin_resolution TINYINT(1) NOT NULL DEFAULT 0,
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

// ─────────────────────────────────────────────────────────────
// WALLET / ECONOMY / BATTLES
// ─────────────────────────────────────────────────────────────

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
  type             ENUM(
                     'deposit',
                     'withdrawal',
                     'bet_lock',
                     'bet_win',
                     'bet_loss',
                     'bet_refund',
                     'commission',
                     'refund',
                     'prize',
                     'tournament_entry',
                     'tournament_refund',
                     'tournament_prize'
                   ) NOT NULL,
  amount           DECIMAL(15,2)  NOT NULL,
  status           ENUM('pending','completed','cancelled','failed','rejected') NOT NULL DEFAULT 'pending',
  reference        VARCHAR(255)   DEFAULT NULL,
  metadata         JSON           DEFAULT NULL,
  idempotency_key  VARCHAR(128)   DEFAULT NULL,
  created_at       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tx_user   (user_id),
  INDEX idx_tx_status (status),
  INDEX idx_tx_ref    (reference),
  UNIQUE KEY uk_tx_idempotency (idempotency_key),
  FOREIGN KEY (user_id) REFERENCES usuarios(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS challenges (
  id                 VARCHAR(36)    NOT NULL PRIMARY KEY,
  creator_id         INT            NOT NULL,
  opponent_id        INT            DEFAULT NULL,
  challenged_id      INT            DEFAULT NULL,
  amount             DECIMAL(15,2)  NOT NULL,
  commission_rate    DECIMAL(5,4)   NOT NULL DEFAULT 0.1000,
  prize_amount       DECIMAL(15,2)  DEFAULT NULL,
  commission_amount  DECIMAL(15,2)  DEFAULT NULL,
  status             ENUM('open','pending','accepted','active','finished','cancelled','expired','rejected') NOT NULL DEFAULT 'open',
  source             ENUM('public_room','private_room','friend_challenge') NOT NULL DEFAULT 'public_room',
  invite_type        ENUM('public','friend_duel') NOT NULL DEFAULT 'public',
  is_private         TINYINT(1)     NOT NULL DEFAULT 0,
  invite_code        VARCHAR(32)    DEFAULT NULL,
  room_id            VARCHAR(36)    DEFAULT NULL,
  winner_id          INT            DEFAULT NULL,
  creator_tx_id      INT            DEFAULT NULL,
  opponent_tx_id     INT            DEFAULT NULL,
  game_config        JSON           DEFAULT NULL,
  expires_at         DATETIME       DEFAULT NULL,
  accepted_at        DATETIME       DEFAULT NULL,
  started_at         DATETIME       DEFAULT NULL,
  finished_at        DATETIME       DEFAULT NULL,
  created_at         DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_challenge_creator    (creator_id),
  INDEX idx_challenge_opponent   (opponent_id),
  INDEX idx_challenge_challenged (challenged_id),
  INDEX idx_challenge_status     (status),
  INDEX idx_challenge_room       (room_id),
  INDEX idx_challenge_invite     (invite_code),
  FOREIGN KEY (creator_id)   REFERENCES usuarios(id),
  FOREIGN KEY (opponent_id)  REFERENCES usuarios(id),
  FOREIGN KEY (challenged_id) REFERENCES usuarios(id),
  FOREIGN KEY (winner_id)    REFERENCES usuarios(id)
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

// ─────────────────────────────────────────────────────────────
// SOCIAL / CHAT
// ─────────────────────────────────────────────────────────────

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
  INDEX idx_friends_status (status),
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
  INDEX idx_pm_read     (receiver_id, read_at),
  FOREIGN KEY (sender_id)   REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (receiver_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS general_messages (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT          NOT NULL,
  content    VARCHAR(500) NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_gm_created (created_at),
  INDEX idx_gm_user    (user_id),
  FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE
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

// ─────────────────────────────────────────────────────────────
// IDENTITY VERIFICATION
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// ADMIN
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// TOURNAMENTS
// ─────────────────────────────────────────────────────────────

const TOURNAMENT_TABLES = `
CREATE TABLE IF NOT EXISTS tournaments (
  id                      INT AUTO_INCREMENT PRIMARY KEY,
  name                    VARCHAR(120) NOT NULL,
  description             TEXT DEFAULT NULL,
  prize_text              VARCHAR(120) DEFAULT NULL,
  max_players             INT NOT NULL DEFAULT 64,
  status                  ENUM('draft','open','checkin','started','finished','cancelled') NOT NULL DEFAULT 'draft',
  format                  ENUM('single_elimination','qualifier','finals') NOT NULL DEFAULT 'single_elimination',
  phase                   ENUM('qualifier_a','qualifier_b','finals','general') NOT NULL DEFAULT 'general',
  puntos_maximos          INT NOT NULL DEFAULT 15,
  flor_habilitada         TINYINT(1) NOT NULL DEFAULT 0,
  turn_seconds            INT NOT NULL DEFAULT 30,
  reconnect_seconds       INT NOT NULL DEFAULT 60,
  entry_fee               DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  prize_amount            DECIMAL(15,2) DEFAULT NULL,
  is_paid                 TINYINT(1) NOT NULL DEFAULT 0,
  auto_checkin_enabled    TINYINT(1) NOT NULL DEFAULT 1,
  auto_start_enabled      TINYINT(1) NOT NULL DEFAULT 1,
  checkin_closed_at       DATETIME DEFAULT NULL,
  bracket_generated_at    DATETIME DEFAULT NULL,
  ready_timeout_minutes   INT NOT NULL DEFAULT 5,
  starts_at               DATETIME DEFAULT NULL,
  checkin_starts_at       DATETIME DEFAULT NULL,
  registration_closes_at  DATETIME DEFAULT NULL,
  winner_id               INT DEFAULT NULL,
  created_by              INT NOT NULL,
  created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_trn_status (status),
  INDEX idx_trn_phase  (phase),
  FOREIGN KEY (winner_id)  REFERENCES usuarios(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES usuarios(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tournament_registrations (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  tournament_id   INT NOT NULL,
  user_id         INT NOT NULL,
  status          ENUM('registered','checked_in','substitute','cancelled','no_show','eliminated','qualified','winner','disqualified') NOT NULL DEFAULT 'registered',
  position_number INT DEFAULT NULL,
  seed            INT DEFAULT NULL,
  checked_in_at   DATETIME DEFAULT NULL,
  paid_amount     DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  payment_tx_id   INT DEFAULT NULL,
  refunded_at     DATETIME DEFAULT NULL,
  final_position  INT DEFAULT NULL,
  eliminated_round INT DEFAULT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_trn_reg      (tournament_id, user_id),
  INDEX idx_treg_status      (tournament_id, status),
  INDEX idx_treg_user        (user_id),
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)       REFERENCES usuarios(id)    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tournament_matches (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  tournament_id    INT NOT NULL,
  round_number     INT NOT NULL,
  match_number     INT NOT NULL,
  bracket_position INT DEFAULT NULL,
  player1_id       INT DEFAULT NULL,
  player2_id       INT DEFAULT NULL,
  winner_id        INT DEFAULT NULL,
  loser_id         INT DEFAULT NULL,
  room_id          VARCHAR(36) DEFAULT NULL,
  partida_id       INT DEFAULT NULL,
  status           ENUM('pending','ready','waiting_ready','active','finished','walkover','cancelled') NOT NULL DEFAULT 'pending',
  player1_ready    TINYINT(1) NOT NULL DEFAULT 0,
  player2_ready    TINYINT(1) NOT NULL DEFAULT 0,
  player1_ready_at DATETIME DEFAULT NULL,
  player2_ready_at DATETIME DEFAULT NULL,
  ready_cancelled_by INT DEFAULT NULL,
  ready_deadline   DATETIME DEFAULT NULL,
  player1_score    INT NOT NULL DEFAULT 0,
  player2_score    INT NOT NULL DEFAULT 0,
  next_match_id    INT DEFAULT NULL,
  next_slot        ENUM('player1','player2') DEFAULT NULL,
  scheduled_at     DATETIME DEFAULT NULL,
  started_at       DATETIME DEFAULT NULL,
  finished_at      DATETIME DEFAULT NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tmatch_trn    (tournament_id, round_number),
  INDEX idx_tmatch_room   (room_id),
  INDEX idx_tmatch_status (status),
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id)         ON DELETE CASCADE,
  FOREIGN KEY (player1_id)    REFERENCES usuarios(id)            ON DELETE SET NULL,
  FOREIGN KEY (player2_id)    REFERENCES usuarios(id)            ON DELETE SET NULL,
  FOREIGN KEY (winner_id)     REFERENCES usuarios(id)            ON DELETE SET NULL,
  FOREIGN KEY (loser_id)      REFERENCES usuarios(id)            ON DELETE SET NULL,
  FOREIGN KEY (next_match_id) REFERENCES tournament_matches(id)  ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tournament_events (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  tournament_id INT NOT NULL,
  admin_id      INT DEFAULT NULL,
  user_id       INT DEFAULT NULL,
  type          VARCHAR(80) NOT NULL,
  metadata      JSON DEFAULT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tevt_tournament (tournament_id),
  INDEX idx_tevt_type       (type),
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
  FOREIGN KEY (admin_id)      REFERENCES usuarios(id)    ON DELETE SET NULL,
  FOREIGN KEY (user_id)       REFERENCES usuarios(id)    ON DELETE SET NULL
) ENGINE=InnoDB;
`;

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

async function runStatements(conn, sqlBlock) {
  const statements = sqlBlock
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await conn.query(statement);
    logger.info('OK: ' + statement.split('\n')[0].trim().substring(0, 90));
  }
}

async function tableExists(conn, tableName) {
  const [rows] = await conn.query(
    `
    SELECT COUNT(*) AS count
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = ?
      AND TABLE_NAME = ?
    `,
    [DB_NAME, tableName]
  );

  return Number(rows[0].count) > 0;
}

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

async function safeAlter(conn, description, sql) {
  try {
    await conn.query(sql);
    logger.info(`ALTER OK: ${description}`);
  } catch (err) {
    logger.warn(`ALTER SKIP/FAIL: ${description} → ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────
// ADDITIVE MIGRATIONS FOR OLD DATABASES
// ─────────────────────────────────────────────────────────────

async function runAdditiveMigrations(conn) {
  // ─── usuarios ─────────────────────────────────────────────
  await addColumnIfMissing(conn, 'usuarios', 'avatar', 'avatar TEXT DEFAULT NULL');
  await addColumnIfMissing(conn, 'usuarios', 'bio', 'bio VARCHAR(500) DEFAULT NULL');
  await addColumnIfMissing(conn, 'usuarios', 'role', "role ENUM('user','admin') NOT NULL DEFAULT 'user'");
  await addColumnIfMissing(conn, 'usuarios', 'status', "status ENUM('active','banned','suspended') NOT NULL DEFAULT 'active'");
  await addColumnIfMissing(conn, 'usuarios', 'telegram_user_id', 'telegram_user_id BIGINT DEFAULT NULL');
  await addColumnIfMissing(conn, 'usuarios', 'telegram_linked_at', 'telegram_linked_at DATETIME DEFAULT NULL');

  await safeAlter(
    conn,
    'usuarios.avatar TEXT for avataaars payloads',
    'ALTER TABLE `usuarios` MODIFY COLUMN `avatar` TEXT DEFAULT NULL'
  );
  await addColumnIfMissing(conn, 'ranking', 'draws', 'draws INT NOT NULL DEFAULT 0');

  // ─── partidas ────────────────────────────────────────────
  await addColumnIfMissing(conn, 'partidas', 'status', "status ENUM('active','paused','abandoned','finished','cancelled') NOT NULL DEFAULT 'active'");
  await addColumnIfMissing(conn, 'partidas', 'challenge_id', 'challenge_id VARCHAR(36) DEFAULT NULL');
  await addColumnIfMissing(conn, 'partidas', 'p1_disconnected_at', 'p1_disconnected_at DATETIME DEFAULT NULL');
  await addColumnIfMissing(conn, 'partidas', 'p2_disconnected_at', 'p2_disconnected_at DATETIME DEFAULT NULL');
  await addColumnIfMissing(conn, 'partidas', 'p1_reconnect_deadline_at', 'p1_reconnect_deadline_at DATETIME DEFAULT NULL');
  await addColumnIfMissing(conn, 'partidas', 'p2_reconnect_deadline_at', 'p2_reconnect_deadline_at DATETIME DEFAULT NULL');
  await addColumnIfMissing(conn, 'partidas', 'finish_reason', 'finish_reason VARCHAR(80) DEFAULT NULL');
  await addColumnIfMissing(
    conn,
    'partidas',
    'requires_admin_resolution',
    'requires_admin_resolution TINYINT(1) NOT NULL DEFAULT 0'
  );

  // ─── wallet ──────────────────────────────────────────────
  await addColumnIfMissing(conn, 'wallet', 'reserved', 'reserved DECIMAL(15,2) NOT NULL DEFAULT 0.00');

  await addIndexIfMissing(
    conn,
    'wallet',
    'uk_wallet_user',
    'ALTER TABLE `wallet` ADD UNIQUE KEY uk_wallet_user (user_id)'
  );

  // ─── transactions ────────────────────────────────────────
  // Actualiza ENUM para que bet_loss exista.
  await safeAlter(
    conn,
    'transactions.type enum',
    `
    ALTER TABLE transactions
    MODIFY COLUMN type ENUM(
      'deposit',
      'withdrawal',
      'bet_lock',
      'bet_win',
      'bet_loss',
      'bet_refund',
      'commission',
      'refund',
      'prize',
      'tournament_entry',
      'tournament_refund',
      'tournament_prize'
    ) NOT NULL
    `
  );

  await safeAlter(
    conn,
    'transactions.status enum',
    `
    ALTER TABLE transactions
    MODIFY COLUMN status ENUM('pending','completed','cancelled','failed','rejected') NOT NULL DEFAULT 'pending'
    `
  );

  await addColumnIfMissing(conn, 'transactions', 'metadata', 'metadata JSON DEFAULT NULL');
  await addColumnIfMissing(conn, 'transactions', 'idempotency_key', 'idempotency_key VARCHAR(128) DEFAULT NULL');
  await addColumnIfMissing(conn, 'transactions', 'updated_at', 'updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');

  await addIndexIfMissing(
    conn,
    'transactions',
    'idx_tx_ref',
    'ALTER TABLE `transactions` ADD INDEX idx_tx_ref (reference)'
  );

  // ─── challenges ──────────────────────────────────────────
  await safeAlter(
    conn,
    'challenges.status enum',
    `
    ALTER TABLE challenges
    MODIFY COLUMN status ENUM('open','pending','accepted','active','finished','cancelled','expired','rejected') NOT NULL DEFAULT 'open'
    `
  );

  await safeAlter(
    conn,
    'challenges.commission_rate default 10%',
    `
    ALTER TABLE challenges
    MODIFY COLUMN commission_rate DECIMAL(5,4) NOT NULL DEFAULT 0.1000
    `
  );

  await addColumnIfMissing(conn, 'challenges', 'challenged_id', 'challenged_id INT DEFAULT NULL');
  await addColumnIfMissing(conn, 'challenges', 'prize_amount', 'prize_amount DECIMAL(15,2) DEFAULT NULL');
  await addColumnIfMissing(conn, 'challenges', 'commission_amount', 'commission_amount DECIMAL(15,2) DEFAULT NULL');
  await addColumnIfMissing(conn, 'challenges', 'source', "source ENUM('public_room','private_room','friend_challenge') NOT NULL DEFAULT 'public_room'");
  await addColumnIfMissing(conn, 'challenges', 'invite_type', "invite_type ENUM('public','friend_duel') NOT NULL DEFAULT 'public'");
  await addColumnIfMissing(conn, 'challenges', 'game_config', 'game_config JSON DEFAULT NULL');
  await addColumnIfMissing(conn, 'challenges', 'invite_code', 'invite_code VARCHAR(32) DEFAULT NULL');
  await addColumnIfMissing(conn, 'challenges', 'accepted_at', 'accepted_at DATETIME DEFAULT NULL');
  await addColumnIfMissing(conn, 'challenges', 'started_at', 'started_at DATETIME DEFAULT NULL');
  await addColumnIfMissing(conn, 'challenges', 'finished_at', 'finished_at DATETIME DEFAULT NULL');

  // expires_at antes era NOT NULL; algunas lógicas nuevas pueden necesitar NULL.
  await safeAlter(
    conn,
    'challenges.expires_at nullable',
    `
    ALTER TABLE challenges
    MODIFY COLUMN expires_at DATETIME DEFAULT NULL
    `
  );

  await addIndexIfMissing(
    conn,
    'challenges',
    'idx_challenge_opponent',
    'ALTER TABLE `challenges` ADD INDEX idx_challenge_opponent (opponent_id)'
  );

  await addIndexIfMissing(
    conn,
    'challenges',
    'idx_challenge_challenged',
    'ALTER TABLE `challenges` ADD INDEX idx_challenge_challenged (challenged_id)'
  );

  await addIndexIfMissing(
    conn,
    'challenges',
    'idx_challenge_room',
    'ALTER TABLE `challenges` ADD INDEX idx_challenge_room (room_id)'
  );

  await addIndexIfMissing(
    conn,
    'challenges',
    'idx_challenge_invite',
    'ALTER TABLE `challenges` ADD INDEX idx_challenge_invite (invite_code)'
  );

  // ─── friends ─────────────────────────────────────────────
  await addIndexIfMissing(
    conn,
    'friends',
    'idx_friends_status',
    'ALTER TABLE `friends` ADD INDEX idx_friends_status (status)'
  );

  // ─── private_messages ───────────────────────────────────
  await addColumnIfMissing(conn, 'private_messages', 'read_at', 'read_at DATETIME DEFAULT NULL');

  await addIndexIfMissing(
    conn,
    'private_messages',
    'idx_pm_read',
    'ALTER TABLE `private_messages` ADD INDEX idx_pm_read (receiver_id, read_at)'
  );

  // ─── user_verifications safety ──────────────────────────
  if (await tableExists(conn, 'user_verifications')) {
    await addIndexIfMissing(
      conn,
      'user_verifications',
      'idx_uv_status',
      'ALTER TABLE `user_verifications` ADD INDEX idx_uv_status (identity_status)'
    );
  }

  // ─── tournaments (extended) ─────────────────────────────
  if (await tableExists(conn, 'tournaments')) {
    await addColumnIfMissing(conn, 'tournaments', 'entry_fee', 'entry_fee DECIMAL(15,2) NOT NULL DEFAULT 0.00');
    await addColumnIfMissing(conn, 'tournaments', 'prize_amount', 'prize_amount DECIMAL(15,2) DEFAULT NULL');
    await addColumnIfMissing(conn, 'tournaments', 'is_paid', 'is_paid TINYINT(1) NOT NULL DEFAULT 0');
    await addColumnIfMissing(conn, 'tournaments', 'auto_checkin_enabled', 'auto_checkin_enabled TINYINT(1) NOT NULL DEFAULT 1');
    await addColumnIfMissing(conn, 'tournaments', 'auto_start_enabled', 'auto_start_enabled TINYINT(1) NOT NULL DEFAULT 1');
    await addColumnIfMissing(conn, 'tournaments', 'checkin_closed_at', 'checkin_closed_at DATETIME DEFAULT NULL');
    await addColumnIfMissing(conn, 'tournaments', 'bracket_generated_at', 'bracket_generated_at DATETIME DEFAULT NULL');
    await addColumnIfMissing(conn, 'tournaments', 'ready_timeout_minutes', 'ready_timeout_minutes INT NOT NULL DEFAULT 5');
    await addColumnIfMissing(conn, 'tournaments', 'prize_config', 'prize_config JSON DEFAULT NULL');
    await addColumnIfMissing(conn, 'tournaments', 'placement_config', 'placement_config JSON DEFAULT NULL');
    await addColumnIfMissing(conn, 'tournaments', 'finished_at', 'finished_at DATETIME DEFAULT NULL');
    await addColumnIfMissing(
      conn,
      'tournaments',
      'registration_opens_at',
      'registration_opens_at DATETIME DEFAULT NULL'
    );
  }

  if (await tableExists(conn, 'tournament_registrations')) {
    await addColumnIfMissing(conn, 'tournament_registrations', 'paid_amount', 'paid_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00');
    await addColumnIfMissing(conn, 'tournament_registrations', 'payment_tx_id', 'payment_tx_id INT DEFAULT NULL');
    await addColumnIfMissing(conn, 'tournament_registrations', 'refunded_at', 'refunded_at DATETIME DEFAULT NULL');
    await addColumnIfMissing(conn, 'tournament_registrations', 'final_position', 'final_position INT DEFAULT NULL');
    await addColumnIfMissing(conn, 'tournament_registrations', 'eliminated_round', 'eliminated_round INT DEFAULT NULL');
    await safeAlter(
      conn,
      'tournament_registrations.status + disqualified',
      `
      ALTER TABLE tournament_registrations
      MODIFY COLUMN status ENUM(
        'registered','checked_in','substitute','cancelled','no_show',
        'eliminated','qualified','winner','disqualified'
      ) NOT NULL DEFAULT 'registered'
      `
    );
  }

  if (await tableExists(conn, 'tournament_matches')) {
    await addColumnIfMissing(conn, 'tournament_matches', 'player1_ready_at', 'player1_ready_at DATETIME DEFAULT NULL');
    await addColumnIfMissing(conn, 'tournament_matches', 'player2_ready_at', 'player2_ready_at DATETIME DEFAULT NULL');
    await addColumnIfMissing(conn, 'tournament_matches', 'ready_cancelled_by', 'ready_cancelled_by INT DEFAULT NULL');
    await addColumnIfMissing(
      conn,
      'tournament_matches',
      'round_type',
      "round_type VARCHAR(24) NOT NULL DEFAULT 'bracket'"
    );
  }

  await runStatements(conn, `
CREATE TABLE IF NOT EXISTS tournament_messages (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  tournament_id   INT NOT NULL,
  user_id         INT NOT NULL,
  message         TEXT NOT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at      DATETIME DEFAULT NULL,
  INDEX idx_tournament_messages_tournament_created (tournament_id, created_at),
  INDEX idx_tournament_messages_user (user_id),
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)       REFERENCES usuarios(id)    ON DELETE CASCADE
) ENGINE=InnoDB;
  `);

  // Optional: tournament_standings (for future use / reporting)
  if (await tableExists(conn, 'partidas')) {
    await addIndexIfMissing(
      conn,
      'partidas',
      'idx_partidas_p1_status_state',
      'ALTER TABLE `partidas` ADD INDEX idx_partidas_p1_status_state (player1_id, status, state)'
    );
    await addIndexIfMissing(
      conn,
      'partidas',
      'idx_partidas_p2_status_state',
      'ALTER TABLE `partidas` ADD INDEX idx_partidas_p2_status_state (player2_id, status, state)'
    );
    await addIndexIfMissing(
      conn,
      'partidas',
      'idx_partidas_status_state',
      'ALTER TABLE `partidas` ADD INDEX idx_partidas_status_state (status, state)'
    );
    await addIndexIfMissing(
      conn,
      'partidas',
      'idx_partidas_created',
      'ALTER TABLE `partidas` ADD INDEX idx_partidas_created (created_at)'
    );
  }

  await runStatements(conn, `
CREATE TABLE IF NOT EXISTS tournament_standings (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  tournament_id  INT NOT NULL,
  user_id         INT NOT NULL,
  position        INT DEFAULT NULL,
  result          ENUM(
    'champion','runner_up','semifinalist','quarterfinalist','qualified',
    'eliminated','no_show','disqualified'
  ) NOT NULL,
  round_number    INT DEFAULT NULL,
  wins            INT NOT NULL DEFAULT 0,
  losses          INT NOT NULL DEFAULT 0,
  notes           VARCHAR(255) DEFAULT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY tournament_user (tournament_id, user_id),
  INDEX idx_ts_tournament (tournament_id),
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)       REFERENCES usuarios(id)    ON DELETE CASCADE
) ENGINE=InnoDB;
  `);
}

// ─────────────────────────────────────────────────────────────
// MIGRATE
// ─────────────────────────────────────────────────────────────

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
    await runStatements(conn, VERIFICATION_TABLES);
    await runStatements(conn, ADMIN_TABLES);
    await runStatements(conn, TOURNAMENT_TABLES);

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