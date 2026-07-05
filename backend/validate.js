// Validadores de entrada — devuelven el valor normalizado o null si es inválido.

const MAX_MONTO = 1e12; // tope de sanidad para valores en COP

// Número finito dentro de [min, max]; rechaza strings para evitar
// concatenaciones accidentales ("5" + 100 = "5100").
function num(v, { min = 0, max = MAX_MONTO } = {}) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  if (v < min || v > max) return null;
  return v;
}

function int(v, { min = 0, max = 1e9 } = {}) {
  if (!Number.isInteger(v) || v < min || v > max) return null;
  return v;
}

// String no vacío con tope de longitud
function str(v, max = 200) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t || t.length > max) return null;
  return t;
}

// String opcional (null/undefined/'' → null; inválido → undefined)
function optStr(v, max = 2000) {
  if (v == null || v === '') return null;
  if (typeof v !== 'string' || v.length > max) return undefined;
  return v;
}

function email(v) {
  const s = str(v, 254);
  if (!s || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return null;
  return s.toLowerCase();
}

function password(v) {
  if (typeof v !== 'string' || v.length < 6 || v.length > 100) return null;
  return v;
}

// Imagen: base64 data-URI de imagen, o URL http(s). Tope 8 MB para el base64.
function imagen(v) {
  if (v == null || v === '') return null;
  if (typeof v !== 'string' || v.length > 8 * 1024 * 1024) return undefined;
  if (v.startsWith('data:image/') || /^https?:\/\//i.test(v)) return v;
  return undefined;
}

module.exports = { num, int, str, optStr, email, password, imagen, MAX_MONTO };
