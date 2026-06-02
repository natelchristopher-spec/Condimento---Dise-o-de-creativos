'use client';

import { useState } from 'react';

const CHECKOUT_URL = '#checkout'; // TODO: replace with actual Hotmart/Gumroad URL

const FAQS = [
  {
    q: '¿Necesito experiencia en e-commerce para usar Condimento?',
    a: 'No. Condimento fue diseñado para que cualquier dueño de tienda o agencia pueda automatizar su sistema de ventas sin conocimiento técnico previo. La IA te guía en cada paso.',
  },
  {
    q: '¿Qué plataformas de venta soporta?',
    a: 'Funciona con cualquier plataforma: Shopify, WooCommerce, MercadoLibre, TiendaNube, y cualquier canal publicitario como Meta Ads o TikTok. El sistema es independiente de la plataforma.',
  },
  {
    q: '¿Cuánto me sale la API de OpenAI además de la suscripción?',
    a: 'Muy poco. Para un uso normal ronda entre $2 y $8 USD por mes. Seguís estando muy por debajo de lo que pagarías a un consultor o agencia para hacer lo mismo.',
  },
  {
    q: '¿Funciona para cualquier tipo de producto o nicho?',
    a: 'Sí. Condimento funciona para cualquier producto físico. Podés configurar múltiples marcas y trabajar con diferentes clientes si sos agencia.',
  },
  {
    q: '¿Es una herramienta, un curso o una comunidad?',
    a: 'Es un sistema: una herramienta de IA que ejecuta las decisiones de tu e-commerce (qué publicar, cómo armar tu campaña, cómo presentar tu producto) sin necesitar años de experiencia para hacerlo bien.',
  },
  {
    q: '¿Qué pasa si no quedo satisfecho?',
    a: 'Tenés 7 días para probarlo. Si no quedás conforme por cualquier razón, te devolvemos el 100% del dinero sin preguntas ni demoras.',
  },
];

