import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { BrandKit } from '@/app/types';
import { buildBrandKitContext } from '@/app/lib/brandKitContext';
import { getUserContext } from '@/app/lib/get-user-context';

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

function isRefusal(text: string): boolean {
  if (!text || text.length < 30) return true;
  const lower = text.toLowerCase();
  return (
    lower.includes("i'm sorry") || lower.includes("i cannot") || lower.includes("i can't") ||
    lower.includes("lo siento") || lower.includes("no puedo") || lower.includes("no es posible")
  );
}

export interface CreativeAngle {
  key: string;
  label: string;
  stage: string;
  stageKey: 'prospeccion' | 'evaluacion' | 'conversion';
  instructions: string;
}

export const CREATIVE_ANGLES: CreativeAngle[] = [
  {
    key: 'aspiracional',
    label: 'Aspiracional',
    stage: 'Prospección',
    stageKey: 'prospeccion',
    instructions: `CREATIVE TYPE — ASPIRACIONAL: Sell the FEELING and desired identity, NOT the product features. The product exists naturally in an aspirational lifestyle context. ONE short powerful tagline in large bold text (max 6 words). Editorial or lifestyle look, high-end feel. No bullet lists, no feature callouts — pure emotion and aspiration.`,
  },
  {
    key: 'prensa',
    label: 'Prensa / Editorial',
    stage: 'Prospección',
    stageKey: 'prospeccion',
    instructions: `CREATIVE TYPE — PRENSA / EDITORIAL: Simulate a press article or editorial recommendation format. Bold newspaper or magazine-style headline in Spanish (e.g. "El producto que todos están eligiendo" or a specific claim about the brand). Short excerpt text below the headline like a pull quote or opening paragraph. Product placed prominently as an editorial photo. This format stops the scroll because it looks different from typical ads — unexpected and credible.`,
  },
  {
    key: 'beneficios',
    label: 'Foco en Beneficios',
    stage: 'Evaluación',
    stageKey: 'evaluacion',
    instructions: `CREATIVE TYPE — FOCO EN BENEFICIOS: Rational appeal for the buyer who needs to justify the purchase. Product centered or on one side. Exactly 3 key benefit callouts with icons and bold Spanish text — each benefit max 5 words. Clean, scannable layout. Designed so the rational buyer can quickly process the top 3 reasons to buy. No lifestyle imagery — product and copy are the stars.`,
  },
  {
    key: 'demostracion',
    label: 'Demostración',
    stage: 'Evaluación',
    stageKey: 'evaluacion',
    instructions: `CREATIVE TYPE — DEMOSTRACIÓN: Show the product in realistic use context — how it works, the experience of using it, the result it delivers. MINIMUM RISK RULE: product shown in its original recognizable form only — never consumed, applied to skin, or in an ambiguous state. One short benefit headline in Spanish. Authentic real-life feel that reduces purchase uncertainty by showing the product working.`,
  },
  {
    key: 'testimonial',
    label: 'Testimonial',
    stage: 'Evaluación / Conversión',
    stageKey: 'conversion',
    instructions: `CREATIVE TYPE — TESTIMONIAL / PRUEBA SOCIAL: Large customer quote in quotation marks fills most of the frame. Product image smaller on one side. Customer name (first name + last initial) and 5-star rating (★★★★★) below the quote. The quote must feel authentic and specific — NOT generic praise like "Me encantó" but something that mentions a concrete result or specific detail. Warm, trustworthy, social-proof design.`,
  },
  {
    key: 'comparativa',
    label: 'Pantalla Dividida',
    stage: 'Evaluación / Conversión',
    stageKey: 'conversion',
    instructions: `CREATIVE TYPE — PANTALLA DIVIDIDA / COMPARATIVA: Two equal visual zones showing a clear contrast. Left zone = situation WITHOUT this product (generic alternative, neutral context, the "before"). Right zone = WITH this product (the better solution, the "after"). Bold text labels mark each side (e.g. "Sin / Con", "Antes / Ahora", "Opción Genérica / [Brand]"). Short copy below or centered reinforcing the choice. NO physical body transformations. NO negative emotional states. The contrast must be about the PRODUCT, not about how someone looks.`,
  },
];

