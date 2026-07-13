// Helpers compartidos entre routers.

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

module.exports = { serverError, bizError, stripCosts };
