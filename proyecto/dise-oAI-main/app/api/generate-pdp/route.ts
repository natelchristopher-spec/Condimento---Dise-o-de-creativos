import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import type { ChatCompletionContentPart } from 'openai/resources/chat/completions';
import { BrandKit } from '@/app/types';
import { buildBrandKitContext } from '@/app/api/brandKitContext';
import { getUserContext } from '@/app/lib/get-user-context';

export const maxDuration = 300;

type PeopleMode = 'none' | 'real';

interface PdpImageItem {
  type: string;
  label: string;
  image_prompt: string;
}

const PDP_TYPES = [
  { type: 'hero',        label: 'Product Hero' },
  { type: 'benefit',     label: 'Benefit Image' },
  { type: 'lifestyle',   label: 'Lifestyle Image' },
  { type: 'authority',   label: 'Authority Image' },
  { type: 'howto',       label: 'How to Use' },
  { type: 'testimonial', label: 'Testimonial' },
] as const;

function isRefusal(text: string): boolean {
  if (!text || text.length < 30) return true;
  const lower = text.toLowerCase();
  return (
    lower.includes("i'm sorry") || lower.includes("i cannot") || lower.includes("i can't") ||
    lower.includes("cannot assist") || lower.includes("can't assist") ||
    lower.includes("lo siento") || lower.includes("no puedo ayudar") || lower.includes("no puedo asistir") ||
    lower.includes("no es posible") || lower.includes("lamentablemente no")
  );
}

