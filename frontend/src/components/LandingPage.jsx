import React, { useState } from 'react';

const NAV_LINKS = [
  { id: 'features', label: 'Funciones' },
  { id: 'pricing', label: 'Precio' },
  { id: 'faq', label: 'Preguntas' }
];

const FEATURES = [
  {
    title: 'Inventario',
    desc: 'Cada producto con foto, código y categoría. Si el stock baja del mínimo que definas, te avisa antes de que se agote.'
  },
  {
    title: 'Ventas y kits',
    desc: 'Vende una pieza suelta o arma un kit al momento — el sistema descuenta el stock solo, sin que tengas que ajustarlo tú.'
  },
  {
    title: 'Cotizador',
    desc: 'Arma la cotización con tus productos y tu margen. La imprimes o la mandas por WhatsApp desde ahí mismo.'
  },
  {
    title: 'Cuentas por cobrar',
    desc: 'El fiado de cada cliente, con lo que debe y lo que ya abonó — sin post-its ni cuaderno aparte.'
  },
  {
    title: 'Cierre de caja',
    desc: 'Al final del día ves si cuadra: lo que vendiste, lo que gastaste y lo que debería haber en caja.'
  },
  {
    title: 'Reportes',
    desc: 'Exporta a Excel o PDF cuando lo necesites — para ti, para tu contador o para tu socio.'
  }
];

const FAQS = [
  {
    q: '¿Necesito instalar algo?',
    a: 'No. Funciona desde el navegador, en computador, tablet o celular. Solo necesitas internet.'
  },
  {
    q: '¿Puedo darle acceso a mis empleados?',
    a: 'Sí. Creas una cuenta por empleado y decides qué ve cada uno — un vendedor no tiene por qué ver tus costos ni tus utilidades.'
  },
  {
    q: '¿Qué pasa con mis datos si dejo de pagar?',
    a: 'Se conservan. Tu cuenta queda pausada, y en cuanto reactivas el plan sigue todo donde lo dejaste.'
  },
  {
    q: '¿Puedo sacar mi inventario de la plataforma?',
    a: 'Cuando quieras, exportas todo a un CSV que abre directo en Excel.'
  },
  {
    q: 'Ya tengo todo en un cuaderno / Excel, ¿vale la pena cambiarme?',
    a: 'Si te ha pasado que no sabes cuánto stock queda, se te olvida quién te debe, o cuadrar la caja te toma media hora — sí. Si a ti te funciona lo que tienes, no hay afán.'
  }
];

function FaqItem({ item, isOpen, onToggle }) {
  return (
    <div className={`lp-faq-item ${isOpen ? 'lp-faq-item--open' : ''}`}>
      <button className="lp-faq-item__q" onClick={onToggle} aria-expanded={isOpen}>
        <span>{item.q}</span>
        <span className="lp-faq-item__icon" aria-hidden="true">{isOpen ? '−' : '+'}</span>
      </button>
      <div className="lp-faq-item__a-wrap">
        <p className="lp-faq-item__a">{item.a}</p>
      </div>
    </div>
  );
}

