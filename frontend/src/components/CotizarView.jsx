import React, { useState, useEffect } from 'react';

const cop = v =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0
  }).format(v || 0);

const fmtFecha = () => {
  const d = new Date();
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
};

export default function CotizarView({ products }) {
  const [cart, setCart]           = useState([]);
  const [productoId, setProductoId] = useState('');
  const [cantidad, setCantidad]   = useState('1');
  const [precio, setPrecio]       = useState('');
  const [cliente, setCliente]     = useState('');
  const [notas, setNotas]         = useState('');

  const producto    = products.find(p => p.id === Number(productoId));
  const cantidadNum = parseInt(cantidad)  || 0;
  const precioNum   = parseFloat(precio)  || 0;
  const total       = cart.reduce((s, i) => s + i.subtotal, 0);

  useEffect(() => {
    if (producto) setPrecio(String(producto.precio_venta));
  }, [productoId]);

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
    setProductoId('');
    setCantidad('1');
    setPrecio('');
  };

  const removeFromCart = idx => setCart(prev => prev.filter((_, i) => i !== idx));

  const handlePrint = () => window.print();
  const handleNew   = () => { setCart([]); setCliente(''); setNotas(''); setProductoId(''); };

  return (
    <div className="cotizar-view">

      {/* ── Encabezado ── */}
      <div className="inventory__header no-print">
        <h2 className="section-title">Cotizador</h2>
        <div style={{ display: 'flex', gap: 10 }}>
          {cart.length > 0 && (
            <>
              <button className="btn btn--outline" onClick={handleNew}>+ Nueva cotización</button>
              <button className="btn btn--primary" onClick={handlePrint}>⎙ Imprimir cotización</button>
            </>
          )}
        </div>
      </div>

      {/* ── Datos del cliente ── */}
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

      {/* ── Agregar productos ── */}
      <div className="sale-add-section no-print">
        <p className="sale-section-label">Agregar productos a la cotización</p>
        <div className="form-grid">
          <div className="form-group form-group--full">
            <label>Producto</label>
            <select value={productoId} onChange={e => setProductoId(e.target.value)}>
              <option value="">— Seleccionar producto —</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>
                  [{p.codigo}] {p.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Cantidad</label>
            <input
              type="number" min="1"
              value={cantidad}
              onChange={e => setCantidad(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Precio Unitario (COP)</label>
            <input
              type="number" min="0" step="0.01"
              value={precio}
              onChange={e => setPrecio(e.target.value)}
            />
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

      {/* ── Lista vacía ── */}
      {cart.length === 0 && (
        <div className="empty-state no-print">
          <p className="empty-state__icon">◈</p>
          <p>Agrega productos para generar una cotización</p>
        </div>
      )}

      {/* ── Cotización (visible en pantalla y al imprimir) ── */}
      {cart.length > 0 && (
        <div className="cotizar-doc">

          {/* Encabezado del documento (solo visible al imprimir) */}
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

          {/* Tabla de items */}
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Producto</th>
                  <th className="td-num">Cantidad</th>
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
                      <button
                        className="btn-icon btn-icon--delete"
                        onClick={() => removeFromCart(i)}
                        title="Quitar"
                      >✕</button>
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

          {/* Total destacado (pantalla) */}
          <div className="cotizar-total-row no-print">
            <span className="sale-total-label">Total cotización</span>
            <div className="precio-display precio-display--lg">{cop(total)}</div>
          </div>

          {/* Notas */}
          <div className="form-group no-print" style={{ marginTop: 8 }}>
            <label>Notas para el cliente <span style={{ fontWeight: 400, color: '#9A9A9A' }}>(opcional)</span></label>
            <textarea
              value={notas}
              onChange={e => setNotas(e.target.value)}
              rows={2}
              placeholder="Validez de la cotización, condiciones, etc."
            />
          </div>

          {/* Notas solo en impresión */}
          {notas && (
            <div className="cotizar-notas print-only">
              <strong>Notas:</strong> {notas}
            </div>
          )}

          {/* Footer impresión */}
          <div className="cotizar-doc__footer print-only">
            <p>Gracias por su preferencia · AM 18K Joyería &amp; Accesorios</p>
          </div>
        </div>
      )}
    </div>
  );
}
