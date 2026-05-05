/**
 * Verification routes — /api/verification
 *
 * GET  /api/verification/status  — own status
 * POST /api/verification          — submit / resubmit
 */
const express             = require('express');
const authMiddleware      = require('../middleware/auth');
const VerificationService = require('../services/verificationService');
const logger              = require('../config/logger');

const router = express.Router();
router.use(authMiddleware);

// GET /api/verification/status
router.get('/status', async (req, res) => {
  try {
    const status = await VerificationService.getStatus(req.user.id);
    return res.json(status);
  } catch (err) {
    logger.error('verification getStatus: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/verification
router.post('/', async (req, res) => {
  try {
    const result = await VerificationService.submitVerification(req.user.id, req.body);
    return res.status(201).json(result);
  } catch (err) {
    // User-facing validation errors
    const userErrors = [
      'obligatorio', 'inválido', 'demasiado', 'ya está en revisión',
      'ya fue verificada', 'Fecha de nacimiento',
    ];
    if (userErrors.some(e => err.message.includes(e))) {
      return res.status(400).json({ error: err.message });
    }
    logger.error('verification submit: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
