const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const cop = v => new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', maximumFractionDigits: 0
}).format(v || 0);

function whereFecha(alias, periodo) {
  const col = alias ? `${alias}.fecha` : 'fecha';
  const map = {
    hoy:    `${col}::date = CURRENT_DATE`,
    semana: `${col} >= NOW() - INTERVAL '7 days'`,
    mes:    `DATE_TRUNC('month', ${col}) = DATE_TRUNC('month', NOW())`,
    todo:   'TRUE'
  };
  return map[periodo] || map.todo;
}

// ─── Consultas de datos ────────────────────────────────────────────────────────

async function datosInventario(pool, empresaId) {
  const { rows } = await pool.query(
    `SELECT codigo, nombre, categoria, costo, porcentaje_ganancia, precio_venta, stock, stock_minimo, proveedor
     FROM products WHERE empresa_id = $1 ORDER BY categoria, nombre`,
    [empresaId]
  );
  return rows;
}

async function datosVentas(pool, empresaId, periodo) {
  const [ventasR, kitsR] = await Promise.all([
    pool.query(
      `SELECT v.fecha, 'Venta' AS tipo, p.nombre, p.codigo, v.cantidad, u.nombre AS vendedor, v.total
       FROM ventas v
       JOIN products p ON p.id = v.producto_id
       LEFT JOIN usuarios u ON u.id = v.usuario_id
       WHERE v.empresa_id = $1 AND ${whereFecha('v', periodo)}
       ORDER BY v.fecha DESC`,
      [empresaId]
    ),
    pool.query(
      `SELECT k.fecha, 'Kit' AS tipo, k.nombre_kit AS nombre, '—' AS codigo, 1 AS cantidad, u.nombre AS vendedor, k.total
       FROM kit_sales k
       LEFT JOIN usuarios u ON u.id = k.usuario_id
       WHERE k.empresa_id = $1 AND ${whereFecha('k', periodo)}
       ORDER BY k.fecha DESC`,
      [empresaId]
    )
  ]);
  return [...ventasR.rows, ...kitsR.rows].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
}

async function datosGastos(pool, empresaId, periodo) {
  const { rows } = await pool.query(
    `SELECT fecha, concepto, monto, recurrente, notas FROM gastos WHERE empresa_id = $1 AND ${whereFecha(null, periodo)} ORDER BY fecha DESC`,
    [empresaId]
  );
  return rows;
}

async function datosTopEmpleados(pool, empresaId, periodo) {
  const { rows } = await pool.query(
    `SELECT u.nombre, u.rol, COUNT(*)::int AS transacciones, SUM(t.total) AS total_vendido
     FROM (
       SELECT usuario_id, total, fecha FROM ventas WHERE empresa_id = $1
       UNION ALL
       SELECT usuario_id, total, fecha FROM kit_sales WHERE empresa_id = $1
     ) t
     JOIN usuarios u ON u.id = t.usuario_id
     WHERE ${whereFecha('t', periodo)}
     GROUP BY u.id, u.nombre, u.rol
     ORDER BY total_vendido DESC`,
    [empresaId]
  );
  return rows.map(r => ({ ...r, total_vendido: parseFloat(r.total_vendido) }));
}

const REPORTES = {
  inventario: {
    titulo: 'Inventario',
    obtener: (pool, empresaId) => datosInventario(pool, empresaId),
    columnas: [
      { header: 'Código',      key: 'codigo',              width: 14 },
      { header: 'Nombre',      key: 'nombre',              width: 28 },
      { header: 'Categoría',   key: 'categoria',           width: 14 },
      { header: 'Costo',       key: 'costo',               width: 14, money: true },
      { header: '% Ganancia',  key: 'porcentaje_ganancia', width: 12 },
      { header: 'P. Venta',    key: 'precio_venta',        width: 14, money: true },
      { header: 'Stock',       key: 'stock',               width: 10 },
      { header: 'Stock Mín.',  key: 'stock_minimo',        width: 10 },
      { header: 'Proveedor',   key: 'proveedor',           width: 20 }
    ]
  },
  ventas: {
    titulo: 'Ventas',
    obtener: (pool, empresaId, periodo) => datosVentas(pool, empresaId, periodo),
    columnas: [
      { header: 'Fecha',     key: 'fecha',    width: 18, date: true },
      { header: 'Tipo',      key: 'tipo',     width: 10 },
      { header: 'Producto',  key: 'nombre',   width: 26 },
      { header: 'Código',    key: 'codigo',   width: 12 },
      { header: 'Cantidad',  key: 'cantidad', width: 10 },
      { header: 'Vendedor',  key: 'vendedor', width: 18 },
      { header: 'Total',     key: 'total',    width: 14, money: true }
    ]
  },
  gastos: {
    titulo: 'Gastos',
    obtener: (pool, empresaId, periodo) => datosGastos(pool, empresaId, periodo),
    columnas: [
      { header: 'Fecha',       key: 'fecha',      width: 18, date: true },
      { header: 'Concepto',    key: 'concepto',   width: 26 },
      { header: 'Monto',       key: 'monto',      width: 14, money: true },
      { header: 'Recurrente',  key: 'recurrente', width: 12, bool: true },
      { header: 'Notas',       key: 'notas',      width: 26 }
    ]
  },
  'top-empleados': {
    titulo: 'Top Empleados',
    obtener: (pool, empresaId, periodo) => datosTopEmpleados(pool, empresaId, periodo),
    columnas: [
      { header: 'Vendedor',       key: 'nombre',          width: 22 },
      { header: 'Rol',            key: 'rol',             width: 14 },
      { header: 'Transacciones',  key: 'transacciones',   width: 14 },
      { header: 'Total Vendido',  key: 'total_vendido',   width: 16, money: true }
    ]
  }
};

