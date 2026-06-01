import { NextRequest } from 'next/server';
import OpenAI, { toFile } from 'openai';
import { BrandKit } from '@/app/types';
import { buildBrandKitContext } from '@/app/lib/brandKitContext';
import { getUserContext } from '@/app/lib/get-user-context';

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

export interface MessageAngle {
  key: string;
  name: string;
  angle?: string;
  hook: string;
  subline?: string;
  emphasis: string;
  concept?: string;
  format?: string;
  level?: 'product' | 'category';
}

const ANGLE_FORMAT_STYLES: Record<string, string> = {
  // Fashion
  'Fashion Editorial': 'High-fashion editorial photography. Magazine-quality composition. Premium, aspirational, slightly moody. Clean studio or cinematic urban setting. The garment is the absolute visual hero — every element of the composition built around it.',
  'Street Style': 'Candid urban fashion. Natural outdoor setting, city environment. Person in motion or at ease. Authentic, contemporary, relatable energy. Brand elements minimal — colors only in graphic overlays.',
  'Lifestyle Aspiracional': 'Aspirational lifestyle scene. Person embodying the identity this garment enables. Natural energy, in a setting that reinforces the aspiration. The garment is styled and present, not just worn.',
  'Studio Directo': 'Clean studio direct-response. Garment is the hero. Solid or gradient background using brand colors. High-contrast bold typography. Conversion-focused, uncluttered.',
  // Health / supplement / cosmetic
  'Lifestyle Activo': 'Active lifestyle setting — gym, outdoor, kitchen post-training. Person in motion or post-activity. Product naturally integrated. Energetic, authentic, high-contrast mood.',
  'Producto Hero': 'Product occupies 60-70% of frame. Clean brand-colored background. Typography prominent. No lifestyle distractions — pure product focus.',
  'Demostración': 'Product in active use. Shows the benefit, the moment of use, or the result. Clear, action-oriented, informative without being clinical.',
  'Problema-Solución': 'Visual tension narrative. Scene evokes the problem or frustration, product is the clear visual resolution. Mood shifts from tension to relief.',
  // General
  'Oferta-Precio': 'Bold direct-response graphic design. Brand color block prominent. Offer element clearly displayed. Product large and central. High-contrast, urgency-driven composition.',
  'Ocasión de Uso': 'Specific moment or occasion where this product fits naturally. Context and setting are the visual hero. Product appears seamlessly within the scene.',
  'Lifestyle con Mascota': 'Owner and pet sharing a natural, warm moment. Product integrated into their routine. Authentic, emotional, lifestyle-focused.',
};

const CLOTHING_TERMS = /\b(prenda|vestido|pantalón|remera|camiseta|camisa|campera|buzo|short|pollera|falda|indumentaria|calzado|zapatilla|zapato|tela|tejido|outfit|jean|jogger|bikini|traje|garment|clothing|apparel|fabric|dress|shirt|pants|jacket|hoodie|sneaker|shoe|top|blouse|skirt|coat|sleeve|collar|hem|knit|denim|cotton|polyester)\b/i;

const HEALTH_TERMS = /\b(suplemento|proteína|proteina|creatina|colágeno|colageno|vitamina|omega|probiótico|probiotico|prebiótico|prebiotico|aminoácido|aminoacido|bcaa|whey|caseína|caseina|glutamina|magnesio|zinc|hierro|calcio|biotina|melatonina|curcumina|ashwagandha|spirulina|chlorella|antioxidante|quemador|fat burner|pre-workout|preworkout|mass gainer|suero|nutrición|nutricion|dieta|adelgazar|bajar de peso|perder peso|déficit calórico|deficit calorico|salud|bienestar|wellness|health|supplement|multivitamínico|multivitaminico|enzimas digestivas|fibra dietética|fibra dietetica|colesterol|glucosa|tensión arterial|tension arterial|inmunidad|sistema inmune)\b/i;

const PET_TERMS = /\b(mascota|perro|gato|cachorro|gatito|dog|cat|puppy|kitten|pet|collar.*perro|correa|leash|juguete.*perro|juguete.*gato|comida.*perro|comida.*gato|alimento.*perro|alimento.*gato|alimento.*mascota|pienso|croqueta|snack.*perro|snack.*gato|pelaje|pulga|garrapata|antiparasit|veterinar|canino|felino|pet food|raza)\b/i;

const BABY_TERMS = /\b(bebé|bebe|baby|infante|infant|recién nacido|recien nacido|newborn|lactante|pañal|panal|diaper|cuna|carriola|cochecito|stroller|biberón|biberon|mamadera|chupete|pacifier|ropa.*beb[eé]|juguete.*beb[eé]|silla.*beb[eé]|portabeb[eé]|babero|bib|embarazada|maternidad|nursery)\b/i;

const FOOD_TERMS = /\b(receta|cocina|gastronomía|snack[^s]|golosina|chocolate|galleta|cereal|granola|pasta|arroz|harina|aceite|salsa|condimento|especia|mermelada|miel|café|cafe|infusión|infusion|proteína vegetal|proteina vegetal|vegano|vegana|orgánico|organico|sin gluten|gluten.?free|keto|paleo|plant.?based|comida casera|helado|postre|bebida energética|bebida energetica|jugo|refresco|yerba|mate)\b/i;

const COSMETIC_TERMS = /\b(crema|sérum|serum|hidratante|moisturizer|tónico|tonico|exfoliant|mascarilla facial|mascarilla.*cara|contorno de ojos|retinol|niacinamida|vitamina c|ácido hialurónico|acido hialuronico|protector solar|sunscreen|base de maquillaje|foundation|labial|lipstick|delineador|eyeliner|rimel|máscara de pestañas|mascara de pestañas|rubor|blush|sombra de ojos|eyeshadow|bb cream|cc cream|antiedad|anti.?edad|antiage|anti.?age|manchas.*cara|manchas.*rostro|acné|acne|poros|primer.*cara|primer.*maquillaje|setting spray|desmaquillante|tóner|toner|limpiador facial|micellar)\b/i;