const PRODUCT_DESCRIPTION_PROMPT = `Sos un experto en descripción de productos para generación de imágenes IA. Analizá este producto y describilo con precisión máxima. La persona que lea tu descripción no puede ver la foto — tu texto es el único recurso.

PRIMERO determiná si el producto tiene packaging/envase (suplemento, cosmético, alimento, bebida, limpieza, etc.) o si es un producto sin packaging (electrónico, joyería, calzado, mueble, decoración, accesorio, prenda de ropa, etc.).

Para PRODUCTOS CON PACKAGING / ENVASE:
1. TIPO DE PRODUCTO: nombre exacto, categoría, variante o sabor visible
2. FORMATO / PRESENTACIÓN: tipo de envase (pote, bolsa, botella, caja, tubo), tamaño relativo
3. COLORES DEL ENVASE — CRÍTICO: color exacto del cuerpo y del diseño/etiqueta. Para colores oscuros, aclará que NO debe renderizarse más claro.
4. DISEÑO GRÁFICO DEL PACKAGING: estilo tipográfico, elementos visuales principales
5. TEXTO CLAVE VISIBLE: nombre del producto, sabor/variante si aplica, claims visibles
6. ELEMENTOS ÚNICOS: forma de la tapa, textura, detalles que distinguen este packaging

Para PRODUCTOS SIN PACKAGING (prenda, electrónico, joyería, calzado, decoración, etc.):
1. TIPO DE PRODUCTO: nombre exacto, categoría, función principal
2. FORMA Y DIMENSIONES: silueta general, proporciones
3. COLORES — CRÍTICO: color exacto de cada componente. Para colores oscuros, aclará que NO debe renderizarse más claro.
4. MATERIALES Y ACABADOS: metales, telas, plásticos, madera, cuero, vidrio y su acabado
5. DETALLES CONSTRUCTIVOS: botones, costuras, cierres, herrajes, terminaciones, etc.
6. ELEMENTOS ÚNICOS: lo que diferencia este producto de uno genérico

CRÍTICO: NO menciones ninguna marca ni logo de terceros. Solo describí el producto en sí.`;

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
    brandKit,
    productImage = '',
    count = 6,
  }: {
    brief?: string;
    brandKit: BrandKit;
    productImage?: string;
    count?: number;
  } = await req.json();

  const openai = new OpenAI({ apiKey: ctx.openaiApiKey });
  const brandKitContext = buildBrandKitContext(brandKit);
  const targetCount = Math.max(1, Math.min(count, 6));
  const angles = CREATIVE_ANGLES.slice(0, targetCount);

  const productDataUrl = productImage
    ? (productImage.startsWith('data:') ? productImage : `data:image/jpeg;base64,${productImage}`)
    : '';

  // Describe the product with vision for consistent reproduction across angles
  let productDescription = brief;
  if (productDataUrl && productDataUrl.length > 100) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const descResponse = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: PRODUCT_DESCRIPTION_PROMPT },
              { type: 'image_url', image_url: { url: productDataUrl, detail: 'high' } },
            ],
          }],
          max_tokens: 700,
        });
        const desc = descResponse.choices[0].message.content || '';
        if (!isRefusal(desc)) { productDescription = desc; break; }
      } catch (err) {
        console.error(`testing-angles describe attempt ${attempt + 1}:`, err);
      }
    }
  }

  const encoder = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController, data: object) =>
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

  const stream = new ReadableStream({
    async start(controller) {
      try {
        await Promise.allSettled(
          angles.map(async (angle) => {
            const fullPrompt = [
              productDataUrl
                ? `THE REFERENCE PHOTO SHOWS THE EXACT PRODUCT — reproduce it with zero modifications: same shape, same color, same packaging, same proportions.${productDescription ? ` Description: ${productDescription}` : ''}`
                : `PRODUCT TO FEATURE: ${productDescription}.`,
              angle.instructions,
              `Brand: ${brandKit.name}. BRAND DESIGN CONTEXT:\n${brandKitContext}`,
              `Brand colors (use ONLY for backgrounds, text overlays, graphic elements — NEVER on the product itself): ${brandKit.primary1}, ${brandKit.primary2}, ${brandKit.primary3}.`,
              `Typography: ${brandKit.typography || 'bold sans-serif'}.`,
              brief ? `Additional brief context: ${brief}` : '',
              'Portrait 1024x1536 format. Premium agency-quality advertising creative.',
              'ALL text in the image must be in SPANISH — no exceptions except brand/product names.',
              'ANTI-HALLUCINATION: Do NOT invent or add any data not in the brief — no phone numbers, URLs, social handles, QR codes, star ratings, customer counts, certifications, ingredient claims, deadlines, discounts, or statistics. Use only what is explicitly provided.',
              'Do NOT include button-style CTAs in the image (Shop Now, Comprar, etc.) — those go in the ad platform.',
              'COLOR ACCURACY CRITICAL: reproduce the product color exactly from the reference photo — do NOT shift, lighten, darken, or desaturate.',
            ].filter(Boolean).join(' ');

            let base64 = '';

            // Primary: Responses API with product photo as input image
            const inputContent = [
              ...(productDataUrl && productDataUrl.length > 100
                ? [{ type: 'input_image', image_url: productDataUrl, detail: 'high' }]
                : []),
              { type: 'input_text', text: fullPrompt },
            ];

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
                console.warn(`testing-angles "${angle.label}" attempt ${attempt}: no image block`);
              } catch (err) {
                console.error(`testing-angles "${angle.label}" attempt ${attempt} failed:`, err);
                if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
              }
            }

            // Fallback: images.generate from prompt only
            if (!base64) {
              try {
                const fallbackPrompt = [
                  productDescription ? `Advertising creative featuring: ${productDescription.slice(0, 300)}.` : '',
                  angle.instructions,
                  `Brand: ${brandKit.name}. Colors: ${brandKit.primary1}, ${brandKit.primary2}.`,
                  'Portrait format. All Spanish text. Professional quality.',
                ].filter(Boolean).join(' ');
                const result = await openai.images.generate({
                  model: 'gpt-image-2',
                  prompt: fallbackPrompt,
                  size: '1024x1536',
                  quality: 'low',
                  n: 1,
                });
                base64 = result.data?.[0]?.b64_json || '';
              } catch (err) {
                console.error(`testing-angles "${angle.label}" fallback failed:`, err);
              }
            }

            if (base64) {
              send(controller, {
                image: {
                  id: Math.random().toString(36).slice(2),
                  base64,
                  angleKey: angle.key,
                  angleLabel: angle.label,
                  stage: angle.stage,
                  stageKey: angle.stageKey,
                },
              });
            } else {
              send(controller, { angleError: angle.key });
            }
          })
        );
      } catch (err) {
        send(controller, { error: getOpenAIErrorMessage(err) });
      } finally {
        send(controller, { done: true });
        controller.close();
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
