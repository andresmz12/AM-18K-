import React from 'react';

const ROL_LABEL = { gerente: 'Gerente', empleado: 'Empleado', superadmin: 'Administrador' };

export default function Header({ view, setView, onAdd, onExport, user, onLogout, platformMode }) {
  const isGerente = user?.rol === 'gerente';

  return (
    <header className="header">
      <div className="header__brand">
        <span className="header__logo" aria-hidden="true">◈</span>
        <div>
          <h1 className="header__title">{platformMode ? 'AM 18K' : (user?.empresa_nombre || 'AM 18K')}</h1>
          <p className="header__subtitle">{platformMode ? 'Panel de plataforma' : 'Joyería & Accesorios'}</p>
        </div>
      </div>

      {!platformMode && (
        <nav className="header__nav">
          <button
            className={`nav-btn ${view === 'dashboard' ? 'nav-btn--active' : ''}`}
            onClick={() => setView('dashboard')}
          >
            Dashboard
          </button>
          <button
            className={`nav-btn ${view === 'inventory' ? 'nav-btn--active' : ''}`}
            onClick={() => setView('inventory')}
          >
            Inventario
          </button>
          <button
            className={`nav-btn ${view === 'ventas' ? 'nav-btn--active' : ''}`}
            onClick={() => setView('ventas')}
          >
            Ventas
          </button>
          <button
            className={`nav-btn ${view === 'cotizar' ? 'nav-btn--active' : ''}`}
            onClick={() => setView('cotizar')}
          >
            Cotizar
          </button>
          <button
            className={`nav-btn ${view === 'abonos' ? 'nav-btn--active' : ''}`}
            onClick={() => setView('abonos')}
          >
            Abonos
          </button>
          <button
            className={`nav-btn ${view === 'gastos' ? 'nav-btn--active' : ''}`}
            onClick={() => setView('gastos')}
          >
            Gastos
          </button>
          <button
            className={`nav-btn ${view === 'caja' ? 'nav-btn--active' : ''}`}
            onClick={() => setView('caja')}
          >
            Caja
          </button>
          {isGerente && (
            <button
              className={`nav-btn ${view === 'usuarios' ? 'nav-btn--active' : ''}`}
              onClick={() => setView('usuarios')}
            >
              Usuarios
            </button>
          )}
        </nav>
      )}
      {platformMode && <div style={{ flex: 1 }} />}

      <div className="header__actions">
        {isGerente && (
          <button className="btn btn--outline" onClick={onExport}>
            ↓ Exportar CSV
          </button>
        )}
        {isGerente && (
          <button className="btn btn--primary" onClick={onAdd}>
            + Agregar
          </button>
        )}
        <div className="header__user">
          <span className="header__user-name" title={user?.email}>
            {user?.nombre} <span className="text-muted">· {ROL_LABEL[user?.rol] || user?.rol}</span>
          </span>
          <button className="btn-icon" onClick={onLogout} title="Cerrar sesión">⏻</button>
        </div>
      </div>
    </header>
  );
}
