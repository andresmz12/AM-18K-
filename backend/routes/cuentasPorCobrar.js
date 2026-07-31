const express = require('express');
const { pool } = require('../database');
const { requireGerente } = require('../auth');
const V = require('../validate');
const { serverError, bizError, actualizarPagadaEn } = require('../helpers');

const router = express.Router();

// ─── Cuentas por Cobrar ─────────────────────────────────────────────────────────
// Cada cuenta representa una deuda de un cliente; los abonos se aplican contra
// ella hasta saldarla (saldo = monto_total - suma de abonos).

router.get('/', async (req, res) => {
  const { estado = 'todas' } = req.query;
  try {
    const { rows } = await pool.query(
      `SELECT c.*, COALESCE((SELECT SUM(a.monto) FROM abonos a WHERE a.cuenta_id = c.id), 0) AS monto_abonado
       FROM cuentas_por_cobrar c
       WHERE c.empresa_id = $1
       ORDER BY c.fecha_creacion DESC`,
      [req.user.empresa_id]
    );
    const mapeadas = rows.map(r => {
      const monto_abonado = parseFloat(r.monto_abonado);
      const saldo = r.monto_total - monto_abonado;
      return { ...r, monto_abonado, saldo, estado: saldo <= 0.01 ? 'pagada' : 'pendiente' };
    });
    const filtradas = estado === 'todas' ? mapeadas : mapeadas.filter(c => c.estado === estado);
    res.json(filtradas);
  } catch (err) {
    serverError(res, err);
  }
});

router.post('/', async (req, res) => {
  const cliente     = V.str(req.body.cliente, 200);
  const descripcion = V.optStr(req.body.descripcion, 500);
  const notas       = V.optStr(req.body.notas, 2000);
  const { items }   = req.body;
  const empresaId   = req.user.empresa_id;

  if (!cliente) return res.status(400).json({ error: 'Cliente requerido' });
  if (descripcion === undefined || notas === undefined) return res.status(400).json({ error: 'Texto demasiado largo' });

  const tieneItems = Array.isArray(items) && items.length > 0;

  // Modo manual: deuda sin productos asociados (servicio, adelanto, etc.) — no toca stock.
  if (!tieneItems) {
    const monto_total = V.num(req.body.monto_total, { min: 0.01 });
    if (monto_total === null) return res.status(400).json({ error: 'Monto total (mayor a 0) es requerido' });
    try {
      const { rows: [cuenta] } = await pool.query(
        `INSERT INTO cuentas_por_cobrar (empresa_id, usuario_id, cliente, descripcion, monto_total, notas)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [empresaId, req.user.id, cliente, descripcion, monto_total, notas]
      );
      return res.status(201).json({ ...cuenta, monto_abonado: 0, saldo: cuenta.monto_total, estado: 'pendiente' });
    } catch (err) {
      return serverError(res, err);
    }
  }

  // Modo con productos ("fiado"): descuenta el stock igual que una venta.
  // Un ítem sin producto_id es un "pedido especial" (aún no hay stock de eso,
  // el cliente lo va pagando por adelantado) — se registra con su nombre a mano
  // y no toca inventario.
  if (items.length > 200) return res.status(400).json({ error: 'Se permiten máximo 200 productos' });
  for (const item of items) {
    if (V.int(item.cantidad, { min: 1, max: 100000 }) === null)
      return res.status(400).json({ error: 'Datos de producto inválidos' });
    if (V.num(item.precio_unitario) === null)
      return res.status(400).json({ error: 'Precio unitario inválido' });
    if (!item.producto_id && !V.str(item.nombre, 200))
      return res.status(400).json({ error: 'El nombre del ítem sin stock es requerido' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let monto_total = 0;
    const itemsGuardados = [];
    for (const item of items) {
      if (!item.producto_id) {
        monto_total += item.cantidad * item.precio_unitario;
        itemsGuardados.push({
          producto_id: null, nombre: V.str(item.nombre, 200),
          cantidad: item.cantidad, precio_unitario: item.precio_unitario
        });
        continue;
      }
      const { rows: [p] } = await client.query(
        'SELECT * FROM products WHERE id = $1 AND empresa_id = $2 FOR UPDATE', [item.producto_id, empresaId]
      );
      if (!p) throw bizError(`Producto no encontrado (id ${item.producto_id})`);
      if (p.stock < item.cantidad) throw bizError(`Stock insuficiente para "${p.nombre}" (disponible: ${p.stock})`);
      monto_total += item.cantidad * item.precio_unitario;
      itemsGuardados.push({
        producto_id: item.producto_id, nombre: p.nombre,
        cantidad: item.cantidad, precio_unitario: item.precio_unitario
      });
    }
    for (const item of items) {
      if (!item.producto_id) continue;
      await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [item.cantidad, item.producto_id]);
    }
    const { rows: [cuenta] } = await client.query(
      `INSERT INTO cuentas_por_cobrar (empresa_id, usuario_id, cliente, descripcion, monto_total, notas, items)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [empresaId, req.user.id, cliente, descripcion, monto_total, notas, JSON.stringify(itemsGuardados)]
    );
    await client.query('COMMIT');
    res.status(201).json({ ...cuenta, monto_abonado: 0, saldo: cuenta.monto_total, estado: 'pendiente' });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.biz) return res.status(400).json({ error: err.message });
    serverError(res, err);
  } finally {
    client.release();
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows: [cuenta] } = await pool.query(
      'SELECT * FROM cuentas_por_cobrar WHERE id = $1 AND empresa_id = $2', [req.params.id, req.user.empresa_id]
    );
    if (!cuenta) return res.status(404).json({ error: 'Cuenta no encontrada' });
    const { rows: abonos } = await pool.query(
      'SELECT * FROM abonos WHERE cuenta_id = $1 ORDER BY fecha DESC', [cuenta.id]
    );
    const monto_abonado = abonos.reduce((s, a) => s + a.monto, 0);
    const saldo = cuenta.monto_total - monto_abonado;
    res.json({ ...cuenta, abonos, monto_abonado, saldo, estado: saldo <= 0.01 ? 'pagada' : 'pendiente' });
  } catch (err) {
    serverError(res, err);
  }
});

