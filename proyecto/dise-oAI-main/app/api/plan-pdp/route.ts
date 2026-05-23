import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import type { ChatCompletionContentPart } from 'openai/resources/chat/completions';
import { BrandKit } from '@/app/types';
import { buildBrandKitContext } from '@/app/lib/brandKitContext';
import { getUserContext } from '@/app/lib/get-user-context';

export const maxDuration = 120;

type PeopleMode = 'none' | 'real';
type PdpMode = 'product' | 'fashion';

// Copy structure per slide type — what the user sees and can edit
export interface SlideDisplayCopy {
  // benefit, authority, howto
  items?: string[];
  // lifestyle
  tagline?: string;
  // testimonial
  quote?: string;
  author?: string;
  rating?: string;
  // hero has no copy
}

export interface PdpPlan {
  type: string;
  label: string;
  display_copy: SlideDisplayCopy | null;
  image_prompt: string;
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

PRIMERO determiná si el producto tiene packaging/envase (suplemento, cosmético, alimento, bebida, limpieza, etc.) o si es un producto sin packaging (electrónico, joyería, mueble, calzado, decoración, libro, accesorio, juguete, etc.).

Para PRODUCTOS CON PACKAGING / ENVASE:
1. TIPO DE PRODUCTO: nombre exacto, categoría, variante o sabor visible
2. FORMATO / PRESENTACIÓN: tipo de envase (pote, bolsa, botella, caja, tubo), tamaño relativo, cantidad visible en la etiqueta
3. COLORES DEL ENVASE — CRÍTICO: color exacto del cuerpo y del diseño/etiqueta. Para colores oscuros, aclará que NO debe renderizarse más claro.
4. DISEÑO GRÁFICO DEL PACKAGING: estilo tipográfico, elementos visuales principales (franjas, íconos, geometría, degradados)
5. TEXTO CLAVE VISIBLE: nombre del producto, sabor/variante si aplica, claims visibles en la etiqueta
6. ELEMENTOS ÚNICOS: forma de la tapa, textura, detalles que distinguen este packaging específico

Para PRODUCTOS SIN PACKAGING (electrónico, joyería, mueble, calzado, decoración, libro, accesorio, etc.):
1. TIPO DE PRODUCTO: nombre exacto, categoría, función principal
2. FORMA Y DIMENSIONES: silueta general, proporciones, si es grande/compacto/pequeño/delgado
3. COLORES — CRÍTICO: color exacto de cada componente visible. Para colores oscuros, aclará que NO debe renderizarse más claro. Para metales, especificá tono (plateado frío, dorado cálido, bronce, etc.).
4. MATERIALES Y ACABADOS: metales, plásticos, madera, cuero, vidrio, tela, etc. y su acabado (mate/brillante/satinado/texturado)
5. DETALLES FUNCIONALES O CONSTRUCTIVOS: botones, pantallas, conectores, bisagras, cierres, patas, costuras, herrajes, etc.
6. ELEMENTOS ÚNICOS: lo que diferencia este producto específico de uno genérico de la misma categoría

CRÍTICO: NO menciones ninguna marca ni logo de terceros. Solo describí el producto en sí.`;

const PDP_TYPES = [
  { type: 'hero',        label: 'Product Hero' },
  { type: 'benefit',     label: 'Benefit Image' },
  { type: 'lifestyle',   label: 'Lifestyle Image' },
  { type: 'authority',   label: 'Authority Image' },
  { type: 'howto',       label: 'How to Use' },
  { type: 'testimonial', label: 'Testimonial' },
] as const;

export async function POST(req: NextRequest) {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Configurá tu API key de OpenAI en el perfil.' }, { status: 401 });

  const {
    brief, brandKit, pdpMode = 'product', peopleMode = 'none',
    productImages = [], referenceImages = [],
  }: {
    brief: string;
    brandKit: BrandKit;
    pdpMode: PdpMode;
    peopleMode: PeopleMode;
    productImages: string[];
    referenceImages: string[];
  } = await req.json();

  const descriptionPrompt = pdpMode === 'fashion'
    ? PRODUCT_DESCRIPTION_PROMPT_FASHION
    : PRODUCT_DESCRIPTION_PROMPT_PRODUCT;

  const openai = new OpenAI({ apiKey: ctx.openaiApiKey });
  const brandKitContext = buildBrandKitContext(brandKit);
  const hasPeople = peopleMode === 'real';

  const productDataUrls = productImages
    .map(img => img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`)
    .filter(url => url.length > 100);
  const referenceDataUrls = referenceImages
    .map(img => img.startsWith('data:') ? img : `data:image/png;base64,${img}`)
    .filter(url => url.length > 100);

  if (productDataUrls.length === 0) {
    return NextResponse.json(
      { error: 'Se requiere al menos una foto del producto para generar imágenes PDP. Subí una foto en formato JPG o PNG.' },
      { status: 400 }
    );
  }

  // Step 0: describe the product in detail
  let productDescription = brief;
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
        if (!isRefusal(desc)) { productDescription = desc; break; }
      } catch (err) {
        console.error(`plan-pdp describe attempt ${attempt + 1}:`, err);
      }
    }
  }

  const lifestyleInstruction = !hasPeople
    ? '3. LIFESTYLE IMAGE — el producto en su contexto natural de uso, sin personas. Ambientación real y cercana (gym, baño, cocina, escritorio según el tipo de producto).'
    : pdpMode === 'fashion'
      ? '3. LIFESTYLE IMAGE — persona vistiendo la prenda en una situación cotidiana auténtica y aspiracional. La prenda debe verse con su color, corte y silueta exactos — es el estado natural del producto.'
      : `3. LIFESTYLE IMAGE — persona en el contexto natural donde se usa este producto. REGLA DE MÍNIMO RIESGO: el producto siempre aparece en su forma original y reconocible — nunca en estado de consumo, mezcla o aplicación activa (no sabemos textura, consistencia ni aspecto al usarse).

GUÍA POR TIPO DE PRODUCTO:
SEGURO EN USO (el producto en uso ES su forma reconocible):
- Indumentaria / calzado → siendo usado/puesto, es su estado natural
- Reloj / smartwatch / wearable → en la muñeca
- Joyería (anillo, collar, pulsera, aro) → puesto, producto como foco
- Anteojos / gafas de sol → puestos en cara
- Bolso / cartera / mochila / billetera → cargado o en mano
- Auriculares / headphones / earbuds → puestos en orejas
- Celular / tablet / laptop / cámara → en mano, pantalla o lente visible
- Textiles hogar (sábanas, toallas, almohadón, cortina) → en su lugar (cama, baño)
- Velas / difusores / aromaterapia → encendidos en ambiente hogar
- Decoración / arte / cuadros → en el espacio, ambientado
- Libros / cuadernos / papelería → en mano o sobre escritorio
- Juguetes / juegos → en manos, en uso
- Equipamiento deportivo (colchoneta, banda, mancuernas) → siendo usado

SOLO CONTEXTO — NO mostrar acción de consumo/aplicación:
- Suplemento / proteína / creatina / pre-entreno → envase en mano o sobre banco de gym — NO mezclando, NO tomando (no sabemos si es polvo, líquido, cápsula)
- Vitaminas / suplemento de salud / medicamento → frasco o blíster en mano — NO tomando
- Cosmético / maquillaje (labial, base, rubor, máscara, sombra) → producto en mano o sobre tocador — NO aplicado (no sabemos color exacto en piel)
- Skincare / crema / sérum / aceite / contorno → en mano o sobre mesada de baño — NO en cara ni piel (no sabemos textura al contacto)
- Perfume / colonia → botella en mano o sobre superficie — NO rociando
- Shampoo / acondicionador / tratamiento capilar → botella en contexto de baño — NO en el pelo (no sabemos tipo ni color de cabello)
- Alimento / snack / barra proteica / cereal → packaging cerrado en contexto (mesa, cocina) — NO comiendo, NO desempaquetado mostrando contenido interno
- Bebida / jugo / energizante / agua saborizada → envase cerrado en contexto — NO sirviendo ni tomando
- Producto de limpieza / desinfectante → envase en mano o contexto de hogar — NO aplicando sobre superficie
- Comida / suplemento para mascotas → producto en contexto, mascota cerca pero NO comiendo
- Pintura / barniz / adhesivo / sellador → envase solo o en mano cerrado`;

  const systemPrompt = `Sos un director creativo senior especializado en PDPs de e-commerce.
Generá exactamente 6 planes de imagen para el carrusel de producto, formato cuadrado 1:1.

PRODUCTO (el mismo en TODAS las imágenes):
${productDescription}

ANTES DE PLANEAR: determiná la categoría del producto (suplemento, electrónico, cosmético, calzado, joyería, alimento, hogar, decoración, libro, mascota, etc.) y adaptá el tono, el copy y el contenido de cada slide a ese nicho. Los slides deben tener sentido para ESTE producto específico — no para suplementos ni indumentaria si el producto es otro.

TIPOS (en este orden exacto):

${pdpMode === 'fashion' ? `1. PRODUCT HERO
   - La prenda siendo usada/puesta. Fondo limpio o color sólido de marca. Actitud aspiracional y editorial. Sin copy.
   - display_copy: null

