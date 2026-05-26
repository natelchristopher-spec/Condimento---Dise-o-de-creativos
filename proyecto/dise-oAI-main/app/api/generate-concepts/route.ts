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

type PeopleMode = 'none' | 'ai' | 'real' | 'branding';

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

CRÍTICO para pantalones y prendas de color sólido: el color debe quedar completamente fiel. Si es beige, describí exactamente qué tipo de beige. Si es negro, indicá si tiene subtono. La IA tiende a desaturar o cambiar la temperatura del color — tu descripción debe ser lo suficientemente específica para evitarlo.
CRÍTICO — NO RECLASIFIQUES: usá el nombre de prenda tal como lo indica el brief del usuario. Si el brief dice "pantalón gabardina", NO lo llames "pantalón chino" ni ningún otro tipo genérico. Describí lo que ves sin cambiar el nombre del producto.`;

const PRODUCT_DESCRIPTION_PROMPT_GENERIC = `Sos un experto en descripción de productos para generación de imágenes IA. Analizá este producto y describilo con precisión máxima. La persona que lea tu descripción no puede ver la foto — tu texto es el único recurso.

PRIMERO determiná si el producto tiene packaging/envase (suplemento, cosmético, alimento, bebida, limpieza, etc.) o si es un producto sin packaging (electrónico, joyería, calzado, mueble, decoración, accesorio, juguete, etc.).

Para PRODUCTOS CON PACKAGING / ENVASE:
1. TIPO DE PRODUCTO: nombre exacto, categoría, variante o sabor visible
2. FORMATO / PRESENTACIÓN: tipo de envase (pote, bolsa, botella, caja, tubo), tamaño relativo
3. COLORES DEL ENVASE — CRÍTICO: color exacto del cuerpo y del diseño/etiqueta. Para colores oscuros, aclará que NO debe renderizarse más claro.
4. DISEÑO GRÁFICO DEL PACKAGING: estilo tipográfico, elementos visuales principales (franjas, íconos, geometría, degradados)
5. TEXTO CLAVE VISIBLE: nombre del producto, sabor/variante si aplica, claims visibles en la etiqueta
6. ELEMENTOS ÚNICOS: forma de la tapa, textura, detalles que distinguen este packaging específico

Para PRODUCTOS SIN PACKAGING (electrónico, joyería, calzado, decoración, accesorio, alimento fresco, etc.):
1. TIPO DE PRODUCTO: nombre exacto, categoría, función principal
2. FORMA Y DIMENSIONES: silueta general, proporciones, si es grande/compacto/pequeño/delgado
3. COLORES — CRÍTICO: color exacto de cada componente. Para colores oscuros, aclará que NO debe renderizarse más claro. Para metales, especificá tono (plateado frío, dorado cálido, bronce, etc.).
4. MATERIALES Y ACABADOS: metales, plásticos, madera, cuero, vidrio, tela, etc. y su acabado (mate/brillante/satinado/texturado)
5. DETALLES FUNCIONALES: botones, pantallas, conectores, bisagras, cierres, costuras, herrajes, etc.
6. ELEMENTOS ÚNICOS: lo que diferencia este producto específico de uno genérico

