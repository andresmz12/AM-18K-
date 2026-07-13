const express = require('express');
const { pool } = require('../database');
const { requireGerente } = require('../auth');
const { serverError } = require('../helpers');

const router = express.Router();

router.get('/', async (req, res) => {
  const empresaId = req.user.empresa_id;
  try {
    const [total, invertido, valorInv, stockBajo, pesoOro, ventasHoy, kitsHoy] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS c FROM products WHERE empresa_id = $1', [empresaId]),
      pool.query('SELECT COALESCE(SUM(costo * stock), 0) AS v FROM products WHERE empresa_id = $1', [empresaId]),
      pool.query('SELECT COALESCE(SUM(precio_venta * stock), 0) AS v FROM products WHERE empresa_id = $1', [empresaId]),
      pool.query('SELECT COUNT(*)::int AS c FROM products WHERE empresa_id = $1 AND stock <= stock_minimo', [empresaId]),
      pool.query("SELECT COALESCE(SUM(peso_gramos * stock), 0) AS v FROM products WHERE empresa_id = $1 AND categoria = 'Oro 18k'", [empresaId]),
      pool.query("SELECT COUNT(*)::int AS c, COALESCE(SUM(total), 0) AS t FROM ventas WHERE empresa_id = $1 AND fecha::date = CURRENT_DATE", [empresaId]),
      pool.query("SELECT COUNT(*)::int AS c, COALESCE(SUM(total), 0) AS t FROM kit_sales WHERE empresa_id = $1 AND fecha::date = CURRENT_DATE", [empresaId])
    ]);
    const inv = parseFloat(invertido.rows[0].v);
    const val = parseFloat(valorInv.rows[0].v);
    const data = {
      totalProductos:     total.rows[0].c,
      totalInvertido:     inv,
      valorInventario:    val,
      gananciasPotencial: val - inv,
      productosStockBajo: stockBajo.rows[0].c,
      pesoTotalOroGramos: parseFloat(pesoOro.rows[0].v),
      ventasHoy:          ventasHoy.rows[0].c + kitsHoy.rows[0].c,
      ingresosHoy:        parseFloat(ventasHoy.rows[0].t) + parseFloat(kitsHoy.rows[0].t)
    };
    if (req.user.rol !== 'gerente') {
      delete data.totalInvertido;
      delete data.gananciasPotencial;
    }
    res.json(data);
  } catch (err) {
    serverError(res, err);
  }
});

// ─── Gráficos del dashboard (solo gerente) ────────────────────────────────────

router.get('/graficos', requireGerente, async (req, res) => {
  const empresaId = req.user.empresa_id;
  try {
    const [ventasPorDia, ventasPorCategoria, topProductos] = await Promise.all([
      pool.query(`
        WITH dias AS (
          SELECT generate_series(CURRENT_DATE - INTERVAL '13 days', CURRENT_DATE, INTERVAL '1 day')::date AS dia
        )
        SELECT
          d.dia,
          COALESCE((SELECT SUM(total) FROM ventas     WHERE empresa_id = $1 AND fecha::date = d.dia), 0) +
          COALESCE((SELECT SUM(total) FROM kit_sales  WHERE empresa_id = $1 AND fecha::date = d.dia), 0) AS total
        FROM dias d
        ORDER BY d.dia
      `, [empresaId]),
      pool.query(`
        SELECT p.categoria, COALESCE(SUM(v.total), 0) AS total
        FROM ventas v JOIN products p ON p.id = v.producto_id
        WHERE v.empresa_id = $1 AND v.fecha >= NOW() - INTERVAL '30 days'
        GROUP BY p.categoria ORDER BY total DESC
      `, [empresaId]),
      pool.query(`
        SELECT p.nombre, p.codigo, SUM(v.cantidad)::int AS unidades, SUM(v.total) AS ingresos
        FROM ventas v JOIN products p ON p.id = v.producto_id
        WHERE v.empresa_id = $1 AND v.fecha >= NOW() - INTERVAL '30 days'
        GROUP BY p.id, p.nombre, p.codigo
        ORDER BY unidades DESC LIMIT 5
      `, [empresaId])
    ]);
    res.json({
      ventasPorDia: ventasPorDia.rows.map(r => ({ dia: r.dia, total: parseFloat(r.total) })),
      ventasPorCategoria: ventasPorCategoria.rows.map(r => ({ categoria: r.categoria, total: parseFloat(r.total) })),
      topProductos: topProductos.rows.map(r => ({ ...r, ingresos: parseFloat(r.ingresos) }))
    });
  } catch (err) {
    serverError(res, err);
  }
});

module.exports = router;