const PRODUCT_DESCRIPTION_PROMPT_FASHION = `Sos un técnico de producto de moda de alta gama. Analizá esta prenda y describila con precisión quirúrgica para que pueda ser reproducida EXACTAMENTE por un modelo de IA generativa. Imaginá que quien lee tu descripción no puede ver la foto — tu texto es el único recurso.

Describí en este orden exacto:

1. TIPO DE PRENDA: categoría (remera, pantalón, vestido, campera, etc.), silueta y corte (oversize, entallado, recto, cargo, etc.), largo
2. COLOR BASE — ES LO MÁS CRÍTICO: describí el color con máxima precisión. NO uses solo el nombre del color. Usá referencias concretas: tono exacto (ej: "beige arena cálido, similar al tono de la arena seca — NO es blanco, NO es gris, tiene un subtono cálido visible", "verde oliva apagado con subtono amarillo", "negro carbón con leve subtono azulado"). Describí cómo se comporta bajo la luz (¿aclara? ¿cambia de tono?), su saturación (¿es vivo o apagado?) y su temperatura (¿frío o cálido?). Si es un color sólido, remarcalo explícitamente. Si tiene variaciones de tono por pliegues o tejido, describí esas variaciones. Para neutros cálidos (beige, arena, tostado, crudo, khaki), siempre aclará que NO debe renderizarse como blanco ni gris.
3. ESTAMPADO / PRINT (si existe): describí CADA elemento gráfico individualmente — qué forma tiene, de qué color exacto, tamaño relativo al total de la prenda (ej: "ocupa el 30% del frente"), POSICIÓN EXACTA (centrado en el pecho, esquina inferior derecha, a 5cm del dobladillo, cubriendo toda la superficie, etc.), orientación, contraste con el fondo. Si el estampado es repetitivo (all-over print), describí el módulo que se repite y su escala. Si no hay estampado, indicar "color sólido uniforme".
4. MATERIALES Y TEXTURA: acabado (mate, satinado, brillante), tejido visible (denim, gabardina, punto, etc.), peso visual, transparencia
5. DETALLES DE CONFECCIÓN: tiro (alto, medio, bajo), piernas (ancho, ajuste), bolsillos, cintura (elástico, cierre, trabillas), costuras decorativas, cualquier detalle funcional. TERMINACIONES — MUY IMPORTANTE: describí con detalle cómo termina cada borde de la prenda: ¿ruedo simple, doble, elástico, ribete, deshilachado, ancho del doblez? ¿El borde queda suelto, ajustado, acampanado? ¿Tiene algún grosor o volumen visible en el borde? Para pantalones: ¿el tobillo queda suelto, con puño, con elástico, con pinza? Para remeras: ¿el borde inferior queda recto, curvo, cortado raw?
6. ELEMENTOS ÚNICOS: cualquier detalle que diferencie esta prenda de una genérica

CRÍTICO para pantalones y prendas de color sólido: el color debe quedar completamente fiel. Si es beige, describí exactamente qué tipo de beige. Si es negro, indicá si tiene subtono. La IA tiende a desaturar o cambiar la temperatura del color — tu descripción debe ser lo suficientemente específica para evitarlo.
CRÍTICO: NO menciones ninguna marca ni logo de terceros.
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

async function applyGarmentInline(
  openai: OpenAI,
  conceptBase64: string,
  productDataUrls: string[],
  productDescription: string,
  peopleMode: string,
  personDescription: string,
): Promise<string> {
  const conceptDataUrl = conceptBase64.startsWith('data:')
    ? conceptBase64
    : `data:image/png;base64,${conceptBase64}`;

  const personPart = (peopleMode !== 'none' && personDescription)
    ? `\nPERSONA: ${personDescription}. La persona lleva puesto exactamente este producto.`
    : '';

  const productPart = productDescription
    ? `\nPRODUCTO A APLICAR (reproducir exactamente, sin simplificar):\n${productDescription}`
    : '\nPRODUCTO A APLICAR: el producto exacto que aparece en las imágenes de referencia — usá las imágenes como fuente principal de verdad visual.';

  const multiProductNote = productDataUrls.length > 1
    ? `\nHay ${productDataUrls.length} imágenes de referencia de productos — aplicá TODOS los productos visibles (ej: remera + pantalón, campera + falda).`
    : '';

  const prompt = `Tomá este concepto visual de moda y ÚNICAMENTE reemplazá las prendas/productos de la persona por los productos exactos que aparecen en las imágenes de referencia. TODO lo demás debe quedar IDÉNTICO.
${productPart}
${personPart}
${multiProductNote}

IMPORTANTE — las imágenes de referencia del producto son la fuente principal de verdad visual. Reproducí el producto TAL CUAL se ve en la foto: mismo color de píxel, misma textura, misma silueta.

QUÉ CAMBIAR:
- Las prendas/ropa de la persona → reemplazarlas por los productos de referencia exactos

QUÉ NO TOCAR (debe quedar pixel-perfect igual):
- TODOS los textos, tipografías, títulos, subtítulos, slogans y copy que aparecen en la imagen
- El fondo, colores del fondo, degradados y texturas
- La composición y layout general
- La iluminación y mood
- Logos, íconos o elementos gráficos de marca
- La pose y posición de la persona

REGLAS DE COLOR — CRÍTICO:
- El color de cada prenda debe ser IDÉNTICO al de la imagen de referencia. NO aclarar, NO oscurecer, NO desaturar, NO cambiar temperatura de color.
- Tomá el valor de color directamente de los píxeles de la referencia — no lo interpetes ni lo idealices.
- Para colores neutros cálidos (beige, arena, tostado, camel, crudo, khaki): NUNCA renderices como blanco ni gris claro. Mantené la temperatura cálida y saturación exacta del original.
- Para colores oscuros (negro, azul marino, marrón): NUNCA los ilumines ni aclarés.

PANTALONES Y PRENDAS INFERIORES — DOBLE ATENCIÓN:
- Si la prenda es un pantalón: prestá máxima atención al color — es donde el modelo tiende a fallar más.
- Telas lisas (twill, gabardina, cotton chino): superficie uniforme y suave, sin texturas artificiales ni arrugas exageradas.
- Replicá largo, ancho de pierna y tiro tal cual se ven en la referencia.

ESTAMPADO / PRINT — POSICIÓN Y TAMAÑO CRÍTICOS:
- Si la prenda tiene un gráfico, logo, ilustración o print, replicá su posición exacta, tamaño relativo y distancia a los bordes.
- NO reubiques ni redimensiones el estampado.

TERMINACIONES DE PRENDAS — REPLICAR EXACTAMENTE:
- Replicá cómo terminan todos los bordes visibles: tipo de ruedo, grosor del doblez, si queda suelto o ajustado.
- Pantalones: si el tobillo termina suelto, con puño doblado, con elástico o ajustado al tobillo — replicar exactamente.

