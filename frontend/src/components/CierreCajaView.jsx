import React, { useState, useEffect } from 'react';

const cop = v =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0
  }).format(v || 0);

const fmtFecha = str => new Date(str).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });

export default function CierreCajaView({ apiFetch }) {
  const [resumen, setResumen]   = useState(null);
  const [gastos, setGastos]     = useState([]);
  const [historial, setHistorial] = useState([]);
  const [loading, setLoading]   = useState(true);

  const [apertura, setApertura]         = useState('');
  const [abonos, setAbonos]             = useState('');
  const [dineroEfectivo, setDineroEfectivo] = useState('');
  const [dineroCuenta, setDineroCuenta]     = useState('');
  const [notas, setNotas]               = useState('');
  const [error, setError]               = useState('');
  const [saving, setSaving]             = useState(false);

  const [showGastoForm, setShowGastoForm] = useState(false);
  const [gastoConcepto, setGastoConcepto] = useState('');
  const [gastoMonto, setGastoMonto]       = useState('');
  const [gastoError, setGastoError]       = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([
      apiFetch('/api/cierres/hoy').then(r => r.json()),
      apiFetch('/api/gastos?periodo=hoy').then(r => r.json()),
      apiFetch('/api/cierres').then(r => r.json())
    ]).then(([hoy, gastosData, hist]) => {
      setResumen(hoy);
      setGastos(gastosData.gastos || []);
      setHistorial(hist);
    }).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleAddGasto = async e => {
    e.preventDefault();
    setGastoError('');
    const monto = parseFloat(gastoMonto);
    if (!gastoConcepto || !monto || monto <= 0) {
      setGastoError('Ingresa un concepto y un monto válido');
      return;
    }
    const res = await apiFetch('/api/gastos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ concepto: gastoConcepto, monto })
    });
    if (res.ok) {
      setGastoConcepto(''); setGastoMonto(''); setShowGastoForm(false);
      load();
    } else {
      const data = await res.json();
      setGastoError(data.error || 'Error al agregar el gasto');
    }
  };

  const handleDeleteGasto = async id => {
    if (!window.confirm('¿Eliminar este gasto?')) return;
    await apiFetch(`/api/gastos/${id}`, { method: 'DELETE' });
    load();
  };

  const aperturaNum = parseFloat(apertura) || 0;
  const abonosNum   = parseFloat(abonos) || 0;
  const efectivoNum = parseFloat(dineroEfectivo) || 0;
  const cuentaNum   = parseFloat(dineroCuenta) || 0;
  const ventas      = resumen?.ventas || 0;
  const gastosDia   = resumen?.gastos || 0;
  const totalEsperado = aperturaNum + ventas + abonosNum - gastosDia;
  const diferencia    = (efectivoNum + cuentaNum) - totalEsperado;

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await apiFetch('/api/cierres', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apertura: aperturaNum, abonos: abonosNum,
          dinero_efectivo: efectivoNum, dinero_cuenta: cuentaNum,
          notas: notas || null
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al cerrar la caja');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading">Cargando caja...</div>;

  const yaCerrada = !!resumen?.cierre;

  return (
    <div className="caja-view">
      <div className="inventory__header">
        <h2 className="section-title">Cierre de Caja — Hoy</h2>
      </div>

      {yaCerrada ? (
        <div className="caja-resumen-card">
          <p className="sale-section-label">Caja ya cerrada hoy — por {resumen.cierre.usuario_nombre}</p>
          <div className="caja-resumen-grid">
            <div><span className="text-muted">Apertura</span><strong>{cop(resumen.cierre.apertura)}</strong></div>
            <div><span className="text-muted">Ventas + abonos</span><strong>{cop(resumen.cierre.ventas + resumen.cierre.abonos)}</strong></div>
            <div><span className="text-muted">Gastos</span><strong>{cop(resumen.cierre.gastos)}</strong></div>
            <div><span className="text-muted">Total esperado</span><strong>{cop(resumen.cierre.total_esperado)}</strong></div>
            <div><span className="text-muted">Efectivo + cuenta</span><strong>{cop(resumen.cierre.dinero_efectivo + resumen.cierre.dinero_cuenta)}</strong></div>
            <div>
              <span className="text-muted">Diferencia</span>
              <strong className={resumen.cierre.diferencia === 0 ? '' : resumen.cierre.diferencia > 0 ? 'caja-diff--positiva' : 'caja-diff--negativa'}>
                {cop(resumen.cierre.diferencia)}
              </strong>
            </div>
          </div>
          {resumen.cierre.notas && <p className="caja-resumen-notas"><strong>Notas:</strong> {resumen.cierre.notas}</p>}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="form">
          <div className="caja-grid">
            <div className="sale-add-section">
              <p className="sale-section-label">Dinero de apertura del día</p>
              <div className="form-group">
                <label>Apertura (COP)</label>
                <input type="number" min="0" step="0.01" value={apertura} onChange={e => setApertura(e.target.value)} placeholder="0" />
              </div>
            </div>

            <div className="sale-add-section">
              <p className="sale-section-label">Ventas + abonos</p>
              <div className="form-group">
                <label>Ventas de hoy (automático)</label>
                <div className="precio-display">{cop(ventas)}</div>
              </div>
              <div className="form-group">
                <label>Abonos recibidos (COP)</label>
                <input type="number" min="0" step="0.01" value={abonos} onChange={e => setAbonos(e.target.value)} placeholder="0" />
              </div>
            </div>
          </div>

          <div className="sale-add-section">
            <div className="inventory__header" style={{ marginBottom: 0 }}>
              <p className="sale-section-label">Gastos de hoy — {cop(gastosDia)}</p>
              <button type="button" className="btn btn--outline" onClick={() => setShowGastoForm(s => !s)}>
                {showGastoForm ? 'Cancelar' : '+ Agregar gasto'}
              </button>
            </div>

            {showGastoForm && (
              <div className="form-grid" style={{ marginTop: 10 }}>
                <div className="form-group">
                  <label>Concepto</label>
                  <input value={gastoConcepto} onChange={e => setGastoConcepto(e.target.value)} placeholder="Ej: Transporte, almuerzo..." />
                </div>
                <div className="form-group">
                  <label>Monto (COP)</label>
                  <input type="number" min="0" step="0.01" value={gastoMonto} onChange={e => setGastoMonto(e.target.value)} placeholder="0" />
                </div>
                <div className="form-group form-group--full">
                  {gastoError && <p className="form-error">{gastoError}</p>}
                  <button type="button" className="btn btn--primary" onClick={handleAddGasto}>Guardar gasto</button>
                </div>
              </div>
            )}

            {gastos.length > 0 && (
              <div className="sale-cart-list" style={{ marginTop: 12 }}>
                {gastos.map(g => (
                  <div key={g.id} className="sale-cart-item">
                    <div className="sale-cart-item__info">
                      <span className="sale-cart-item__name">{g.concepto}</span>
                    </div>
                    <div className="sale-cart-item__nums">
                      <strong className="sale-cart-item__sub">{cop(g.monto)}</strong>
                    </div>
                    <button type="button" className="btn-icon btn-icon--delete" onClick={() => handleDeleteGasto(g.id)} title="Quitar">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="caja-grid">
            <div className="form-group">
              <label>Dinero en efectivo (COP)</label>
              <input type="number" min="0" step="0.01" value={dineroEfectivo} onChange={e => setDineroEfectivo(e.target.value)} placeholder="0" />
            </div>
            <div className="form-group">
              <label>Dinero en cuenta (COP)</label>
              <input type="number" min="0" step="0.01" value={dineroCuenta} onChange={e => setDineroCuenta(e.target.value)} placeholder="0" />
            </div>
          </div>

          <div className="caja-total-breakdown">
            <div className="total-row"><span>Apertura:</span><span>{cop(aperturaNum)}</span></div>
            <div className="total-row"><span>Ventas:</span><span>{cop(ventas)}</span></div>
            <div className="total-row"><span>Abonos:</span><span>{cop(abonosNum)}</span></div>
            <div className="total-row"><span>Gastos:</span><span>-{cop(gastosDia)}</span></div>
            <div className="sale-total-row">
              <span className="sale-total-label">Total esperado en caja</span>
              <div className="precio-display precio-display--lg">{cop(totalEsperado)}</div>
            </div>
            <div className="sale-total-row">
              <span className="sale-total-label">Diferencia (efectivo + cuenta vs. esperado)</span>
              <div className={`precio-display precio-display--lg ${diferencia === 0 ? '' : diferencia > 0 ? 'caja-diff--positiva' : 'caja-diff--negativa'}`}>
                {cop(diferencia)}
              </div>
            </div>
          </div>

          <div className="form-group">
            <label>Notas</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} placeholder="Observaciones del cierre..." />
          </div>

          {error && <p className="form-error">{error}</p>}

          <div className="form-actions">
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? 'Cerrando caja...' : 'Cerrar caja del día'}
            </button>
          </div>
        </form>
      )}

      {historial.length > 0 && (
        <div className="cat-stats">
          <h3 className="cat-stats__title">Historial de cierres</h3>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th><th>Cerrado por</th>
                  <th className="td-num">Apertura</th>
                  <th className="td-num">Ventas+Abonos</th>
                  <th className="td-num">Gastos</th>
                  <th className="td-num">Esperado</th>
                  <th className="td-num">Efectivo+Cuenta</th>
                  <th className="td-num">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {historial.map(c => (
                  <tr key={c.id}>
                    <td>{fmtFecha(c.fecha)}</td>
                    <td>{c.usuario_nombre}</td>
                    <td className="td-num">{cop(c.apertura)}</td>
                    <td className="td-num">{cop(c.ventas + c.abonos)}</td>
                    <td className="td-num">{cop(c.gastos)}</td>
                    <td className="td-num">{cop(c.total_esperado)}</td>
                    <td className="td-num">{cop(c.dinero_efectivo + c.dinero_cuenta)}</td>
                    <td className={`td-num ${c.diferencia === 0 ? '' : c.diferencia > 0 ? 'caja-diff--positiva' : 'caja-diff--negativa'}`}>
                      {cop(c.diferencia)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
