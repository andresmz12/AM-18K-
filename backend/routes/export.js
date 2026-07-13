const express = require('express');
const { pool } = require('../database');
const { requireGerente } = require('../auth');
const { serverError } = require('../helpers');

const router = express.Router();

// ─── CSV Export (solo gerente — incluye costos) ───────────────────────────────

router.get('/', requireGerente, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM products WHERE empresa_id = $1 ORDER BY fecha_creacion DESC', [req.user.empresa_id]
    );
    const headers = [
      'ID','Nombre','Código','Categoría','Descripción','Peso (g)',
      'Costo (COP)','% Ganancia','Precio Venta (COP)','Stock','Stock Mínimo',
      'Proveedor','Notas','Imagen URL','Fecha Creación'
    ];
    const escape = v => {
      let s = String(v ?? '').replace(/"/g, '""');
      // Neutralizar fórmulas de Excel (=SUM(...), +..., @...) inyectadas en nombres/notas
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return `"${s}"`;
    };
    const csvRows = rows.map(p => [
      p.id, p.nombre, p.codigo, p.categoria, p.descripcion,
      p.peso_gramos, p.costo, p.porcentaje_ganancia, p.precio_venta,
      p.stock, p.stock_minimo, p.proveedor, p.notas,
      // No exportar base64 completo — solo indicar si tiene imagen
      p.imagen_url
        ? (p.imagen_url.startsWith('data:') ? '[imagen en sistema]' : p.imagen_url)
        : '',
      p.fecha_creacion
    ].map(escape).join(','));
    const csv = '﻿' + [headers.join(','), ...csvRows].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=inventario-aurasistems.csv');
    res.send(csv);
  } catch (err) {
    serverError(res, err);
  }
});

module.exports = router;
