const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id                  SERIAL PRIMARY KEY,
      nombre              TEXT    NOT NULL,
      codigo              TEXT    UNIQUE NOT NULL,
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
  `);
}

module.exports = { pool, init };
