import React, { useState, useEffect } from 'react';
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

function NuevaCuentaForm({ apiFetch, products, onDone, onCancel }) {
  const [cliente, setCliente]         = useState('');
  const [montoTotal, setMontoTotal]   = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [notas, setNotas]             = useState('');
  const [error, setError]             = useState('');
  const [saving, setSaving]           = useState(false);

  // Carrito de productos "al fiado" — si tiene ítems, el monto se calcula
  // solo y se descuenta el stock al crear la cuenta, igual que una venta.
  const [cart, setCart]             = useState([]);
  const [productoId, setProductoId] = useState('');
  const [busqueda, setBusqueda]     = useState('');
  const [cantidad, setCantidad]     = useState('1');
  const [precio, setPrecio]         = useState('');

  const producto = (products || []).find(p => p.id === Number(productoId));

  useEffect(() => {
    if (producto) setPrecio(String(producto.precio_venta));
  }, [productoId]);

  const stockUsado      = productoId
    ? cart.filter(i => i.producto_id === Number(productoId)).reduce((s, i) => s + i.cantidad, 0)
    : 0;
  const stockDisponible = producto ? producto.stock - stockUsado : 0;
  const cantidadNum     = parseInt(cantidad) || 0;
  const precioNum       = parseFloat(precio) || 0;
  const stockOk         = !producto || cantidadNum <= stockDisponible;

  const busquedaNorm = busqueda.trim().toLowerCase();
  const productosFiltrados = (busquedaNorm ? (products || []).filter(p =>
    p.nombre.toLowerCase().includes(busquedaNorm) ||
    p.codigo.toLowerCase().includes(busquedaNorm) ||
    (p.categoria || '').toLowerCase().includes(busquedaNorm)
  ) : (products || []));

  const addToCart = () => {
    if (!producto || !cantidadNum || !precioNum || !stockOk) return;
    setCart(prev => [
      ...prev,
      { producto_id: producto.id, nombre: producto.nombre, codigo: producto.codigo,
        cantidad: cantidadNum, precio_unitario: precioNum, subtotal: cantidadNum * precioNum }
    ]);
    setProductoId(''); setCantidad('1'); setPrecio(''); setBusqueda('');
  };

  const removeFromCart = idx => setCart(prev => prev.filter((_, i) => i !== idx));
  const totalCarrito = cart.reduce((s, i) => s + i.subtotal, 0);

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    if (!cliente) { setError('Ingresa el nombre del cliente'); return; }
    if (cart.length === 0) {
      const monto = parseFloat(montoTotal);
      if (!monto || monto <= 0) { setError('Ingresa un monto total válido, o agrega productos abajo'); return; }
    }
    setSaving(true);
    try {
      const body = cart.length > 0
        ? { cliente, items: cart.map(({ producto_id, cantidad, precio_unitario }) => ({ producto_id, cantidad, precio_unitario })), descripcion: descripcion || null, notas: notas || null }
        : { cliente, monto_total: parseFloat(montoTotal), descripcion: descripcion || null, notas: notas || null };
      const res = await apiFetch('/api/cuentas-por-cobrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
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
        {cart.length === 0 && (
          <div className="form-group">
            <label>Monto total de la deuda (COP)</label>
            <input type="number" min="0" step="0.01" value={montoTotal} onChange={e => setMontoTotal(e.target.value)} placeholder="0" />
          </div>
        )}
        <div className="form-group form-group--full">
          <label>Descripción (opcional)</label>
          <input value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Ej: Anillo oro 18k, apartado, etc." />
        </div>
        <div className="form-group form-group--full">
          <label>Notas (opcional)</label>
          <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} placeholder="Observaciones adicionales..." />
        </div>
      </div>

      {products && products.length > 0 && (
        <div className="sale-add-section" style={{ marginTop: 4 }}>
          <p className="sale-section-label">
            Productos que se llevó "al fiado" <span style={{ fontWeight: 400, color: 'var(--gray-400)' }}>(opcional — descuenta el stock)</span>
          </p>
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
                {productosFiltrados.map(p => {
                  const usado = cart.filter(i => i.producto_id === p.id).reduce((s, i) => s + i.cantidad, 0);
                  const disp  = p.stock - usado;
                  return (
                    <option key={p.id} value={p.id} disabled={disp <= 0}>
                      [{p.codigo}] {p.nombre} — Stock: {disp}
                    </option>
                  );
                })}
              </select>
              {producto && (
                <p className="form-hint">
                  Disponible: <strong>{stockDisponible}</strong> unidad{stockDisponible !== 1 ? 'es' : ''}
                </p>
              )}
            </div>
            <div className="form-group">
              <label>Cantidad</label>
              <input type="number" min="1" max={producto ? stockDisponible : undefined} value={cantidad} onChange={e => setCantidad(e.target.value)} />
              {!stockOk && <p className="form-error">Máx. {stockDisponible} disponible{stockDisponible !== 1 ? 's' : ''}</p>}
            </div>
            <div className="form-group">
              <label>Precio Unitario (COP)</label>
              <input type="number" min="0" step="0.01" value={precio} onChange={e => setPrecio(e.target.value)} />
            </div>
          </div>
          <button type="button" className="btn btn--outline" onClick={addToCart} disabled={!producto || !cantidadNum || !precioNum || !stockOk}>
            + Agregar producto
          </button>

          {cart.length > 0 && (
            <div className="sale-cart" style={{ marginTop: 14 }}>
              <div className="sale-cart-list">
                {cart.map((item, i) => (
                  <div key={i} className="sale-cart-item">
                    <div className="sale-cart-item__info">
                      <span className="code-badge">{item.codigo}</span>
                      <span className="sale-cart-item__name">{item.nombre}</span>
                    </div>
                    <div className="sale-cart-item__nums">
                      <span className="sale-cart-item__detail">{item.cantidad} × {cop(item.precio_unitario)}</span>
                      <strong className="sale-cart-item__sub">{cop(item.subtotal)}</strong>
                    </div>
                    <button type="button" className="btn-icon btn-icon--delete" onClick={() => removeFromCart(i)} title="Quitar">✕</button>
                  </div>
                ))}
              </div>
              <div className="sale-total-row">
                <span className="sale-total-label">Total de la deuda</span>
                <div className="precio-display precio-display--lg">{cop(totalCarrito)}</div>
              </div>
            </div>
          )}
        </div>
      )}

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

  const startEditAbono = a => {
    setEditId(a.id);
    setEditMonto(String(a.monto));
    setEditNotas(a.notas || '');
    setEditError('');
  };

  const cancelEditAbono = () => setEditId(null);

  const handleSaveAbono = async id => {
    setEditError('');
    const montoNum = parseFloat(editMonto);
    if (!montoNum || montoNum <= 0) { setEditError('Ingresa un monto válido'); return; }
    setEditSaving(true);
    try {
      const res = await apiFetch(`/api/abonos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monto: montoNum, notas: editNotas || null })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al actualizar el abono');
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
                editId === a.id ? (
                  <tr key={a.id}>
                    <td className="td-fecha">{fmtFecha(a.fecha)}</td>
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
                        onClick={() => handleSaveAbono(a.id)}>✓</button>
                      <button type="button" className="btn-icon" title="Cancelar" onClick={cancelEditAbono}>✕</button>
                    </td>
                  </tr>
                ) : (
                  <tr key={a.id}>
                    <td className="td-fecha">{fmtFecha(a.fecha)}</td>
                    <td className="td-num"><strong>{cop(a.monto)}</strong></td>
                    <td>{a.notas || <span className="text-muted">—</span>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {isGerente && (
                        <button className="btn-icon btn-icon--edit" title="Editar" onClick={() => startEditAbono(a)}>✎</button>
                      )}
                      <button className="btn-icon btn-icon--delete" onClick={() => handleDeleteAbono(a.id)} title="Eliminar">✕</button>
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

export default function CuentasPorCobrarView({ apiFetch, isGerente, products }) {
  const [estado, setEstado]     = useState('pendiente');
  const [cuentas, setCuentas]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [editId, setEditId]         = useState(null);
  const [editCliente, setEditCliente]       = useState('');
  const [editDescripcion, setEditDescripcion] = useState('');
  const [editError, setEditError]   = useState('');
  const [editSaving, setEditSaving] = useState(false);

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

  const startEdit = (e, c) => {
    e.stopPropagation();
    setEditId(c.id);
    setEditCliente(c.cliente);
    setEditDescripcion(c.descripcion || '');
    setEditError('');
  };

  const cancelEdit = e => { e.stopPropagation(); setEditId(null); };

  const handleSaveEdit = async (e, id) => {
    e.stopPropagation();
    setEditError('');
    if (!editCliente.trim()) { setEditError('El nombre del cliente es requerido'); return; }
    setEditSaving(true);
    try {
      const res = await apiFetch(`/api/cuentas-por-cobrar/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente: editCliente, descripcion: editDescripcion || null })
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
        <h2 className="section-title">Cuentas por Cobrar</h2>
        <button className="btn btn--primary" onClick={() => setShowForm(s => !s)}>
          {showForm ? 'Cancelar' : '+ Nueva cuenta'}
        </button>
      </div>

      {showForm && (
        <NuevaCuentaForm
          apiFetch={apiFetch}
          products={products}
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
              {editId === c.id ? (
                <div className="cotizar-saved-item__head" onClick={e => e.stopPropagation()}>
                  <div className="form-grid" style={{ flex: 1, marginRight: 10 }}>
                    <div className="form-group">
                      <input value={editCliente} onChange={e => setEditCliente(e.target.value)} placeholder="Nombre del cliente" />
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
                    <button className="btn-icon btn-icon--edit" title="Editar nombre/descripción" onClick={e => startEdit(e, c)}>✎</button>
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