export default function AccesoPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800;900&family=Inter:wght@400;500;600&display=swap');

        .lp-root {
          background: #101010;
          font-family: 'Inter', sans-serif;
          color: #fff;
        }
        .lp-root h1, .lp-root h2, .lp-root h3 {
          font-family: 'Montserrat', sans-serif;
        }

        .gradient-text {
          background: linear-gradient(135deg, #c026d3 0%, #9f0ac9 50%, #7c3aed 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .orange-text { color: #ff7b00; }
        .highlight-box {
          background: linear-gradient(135deg, rgba(159,10,201,0.12) 0%, rgba(124,58,237,0.08) 100%);
          border: 1px solid rgba(159,10,201,0.3);
          border-radius: 16px;
        }
        .cta-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          background: linear-gradient(135deg, #ff7b00 0%, #ff9500 100%);
          color: #fff;
          font-family: 'Montserrat', sans-serif;
          font-weight: 800;
          font-size: 1.1rem;
          letter-spacing: 0.04em;
          padding: 18px 36px;
          border-radius: 50px;
          border: none;
          cursor: pointer;
          position: relative;
          overflow: hidden;
          transition: transform 0.2s, box-shadow 0.2s;
          box-shadow: 0 4px 30px rgba(255,123,0,0.4);
          text-decoration: none;
        }
        .cta-btn::before {
          content: '';
          position: absolute;
          top: 0; left: -100%;
          width: 60%; height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent);
          animation: shimmer 2.5s infinite;
        }
        .cta-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 40px rgba(255,123,0,0.55); }
        @keyframes shimmer { 0%{left:-100%} 100%{left:200%} }

        .module-card {
          background: #1a1a1a;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px;
          padding: 28px 24px;
          transition: border-color 0.2s, transform 0.2s;
        }
        .module-card:hover { border-color: rgba(159,10,201,0.5); transform: translateY(-3px); }

        .bonus-card {
          background: #1a1a1a;
          border: 1px solid rgba(255,123,0,0.2);
          border-radius: 16px;
          padding: 24px;
        }
        .bonus-num {
          font-family: 'Montserrat', sans-serif;
          font-weight: 900;
          font-size: 2.5rem;
          color: #ff7b00;
          line-height: 1;
        }

        .step-num {
          width: 48px; height: 48px;
          border-radius: 50%;
          background: linear-gradient(135deg, #9f0ac9, #7c3aed);
          display: flex; align-items: center; justify-content: center;
          font-family: 'Montserrat', sans-serif;
          font-weight: 800; font-size: 1.2rem;
          flex-shrink: 0;
        }

        .divider {
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(159,10,201,0.4), transparent);
          margin: 60px 0;
        }

        .faq-item {
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .faq-btn {
          width: 100%; text-align: left; background: none; border: none; cursor: pointer;
          padding: 20px 0;
          display: flex; align-items: center; justify-content: space-between; gap: 16px;
          color: #fff;
          font-family: 'Montserrat', sans-serif;
          font-weight: 700;
          font-size: 1rem;
        }
        .faq-answer {
          color: rgba(255,255,255,0.65);
          font-size: 0.95rem;
          line-height: 1.7;
          padding-bottom: 20px;
        }

        .guarantee-badge {
          width: 90px; height: 90px;
          border-radius: 50%;
          border: 3px solid #ff7b00;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          font-size: 2.2rem;
        }

        .top-bar {
          background: linear-gradient(90deg, #9f0ac9, #7c3aed, #9f0ac9);
          background-size: 200%;
          animation: gradientMove 4s linear infinite;
          text-align: center;
          padding: 10px 16px;
          font-family: 'Montserrat', sans-serif;
          font-weight: 700;
          font-size: 0.8rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        @keyframes gradientMove { 0%{background-position:0%} 100%{background-position:200%} }

        .price-box {
          background: linear-gradient(135deg, #1a1a1a 0%, #1e1420 100%);
          border: 2px solid rgba(159,10,201,0.4);
          border-radius: 24px;
          padding: 40px;
          text-align: center;
          max-width: 480px;
          margin: 0 auto;
        }
        .price-original {
          text-decoration: line-through;
          color: rgba(255,255,255,0.3);
          font-size: 1.2rem;
        }
        .price-current {
          font-family: 'Montserrat', sans-serif;
          font-weight: 900;
          font-size: 4rem;
          line-height: 1;
        }

        .proof-stat {
          text-align: center;
          padding: 20px;
        }
        .proof-num {
          font-family: 'Montserrat', sans-serif;
          font-weight: 900;
          font-size: 2.4rem;
          color: #c026d3;
        }

        @media (max-width: 640px) {
          .cta-btn { font-size: 0.95rem; padding: 16px 24px; }
          .price-current { font-size: 3rem; }
        }
      `}</style>

      <div className="lp-root">
        {/* ── TOP ANNOUNCEMENT BAR ── */}
        <div className="top-bar">
          ⚡ Oferta por tiempo limitado · Acceso mensual a Condimento AI
        </div>

        {/* ── HEADER ── */}
        <header style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '18px 24px', textAlign: 'center' }}>
          <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: '1.5rem', letterSpacing: '0.06em' }}>
            🌶️ CONDIMENTO
          </span>
        </header>

        {/* ── HERO ── */}
        <section style={{ maxWidth: 760, margin: '0 auto', padding: '64px 24px 48px', textAlign: 'center' }}>
          <p style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '0.8rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#c026d3', marginBottom: 20 }}>
            El nuevo sistema de e-commerce con IA
          </p>
          <h1 style={{ fontSize: 'clamp(2rem, 6vw, 3.5rem)', fontWeight: 900, lineHeight: 1.1, marginBottom: 24 }}>
            Hay un{' '}
            <span className="gradient-text">nuevo sistema para vender</span>{' '}
            en e-commerce. Y es extremadamente simple.
          </h1>
          <p style={{ fontSize: '1.15rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.7, maxWidth: 580, margin: '0 auto 36px' }}>
            Condimento es la herramienta de IA que reemplaza todo lo que antes necesitabas para operar tu e-commerce:
            un diseñador, una agencia, meses de prueba y error. Configurás tu marca una vez y la IA hace el resto.
          </p>

          {/* Video placeholder */}
          <div style={{ background: '#1a1a1a', border: '1px solid rgba(159,10,201,0.3)', borderRadius: 20, aspectRatio: '16/9', maxWidth: 640, margin: '0 auto 40px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(159,10,201,0.2)', border: '2px solid #9f0ac9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem' }}>
              ▶
            </div>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>Demo en video</p>
          </div>

          <a href={CHECKOUT_URL} className="cta-btn" style={{ fontSize: '1.15rem', padding: '20px 44px' }}>
            QUIERO ACCESO AHORA →
          </a>
          <p style={{ marginTop: 12, color: 'rgba(255,255,255,0.35)', fontSize: '0.8rem' }}>
            🔒 Pago seguro · Garantía de 7 días · Cancelá cuando quieras
          </p>
        </section>

        {/* ── SOCIAL PROOF STATS ── */}
        <section style={{ background: '#151515', borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '32px 24px' }}>
          <div style={{ maxWidth: 760, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <div className="proof-stat">
              <div className="proof-num">3</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', marginTop: 4 }}>Módulos de automatización</div>
            </div>
            <div className="proof-stat">
              <div className="proof-num">∞</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', marginTop: 4 }}>Ejecuciones ilimitadas</div>
            </div>
            <div className="proof-stat">
              <div className="proof-num">&lt; 3 min</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', marginTop: 4 }}>Por campaña o contenido</div>
            </div>
          </div>
        </section>

        {/* ── PROBLEM ── */}
        <section style={{ maxWidth: 720, margin: '0 auto', padding: '64px 24px' }}>
          <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.2rem)', fontWeight: 900, textAlign: 'center', marginBottom: 32 }}>
            Si todavía vendés como se vendía hace 10 años,{' '}
            <span className="orange-text">el problema no es tu producto</span>
          </h2>
          <div style={{ display: 'grid', gap: 16 }}>
            {[
              { icon: '📋', text: 'Copiás anuncios de la competencia esperando que funcionen. No construís marca, no construís confianza.' },
              { icon: '⏳', text: 'Tardás semanas en tener un anuncio listo. Tu competidor ya testeó 10 variaciones mientras esperabas.' },
              { icon: '🔀', text: 'Tu publicidad, tu tienda y tu contenido no están conectados. Cada pieza vive en su propia burbuja.' },
              { icon: '💸', text: 'Pagás agencias, diseñadores o acumulás cursos. Seguís sin un sistema que ejecute por vos.' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'flex-start', background: '#1a1a1a', borderRadius: 12, padding: '16px 20px' }}>
                <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>{item.icon}</span>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.95rem', lineHeight: 1.6, margin: 0 }}>{item.text}</p>
              </div>
            ))}
          </div>
          <p style={{ textAlign: 'center', marginTop: 32, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>
            No es tu producto lo que no funciona. Es todo lo que rodea tu producto.
          </p>
        </section>

        <div className="divider" />

        {/* ── SOLUTION ── */}
        <section style={{ maxWidth: 720, margin: '0 auto', padding: '0 24px 64px', textAlign: 'center' }}>
          <p style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '0.8rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#c026d3', marginBottom: 16 }}>
            La solución
          </p>
          <h2 style={{ fontSize: 'clamp(1.6rem, 4.5vw, 2.5rem)', fontWeight: 900, lineHeight: 1.15, marginBottom: 20 }}>
            Condimento: la IA que ejecuta{' '}
            <span className="gradient-text">todas las decisiones de tu e-commerce</span>
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '1.05rem', lineHeight: 1.7, maxWidth: 560, margin: '0 auto' }}>
            No es un template. No es un generador de frases sueltas. Es un sistema donde configurás tu marca
            una vez y la IA decide cómo comunicarla: qué decir en tus anuncios, qué publicar en redes, cómo
            armar tu ficha de producto para que la gente confíe y compre.
          </p>
        </section>

        {/* ── MODULES ── */}
        <section style={{ maxWidth: 760, margin: '0 auto', padding: '0 24px 80px' }}>
          <p style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 24, textAlign: 'center' }}>
            Lo que incluye tu acceso
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 }}>
            {[
              {
                emoji: '🎯',
                label: 'Sistema de Anuncios',
                tagline: 'Campañas que convierten en Meta y TikTok',
                desc: 'Describís tu producto y la IA define los ángulos, escribe el copy y estructura la campaña lista para pautar. Dejás de copiar anuncios ajenos y empezás a comunicar tu marca.',
                color: '#c026d3',
              },
              {
                emoji: '📱',
                label: 'Contenido de Redes',
                tagline: 'Carruseles de IG planificados por etapa del funnel',
                desc: 'La IA planifica qué contenido publicar según en qué etapa del funnel está tu audiencia, escribe el copy y organiza los slides. Autoridad de marca en piloto automático.',
                color: '#7c3aed',
              },
              {
                emoji: '🛍️',
                label: 'Ficha de Producto',
                tagline: 'PDPs que generan confianza y ventas',
                desc: 'La IA estructura tu página de producto con los elementos clave que generan confianza: beneficios, objeciones, prueba social y cierre. El estándar de e-commerce que convierte.',
                color: '#ff7b00',
              },
            ].map((mod) => (
              <div key={mod.label} className="module-card">
                <div style={{ fontSize: '2.2rem', marginBottom: 16 }}>{mod.emoji}</div>
                <p style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: '1.05rem', marginBottom: 6 }}>{mod.label}</p>
                <p style={{ color: mod.color, fontSize: '0.8rem', fontWeight: 600, marginBottom: 12 }}>{mod.tagline}</p>
                <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.875rem', lineHeight: 1.6 }}>{mod.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="divider" />

        {/* ── HOW IT WORKS ── */}
        <section style={{ maxWidth: 680, margin: '0 auto', padding: '0 24px 80px' }}>
          <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.2rem)', fontWeight: 900, textAlign: 'center', marginBottom: 48 }}>
            Cómo funciona en <span className="gradient-text">3 pasos</span>
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            {[
              { n: '1', title: 'Configurás tu marca', desc: 'Subís logo, colores, tono de comunicación y definís tu público objetivo. Lo hacés una vez y Condimento lo usa como base para todas las decisiones que toma la IA.' },
              { n: '2', title: 'Describís qué necesitás vender', desc: 'Contás el producto, el canal y el objetivo. No hace falta saber escribir copy ni conocer la plataforma — la IA interpreta el contexto y toma las decisiones correctas.' },
              { n: '3', title: 'La IA ejecuta el sistema', desc: 'En menos de 3 minutos tenés el sistema armado: copy, estructura de campaña, contenido de redes, ficha de producto. Copiás, adaptás y publicás.' },
            ].map((step) => (
              <div key={step.n} style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                <div className="step-num">{step.n}</div>
                <div>
                  <p style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: '1.1rem', marginBottom: 8 }}>{step.title}</p>
                  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.95rem', lineHeight: 1.65 }}>{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── BONUSES ── */}
        <section style={{ background: '#0e0e0e', borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '64px 24px' }}>
          <div style={{ maxWidth: 760, margin: '0 auto' }}>
            <p style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#ff7b00', marginBottom: 8, textAlign: 'center' }}>
              Incluido en tu suscripción
            </p>
            <h2 style={{ fontSize: 'clamp(1.4rem, 4vw, 2rem)', fontWeight: 900, textAlign: 'center', marginBottom: 40 }}>
              Todo lo que necesitás para arrancar hoy
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 }}>
              {[
                { n: '+50', title: 'Prompts de alto impacto', desc: 'Biblioteca de prompts probados con marcas reales para sacarle el máximo a cada módulo y acortar la curva de aprendizaje.' },
                { n: '∞', title: 'Ejecuciones ilimitadas', desc: 'Sin límites. Usá el sistema tantas veces como necesitás: múltiples productos, múltiples campañas, múltiples clientes.' },
                { n: '🔄', title: 'Actualizaciones incluidas', desc: 'Cada mejora que hagamos al sistema la recibís automáticamente. Tu suscripción siempre tiene la versión más reciente.' },
              ].map((b) => (
                <div key={b.title} className="bonus-card">
                  <div className="bonus-num">{b.n}</div>
                  <p style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: '1rem', marginTop: 12, marginBottom: 8 }}>{b.title}</p>
                  <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.875rem', lineHeight: 1.6 }}>{b.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FOR WHOM ── */}
        <section style={{ maxWidth: 680, margin: '0 auto', padding: '64px 24px' }}>
          <h2 style={{ fontSize: 'clamp(1.4rem, 4vw, 2rem)', fontWeight: 900, textAlign: 'center', marginBottom: 36 }}>
            Condimento es para vos si...
          </h2>
          <div style={{ display: 'grid', gap: 12 }}>
            {[
              '✅ Tenés una marca de e-commerce o dropshipping y querés vender más sin depender de nadie',
              '✅ Querés testear múltiples ángulos y mensajes sin tardarte semanas por campaña',
              '✅ Manejás clientes en tu agencia y necesitás producir más rápido y con mejor calidad',
              '✅ Sabés que la comunicación de tu marca es lo que decide si vendés o no, pero no tenés el tiempo para hacerlo bien',
              '✅ Querés que tus anuncios, tu contenido y tu tienda hablen el mismo idioma y cuenten la misma historia',
              '✅ Estás listo para dejar de hacer e-commerce como se hacía hace 10 años',
            ].map((item, i) => (
              <div key={i} className="highlight-box" style={{ padding: '14px 20px', fontSize: '0.95rem', color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>
                {item}
              </div>
            ))}
          </div>
        </section>

        <div className="divider" />

        {/* ── GUARANTEE ── */}
        <section style={{ maxWidth: 620, margin: '0 auto', padding: '0 24px 80px' }}>
          <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start' }}>
            <div className="guarantee-badge">🛡️</div>
            <div>
              <h2 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: '1.6rem', marginBottom: 12 }}>
                Garantía de 7 días sin preguntas
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.95rem', lineHeight: 1.7 }}>
                Probá Condimento durante 7 días completos. Si no quedás 100% satisfecho con el sistema, te devolvemos cada centavo sin preguntas, sin excusas y sin demoras. Así de seguros estamos de que va a cambiar la forma en que operás tu e-commerce.
              </p>
            </div>
          </div>
        </section>

        {/* ── PRICING / FINAL CTA ── */}
        <section style={{ background: '#0e0e0e', borderTop: '1px solid rgba(255,255,255,0.05)', padding: '64px 24px' }}>
          <div style={{ maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
            <p style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '0.8rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#c026d3', marginBottom: 16 }}>
              Empezá hoy
            </p>
            <h2 style={{ fontSize: 'clamp(1.6rem, 4.5vw, 2.5rem)', fontWeight: 900, marginBottom: 40 }}>
              Tu sistema de ventas con IA,{' '}
              <span className="gradient-text">listo en minutos</span>
            </h2>

            <div className="price-box">
              <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.85rem', marginBottom: 8 }}>Suscripción mensual</p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 4 }}>
                <span className="price-original">$97</span>
                <div className="price-current gradient-text">$25</div>
              </div>
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem', marginBottom: 32 }}>USD / mes · Cancelá cuando quieras</p>

              <div style={{ display: 'grid', gap: 10, textAlign: 'left', marginBottom: 32 }}>
                {[
                  '✅ Acceso completo a los 3 módulos (Anuncios, Contenido de Redes, Ficha de Producto)',
                  '✅ Ejecuciones ilimitadas — sin límites de uso',
                  '✅ Biblioteca de +50 prompts de alto impacto',
                  '✅ Actualizaciones incluidas siempre',
                  '✅ Garantía de devolución de 7 días',
                ].map((item, i) => (
                  <p key={i} style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', margin: 0 }}>{item}</p>
                ))}
              </div>

              <a href={CHECKOUT_URL} className="cta-btn" style={{ width: '100%', justifyContent: 'center', fontSize: '1.1rem', padding: '18px 32px' }}>
                ACCEDER AHORA POR $25/MES →
              </a>
              <p style={{ marginTop: 14, color: 'rgba(255,255,255,0.3)', fontSize: '0.78rem' }}>
                🔒 Pago seguro · Acceso inmediato · Cancelación en 1 click
              </p>
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section style={{ maxWidth: 680, margin: '0 auto', padding: '64px 24px' }}>
          <h2 style={{ fontSize: 'clamp(1.4rem, 4vw, 2rem)', fontWeight: 900, textAlign: 'center', marginBottom: 40 }}>
            Preguntas frecuentes
          </h2>
          <div>
            {FAQS.map((faq, i) => (
              <div key={i} className="faq-item">
                <button className="faq-btn" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                  <span>{faq.q}</span>
                  <span style={{ color: '#9f0ac9', fontSize: '1.2rem', flexShrink: 0 }}>
                    {openFaq === i ? '−' : '+'}
                  </span>
                </button>
                {openFaq === i && <p className="faq-answer">{faq.a}</p>}
              </div>
            ))}
          </div>
        </section>

        {/* ── FINAL CTA STRIP ── */}
        <section style={{ background: 'linear-gradient(135deg, #1a0a2e 0%, #0f0f0f 100%)', borderTop: '1px solid rgba(159,10,201,0.2)', padding: '64px 24px', textAlign: 'center' }}>
          <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.2rem)', fontWeight: 900, marginBottom: 16 }}>
            Tu competidor ya está usando IA.{' '}
            <span className="gradient-text">¿Cuándo arrancás vos?</span>
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '1rem', marginBottom: 36, maxWidth: 480, margin: '0 auto 36px' }}>
            Podés seguir probando herramientas, acumulando cursos y esperando resultados.
            O podés empezar a ejecutar con un sistema que ya sabe cómo vender.
          </p>
          <a href={CHECKOUT_URL} className="cta-btn" style={{ fontSize: '1.1rem', padding: '20px 44px' }}>
            EMPEZAR POR $25/MES →
          </a>
          <p style={{ marginTop: 16, color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem' }}>
            Garantía de 7 días · Sin contratos · Acceso inmediato
          </p>
        </section>

        {/* ── FOOTER ── */}
        <footer style={{ background: '#0a0a0a', borderTop: '1px solid rgba(255,255,255,0.05)', padding: '32px 24px', textAlign: 'center' }}>
          <p style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: '1.1rem', marginBottom: 8, letterSpacing: '0.06em' }}>
            🌶️ CONDIMENTO
          </p>
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.78rem', maxWidth: 560, margin: '0 auto', lineHeight: 1.6 }}>
            Los resultados mencionados en esta página son ejemplos de lo que es posible lograr con el sistema. No son promesas de ingresos. Los resultados individuales varían según el esfuerzo, la industria y otros factores. Condimento es una herramienta de automatización — el éxito de tu negocio depende de tu estrategia y ejecución.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.75rem', marginTop: 16 }}>
            © {new Date().getFullYear()} Condimento · Todos los derechos reservados
          </p>
        </footer>
      </div>
    </>
  );
}
