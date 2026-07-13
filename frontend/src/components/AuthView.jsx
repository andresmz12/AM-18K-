import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const FEATURES = [
  'Inventario con fotos, códigos y alertas de stock',
  'Ventas, kits y cotizaciones listas para imprimir',
  'Cuentas por cobrar y cierre de caja diario',
  'Reportes en Excel y PDF con un clic'
];

export default function AuthView({ initialMode = 'login', onBack }) {
  const { login, signup } = useAuth();
  const [mode, setMode]       = useState(initialMode); // 'login' | 'signup'
  const [empresa, setEmpresa] = useState('');
  const [nombre, setNombre]   = useState('');
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  const isLogin = mode === 'login';

  const switchMode = next => {
    setMode(next);
    setError('');
    setShowPass(false);
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isLogin) await login(email, password);
      else await signup(empresa, nombre, email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      {/* Panel de marca — solo visible en pantallas anchas */}
      <aside className="auth-brand">
        <div className="auth-brand__logo">
          <span className="auth-brand__logo-mark" aria-hidden="true">◈</span>
          <span className="auth-brand__logo-name">AuraSistems</span>
        </div>

        <div className="auth-brand__body">
          <h2>Toda tu joyería,<br />bajo control.</h2>
          <p className="auth-brand__lead">
            La plataforma para administrar el inventario, las ventas y las
            finanzas de tu joyería desde cualquier lugar.
          </p>
          <ul className="auth-brand__features">
            {FEATURES.map(f => (
              <li key={f}><span className="auth-brand__check" aria-hidden="true">✓</span>{f}</li>
            ))}
          </ul>
        </div>

        <p className="auth-brand__foot">© {new Date().getFullYear()} AuraSistems · Sistema de gestión para joyerías</p>
      </aside>

      {/* Panel del formulario */}
      <main className="auth-panel">
        <div className="auth-box">
          {onBack && (
            <button type="button" className="auth-box__back" onClick={onBack}>
              ← Volver al inicio
            </button>
          )}

          <div className="auth-box__logo" aria-hidden="true">
            <span className="auth-box__logo-mark">◈</span> AuraSistems
          </div>

          <h1 className="auth-box__title">
            {isLogin ? 'Inicia sesión' : 'Crea tu cuenta'}
          </h1>
          <p className="auth-box__subtitle">
            {isLogin
              ? 'Bienvenido de nuevo. Ingresa tus datos para continuar.'
              : 'Configura tu joyería en menos de un minuto.'}
          </p>

          <form onSubmit={handleSubmit} className="auth-form" noValidate={false}>
            {!isLogin && (
              <div className="auth-field">
                <label htmlFor="auth-empresa">Nombre de la joyería</label>
                <input
                  id="auth-empresa"
                  value={empresa}
                  onChange={e => setEmpresa(e.target.value)}
                  required
                  autoComplete="organization"
                  placeholder="Ej: Joyería López"
                />
              </div>
            )}

            {!isLogin && (
              <div className="auth-field">
                <label htmlFor="auth-nombre">Tu nombre</label>
                <input
                  id="auth-nombre"
                  value={nombre}
                  onChange={e => setNombre(e.target.value)}
                  required
                  autoComplete="name"
                  placeholder="Ej: Andrés Martínez"
                />
              </div>
            )}

            <div className="auth-field">
              <label htmlFor="auth-email">Correo electrónico</label>
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="tucorreo@ejemplo.com"
              />
            </div>

            <div className="auth-field">
              <label htmlFor="auth-password">Contraseña</label>
              <div className="auth-field__input-wrap">
                <input
                  id="auth-password"
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  placeholder={isLogin ? 'Tu contraseña' : 'Mínimo 6 caracteres'}
                />
                <button
                  type="button"
                  className="auth-field__toggle"
                  onClick={() => setShowPass(s => !s)}
                  aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  title={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPass ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            {error && <p className="auth-error" role="alert">{error}</p>}

            <button type="submit" className="auth-submit" disabled={loading}>
              {loading
                ? 'Procesando…'
                : isLogin ? 'Iniciar sesión' : 'Crear cuenta y empresa'}
            </button>
          </form>

          <div className="auth-divider" aria-hidden="true"><span>o</span></div>

          <p className="auth-switch">
            {isLogin ? (
              <>¿Aún no tienes cuenta?{' '}
                <button type="button" onClick={() => switchMode('signup')}>Crea una gratis</button>
              </>
            ) : (
              <>¿Ya tienes una cuenta?{' '}
                <button type="button" onClick={() => switchMode('login')}>Inicia sesión</button>
              </>
            )}
          </p>

          <p className="auth-legal">
            Al continuar aceptas el uso responsable de la plataforma.
            Tus datos se almacenan de forma segura.
          </p>
        </div>
      </main>
    </div>
  );
}