2. BENEFIT IMAGE
   - Persona vistiendo la prenda + exactamente 3 beneficios como callouts (fit, material, comodidad, versatilidad, etc.).
   - display_copy.items: array de exactamente 3 strings en español, atributos clave de la prenda. Ej: "100% algodón pima", "Corte que favorece cualquier talle", "Colores que no destiñen"

${lifestyleInstruction}
   - display_copy.tagline: UNA frase aspiracional corta en español (OBLIGATORIO — máx 6 palabras). Ej: "Vestite como querés vivir.", "Tu estilo, tu regla."

4. AUTHORITY IMAGE
   - Detalle de la prenda: closeup de tela, costura, terminación o textura del tejido. SIN personas. Credibilidad a través del detalle constructivo.
   - display_copy.items: array de 3-4 specs técnicas en español BASADAS EN LO VISIBLE EN LA FOTO. Ej: "100% algodón orgánico", "Costuras reforzadas triple", "Corte slim fit", "Tela pre-lavada anti-encogimiento"

5. HOW TO USE
   - Instrucciones de cuidado y lavado de la prenda. SIN personas. Flat lay o producto solo.
   - display_copy.items: array de exactamente 3 strings en español, instrucciones de cuidado. Ej: "Lavar a 30°C con colores similares", "No usar secadora", "Planchar a temperatura baja"` : `1. PRODUCT HERO
   - Solo el producto, fondo limpio blanco o color sólido de marca. Sin copy.
   - display_copy: null

