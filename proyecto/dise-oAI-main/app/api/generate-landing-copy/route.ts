import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { BrandKit } from '@/app/types';
import { getUserContext } from '@/app/lib/get-user-context';

export const maxDuration = 120;

export interface LandingCopy {
  headline: string;
  subheadline: string;
  bullets: [string, string, string];
  description: string;
  rational_title: string;
  specs: Array<{ icon: string; title: string; text: string }>;
  testimonial_rating: string;
  faq: Array<{ q: string; a: string }>;
  cta_headline: string;
  cta_subtext: string;
  whatsapp_text: string;
}

export async function POST(req: NextRequest) {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Configurá tu API key de OpenAI en el perfil.' }, { status: 401 });

  const {
    brief,
    brandKit,
    pdpBullets = [],
    whatsappNumber = '',
    shippingText = '',
    testimonials = [],
  }: {
    brief: string;
    brandKit: BrandKit;
    pdpBullets: string[];
    whatsappNumber: string;
    shippingText: string;
    testimonials: Array<{ name: string; quote: string }>;
  } = await req.json();

  const openai = new OpenAI({ apiKey: ctx.openaiApiKey });

  const bulletsContext = pdpBullets.length > 0
    ? `Los 3 bullets de beneficios ya definidos son:\n${pdpBullets.map((b, i) => `${i + 1}. ${b}`).join('\n')}\nÚsalos exactamente como están en el campo "bullets".`
    : 'Generá 3 bullets de beneficios sutiles — no vendedores, no técnicos. Deben leerse como afirmaciones naturales que conectan el producto con la vida del comprador.';

  const prompt = `Sos un copywriter experto en e-commerce LATAM. Generás copy para una landing page de producto de Shopify.

MARCA: ${brandKit.name}
BRIEF DEL PRODUCTO: ${brief}
${bulletsContext}

Generá el copy completo para la landing. TODO en español. Tono: directo, humano, sin exagerar. Que NO parezca dropshipping genérico.

REGLAS DE TONO:
- Headlines cortos y seguros — no griten "OFERTA". Afirman.
- Bullets sutiles — beneficio real, no feature de AliExpress
- FAQ honesta — responde lo que realmente pregunta el comprador antes de comprar
- Specs del racional: concretas, sin inventar datos que no están en el brief
- CTA final: urgencia suave, no agresiva

Respondé SOLO con JSON válido:
{
  "headline": "máx 8 palabras, el hook principal de la página",
  "subheadline": "1 oración que amplía el headline, máx 15 palabras",
  "bullets": ["beneficio sutil 1", "beneficio sutil 2", "beneficio sutil 3"],
  "description": "descripción del producto en 3-4 oraciones. Primera oración: qué es. Segunda: para quién. Tercera: diferencia clave. Cuarta (opcional): llamado a la acción suave.",
  "rational_title": "título para la sección de specs/cómo funciona, máx 5 palabras",
  "specs": [
    {"icon": "✓", "title": "spec corta", "text": "explicación en 1 oración"},
    {"icon": "✓", "title": "spec corta", "text": "explicación en 1 oración"},
    {"icon": "✓", "title": "spec corta", "text": "explicación en 1 oración"},
    {"icon": "✓", "title": "spec corta", "text": "explicación en 1 oración"}
  ],
  "testimonial_rating": "texto de rating summary, ej: '★★★★★  +200 compradores satisfechos'",
  "faq": [
    {"q": "pregunta 1", "a": "respuesta honesta y corta"},
    {"q": "pregunta 2", "a": "respuesta honesta y corta"},
    {"q": "pregunta 3", "a": "respuesta honesta y corta"},
    {"q": "pregunta 4", "a": "respuesta honesta y corta"},
    {"q": "pregunta 5", "a": "respuesta honesta y corta"}
  ],
  "cta_headline": "headline del cierre, máx 7 palabras",
  "cta_subtext": "1 línea de garantía o urgencia suave",
  "whatsapp_text": "mensaje de WhatsApp pre-cargado para consultar, máx 20 palabras"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 1800,
    });

    const copy: LandingCopy = JSON.parse(response.choices[0].message.content || '{}');

    // If user already provided bullets, override AI bullets with theirs
    if (pdpBullets.length === 3) {
      copy.bullets = [pdpBullets[0], pdpBullets[1], pdpBullets[2]];
    }

    return NextResponse.json({ copy });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('401') || msg.includes('invalid_api_key'))
      return NextResponse.json({ error: 'API key de OpenAI inválida.' }, { status: 401 });
    return NextResponse.json({ error: 'Error al generar el copy. Intentá de nuevo.' }, { status: 500 });
  }
}
