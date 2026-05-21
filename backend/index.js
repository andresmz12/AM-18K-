const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend/dist')));

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
  const total        = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
  const invertido    = db.prepare('SELECT COALESCE(SUM(costo * stock), 0) AS v FROM products').get().v;
  const valorInv     = db.prepare('SELECT COALESCE(SUM(precio_venta * stock), 0) AS v FROM products').get().v;
  const stockBajo    = db.prepare('SELECT COUNT(*) AS c FROM products WHERE stock <= stock_minimo').get().c;

  res.json({
    totalProductos:      total,
    totalInvertido:      invertido,
    valorInventario:     valorInv,
    gananciasPotencial:  valorInv - invertido,
    productosStockBajo:  stockBajo
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

// ─── SPA fallback ─────────────────────────────────────────────────────────────

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

app.listen(PORT, () => console.log(`AM 18K running on port ${PORT}`));
