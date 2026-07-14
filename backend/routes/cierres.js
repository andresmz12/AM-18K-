const express = require('express');
const PDFDocument = require('pdfkit');
const { pool } = require('../database');
const { requireGerente } = require('../auth');
const V = require('../validate');
const { serverError } = require('../helpers');

const router = express.Router();

const cop = v => new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', maximumFractionDigits: 0
}).format(v || 0);

// El valor llega como DATE (medianoche UTC) — se formatea por componentes,
// no con un Date normal, para no correr el mismo riesgo de desfase de día
// que ya tuvimos en el frontend.
const fmtFechaCierre = fecha => {
  const iso = fecha instanceof Date ? fecha.toISOString() : String(fecha);
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

// ─── Cierre de caja ────────────────────────────────────────────────────────────

async function resumenDelDia(empresaId) {
  const [ventasR, kitsR, gastosR, abonosR] = await Promise.all([
    pool.query("SELECT COALESCE(SUM(total), 0) AS t FROM ventas WHERE empresa_id = $1 AND fecha::date = CURRENT_DATE", [empresaId]),
    pool.query("SELECT COALESCE(SUM(total), 0) AS t FROM kit_sales WHERE empresa_id = $1 AND fecha::date = CURRENT_DATE", [empresaId]),
    pool.query("SELECT COALESCE(SUM(monto), 0) AS t FROM gastos WHERE empresa_id = $1 AND fecha::date = CURRENT_DATE", [empresaId]),
    pool.query("SELECT COALESCE(SUM(monto), 0) AS t FROM abonos WHERE empresa_id = $1 AND fecha::date = CURRENT_DATE", [empresaId])
  ]);
  return {
    ventas: parseFloat(ventasR.rows[0].t) + parseFloat(kitsR.rows[0].t),
    gastos: parseFloat(gastosR.rows[0].t),
    abonos: parseFloat(abonosR.rows[0].t)
  };
}

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*, u.nombre AS usuario_nombre FROM cierres_caja c
       JOIN usuarios u ON u.id = c.usuario_id
       WHERE c.empresa_id = $1 ORDER BY c.fecha DESC LIMIT 30`,
      [req.user.empresa_id]
    );
    res.json(rows);
  } catch (err) {
    serverError(res, err);
  }
});

router.get('/hoy', async (req, res) => {
  const empresaId = req.user.empresa_id;
  try {
    const [resumen, existente] = await Promise.all([
      resumenDelDia(empresaId),
      pool.query(
        `SELECT c.*, u.nombre AS usuario_nombre FROM cierres_caja c
         JOIN usuarios u ON u.id = c.usuario_id
         WHERE c.empresa_id = $1 AND c.fecha = CURRENT_DATE`,
        [empresaId]
      )
    ]);
    res.json({ ...resumen, cierre: existente.rows[0] || null });
  } catch (err) {
    serverError(res, err);
  }
});

router.post('/', async (req, res) => {
  const apertura_efectivo = V.num(req.body.apertura_efectivo);
  const apertura_cuenta   = V.num(req.body.apertura_cuenta);
  const dinero_efectivo   = V.num(req.body.dinero_efectivo);
  const dinero_cuenta     = V.num(req.body.dinero_cuenta);
  const notas             = V.optStr(req.body.notas, 2000);
  const empresaId = req.user.empresa_id;
  if (apertura_efectivo === null || apertura_cuenta === null || dinero_efectivo === null || dinero_cuenta === null)
    return res.status(400).json({ error: 'Apertura (efectivo y cuenta) y cierre (efectivo y cuenta) deben ser números positivos' });
  if (notas === undefined) return res.status(400).json({ error: 'Texto demasiado largo' });
  try {
    const { ventas, gastos, abonos } = await resumenDelDia(empresaId);
    const apertura = apertura_efectivo + apertura_cuenta;
    const total_esperado = apertura + ventas + abonos - gastos;
    const diferencia = (dinero_efectivo + dinero_cuenta) - total_esperado;

    const { rows: [cierre] } = await pool.query(
      `INSERT INTO cierres_caja
        (empresa_id, usuario_id, apertura, apertura_efectivo, apertura_cuenta,
         ventas, abonos, gastos, total_esperado, dinero_efectivo, dinero_cuenta, diferencia, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [empresaId, req.user.id, apertura, apertura_efectivo, apertura_cuenta,
       ventas, abonos, gastos, total_esperado, dinero_efectivo, dinero_cuenta, diferencia, notas]
    );
    res.status(201).json(cierre);
  } catch (err) {
    if (err.code !== '23505') console.error(err);
    const msg = err.code === '23505' ? 'Ya existe un cierre de caja para hoy' : 'Error al procesar la solicitud';
    res.status(400).json({ error: msg });
  }
});

