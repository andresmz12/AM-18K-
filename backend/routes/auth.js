const express = require('express');
const { pool } = require('../database');
const { hashPassword, comparePassword, signToken, requireAuth } = require('../auth');
const V = require('../validate');
const { serverError } = require('../helpers');

const router = express.Router();

router.post('/signup', async (req, res) => {
  const empresa_nombre = V.str(req.body.empresa_nombre, 120);
  const nombre         = V.str(req.body.nombre, 120);
  const email          = V.email(req.body.email);
  const password       = V.password(req.body.password);
  if (!empresa_nombre || !nombre) return res.status(400).json({ error: 'Nombre de la joyería y tu nombre son requeridos' });
  if (!email) return res.status(400).json({ error: 'Correo electrónico inválido' });
  if (!password) return res.status(400).json({ error: 'La contraseña debe tener entre 6 y 100 caracteres' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [empresa] } = await client.query(
      'INSERT INTO empresas (nombre) VALUES ($1) RETURNING *', [empresa_nombre]
    );
    const password_hash = await hashPassword(password);
    const { rows: [usuario] } = await client.query(
      `INSERT INTO usuarios (empresa_id, nombre, email, password_hash, rol)
       VALUES ($1, $2, $3, $4, 'gerente') RETURNING *`,
      [empresa.id, nombre, email, password_hash]
    );
    await client.query('COMMIT');
    const token = signToken(usuario);
    res.status(201).json({
      token,
      user: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol, empresa_id: empresa.id, empresa_nombre: empresa.nombre }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code !== '23505') console.error(err);
    const msg = err.code === '23505' ? 'Ese correo ya está registrado' : 'Error al procesar la solicitud';
    res.status(400).json({ error: msg });
  } finally {
    client.release();
  }
});

router.post('/login', async (req, res) => {
  const email = V.email(req.body.email);
  const password = typeof req.body.password === 'string' ? req.body.password : null;
  if (!email || !password) return res.status(400).json({ error: 'Correo y contraseña requeridos' });
  try {
    const { rows: [usuario] } = await pool.query(
      `SELECT u.*, e.nombre AS empresa_nombre, e.activa AS empresa_activa FROM usuarios u
       JOIN empresas e ON e.id = u.empresa_id
       WHERE u.email = $1`, [email]
    );
    if (!usuario || !usuario.activo) return res.status(401).json({ error: 'Credenciales inválidas' });
    const ok = await comparePassword(password, usuario.password_hash);
    if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });
    // Solo después de validar la contraseña se revela el estado de suspensión
    if (usuario.rol !== 'superadmin' && !usuario.empresa_activa)
      return res.status(403).json({ error: 'Esta cuenta está suspendida. Contacta a soporte.' });
    const token = signToken(usuario);
    res.json({
      token,
      user: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol, empresa_id: usuario.empresa_id, empresa_nombre: usuario.empresa_nombre }
    });
  } catch (err) {
    serverError(res, err);
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows: [usuario] } = await pool.query(
      `SELECT u.id, u.nombre, u.email, u.rol, u.empresa_id, e.nombre AS empresa_nombre
       FROM usuarios u JOIN empresas e ON e.id = u.empresa_id
       WHERE u.id = $1 AND u.activo = true`, [req.user.id]
    );
    if (!usuario) return res.status(401).json({ error: 'Usuario no encontrado' });
    res.json({ user: usuario });
  } catch (err) {
    serverError(res, err);
  }
});

module.exports = router;
