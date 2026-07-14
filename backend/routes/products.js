const express = require('express');
const { pool } = require('../database');
const { requireGerente } = require('../auth');
const V = require('../validate');
const { serverError, stripCosts } = require('../helpers');

const router = express.Router();

// ─── Products ────────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  const { search, categoria } = req.query;
  const params = [req.user.empresa_id];
  let idx   = 2;
  let where = 'WHERE empresa_id = $1';

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
    // imagen_url puede ser base64 largo — se devuelve completo para mostrar thumbnails
    // pero se omite en el SELECT de dashboard para no sobrecargar esa llamada
    const { rows } = await pool.query(
      `SELECT id, nombre, codigo, categoria, descripcion, peso_gramos,
              costo, porcentaje_ganancia, precio_venta, stock, stock_minimo,
              proveedor, notas, imagen_url, fecha_creacion
       FROM products ${where} ORDER BY fecha_creacion DESC`, params
    );
    res.json(rows.map(r => stripCosts(r, req.user.rol)));
  } catch (err) {
    serverError(res, err);
  }
});

// Devuelve un solo producto con imagen completa (para edición)
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM products WHERE id = $1 AND empresa_id = $2', [req.params.id, req.user.empresa_id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(stripCosts(rows[0], req.user.rol));
  } catch (err) {
    serverError(res, err);
  }
});

// Valida y normaliza el cuerpo de producto; devuelve {error} o {valores}
function validarProducto(f) {
  const nombre = V.str(f.nombre, 200);
  const codigo = V.str(f.codigo, 60);
  if (!nombre || !codigo) return { error: 'Nombre y código son requeridos' };
  const costo  = V.num(f.costo ?? 0);
  const pct    = V.num(f.porcentaje_ganancia ?? 0, { max: 10000 });
  const peso   = f.peso_gramos == null || f.peso_gramos === '' ? null : V.num(f.peso_gramos, { max: 1e6 });
  const stock  = V.int(f.stock ?? 0);
  const stockMin = V.int(f.stock_minimo ?? 1);
  if (costo === null || pct === null) return { error: 'Costo y % de ganancia deben ser números positivos' };
  if (peso === undefined) return { error: 'Peso inválido' };
  if (stock === null || stockMin === null) return { error: 'Stock y stock mínimo deben ser enteros positivos' };
  const descripcion = V.optStr(f.descripcion, 2000);
  const proveedor   = V.optStr(f.proveedor, 200);
  const notas       = V.optStr(f.notas, 2000);
  const imagen_url  = V.imagen(f.imagen_url);
  if (descripcion === undefined || proveedor === undefined || notas === undefined) return { error: 'Texto demasiado largo' };
  if (imagen_url === undefined) return { error: 'Imagen inválida (debe ser una foto o una URL http/https)' };
  return {
    nombre, codigo, categoria: V.str(f.categoria, 60) || 'Otro', descripcion,
    peso_gramos: peso, costo, porcentaje_ganancia: pct,
    precio_venta: costo * (1 + pct / 100),
    stock, stock_minimo: stockMin, proveedor, notas, imagen_url
  };
}

router.post('/', requireGerente, async (req, res) => {
  const f = validarProducto(req.body);
  if (f.error) return res.status(400).json({ error: f.error });
  try {
    const { rows } = await pool.query(`
      INSERT INTO products
        (empresa_id, nombre, codigo, categoria, descripcion, peso_gramos,
         costo, porcentaje_ganancia, precio_venta, stock, stock_minimo,
         proveedor, notas, imagen_url)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
    `, [
      req.user.empresa_id, f.nombre, f.codigo, f.categoria, f.descripcion,
      f.peso_gramos, f.costo, f.porcentaje_ganancia,
      f.precio_venta, f.stock, f.stock_minimo,
      f.proveedor, f.notas, f.imagen_url
    ]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code !== '23505') console.error(err);
    const msg = err.code === '23505' ? 'El código ya existe' : 'Error al procesar la solicitud';
    res.status(400).json({ error: msg });
  }
});

router.put('/:id', requireGerente, async (req, res) => {
  const { id } = req.params;
  const f = validarProducto(req.body);
  if (f.error) return res.status(400).json({ error: f.error });
  try {
    const { rows } = await pool.query(`
      UPDATE products SET
        nombre=$1, codigo=$2, categoria=$3, descripcion=$4, peso_gramos=$5,
        costo=$6, porcentaje_ganancia=$7, precio_venta=$8, stock=$9, stock_minimo=$10,
        proveedor=$11, notas=$12, imagen_url=$13
      WHERE id=$14 AND empresa_id=$15
      RETURNING *
    `, [
      f.nombre, f.codigo, f.categoria, f.descripcion,
      f.peso_gramos, f.costo, f.porcentaje_ganancia,
      f.precio_venta, f.stock, f.stock_minimo,
      f.proveedor, f.notas, f.imagen_url, id, req.user.empresa_id
    ]);
    if (!rows[0]) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code !== '23505') console.error(err);
    const msg = err.code === '23505' ? 'El código ya existe' : 'Error al procesar la solicitud';
    res.status(400).json({ error: msg });
  }
});

router.delete('/:id', requireGerente, async (req, res) => {
  try {
    await pool.query('DELETE FROM products WHERE id = $1 AND empresa_id = $2', [req.params.id, req.user.empresa_id]);
    res.json({ ok: true });
  } catch (err) {
    if (err.code === '23503')
      return res.status(400).json({ error: 'No se puede eliminar: este producto tiene ventas registradas.' });
    serverError(res, err);
  }
});

module.exports = router;