// Corrige el nombre del cliente o la descripción de la cuenta (no afecta montos/abonos)
router.patch('/:id', async (req, res) => {
  const cliente     = V.str(req.body.cliente, 200);
  const descripcion = V.optStr(req.body.descripcion, 500);
  if (!cliente) return res.status(400).json({ error: 'Cliente requerido' });
  if (descripcion === undefined) return res.status(400).json({ error: 'Texto demasiado largo' });
  try {
    const { rows: [cuenta] } = await pool.query(
      `UPDATE cuentas_por_cobrar SET cliente = $1, descripcion = $2
       WHERE id = $3 AND empresa_id = $4 RETURNING *`,
      [cliente, descripcion, req.params.id, req.user.empresa_id]
    );
    if (!cuenta) return res.status(404).json({ error: 'Cuenta no encontrada' });
    res.json(cuenta);
  } catch (err) {
    serverError(res, err);
  }
});

router.delete('/:id', requireGerente, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [cuenta] } = await client.query(
      'SELECT * FROM cuentas_por_cobrar WHERE id = $1 AND empresa_id = $2 FOR UPDATE', [req.params.id, req.user.empresa_id]
    );
    if (!cuenta) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Cuenta no encontrada' });
    }
    // Si la cuenta tenía productos asociados (venta "al fiado"), repone el stock.
    // Los ítems sin producto_id son pedidos especiales y nunca tocaron inventario.
    for (const item of cuenta.items || []) {
      if (!item.producto_id) continue;
      await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [item.cantidad, item.producto_id]);
    }
    await client.query('DELETE FROM abonos WHERE cuenta_id = $1', [cuenta.id]);
    await client.query('DELETE FROM cuentas_por_cobrar WHERE id = $1', [cuenta.id]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    serverError(res, err);
  } finally {
    client.release();
  }
});

router.post('/:id/abonos', async (req, res) => {
  const monto = V.num(req.body.monto, { min: 0.01 });
  const notas = V.optStr(req.body.notas, 2000);
  if (monto === null) return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
  if (notas === undefined) return res.status(400).json({ error: 'Texto demasiado largo' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // FOR UPDATE bloquea la cuenta: dos abonos simultáneos no pueden exceder el saldo
    const { rows: [cuenta] } = await client.query(
      'SELECT * FROM cuentas_por_cobrar WHERE id = $1 AND empresa_id = $2 FOR UPDATE',
      [req.params.id, req.user.empresa_id]
    );
    if (!cuenta) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Cuenta no encontrada' });
    }
    const { rows: [{ t }] } = await client.query(
      'SELECT COALESCE(SUM(monto), 0) AS t FROM abonos WHERE cuenta_id = $1', [cuenta.id]
    );
    const saldoActual = cuenta.monto_total - parseFloat(t);
    if (monto > saldoActual + 0.01) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `El abono no puede ser mayor al saldo pendiente (${saldoActual})` });
    }
    const { rows: [abono] } = await client.query(
      `INSERT INTO abonos (empresa_id, cuenta_id, cliente, monto, notas)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.empresa_id, cuenta.id, cuenta.cliente, monto, notas]
    );
    await actualizarPagadaEn(client, cuenta.id);
    await client.query('COMMIT');
    res.status(201).json(abono);
  } catch (err) {
    await client.query('ROLLBACK');
    serverError(res, err);
  } finally {
    client.release();
  }
});

module.exports = router;
