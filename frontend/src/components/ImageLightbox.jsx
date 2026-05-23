import React, { useEffect } from 'react';

export default function ImageLightbox({ src, onClose }) {
  // Cerrar con Escape
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose} aria-label="Cerrar">✕</button>
      <img
        src={src}
        alt=""
        className="lightbox-img"
        onClick={e => e.stopPropagation()}
      />
    </div>
  );
}
