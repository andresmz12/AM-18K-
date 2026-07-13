import React, { useState, useEffect } from 'react';
import { cop } from '../utils/format';

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

export default function VentasView({ onRegister, apiFetch }) {
  const [periodo, setPeriodo]         = useState('hoy');
  const [items, setItems]             = useState([]); // ventas + kits combinadas
  const [totalVentas, setTotalVentas] = useState(0);
  const [totalIngresos, setTotalIngresos] = useState(0);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiFetch(`/api/ventas?periodo=${periodo}`).then(r => r.json()),
      apiFetch(`/api/kit-sales?periodo=${periodo}`).then(r => r.json())
    ])
      .then(([ventasData, kitsData]) => {
        // Combinar ventas simples
        const ventasSimples = (ventasData.ventas || []).map(v => ({
          ...v,
          tipo: 'simple',
          displayName: v.nombre,
          displayCode: v.codigo,
          displayQuantity: v.cantidad,
          displayTotal: v.total
        }));

        // Combinar kit sales
        const kitSales = (kitsData.kit_sales || []).map(k => ({
          ...k,
          tipo: 'kit',
          id: 'kit_' + k.id,
          displayName: k.nombre_kit,
          displayCode: '🎀',
          displayQuantity: 1,
          displayTotal: k.total
        }));

        // Fusionar y ordenar por fecha (descendente)
        const todos = [...ventasSimples, ...kitSales].sort((a, b) =>
          new Date(b.fecha) - new Date(a.fecha)
        );

        setItems(todos);
        setTotalVentas(todos.length);
        setTotalIngresos(todos.reduce((s, v) => s + v.displayTotal, 0));
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
              <strong>{totalVentas}</strong> transacción{totalVentas !== 1 ? 'es' : ''}
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
      ) : items.length === 0 ? (
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
                <th>Producto / Kit</th>
                <th>Código</th>
                <th className="td-num">Cantidad</th>
                <th className="td-num">Total</th>
                <th>Notas</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className={item.tipo === 'kit' ? 'row-kit' : ''}>
                  <td className="td-fecha">{fmtFecha(item.fecha)}</td>
                  <td>
                    <strong>{item.displayName}</strong>
                    {item.tipo === 'kit' && <span className="badge-kit">Kit</span>}
                  </td>
                  <td>
                    <span className="code-badge" style={{opacity: item.tipo === 'kit' ? 0.6 : 1}}>
                      {item.displayCode}
                    </span>
                  </td>
                  <td className="td-num">{item.displayQuantity}</td>
                  <td className="td-num"><strong>{cop(item.displayTotal)}</strong></td>
                  <td>{item.notas ? item.notas : item.cliente ? `Cliente: ${item.cliente}` : <span className="text-muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="tfoot-total">
                <td colSpan={3}><strong>Total</strong></td>
                <td className="td-num"><strong>{items.length}</strong></td>
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
