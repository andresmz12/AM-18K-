const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');
const { pool, init } = require('./database');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// ─── Upload de imágenes ───────────────────────────────────────────────────────

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

app.use('/uploads', express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo se permiten imágenes'));
  }
});

app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// ─── Products ────────────────────────────────────────────────────────────────

app.get('/api/products', async (req, res) => {
  const { search, categoria } = req.query;
  const params = [];
  let idx   = 1;
  let where = 'WHERE 1=1';

  if (search) {
    where += ` AND (nombre ILIKE $${idx} OR codigo ILIKE $${idx+1} OR proveedor ILIKE $${idx+2})`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    idx += 3;
  }
  if (categoria && categoria !== 'Todas') {
    where += ` AND categoria = $${idx}`;
    params.push(categoria);
  }

  try {
    const { rows } = await pool.query(
      `SELECT * FROM products ${where} ORDER BY fecha_creacion DESC`, params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/dashboard', async (req, res) => {
  try {
    const [total, invertido, valorInv, stockBajo, pesoOro, ventasHoy] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS c FROM products'),
      pool.query('SELECT COALESCE(SUM(costo * stock), 0) AS v FROM products'),
      pool.query('SELECT COALESCE(SUM(precio_venta * stock), 0) AS v FROM products'),
      pool.query('SELECT COUNT(*)::int AS c FROM products WHERE stock <= stock_minimo'),
      pool.query("SELECT COALESCE(SUM(peso_gramos * stock), 0) AS v FROM products WHERE categoria = 'Oro 18k'"),
      pool.query("SELECT COUNT(*)::int AS c, COALESCE(SUM(total), 0) AS t FROM ventas WHERE fecha::date = CURRENT_DATE")
    ]);
    const inv = parseFloat(invertido.rows[0].v);
    const val = parseFloat(valorInv.rows[0].v);
    res.json({
      totalProductos:     total.rows[0].c,
      totalInvertido:     inv,
      valorInventario:    val,
      gananciasPotencial: val - inv,
      productosStockBajo: stockBajo.rows[0].c,
      pesoTotalOroGramos: parseFloat(pesoOro.rows[0].v),
      ventasHoy:          ventasHoy.rows[0].c,
      ingresosHoy:        parseFloat(ventasHoy.rows[0].t)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/products', async (req, res) => {
  const f = req.body;
  const precio_venta = (f.costo || 0) * (1 + (f.porcentaje_ganancia || 0) / 100);
  try {
    const { rows } = await pool.query(`
      INSERT INTO products
        (nombre, codigo, categoria, descripcion, peso_gramos,
         costo, porcentaje_ganancia, precio_venta, stock, stock_minimo,
         proveedor, notas, imagen_url)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *
    `, [
      f.nombre, f.codigo, f.categoria || 'Otro', f.descripcion || null,
      f.peso_gramos || null, f.costo || 0, f.porcentaje_ganancia || 0,
      precio_venta, f.stock || 0, f.stock_minimo || 1,
      f.proveedor || null, f.notas || null, f.imagen_url || null
    ]);
    res.status(201).json(rows[0]);
  } catch (err) {
    const msg = err.code === '23505' ? 'El código ya existe' : err.message;
    res.status(400).json({ error: msg });
  }
});

app.put('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  const f = req.body;
  const precio_venta = (f.costo || 0) * (1 + (f.porcentaje_ganancia || 0) / 100);
  try {
    const { rows } = await pool.query(`
      UPDATE products SET
        nombre=$1, codigo=$2, categoria=$3, descripcion=$4, peso_gramos=$5,
        costo=$6, porcentaje_ganancia=$7, precio_venta=$8, stock=$9, stock_minimo=$10,
        proveedor=$11, notas=$12, imagen_url=$13
      WHERE id=$14
      RETURNING *
    `, [
      f.nombre, f.codigo, f.categoria || 'Otro', f.descripcion || null,
      f.peso_gramos || null, f.costo || 0, f.porcentaje_ganancia || 0,
      precio_venta, f.stock || 0, f.stock_minimo || 1,
      f.proveedor || null, f.notas || null, f.imagen_url || null, id
    ]);
    res.json(rows[0]);
  } catch (err) {
    const msg = err.code === '23505' ? 'El código ya existe' : err.message;
    res.status(400).json({ error: msg });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Ventas ───────────────────────────────────────────────────────────────────

app.get('/api/ventas', async (req, res) => {
  const { periodo = 'hoy' } = req.query;
  const filtros = {
    hoy:    "v.fecha::date = CURRENT_DATE",
    semana: "v.fecha >= NOW() - INTERVAL '7 days'",
    mes:    "DATE_TRUNC('month', v.fecha) = DATE_TRUNC('month', NOW())"
  };
  const where = filtros[periodo] || filtros.hoy;
  try {
    const { rows } = await pool.query(
      `SELECT v.*, p.nombre, p.codigo FROM ventas v
       JOIN products p ON p.id = v.producto_id
       WHERE ${where} ORDER BY v.fecha DESC`
    );
    const agg = await pool.query(
      `SELECT COUNT(*)::int AS c, COALESCE(SUM(total), 0) AS t FROM ventas v WHERE ${where}`
    );
    res.json({ ventas: rows, totalVentas: agg.rows[0].c, totalIngresos: parseFloat(agg.rows[0].t) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Venta múltiple (carrito) ─────────────────────────────────────────────────

app.post('/api/ventas/bulk', async (req, res) => {
  const { items, notas } = req.body;
  if (!Array.isArray(items) || items.length === 0)
    return res.status(400).json({ error: 'Se requiere al menos un producto' });
  for (const item of items) {
    if (!item.producto_id || !item.cantidad || item.cantidad < 1)
      return res.status(400).json({ error: 'Datos de ítem inválidos' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultados = [];
    for (const item of items) {
      const { producto_id, cantidad, precio_unitario } = item;
      const { rows: [p] } = await client.query(
        'SELECT * FROM products WHERE id = $1 FOR UPDATE', [producto_id]
      );
      if (!p) throw new Error(`Producto no encontrado (id ${producto_id})`);
      if (p.stock < cantidad) throw new Error(`Stock insuficiente para "${p.nombre}" (disponible: ${p.stock})`);
      const total = cantidad * precio_unitario;
      const { rows: [venta] } = await client.query(
        `INSERT INTO ventas (producto_id, cantidad, precio_unitario, total, notas)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [producto_id, cantidad, precio_unitario, total, item.notas || notas || null]
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
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ─── Estadísticas por categoría ───────────────────────────────────────────────

app.get('/api/stats/categorias', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        categoria,
        COUNT(*)::int                              AS cantidad,
        COALESCE(SUM(precio_venta * stock), 0)    AS valor_total,
        COALESCE(SUM(costo * stock), 0)           AS invertido,
        COALESCE(SUM(peso_gramos * stock), 0)     AS peso_total
      FROM products
      GROUP BY categoria
      ORDER BY valor_total DESC
    `);
    const totalValor = rows.reduce((s, r) => s + parseFloat(r.valor_total), 0);
    res.json(rows.map(r => ({
      ...r,
      valor_total: parseFloat(r.valor_total),
      invertido:   parseFloat(r.invertido),
      peso_total:  parseFloat(r.peso_total),
      porcentaje:  totalValor > 0 ? ((parseFloat(r.valor_total) / totalValor) * 100).toFixed(1) : '0.0'
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CSV Export ───────────────────────────────────────────────────────────────

app.get('/api/export', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM products ORDER BY fecha_creacion DESC');
    const headers = [
      'ID','Nombre','Código','Categoría','Descripción','Peso (g)',
      'Costo (COP)','% Ganancia','Precio Venta (COP)','Stock','Stock Mínimo',
      'Proveedor','Notas','Imagen URL','Fecha Creación'
    ];
    const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csvRows = rows.map(p => [
      p.id, p.nombre, p.codigo, p.categoria, p.descripcion,
      p.peso_gramos, p.costo, p.porcentaje_ganancia, p.precio_venta,
      p.stock, p.stock_minimo, p.proveedor, p.notas, p.imagen_url, p.fecha_creacion
    ].map(escape).join(','));
    const csv = '﻿' + [headers.join(','), ...csvRows].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=inventario-am18k.csv');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SPA fallback ─────────────────────────────────────────────────────────────

app.get('/health', (req, res) => res.json({ ok: true }));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

app.listen(PORT, () => console.log(`AM 18K running on port ${PORT}`));

init().catch(err => console.error('DB init error:', err));
