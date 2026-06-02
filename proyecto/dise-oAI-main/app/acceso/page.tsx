'use client';

import { useState, useEffect } from 'react';

const CHECKOUT_URL = '#checkout'; // TODO: replace with actual Hotmart/Gumroad URL
const PRICE_RISE_DATE = 'el 8 de junio';
const CURRENT_PRICE = 17;
const NEXT_PRICE = 47;

const FAQS = [
  {
    q: '¿Cómo recibo el acceso?',
    a: 'Apenas completás el pago recibís acceso inmediato a la plataforma Condimento, a la comunidad y a todos los materiales.',
  },
  {
    q: '¿Para quién es esto?',
    a: 'Para dueños de e-commerce o dropshippers en LATAM que quieren construir una marca real o dejar de improvisar con sus campañas. Funciona igual si arrancás desde cero o si ya tenés ventas.',
  },
  {
    q: '¿Necesito saber de diseño o programación para usar Condimento?',
    a: 'No. El sistema está diseñado para ejecutar las decisiones por vos. Describís tu producto y la IA hace el resto. Para conectar tu API de OpenAI tenés el bonus de configuración paso a paso — en menos de 10 minutos la tenés funcionando.',
  },
  {
    q: '¿Qué es el sistema PEC y por qué es importante?',
    a: 'PEC (Prospección / Evaluación / Conversión) es la estructura publicitaria que separa los tres momentos del funnel. Un cliente que nunca te vio necesita un mensaje distinto al que ya visitó tu tienda. Condimento genera automáticamente una pieza para cada etapa — eso es lo que te permite escalar sin quemar el presupuesto.',
  },
  {
    q: '¿Cuánto me cuesta la API de OpenAI además de la suscripción?',
    a: 'Entre $2 y $8 USD por mes para un uso normal. Muchísimo menos que cualquier diseñador, agencia o herramienta de diseño.',
  },
  {
    q: '¿Cuántos creativos puedo generar?',
    a: 'Ilimitados. No hay tope de sesiones ni de generaciones. El único límite es el crédito de tu API de OpenAI, que podés recargar cuando quieras.',
  },
  {
    q: `¿Qué pasa con el precio después del ${PRICE_RISE_DATE}?`,
    a: `Sube a $${NEXT_PRICE}/mes. Sin excepciones. El precio de $${CURRENT_PRICE} es para las primeras tiendas que entren durante el lanzamiento.`,
  },
  {
    q: '¿Y si no me gusta?',
    a: 'Tenés 30 días. Si no quedás satisfecho por cualquier razón te devolvemos cada centavo. Te quedás con el contenido igual.',
  },
];

const CORE = [
  { label: 'Spicy Ad Formula', desc: 'El sistema publicitario basado en cómo los humanos toman decisiones de compra. Funciona hoy y cuando Meta haga el próximo cambio.', value: 197 },
  { label: 'Comunidad Spicy Ads Ecommerce', desc: 'Q&A semanales, casos reales y feedback constante de otras marcas que están en el mismo proceso que vos.', value: 97 },
  { label: 'Condimento AI — Sistema completo', desc: 'La herramienta que automatiza la creación de tu marca: testing de ángulos, sistema PEC completo, anuncios, carruseles IG y ficha de producto.', value: 497 },
  { label: 'Desafío 30 días guiado', desc: 'Ejecutás el sistema completo semana a semana. Al final del mes tenés tu marca funcionando, no apuntes en un cuaderno.', value: 197 },
];

const BONUSES = [
  { n: '🎁 Bonus 1', label: 'Sesión de Onboarding 1 a 1 con Cris', desc: '20 minutos para arrancar tu marca desde cero. Analizamos tu caso y te decimos exactamente por dónde empezar. Solo para los primeros 30 que entren.', value: 150 },
  { n: '🎁 Bonus 2', label: 'Guía de Configuración de Condimento AI', desc: 'Video paso a paso para conectar tu API desde cero. En menos de 10 minutos tenés la herramienta funcionando.', value: 47 },
  { n: '🎁 Bonus 3', label: 'Pack de Ángulos Publicitarios', desc: 'Los 10 ángulos que más convierten en e-commerce LATAM según nuestra auditoría de 100+ marcas. Listos para cargar en Condimento desde el día 1.', value: 97 },
];

const totalCore = CORE.reduce((a, i) => a + i.value, 0);
const totalBonuses = BONUSES.reduce((a, i) => a + i.value, 0);
const totalValue = totalCore + totalBonuses;

