const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { pool, init } = require('./database');
const { hashPassword, comparePassword, signToken, requireAuth, requireGerente, requireSuperadmin } = require('./auth');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
// Las imágenes viajan como base64 dentro del JSON — aumentar límite a 10 MB
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// Oculta campos financieros (costo, ganancia) a usuarios con rol "empleado"
const stripCosts = (row, rol) => {
  if (rol !== 'empleado' || !row) return row;
  const { costo, porcentaje_ganancia, ...rest } = row;
  return rest;
};

// ─── Auth ────────────────────────────────────────────────────────────────────

app.post('/api/auth/signup', async (req, res) => {
  const { empresa_nombre, nombre, email, password } = req.body;
  if (!empresa_nombre || !nombre || !email || !password)
    return res.status(400).json({ error: 'Todos los campos son requeridos' });
  if (password.length < 6)
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [empresa] } = await client.query(
      'INSERT INTO empresas (nombre) VALUES ($1) RETURNING *', [empresa_nombre]
    );
    const password_hash = await hashPassword(password);
    const { rows: [usuario] } = await client.query(
      `INSERT INTO usuarios (empresa_id, nombre, email, password_hash, rol)
       VALUES ($1, $2, $3, $4, 'gerente') RETURNING *`,
      [empresa.id, nombre, email.toLowerCase(), password_hash]
    );
    await client.query('COMMIT');
    const token = signToken(usuario);
    res.status(201).json({
      token,
      user: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol, empresa_id: empresa.id, empresa_nombre: empresa.nombre }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    const msg = err.code === '23505' ? 'Ese correo ya está registrado' : err.message;
    res.status(400).json({ error: msg });
  } finally {
    client.release();
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Correo y contraseña requeridos' });
  try {
    const { rows: [usuario] } = await pool.query(
      `SELECT u.*, e.nombre AS empresa_nombre, e.activa AS empresa_activa FROM usuarios u
       JOIN empresas e ON e.id = u.empresa_id
       WHERE u.email = $1`, [email.toLowerCase()]
    );
    if (!usuario || !usuario.activo) return res.status(401).json({ error: 'Credenciales inválidas' });
    if (usuario.rol !== 'superadmin' && !usuario.empresa_activa)
      return res.status(403).json({ error: 'Esta cuenta está suspendida. Contacta a soporte.' });
    const ok = await comparePassword(password, usuario.password_hash);
    if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });
    const token = signToken(usuario);
    res.json({
      token,
      user: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol, empresa_id: usuario.empresa_id, empresa_nombre: usuario.empresa_nombre }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const { rows: [usuario] } = await pool.query(
      `SELECT u.id, u.nombre, u.email, u.rol, u.empresa_id, e.nombre AS empresa_nombre
       FROM usuarios u JOIN empresas e ON e.id = u.empresa_id
       WHERE u.id = $1 AND u.activo = true`, [req.user.id]
    );
    if (!usuario) return res.status(401).json({ error: 'Usuario no encontrado' });
    res.json({ user: usuario });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Bootstrap del superadmin (uso único, sin necesidad de terminal) ──────────
// Protegido por SETUP_SECRET (variable de entorno). Sin esa variable configurada
// en Railway, esta ruta siempre responde 404 y no hace nada.
app.get('/api/setup/superadmin', async (req, res) => {
  const { secret, nombre, email, password } = req.query;
  if (!process.env.SETUP_SECRET || secret !== process.env.SETUP_SECRET) {
    return res.status(404).send('Not found');
  }
  if (!nombre || !email || !password) return res.status(400).send('Faltan parámetros: nombre, email, password');
  if (String(password).length < 6) return res.status(400).send('La contraseña debe tener al menos 6 caracteres');

  try {
    const NOMBRE_EMPRESA_PLATAFORMA = 'AM 18K — Plataforma';
    let { rows: [empresa] } = await pool.query(
      'SELECT id FROM empresas WHERE nombre = $1 LIMIT 1', [NOMBRE_EMPRESA_PLATAFORMA]
    );
    if (!empresa) {
      ({ rows: [empresa] } = await pool.query(
        'INSERT INTO empresas (nombre) VALUES ($1) RETURNING id', [NOMBRE_EMPRESA_PLATAFORMA]
      ));
    }
    const password_hash = await hashPassword(password);
    await pool.query(
      `INSERT INTO usuarios (empresa_id, nombre, email, password_hash, rol)
       VALUES ($1, $2, $3, $4, 'superadmin')
       ON CONFLICT (email) DO UPDATE SET password_hash = $4, rol = 'superadmin', activo = true`,
      [empresa.id, nombre, String(email).toLowerCase(), password_hash]
    );
    res.send(`Listo. Cuenta de superadmin creada/actualizada para ${email}. Ya puedes iniciar sesión en la app con ese correo. Por seguridad, ahora borra la variable SETUP_SECRET en Railway.`);
  } catch (err) {
    res.status(500).send('Error: ' + err.message);
  }
});

// ─── Todo lo demás requiere sesión iniciada ───────────────────────────────────

app.use('/api', requireAuth);

// ─── Plataforma (solo superadmin — dueños de AM 18K, ven todas las joyerías) ──

app.get('/api/platform/empresas', requireSuperadmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT e.*,
        (SELECT COUNT(*)::int FROM usuarios u WHERE u.empresa_id = e.id) AS total_usuarios,
        (SELECT COUNT(*)::int FROM products p WHERE p.empresa_id = e.id) AS total_productos
      FROM empresas e
      ORDER BY e.fecha_creacion DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/platform/empresas/:id', requireSuperadmin, async (req, res) => {
  const { activa } = req.body;
  if (typeof activa !== 'boolean') return res.status(400).json({ error: 'Campo "activa" requerido' });
  try {
    const { rows } = await pool.query(
      'UPDATE empresas SET activa = $1 WHERE id = $2 RETURNING *', [activa, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Empresa no encontrada' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Usuarios (solo gerente) ───────────────────────────────────────────────────

app.get('/api/users', requireGerente, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, nombre, email, rol, activo, fecha_creacion FROM usuarios WHERE empresa_id = $1 ORDER BY fecha_creacion',
      [req.user.empresa_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', requireGerente, async (req, res) => {
  const { nombre, email, password, rol = 'empleado' } = req.body;
  if (!nombre || !email || !password) return res.status(400).json({ error: 'Nombre, correo y contraseña requeridos' });
  if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  if (!['gerente', 'empleado'].includes(rol)) return res.status(400).json({ error: 'Rol inválido' });
  try {
    const password_hash = await hashPassword(password);
    const { rows: [usuario] } = await pool.query(
      `INSERT INTO usuarios (empresa_id, nombre, email, password_hash, rol)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, nombre, email, rol, activo, fecha_creacion`,
      [req.user.empresa_id, nombre, email.toLowerCase(), password_hash, rol]
    );
    res.status(201).json(usuario);
  } catch (err) {
    const msg = err.code === '23505' ? 'Ese correo ya está registrado' : err.message;
    res.status(400).json({ error: msg });
  }
});

app.delete('/api/users/:id', requireGerente, async (req, res) => {
  const { id } = req.params;
  if (Number(id) === req.user.id) return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });
  try {
    const { rows: [target] } = await pool.query(
      'SELECT * FROM usuarios WHERE id = $1 AND empresa_id = $2', [id, req.user.empresa_id]
    );
    if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (target.rol === 'gerente') {
      const { rows: [{ c }] } = await pool.query(
        "SELECT COUNT(*)::int AS c FROM usuarios WHERE empresa_id = $1 AND rol = 'gerente' AND activo = true",
        [req.user.empresa_id]
      );
      if (c <= 1) return res.status(400).json({ error: 'Debe existir al menos un gerente activo' });
    }
    await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Products ────────────────────────────────────────────────────────────────

app.get('/api/products', async (req, res) => {
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
    res.status(500).json({ error: err.message });
  }
});

// Devuelve un solo producto con imagen completa (para edición)
app.get('/api/products/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM products WHERE id = $1 AND empresa_id = $2', [req.params.id, req.user.empresa_id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(stripCosts(rows[0], req.user.rol));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/dashboard', async (req, res) => {
  const empresaId = req.user.empresa_id;
  try {
    const [total, invertido, valorInv, stockBajo, pesoOro, ventasHoy, kitsHoy] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS c FROM products WHERE empresa_id = $1', [empresaId]),
      pool.query('SELECT COALESCE(SUM(costo * stock), 0) AS v FROM products WHERE empresa_id = $1', [empresaId]),
      pool.query('SELECT COALESCE(SUM(precio_venta * stock), 0) AS v FROM products WHERE empresa_id = $1', [empresaId]),
      pool.query('SELECT COUNT(*)::int AS c FROM products WHERE empresa_id = $1 AND stock <= stock_minimo', [empresaId]),
      pool.query("SELECT COALESCE(SUM(peso_gramos * stock), 0) AS v FROM products WHERE empresa_id = $1 AND categoria = 'Oro 18k'", [empresaId]),
      pool.query("SELECT COUNT(*)::int AS c, COALESCE(SUM(total), 0) AS t FROM ventas WHERE empresa_id = $1 AND fecha::date = CURRENT_DATE", [empresaId]),
      pool.query("SELECT COUNT(*)::int AS c, COALESCE(SUM(total), 0) AS t FROM kit_sales WHERE empresa_id = $1 AND fecha::date = CURRENT_DATE", [empresaId])
    ]);
    const inv = parseFloat(invertido.rows[0].v);
    const val = parseFloat(valorInv.rows[0].v);
    const data = {
      totalProductos:     total.rows[0].c,
      totalInvertido:     inv,
      valorInventario:    val,
      gananciasPotencial: val - inv,
      productosStockBajo: stockBajo.rows[0].c,
      pesoTotalOroGramos: parseFloat(pesoOro.rows[0].v),
      ventasHoy:          ventasHoy.rows[0].c + kitsHoy.rows[0].c,
      ingresosHoy:        parseFloat(ventasHoy.rows[0].t) + parseFloat(kitsHoy.rows[0].t)
    };
    if (req.user.rol !== 'gerente') {
      delete data.totalInvertido;
      delete data.gananciasPotencial;
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Gráficos del dashboard (solo gerente) ────────────────────────────────────

app.get('/api/dashboard/graficos', requireGerente, async (req, res) => {
  const empresaId = req.user.empresa_id;
  try {
    const [ventasPorDia, ventasPorCategoria, topProductos] = await Promise.all([
      pool.query(`
        WITH dias AS (
          SELECT generate_series(CURRENT_DATE - INTERVAL '13 days', CURRENT_DATE, INTERVAL '1 day')::date AS dia
        )
        SELECT
          d.dia,
          COALESCE((SELECT SUM(total) FROM ventas     WHERE empresa_id = $1 AND fecha::date = d.dia), 0) +
          COALESCE((SELECT SUM(total) FROM kit_sales  WHERE empresa_id = $1 AND fecha::date = d.dia), 0) AS total
        FROM dias d
        ORDER BY d.dia
      `, [empresaId]),
      pool.query(`
        SELECT p.categoria, COALESCE(SUM(v.total), 0) AS total
        FROM ventas v JOIN products p ON p.id = v.producto_id
        WHERE v.empresa_id = $1 AND v.fecha >= NOW() - INTERVAL '30 days'
        GROUP BY p.categoria ORDER BY total DESC
      `, [empresaId]),
      pool.query(`
        SELECT p.nombre, p.codigo, SUM(v.cantidad)::int AS unidades, SUM(v.total) AS ingresos
        FROM ventas v JOIN products p ON p.id = v.producto_id
        WHERE v.empresa_id = $1 AND v.fecha >= NOW() - INTERVAL '30 days'
        GROUP BY p.id, p.nombre, p.codigo
        ORDER BY unidades DESC LIMIT 5
      `, [empresaId])
    ]);
    res.json({
      ventasPorDia: ventasPorDia.rows.map(r => ({ dia: r.dia, total: parseFloat(r.total) })),
      ventasPorCategoria: ventasPorCategoria.rows.map(r => ({ categoria: r.categoria, total: parseFloat(r.total) })),
      topProductos: topProductos.rows.map(r => ({ ...r, ingresos: parseFloat(r.ingresos) }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/products', requireGerente, async (req, res) => {
  const f = req.body;
  const precio_venta = (f.costo || 0) * (1 + (f.porcentaje_ganancia || 0) / 100);
  try {
    const { rows } = await pool.query(`
      INSERT INTO products
        (empresa_id, nombre, codigo, categoria, descripcion, peso_gramos,
         costo, porcentaje_ganancia, precio_venta, stock, stock_minimo,
         proveedor, notas, imagen_url)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
    `, [
      req.user.empresa_id, f.nombre, f.codigo, f.categoria || 'Otro', f.descripcion || null,
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

app.put('/api/products/:id', requireGerente, async (req, res) => {
  const { id } = req.params;
  const f = req.body;
  const precio_venta = (f.costo || 0) * (1 + (f.porcentaje_ganancia || 0) / 100);
  try {
    const { rows } = await pool.query(`
      UPDATE products SET
        nombre=$1, codigo=$2, categoria=$3, descripcion=$4, peso_gramos=$5,
        costo=$6, porcentaje_ganancia=$7, precio_venta=$8, stock=$9, stock_minimo=$10,
        proveedor=$11, notas=$12, imagen_url=$13
      WHERE id=$14 AND empresa_id=$15
      RETURNING *
    `, [
      f.nombre, f.codigo, f.categoria || 'Otro', f.descripcion || null,
      f.peso_gramos || null, f.costo || 0, f.porcentaje_ganancia || 0,
      precio_venta, f.stock || 0, f.stock_minimo || 1,
      f.proveedor || null, f.notas || null, f.imagen_url || null, id, req.user.empresa_id
    ]);
    if (!rows[0]) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    const msg = err.code === '23505' ? 'El código ya existe' : err.message;
    res.status(400).json({ error: msg });
  }
});

app.delete('/api/products/:id', requireGerente, async (req, res) => {
  try {
    await pool.query('DELETE FROM products WHERE id = $1 AND empresa_id = $2', [req.params.id, req.user.empresa_id]);
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
       WHERE v.empresa_id = $1 AND ${where} ORDER BY v.fecha DESC`,
      [req.user.empresa_id]
    );
    const agg = await pool.query(
      `SELECT COUNT(*)::int AS c, COALESCE(SUM(total), 0) AS t FROM ventas v WHERE v.empresa_id = $1 AND ${where}`,
      [req.user.empresa_id]
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
    if (!item.producto_id || !Number.isInteger(item.cantidad) || item.cantidad < 1)
      return res.status(400).json({ error: 'Datos de ítem inválidos' });
    if (typeof item.precio_unitario !== 'number' || item.precio_unitario < 0)
      return res.status(400).json({ error: 'Precio unitario inválido' });
  }

  const empresaId = req.user.empresa_id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultados = [];
    for (const item of items) {
      const { producto_id, cantidad, precio_unitario } = item;
      const { rows: [p] } = await client.query(
        'SELECT * FROM products WHERE id = $1 AND empresa_id = $2 FOR UPDATE', [producto_id, empresaId]
      );
      if (!p) throw new Error(`Producto no encontrado (id ${producto_id})`);
      if (p.stock < cantidad) throw new Error(`Stock insuficiente para "${p.nombre}" (disponible: ${p.stock})`);
      const total = cantidad * precio_unitario;
      const { rows: [venta] } = await client.query(
        `INSERT INTO ventas (empresa_id, producto_id, cantidad, precio_unitario, total, notas)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [empresaId, producto_id, cantidad, precio_unitario, total, item.notas || notas || null]
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

// ─── Kit Sales (Manillas y Composiciones) ─────────────────────────────────────

app.get('/api/kit-sales', async (req, res) => {
  const { periodo = 'hoy' } = req.query;
  const filtros = {
    hoy:    "fecha::date = CURRENT_DATE",
    semana: "fecha >= NOW() - INTERVAL '7 days'",
    mes:    "DATE_TRUNC('month', fecha) = DATE_TRUNC('month', NOW())"
  };
  const where = filtros[periodo] || filtros.hoy;
  try {
    const { rows } = await pool.query(
      `SELECT * FROM kit_sales WHERE empresa_id = $1 AND ${where} ORDER BY fecha DESC`,
      [req.user.empresa_id]
    );
    const agg = await pool.query(
      `SELECT COUNT(*)::int AS c, COALESCE(SUM(total), 0) AS t FROM kit_sales WHERE empresa_id = $1 AND ${where}`,
      [req.user.empresa_id]
    );
    res.json({ kit_sales: rows, totalVentas: agg.rows[0].c, totalIngresos: parseFloat(agg.rows[0].t) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/kit-sales', async (req, res) => {
  const { nombre_kit, componentes, mano_obra, valor_extra, cliente, notas } = req.body;
  const empresaId = req.user.empresa_id;

  if (!nombre_kit) return res.status(400).json({ error: 'Nombre del kit requerido' });
  if (!Array.isArray(componentes) || componentes.length === 0)
    return res.status(400).json({ error: 'Al menos un componente es requerido' });
  for (const comp of componentes) {
    if (!comp.producto_id || !Number.isInteger(comp.cantidad) || comp.cantidad < 1)
      return res.status(400).json({ error: 'Datos de componente inválidos' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Validar stock de todos los componentes
    let totalComponentes = 0;
    for (const comp of componentes) {
      const { rows: [p] } = await client.query(
        'SELECT * FROM products WHERE id = $1 AND empresa_id = $2 FOR UPDATE', [comp.producto_id, empresaId]
      );
      if (!p) throw new Error(`Producto no encontrado (id ${comp.producto_id})`);
      if (p.stock < comp.cantidad)
        throw new Error(`Stock insuficiente para "${p.nombre}" (disponible: ${p.stock})`);
      totalComponentes += p.precio_venta * comp.cantidad;
    }

    // Descontar stock de todos los componentes
    for (const comp of componentes) {
      await client.query(
        'UPDATE products SET stock = stock - $1 WHERE id = $2',
        [comp.cantidad, comp.producto_id]
      );
    }

    // Calcular total (componentes + mano de obra + extra)
    const total = totalComponentes + (mano_obra || 0) + (valor_extra || 0);

    // Guardar la venta del kit
    const { rows: [kitSale] } = await client.query(
      `INSERT INTO kit_sales (empresa_id, nombre_kit, componentes, mano_obra, valor_extra, total, cliente, notas)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [empresaId, nombre_kit, JSON.stringify(componentes), mano_obra || 0, valor_extra || 0, total, cliente || null, notas || null]
    );

    await client.query('COMMIT');
    res.status(201).json(kitSale);
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
      WHERE empresa_id = $1
      GROUP BY categoria
      ORDER BY valor_total DESC
    `, [req.user.empresa_id]);
    const totalValor = rows.reduce((s, r) => s + parseFloat(r.valor_total), 0);
    const mapped = rows.map(r => ({
      ...r,
      valor_total: parseFloat(r.valor_total),
      invertido:   parseFloat(r.invertido),
      peso_total:  parseFloat(r.peso_total),
      porcentaje:  totalValor > 0 ? ((parseFloat(r.valor_total) / totalValor) * 100).toFixed(1) : '0.0'
    }));
    if (req.user.rol !== 'gerente') mapped.forEach(r => delete r.invertido);
    res.json(mapped);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CSV Export (solo gerente — incluye costos) ───────────────────────────────

app.get('/api/export', requireGerente, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM products WHERE empresa_id = $1 ORDER BY fecha_creacion DESC', [req.user.empresa_id]
    );
    const headers = [
      'ID','Nombre','Código','Categoría','Descripción','Peso (g)',
      'Costo (COP)','% Ganancia','Precio Venta (COP)','Stock','Stock Mínimo',
      'Proveedor','Notas','Imagen URL','Fecha Creación'
    ];
    const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
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
    res.setHeader('Content-Disposition', 'attachment; filename=inventario-am18k.csv');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Cotizaciones ─────────────────────────────────────────────────────────────

app.get('/api/cotizaciones', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM cotizaciones WHERE empresa_id = $1 ORDER BY fecha DESC', [req.user.empresa_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/cotizaciones', async (req, res) => {
  const { cliente, items, total, notas } = req.body;
  if (!Array.isArray(items) || items.length === 0)
    return res.status(400).json({ error: 'La cotización está vacía' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO cotizaciones (empresa_id, cliente, items, total, notas)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.empresa_id, cliente || null, JSON.stringify(items), total || 0, notas || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/cotizaciones/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM cotizaciones WHERE id = $1 AND empresa_id = $2', [req.params.id, req.user.empresa_id]);
    res.json({ ok: true });
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

if (!process.env.JWT_SECRET) {
  console.warn('⚠ JWT_SECRET no está configurado — usando un valor por defecto inseguro. Configúralo en las variables de entorno antes de desplegar a producción.');
}

init().catch(err => console.error('DB init error:', err));
