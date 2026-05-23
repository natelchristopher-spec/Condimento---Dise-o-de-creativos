import { NextRequest, NextResponse } from 'next/server';
import OpenAI, { toFile } from 'openai';
import type { ChatCompletionContentPart } from 'openai/resources/chat/completions';
import { BrandKit } from '@/app/types';
import { buildBrandKitContext } from '@/app/lib/brandKitContext';
import { getUserContext } from '@/app/lib/get-user-context';

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

export const maxDuration = 300;

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

type PeopleMode = 'none' | 'ai' | 'real';

interface ConceptItem {
  concept_name: string;
  image_prompt: string;
}

const PRODUCT_DESCRIPTION_PROMPT_FASHION = `Sos un técnico de producto de moda de alta gama. Analizá esta prenda y describila con precisión quirúrgica para que pueda ser reproducida EXACTAMENTE por un modelo de IA generativa. Imaginá que quien lee tu descripción no puede ver la foto — tu texto es el único recurso.

Describí en este orden exacto:

1. TIPO DE PRENDA: categoría (remera, pantalón, vestido, campera, etc.), silueta y corte (oversize, entallado, recto, cargo, etc.), largo
2. COLOR BASE — ES LO MÁS CRÍTICO: describí el color con máxima precisión. NO uses solo el nombre del color. Usá referencias concretas: tono exacto (ej: "beige arena cálido, similar al tono de la arena seca — NO es blanco, NO es gris, tiene un subtono cálido visible", "verde oliva apagado con subtono amarillo", "negro carbón con leve subtono azulado"). Describí cómo se comporta bajo la luz (¿aclara? ¿cambia de tono?), su saturación (¿es vivo o apagado?) y su temperatura (¿frío o cálido?). Si es un color sólido, remarcalo explícitamente. Si tiene variaciones de tono por pliegues o tejido, describí esas variaciones. Para neutros cálidos (beige, arena, tostado, crudo, khaki), siempre aclará que NO debe renderizarse como blanco ni gris.
3. ESTAMPADO / PRINT (si existe): describí CADA elemento gráfico individualmente — qué forma tiene, de qué color exacto, tamaño relativo, distribución, orientación, contraste. Si no hay estampado, indicar "color sólido uniforme".
4. MATERIALES Y TEXTURA: acabado (mate, satinado, brillante), tejido visible (denim, gabardina, punto, etc.), peso visual, transparencia
5. DETALLES DE CONFECCIÓN: tiro (alto, medio, bajo), piernas (ancho, ajuste), bolsillos, cintura (elástico, cierre, trabillas), costuras decorativas, terminaciones, cualquier detalle funcional
6. ELEMENTOS ÚNICOS: cualquier detalle que diferencie esta prenda de una genérica

CRÍTICO para pantalones y prendas de color sólido: el color debe quedar completamente fiel. Si es beige, describí exactamente qué tipo de beige. Si es negro, indicá si tiene subtono. La IA tiende a desaturar o cambiar la temperatura del color — tu descripción debe ser lo suficientemente específica para evitarlo.`;

const PRODUCT_DESCRIPTION_PROMPT_GENERIC = `Sos un experto en descripción de productos para e-commerce. Analizá este producto y describilo con precisión máxima para que pueda ser reproducido EXACTAMENTE por un generador de imágenes IA. La persona que lea tu descripción no puede ver la foto — tu texto es el único recurso. El producto puede ser de CUALQUIER categoría: suplemento, cosmético, reloj, accesorio, electrónico, alimento, herramienta, etc.

Describí en este orden:

1. TIPO DE PRODUCTO: categoría exacta (suplemento deportivo, reloj de pulsera, crema facial, auriculares, etc.), nombre específico, variante o modelo visible
2. FORMA Y ESTRUCTURA: forma general (cilíndrico, rectangular, esférico, irregular), dimensiones relativas (grande/mediano/pequeño), presentación (envase, caja, suelto, con correa, etc.)
3. COLOR — ES LO MÁS CRÍTICO: describí el color principal con máxima precisión. NO uses solo el nombre. Usá referencias concretas con subtono, saturación y temperatura (ej: "negro mate profundo sin brillo, sin subtono", "blanco perla con leve subtono cálido — NO es blanco puro"). Para neutros cálidos (beige, arena, khaki, dorado mate): aclará explícitamente que NO debe renderizarse como blanco ni gris. Para colores oscuros: aclará que NO debe aclararse.
4. MATERIALES Y ACABADO: superficie (mate, satinado, brillante, texturado), material visible (plástico, metal, vidrio, tela, cuero, etc.), peso visual
5. ELEMENTOS GRÁFICOS Y DISEÑO: para productos con packaging → diseño de etiqueta, tipografía del nombre, elementos visuales principales (franjas, íconos, degradados); para accesorios/electrónicos → grabados, pantallas, botones, detalles decorativos; para prendas → estampado, costuras visibles
6. DETALLES ÚNICOS: lo que diferencia este producto específico de uno genérico de la misma categoría (forma de tapa, acabado especial, detalle de diseño característico)

CRÍTICO: NO menciones ninguna marca, logo ni texto de terceros. Solo describí el producto en sí.`;

