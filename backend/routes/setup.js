const express = require('express');
const { pool } = require('../database');
const { hashPassword, safeEqual } = require('../auth');

const router = express.Router();

// ─── Bootstrap del superadmin (uso único, sin necesidad de terminal) ──────────
// Protegido por SETUP_SECRET (variable de entorno). Sin esa variable configurada
// en Railway, esta ruta siempre responde 404 y no hace nada.
//
// El GET solo verifica el secreto y devuelve un formulario; los datos (incluida
// la contraseña) se envían por POST en el body, nunca en la URL — así no quedan
// en logs del servidor/proxy, en el header Referer ni en el historial del navegador.
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

router.get('/superadmin', (req, res) => {
  const { secret } = req.query;
  if (!process.env.SETUP_SECRET || !secret || !safeEqual(secret, process.env.SETUP_SECRET)) {
    return res.status(404).send('Not found');
  }
  res.type('html').send(`
    <!doctype html><html><head><meta charset="utf-8"><title>Bootstrap superadmin — AuraSistems</title>
    <style>body{font-family:system-ui,sans-serif;max-width:420px;margin:60px auto;padding:0 20px}
    label{display:block;margin-top:14px;font-weight:600}input{width:100%;padding:8px;margin-top:4px;box-sizing:border-box}
    button{margin-top:20px;padding:10px 16px;cursor:pointer}</style></head><body>
    <h2>Crear cuenta de superadmin</h2>
    <form method="POST" action="/api/setup/superadmin">
      <input type="hidden" name="secret" value="${escapeHtml(secret)}">
      <label>Nombre<input name="nombre" required></label>
      <label>Correo<input type="email" name="email" required></label>
      <label>Contraseña<input type="password" name="password" minlength="6" required></label>
      <button type="submit">Crear / actualizar superadmin</button>
    </form>
    </body></html>
  `);
});

router.post('/superadmin', express.urlencoded({ extended: false }), async (req, res) => {
  const { secret, nombre, email, password } = req.body;
  if (!process.env.SETUP_SECRET || !secret || !safeEqual(secret, process.env.SETUP_SECRET)) {
    return res.status(404).send('Not found');
  }
  if (!nombre || !email || !password) return res.status(400).send('Faltan parámetros: nombre, email, password');
  if (String(password).length < 6) return res.status(400).send('La contraseña debe tener al menos 6 caracteres');

  try {
    const NOMBRE_EMPRESA_PLATAFORMA = 'AuraSistems — Plataforma';
    let { rows: [empresa] } = await pool.query(
      'SELECT id FROM empresas WHERE nombre = $1 LIMIT 1', [NOMBRE_EMPRESA_PLATAFORMA]
    );
    if (!empresa) {
      ({ rows: [empresa] } = await pool.query(
        'INSERT INTO empresas (nombre) VALUES ($1) RETURNING id', [NOMBRE_EMPRESA_PLATAFORMA]
      ));
    }
    const password_hash = await hashPassword(password);
    await pool.query(
      `INSERT INTO usuarios (empresa_id, nombre, email, password_hash, rol)
       VALUES ($1, $2, $3, $4, 'superadmin')
       ON CONFLICT (email) DO UPDATE SET password_hash = $4, rol = 'superadmin', activo = true`,
      [empresa.id, nombre, String(email).toLowerCase(), password_hash]
    );
    res.send(`Listo. Cuenta de superadmin creada/actualizada para ${email}. Ya puedes iniciar sesión en la app con ese correo. Por seguridad, ahora borra la variable SETUP_SECRET en Railway.`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error interno');
  }
});

module.exports = router;
