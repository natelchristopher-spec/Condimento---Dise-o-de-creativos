'use client';

import { useState, useEffect } from 'react';

// ─── CONFIG ────────────────────────────────────────────────────────────────
const CHECKOUT_URL = 'https://www.skool.com/spicy-ad-formula-3847/about';
const DEMO_VIDEO_URL = ''; // TODO: 'https://www.youtube.com/embed/XXX' or 'https://www.loom.com/embed/XXX'
const PRICE_RISE_DATE = 'el 8 de junio';
const CURRENT_PRICE = 17;
const NEXT_PRICE = 47;

// ─── DATA ──────────────────────────────────────────────────────────────────
const CORE = [
  { label: 'Spicy Ad Formula', desc: 'El sistema publicitario basado en psicología de compra — no en el algoritmo del día. Funciona hoy y cuando Meta haga el próximo cambio.', value: 197 },
  { label: 'Comunidad Spicy Ads Ecommerce', desc: 'Q&A semanales, casos reales y feedback constante de otras marcas que están en el mismo proceso.', value: 97 },
  { label: 'Condimento AI — Sistema completo', desc: 'Testing de ángulos + sistema PEC + anuncios + carruseles IG + ficha de producto. Todo automatizado.', value: 497 },
  { label: 'Desafío 30 días guiado', desc: 'Ejecutás el sistema semana a semana. Al final del mes tenés tu marca funcionando, no apuntes en un cuaderno.', value: 197 },
];

const BONUSES = [
  { n: 'Bonus #1', label: 'Sesión de Onboarding 1 a 1 con Cris', desc: '20 minutos para arrancar tu marca desde cero. Analizamos tu caso y te decimos exactamente por dónde empezar. Solo para los primeros 30 que entren.', value: 150 },
  { n: 'Bonus #2', label: 'Guía de Configuración de Condimento AI', desc: 'Video paso a paso para conectar tu API desde cero. En menos de 10 minutos tenés la herramienta funcionando sin tocar una línea de código.', value: 47 },
  { n: 'Bonus #3', label: 'Pack de Ángulos Publicitarios', desc: 'Los 10 ángulos que más convierten en e-commerce LATAM según nuestra auditoría de 100+ marcas. Listos para cargar en Condimento desde el día 1.', value: 97 },
];

const FAQS = [
  { q: '¿Cómo recibo el acceso?', a: 'Apenas completás el pago recibís acceso inmediato a la plataforma Condimento, a la comunidad y a todos los materiales. Te enviamos todo por email.' },
  { q: '¿Para quién es esto?', a: 'Para dueños de e-commerce o dropshippers en LATAM que quieren construir una marca real o dejar de improvisar con sus campañas. Funciona igual si arrancás desde cero o si ya tenés ventas.' },
  { q: '¿Necesito saber de diseño o marketing?', a: 'No. Describís tu producto y la IA hace el resto. Para conectar tu API de OpenAI tenés el bonus de configuración incluido — en menos de 10 minutos la tenés funcionando.' },
  { q: '¿Cuánto cuesta la API de OpenAI?', a: 'Entre $2 y $8 USD por mes para uso normal. Muchísimo menos que un diseñador, agencia o cualquier herramienta de diseño.' },
  { q: '¿Cuánto cuesta después del 8 de junio?', a: `$${NEXT_PRICE}/mes. Sin excepciones. El precio de $${CURRENT_PRICE} es solo durante el lanzamiento.` },
  { q: '¿Qué pasa si no me gusta?', a: 'Tenés 30 días. Si no quedás satisfecho te devolvemos cada centavo y te quedás con el contenido igual.' },
];

const totalValue = [...CORE, ...BONUSES].reduce((a, i) => a + i.value, 0);

// ─── COMPONENTS ────────────────────────────────────────────────────────────
function Countdown() {
  const [t, setT] = useState({ d: 0, h: 0, m: 0, s: 0 });
  useEffect(() => {
    const target = new Date('2026-06-08T23:59:59');
    const tick = () => {
      const diff = Math.max(0, target.getTime() - Date.now());
      setT({ d: Math.floor(diff / 86400000), h: Math.floor((diff % 86400000) / 3600000), m: Math.floor((diff % 3600000) / 60000), s: Math.floor((diff % 60000) / 1000) });
    };
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id);
  }, []);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
      {[{ v: pad(t.d), l: 'días' }, { v: pad(t.h), l: 'hs' }, { v: pad(t.m), l: 'min' }, { v: pad(t.s), l: 'seg' }].map(({ v, l }) => (
        <div key={l} style={{ textAlign: 'center', background: 'rgba(0,0,0,.4)', border: '1px solid rgba(255,255,255,.15)', borderRadius: 8, padding: '8px 12px', minWidth: 52 }}>
          <div style={{ fontFamily: 'var(--font-m),sans-serif', fontWeight: 900, fontSize: '1.5rem', lineHeight: 1 }}>{v}</div>
          <div style={{ fontSize: '.65rem', marginTop: 3, opacity: .5 }}>{l}</div>
        </div>
      ))}
    </div>
  );
}

function VideoBlock() {
  const [playing, setPlaying] = useState(false);
  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', aspectRatio: '16/9', background: '#0a0a14', border: '2px solid rgba(228,40,32,.35)', position: 'relative', cursor: playing ? 'default' : 'pointer' }} onClick={() => !playing && setPlaying(true)}>
      {playing && DEMO_VIDEO_URL ? (
        <iframe src={`${DEMO_VIDEO_URL}?autoplay=1`} style={{ width: '100%', height: '100%', border: 'none' }} allow="autoplay; fullscreen" allowFullScreen />
      ) : (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'linear-gradient(135deg,#111,#0d0d1a)' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg,#ff7b00,#ff9500)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem', boxShadow: '0 0 40px rgba(255,123,0,.5)' }}>▶</div>
          <p style={{ fontFamily: 'var(--font-m),sans-serif', fontWeight: 700, fontSize: '.82rem', letterSpacing: '.08em', opacity: .7, margin: 0 }}>{DEMO_VIDEO_URL ? 'MIRÁ CÓMO FUNCIONA EN 1 MINUTO' : 'DEMO — PRÓXIMAMENTE'}</p>
        </div>
      )}
    </div>
  );
}

function CtaCard({ label = `QUIERO ACCESO INMEDIATO POR $${CURRENT_PRICE}/MES →` }: { label?: string }) {
  return (
    <a href={CHECKOUT_URL} style={{ display: 'block', background: 'linear-gradient(135deg,#ff7b00,#ff9500)', color: '#fff', fontFamily: 'var(--font-m),sans-serif', fontWeight: 900, fontSize: '1rem', letterSpacing: '.04em', textAlign: 'center', padding: '18px 24px', borderRadius: 50, textDecoration: 'none', boxShadow: '0 6px 30px rgba(255,123,0,.5)', transition: 'transform .15s', lineHeight: 1.3, position: 'relative', overflow: 'hidden' }}>
      <span style={{ position: 'absolute', top: 0, left: '-100%', width: '60%', height: '100%', background: 'linear-gradient(90deg,transparent,rgba(255,255,255,.25),transparent)', animation: 'shimmer 2.5s infinite' }} />
      {label}
    </a>
  );
}

function Chevrons() {
  return (
    <div style={{ textAlign: 'center', padding: '24px 0', opacity: .2 }}>
      {['▼', '▼', '▼'].map((c, i) => <span key={i} style={{ fontSize: '1rem', margin: '0 4px', color: '#e42820' }}>{c}</span>)}
    </div>
  );
}

