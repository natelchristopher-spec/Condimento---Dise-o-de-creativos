import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import type { ChatCompletionContentPart } from 'openai/resources/chat/completions';
import { BrandKit } from '@/app/types';
import { buildBrandKitContext } from '@/app/lib/brandKitContext';
import { getUserContext } from '@/app/lib/get-user-context';

export const maxDuration = 300;

type PeopleMode = 'none' | 'real';
type PdpMode = 'product' | 'fashion';

interface SlideDisplayCopy {
  items?: string[];
  tagline?: string;
  quote?: string;
  author?: string;
  rating?: string;
}

interface PdpImageItem {
  type: string;
  label: string;
  image_prompt: string;
  display_copy?: SlideDisplayCopy | null;
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

const PRODUCT_DESCRIPTION_PROMPT_FASHION = `Sos un técnico de producto de moda de alta gama. Analizá este producto y describilo con precisión quirúrgica para que pueda ser reproducido EXACTAMENTE por un modelo de IA generativa. Imaginá que quien lee tu descripción no puede ver la foto — tu texto es el único recurso.

Describí en este orden exacto:

1. TIPO DE PRODUCTO: categoría exacta, silueta y corte, largo o dimensiones
2. COLOR BASE — ES LO MÁS CRÍTICO: describí el color con máxima precisión. NO uses solo el nombre del color. Usá referencias concretas: tono exacto (ej: "beige arena cálido, similar al tono de la arena seca — NO es blanco, NO es gris, tiene un subtono cálido visible"). Describí su saturación (¿vivo o apagado?), temperatura (¿frío o cálido?) y cómo se ve bajo la luz. Para neutros cálidos (beige, arena, tostado, crudo, khaki), aclará explícitamente que NO debe renderizarse como blanco ni gris.
3. ESTAMPADO / PRINT: describí cada elemento gráfico. Si es color sólido, indicar "color sólido uniforme".
4. MATERIALES Y TEXTURA: acabado (mate/satinado/brillante), tejido visible, peso visual
5. DETALLES DE CONFECCIÓN: corte, bolsillos, cierre, terminaciones, cualquier detalle funcional
6. ELEMENTOS ÚNICOS: lo que diferencia este producto de uno genérico

CRÍTICO: NO menciones ninguna marca, logo ni texto de terceros que aparezca en la foto — esas marcas no deben reproducirse. Solo describí el producto en sí.`;

const PRODUCT_DESCRIPTION_PROMPT_PRODUCT = `Sos un especialista en descripción de productos para e-commerce. Analizá este producto y describilo con precisión para que pueda ser reproducido EXACTAMENTE por un modelo de IA generativa. Tu descripción es el único recurso — quien la lea no puede ver la foto.

Describí en este orden:

1. TIPO DE PRODUCTO: nombre exacto, categoría (suplemento, cosmético, alimento, electrónico, etc.), variante o sabor visible
2. FORMATO / PRESENTACIÓN: tipo de envase (pote, bolsa, botella, caja, tubo), tamaño relativo, cantidad visible en la etiqueta
3. COLORES DEL ENVASE — CRÍTICO: color exacto del cuerpo del envase (ej: "pote negro mate sin brillo") y color del diseño/etiqueta (ej: "franja roja vibrante en el centro"). Para colores oscuros, aclará que NO debe renderizarse más claro.
4. DISEÑO GRÁFICO DEL PACKAGING: estilo tipográfico del nombre (bold, condensado, script, etc.), elementos visuales principales (franjas, íconos, geometría, degradados)
5. TEXTO CLAVE VISIBLE: nombre del producto tal como aparece, sabor/variante si aplica, claims principales visibles en la etiqueta
6. ELEMENTOS ÚNICOS: forma de la tapa, textura del envase, detalles que distinguen este packaging específico

CRÍTICO: NO menciones ninguna marca ni logo de terceros. Solo describí el producto y su packaging.`;

const SLIDE_VISUAL_RULES: Record<string, string> = {
  hero: 'COMPOSITION: product centered, filling 80% of frame, pure white or solid brand-color background, studio lighting, NO text overlays, NO bullets — pure product focus.',
  benefit: 'COMPOSITION: product on LEFT side of frame, 3 benefit callouts on RIGHT side with icons and short bold Spanish text. Clean scannable layout. NO numbered list — use icon + text pairs.',
  lifestyle: 'COMPOSITION: product in real-life context. ONE short tagline in big bold text (NO bullet lists, NO numbered steps, NO specs grid). Aspirational editorial feel.',
  authority: 'COMPOSITION: product in center with 3-4 technical callout lines/arrows pointing to specific product zones. Clinical technical feel. NO benefit bullets — specs and technical data only.',
  howto: 'COMPOSITION: 3 horizontal numbered steps (1→2→3) infographic style. Small visual per step. NO benefit bullets — ACTION verbs only (Mezclar, Aplicar, Consumir, Lavar).',
  testimonial: 'COMPOSITION: large customer quote in quotation marks filling 60% of space, product image smaller on one side, author name and 5-star rating below. Warm social-proof feel.',
};

function buildCopyInjection(display_copy: SlideDisplayCopy | null | undefined, type: string): string {
  if (!display_copy) return '';
  const { items, tagline, quote, author, rating } = display_copy;
  if (items?.length) {
    return `EXACT TEXT TO DISPLAY IN THE IMAGE — use verbatim, do NOT modify or translate: ${items.map((it, i) => `${i + 1}. "${it}"`).join(' | ')}`;
  }
  if (type === 'testimonial' && quote) {
    const parts = [`"${quote}"`];
    if (author) parts.push(`— ${author}`);
    if (rating) parts.push(rating);
    return `EXACT TESTIMONIAL TO SHOW IN IMAGE — do NOT change or invent alternatives: ${parts.join(' ')}`;
  }
  if (tagline) {
    return `TAGLINE TO DISPLAY IN IMAGE — use verbatim: "${tagline}"`;
  }
  return '';
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
    brief, brandKit, peopleMode = 'none', pdpMode = 'product',
    productImages = [], referenceImages = [],
    testimonialText = '', authorityText = '',
    plans: confirmedPlans,
    productDescription: confirmedProductDescription,
  }: {
    brief: string;
    brandKit: BrandKit;
    peopleMode: PeopleMode;
    pdpMode: PdpMode;
    productImages: string[];
    referenceImages: string[];
    testimonialText: string;
    authorityText: string;
    plans?: PdpImageItem[];
    productDescription?: string;
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

  let productDescription: string;
  let orderedItems: PdpImageItem[];

  if (confirmedPlans && confirmedPlans.length > 0) {
    // Skip planning — use pre-confirmed plans from the review step
    productDescription = confirmedProductDescription || brief;
    orderedItems = PDP_TYPES.map(t => {
      const found = confirmedPlans.find(p => p.type === t.type);
      return {
        type: t.type,
        label: t.label,
        image_prompt: found?.image_prompt || `${t.label} for: ${brief.slice(0, 120)}. Brand colors: ${brandKit.primary1}, ${brandKit.primary2}. Square 1:1 e-commerce format, premium quality.`,
        display_copy: found?.display_copy ?? null,
      };
    });
  } else {
    // Original flow: step 0 (describe product) + step 1 (plan with GPT-4o)
    productDescription = brief;

    const descriptionPrompt = pdpMode === 'fashion'
      ? PRODUCT_DESCRIPTION_PROMPT_FASHION
      : PRODUCT_DESCRIPTION_PROMPT_PRODUCT;

    if (productDataUrls.length > 0) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const descResponse = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: descriptionPrompt },
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
- TODO EL COPY EN ESPAÑOL — títulos, beneficios, pasos, testimonios, callouts: todo en español, sin excepción
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

    orderedItems = PDP_TYPES.map(t => {
      const found = pdpItems.find(item => item.type === t.type);
      const base: PdpImageItem = {
        type: t.type,
        label: t.label,
        image_prompt: found?.image_prompt || `${t.label} for: ${brief.slice(0, 120)}. Brand colors: ${brandKit.primary1}, ${brandKit.primary2}. Square 1:1 e-commerce format, premium quality.`,
        display_copy: null,
      };

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
  }

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
            const copyInjection = buildCopyInjection(item.display_copy, item.type);
            const visualRule = SLIDE_VISUAL_RULES[item.type] || '';
            const fullPrompt = [
              item.image_prompt,
              visualRule,
              copyInjection,
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
              'ALL TEXT IN THE IMAGE MUST BE IN SPANISH — titles, benefits, steps, callouts, testimonials: everything in Spanish, no English.',
            ].filter(Boolean).join(' ');

            let base64 = '';
            let lastError = '';

            if (inputImages.length > 0) {
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