function Countdown() {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, mins: 0, secs: 0 });
  useEffect(() => {
    const target = new Date('2026-06-08T23:59:59');
    const tick = () => {
      const diff = target.getTime() - Date.now();
      if (diff <= 0) { setTimeLeft({ days: 0, hours: 0, mins: 0, secs: 0 }); return; }
      setTimeLeft({
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        mins: Math.floor((diff % 3600000) / 60000),
        secs: Math.floor((diff % 60000) / 1000),
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' }}>
      {[
        { v: pad(timeLeft.days), l: 'días' },
        { v: pad(timeLeft.hours), l: 'horas' },
        { v: pad(timeLeft.mins), l: 'min' },
        { v: pad(timeLeft.secs), l: 'seg' },
      ].map(({ v, l }) => (
        <div key={l} style={{ textAlign:'center', background:'rgba(159,10,201,.15)', border:'1px solid rgba(159,10,201,.3)', borderRadius:10, padding:'10px 16px', minWidth:64 }}>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:'1.8rem', lineHeight:1 }}>{v}</div>
          <div style={{ color:'rgba(255,255,255,.4)', fontSize:'.7rem', marginTop:4 }}>{l}</div>
        </div>
      ))}
    </div>
  );
}

export default function AccesoPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800;900&family=Inter:wght@400;500;600&display=swap');

        .lp { background: #101010; font-family: 'Inter', sans-serif; color: #fff; }
        .lp h1, .lp h2, .lp h3, .lp h4 { font-family: 'Montserrat', sans-serif; }

        .grad { background: linear-gradient(135deg,#c026d3 0%,#9f0ac9 50%,#7c3aed 100%); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
        .orange { color: #ff7b00; }

        .cta-btn {
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          background: linear-gradient(135deg,#ff7b00 0%,#ff9500 100%);
          color: #fff; font-family: 'Montserrat',sans-serif; font-weight: 800;
          letter-spacing: .04em; border-radius: 50px;
          border: none; cursor: pointer; position: relative; overflow: hidden;
          transition: transform .2s, box-shadow .2s;
          box-shadow: 0 4px 30px rgba(255,123,0,.4);
          text-decoration: none; font-size: 1.05rem; padding: 18px 36px;
        }
        .cta-btn::before {
          content:''; position:absolute; top:0; left:-100%; width:60%; height:100%;
          background: linear-gradient(90deg,transparent,rgba(255,255,255,.25),transparent);
          animation: shimmer 2.5s infinite;
        }
        .cta-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 40px rgba(255,123,0,.55); }
        @keyframes shimmer { 0%{left:-100%} 100%{left:200%} }

        .top-bar {
          background: linear-gradient(90deg,#7c1d1d,#991a1a,#7c1d1d);
          background-size: 200%; animation: gmove 4s linear infinite;
          text-align: center; padding: 10px 16px;
          font-family: 'Montserrat',sans-serif; font-weight: 800;
          font-size: .78rem; letter-spacing: .1em; text-transform: uppercase;
        }
        @keyframes gmove { 0%{background-position:0%} 100%{background-position:200%} }

        .card { background: #1a1a1a; border-radius: 14px; }
        .card-purple { background: linear-gradient(135deg,rgba(159,10,201,.1),rgba(124,58,237,.05)); border: 1px solid rgba(159,10,201,.25); border-radius: 14px; }
        .card-orange { background: rgba(255,123,0,.07); border: 1px solid rgba(255,123,0,.25); border-radius: 14px; }

        .step-n { width:42px; height:42px; border-radius:50%; background:linear-gradient(135deg,#9f0ac9,#7c3aed); display:flex; align-items:center; justify-content:center; font-family:'Montserrat',sans-serif; font-weight:800; font-size:1rem; flex-shrink:0; }

        .divider { height:1px; background:linear-gradient(90deg,transparent,rgba(159,10,201,.35),transparent); margin:52px 0; }

        .faq-item { border-bottom:1px solid rgba(255,255,255,.07); }
        .faq-btn { width:100%; text-align:left; background:none; border:none; cursor:pointer; padding:18px 0; display:flex; align-items:center; justify-content:space-between; gap:16px; color:#fff; font-family:'Montserrat',sans-serif; font-weight:700; font-size:.9rem; }
        .faq-ans { color:rgba(255,255,255,.6); font-size:.88rem; line-height:1.7; padding-bottom:18px; }

        .value-row { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; padding:14px 0; border-bottom:1px solid rgba(255,255,255,.06); }
        .value-amt { font-family:'Montserrat',sans-serif; font-weight:800; color:#c026d3; white-space:nowrap; font-size:.9rem; flex-shrink:0; padding-top:2px; }

        .price-box { background:linear-gradient(135deg,#1a1a1a,#1e1420); border:2px solid rgba(159,10,201,.5); border-radius:22px; padding:36px; text-align:center; max-width:460px; margin:0 auto; }

        .proof-badge { background:#1a1a1a; border:1px solid rgba(255,255,255,.08); border-radius:14px; padding:20px; text-align:center; }
        .proof-num { font-family:'Montserrat',sans-serif; font-weight:900; font-size:2rem; }

        @media(max-width:640px){ .cta-btn{font-size:.88rem;padding:15px 20px;} }
      `}</style>

      <div className="lp">

        {/* URGENCY BAR */}
        <div className="top-bar">
          🔥 Precio de lanzamiento $17/mes — sube a $47 {PRICE_RISE_DATE}. Sin excepciones.
        </div>

        {/* HEADER */}
        <header style={{ borderBottom:'1px solid rgba(255,255,255,.06)', padding:'16px 24px', textAlign:'center' }}>
          <span style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:'1.35rem', letterSpacing:'.06em' }}>🌶️ CONDIMENTO</span>
        </header>

        {/* ── HOOK ── */}
        <section style={{ maxWidth:700, margin:'0 auto', padding:'68px 24px 40px', textAlign:'center' }}>
          <p style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:'.72rem', letterSpacing:'.15em', textTransform:'uppercase', color:'#c026d3', marginBottom:18 }}>
            Para dueños de e-commerce y dropshipping en LATAM
          </p>
          <h1 style={{ fontSize:'clamp(1.9rem,5.5vw,3.3rem)', fontWeight:900, lineHeight:1.1, marginBottom:22 }}>
            El dropshipping te da productos.{' '}
            <span className="grad">Condimento te da una marca que vende.</span>
          </h1>
          <p style={{ fontSize:'1.05rem', color:'rgba(255,255,255,.6)', lineHeight:1.8, maxWidth:560, margin:'0 auto 36px' }}>
            Cómo construir tu marca de e-commerce de manera automatizada — o convertir tu dropshipping en algo que realmente deje dinero — sin diseñador, sin agencia y sin experiencia previa.
          </p>

          {/* countdown */}
          <div style={{ marginBottom:32 }}>
            <p style={{ color:'rgba(255,255,255,.35)', fontSize:'.75rem', marginBottom:12, fontStyle:'italic' }}>
              El precio de ${CURRENT_PRICE} cierra en:
            </p>
            <Countdown />
          </div>

          <a href={CHECKOUT_URL} className="cta-btn" style={{ fontSize:'1.1rem', padding:'20px 40px' }}>
            QUIERO ACCESO INMEDIATO POR ${CURRENT_PRICE}/MES →
          </a>
          <p style={{ marginTop:12, color:'rgba(255,255,255,.3)', fontSize:'.75rem' }}>
            🔒 Pago seguro · Acceso inmediato · Garantía 30 días
          </p>
        </section>

        {/* ── SOCIAL PROOF NUMBERS ── */}
        <section style={{ background:'#0d0d0d', borderTop:'1px solid rgba(255,255,255,.05)', borderBottom:'1px solid rgba(255,255,255,.05)', padding:'32px 24px' }}>
          <div style={{ maxWidth:680, margin:'0 auto', display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
            {[
              { n:'ROAS 2→39', l:'en un mes con el sistema' },
              { n:'$200K', l:'facturados en una semana' },
              { n:'+150', l:'tiendas ya dentro' },
            ].map(({ n, l })=>(
              <div key={l} className="proof-badge">
                <div className="proof-num grad">{n}</div>
                <div style={{ color:'rgba(255,255,255,.4)', fontSize:'.78rem', marginTop:6, lineHeight:1.4 }}>{l}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── CRIS'S STORY ── */}
        <section style={{ maxWidth:640, margin:'0 auto', padding:'64px 24px' }}>
          <p style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:'.72rem', letterSpacing:'.15em', textTransform:'uppercase', color:'rgba(255,255,255,.3)', marginBottom:16 }}>
            Quién está detrás de esto
          </p>
          <h2 style={{ fontSize:'clamp(1.4rem,4vw,1.9rem)', fontWeight:900, marginBottom:20 }}>
            Soy Cris Natel. Llevo{' '}
            <span className="grad">7 años gestionando e-commerces en LATAM.</span>
          </h2>
          <div style={{ color:'rgba(255,255,255,.65)', fontSize:'.95rem', lineHeight:1.8, display:'flex', flexDirection:'column', gap:14 }}>
            <p style={{ margin:0 }}>
              Agencias de marketing, campañas para más de <strong style={{ color:'#fff' }}>100 marcas de e-commerce</strong> — desde tiendas que invertían $10 diarios hasta marcas que movían <strong style={{ color:'#fff' }}>$200.000 dólares mensuales</strong> en pauta.
              No soy un gurú de TikTok. Tenés mi LinkedIn para verificarlo.
            </p>
            <p style={{ margin:0 }}>
              En todos esos años auditando marcas, siempre encontraba lo mismo.
              El que hacía dropshipping buscaba el producto ganador sin parar — y nunca llegaba a construir nada real.
              El que tenía su marca improvisaba, dependía de una agencia para cada pieza y cambiaba de estrategia cada semana.
            </p>
            <div className="card-purple" style={{ padding:'18px 20px' }}>
              <p style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, margin:'0 0 8px 0' }}>Los dos tenían el mismo problema:</p>
              <p style={{ margin:0, color:'rgba(255,255,255,.75)' }}>No tenían un sistema. Lanzaban anuncios sin testear el mensaje. Escalaban lo equivocado. Y cuando no funcionaba, culpaban al producto.</p>
            </div>
            <p style={{ margin:0 }}>
              Después de ver repetirse ese patrón cientos de veces, construí Condimento:
              la IA entrenada con toda esa experiencia para que vos puedas ejecutar en minutos lo que a mí me llevó 7 años aprender.
            </p>
          </div>
        </section>

        <div className="divider" />

        {/* ── THE PROBLEM ── */}
        <section style={{ maxWidth:640, margin:'0 auto', padding:'0 24px 64px' }}>
          <h2 style={{ fontSize:'clamp(1.4rem,4vw,2rem)', fontWeight:900, textAlign:'center', marginBottom:28 }}>
            Si te identificás con alguno de estos,{' '}
            <span className="grad">Condimento es para vos</span>
          </h2>
          <div style={{ display:'grid', gap:10 }}>
            {[
              '❌ Pasás horas buscando el producto ganador que nunca aparece',
              '❌ Tus anuncios no generan intención de compra aunque el producto sea bueno',
              '❌ Tu página de producto no convierte — la gente entra y se va',
              '❌ Tu marca no se ve confiable y la gente no pone la tarjeta',
              '❌ Cada parte de tu comunicación parece hecha por alguien distinto',
            ].map((item,i)=>(
              <div key={i} className="card" style={{ padding:'14px 18px', fontSize:'.88rem', color:'rgba(255,255,255,.65)', border:'1px solid rgba(255,255,255,.06)', lineHeight:1.5 }}>
                {item}
              </div>
            ))}
          </div>
          <p style={{ textAlign:'center', marginTop:24, color:'rgba(255,255,255,.35)', fontStyle:'italic', fontSize:'.88rem' }}>
            El problema no es tu producto. Es todo lo que rodea a tu producto.
          </p>
        </section>

        {/* ── SOLUTION + 3 LAYERS ── */}
        <section style={{ background:'#0d0d0d', borderTop:'1px solid rgba(255,255,255,.05)', borderBottom:'1px solid rgba(255,255,255,.05)', padding:'64px 24px' }}>
          <div style={{ maxWidth:680, margin:'0 auto' }}>
            <p style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:'.72rem', letterSpacing:'.15em', textTransform:'uppercase', color:'#ff7b00', marginBottom:8, textAlign:'center' }}>
              La solución
            </p>
            <h2 style={{ fontSize:'clamp(1.5rem,4.5vw,2.3rem)', fontWeight:900, textAlign:'center', lineHeight:1.15, marginBottom:12 }}>
              Condimento: el primer sistema en LATAM para{' '}
              <span className="grad">crear marcas de e-commerce automatizadas</span>
            </h2>
            <p style={{ color:'rgba(255,255,255,.55)', textAlign:'center', maxWidth:520, margin:'0 auto 44px', lineHeight:1.7 }}>
              No es otro curso. No es otro software. No es otra comunidad.
              Es la combinación de formación, sistema publicitario y una IA entrenada con 7 años de experiencia real — que ejecuta por vos.
            </p>

            <div style={{ display:'grid', gap:16 }}>
              {[
                { icon:'📚', title:'Capa 1 — Spicy Ads Ecommerce', desc:'La comunidad donde está clonada toda nuestra experiencia en publicidad y psicología de compra para e-commerce. No teoría. Ejecución.' },
                { icon:'📐', title:'Capa 2 — Spicy Ad Formula', desc:'El sistema publicitario basado en cómo los humanos toman decisiones de compra — no en el algoritmo del día. Funciona hoy y cuando Meta haga el próximo cambio.' },
                { icon:'🤖', title:'Capa 3 — Condimento AI', desc:'La herramienta que automatiza la creación de tu marca. Cargás tu producto, elegís el ángulo, y en minutos genera tus anuncios en diversos ángulos, las imágenes de tu ficha de producto y tu contenido de redes. Todo coherente. Todo conectado.' },
              ].map((item)=>(
                <div key={item.title} className="card-purple" style={{ display:'flex', gap:16, padding:'20px 22px' }}>
                  <span style={{ fontSize:'1.5rem', flexShrink:0 }}>{item.icon}</span>
                  <div>
                    <p style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:'1rem', marginBottom:6 }}>{item.title}</p>
                    <p style={{ color:'rgba(255,255,255,.6)', fontSize:'.88rem', lineHeight:1.65, margin:0 }}>{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CONDIMENTO AI DEEP DIVE ── */}
        <section style={{ maxWidth:680, margin:'0 auto', padding:'72px 24px' }}>
          <p style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:'.72rem', letterSpacing:'.15em', textTransform:'uppercase', color:'rgba(255,255,255,.3)', marginBottom:8, textAlign:'center' }}>
            Dentro de Condimento AI
          </p>
          <h2 style={{ fontSize:'clamp(1.4rem,4vw,2rem)', fontWeight:900, textAlign:'center', marginBottom:48 }}>
            El sistema que la IA ejecuta en 3 pasos
          </h2>

          {/* PASO 1 */}
          <div style={{ marginBottom:56 }}>
            <div style={{ display:'flex', gap:14, alignItems:'center', marginBottom:18 }}>
              <div className="step-n">1</div>
              <p style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:'1.1rem', margin:0 }}>Testing de Ángulos — sabé qué mensaje convierte <em>antes</em> de gastar en pauta</p>
            </div>
            <p style={{ color:'rgba(255,255,255,.6)', lineHeight:1.75, paddingLeft:56, marginBottom:16 }}>
              Describís tu producto y Condimento genera múltiples <strong style={{ color:'#fff' }}>ángulos de mensaje</strong> (a nivel producto y categoría) con el hook y propuesta para cada uno.
              Vos evaluás cuál resuena — sin gastar un peso todavía. Recién cuando sabés qué funciona, escalás.
            </p>
            <div className="card-purple" style={{ marginLeft:56, padding:'14px 18px' }}>
              <p style={{ color:'rgba(255,255,255,.7)', fontSize:'.85rem', lineHeight:1.6, margin:0 }}>
                ✓ Fin de copiar anuncios de la competencia y esperar que funcionen.
              </p>
            </div>
          </div>

          {/* PASO 2 */}
          <div style={{ marginBottom:56 }}>
            <div style={{ display:'flex', gap:14, alignItems:'center', marginBottom:18 }}>
              <div className="step-n">2</div>
              <p style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:'1.1rem', margin:0 }}>Sistema PEC — escala cada ángulo ganador en los 3 momentos del funnel</p>
            </div>
            <p style={{ color:'rgba(255,255,255,.6)', lineHeight:1.75, paddingLeft:56, marginBottom:16 }}>
              Para cada ángulo que ganó, Condimento genera automáticamente{' '}
              <strong style={{ color:'#fff' }}>3 piezas distintas</strong>:
              una para <span style={{ color:'#c026d3', fontWeight:600 }}>Prospección</span> (llegar a quien no te conoce),
              una para <span style={{ color:'#7c3aed', fontWeight:600 }}>Evaluación</span> (convencer a quien ya te vio),
              y una para <span style={{ color:'#ff7b00', fontWeight:600 }}>Conversión</span> (cerrar a quien está listo).
            </p>
            <div className="card-purple" style={{ marginLeft:56, padding:'14px 18px' }}>
              <p style={{ color:'rgba(255,255,255,.7)', fontSize:'.85rem', lineHeight:1.6, margin:0 }}>
                ✓ El mismo mensaje, adaptado a cada etapa. Así no quemás la cuenta.
              </p>
            </div>
          </div>

          {/* PASO 3 */}
          <div>
            <div style={{ display:'flex', gap:14, alignItems:'center', marginBottom:18 }}>
              <div className="step-n">3</div>
              <p style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:'1.1rem', margin:0 }}>Todo conectado — anuncios, redes e y ficha de producto en la misma historia</p>
            </div>
            <p style={{ color:'rgba(255,255,255,.6)', lineHeight:1.75, paddingLeft:56, marginBottom:16 }}>
              Condimento usa el mismo Brand Kit en todos los módulos: el mensaje que encontraste en el testing informa el copy de tus anuncios, los carruseles de Instagram planificados por etapa del funnel (TOFU/MOFU/BOFU) y las 6 imágenes de tu ficha de producto (hero, beneficios, lifestyle, autoridad, how-to, testimonial).
            </p>
            <div className="card-purple" style={{ marginLeft:56, padding:'14px 18px' }}>
              <p style={{ color:'rgba(255,255,255,.7)', fontSize:'.85rem', lineHeight:1.6, margin:0 }}>
                ✓ Una sola marca. Una sola historia. Todo conectado.
              </p>
            </div>
          </div>
        </section>

        <div className="divider" />

        {/* ── OFFER STACK ── */}
        <section style={{ maxWidth:640, margin:'0 auto', padding:'0 24px 80px' }}>
          <p style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:'.72rem', letterSpacing:'.15em', textTransform:'uppercase', color:'#ff7b00', marginBottom:8, textAlign:'center' }}>
            Lo que recibís hoy por ${CURRENT_PRICE}
          </p>
          <h2 style={{ fontSize:'clamp(1.4rem,4vw,2rem)', fontWeight:900, textAlign:'center', marginBottom:40 }}>
            El sistema completo. Sin partes sueltas.
          </h2>

          {/* Core items */}
          <div style={{ marginBottom:32 }}>
            {CORE.map((item,i)=>(
              <div key={i} style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, padding:'14px 0', borderBottom:'1px solid rgba(255,255,255,.06)' }}>
                <div style={{ display:'flex', gap:10 }}>
                  <span style={{ color:'#c026d3', flexShrink:0, marginTop:2 }}>✦</span>
                  <div>
                    <p style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:'.9rem', margin:'0 0 2px 0' }}>{item.label}</p>
                    <p style={{ color:'rgba(255,255,255,.4)', fontSize:'.78rem', margin:0, lineHeight:1.5 }}>{item.desc}</p>
                  </div>
                </div>
                <span style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, color:'#c026d3', whiteSpace:'nowrap', fontSize:'.88rem', flexShrink:0, paddingTop:2 }}>${item.value}</span>
              </div>
            ))}
          </div>

          {/* Bonuses */}
          <p style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:'.72rem', letterSpacing:'.15em', textTransform:'uppercase', color:'#ff7b00', marginBottom:16 }}>
            + Bonuses exclusivos hasta el {PRICE_RISE_DATE}
          </p>
          <div style={{ display:'grid', gap:12, marginBottom:32 }}>
            {BONUSES.map((b,i)=>(
              <div key={i} className="card-orange" style={{ padding:'18px 20px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12 }}>
                  <div>
                    <p style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:'.72rem', color:'#ff7b00', textTransform:'uppercase', letterSpacing:'.08em', margin:'0 0 4px 0' }}>{b.n}</p>
                    <p style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:'.92rem', margin:'0 0 6px 0' }}>{b.label}</p>
                    <p style={{ color:'rgba(255,255,255,.5)', fontSize:'.8rem', lineHeight:1.6, margin:0 }}>{b.desc}</p>
                  </div>
                  <span style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, color:'#ff7b00', whiteSpace:'nowrap', fontSize:'.88rem', flexShrink:0 }}>${b.value}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="card" style={{ border:'1px solid rgba(255,255,255,.07)', padding:'24px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', padding:'0 0 12px 0', borderBottom:'1px solid rgba(255,255,255,.07)', marginBottom:12 }}>
              <span style={{ color:'rgba(255,255,255,.45)', fontSize:'.85rem' }}>Valor total del sistema</span>
              <span style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, textDecoration:'line-through', color:'rgba(255,255,255,.25)', fontSize:'1.1rem' }}>${totalValue.toLocaleString()}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <p style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:'1rem', margin:0 }}>Tu inversión hoy</p>
                <p style={{ color:'rgba(255,255,255,.3)', fontSize:'.72rem', margin:'2px 0 0 0' }}>Precio sube a ${NEXT_PRICE} {PRICE_RISE_DATE}</p>
              </div>
              <div style={{ textAlign:'right' }}>
                <div className="grad" style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:'2.8rem', lineHeight:1 }}>${CURRENT_PRICE}</div>
                <div style={{ color:'rgba(255,255,255,.3)', fontSize:'.7rem' }}>USD / mes</div>
              </div>
            </div>
          </div>

          <div style={{ textAlign:'center', marginTop:28 }}>
            <a href={CHECKOUT_URL} className="cta-btn" style={{ fontSize:'1.1rem', padding:'20px 40px' }}>
              QUIERO ACCESO INMEDIATO POR ${CURRENT_PRICE}/MES →
            </a>
            <p style={{ marginTop:10, color:'rgba(255,255,255,.25)', fontSize:'.73rem' }}>
              🔒 Pago seguro · Acceso inmediato · Garantía 30 días
            </p>
          </div>
        </section>

        {/* ── GUARANTEE ── */}
        <section style={{ background:'#0d0d0d', borderTop:'1px solid rgba(255,255,255,.05)', borderBottom:'1px solid rgba(255,255,255,.05)', padding:'56px 24px' }}>
          <div style={{ maxWidth:560, margin:'0 auto', display:'flex', gap:24, alignItems:'flex-start' }}>
            <div style={{ width:76, height:76, borderRadius:'50%', border:'3px solid #ff7b00', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.9rem', flexShrink:0 }}>🛡️</div>
            <div>
              <h2 style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:'1.4rem', marginBottom:10 }}>
                Garantía incondicional de 30 días
              </h2>
              <p style={{ color:'rgba(255,255,255,.6)', fontSize:'.88rem', lineHeight:1.75 }}>
                Si en los primeros 30 días sentís que Condimento no fue lo que esperabas — te devolvemos cada centavo.
                <strong style={{ color:'#fff' }}> Y te quedás con todo el contenido.</strong>
                Sin preguntas. Sin trampa.
              </p>
            </div>
          </div>
        </section>

        {/* ── FINAL CTA BOX ── */}
        <section style={{ maxWidth:680, margin:'0 auto', padding:'64px 24px' }}>
          <h2 style={{ fontSize:'clamp(1.4rem,4vw,2rem)', fontWeight:900, textAlign:'center', marginBottom:16 }}>
            Para los que van directo al final:
          </h2>
          <p style={{ color:'rgba(255,255,255,.5)', textAlign:'center', marginBottom:36, fontSize:'.9rem' }}>
            Esto es lo que obtenés hoy por ${CURRENT_PRICE}/mes
          </p>
          <div className="price-box">
            <div style={{ display:'grid', gap:8, textAlign:'left', marginBottom:28 }}>
              {CORE.map((item,i)=>(
                <p key={i} style={{ color:'rgba(255,255,255,.7)', fontSize:'.82rem', margin:0 }}>✅ {item.label} <span style={{ color:'rgba(255,255,255,.25)', marginLeft:6 }}>→ ${item.value}</span></p>
              ))}
              {BONUSES.map((b,i)=>(
                <p key={i} style={{ color:'rgba(255,255,255,.7)', fontSize:'.82rem', margin:0 }}>🎁 {b.label} <span style={{ color:'rgba(255,255,255,.25)', marginLeft:6 }}>→ ${b.value}</span></p>
              ))}
              <p style={{ color:'rgba(255,255,255,.7)', fontSize:'.82rem', margin:0 }}>✅ Garantía incondicional 30 días</p>
              <p style={{ color:'rgba(255,255,255,.7)', fontSize:'.82rem', margin:0 }}>✅ Actualizaciones incluidas siempre</p>
            </div>
            <div style={{ borderTop:'1px solid rgba(255,255,255,.1)', paddingTop:20, marginBottom:24 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                <span style={{ color:'rgba(255,255,255,.4)', fontSize:'.82rem' }}>Valor total</span>
                <span style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, textDecoration:'line-through', color:'rgba(255,255,255,.2)' }}>${totalValue.toLocaleString()}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800 }}>Tu precio hoy</span>
                <div>
                  <span className="grad" style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:'2.4rem' }}>${CURRENT_PRICE}</span>
                  <span style={{ color:'rgba(255,255,255,.3)', fontSize:'.75rem', marginLeft:6 }}>/mes</span>
                </div>
              </div>
              <p style={{ color:'rgba(255,123,0,.7)', fontSize:'.75rem', fontFamily:'Montserrat,sans-serif', fontWeight:700, textAlign:'right', marginTop:6 }}>
                ⚠️ Sube a ${NEXT_PRICE} {PRICE_RISE_DATE}
              </p>
            </div>
            <a href={CHECKOUT_URL} className="cta-btn" style={{ width:'100%', justifyContent:'center', fontSize:'1rem', padding:'18px 24px' }}>
              QUIERO ACCESO INMEDIATO POR ${CURRENT_PRICE}/MES →
            </a>
            <p style={{ marginTop:10, color:'rgba(255,255,255,.2)', fontSize:'.7rem' }}>
              Pago seguro · Acceso inmediato · Cancelación en 1 click
            </p>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section style={{ maxWidth:620, margin:'0 auto', padding:'0 24px 64px' }}>
          <h2 style={{ fontSize:'clamp(1.3rem,4vw,1.8rem)', fontWeight:900, textAlign:'center', marginBottom:32 }}>Preguntas frecuentes</h2>
          {FAQS.map((faq,i)=>(
            <div key={i} className="faq-item">
              <button className="faq-btn" onClick={()=>setOpenFaq(openFaq===i?null:i)}>
                <span>{faq.q}</span>
                <span style={{ color:'#9f0ac9', fontSize:'1.1rem', flexShrink:0 }}>{openFaq===i?'−':'+'}</span>
              </button>
              {openFaq===i && <p className="faq-ans">{faq.a}</p>}
            </div>
          ))}
        </section>

        {/* ── FINAL STRIP ── */}
        <section style={{ background:'linear-gradient(135deg,#1a0a2e,#101010)', borderTop:'1px solid rgba(159,10,201,.2)', padding:'56px 24px', textAlign:'center' }}>
          <h2 style={{ fontSize:'clamp(1.4rem,4vw,2rem)', fontWeight:900, marginBottom:12 }}>
            Dejá de hacer dropshipping como hace 10 años.{' '}
            <span className="grad">Empezá a construir una marca.</span>
          </h2>
          <p style={{ color:'rgba(255,255,255,.45)', maxWidth:440, margin:'0 auto 28px', lineHeight:1.7, fontSize:'.9rem' }}>
            Podés seguir probando productos y copiando anuncios.
            O podés tener el sistema completo corriendo en tu negocio hoy, por ${CURRENT_PRICE}.
          </p>
          <a href={CHECKOUT_URL} className="cta-btn" style={{ fontSize:'1.05rem', padding:'18px 36px' }}>
            ACCEDER POR ${CURRENT_PRICE}/MES →
          </a>
          <p style={{ marginTop:12, color:'rgba(255,255,255,.2)', fontSize:'.72rem' }}>
            Garantía 30 días · Sin contratos · Acceso inmediato
          </p>
        </section>

        {/* FOOTER */}
        <footer style={{ background:'#0a0a0a', borderTop:'1px solid rgba(255,255,255,.04)', padding:'28px 24px', textAlign:'center' }}>
          <p style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:'1.1rem', marginBottom:8, letterSpacing:'.06em' }}>🌶️ CONDIMENTO</p>
          <p style={{ color:'rgba(255,255,255,.2)', fontSize:'.72rem', maxWidth:500, margin:'0 auto', lineHeight:1.65 }}>
            Los resultados mencionados son ejemplos reales pero no son garantía de ingresos. Los resultados individuales varían según el esfuerzo, el producto y la estrategia de cada negocio.
          </p>
          <p style={{ color:'rgba(255,255,255,.12)', fontSize:'.68rem', marginTop:12 }}>
            © {new Date().getFullYear()} Condimento · Todos los derechos reservados
          </p>
        </footer>

      </div>
    </>
  );
}
