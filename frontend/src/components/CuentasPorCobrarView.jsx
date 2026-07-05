import React, { useState, useEffect } from 'react';

const cop = v =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0
  }).format(v || 0);

const fmtFecha = str => {
  const d = new Date(str);
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
};

const ESTADOS = [
  { key: 'pendiente', label: 'Pendientes' },
  { key: 'pagada',    label: 'Pagadas' },
  { key: 'todas',     label: 'Todas' },
];

function NuevaCuentaForm({ apiFetch, onDone, onCancel }) {
  const [cliente, setCliente]         = useState('');
  const [montoTotal, setMontoTotal]   = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [notas, setNotas]             = useState('');
  const [error, setError]             = useState('');
  const [saving, setSaving]           = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    const monto = parseFloat(montoTotal);
    if (!cliente || !monto || monto <= 0) { setError('Ingresa un cliente y un monto total válido'); return; }
    setSaving(true);
    try {
      const res = await apiFetch('/api/cuentas-por-cobrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente, monto_total: monto, descripcion: descripcion || null, notas: notas || null })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al crear la cuenta');
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="form sale-add-section">
      <p className="sale-section-label">Nueva cuenta por cobrar</p>
      <div className="form-grid">
        <div className="form-group">
          <label>Cliente</label>
          <input value={cliente} onChange={e => setCliente(e.target.value)} placeholder="Nombre del cliente" />
        </div>
        <div className="form-group">
          <label>Monto total de la deuda (COP)</label>
          <input type="number" min="0" step="0.01" value={montoTotal} onChange={e => setMontoTotal(e.target.value)} placeholder="0" />
        </div>
        <div className="form-group form-group--full">
          <label>Descripción (opcional)</label>
          <input value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Ej: Anillo oro 18k, apartado, etc." />
        </div>
        <div className="form-group form-group--full">
          <label>Notas (opcional)</label>
          <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} placeholder="Observaciones adicionales..." />
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn btn--outline" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? 'Creando...' : 'Crear cuenta'}
        </button>
      </div>
    </form>
  );
}

