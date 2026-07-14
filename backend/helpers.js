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

module.exports = { serverError, bizError, stripCosts, whereFecha };
