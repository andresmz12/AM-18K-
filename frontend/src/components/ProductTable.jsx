import React from 'react';

const CATEGORIAS = ['Todas', 'Oro 18k', 'Bisutería', 'Accesorios', 'Otro'];

const cop = v =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0
  }).format(v || 0);

const catClass = cat => {
  const map = { 'Oro 18k': 'oro', 'Bisutería': 'bisuteria', 'Accesorios': 'accesorios', 'Otro': 'otro' };
  return `categoria-badge cat--${map[cat] || 'otro'}`;
};

export default function ProductTable({
  products, loading, search, setSearch, categoria, setCategoria, onEdit, onDelete, onAdd
}) {
  return (
    <div className="inventory">
      <div className="inventory__header">
        <h2 className="section-title">Inventario</h2>
        <button className="btn btn--primary" onClick={onAdd}>+ Agregar producto</button>
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
      ) : products.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state__icon">◈</p>
          <p>No hay productos{search || categoria !== 'Todas' ? ' con esos filtros' : ' en el inventario'}</p>
          {!search && categoria === 'Todas' && (
            <button className="btn btn--primary" onClick={onAdd}>Agregar primer producto</button>
          )}
        </div>
      ) : (
        <>
          <p className="results-count">{products.length} producto{products.length !== 1 ? 's' : ''}</p>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nombre</th>
                  <th>Categoría</th>
                  <th>Costo</th>
                  <th>% Gan.</th>
                  <th>P. Venta</th>
                  <th>Stock</th>
                  <th>Proveedor</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {products.map(p => (
                  <tr key={p.id} className={p.stock <= p.stock_minimo ? 'row--alert' : ''}>
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
                    <td className="td-num">{cop(p.costo)}</td>
                    <td className="td-num">{p.porcentaje_ganancia}%</td>
                    <td className="td-num">
                      <strong>{cop(p.precio_venta)}</strong>
                    </td>
                    <td>
                      <span className={`stock-badge ${p.stock <= p.stock_minimo ? 'stock-badge--low' : ''}`}>
                        {p.stock}
                      </span>
                    </td>
                    <td>{p.proveedor || <span className="text-muted">—</span>}</td>
                    <td>
                      <div className="action-btns">
                        <button
                          className="btn-icon btn-icon--edit"
                          onClick={() => onEdit(p)}
                          title="Editar"
                        >✎</button>
                        <button
                          className="btn-icon btn-icon--delete"
                          onClick={() => onDelete(p.id)}
                          title="Eliminar"
                        >✕</button>
                      </div>
                    </td>
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
