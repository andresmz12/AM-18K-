const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'am18k-dev-secret-cambiar-en-produccion';
const TOKEN_EXPIRY = '30d';

function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, empresa_id: user.empresa_id, rol: user.rol, nombre: user.nombre, email: user.email },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Sesión inválida o expirada' });
  }
}

function requireGerente(req, res, next) {
  if (req.user.rol !== 'gerente') return res.status(403).json({ error: 'Requiere permisos de gerente' });
  next();
}

function requireSuperadmin(req, res, next) {
  if (req.user.rol !== 'superadmin') return res.status(403).json({ error: 'Requiere permisos de administrador de plataforma' });
  next();
}

module.exports = { hashPassword, comparePassword, signToken, requireAuth, requireGerente, requireSuperadmin };
