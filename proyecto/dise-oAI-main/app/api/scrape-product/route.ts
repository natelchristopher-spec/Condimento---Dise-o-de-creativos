import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getUserContext } from '@/app/lib/get-user-context';

export const maxDuration = 60;


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

  const { url }: { url: string } = await req.json();
  if (!url?.startsWith('http')) return NextResponse.json({ error: 'URL inválida.' }, { status: 400 });

  let pageText = '';
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es-AR,es;q=0.9',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    pageText = extractText(html);
  } catch (e) {
    return NextResponse.json({ error: `No se pudo acceder a la URL: ${e instanceof Error ? e.message : 'error de red'}` }, { status: 422 });
  }

  const openai = new OpenAI({ apiKey: ctx.openaiApiKey });

  const { choices } = await openai.chat.completions.create({
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

  const clientRequest = choices[0].message.content?.trim() || '';
  return NextResponse.json({ clientRequest });
}
