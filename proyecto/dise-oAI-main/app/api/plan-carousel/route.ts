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

type FunnelStage = 'TOFU' | 'MOFU' | 'BOFU';

export interface CarouselSlide {
  index: number;
  role: 'hook' | 'value' | 'cta';
  title?: string;
  subtitle?: string | null;
  items?: string[];
  cta?: string;
  image_direction: string;
}

export async function POST(req: NextRequest) {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Configurá tu API key de OpenAI en el perfil.' }, { status: 401 });

  const { brandKit, title, hook, funnel, productImages = [] }: {
    brandKit: BrandKit;
    title: string;
    hook: string;
    funnel: FunnelStage;
    productImages?: string[];
  } = await req.json();

  const openai = new OpenAI({ apiKey: ctx.openaiApiKey });
  const brandKitContext = buildBrandKitContext(brandKit);
  const hasProduct = productImages.length > 0;

  const antiHallucinationRule = 'PROHIBIDO INVENTAR — REGLA ABSOLUTA para todas las etapas: NO agregar ningún dato que no esté explícitamente en el brief o brand kit: teléfonos, URLs, redes sociales (@handles), QR codes, ratings ("4.8/5"), reseñas, número de clientes, certificaciones, claims de ingredientes o materiales, fechas límite, descuentos, mecánicas promocionales, premios o cualquier estadística. Solo datos del brief.';

  const claimRule = funnel === 'BOFU'
    ? `BOFU — PROHIBICIÓN ESTRICTA: no inventar precios, métricas, porcentajes, descuentos, resultados numéricos ni testimonios. Solo usar datos presentes en el brand kit o en el título del carousel. ${antiHallucinationRule}`
    : funnel === 'MOFU'
    ? `MOFU — usar solo datos del brand kit. No inventar specs técnicas ni comparativas sin base en la información de la marca. ${antiHallucinationRule}`
    : `TOFU — contenido educativo genérico del nicho. No mencionar el producto directamente. Solo conocimiento general. ${antiHallucinationRule}`;

  const prompt = `Sos un copywriter y director creativo para Instagram.

Planificá un carrusel de EXACTAMENTE 3 slides para esta marca Y el copy del post que lo acompaña.
${hasProduct ? `
PRODUCTO ESPECÍFICO: Se adjunta imagen del producto. El copy de los slides debe hablar de ESTE PRODUCTO en particular, no de la marca en general. Usá la imagen para entender qué es el producto y adaptá el contenido.
` : ''}
MARCA:
${brandKitContext}

TEMA: ${title}
HOOK: ${hook}
ETAPA DEL FUNNEL: ${funnel}
REGLA DE CLAIMS: ${claimRule}

ESTILO VISUAL UNIFICADO — definilo UNA SOLA VEZ antes de las slides:
Las 3 slides deben verse como parte de una misma serie diseñada por un solo director creativo. Decidí: un color de fondo dominante (de la paleta de la marca), un mood tipográfico (bold/clean/editorial), y un tratamiento visual general (minimalista, dinámico, fotográfico, etc.). Ese estilo se aplica IGUAL en las 3 slides. Solo varía la composición de contenido, nunca el estilo.

ESTRUCTURA DE SLIDES — seguila exactamente:

Slide 1 (HOOK): detiene el scroll generando curiosidad o tensión real.
- title: máximo 8 palabras. Debe ser una pregunta incómoda, afirmación contraintuitiva, o promesa específica — NO frases motivacionales genéricas. Usá el hook provisto como base pero asegurate que genere verdadera curiosidad.
- subtitle: máximo 6 palabras que añadan tensión o especificidad al hook. Puede ser null.
- image_direction: instrucción en inglés para el generador. DEBE comenzar con el estilo visual unificado definido arriba, luego especificar solo la variación de esta slide. Ejemplo: "Dark red background, bold white typography — Slide 1: large centered headline, minimal elements."

Slide 2 (VALOR): RESUELVE la promesa o tensión planteada en el hook. Los 3 items deben sentirse como el desarrollo lógico de lo que el hook prometió — no son frases aisladas, son la respuesta directa a la tensión generada. Narrative continuity: el lector debe sentir que el slide 2 cumple lo que el slide 1 prometió.
- items: exactamente 3 puntos. Máximo 6 palabras cada uno. Deben responder o desarrollar el hook — si el hook preguntó algo, estos items responden. Si el hook planteó un problema, estos son la solución concreta.
- image_direction: MISMO estilo base que slide 1, solo varía la composición. Ejemplo: "Dark red background, bold white typography — Slide 2: structured list layout with icons or numbers."

Slide 3 (CIERRE): cierra el arco narrativo — conecta el tema con la marca de forma natural, sin CTA explícito.
- title: máximo 8 palabras, frase de cierre que retoma el tema del hook y lo conecta con la marca o producto
- image_direction: MISMO estilo base que slides 1 y 2. Ejemplo: "Dark red background, bold white typography — Slide 3: centered brand closing, clean and premium."

COPY DEL POST DE INSTAGRAM:
- caption: texto que acompaña el carrusel en el feed. Tono conversacional, primera línea gancho para que expandan. 2-3 párrafos cortos. Emojis estratégicos. En español. Adaptado a la etapa del funnel: TOFU=educativo sin vender, MOFU=comparativo/beneficios, BOFU=urgencia/prueba social. NO inventar precios, métricas ni descuentos que no estén en el brand kit.
- hashtags: string con 12-15 hashtags relevantes al nicho y tema. Mezcla de alcance alto, medio y nicho. Sin el símbolo # en cada uno — solo las palabras separadas por espacios.

Respondé SOLO con JSON válido:
{
  "slides": [
    { "index": 1, "role": "hook", "title": "...", "subtitle": "..." | null, "image_direction": "..." },
    { "index": 2, "role": "value", "items": ["...", "...", "..."], "image_direction": "..." },
    { "index": 3, "role": "cta", "title": "...", "image_direction": "..." }
  ],
  "post_copy": {
    "caption": "...",
    "hashtags": "..."
  }
}`;

  try {
    const userContent: Parameters<typeof openai.chat.completions.create>[0]['messages'][0]['content'] = hasProduct
      ? [
          { type: 'text', text: prompt },
          ...productImages.slice(0, 1).map(img => ({
            type: 'image_url' as const,
            image_url: { url: img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`, detail: 'low' as const },
          })),
        ]
      : prompt;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: userContent }],
      response_format: { type: 'json_object' },
      max_tokens: 1200,
    });
    const data = JSON.parse(response.choices[0].message.content || '{}');
    return NextResponse.json({
      slides: (data.slides || []) as CarouselSlide[],
      post_copy: data.post_copy || null,
    });
  } catch (e) {
    return NextResponse.json({ error: getOpenAIErrorMessage(e) }, { status: 500 });
  }
}
