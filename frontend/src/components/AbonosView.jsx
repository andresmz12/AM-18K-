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
  const d = new Date(str);
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
};

export default function AbonosView({ apiFetch }) {
  const [periodo, setPeriodo] = useState('hoy');
  const [abonos, setAbonos]   = useState([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [cliente, setCliente]   = useState('');
  const [monto, setMonto]       = useState('');
  const [notas, setNotas]       = useState('');
  const [error, setError]       = useState('');
  const [saving, setSaving]     = useState(false);

  const load = () => {
    setLoading(true);
    apiFetch(`/api/abonos?periodo=${periodo}`)
      .then(r => r.json())
      .then(d => { setAbonos(d.abonos || []); setTotal(d.total || 0); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(load, [periodo]);

  const resetForm = () => { setCliente(''); setMonto(''); setNotas(''); setError(''); setShowForm(false); };

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    const montoNum = parseFloat(monto);
    if (!montoNum || montoNum <= 0) { setError('Ingresa un monto válido'); return; }
    setSaving(true);
    try {
      const res = await apiFetch('/api/abonos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente: cliente || null, monto: montoNum, notas: notas || null })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al registrar el abono');
      resetForm();
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async id => {
    if (!window.confirm('¿Eliminar este abono?')) return;
    await apiFetch(`/api/abonos/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="abonos-view">
      <div className="inventory__header">
        <h2 className="section-title">Abonos</h2>
        <button className="btn btn--primary" onClick={() => setShowForm(s => !s)}>
          {showForm ? 'Cancelar' : '+ Registrar abono'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="form sale-add-section">
          <div className="form-grid">
            <div className="form-group">
              <label>Cliente (opcional)</label>
              <input value={cliente} onChange={e => setCliente(e.target.value)} placeholder="Nombre del cliente" />
            </div>
            <div className="form-group">
              <label>Monto (COP)</label>
              <input type="number" min="0" step="0.01" value={monto} onChange={e => setMonto(e.target.value)} placeholder="0" />
            </div>
            <div className="form-group form-group--full">
              <label>Notas (opcional)</label>
              <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} placeholder="Ej: abono a cotización #12, apartado, etc." />
            </div>
          </div>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar abono'}
          </button>
        </form>
      )}

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
              <strong>{abonos.length}</strong> abono{abonos.length !== 1 ? 's' : ''}
            </span>
            <span className="ventas-resumen__sep">·</span>
            <span className="ventas-resumen__item ventas-resumen__total">{cop(total)} recibidos</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="loading">Cargando abonos...</div>
      ) : abonos.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state__icon">◈</p>
          <p>No hay abonos registrados {periodo === 'hoy' ? 'hoy' : periodo === 'semana' ? 'esta semana' : 'este mes'}</p>
          <button className="btn btn--primary" onClick={() => setShowForm(true)}>Registrar primer abono</button>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th><th>Cliente</th><th className="td-num">Monto</th><th>Notas</th><th></th>
              </tr>
            </thead>
            <tbody>
              {abonos.map(a => (
                <tr key={a.id}>
                  <td className="td-fecha">{fmtFecha(a.fecha)}</td>
                  <td>{a.cliente || <span className="text-muted">—</span>}</td>
                  <td className="td-num"><strong>{cop(a.monto)}</strong></td>
                  <td>{a.notas || <span className="text-muted">—</span>}</td>
                  <td>
                    <button className="btn-icon btn-icon--delete" onClick={() => handleDelete(a.id)} title="Eliminar">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="tfoot-total">
                <td colSpan={2}><strong>Total</strong></td>
                <td className="td-num"><strong>{cop(total)}</strong></td>
                <td /><td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
