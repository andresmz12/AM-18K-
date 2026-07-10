import React, { useEffect, useRef, useState } from 'react';

// Sección que aparece con fade/slide cuando entra al viewport
function Reveal({ children, delay = 0 }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className={`lp-reveal ${visible ? 'lp-reveal--in' : ''}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

// Contador que anima de 0 al valor cuando se ve por primera vez
function Counter({ end, suffix = '', duration = 1400 }) {
  const ref = useRef(null);
  const [value, setValue] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      obs.disconnect();
      const start = performance.now();
      const tick = now => {
        const p = Math.min((now - start) / duration, 1);
        setValue(Math.round(end * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [end, duration]);
  return <span ref={ref}>{value.toLocaleString('es-CO')}{suffix}</span>;
}

const FEATURES = [
  { icon: '💍', title: 'Inventario al gramo', text: 'Registra cada pieza con peso, costo, foto y código. Busca por nombre, código o proveedor en segundos.' },
  { icon: '🏷️', title: 'Precios sin calculadora', text: 'Define tu porcentaje de ganancia y el precio de venta se calcula solo. Cambia el costo y todo se actualiza.' },
  { icon: '🛒', title: 'Ventas y armados', text: 'Vende piezas sueltas o arma manillas y composiciones con varios componentes; el stock se descuenta automáticamente.' },
  { icon: '📒', title: 'Cuentas por cobrar', text: 'Lleva las deudas de tus clientes y registra abonos hasta saldarlas. Nada se queda en la libreta.' },
  { icon: '🧾', title: 'Cierre de caja diario', text: 'Apertura, ventas, abonos y gastos del día en una sola pantalla. Sabes al instante si la caja cuadra.' },
  { icon: '📈', title: 'Reportes de verdad', text: 'Dashboard con gráficos, exportación a Excel y PDF. Ve qué se vende y cuánto oro tienes en vitrina.' }
];

const STEPS = [
  { n: '01', title: 'Crea tu cuenta', text: 'Registra tu joyería con tu correo. Sin instalaciones, sin tarjeta de crédito.' },
  { n: '02', title: 'Carga tus piezas', text: 'Agrega tus productos con foto, peso y costo. Puedes empezar con lo que tengas en vitrina hoy.' },
  { n: '03', title: 'Vende y controla', text: 'Registra ventas desde el celular o el computador. El inventario y la caja se mantienen al día solos.' }
];

const FAQS = [
  { q: '¿Necesito instalar algo?', a: 'No. Funciona en el navegador de tu celular, tablet o computador. Solo entras con tu correo y contraseña.' },
  { q: '¿Mis empleados pueden ver mis costos?', a: 'No. El rol de empleado registra ventas y cotizaciones, pero nunca ve costos ni utilidades. Solo el gerente accede a la información financiera.' },
  { q: '¿Qué pasa si vendo manillas armadas con varias piezas?', a: 'Las ventas de kits descuentan el stock de cada componente y suman mano de obra y valores extra al total, todo en un solo registro.' },
  { q: '¿Puedo sacar mis datos cuando quiera?', a: 'Sí. Exportas tu inventario completo a Excel (CSV) y generas reportes en PDF cuando lo necesites.' },
  { q: '¿Sirve para varias personas a la vez?', a: 'Sí. Crea usuarios para tu equipo con permisos según su rol, y todos trabajan sobre el mismo inventario en tiempo real.' }
];

export default function LandingPage({ onLogin, onSignup }) {
  const heroRef = useRef(null);
  const [openFaq, setOpenFaq] = useState(0);

  // Brillo que sigue el mouse en el hero
  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const move = e => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
      el.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
    };
    el.addEventListener('mousemove', move);
    return () => el.removeEventListener('mousemove', move);
  }, []);

  return (
    <div className="lp">
      <nav className="lp-nav">
        <div className="lp-nav__brand">
          <span className="lp-nav__gem" aria-hidden="true">◈</span>
          <span>AM 18K</span>
        </div>
        <div className="lp-nav__actions">
          <button className="lp-btn lp-btn--ghost" onClick={onLogin}>Iniciar sesión</button>
          <button className="lp-btn lp-btn--gold" onClick={onSignup}>Crear cuenta</button>
        </div>
      </nav>

      <header className="lp-hero" ref={heroRef}>
        <div className="lp-hero__glow" aria-hidden="true" />
        <div className="lp-hero__sparkles" aria-hidden="true">
          {Array.from({ length: 14 }).map((_, i) => (
            <span key={i} className="lp-sparkle" style={{
              left: `${(i * 137) % 100}%`,
              top: `${(i * 53) % 100}%`,
              animationDelay: `${(i * 0.7) % 5}s`,
              animationDuration: `${4 + (i % 4)}s`
            }}>✦</span>
          ))}
        </div>
        <p className="lp-hero__kicker">Para joyerías que crecen</p>
        <h1 className="lp-hero__title">
          Tu joyería, en orden.<br />
          <em>Del mostrador a la caja.</em>
        </h1>
        <p className="lp-hero__sub">
          Inventario, ventas, cuentas por cobrar y cierre de caja en un solo lugar.
          Hecho para el día a día de una joyería real: piezas al gramo, armados a la medida y precios que cuadran.
        </p>
        <div className="lp-hero__cta">
          <button className="lp-btn lp-btn--gold lp-btn--lg" onClick={onSignup}>Empezar gratis</button>
          <button className="lp-btn lp-btn--ghost lp-btn--lg" onClick={onLogin}>Ya tengo cuenta</button>
        </div>

        <div className="lp-hero__stats">
          <div className="lp-stat">
            <strong><Counter end={100} suffix="%" /></strong>
            <span>de tu inventario con foto, peso y código</span>
          </div>
          <div className="lp-stat">
            <strong><Counter end={30} suffix=" seg" /></strong>
            <span>para registrar una venta desde el celular</span>
          </div>
          <div className="lp-stat">
            <strong><Counter end={1} suffix=" clic" /></strong>
            <span>para exportar todo a Excel o PDF</span>
          </div>
        </div>
      </header>

      <section className="lp-section">
        <Reveal>
          <h2 className="lp-section__title">Todo lo que pasa en tu vitrina, bajo control</h2>
          <p className="lp-section__sub">Deja el cuaderno y las fórmulas de Excel. Cada módulo está pensado para cómo trabaja una joyería.</p>
        </Reveal>
        <div className="lp-features">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={i * 70}>
              <div className="lp-card">
                <div className="lp-card__icon" aria-hidden="true">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="lp-section lp-section--dark">
        <Reveal>
          <h2 className="lp-section__title">Empiezas hoy mismo</h2>
        </Reveal>
        <div className="lp-steps">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 120}>
              <div className="lp-step">
                <span className="lp-step__num">{s.n}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={200}>
          <div className="lp-center">
            <button className="lp-btn lp-btn--gold lp-btn--lg" onClick={onSignup}>Crear mi cuenta</button>
          </div>
        </Reveal>
      </section>

      <section className="lp-section">
        <Reveal>
          <h2 className="lp-section__title">Preguntas frecuentes</h2>
        </Reveal>
        <div className="lp-faq">
          {FAQS.map((f, i) => (
            <Reveal key={f.q} delay={i * 60}>
              <div className={`lp-faq__item ${openFaq === i ? 'lp-faq__item--open' : ''}`}>
                <button className="lp-faq__q" onClick={() => setOpenFaq(openFaq === i ? -1 : i)} aria-expanded={openFaq === i}>
                  {f.q}
                  <span className="lp-faq__chev" aria-hidden="true">▾</span>
                </button>
                <div className="lp-faq__a"><p>{f.a}</p></div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-footer__brand">
          <span aria-hidden="true">◈</span> AM 18K
        </div>
        <p>Sistema de gestión para joyerías · Inventario, ventas y caja</p>
        <button className="lp-btn lp-btn--ghost" onClick={onLogin}>Iniciar sesión</button>
      </footer>
    </div>
  );
}
