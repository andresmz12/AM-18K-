import React from 'react';

export default function Header({ view, setView, onAdd, onExport }) {
  return (
    <header className="header">
      <div className="header__brand">
        <span className="header__logo" aria-hidden="true">◈</span>
        <div>
          <h1 className="header__title">AM 18K</h1>
          <p className="header__subtitle">Joyería &amp; Accesorios</p>
        </div>
      </div>

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
      </nav>

      <div className="header__actions">
        <button className="btn btn--outline" onClick={onExport}>
          ↓ Exportar CSV
        </button>
        <button className="btn btn--primary" onClick={onAdd}>
          + Agregar
        </button>
      </div>
    </header>
  );
}