function CuentaDetalle({ apiFetch, cuentaId, onChange }) {
  const [detalle, setDetalle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [monto, setMonto]     = useState('');
  const [notas, setNotas]     = useState('');
  const [error, setError]     = useState('');
  const [saving, setSaving]   = useState(false);

  const load = () => {
    setLoading(true);
    apiFetch(`/api/cuentas-por-cobrar/${cuentaId}`)
      .then(r => r.json())
      .then(setDetalle)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(load, [cuentaId]);

  const handleAbono = async e => {
    e.preventDefault();
    setError('');
    const montoNum = parseFloat(monto);
    if (!montoNum || montoNum <= 0) { setError('Ingresa un monto válido'); return; }
    setSaving(true);
    try {
      const res = await apiFetch(`/api/cuentas-por-cobrar/${cuentaId}/abonos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monto: montoNum, notas: notas || null })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al registrar el abono');
      setMonto(''); setNotas('');
      load();
      onChange();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAbono = async id => {
    if (!window.confirm('¿Eliminar este abono?')) return;
    await apiFetch(`/api/abonos/${id}`, { method: 'DELETE' });
    load();
    onChange();
  };

  if (loading || !detalle) return <div className="loading">Cargando...</div>;

  const pagada = detalle.estado === 'pagada';

  return (
    <div className="cuenta-detalle">
      <div className="caja-resumen-grid" style={{ marginTop: 0 }}>
        <div><span className="text-muted">Monto total</span><strong>{cop(detalle.monto_total)}</strong></div>
        <div><span className="text-muted">Abonado</span><strong>{cop(detalle.monto_abonado)}</strong></div>
        <div>
          <span className="text-muted">Saldo pendiente</span>
          <strong className={pagada ? 'caja-diff--positiva' : ''}>{cop(detalle.saldo)}</strong>
        </div>
      </div>

      {!pagada && (
        <form onSubmit={handleAbono} className="form-grid" style={{ marginTop: 16 }}>
          <div className="form-group">
            <label>Monto del abono (COP)</label>
            <input type="number" min="0" step="0.01" value={monto} onChange={e => setMonto(e.target.value)} placeholder="0" />
          </div>
          <div className="form-group">
            <label>Notas (opcional)</label>
            <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Ej: pago en efectivo" />
          </div>
          <div className="form-group form-group--full">
            {error && <p className="form-error">{error}</p>}
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? 'Guardando...' : '+ Registrar abono'}
            </button>
          </div>
        </form>
      )}

      {detalle.abonos.length > 0 && (
        <div className="table-wrapper" style={{ marginTop: 16 }}>
          <table className="table">
            <thead>
              <tr><th>Fecha</th><th className="td-num">Monto</th><th>Notas</th><th></th></tr>
            </thead>
            <tbody>
              {detalle.abonos.map(a => (
                <tr key={a.id}>
                  <td className="td-fecha">{fmtFecha(a.fecha)}</td>
                  <td className="td-num"><strong>{cop(a.monto)}</strong></td>
                  <td>{a.notas || <span className="text-muted">—</span>}</td>
                  <td>
                    <button className="btn-icon btn-icon--delete" onClick={() => handleDeleteAbono(a.id)} title="Eliminar">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function CuentasPorCobrarView({ apiFetch, isGerente }) {
  const [estado, setEstado]     = useState('pendiente');
  const [cuentas, setCuentas]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const load = () => {
    setLoading(true);
    apiFetch(`/api/cuentas-por-cobrar?estado=${estado}`)
      .then(r => r.json())
      .then(setCuentas)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(load, [estado]);

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm('¿Eliminar esta cuenta y todos sus abonos?')) return;
    const res = await apiFetch(`/api/cuentas-por-cobrar/${id}`, { method: 'DELETE' });
    if (res.ok) { if (expanded === id) setExpanded(null); load(); }
  };

  const totalPendiente = cuentas.reduce((s, c) => s + (c.estado === 'pendiente' ? c.saldo : 0), 0);

  return (
    <div className="cuentas-view">
      <div className="inventory__header">
        <h2 className="section-title">Cuentas por Cobrar</h2>
        <button className="btn btn--primary" onClick={() => setShowForm(s => !s)}>
          {showForm ? 'Cancelar' : '+ Nueva cuenta'}
        </button>
      </div>

      {showForm && (
        <NuevaCuentaForm
          apiFetch={apiFetch}
          onCancel={() => setShowForm(false)}
          onDone={() => { setShowForm(false); load(); }}
        />
      )}

      <div className="ventas-toolbar">
        <div className="filter-tabs">
          {ESTADOS.map(p => (
            <button
              key={p.key}
              className={`filter-tab ${estado === p.key ? 'filter-tab--active' : ''}`}
              onClick={() => setEstado(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
        {!loading && estado === 'pendiente' && (
          <div className="ventas-resumen">
            <span className="ventas-resumen__item ventas-resumen__total">{cop(totalPendiente)} por cobrar</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="loading">Cargando cuentas...</div>
      ) : cuentas.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state__icon">◈</p>
          <p>No hay cuentas {estado === 'pendiente' ? 'pendientes' : estado === 'pagada' ? 'pagadas' : 'registradas'}</p>
          <button className="btn btn--primary" onClick={() => setShowForm(true)}>Crear primera cuenta</button>
        </div>
      ) : (
        <div className="cotizar-saved-list">
          {cuentas.map(c => (
            <div key={c.id} className={`cotizar-saved-item ${expanded === c.id ? 'cotizar-saved-item--open' : ''}`}>
              <div className="cotizar-saved-item__head" onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
                <div className="cotizar-saved-item__info">
                  <span className="cotizar-saved-item__cliente">{c.cliente}</span>
                  <span className="cotizar-saved-item__meta">
                    {c.descripcion ? `${c.descripcion} · ` : ''}{fmtFecha(c.fecha_creacion)}
                    {' · '}<span className={c.estado === 'pagada' ? 'caja-diff--positiva' : ''}>
                      {c.estado === 'pagada' ? 'Pagada' : 'Pendiente'}
                    </span>
                  </span>
                </div>
                <div className="cotizar-saved-item__right">
                  <span className="cotizar-saved-item__total">{cop(c.saldo)}</span>
                  {isGerente && (
                    <button className="btn-icon btn-icon--delete" onClick={e => handleDelete(e, c.id)} title="Eliminar cuenta">✕</button>
                  )}
                  <span className="cotizar-saved-item__arrow">{expanded === c.id ? '▲' : '▼'}</span>
                </div>
              </div>
              {expanded === c.id && (
                <div className="cotizar-saved-item__body">
                  <CuentaDetalle apiFetch={apiFetch} cuentaId={c.id} onChange={load} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
