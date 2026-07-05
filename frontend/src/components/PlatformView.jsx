import React, { useState, useEffect } from 'react';

const fmtFecha = str => new Date(str).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });

function NuevaEmpresaForm({ apiFetch, onDone, onCancel }) {
  const [empresaNombre, setEmpresaNombre] = useState('');
  const [nombre, setNombre] = useState('');
  const [email, setEmail]   = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]   = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await apiFetch('/api/platform/empresas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresa_nombre: empresaNombre, nombre, email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al crear la empresa');
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="form sale-add-section">
      <p className="sale-section-label">Nueva joyería cliente</p>
      <div className="form-grid">
        <div className="form-group">
          <label>Nombre de la joyería</label>
          <input value={empresaNombre} onChange={e => setEmpresaNombre(e.target.value)} required placeholder="Ej: Joyería López" />
        </div>
        <div className="form-group">
          <label>Nombre del gerente</label>
          <input value={nombre} onChange={e => setNombre(e.target.value)} required placeholder="Nombre completo" />
        </div>
        <div className="form-group">
          <label>Correo del gerente</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="correo@ejemplo.com" />
        </div>
        <div className="form-group">
          <label>Contraseña</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} placeholder="Mínimo 6 caracteres" />
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn btn--outline" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? 'Creando...' : 'Crear joyería'}
        </button>
      </div>
    </form>
  );
}

function EmpresaUsuarios({ apiFetch, empresa }) {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [nombre, setNombre]     = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol]           = useState('empleado');
  const [error, setError]       = useState('');
  const [saving, setSaving]     = useState(false);

  const load = () => {
    setLoading(true);
    apiFetch(`/api/platform/empresas/${empresa.id}/usuarios`)
      .then(r => r.json())
      .then(setUsuarios)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(load, [empresa.id]);

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await apiFetch(`/api/platform/empresas/${empresa.id}/usuarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, email, password, rol })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al crear usuario');
      setNombre(''); setEmail(''); setPassword(''); setRol('empleado'); setShowForm(false);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="platform-empresa-usuarios">
      <div className="inventory__header">
        <p className="sale-section-label">Usuarios de {empresa.nombre}</p>
        <button className="btn btn--outline" onClick={() => setShowForm(s => !s)}>
          {showForm ? 'Cancelar' : '+ Agregar usuario'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="form sale-add-section">
          <div className="form-grid">
            <div className="form-group">
              <label>Nombre</label>
              <input value={nombre} onChange={e => setNombre(e.target.value)} required placeholder="Nombre completo" />
            </div>
            <div className="form-group">
              <label>Correo</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="correo@ejemplo.com" />
            </div>
            <div className="form-group">
              <label>Contraseña</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} placeholder="Mínimo 6 caracteres" />
            </div>
            <div className="form-group">
              <label>Rol</label>
              <select value={rol} onChange={e => setRol(e.target.value)}>
                <option value="empleado">Empleado</option>
                <option value="gerente">Gerente</option>
              </select>
            </div>
          </div>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Creando...' : 'Crear usuario'}
          </button>
        </form>
      )}

      {loading ? (
        <div className="loading">Cargando usuarios...</div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {usuarios.map(u => (
                <tr key={u.id}>
                  <td>{u.nombre}</td>
                  <td>{u.email}</td>
                  <td>{u.rol === 'gerente' ? 'Gerente' : 'Empleado'}</td>
                  <td>{u.activo ? 'Activo' : 'Inactivo'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function PlatformView({ apiFetch }) {
  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showNueva, setShowNueva] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const load = () => {
    setLoading(true);
    apiFetch('/api/platform/empresas')
      .then(r => r.json())
      .then(setEmpresas)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const toggleActiva = async e => {
    const accion = e.activa ? 'suspender' : 'activar';
    if (!window.confirm(`¿Seguro que quieres ${accion} "${e.nombre}"?`)) return;
    const res = await apiFetch(`/api/platform/empresas/${e.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activa: !e.activa })
    });
    if (res.ok) load();
  };

  return (
    <div className="platform-view">
      <div className="inventory__header">
        <h2 className="section-title">Joyerías clientes</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className="results-count">{empresas.length} empresa{empresas.length !== 1 ? 's' : ''}</span>
          <button className="btn btn--primary" onClick={() => setShowNueva(s => !s)}>
            {showNueva ? 'Cancelar' : '+ Nueva joyería'}
          </button>
        </div>
      </div>

      {showNueva && (
        <NuevaEmpresaForm
          apiFetch={apiFetch}
          onCancel={() => setShowNueva(false)}
          onDone={() => { setShowNueva(false); load(); }}
        />
      )}

      {loading ? (
        <div className="loading">Cargando...</div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Empresa</th>
                <th className="td-num">Usuarios</th>
                <th className="td-num">Productos</th>
                <th>Fecha de alta</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {empresas.map(e => (
                <React.Fragment key={e.id}>
                  <tr>
                    <td>
                      <button
                        className="platform-empresa-link"
                        onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                      >
                        <strong>{e.nombre}</strong> {expanded === e.id ? '▲' : '▼'}
                      </button>
                    </td>
                    <td className="td-num">{e.total_usuarios}</td>
                    <td className="td-num">{e.total_productos}</td>
                    <td>{fmtFecha(e.fecha_creacion)}</td>
                    <td>
                      <span className={`categoria-badge ${e.activa ? 'cat--oro' : 'cat--otro'}`}>
                        {e.activa ? 'Activa' : 'Suspendida'}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn--outline" onClick={() => toggleActiva(e)}>
                        {e.activa ? 'Suspender' : 'Reactivar'}
                      </button>
                    </td>
                  </tr>
                  {expanded === e.id && (
                    <tr>
                      <td colSpan={6} style={{ background: 'var(--gray-50)' }}>
                        <EmpresaUsuarios apiFetch={apiFetch} empresa={e} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
