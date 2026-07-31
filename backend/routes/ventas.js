const express = require('express');
const { pool } = require('../database');
const { requireGerente } = require('../auth');
const V = require('../validate');
const { serverError, bizError, whereFecha, cuentasPagadasComoVentas } = require('../helpers');

const router = express.Router();

router.get('/', async (req, res) => {
  const { periodo = 'hoy' } = req.query;
  const where = whereFecha('v', periodo);
  try {
    const { rows } = await pool.query(
      `SELECT v.*, p.nombre, p.codigo FROM ventas v
       JOIN products p ON p.id = v.producto_id
       WHERE v.empresa_id = $1 AND ${where} ORDER BY v.fecha DESC`,
      [req.user.empresa_id]
    );
    const agg = await pool.query(
      `SELECT COUNT(*)::int AS c, COALESCE(SUM(total), 0) AS t FROM ventas v WHERE v.empresa_id = $1 AND ${where}`,
      [req.user.empresa_id]
    );
    // Cuentas por cobrar saldadas en este período — cuentan como venta el día
    // en que el cliente termina de pagar, no el día en que se fió el producto.
    const cuentasPagadas = await cuentasPagadasComoVentas(pool, req.user.empresa_id, periodo);
    const totalCuentas = cuentasPagadas.reduce((s, c) => s + c.total, 0);
    res.json({
      ventas: rows,
      cuentasPagadas,
      totalVentas: agg.rows[0].c + cuentasPagadas.length,
      totalIngresos: parseFloat(agg.rows[0].t) + totalCuentas
    });
  } catch (err) {
    serverError(res, err);
  }
});

// ─── Venta múltiple (carrito) ─────────────────────────────────────────────────

const METODOS_PAGO = ['efectivo', 'transferencia'];

router.post('/bulk', async (req, res) => {
  const { items } = req.body;
  const metodo_pago = METODOS_PAGO.includes(req.body.metodo_pago) ? req.body.metodo_pago : 'efectivo';
  if (!Array.isArray(items) || items.length === 0 || items.length > 200)
    return res.status(400).json({ error: 'Se requiere entre 1 y 200 productos' });
  for (const item of items) {
    if (!item.producto_id || V.int(item.cantidad, { min: 1, max: 100000 }) === null)
      return res.status(400).json({ error: 'Datos de ítem inválidos' });
    if (V.num(item.precio_unitario) === null)
      return res.status(400).json({ error: 'Precio unitario inválido' });
  }

  const empresaId = req.user.empresa_id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultados = [];
    for (const item of items) {
      const { producto_id, cantidad, precio_unitario } = item;
      const { rows: [p] } = await client.query(
        'SELECT * FROM products WHERE id = $1 AND empresa_id = $2 FOR UPDATE', [producto_id, empresaId]
      );
      if (!p) throw bizError(`Producto no encontrado (id ${producto_id})`);
      if (p.stock < cantidad) throw bizError(`Stock insuficiente para "${p.nombre}" (disponible: ${p.stock})`);
      const total = cantidad * precio_unitario;
      const { rows: [venta] } = await client.query(
        `INSERT INTO ventas (empresa_id, producto_id, cantidad, precio_unitario, total, metodo_pago, usuario_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [empresaId, producto_id, cantidad, precio_unitario, total, metodo_pago, req.user.id]
      );
      await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [cantidad, producto_id]);
      const { rows: [result] } = await client.query(
        `SELECT v.*, p.nombre, p.codigo FROM ventas v
         JOIN products p ON p.id = v.producto_id WHERE v.id = $1`,
        [venta.id]
      );
      resultados.push(result);
    }
    await client.query('COMMIT');
    res.status(201).json({ ventas: resultados, total: resultados.reduce((s, v) => s + v.total, 0) });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.biz) return res.status(400).json({ error: err.message });
    serverError(res, err);
  } finally {
    client.release();
  }
});

// Elimina una venta y repone el stock del producto (solo gerente)
router.delete('/:id', requireGerente, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [venta] } = await client.query(
      'SELECT * FROM ventas WHERE id = $1 AND empresa_id = $2 FOR UPDATE', [req.params.id, req.user.empresa_id]
    );
    if (!venta) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Venta no encontrada' });
    }
    await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [venta.cantidad, venta.producto_id]);
    await client.query('DELETE FROM ventas WHERE id = $1', [venta.id]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    serverError(res, err);
  } finally {
    client.release();
  }
});

module.exports = router;
