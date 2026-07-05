import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export default function UsersView() {
  const { apiFetch, user } = useAuth();
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [nombre, setNombre]   = useState('');
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol]         = useState('empleado');
  const [error, setError]     = useState('');
  const [saving, setSaving]   = useState(false);

  const load = () => {
    setLoading(true);
    apiFetch('/api/users')
      .then(r => r.json())
      .then(setUsers)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const resetForm = () => {
    setNombre(''); setEmail(''); setPassword(''); setRol('empleado'); setError(''); setShowForm(false);
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await apiFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, email, password, rol })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al crear usuario');
      resetForm();
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async u => {
    if (!window.confirm(`¿Eliminar a ${u.nombre}?`)) return;
    const res = await apiFetch(`/api/users/${u.id}`, { method: 'DELETE' });
    if (res.ok) load();
    else {
      const data = await res.json();
      alert(data.error || 'Error al eliminar');
    }
  };

  return (
    <div className="users-view">
      <div className="inventory__header">
        <h2 className="section-title">Usuarios</h2>
        <button className="btn btn--primary" onClick={() => setShowForm(s => !s)}>
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
              <tr>
                <th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>{u.nombre} {u.id === user.id && <span className="text-muted">(tú)</span>}</td>
                  <td>{u.email}</td>
                  <td>{u.rol === 'gerente' ? 'Gerente' : 'Empleado'}</td>
                  <td>{u.activo ? 'Activo' : 'Inactivo'}</td>
                  <td>
                    {u.id !== user.id && (
                      <button className="btn-icon btn-icon--delete" onClick={() => handleDelete(u)} title="Eliminar">✕</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
