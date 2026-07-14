// Formato de moneda COP compartido por toda la app.
// maximumFractionDigits: 0 — en COP no se muestran centavos: los valores llegan
// de la base con decimales (NUMERIC) y se redondean solo al mostrarlos.
export const cop = v =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0
  }).format(v || 0);

// Versión compacta para ejes de gráficos ($ 1,5 M)
export const copCompact = v =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', notation: 'compact', maximumFractionDigits: 1
  }).format(v || 0);

// Parsea un valor de fecha SIN hora (columnas DATE, ej. cierres_caja.fecha o
// los días del gráfico de ventas). El backend las devuelve como "2026-07-14"
// o "2026-07-14T00:00:00.000Z" (medianoche UTC) — si se pasan directo a
// `new Date(str)`, el navegador las reinterpreta en su zona horaria local y
// en Colombia (UTC-5) terminan mostrando el día anterior. Se toman los
// componentes de fecha tal cual y se arma un Date en hora local, sin desfase.
export const parseFechaSolo = str => {
  const [y, m, d] = str.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};
