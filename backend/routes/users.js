const express = require('express');
const { pool } = require('../database');
const { hashPassword, requireGerente } = require('../auth');
const V = require('../validate');
const { serverError } = require('../helpers');

const router = express.Router();

// ─── Usuarios (solo gerente) ───────────────────────────────────────────────────
router.use(requireGerente);

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, nombre, email, rol, activo, fecha_creacion FROM usuarios WHERE empresa_id = $1 ORDER BY fecha_creacion',
      [req.user.empresa_id]
    );
    res.json(rows);
  } catch (err) {
    serverError(res, err);
  }
});

router.post('/', async (req, res) => {
  const nombre   = V.str(req.body.nombre, 120);
  const email    = V.email(req.body.email);
  const password = V.password(req.body.password);
  const rol      = req.body.rol || 'empleado';
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
  if (!email) return res.status(400).json({ error: 'Correo electrónico inválido' });
  if (!password) return res.status(400).json({ error: 'La contraseña debe tener entre 6 y 100 caracteres' });
  if (!['gerente', 'empleado'].includes(rol)) return res.status(400).json({ error: 'Rol inválido' });
  try {
    const password_hash = await hashPassword(password);
    const { rows: [usuario] } = await pool.query(
      `INSERT INTO usuarios (empresa_id, nombre, email, password_hash, rol)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, nombre, email, rol, activo, fecha_creacion`,
      [req.user.empresa_id, nombre, email, password_hash, rol]
    );
    res.status(201).json(usuario);
  } catch (err) {
    if (err.code !== '23505') console.error(err);
    const msg = err.code === '23505' ? 'Ese correo ya está registrado' : 'Error al procesar la solicitud';
    res.status(400).json({ error: msg });
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  if (Number(id) === req.user.id) return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });
  try {
    const { rows: [target] } = await pool.query(
      'SELECT * FROM usuarios WHERE id = $1 AND empresa_id = $2', [id, req.user.empresa_id]
    );
    if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (target.rol === 'gerente') {
      const { rows: [{ c }] } = await pool.query(
        "SELECT COUNT(*)::int AS c FROM usuarios WHERE empresa_id = $1 AND rol = 'gerente' AND activo = true",
        [req.user.empresa_id]
      );
      if (c <= 1) return res.status(400).json({ error: 'Debe existir al menos un gerente activo' });
    }
    await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (err) {
    serverError(res, err);
  }
});

module.exports = router;
