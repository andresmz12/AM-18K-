import React, { useState, useEffect } from 'react';

const cop = v =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0
  }).format(v || 0);

const PERIODOS = [
  { key: 'hoy',    label: 'Hoy' },
  { key: 'semana', label: 'Esta semana' },
  { key: 'mes',    label: 'Este mes' },
];

const fmtFecha = str => {
  if (!str) return '—';
  const d = new Date(str.replace(' ', 'T'));
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
};

export default function VentasView({ onRegister }) {
  const [periodo, setPeriodo]         = useState('hoy');
  const [ventas, setVentas]           = useState([]);
  const [totalVentas, setTotalVentas] = useState(0);
  const [totalIngresos, setTotalIngresos] = useState(0);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/ventas?periodo=${periodo}`)
      .then(r => r.json())
      .then(data => {
        setVentas(data.ventas || []);
        setTotalVentas(data.totalVentas || 0);
        setTotalIngresos(data.totalIngresos || 0);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [periodo]);

  return (
    <div className="ventas-view">
      <div className="inventory__header">
        <h2 className="section-title">Ventas</h2>
        <button className="btn btn--primary" onClick={onRegister}>+ Registrar Venta</button>
      </div>

      <div className="ventas-toolbar">
        <div className="filter-tabs">
          {PERIODOS.map(p => (
            <button
              key={p.key}
              className={`filter-tab ${periodo === p.key ? 'filter-tab--active' : ''}`}
              onClick={() => setPeriodo(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {!loading && (
          <div className="ventas-resumen">
            <span className="ventas-resumen__item">
              <strong>{totalVentas}</strong> venta{totalVentas !== 1 ? 's' : ''}
            </span>
            <span className="ventas-resumen__sep">·</span>
            <span className="ventas-resumen__item ventas-resumen__total">
              {cop(totalIngresos)} en ingresos
            </span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="loading">Cargando ventas...</div>
      ) : ventas.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state__icon">↗</p>
          <p>No hay ventas registradas {periodo === 'hoy' ? 'hoy' : periodo === 'semana' ? 'esta semana' : 'este mes'}</p>
          <button className="btn btn--primary" onClick={onRegister}>Registrar primera venta</button>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Producto</th>
                <th>Código</th>
                <th className="td-num">Cantidad</th>
                <th className="td-num">P. Unitario</th>
                <th className="td-num">Total</th>
                <th>Notas</th>
              </tr>
            </thead>
            <tbody>
              {ventas.map(v => (
                <tr key={v.id}>
                  <td className="td-fecha">{fmtFecha(v.fecha)}</td>
                  <td><strong>{v.nombre}</strong></td>
                  <td><span className="code-badge">{v.codigo}</span></td>
                  <td className="td-num">{v.cantidad}</td>
                  <td className="td-num">{cop(v.precio_unitario)}</td>
                  <td className="td-num"><strong>{cop(v.total)}</strong></td>
                  <td>{v.notas || <span className="text-muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="tfoot-total">
                <td colSpan={3}><strong>Total</strong></td>
                <td className="td-num"><strong>{ventas.reduce((s, v) => s + v.cantidad, 0)}</strong></td>
                <td />
                <td className="td-num"><strong>{cop(totalIngresos)}</strong></td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