CRÍTICO: NO menciones ninguna marca ni logo de terceros. Solo describí el producto en sí.`;

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

  const CLOTHING_TERMS = /\b(prenda|vestido|pantalón|remera|camiseta|camisa|campera|buzo|short|pollera|falda|indumentaria|calzado|zapatilla|zapato|tela|tejido|outfit|jean|jogger|bikini|traje|garment|clothing|apparel|fabric|dress|shirt|pants|jacket|hoodie|sneaker|shoe|top|blouse|skirt|coat|sleeve|collar|hem|knit|denim|cotton|polyester)\b/i;
  const isFashionBrief = CLOTHING_TERMS.test(brief + ' ' + (brandKit.styleDescription || ''));

  // Vision-based classification: when a product image is available, ask GPT-4o-mini
  // whether it's actually clothing. Overrides text-based detection — detail:low keeps it fast and cheap.
  let isFashionProduct = isFashionBrief;
  if (productRef && peopleMode !== 'none') {
    try {
      const classifyRes = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Is this product a clothing item, garment, shoe, or wearable fashion accessory (worn on the body)? Answer only YES or NO.' },
            { type: 'image_url', image_url: { url: productRef, detail: 'low' } },
          ],
        }],
        max_tokens: 5,
      });
      const answer = (classifyRes.choices[0].message.content || '').trim().toUpperCase();
      isFashionProduct = answer.startsWith('YES');
    } catch {
      // Vision classify failed — fall back to text-based detection
    }
  }

  const descriptionPrompt = (peopleMode !== 'none' && isFashionProduct)
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

  const isBrandingMode = peopleMode === 'branding';
  const isProductEcommerce = peopleMode === 'none' && productDetailImages.length > 0;

  // People instruction for concept generation
  const peopleInstruction = isBrandingMode
    ? productRef
      ? 'NO incluir personas. El foco es la identidad de marca junto con el producto. El producto puede aparecer como elemento visual en las composiciones tipográficas y de marca.'
      : 'NO incluir productos específicos ni personas. El foco es la identidad de marca, el mensaje y la composición gráfica pura.'
    : peopleMode === 'none'
      ? 'NO incluir personas. Enfocarse en producto, composición, elementos gráficos y copy.'
      : isFashionProduct
        ? 'Incluir una persona usando la prenda del brief. Actitud aspiracional, editorial.'
        : 'Incluir una persona usando o interactuando con el producto del brief de forma natural. Actitud aspiracional. El producto aparece en su forma original — no mostrar consumo ni aplicación directa en piel o cuerpo.';

  const hasVisualRefs = visualRefs.length > 0;

  // Slot 6 override when brand has approved reference pieces
  const slot6 = hasVisualRefs
    ? `6. BRAND STYLE REPLICATION — seguí EXACTAMENTE el estilo visual, composición tipográfica y tratamiento gráfico de las piezas de referencia de la marca que se incluyen como imágenes. Máxima fidelidad al look aprobado.`
    : `6. ROTATIVO — elegí el tipo MÁS RELEVANTE para este brief específico entre las siguientes opciones. El elegido debe agregar un ángulo de mensaje que los 5 conceptos anteriores no cubrieron:
   - PRENSA / EDITORIAL: simula el formato de nota periodística o recomendación de medio. Titular en tipografía de diario/revista, copy estilo "El producto que todos están eligiendo" o "La marca que llegó para quedarse". Nombre del producto prominente. Alto CTR en Prospección por el efecto sorpresa de formato. Ideal para lanzamientos o novedades.
   - FUNDADOR / HUMANO: humaniza la marca mostrando el proceso de producción, el equipo o la historia de origen. Copy en primera persona o que revela el "por qué" detrás de la marca (ej: "Lo creamos porque nosotros lo necesitábamos"). Diferenciador frente a marcas grandes. Funciona para marcas con historia o fundadores visibles.
   - PANTALLA DIVIDIDA (COMPARATIVA): dos zonas que narran un contraste — nuestra marca vs. alternativa genérica, con producto vs. sin producto, ocasión A vs. ocasión B. Copy que marca la diferencia entre ambas mitades. Sin mostrar personas en estados negativos.
   ${isProductEcommerce ? '- DAILY USE / USE CASE: el producto integrado en su contexto cotidiano real (escritorio, gym, cocina, rutina, setup). El ambiente rodea al producto de forma natural. Hacerlo sentir usable y cercano.' : '- PRODUCT DETAIL FOCUS: destacar calidad y detalles del producto. Texturas, costuras, fit, closeups de materiales, acabados. Claim técnico corto superpuesto en tipografía refinada (ej: "100% algodón pima" / "Hecho para durar").'}`;

  const brandingConceptDirections = `MODO BRANDING / CAMPAÑA${productRef ? ' — el producto puede aparecer como elemento visual' : ' — sin producto específico'}.
PASO 1: Leé el brief y determiná el ÚNICO objetivo principal de campaña (ej: lanzamiento de tienda, Black Friday, temporada de verano, awareness de marca, aniversario, campaña de valores, etc.).
PASO 2: Generá 6 conceptos que ejecuten ESE MISMO objetivo con 6 TRATAMIENTOS VISUALES completamente distintos. Todos los conceptos deben responder al mismo intent — NO mezclar distintos objetivos entre sí.${productRef ? '\nSi el brief incluye el producto, podés incorporarlo en la composición como elemento visual secundario que refuerza el mensaje de marca — pero el protagonista siempre es la identidad y el mensaje, no el producto.' : ''}
PASO 3: Elegí los 6 tratamientos más apropiados para ese objetivo específico entre estas posibilidades:
  - TIPOGRAFÍA DOMINANTE: solo copy grande + paleta del brand kit. 0% fotografía. Las palabras son la imagen.
  - COUNTDOWN / ANTICIPACIÓN: elementos de cuenta regresiva, fecha, urgencia o expectativa visual.
  - COMPOSICIÓN GEOMÉTRICA: formas abstractas + color del brand kit + copy superpuesto. Sin objetos literales.
  - MOOD CINEMATOGRÁFICO: ambiente fotográfico o ilustrado + copy corto poderoso superpuesto.
  - MANIFESTO BOLD: 3-5 palabras enormes que declaran el porqué de la campaña. Composición brutal y memorable.
  - SPLIT / CONTRASTE: dos zonas que cuentan una historia visual (antes/después, problema/solución, two worlds).
  - GRAFISMO DE MARCA: elementos visuales abstractos propios de la marca + copy de campaña.
  - ENERGÍA COLECTIVA: identidad de comunidad, movimiento, pertenencia. Copy que invita a ser parte.