// Descarga el resumen de un cierre de caja en PDF
router.get('/:id/pdf', async (req, res) => {
  try {
    const { rows: [c] } = await pool.query(
      `SELECT c.*, u.nombre AS usuario_nombre, e.nombre AS empresa_nombre
       FROM cierres_caja c
       JOIN usuarios u ON u.id = c.usuario_id
       JOIN empresas e ON e.id = c.empresa_id
       WHERE c.id = $1 AND c.empresa_id = $2`,
      [req.params.id, req.user.empresa_id]
    );
    if (!c) return res.status(404).json({ error: 'Cierre no encontrado' });

    const fechaStr = fmtFechaCierre(c.fecha);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="cierre-caja-${fechaStr.replace(/\//g, '-')}.pdf"`);

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    doc.pipe(res);

    doc.fontSize(16).fillColor('#0A0A0A').text('AuraSistems — Cierre de Caja', { continued: false });
    doc.fontSize(10).fillColor('#666666').text(c.empresa_nombre);
    doc.fontSize(9).fillColor('#9A9A9A').text(`Fecha: ${fechaStr}  ·  Cerrado por: ${c.usuario_nombre}`);
    doc.moveDown(1.5);

    const fila = (label, valor, { destacado = false, negativo = false } = {}) => {
      const y = doc.y;
      doc.fontSize(11).fillColor('#333333').text(label, 40, y, { continued: false });
      doc.fontSize(destacado ? 13 : 11)
        .fillColor(negativo ? '#C62828' : destacado ? '#0A0A0A' : '#333333')
        .text(valor, 40, y, { align: 'right', width: 515 });
      doc.moveDown(destacado ? 0.9 : 0.6);
    };

    fila('Apertura en efectivo', cop(c.apertura_efectivo));
    fila('Apertura en cuenta', cop(c.apertura_cuenta));
    fila('Apertura total', cop(c.apertura));
    doc.moveDown(0.3);
    fila('Ventas del día', cop(c.ventas));
    fila('Abonos recibidos', cop(c.abonos));
    fila('Gastos del día', `-${cop(c.gastos)}`);
    doc.moveDown(0.3);
    fila('Total esperado en caja', cop(c.total_esperado), { destacado: true });
    doc.moveDown(0.3);
    fila('Efectivo contado', cop(c.dinero_efectivo));
    fila('En cuenta', cop(c.dinero_cuenta));
    fila('Total contado', cop(c.dinero_efectivo + c.dinero_cuenta));
    doc.moveDown(0.3);
    fila('Diferencia', cop(c.diferencia), { destacado: true, negativo: c.diferencia < 0 });

    if (c.notas) {
      doc.moveDown(1);
      doc.fontSize(10).fillColor('#666666').text('Notas:', 40);
      doc.fontSize(10).fillColor('#333333').text(c.notas, 40);
    }

    doc.end();
  } catch (err) {
    serverError(res, err);
  }
});

// Elimina un cierre de caja (solo gerente) — permite corregir un cierre hecho por error
router.delete('/:id', requireGerente, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'DELETE FROM cierres_caja WHERE id = $1 AND empresa_id = $2 RETURNING id',
      [req.params.id, req.user.empresa_id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Cierre no encontrado' });
    res.json({ ok: true });
  } catch (err) {
    serverError(res, err);
  }
});

module.exports = router;
