import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { BrandKit } from '@/app/types';
import { buildBrandKitContext } from '@/app/lib/brandKitContext';
import { getUserContext } from '@/app/lib/get-user-context';
import { MessageAngle } from '../generate-testing-angles/route';

export const maxDuration = 300;

function getOpenAIErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes('401') || msg.includes('Incorrect API key') || msg.includes('invalid_api_key'))
    return 'API key de OpenAI inválida. Verificá la clave en tu perfil.';
  if (msg.includes('429') || msg.includes('rate limit') || msg.includes('rate_limit') || msg.includes('quota'))
    return 'Límite de uso de OpenAI alcanzado. Esperá unos minutos o revisá tu plan.';
  if (msg.includes('insufficient_quota'))
    return 'Sin crédito en tu cuenta de OpenAI. Recargá saldo en platform.openai.com.';
  return 'Error al conectar con OpenAI. Intentá de nuevo.';
}

const P_FORMATS = ['Aspiracional', 'Fundador', 'Editorial'];
const E_FORMATS = ['Testimonial', 'Beneficios', 'How-to'];
const C_FORMATS = ['Oferta/Precio', 'Prueba Social', 'Garantía'];

const STAGE_STYLES: Record<string, string> = {
  Aspiracional: 'Lifestyle imagery. Person embodying the aspirational identity the product enables. Natural, candid energy. The garment/product is the visual hero in context.',
  Fundador: 'Behind-the-scenes or authentic brand story. Warm, personal, slightly raw feel. Humanizes the brand. No over-produced look.',
  Editorial: 'High-fashion editorial photography aesthetic. Magazine-quality composition. Premium, minimal, aspirational. Clean or moody studio background.',
  Testimonial: 'Real-looking customer. Genuine, relatable expression. Quote or review text prominently featured. Trust-focused composition.',
  Beneficios: 'Product hero shot with benefit callouts. Clean, informative layout. Features labeled or visually highlighted.',
  'How-to': 'Step-by-step or process visual. Product shown in use. Educational, clear, sequential feel.',
  'Oferta/Precio': 'Product prominently featured with price/offer element. Bold, high-contrast. Urgency and value communicated visually.',
  'Prueba Social': 'Social proof focus. Star ratings, review count, or sales volume prominently displayed. Numbers and credibility markers.',
  'Garantía': 'Trust and confidence imagery. Quality, safety, and risk-reversal cues. Clean, reassuring, premium feel.',
};

interface PECPlan {
  p: { format: string; headline: string; subline: string; concept: string };
  e: { format: string; headline: string; subline: string; concept: string };
  c: { format: string; headline: string; subline: string; concept: string };
}

