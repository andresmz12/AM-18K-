import React, { useState, useEffect } from 'react';

const cop = v =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0
  }).format(v || 0);

const fmtFecha = str => {
  const d = str ? new Date(str) : new Date();
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
};

const fmtFechaCorta = str => {
  const d = new Date(str);
  const hoy = new Date();
  const ayer = new Date(); ayer.setDate(ayer.getDate() - 1);
  if (d.toDateString() === hoy.toDateString()) return 'Hoy ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === ayer.toDateString()) return 'Ayer ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function CotizarView({ products, apiFetch }) {
  // ── Estado carrito ──────────────────────────────────────────────────────────
  const [cart, setCart]           = useState([]);
  const [productoId, setProductoId] = useState('');
  const [busqueda, setBusqueda]   = useState('');
  const [cantidad, setCantidad]   = useState('1');
  const [precio, setPrecio]       = useState('');
  const [cliente, setCliente]     = useState('');
  const [notas, setNotas]         = useState('');

  // ── Estado cotizaciones guardadas ───────────────────────────────────────────
  const [saved, setSaved]         = useState([]);
  const [saving, setSaving]       = useState(false);
  const [expanded, setExpanded]   = useState(null);  // id de la cotización abierta
  const [savedMsg, setSavedMsg]   = useState('');

  const producto    = products.find(p => p.id === Number(productoId));
  const cantidadNum = parseInt(cantidad)  || 0;
  const precioNum   = parseFloat(precio)  || 0;
  const total       = cart.reduce((s, i) => s + i.subtotal, 0);

  const busquedaNorm = busqueda.trim().toLowerCase();
  const productosFiltrados = busquedaNorm
    ? products.filter(p =>
        p.nombre.toLowerCase().includes(busquedaNorm) ||
        p.codigo.toLowerCase().includes(busquedaNorm) ||
        (p.categoria || '').toLowerCase().includes(busquedaNorm)
      )
    : products;

  useEffect(() => {
    if (producto) setPrecio(String(producto.precio_venta));
  }, [productoId]);

  // Cargar cotizaciones guardadas al montar
  useEffect(() => {
    apiFetch('/api/cotizaciones')
      .then(r => r.json())
      .then(setSaved)
      .catch(console.error);
  }, []);

  // ── Carrito ─────────────────────────────────────────────────────────────────
  const addToCart = () => {
    if (!producto || !cantidadNum || !precioNum) return;
    setCart(prev => [
      ...prev,
      {
        nombre:          producto.nombre,
        codigo:          producto.codigo,
        cantidad:        cantidadNum,
        precio_unitario: precioNum,
        subtotal:        cantidadNum * precioNum
      }
    ]);
    setProductoId(''); setCantidad('1'); setPrecio(''); setBusqueda('');
  };

  const removeFromCart = idx => setCart(prev => prev.filter((_, i) => i !== idx));

  const handleNew = () => {
    setCart([]); setCliente(''); setNotas('');
    setProductoId(''); setCantidad('1'); setPrecio(''); setBusqueda('');
  };

  // ── Guardar en DB ────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (cart.length === 0) return;
    setSaving(true);
    try {
      const res = await apiFetch('/api/cotizaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente, items: cart, total, notas })
      });
      if (res.ok) {
        const data = await res.json();
        setSaved(prev => [data, ...prev]);
        setSavedMsg('Cotización guardada ✓');
        setTimeout(() => setSavedMsg(''), 3000);
      }
    } finally {
      setSaving(false);
    }
  };

  // ── Eliminar guardada ────────────────────────────────────────────────────────
  const handleDelete = async id => {
    if (!window.confirm('¿Eliminar esta cotización?')) return;
    await apiFetch(`/api/cotizaciones/${id}`, { method: 'DELETE' });
    setSaved(prev => prev.filter(c => c.id !== id));
    if (expanded === id) setExpanded(null);
  };

  // ── Imprimir guardada ────────────────────────────────────────────────────────
  const handlePrintSaved = id => {
    setExpanded(id);
    setTimeout(() => window.print(), 200);
  };

  // Cotización actualmente expandida
  const expandedCot = saved.find(c => c.id === expanded);

  return (
    <div className="cotizar-view">

      {/* ════ NUEVA COTIZACIÓN ════ */}
      <div className="inventory__header no-print">
        <h2 className="section-title">Cotizador</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {savedMsg && <span style={{ color: '#2E7D32', fontWeight: 700, fontSize: 14 }}>{savedMsg}</span>}
          {cart.length > 0 && (
            <>
              <button className="btn btn--outline" onClick={handleNew}>+ Nueva</button>
              <button
                className="btn btn--outline"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Guardando...' : '💾 Guardar'}
              </button>
              <button className="btn btn--primary" onClick={() => window.print()}>
                ⎙ Imprimir
              </button>
            </>
          )}
        </div>
      </div>

      {/* Cliente */}
      <div className="cotizar-cliente no-print">
        <div className="form-group" style={{ maxWidth: 400 }}>
          <label>Nombre del cliente <span style={{ fontWeight: 400, color: '#9A9A9A' }}>(opcional)</span></label>
          <input
            type="text"
            value={cliente}
            onChange={e => setCliente(e.target.value)}
            placeholder="Ej: María García"
          />
        </div>
      </div>

      {/* Agregar productos */}
      <div className="sale-add-section no-print">
        <p className="sale-section-label">Agregar productos a la cotización</p>
        <div className="form-grid">
          <div className="form-group form-group--full">
            <label>Producto</label>
            <input
              type="text"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre, código o categoría..."
              style={{ marginBottom: 8 }}
            />
            <select
              value={productoId}
              onChange={e => setProductoId(e.target.value)}
              size={busquedaNorm ? Math.min(productosFiltrados.length + 1, 8) : undefined}
            >
              <option value="">
                {busquedaNorm
                  ? `— ${productosFiltrados.length} resultado${productosFiltrados.length !== 1 ? 's' : ''} —`
                  : '— Seleccionar producto —'}
              </option>
              {productosFiltrados.map(p => (
                <option key={p.id} value={p.id}>[{p.codigo}] {p.nombre}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Cantidad</label>
            <input type="number" min="1" value={cantidad} onChange={e => setCantidad(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Precio Unitario (COP)</label>
            <input type="number" min="0" step="0.01" value={precio} onChange={e => setPrecio(e.target.value)} />
          </div>
        </div>
        <button
          className="btn btn--outline"
          onClick={addToCart}
          disabled={!producto || !cantidadNum || !precioNum}
        >
          + Agregar a cotización
        </button>
      </div>

      {cart.length === 0 && (
        <div className="empty-state no-print">
          <p className="empty-state__icon">◈</p>
          <p>Agrega productos para generar una cotización</p>
        </div>
      )}

      {/* Tabla cotización activa */}
      {cart.length > 0 && (
        <div className="cotizar-doc">
          <div className="cotizar-doc__header print-only">
            <div className="cotizar-doc__brand">
              <span className="cotizar-doc__logo">◈ AM 18K</span>
              <span className="cotizar-doc__sub">Joyería &amp; Accesorios</span>
            </div>
            <div className="cotizar-doc__meta">
              <p><strong>Cotización</strong></p>
              <p>{fmtFecha()}</p>
              {cliente && <p>Cliente: <strong>{cliente}</strong></p>}
            </div>
          </div>

          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Código</th><th>Producto</th>
                  <th className="td-num">Cant.</th>
                  <th className="td-num">P. Unitario</th>
                  <th className="td-num">Subtotal</th>
                  <th className="no-print"></th>
                </tr>
              </thead>
              <tbody>
                {cart.map((item, i) => (
                  <tr key={i}>
                    <td><span className="code-badge">{item.codigo}</span></td>
                    <td><strong>{item.nombre}</strong></td>
                    <td className="td-num">{item.cantidad}</td>
                    <td className="td-num">{cop(item.precio_unitario)}</td>
                    <td className="td-num"><strong>{cop(item.subtotal)}</strong></td>
                    <td className="no-print">
                      <button className="btn-icon btn-icon--delete" onClick={() => removeFromCart(i)}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="tfoot-total">
                  <td colSpan={4}><strong>TOTAL</strong></td>
                  <td className="td-num"><strong>{cop(total)}</strong></td>
                  <td className="no-print" />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="cotizar-total-row no-print">
            <span className="sale-total-label">Total cotización</span>
            <div className="precio-display precio-display--lg">{cop(total)}</div>
          </div>

          <div className="form-group no-print" style={{ marginTop: 8 }}>
            <label>Notas <span style={{ fontWeight: 400, color: '#9A9A9A' }}>(opcional)</span></label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} placeholder="Validez, condiciones, etc." />
          </div>

          {notas && <div className="cotizar-notas print-only"><strong>Notas:</strong> {notas}</div>}
          <div className="cotizar-doc__footer print-only">
            <p>Gracias por su preferencia · AM 18K Joyería &amp; Accesorios</p>
          </div>
        </div>
      )}

      {/* ════ COTIZACIONES GUARDADAS ════ */}
      <div className="cotizar-saved-section no-print">
        <div className="cotizar-saved-header">
          <h3 className="section-title" style={{ fontSize: 17 }}>Cotizaciones guardadas</h3>
          <span className="results-count">{saved.length} cotización{saved.length !== 1 ? 'es' : ''}</span>
        </div>

        {saved.length === 0 ? (
          <div style={{ color: 'var(--gray-400)', fontSize: 14, padding: '20px 0' }}>
            No hay cotizaciones guardadas aún.
          </div>
        ) : (
          <div className="cotizar-saved-list">
            {saved.map(cot => (
              <div key={cot.id} className={`cotizar-saved-item ${expanded === cot.id ? 'cotizar-saved-item--open' : ''}`}>
                {/* Cabecera clickeable */}
                <div
                  className="cotizar-saved-item__head"
                  onClick={() => setExpanded(expanded === cot.id ? null : cot.id)}
                >
                  <div className="cotizar-saved-item__info">
                    <span className="cotizar-saved-item__cliente">
                      {cot.cliente || <span style={{ color: 'var(--gray-400)' }}>Sin nombre</span>}
                    </span>
                    <span className="cotizar-saved-item__meta">
                      {fmtFechaCorta(cot.fecha)} · {cot.items.length} ítem{cot.items.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="cotizar-saved-item__right">
                    <span className="cotizar-saved-item__total">{cop(cot.total)}</span>
                    <span className="cotizar-saved-item__arrow">{expanded === cot.id ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Detalle expandido */}
                {expanded === cot.id && (
                  <div className="cotizar-saved-item__body">
                    <div className="table-wrapper">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Código</th><th>Producto</th>
                            <th className="td-num">Cant.</th>
                            <th className="td-num">P. Unitario</th>
                            <th className="td-num">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cot.items.map((item, i) => (
                            <tr key={i}>
                              <td><span className="code-badge">{item.codigo}</span></td>
                              <td><strong>{item.nombre}</strong></td>
                              <td className="td-num">{item.cantidad}</td>
                              <td className="td-num">{cop(item.precio_unitario)}</td>
                              <td className="td-num"><strong>{cop(item.subtotal)}</strong></td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="tfoot-total">
                            <td colSpan={4}><strong>TOTAL</strong></td>
                            <td className="td-num"><strong>{cop(cot.total)}</strong></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    {cot.notas && (
                      <p style={{ fontSize: 13, color: 'var(--gray-600)', marginTop: 10 }}>
                        <strong>Notas:</strong> {cot.notas}
                      </p>
                    )}
                    <div className="cotizar-saved-item__actions">
                      <button className="btn btn--outline" onClick={() => handlePrintSaved(cot.id)}>
                        ⎙ Imprimir
                      </button>
                      <button className="btn-icon btn-icon--delete" onClick={() => handleDelete(cot.id)} title="Eliminar">
                        ✕
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Impresión de cotización guardada */}
      {expandedCot && (
        <div className="cotizar-print-saved print-only">
          <div className="cotizar-doc__header" style={{ display: 'flex' }}>
            <div className="cotizar-doc__brand">
              <span className="cotizar-doc__logo">◈ AM 18K</span>
              <span className="cotizar-doc__sub">Joyería &amp; Accesorios</span>
            </div>
            <div className="cotizar-doc__meta">
              <p><strong>Cotización</strong></p>
              <p>{fmtFecha(expandedCot.fecha)}</p>
              {expandedCot.cliente && <p>Cliente: <strong>{expandedCot.cliente}</strong></p>}
            </div>
          </div>
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#1A1A1A' }}>
                <th style={{ padding: '8px 12px', color: '#D4AF37', textAlign: 'left' }}>Código</th>
                <th style={{ padding: '8px 12px', color: '#D4AF37', textAlign: 'left' }}>Producto</th>
                <th style={{ padding: '8px 12px', color: '#D4AF37', textAlign: 'right' }}>Cant.</th>
                <th style={{ padding: '8px 12px', color: '#D4AF37', textAlign: 'right' }}>P. Unitario</th>
                <th style={{ padding: '8px 12px', color: '#D4AF37', textAlign: 'right' }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {expandedCot.items.map((item, i) => (
                <tr key={i}>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid #eee' }}>{item.codigo}</td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid #eee' }}><strong>{item.nombre}</strong></td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid #eee', textAlign: 'right' }}>{item.cantidad}</td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid #eee', textAlign: 'right' }}>{cop(item.precio_unitario)}</td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid #eee', textAlign: 'right' }}><strong>{cop(item.subtotal)}</strong></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} style={{ padding: '10px 12px', borderTop: '2px solid #B8960C', fontWeight: 700 }}>TOTAL</td>
                <td style={{ padding: '10px 12px', borderTop: '2px solid #B8960C', textAlign: 'right', fontWeight: 700 }}>{cop(expandedCot.total)}</td>
              </tr>
            </tfoot>
          </table>
          {expandedCot.notas && (
            <p style={{ marginTop: 14, fontSize: 12, color: '#444' }}><strong>Notas:</strong> {expandedCot.notas}</p>
          )}
          <div className="cotizar-doc__footer">
            <p>Gracias por su preferencia · AM 18K Joyería &amp; Accesorios</p>
          </div>
        </div>
      )}
    </div>
  );
}
