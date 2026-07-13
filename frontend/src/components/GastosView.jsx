import React, { useState, useEffect, useRef } from 'react';
import { compressImage } from '../utils/image';
import ImageLightbox from './ImageLightbox';
import { cop } from '../utils/format';

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

export default function GastosView({ apiFetch }) {
  const [periodo, setPeriodo] = useState('hoy');
  const [gastos, setGastos]   = useState([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState(null);

  const [showForm, setShowForm]   = useState(false);
  const [concepto, setConcepto]   = useState('');
  const [monto, setMonto]         = useState('');
  const [recurrente, setRecurrente] = useState(false);
  const [notas, setNotas]         = useState('');
  const [imagenUrl, setImagenUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError]         = useState('');
  const [saving, setSaving]       = useState(false);
  const fileInputRef = useRef(null);

  const load = () => {
    setLoading(true);
    apiFetch(`/api/gastos?periodo=${periodo}`)
      .then(r => r.json())
      .then(d => { setGastos(d.gastos || []); setTotal(d.total || 0); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(load, [periodo]);

  const resetForm = () => {
    setConcepto(''); setMonto(''); setRecurrente(false); setNotas(''); setImagenUrl('');
    setError(''); setShowForm(false);
  };

  const handleImageUpload = async e => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const base64 = await compressImage(file);
      setImagenUrl(base64);
    } catch {
      setError('Error al procesar la imagen. Intenta de nuevo.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    const montoNum = parseFloat(monto);
    if (!concepto || !montoNum || montoNum <= 0) { setError('Ingresa un concepto y un monto válido'); return; }
    setSaving(true);
    try {
      const res = await apiFetch('/api/gastos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concepto, monto: montoNum, recurrente, imagen_url: imagenUrl || null, notas: notas || null })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al registrar el gasto');
      resetForm();
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async id => {
    if (!window.confirm('¿Eliminar este gasto?')) return;
    await apiFetch(`/api/gastos/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="gastos-view">
      {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}

      <div className="inventory__header">
        <h2 className="section-title">Gastos</h2>
        <button className="btn btn--primary" onClick={() => setShowForm(s => !s)}>
          {showForm ? 'Cancelar' : '+ Registrar gasto'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="form sale-add-section">
          <div className="form-grid">
            <div className="form-group form-group--full">
              <label>Concepto</label>
              <input value={concepto} onChange={e => setConcepto(e.target.value)} placeholder="Ej: Transporte, almuerzo, arriendo..." />
            </div>
            <div className="form-group">
              <label>Monto (COP)</label>
              <input type="number" min="0" step="0.01" value={monto} onChange={e => setMonto(e.target.value)} placeholder="0" />
            </div>
            <div className="form-group" style={{ justifyContent: 'flex-end' }}>
              <label className="checkbox-label">
                <input type="checkbox" checked={recurrente} onChange={e => setRecurrente(e.target.checked)} />
                Es un gasto recurrente (se repite cada mes)
              </label>
            </div>

            <div className="form-group form-group--full">
              <label>Comprobante <span style={{ fontWeight: 400, color: '#9A9A9A' }}>(opcional)</span></label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                style={{ position: 'absolute', width: 0, height: 0, opacity: 0, overflow: 'hidden' }}
                tabIndex={-1}
              />
              <div className="upload-row">
                <button
                  type="button"
                  className="btn btn--outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? '⏳ Subiendo...' : '↑ Subir foto del comprobante'}
                </button>
                {imagenUrl && (
                  <button type="button" className="btn-icon btn-icon--delete" onClick={() => setImagenUrl('')} title="Quitar imagen">✕</button>
                )}
              </div>
              {imagenUrl && (
                <img
                  src={imagenUrl}
                  alt="Comprobante"
                  className="img-preview img-preview--zoom"
                  onClick={() => setLightbox(imagenUrl)}
                  title="Ver imagen ampliada"
                />
              )}
            </div>

            <div className="form-group form-group--full">
              <label>Notas (opcional)</label>
              <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} placeholder="Observaciones adicionales..." />
            </div>
          </div>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar gasto'}
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
              <strong>{gastos.length}</strong> gasto{gastos.length !== 1 ? 's' : ''}
            </span>
            <span className="ventas-resumen__sep">·</span>
            <span className="ventas-resumen__item ventas-resumen__total">{cop(total)} en total</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="loading">Cargando gastos...</div>
      ) : gastos.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state__icon">◈</p>
          <p>No hay gastos registrados {periodo === 'hoy' ? 'hoy' : periodo === 'semana' ? 'esta semana' : 'este mes'}</p>
          <button className="btn btn--primary" onClick={() => setShowForm(true)}>Registrar primer gasto</button>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Foto</th><th>Fecha</th><th>Concepto</th><th className="td-num">Monto</th><th>Recurrente</th><th>Notas</th><th></th>
              </tr>
            </thead>
            <tbody>
              {gastos.map(g => (
                <tr key={g.id}>
                  <td className="td-foto">
                    {g.imagen_url ? (
                      <img src={g.imagen_url} alt="" width="40" height="40" className="img-thumb img-thumb--zoom"
                        onClick={() => setLightbox(g.imagen_url)} title="Ver comprobante" />
                    ) : <span className="img-placeholder">◈</span>}
                  </td>
                  <td className="td-fecha">{fmtFecha(g.fecha)}</td>
                  <td>{g.concepto}</td>
                  <td className="td-num"><strong>{cop(g.monto)}</strong></td>
                  <td>{g.recurrente ? <span className="badge-kit">Recurrente</span> : <span className="text-muted">—</span>}</td>
                  <td>{g.notas || <span className="text-muted">—</span>}</td>
                  <td>
                    <button className="btn-icon btn-icon--delete" onClick={() => handleDelete(g.id)} title="Eliminar">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="tfoot-total">
                <td colSpan={3}><strong>Total</strong></td>
                <td className="td-num"><strong>{cop(total)}</strong></td>
                <td /><td /><td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
