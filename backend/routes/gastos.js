const express = require('express');
const { pool } = require('../database');
const { requireGerente } = require('../auth');
const V = require('../validate');
const { serverError, whereFecha } = require('../helpers');

const router = express.Router();

// ─── Gastos ───────────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  const { periodo = 'hoy' } = req.query;
  const where = whereFecha(null, periodo);
  try {
    const { rows } = await pool.query(
      `SELECT id, empresa_id, concepto, monto, recurrente, imagen_url, notas, fecha
       FROM gastos WHERE empresa_id = $1 AND ${where} ORDER BY fecha DESC`,
      [req.user.empresa_id]
    );
    res.json({ gastos: rows, total: rows.reduce((s, g) => s + g.monto, 0) });
  } catch (err) {
    serverError(res, err);
  }
});

router.post('/', async (req, res) => {
  const concepto   = V.str(req.body.concepto, 200);
  const monto      = V.num(req.body.monto, { min: 0.01 });
  const notas      = V.optStr(req.body.notas, 2000);
  const imagen_url = V.imagen(req.body.imagen_url);
  if (!concepto || monto === null)
    return res.status(400).json({ error: 'Concepto y monto (mayor a 0) son requeridos' });
  if (notas === undefined) return res.status(400).json({ error: 'Texto demasiado largo' });
  if (imagen_url === undefined) return res.status(400).json({ error: 'Imagen inválida' });
  try {
    const { rows: [gasto] } = await pool.query(
      `INSERT INTO gastos (empresa_id, concepto, monto, recurrente, imagen_url, notas)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.user.empresa_id, concepto, monto, !!req.body.recurrente, imagen_url, notas]
    );
    res.status(201).json(gasto);
  } catch (err) {
    serverError(res, err);
  }
});

router.delete('/:id', requireGerente, async (req, res) => {
  try {
    await pool.query('DELETE FROM gastos WHERE id = $1 AND empresa_id = $2', [req.params.id, req.user.empresa_id]);
    res.json({ ok: true });
  } catch (err) {
    serverError(res, err);
  }
});

module.exports = router;