export default function LandingPage({ onLogin, onSignup }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);

  const scrollTo = id => {
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="lp">
      {/* ── Nav ─────────────────────────────────────────────── */}
      <header className="lp-nav">
        <div className="lp-nav__inner">
          <div className="lp-nav__brand">
            <img className="lp-nav__mark" src="/logo-icon-light.png" alt="" aria-hidden="true" />
            <span>AuraSistems</span>
          </div>

          <nav className="lp-nav__links">
            {NAV_LINKS.map(l => (
              <button key={l.id} onClick={() => scrollTo(l.id)}>{l.label}</button>
            ))}
          </nav>

          <div className="lp-nav__actions">
            <button className="lp-btn lp-btn--ghost" onClick={onLogin}>Iniciar sesión</button>
            <button className="lp-btn lp-btn--primary" onClick={onSignup}>Crear cuenta</button>
          </div>

          <button
            className="lp-nav__burger"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Abrir menú"
            aria-expanded={menuOpen}
          >
            <span /><span /><span />
          </button>
        </div>

        {menuOpen && (
          <div className="lp-nav__mobile">
            {NAV_LINKS.map(l => (
              <button key={l.id} onClick={() => scrollTo(l.id)}>{l.label}</button>
            ))}
            <hr />
            <button className="lp-btn lp-btn--ghost" onClick={onLogin}>Iniciar sesión</button>
            <button className="lp-btn lp-btn--primary" onClick={onSignup}>Crear cuenta</button>
          </div>
        )}
      </header>

      {/* ── Hero ────────────────────────────────────────────── */}
      <section className="lp-hero">
        <div className="lp-hero__text">
          <h1>Deja el cuaderno.<br /><span className="lp-gold">Lleva tu joyería desde el celular.</span></h1>
          <p>
            Inventario, ventas, cotizaciones y cuentas por cobrar en un solo lugar —
            sin hojas de cálculo que se dañan ni cuadernos que se pierden.
          </p>
          <div className="lp-hero__cta">
            <button className="lp-btn lp-btn--primary lp-btn--lg" onClick={onSignup}>
              Crear mi cuenta
            </button>
            <button className="lp-btn lp-btn--outline lp-btn--lg" onClick={() => scrollTo('features')}>
              Ver qué hace ↓
            </button>
          </div>
          <p className="lp-hero__note">Se configura en un rato. Sin tarjeta de crédito.</p>
        </div>

        <div className="lp-hero__shot">
          <img src="/dashboard-preview.png" alt="Dashboard de AuraSistems con el resumen del inventario y ventas de los últimos 14 días" />
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────── */}
      <section id="features" className="lp-section">
        <h2 className="lp-section__title">Lo que vas a usar todos los días</h2>

        <div className="lp-features">
          {FEATURES.map((f, i) => (
            <div key={f.title} className="lp-feature-card">
              <span className="lp-feature-card__num">{String(i + 1).padStart(2, '0')}</span>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────── */}
      <section id="pricing" className="lp-section">
        <h2 className="lp-section__title">Un precio. Sin letra pequeña.</h2>
        <p className="lp-section__sub">Todo lo de arriba viene incluido desde el primer día.</p>

        <div className="lp-price-card">
          <div className="lp-price-card__header">
            <span className="lp-price-card__name">AuraSistems</span>
            <div className="lp-price-card__amount">
              <span className="lp-price-card__currency">$</span>
              <span className="lp-price-card__number">99.000</span>
              <span className="lp-price-card__period">/mes</span>
            </div>
          </div>

          <ul className="lp-price-card__list">
            <li>Inventario y ventas ilimitadas</li>
            <li>Cotizador y cuentas por cobrar</li>
            <li>Cierre de caja y reportes en Excel/PDF</li>
            <li>Cuentas para tu equipo, con roles</li>
            <li>Soporte por WhatsApp</li>
          </ul>

          <button className="lp-btn lp-btn--primary lp-btn--lg lp-btn--block" onClick={onSignup}>
            Crear mi cuenta
          </button>
          <p className="lp-price-card__note">Cancelas cuando quieras.</p>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────── */}
      <section id="faq" className="lp-section">
        <h2 className="lp-section__title">Preguntas frecuentes</h2>

        <div className="lp-faq">
          {FAQS.map((item, i) => (
            <FaqItem
              key={item.q}
              item={item}
              isOpen={openFaq === i}
              onToggle={() => setOpenFaq(openFaq === i ? -1 : i)}
            />
          ))}
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────── */}
      <section className="lp-final-cta">
        <h2>¿Le damos una mirada a tu inventario?</h2>
        <p>Crea tu cuenta y en un rato ya lo tienes cargado.</p>
        <button className="lp-btn lp-btn--primary lp-btn--lg" onClick={onSignup}>
          Crear mi cuenta
        </button>
      </section>

      <footer className="lp-footer">
        <div className="lp-footer__brand">
          <img className="lp-footer__mark" src="/logo-icon-light.png" alt="" aria-hidden="true" /> AuraSistems
        </div>
        <p>© {new Date().getFullYear()} AuraSistems · Sistema de gestión para joyerías</p>
        <p className="lp-footer__legal">
          <a href="/terminos.html">Términos de Servicio</a>
          <span aria-hidden="true"> · </span>
          <a href="/privacidad.html">Política de Privacidad</a>
        </p>
      </footer>
    </div>
  );
}
