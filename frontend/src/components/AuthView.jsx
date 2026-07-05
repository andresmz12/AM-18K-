import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function AuthView() {
  const { login, signup } = useAuth();
  const [mode, setMode]       = useState('login'); // 'login' | 'signup'
  const [empresa, setEmpresa] = useState('');
  const [nombre, setNombre]   = useState('');
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') await login(email, password);
      else await signup(empresa, nombre, email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-view">
      <div className="auth-card">
        <div className="auth-card__brand">
          <span className="header__logo" aria-hidden="true">◈</span>
          <h1>AM 18K</h1>
        </div>
        <p className="auth-card__subtitle">Sistema de inventario para joyerías</p>

        <div className="auth-tabs">
          <button
            type="button"
            className={`sale-mode-tab ${mode === 'login' ? 'sale-mode-tab--active' : ''}`}
            onClick={() => { setMode('login'); setError(''); }}
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            className={`sale-mode-tab ${mode === 'signup' ? 'sale-mode-tab--active' : ''}`}
            onClick={() => { setMode('signup'); setError(''); }}
          >
            Crear cuenta
          </button>
        </div>

        <form onSubmit={handleSubmit} className="form">
          {mode === 'signup' && (
            <div className="form-group form-group--full">
              <label>Nombre de la joyería</label>
              <input value={empresa} onChange={e => setEmpresa(e.target.value)} required
                placeholder="Ej: Joyería López" />
            </div>
          )}

          {mode === 'signup' && (
            <div className="form-group form-group--full">
              <label>Tu nombre</label>
              <input value={nombre} onChange={e => setNombre(e.target.value)} required
                placeholder="Ej: Andrés Martínez" />
            </div>
          )}

          <div className="form-group form-group--full">
            <label>Correo electrónico</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              placeholder="tucorreo@ejemplo.com" />
          </div>

          <div className="form-group form-group--full">
            <label>Contraseña</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              placeholder="Mínimo 6 caracteres" minLength={6} />
          </div>

          {error && <p className="form-error">{error}</p>}

          <div className="form-actions">
            <button type="submit" className="btn btn--primary" disabled={loading} style={{ width: '100%' }}>
              {loading ? 'Procesando...' : mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta y empresa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
