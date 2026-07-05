const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS empresas (
      id              SERIAL PRIMARY KEY,
      nombre          TEXT    NOT NULL,
      activa          BOOLEAN NOT NULL DEFAULT true,
      fecha_creacion  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Roles: 'superadmin' (dueños de AM 18K, administran la plataforma y todas las joyerías),
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
      costo               REAL    NOT NULL DEFAULT 0,
      porcentaje_ganancia REAL    NOT NULL DEFAULT 0,
      precio_venta        REAL    NOT NULL DEFAULT 0,
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
      precio_unitario REAL    NOT NULL,
      total           REAL    NOT NULL,
      notas           TEXT,
      fecha           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS cotizaciones (
      id      SERIAL PRIMARY KEY,
      cliente TEXT,
      items   JSONB        NOT NULL DEFAULT '[]',
      total   REAL         NOT NULL DEFAULT 0,
      notas   TEXT,
      fecha   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS kit_sales (
      id              SERIAL PRIMARY KEY,
      nombre_kit      TEXT    NOT NULL,
      componentes     JSONB   NOT NULL DEFAULT '[]',
      mano_obra       REAL    NOT NULL DEFAULT 0,
      valor_extra     REAL    NOT NULL DEFAULT 0,
      total           REAL    NOT NULL,
      cliente         TEXT,
      notas           TEXT,
      fecha           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS gastos (
      id              SERIAL PRIMARY KEY,
      empresa_id      INTEGER NOT NULL REFERENCES empresas(id),
      concepto        TEXT    NOT NULL,
      monto           REAL    NOT NULL,
      recurrente      BOOLEAN NOT NULL DEFAULT false,
      imagen_url      TEXT,
      notas           TEXT,
      fecha           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS abonos (
      id              SERIAL PRIMARY KEY,
      empresa_id      INTEGER NOT NULL REFERENCES empresas(id),
      cliente         TEXT,
      monto           REAL    NOT NULL,
      notas           TEXT,
      fecha           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS cierres_caja (
      id              SERIAL PRIMARY KEY,
      empresa_id      INTEGER NOT NULL REFERENCES empresas(id),
      usuario_id      INTEGER NOT NULL REFERENCES usuarios(id),
      fecha           DATE    NOT NULL DEFAULT CURRENT_DATE,
      apertura        REAL    NOT NULL DEFAULT 0,
      ventas          REAL    NOT NULL DEFAULT 0,
      abonos          REAL    NOT NULL DEFAULT 0,
      gastos          REAL    NOT NULL DEFAULT 0,
      total_esperado  REAL    NOT NULL DEFAULT 0,
      dinero_efectivo REAL    NOT NULL DEFAULT 0,
      dinero_cuenta   REAL    NOT NULL DEFAULT 0,
      diferencia      REAL    NOT NULL DEFAULT 0,
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
  `);

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
}

module.exports = { pool, init };
