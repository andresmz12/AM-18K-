import React, { useState, useEffect, useRef } from 'react';
import { cop } from '../utils/format';

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
  const [proveedor, setProveedor]     = useState('');
  const [montoTotal, setMontoTotal]   = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [notas, setNotas]             = useState('');
  const [error, setError]             = useState('');
  const [saving, setSaving]           = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    if (!proveedor) { setError('Ingresa el nombre del proveedor o persona'); return; }
    const monto = parseFloat(montoTotal);
    if (!monto || monto <= 0) { setError('Ingresa un monto total válido'); return; }
    setSaving(true);
    try {
      const res = await apiFetch('/api/cuentas-por-pagar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proveedor, monto_total: monto, descripcion: descripcion || null, notas: notas || null })
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
      <p className="sale-section-label">Nueva cuenta por pagar</p>
      <div className="form-grid">
        <div className="form-group">
          <label>Proveedor / Persona</label>
          <input value={proveedor} onChange={e => setProveedor(e.target.value)} placeholder="A quién se le debe" />
        </div>
        <div className="form-group">
          <label>Monto total de la deuda (COP)</label>
          <input type="number" min="0" step="0.01" value={montoTotal} onChange={e => setMontoTotal(e.target.value)} placeholder="0" />
        </div>
        <div className="form-group form-group--full">
          <label>Descripción (opcional)</label>
          <input value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Ej: Compra de material, préstamo, etc." />
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

function CuentaDetalle({ apiFetch, cuentaId, onChange, isGerente }) {
  const [detalle, setDetalle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [monto, setMonto]     = useState('');
  const [notas, setNotas]     = useState('');
  const [error, setError]     = useState('');
  const [saving, setSaving]   = useState(false);
  const [editId, setEditId]     = useState(null);
  const [editMonto, setEditMonto] = useState('');
  const [editNotas, setEditNotas] = useState('');
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const load = () => {
    setLoading(true);
    apiFetch(`/api/cuentas-por-pagar/${cuentaId}`)
      .then(r => r.json())
      .then(setDetalle)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(load, [cuentaId]);

  const handlePago = async e => {
    e.preventDefault();
    setError('');
    const montoNum = parseFloat(monto);
    if (!montoNum || montoNum <= 0) { setError('Ingresa un monto válido'); return; }
    setSaving(true);
    try {
      const res = await apiFetch(`/api/cuentas-por-pagar/${cuentaId}/pagos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monto: montoNum, notas: notas || null })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al registrar el pago');
      setMonto(''); setNotas('');
      load();
      onChange();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePago = async id => {
    if (!window.confirm('¿Eliminar este pago?')) return;
    await apiFetch(`/api/pagos/${id}`, { method: 'DELETE' });
    load();
    onChange();
  };

  const startEditPago = p => {
    setEditId(p.id);
    setEditMonto(String(p.monto));
    setEditNotas(p.notas || '');
    setEditError('');
  };

  const cancelEditPago = () => setEditId(null);

  const handleSavePago = async id => {
    setEditError('');
    const montoNum = parseFloat(editMonto);
    if (!montoNum || montoNum <= 0) { setEditError('Ingresa un monto válido'); return; }
    setEditSaving(true);
    try {
      const res = await apiFetch(`/api/pagos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monto: montoNum, notas: editNotas || null })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al actualizar el pago');
      setEditId(null);
      load();
      onChange();
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditSaving(false);
    }
  };

  if (loading || !detalle) return <div className="loading">Cargando...</div>;

  const pagada = detalle.estado === 'pagada';

  return (
    <div className="cuenta-detalle">
      <div className="caja-resumen-grid" style={{ marginTop: 0 }}>
        <div><span className="text-muted">Monto total</span><strong>{cop(detalle.monto_total)}</strong></div>
        <div><span className="text-muted">Pagado</span><strong>{cop(detalle.monto_pagado)}</strong></div>
        <div>
          <span className="text-muted">Saldo pendiente</span>
          <strong className={pagada ? 'caja-diff--positiva' : ''}>{cop(detalle.saldo)}</strong>
        </div>
      </div>

      {!pagada && (
        <form onSubmit={handlePago} className="form-grid" style={{ marginTop: 16 }}>
          <div className="form-group">
            <label>Monto del pago (COP)</label>
            <input type="number" min="0" step="0.01" value={monto} onChange={e => setMonto(e.target.value)} placeholder="0" />
          </div>
          <div className="form-group">
            <label>Notas (opcional)</label>
            <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Ej: pago en efectivo" />
          </div>
          <div className="form-group form-group--full">
            {error && <p className="form-error">{error}</p>}
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? 'Guardando...' : '+ Registrar pago'}
            </button>
          </div>
        </form>
      )}

      {detalle.pagos.length > 0 && (
        <div className="table-wrapper" style={{ marginTop: 16 }}>
          <table className="table">
            <thead>
              <tr><th>Fecha</th><th className="td-num">Monto</th><th>Notas</th><th></th></tr>
            </thead>
            <tbody>
              {detalle.pagos.map(p => (
                editId === p.id ? (
                  <tr key={p.id}>
                    <td className="td-fecha">{fmtFecha(p.fecha)}</td>
                    <td className="td-num">
                      <input type="number" min="0" step="0.01" value={editMonto}
                        onChange={e => setEditMonto(e.target.value)} style={{ width: 110 }} />
                    </td>
                    <td>
                      <input value={editNotas} onChange={e => setEditNotas(e.target.value)} placeholder="Notas" />
                      {editError && <p className="form-error">{editError}</p>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button type="button" className="btn-icon btn-icon--edit" title="Guardar" disabled={editSaving}
                        onClick={() => handleSavePago(p.id)}>✓</button>
                      <button type="button" className="btn-icon" title="Cancelar" onClick={cancelEditPago}>✕</button>
                    </td>
                  </tr>
                ) : (
                  <tr key={p.id}>
                    <td className="td-fecha">{fmtFecha(p.fecha)}</td>
                    <td className="td-num"><strong>{cop(p.monto)}</strong></td>
                    <td>{p.notas || <span className="text-muted">—</span>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {isGerente && (
                        <button className="btn-icon btn-icon--edit" title="Editar" onClick={() => startEditPago(p)}>✎</button>
                      )}
                      <button className="btn-icon btn-icon--delete" onClick={() => handleDeletePago(p.id)} title="Eliminar">✕</button>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function CuentasPorPagarView({ apiFetch, isGerente }) {
  const [estado, setEstado]     = useState('pendiente');
  const [cuentas, setCuentas]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [editId, setEditId]         = useState(null);
  const [editProveedor, setEditProveedor]     = useState('');
  const [editDescripcion, setEditDescripcion] = useState('');
  const [editError, setEditError]   = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const loadToken = useRef(0);

  const load = () => {
    const token = ++loadToken.current;
    setLoading(true);
    apiFetch(`/api/cuentas-por-pagar?estado=${estado}`)
      .then(r => r.json())
      .then(d => { if (loadToken.current === token) setCuentas(d); })
      .catch(console.error)
      .finally(() => { if (loadToken.current === token) setLoading(false); });
  };

  useEffect(load, [estado]);

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm('¿Eliminar esta cuenta y todos sus pagos?')) return;
    const res = await apiFetch(`/api/cuentas-por-pagar/${id}`, { method: 'DELETE' });
    if (res.ok) { if (expanded === id) setExpanded(null); load(); }
  };

  const startEdit = (e, c) => {
    e.stopPropagation();
    setEditId(c.id);
    setEditProveedor(c.proveedor);
    setEditDescripcion(c.descripcion || '');
    setEditError('');
  };

  const cancelEdit = e => { e.stopPropagation(); setEditId(null); };

  const handleSaveEdit = async (e, id) => {
    e.stopPropagation();
    setEditError('');
    if (!editProveedor.trim()) { setEditError('El nombre del proveedor o persona es requerido'); return; }
    setEditSaving(true);
    try {
      const res = await apiFetch(`/api/cuentas-por-pagar/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proveedor: editProveedor, descripcion: editDescripcion || null })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al actualizar la cuenta');
      setEditId(null);
      load();
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditSaving(false);
    }
  };

  const totalPendiente = cuentas.reduce((s, c) => s + (c.estado === 'pendiente' ? c.saldo : 0), 0);

  return (
    <div className="cuentas-view">
      <div className="inventory__header">
        <h2 className="section-title">Cuentas por Pagar</h2>
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
            <span className="ventas-resumen__item ventas-resumen__total">{cop(totalPendiente)} por pagar</span>
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
              {editId === c.id ? (
                <div className="cotizar-saved-item__head" onClick={e => e.stopPropagation()}>
                  <div className="form-grid" style={{ flex: 1, marginRight: 10 }}>
                    <div className="form-group">
                      <input value={editProveedor} onChange={e => setEditProveedor(e.target.value)} placeholder="Proveedor o persona" />
                    </div>
                    <div className="form-group">
                      <input value={editDescripcion} onChange={e => setEditDescripcion(e.target.value)} placeholder="Descripción (opcional)" />
                    </div>
                  </div>
                  <div className="cotizar-saved-item__right">
                    {editError && <p className="form-error">{editError}</p>}
                    <button type="button" className="btn btn--primary" disabled={editSaving} onClick={e => handleSaveEdit(e, c.id)}>
                      {editSaving ? 'Guardando...' : 'Guardar'}
                    </button>
                    <button type="button" className="btn btn--outline" onClick={cancelEdit}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <div className="cotizar-saved-item__head" onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
                  <div className="cotizar-saved-item__info">
                    <span className="cotizar-saved-item__cliente">{c.proveedor}</span>
                    <span className="cotizar-saved-item__meta">
                      {c.descripcion ? `${c.descripcion} · ` : ''}{fmtFecha(c.fecha_creacion)}
                      {' · '}<span className={c.estado === 'pagada' ? 'caja-diff--positiva' : ''}>
                        {c.estado === 'pagada' ? 'Pagada' : 'Pendiente'}
                      </span>
                    </span>
                  </div>
                  <div className="cotizar-saved-item__right">
                    <span className="cotizar-saved-item__total">{cop(c.saldo)}</span>
                    <button className="btn-icon btn-icon--edit" title="Editar proveedor/descripción" onClick={e => startEdit(e, c)}>✎</button>
                    {isGerente && (
                      <button className="btn-icon btn-icon--delete" onClick={e => handleDelete(e, c.id)} title="Eliminar cuenta">✕</button>
                    )}
                    <span className="cotizar-saved-item__arrow">{expanded === c.id ? '▲' : '▼'}</span>
                  </div>
                </div>
              )}
              {expanded === c.id && (
                <div className="cotizar-saved-item__body">
                  <CuentaDetalle apiFetch={apiFetch} cuentaId={c.id} onChange={load} isGerente={isGerente} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
