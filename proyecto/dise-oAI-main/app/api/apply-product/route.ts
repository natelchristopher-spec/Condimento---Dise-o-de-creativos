import { NextRequest, NextResponse } from 'next/server';
import OpenAI, { toFile } from 'openai';
import { getUserContext } from '@/app/lib/get-user-context';

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

export async function POST(req: NextRequest) {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Configurá tu API key de OpenAI en el perfil.' }, { status: 401 });

  const { conceptImageBase64, productDetailImages, productDescription, peopleMode, personDescription }: {
    conceptImageBase64: string;
    productDetailImages: string[];
    productDescription: string;
    peopleMode: 'none' | 'real';
    personDescription: string;
  } = await req.json();

  if (!productDetailImages.length) {
    return NextResponse.json({ base64: conceptImageBase64, applied: false });
  }

  const openai = new OpenAI({ apiKey: ctx.openaiApiKey });

  const personPart = (peopleMode === 'real' && personDescription)
    ? `\nPERSONA: ${personDescription}. La persona lleva puesto exactamente este producto.`
    : '';

  const productPart = productDescription
    ? `\nPRODUCTO A APLICAR (reproducir exactamente, sin simplificar):\n${productDescription}`
    : '\nPRODUCTO A APLICAR: el producto exacto que aparece en las imágenes de referencia — usá las imágenes como fuente principal de verdad visual.';

  const multiProductNote = productDetailImages.length > 1
    ? `\nHay ${productDetailImages.length} imágenes de referencia de productos — aplicá TODOS los productos visibles (ej: remera + pantalón, campera + falda).`
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
- La composición y layout general (si es COMPOSICIÓN DE DOS MITADES, respetá esa estructura)
- COMPOSICIÓN DE DOS MITADES — CRÍTICO: si la imagen tiene dos personas o dos mitades (sin producto / con producto), el producto se aplica ÚNICAMENTE a la persona del lado "con producto" (right side). La persona del lado "sin producto" (left side) debe quedar SIN el producto, con su ropa original intacta. NUNCA aplicar el mismo producto a las dos mitades.
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

REGLAS de producto:
- Mismo color, mismo estampado, misma silueta, mismo tejido que la referencia visual
- Si hay múltiples prendas, aplicá TODAS
- Estilo fashion editorial premium, fotorrealista`;

  const conceptDataUrl = conceptImageBase64.startsWith('data:')
    ? conceptImageBase64
    : `data:image/png;base64,${conceptImageBase64}`;

  const productImageContent = productDetailImages.map(img => ({
    type: 'input_image' as const,
    image_url: img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`,
    detail: 'high' as const,
  }));

  // PRIMARY: Responses API — gpt-4o ve concepto + fotos del producto simultáneamente
  // y conduce a gpt-image-2 con instrucciones visuales precisas
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
          return NextResponse.json({ base64: block.result, applied: true });
        }
      }
      console.warn(`apply-product: intento ${attempt} sin bloque de imagen`);
    } catch (err) {
      console.error(`apply-product: intento ${attempt} falló:`, err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('401') || msg.includes('429') || msg.includes('insufficient_quota') || msg.includes('invalid_api_key')) {
        return NextResponse.json({ error: getOpenAIErrorMessage(err) }, { status: 500 });
      }
      if (attempt === 3) break;
      await new Promise(r => setTimeout(r, attempt * 1500));
    }
  }

  // FALLBACK: images.edit con [concepto + fotos del producto] — el producto viaja visualmente
  try {
    const toImageFile = async (dataUrl: string, name: string) => {
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      return toFile(Buffer.from(base64, 'base64'), name, { type: 'image/png' });
    };

    const conceptFile = await toImageFile(conceptDataUrl, 'concept.png');
    const productFiles = await Promise.all(
      productDetailImages.map((img, i) => toImageFile(img, `product-${i}.png`))
    );

    const fallbackPrompt = [
      'Image 1 is the fashion concept to edit. Images 2+ are reference photos of the exact product.',
      'Replace ONLY the clothing worn by the person in Image 1 with the exact product from Images 2+.',
      'Use the reference images as direct visual source — pixel-accurate color, texture, silhouette.',
      'Preserve all text, background, layout, lighting, and pose.',
      personPart,
    ].filter(Boolean).join(' ');

    const response = await openai.images.edit({
      model: 'gpt-image-2',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      image: [conceptFile, ...productFiles] as any,
      prompt: fallbackPrompt,
      size: '1024x1536',
      quality: 'high',
    });
    const base64 = response.data?.[0]?.b64_json || '';
    if (base64) return NextResponse.json({ base64, applied: true, fallback: true });
    console.error('apply-product: fallback images.edit sin b64_json');
  } catch (err) {
    console.error('apply-product: fallback images.edit falló:', err);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('401') || msg.includes('429') || msg.includes('insufficient_quota') || msg.includes('invalid_api_key')) {
      return NextResponse.json({ error: getOpenAIErrorMessage(err) }, { status: 500 });
    }
  }

  // Ambos fallaron — avisar al cliente, nunca descripción sola
  return NextResponse.json({
    applied: false,
    error: 'No se pudo aplicar el producto usando la foto de referencia. Intentá con otra imagen del producto o ajustá manualmente en la afinación.',
  });
}
