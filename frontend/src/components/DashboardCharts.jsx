import React, { useState, useEffect } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, Cell
} from 'recharts';
import { cop, copCompact } from '../utils/format';

// Colores fijos por categoría — mismo orden que el resto de la app, validados para daltonismo.
const COLOR_CATEGORIA = {
  'Oro 18k':    '#B8960C',
  'Laminado':   '#1565C0',
  'Bisutería':  '#8E24AA',
  'Accesorios': '#2E7D32',
  'Otro':       '#B85C38'
};
const COLOR_FALLBACK = '#8A8A8A';

const fmtDiaCorto = str => {
  const d = new Date(str);
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' });
};

function TooltipVentas({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip__label">{fmtDiaCorto(label)}</p>
      <p className="chart-tooltip__value">{cop(payload[0].value)}</p>
    </div>
  );
}

function TooltipCategoria({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { categoria, total } = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip__label">{categoria}</p>
      <p className="chart-tooltip__value">{cop(total)}</p>
    </div>
  );
}

export default function DashboardCharts({ apiFetch }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    apiFetch('/api/dashboard/graficos')
      .then(r => r.json())
      .then(d => alive && setData(d))
      .catch(console.error)
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  if (loading) return <div className="loading">Cargando gráficos...</div>;
  if (!data) return null;

  const hayVentas14d   = data.ventasPorDia.some(d => d.total > 0);
  const hayCategorias  = data.ventasPorCategoria.length > 0;
  const hayTop         = data.topProductos.length > 0;

  return (
    <div className="charts-grid">
      <div className="chart-card chart-card--wide">
        <h3 className="chart-card__title">Ventas — últimos 14 días</h3>
        {hayVentas14d ? (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.ventasPorDia} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--gray-200)" />
              <XAxis
                dataKey="dia" tickFormatter={fmtDiaCorto}
                tick={{ fontSize: 11, fill: 'var(--gray-600)' }}
                axisLine={{ stroke: 'var(--gray-200)' }} tickLine={false}
              />
              <YAxis
                tickFormatter={copCompact}
                tick={{ fontSize: 11, fill: 'var(--gray-600)' }}
                axisLine={false} tickLine={false} width={54}
              />
              <Tooltip content={<TooltipVentas />} cursor={{ stroke: 'var(--gray-200)' }} />
              <Line
                type="monotone" dataKey="total"
                stroke="var(--gold)" strokeWidth={2}
                dot={{ r: 3, fill: 'var(--gold)', strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="chart-empty">Sin ventas registradas en los últimos 14 días.</p>
        )}
      </div>

      <div className="chart-card">
        <h3 className="chart-card__title">Ventas por categoría (30 días)</h3>
        {hayCategorias ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.ventasPorCategoria} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--gray-200)" />
              <XAxis
                dataKey="categoria"
                tick={{ fontSize: 11, fill: 'var(--gray-600)' }}
                axisLine={{ stroke: 'var(--gray-200)' }} tickLine={false}
              />
              <YAxis
                tickFormatter={copCompact}
                tick={{ fontSize: 11, fill: 'var(--gray-600)' }}
                axisLine={false} tickLine={false} width={54}
              />
              <Tooltip content={<TooltipCategoria />} cursor={{ fill: 'var(--gray-100)' }} />
              <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={44}>
                {data.ventasPorCategoria.map((d, i) => (
                  <Cell key={i} fill={COLOR_CATEGORIA[d.categoria] || COLOR_FALLBACK} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="chart-empty">Sin ventas registradas en los últimos 30 días.</p>
        )}
      </div>

      <div className="chart-card">
        <h3 className="chart-card__title">Top 5 productos (30 días)</h3>
        {hayTop ? (
          <div className="top-productos-list">
            {data.topProductos.map((p, i) => (
              <div key={p.codigo} className="top-productos-item">
                <span className="top-productos-item__rank">{i + 1}</span>
                <div className="top-productos-item__info">
                  <span className="top-productos-item__name">{p.nombre}</span>
                  <span className="code-badge">{p.codigo}</span>
                </div>
                <div className="top-productos-item__nums">
                  <strong>{p.unidades} und.</strong>
                  <span className="text-muted">{cop(p.ingresos)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="chart-empty">Sin ventas registradas en los últimos 30 días.</p>
        )}
      </div>
    </div>
  );
}
