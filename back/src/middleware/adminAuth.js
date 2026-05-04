/**
 * adminAuth — middleware that verifies the JWT and ensures role === 'admin'.
 * Must be used AFTER authMiddleware (req.user already set).
 */
function adminAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = adminAuth;
