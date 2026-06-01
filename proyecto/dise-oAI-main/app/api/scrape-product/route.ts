import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getUserContext } from '@/app/lib/get-user-context';

export const maxDuration = 60;

// Bloquear IPs privadas y metadatos cloud
function isSafeUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const host = parsed.hostname;
    // Bloquear localhost, IPs privadas y metadata endpoints
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return false;
    if (host === '169.254.169.254' || host === 'metadata.google.internal') return false;
    if (/^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

function extractText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 10000);
}

export async function POST(req: NextRequest) {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Configurá tu API key de OpenAI en el perfil.' }, { status: 401 });

  const { url, mode }: { url: string; mode?: string } = await req.json();
  if (!url?.startsWith('http')) return NextResponse.json({ error: 'URL inválida.' }, { status: 400 });
  if (!isSafeUrl(url)) {
    return NextResponse.json({ error: 'URL no permitida' }, { status: 400 });
  }

  let pageText = '';
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es-AR,es;q=0.9',
      },
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    pageText = extractText(html);
  } catch (e) {
    return NextResponse.json({ error: `No se pudo acceder a la URL: ${e instanceof Error ? e.message : 'error de red'}` }, { status: 422 });
  }

  const openai = new OpenAI({ apiKey: ctx.openaiApiKey });

  try {
    const briefCall = openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Sos un especialista en publicidad digital para e-commerce latinoamericano. Dado el texto de una página de producto, generás una solicitud de diseño lista para usar en un generador de creativos. La solicitud debe ser específica, incluir TODOS los datos numéricos encontrados (precios, descuentos, cuotas, montos mínimos, fechas) y sugerir el tipo de campaña más efectivo para ese producto. Respondé SOLO con el texto de la solicitud, sin encabezados ni explicaciones.`,
        },
        {
          role: 'user',
          content: `Página de producto (texto extraído):\n\n${pageText}\n\nGenerá la solicitud de diseño incluyendo: nombre y descripción del producto, precio actual y precio original si hay descuento, porcentaje de descuento, mecánicas de pago (cuotas, sin interés, monto mínimo), beneficios logísticos (envío gratis, retiro en tienda), y una propuesta de qué tipo de creativo haría más sentido para este producto y promoción.`,
        },
      ],
      max_tokens: 600,
      temperature: 0.4,
    });

    if (mode !== 'landing') {
      const { choices } = await briefCall;
      return NextResponse.json({ clientRequest: choices[0].message.content?.trim() || '' });
    }

    // Landing mode: run both GPT calls in parallel
    const landingCall = openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Sos un copywriter de e-commerce LATAM. Dado el texto de una página de producto, extraés y generás datos para pre-completar un formulario de landing page.

Respondé SOLO con JSON válido:
{
  "bullets": ["beneficio 1 (máx 10 palabras)", "beneficio 2", "beneficio 3"],
  "shippingText": "texto de envío y garantía extraído de la página, o '' si no hay",
  "reviews": [
    {"name": "Nombre del reviewer", "quote": "Testimonio real extraído de la página"},
    {"name": "...", "quote": "..."}
  ]
}

REGLAS:
- bullets: 3 beneficios concisos, naturales, no vendedores
- shippingText: si la página menciona envío gratis, plazo, garantía — armá una línea con emojis (ej: "🚚 Envío gratis • 🔄 30 días de devolución"). Si no hay info, devolvé ""
- reviews: extraé hasta 3 testimonios REALES de la página. Si no hay reviews reales, devolvé array vacío []`,
        },
        {
          role: 'user',
          content: `Página de producto:\n\n${pageText}`,
        },
      ],
      max_tokens: 400,
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const [briefRes, landingRes] = await Promise.all([briefCall, landingCall]);
    const clientRequest = briefRes.choices[0].message.content?.trim() || '';
    let bullets: string[] = [];
    let shippingText = '';
    let reviews: { name: string; quote: string }[] = [];
    try {
      const parsed = JSON.parse(landingRes.choices[0].message.content || '{}');
      if (Array.isArray(parsed.bullets)) bullets = parsed.bullets.slice(0, 3);
      if (typeof parsed.shippingText === 'string') shippingText = parsed.shippingText;
      if (Array.isArray(parsed.reviews)) reviews = parsed.reviews.filter((r: { name?: string }) => r.name).slice(0, 3);
    } catch { /* use defaults */ }
    return NextResponse.json({ clientRequest, bullets, shippingText, reviews });
  } catch (e) {
    return NextResponse.json({ error: getOpenAIErrorMessage(e) }, { status: 500 });
  }
}

function getOpenAIErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes('401') || msg.includes('Incorrect API key') || msg.includes('invalid_api_key'))
    return 'API key de OpenAI inválida. Verificá la clave en tu perfil.';
  if (msg.includes('429') || msg.includes('rate limit') || msg.includes('quota'))
    return 'Límite de uso de OpenAI alcanzado. Esperá unos minutos o revisá tu plan.';
  if (msg.includes('insufficient_quota'))
    return 'Sin crédito en tu cuenta de OpenAI. Recargá saldo en platform.openai.com.';
  return 'Error al conectar con OpenAI. Intentá de nuevo.';
}
