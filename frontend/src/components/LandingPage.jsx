import React, { useState, useEffect, useRef } from 'react';

const NAV_LINKS = [
  { id: 'features', label: 'Funciones' },
  { id: 'stats', label: 'Resultados' },
  { id: 'pricing', label: 'Precios' },
  { id: 'faq', label: 'Preguntas' }
];

const FEATURES = [
  {
    icon: '💎',
    title: 'Inventario inteligente',
    desc: 'Fotos, códigos, categorías y alertas automáticas cuando el stock llega al mínimo.'
  },
  {
    icon: '🧾',
    title: 'Ventas y kits',
    desc: 'Registra ventas individuales o kits armados en segundos, con recibo listo para imprimir.'
  },
  {
    icon: '💰',
    title: 'Cotizador al instante',
    desc: 'Arma cotizaciones con tus productos y el margen que definas, sin calculadora aparte.'
  },
  {
    icon: '📇',
    title: 'Cuentas por cobrar',
    desc: 'Controla abonos y saldos pendientes de cada cliente sin hojas de cálculo sueltas.'
  },
  {
    icon: '🗄️',
    title: 'Cierre de caja diario',
    desc: 'Cuadra ventas, gastos y efectivo del día con un resumen claro al cerrar el negocio.'
  },
  {
    icon: '📊',
    title: 'Reportes reales',
    desc: 'Exporta a Excel y PDF con un clic — utilidades, categorías y evolución del negocio.'
  }
];

const STATS = [
  { value: 100, suffix: '%', label: 'En la nube, sin instalar nada' },
  { value: 24, suffix: '/7', label: 'Acceso desde cualquier lugar' },
  { value: 1, suffix: ' min', label: 'Para registrar una venta' },
  { value: 0, suffix: '', label: 'Hojas de cálculo necesarias' }
];

const FAQS = [
  {
    q: '¿Necesito instalar algo?',
    a: 'No. AuraSistems funciona desde el navegador, en computadora, tablet o celular. Solo necesitas una conexión a internet.'
  },
  {
    q: '¿Puedo usarlo con varios empleados?',
    a: 'Sí. Cada joyería puede crear cuentas para su equipo con roles de gerente o empleado, controlando quién ve costos y utilidades.'
  },
  {
    q: '¿Mis datos están seguros?',
    a: 'Toda la información viaja cifrada y las contraseñas nunca se guardan en texto plano. Cada joyería solo ve sus propios datos.'
  },
  {
    q: '¿Puedo exportar mi inventario?',
    a: 'Sí, en cualquier momento puedes exportar tu inventario completo a CSV compatible con Excel, además de reportes en PDF.'
  },
  {
    q: '¿Qué pasa si dejo de pagar?',
    a: 'Tu cuenta queda pausada pero tus datos se conservan. En cuanto reactivas el plan, todo sigue exactamente donde lo dejaste.'
  }
];

function useCountUp(target, active) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf;
    const duration = 900;
    const start = performance.now();
    const tick = now => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, target]);
  return value;
}