async function describeProductWithVision(openai: OpenAI, imageDataUrl: string, prompt: string): Promise<string> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } },
      ],
    }],
    max_tokens: 800,
  });
  return response.choices[0].message.content || '';
}

async function editProductForConcept(
  openai: OpenAI,
  productDataUrl: string,
  editPrompt: string,
): Promise<string> {
  try {
    const base64Data = productDataUrl.split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');
    const imageFile = await toFile(buffer, 'product.jpg', { type: 'image/jpeg' });
    const response = await openai.images.edit({
      model: 'gpt-image-2',
      image: imageFile,
      prompt: editPrompt,
      size: '1024x1536',
      quality: 'medium',
    });
    return response.data?.[0]?.b64_json || '';
  } catch (err) {
    console.error('editProductForConcept failed:', err);
    return '';
  }
}

async function generateWithGptImage2(
  openai: OpenAI,
  prompt: string,
  inputImages: string[] = []
): Promise<string> {
  const content = [
    ...inputImages.map(img => ({ type: 'input_image', image_url: img, detail: 'high' })),
    { type: 'input_text', text: prompt },
  ];

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (openai.responses.create as any)({
      model: 'gpt-image-2',
      input: [{ role: 'user', content }],
      tools: [{
        type: 'image_generation',
        model: 'gpt-image-2',
        quality: 'medium',
        size: '1024x1536',
      }],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const block of (response.output || [])) {
      if (block.type === 'image_generation_call' && block.result) return block.result;
    }
    console.error('Responses API returned no image block');
  } catch (err) {
    console.error('Responses API failed:', err);
  }

  const fallback = await openai.images.generate({
    model: 'gpt-image-2',
    prompt,
    size: '1024x1536',
    quality: 'low',
    n: 1,
  });
  return fallback.data?.[0]?.b64_json || '';
}

