const express = require('express');
const { pool } = require('../database');
const { requireGerente } = require('../auth');
const V = require('../validate');
const { serverError } = require('../helpers');

const router = express.Router();

// ─── Cotizaciones ─────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM cotizaciones WHERE empresa_id = $1 ORDER BY fecha DESC', [req.user.empresa_id]
    );
    res.json(rows);
  } catch (err) {
    serverError(res, err);
  }
});

router.post('/', async (req, res) => {
  const { items } = req.body;
  const cliente = V.optStr(req.body.cliente, 200);
  const notas   = V.optStr(req.body.notas, 2000);
  const total   = V.num(req.body.total ?? 0);
  if (!Array.isArray(items) || items.length === 0 || items.length > 200)
    return res.status(400).json({ error: 'La cotización debe tener entre 1 y 200 ítems' });
  if (total === null) return res.status(400).json({ error: 'Total inválido' });
  if (cliente === undefined || notas === undefined) return res.status(400).json({ error: 'Texto demasiado largo' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO cotizaciones (empresa_id, cliente, items, total, notas)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.empresa_id, cliente, JSON.stringify(items), total, notas]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    serverError(res, err);
  }
});

router.delete('/:id', requireGerente, async (req, res) => {
  try {
    await pool.query('DELETE FROM cotizaciones WHERE id = $1 AND empresa_id = $2', [req.params.id, req.user.empresa_id]);
    res.json({ ok: true });
  } catch (err) {
    serverError(res, err);
  }
});

module.exports = router;
