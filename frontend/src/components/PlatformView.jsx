import React, { useState, useEffect } from 'react';

const fmtFecha = str => new Date(str).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });

export default function PlatformView({ apiFetch }) {
  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading]   = useState(true);

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
        <span className="results-count">{empresas.length} empresa{empresas.length !== 1 ? 's' : ''}</span>
      </div>

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
                <tr key={e.id}>
                  <td><strong>{e.nombre}</strong></td>
                  <td className="td-num">{e.total_usuarios}</td>
                  <td className="td-num">{e.total_productos}</td>
                  <td>{fmtFecha(e.fecha_creacion)}</td>
                  <td>
                    <span className={`categoria-badge ${e.activa ? 'cat--oro' : 'cat--otro'}`}>
                      {e.activa ? 'Activa' : 'Suspendida'}
                    </span>
                  </td>
                  <td>
                    <button
                      className={`btn btn--outline ${e.activa ? '' : ''}`}
                      onClick={() => toggleActiva(e)}
                    >
                      {e.activa ? 'Suspender' : 'Reactivar'}
                    </button>
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
