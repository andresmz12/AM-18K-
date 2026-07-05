const express = require('express');
const helmet  = require('helmet');
const rateLimit = require('express-rate-limit');
const path    = require('path');
const { pool, init } = require('./database');
const { hashPassword, comparePassword, signToken, safeEqual, requireAuth, requireGerente, requireSuperadmin } = require('./auth');
const { generarReporte } = require('./reports');
const V = require('./validate');

const app  = express();
const PORT = process.env.PORT || 3000;

// Railway corre detrás de un proxy — necesario para que req.ip sea la IP real
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      // Las fotos de producto pueden ser base64 (data:) o URLs externas
      'img-src': ["'self'", 'data:', 'https:', 'http:']
    }
  }
}));

// Frontend y API comparten origen (el backend sirve el build) — no se necesita CORS.
// Las imágenes viajan como base64 dentro del JSON — aumentar límite a 10 MB
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// Límite de intentos para login/registro/setup — frena fuerza bruta de contraseñas
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.' }
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);
app.use('/api/setup', authLimiter);

// Los errores internos se registran en el log pero nunca se envían al cliente
const serverError = (res, err) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
};

// Error de negocio: su mensaje SÍ es seguro de mostrar al usuario
const bizError = msg => Object.assign(new Error(msg), { biz: true });

// Oculta campos financieros (costo, ganancia) a usuarios con rol "empleado"
const stripCosts = (row, rol) => {
  if (rol !== 'empleado' || !row) return row;
  const { costo, porcentaje_ganancia, ...rest } = row;
  return rest;
};

// ─── Auth ────────────────────────────────────────────────────────────────────

app.post('/api/auth/signup', async (req, res) => {
  const empresa_nombre = V.str(req.body.empresa_nombre, 120);
  const nombre         = V.str(req.body.nombre, 120);
  const email          = V.email(req.body.email);
  const password       = V.password(req.body.password);
  if (!empresa_nombre || !nombre) return res.status(400).json({ error: 'Nombre de la joyería y tu nombre son requeridos' });
  if (!email) return res.status(400).json({ error: 'Correo electrónico inválido' });
  if (!password) return res.status(400).json({ error: 'La contraseña debe tener entre 6 y 100 caracteres' });

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
      [empresa.id, nombre, email, password_hash]
    );
    await client.query('COMMIT');
    const token = signToken(usuario);
    res.status(201).json({
      token,
      user: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol, empresa_id: empresa.id, empresa_nombre: empresa.nombre }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code !== '23505') console.error(err);
    const msg = err.code === '23505' ? 'Ese correo ya está registrado' : 'Error al procesar la solicitud';
    res.status(400).json({ error: msg });
  } finally {
    client.release();
  }
});

app.post('/api/auth/login', async (req, res) => {
  const email = V.email(req.body.email);
  const password = typeof req.body.password === 'string' ? req.body.password : null;
  if (!email || !password) return res.status(400).json({ error: 'Correo y contraseña requeridos' });
  try {
    const { rows: [usuario] } = await pool.query(
      `SELECT u.*, e.nombre AS empresa_nombre, e.activa AS empresa_activa FROM usuarios u
       JOIN empresas e ON e.id = u.empresa_id
       WHERE u.email = $1`, [email]
    );
    if (!usuario || !usuario.activo) return res.status(401).json({ error: 'Credenciales inválidas' });
    const ok = await comparePassword(password, usuario.password_hash);
    if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });
    // Solo después de validar la contraseña se revela el estado de suspensión
    if (usuario.rol !== 'superadmin' && !usuario.empresa_activa)
      return res.status(403).json({ error: 'Esta cuenta está suspendida. Contacta a soporte.' });
    const token = signToken(usuario);
    res.json({
      token,
      user: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol, empresa_id: usuario.empresa_id, empresa_nombre: usuario.empresa_nombre }
    });
  } catch (err) {
    serverError(res, err);
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
    serverError(res, err);
  }
});

