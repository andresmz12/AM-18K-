const express = require('express');
const { pool } = require('../database');
const { requireGerente } = require('../auth');
const V = require('../validate');
const { serverError } = require('../helpers');

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
  const monto_total = V.num(req.body.monto_total, { min: 0.01 });
  const descripcion = V.optStr(req.body.descripcion, 500);
  const notas       = V.optStr(req.body.notas, 2000);
  if (!cliente || monto_total === null)
    return res.status(400).json({ error: 'Cliente y monto total (mayor a 0) son requeridos' });
  if (descripcion === undefined || notas === undefined) return res.status(400).json({ error: 'Texto demasiado largo' });
  try {
    const { rows: [cuenta] } = await pool.query(
      `INSERT INTO cuentas_por_cobrar (empresa_id, usuario_id, cliente, descripcion, monto_total, notas)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.user.empresa_id, req.user.id, cliente, descripcion, monto_total, notas]
    );
    res.status(201).json({ ...cuenta, monto_abonado: 0, saldo: cuenta.monto_total, estado: 'pendiente' });
  } catch (err) {
    serverError(res, err);
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
  try {
    const { rows: [cuenta] } = await pool.query(
      'SELECT id FROM cuentas_por_cobrar WHERE id = $1 AND empresa_id = $2', [req.params.id, req.user.empresa_id]
    );
    if (!cuenta) return res.status(404).json({ error: 'Cuenta no encontrada' });
    await pool.query('DELETE FROM abonos WHERE cuenta_id = $1', [cuenta.id]);
    await pool.query('DELETE FROM cuentas_por_cobrar WHERE id = $1', [cuenta.id]);
    res.json({ ok: true });
  } catch (err) {
    serverError(res, err);
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