// ─── Render Excel ──────────────────────────────────────────────────────────────

async function enviarExcel(res, tipo, filas, empresaNombre) {
  const { titulo, columnas } = REPORTES[tipo];
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(titulo);

  sheet.columns = columnas.map(c => ({ header: c.header, key: c.key, width: c.width }));
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFB8960C' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A0A0A' } };

  for (const fila of filas) {
    const row = {};
    for (const c of columnas) {
      let v = fila[c.key];
      if (c.date && v) v = new Date(v);
      if (c.bool) v = v ? 'Sí' : 'No';
      row[c.key] = v ?? '';
    }
    sheet.addRow(row);
  }
  columnas.forEach((c, i) => {
    if (c.date) sheet.getColumn(i + 1).numFmt = 'dd/mm/yyyy hh:mm';
    if (c.money) sheet.getColumn(i + 1).numFmt = '#,##0';
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${tipo}-${empresaNombre.replace(/\W+/g, '-')}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}

// ─── Render PDF ────────────────────────────────────────────────────────────────

function formatCell(fila, c) {
  let v = fila[c.key];
  if (c.money) return cop(v);
  if (c.bool) return v ? 'Sí' : 'No';
  if (c.date && v) return new Date(v).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return v == null || v === '' ? '—' : String(v);
}

function enviarPdf(res, tipo, filas, empresaNombre) {
  const { titulo, columnas } = REPORTES[tipo];

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${tipo}-${empresaNombre.replace(/\W+/g, '-')}.pdf"`);

  const doc = new PDFDocument({ margin: 30, size: 'A4', layout: columnas.length > 6 ? 'landscape' : 'portrait' });
  doc.pipe(res);

  doc.fontSize(16).fillColor('#0A0A0A').text(`AuraSistems — ${titulo}`, { continued: false });
  doc.fontSize(10).fillColor('#666666').text(empresaNombre);
  doc.fontSize(9).fillColor('#9A9A9A').text(new Date().toLocaleString('es-CO'));
  doc.moveDown(1);

  const startX = doc.page.margins.left;
  const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const totalWeight = columnas.reduce((s, c) => s + c.width, 0);
  const colWidths = columnas.map(c => (c.width / totalWeight) * usableWidth);
  const rowHeight = 18;

  const drawHeader = y => {
    doc.rect(startX, y, usableWidth, rowHeight).fill('#0A0A0A');
    let x = startX;
    doc.fontSize(8).fillColor('#D4AF37');
    columnas.forEach((c, i) => {
      doc.text(c.header, x + 4, y + 5, { width: colWidths[i] - 8, ellipsis: true });
      x += colWidths[i];
    });
    return y + rowHeight;
  };

  let y = drawHeader(doc.y);

  filas.forEach((fila, idx) => {
    if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = drawHeader(doc.page.margins.top);
    }
    if (idx % 2 === 1) doc.rect(startX, y, usableWidth, rowHeight).fill('#FAFAFA');
    let x = startX;
    doc.fontSize(8).fillColor('#1A1A1A');
    columnas.forEach((c, i) => {
      doc.text(formatCell(fila, c), x + 4, y + 5, { width: colWidths[i] - 8, ellipsis: true });
      x += colWidths[i];
    });
    y += rowHeight;
  });

  if (filas.length === 0) {
    doc.fontSize(10).fillColor('#9A9A9A').text('Sin datos para este período.', startX, y + 10);
  }

  doc.end();
}

async function generarReporte(req, res, tipo) {
  if (!REPORTES[tipo]) return res.status(404).json({ error: 'Reporte no encontrado' });
  const { formato = 'xlsx', periodo = 'todo' } = req.query;
  const { pool } = require('./database');
  try {
    const [filas, empresaR] = await Promise.all([
      REPORTES[tipo].obtener(pool, req.user.empresa_id, periodo),
      pool.query('SELECT nombre FROM empresas WHERE id = $1', [req.user.empresa_id])
    ]);
    const empresaNombre = empresaR.rows[0]?.nombre || 'AuraSistems';
    if (formato === 'pdf') enviarPdf(res, tipo, filas, empresaNombre);
    else await enviarExcel(res, tipo, filas, empresaNombre);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: 'Error al generar el reporte' });
  }
}

module.exports = { generarReporte };
