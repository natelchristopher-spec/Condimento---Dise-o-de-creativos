import { NextRequest } from 'next/server';
import OpenAI, { toFile } from 'openai';
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

const SLIDE_VISUAL_RULES_BASE: Record<string, string> = {
  hero: 'COMPOSITION: product centered, filling 80% of frame, pure white or solid brand-color background, studio lighting, NO text overlays, NO bullets — pure product focus.',
  benefit: 'COMPOSITION: product on LEFT side of frame, 3 benefit callouts on RIGHT side with icons and short bold Spanish text. Clean scannable layout. NO numbered list — use icon + text pairs.',
  authority: 'COMPOSITION: product in center with 3-4 technical callout lines/arrows pointing to specific product zones. Clinical technical feel. NO benefit bullets — specs and technical data only.',
  testimonial: 'COMPOSITION: large customer quote in quotation marks filling 60% of space, product image smaller on one side, author name and 5-star rating below. Warm social-proof feel.',
};

function buildSlideVisualRules(hasPeople: boolean, pdpMode: string): Record<string, string> {
  const isFashion = pdpMode === 'fashion';
  return {
    hero: isFashion
      ? 'COMPOSITION: garment worn on person or editorial flat lay. Clean background or solid brand color. Full garment visible with exact color, cut and silhouette. Aspirational fashion feel. NO text overlays.'
      : 'COMPOSITION: product centered, filling 80% of frame, pure white or solid brand-color background, studio lighting, NO text overlays, NO bullets — pure product focus.',
    benefit: isFashion
      ? 'COMPOSITION: person wearing the garment showing fit, drape and movement. 3 benefit callouts as text labels on the side or overlaid. Clean, editorial. NO numbered list.'
      : 'COMPOSITION: product on LEFT side of frame, 3 benefit callouts on RIGHT side with icons and short bold Spanish text. Clean scannable layout. NO numbered list — use icon + text pairs.',
    lifestyle: hasPeople
      ? isFashion
        ? 'COMPOSITION: person wearing the garment in a real-life aspirational context. Exact color, cut and silhouette. ONE short tagline in big bold text. NO bullet lists.'
        : `COMPOSITION: person in the product's natural context. MINIMUM RISK — product in original recognizable form only.
SAFE: watch/wearable on wrist | jewelry worn | eyewear on face | bag/backpack carried | headphones on ears | phone/tablet in hand | sports equipment in use | home textiles in place | candles lit | books in hand.
CONTEXT ONLY (no consumption/application): supplement → held or on gym surface | cosmetics/skincare → on counter or in hand, NOT on face | perfume → bottle in hand | haircare → bottle in bathroom | food/beverage → closed packaging in context.
ONE short tagline in big bold text. NO bullet lists.`
      : 'COMPOSITION: product in its natural use environment WITHOUT people. ONE short tagline in big bold text. No bullet lists.',
    authority: isFashion
      ? 'COMPOSITION: extreme closeup of fabric texture, stitching, construction detail or label. NO person. Clinical detail photography feel. Text callouts pointing to specific zones of the garment.'
      : 'COMPOSITION: product in center with 3-4 technical callout lines/arrows pointing to specific product zones. Clinical technical feel. NO benefit bullets — specs and technical data only.',
    howto: isFashion
      ? 'COMPOSITION: 3 numbered care/washing instructions (1→2→3). Flat lay or product only — NO person. Infographic style with icons (washing machine, iron, etc.). Care symbols if appropriate. USE BRAND PRIMARY COLOR as background — dark or solid-colored background with high-contrast text, NOT white or near-white. Brand identity must be strong. GARMENT COLOR CRITICAL: reproduce the exact garment color from the reference photos — warm beige/neutral tones must NOT be rendered as white or bleached-out. The garment must read as clearly distinct from the background.'
      : hasPeople
        ? `COMPOSITION: 3 numbered steps (1→2→3). MINIMUM RISK — product in original form in each step. Safe: opening container, measuring, placing, pairing. Avoid: applying to skin, mixing, consuming. Infographic style.`
        : 'COMPOSITION: 3 horizontal numbered steps (1→2→3) infographic style. Product in original form per step. ACTION verbs only.',
    testimonial: 'COMPOSITION: large customer quote in quotation marks filling 60% of space, product image smaller on one side, author name and 5-star rating below. Warm social-proof feel.',
  };
}

