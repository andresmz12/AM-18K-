const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { pool } = require('./database');

// El secreto se resuelve al arrancar (variable de entorno o generado y
// persistido en la base por init()) y se inyecta aquí antes de abrir el puerto.
let JWT_SECRET = null;
const TOKEN_EXPIRY = '30d';

function setJwtSecret(secret) {
  JWT_SECRET = secret;
}

function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function signToken(user) {
  return jwt.sign(
    { id: user.id },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

// Comparación en tiempo constante para secretos pasados por query/header
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// El token solo lleva el id; rol/empresa se leen de la base en cada request.
// Así, eliminar o desactivar un usuario (o suspender su empresa) surte efecto
// inmediato, y los cambios de rol no requieren re-login.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Sesión inválida o expirada' });
  }
  try {
    const { rows: [u] } = await pool.query(
      `SELECT u.id, u.empresa_id, u.rol, u.nombre, u.email, u.activo, e.activa AS empresa_activa
       FROM usuarios u JOIN empresas e ON e.id = u.empresa_id
       WHERE u.id = $1`, [payload.id]
    );
    if (!u || !u.activo) return res.status(401).json({ error: 'Sesión inválida o expirada' });
    if (u.rol !== 'superadmin' && !u.empresa_activa)
      return res.status(403).json({ error: 'Esta cuenta está suspendida. Contacta a soporte.' });
    req.user = { id: u.id, empresa_id: u.empresa_id, rol: u.rol, nombre: u.nombre, email: u.email };
    next();
  } catch (err) {
    console.error('requireAuth error:', err);
    res.status(500).json({ error: 'Error interno' });
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

module.exports = { hashPassword, comparePassword, signToken, safeEqual, setJwtSecret, requireAuth, requireGerente, requireSuperadmin };
