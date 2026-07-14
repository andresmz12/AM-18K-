const express = require('express');
const { pool } = require('../database');
const { requireGerente } = require('../auth');
const V = require('../validate');
const { serverError, bizError, whereFecha } = require('../helpers');

const router = express.Router();

// ─── Kit Sales (Manillas y Composiciones) ─────────────────────────────────────

router.get('/', async (req, res) => {
  const { periodo = 'hoy' } = req.query;
  const where = whereFecha(null, periodo);
  try {
    const { rows } = await pool.query(
      `SELECT * FROM kit_sales WHERE empresa_id = $1 AND ${where} ORDER BY fecha DESC`,
      [req.user.empresa_id]
    );
    const agg = await pool.query(
      `SELECT COUNT(*)::int AS c, COALESCE(SUM(total), 0) AS t FROM kit_sales WHERE empresa_id = $1 AND ${where}`,
      [req.user.empresa_id]
    );
    res.json({ kit_sales: rows, totalVentas: agg.rows[0].c, totalIngresos: parseFloat(agg.rows[0].t) });
  } catch (err) {
    serverError(res, err);
  }
});

const METODOS_PAGO = ['efectivo', 'transferencia'];

router.post('/', async (req, res) => {
  const nombre_kit = V.str(req.body.nombre_kit, 200);
  const { componentes } = req.body;
  const mano_obra   = V.num(req.body.mano_obra ?? 0);
  const valor_extra = V.num(req.body.valor_extra ?? 0);
  const cliente     = V.optStr(req.body.cliente, 200);
  const metodo_pago = METODOS_PAGO.includes(req.body.metodo_pago) ? req.body.metodo_pago : 'efectivo';
  const empresaId = req.user.empresa_id;

  if (!nombre_kit) return res.status(400).json({ error: 'Nombre del kit requerido' });
  if (mano_obra === null || valor_extra === null)
    return res.status(400).json({ error: 'Mano de obra y valor extra deben ser números positivos' });
  if (cliente === undefined)
    return res.status(400).json({ error: 'Texto demasiado largo' });
  if (!Array.isArray(componentes) || componentes.length === 0 || componentes.length > 200)
    return res.status(400).json({ error: 'Se requiere entre 1 y 200 componentes' });
  for (const comp of componentes) {
    if (!comp.producto_id || V.int(comp.cantidad, { min: 1, max: 100000 }) === null)
      return res.status(400).json({ error: 'Datos de componente inválidos' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Validar stock de todos los componentes
    let totalComponentes = 0;
    for (const comp of componentes) {
      const { rows: [p] } = await client.query(
        'SELECT * FROM products WHERE id = $1 AND empresa_id = $2 FOR UPDATE', [comp.producto_id, empresaId]
      );
      if (!p) throw bizError(`Producto no encontrado (id ${comp.producto_id})`);
      if (p.stock < comp.cantidad)
        throw bizError(`Stock insuficiente para "${p.nombre}" (disponible: ${p.stock})`);
      totalComponentes += p.precio_venta * comp.cantidad;
    }

    // Descontar stock de todos los componentes
    for (const comp of componentes) {
      await client.query(
        'UPDATE products SET stock = stock - $1 WHERE id = $2',
        [comp.cantidad, comp.producto_id]
      );
    }

    // Calcular total (componentes + mano de obra + extra)
    const total = totalComponentes + mano_obra + valor_extra;

    // Guardar la venta del kit
    const { rows: [kitSale] } = await client.query(
      `INSERT INTO kit_sales (empresa_id, nombre_kit, componentes, mano_obra, valor_extra, total, cliente, metodo_pago, usuario_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [empresaId, nombre_kit, JSON.stringify(componentes), mano_obra, valor_extra, total, cliente, metodo_pago, req.user.id]
    );

    await client.query('COMMIT');
    res.status(201).json(kitSale);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.biz) return res.status(400).json({ error: err.message });
    serverError(res, err);
  } finally {
    client.release();
  }
});

// Elimina una venta de kit y repone el stock de cada componente (solo gerente)
router.delete('/:id', requireGerente, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [kit] } = await client.query(
      'SELECT * FROM kit_sales WHERE id = $1 AND empresa_id = $2 FOR UPDATE', [req.params.id, req.user.empresa_id]
    );
    if (!kit) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Kit no encontrado' });
    }
    for (const comp of kit.componentes) {
      await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [comp.cantidad, comp.producto_id]);
    }
    await client.query('DELETE FROM kit_sales WHERE id = $1', [kit.id]);
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
