const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('./database');

const app = express();
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
  filename: (req, file, cb) => {
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

app.get('/api/products', (req, res) => {
  const { search, categoria } = req.query;
  let query = 'SELECT * FROM products WHERE 1=1';
  const params = [];

  if (search) {
    query += ' AND (nombre LIKE ? OR codigo LIKE ? OR proveedor LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (categoria && categoria !== 'Todas') {
    query += ' AND categoria = ?';
    params.push(categoria);
  }
  query += ' ORDER BY fecha_creacion DESC';

  res.json(db.prepare(query).all(...params));
});

app.get('/api/dashboard', (req, res) => {
  const total     = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
  const invertido = db.prepare('SELECT COALESCE(SUM(costo * stock), 0) AS v FROM products').get().v;
  const valorInv  = db.prepare('SELECT COALESCE(SUM(precio_venta * stock), 0) AS v FROM products').get().v;
  const stockBajo = db.prepare('SELECT COUNT(*) AS c FROM products WHERE stock <= stock_minimo').get().c;
  const pesoOro   = db.prepare("SELECT COALESCE(SUM(peso_gramos * stock), 0) AS v FROM products WHERE categoria = 'Oro 18k'").get().v;
  const ventasHoy = db.prepare("SELECT COUNT(*) AS c, COALESCE(SUM(total), 0) AS t FROM ventas WHERE date(fecha) = date('now', 'localtime')").get();

  res.json({
    totalProductos:      total,
    totalInvertido:      invertido,
    valorInventario:     valorInv,
    gananciasPotencial:  valorInv - invertido,
    productosStockBajo:  stockBajo,
    pesoTotalOroGramos:  pesoOro,
    ventasHoy:           ventasHoy.c,
    ingresosHoy:         ventasHoy.t
  });
});

app.post('/api/products', (req, res) => {
  const f = req.body;
  const precio_venta = (f.costo || 0) * (1 + (f.porcentaje_ganancia || 0) / 100);

  try {
    const result = db.prepare(`
      INSERT INTO products
        (nombre, codigo, categoria, descripcion, peso_gramos,
         costo, porcentaje_ganancia, precio_venta, stock, stock_minimo,
         proveedor, notas, imagen_url)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      f.nombre, f.codigo, f.categoria || 'Otro', f.descripcion || null,
      f.peso_gramos || null, f.costo || 0, f.porcentaje_ganancia || 0,
      precio_venta, f.stock || 0, f.stock_minimo || 1,
      f.proveedor || null, f.notas || null, f.imagen_url || null
    );
    res.status(201).json(db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) {
    const msg = err.message.includes('UNIQUE') ? 'El código ya existe' : err.message;
    res.status(400).json({ error: msg });
  }
});

app.put('/api/products/:id', (req, res) => {
  const { id } = req.params;
  const f = req.body;
  const precio_venta = (f.costo || 0) * (1 + (f.porcentaje_ganancia || 0) / 100);

  try {
    db.prepare(`
      UPDATE products SET
        nombre=?, codigo=?, categoria=?, descripcion=?, peso_gramos=?,
        costo=?, porcentaje_ganancia=?, precio_venta=?, stock=?, stock_minimo=?,
        proveedor=?, notas=?, imagen_url=?
      WHERE id=?
    `).run(
      f.nombre, f.codigo, f.categoria || 'Otro', f.descripcion || null,
      f.peso_gramos || null, f.costo || 0, f.porcentaje_ganancia || 0,
      precio_venta, f.stock || 0, f.stock_minimo || 1,
      f.proveedor || null, f.notas || null, f.imagen_url || null, id
    );
    res.json(db.prepare('SELECT * FROM products WHERE id = ?').get(id));
  } catch (err) {
    const msg = err.message.includes('UNIQUE') ? 'El código ya existe' : err.message;
    res.status(400).json({ error: msg });
  }
});

app.delete('/api/products/:id', (req, res) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── Ventas ───────────────────────────────────────────────────────────────────

const registrarVenta = db.transaction((productoId, cantidad, precioUnitario, notas) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(productoId);
  if (!p) throw new Error('Producto no encontrado');
  if (p.stock < cantidad) throw new Error('Stock insuficiente');
  const total = cantidad * precioUnitario;
  const r = db.prepare(
    'INSERT INTO ventas (producto_id, cantidad, precio_unitario, total, notas) VALUES (?,?,?,?,?)'
  ).run(productoId, cantidad, precioUnitario, total, notas || null);
  db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(cantidad, productoId);
  return db.prepare(
    'SELECT v.*, p.nombre, p.codigo FROM ventas v JOIN products p ON p.id = v.producto_id WHERE v.id = ?'
  ).get(r.lastInsertRowid);
});

app.post('/api/ventas', (req, res) => {
  const { producto_id, cantidad, precio_unitario, notas } = req.body;
  if (!producto_id || !cantidad || cantidad < 1) {
    return res.status(400).json({ error: 'Producto y cantidad son requeridos' });
  }
  try {
    const venta = registrarVenta(producto_id, cantidad, precio_unitario, notas);
    res.status(201).json(venta);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/ventas', (req, res) => {
  const { periodo = 'hoy' } = req.query;
  const filtros = {
    hoy:    "date(v.fecha) = date('now', 'localtime')",
    semana: "v.fecha >= datetime('now', 'localtime', '-7 days')",
    mes:    "strftime('%Y-%m', v.fecha) = strftime('%Y-%m', 'now', 'localtime')"
  };
  const where = filtros[periodo] || filtros.hoy;
  const rows = db.prepare(
    `SELECT v.*, p.nombre, p.codigo FROM ventas v
     JOIN products p ON p.id = v.producto_id
     WHERE ${where} ORDER BY v.fecha DESC`
  ).all();
  const agg = db.prepare(
    `SELECT COUNT(*) AS c, COALESCE(SUM(total), 0) AS t FROM ventas v WHERE ${where}`
  ).get();
  res.json({ ventas: rows, totalVentas: agg.c, totalIngresos: agg.t });
});

// ─── Estadísticas por categoría ───────────────────────────────────────────────

app.get('/api/stats/categorias', (req, res) => {
  const rows = db.prepare(`
    SELECT
      categoria,
      COUNT(*) AS cantidad,
      COALESCE(SUM(precio_venta * stock), 0) AS valor_total,
      COALESCE(SUM(costo * stock), 0) AS invertido,
      COALESCE(SUM(peso_gramos * stock), 0) AS peso_total
    FROM products
    GROUP BY categoria
    ORDER BY valor_total DESC
  `).all();
  const totalValor = rows.reduce((s, r) => s + r.valor_total, 0);
  const result = rows.map(r => ({
    ...r,
    porcentaje: totalValor > 0 ? ((r.valor_total / totalValor) * 100).toFixed(1) : '0.0'
  }));
  res.json(result);
});

// ─── CSV Export ───────────────────────────────────────────────────────────────

app.get('/api/export', (req, res) => {
  const products = db.prepare('SELECT * FROM products ORDER BY fecha_creacion DESC').all();

  const headers = [
    'ID','Nombre','Código','Categoría','Descripción','Peso (g)',
    'Costo (COP)','% Ganancia','Precio Venta (COP)','Stock','Stock Mínimo',
    'Proveedor','Notas','Imagen URL','Fecha Creación'
  ];

  const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;

  const rows = products.map(p => [
    p.id, p.nombre, p.codigo, p.categoria, p.descripcion,
    p.peso_gramos, p.costo, p.porcentaje_ganancia, p.precio_venta,
    p.stock, p.stock_minimo, p.proveedor, p.notas, p.imagen_url, p.fecha_creacion
  ].map(escape).join(','));

  const csv = '﻿' + [headers.join(','), ...rows].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=inventario-am18k.csv');
  res.send(csv);
});

// ─── Venta múltiple (carrito) ─────────────────────────────────────────────────

const registrarVentaBulk = db.transaction((items, notasGlobal) => {
  const resultados = [];
  for (const item of items) {
    const { producto_id, cantidad, precio_unitario, notas } = item;
    const p = db.prepare('SELECT * FROM products WHERE id = ?').get(producto_id);
    if (!p) throw new Error(`Producto no encontrado (id ${producto_id})`);
    if (p.stock < cantidad) throw new Error(`Stock insuficiente para "${p.nombre}" (disponible: ${p.stock})`);
    const total = cantidad * precio_unitario;
    const r = db.prepare(
      'INSERT INTO ventas (producto_id, cantidad, precio_unitario, total, notas) VALUES (?,?,?,?,?)'
    ).run(producto_id, cantidad, precio_unitario, total, notas || notasGlobal || null);
    db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(cantidad, producto_id);
    resultados.push(db.prepare(
      'SELECT v.*, p.nombre, p.codigo FROM ventas v JOIN products p ON p.id = v.producto_id WHERE v.id = ?'
    ).get(r.lastInsertRowid));
  }
  return resultados;
});

app.post('/api/ventas/bulk', (req, res) => {
  const { items, notas } = req.body;
  if (!Array.isArray(items) || items.length === 0)
    return res.status(400).json({ error: 'Se requiere al menos un producto' });
  for (const item of items) {
    if (!item.producto_id || !item.cantidad || item.cantidad < 1)
      return res.status(400).json({ error: 'Datos de ítem inválidos' });
  }
  try {
    const ventas = registrarVentaBulk(items, notas);
    res.status(201).json({ ventas, total: ventas.reduce((s, v) => s + v.total, 0) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── SPA fallback ─────────────────────────────────────────────────────────────

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

app.listen(PORT, () => console.log(`AM 18K running on port ${PORT}`));
