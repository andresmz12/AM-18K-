import React, { useState, useEffect } from 'react';

const cop = v =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0
  }).format(v || 0);

export default function SaleForm({ products, onSave, onClose }) {
  const [cart, setCart]               = useState([]);
  const [productoId, setProductoId]   = useState('');
  const [cantidad, setCantidad]       = useState('1');
  const [precio, setPrecio]           = useState('');
  const [notasGlobal, setNotasGlobal] = useState('');
  const [saving, setSaving]           = useState(false);

  const producto = products.find(p => p.id === Number(productoId));

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

  const addToCart = () => {
    if (!producto || !cantidadNum || !precioNum || !stockOk) return;
    setCart(prev => [
      ...prev,
      {
        producto_id:     producto.id,
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

  const totalVenta = cart.reduce((s, i) => s + i.subtotal, 0);

  const handleSubmit = async e => {
    e.preventDefault();
    if (cart.length === 0) return;
    setSaving(true);
    await onSave({
      items: cart.map(({ producto_id, cantidad, precio_unitario }) => ({
        producto_id, cantidad, precio_unitario
      })),
      notas: notasGlobal
    });
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal--wide" role="dialog" aria-modal="true">
        <div className="modal__header">
          <h3>Registrar Venta</h3>
          <button className="modal__close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="form">

          {/* ── Selector de producto ── */}
          <div className="sale-add-section">
            <p className="sale-section-label">Agregar productos al carrito</p>
            <div className="form-grid">
              <div className="form-group form-group--full">
                <label>Producto</label>
                <select value={productoId} onChange={e => setProductoId(e.target.value)}>
                  <option value="">— Seleccionar producto —</option>
                  {products.map(p => {
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
                <input
                  type="number" min="1"
                  max={producto ? stockDisponible : undefined}
                  value={cantidad}
                  onChange={e => setCantidad(e.target.value)}
                />
                {!stockOk && (
                  <p className="form-error">Máx. {stockDisponible} disponible{stockDisponible !== 1 ? 's' : ''}</p>
                )}
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
              type="button"
              className="btn btn--outline"
              onClick={addToCart}
              disabled={!producto || !cantidadNum || !precioNum || !stockOk}
            >
              + Agregar al carrito
            </button>
          </div>

          {/* ── Carrito ── */}
          {cart.length > 0 && (
            <div className="sale-cart">
              <p className="sale-section-label">
                Carrito — {cart.length} ítem{cart.length !== 1 ? 's' : ''}
              </p>
              <div className="sale-cart-list">
                {cart.map((item, i) => (
                  <div key={i} className="sale-cart-item">
                    <div className="sale-cart-item__info">
                      <span className="code-badge">{item.codigo}</span>
                      <span className="sale-cart-item__name">{item.nombre}</span>
                    </div>
                    <div className="sale-cart-item__nums">
                      <span className="sale-cart-item__detail">
                        {item.cantidad} × {cop(item.precio_unitario)}
                      </span>
                      <strong className="sale-cart-item__sub">{cop(item.subtotal)}</strong>
                    </div>
                    <button
                      type="button"
                      className="btn-icon btn-icon--delete"
                      onClick={() => removeFromCart(i)}
                      title="Quitar"
                    >✕</button>
                  </div>
                ))}
              </div>

              <div className="sale-total-row">
                <span className="sale-total-label">Total a cobrar al cliente</span>
                <div className="precio-display precio-display--lg">{cop(totalVenta)}</div>
              </div>
            </div>
          )}

          {/* ── Notas ── */}
          <div className="form-group">
            <label>Notas</label>
            <textarea
              value={notasGlobal}
              onChange={e => setNotasGlobal(e.target.value)}
              rows={2}
              placeholder="Cliente, forma de pago, etc."
            />
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn--outline" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={saving || cart.length === 0}
            >
              {saving
                ? 'Registrando...'
                : cart.length === 0
                  ? 'Registrar Venta'
                  : `Registrar Venta (${cart.length} ítem${cart.length !== 1 ? 's' : ''})`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
