import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import LandingPage from './components/LandingPage';
import AuthView from './components/AuthView';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import ProductTable from './components/ProductTable';
import ProductForm from './components/ProductForm';
import VentasView from './components/VentasView';
import SaleForm from './components/SaleForm';
import CotizarView from './components/CotizarView';
import CuentasPorCobrarView from './components/CuentasPorCobrarView';
import GastosView from './components/GastosView';
import CierreCajaView from './components/CierreCajaView';
import ReportesView from './components/ReportesView';
import UsersView from './components/UsersView';
import PlatformView from './components/PlatformView';

export default function App() {
  const { user, loading: authLoading, apiFetch, logout } = useAuth();

  const [showAuth, setShowAuth]         = useState(false);
  const [authMode, setAuthMode]         = useState('login');
  const [products, setProducts]         = useState([]);
  const [dashboard, setDashboard]       = useState(null);
  const [statsCategoria, setStatsCat]   = useState([]);
  const [loading, setLoading]           = useState(true);
  const [view, setView]                 = useState('dashboard');
  const [showForm, setShowForm]         = useState(false);
  const [editProduct, setEditProduct]   = useState(null);
  const [showSaleForm, setShowSaleForm] = useState(false);
  const [search, setSearch]             = useState('');
  const [categoria, setCategoria]       = useState('Todas');
  const [tick, setTick]                 = useState(0);
  const [notification, setNotification] = useState(null);

  const isGerente = user?.rol === 'gerente';
  const refresh = () => setTick(t => t + 1);

  useEffect(() => {
    if (!user || user.rol === 'superadmin') return;
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (categoria !== 'Todas') params.append('categoria', categoria);
    let alive = true;
    apiFetch(`/api/products?${params}`)
      .then(r => r.json())
      .then(d => alive && setProducts(d))
      .catch(console.error);
    return () => { alive = false; };
  }, [user, search, categoria, tick]);

  useEffect(() => {
    if (!user || user.rol === 'superadmin') return;
    let alive = true;
    setLoading(true);
    Promise.all([
      apiFetch('/api/dashboard').then(r => r.json()),
      apiFetch('/api/stats/categorias').then(r => r.json())
    ]).then(([dash, cats]) => {
      if (alive) {
        setDashboard(dash);
        setStatsCat(cats);
        setLoading(false);
      }
    }).catch(console.error);
    return () => { alive = false; };
  }, [user, tick]);

  const notify = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3500);
  };

  const openAdd  = () => { setEditProduct(null); setShowForm(true); };
  const openEdit = async product => {
    // Cargar imagen completa antes de abrir el formulario
    try {
      const res = await apiFetch(`/api/products/${product.id}`);
      if (res.ok) setEditProduct(await res.json());
      else setEditProduct(product);
    } catch {
      setEditProduct(product);
    }
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditProduct(null); };

  const handleSave = async formData => {
    const method = editProduct ? 'PUT' : 'POST';
    const url    = editProduct ? `/api/products/${editProduct.id}` : '/api/products';
    const res = await apiFetch(url, {
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
    await apiFetch(`/api/products/${id}`, { method: 'DELETE' });
    refresh();
    notify('Producto eliminado');
  };

  const handleSale = async formData => {
    const isKit = formData.tipo === 'kit';
    const endpoint = isKit ? '/api/kit-sales' : '/api/ventas/bulk';

    const res = await apiFetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    if (res.ok) {
      setShowSaleForm(false);
      refresh();
      if (isKit) {
        notify('Kit registrado ✓');
      } else {
        const data = await res.json();
        const n = data.ventas.length;
        notify(`Venta registrada ✓ — ${n} ítem${n !== 1 ? 's' : ''}`);
      }
    } else {
      const err = await res.json();
      notify(err.error || 'Error al registrar venta', 'error');
    }
  };

  const handleExport = async () => {
    const res = await apiFetch('/api/export');
    if (!res.ok) return notify('Error al exportar', 'error');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'inventario-aurasistems.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (authLoading) {
    return <div className="loading loading--full">Cargando...</div>;
  }

  if (!user) {
    if (!showAuth) {
      return (
        <LandingPage
          onLogin={() => { setAuthMode('login'); setShowAuth(true); }}
          onSignup={() => { setAuthMode('signup'); setShowAuth(true); }}
        />
      );
    }
    return <AuthView initialMode={authMode} onBack={() => setShowAuth(false)} />;
  }

  if (user.rol === 'superadmin') {
    return (
      <div className="app">
        <Header view="usuarios" setView={() => {}} user={user} onLogout={logout} platformMode />
        <main className="main">
          <PlatformView apiFetch={apiFetch} />
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <Header
        view={view}
        setView={setView}
        onAdd={openAdd}
        onExport={handleExport}
        user={user}
        onLogout={logout}
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
            statsCategoria={statsCategoria}
            loading={loading}
            onViewInventory={() => setView('inventory')}
            isGerente={isGerente}
            apiFetch={apiFetch}
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
            isGerente={isGerente}
          />
        )}

        {view === 'ventas' && (
          <VentasView onRegister={() => setShowSaleForm(true)} apiFetch={apiFetch} isGerente={isGerente} />
        )}

        {view === 'cotizar' && (
          <CotizarView products={products} apiFetch={apiFetch} isGerente={isGerente} />
        )}

        {view === 'cuentas' && (
          <CuentasPorCobrarView apiFetch={apiFetch} isGerente={isGerente} products={products} />
        )}

        {view === 'gastos' && (
          <GastosView apiFetch={apiFetch} isGerente={isGerente} />
        )}

        {view === 'caja' && (
          <CierreCajaView apiFetch={apiFetch} onNavigate={setView} isGerente={isGerente} />
        )}

        {view === 'reportes' && isGerente && (
          <ReportesView apiFetch={apiFetch} />
        )}

        {view === 'usuarios' && isGerente && (
          <UsersView />
        )}
      </main>

      {showForm && (
        <ProductForm
          product={editProduct}
          onSave={handleSave}
          onClose={closeForm}
        />
      )}

      {showSaleForm && (
        <SaleForm
          products={products}
          onSave={handleSale}
          onClose={() => setShowSaleForm(false)}
        />
      )}
    </div>
  );
}
