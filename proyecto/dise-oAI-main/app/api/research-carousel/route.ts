import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { BrandKit } from '@/app/types';
import { buildBrandKitContext } from '@/app/lib/brandKitContext';
import { getUserContext } from '@/app/lib/get-user-context';

export const maxDuration = 60;

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

export async function POST(req: NextRequest) {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Configurá tu API key de OpenAI en el perfil.' }, { status: 401 });

  const { brandKit, topicHint = '', excludeTopics = [], productImages = [] }: {
    brandKit: BrandKit;
    topicHint?: string;
    excludeTopics?: string[];
    productImages?: string[];
  } = await req.json();

  const openai = new OpenAI({ apiKey: ctx.openaiApiKey });
  const brandKitContext = buildBrandKitContext(brandKit);

  const hasProduct = productImages.length > 0;
  const productDataUrl = hasProduct
    ? (productImages[0].startsWith('data:') ? productImages[0] : `data:image/jpeg;base64,${productImages[0]}`)
    : '';

  const excludeSection = excludeTopics.length > 0
    ? `TEMAS YA GENERADOS — NO repetir ni temas similares:\n${excludeTopics.map(t => `- ${t}`).join('\n')}\n\n`
    : '';

  const prompt = `Sos un estratega de contenido para e-commerce en redes sociales.
Generá exactamente 9 ideas de carruseles de Instagram para esta marca, 3 por cada etapa del funnel.
${hasProduct ? `
PRODUCTO ESPECÍFICO — PRIORITARIO: Se adjunta imagen del producto. Generá los 9 temas en torno a ESTE PRODUCTO ESPECÍFICO. La marca es el contexto de estilo; el producto es el eje de todos los temas.
` : ''}${topicHint ? `
TEMA PRINCIPAL — PRIORITARIO: "${topicHint}"
TODAS las ideas deben girar en torno a este tema. El brand kit da el contexto de marca, pero el tema del usuario es la restricción principal.
` : ''}
MARCA:
${brandKitContext}

${excludeSection}REGLAS:
- Exactamente 3 ideas TOFU + 3 MOFU + 3 BOFU = 9 en total
- Adaptadas al nicho específico de la marca, no genéricas${topicHint ? `\n- OBLIGATORIO: todas las ideas deben desarrollar el tema "${topicHint}" desde distintos ángulos del funnel` : ''}
- TOFU (Prospección): educativo, entretenimiento o awareness — sin vender directamente, para personas que no conocen la marca
- MOFU (Evaluación): el producto/servicio entra en consideración — how-to, comparativas, spotlights, para quien ya te vio
- BOFU (Conversión): cerrar la venta — prueba social, objeciones resueltas, urgencia, para quien está listo para comprar
- PROHIBIDO inventar precios, métricas, descuentos o resultados específicos
- Títulos concretos y atractivos, que generen curiosidad o urgencia en el target

Respondé SOLO con JSON válido:
{
  "topics": [
    { "funnel": "TOFU", "title": "...", "hook": "...", "why": "..." },
    { "funnel": "TOFU", "title": "...", "hook": "...", "why": "..." },
    { "funnel": "TOFU", "title": "...", "hook": "...", "why": "..." },
    { "funnel": "MOFU", "title": "...", "hook": "...", "why": "..." },
    { "funnel": "MOFU", "title": "...", "hook": "...", "why": "..." },
    { "funnel": "MOFU", "title": "...", "hook": "...", "why": "..." },
    { "funnel": "BOFU", "title": "...", "hook": "...", "why": "..." },
    { "funnel": "BOFU", "title": "...", "hook": "...", "why": "..." },
    { "funnel": "BOFU", "title": "...", "hook": "...", "why": "..." }
  ]
}
Donde: funnel = "TOFU"|"MOFU"|"BOFU", title = nombre del carousel (max 6 palabras), hook = frase de apertura del primer slide que detenga el scroll (max 8 palabras), why = por qué este contenido funciona para este negocio (1 oración corta).`;

  try {
    const userContent: Parameters<typeof openai.chat.completions.create>[0]['messages'][0]['content'] = hasProduct && productDataUrl
      ? [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: productDataUrl, detail: 'low' as const } },
        ]
      : prompt;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: userContent }],
      response_format: { type: 'json_object' },
      max_tokens: 1200,
      temperature: 0.8,
    });
    const data = JSON.parse(response.choices[0].message.content || '{}');
    return NextResponse.json({ topics: data.topics || [] });
  } catch (e) {
    return NextResponse.json({ error: getOpenAIErrorMessage(e) }, { status: 500 });
  }
}
