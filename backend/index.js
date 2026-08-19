const express = require('express');
const helmet  = require('helmet');
const rateLimit = require('express-rate-limit');
const path    = require('path');
const { init } = require('./database');
const { setJwtSecret, requireAuth } = require('./auth');

const app  = express();
const PORT = process.env.PORT || 3000;

// Railway corre detrás de un proxy — necesario para que req.ip sea la IP real
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      // Las fotos de producto pueden ser base64 (data:) o URLs externas — solo HTTPS,
      // http: se excluye a propósito para no permitir contenido mixto
      'img-src': ["'self'", 'data:', 'https:']
    }
  }
}));

// Frontend y API comparten origen (el backend sirve el build) — no se necesita CORS.
// Las imágenes viajan como base64 dentro del JSON — aumentar límite a 10 MB
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// Límite de intentos para login/registro/setup — frena fuerza bruta de contraseñas
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.' }
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);
app.use('/api/setup', authLimiter);

// Límite general para el resto de la API (ya autenticada) — contiene abuso de
// una cuenta comprometida o de un cliente que golpea la API en bucle.
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Espera un momento e intenta de nuevo.' }
});
app.use('/api', apiLimiter);

// ─── Rutas públicas (sin sesión) ───────────────────────────────────────────────

app.use('/api/auth', require('./routes/auth'));
app.use('/api/setup', require('./routes/setup'));

// ─── Todo lo demás requiere sesión iniciada ───────────────────────────────────

app.use('/api', requireAuth);

app.use('/api/platform', require('./routes/platform'));
app.use('/api/users', require('./routes/users'));
app.use('/api/products', require('./routes/products'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/ventas', require('./routes/ventas'));
app.use('/api/kit-sales', require('./routes/kitSales'));
app.use('/api/reportes', require('./routes/reportes'));
app.use('/api/export', require('./routes/export'));
app.use('/api/cotizaciones', require('./routes/cotizaciones'));
app.use('/api/gastos', require('./routes/gastos'));
app.use('/api/cuentas-por-cobrar', require('./routes/cuentasPorCobrar'));
app.use('/api/abonos', require('./routes/abonos'));
app.use('/api/cuentas-por-pagar', require('./routes/cuentasPorPagar'));
app.use('/api/pagos', require('./routes/pagos'));
app.use('/api/cierres', require('./routes/cierres'));

// ─── SPA fallback ─────────────────────────────────────────────────────────────

app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

app.get('/health', (req, res) => res.json({ ok: true }));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

// El puerto se abre solo cuando la base está migrada y el secreto JWT cargado —
// así ninguna request llega antes de que el servidor pueda atenderla bien.
init()
  .then(({ jwtSecret }) => {
    setJwtSecret(jwtSecret);
    app.listen(PORT, () => console.log(`AuraSistems running on port ${PORT}`));
  })
  .catch(err => {
    console.error('DB init error:', err);
    process.exit(1);
  });