function StatCounter({ value, suffix, label, active }) {
  const count = useCountUp(value, active);
  return (
    <div className="lp-stat">
      <div className="lp-stat__value">{count}{suffix}</div>
      <div className="lp-stat__label">{label}</div>
    </div>
  );
}

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
  const [billing, setBilling] = useState('monthly'); // 'monthly' | 'annual'
  const [openFaq, setOpenFaq] = useState(0);
  const [statsVisible, setStatsVisible] = useState(false);
  const statsRef = useRef(null);

  useEffect(() => {
    const el = statsRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      entries => entries.forEach(e => e.isIntersecting && setStatsVisible(true)),
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scrollTo = id => {
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const basePrice = 99000;
  const price = billing === 'annual' ? Math.round(basePrice * 0.8) : basePrice;

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
            <button className="lp-btn lp-btn--primary" onClick={onSignup}>Comenzar gratis</button>
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
            <button className="lp-btn lp-btn--primary" onClick={onSignup}>Comenzar gratis</button>
          </div>
        )}
      </header>

      {/* ── Hero ────────────────────────────────────────────── */}
      <section className="lp-hero">
        <div className="lp-hero__text">
          <span className="lp-badge">Hecho para joyerías</span>
          <h1>Toda tu joyería,<br /><span className="lp-gold">bajo control.</span></h1>
          <p>
            Inventario, ventas, cotizaciones y finanzas en una sola plataforma.
            Deja las hojas de cálculo y empieza a ver tu negocio con claridad.
          </p>
          <div className="lp-hero__cta">
            <button className="lp-btn lp-btn--primary lp-btn--lg" onClick={onSignup}>
              Crear mi cuenta gratis
            </button>
            <button className="lp-btn lp-btn--outline lp-btn--lg" onClick={() => scrollTo('features')}>
              Ver funciones ↓
            </button>
          </div>
          <p className="lp-hero__note">Sin tarjeta de crédito · Configura tu joyería en menos de un minuto</p>
        </div>

        <div className="lp-hero__mock" aria-hidden="true">
          <div className="lp-mock">
            <div className="lp-mock__bar">
              <span /><span /><span />
            </div>
            <div className="lp-mock__row">
              <div className="lp-mock__card">
                <span className="lp-mock__card-label">Inventario</span>
                <span className="lp-mock__card-value">248</span>
              </div>
              <div className="lp-mock__card">
                <span className="lp-mock__card-label">Ventas hoy</span>
                <span className="lp-mock__card-value lp-gold">$1.2M</span>
              </div>
            </div>
            <div className="lp-mock__chart">
              {[40, 65, 50, 80, 60, 95, 70].map((h, i) => (
                <div key={i} className="lp-mock__bar-item" style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────── */}
      <section id="features" className="lp-section">
        <h2 className="lp-section__title">Todo lo que tu joyería necesita</h2>
        <p className="lp-section__sub">Una plataforma, sin apps sueltas ni papeles perdidos.</p>

        <div className="lp-features">
          {FEATURES.map(f => (
            <div key={f.title} className="lp-feature-card">
              <span className="lp-feature-card__icon" aria-hidden="true">{f.icon}</span>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Stats ───────────────────────────────────────────── */}
      <section id="stats" className="lp-section lp-section--dark" ref={statsRef}>
        <h2 className="lp-section__title lp-section__title--light">Diseñado para el día a día real</h2>
        <div className="lp-stats">
          {STATS.map(s => (
            <StatCounter key={s.label} {...s} active={statsVisible} />
          ))}
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────── */}
      <section id="pricing" className="lp-section">
        <h2 className="lp-section__title">Un solo plan, sin sorpresas</h2>
        <p className="lp-section__sub">Todas las funciones incluidas desde el primer día.</p>

        <div className="lp-billing-toggle">
          <button
            className={billing === 'monthly' ? 'is-active' : ''}
            onClick={() => setBilling('monthly')}
          >
            Mensual
          </button>
          <button
            className={billing === 'annual' ? 'is-active' : ''}
            onClick={() => setBilling('annual')}
          >
            Anual <span className="lp-billing-toggle__badge">-20%</span>
          </button>
        </div>

        <div className="lp-price-card">
          <div className="lp-price-card__header">
            <span className="lp-price-card__name">AuraSistems</span>
            <div className="lp-price-card__amount">
              <span className="lp-price-card__currency">$</span>
              <span className="lp-price-card__number">{price.toLocaleString('es-CO')}</span>
              <span className="lp-price-card__period">/mes</span>
            </div>
            {billing === 'annual' && (
              <span className="lp-price-card__save">Facturado anualmente · ahorras 20%</span>
            )}
          </div>

          <ul className="lp-price-card__list">
            <li>Inventario y ventas ilimitadas</li>
            <li>Cotizador y cuentas por cobrar</li>
            <li>Cierre de caja y reportes en Excel/PDF</li>
            <li>Usuarios de tu equipo con roles</li>
            <li>Soporte por correo y WhatsApp</li>
          </ul>

          <button className="lp-btn lp-btn--primary lp-btn--lg lp-btn--block" onClick={onSignup}>
            Comenzar gratis
          </button>
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
        <h2>Deja de administrar tu joyería a mano.</h2>
        <p>Crea tu cuenta gratis y empieza a usar AuraSistems hoy mismo.</p>
        <button className="lp-btn lp-btn--primary lp-btn--lg" onClick={onSignup}>
          Crear mi cuenta gratis
        </button>
      </section>

      <footer className="lp-footer">
        <div className="lp-footer__brand">
          <img className="lp-footer__mark" src="/logo-icon-light.png" alt="" aria-hidden="true" /> AuraSistems
        </div>
        <p>© {new Date().getFullYear()} AuraSistems · Sistema de gestión para joyerías</p>
      </footer>
    </div>
  );
}