// ─── Bootstrap del superadmin (uso único, sin necesidad de terminal) ──────────
// Protegido por SETUP_SECRET (variable de entorno). Sin esa variable configurada
// en Railway, esta ruta siempre responde 404 y no hace nada.
app.get('/api/setup/superadmin', async (req, res) => {
  const { secret, nombre, email, password } = req.query;
  if (!process.env.SETUP_SECRET || !secret || !safeEqual(secret, process.env.SETUP_SECRET)) {
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
    console.error(err);
    res.status(500).send('Error interno');
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
    serverError(res, err);
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
    serverError(res, err);
  }
});

// Crea una joyería nueva junto con su primer usuario gerente (alta asistida por el superadmin)
app.post('/api/platform/empresas', requireSuperadmin, async (req, res) => {
  const empresa_nombre = V.str(req.body.empresa_nombre, 120);
  const nombre         = V.str(req.body.nombre, 120);
  const email          = V.email(req.body.email);
  const password       = V.password(req.body.password);
  if (!empresa_nombre || !nombre) return res.status(400).json({ error: 'Todos los campos son requeridos' });
  if (!email) return res.status(400).json({ error: 'Correo electrónico inválido' });
  if (!password) return res.status(400).json({ error: 'La contraseña debe tener entre 6 y 100 caracteres' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [empresa] } = await client.query(
      'INSERT INTO empresas (nombre) VALUES ($1) RETURNING *', [empresa_nombre]
    );
    const password_hash = await hashPassword(password);
    await client.query(
      `INSERT INTO usuarios (empresa_id, nombre, email, password_hash, rol)
       VALUES ($1, $2, $3, $4, 'gerente')`,
      [empresa.id, nombre, email, password_hash]
    );
    await client.query('COMMIT');
    res.status(201).json({ ...empresa, total_usuarios: 1, total_productos: 0 });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code !== '23505') console.error(err);
    const msg = err.code === '23505' ? 'Ese correo ya está registrado' : 'Error al procesar la solicitud';
    res.status(400).json({ error: msg });
  } finally {
    client.release();
  }
});

app.get('/api/platform/empresas/:id/usuarios', requireSuperadmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, nombre, email, rol, activo, fecha_creacion FROM usuarios WHERE empresa_id = $1 ORDER BY fecha_creacion',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    serverError(res, err);
  }
});

// Crea un usuario (gerente o empleado) dentro de cualquier joyería existente
app.post('/api/platform/empresas/:id/usuarios', requireSuperadmin, async (req, res) => {
  const nombre   = V.str(req.body.nombre, 120);
  const email    = V.email(req.body.email);
  const password = V.password(req.body.password);
  const rol      = req.body.rol || 'empleado';
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
  if (!email) return res.status(400).json({ error: 'Correo electrónico inválido' });
  if (!password) return res.status(400).json({ error: 'La contraseña debe tener entre 6 y 100 caracteres' });
  if (!['gerente', 'empleado'].includes(rol)) return res.status(400).json({ error: 'Rol inválido' });
  try {
    const { rows: [empresa] } = await pool.query('SELECT id FROM empresas WHERE id = $1', [req.params.id]);
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });
    const password_hash = await hashPassword(password);
    const { rows: [usuario] } = await pool.query(
      `INSERT INTO usuarios (empresa_id, nombre, email, password_hash, rol)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, nombre, email, rol, activo, fecha_creacion`,
      [req.params.id, nombre, email, password_hash, rol]
    );
    res.status(201).json(usuario);
  } catch (err) {
    if (err.code !== '23505') console.error(err);
    const msg = err.code === '23505' ? 'Ese correo ya está registrado' : 'Error al procesar la solicitud';
    res.status(400).json({ error: msg });
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
    serverError(res, err);
  }
});

