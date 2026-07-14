import React, { useState } from 'react';
import ImageLightbox from './ImageLightbox';
import { cop } from '../utils/format';

const CATEGORIAS = [
  'Todas', 'Oro 18k', 'Plata 925', 'Laminado', 'Piedra natural', 'Piedra preciosa',
  'Bisutería', 'Accesorios', 'Otro'
];

const catClass = cat => {
  const map = {
    'Oro 18k': 'oro', 'Plata 925': 'plata', 'Laminado': 'laminado',
    'Piedra natural': 'piedra-natural', 'Piedra preciosa': 'piedra-preciosa',
    'Bisutería': 'bisuteria', 'Accesorios': 'accesorios', 'Otro': 'otro'
  };
  return `categoria-badge cat--${map[cat] || 'otro'}`;
};

function ImgThumb({ url, onZoom }) {
  const [broken, setBroken] = useState(false);
  if (!url || broken) {
    return <span className="img-placeholder">◈</span>;
  }
  return (
    <img
      src={url}
      alt=""
      width="44"
      height="44"
      className="img-thumb img-thumb--zoom"
      onError={() => setBroken(true)}
      onClick={() => onZoom(url)}
      title="Ver imagen"
    />
  );
}

export default function ProductTable({
  products, loading, search, setSearch, categoria, setCategoria, onEdit, onDelete, onAdd, isGerente
}) {
  const [sortCol, setSortCol]       = useState(null);
  const [sortDir, setSortDir]       = useState('asc');
  const [lightbox, setLightbox]     = useState(null);

  const handleSort = col => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const sorted = [...products].sort((a, b) => {
    if (!sortCol) return 0;
    const av = a[sortCol], bv = b[sortCol];
    const cmp = typeof av === 'number' ? av - bv : String(av ?? '').localeCompare(String(bv ?? ''), 'es');
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const sortIcon = col => {
    if (sortCol !== col) return <span className="sort-icon">⇅</span>;
    return <span className="sort-icon sort-icon--active">{sortDir === 'asc' ? '▲' : '▼'}</span>;
  };

  return (
    <div className="inventory">
      {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}
      <div className="inventory__header">
        <h2 className="section-title">Inventario</h2>
        {isGerente && (
          <button className="btn btn--primary btn--hide-mobile" onClick={onAdd}>+ Agregar producto</button>
        )}
      </div>

      <div className="filters">
        <input
          type="text"
          className="search-input"
          placeholder="Buscar por nombre, código o proveedor..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="filter-tabs">
          {CATEGORIAS.map(cat => (
            <button
              key={cat}
              className={`filter-tab ${categoria === cat ? 'filter-tab--active' : ''}`}
              onClick={() => setCategoria(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="loading">Cargando inventario...</div>
      ) : sorted.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state__icon">◈</p>
          <p>No hay productos{search || categoria !== 'Todas' ? ' con esos filtros' : ' en el inventario'}</p>
          {!search && categoria === 'Todas' && isGerente && (
            <button className="btn btn--primary" onClick={onAdd}>Agregar primer producto</button>
          )}
        </div>
      ) : (
        <>
          <p className="results-count">{sorted.length} producto{sorted.length !== 1 ? 's' : ''}</p>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th className="th-foto">Foto</th>
                  <th className="th-sortable" onClick={() => handleSort('codigo')}>
                    Código {sortIcon('codigo')}
                  </th>
                  <th className="th-sortable" onClick={() => handleSort('nombre')}>
                    Nombre {sortIcon('nombre')}
                  </th>
                  <th>Categoría</th>
                  {isGerente && (
                    <th className="th-sortable td-num" onClick={() => handleSort('costo')}>
                      Costo {sortIcon('costo')}
                    </th>
                  )}
                  {isGerente && <th className="td-num">% Gan.</th>}
                  <th className="th-sortable td-num" onClick={() => handleSort('precio_venta')}>
                    P. Venta {sortIcon('precio_venta')}
                  </th>
                  <th className="th-sortable" onClick={() => handleSort('stock')}>
                    Stock {sortIcon('stock')}
                  </th>
                  <th>Proveedor</th>
                  {isGerente && <th>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {sorted.map(p => (
                  <tr key={p.id} className={p.stock <= p.stock_minimo ? 'row--alert' : ''}>
                    <td className="td-foto">
                      <ImgThumb url={p.imagen_url} onZoom={setLightbox} />
                    </td>
                    <td>
                      <span className="code-badge">{p.codigo}</span>
                    </td>
                    <td>
                      <span className="product-name">{p.nombre}</span>
                      {p.stock <= p.stock_minimo && (
                        <span className="stock-alert-icon" title={`Stock bajo (mín. ${p.stock_minimo})`}>⚠</span>
                      )}
                    </td>
                    <td>
                      <span className={catClass(p.categoria)}>{p.categoria}</span>
                    </td>
                    {isGerente && <td className="td-num">{cop(p.costo)}</td>}
                    {isGerente && <td className="td-num">{p.porcentaje_ganancia}%</td>}
                    <td className="td-num">
                      <strong>{cop(p.precio_venta)}</strong>
                    </td>
                    <td>
                      <span className={`stock-badge ${p.stock <= p.stock_minimo ? 'stock-badge--low' : ''}`}>
                        {p.stock}
                      </span>
                    </td>
                    <td>{p.proveedor || <span className="text-muted">—</span>}</td>
                    {isGerente && (
                      <td>
                        <div className="action-btns">
                          <button className="btn-icon btn-icon--edit" onClick={() => onEdit(p)} title="Editar">✎</button>
                          <button className="btn-icon btn-icon--delete" onClick={() => onDelete(p.id)} title="Eliminar">✕</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
