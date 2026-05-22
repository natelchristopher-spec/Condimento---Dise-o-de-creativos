import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import type { ChatCompletionContentPart } from 'openai/resources/chat/completions';
import { BrandKit } from '@/app/types';
import { buildBrandKitContext } from '@/app/api/brandKitContext';
import { getUserContext } from '@/app/lib/get-user-context';

export const maxDuration = 120;

type PeopleMode = 'none' | 'real';

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

const PRODUCT_DESCRIPTION_PROMPT = `Sos un técnico de producto de moda de alta gama. Analizá este producto y describilo con precisión quirúrgica para que pueda ser reproducido EXACTAMENTE por un modelo de IA generativa. Imaginá que quien lee tu descripción no puede ver la foto — tu texto es el único recurso.

Describí en este orden exacto:

1. TIPO DE PRODUCTO: categoría exacta, silueta y corte, largo o dimensiones
2. COLOR BASE — ES LO MÁS CRÍTICO: describí el color con máxima precisión. NO uses solo el nombre del color. Usá referencias concretas: tono exacto (ej: "beige arena cálido, similar al tono de la arena seca — NO es blanco, NO es gris, tiene un subtono cálido visible"). Describí su saturación (¿vivo o apagado?), temperatura (¿frío o cálido?) y cómo se ve bajo la luz. Para neutros cálidos (beige, arena, tostado, crudo, khaki), aclará explícitamente que NO debe renderizarse como blanco ni gris.
3. ESTAMPADO / PRINT: describí cada elemento gráfico. Si es color sólido, indicar "color sólido uniforme".
4. MATERIALES Y TEXTURA: acabado (mate/satinado/brillante), tejido visible, peso visual
5. DETALLES DE CONFECCIÓN: corte, bolsillos, cierre, terminaciones, cualquier detalle funcional
6. ELEMENTOS ÚNICOS: lo que diferencia este producto de uno genérico

CRÍTICO: NO menciones ninguna marca, logo ni texto de terceros que aparezca en la foto — esas marcas no deben reproducirse. Solo describí el producto en sí.`;

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
    brief, brandKit, peopleMode = 'none',
    productImages = [], referenceImages = [],
  }: {
    brief: string;
    brandKit: BrandKit;
    peopleMode: PeopleMode;
    productImages: string[];
    referenceImages: string[];
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
        if (!isRefusal(desc)) { productDescription = desc; break; }
      } catch (err) {
        console.error(`plan-pdp describe attempt ${attempt + 1}:`, err);
      }
    }
  }

  const lifestyleInstruction = hasPeople
    ? '3. LIFESTYLE IMAGE — persona vistiendo el producto en situación cotidiana auténtica.'
    : '3. LIFESTYLE IMAGE — producto en su contexto natural de uso, sin personas.';

  const systemPrompt = `Sos un director creativo senior especializado en PDPs de e-commerce.
Generá exactamente 6 planes de imagen para el carrusel de producto, formato cuadrado 1:1.

PRODUCTO (el mismo en TODAS las imágenes):
${productDescription}

TIPOS (en este orden):
1. PRODUCT HERO — producto solo, fondo limpio, sin copy. display_copy: null
2. BENEFIT IMAGE — producto + 3 beneficios clave. display_copy.items: array de 3 strings cortos en español
${lifestyleInstruction} display_copy.tagline: frase corta aspiracional en español (opcional)
4. AUTHORITY IMAGE — callouts de materiales/construcción. display_copy.items: array de 3-5 specs técnicas en español, basadas SOLO en lo que se ve en la foto o está en el brief
5. HOW TO USE — 3 pasos de uso. display_copy.items: array de 3 pasos cortos en español
6. TESTIMONIAL — producto + reseña. display_copy.quote + display_copy.author (inventá un nombre genérico) + display_copy.rating ("★★★★★")

REGLAS:
- TODO el copy en español
- display_copy debe contener el texto EXACTO que aparecerá en la imagen
- Para AUTHORITY: los specs deben basarse en el producto real descrito — no inventar materiales o tecnologías que no estén en la descripción o el brief
- PROHIBIDO logos de terceros, precios inventados, badges ("Compra Segura" etc.)
- image_prompt: descripción visual detallada para el generador de imágenes, en inglés, con el color exacto del producto

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
