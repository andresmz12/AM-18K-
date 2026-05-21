import React, { useState, useEffect } from 'react';

const cop = v =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0
  }).format(v || 0);

export default function SaleForm({ products, onSave, onClose }) {
  const [productoId, setProductoId] = useState('');
  const [cantidad, setCantidad]     = useState('1');
  const [precio, setPrecio]         = useState('');
  const [notas, setNotas]           = useState('');
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');

  const producto = products.find(p => p.id === Number(productoId));
  const total    = (parseFloat(precio) || 0) * (parseInt(cantidad) || 0);
  const stockOk  = !producto || parseInt(cantidad) <= producto.stock;

  useEffect(() => {
    if (producto) setPrecio(String(producto.precio_venta));
  }, [productoId]);

  const handleSubmit = async e => {
    e.preventDefault();
    if (!stockOk) return;
    setSaving(true);
    setError('');
    await onSave({
      producto_id:     Number(productoId),
      cantidad:        parseInt(cantidad),
      precio_unitario: parseFloat(precio),
      notas
    });
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal__header">
          <h3>Registrar Venta</h3>
          <button className="modal__close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="form">
          <div className="form-grid">

            <div className="form-group form-group--full">
              <label>Producto *</label>
              <select value={productoId} onChange={e => setProductoId(e.target.value)} required>
                <option value="">— Seleccionar producto —</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>
                    [{p.codigo}] {p.nombre} — Stock: {p.stock}
                  </option>
                ))}
              </select>
              {producto && (
                <p className="form-hint">
                  Stock disponible: <strong>{producto.stock}</strong> unidad{producto.stock !== 1 ? 'es' : ''}
                </p>
              )}
            </div>

            <div className="form-group">
              <label>Cantidad *</label>
              <input
                type="number" min="1"
                max={producto ? producto.stock : undefined}
                value={cantidad}
                onChange={e => setCantidad(e.target.value)}
                required
              />
              {!stockOk && (
                <p className="form-error">Stock insuficiente (máx. {producto.stock})</p>
              )}
            </div>

            <div className="form-group">
              <label>Precio Unitario (COP) *</label>
              <input
                type="number" min="0" step="0.01"
                value={precio}
                onChange={e => setPrecio(e.target.value)}
                required
              />
            </div>

            <div className="form-group form-group--span2">
              <label>Total de la Venta</label>
              <div className="precio-display">{cop(total)}</div>
            </div>

            <div className="form-group form-group--full">
              <label>Notas</label>
              <textarea value={notas} onChange={e => setNotas(e.target.value)}
                rows={2} placeholder="Cliente, forma de pago, etc." />
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn--outline" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn--primary" disabled={saving || !stockOk || !productoId}>
              {saving ? 'Registrando...' : 'Registrar Venta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