export async function POST(req: NextRequest) {
  const ctx = await getUserContext();
  if (!ctx) {
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode('data: {"error":"Configurá tu API key de OpenAI en el perfil."}\n\n'));
        c.close();
      },
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
  }

  const {
    brief = '',
    productDescription = '',
    personDescription = '',
    isFashionProduct = false,
    winningAngles,
    brandKit,
    productImageBase64 = '',
    referenceImages = [],
  }: {
    brief?: string;
    productDescription?: string;
    personDescription?: string;
    isFashionProduct?: boolean;
    winningAngles: MessageAngle[];
    brandKit: BrandKit;
    productImageBase64?: string;
    referenceImages?: string[];
  } = await req.json();

  const openai = new OpenAI({ apiKey: ctx.openaiApiKey });
  const brandKitContext = buildBrandKitContext(brandKit);

  const productDataUrl = productImageBase64
    ? (productImageBase64.startsWith('data:') ? productImageBase64 : `data:image/jpeg;base64,${productImageBase64}`)
    : '';

  const encoder = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController, data: object) =>
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const total = winningAngles.length * 3;
        send(controller, { total });

        await Promise.allSettled(
          winningAngles.map(async (angle) => {
            // Step 1: GPT-4o plans all 3 stages for this angle in one call
            let plan: PECPlan | null = null;
            const planPrompt = `Sos director creativo de performance marketing para e-commerce.

ÁNGULO GANADOR — este es el mensaje que conectó con la audiencia en el test:
- Nombre: "${angle.name}"
- Hook: "${angle.hook}"
- Énfasis del mensaje: "${angle.emphasis}"

Producto: ${productDescription || brief}
Marca: ${brandKit.name}${brandKit.clientRequest ? ` — ${brandKit.clientRequest}` : ''}

Tu tarea: adaptá ESTE MISMO ÁNGULO a las 3 etapas de consciencia del funnel (P/E/C).
El hook y el eje del mensaje NO CAMBIAN — lo que cambia es el FORMATO CREATIVO y el CONCEPTO VISUAL según dónde está el cliente en su decisión de compra.

PROSPECCIÓN (P) — Para quien no te conoce:
Elegí el formato: ${P_FORMATS.join(' / ')}
El concepto visual debe evocar la ASPIRACIÓN o el PROBLEMA que este ángulo resuelve. La marca aparece al final. NO vender directamente.

EVALUACIÓN (E) — Para quien ya te vio:
Elegí el formato: ${E_FORMATS.join(' / ')}
El concepto visual debe mostrar PRUEBA o PROCESO concreto del ángulo. El producto entra en foco.

CONVERSIÓN (C) — Para quien está listo para comprar:
Elegí el formato: ${C_FORMATS.join(' / ')}
El concepto visual debe cerrar la duda. Urgencia, garantía o prueba social. El producto es el héroe.

REGLAS:
- Los 3 conceptos deben verse VISUALMENTE DISTINTOS — composición, mood y elementos diferentes
- headline y subline deben reflejar el ángulo "${angle.name}" — no genéricos
- max 8 palabras cada uno, en español
- NO inventés precios, descuentos, métricas o garantías que no estén en el brief

Respondé SOLO con JSON válido:
{
  "p": { "format": "nombre del formato elegido", "headline": "titular directo del ángulo", "subline": "subtítulo corto", "concept": "descripción específica del concepto visual — composición, mood, elementos principales" },
  "e": { "format": "nombre del formato elegido", "headline": "titular directo del ángulo", "subline": "subtítulo corto", "concept": "descripción específica del concepto visual — composición, mood, elementos principales" },
  "c": { "format": "nombre del formato elegido", "headline": "titular directo del ángulo", "subline": "subtítulo corto", "concept": "descripción específica del concepto visual — composición, mood, elementos principales" }
}`;

            const runPlan = async () => {
              const res = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: planPrompt }],
                response_format: { type: 'json_object' },
                max_tokens: 800,
                temperature: 0.7,
              });
              return JSON.parse(res.choices[0].message.content || '{}') as PECPlan;
            };

            try {
              plan = await runPlan();
              // Retry once if plan is missing required keys
              if (!plan?.p || !plan?.e || !plan?.c) {
                console.warn(`pec-creatives plan incomplete for "${angle.name}" — retrying`);
                plan = await runPlan();
              }
            } catch (err) {
              console.error(`pec-creatives plan failed for angle "${angle.name}":`, err);
              send(controller, { angleError: angle.key });
              return;
            }

            if (!plan?.p || !plan?.e || !plan?.c) {
              send(controller, { angleError: angle.key });
              return;
            }

            // Step 2: generate one image per stage (P, E, C) in parallel
            const stages: Array<{ key: 'p' | 'e' | 'c'; label: string; stageCode: 'P' | 'E' | 'C' }> = [
              { key: 'p', label: 'Prospección', stageCode: 'P' },
              { key: 'e', label: 'Evaluación', stageCode: 'E' },
              { key: 'c', label: 'Conversión', stageCode: 'C' },
            ];

            await Promise.allSettled(
              stages.map(async ({ key, label, stageCode }) => {
                const stagePlan = plan![key];
                const styleNote = STAGE_STYLES[stagePlan.format] || '';

                const personPart = (isFashionProduct && personDescription)
                  ? `PERSONA: ${personDescription}. La persona lleva puesto exactamente el producto.`
                  : '';

                const productConstraint = productDataUrl
                  ? [
                      'Las imágenes adjuntas son la FUENTE PRIMARIA DE VERDAD VISUAL — tomá color, forma, textura y proporciones directamente de los píxeles, no los interpretes.',
                      productDescription ? `Descripción técnica de respaldo: ${productDescription}` : '',
                      'REGLAS DE COLOR — CRÍTICO: color idéntico al de la foto de referencia. NO aclarar, NO oscurecer, NO desaturar, NO cambiar temperatura.',
                      'Para neutros cálidos (beige, arena, tostado, camel, crudo, khaki): NUNCA renderices como blanco ni gris claro.',
                      'Para colores oscuros (negro, azul marino, marrón): NUNCA los ilumines.',
                      isFashionProduct ? 'PANTALONES Y PRENDAS INFERIORES — DOBLE ATENCIÓN: si la prenda es un pantalón, prestá máxima atención al color. Telas lisas (twill, gabardina, cotton chino): superficie uniforme y suave, sin texturas artificiales ni arrugas exageradas. Replicá largo, ancho de pierna y tiro tal cual se ven en la referencia.' : '',
                    ].filter(Boolean).join(' ')
                  : `PRODUCT: ${productDescription}.`;

                const imagePrompt = [
                  `THIS CREATIVE IS EXCLUSIVELY FOR ANGLE: "${angle.name}" — Hook: "${angle.hook}" — Emphasis: "${angle.emphasis}". Every visual element must reflect THIS specific angle's message. Do NOT mix with other angles.`,
                  productConstraint,
                  `CREATIVE FORMAT — ${stagePlan.format}: ${styleNote}`,
                  `FUNNEL STAGE: ${label}. ${stagePlan.concept}`,
                  `HEADLINE (display this exact text, large and bold): "${stagePlan.headline}"`,
                  `SUBLINE: "${stagePlan.subline}"`,
                  personPart,
                  `Brand: ${brandKit.name}. Colors: ${brandKit.primary1}, ${brandKit.primary2}, ${brandKit.primary3}. Typography: ${brandKit.typography || 'bold sans-serif'}.`,
                  `Brand context: ${brandKitContext}`,
                  'MOBILE-FIRST TEXT RULE: keep text minimal and large enough to read on a phone screen. Avoid dense paragraphs or excessive copy. For formats like Beneficios or How-to, short bullet points are fine — but never more text than what fits comfortably without squinting on mobile.',
                  'Portrait 1024x1536. ALL text in Spanish. Professional agency quality.',
                  'ANTI-HALLUCINATION: Do NOT invent prices, discounts, metrics, phone numbers, URLs, or statistics not in the brief.',
                  'Do NOT include button-style CTAs in the image.',
                ].filter(Boolean).join(' ');

                const inputImages = [
                  ...(productDataUrl ? [productDataUrl] : []),
                  ...(isFashionProduct && referenceImages.length > 0
                    ? referenceImages.slice(0, 2).map(img => img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`)
                    : []),
                ];

                const inputContent = [
                  ...inputImages.map(url => ({ type: 'input_image', image_url: url, detail: 'high' })),
                  { type: 'input_text', text: imagePrompt },
                ];

                let base64 = '';

                for (let attempt = 1; attempt <= 2; attempt++) {
                  try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const response = await (openai.responses.create as any)({
                      model: 'gpt-image-2',
                      input: [{ role: 'user', content: inputContent }],
                      tools: [{
                        type: 'image_generation',
                        model: 'gpt-image-2',
                        quality: 'medium',
                        size: '1024x1536',
                      }],
                    });
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    for (const block of (response.output || [])) {
                      if (block.type === 'image_generation_call' && block.result) {
                        base64 = block.result;
                        break;
                      }
                    }
                    if (base64) break;
                  } catch (err) {
                    console.error(`pec-creatives "${angle.name}" stage ${stageCode} attempt ${attempt} failed:`, err);
                    if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
                  }
                }

                if (!base64) {
                  try {
                    const fallback = await openai.images.generate({
                      model: 'gpt-image-2',
                      prompt: `${label} ad for ${brandKit.name}. ${productDescription.slice(0, 200)}. Format: ${stagePlan.format}. Headline: "${stagePlan.headline}". Colors: ${brandKit.primary1}. Portrait. Spanish text only.`,
                      size: '1024x1536',
                      quality: 'low',
                      n: 1,
                    });
                    base64 = fallback.data?.[0]?.b64_json || '';
                  } catch (err) {
                    console.error(`pec-creatives "${angle.name}" stage ${stageCode} fallback failed:`, err);
                  }
                }

                if (base64) {
                  send(controller, {
                    creative: {
                      id: Math.random().toString(36).slice(2),
                      angleKey: angle.key,
                      angleName: angle.name,
                      hook: angle.hook,
                      stage: stageCode,
                      stageLabel: label,
                      formatName: stagePlan.format,
                      headline: stagePlan.headline,
                      subline: stagePlan.subline,
                      base64,
                    },
                  });
                } else {
                  send(controller, { creativeError: { angleKey: angle.key, stage: stageCode } });
                }
              })
            );
          })
        );

      } catch (err) {
        send(controller, { error: getOpenAIErrorMessage(err) });
      } finally {
        send(controller, { done: true });
        if (controller.desiredSize !== null) {
          try { controller.close(); } catch { /* already closed */ }
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
