import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import ProductTable from './components/ProductTable';
import ProductForm from './components/ProductForm';

export default function App() {
  const [products, setProducts]       = useState([]);
  const [dashboard, setDashboard]     = useState(null);
  const [loading, setLoading]         = useState(true);
  const [view, setView]               = useState('dashboard');
  const [showForm, setShowForm]       = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [search, setSearch]           = useState('');
  const [categoria, setCategoria]     = useState('Todas');
  const [tick, setTick]               = useState(0);
  const [notification, setNotification] = useState(null);

  const refresh = () => setTick(t => t + 1);

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (categoria !== 'Todas') params.append('categoria', categoria);

    let alive = true;
    fetch(`/api/products?${params}`)
      .then(r => r.json())
      .then(d => alive && setProducts(d))
      .catch(console.error);
    return () => { alive = false; };
  }, [search, categoria, tick]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch('/api/dashboard')
      .then(r => r.json())
      .then(d => { if (alive) { setDashboard(d); setLoading(false); } })
      .catch(console.error);
    return () => { alive = false; };
  }, [tick]);

  const notify = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const openAdd = () => { setEditProduct(null); setShowForm(true); };
  const openEdit = product => { setEditProduct(product); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditProduct(null); };

  const handleSave = async formData => {
    const method = editProduct ? 'PUT' : 'POST';
    const url    = editProduct ? `/api/products/${editProduct.id}` : '/api/products';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });

    if (res.ok) {
      closeForm();
      refresh();
      notify(editProduct ? 'Producto actualizado ✓' : 'Producto agregado ✓');
    } else {
      const err = await res.json();
      notify(err.error || 'Error al guardar', 'error');
    }
  };

  const handleDelete = async id => {
    if (!window.confirm('¿Eliminar este producto?')) return;
    await fetch(`/api/products/${id}`, { method: 'DELETE' });
    refresh();
    notify('Producto eliminado');
  };

  return (
    <div className="app">
      <Header
        view={view}
        setView={setView}
        onAdd={openAdd}
        onExport={() => window.open('/api/export', '_blank')}
      />

      {notification && (
        <div className={`notification notification--${notification.type}`}>
          {notification.message}
        </div>
      )}

      <main className="main">
        {view === 'dashboard' && (
          <Dashboard
            stats={dashboard}
            loading={loading}
            onViewInventory={() => setView('inventory')}
          />
        )}

        {view === 'inventory' && (
          <ProductTable
            products={products}
            loading={loading}
            search={search}
            setSearch={setSearch}
            categoria={categoria}
            setCategoria={setCategoria}
            onEdit={openEdit}
            onDelete={handleDelete}
            onAdd={openAdd}
          />
        )}
      </main>

      {showForm && (
        <ProductForm
          product={editProduct}
          onSave={handleSave}
          onClose={closeForm}
        />
      )}
    </div>
  );
}
