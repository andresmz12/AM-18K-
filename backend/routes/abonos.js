const express = require('express');
const { pool } = require('../database');
const { requireGerente } = require('../auth');
const V = require('../validate');
const { serverError, actualizarPagadaEn } = require('../helpers');

const router = express.Router();

// Corrige el monto o las notas de un abono ya registrado (solo gerente, ajuste financiero)
router.patch('/:id', requireGerente, async (req, res) => {
  const monto = V.num(req.body.monto, { min: 0.01 });
  const notas = V.optStr(req.body.notas, 2000);
  if (monto === null) return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
  if (notas === undefined) return res.status(400).json({ error: 'Texto demasiado largo' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [abono] } = await client.query(
      'SELECT * FROM abonos WHERE id = $1 AND empresa_id = $2', [req.params.id, req.user.empresa_id]
    );
    if (!abono) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Abono no encontrado' });
    }
    // FOR UPDATE bloquea la cuenta: el nuevo monto no puede exceder el saldo disponible
    const { rows: [cuenta] } = await client.query(
      'SELECT * FROM cuentas_por_cobrar WHERE id = $1 FOR UPDATE', [abono.cuenta_id]
    );
    const { rows: [{ t }] } = await client.query(
      'SELECT COALESCE(SUM(monto), 0) AS t FROM abonos WHERE cuenta_id = $1 AND id != $2',
      [abono.cuenta_id, abono.id]
    );
    const saldoDisponible = cuenta.monto_total - parseFloat(t);
    if (monto > saldoDisponible + 0.01) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `El abono no puede ser mayor al saldo disponible (${saldoDisponible})` });
    }
    const { rows: [actualizado] } = await client.query(
      'UPDATE abonos SET monto = $1, notas = $2 WHERE id = $3 RETURNING *',
      [monto, notas, abono.id]
    );
    await actualizarPagadaEn(client, abono.cuenta_id);
    await client.query('COMMIT');
    res.json(actualizado);
  } catch (err) {
    await client.query('ROLLBACK');
    serverError(res, err);
  } finally {
    client.release();
  }
});

router.delete('/:id', requireGerente, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [abono] } = await client.query(
      'SELECT * FROM abonos WHERE id = $1 AND empresa_id = $2', [req.params.id, req.user.empresa_id]
    );
    if (!abono) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Abono no encontrado' });
    }
    await client.query('DELETE FROM abonos WHERE id = $1', [abono.id]);
    await actualizarPagadaEn(client, abono.cuenta_id);
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
