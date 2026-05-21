const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'inventory.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre           TEXT    NOT NULL,
    codigo           TEXT    UNIQUE NOT NULL,
    categoria        TEXT    NOT NULL DEFAULT 'Otro',
    descripcion      TEXT,
    peso_gramos      REAL,
    costo            REAL    NOT NULL DEFAULT 0,
    porcentaje_ganancia REAL NOT NULL DEFAULT 0,
    precio_venta     REAL    NOT NULL DEFAULT 0,
    stock            INTEGER NOT NULL DEFAULT 0,
    stock_minimo     INTEGER NOT NULL DEFAULT 1,
    proveedor        TEXT,
    notas            TEXT,
    imagen_url       TEXT,
    fecha_creacion   TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS ventas (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    producto_id     INTEGER NOT NULL REFERENCES products(id),
    cantidad        INTEGER NOT NULL,
    precio_unitario REAL    NOT NULL,
    total           REAL    NOT NULL,
    notas           TEXT,
    fecha           TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
`);

module.exports = db;
