import React, { useState } from 'react';

const REPORTES = [
  { tipo: 'inventario',     titulo: 'Inventario',     descripcion: 'Todos los productos con costo, precio de venta y stock actual.', usaPeriodo: false },
  { tipo: 'ventas',         titulo: 'Ventas',         descripcion: 'Ventas simples y kits vendidos, con vendedor y total.', usaPeriodo: true },
  { tipo: 'gastos',         titulo: 'Gastos',         descripcion: 'Gastos registrados, con marca de recurrentes.', usaPeriodo: true },
  { tipo: 'top-empleados',  titulo: 'Top Empleados',  descripcion: 'Ranking de vendedores por monto total vendido.', usaPeriodo: true },
];

const PERIODOS = [
  { key: 'hoy',    label: 'Hoy' },
  { key: 'semana', label: 'Esta semana' },
  { key: 'mes',    label: 'Este mes' },
  { key: 'todo',   label: 'Todo' },
];

function ReporteCard({ apiFetch, tipo, titulo, descripcion, usaPeriodo }) {
  const [periodo, setPeriodo] = useState('mes');
  const [descargando, setDescargando] = useState('');

  const descargar = async formato => {
    setDescargando(formato);
    try {
      const params = new URLSearchParams({ formato, ...(usaPeriodo ? { periodo } : {}) });
      const res = await apiFetch(`/api/reportes/${tipo}?${params}`);
      if (!res.ok) throw new Error('Error al generar el reporte');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${tipo}.${formato === 'pdf' ? 'pdf' : 'xlsx'}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message);
    } finally {
      setDescargando('');
    }
  };

  return (
    <div className="reporte-card">
      <h3 className="reporte-card__title">{titulo}</h3>
      <p className="reporte-card__desc">{descripcion}</p>

      {usaPeriodo && (
        <div className="filter-tabs reporte-card__periodo">
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
      )}

      <div className="reporte-card__actions">
        <button className="btn btn--outline" onClick={() => descargar('xlsx')} disabled={!!descargando}>
          {descargando === 'xlsx' ? 'Generando...' : '⬇ Excel'}
        </button>
        <button className="btn btn--primary" onClick={() => descargar('pdf')} disabled={!!descargando}>
          {descargando === 'pdf' ? 'Generando...' : '⬇ PDF'}
        </button>
      </div>
    </div>
  );
}

export default function ReportesView({ apiFetch }) {
  return (
    <div className="reportes-view">
      <div className="inventory__header">
        <h2 className="section-title">Reportes</h2>
      </div>
      <div className="reportes-grid">
        {REPORTES.map(r => <ReporteCard key={r.tipo} apiFetch={apiFetch} {...r} />)}
      </div>
    </div>
  );
}
