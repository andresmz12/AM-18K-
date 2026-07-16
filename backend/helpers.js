// Helpers compartidos entre routers.

// Condición SQL de fecha para los filtros de período ('hoy' | 'semana' | 'mes' | 'todo')
// usados en ventas, kits, gastos y reportes. `alias` es el alias de tabla en el
// query (ej. 'v' para "ventas v"); se omite si la columna no está calificada.
function whereFecha(alias, periodo) {
  const col = alias ? `${alias}.fecha` : 'fecha';
  const map = {
    hoy:    `${col}::date = CURRENT_DATE`,
    semana: `${col} >= NOW() - INTERVAL '7 days'`,
    mes:    `DATE_TRUNC('month', ${col}) = DATE_TRUNC('month', NOW())`,
    todo:   'TRUE'
  };
  return map[periodo] || map.todo;
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

module.exports = { serverError, bizError, stripCosts, whereFecha, actualizarPagadaEn };
