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

Describí en este orden:

1. TIPO DE PRODUCTO: nombre exacto, categoría (suplemento, cosmético, alimento, electronico, etc.), variante o sabor visible
2. FORMATO / PRESENTACIÓN: tipo de envase (pote, bolsa, botella, caja, tubo), tamaño relativo, cantidad visible en la etiqueta
3. COLORES DEL ENVASE — CRÍTICO: color exacto del cuerpo del envase (ej: "pote negro mate sin brillo") y color del diseño/etiqueta (ej: "franja roja vibrante en el centro"). Para colores oscuros, aclará que NO debe renderizarse más claro.
4. DISEÑO GRÁFICO DEL PACKAGING: estilo tipográfico del nombre (bold, condensado, script, etc.), elementos visuales principales (franjas, íconos, geometría, degradados)
5. TEXTO CLAVE VISIBLE: nombre del producto tal como aparece, sabor/variante si aplica, claims principales visibles en la etiqueta
6. ELEMENTOS ÚNICOS: forma de la tapa, textura del envase, detalles que distinguen este packaging específico

CRÍTICO: NO menciones ninguna marca ni logo de terceros. Solo describí el producto y su packaging.`;

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

TIPOS (en este orden exacto):

1. PRODUCT HERO
   - Solo el producto, fondo limpio blanco o color sólido de marca. Sin copy.
   - display_copy: null

2. BENEFIT IMAGE
   - El producto + exactamente 3 beneficios clave del brief, con íconos y texto bold.
   - display_copy.items: array de exactamente 3 strings en español. Cada uno: beneficio concreto y corto (máx 5 palabras). Ej: "25g proteína por porción", "Sin azúcar añadida", "Rápida absorción"

${lifestyleInstruction}
   - display_copy.tagline: UNA frase aspiracional corta en español (OBLIGATORIO — máx 6 palabras). Ej: "Entrená sin límites.", "Tu mejor versión, hoy."

4. AUTHORITY IMAGE
   - Callouts técnicos apuntando a zonas específicas del producto. Credibilidad y construcción.
   - display_copy.items: array de 3-4 specs técnicas en español, BASADAS EN LO VISIBLE EN LA FOTO O EL BRIEF — NO inventar. Ej para suplemento: "40g proteína", "19 vitaminas y minerales", "840 kcal/porción". Ej para ropa: "100% algodón orgánico", "Costuras reforzadas", "Corte slim fit"

5. HOW TO USE
   - 3 pasos de uso numerados. Cada paso es una INSTRUCCIÓN DE ACCIÓN — NO un beneficio.
   - display_copy.items: array de exactamente 3 strings en español, formato "Verbo + qué/cómo/cuándo". Ej para suplemento: "Mezclar 1 medida con 300ml de leche", "Consumir antes o después del entrenamiento", "Tomar 1-2 veces por día". Ej para ropa: "Lavar a 30°C con colores similares", "No usar secadora", "Planchar a temperatura baja"

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

  const parsed = JSON.parse(planResponse.choices[0].message.content || '{}');
  const pdpItems: PdpPlan[] = parsed.pdp_images || [];

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