function TrustRow() {
  return (
    <p style={{ textAlign: 'center', color: 'rgba(255,255,255,.3)', fontSize: '.72rem', marginTop: 10 }}>
      🔒 Pago 100% seguro · Acceso inmediato · Cancelás cuando quieras
    </p>
  );
}

// ─── PAGE ──────────────────────────────────────────────────────────────────
export default function AccesoPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <>
      <style>{`
        
        @keyframes shimmer { 0%{left:-100%} 100%{left:200%} }
        @keyframes gmove   { 0%{background-position:0%} 100%{background-position:200%} }
        @keyframes pulse   { 0%,100%{transform:scale(1)} 50%{transform:scale(1.03)} }

        * { box-sizing: border-box; }
        .lp { background: #0c0c0c; font-family: 'var(--font-i)', sans-serif; color: #fff; }
        .lp h1, .lp h2, .lp h3, .lp h4 { font-family: 'var(--font-m)', sans-serif; margin: 0; }
        .lp p { margin: 0; }

        .grad     { background: linear-gradient(135deg,#e42820,#c0392b); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
        .grad-bg  { background: linear-gradient(135deg,#1a0000,#0d0d0d); }
        .section-light { background: #f5f5f5; color: #111; }
        .section-dark  { background: #0a0a0a; }
        .section-mid   { background: #111; }

        .top-bar { background: linear-gradient(90deg,#8b1a1a,#e42820,#8b1a1a); background-size:200%; animation:gmove 4s linear infinite; text-align:center; padding:11px 16px; font-family:'Montserrat',sans-serif; font-weight:800; font-size:.76rem; letter-spacing:.1em; text-transform:uppercase; }

        .cta-pill { display:block; background:linear-gradient(135deg,#ff7b00,#ff9500); color:#fff; font-family:'Montserrat',sans-serif; font-weight:900; font-size:.95rem; letter-spacing:.04em; text-align:center; padding:17px 24px; border-radius:50px; text-decoration:none; box-shadow:0 6px 30px rgba(255,123,0,.45); position:relative; overflow:hidden; transition:transform .15s,box-shadow .15s; animation:pulse 3s ease-in-out infinite; line-height:1.3; }
        .cta-pill:hover { transform:translateY(-2px); box-shadow:0 10px 40px rgba(255,123,0,.6); }
        .cta-pill::before { content:''; position:absolute; top:0; left:-100%; width:60%; height:100%; background:linear-gradient(90deg,transparent,rgba(255,255,255,.25),transparent); animation:shimmer 2.5s infinite; }

        .card-dark  { background:#181818; border:1px solid rgba(255,255,255,.07); border-radius:14px; }
        .card-red   { background:linear-gradient(135deg,rgba(228,40,32,.1),rgba(192,57,43,.05)); border:1px solid rgba(228,40,32,.25); border-radius:14px; }

        .bonus-card { background:#fff; border-radius:14px; overflow:hidden; color:#111; box-shadow:0 4px 24px rgba(0,0,0,.12); }
        .bonus-header { background:#e42820; padding:12px 20px; }

        .guarantee-ring { width:110px; height:110px; border-radius:50%; border:4px solid #ff7b00; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; flex-shrink:0; background:rgba(255,123,0,.08); }

        .trust-badge { text-align:center; background:#181818; border:1px solid rgba(255,255,255,.08); border-radius:50%; width:110px; height:110px; display:flex; flex-direction:column; align-items:center; justify-content:center; }

        .faq-item { border-bottom:1px solid rgba(0,0,0,.1); }
        .faq-btn  { width:100%; text-align:left; background:none; border:none; cursor:pointer; padding:16px 0; display:flex; align-items:center; justify-content:space-between; gap:12px; font-family:'Montserrat',sans-serif; font-weight:700; font-size:.9rem; color:#111; }
        .faq-ans  { color:rgba(0,0,0,.65); font-size:.88rem; line-height:1.7; padding-bottom:16px; }

        .step-dot { width:40px; height:40px; border-radius:50%; background:#e42820; display:flex; align-items:center; justify-content:center; font-family:'Montserrat',sans-serif; font-weight:800; font-size:.95rem; flex-shrink:0; }

        @media(max-width:720px){ .hero-grid{ grid-template-columns:1fr !important; } .cta-sticky{ position:static !important; } .bonus-body{ grid-template-columns:1fr !important; } .founder-grid{ grid-template-columns:1fr !important; } }
        @media(max-width:500px){ .trust-badges{ gap:8px !important; } .trust-badge{ width:88px; height:88px; } }
      `}</style>

      <div className="lp">

        {/* ── URGENCY BAR ── */}
        <div className="top-bar">
          🔥 PRECIO DE LANZAMIENTO $17/MES · SUBE A $47 {PRICE_RISE_DATE.toUpperCase()} · SIN EXCEPCIONES
        </div>

        {/* ── HEADER ── */}
        <header style={{ background: '#0a0a0a', borderBottom: '1px solid rgba(255,255,255,.06)', padding: '14px 24px', textAlign: 'center' }}>
          <span style={{ fontFamily: 'var(--font-m),sans-serif', fontWeight: 900, fontSize: '1.3rem', letterSpacing: '.08em' }}>🌶️ CONDIMENTO</span>
        </header>

        {/* ── HERO ── */}
        <section style={{ background: 'linear-gradient(180deg,#111 0%,#0c0c0c 100%)', padding: '52px 24px 0' }}>

          {/* Social proof strip */}
          <div style={{ maxWidth: 760, margin: '0 auto 28px', textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 50, padding: '8px 20px 8px 8px' }}>
              {/* Avatar circles */}
              <div style={{ display: 'flex', alignItems: 'center' }}>
                {[['C','#ff7b00'],['M','#e42820'],['A','#e42820'],['L','#e42820'],['R','#e11d48']].map(([letter, bg], i) => (
                  <div key={i} style={{ width: 32, height: 32, borderRadius: '50%', background: bg as string, border: '2px solid #111', marginLeft: i > 0 ? -8 : 0, zIndex: 5 - i, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-m),sans-serif', fontWeight: 800, fontSize: '.65rem', color: '#fff' }}>{letter}</div>
                ))}
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ display: 'flex', gap: 2, color: '#fbbf24', fontSize: '.85rem', lineHeight: 1 }}>★★★★★</div>
                <p style={{ color: 'rgba(255,255,255,.55)', fontSize: '.72rem', margin: '2px 0 0', lineHeight: 1 }}>+150 tiendas confían en Condimento</p>
              </div>
            </div>
          </div>

          <div className="hero-grid" style={{ maxWidth: 1020, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 380px', gap: 40, alignItems: 'start' }}>

            {/* LEFT */}
            <div>
              <p style={{ fontFamily: 'var(--font-m),sans-serif', fontWeight: 700, fontSize: '.7rem', letterSpacing: '.15em', textTransform: 'uppercase', color: '#e42820', marginBottom: 14 }}>
                Para e-commerce y dropshipping en LATAM
              </p>
              <h1 style={{ fontSize: 'clamp(1.8rem,4vw,2.9rem)', fontWeight: 900, lineHeight: 1.1, marginBottom: 18 }}>
                La diferencia entre las marcas que escalan y las que no{' '}
                <span className="grad">no es el producto. Es el sistema.</span>
              </h1>
              <p style={{ fontSize: '1.05rem', color: 'rgba(255,255,255,.65)', lineHeight: 1.8, marginBottom: 10 }}>
                BrandPilot es el primer sistema en LATAM que pone{' '}
                <strong style={{ color: '#fff' }}>7 años de experiencia auditando 100+ marcas</strong>{' '}
                dentro de una IA que toma las decisiones de marketing por vos —
                qué testear, qué escalar, qué comunicar y cómo.
              </p>
              <p style={{ fontSize: '.9rem', color: 'rgba(255,255,255,.3)', fontStyle: 'italic', marginBottom: 28 }}>
                Sin diseñador. Sin agencia. Sin saber nada de marketing. La IA ya sabe.
              </p>

              {/* Video */}
              <VideoBlock />

              <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  { bad: '3 semanas esperando artes', good: 'Listo en 3 minutos' },
                  { bad: '$800/mes de diseñador', good: '$17/mes todo incluido' },
                  { bad: '5 herramientas sin conexión', good: '1 sistema conectado' },
                  { bad: 'Copiás anuncios y rezás', good: 'Testear antes de pautar' },
                ].map((r, i) => (
                  <div key={i} style={{ background: 'rgba(255,255,255,.04)', borderRadius: 10, padding: '10px 12px', fontSize: '.78rem', lineHeight: 1.5 }}>
                    <p style={{ color: 'rgba(255,100,100,.6)', margin: '0 0 4px 0' }}>✗ {r.bad}</p>
                    <p style={{ color: '#e42820', fontWeight: 600, margin: 0 }}>✓ {r.good}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* RIGHT — sticky CTA card */}
            <div className="cta-sticky" style={{ position: 'sticky', top: 20 }}>
              <div style={{ background: 'linear-gradient(160deg,#111,#0d0d0d)', border: '2px solid rgba(228,40,32,.4)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,.5)' }}>

                {/* ── Product stack mockup ── */}
                <div style={{ background: 'linear-gradient(135deg,#1a1a1a,#111)', padding: '22px 20px 10px', position: 'relative', minHeight: 148 }}>
                  {/* Back laptop */}
                  <div style={{ position: 'absolute', bottom: 8, left: '4%', width: 155, transform: 'rotate(-6deg)', background: '#141414', borderRadius: '7px 7px 0 0', padding: '6px 6px 0', boxShadow: '0 6px 24px rgba(0,0,0,.5)', zIndex: 1 }}>
                    <div style={{ background: 'linear-gradient(135deg,rgba(228,40,32,.12),rgba(228,40,32,.08))', borderRadius: 3, aspectRatio: '16/10', border: '1px solid rgba(228,40,32,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <p style={{ color: 'rgba(228,40,32,.35)', fontSize: '.5rem', fontFamily: 'var(--font-m),sans-serif', fontWeight: 700, margin: 0 }}>BRAND KIT</p>
                    </div>
                    <div style={{ background: '#181818', height: 4, borderRadius: '0 0 4px 4px' }} />
                    <div style={{ background: '#141414', height: 2, borderRadius: '0 0 6px 6px', width: '120%', marginLeft: '-10%' }} />
                  </div>
                  {/* Front laptop */}
                  <div style={{ position: 'absolute', bottom: 8, right: '4%', width: 148, transform: 'rotate(4deg)', background: '#141414', borderRadius: '7px 7px 0 0', padding: '6px 6px 0', boxShadow: '0 8px 28px rgba(0,0,0,.6)', zIndex: 2 }}>
                    <div style={{ background: 'linear-gradient(135deg,rgba(255,123,0,.12),rgba(228,40,32,.1))', borderRadius: 3, aspectRatio: '16/10', border: '1px solid rgba(255,123,0,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <p style={{ color: 'rgba(255,123,0,.4)', fontSize: '.5rem', fontFamily: 'var(--font-m),sans-serif', fontWeight: 700, margin: 0 }}>PEC ✦</p>
                    </div>
                    <div style={{ background: '#181818', height: 4, borderRadius: '0 0 4px 4px' }} />
                    <div style={{ background: '#141414', height: 2, borderRadius: '0 0 6px 6px', width: '120%', marginLeft: '-10%' }} />
                  </div>
                  {/* Center phone */}
                  <div style={{ position: 'relative', zIndex: 3, margin: '0 auto', width: 54, background: '#141414', borderRadius: 10, padding: '5px 4px', border: '2px solid #222', boxShadow: '0 8px 32px rgba(0,0,0,.7)' }}>
                    <div style={{ background: 'linear-gradient(160deg,rgba(228,40,32,.2),rgba(228,40,32,.15))', borderRadius: 6, aspectRatio: '9/16', border: '1px solid rgba(228,40,32,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '.9rem' }}>🌶️</span>
                    </div>
                    <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#181818', margin: '4px auto 0' }} />
                  </div>
                </div>

                {/* ── Price & CTA ── */}
                <div style={{ padding: '18px 22px 22px' }}>
                  <div style={{ textAlign: 'center', marginBottom: 4 }}>
                    <span style={{ textDecoration: 'line-through', color: 'rgba(255,255,255,.22)', fontSize: '.9rem' }}>($47)</span>
                    {' '}
                    <span style={{ fontFamily: 'var(--font-m),sans-serif', fontWeight: 900, fontSize: '1.7rem', color: '#ff7b00' }}>${CURRENT_PRICE} USD Hoy</span>
                  </div>
                  <p style={{ textAlign: 'center', color: '#4ade80', fontFamily: 'var(--font-m),sans-serif', fontWeight: 700, fontSize: '.72rem', marginBottom: 14 }}>
                    Asegurá tu acceso antes de que suba el {PRICE_RISE_DATE}
                  </p>

                  <div style={{ marginBottom: 14 }}>
                    <p style={{ color: 'rgba(255,255,255,.3)', fontSize: '.66rem', marginBottom: 7, textAlign: 'center' }}>⏳ El precio sube en:</p>
                    <Countdown />
                  </div>

                  <CtaCard />

                  {/* Payment logos row */}
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                    {['VISA','MC','AMEX','PAYPAL'].map(p => (
                      <div key={p} style={{ background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 4, padding: '3px 8px', fontSize: '.58rem', fontFamily: 'var(--font-m),sans-serif', fontWeight: 800, color: 'rgba(255,255,255,.4)', letterSpacing: '.04em' }}>{p}</div>
                    ))}
                  </div>

                  {/* Disponibilidad */}
                  <p style={{ textAlign: 'center', fontSize: '.72rem', marginTop: 8, color: 'rgba(255,255,255,.3)' }}>
                    Disponibilidad: <span style={{ color: '#4ade80', fontFamily: 'var(--font-m),sans-serif', fontWeight: 700 }}>Inmediata</span>
                  </p>

                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.07)' }}>
                    {[...CORE.map(i => i.label), '3 Bonuses exclusivos', 'Garantía 30 días'].map((item, i) => (
                      <p key={i} style={{ color: 'rgba(255,255,255,.5)', fontSize: '.73rem', margin: '0 0 5px 0' }}>
                        <span style={{ color: '#e42820' }}>✦</span> {item}
                      </p>
                    ))}
                  </div>
                </div>

              </div>
            </div>

          </div>

          <Chevrons />
        </section>

        {/* ── SOCIAL PROOF NUMBERS ── */}
        <section className="section-light" style={{ padding: '36px 24px' }}>
          <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--font-m),sans-serif', fontWeight: 800, fontSize: '.72rem', letterSpacing: '.15em', textTransform: 'uppercase', color: '#e42820', marginBottom: 24 }}>
              Los referentes más grandes de la industria en LATAM se capacitan con nosotros para vender con su marca
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
              {[
                { n: 'ROAS 2→39', s: 'en un mes con el sistema' },
                { n: '$200K', s: 'facturados en una semana' },
                { n: '+150', s: 'tiendas ya dentro del sistema' },
              ].map(({ n, s }) => (
                <div key={s} style={{ borderRight: '1px solid rgba(0,0,0,.1)' }}>
                  <div style={{ fontFamily: 'var(--font-m),sans-serif', fontWeight: 900, fontSize: '2.1rem', color: '#e42820' }}>{n}</div>
                  <div style={{ fontSize: '.78rem', color: 'rgba(0,0,0,.5)', marginTop: 4, lineHeight: 1.4 }}>{s}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── QUÉ HAY DENTRO ── */}
        <section className="section-light" style={{ padding: '56px 24px' }}>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <h2 style={{ fontFamily: 'var(--font-m),sans-serif', fontWeight: 900, fontSize: 'clamp(1.6rem,4vw,2.4rem)', textAlign: 'center', color: '#111', marginBottom: 8 }}>
              ¿QUÉ HAY DENTRO DE <span style={{ color: '#e42820' }}>BRANDPILOT</span>?
            </h2>
            <p style={{ textAlign: 'center', color: 'rgba(0,0,0,.5)', marginBottom: 8, maxWidth: 560, margin: '0 auto 8px' }}>
              No es un curso. No es un software. No es una comunidad.
            </p>
            <p style={{ textAlign: 'center', fontFamily: 'var(--font-m),sans-serif', fontWeight: 800, color: '#e42820', marginBottom: 40, fontSize: '1rem' }}>
              Es la combinación de los tres — con una IA que ejecuta las decisiones por vos.
            </p>

            <div style={{ display: 'grid', gap: 16 }}>
              {[
                { icon: '📐', title: 'Capa 1 — Spicy Ad Formula', items: ['Sistema publicitario basado en psicología de compra', 'Estructura de campañas que funciona con cualquier presupuesto', 'Independiente del algoritmo — funciona hoy y mañana'] },
                { icon: '👥', title: 'Capa 2 — Comunidad Spicy Ads Ecommerce', items: ['Q&A semanales con Cris en vivo', 'Casos reales de marcas que escalaron con el sistema', 'Feedback constante de tu marca y tus campañas'] },
                { icon: '🤖', title: 'Capa 3 — Condimento AI', items: ['Testing de ángulos antes de gastar un peso en pauta', 'Sistema PEC: 3 piezas por ángulo ganador (P/E/C)', 'Anuncios · Carruseles IG · Fichas de producto — todo conectado'] },
              ].map((item) => (
                <div key={item.title} style={{ display: 'flex', gap: 16, background: '#f8f8f8', border: '1px solid rgba(228,40,32,.15)', borderRadius: 14, padding: '20px 22px' }}>
                  <span style={{ fontSize: '1.5rem', flexShrink: 0, marginTop: 2 }}>{item.icon}</span>
                  <div>
                    <p style={{ fontFamily: 'var(--font-m),sans-serif', fontWeight: 800, fontSize: '1rem', color: '#111', marginBottom: 10 }}>{item.title}</p>
                    {item.items.map((li, j) => (
                      <p key={j} style={{ color: 'rgba(0,0,0,.65)', fontSize: '.85rem', margin: '0 0 5px 0', display: 'flex', gap: 8 }}>
                        <span style={{ color: '#e42820', flexShrink: 0 }}>✦</span>{li}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA STRIP ── */}
        <section style={{ background: 'linear-gradient(90deg,#1a1a1a,#0d0d0d)', padding: '32px 24px', textAlign: 'center' }}>
          <div style={{ maxWidth: 560, margin: '0 auto' }}>
            <CtaCard label={`SI QUIERO ACCESO INMEDIATO A CONDIMENTO POR $${CURRENT_PRICE}/MES →`} />
            <p style={{ color: 'rgba(255,255,255,.3)', fontSize: '.72rem', marginTop: 8 }}>
              Condimento funciona para cualquier tipo de e-commerce y dropshipping · Disponibilidad <span style={{ color: '#e42820', fontWeight: 600 }}>inmediata</span>
            </p>
          </div>
        </section>

        {/* ── CRIS'S STORY ── */}
        <section className="section-mid" style={{ padding: '64px 24px' }}>
          <div style={{ maxWidth: 800, margin: '0 auto' }}>
            <p style={{ fontFamily: 'var(--font-m),sans-serif', fontWeight: 700, fontSize: '.7rem', letterSpacing: '.15em', textTransform: 'uppercase', color: 'rgba(255,255,255,.3)', marginBottom: 24, textAlign: 'center' }}>
              Quién está detrás de esto
            </p>

            {/* 2-column: photo + text */}
            <div className="founder-grid" style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 40, alignItems: 'start' }}>

              {/* Photo column */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                {/* Photo placeholder — replace with: <img src="/cris.jpg" alt="Cris Natel" style={{width:'100%',borderRadius:16,objectFit:'cover'}} /> */}
                <div style={{ width: '100%', aspectRatio: '4/5', background: 'linear-gradient(160deg,#222,#111)', borderRadius: 16, border: '2px solid rgba(228,40,32,.25)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, overflow: 'hidden' }}>
                  <span style={{ fontSize: '3rem', opacity: .2 }}>👤</span>
                  <p style={{ color: 'rgba(255,255,255,.2)', fontSize: '.65rem', fontFamily: 'var(--font-m),sans-serif', fontWeight: 700, letterSpacing: '.08em', textAlign: 'center', margin: 0, lineHeight: 1.5 }}>
                    FOTO<br/>LINKEDIN<br/>AQUÍ
                  </p>
                </div>
                {/* Name card */}
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontFamily: 'var(--font-m),sans-serif', fontWeight: 900, fontSize: '1rem', color: '#fff', margin: '0 0 4px 0' }}>Cris Natel</p>
                  <p style={{ color: 'rgba(255,255,255,.35)', fontSize: '.72rem', margin: '0 0 8px 0' }}>Fundador · Condimento</p>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(10,102,194,.2)', border: '1px solid rgba(10,102,194,.4)', borderRadius: 50, padding: '5px 12px' }}>
                    <span style={{ color: '#0a66c2', fontSize: '.8rem' }}>in</span>
                    <span style={{ color: 'rgba(255,255,255,.5)', fontSize: '.65rem', fontFamily: 'var(--font-m),sans-serif', fontWeight: 700 }}>LinkedIn</span>
                  </div>
                </div>
              </div>

              {/* Text column */}
              <div>
                <h2 style={{ fontSize: 'clamp(1.3rem,3vw,1.8rem)', fontWeight: 900, marginBottom: 20, lineHeight: 1.25 }}>
                  Soy Cris Natel.{' '}
                  <span className="grad">Estos son los resultados de auditar 100+ marcas en LATAM.</span>
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <p style={{ color: 'rgba(255,255,255,.6)', fontSize: '.93rem', lineHeight: 1.85 }}>
                    Llevo 7 años en agencias de marketing gestionando campañas para más de 100 marcas de e-commerce — desde tiendas que invertían $10 diarios hasta marcas que movían $200.000 dólares mensuales en pauta. No soy un gurú de TikTok. Tenés mi LinkedIn para verificarlo.
                  </p>
                  <p style={{ color: 'rgba(255,255,255,.6)', fontSize: '.93rem', lineHeight: 1.85 }}>
                    Después de auditar todas esas marcas llegué a una conclusión que cambió todo:
                  </p>
                  <div className="card-red" style={{ padding: '18px 20px' }}>
                    <p style={{ fontFamily: 'var(--font-m),sans-serif', fontWeight: 900, fontSize: '1rem', marginBottom: 8 }}>
                      "El 90% de los e-commerces falla por lo mismo — y no es el producto."
                    </p>
                    <p style={{ color: 'rgba(255,255,255,.6)', lineHeight: 1.75, fontSize: '.9rem', margin: 0 }}>
                      Falla porque no tienen un sistema para saber qué mensaje usar, qué anuncio testear, qué escalar y cómo comunicar su marca. Improvizan cada semana.
                    </p>
                  </div>
                  <p style={{ color: 'rgba(255,255,255,.6)', fontSize: '.93rem', lineHeight: 1.85 }}>
                    Esa conclusión me llevó a construir BrandPilot: tomé cada decisión, cada framework, cada patrón que vi funcionar en esas 100+ marcas — y los entrené en una IA para que vos puedas ejecutar en minutos lo que a mí me llevó 7 años aprender.
                  </p>
                </div>
              </div>

            </div>
          </div>
        </section>

        <Chevrons />

        {/* ── THE 3-STEP SYSTEM ── */}
        <section style={{ background: '#0a0a0a', padding: '64px 24px' }}>
          <div style={{ maxWidth: 680, margin: '0 auto' }}>
            <p style={{ fontFamily: 'var(--font-m),sans-serif', fontWeight: 700, fontSize: '.7rem', letterSpacing: '.15em', textTransform: 'uppercase', color: 'rgba(255,255,255,.3)', marginBottom: 8, textAlign: 'center' }}>Dentro de Condimento AI</p>
            <h2 style={{ fontSize: 'clamp(1.4rem,4vw,2rem)', fontWeight: 900, textAlign: 'center', marginBottom: 12 }}>
              Así es como el sistema <span className="grad">toma las decisiones por vos</span>
            </h2>
            <p style={{ textAlign: 'center', color: 'rgba(255,255,255,.4)', fontSize: '.88rem', lineHeight: 1.7, maxWidth: 500, margin: '0 auto 44px' }}>
              No te dice qué hacer. Lo hace. Desde testear qué mensaje convierte hasta armar el funnel completo y conectarlo con tu tienda y tus redes.
            </p>
            {[
              { n: '1', title: 'Testing de Ángulos — sabé qué convierte antes de gastar', desc: 'Describís el producto y Condimento genera múltiples ángulos de mensaje con el hook para cada uno. Elegís el ganador sin gastar un peso en pauta. Recién después, escalás.', check: 'Fin de copiar anuncios y esperar que funcionen.' },
              { n: '2', title: 'Sistema PEC — escala el ángulo ganador en los 3 momentos', desc: <>Para cada ángulo ganador, Condimento genera automáticamente 3 piezas: una para <strong style={{ color: '#e42820' }}>Prospección</strong>, una para <strong style={{ color: '#e42820' }}>Evaluación</strong> y una para <strong style={{ color: '#ff7b00' }}>Conversión</strong>. El funnel completo, automatizado.</>, check: 'El mismo mensaje adaptado a cada etapa. No quemás el presupuesto.' },
              { n: '3', title: 'Todo conectado — anuncios, redes y tienda en la misma historia', desc: 'El Brand Kit se aplica en todos los módulos. El mensaje del testing informa los anuncios, los carruseles de Instagram (TOFU/MOFU/BOFU) y las 6 imágenes de tu ficha de producto.', check: 'Una marca. Una historia. Todo conectado.' },
            ].map((step) => (
              <div key={step.n} style={{ display: 'flex', gap: 18, marginBottom: 40 }}>
                <div className="step-dot">{step.n}</div>
                <div>
                  <p style={{ fontFamily: 'var(--font-m),sans-serif', fontWeight: 800, fontSize: '1.05rem', marginBottom: 8 }}>{step.title}</p>
                  <p style={{ color: 'rgba(255,255,255,.6)', fontSize: '.88rem', lineHeight: 1.7, marginBottom: 10 }}>{step.desc}</p>
                  <div className="card-red" style={{ padding: '10px 14px', display: 'inline-block' }}>
                    <p style={{ color: 'rgba(255,255,255,.75)', fontSize: '.8rem', margin: 0 }}>✓ {step.check}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── CTA STRIP 2 ── */}
        <section style={{ background: 'linear-gradient(90deg,#1a1a1a,#0d0d0d)', padding: '32px 24px', textAlign: 'center' }}>
          <div style={{ maxWidth: 560, margin: '0 auto' }}>
            <CtaCard label={`SI QUIERO ACCESO INMEDIATO A CONDIMENTO POR $${CURRENT_PRICE}/MES →`} />
            <p style={{ color: 'rgba(255,255,255,.25)', fontSize: '.7rem', marginTop: 6 }}>
              Condimento funciona para cualquier tipo de e-commerce · Disponibilidad <span style={{ color: '#e42820' }}>inmediata</span>
            </p>
          </div>
        </section>

        {/* ── OFFER STACK ── */}
        <section className="section-light" style={{ padding: '64px 24px' }}>
          <div style={{ maxWidth: 700, margin: '0 auto' }}>
            <h2 style={{ fontFamily: 'var(--font-m),sans-serif', fontWeight: 900, fontSize: 'clamp(1.4rem,4vw,2.1rem)', textAlign: 'center', color: '#111', marginBottom: 8 }}>
              ESTO ES LO QUE <span style={{ color: '#e42820' }}>ENCONTRARÁS</span> DENTRO DE CONDIMENTO
            </h2>
            <p style={{ textAlign: 'center', color: 'rgba(0,0,0,.4)', marginBottom: 40, fontSize: '.9rem' }}>
              Todo lo que recibís hoy por ${CURRENT_PRICE}/mes
            </p>
            <div style={{ display: 'grid', gap: 16, marginBottom: 40 }}>
              {CORE.map((item) => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, background: '#f8f8f8', border: '1px solid rgba(228,40,32,.15)', borderRadius: 12, padding: '16px 20px' }}>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <span style={{ color: '#e42820', flexShrink: 0, marginTop: 2 }}>✦</span>
                    <div>
                      <p style={{ fontFamily: 'var(--font-m),sans-serif', fontWeight: 700, fontSize: '.9rem', color: '#111', marginBottom: 3 }}>{item.label}</p>
                      <p style={{ color: 'rgba(0,0,0,.5)', fontSize: '.78rem', lineHeight: 1.5 }}>{item.desc}</p>
                    </div>
                  </div>
                  <span style={{ fontFamily: 'var(--font-m),sans-serif', fontWeight: 800, color: '#e42820', whiteSpace: 'nowrap', flexShrink: 0 }}>${item.value}</span>
                </div>
              ))}
            </div>

            {/* ── Bonuses header ── */}
            <h3 style={{ fontFamily: 'var(--font-m),sans-serif', fontWeight: 900, fontSize: 'clamp(1.4rem,4vw,2rem)', textAlign: 'center', color: '#111', marginBottom: 6, lineHeight: 1.2 }}>
              Desbloquea Acceso Inmediato a 3{' '}
              <span style={{ background: '#ff7b00', color: '#fff', padding: '0 6px', borderRadius: 4 }}>Bonuses Adicionales</span>{' '}
              Gratis!
            </h3>

            {/* ── Product stack image ── */}
            <div style={{ position: 'relative', background: 'linear-gradient(135deg,#1a1a1a,#0c0c0c)', borderRadius: 16, overflow: 'hidden', marginBottom: 24, minHeight: 320, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '28px 20px 0' }}>
              {/* Device stack placeholder */}
              <div style={{ position: 'relative', width: '100%', maxWidth: 560, margin: '0 auto' }}>
                {/* Background papers (right) */}
                <div style={{ position: 'absolute', right: -10, top: 10, width: 100, zIndex: 1 }}>
                  {[0,1,2].map(i => (
                    <div key={i} style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 4, padding: '6px 8px', marginBottom: 4, transform: `rotate(${i*3-3}deg)`, boxShadow: '0 2px 8px rgba(0,0,0,.15)' }}>
                      {[1,2,3].map(j => <div key={j} style={{ height: 3, background: '#ddd', borderRadius: 2, marginBottom: 3 }} />)}
                    </div>
                  ))}
                </div>
                {/* 100% guarantee badge (left) */}
                <div style={{ position: 'absolute', left: -8, top: 20, zIndex: 10, width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg,#b8860b,#ffd700,#b8860b)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(0,0,0,.4)', border: '3px solid #ffd700' }}>
                  <p style={{ fontFamily: 'var(--font-m),sans-serif', fontWeight: 900, fontSize: '.55rem', color: '#111', margin: 0, textAlign: 'center', letterSpacing: '.03em', lineHeight: 1.2 }}>SATISFACTION<br/>★★★★★<br/>100%<br/>GUARANTEE</p>
                </div>
                {/* Main monitor frame */}
                <div style={{ background: '#222', borderRadius: '10px 10px 0 0', padding: '10px 10px 0', boxShadow: '0 12px 40px rgba(0,0,0,.5)', position: 'relative', zIndex: 2 }}>
                  <div style={{ background: 'linear-gradient(135deg,rgba(228,40,32,.15),rgba(0,0,0,.8))', borderRadius: 6, aspectRatio: '16/9', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, border: '1px solid rgba(228,40,32,.2)' }}>
                    <span style={{ fontSize: '2.5rem', opacity: .3 }}>📸</span>
                    <p style={{ color: 'rgba(255,255,255,.25)', fontSize: '.65rem', fontFamily: 'var(--font-m),sans-serif', fontWeight: 700, margin: 0, letterSpacing: '.1em' }}>IMAGEN DEL PRODUCTO — REEMPLAZAR</p>
                  </div>
                </div>
                <div style={{ background: '#333', height: 8, borderRadius: '0 0 6px 6px' }} />
                <div style={{ background: '#222', height: 5, borderRadius: '0 0 8px 8px', width: '70%', margin: '0 auto' }} />
                {/* Overlay laptop (front-right) */}
                <div style={{ position: 'absolute', right: 8, bottom: 14, width: '45%', zIndex: 3, background: '#1a1a1a', borderRadius: '8px 8px 0 0', padding: '6px 6px 0', boxShadow: '0 8px 28px rgba(0,0,0,.6)' }}>
                  <div style={{ background: 'linear-gradient(135deg,rgba(228,40,32,.12),rgba(0,0,0,.7))', borderRadius: 4, aspectRatio: '16/10', border: '1px solid rgba(228,40,32,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '.8rem', opacity: .3 }}>📸</span>
                  </div>
                  <div style={{ background: '#222', height: 4, borderRadius: '0 0 4px 4px' }} />
                </div>
              </div>
              {/* Dark banner */}
              <div style={{ background: 'linear-gradient(90deg,#1a1a1a,#2a0a0a,#1a1a1a)', width: 'calc(100% + 40px)', marginLeft: -20, marginTop: 16, padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <div style={{ width: 28, height: 28, background: 'linear-gradient(135deg,#ffd700,#b8860b)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.9rem', flexShrink: 0 }}>✓</div>
                <p style={{ fontFamily: 'var(--font-m),sans-serif', fontWeight: 900, fontSize: '.8rem', color: '#fff', margin: 0, textAlign: 'center', letterSpacing: '.06em', lineHeight: 1.4 }}>
                  APLICADO POR{' '}
                  <span style={{ color: '#ffd700' }}>+150 TIENDAS DE ECOMMERCE</span>{' '}
                  EN LATAM
                </p>
              </div>
            </div>

            {/* ── Individual bonus cards ── */}
            <div style={{ display: 'grid', gap: 16 }}>
              {BONUSES.map((b) => (
                <div key={b.label} className="bonus-card">
                  {/* Header */}
                  <div className="bonus-header">
                    <p style={{ fontFamily: 'var(--font-m),sans-serif', fontWeight: 800, fontSize: '.85rem', color: '#fff', margin: 0 }}>
                      <span style={{ color: '#ffd700' }}>{b.n}:</span>{' '}{b.label}
                    </p>
                  </div>
                  {/* Body: text left, device mockup right */}
                  <div className="bonus-body" style={{ display: 'grid', gridTemplateColumns: '1fr 260px', alignItems: 'center' }}>
                    <div style={{ padding: '20px 24px' }}>
                      <p style={{ color: 'rgba(0,0,0,.6)', fontSize: '.88rem', lineHeight: 1.75, marginBottom: 16 }}>{b.desc}</p>
                      <p style={{ fontFamily: 'var(--font-m),sans-serif', fontWeight: 800, fontSize: '.88rem', color: '#111', margin: 0, lineHeight: 1.4 }}>
                        Recibís Esto Cuando Comprás Tu Acceso A Condimento Por ${CURRENT_PRICE}!
                      </p>
                    </div>
                    {/* Device mockup — replace src with real screenshot */}
                    <div style={{ background: '#f0f0f0', padding: '20px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
                      <div style={{ width: '100%', maxWidth: 220 }}>
                        <div style={{ background: '#1a1a1a', borderRadius: '10px 10px 0 0', padding: '8px 8px 0', boxShadow: '0 8px 24px rgba(0,0,0,.3)' }}>
                          <div style={{ background: 'linear-gradient(135deg,rgba(228,40,32,.08),rgba(0,0,0,.6))', borderRadius: 5, aspectRatio: '16/10', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, border: '1px solid rgba(228,40,32,.15)' }}>
                            <span style={{ fontSize: '1.4rem', opacity: .3 }}>📸</span>
                            <p style={{ color: 'rgba(255,255,255,.2)', fontSize: '.5rem', fontFamily: 'var(--font-m),sans-serif', fontWeight: 700, letterSpacing: '.08em', margin: 0 }}>TU SCREENSHOT AQUÍ</p>
                          </div>
                        </div>
                        <div style={{ background: '#333', height: 5, borderRadius: '0 0 5px 5px' }} />
                        <div style={{ background: '#1a1a1a', height: 4, borderRadius: '0 0 8px 8px', width: '125%', marginLeft: '-12.5%' }} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Value total */}
            <div style={{ background: '#111', borderRadius: 14, padding: '24px', marginTop: 32, color: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,.08)', marginBottom: 14 }}>
                <span style={{ color: 'rgba(255,255,255,.4)', fontSize: '.85rem' }}>Valor total</span>
                <span style={{ fontFamily: 'var(--font-m),sans-serif', fontWeight: 800, textDecoration: 'line-through', color: 'rgba(255,255,255,.2)', fontSize: '1.1rem' }}>${totalValue.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <p style={{ fontFamily: 'var(--font-m),sans-serif', fontWeight: 800, fontSize: '1rem', margin: '0 0 4px 0' }}>Tu inversión hoy</p>
                  <p style={{ color: 'rgba(255,123,0,.8)', fontSize: '.75rem', fontFamily: 'var(--font-m),sans-serif', fontWeight: 700, margin: 0 }}>⚠️ Sube a ${NEXT_PRICE} {PRICE_RISE_DATE}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="grad" style={{ fontFamily: 'var(--font-m),sans-serif', fontWeight: 900, fontSize: '2.8rem', lineHeight: 1 }}>${CURRENT_PRICE}</div>
                  <div style={{ color: 'rgba(255,255,255,.3)', fontSize: '.7rem' }}>USD / mes</div>
                </div>
              </div>
              <CtaCard label={`QUIERO ACCESO INMEDIATO POR $${CURRENT_PRICE}/MES →`} />
              <TrustRow />
            </div>
          </div>
        </section>

        {/* ── CASO DE ESTUDIO ── */}
        <section style={{ background: '#0c0c0c', padding: '64px 24px' }}>
          <div style={{ maxWidth: 680, margin: '0 auto' }}>
            <p style={{ textAlign: 'center', color: 'rgba(255,255,255,.35)', fontSize: '.72rem', fontFamily: 'var(--font-m),sans-serif', fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 12 }}>
              Caso de Estudio
            </p>
            <h2 style={{ fontSize: 'clamp(1.4rem,4vw,2rem)', fontWeight: 900, textAlign: 'center', marginBottom: 8 }}>
              Instalando BrandPilot en{' '}
              <span className="grad">3 marcas de e-commerce reales</span>
            </h2>
            <p style={{ color: 'rgba(255,255,255,.45)', textAlign: 'center', fontSize: '.88rem', lineHeight: 1.7, maxWidth: 500, margin: '0 auto 36px' }}>
              En un grupo de prueba, mostramos a 3 dueños de marcas de nichos diferentes cómo aplicar el sistema BrandPilot.
            </p>

            {/* Results bar */}
            <div style={{ background: 'linear-gradient(90deg,#14532d,#166534)', borderRadius: 12, padding: '16px 24px', textAlign: 'center', marginBottom: 28 }}>
              <p style={{ fontFamily: 'var(--font-m),sans-serif', fontWeight: 900, fontSize: '1.05rem', color: '#4ade80', margin: 0 }}>
                Estos Fueron Los Resultados:
              </p>
            </div>

            {/* Testimonial image placeholders */}
            <div style={{ display: 'grid', gap: 16, marginBottom: 28 }}>
              {[
                { label: 'Testimonio / Captura de resultado 1', hint: 'Ej: captura de chat, métrica de ROAS, screenshot de ventas' },
                { label: 'Testimonio / Captura de resultado 2', hint: 'Ej: mensaje de cliente, reseña, captura de Meta Ads' },
                { label: 'Testimonio / Captura de resultado 3', hint: 'Ej: facturación semanal, captura de Shopify, DM de Instagram' },
              ].map((item, i) => (
                <div key={i} style={{ background: '#181818', border: '2px dashed rgba(228,40,32,.3)', borderRadius: 12, padding: '24px', textAlign: 'center', minHeight: 120, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <p style={{ fontFamily: 'var(--font-m),sans-serif', fontWeight: 700, fontSize: '.8rem', color: 'rgba(255,255,255,.4)', margin: 0 }}>📸 {item.label}</p>
                  <p style={{ color: 'rgba(255,255,255,.2)', fontSize: '.72rem', margin: 0, fontStyle: 'italic' }}>{item.hint}</p>
                </div>
              ))}
            </div>

            {/* Result callout */}
            <div style={{ background: 'linear-gradient(90deg,#14532d,#166534)', borderRadius: 12, padding: '18px 24px', textAlign: 'center', marginBottom: 32 }}>
              <p style={{ fontFamily: 'var(--font-m),sans-serif', fontWeight: 900, fontSize: '1rem', color: '#fff', margin: 0 }}>
                Al aplicar el sistema paso a paso,{' '}
                <span style={{ color: '#4ade80' }}>multiplicaron sus ventas x2, x3 y x5</span>
              </p>
              <p style={{ color: 'rgba(255,255,255,.6)', fontSize: '.82rem', marginTop: 6 }}>
                El método funcionó en marcas de diferentes nichos y presupuestos.
              </p>
            </div>

            <div style={{ textAlign: 'center' }}>
              <CtaCard label={`QUIERO RESULTADOS COMO ESTOS POR $${CURRENT_PRICE}/MES →`} />
              <TrustRow />
            </div>
          </div>
        </section>

        {/* ── CASOS DE ÉXITO (foto + texto) ── */}
        <section className="section-light" style={{ padding: '64px 24px' }}>
          <div style={{ maxWidth: 700, margin: '0 auto' }}>
            <p style={{ fontFamily: 'var(--font-m),sans-serif', fontWeight: 700, fontSize: '.72rem', letterSpacing: '.15em', textTransform: 'uppercase', color: '#e42820', marginBottom: 8, textAlign: 'center' }}>
              Casos de éxito
            </p>
            <h2 style={{ fontFamily: 'var(--font-m),sans-serif', fontWeight: 900, fontSize: 'clamp(1.4rem,4vw,2rem)', textAlign: 'center', color: '#111', marginBottom: 40 }}>
              Marcas que ya tienen el sistema funcionando
            </h2>
            <div style={{ display: 'grid', gap: 20 }}>
              {[
                { tag: 'ROAS 2 → 39', tagColor: '#e42820', result: 'En un mes con el sistema completo', detail: 'Marca de ropa — LATAM' },
                { tag: '$200.000 USD', tagColor: '#16a34a', result: 'Facturado en una semana', detail: 'E-commerce de productos físicos' },
                { tag: 'x5 en ventas', tagColor: '#ff7b00', result: 'En 30 días aplicando el desafío', detail: 'Dropshipping de nicho' },
              ].map((caso, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, background: '#f8f8f8', border: '1px solid rgba(228,40,32,.15)', borderRadius: 14, overflow: 'hidden' }}>
                  {/* Image placeholder */}
                  <div style={{ background: 'linear-gradient(135deg,#111,#1a1a1a)', minHeight: 180, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 20 }}>
                    <p style={{ fontFamily: 'var(--font-m),sans-serif', fontWeight: 900, fontSize: '.65rem', letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,.3)', margin: 0 }}>📸 Imagen del caso</p>
                    <p style={{ color: 'rgba(255,255,255,.15)', fontSize: '.65rem', margin: 0, textAlign: 'center', fontStyle: 'italic' }}>Captura de resultado,<br />screenshot o foto</p>
                  </div>
                  {/* Content */}
                  <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
                    <span style={{ display: 'inline-block', background: caso.tagColor, color: '#fff', fontFamily: 'var(--font-m),sans-serif', fontWeight: 900, fontSize: '.78rem', padding: '4px 12px', borderRadius: 50, alignSelf: 'flex-start' }}>{caso.tag}</span>
                    <p style={{ fontFamily: 'var(--font-m),sans-serif', fontWeight: 800, fontSize: '.95rem', color: '#111' }}>{caso.result}</p>
                    <p style={{ color: 'rgba(0,0,0,.4)', fontSize: '.78rem' }}>{caso.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── GUARANTEE ── */}
        <section style={{ background: 'linear-gradient(90deg,#1a1a1a,#0d0d0d)', padding: '56px 24px' }}>
          <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', gap: 28, alignItems: 'flex-start' }}>
            <div className="guarantee-ring">
              <div style={{ fontFamily: 'var(--font-m),sans-serif', fontWeight: 900, fontSize: '1.3rem', color: '#ff7b00', lineHeight: 1 }}>30</div>
              <div style={{ fontSize: '.65rem', color: 'rgba(255,255,255,.5)', marginTop: 2 }}>DÍAS</div>
              <div style={{ fontSize: '.65rem', color: '#ff7b00', fontWeight: 700, marginTop: 2 }}>GARANTÍA</div>
            </div>
            <div>
              <h3 style={{ fontSize: '1.4rem', marginBottom: 10 }}>Garantía incondicional de 30 días</h3>
              <p style={{ color: 'rgba(255,255,255,.6)', fontSize: '.9rem', lineHeight: 1.75 }}>
                Si en los primeros 30 días sentís que Condimento no fue lo que esperabas — te devolvemos cada centavo.{' '}
                <strong style={{ color: '#fff' }}>Y te quedás con todo el contenido.</strong>{' '}
                Sin preguntas. Sin trampa. Yo asumo todo el riesgo.
              </p>
            </div>
          </div>
        </section>

        {/* ── PARA LOS QUE VAN AL FINAL ── */}
        <section className="section-light" style={{ padding: '60px 24px' }}>
          <div style={{ maxWidth: 640, margin: '0 auto' }}>
            <div style={{ background: '#e42820', borderRadius: '12px 12px 0 0', padding: '10px 20px', textAlign: 'center' }}>
              <p style={{ fontFamily: 'var(--font-m),sans-serif', fontWeight: 800, fontSize: '.75rem', letterSpacing: '.12em', textTransform: 'uppercase', color: '#fff', margin: 0 }}>
                Para los que van directo al final
              </p>
            </div>
            <div style={{ background: '#f8f8f8', border: '1px solid rgba(228,40,32,.15)', borderRadius: '0 0 12px 12px', padding: '28px 24px' }}>
              <p style={{ fontFamily: 'var(--font-m),sans-serif', fontWeight: 800, fontSize: '1.05rem', color: '#111', marginBottom: 4 }}>
                Esto es lo que obtenés hoy por ${CURRENT_PRICE}/mes
              </p>
              <p style={{ color: 'rgba(0,0,0,.4)', fontSize: '.8rem', marginBottom: 20 }}>
                Así que igual que vos, bajando directamente hasta el final.
              </p>
              <div style={{ display: 'grid', gap: 7, marginBottom: 22 }}>
                {[...CORE.map(i => `${i.label} → $${i.value}`), ...BONUSES.map(b => `🎁 ${b.label} → $${b.value}`), '✅ Garantía incondicional 30 días', '✅ Actualizaciones incluidas siempre'].map((item, i) => (
                  <p key={i} style={{ color: 'rgba(0,0,0,.65)', fontSize: '.82rem', margin: 0, display: 'flex', gap: 8 }}>
                    <span style={{ color: '#e42820', flexShrink: 0 }}>✓</span>{item}
                  </p>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, borderTop: '1px solid rgba(0,0,0,.08)', marginBottom: 20 }}>
                <div>
                  <p style={{ color: 'rgba(0,0,0,.4)', fontSize: '.78rem', margin: '0 0 2px 0', textDecoration: 'line-through' }}>Valor total: ${totalValue.toLocaleString()}</p>
                  <p style={{ fontFamily: 'var(--font-m),sans-serif', fontWeight: 800, fontSize: '.95rem', color: '#111', margin: 0 }}>Tu precio hoy:</p>
                  <p style={{ color: '#ff7b00', fontFamily: 'var(--font-m),sans-serif', fontWeight: 700, fontSize: '.75rem', margin: 0 }}>⚠️ El precio sube a ${NEXT_PRICE} {PRICE_RISE_DATE}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-m),sans-serif', fontWeight: 900, fontSize: '2.8rem', color: '#e42820', lineHeight: 1 }}>${CURRENT_PRICE}</div>
                  <div style={{ color: 'rgba(0,0,0,.4)', fontSize: '.7rem' }}>/mes</div>
                </div>
              </div>
              <CtaCard label={`QUIERO ACCESO INMEDIATO POR $${CURRENT_PRICE}/MES →`} />
              <p style={{ textAlign: 'center', color: 'rgba(0,0,0,.35)', fontSize: '.7rem', marginTop: 8 }}>
                🔒 Pago seguro · Acceso inmediato · Garantía 30 días
              </p>
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="section-light" style={{ padding: '0 24px 64px' }}>
          <div style={{ maxWidth: 640, margin: '0 auto' }}>
            <h2 style={{ fontFamily: 'var(--font-m),sans-serif', fontWeight: 900, fontSize: 'clamp(1.3rem,4vw,1.9rem)', textAlign: 'center', color: '#111', marginBottom: 32 }}>
              Preguntas Frecuentes
            </h2>
            {FAQS.map((faq, i) => (
              <div key={i} className="faq-item">
                <button className="faq-btn" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                  <span style={{ color: openFaq === i ? '#e42820' : '#111' }}>{faq.q}</span>
                  <span style={{ color: '#e42820', fontSize: '1.2rem', flexShrink: 0 }}>{openFaq === i ? '−' : '+'}</span>
                </button>
                {openFaq === i && <p className="faq-ans">{faq.a}</p>}
              </div>
            ))}
          </div>
        </section>

        {/* ── BOTTOM CTA STRIP ── */}
        <section style={{ background: 'linear-gradient(135deg,#1a1a1a,#0c0c0c)', borderTop: '1px solid rgba(228,40,32,.2)', padding: '52px 24px', textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-m),sans-serif', fontWeight: 700, fontSize: '.7rem', letterSpacing: '.15em', textTransform: 'uppercase', color: '#e42820', marginBottom: 12 }}>
            OBTÉN ACCESO INMEDIATO YA
          </p>
          <h2 style={{ fontSize: 'clamp(1.4rem,4vw,2rem)', fontWeight: 900, marginBottom: 8 }}>
            Obtén Acceso A Condimento + 3 Bonuses{' '}
            <span className="grad">Por Solo ${CURRENT_PRICE} Hoy</span>
          </h2>
          <p style={{ color: 'rgba(255,255,255,.4)', marginBottom: 28, fontSize: '.88rem' }}>
            Dejá de hacer e-commerce como hace 10 años. Empezá con el sistema.
          </p>
          <div style={{ maxWidth: 480, margin: '0 auto 20px' }}>
            <CtaCard label={`QUIERO ACCESO INMEDIATO A CONDIMENTO POR $${CURRENT_PRICE} →`} />
          </div>

          {/* Trust badges */}
          <div className="trust-badges" style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 28, flexWrap: 'wrap' }}>
            {[
              { top: '+150', mid: 'TIENDAS', bot: 'ACTIVAS' },
              { top: '30', mid: 'DÍAS', bot: 'GARANTÍA' },
              { top: '100%', mid: 'ACCESO', bot: 'INMEDIATO' },
            ].map(({ top, mid, bot }) => (
              <div key={mid} className="trust-badge">
                <div style={{ fontFamily: 'var(--font-m),sans-serif', fontWeight: 900, fontSize: '1.2rem', color: '#e42820' }}>{top}</div>
                <div style={{ fontFamily: 'var(--font-m),sans-serif', fontWeight: 800, fontSize: '.6rem', color: 'rgba(255,255,255,.5)', lineHeight: 1.4 }}>{mid}<br />{bot}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── FOOTER ── */}
        <footer style={{ background: '#080610', borderTop: '1px solid rgba(255,255,255,.04)', padding: '24px 24px', textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-m),sans-serif', fontWeight: 900, fontSize: '1.1rem', marginBottom: 8, letterSpacing: '.06em' }}>🌶️ CONDIMENTO</p>
          <p style={{ color: 'rgba(255,255,255,.2)', fontSize: '.7rem', maxWidth: 500, margin: '0 auto', lineHeight: 1.65 }}>
            Los resultados mencionados son ejemplos reales pero no garantía de ingresos. Los resultados individuales varían. Condimento es una herramienta de automatización — el éxito depende de tu ejecución.
          </p>
          <p style={{ color: 'rgba(255,255,255,.1)', fontSize: '.65rem', marginTop: 10 }}>
            © {new Date().getFullYear()} Condimento · Todos los derechos reservados
          </p>
        </footer>

      </div>
    </>
  );
}