export async function POST(req: NextRequest) {
  const ctx = await getUserContext();
  if (!ctx) {
    const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data: {"error":"Configurá tu API key de OpenAI en el perfil."}\n\n')); c.close(); } });
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
  }

  const {
    brief, brandKit, peopleMode = 'none',
    productDetailImages = [], referenceImages = [],
    styleReferenceImages = [], count = 4,
  }: {
    brief: string;
    brandKit: BrandKit;
    peopleMode: PeopleMode;
    productDetailImages: string[];
    referenceImages: string[];
    styleReferenceImages: string[];
    count: number;
  } = await req.json();

  const openai = new OpenAI({ apiKey: ctx.openaiApiKey });
  const brandKitContext = buildBrandKitContext(brandKit);

  const isSimilarMode = styleReferenceImages.length > 0;
  const targetCount = Math.max(1, Math.min(count, 6));
  // Raw base64 → data URLs for Responses API / vision
  const styleReferenceDataUrls = styleReferenceImages.map(
    (b64: string) => b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`
  );

  // Visual refs from brand kit (style guide for generation)
  const visualRefs: string[] = (brandKit.referencePiecesThumbnails || []).slice(0, 2);
  const productRef: string | null = productDetailImages[0] || null;

  // Generate product + person descriptions — returned to frontend for the apply-product step
  let productDescription = '';
  let personDescription = '';

  const descriptionPrompt = peopleMode !== 'none'
    ? PRODUCT_DESCRIPTION_PROMPT_FASHION
    : PRODUCT_DESCRIPTION_PROMPT_GENERIC;

  if (productRef) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const desc = await describeProductWithVision(openai, productRef, descriptionPrompt);
        productDescription = isRefusal(desc) ? '' : desc;
        if (productDescription) break;
        console.warn(`describe-product: attempt ${attempt + 1} returned refusal/empty`);
      } catch (err) {
        console.error(`describe-product: attempt ${attempt + 1} failed:`, err);
      }
    }
  }

  if (peopleMode === 'real' && referenceImages.length > 0) {
    try {
      const visionResponse = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Describí brevemente las características físicas de las personas en estas imágenes: tono de piel, cabello, complexión, edad aproximada. Máximo 2 oraciones.' },
            ...referenceImages.map(img => ({ type: 'image_url' as const, image_url: { url: img, detail: 'low' as const } })),
          ],
        }],
        max_tokens: 150,
      });
      personDescription = visionResponse.choices[0].message.content || '';
    } catch (err) {
      console.error('describe-person failed:', err);
      // Non-fatal: continue without person description
    }
  }

  const isProductEcommerce = peopleMode === 'none' && productDetailImages.length > 0;

  // People instruction for concept generation
  const peopleInstruction = peopleMode === 'none'
    ? 'NO incluir personas. Enfocarse en producto, composición, elementos gráficos y copy.'
    : 'Incluir una persona usando una prenda de moda acorde al brief y brand kit. Actitud aspiracional, editorial.';

  const hasVisualRefs = visualRefs.length > 0;

  // Slot 6 override when brand has approved reference pieces
  const slot6 = hasVisualRefs
    ? `6. BRAND STYLE REPLICATION — seguí EXACTAMENTE el estilo visual, composición tipográfica y tratamiento gráfico de las piezas de referencia de la marca que se incluyen como imágenes. Máxima fidelidad al look aprobado.`
    : isProductEcommerce
      ? `6. DAILY USE / USE CASE — el producto integrado en su contexto cotidiano real (escritorio, gym, cocina, rutina, setup). El ambiente rodea al producto de forma natural. Hacerlo sentir usable y cercano.`
      : `6. PRODUCT DETAIL FOCUS — destacar calidad y detalles del producto. Texturas, costuras, fit, closeups de materiales, acabados. Incluir copy que resalte la calidad: un claim técnico corto o descripción de material superpuesto en tipografía refinada (ej: "100% algodón pima" / "Corte entallado premium" / "Hecho para durar").`;

  const conceptDirections = isProductEcommerce
    ? `MODO PRODUCTO — el producto es el protagonista absoluto. Sin personas. CADA concepto usa una estrategia visual completamente distinta:
1. PRODUCT HERO — el producto LLENA el encuadre (80-90% del frame). Fondo color sólido del brand kit. Iluminación de estudio fuerte, limpio, premium. Sin copy excepto logo pequeño. El producto debe verse irresistible.
2. OFFER FOCUS — la oferta es el protagonista. Pricing grande en tipografía bold, descuento destacado (ej: "30% OFF"), TODAS las mecánicas del brief (cuotas, fechas, envío gratis, retiro). Contraste fuerte. Composición lista para publicar y generar clic.
3. BENEFIT FOCUS — se vende el resultado, no el producto. Claims claros en tipografía grande, iconos o checkmarks, highlights de beneficios. ¿Qué gana la persona? (ej: más energía, piel más limpia, frío 24h, mayor rendimiento). El producto aparece secundario.
4. FEATURE FOCUS — se venden características técnicas para elevar percepción de calidad. Closeup/macro del producto, ingredientes o materiales visibles, specs técnicos como copy. Composición de catálogo de alta gama.
5. PROBLEM / SOLUTION — mostrar el dolor y la solución. Composición split screen, before/after o comparativa visual. Hace obvio el problema que resuelve el producto. Contraste dramático entre el "sin" y el "con".
${slot6}`
    : `MODO FASHION / IN USE — el producto es experimentado por personas. El foco es la experiencia e identidad. CADA concepto usa una estrategia visual completamente distinta Y TODOS deben incluir texto/copy GRANDE Y VISIBLE en la imagen. REGLA DE TEXTO: el copy debe ser tipografía bold, grande, claramente legible — nunca pequeño, nunca sutil, nunca decorativo. Debe ocupar una porción importante de la imagen y ser lo primero que se lee:
1. OFFER FOCUS — la oferta/promoción/descuento como protagonista visual. Pricing grande en tipografía bold, descuento destacado, mecánicas de venta (cuotas, envío gratis, fechas). La persona muestra/usa el producto mientras el copy de la promo domina. Concepto diseñado para generar clic.
2. LIFESTYLE FOCUS — uso natural del producto en situaciones reales. Iluminación natural, movimiento auténtico. Incluir un headline corto o tagline de marca en tipografía GRANDE y bold, claramente visible, que ocupe una porción significativa de la imagen (ej: "Vestite como querés vivir" en letras grandes superpuestas). El texto debe ser prominente y legible — NO pequeño, NO sutil, NO decorativo.
3. ASPIRATIONAL FOCUS — se vende identidad y deseo. Editorial premium, estética fuerte. Incluir nombre de marca prominente + claim aspiracional corto en tipografía elegante (ej: "Nueva colección" / "SS25" / tagline de campaña). El texto refuerza el deseo.
4. TRANSFORMATION FOCUS — composición split screen before/after con LA MISMA persona en ambas mitades. REGLA CRÍTICA: el producto/prenda aparece ÚNICAMENTE en el lado "Después" (right/after side) — el lado "Antes" (left/before side) muestra a la persona con ropa básica, neutral o sin el producto. Incluir etiquetas de texto que marquen el contraste (ej: "Antes / Después", "Sin estilo / Con estilo") más un beneficio o claim corto que cierre la narrativa de cambio.
5. DAILY USE FOCUS — el producto integrado a la rutina cotidiana, momentos casuales y espontáneos. Incluir copy accesible y cercano superpuesto, tono conversacional (ej: "Para cada día" / "Tu look de siempre, mejor"). Tipografía casual, no corporativa.
${slot6}`;

  // Step 1: GPT-4o generates concept prompts tailored to mode (or variations in similar mode).
  const systemInstructions = isSimilarMode
    ? `Sos un director creativo senior de retail y publicidad digital.
Se te pasan conceptos visuales de referencia que el cliente aprobó. Tu tarea es generar exactamente ${targetCount} variaciones distintas que mantengan la misma línea gráfica (paleta, tratamiento tipográfico, mood, composición general) pero con diferencias claras en disposición, elementos secundarios y approach visual. No copies — varía.

REGLAS:
- Respetá el estilo visual de los conceptos de referencia
- Usá los hex exactos del brand kit como colores dominantes
- Estilo PREMIUM, nunca genérico ni clipart
- Fondos en colores del brand kit, tipografía precisa, máx 2-3 elementos por pieza
- Si hay descripción de productos, los image_prompts deben referenciar esos productos específicos
- PROHIBIDO inventar: precios, descuentos, porcentajes, cupones, promos, mecánicas. Solo lo que esté EXPLÍCITAMENTE en el brief.
${isProductEcommerce ? `
MODO E-COMMERCE CON PRODUCTO: cada image_prompt es una INSTRUCCIÓN DE EDICIÓN para images.edit.
El modelo recibe la foto del producto y la transforma. Describí:
- Qué fondo agregar (color sólido del brand kit, ambiente industrial, etc.)
- Qué texto y elementos de marca superponer
- Cómo componer el producto en el encuadre
- NUNCA decir "generate" — siempre "transform this product photo into..."
El producto DEBE quedar exactamente igual — solo se agregan elementos alrededor.` : ''}

Respondé SOLO con JSON: { "concepts": [ { "concept_name": "...", "image_prompt": "..." }, ... ] }
El image_prompt debe mencionar colores hex exactos, disposición, estilo y elementos concretos.`
    : `Sos un director creativo senior de retail y publicidad digital.
Dado un brief, brand kit y referencias visuales, generá exactamente 6 conceptos distintos para una pieza portrait 1024x1536.

REGLAS:
- Usá los hex exactos del brand kit como colores dominantes
- Estilo PREMIUM, nunca genérico ni clipart
${conceptDirections}
- Fondos en colores del brand kit, tipografía precisa, máx 2-3 elementos por pieza
- Si hay descripción de productos, los image_prompts deben referenciar esos productos específicos
- Si hay referencias visuales de marca, los image_prompts deben seguir ese estilo visual
- PROHIBIDO inventar: precios, descuentos, porcentajes, cupones, promos, mecánicas. Solo lo que esté EXPLÍCITAMENTE en el brief.
${isProductEcommerce ? `
MODO E-COMMERCE CON PRODUCTO: cada image_prompt es una INSTRUCCIÓN DE EDICIÓN para images.edit.
El modelo recibe la foto del producto y la transforma. Describí:
- Qué fondo agregar (color sólido del brand kit, ambiente industrial, etc.)
- Qué texto y elementos de marca superponer (logo, nombre del evento, copy de la promo, fechas, mecánicas)
- Cómo componer el producto en el encuadre
- NUNCA decir "generate" — siempre "transform this product photo into..."
El producto en la foto DEBE quedar exactamente igual — solo se agregan elementos alrededor.` : ''}

Respondé SOLO con JSON: { "concepts": [ { "concept_name": "...", "image_prompt": "..." }, ... ] }
El image_prompt debe mencionar colores hex exactos, disposición, estilo y elementos concretos.`;

  const userTextContent = [
    `BRAND KIT:\n${brandKitContext}`,
    `BRIEF:\n${brief}`,
    `PERSONAS:\n${peopleInstruction}`,
    productDescription ? `PRODUCTOS (describí exactamente estos en los conceptos que los incluyan):\n${productDescription}` : '',
    isSimilarMode ? `CONCEPTOS DE REFERENCIA (generá variaciones de esta línea visual):` : '',
  ].filter(Boolean).join('\n\n');

  const userMessageContent: ChatCompletionContentPart[] = [
    { type: 'text', text: userTextContent },
    ...(isSimilarMode
      ? styleReferenceDataUrls.map(url => ({
          type: 'image_url' as const,
          image_url: { url, detail: 'low' as const },
        }))
      : []),
  ];

  let conceptsResponse;
  try {
    conceptsResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemInstructions },
        { role: 'user', content: userMessageContent },
      ],
      response_format: { type: 'json_object' },
    });
  } catch (e) {
    const errMsg = getOpenAIErrorMessage(e);
    const errStream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ error: errMsg })}\n\n`)); c.close(); } });
    return new Response(errStream, { headers: { 'Content-Type': 'text/event-stream' } });
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(conceptsResponse.choices[0].message.content || '{}');
  } catch {
    parsed = {};
  }
  const concepts: ConceptItem[] = (parsed.concepts as ConceptItem[]) || [];

  // In similar mode: style references lead; otherwise brand visual refs lead.
  const inputImages = [
    ...(isSimilarMode ? styleReferenceDataUrls : visualRefs),
    ...productDetailImages,
    ...(peopleMode === 'real' ? referenceImages.slice(0, 1) : []),
  ];

  const hasPeople = peopleMode !== 'none';
  const styleSuffix = hasPeople
    ? 'Fashion editorial photography, natural skin tones, soft studio lighting, 85mm lens, high-end fashion campaign, photorealistic.'
    : isProductEcommerce
      ? 'Professional product photography or high-end retail graphic design, agency quality, photorealistic where applicable.'
      : 'Premium graphic design, agency quality, NOT generic AI art, portrait 4:5.';
  const productHint = productDetailImages.length > 0
    ? isProductEcommerce
      ? 'IMPORTANT: The provided reference images show the exact products — feature those specific products in the composition, replicating their appearance faithfully.'
      : 'PRODUCT COLOR ACCURACY — CRITICAL: The reference images show the exact garment/product. Replicate its color with pixel-level accuracy — do NOT shift, lighten, darken, or desaturate. For warm neutrals (beige, sand, stone, khaki): preserve the warm undertone exactly, never render as white or gray. For solid-color garments, the color must match the reference photo precisely.'
    : '';
  const styleHint = visualRefs.length > 0
    ? 'Match the visual style, typography treatment and composition quality of the provided brand reference pieces.'
    : '';

  // Step 2: Stream each concept image as it completes
  const encoder = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController, data: object) =>
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

  const stream = new ReadableStream({
    async start(controller) {
      try {
        await Promise.allSettled(
          concepts.slice(0, targetCount).map(async (concept: ConceptItem) => {
            const fullPrompt = [
              concept.image_prompt,
              `Brand colors: ${brandKit.primary1}, ${brandKit.primary2}, ${brandKit.primary3}.`,
              `Typography: ${brandKit.typography || 'bold sans-serif'}.`,
              styleSuffix,
              productHint,
              styleHint,
              'do NOT include any invented text, prices, discounts, coupons, promo codes, or promotional copy that is not explicitly in the brief.',
              'do NOT include button-style CTA elements in the image (e.g. "Compra ahora", "Ver más", "Buy Now", "Shop Now" rendered as a visual button, pill, or badge) — those CTAs are configured in the ad platform (Meta, Google), not inside the creative image itself.',
            ].filter(Boolean).join(' ');

            try {
              const base64 = isProductEcommerce && productDetailImages[0]
                ? await editProductForConcept(openai, productDetailImages[0], fullPrompt)
                : await generateWithGptImage2(openai, fullPrompt, inputImages);

              if (!base64) throw new Error('Image generation returned empty result');

              send(controller, {
                image: {
                  id: Math.random().toString(36).slice(2),
                  base64,
                  prompt: fullPrompt,
                  conceptName: concept.concept_name,
                },
              });
            } catch (err) {
              console.error(`concept "${concept.concept_name}" failed:`, err);
              send(controller, { error: concept.concept_name });
            }
          })
        );
      } finally {
        send(controller, { done: true, productDescription, personDescription });
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
