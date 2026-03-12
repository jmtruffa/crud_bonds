const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

function sendError(res, err, userMessage = 'Ocurrió un error', status = 400) {
  const payload = { error: userMessage };
  if (process.env.NODE_ENV !== 'production') {
    payload.details = err && err.message ? err.message : String(err);
  }
  res.status(status).json(payload);
}

module.exports = { authMiddleware, sendError, JWT_SECRET, JWT_EXPIRES_IN };
