import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { BrandKit } from '@/app/types';
import { buildBrandKitContext } from '@/app/lib/brandKitContext';
import { getUserContext } from '@/app/lib/get-user-context';
import { MessageAngle } from '../generate-testing-angles/route';

export const maxDuration = 300;

function getOpenAIErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes('401') || msg.includes('invalid_api_key'))
    return 'API key de OpenAI inválida. Verificá la clave en tu perfil.';
  if (msg.includes('429') || msg.includes('quota') || msg.includes('rate_limit'))
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

Tenés el siguiente ángulo de mensaje ganador de Paso 1:
- Nombre del ángulo: "${angle.name}"
- Hook (ganador de atención): "${angle.hook}"
- Énfasis: "${angle.emphasis}"

Producto: ${productDescription || brief}
Marca: ${brandKit.name}${brandKit.clientRequest ? ` — ${brandKit.clientRequest}` : ''}

Creá el brief creativo para escalar este ángulo en las 3 etapas del funnel PEC.

Para PROSPECCIÓN (P): elegí el formato más adecuado de: ${P_FORMATS.join(' / ')}
Para EVALUACIÓN (E): elegí el formato más adecuado de: ${E_FORMATS.join(' / ')}
Para CONVERSIÓN (C): elegí el formato más adecuado de: ${C_FORMATS.join(' / ')}

Reglas:
- Cada etapa mantiene el MISMO ángulo de mensaje pero adapta el formato al momento del funnel
- headlines y sublines en español, max 8 palabras cada uno
- concept describe SOLO la composición visual y estilo (no el copy)
- NO inventés precios, descuentos, métricas o garantías no mencionados

Respondé SOLO con JSON válido:
{
  "p": { "format": "nombre del formato elegido", "headline": "titular para la imagen", "subline": "subtitulo corto", "concept": "descripción del concepto visual" },
  "e": { "format": "nombre del formato elegido", "headline": "titular para la imagen", "subline": "subtitulo corto", "concept": "descripción del concepto visual" },
  "c": { "format": "nombre del formato elegido", "headline": "titular para la imagen", "subline": "subtitulo corto", "concept": "descripción del concepto visual" }
}`;

            try {
              const planRes = await openai.chat.completions.create({
                model: 'gpt-4o',
                messages: [{ role: 'user', content: planPrompt }],
                response_format: { type: 'json_object' },
                max_tokens: 600,
                temperature: 0.8,
              });
              plan = JSON.parse(planRes.choices[0].message.content || '{}') as PECPlan;
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
                  ? `THE REFERENCE PHOTO SHOWS THE EXACT PRODUCT — reproduce with zero modifications: same color, shape, texture, proportions. Product description for reference: ${productDescription}`
                  : `PRODUCT: ${productDescription}.`;

                const imagePrompt = [
                  productConstraint,
                  `CREATIVE FORMAT — ${stagePlan.format}: ${styleNote}`,
                  `FUNNEL STAGE: ${label}. ${stagePlan.concept}`,
                  `HEADLINE (display this exact text, large and bold): "${stagePlan.headline}"`,
                  `SUBLINE: "${stagePlan.subline}"`,
                  personPart,
                  `Brand: ${brandKit.name}. Colors: ${brandKit.primary1}, ${brandKit.primary2}, ${brandKit.primary3}. Typography: ${brandKit.typography || 'bold sans-serif'}.`,
                  isFashionProduct
                    ? 'COLOR ACCURACY CRITICAL: replicate exact garment color from reference — no shifting, lightening, desaturation. Warm neutrals: never render as white or gray.'
                    : 'COLOR ACCURACY CRITICAL: reproduce product color exactly.',
                  `Brand context: ${brandKitContext}`,
                  'Portrait 1024x1536. ALL text in Spanish. Professional agency quality.',
                  'ANTI-HALLUCINATION: Do NOT invent prices, discounts, metrics, phone numbers, URLs, or statistics not in the brief.',
                  'Do NOT include button-style CTAs in the image.',
                ].filter(Boolean).join(' ');

                const inputImages = [
                  ...(productDataUrl ? [productDataUrl] : []),
                  ...(isFashionProduct && referenceImages.length > 0
                    ? referenceImages.slice(0, 1).map(img => img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`)
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
                      model: 'gpt-4o',
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

        send(controller, { done: true });
      } catch (err) {
        send(controller, { error: getOpenAIErrorMessage(err) });
      } finally {
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
