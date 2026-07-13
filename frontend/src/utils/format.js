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
