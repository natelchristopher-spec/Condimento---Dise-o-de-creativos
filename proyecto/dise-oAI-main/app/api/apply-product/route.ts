import { NextRequest, NextResponse } from 'next/server';
import OpenAI, { toFile } from 'openai';
import { getUserContext } from '@/app/lib/get-user-context';

export const maxDuration = 300;

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

PASO 1 — ANÁLISIS DE COLOR ANTES DE GENERAR:
Mirá la imagen de referencia del producto y extraé el color dominante con precisión. Identificá: ¿es cálido o frío? ¿saturado o apagado? ¿de qué tono exacto? Usá ese análisis como ancla para la generación.

IMPORTANTE — las imágenes de referencia del producto son la fuente principal. El texto es solo soporte. Reproducí el producto tal cual se ve en la foto de referencia.

QUÉ CAMBIAR:
- Las prendas/ropa de la persona → reemplazarlas por los productos de referencia exactos

QUÉ NO TOCAR (debe quedar pixel-perfect igual):
- TODOS los textos, tipografías, títulos, subtítulos, slogans y copy que aparecen en la imagen
- El fondo, colores del fondo, degradados y texturas
- La composición y layout general (si es split-screen o before/after, respetá esa estructura — aplicá el producto en AMBOS paneles de forma coherente con la narrativa)
- La iluminación y mood
- Logos, íconos o elementos gráficos de marca
- La pose y posición de la persona

REGLAS DE COLOR — CRÍTICO:
- El color de cada prenda debe ser IDÉNTICO al de la imagen de referencia. NO aclarar, NO oscurecer, NO desaturar, NO cambiar temperatura de color.
- Tomá el valor de color directamente de los píxeles de la referencia — no lo interpetes ni lo idealices.
- Para colores neutros cálidos (beige, arena, tostado, camel, crudo, khaki): NUNCA renderices como blanco ni gris claro. Mantené la temperatura cálida y la saturación exacta del original.
- Para colores oscuros (negro, azul marino, marrón oscuro): NUNCA los ilumines ni aclarés por exceso de luz ambiental.

ATENCIÓN ESPECIAL — PANTALONES Y PRENDAS INFERIORES:
- Los pantalones son la prenda donde el modelo falla más en color. Prestá DOBLE atención.
- Si el pantalón de referencia es beige arena: la prenda generada debe verse exactamente de ese mismo beige arena — con la misma temperatura cálida, misma saturación baja-media, mismo comportamiento a la luz.
- Telas lisas (twill, gabardina, algodón peachskin, cotton chino): la superficie debe verse uniforme y suave, SIN texturas artificiales, arrugas exageradas ni variaciones de tono que no existen en la referencia.
- Replicá la caída y silueta del pantalón tal cual se ve: largo, ancho de pierna, tiro.

REGLAS de producto:
- Mismo color, mismo estampado, misma silueta, mismo tejido que la referencia visual
- Si hay múltiples prendas de referencia, aplicá TODAS
- Estilo fashion editorial premium, fotorrealista`;

  const conceptDataUrl = `data:image/png;base64,${conceptImageBase64}`;
  const productImageContent = productDetailImages.map(img => ({
    type: 'input_image' as const, image_url: img, detail: 'high' as const,
  }));

  // Primary: Responses API (gpt-4o + gpt-image-2) — 3 intentos
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
      if (attempt === 3) break;
      await new Promise(r => setTimeout(r, attempt * 1000));
    }
  }

  // Fallback: images.edit con imagen de producto como referencia visual
  try {
    const buffer = Buffer.from(conceptImageBase64, 'base64');
    const conceptFile = await toFile(buffer, 'concept.png', { type: 'image/png' });

    const fallbackPrompt = [
      'Replace the clothing/garments worn by the person in this fashion image with the exact product shown in the reference photo.',
      productDescription ? `Product details: ${productDescription}` : '',
      'Preserve the exact composition, background, lighting, mood, text overlays, and pose. Only change the clothing to match the reference product exactly — same color, same silhouette, same fabric.',
      personPart,
    ].filter(Boolean).join(' ');

    const response = await openai.images.edit({
      model: 'gpt-image-2',
      image: conceptFile,
      prompt: fallbackPrompt,
      size: '1024x1536',
      quality: 'high',
    });
    const base64 = response.data?.[0]?.b64_json || '';
    if (base64) return NextResponse.json({ base64, applied: true, fallback: true });
    console.error('apply-product: fallback images.edit sin b64_json');
  } catch (err) {
    console.error('apply-product: fallback images.edit falló:', err);
  }

  // Todo falló — avisar al cliente
  return NextResponse.json({
    base64: '',
    applied: false,
    error: 'No se pudo aplicar el producto a este concepto después de 3 intentos. Podés ajustarlo manualmente en el paso de afinación.',
  });
}