REGLAS de producto:
- Mismo color, mismo estampado, misma silueta, mismo tejido que la referencia visual
- Si hay múltiples prendas, aplicá TODAS
- Estilo fashion editorial premium, fotorrealista`;

  const productImageContent = productDataUrls.map(img => ({
    type: 'input_image' as const,
    image_url: img,
    detail: 'high' as const,
  }));

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (openai.responses.create as any)({
        model: 'gpt-4o',
        input: [{
          role: 'user',
          content: [
            { type: 'input_image', image_url: conceptDataUrl, detail: 'high' },
            ...productImageContent,
            { type: 'input_text', text: prompt },
          ],
        }],
        tools: [{
          type: 'image_generation',
          model: 'gpt-image-2',
          quality: 'high',
          size: '1024x1536',
        }],
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const block of (response.output || [])) {
        if (block.type === 'image_generation_call' && block.result) {
          return block.result;
        }
      }
      console.warn(`applyGarmentInline: attempt ${attempt} no image block`);
    } catch (err) {
      console.error(`applyGarmentInline attempt ${attempt}:`, err);
      if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 1500));
    }
  }

  // Fallback: images.edit with [concept + product files]
  try {
    const toImageFile = async (dataUrl: string, name: string) => {
      const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      return toFile(Buffer.from(base64Data, 'base64'), name, { type: 'image/png' });
    };
    const conceptFile = await toImageFile(conceptDataUrl, 'concept.png');
    const productFiles = await Promise.all(
      productDataUrls.map((img, i) => toImageFile(img, `product-${i}.png`))
    );
    const response = await openai.images.edit({
      model: 'gpt-image-2',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      image: [conceptFile, ...productFiles] as any,
      prompt: 'Replace ONLY the clothing with the exact product from reference images. Preserve all text, background, layout, lighting, and pose. Pixel-accurate color and texture.',
      size: '1024x1536',
      quality: 'high',
    });
    return response.data?.[0]?.b64_json || '';
  } catch (err) {
    console.error('applyGarmentInline fallback failed:', err);
    return '';
  }
}

async function editProductForConcept(
  openai: OpenAI,
  productDataUrls: string[],
  editPrompt: string,
): Promise<string> {
  try {
    const imageFiles = await Promise.all(
      productDataUrls.map((url, i) => {
        const base64Data = url.includes(',') ? url.split(',')[1] : url;
        return toFile(Buffer.from(base64Data, 'base64'), `product-${i}.jpg`, { type: 'image/jpeg' });
      })
    );
    const response = await openai.images.edit({
      model: 'gpt-image-2',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      image: imageFiles.length === 1 ? imageFiles[0] : imageFiles as any,
      prompt: editPrompt,
      size: '1024x1536',
      quality: 'high',
    });
    return response.data?.[0]?.b64_json || '';
  } catch (err) {
    console.error('editProductForConcept failed:', err);
    return '';
  }
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

  let parsedBody: {
    brief?: string;
    brandKit: BrandKit;
    productImages?: string[];
    referenceImages?: string[];
    count?: number;
    productCount?: number;
    categoryCount?: number;
    peopleMode?: 'none' | 'real' | 'auto';
    excludeAngles?: MessageAngle[];
  };
  try {
    parsedBody = await req.json();
  } catch {
    return new Response('data: {"error":"Request inválido."}\n\ndata: {"done":true}\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
  }

  const {
    brief = '',
    brandKit,
    productImages = [] as string[],
    referenceImages = [],
    count = 4,
    productCount,
    categoryCount,
    peopleMode: rawPeopleMode = 'none',
    excludeAngles = [],
  } = parsedBody;

  if (!brandKit) {
    return new Response('data: {"error":"Configuración de marca requerida."}\n\ndata: {"done":true}\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
  }

  // Normalize: treat any unknown value as 'none'
  const peopleMode: 'none' | 'real' = rawPeopleMode === 'real' ? 'real' : 'none';

  // Resolve counts: if productCount/categoryCount provided use them, else split count 50/50
  let resolvedProductCount: number;
  let resolvedCategoryCount: number;
  if (productCount !== undefined && categoryCount !== undefined) {
    resolvedProductCount = Math.max(0, Math.min(productCount, 3));
    resolvedCategoryCount = Math.max(0, Math.min(categoryCount, 3));
  } else {
    const half = Math.max(1, Math.floor(count / 2));
    resolvedProductCount = half;
    resolvedCategoryCount = Math.max(0, count - half);
  }
  const targetCount = resolvedProductCount + resolvedCategoryCount;

  const openai = new OpenAI({ apiKey: ctx.openaiApiKey });
  const brandKitContext = buildBrandKitContext(brandKit);

  const productDataUrls = productImages
    .filter(Boolean)
    .map(img => img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`);
  const productDataUrl = productDataUrls[0] || '';

  const encoder = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController, data: object) =>
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

  // Step 0: detect if fashion product (text + vision) — always run when product photo available
  // so clothing items use fashion composition rules regardless of peopleMode.
  const isFashionBrief = CLOTHING_TERMS.test(brief + ' ' + (brandKit.clientRequest || '') + ' ' + (brandKit.styleDescription || ''));
  let isFashionProduct = isFashionBrief;

  if (productDataUrl && productDataUrl.length > 100) {
    try {
      const classifyRes = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Is this product a clothing item, garment, shoe, or wearable fashion accessory worn on the body? Answer only YES or NO.' },
            { type: 'image_url', image_url: { url: productDataUrl, detail: 'low' } },
          ],
        }],
        max_tokens: 5,
      });
      const answer = (classifyRes.choices[0].message.content || '').trim().toUpperCase();
      isFashionProduct = answer.startsWith('YES');
    } catch {
      // fallback to text-based detection
    }
  }

  // Detect health/wellness product (text-based only — no vision needed)
  const briefFull = brief + ' ' + (brandKit.clientRequest || '') + ' ' + (brandKit.styleDescription || '');
  const isHealthProduct = HEALTH_TERMS.test(briefFull);
  const isPetProduct = PET_TERMS.test(briefFull);
  const isBabyProduct = BABY_TERMS.test(briefFull);
  const isFoodProduct = !isHealthProduct && FOOD_TERMS.test(briefFull);
  const isCosmeticProduct = !isHealthProduct && COSMETIC_TERMS.test(briefFull);

  // Detect discount/offer in brief
  const DISCOUNT_TERMS = /(\d+\s*%\s*(off|desc(uento)?|de\s+descuento)|2x1|3x2|cuotas?\s+sin\s+inter[eé]s|envíos?\s+(gratis|gratuito|libre)|free\s+shipping|promo(ción)?|oferta|liquidaci[oó]n|precio\s+especial|hasta\s+\d+%|bundle|combo|\$\s*\d|\d+\s*pesos?\s+de\s+desc)/i;
  const hasDiscount = DISCOUNT_TERMS.test(brief + ' ' + (brandKit.clientRequest || ''));

  // Step 1: describe the product
  let productDescription = brief;
  if (productDataUrl && productDataUrl.length > 100) {
    const descPrompt = isFashionProduct ? PRODUCT_DESCRIPTION_PROMPT_FASHION : PRODUCT_DESCRIPTION_PROMPT_GENERIC;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const descResponse = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: descPrompt },
              ...productDataUrls.slice(0, 3).map(url => ({
                type: 'image_url' as const,
                image_url: { url, detail: 'high' as const },
              })),
            ],
          }],
          max_tokens: 1200,
        });
        const desc = descResponse.choices[0].message.content || '';
        if (!isRefusal(desc)) { productDescription = desc; break; }
      } catch (err) {
        console.error(`testing-angles describe attempt ${attempt + 1}:`, err);
      }
    }
  }

  // Step 2: describe reference person (any product type when peopleMode real and reference provided)
  let personDescription = '';
  if (peopleMode !== 'none' && referenceImages.length > 0) {
    try {
      const personRes = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Describí brevemente las características físicas de las personas en estas imágenes: tono de piel, cabello, complexión, edad aproximada. Máximo 2 oraciones.' },
            ...referenceImages.slice(0, 2).map(img => ({
              type: 'image_url' as const,
              image_url: { url: img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`, detail: 'low' as const },
            })),
          ],
        }],
        max_tokens: 150,
      });
      personDescription = personRes.choices[0].message.content || '';
    } catch (err) {
      console.error('testing-angles person describe failed:', err);
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      const heartbeat = setInterval(() => {
        try { send(controller, { ping: true }); } catch { /* controller closed */ }
      }, 30_000);
      try {
        // Step 3: generate product + category angles (text only) with GPT-4o
        const excludeNotice = excludeAngles.length > 0
          ? `\nÁNGULOS YA PROBADOS — NO REPETIR NI HACER VARIACIONES SIMILARES: ${excludeAngles.map(a => `"${a.name}" (hook: "${a.hook}")`).join(', ')}. Generá ángulos genuinamente distintos en enfoque y argumento.`
          : '';

        const anglesPrompt = `Sos un estratega de publicidad directa de performance para e-commerce. Tu especialidad es identificar ángulos publicitarios reales — no beneficios genéricos ni características del producto.

${productDataUrl && productDataUrl.length > 100
  ? `DESCRIPCIÓN DEL PRODUCTO (análisis visual): ${productDescription}\nBRIEF DE CAMPAÑA: ${brief || '(sin brief adicional)'}`
  : `PRODUCTO / BRIEF: ${brief || '(sin brief adicional)'}`}
MARCA: ${brandKit.name}${brandKit.clientRequest ? ` — ${brandKit.clientRequest}` : ''}${excludeNotice}

---

QUÉ ES UN ÁNGULO PUBLICITARIO — leé esto antes de responder:

Un ángulo NO es un beneficio ni una característica del producto.
Un ángulo ES la hipótesis estratégica que define por qué un grupo ESPECÍFICO de personas debería querer este producto, desde una situación, problema, deseo o creencia particular.

Un ángulo tiene tres partes:
1. PERSONA: quién es exactamente (específico, no genérico — no "personas que van al gym" sino "personas que ya entrenan hace meses pero no ven cambios en su cuerpo")
2. TENSIÓN: qué problema concreto, frustración, deseo o creencia tiene esa persona que la tiene en modo de búsqueda
3. HIPÓTESIS: por qué este producto resuelve exactamente esa tensión — el puente entre la tensión y el producto

Ejemplos de lo que NO es un ángulo:
❌ "Fuerza y Recuperación" → es una característica
❌ "Calidad Premium" → es un atributo genérico
❌ "Para quienes cuidan su alimentación" → es demasiado amplio, no hay tensión

Ejemplos de ángulos reales:
✅ "Personas que entrenan consistentemente pero no ven cambios porque no están llegando a su proteína diaria — no por falta de disciplina sino por falta de tiempo para preparar comidas extras"
✅ "Compradores que ya quemaron plata en camperas baratas que se mojaron a los tres meses de lluvia, y ahora quieren comprar bien una sola vez"
✅ "Mujeres urbanas que necesitan una campera impermeable pero rechazan todas las que encuentran porque parecen de trekking y no combinan con su estilo del día a día"

El hook es la expresión del ángulo — cómo abrís el anuncio para que esa persona específica sienta que le estás hablando a ella.

---

Generá EXACTAMENTE:
${resolvedProductCount > 0 ? `- ${resolvedProductCount} ÁNGULOS DE PRODUCTO: la tensión gira en torno a algo específico de ESTE producto — su diferenciador, formulación, precio, comparación con alternativas, o una objeción/duda concreta que tiene el comprador sobre este producto en particular.` : ''}
${resolvedCategoryCount > 0 ? `- ${resolvedCategoryCount} ÁNGULOS DE CATEGORÍA: la tensión gira en torno al estilo de vida, contexto u ocasión de uso. El producto aparece como solución a algo más amplio que tiene esa persona en su vida. El hook habla de la situación de la persona, NO del producto.` : ''}
${resolvedProductCount === 0 ? 'Generá SOLO ángulos de categoría. El array "product_angles" debe estar vacío [].' : ''}
${resolvedCategoryCount === 0 ? 'Generá SOLO ángulos de producto. El array "category_angles" debe estar vacío [].' : ''}

Cada ángulo debe apuntar a una tensión GENUINAMENTE DISTINTA — no el mismo argumento redactado diferente.
PROHIBIDO inventar precios, métricas, descuentos o resultados que no estén en el brief.
${hasDiscount ? `
OFERTA / DESCUENTO DETECTADO EN EL BRIEF:
El brief menciona una oferta concreta. Si esa oferta resuelve una tensión real (ej: "quería comprarlo pero el precio frenaba la decisión"), dedicá al menos 1 ángulo de producto a esa tensión de precio/valor. El descuento no es el ángulo en sí — es el resolutor de la tensión. La persona ya quería el producto, el precio era la barrera, y la oferta la derriba.
❌ NO: "Ahora con 20% off" (descripción de oferta, no ángulo)
✅ SÍ: "Personas que posponían la compra porque les parecía caro, esperando el momento justo — ese momento es ahora"
Si la oferta no encaja naturalmente con ninguna tensión real, no la fuerces — priorizá los ángulos más sólidos.` : ''}
${isHealthProduct ? `
RESTRICCIÓN LEGAL — NICHO SALUD Y BIENESTAR:
Este es un producto de salud/nutrición. Los ángulos DEBEN respetar estas reglas sin excepción:
❌ PROHIBIDO: afirmaciones médicas ("cura", "trata", "previene enfermedades", "aprobado clínicamente", "comprobado científicamente", "aumenta la testosterona X%", "mejora la memoria", "reduce el colesterol")
❌ PROHIBIDO: prometer resultados garantizados de salud que no estén textualmente en el brief
❌ PROHIBIDO: diagnosticar condiciones o sugerir que reemplaza tratamiento médico
✅ CORRECTO: hablar de experiencia, energía percibida, contexto de uso, estilo de vida, objetivos personales
✅ CORRECTO: usar los claims que el usuario incluyó literalmente en el brief (si dice "alto en proteína", podés usarlo)
✅ CORRECTO: tensiones de estilo de vida como "no llegás a tu proteína diaria" en lugar de "tu cuerpo no sintetiza músculo"
Los hooks deben sonar como algo que diría una persona real — NO como un estudio científico ni como una promesa de resultado.` : ''}
${isPetProduct ? `
RESTRICCIÓN — NICHO MASCOTAS:
Este es un producto para mascotas. Los ángulos DEBEN respetar estas reglas:
❌ PROHIBIDO: afirmaciones veterinarias o médicas que no estén literalmente en el brief ("aprobado por veterinarios", "cura enfermedades", "previene X condición")
❌ PROHIBIDO: prometer resultados de salud garantizados para el animal
✅ CORRECTO: tensiones del dueño — preocupación, amor, experiencia de cuidado
✅ CORRECTO: comportamiento observable, disfrute o bienestar del animal según lo que dice el brief
Los hooks deben hablar desde la perspectiva del dueño, no del animal.` : ''}
${isBabyProduct ? `
RESTRICCIÓN — NICHO BEBÉS / MATERNIDAD:
Este es un producto para bebés o mamás. Los ángulos DEBEN respetar estas reglas:
❌ PROHIBIDO: afirmaciones sobre desarrollo cognitivo, motor o emocional del bebé que no estén en el brief
❌ PROHIBIDO: prometer seguridad absoluta o reemplazar consejo pediátrico
✅ CORRECTO: tensiones de los padres — tranquilidad, practicidad, confianza, amor por su bebé
✅ CORRECTO: contexto de uso cotidiano y experiencia familiar natural
Los hooks deben sonar como algo que diría un papá o mamá real, no una promesa de marketing infantil.` : ''}
${isCosmeticProduct ? `
RESTRICCIÓN — NICHO COSMÉTICA Y SKINCARE:
Este es un producto de belleza o cuidado de la piel. Los ángulos DEBEN respetar estas reglas:
❌ PROHIBIDO: afirmaciones médicas o dermatológicas que no estén en el brief ("trata el acné", "aprobado dermatológicamente", "elimina arrugas clínicamente")
❌ PROHIBIDO: prometer resultados estéticos garantizados más allá de lo que dice el brief
✅ CORRECTO: tensiones de experiencia — cómo se siente la piel, confianza, rutina, acabado
✅ CORRECTO: usar los claims que el usuario incluyó literalmente en el brief
Los hooks deben sonar a algo que diría una persona real sobre su experiencia, no a copy regulatorio.` : ''}
${isFoodProduct ? `
RESTRICCIÓN — NICHO ALIMENTOS:
Este es un producto alimenticio. Los ángulos DEBEN respetar estas reglas:
❌ PROHIBIDO: afirmaciones de salud o nutrición que no estén literalmente en el brief
❌ PROHIBIDO: prometer resultados de peso, energía o bienestar que el brief no mencione
✅ CORRECTO: tensiones de sabor, ocasión, practicidad, placer, momento compartido
✅ CORRECTO: usar los claims nutricionales que el usuario incluyó textualmente en el brief` : ''}

---

---

FORMATO Y CONCEPTO VISUAL — para cada ángulo:

REGLA CRÍTICA: el concepto visual debe expresar la TENSIÓN ESPECÍFICA de ese ángulo — no un visual genérico del nicho. Dos ángulos distintos DEBEN producir conceptos visualmente distintos. Si el ángulo habla de frustración por falta de resultados, el visual debe evocar esa frustración. Si habla de precio como barrera, debe evocar el alivio de superarla. Si habla de ocasión de uso, debe mostrar esa ocasión concreta. Un concepto que podría servir para cualquier ángulo del mismo nicho es un concepto fallido.

Elegí el formato más adecuado de esta lista: ${isFashionProduct
  ? 'Fashion Editorial / Street Style / Lifestyle Aspiracional / Studio Directo'
  : (isHealthProduct || isCosmeticProduct)
  ? 'Lifestyle Activo / Producto Hero / Problema-Solución / Oferta-Precio / Demostración'
  : isPetProduct
  ? 'Lifestyle con Mascota / Producto Hero / Ocasión de Uso / Problema-Solución'
  : isFoodProduct
  ? 'Ocasión de Uso / Producto Hero / Demostración / Lifestyle Aspiracional'
  : 'Producto Hero / Lifestyle Aspiracional / Problema-Solución / Oferta-Precio / Ocasión de Uso'}

CONCEPTO VISUAL: describí en 1-2 oraciones la ejecución específica de ESTE ángulo. Tiene que ser derivado de la tensión del ángulo — qué estado emocional o situación concreta transmite, qué hay en el frame y por qué eso refuerza ESA tensión particular. No describas una foto genérica del nicho.

SUBLINE: una línea corta de apoyo al headline, máx 7 palabras, que refuerce la tensión del ángulo.

Respondé SOLO con JSON:
{
  "product_angles": [
    {
      "name": "etiqueta descriptiva simple, máx 3 palabras (ej: 'Precio / Oferta', 'Falta de Tiempo', 'Sin Resultados'). NO uses frases de copy.",
      "angle": "hipótesis estratégica: persona específica + tensión concreta + por qué este producto la resuelve (2-3 oraciones)",
      "hook": "máx 8 palabras, español, directo, que detenga el scroll",
      "subline": "línea de apoyo al headline, máx 7 palabras",
      "emphasis": "qué tiene que SENTIR o VER la persona al ver la imagen",
      "format": "nombre del formato elegido de la lista",
      "concept": "ejecución visual específica: qué hay en el frame, composición, mood, setting, elementos gráficos — 1-2 oraciones concretas"
    }
  ],
  "category_angles": [
    {
      "name": "etiqueta descriptiva simple, máx 3 palabras (ej: 'Estilo de Vida', 'Ocasión', 'Primera Compra'). NO uses frases de copy.",
      "angle": "hipótesis estratégica: persona + tensión de estilo de vida + por qué esta categoría la resuelve (2-3 oraciones)",
      "hook": "máx 8 palabras, español, directo, que detenga el scroll",
      "subline": "línea de apoyo al headline, máx 7 palabras",
      "emphasis": "qué tiene que SENTIR o VER la persona al ver la imagen",
      "format": "nombre del formato elegido de la lista",
      "concept": "ejecución visual específica: qué hay en el frame, composición, mood, setting, elementos gráficos — 1-2 oraciones concretas"
    }
  ]
}`;

        let angles: MessageAngle[] = [];
        const buildAngles = (parsed: Record<string, unknown>, startIdx = 0) => {
          let idx = startIdx;
          const productAngles: MessageAngle[] = ((parsed.product_angles as Omit<MessageAngle, 'key' | 'level'>[]) || [])
            .slice(0, resolvedProductCount)
            .map((a) => ({
              key: `angle-${idx++}`,
              name: a.name || `Ángulo Producto ${idx}`,
              angle: a.angle || '',
              hook: a.hook || '',
              subline: a.subline || '',
              emphasis: a.emphasis || '',
              concept: a.concept || '',
              format: a.format || '',
              level: 'product' as const,
            }));
          const categoryAngles: MessageAngle[] = ((parsed.category_angles as Omit<MessageAngle, 'key' | 'level'>[]) || [])
            .slice(0, resolvedCategoryCount)
            .map((a) => ({
              key: `angle-${idx++}`,
              name: a.name || `Ángulo Categoría ${idx}`,
              angle: a.angle || '',
              hook: a.hook || '',
              subline: a.subline || '',
              emphasis: a.emphasis || '',
              concept: a.concept || '',
              format: a.format || '',
              level: 'category' as const,
            }));
          return { productAngles, categoryAngles };
        };

        try {
          const runAngleGen = async () => {
            const res = await openai.chat.completions.create({
              model: 'gpt-4o',
              messages: [{ role: 'user', content: anglesPrompt }],
              response_format: { type: 'json_object' },
              max_tokens: 2000,
              temperature: 0.9,
            });
            return JSON.parse(res.choices[0].message.content || '{}');
          };

          let parsed = await runAngleGen();
          let { productAngles, categoryAngles } = buildAngles(parsed);

          // Retry once if counts don't match
          if (productAngles.length < resolvedProductCount || categoryAngles.length < resolvedCategoryCount) {
            console.warn(`testing-angles: got ${productAngles.length}P+${categoryAngles.length}C, expected ${resolvedProductCount}P+${resolvedCategoryCount}C — retrying`);
            parsed = await runAngleGen();
            const rebuilt = buildAngles(parsed);
            // Use the retry result only if it's better
            if (rebuilt.productAngles.length + rebuilt.categoryAngles.length >= productAngles.length + categoryAngles.length) {
              productAngles = rebuilt.productAngles;
              categoryAngles = rebuilt.categoryAngles;
            }
          }

          angles = [...productAngles, ...categoryAngles];

          // Fallback: if API didn't split properly, treat all as legacy (product)
          if (angles.length === 0 && (parsed as Record<string, unknown>).angles) {
            angles = ((parsed as Record<string, unknown[]>).angles as Omit<MessageAngle, 'key'>[])
              .slice(0, targetCount)
              .map((a, i) => ({
                key: `angle-${i}`,
                name: a.name || `Ángulo ${i + 1}`,
                hook: a.hook || '',
                emphasis: a.emphasis || '',
                level: 'product' as const,
              }));
          }
        } catch (err) {
          console.error('testing-angles: angle generation failed:', err);
          send(controller, { error: 'Error al generar ángulos. Intentá de nuevo.' });
          send(controller, { done: true, isFashionProduct, productDescription, personDescription });
          return;
        }

        if (angles.length === 0) {
          send(controller, { error: 'No se pudieron generar ángulos. Agregá más contexto en el brief.' });
          send(controller, { done: true, isFashionProduct, productDescription, personDescription });
          return;
        }

        // Stream angles immediately so UI shows labels while images generate
        send(controller, { angles });

        // Step 4: generate one image per angle
        const hasProductPhoto = productDataUrl && productDataUrl.length > 100;
        const refImageUrls = referenceImages.slice(0, 2).map(img =>
          img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`
        );

        await Promise.allSettled(
          angles.map(async (angle, angleIndex) => {
            if (angleIndex > 0) await new Promise(r => setTimeout(r, angleIndex * 600));
            const isCategory = angle.level === 'category';

            let fullPrompt: string;

            if (isFashionProduct) {
              const garmentSection = hasProductPhoto
                ? [
                    'PRENDA A MOSTRAR — Las imágenes adjuntas son la FUENTE PRIMARIA DE VERDAD VISUAL. Tomalos directamente de los píxeles de la foto — no los interpetes, no los idealices, no los simplifiques.',
                    productDescription ? `Descripción técnica de respaldo (usala solo para reforzar lo que ves en la foto): ${productDescription}` : '',
                    'REGLAS DE COLOR — CRÍTICO: El color de cada prenda debe ser IDÉNTICO al de la imagen de referencia. NO aclarar, NO oscurecer, NO desaturar, NO cambiar temperatura de color. Tomá el valor de color directamente de los píxeles de la referencia — no lo interpetes ni lo idealices.',
                    'Para neutros cálidos (beige, arena, tostado, camel, crudo, khaki): NUNCA renderices como blanco ni gris claro. Mantené la temperatura cálida exacta de la foto.',
                    'Para colores oscuros (negro, azul marino, marrón): NUNCA los ilumines ni aclarés.',
                    'PANTALONES Y PRENDAS INFERIORES — DOBLE ATENCIÓN: si la prenda es un pantalón, prestá máxima atención al color — es donde el modelo tiende a fallar más. Telas lisas (twill, gabardina): superficie uniforme y suave, sin texturas artificiales ni arrugas exageradas. Replicá largo, ancho de pierna y tiro tal cual se ven en la referencia. NO reclasifiques el tipo de pantalón — usá el nombre que indica el brief.',
                    'Mismo estampado pixel-perfect, misma silueta, mismo tejido, mismas proporciones que en la referencia visual.',
                    'POSICIÓN Y TAMAÑO DEL ESTAMPADO — CRÍTICO: si la prenda tiene un gráfico, logo, ilustración o print, replicá su posición exacta en la prenda (centrado en el pecho, esquina inferior, etc.), el tamaño relativo que ocupa (porcentaje del área de la prenda) y la distancia a los bordes. NO reubiques ni redimensiones el estampado.',
                    'TERMINACIONES DE PRENDAS — CRÍTICO: replicá exactamente cómo terminan los bordes de la prenda. Para pantalones: si el tobillo queda suelto, con puño, con elástico o ajustado. Para remeras/vestidos: si el borde es recto, curvo, raw o con doblez visible. El grosor y tipo de ruedo deben ser idénticos a la referencia.',
                  ].filter(Boolean).join(' ')
                : `PRENDA: ${productDescription}.`;

              const personSection = personDescription
                ? `PERSONA: ${personDescription}. La persona lleva puesta exactamente esta prenda.`
                : 'Persona: modelo fashion aspiracional, actitud natural y confiada.';

              const compositionSection = isCategory
                ? 'COMPOSICIÓN: Lifestyle fashion. Escena o contexto donde se usaría esta prenda — el foco es el lifestyle, la ocasión o la emoción. La escena es aspiracional y relatable. LA PRENDA SE MUESTRA PUESTA CON FIDELIDAD EXACTA — misma prenda de la foto, mismo color pixel-perfect, aunque el contexto sea aspiracional.'
                : 'COMPOSICIÓN: Fashion direct-response. La persona lleva puesta la prenda exacta. La prenda es el héroe visual. Fondo limpio o setting mínimo. Actitud aspiracional y directa, no editorial puro.';

              fullPrompt = [
                garmentSection,
                personSection,
                angle.format ? `FORMATO VISUAL — ${angle.format}: ${ANGLE_FORMAT_STYLES[angle.format] || ''}` : compositionSection,
                angle.concept ? `CONCEPTO VISUAL: ${angle.concept}` : '',
                `HEADLINE (mostrá este texto exacto, grande y en negrita): "${angle.hook}"`,
                angle.subline ? `SUBLINE (mostrá este texto más pequeño bajo el headline): "${angle.subline}"` : '',
                angle.angle ? `[CONTEXTO ESTRATÉGICO — NO texto a mostrar en la imagen]: ${angle.angle}` : '',
                'MOBILE-FIRST TEXT RULE: headline y subline son el único texto visible. Cero párrafos. Cero body copy.',
                `Marca: ${brandKit.name}. Colores de marca (SOLO para fondos, textos y elementos gráficos — NUNCA aplicar al producto): ${brandKit.primary1}, ${brandKit.primary2}, ${brandKit.primary3}. Tipografía: ${brandKit.typography || 'bold sans-serif'}.`,
                `Contexto de marca: ${brandKitContext}`,
                'Fashion editorial photography — natural skin tones, soft studio or lifestyle lighting, 85mm lens equivalent, high-end fashion campaign quality, photorealistic.',
                'Portrait 1024x1536. Todo el texto en español. Calidad agencia profesional.',
                'ANTI-ALUCINACIÓN: NO inventés precios, descuentos, métricas, teléfonos, URLs ni estadísticas que no estén en el brief.',
                hasDiscount
                  ? 'PRECIOS Y OFERTAS — REGLA: El brief incluye información promocional real. Podés mostrar en la imagen los valores exactos que aparecen en el brief (precio, porcentaje de descuento, cuotas sin interés, envío gratis). PROHIBIDO inventar o modificar cualquier valor. Reproducí EXACTAMENTE como aparece en el brief.'
                  : 'PROHIBICIÓN ABSOLUTA DE PRECIOS: NO escribas ningún número de precio, precio tachado, porcentaje de descuento, etiqueta "ANTES/AHORA", ni ningún valor monetario en la imagen. Si el ángulo habla de precio o valor, expresalo SOLO con palabras en el headline — nunca con números.',
                'NO incluyas botones CTA en la imagen.',
                `REGLA DE LOGO: NO generes ningún logo, ícono, símbolo ni elemento gráfico de marca. Si necesitás identificar la marca, escribí únicamente el nombre "${brandKit.name}" como texto plano — sin decoración, sin ícono, sin wordmark inventado.`,
                hasProductPhoto ? 'PRIORIDAD #1 — FIDELIDAD DE PRENDA: esta es una pieza de testeo publicitario. La prenda en la imagen generada DEBE ser idéntica a la foto de referencia — mismo color pixel-perfect, misma silueta, mismo tejido, mismo estampado en la misma posición exacta. NO interpretes, NO idealices, NO simplifiques. Cualquier diferencia hace inútil el testeo.' : '',
                hasProductPhoto ? 'PRODUCT COLOR ACCURACY — CRITICAL: The reference images show the exact garment. Replicate its color with pixel-level accuracy — do NOT shift, lighten, darken, or desaturate. For warm neutrals (beige, sand, stone, khaki): preserve the warm undertone exactly, never render as white or gray. For solid-color garments, the color must match the reference photo precisely.' : '',
                hasProductPhoto ? 'VERIFICACIÓN FINAL — REGLA ABSOLUTA: antes de renderizar, confirmá que el color de la prenda coincide exactamente con la referencia. Para colores oscuros (negro, marino, marrón): NUNCA aclarar. Para neutros cálidos: NUNCA renderizar como blanco ni gris.' : '',
              ].filter(Boolean).join(' ');

            } else {
              const productConstraint = hasProductPhoto
                ? [
                    '⚠️ ABSOLUTE RULE — THE PRODUCT IN THE PHOTO IS THE EXACT PRODUCT BEING ADVERTISED. DO NOT recreate, reimagine, rebrand, or relabel it. Show the exact product from the reference photo as-is — its label text, brand name on packaging, colors, shape, and design are FIXED AND IMMUTABLE.',
                    'DO NOT add, modify, or remove any text from the product label or packaging. DO NOT write the advertiser brand name on the product. The product label belongs to the manufacturer shown in the photo — leave it exactly as it appears.',
                    'PRODUCT COLOR LOCK — TOP PRIORITY: The reference photo is the absolute source of truth. Reproduce the exact color, shape, packaging, and proportions pixel-perfect. Do NOT interpret, stylize, or adjust anything.',
                    productDescription ? `Technical description for backup (only use to reinforce what you see in the photo): ${productDescription}` : '',
                    'CRITICAL: The brand palette listed below is ONLY for backgrounds, overlays, and ad copy text — NEVER apply brand colors to the product itself.',
                  ].filter(Boolean).join(' ')
                : `PRODUCT: ${productDescription}.`;

              // Niche-aware person instruction for non-fashion products
              const personBase = personDescription ? `PERSON: ${personDescription}.` : 'PERSON:';
              const personInstruction = peopleMode === 'real'
                ? isPetProduct
                  ? `${personBase} The person appears WITH their pet (dog/cat/animal). The animal MUST be present in the scene — using, wearing, or interacting with the product. The pet is as important as the person. Authentic, lifestyle context. The product appears in its original form.`
                  : isBabyProduct
                  ? `${personBase} Parent with their baby in a warm, natural context. Product held or used by the parent — do NOT show the baby directly consuming or applying the product. Safe, aspirational family scene.`
                  : isFoodProduct
                  ? `${personBase} Person in a food lifestyle context — cooking, serving, or enjoying the food. Focus on food presentation and the moment. Natural, appetizing, aspirational. The product appears in its original form.`
                  : isCosmeticProduct
                  ? `${personBase} Person in a beauty/skincare context — holding the product or showing a natural fresh result. Do NOT show direct product application on face or skin. Aspirational, clean beauty aesthetic.`
                  : `${personBase} The person is naturally using or holding the product in context. Aspirational attitude. The product must appear in its exact original form — do NOT show direct consumption, application on skin, or direct use on the body. Photorealistic, natural lighting.`
                : '';

              const compositionInstruction = isCategory
                ? peopleMode === 'real'
                  ? 'CREATIVE FORMAT: Lifestyle/context. Person naturally interacting with the product in their everyday context. The product is present and faithful to the reference. Context is the visual hero. ONE bold headline, ONE short subline.'
                  : 'CREATIVE FORMAT: Lifestyle/context. Show the context, lifestyle, or situation where this product is used. The product is present but the CONTEXT is the visual hero. ONE bold headline, large and prominent. One short supporting subline.'
                : peopleMode === 'real'
                  ? 'CREATIVE FORMAT: Lifestyle direct response. Person naturally using or holding the exact product from the reference photo. Product clearly visible and faithful to reference. Aspirational mood, photorealistic. ONE bold headline, ONE short subline.'
                  : 'CREATIVE FORMAT: Direct response. Product occupies 60-70% of the frame, prominent and clear. No lifestyle, no editorial — pure direct response. ONE bold headline, large and prominent. One short supporting subline.';

              const photographyStyle = peopleMode === 'real'
                ? 'Lifestyle photography, person interacting naturally with the product in context. The product must appear in its exact original form. Photorealistic, natural lighting, authentic mood.'
                : 'Professional product photography or high-end retail graphic design, agency quality.';

              fullPrompt = [
                productConstraint,
                personInstruction,
                angle.format ? `VISUAL STYLE — ${angle.format}: ${ANGLE_FORMAT_STYLES[angle.format] || ''}` : compositionInstruction,
                angle.concept ? `VISUAL CONCEPT: ${angle.concept}` : '',
                `HEADLINE (display this exact text, large and bold): "${angle.hook}"`,
                angle.subline ? `SUBLINE (display this text smaller below headline): "${angle.subline}"` : '',
                angle.angle ? `[ANGLE CONTEXT — strategic direction, DO NOT render as text in image]: ${angle.angle}` : '',
                'MOBILE-FIRST TEXT RULE: headline and subline are the only visible text. Zero paragraphs. Zero body copy.',
                `Brand palette FOR TEXT AND BACKGROUNDS ONLY — do not apply to product: ${brandKit.name} — ${brandKit.primary1}, ${brandKit.primary2}, ${brandKit.primary3}. Typography: ${brandKit.typography || 'bold sans-serif'}.`,
                `Brand context: ${brandKitContext}`,
                photographyStyle,
                'Portrait 1024x1536. ALL text in Spanish. Professional agency quality.',
                'ANTI-HALLUCINATION: Do NOT invent prices, discounts, metrics, phone numbers, URLs, or statistics not in the brief.',
                hasDiscount
                  ? 'PRICES AND OFFERS — RULE: The brief includes real promotional data. You MAY show exact values from the brief (price, discount %, installments, free shipping) in the image. NEVER invent or alter any value. Reproduce EXACTLY as written in the brief — do not paraphrase or recombine.'
                  : 'ABSOLUTE PRICE PROHIBITION: Do NOT write any price number, crossed-out price, discount percentage, "BEFORE/NOW" label, or any monetary value in the image. If the angle is about price or value, express it ONLY with words in the headline — never with numbers.',
                'Do NOT include button-style CTAs in the image.',
                `BRAND LOGO RULE: Do NOT generate any logo, icon, symbol, or graphic brand element. If brand identification is needed, write only the brand name "${brandKit.name}" as plain text — no decoration, no icon, no invented wordmark.`,
                hasProductPhoto ? '⚠️ FINAL COLOR CHECK: Before rendering, verify the product color matches the reference photo. If it does not match, correct it. The product color must not be shifted, lightened, darkened, or desaturated.' : '',
              ].filter(Boolean).join(' ');
            }

            let base64 = '';

            // Product-only mode (no person) with product photo: use images.edit starting FROM the product photo
            // — preserves product colors, label, and design exactly.
            // Person mode (peopleMode real) or fashion: use Responses API so the model can compose a person + product.
            if (!isFashionProduct && hasProductPhoto && peopleMode === 'none') {
              base64 = await editProductForConcept(openai, productDataUrls.slice(0, 3), fullPrompt);
              // Fallback to Responses API if images.edit fails
              if (!base64) {
                try {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const response = await (openai.responses.create as any)({
                    model: 'gpt-image-2',
                    input: [{ role: 'user', content: [
                      ...productDataUrls.slice(0, 3).map(url => ({ type: 'input_image', image_url: url, detail: 'high' })),
                      { type: 'input_text', text: fullPrompt },
                    ]}],
                    tools: [{ type: 'image_generation', model: 'gpt-image-2', quality: 'high', size: '1024x1536' }],
                  });
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  for (const block of (response.output || [])) {
                    if (block.type === 'image_generation_call' && block.result) { base64 = block.result; break; }
                  }
                } catch (err) {
                  console.error(`testing-angles "${angle.name}" responses fallback failed:`, err);
                }
              }
            } else {
              // Fashion with product photo: 2-step approach (concept → apply garment)
              // Step A: generate scene/person/headline at medium quality, garment accuracy secondary
              // Step B: apply exact garment via gpt-4o orchestration (same as apply-product module)
              if (isFashionProduct && hasProductPhoto) {
                const garmentType = productDescription.match(/TIPO DE PRENDA[:\s]+([^\n.,]+)/i)?.[1]?.trim() || 'prenda de moda';

                const stepAPrompt = [
                  personDescription
                    ? `PERSONA: ${personDescription}. La persona lleva una prenda de tipo ${garmentType} — el color y diseño exactos de la prenda se aplican en el paso siguiente.`
                    : `Persona: modelo fashion aspiracional, actitud natural y confiada. Lleva una prenda de tipo ${garmentType}.`,
                  angle.format ? `FORMATO VISUAL — ${angle.format}: ${ANGLE_FORMAT_STYLES[angle.format] || ''}` : (isCategory ? 'COMPOSICIÓN: Lifestyle fashion aspiracional.' : 'COMPOSICIÓN: Fashion direct-response, prenda como héroe visual.'),
                  angle.concept ? `CONCEPTO VISUAL: ${angle.concept}` : '',
                  `HEADLINE (mostrá este texto exacto, grande y en negrita): "${angle.hook}"`,
                  angle.subline ? `SUBLINE (mostrá este texto más pequeño bajo el headline): "${angle.subline}"` : '',
                  angle.angle ? `[CONTEXTO ESTRATÉGICO — NO texto a mostrar en la imagen]: ${angle.angle}` : '',
                  'MOBILE-FIRST TEXT RULE: headline y subline son el único texto visible. Cero párrafos. Cero body copy.',
                  `Marca: ${brandKit.name}. Colores de marca (SOLO para fondos, textos y elementos gráficos): ${brandKit.primary1}, ${brandKit.primary2}, ${brandKit.primary3}. Tipografía: ${brandKit.typography || 'bold sans-serif'}.`,
                  `Contexto de marca: ${brandKitContext}`,
                  'Fashion editorial photography — natural skin tones, soft studio or lifestyle lighting, 85mm lens equivalent, photorealistic.',
                  'Portrait 1024x1536. Todo el texto en español. Calidad agencia profesional.',
                  'ANTI-ALUCINACIÓN: NO inventés precios, descuentos, métricas ni estadísticas que no estén en el brief.',
                  hasDiscount
                    ? 'PRECIOS Y OFERTAS — REGLA: El brief incluye información promocional real. Podés mostrar en la imagen los valores exactos que aparecen en el brief (precio, porcentaje de descuento, cuotas sin interés, envío gratis). PROHIBIDO inventar o modificar cualquier valor. Reproducí EXACTAMENTE como aparece en el brief — sin parafrasear, sin combinar de otra manera.'
                    : 'PROHIBICIÓN ABSOLUTA DE PRECIOS: NO escribas ningún número de precio, precio tachado, porcentaje de descuento, etiqueta "ANTES/AHORA", ni ningún valor monetario en la imagen. Si el ángulo habla de precio o valor, expresalo SOLO con palabras en el headline — nunca con números.',
                  'NO incluyas botones CTA en la imagen.',
                  `REGLA DE LOGO: NO generes ningún logo ni símbolo de marca. Si necesitás identificar la marca, escribí únicamente el nombre "${brandKit.name}" como texto plano.`,
                ].filter(Boolean).join(' ');

                const stepAContent = [
                  ...(refImageUrls.length > 0 ? refImageUrls.map(url => ({ type: 'input_image' as const, image_url: url, detail: 'high' as const })) : []),
                  { type: 'input_text' as const, text: stepAPrompt },
                ];

                let conceptBase64 = '';
                for (let attempt = 1; attempt <= 2; attempt++) {
                  try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const r = await (openai.responses.create as any)({
                      model: 'gpt-image-2',
                      input: [{ role: 'user', content: stepAContent }],
                      tools: [{ type: 'image_generation', model: 'gpt-image-2', quality: 'medium', size: '1024x1536' }],
                    });
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    for (const block of (r.output || [])) {
                      if (block.type === 'image_generation_call' && block.result) { conceptBase64 = block.result; break; }
                    }
                    if (conceptBase64) break;
                  } catch (err) {
                    console.error(`testing-angles "${angle.name}" step A attempt ${attempt}:`, err);
                    if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
                  }
                }

                if (conceptBase64) {
                  const applied = await applyGarmentInline(openai, conceptBase64, productDataUrls, productDescription, peopleMode, personDescription);
                  base64 = applied || conceptBase64;
                }

              } else {
                // Fashion without product photo, or non-fashion with person: 1-step Responses API
                const inputImages = [
                  ...productDataUrls.slice(0, 3),
                  ...((isFashionProduct || peopleMode === 'real') && refImageUrls.length > 0 ? refImageUrls : []),
                ];

                const inputContent = [
                  ...inputImages.map(url => ({ type: 'input_image', image_url: url, detail: 'high' })),
                  { type: 'input_text', text: fullPrompt },
                ];

                for (let attempt = 1; attempt <= 3; attempt++) {
                  try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const response = await (openai.responses.create as any)({
                      model: 'gpt-image-2',
                      input: [{ role: 'user', content: inputContent }],
                      tools: [{
                        type: 'image_generation',
                        model: 'gpt-image-2',
                        quality: 'high',
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
                    console.error(`testing-angles "${angle.name}" attempt ${attempt} failed:`, err);
                    if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 1500));
                  }
                }
              }
            }

            if (!base64) {
              // Last resort fallback: images.edit with high quality if product photo available, else generate
              if (hasProductPhoto) {
                base64 = await editProductForConcept(openai, productDataUrls.slice(0, 3), fullPrompt);
              }
              if (!base64) {
                try {
                  const fallback = await openai.images.generate({
                    model: 'gpt-image-2',
                    prompt: `Direct response ad. Product shown exactly as in reference photo — do NOT rebrand or recolor it. Background and text use brand colors: ${brandKit.primary1}. ${productDescription.slice(0, 150)}. Headline: "${angle.hook}". Portrait. Spanish text only.`,
                    size: '1024x1536',
                    quality: 'medium',
                    n: 1,
                  });
                  base64 = fallback.data?.[0]?.b64_json || '';
                } catch (err) {
                  console.error(`testing-angles "${angle.name}" fallback failed:`, err);
                }
              }
            }

            if (base64) {
              send(controller, {
                image: {
                  id: crypto.randomUUID(),
                  base64,
                  angleKey: angle.key,
                  angleName: angle.name,
                  hook: angle.hook,
                  emphasis: angle.emphasis,
                  level: angle.level,
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
        clearInterval(heartbeat);
        send(controller, { done: true, isFashionProduct, productDescription, personDescription });
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