2. BENEFIT IMAGE
   - El producto + exactamente 3 beneficios clave del brief, con íconos y texto bold.
   - display_copy.items: array de exactamente 3 strings en español. Cada uno: beneficio concreto y corto (máx 5 palabras). ADAPTÁ AL TIPO DE PRODUCTO REAL. Ej suplemento: "25g proteína por porción" | Ej tech: "Batería de 72 horas" | Ej cosmética: "Hidratación 24 horas" | Ej calzado: "Suela antideslizante" | Ej hogar: "Madera maciza certificada"

${lifestyleInstruction}
   - display_copy.tagline: UNA frase aspiracional corta en español (OBLIGATORIO — máx 6 palabras). ADAPTÁ AL NICHO. Ej deporte: "Entrená sin límites." | Ej tech: "Tecnología que te libera." | Ej cosmética: "Tu piel, tu mejor versión." | Ej hogar: "Tu espacio, tu refugio."

4. AUTHORITY IMAGE
   - Callouts técnicos apuntando a zonas específicas del producto. Credibilidad y construcción.
   - display_copy.items: array de 3-4 specs técnicas en español, BASADAS EN LO VISIBLE EN LA FOTO O EL BRIEF — NO inventar datos. ADAPTÁ AL TIPO DE PRODUCTO. Ej suplemento: "40g proteína" | Ej tech: "Pantalla AMOLED 120Hz" | Ej joyería: "Plata 925 certificada" | Ej skincare: "SPF 50+ certificado"

5. HOW TO USE
   - 3 pasos de uso numerados. Cada paso es una INSTRUCCIÓN DE ACCIÓN — NO un beneficio.
   - display_copy.items: array de exactamente 3 strings en español, formato "Verbo + qué/cómo/cuándo". ADAPTÁ AL TIPO DE PRODUCTO. Ej suplemento: "Mezclar 1 medida con 300ml de leche" | Ej tech: "Cargá completamente antes del primer uso" | Ej cosmético: "Aplicá 2 gotas sobre piel limpia" | Ej calzado: "Usá con medias del grosor recomendado"}

6. TESTIMONIAL
   - Producto con prueba social: reseña de cliente.
   - display_copy.quote: frase de reseña auténtica en español (2 oraciones cortas)
   - display_copy.author: nombre genérico (ej: "Dardo G.", "María L.")
   - display_copy.rating: "★★★★★"

REGLAS:
- TODO el copy en español
- display_copy contiene el texto EXACTO que aparecerá en la imagen — no dejarlo vacío
- PROHIBIDO logos de terceros, precios inventados, badges ("Compra Segura" etc.)
- image_prompt: describí en inglés la COMPOSICIÓN Y LAYOUT del slide (posición del producto, distribución del copy, estilo de fondo, tratamiento gráfico). NO describas el color, forma ni detalles del producto — eso viene de la descripción del producto que se inyecta por separado. El generador ya tiene la foto y la descripción del producto; tu trabajo es describir cómo está organizada la imagen, no cómo es el producto.

Respondé SOLO con JSON:
{
  "product_description": "...",
  "pdp_images": [
    {
      "type": "hero|benefit|lifestyle|authority|howto|testimonial",
      "label": "...",
      "display_copy": { ... } | null,
      "image_prompt": "..."
    }
  ]
}`;

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

  // Step 1: GPT-4o plans all 6 slides with structured copy
  const planResponse = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    response_format: { type: 'json_object' },
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(planResponse.choices[0].message.content || '{}');
  } catch {
    return NextResponse.json({ error: 'Error al procesar el plan. Intentá de nuevo.' }, { status: 500 });
  }
  const pdpItems: PdpPlan[] = (parsed.pdp_images as PdpPlan[]) || [];

  // Ensure all 6 types present with fixed labels
  const plans: PdpPlan[] = PDP_TYPES.map(t => {
    const found = pdpItems.find(item => item.type === t.type);
    return {
      type: t.type,
      label: t.label,
      display_copy: found?.display_copy ?? null,
      image_prompt: found?.image_prompt || `${t.label} for: ${brief.slice(0, 100)}. Brand colors: ${brandKit.primary1}. Square 1:1.`,
    };
  });

  return NextResponse.json({
    plans,
    productDescription: parsed.product_description || productDescription,
  });
}
