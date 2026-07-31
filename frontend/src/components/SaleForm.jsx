import React, { useState, useEffect } from 'react';
import { cop } from '../utils/format';

export default function SaleForm({ products, onSave, onClose }) {
  const [modo, setModo]                 = useState('simple'); // 'simple' | 'kit'

  // Modo simple
  const [cart, setCart]                 = useState([]);
  const [productoId, setProductoId]     = useState('');
  const [busqueda, setBusqueda]         = useState('');
  const [cantidad, setCantidad]         = useState('1');
  const [precio, setPrecio]             = useState('');
  const [metodoPago, setMetodoPago]     = useState('efectivo');

  // Modo kit
  const [nombreKit, setNombreKit]       = useState('');
  const [componentes, setComponentes]   = useState([]);
  const [manoObra, setManoObra]         = useState('');
  const [valorExtra, setValorExtra]     = useState('');
  const [cliente, setCliente]           = useState('');
  const [compProductoId, setCompProductoId] = useState('');
  const [compBusqueda, setCompBusqueda] = useState('');
  const [compCantidad, setCompCantidad] = useState('1');
  const [compPrecio, setCompPrecio]     = useState('');
  const [metodoPagoKit, setMetodoPagoKit] = useState('efectivo');

  const [saving, setSaving]             = useState(false);

  // ─── Modo simple ───────────────────────────────────────────────────────────
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

  const busquedaNorm = busqueda.trim().toLowerCase();
  const productosFiltrados = busquedaNorm
    ? products.filter(p =>
        p.nombre.toLowerCase().includes(busquedaNorm) ||
        p.codigo.toLowerCase().includes(busquedaNorm) ||
        (p.categoria || '').toLowerCase().includes(busquedaNorm)
      )
    : products;

  const compBusquedaNorm = compBusqueda.trim().toLowerCase();
  const componentesFiltrados = compBusquedaNorm
    ? products.filter(p =>
        p.nombre.toLowerCase().includes(compBusquedaNorm) ||
        p.codigo.toLowerCase().includes(compBusquedaNorm) ||
        (p.categoria || '').toLowerCase().includes(compBusquedaNorm)
      )
    : products;

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
    setBusqueda('');
  };

  const removeFromCart = idx => setCart(prev => prev.filter((_, i) => i !== idx));
  const totalVenta = cart.reduce((s, i) => s + i.subtotal, 0);

  // ─── Modo kit ──────────────────────────────────────────────────────────────
  const productoSelec = products.find(p => p.id === Number(compProductoId));

  useEffect(() => {
    if (productoSelec) setCompPrecio(String(productoSelec.precio_venta));
  }, [compProductoId]);

  const cantidadComp = parseInt(compCantidad) || 0;
  const compPrecioNum = parseFloat(compPrecio) || 0;
  const stockUsadoComp = productoSelec
    ? componentes.filter(c => c.producto_id === productoSelec.id).reduce((s, c) => s + c.cantidad, 0)
    : 0;
  const stockDisponibleComp = productoSelec ? productoSelec.stock - stockUsadoComp : 0;
  const stockOkComp = !productoSelec || cantidadComp <= stockDisponibleComp;

  const addComponente = () => {
    if (!productoSelec || !cantidadComp || !compPrecioNum || !stockOkComp) return;
    setComponentes(prev => [
      ...prev,
      {
        producto_id: productoSelec.id,
        nombre: productoSelec.nombre,
        codigo: productoSelec.codigo,
        cantidad: cantidadComp,
        precio_unitario: compPrecioNum,
        subtotal: cantidadComp * compPrecioNum
      }
    ]);
    setCompProductoId('');
    setCompCantidad('1');
    setCompPrecio('');
    setCompBusqueda('');
  };

  const removeComponente = idx => setComponentes(prev => prev.filter((_, i) => i !== idx));

  const totalComponentes = componentes.reduce((s, c) => s + c.subtotal, 0);
  const manoObraNum = parseFloat(manoObra) || 0;
  const valorExtraNum = parseFloat(valorExtra) || 0;
  const totalKit = totalComponentes + manoObraNum + valorExtraNum;

  // ─── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async e => {
    e.preventDefault();
    setSaving(true);

    if (modo === 'simple') {
      if (cart.length === 0) return;
      await onSave({
        items: cart.map(({ producto_id, cantidad, precio_unitario }) => ({
          producto_id, cantidad, precio_unitario
        })),
        metodo_pago: metodoPago
      });
    } else {
      if (!nombreKit || componentes.length === 0 || totalKit <= 0) return;
      await onSave({
        tipo: 'kit',
        nombre_kit: nombreKit,
        componentes: componentes.map(({ producto_id, cantidad, precio_unitario }) => ({ producto_id, cantidad, precio_unitario })),
        mano_obra: manoObraNum,
        valor_extra: valorExtraNum,
        cliente: cliente || null,
        metodo_pago: metodoPagoKit
      });
    }

    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal--wide" role="dialog" aria-modal="true">
        <div className="modal__header">
          <h3>Registrar Venta</h3>
          <button className="modal__close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        {/* ── Tabs ── */}
        <div className="sale-mode-tabs">
          <button
            className={`sale-mode-tab ${modo === 'simple' ? 'sale-mode-tab--active' : ''}`}
            onClick={() => setModo('simple')}
          >
            Venta Simple
          </button>
          <button
            className={`sale-mode-tab ${modo === 'kit' ? 'sale-mode-tab--active' : ''}`}
            onClick={() => setModo('kit')}
          >
            Vender Kit / Manilla
          </button>
        </div>

        <form onSubmit={handleSubmit} className="form">

          {/* ════════════════════════════════════════════════════════════════════ */}
          {/* MODO SIMPLE */}
          {/* ════════════════════════════════════════════════════════════════════ */}
          {modo === 'simple' && (
            <>
              {/* Selector de producto */}
              <div className="sale-add-section">
                <p className="sale-section-label">Agregar productos al carrito</p>
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

              {/* Carrito */}
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

              {/* Forma de pago */}
              <div className="form-group">
                <label>Forma de pago</label>
                <div className="payment-toggle">
                  <button
                    type="button"
                    className={`payment-toggle__btn ${metodoPago === 'efectivo' ? 'payment-toggle__btn--active' : ''}`}
                    onClick={() => setMetodoPago('efectivo')}
                  >
                    💵 Efectivo
                  </button>
                  <button
                    type="button"
                    className={`payment-toggle__btn ${metodoPago === 'transferencia' ? 'payment-toggle__btn--active' : ''}`}
                    onClick={() => setMetodoPago('transferencia')}
                  >
                    🏦 Transferencia
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ════════════════════════════════════════════════════════════════════ */}
          {/* MODO KIT */}
          {/* ════════════════════════════════════════════════════════════════════ */}
          {modo === 'kit' && (
            <>
              {/* Nombre kit */}
              <div className="form-group form-group--full">
                <label>Nombre del Kit / Manilla</label>
                <input
                  type="text"
                  value={nombreKit}
                  onChange={e => setNombreKit(e.target.value)}
                  placeholder="Ej: Manilla Oro 18K con Dije"
                />
              </div>

              {/* Agregar componentes */}
              <div className="sale-add-section">
                <p className="sale-section-label">Agregar componentes</p>
                <div className="form-grid">
                  <div className="form-group form-group--full">
                    <label>Componente (balines, dijes, herrajes, etc.)</label>
                    <input
                      type="text"
                      value={compBusqueda}
                      onChange={e => setCompBusqueda(e.target.value)}
                      placeholder="Buscar por nombre, código o categoría..."
                      style={{ marginBottom: 8 }}
                    />
                    <select
                      value={compProductoId}
                      onChange={e => setCompProductoId(e.target.value)}
                      size={compBusquedaNorm ? Math.min(componentesFiltrados.length + 1, 8) : undefined}
                    >
                      <option value="">
                        {compBusquedaNorm
                          ? `— ${componentesFiltrados.length} resultado${componentesFiltrados.length !== 1 ? 's' : ''} —`
                          : '— Seleccionar componente —'}
                      </option>
                      {componentesFiltrados.map(p => {
                        const usado = componentes.filter(c => c.producto_id === p.id).reduce((s, c) => s + c.cantidad, 0);
                        const disp  = p.stock - usado;
                        return (
                          <option key={p.id} value={p.id} disabled={disp <= 0}>
                            [{p.codigo}] {p.nombre} — Stock: {disp}
                          </option>
                        );
                      })}
                    </select>
                    {productoSelec && (
                      <p className="form-hint">
                        Disponible: <strong>{stockDisponibleComp}</strong> unidad{stockDisponibleComp !== 1 ? 'es' : ''}
                        {productoSelec.precio_venta > 0 && (
                          <span> — Precio: {cop(productoSelec.precio_venta)}</span>
                        )}
                      </p>
                    )}
                  </div>

                  <div className="form-group">
                    <label>Cantidad</label>
                    <input
                      type="number" min="1"
                      max={productoSelec ? stockDisponibleComp : undefined}
                      value={compCantidad}
                      onChange={e => setCompCantidad(e.target.value)}
                    />
                    {!stockOkComp && (
                      <p className="form-error">Máx. {stockDisponibleComp} disponible{stockDisponibleComp !== 1 ? 's' : ''}</p>
                    )}
                  </div>

                  <div className="form-group">
                    <label>Precio Unitario (COP)</label>
                    <input
                      type="number" min="0" step="0.01"
                      value={compPrecio}
                      onChange={e => setCompPrecio(e.target.value)}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn--outline"
                  onClick={addComponente}
                  disabled={!productoSelec || !cantidadComp || !compPrecioNum || !stockOkComp}
                >
                  + Agregar componente
                </button>
              </div>

              {/* Lista componentes */}
              {componentes.length > 0 && (
                <div className="sale-cart">
                  <p className="sale-section-label">
                    Componentes — {componentes.length} ítem{componentes.length !== 1 ? 's' : ''}
                  </p>
                  <div className="sale-cart-list">
                    {componentes.map((comp, i) => (
                      <div key={i} className="sale-cart-item">
                        <div className="sale-cart-item__info">
                          <span className="code-badge">{comp.codigo}</span>
                          <span className="sale-cart-item__name">{comp.nombre}</span>
                        </div>
                        <div className="sale-cart-item__nums">
                          <span className="sale-cart-item__detail">
                            {comp.cantidad} × {cop(comp.precio_unitario)}
                          </span>
                          <strong className="sale-cart-item__sub">{cop(comp.subtotal)}</strong>
                        </div>
                        <button
                          type="button"
                          className="btn-icon btn-icon--delete"
                          onClick={() => removeComponente(i)}
                          title="Quitar"
                        >✕</button>
                      </div>
                    ))}
                  </div>

                  {componentes.length > 0 && (
                    <div className="sale-subtotal-row">
                      <span className="sale-total-label">Subtotal componentes</span>
                      <div className="precio-display">{cop(totalComponentes)}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Mano de obra y extras */}
              <div className="form-grid">
                <div className="form-group">
                  <label>Mano de obra (COP)</label>
                  <input
                    type="number" min="0" step="0.01"
                    value={manoObra}
                    onChange={e => setManoObra(e.target.value)}
                    placeholder="Costo de ensamblaje"
                  />
                </div>

                <div className="form-group">
                  <label>Valor extra (COP)</label>
                  <input
                    type="number" min="0" step="0.01"
                    value={valorExtra}
                    onChange={e => setValorExtra(e.target.value)}
                    placeholder="Recargo, detalles especiales, etc."
                  />
                </div>
              </div>

              {/* Cliente */}
              <div className="form-group form-group--full">
                <label>Cliente (opcional)</label>
                <input
                  type="text"
                  value={cliente}
                  onChange={e => setCliente(e.target.value)}
                  placeholder="Nombre del cliente"
                />
              </div>

              {/* Forma de pago */}
              <div className="form-group">
                <label>Forma de pago</label>
                <div className="payment-toggle">
                  <button
                    type="button"
                    className={`payment-toggle__btn ${metodoPagoKit === 'efectivo' ? 'payment-toggle__btn--active' : ''}`}
                    onClick={() => setMetodoPagoKit('efectivo')}
                  >
                    💵 Efectivo
                  </button>
                  <button
                    type="button"
                    className={`payment-toggle__btn ${metodoPagoKit === 'transferencia' ? 'payment-toggle__btn--active' : ''}`}
                    onClick={() => setMetodoPagoKit('transferencia')}
                  >
                    🏦 Transferencia
                  </button>
                </div>
              </div>

              {/* Total desglosado */}
              {componentes.length > 0 && (
                <div className="sale-total-breakdown">
                  <div className="total-row">
                    <span>Componentes:</span>
                    <span>{cop(totalComponentes)}</span>
                  </div>
                  {manoObraNum > 0 && (
                    <div className="total-row">
                      <span>Mano de obra:</span>
                      <span>{cop(manoObraNum)}</span>
                    </div>
                  )}
                  {valorExtraNum > 0 && (
                    <div className="total-row">
                      <span>Valor extra:</span>
                      <span>{cop(valorExtraNum)}</span>
                    </div>
                  )}
                  <div className="sale-total-row">
                    <span className="sale-total-label">Total a cobrar</span>
                    <div className="precio-display precio-display--lg">{cop(totalKit)}</div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ─── Acciones comunes ─── */}
          <div className="form-actions">
            <button type="button" className="btn btn--outline" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={
                saving ||
                (modo === 'simple' && cart.length === 0) ||
                (modo === 'kit' && (!nombreKit || componentes.length === 0 || totalKit <= 0))
              }
            >
              {saving
                ? 'Registrando...'
                : modo === 'simple'
                  ? `Registrar Venta (${cart.length} ítem${cart.length !== 1 ? 's' : ''})`
                  : `Registrar Kit (${componentes.length} componentes)`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
