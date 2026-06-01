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

  specs_title: string;
  specs: Array<{ key: string; value: string }>;
  badges: Array<{ icon: string; label: string }>;

  ingredients_title: string;
  ingredients: Array<{ icon: string; name: string; dose: string; description: string }>;

  timeline_title: string;
  timeline: Array<{ when: string; title: string; text: string }>;

  comparison_title: string;
  comparison_brand_col: string;
  comparison_alt_col: string;
  comparison: Array<{ label: string; brand_value: string; brand_check: boolean; alt_value: string; alt_check: boolean }>;

  rating_summary: string;
  reviews: Array<{ name: string; title: string; text: string }>;

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
    userReviews = [],
  }: {
    brief: string;
    brandKit: BrandKit;
    pdpBullets: string[];
    whatsappNumber: string;
    shippingText: string;
    userReviews: Array<{ name: string; quote: string }>;
  } = await req.json();

  const openai = new OpenAI({ apiKey: ctx.openaiApiKey });

  const bulletsContext = pdpBullets.length > 0
    ? `Los 3 bullets de beneficios ya definidos son:\n${pdpBullets.map((b, i) => `${i + 1}. ${b}`).join('\n')}\nÚsalos exactamente como están en el campo "bullets".`
    : 'Generá 3 bullets de beneficios sutiles — no vendedores, no técnicos. Afirmaciones naturales que conectan el producto con la vida del comprador.';

  const reviewsContext = userReviews.filter(r => r.name).length > 0
    ? `El cliente proporcionó estos testimonios reales. Úsalos en el campo "reviews" con un "title" que resuma el beneficio:\n${userReviews.filter(r => r.name).map(r => `- ${r.name}: "${r.quote}"`).join('\n')}`
    : 'Generá 3 reseñas realistas en primera persona. Nombres latinoamericanos, resultado específico, tono natural — no hiperbólico.';

  const prompt = `Sos un copywriter experto en e-commerce LATAM. Generás copy completo para una landing page de producto en Shopify.

MARCA: ${brandKit.name}
BRIEF DEL PRODUCTO: ${brief}
${bulletsContext}
${reviewsContext}

TODO en español. Tono: confiado, educativo, humano. Como una marca DTC premium (Four Sigmatic, Gymshark, Mejuri). NO parezca dropshipping genérico ni agresivo.

REGLAS:
- Todas las secciones se adaptan al TIPO de producto. Para ropa: materiales, fit, cuidado. Para tech: componentes, specs técnicas. Para suplementos: ingredientes, dosis. Para hogar: materiales, dimensiones, uso.
- "ingredients" = los componentes/ingredientes/materiales clave del producto — adaptá el nombre de la sección
- "timeline" = la experiencia del cliente a lo largo del tiempo — adaptá los "when" al producto
- "comparison" = esta marca vs la alternativa genérica — solo características donde gana esta marca
- FAQ honesta — responde objeciones reales de compra
- CTA: urgencia suave, no agresiva

Respondé SOLO con JSON válido, sin markdown:
{
  "headline": "máx 8 palabras, hook principal de la página",
  "subheadline": "1 oración que amplía el headline, máx 15 palabras",
  "bullets": ["beneficio 1", "beneficio 2", "beneficio 3"],
  "description": "3-4 oraciones: qué es, para quién, diferencia clave, CTA suave",
  "specs_title": "título sección especificaciones, máx 5 palabras",
  "specs": [
    {"key": "Etiqueta (Material / Peso / Tostado / etc)", "value": "Valor concreto"},
    {"key": "...", "value": "..."},
    {"key": "...", "value": "..."},
    {"key": "...", "value": "..."},
    {"key": "...", "value": "..."},
    {"key": "...", "value": "..."}
  ],
  "badges": [
    {"icon": "emoji", "label": "característica de calidad corta"},
    {"icon": "emoji", "label": "..."},
    {"icon": "emoji", "label": "..."},
    {"icon": "emoji", "label": "..."},
    {"icon": "emoji", "label": "..."}
  ],
  "ingredients_title": "título sección componentes — adaptado al producto (Ingredientes / Materiales / Componentes / Qué incluye)",
  "ingredients": [
    {"icon": "emoji", "name": "Nombre componente/ingrediente", "dose": "subtítulo corto (500mg / Orgánico / 100% algodón / etc)", "description": "1-2 oraciones explicando rol y beneficio"},
    {"icon": "emoji", "name": "...", "dose": "...", "description": "..."},
    {"icon": "emoji", "name": "...", "dose": "...", "description": "..."}
  ],
  "timeline_title": "título sección experiencia/resultados, máx 6 palabras",
  "timeline": [
    {"when": "cuándo (Inmediatamente / Día 1 / Primera semana)", "title": "qué pasa", "text": "1-2 oraciones descripción"},
    {"when": "...", "title": "...", "text": "..."},
    {"when": "...", "title": "...", "text": "..."}
  ],
  "comparison_title": "título sección comparativa, máx 6 palabras",
  "comparison_brand_col": "nombre corto columna marca",
  "comparison_alt_col": "nombre columna alternativa (La competencia / Otras opciones / etc)",
  "comparison": [
    {"label": "característica", "brand_value": "texto positivo marca", "brand_check": true, "alt_value": "texto alternativa", "alt_check": false},
    {"label": "...", "brand_value": "...", "brand_check": true, "alt_value": "...", "alt_check": false},
    {"label": "...", "brand_value": "...", "brand_check": true, "alt_value": "...", "alt_check": false},
    {"label": "...", "brand_value": "...", "brand_check": true, "alt_value": "...", "alt_check": false},
    {"label": "...", "brand_value": "...", "brand_check": true, "alt_value": "...", "alt_check": false}
  ],
  "rating_summary": "ej: '★★★★★  +500 clientes satisfechos'",
  "reviews": [
    {"name": "Nombre, Origen", "title": "título reseña", "text": "reseña natural en primera persona"},
    {"name": "...", "title": "...", "text": "..."},
    {"name": "...", "title": "...", "text": "..."}
  ],
  "faq": [
    {"q": "pregunta real de compra", "a": "respuesta honesta y corta"},
    {"q": "...", "a": "..."},
    {"q": "...", "a": "..."},
    {"q": "...", "a": "..."},
    {"q": "...", "a": "..."}
  ],
  "cta_headline": "headline del cierre, máx 7 palabras",
  "cta_subtext": "1 línea de garantía o urgencia suave",
  "whatsapp_text": "mensaje WhatsApp pre-cargado, máx 20 palabras"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 4000,
    });

    const copy: LandingCopy = JSON.parse(response.choices[0].message.content || '{}');

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
