import React from 'react';

const cop = v =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0
  }).format(v || 0);

export default function Dashboard({ stats, loading, onViewInventory }) {
  if (loading || !stats) {
    return (
      <div className="dashboard">
        <div className="loading">Cargando datos...</div>
      </div>
    );
  }

  const cards = [
    { label: 'Total Productos',    value: stats.totalProductos,              icon: '◈', type: 'neutral'  },
    { label: 'Total Invertido',    value: cop(stats.totalInvertido),          icon: '↓', type: 'neutral'  },
    { label: 'Valor Inventario',   value: cop(stats.valorInventario),         icon: '◆', type: 'positive' },
    { label: 'Ganancia Potencial', value: cop(stats.gananciasPotencial),      icon: '▲', type: 'positive' },
    { label: 'Stock Bajo',         value: stats.productosStockBajo,           icon: '⚠', type: stats.productosStockBajo > 0 ? 'warning' : 'neutral' },
  ];

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <h2 className="section-title">Resumen del Inventario</h2>
      </div>

      <div className="cards-grid">
        {cards.map((card, i) => (
          <div
            key={i}
            className={`card card--${card.type}`}
            onClick={card.label === 'Stock Bajo' && stats.productosStockBajo > 0 ? onViewInventory : undefined}
            style={card.label === 'Stock Bajo' && stats.productosStockBajo > 0 ? { cursor: 'pointer' } : {}}
          >
            <div className="card__icon">{card.icon}</div>
            <div className="card__content">
              <p className="card__label">{card.label}</p>
              <p className="card__value">{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="dashboard__action">
        <button className="btn btn--primary btn--lg" onClick={onViewInventory}>
          Ver Inventario Completo →
        </button>
      </div>
    </div>
  );
}
