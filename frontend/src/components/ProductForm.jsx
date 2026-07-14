import React, { useState, useEffect, useRef } from 'react';
import ImageLightbox from './ImageLightbox';
import { compressImage } from '../utils/image';
import { cop } from '../utils/format';

const CATEGORIAS = [
  'Oro 18k', 'Plata 925', 'Laminado', 'Piedra natural', 'Piedra preciosa',
  'Bisutería', 'Accesorios', 'Otro'
];

const blank = {
  nombre: '', codigo: '', categoria: 'Oro 18k', descripcion: '',
  peso_gramos: '', costo: '', porcentaje_ganancia: '', stock: '',
  stock_minimo: '1', proveedor: '', notas: '', imagen_url: ''
};

export default function ProductForm({ product, onSave, onClose }) {
  const [form, setForm]               = useState(blank);
  const [precioVenta, setPrecioVenta] = useState(0);
  const [saving, setSaving]           = useState(false);
  const [uploading, setUploading]     = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [lightbox, setLightbox]       = useState(false);

  // Ref para disparar el input de archivo desde un botón real (funciona en móvil)
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (product) {
      setForm({
        nombre:               product.nombre              ?? '',
        codigo:               product.codigo              ?? '',
        categoria:            product.categoria           ?? 'Oro 18k',
        descripcion:          product.descripcion         ?? '',
        peso_gramos:          product.peso_gramos         ?? '',
        costo:                product.costo               ?? '',
        porcentaje_ganancia:  product.porcentaje_ganancia ?? '',
        stock:                product.stock               ?? '',
        stock_minimo:         product.stock_minimo        ?? '1',
        proveedor:            product.proveedor           ?? '',
        notas:                product.notas               ?? '',
        imagen_url:           product.imagen_url          ?? ''
      });
    }
  }, [product]);

  useEffect(() => {
    const c = parseFloat(form.costo)               || 0;
    const p = parseFloat(form.porcentaje_ganancia) || 0;
    setPrecioVenta(c * (1 + p / 100));
  }, [form.costo, form.porcentaje_ganancia]);

  const set = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleImageUpload = async e => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      const base64 = await compressImage(file);
      setForm(f => ({ ...f, imagen_url: base64 }));
    } catch {
      setUploadError('Error al procesar la imagen. Intenta de nuevo.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setSaving(true);
    await onSave({
      ...form,
      peso_gramos:          parseFloat(form.peso_gramos)          || null,
      costo:                parseFloat(form.costo)                || 0,
      porcentaje_ganancia:  parseFloat(form.porcentaje_ganancia)  || 0,
      stock:                parseInt(form.stock)                  || 0,
      stock_minimo:         parseInt(form.stock_minimo)           || 1
    });
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal__header">
          <h3>{product ? 'Editar Producto' : 'Nuevo Producto'}</h3>
          <button className="modal__close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="form">
          <div className="form-grid">

            <div className="form-group form-group--full">
              <label>Nombre *</label>
              <input name="nombre" value={form.nombre} onChange={set} required
                placeholder="Ej: Anillo Solitario Oro 18k" />
            </div>

            <div className="form-group">
              <label>Código *</label>
              <input name="codigo" value={form.codigo} onChange={set} required
                placeholder="Ej: ANI-001" />
            </div>

            <div className="form-group">
              <label>Categoría</label>
              <select name="categoria" value={form.categoria} onChange={set}>
                {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Costo (COP) *</label>
              <input name="costo" type="number" min="0" step="0.01" value={form.costo}
                onChange={set} required placeholder="0" />
            </div>

            <div className="form-group">
              <label>% Ganancia</label>
              <input name="porcentaje_ganancia" type="number" min="0" step="0.1"
                value={form.porcentaje_ganancia} onChange={set} placeholder="0" />
            </div>

            <div className="form-group form-group--span2">
              <label>Precio de Venta (calculado automáticamente)</label>
              <div className="precio-display">{cop(precioVenta)}</div>
            </div>

            <div className="form-group">
              <label>Stock *</label>
              <input name="stock" type="number" min="0" value={form.stock}
                onChange={set} required placeholder="0" />
            </div>

            <div className="form-group">
              <label>Stock Mínimo</label>
              <input name="stock_minimo" type="number" min="0" value={form.stock_minimo}
                onChange={set} placeholder="1" />
            </div>

            <div className="form-group">
              <label>Peso (gramos)</label>
              <input name="peso_gramos" type="number" min="0" step="0.01"
                value={form.peso_gramos} onChange={set} placeholder="0.00" />
            </div>

            <div className="form-group">
              <label>Proveedor</label>
              <input name="proveedor" value={form.proveedor} onChange={set}
                placeholder="Nombre del proveedor" />
            </div>

            <div className="form-group form-group--full">
              <label>Descripción</label>
              <textarea name="descripcion" value={form.descripcion} onChange={set}
                rows={2} placeholder="Descripción del producto..." />
            </div>

            <div className="form-group form-group--full">
              <label>
                Imagen <span style={{ fontWeight: 400, color: '#9A9A9A' }}>(opcional)</span>
              </label>

              {/* Input oculto — disparado por el botón via ref */}
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
                  {uploading ? '⏳ Subiendo...' : '↑ Subir foto'}
                </button>
                <span className="upload-sep">o</span>
                <input
                  name="imagen_url"
                  type="text"
                  value={form.imagen_url}
                  onChange={set}
                  placeholder="https://... (URL externa)"
                  className="upload-url-input"
                />
              </div>

              {uploadError && (
                <p className="form-error" style={{ marginTop: 6 }}>{uploadError}</p>
              )}

              {form.imagen_url && (
                <>
                  <img
                    src={form.imagen_url}
                    alt="Preview"
                    className="img-preview img-preview--zoom"
                    onError={e => { e.target.style.display = 'none'; }}
                    onLoad={e => { e.target.style.display = 'block'; }}
                    onClick={() => setLightbox(true)}
                    title="Ver imagen ampliada"
                  />
                  {lightbox && (
                    <ImageLightbox src={form.imagen_url} onClose={() => setLightbox(false)} />
                  )}
                </>
              )}
            </div>

            <div className="form-group form-group--full">
              <label>Notas</label>
              <textarea name="notas" value={form.notas} onChange={set}
                rows={2} placeholder="Notas adicionales..." />
            </div>

          </div>

          <div className="form-actions">
            <button type="button" className="btn btn--outline" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? 'Guardando...' : product ? 'Actualizar Producto' : 'Agregar Producto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