function buildFallbackPrompt(
  item: PdpImageItem,
  brandKit: BrandKit,
  pdpMode: PdpMode,
  hasPeople: boolean,
): string {
  const bg = brandKit.primary1 || '#000000';
  const accent = brandKit.primary2 || '#ffffff';
  const font = brandKit.typography || 'bold sans-serif';
  const copy = item.display_copy;
  const isFashion = pdpMode === 'fashion';

  const base = [
    `KEEP THE PRODUCT EXACTLY AS PHOTOGRAPHED — same color, shape, packaging, zero modifications.`,
    `Brand: ${brandKit.name}. Background: ${bg}. Accent color: ${accent}. Font family: ${font}.`,
    `Square 1:1 format. Professional e-commerce quality. ALL text in Spanish.`,
    `No invented prices, discounts, trust badges, or button CTAs.`,
  ].join(' ');

  const items = copy?.items?.filter(Boolean) || [];

  switch (item.type) {
    case 'hero':
      return [
        base,
        isFashion
          ? `Place garment as the clear hero — editorial flat lay or worn look. Clean ${bg} or neutral background. Exact garment color and silhouette.`
          : `Center the product on a clean ${bg} background, filling ~80% of the frame. Studio lighting, minimal composition.`,
        copy?.tagline ? `Add tagline text: "${copy.tagline}" in large ${font} above or below the product.` : '',
      ].filter(Boolean).join(' ');

    case 'benefit':
      return [
        base,
        isFashion
          ? `Show the garment (worn or flat lay) on one side. Display these benefits as bold text on the other side:`
          : `Product on the left half. Display these benefits on the right side with icons:`,
        items.length
          ? items.map((it, i) => `${i + 1}. "${it}"`).join(' | ')
          : '',
        `Clean, scannable layout. Bold ${font}.`,
      ].filter(Boolean).join(' ');

    case 'lifestyle':
      return [
        base,
        hasPeople && !isFashion
          ? `Product in natural use context with person. Product must stay in its original form — do not show consumption or application.`
          : isFashion
            ? `Garment in an aspirational lifestyle scene. Exact garment color and fit preserved.`
            : `Product in its natural environment without people.`,
        copy?.tagline ? `Add short tagline: "${copy.tagline}" in large bold text.` : '',
      ].filter(Boolean).join(' ');

    case 'authority':
      return [
        base,
        isFashion
          ? `Extreme closeup of fabric texture or construction detail. Clinical, precise feel.`
          : `Product centered. Add technical callout arrows or lines pointing to product zones.`,
        items.length
          ? `Display these technical claims verbatim: ${items.map((it, i) => `${i + 1}. "${it}"`).join(' | ')}`
          : '',
        `${font} typography. Credible, premium look.`,
      ].filter(Boolean).join(' ');

    case 'howto':
      return [
        base,
        isFashion
          ? `Show 3 care/washing instructions as a numbered infographic. Flat lay — no person. Background must be ${bg} (brand primary color) — NOT white or light gray. High contrast between background and text/icons. The garment color must match the reference photos exactly — warm neutral tones (beige, sand, stone) must stay true to their original hue and NOT be rendered white or bleached.`
          : `3 numbered horizontal steps infographic. Product in original form in each step.`,
        items.length
          ? `Steps verbatim: ${items.map((it, i) => `${i + 1}. "${it}"`).join(' | ')}`
          : '',
        `Clear icon + text layout. Educational style.`,
      ].filter(Boolean).join(' ');

    case 'testimonial':
      return [
        base,
        `Product small (30% of frame) on one side. Large quote text fills the rest.`,
        copy?.quote ? `Quote verbatim: "${copy.quote}"` : '',
        copy?.author ? `Author: — ${copy.author}` : '',
        copy?.rating ? `Rating: ${copy.rating}` : '',
        `Warm, trustworthy design. ${bg} background.`,
      ].filter(Boolean).join(' ');

    default:
      return [base, item.image_prompt.slice(0, 400)].join(' ');
  }
}

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

  // Filter out empty/invalid entries (e.g. unsupported format that failed canvas conversion)
  const productDataUrls = productImages
    .map(img => img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`)
    .filter(url => url.length > 100);
  const referenceDataUrls = referenceImages
    .map(img => img.startsWith('data:') ? img : `data:image/png;base64,${img}`)
    .filter(url => url.length > 100);

  // Product photo is mandatory — never generate PDP without it
  if (productDataUrls.length === 0) {
    const errStream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode('data: {"error":"Se requiere al menos una foto del producto para generar imágenes PDP. Subí una foto en formato JPG o PNG."}\n\n'));
        c.enqueue(new TextEncoder().encode('data: {"done":true}\n\n'));
        c.close();
      },
    });
    return new Response(errStream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
  }

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

    const lifestyleInstruction = !hasPeople
      ? '3. LIFESTYLE IMAGE — el producto en su contexto natural de uso sin personas (gym, baño, cocina, escritorio, etc.). El ambiente rodea el producto de forma natural y cercana. Sin copy de bullets.'
      : pdpMode === 'fashion'
        ? '3. LIFESTYLE IMAGE — persona vistiendo la prenda con su color, corte y silueta exactos. Situación cotidiana auténtica y aspiracional. La prenda debe verse tal como es.'
        : `3. LIFESTYLE IMAGE — persona en el contexto donde se usa el producto. MÍNIMO RIESGO — el producto aparece en su forma original:
   - Reloj/accesorio: puesto en la muñeca (forma natural conocida)
   - Suplemento/proteína: sostenido en mano o sobre superficie de gym — NO mezclar ni tomar
   - Cosmético/skincare: sobre mesada o en mano — NO aplicar en cara
   - Alimento: en packaging en contexto de mesa/cocina — NO consumiéndose
   - Electrónico: en mano o en uso pasivo (auriculares puestos, pantalla visible)`;

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

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(conceptsResponse.choices[0].message.content || '{}');
    } catch {
      parsed = {};
    }
    const pdpItems: PdpImageItem[] = (parsed.pdp_images as PdpImageItem[]) || [];

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
        const isFashion = pdpMode === 'fashion';
        const slideVisualRules = buildSlideVisualRules(hasPeople, pdpMode);
        await Promise.allSettled(
          orderedItems.map(async (item) => {
            const noPersonInSlide = isFashion && (item.type === 'authority' || item.type === 'howto');
            const slideInputImages = noPersonInSlide ? productDataUrls.slice(0, 2) : inputImages;
            const copyInjection = buildCopyInjection(item.display_copy, item.type);
            const visualRule = slideVisualRules[item.type] || '';
            // When photos are present they are the single source of truth for product appearance.
            // Text description is supplementary only — never overrides what the photos show.
            const productConstraint = slideInputImages.length > 0
              ? `THE REFERENCE PHOTOS ABOVE ARE THE SINGLE SOURCE OF TRUTH FOR THE PRODUCT. Reproduce the product EXACTLY as it appears in the photos — same shape, same color, same label, same packaging, same proportions. DO NOT invent or modify any visual aspect of the product. IMPORTANT: the layout instructions below describe composition only — if they mention any product color or shape that contradicts the photos, IGNORE that and use the photos instead.${productDescription ? ` Supplementary context (never overrides photos): ${productDescription}` : ''}`
              : `PRODUCT TO REPRODUCE EXACTLY: ${productDescription}. Same color, shape, packaging design — do not modify.`;

            const fullPrompt = [
              productConstraint,
              item.image_prompt,
              visualRule,
              copyInjection,
              `BRAND DESIGN ELEMENTS (use ONLY for: background, text overlays, graphic shapes, icons, borders — NEVER on the product itself): primary ${brandKit.primary1 || '#000000'}, secondary ${brandKit.primary2 || '#ffffff'}, accent ${brandKit.primary3 || '#888888'}.`,
              `Typography: ${brandKit.typography || 'bold sans-serif'}.`,
              'Professional e-commerce product photography or high-end retail graphic design. Square 1:1 format for Shopify / Tienda Nube. Premium quality, clean, conversion-focused.',
              'BRAND COLORS ARE FOR DESIGN ELEMENTS ONLY — never apply brand colors to the product. The product color is fixed by the reference photos.',
              'COLOR ACCURACY — CRITICAL: replicate the product color with pixel-level accuracy from the reference photos. Do NOT shift, lighten, darken, or desaturate.',
              'Do NOT reproduce any brand logos or marks from the reference photos.',
              'Do NOT include invented trust badges, button-style CTAs, prices, discounts, or false metrics.',
              'ALL TEXT IN THE IMAGE MUST BE IN SPANISH.',
            ].filter(Boolean).join(' ');

            let base64 = '';
            let lastError = '';

            // Primary: Responses API (supports multi-image input + image generation tool)
            for (let attempt = 1; attempt <= 2; attempt++) {
              try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const response = await (openai.responses.create as any)({
                  model: 'gpt-4o',
                  input: [{
                    role: 'user',
                    content: [
                      ...slideInputImages.map(img => ({ type: 'input_image', image_url: img, detail: 'high' })),
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
                if (base64) break;
                console.warn(`PDP "${item.label}" attempt ${attempt}: no image block`);
              } catch (err) {
                lastError = err instanceof Error ? err.message : String(err);
                console.error(`PDP "${item.label}" attempt ${attempt} failed:`, err);
                if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
              }
            }

            // Fallback: images.edit — accepts input photos, no org verification required
            // Only product photos are passed — person reference photos are NOT included because
            // images.edit treats all inputs as editable source material and would blend/misuse them.
            // Uses a focused prompt optimized for images.edit (shorter, direct editing instructions).
            if (!base64) {
              try {
                const fileResults = await Promise.allSettled(
                  productDataUrls.slice(0, 2).map(async (dataUrl, i) => {
                    const b64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
                    const mimeType = dataUrl.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
                    return toFile(Buffer.from(b64, 'base64'), `product_${i}.${mimeType === 'image/png' ? 'png' : 'jpg'}`, { type: mimeType });
                  })
                );
                const imageFiles = fileResults
                  .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof toFile>>> => r.status === 'fulfilled')
                  .map(r => r.value);
                if (imageFiles.length === 0) throw new Error('No se pudo procesar ninguna imagen de producto');
                const fallbackPrompt = buildFallbackPrompt(item, brandKit, pdpMode, hasPeople);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const editResult = await (openai.images.edit as any)({
                  model: 'gpt-image-2',
                  image: imageFiles.length === 1 ? imageFiles[0] : imageFiles,
                  prompt: fallbackPrompt,
                  size: '1024x1024',
                  quality: 'high',
                  response_format: 'b64_json',
                  n: 1,
                });
                base64 = editResult.data?.[0]?.b64_json || '';
                if (!base64) {
                  lastError = 'images.edit returned no image data';
                  console.warn(`PDP images.edit fallback "${item.label}": no b64_json`);
                }
              } catch (err) {
                lastError = err instanceof Error ? err.message : String(err);
                console.error(`PDP images.edit fallback "${item.label}" failed:`, err);
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
