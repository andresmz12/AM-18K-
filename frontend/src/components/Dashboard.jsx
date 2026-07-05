import React from 'react';
import DashboardCharts from './DashboardCharts';

const cop = v =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0
  }).format(v || 0);

export default function Dashboard({ stats, statsCategoria, loading, onViewInventory, isGerente, apiFetch }) {
  if (loading || !stats) {
    return (
      <div className="dashboard">
        <div className="loading">Cargando datos...</div>
      </div>
    );
  }

  const cards = [
    { label: 'Total Productos',    value: stats.totalProductos,         icon: '◈', type: 'neutral'  },
    ...(isGerente ? [{ label: 'Total Invertido', value: cop(stats.totalInvertido), icon: '↓', type: 'neutral' }] : []),
    { label: 'Valor Inventario',   value: cop(stats.valorInventario),   icon: '◆', type: 'positive' },
    ...(isGerente ? [{ label: 'Ganancia Potencial', value: cop(stats.gananciasPotencial), icon: '▲', type: 'positive' }] : []),
    { label: 'Stock Bajo',         value: stats.productosStockBajo,     icon: '⚠', type: stats.productosStockBajo > 0 ? 'warning' : 'neutral', clickable: stats.productosStockBajo > 0 },
    { label: 'Ventas Hoy',         value: stats.ventasHoy,             icon: '↗', type: 'neutral'  },
    { label: 'Ingresos Hoy',       value: cop(stats.ingresosHoy),      icon: '$', type: stats.ingresosHoy > 0 ? 'positive' : 'neutral' },
    { label: 'Peso Oro',           value: `${(stats.pesoTotalOroGramos || 0).toFixed(1)} g`, icon: '⚖', type: 'neutral' },
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
            onClick={card.clickable ? onViewInventory : undefined}
            style={card.clickable ? { cursor: 'pointer' } : {}}
          >
            <div className="card__icon">{card.icon}</div>
            <div className="card__content">
              <p className="card__label">{card.label}</p>
              <p className="card__value">{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      {isGerente && <DashboardCharts apiFetch={apiFetch} />}

      {statsCategoria && statsCategoria.length > 0 && (
        <div className="cat-stats">
          <h3 className="cat-stats__title">Inventario por Categoría</h3>
          <div className="table-wrapper">
            <table className="table cat-stats__table">
              <thead>
                <tr>
                  <th>Categoría</th>
                  <th className="td-num">Productos</th>
                  <th className="td-num">Valor Total</th>
                  {isGerente && <th className="td-num">Invertido</th>}
                  <th>% del Total</th>
                </tr>
              </thead>
              <tbody>
                {statsCategoria.map(c => (
                  <tr key={c.categoria}>
                    <td><strong>{c.categoria}</strong></td>
                    <td className="td-num">{c.cantidad}</td>
                    <td className="td-num">{cop(c.valor_total)}</td>
                    {isGerente && <td className="td-num">{cop(c.invertido)}</td>}
                    <td>
                      <div className="pct-wrap">
                        <div className="pct-bar" style={{ width: `${c.porcentaje}%` }} />
                        <span className="pct-label">{c.porcentaje}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="dashboard__action">
        <button className="btn btn--primary btn--lg" onClick={onViewInventory}>
          Ver Inventario Completo →
        </button>
      </div>
    </div>
  );
}
