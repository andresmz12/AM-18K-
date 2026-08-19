// Helpers compartidos entre routers.

// Condición SQL de fecha para los filtros de período ('hoy' | 'semana' | 'mes' | 'todo')
// usados en ventas, kits, gastos y reportes. `alias` es el alias de tabla en el
// query (ej. 'v' para "ventas v"); se omite si la columna no está calificada.
// `col` permite reutilizar el mismo filtro sobre una columna distinta de "fecha"
// (ej. "pagada_en" en cuentas_por_cobrar).
function whereFecha(alias, periodo, col = 'fecha') {
  const columna = alias ? `${alias}.${col}` : col;
  const map = {
    hoy:    `${columna}::date = CURRENT_DATE`,
    semana: `${columna} >= NOW() - INTERVAL '7 days'`,
    mes:    `DATE_TRUNC('month', ${columna}) = DATE_TRUNC('month', NOW())`,
    todo:   'TRUE'
  };
  return map[periodo] || map.todo;
}

// Cuentas por cobrar que quedaron saldadas — se cuentan como venta en el momento
// en que el cliente termina de pagar (pagada_en), no cuando se fió. Se usa tanto
// en la pestaña Ventas como en los reportes de Excel/PDF para que ambos coincidan
// con lo que ya hace el dashboard.
async function cuentasPagadasComoVentas(pool, empresaId, periodo) {
  const { rows } = await pool.query(
    `SELECT c.id, c.pagada_en AS fecha, c.cliente, c.descripcion, c.items,
            c.monto_total AS total, u.nombre AS vendedor
     FROM cuentas_por_cobrar c
     LEFT JOIN usuarios u ON u.id = c.usuario_id
     WHERE c.empresa_id = $1 AND c.pagada_en IS NOT NULL AND ${whereFecha('c', periodo, 'pagada_en')}
     ORDER BY c.pagada_en DESC`,
    [empresaId]
  );
  return rows.map(r => ({ ...r, total: parseFloat(r.total) }));
}

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

// Recalcula el saldo de una cuenta por cobrar y marca (o limpia) pagada_en —
// el momento en que quedó saldada. Debe llamarse dentro de la misma
// transacción que insertó/editó/borró el abono, con `client` ya conectado.
// Así el dashboard puede contar como ingreso del día justo cuando el cliente
// termina de pagar, no cuando se creó la deuda.
async function actualizarPagadaEn(client, cuentaId) {
  const { rows: [cuenta] } = await client.query(
    'SELECT monto_total, pagada_en FROM cuentas_por_cobrar WHERE id = $1 FOR UPDATE', [cuentaId]
  );
  if (!cuenta) return;
  const { rows: [{ t }] } = await client.query(
    'SELECT COALESCE(SUM(monto), 0) AS t FROM abonos WHERE cuenta_id = $1', [cuentaId]
  );
  const saldo = cuenta.monto_total - parseFloat(t);
  if (saldo <= 0.01 && !cuenta.pagada_en) {
    await client.query('UPDATE cuentas_por_cobrar SET pagada_en = NOW() WHERE id = $1', [cuentaId]);
  } else if (saldo > 0.01 && cuenta.pagada_en) {
    await client.query('UPDATE cuentas_por_cobrar SET pagada_en = NULL WHERE id = $1', [cuentaId]);
  }
}

// Igual que actualizarPagadaEn, pero para cuentas_por_pagar/pagos (deudas del
// negocio con proveedores). Debe llamarse dentro de la misma transacción que
// insertó/editó/borró el pago, con `client` ya conectado.
async function actualizarPagadaEnCP(client, cuentaId) {
  const { rows: [cuenta] } = await client.query(
    'SELECT monto_total, pagada_en FROM cuentas_por_pagar WHERE id = $1 FOR UPDATE', [cuentaId]
  );
  if (!cuenta) return;
  const { rows: [{ t }] } = await client.query(
    'SELECT COALESCE(SUM(monto), 0) AS t FROM pagos WHERE cuenta_id = $1', [cuentaId]
  );
  const saldo = cuenta.monto_total - parseFloat(t);
  if (saldo <= 0.01 && !cuenta.pagada_en) {
    await client.query('UPDATE cuentas_por_pagar SET pagada_en = NOW() WHERE id = $1', [cuentaId]);
  } else if (saldo > 0.01 && cuenta.pagada_en) {
    await client.query('UPDATE cuentas_por_pagar SET pagada_en = NULL WHERE id = $1', [cuentaId]);
  }
}

module.exports = { serverError, bizError, stripCosts, whereFecha, actualizarPagadaEn, actualizarPagadaEnCP, cuentasPagadasComoVentas };