app.post('/api/users', requireGerente, async (req, res) => {
  const nombre   = V.str(req.body.nombre, 120);
  const email    = V.email(req.body.email);
  const password = V.password(req.body.password);
  const rol      = req.body.rol || 'empleado';
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
  if (!email) return res.status(400).json({ error: 'Correo electrónico inválido' });
  if (!password) return res.status(400).json({ error: 'La contraseña debe tener entre 6 y 100 caracteres' });
  if (!['gerente', 'empleado'].includes(rol)) return res.status(400).json({ error: 'Rol inválido' });
  try {
    const password_hash = await hashPassword(password);
    const { rows: [usuario] } = await pool.query(
      `INSERT INTO usuarios (empresa_id, nombre, email, password_hash, rol)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, nombre, email, rol, activo, fecha_creacion`,
      [req.user.empresa_id, nombre, email, password_hash, rol]
    );
    res.status(201).json(usuario);
  } catch (err) {
    if (err.code !== '23505') console.error(err);
    const msg = err.code === '23505' ? 'Ese correo ya está registrado' : 'Error al procesar la solicitud';
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
    serverError(res, err);
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
    serverError(res, err);
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
    serverError(res, err);
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
    serverError(res, err);
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

app.post('/api/products', requireGerente, async (req, res) => {
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

app.put('/api/products/:id', requireGerente, async (req, res) => {
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

app.delete('/api/products/:id', requireGerente, async (req, res) => {
  try {
    await pool.query('DELETE FROM products WHERE id = $1 AND empresa_id = $2', [req.params.id, req.user.empresa_id]);
    res.json({ ok: true });
  } catch (err) {
    serverError(res, err);
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
    serverError(res, err);
  }
});

// ─── Venta múltiple (carrito) ─────────────────────────────────────────────────

app.post('/api/ventas/bulk', async (req, res) => {
  const { items, notas } = req.body;
  if (!Array.isArray(items) || items.length === 0 || items.length > 200)
    return res.status(400).json({ error: 'Se requiere entre 1 y 200 productos' });
  for (const item of items) {
    if (!item.producto_id || V.int(item.cantidad, { min: 1, max: 100000 }) === null)
      return res.status(400).json({ error: 'Datos de ítem inválidos' });
    if (V.num(item.precio_unitario) === null)
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
      if (!p) throw bizError(`Producto no encontrado (id ${producto_id})`);
      if (p.stock < cantidad) throw bizError(`Stock insuficiente para "${p.nombre}" (disponible: ${p.stock})`);
      const total = cantidad * precio_unitario;
      const { rows: [venta] } = await client.query(
        `INSERT INTO ventas (empresa_id, producto_id, cantidad, precio_unitario, total, notas, usuario_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [empresaId, producto_id, cantidad, precio_unitario, total, item.notas || notas || null, req.user.id]
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
    if (err.biz) return res.status(400).json({ error: err.message });
    serverError(res, err);
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
    serverError(res, err);
  }
});

app.post('/api/kit-sales', async (req, res) => {
  const nombre_kit = V.str(req.body.nombre_kit, 200);
  const { componentes } = req.body;
  const mano_obra   = V.num(req.body.mano_obra ?? 0);
  const valor_extra = V.num(req.body.valor_extra ?? 0);
  const cliente     = V.optStr(req.body.cliente, 200);
  const notas       = V.optStr(req.body.notas, 2000);
  const empresaId = req.user.empresa_id;

  if (!nombre_kit) return res.status(400).json({ error: 'Nombre del kit requerido' });
  if (mano_obra === null || valor_extra === null)
    return res.status(400).json({ error: 'Mano de obra y valor extra deben ser números positivos' });
  if (cliente === undefined || notas === undefined)
    return res.status(400).json({ error: 'Texto demasiado largo' });
  if (!Array.isArray(componentes) || componentes.length === 0 || componentes.length > 200)
    return res.status(400).json({ error: 'Se requiere entre 1 y 200 componentes' });
  for (const comp of componentes) {
    if (!comp.producto_id || V.int(comp.cantidad, { min: 1, max: 100000 }) === null)
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
      if (!p) throw bizError(`Producto no encontrado (id ${comp.producto_id})`);
      if (p.stock < comp.cantidad)
        throw bizError(`Stock insuficiente para "${p.nombre}" (disponible: ${p.stock})`);
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
    const total = totalComponentes + mano_obra + valor_extra;

    // Guardar la venta del kit
    const { rows: [kitSale] } = await client.query(
      `INSERT INTO kit_sales (empresa_id, nombre_kit, componentes, mano_obra, valor_extra, total, cliente, notas, usuario_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [empresaId, nombre_kit, JSON.stringify(componentes), mano_obra, valor_extra, total, cliente, notas, req.user.id]
    );

    await client.query('COMMIT');
    res.status(201).json(kitSale);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.biz) return res.status(400).json({ error: err.message });
    serverError(res, err);
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
    serverError(res, err);
  }
});

// ─── Reportes (solo gerente) — Excel o PDF ─────────────────────────────────────

app.get('/api/reportes/:tipo', requireGerente, (req, res) => generarReporte(req, res, req.params.tipo));

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
    res.setHeader('Content-Disposition', 'attachment; filename=inventario-am18k.csv');
    res.send(csv);
  } catch (err) {
    serverError(res, err);
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
    serverError(res, err);
  }
});

app.post('/api/cotizaciones', async (req, res) => {
  const { items } = req.body;
  const cliente = V.optStr(req.body.cliente, 200);
  const notas   = V.optStr(req.body.notas, 2000);
  const total   = V.num(req.body.total ?? 0);
  if (!Array.isArray(items) || items.length === 0 || items.length > 200)
    return res.status(400).json({ error: 'La cotización debe tener entre 1 y 200 ítems' });
  if (total === null) return res.status(400).json({ error: 'Total inválido' });
  if (cliente === undefined || notas === undefined) return res.status(400).json({ error: 'Texto demasiado largo' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO cotizaciones (empresa_id, cliente, items, total, notas)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.empresa_id, cliente, JSON.stringify(items), total, notas]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    serverError(res, err);
  }
});

app.delete('/api/cotizaciones/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM cotizaciones WHERE id = $1 AND empresa_id = $2', [req.params.id, req.user.empresa_id]);
    res.json({ ok: true });
  } catch (err) {
    serverError(res, err);
  }
});

// ─── Gastos ───────────────────────────────────────────────────────────────────

app.get('/api/gastos', async (req, res) => {
  const { periodo = 'hoy' } = req.query;
  const filtros = {
    hoy:    "fecha::date = CURRENT_DATE",
    semana: "fecha >= NOW() - INTERVAL '7 days'",
    mes:    "DATE_TRUNC('month', fecha) = DATE_TRUNC('month', NOW())"
  };
  const where = filtros[periodo] || filtros.hoy;
  try {
    const { rows } = await pool.query(
      `SELECT id, empresa_id, concepto, monto, recurrente, imagen_url, notas, fecha
       FROM gastos WHERE empresa_id = $1 AND ${where} ORDER BY fecha DESC`,
      [req.user.empresa_id]
    );
    res.json({ gastos: rows, total: rows.reduce((s, g) => s + g.monto, 0) });
  } catch (err) {
    serverError(res, err);
  }
});

app.post('/api/gastos', async (req, res) => {
  const concepto   = V.str(req.body.concepto, 200);
  const monto      = V.num(req.body.monto, { min: 0.01 });
  const notas      = V.optStr(req.body.notas, 2000);
  const imagen_url = V.imagen(req.body.imagen_url);
  if (!concepto || monto === null)
    return res.status(400).json({ error: 'Concepto y monto (mayor a 0) son requeridos' });
  if (notas === undefined) return res.status(400).json({ error: 'Texto demasiado largo' });
  if (imagen_url === undefined) return res.status(400).json({ error: 'Imagen inválida' });
  try {
    const { rows: [gasto] } = await pool.query(
      `INSERT INTO gastos (empresa_id, concepto, monto, recurrente, imagen_url, notas)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.user.empresa_id, concepto, monto, !!req.body.recurrente, imagen_url, notas]
    );
    res.status(201).json(gasto);
  } catch (err) {
    serverError(res, err);
  }
});

app.delete('/api/gastos/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM gastos WHERE id = $1 AND empresa_id = $2', [req.params.id, req.user.empresa_id]);
    res.json({ ok: true });
  } catch (err) {
    serverError(res, err);
  }
});

// ─── Cuentas por Cobrar ─────────────────────────────────────────────────────────
// Cada cuenta representa una deuda de un cliente; los abonos se aplican contra
// ella hasta saldarla (saldo = monto_total - suma de abonos).

app.get('/api/cuentas-por-cobrar', async (req, res) => {
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

app.post('/api/cuentas-por-cobrar', async (req, res) => {
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

app.get('/api/cuentas-por-cobrar/:id', async (req, res) => {
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

app.delete('/api/cuentas-por-cobrar/:id', requireGerente, async (req, res) => {
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

app.post('/api/cuentas-por-cobrar/:id/abonos', async (req, res) => {
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

app.delete('/api/abonos/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM abonos WHERE id = $1 AND empresa_id = $2', [req.params.id, req.user.empresa_id]);
    res.json({ ok: true });
  } catch (err) {
    serverError(res, err);
  }
});

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

app.get('/api/cierres', async (req, res) => {
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

app.get('/api/cierres/hoy', async (req, res) => {
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

app.post('/api/cierres', async (req, res) => {
  const apertura        = V.num(req.body.apertura);
  const dinero_efectivo = V.num(req.body.dinero_efectivo);
  const dinero_cuenta   = V.num(req.body.dinero_cuenta);
  const notas           = V.optStr(req.body.notas, 2000);
  const empresaId = req.user.empresa_id;
  if (apertura === null || dinero_efectivo === null || dinero_cuenta === null)
    return res.status(400).json({ error: 'Apertura, efectivo y cuenta deben ser números positivos' });
  if (notas === undefined) return res.status(400).json({ error: 'Texto demasiado largo' });
  try {
    const { ventas, gastos, abonos } = await resumenDelDia(empresaId);
    const total_esperado = apertura + ventas + abonos - gastos;
    const diferencia = (dinero_efectivo + dinero_cuenta) - total_esperado;

    const { rows: [cierre] } = await pool.query(
      `INSERT INTO cierres_caja
        (empresa_id, usuario_id, apertura, ventas, abonos, gastos, total_esperado, dinero_efectivo, dinero_cuenta, diferencia, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [empresaId, req.user.id, apertura, ventas, abonos, gastos, total_esperado, dinero_efectivo, dinero_cuenta, diferencia, notas]
    );
    res.status(201).json(cierre);
  } catch (err) {
    if (err.code !== '23505') console.error(err);
    const msg = err.code === '23505' ? 'Ya existe un cierre de caja para hoy' : 'Error al procesar la solicitud';
    res.status(400).json({ error: msg });
  }
});

// ─── SPA fallback ─────────────────────────────────────────────────────────────

app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

app.get('/health', (req, res) => res.json({ ok: true }));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

app.listen(PORT, () => console.log(`AM 18K running on port ${PORT}`));

if (!process.env.JWT_SECRET) {
  console.warn('⚠ JWT_SECRET no está configurado — se generó uno aleatorio para este arranque, así que las sesiones se cerrarán en cada reinicio. Configúralo en Railway para sesiones persistentes.');
}

init().catch(err => console.error('DB init error:', err));
