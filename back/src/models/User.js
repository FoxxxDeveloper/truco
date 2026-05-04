const { query } = require('../config/database');
const bcrypt = require('bcryptjs');
const WalletService = require('../services/walletService');

const SALT_ROUNDS = 12;

const User = {
  async create({ username, email, password }) {
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await query(
      'INSERT INTO usuarios (username, email, password) VALUES (?, ?, ?)',
      [username, email, hash]
    );
    const userId = result.insertId;
    // Initialize ranking, wallet
    await Promise.all([
      query('INSERT INTO ranking (user_id, elo) VALUES (?, ?)', [userId, parseInt(process.env.ELO_INITIAL) || 1000]),
      WalletService.init(userId),
    ]);
    return userId;
  },

  async findByEmail(email) {
    const rows = await query('SELECT * FROM usuarios WHERE email = ?', [email]);
    return rows[0] || null;
  },

  async findByUsername(username) {
    const rows = await query('SELECT * FROM usuarios WHERE username = ?', [username]);
    return rows[0] || null;
  },

  async findById(id) {
    const rows = await query(
      'SELECT u.id, u.username, u.email, u.avatar, u.role, u.status, r.elo, r.wins, r.losses FROM usuarios u LEFT JOIN ranking r ON r.user_id = u.id WHERE u.id = ?',
      [id]
    );
    return rows[0] || null;
  },

  async verifyPassword(plainPassword, hashedPassword) {
    return bcrypt.compare(plainPassword, hashedPassword);
  },

  toPublic(user) {
    const { password, ...pub } = user;
    return pub;
  },
};

module.exports = User;
