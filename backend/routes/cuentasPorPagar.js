const express = require('express');
const { pool } = require('../database');
const { requireGerente } = require('../auth');
const V = require('../validate');
const { serverError, actualizarPagadaEnCP } = require('../helpers');

const router = express.Router();

// ─── Cuentas por Pagar ──────────────────────────────────────────────────────
// Lo que el negocio le debe a un proveedor o persona. Los pagos se aplican
// contra ella hasta saldarla (saldo = monto_total - suma de pagos).

router.get('/', async (req, res) => {
  const { estado = 'todas' } = req.query;
  try {
    const { rows } = await pool.query(
      `SELECT c.*, COALESCE((SELECT SUM(p.monto) FROM pagos p WHERE p.cuenta_id = c.id), 0) AS monto_pagado
       FROM cuentas_por_pagar c
       WHERE c.empresa_id = $1
       ORDER BY c.fecha_creacion DESC`,
      [req.user.empresa_id]
    );
    const mapeadas = rows.map(r => {
      const monto_pagado = parseFloat(r.monto_pagado);
      const saldo = r.monto_total - monto_pagado;
      return { ...r, monto_pagado, saldo, estado: saldo <= 0.01 ? 'pagada' : 'pendiente' };
    });
    const filtradas = estado === 'todas' ? mapeadas : mapeadas.filter(c => c.estado === estado);
    res.json(filtradas);
  } catch (err) {
    serverError(res, err);
  }
});

router.post('/', async (req, res) => {
  const proveedor   = V.str(req.body.proveedor, 200);
  const descripcion = V.optStr(req.body.descripcion, 500);
  const notas       = V.optStr(req.body.notas, 2000);
  const montoTotal  = V.num(req.body.monto_total, { min: 0.01 });
  if (!proveedor) return res.status(400).json({ error: 'Proveedor o persona es requerido' });
  if (montoTotal === null) return res.status(400).json({ error: 'Monto total (mayor a 0) es requerido' });
  if (descripcion === undefined || notas === undefined) return res.status(400).json({ error: 'Texto demasiado largo' });
  try {
    const { rows: [cuenta] } = await pool.query(
      `INSERT INTO cuentas_por_pagar (empresa_id, usuario_id, proveedor, descripcion, monto_total, notas)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.user.empresa_id, req.user.id, proveedor, descripcion, montoTotal, notas]
    );
    res.status(201).json({ ...cuenta, monto_pagado: 0, saldo: cuenta.monto_total, estado: 'pendiente' });
  } catch (err) {
    serverError(res, err);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows: [cuenta] } = await pool.query(
      'SELECT * FROM cuentas_por_pagar WHERE id = $1 AND empresa_id = $2', [req.params.id, req.user.empresa_id]
    );
    if (!cuenta) return res.status(404).json({ error: 'Cuenta no encontrada' });
    const { rows: pagos } = await pool.query(
      'SELECT * FROM pagos WHERE cuenta_id = $1 ORDER BY fecha DESC', [cuenta.id]
    );
    const monto_pagado = pagos.reduce((s, p) => s + p.monto, 0);
    const saldo = cuenta.monto_total - monto_pagado;
    res.json({ ...cuenta, pagos, monto_pagado, saldo, estado: saldo <= 0.01 ? 'pagada' : 'pendiente' });
  } catch (err) {
    serverError(res, err);
  }
});

// Corrige el proveedor o la descripción de la cuenta (no afecta montos/pagos)
router.patch('/:id', async (req, res) => {
  const proveedor   = V.str(req.body.proveedor, 200);
  const descripcion = V.optStr(req.body.descripcion, 500);
  if (!proveedor) return res.status(400).json({ error: 'Proveedor o persona es requerido' });
  if (descripcion === undefined) return res.status(400).json({ error: 'Texto demasiado largo' });
  try {
    const { rows: [cuenta] } = await pool.query(
      `UPDATE cuentas_por_pagar SET proveedor = $1, descripcion = $2
       WHERE id = $3 AND empresa_id = $4 RETURNING *`,
      [proveedor, descripcion, req.params.id, req.user.empresa_id]
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
      'SELECT * FROM cuentas_por_pagar WHERE id = $1 AND empresa_id = $2 FOR UPDATE', [req.params.id, req.user.empresa_id]
    );
    if (!cuenta) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Cuenta no encontrada' });
    }
    await client.query('DELETE FROM pagos WHERE cuenta_id = $1', [cuenta.id]);
    await client.query('DELETE FROM cuentas_por_pagar WHERE id = $1', [cuenta.id]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    serverError(res, err);
  } finally {
    client.release();
  }
});

router.post('/:id/pagos', async (req, res) => {
  const monto = V.num(req.body.monto, { min: 0.01 });
  const notas = V.optStr(req.body.notas, 2000);
  if (monto === null) return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
  if (notas === undefined) return res.status(400).json({ error: 'Texto demasiado largo' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // FOR UPDATE bloquea la cuenta: dos pagos simultáneos no pueden exceder el saldo
    const { rows: [cuenta] } = await client.query(
      'SELECT * FROM cuentas_por_pagar WHERE id = $1 AND empresa_id = $2 FOR UPDATE',
      [req.params.id, req.user.empresa_id]
    );
    if (!cuenta) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Cuenta no encontrada' });
    }
    const { rows: [{ t }] } = await client.query(
      'SELECT COALESCE(SUM(monto), 0) AS t FROM pagos WHERE cuenta_id = $1', [cuenta.id]
    );
    const saldoActual = cuenta.monto_total - parseFloat(t);
    if (monto > saldoActual + 0.01) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `El pago no puede ser mayor al saldo pendiente (${saldoActual})` });
    }
    const { rows: [pago] } = await client.query(
      `INSERT INTO pagos (empresa_id, cuenta_id, proveedor, monto, notas)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.empresa_id, cuenta.id, cuenta.proveedor, monto, notas]
    );
    await actualizarPagadaEnCP(client, cuenta.id);
    await client.query('COMMIT');
    res.status(201).json(pago);
  } catch (err) {
    await client.query('ROLLBACK');
    serverError(res, err);
  } finally {
    client.release();
  }
});

module.exports = router;