// Same detailed prompt as generate-concepts — critical for color/texture fidelity
const PRODUCT_DESCRIPTION_PROMPT = `Sos un técnico de producto de moda de alta gama. Analizá este producto y describilo con precisión quirúrgica para que pueda ser reproducido EXACTAMENTE por un modelo de IA generativa. Imaginá que quien lee tu descripción no puede ver la foto — tu texto es el único recurso.

Describí en este orden exacto:

1. TIPO DE PRODUCTO: categoría exacta, silueta y corte, largo o dimensiones
2. COLOR BASE — ES LO MÁS CRÍTICO: describí el color con máxima precisión. NO uses solo el nombre del color. Usá referencias concretas: tono exacto (ej: "beige arena cálido, similar al tono de la arena seca — NO es blanco, NO es gris, tiene un subtono cálido visible"). Describí su saturación (¿vivo o apagado?), temperatura (¿frío o cálido?) y cómo se ve bajo la luz. Para neutros cálidos (beige, arena, tostado, crudo, khaki), aclará explícitamente que NO debe renderizarse como blanco ni gris.
3. ESTAMPADO / PRINT: describí cada elemento gráfico. Si es color sólido, indicar "color sólido uniforme".
4. MATERIALES Y TEXTURA: acabado (mate/satinado/brillante), tejido visible, peso visual
5. DETALLES DE CONFECCIÓN: corte, bolsillos, cierre, terminaciones, cualquier detalle funcional
6. ELEMENTOS ÚNICOS: lo que diferencia este producto de uno genérico

CRÍTICO: NO menciones ninguna marca, logo ni texto de terceros que aparezca en la foto — esas marcas no deben reproducirse. Solo describí el producto en sí.`;

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
    brief, brandKit, peopleMode = 'none',
    productImages = [], referenceImages = [],
    testimonialText = '', authorityText = '',
  }: {
    brief: string;
    brandKit: BrandKit;
    peopleMode: PeopleMode;
    productImages: string[];
    referenceImages: string[];
    testimonialText: string;
    authorityText: string;
  } = await req.json();

  const openai = new OpenAI({ apiKey: ctx.openaiApiKey });
  const brandKitContext = buildBrandKitContext(brandKit);
  const hasPeople = peopleMode === 'real';

  const productDataUrls = productImages.map(img =>
    img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`
  );
  const referenceDataUrls = referenceImages.map(img =>
    img.startsWith('data:') ? img : `data:image/png;base64,${img}`
  );

  // Step 0: describe the product with the same detailed prompt as generate-concepts
  // (color subtone, temperature, warm neutral rules — critical for fidelity across 6 slides)
  let productDescription = brief;
  if (productDataUrls.length > 0) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const descResponse = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: PRODUCT_DESCRIPTION_PROMPT },
              ...productDataUrls.slice(0, 2).map(url => ({
                type: 'image_url' as const,
                image_url: { url, detail: 'high' as const },
              })),
            ],
          }],
          max_tokens: 800,
        });
        const desc = descResponse.choices[0].message.content || '';
        if (!isRefusal(desc)) {
          productDescription = desc;
          break;
        }
        console.warn(`PDP describe-product attempt ${attempt + 1} returned refusal`);
      } catch (err) {
        console.error(`PDP describe-product attempt ${attempt + 1} failed:`, err);
      }
    }
  }

  const lifestyleInstruction = hasPeople
    ? '3. LIFESTYLE IMAGE — una persona vistiendo / usando el producto en una situación cotidiana auténtica y aspiracional. La persona debe verse natural. Genera deseo y conexión emocional.'
    : '3. LIFESTYLE IMAGE — el producto integrado en su contexto natural de uso (escritorio, cocina, gym, etc.), sin personas. El ambiente rodea al producto de forma natural y cercana.';

  const systemPrompt = `Sos un director creativo senior especializado en PDPs de e-commerce (Shopify / Tienda Nube).
Dado un brief de producto y brand kit, generá exactamente 6 prompts de imagen — uno por cada tipo del sistema SPICY PDP.
Formato: cuadrado 1:1 (1024x1024), optimizado para carrusel de producto.

PRODUCTO (el mismo en TODAS las imágenes — sin excepción):
${productDescription}

TIPOS DE IMAGEN (exactamente en este orden):
1. PRODUCT HERO — el producto llena el 80% del encuadre. Fondo blanco puro o color sólido del brand kit. Iluminación de estudio premium, sombras suaves. Sin copy.
2. BENEFIT IMAGE — el producto + exactamente 3 beneficios clave del brief con íconos simples y frases cortas en tipografía bold. Layout scannable.
${lifestyleInstruction}
4. AUTHORITY IMAGE — closeup del producto mostrando materiales, textura o construcción con callouts visuales precisos.
5. HOW TO USE IMAGE — exactamente 3 pasos de uso numerados del producto. Visuales y claros.
6. TESTIMONIAL IMAGE — el producto con prueba social: estrellas y frase de reseña. Sin inventar métricas numéricas específicas.

REGLAS CRÍTICAS:
- TODAS las imágenes deben mostrar EXACTAMENTE el mismo producto descrito arriba — mismo color, misma silueta, mismo material
- PROHIBIDO mostrar un producto diferente al descrito, aunque el tipo de slide lo sugiera
- PROHIBIDO incluir logos, marcas o textos de marca de terceros — las imágenes de referencia son solo para color/forma, NO reproducir sus logos
- PROHIBIDO badges inventados ("Compra Segura", "Sitio Protegido", "Envío Gratis" si no está en el brief)
- PROHIBIDO: botones CTA, precios inventados, descuentos no mencionados, métricas falsas
- Colores: usá los hex exactos del brand kit
- ${hasPeople ? 'Modo fashion: LIFESTYLE debe incluir personas' : 'Sin personas en ninguna imagen'}
- Cada image_prompt debe describir el producto con su color exacto para que el generador no lo cambie

Respondé SOLO con JSON: { "pdp_images": [ { "type": "hero|benefit|lifestyle|authority|howto|testimonial", "label": "...", "image_prompt": "..." }, ... ] }`;

  const userContent: ChatCompletionContentPart[] = [
    { type: 'text', text: `BRAND KIT:\n${brandKitContext}\n\nBRIEF:\n${brief}` },
    ...productDataUrls.slice(0, 2).map(url => ({
      type: 'image_url' as const,
      image_url: { url, detail: 'high' as const },
    })),
    ...(hasPeople ? referenceDataUrls.slice(0, 1).map(url => ({
      type: 'image_url' as const,
      image_url: { url, detail: 'high' as const },
    })) : []),
  ];

  // Step 1: GPT-4o plans the 6 prompts
  const conceptsResponse = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    response_format: { type: 'json_object' },
  });

  const parsed = JSON.parse(conceptsResponse.choices[0].message.content || '{}');
  const pdpItems: PdpImageItem[] = parsed.pdp_images || [];

  // Ensure all 6 types are present (fallback if GPT skipped any)
  const orderedItems = PDP_TYPES.map(t => {
    const found = pdpItems.find(item => item.type === t.type);
    const base = {
      type: t.type,
      label: t.label, // always use our fixed label, never GPT's (which can include the brand name)
      image_prompt: found?.image_prompt || `${t.label} for: ${brief.slice(0, 120)}. Brand colors: ${brandKit.primary1}, ${brandKit.primary2}. Square 1:1 e-commerce format, premium quality.`,
    };

    // Inject user-provided text verbatim so the AI can't invent it
    if (t.type === 'testimonial' && testimonialText) {
      return {
        ...base,
        image_prompt: `${base.image_prompt} IMPORTANT — use EXACTLY this testimonial text in the image, do not modify or invent alternative copy: "${testimonialText}"`,
      };
    }
    if (t.type === 'authority' && authorityText) {
      return {
        ...base,
        image_prompt: `${base.image_prompt} IMPORTANT — use EXACTLY these authority claims/specs as the text in the image, do not invent alternatives: "${authorityText}"`,
      };
    }
    return base;
  });

  // Step 2: generate all 6 images in parallel, stream as they complete
  const inputImages = [
    ...productDataUrls.slice(0, 2),
    ...(hasPeople ? referenceDataUrls.slice(0, 1) : []),
  ];

  const encoder = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController, data: object) =>
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

  const stream = new ReadableStream({
    async start(controller) {
      try {
        await Promise.allSettled(
          orderedItems.map(async (item) => {
            const fullPrompt = [
              item.image_prompt,
              `PRODUCTO EXACTO A MOSTRAR (no cambiar, no reemplazar por otro): ${productDescription}`,
              `Brand colors: ${brandKit.primary1}, ${brandKit.primary2}, ${brandKit.primary3}.`,
              `Typography: ${brandKit.typography || 'bold sans-serif'}.`,
              'Professional e-commerce product photography or high-end retail graphic design. Square 1:1 format for Shopify / Tienda Nube. Premium quality, clean, conversion-focused.',
              'CRITICAL: show ONLY the exact product described above — same color, same silhouette, same material. Do NOT invent a different product.',
              'COLOR ACCURACY — CRITICAL: replicate the product color with pixel-level accuracy. Do NOT shift, lighten, darken, or desaturate. For warm neutrals (beige, sand, stone, khaki): preserve the warm undertone exactly, never render as white or gray.',
              'Do NOT reproduce any brand logos, labels, or marks from the reference photos — those images are for product shape/color reference only. The only brand mark allowed is from the brand kit.',
              'Do NOT include invented trust badges ("Compra Segura", "Sitio Protegido", "Envío Gratis") unless explicitly in the brief.',
              'Do NOT include button-style CTAs ("Compra ahora", "Buy Now", etc.).',
              'Do NOT include invented prices, discounts, or false metrics.',
            ].filter(Boolean).join(' ');

            let base64 = '';
            let lastError = '';

            if (inputImages.length > 0) {
              // Con fotos de producto: Responses API con gpt-4o viendo las imágenes
              // (mismo enfoque que apply-product, que mantiene fidelidad visual del producto)
              try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const response = await (openai.responses.create as any)({
                  model: 'gpt-4o',
                  input: [{
                    role: 'user',
                    content: [
                      ...inputImages.map(img => ({ type: 'input_image', image_url: img, detail: 'high' })),
                      { type: 'input_text', text: fullPrompt },
                    ],
                  }],
                  tools: [{
                    type: 'image_generation',
                    model: 'gpt-image-2',
                    quality: 'medium',
                    size: '1024x1024',
                  }],
                });
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                for (const block of (response.output || [])) {
                  if (block.type === 'image_generation_call' && block.result) {
                    base64 = block.result;
                    break;
                  }
                }
              } catch (err) {
                lastError = err instanceof Error ? err.message : String(err);
                console.error(`PDP with-images "${item.label}" failed:`, err);
              }

              // Fallback sin imágenes si la Responses API falla
              if (!base64) {
                try {
                  const result = await openai.images.generate({
                    model: 'gpt-image-2',
                    prompt: fullPrompt,
                    size: '1024x1024',
                    quality: 'medium',
                    n: 1,
                  });
                  base64 = result.data?.[0]?.b64_json || '';
                } catch (err) {
                  lastError = err instanceof Error ? err.message : String(err);
                  console.error(`PDP fallback "${item.label}" failed:`, err);
                }
              }
            } else {
              // Sin fotos de producto: images.generate directo (probado y confiable)
              try {
                const result = await openai.images.generate({
                  model: 'gpt-image-2',
                  prompt: fullPrompt,
                  size: '1024x1024',
                  quality: 'medium',
                  n: 1,
                });
                base64 = result.data?.[0]?.b64_json || '';
              } catch (err) {
                lastError = err instanceof Error ? err.message : String(err);
                console.error(`PDP no-images "${item.label}" failed:`, err);
              }
            }

            if (base64) {
              send(controller, {
                image: {
                  id: Math.random().toString(36).slice(2),
                  type: item.type,
                  label: item.label,
                  base64,
                },
              });
            } else {
              send(controller, { error: `${item.label}: ${lastError || 'sin imagen'}` });
            }
          })
        );
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
