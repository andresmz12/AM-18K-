import React, { useState, useEffect } from 'react';

const cop = v =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0
  }).format(v || 0);

const formatDate = dateStr => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-CO') + ' ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
};

export default function KitSalesView({ onRegister }) {
  const [kitSales, setKitSales]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [periodo, setPeriodo]           = useState('hoy');
  const [selectedKit, setSelectedKit]   = useState(null);

  const fetchKitSales = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/kit-sales?periodo=${periodo}`);
      const data = await res.json();
      setKitSales(data.kit_sales || []);
    } catch (err) {
      console.error('Error fetching kit sales:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchKitSales();
  }, [periodo]);

  const totalIngresos = kitSales.reduce((s, k) => s + k.total, 0);

  return (
    <div className="view">
      <div className="view-header">
        <div className="view-header__title">
          <h2>Ventas de Kits / Manillas</h2>
          <p className="view-subtitle">Historial de kits y composiciones vendidas</p>
        </div>
        <button className="btn btn--primary" onClick={onRegister}>
          + Vender Kit
        </button>
      </div>

      {/* ── Filtro de período ── */}
      <div className="filter-bar">
        <div className="filter-group">
          <label>Período:</label>
          <select value={periodo} onChange={e => setPeriodo(e.target.value)}>
            <option value="hoy">Hoy</option>
            <option value="semana">Últimos 7 días</option>
            <option value="mes">Este mes</option>
          </select>
        </div>
      </div>

      {/* ── Resumen ── */}
      {!loading && kitSales.length > 0 && (
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-card__label">Total Ventas</div>
            <div className="stat-card__value">{kitSales.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card__label">Ingresos Totales</div>
            <div className="stat-card__value stat-card__value--lg">{cop(totalIngresos)}</div>
          </div>
        </div>
      )}

      {/* ── Tabla de kits ── */}
      {loading && <p className="text-center">Cargando...</p>}

      {!loading && kitSales.length === 0 && (
        <div className="empty-state">
          <p>No hay ventas de kits en este período</p>
          <button className="btn btn--primary" onClick={onRegister}>
            Registrar primera venta
          </button>
        </div>
      )}

      {!loading && kitSales.length > 0 && (
        <div className="kit-sales-list">
          {kitSales.map(kit => (
            <div key={kit.id} className="kit-card">
              <div className="kit-card__header">
                <h4>{kit.nombre_kit}</h4>
                <span className="precio-display">{cop(kit.total)}</span>
              </div>

              <div className="kit-card__details">
                <p className="kit-card__detail">
                  <strong>Componentes:</strong> {(JSON.parse(kit.componentes) || []).length} artículos
                </p>
                {kit.mano_obra > 0 && (
                  <p className="kit-card__detail">
                    <strong>Mano de obra:</strong> {cop(kit.mano_obra)}
                  </p>
                )}
                {kit.valor_extra > 0 && (
                  <p className="kit-card__detail">
                    <strong>Valor extra:</strong> {cop(kit.valor_extra)}
                  </p>
                )}
                {kit.cliente && (
                  <p className="kit-card__detail">
                    <strong>Cliente:</strong> {kit.cliente}
                  </p>
                )}
                <p className="kit-card__date">{formatDate(kit.fecha)}</p>
              </div>

              <button
                className="btn btn--outline btn--sm"
                onClick={() => setSelectedKit(selectedKit?.id === kit.id ? null : kit)}
              >
                {selectedKit?.id === kit.id ? 'Ocultar detalles' : 'Ver detalles'}
              </button>

              {selectedKit?.id === kit.id && (
                <div className="kit-card__expanded">
                  <div className="kit-components">
                    <h5>Componentes utilizados:</h5>
                    <ul>
                      {(JSON.parse(kit.componentes) || []).map((comp, i) => (
                        <li key={i}>
                          {comp.cantidad} × {comp.nombre || `Producto ${comp.producto_id}`}
                        </li>
                      ))}
                    </ul>
                  </div>
                  {kit.notas && (
                    <div className="kit-notas">
                      <h5>Notas:</h5>
                      <p>{kit.notas}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