REGLA DE COHERENCIA: todos los conceptos deben sentirse como parte de la MISMA campaña — misma paleta, mismo tono, mismo objetivo. Lo que varía es el tratamiento visual, no el mensaje central.
REGLA DE TEXTO: el copy debe ser tipografía bold, grande, claramente legible — nunca pequeño, nunca sutil, nunca decorativo. Debe ocupar una porción importante del frame.
Usá la paleta y tipografía del brand kit con precisión exacta.`;

  const conceptDirections = isBrandingMode
    ? brandingConceptDirections
    : isProductEcommerce
    ? `MODO PRODUCTO — el producto es el protagonista absoluto. Sin personas. CADA concepto usa una estrategia visual completamente distinta:
1. PRODUCT HERO — el producto LLENA el encuadre (80-90% del frame). Fondo color sólido del brand kit. Iluminación de estudio fuerte, limpio, premium. Sin copy excepto logo pequeño. El producto debe verse irresistible.
2. OFFER FOCUS — la oferta es el protagonista. Pricing grande en tipografía bold, descuento destacado (ej: "30% OFF"), TODAS las mecánicas del brief (cuotas, fechas, envío gratis, retiro). Contraste fuerte. Composición lista para publicar y generar clic.
3. BENEFIT FOCUS — se vende el resultado, no el producto. Claims claros en tipografía grande, iconos o checkmarks, highlights de beneficios. ¿Qué gana la persona? (ej: más energía, piel más limpia, frío 24h, mayor rendimiento). El producto aparece secundario.
4. FEATURE FOCUS — se venden características técnicas para elevar percepción de calidad. Closeup/macro del producto, ingredientes o materiales visibles, specs como copy. Solo usar datos que estén en el brief — PROHIBIDO inventar specs, métricas o porcentajes. Composición de catálogo de alta gama.
5. NEED / BENEFIT — dos zonas: zona izquierda muestra el contexto SIN el producto (ambiente o situación neutral), zona derecha muestra el producto como la respuesta. Sin personas en estados negativos ni transformaciones físicas. Contraste visual claro entre el "sin" y el "con". Incluir copy que refuerce el beneficio.
${slot6}`
    : `MODO FASHION / IN USE — el producto es experimentado por personas. El foco es la experiencia e identidad. CADA concepto usa una estrategia visual completamente distinta Y TODOS deben incluir texto/copy GRANDE Y VISIBLE en la imagen. REGLA DE TEXTO: el copy debe ser tipografía bold, grande, claramente legible — nunca pequeño, nunca sutil, nunca decorativo. Debe ocupar una porción importante de la imagen y ser lo primero que se lee:
1. OFFER FOCUS — la oferta/promoción/descuento como protagonista visual. Pricing grande en tipografía bold, descuento destacado, mecánicas de venta (cuotas, envío gratis, fechas). La persona muestra/usa el producto mientras el copy de la promo domina. Concepto diseñado para generar clic.
2. LIFESTYLE FOCUS — uso natural del producto en situaciones reales. Iluminación natural, movimiento auténtico. Incluir un headline corto o tagline de marca en tipografía GRANDE y bold, claramente visible, que ocupe una porción significativa de la imagen (ej: "Vestite como querés vivir" en letras grandes superpuestas). El texto debe ser prominente y legible — NO pequeño, NO sutil, NO decorativo.
3. ASPIRATIONAL FOCUS — se vende identidad y deseo. Editorial premium, estética fuerte. Incluir nombre de marca prominente + claim aspiracional corto en tipografía elegante (ej: "Nueva colección" / "SS25" / tagline de campaña). El texto refuerza el deseo.
4. CONTRAST FOCUS — composición de dos zonas: zona izquierda muestra el contexto SIN el producto (ropa básica, ambiente neutro), zona derecha muestra la persona CON el producto. Sin transformaciones físicas ni cambios en el cuerpo. Etiquetas de texto que marcan el contraste (ej: "Antes / Después", "Sin / Con") más un claim corto. NO mostrar personas en estados negativos.
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
- PROHIBIDO INVENTAR — REGLA ABSOLUTA: NO agregar ningún dato que no esté explícitamente en el brief o brand kit: teléfonos, URLs, redes sociales (@handles), QR codes, ratings ("4.8/5"), reseñas, número de clientes, certificaciones, claims de ingredientes o materiales, fechas límite, descuentos, mecánicas promocionales, premios o cualquier estadística. Solo datos del brief.
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
- PROHIBIDO INVENTAR — REGLA ABSOLUTA: NO agregar ningún dato que no esté explícitamente en el brief o brand kit: teléfonos, URLs, redes sociales (@handles), QR codes, ratings ("4.8/5"), reseñas, número de clientes, certificaciones, claims de ingredientes o materiales, fechas límite, descuentos, mecánicas promocionales, premios o cualquier estadística. Solo datos del brief.
- IDIOMA OBLIGATORIO: todos los textos, claims, beneficios, features y copy de los image_prompts deben estar en ESPAÑOL. Solo se permite inglés si es el nombre de marca o nombre de producto (ej: "Ultra Mass", "Weight Gainer"). NUNCA generar copy descriptivo en inglés.
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

  const hasPeople = peopleMode === 'real';
  const styleSuffix = hasPeople
    ? isFashionProduct
      ? 'Fashion editorial photography, natural skin tones, soft studio lighting, 85mm lens, high-end fashion campaign, photorealistic.'
      : 'Lifestyle photography, person interacting naturally with the product in context. The product must appear in its exact original form — do NOT reimagine its shape, color or packaging. Photorealistic, natural lighting, authentic mood.'
    : isProductEcommerce
      ? 'Professional product photography or high-end retail graphic design, agency quality, photorealistic where applicable.'
      : 'Premium graphic design, bold typography, brand identity, agency quality, NOT generic AI art, portrait 4:5.';
  const productHint = productDetailImages.length > 0
    ? isProductEcommerce
      ? 'IMPORTANT: The provided reference images show the exact products — feature those specific products in the composition, replicating their appearance faithfully.'
      : isFashionProduct
        ? 'PRODUCT COLOR ACCURACY — CRITICAL: The reference images show the exact garment. Replicate its color with pixel-level accuracy — do NOT shift, lighten, darken, or desaturate. For warm neutrals (beige, sand, stone, khaki): preserve the warm undertone exactly, never render as white or gray. For solid-color garments, the color must match the reference photo precisely.'
        : 'PRODUCT ACCURACY — CRITICAL: The reference images show the exact product/packaging. Reproduce it with zero modifications: same shape, same colors, same label design, same proportions. Do NOT reimagine, stylize, or alter the product in any way. If the packaging is dark, keep it dark. If it has a specific label color, replicate it exactly.'
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
              'IDIOMA — CRÍTICO: TODO el texto visible en la imagen debe estar en ESPAÑOL. Solo se permite inglés para nombres de marca o producto. NUNCA generar copy descriptivo, beneficios, claims o CTAs en inglés.',
              'ANTI-HALLUCINATION — do NOT invent or add any data not in the brief: phone numbers, URLs, social handles, QR codes, star ratings, testimonials, customer counts, certifications, ingredient/material claims, deadlines, discounts, promotional mechanics, awards, or any statistics. Only use what is explicitly in the brief.',
              'do NOT include button-style CTA elements in the image (e.g. "Compra ahora", "Ver más", "Buy Now", "Shop Now" rendered as a visual button, pill, or badge) — those CTAs are configured in the ad platform (Meta, Google), not inside the creative image itself.',
            ].filter(Boolean).join(' ');

            try {
              let base64 = isProductEcommerce && productDetailImages[0]
                ? await editProductForConcept(openai, productDetailImages[0], fullPrompt)
                : await generateWithGptImage2(openai, fullPrompt, inputImages);

              // Retry with simplified prompt if content filter likely blocked the first attempt
              if (!base64) {
                const retryPrompt = [
                  `Premium advertising creative for ${brandKit.name}.`,
                  `${concept.concept_name} concept.`,
                  `Brand colors: ${brandKit.primary1}, ${brandKit.primary2}, ${brandKit.primary3}.`,
                  `Typography: ${brandKit.typography || 'bold sans-serif'}.`,
                  'Clean composition, product-focused, professional photography style.',
                  'Text in Spanish only.',
                  styleSuffix,
                ].filter(Boolean).join(' ');
                base64 = await generateWithGptImage2(openai, retryPrompt, []);
              }

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
