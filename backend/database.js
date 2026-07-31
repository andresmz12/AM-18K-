const { Pool, types } = require('pg');

// Postgres no parsea NUMERIC como número por defecto (para no perder precisión
// con valores enormes) — lo devuelve como string. Como usamos NUMERIC solo para
// montos en COP (dentro de rangos normales), lo forzamos a float para que el
// resto del código pueda seguir haciendo aritmética directa sobre las columnas.
types.setTypeParser(types.builtins.NUMERIC, val => (val === null ? null : parseFloat(val)));

// Sin esto, Postgres calcula "hoy" en UTC — una joyería en Colombia (UTC-5)
// vería sus ventas de la noche contadas para el día siguiente, y los cierres
// de caja quedarían con la fecha equivocada. Se fija por parámetro de conexión
// (no con un SET posterior) para que aplique desde la primera consulta, sin
// condición de carrera.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
  options: '-c timezone=America/Bogota'
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS empresas (
      id              SERIAL PRIMARY KEY,
      nombre          TEXT    NOT NULL,
      activa          BOOLEAN NOT NULL DEFAULT true,
      fecha_creacion  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Roles: 'superadmin' (dueños de AuraSistems, administran la plataforma y todas las joyerías),
    -- 'gerente' (dueño/encargado de una joyería cliente, ve costos y administra su inventario/equipo),
    -- 'empleado' (registra ventas y cotizaciones, sin acceso a costos ni utilidades).
    CREATE TABLE IF NOT EXISTS usuarios (
      id              SERIAL PRIMARY KEY,
      empresa_id      INTEGER NOT NULL REFERENCES empresas(id),
      nombre          TEXT    NOT NULL,
      email           TEXT    NOT NULL UNIQUE,
      password_hash   TEXT    NOT NULL,
      rol             TEXT    NOT NULL DEFAULT 'empleado' CHECK (rol IN ('superadmin', 'gerente', 'empleado')),
      activo          BOOLEAN NOT NULL DEFAULT true,
      fecha_creacion  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS products (
      id                  SERIAL PRIMARY KEY,
      nombre              TEXT    NOT NULL,
      codigo              TEXT    NOT NULL,
      categoria           TEXT    NOT NULL DEFAULT 'Otro',
      descripcion         TEXT,
      peso_gramos         REAL,
      costo               NUMERIC(14,2) NOT NULL DEFAULT 0,
      porcentaje_ganancia NUMERIC(10,3) NOT NULL DEFAULT 0,
      precio_venta        NUMERIC(14,2) NOT NULL DEFAULT 0,
      stock               INTEGER NOT NULL DEFAULT 0,
      stock_minimo        INTEGER NOT NULL DEFAULT 1,
      proveedor           TEXT,
      notas               TEXT,
      imagen_url          TEXT,
      fecha_creacion      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ventas (
      id              SERIAL PRIMARY KEY,
      producto_id     INTEGER NOT NULL REFERENCES products(id),
      cantidad        INTEGER NOT NULL,
      precio_unitario NUMERIC(14,2) NOT NULL,
      total           NUMERIC(14,2) NOT NULL,
      notas           TEXT,
      fecha           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS cotizaciones (
      id      SERIAL PRIMARY KEY,
      cliente TEXT,
      items   JSONB        NOT NULL DEFAULT '[]',
      total   NUMERIC(14,2) NOT NULL DEFAULT 0,
      notas   TEXT,
      fecha   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS kit_sales (
      id              SERIAL PRIMARY KEY,
      nombre_kit      TEXT    NOT NULL,
      componentes     JSONB   NOT NULL DEFAULT '[]',
      mano_obra       NUMERIC(14,2) NOT NULL DEFAULT 0,
      valor_extra     NUMERIC(14,2) NOT NULL DEFAULT 0,
      total           NUMERIC(14,2) NOT NULL,
      cliente         TEXT,
      notas           TEXT,
      fecha           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS gastos (
      id              SERIAL PRIMARY KEY,
      empresa_id      INTEGER NOT NULL REFERENCES empresas(id),
      concepto        TEXT    NOT NULL,
      monto           NUMERIC(14,2) NOT NULL,
      recurrente      BOOLEAN NOT NULL DEFAULT false,
      imagen_url      TEXT,
      notas           TEXT,
      fecha           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS cuentas_por_cobrar (
      id              SERIAL PRIMARY KEY,
      empresa_id      INTEGER NOT NULL REFERENCES empresas(id),
      usuario_id      INTEGER REFERENCES usuarios(id),
      cliente         TEXT    NOT NULL,
      descripcion     TEXT,
      monto_total     NUMERIC(14,2) NOT NULL,
      incremento      NUMERIC(14,2) NOT NULL DEFAULT 0,
      notas           TEXT,
      fecha_creacion  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Cada abono se aplica contra una cuenta por cobrar (cuenta_id) y reduce su saldo.
    CREATE TABLE IF NOT EXISTS abonos (
      id              SERIAL PRIMARY KEY,
      empresa_id      INTEGER NOT NULL REFERENCES empresas(id),
      cuenta_id       INTEGER REFERENCES cuentas_por_cobrar(id),
      cliente         TEXT,
      monto           NUMERIC(14,2) NOT NULL,
      notas           TEXT,
      fecha           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS cierres_caja (
      id              SERIAL PRIMARY KEY,
      empresa_id      INTEGER NOT NULL REFERENCES empresas(id),
      usuario_id      INTEGER NOT NULL REFERENCES usuarios(id),
      fecha           DATE    NOT NULL DEFAULT CURRENT_DATE,
      apertura        NUMERIC(14,2) NOT NULL DEFAULT 0,
      ventas          NUMERIC(14,2) NOT NULL DEFAULT 0,
      abonos          NUMERIC(14,2) NOT NULL DEFAULT 0,
      gastos          NUMERIC(14,2) NOT NULL DEFAULT 0,
      total_esperado  NUMERIC(14,2) NOT NULL DEFAULT 0,
      dinero_efectivo NUMERIC(14,2) NOT NULL DEFAULT 0,
      dinero_cuenta   NUMERIC(14,2) NOT NULL DEFAULT 0,
      diferencia      NUMERIC(14,2) NOT NULL DEFAULT 0,
      notas           TEXT,
      fecha_creacion  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (empresa_id, fecha)
    );
  `);

  // ── Migración multi-tenant: agrega empresa_id a las tablas existentes ──────
  // Necesario para instalaciones que ya tenían datos antes del sistema de usuarios.
  await pool.query(`
    ALTER TABLE products     ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id);
    ALTER TABLE ventas       ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id);
    ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id);
    ALTER TABLE kit_sales    ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id);
    ALTER TABLE products     DROP CONSTRAINT IF EXISTS products_codigo_key;
    CREATE UNIQUE INDEX IF NOT EXISTS products_empresa_codigo_key ON products (empresa_id, codigo);
    ALTER TABLE empresas     ADD COLUMN IF NOT EXISTS activa BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE gastos       ADD COLUMN IF NOT EXISTS recurrente BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE gastos       ADD COLUMN IF NOT EXISTS imagen_url TEXT;
    ALTER TABLE ventas       ADD COLUMN IF NOT EXISTS usuario_id INTEGER REFERENCES usuarios(id);
    ALTER TABLE kit_sales    ADD COLUMN IF NOT EXISTS usuario_id INTEGER REFERENCES usuarios(id);
    ALTER TABLE abonos       ADD COLUMN IF NOT EXISTS cuenta_id INTEGER REFERENCES cuentas_por_cobrar(id);
    ALTER TABLE ventas       ADD COLUMN IF NOT EXISTS metodo_pago TEXT NOT NULL DEFAULT 'efectivo';
    ALTER TABLE kit_sales    ADD COLUMN IF NOT EXISTS metodo_pago TEXT NOT NULL DEFAULT 'efectivo';
    ALTER TABLE cierres_caja ADD COLUMN IF NOT EXISTS apertura_efectivo NUMERIC(14,2) NOT NULL DEFAULT 0;
    ALTER TABLE cierres_caja ADD COLUMN IF NOT EXISTS apertura_cuenta   NUMERIC(14,2) NOT NULL DEFAULT 0;
    -- items: productos vendidos "al fiado" en esta cuenta (si aplica) — se descuenta
    -- el stock al crearla, igual que una venta normal. pagada_en: se llena solo
    -- cuando el saldo llega a 0, para poder sumarla como ingreso ese día.
    ALTER TABLE cuentas_por_cobrar ADD COLUMN IF NOT EXISTS items JSONB NOT NULL DEFAULT '[]';
    ALTER TABLE cuentas_por_cobrar ADD COLUMN IF NOT EXISTS pagada_en TIMESTAMPTZ;
    -- Recargo que se agrega a la deuda solo al crear la cuenta (ej. por fiar la prenda).
    ALTER TABLE cuentas_por_cobrar ADD COLUMN IF NOT EXISTS incremento NUMERIC(14,2) NOT NULL DEFAULT 0;
  `);

  // ── Forma de pago: solo efectivo o transferencia ────────────────────────────
  await pool.query(`
    ALTER TABLE ventas    DROP CONSTRAINT IF EXISTS ventas_metodo_pago_check;
    ALTER TABLE ventas    ADD CONSTRAINT ventas_metodo_pago_check CHECK (metodo_pago IN ('efectivo', 'transferencia'));
    ALTER TABLE kit_sales DROP CONSTRAINT IF EXISTS kit_sales_metodo_pago_check;
    ALTER TABLE kit_sales ADD CONSTRAINT kit_sales_metodo_pago_check CHECK (metodo_pago IN ('efectivo', 'transferencia'));
  `);

  // ── Precisión monetaria: REAL (float) → NUMERIC ─────────────────────────────
  // REAL puede acumular errores de redondeo en sumas de dinero; NUMERIC no.
  // OJO: castear real::numeric(p,s) directamente trunca mal en Postgres cuando el
  // valor tiene más cifras significativas que la precisión de un float4 (p.ej.
  // 100000.33 quedaba en 100000.00). Por eso se pasa primero por double precision.
  await pool.query(`
    ALTER TABLE products         ALTER COLUMN costo               TYPE NUMERIC(14,2) USING costo::double precision::numeric(14,2);
    ALTER TABLE products         ALTER COLUMN porcentaje_ganancia  TYPE NUMERIC(10,3) USING porcentaje_ganancia::double precision::numeric(10,3);
    ALTER TABLE products         ALTER COLUMN precio_venta         TYPE NUMERIC(14,2) USING precio_venta::double precision::numeric(14,2);
    ALTER TABLE ventas           ALTER COLUMN precio_unitario      TYPE NUMERIC(14,2) USING precio_unitario::double precision::numeric(14,2);
    ALTER TABLE ventas           ALTER COLUMN total                TYPE NUMERIC(14,2) USING total::double precision::numeric(14,2);
    ALTER TABLE cotizaciones     ALTER COLUMN total                TYPE NUMERIC(14,2) USING total::double precision::numeric(14,2);
    ALTER TABLE kit_sales        ALTER COLUMN mano_obra            TYPE NUMERIC(14,2) USING mano_obra::double precision::numeric(14,2);
    ALTER TABLE kit_sales        ALTER COLUMN valor_extra          TYPE NUMERIC(14,2) USING valor_extra::double precision::numeric(14,2);
    ALTER TABLE kit_sales        ALTER COLUMN total                TYPE NUMERIC(14,2) USING total::double precision::numeric(14,2);
    ALTER TABLE gastos           ALTER COLUMN monto                TYPE NUMERIC(14,2) USING monto::double precision::numeric(14,2);
    ALTER TABLE cuentas_por_cobrar ALTER COLUMN monto_total        TYPE NUMERIC(14,2) USING monto_total::double precision::numeric(14,2);
    ALTER TABLE abonos           ALTER COLUMN monto                TYPE NUMERIC(14,2) USING monto::double precision::numeric(14,2);
    ALTER TABLE cierres_caja     ALTER COLUMN apertura             TYPE NUMERIC(14,2) USING apertura::double precision::numeric(14,2);
    ALTER TABLE cierres_caja     ALTER COLUMN ventas               TYPE NUMERIC(14,2) USING ventas::double precision::numeric(14,2);
    ALTER TABLE cierres_caja     ALTER COLUMN abonos               TYPE NUMERIC(14,2) USING abonos::double precision::numeric(14,2);
    ALTER TABLE cierres_caja     ALTER COLUMN gastos               TYPE NUMERIC(14,2) USING gastos::double precision::numeric(14,2);
    ALTER TABLE cierres_caja     ALTER COLUMN total_esperado       TYPE NUMERIC(14,2) USING total_esperado::double precision::numeric(14,2);
    ALTER TABLE cierres_caja     ALTER COLUMN dinero_efectivo      TYPE NUMERIC(14,2) USING dinero_efectivo::double precision::numeric(14,2);
    ALTER TABLE cierres_caja     ALTER COLUMN dinero_cuenta        TYPE NUMERIC(14,2) USING dinero_cuenta::double precision::numeric(14,2);
    ALTER TABLE cierres_caja     ALTER COLUMN diferencia           TYPE NUMERIC(14,2) USING diferencia::double precision::numeric(14,2);
  `);

  // ── Permite borrar un usuario sin romper su historial de ventas/cuentas ─────
  // (usuario_id queda en NULL, no se puede tocar la venta/cuenta en sí).
  // cierres_caja.usuario_id es NOT NULL a propósito: un cierre de caja siempre
  // debe quedar atribuido a alguien, así que borrar a ese usuario sigue bloqueado.
  await pool.query(`
    ALTER TABLE ventas DROP CONSTRAINT IF EXISTS ventas_usuario_id_fkey;
    ALTER TABLE ventas ADD CONSTRAINT ventas_usuario_id_fkey
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL;
    ALTER TABLE kit_sales DROP CONSTRAINT IF EXISTS kit_sales_usuario_id_fkey;
    ALTER TABLE kit_sales ADD CONSTRAINT kit_sales_usuario_id_fkey
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL;
    ALTER TABLE cuentas_por_cobrar DROP CONSTRAINT IF EXISTS cuentas_por_cobrar_usuario_id_fkey;
    ALTER TABLE cuentas_por_cobrar ADD CONSTRAINT cuentas_por_cobrar_usuario_id_fkey
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL;
  `);

  // ── Rebranding: renombra la empresa de plataforma heredada del nombre anterior ──
  await pool.query(
    `UPDATE empresas SET nombre = 'AuraSistems — Plataforma' WHERE nombre = 'AM 18K — Plataforma'`
  );

  // ── Migración de roles: 'admin' → 'gerente', 'vendedor' → 'empleado' ───────
  await pool.query(`ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;`);
  await pool.query(`UPDATE usuarios SET rol = 'gerente'  WHERE rol = 'admin';`);
  await pool.query(`UPDATE usuarios SET rol = 'empleado' WHERE rol = 'vendedor';`);
  await pool.query(`
    ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check CHECK (rol IN ('superadmin', 'gerente', 'empleado'));
    ALTER TABLE usuarios ALTER COLUMN rol SET DEFAULT 'empleado';
  `);

  const { rows: huerfanos } = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM products     WHERE empresa_id IS NULL) +
      (SELECT COUNT(*) FROM ventas       WHERE empresa_id IS NULL) +
      (SELECT COUNT(*) FROM cotizaciones WHERE empresa_id IS NULL) +
      (SELECT COUNT(*) FROM kit_sales    WHERE empresa_id IS NULL) AS c
  `);

  if (parseInt(huerfanos[0].c, 10) > 0) {
    const { rows: [legacy] } = await pool.query(
      `INSERT INTO empresas (nombre) VALUES ('Mi Joyería') RETURNING id`
    );
    await pool.query('UPDATE products     SET empresa_id = $1 WHERE empresa_id IS NULL', [legacy.id]);
    await pool.query('UPDATE ventas       SET empresa_id = $1 WHERE empresa_id IS NULL', [legacy.id]);
    await pool.query('UPDATE cotizaciones SET empresa_id = $1 WHERE empresa_id IS NULL', [legacy.id]);
    await pool.query('UPDATE kit_sales    SET empresa_id = $1 WHERE empresa_id IS NULL', [legacy.id]);
    console.log(`Migración: datos existentes asignados a la empresa "Mi Joyería" (id ${legacy.id}). Regístrate para crear un usuario admin y luego contáctanos para vincularlo a esta empresa si necesitas conservar estos datos.`);
  }

  await pool.query(`
    ALTER TABLE products     ALTER COLUMN empresa_id SET NOT NULL;
    ALTER TABLE ventas       ALTER COLUMN empresa_id SET NOT NULL;
    ALTER TABLE cotizaciones ALTER COLUMN empresa_id SET NOT NULL;
    ALTER TABLE kit_sales    ALTER COLUMN empresa_id SET NOT NULL;
  `);

  // ── Secreto JWT persistente ─────────────────────────────────────────────────
  // Si no hay JWT_SECRET en el entorno, se genera uno una sola vez y se guarda
  // en la base: las sesiones sobreviven reinicios y redeploys sin configurar nada.
  await pool.query(`CREATE TABLE IF NOT EXISTS app_config (clave TEXT PRIMARY KEY, valor TEXT NOT NULL);`);
  let jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    const crypto = require('crypto');
    await pool.query(
      `INSERT INTO app_config (clave, valor) VALUES ('jwt_secret', $1) ON CONFLICT (clave) DO NOTHING`,
      [crypto.randomBytes(32).toString('hex')]
    );
    const { rows: [cfg] } = await pool.query(`SELECT valor FROM app_config WHERE clave = 'jwt_secret'`);
    jwtSecret = cfg.valor;
  }
  return { jwtSecret };
}

module.exports = { pool, init };
