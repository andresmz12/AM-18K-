import React, { useState } from 'react';

const cop = v =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0
  }).format(v || 0);

export default function KitSaleForm({ products, onSave, onClose }) {
  const [nombreKit, setNombreKit]       = useState('');
  const [componentes, setComponentes]   = useState([]);
  const [manoObra, setManoObra]         = useState('');
  const [valorExtra, setValorExtra]     = useState('');
  const [cliente, setCliente]           = useState('');
  const [notas, setNotas]               = useState('');
  const [saving, setSaving]             = useState(false);

  // Para agregar componentes
  const [compProductoId, setCompProductoId] = useState('');
  const [compCantidad, setCompCantidad]     = useState('1');

  const productoSelec = products.find(p => p.id === Number(compProductoId));
  const cantidadNum = parseInt(compCantidad) || 0;
  const stockUsado = productoSelec
    ? componentes.filter(c => c.producto_id === productoSelec.id).reduce((s, c) => s + c.cantidad, 0)
    : 0;
  const stockDisponible = productoSelec ? productoSelec.stock - stockUsado : 0;
  const stockOk = !productoSelec || cantidadNum <= stockDisponible;

  const addComponente = () => {
    if (!productoSelec || !cantidadNum || !stockOk) return;
    setComponentes(prev => [
      ...prev,
      {
        producto_id: productoSelec.id,
        nombre: productoSelec.nombre,
        codigo: productoSelec.codigo,
        cantidad: cantidadNum
      }
    ]);
    setCompProductoId('');
    setCompCantidad('1');
  };

  const removeComponente = idx => setComponentes(prev => prev.filter((_, i) => i !== idx));

  const manoObraNum = parseFloat(manoObra) || 0;
  const valorExtraNum = parseFloat(valorExtra) || 0;
  const total = manoObraNum + valorExtraNum;

  const handleSubmit = async e => {
    e.preventDefault();
    if (!nombreKit || componentes.length === 0 || total <= 0) return;
    setSaving(true);
    await onSave({
      nombre_kit: nombreKit,
      componentes: componentes.map(({ producto_id, cantidad }) => ({ producto_id, cantidad })),
      mano_obra: manoObraNum,
      valor_extra: valorExtraNum,
      cliente: cliente || null,
      notas: notas || null
    });
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal--wide" role="dialog" aria-modal="true">
        <div className="modal__header">
          <h3>Vender Kit / Manilla</h3>
          <button className="modal__close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="form">

          {/* ── Nombre del Kit ── */}
          <div className="form-group form-group--full">
            <label>Nombre del Kit / Manilla</label>
            <input
              type="text"
              value={nombreKit}
              onChange={e => setNombreKit(e.target.value)}
              placeholder="Ej: Manilla Oro 18K con Dije"
            />
          </div>

          {/* ── Agregar componentes ── */}
          <div className="sale-add-section">
            <p className="sale-section-label">Agregar componentes</p>
            <div className="form-grid">
              <div className="form-group form-group--full">
                <label>Componente (balines, dijes, herrajes, etc.)</label>
                <select value={compProductoId} onChange={e => setCompProductoId(e.target.value)}>
                  <option value="">— Seleccionar componente —</option>
                  {products.map(p => {
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
                    Disponible: <strong>{stockDisponible}</strong> unidad{stockDisponible !== 1 ? 'es' : ''}
                  </p>
                )}
              </div>

              <div className="form-group">
                <label>Cantidad</label>
                <input
                  type="number" min="1"
                  max={productoSelec ? stockDisponible : undefined}
                  value={compCantidad}
                  onChange={e => setCompCantidad(e.target.value)}
                />
                {!stockOk && (
                  <p className="form-error">Máx. {stockDisponible} disponible{stockDisponible !== 1 ? 's' : ''}</p>
                )}
              </div>
            </div>

            <button
              type="button"
              className="btn btn--outline"
              onClick={addComponente}
              disabled={!productoSelec || !cantidadNum || !stockOk}
            >
              + Agregar componente
            </button>
          </div>

          {/* ── Lista de componentes ── */}
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
                      <span className="sale-cart-item__detail">{comp.cantidad} unidad{comp.cantidad !== 1 ? 'es' : ''}</span>
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
            </div>
          )}

          {/* ── Mano de obra y extras ── */}
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

          {/* ── Cliente y Notas ── */}
          <div className="form-grid">
            <div className="form-group">
              <label>Cliente (opcional)</label>
              <input
                type="text"
                value={cliente}
                onChange={e => setCliente(e.target.value)}
                placeholder="Nombre del cliente"
              />
            </div>
          </div>

          <div className="form-group">
            <label>Notas (opcional)</label>
            <textarea
              value={notas}
              onChange={e => setNotas(e.target.value)}
              rows={2}
              placeholder="Observaciones, forma de pago, etc."
            />
          </div>

          {/* ── Total ── */}
          {componentes.length > 0 && (
            <div className="sale-total-row">
              <span className="sale-total-label">Total a cobrar</span>
              <div className="precio-display precio-display--lg">{cop(total)}</div>
            </div>
          )}

          {/* ── Acciones ── */}
          <div className="form-actions">
            <button type="button" className="btn btn--outline" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={saving || !nombreKit || componentes.length === 0 || total <= 0}
            >
              {saving
                ? 'Registrando...'
                : `Registrar Kit (${componentes.length} componentes)`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
