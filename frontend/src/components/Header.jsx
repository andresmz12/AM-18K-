import React from 'react';

const ROL_LABEL = { gerente: 'Gerente', empleado: 'Empleado', superadmin: 'Administrador' };

export default function Header({ view, setView, onAdd, onExport, user, onLogout, platformMode }) {
  const isGerente = user?.rol === 'gerente';
  const showInventoryActions = isGerente && view === 'inventory';

  return (
    <header className="header">
      <div className="header__brand">
        <img className="header__logo" src="/logo-icon-dark.png" alt="" aria-hidden="true" />
        <div>
          <h1 className="header__title">{platformMode ? 'AuraSistems' : (user?.empresa_nombre || 'AuraSistems')}</h1>
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
            className={`nav-btn ${view === 'cuentas' ? 'nav-btn--active' : ''}`}
            onClick={() => setView('cuentas')}
          >
            Cuentas x Cobrar
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
              className={`nav-btn ${view === 'reportes' ? 'nav-btn--active' : ''}`}
              onClick={() => setView('reportes')}
            >
              Reportes
            </button>
          )}
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
        {showInventoryActions && (
          <button className="btn btn--outline" onClick={onExport}>
            ↓ Exportar CSV
          </button>
        )}
        {showInventoryActions && (
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
