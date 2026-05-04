const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;

  console.log('AUTH HEADER:', header);

  if (!header || !header.startsWith('Bearer ')) {
    console.log('AUTH ERROR: No token provided');
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = header.slice(7);

  try {
    console.log('TOKEN PARTS:', token.split('.').length);
    console.log('TOKEN START:', token.slice(0, 30));
    console.log('JWT_SECRET:', process.env.JWT_SECRET);

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    console.log('TOKEN OK:', decoded);

    req.user = decoded;
    next();
  } catch (err) {
    console.log('AUTH ERROR:', err.message);
    console.log('TOKEN PARTS:', token.split('.').length);
    console.log('TOKEN START:', token.slice(0, 40));
    console.log('JWT_SECRET EXISTS:', !!process.env.JWT_SECRET);

    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = authMiddleware;