const express = require('express');
const { pool } = require('../database');
const { serverError } = require('../helpers');

const router = express.Router();

// ─── Estadísticas por categoría ───────────────────────────────────────────────

router.get('/categorias', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        categoria,
        COUNT(*)::int                              AS cantidad,
        COALESCE(SUM(precio_venta * stock), 0)    AS valor_total,
        COALESCE(SUM(costo * stock), 0)           AS invertido,
        COALESCE(SUM(peso_gramos * stock), 0)     AS peso_total
      FROM products
      WHERE empresa_id = $1
      GROUP BY categoria
      ORDER BY valor_total DESC
    `, [req.user.empresa_id]);
    const totalValor = rows.reduce((s, r) => s + parseFloat(r.valor_total), 0);
    const mapped = rows.map(r => ({
      ...r,
      valor_total: parseFloat(r.valor_total),
      invertido:   parseFloat(r.invertido),
      peso_total:  parseFloat(r.peso_total),
      porcentaje:  totalValor > 0 ? ((parseFloat(r.valor_total) / totalValor) * 100).toFixed(1) : '0.0'
    }));
    if (req.user.rol !== 'gerente') mapped.forEach(r => delete r.invertido);
    res.json(mapped);
  } catch (err) {
    serverError(res, err);
  }
});

module.exports = router;
