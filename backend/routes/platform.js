const express = require('express');
const { pool } = require('../database');
const { hashPassword, requireSuperadmin } = require('../auth');
const V = require('../validate');
const { serverError } = require('../helpers');

const router = express.Router();

// ─── Plataforma (solo superadmin — dueños de AuraSistems, ven todas las joyerías) ──
router.use(requireSuperadmin);

router.get('/empresas', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT e.*,
        (SELECT COUNT(*)::int FROM usuarios u WHERE u.empresa_id = e.id) AS total_usuarios,
        (SELECT COUNT(*)::int FROM products p WHERE p.empresa_id = e.id) AS total_productos
      FROM empresas e
      ORDER BY e.fecha_creacion DESC
    `);
    res.json(rows);
  } catch (err) {
    serverError(res, err);
  }
});

router.patch('/empresas/:id', async (req, res) => {
  const { activa } = req.body;
  if (typeof activa !== 'boolean') return res.status(400).json({ error: 'Campo "activa" requerido' });
  try {
    const { rows } = await pool.query(
      'UPDATE empresas SET activa = $1 WHERE id = $2 RETURNING *', [activa, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Empresa no encontrada' });
    res.json(rows[0]);
  } catch (err) {
    serverError(res, err);
  }
});

// Crea una joyería nueva junto con su primer usuario gerente (alta asistida por el superadmin)
router.post('/empresas', async (req, res) => {
  const empresa_nombre = V.str(req.body.empresa_nombre, 120);
  const nombre         = V.str(req.body.nombre, 120);
  const email          = V.email(req.body.email);
  const password       = V.password(req.body.password);
  if (!empresa_nombre || !nombre) return res.status(400).json({ error: 'Todos los campos son requeridos' });
  if (!email) return res.status(400).json({ error: 'Correo electrónico inválido' });
  if (!password) return res.status(400).json({ error: 'La contraseña debe tener entre 6 y 100 caracteres' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [empresa] } = await client.query(
      'INSERT INTO empresas (nombre) VALUES ($1) RETURNING *', [empresa_nombre]
    );
    const password_hash = await hashPassword(password);
    await client.query(
      `INSERT INTO usuarios (empresa_id, nombre, email, password_hash, rol)
       VALUES ($1, $2, $3, $4, 'gerente')`,
      [empresa.id, nombre, email, password_hash]
    );
    await client.query('COMMIT');
    res.status(201).json({ ...empresa, total_usuarios: 1, total_productos: 0 });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code !== '23505') console.error(err);
    const msg = err.code === '23505' ? 'Ese correo ya está registrado' : 'Error al procesar la solicitud';
    res.status(400).json({ error: msg });
  } finally {
    client.release();
  }
});

router.get('/empresas/:id/usuarios', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, nombre, email, rol, activo, fecha_creacion FROM usuarios WHERE empresa_id = $1 ORDER BY fecha_creacion',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    serverError(res, err);
  }
});

// Crea un usuario (gerente o empleado) dentro de cualquier joyería existente
router.post('/empresas/:id/usuarios', async (req, res) => {
  const nombre   = V.str(req.body.nombre, 120);
  const email    = V.email(req.body.email);
  const password = V.password(req.body.password);
  const rol      = req.body.rol || 'empleado';
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
  if (!email) return res.status(400).json({ error: 'Correo electrónico inválido' });
  if (!password) return res.status(400).json({ error: 'La contraseña debe tener entre 6 y 100 caracteres' });
  if (!['gerente', 'empleado'].includes(rol)) return res.status(400).json({ error: 'Rol inválido' });
  try {
    const { rows: [empresa] } = await pool.query('SELECT id FROM empresas WHERE id = $1', [req.params.id]);
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });
    const password_hash = await hashPassword(password);
    const { rows: [usuario] } = await pool.query(
      `INSERT INTO usuarios (empresa_id, nombre, email, password_hash, rol)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, nombre, email, rol, activo, fecha_creacion`,
      [req.params.id, nombre, email, password_hash, rol]
    );
    res.status(201).json(usuario);
  } catch (err) {
    if (err.code !== '23505') console.error(err);
    const msg = err.code === '23505' ? 'Ese correo ya está registrado' : 'Error al procesar la solicitud';
    res.status(400).json({ error: msg });
  }
});

module.exports = router;
