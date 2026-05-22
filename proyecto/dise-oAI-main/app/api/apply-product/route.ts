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
    ? ` The person shown is: ${personDescription}.`
    : '';

  const multiNote = productDetailImages.length > 1
    ? ` There are ${productDetailImages.length} product reference images — apply ALL visible garments.`
    : '';

  // Build product files for images.edit (direct image-to-image)
  const toImageFile = async (dataUrl: string, name: string) => {
    const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    const buf = Buffer.from(base64, 'base64');
    return toFile(buf, name, { type: 'image/png' });
  };

  // PRIMARY: images.edit with [concept, ...productImages] — true image-to-image
  // gpt-image-2 sees the product pixels directly, no text description step
  try {
    const conceptFile = await toImageFile(conceptImageBase64.startsWith('data:') ? conceptImageBase64 : `data:image/png;base64,${conceptImageBase64}`, 'concept.png');
    const productFiles = await Promise.all(
      productDetailImages.map((img, i) => toImageFile(img, `product-${i}.png`))
    );

    const editPrompt = [
      'Image 1 is the fashion concept ad to modify. Images 2+ are reference photos of the exact product.',
      'TASK: Replace ONLY the clothing/garments worn by the person in Image 1 with the exact product shown in the reference photos.',
      'Use the reference images as your DIRECT VISUAL SOURCE — copy the exact color (pixel-accurate), exact fabric texture, exact silhouette. Do NOT interpret or reinterpret — copy.',
      personPart,
      multiNote,
      'PRESERVE unchanged: all text/typography/copy, background, layout, lighting, logos, pose.',
      'COLOR RULE: The garment color must be pixel-identical to the reference. For warm neutrals (beige, sand, khaki, camel): keep the warm undertone — never render as white or gray.',
      'PANTS RULE: For trousers, pay double attention to color accuracy. Smooth fabrics (twill, gabardine, cotton chino) must look uniform and smooth, no artificial texture.',
      'Output: photorealistic premium fashion editorial. Same quality and style as Image 1.',
    ].filter(Boolean).join(' ');

    const response = await openai.images.edit({
      model: 'gpt-image-2',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      image: [conceptFile, ...productFiles] as any,
      prompt: editPrompt,
      size: '1024x1536',
      quality: 'high',
    });
    const base64 = response.data?.[0]?.b64_json || '';
    if (base64) return NextResponse.json({ base64, applied: true });
    console.warn('apply-product: images.edit returned no b64_json');
  } catch (err) {
    console.error('apply-product: images.edit (primary) failed:', err);
  }

  // SECONDARY: Responses API — gpt-4o sees images and drives image_generation
  // Still image-informed (not description-only): product images are in the visual context
  const conceptDataUrl = conceptImageBase64.startsWith('data:') ? conceptImageBase64 : `data:image/png;base64,${conceptImageBase64}`;
  const productImageContent = productDetailImages.map(img => ({
    type: 'input_image' as const, image_url: img, detail: 'high' as const,
  }));

  const responsesPrompt = `Fashion concept image: the first image. Product reference: the remaining images.
TASK: Replace the clothing in the concept with the exact product from the reference photos. Use the reference images as the primary visual source — same color (pixel-accurate), same texture, same silhouette.${personPart ? '\n' + personPart : ''}${multiNote ? '\n' + multiNote : ''}

COLOR — CRITICAL:
- Extract the exact color from the reference photo pixels. Do NOT interpret or idealize.
- Warm neutrals (beige, sand, khaki, camel): preserve the warm undertone — NEVER render as white or gray.
- Dark colors: do NOT lighten due to ambient light.

PANTS / BOTTOM GARMENTS — DOUBLE ATTENTION:
- Smooth fabrics (twill, gabardina, cotton chino): uniform surface, no artificial texture, no exaggerated creases.
- Replicate exact color, fall, and silhouette from reference.

PRESERVE: all text/copy, background, layout, composition, lighting, logos, pose. Photorealistic fashion editorial.`;

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
            { type: 'input_text', text: responsesPrompt },
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
      console.warn(`apply-product: Responses API intento ${attempt} sin bloque de imagen`);
    } catch (err) {
      console.error(`apply-product: Responses API intento ${attempt} falló:`, err);
      if (attempt === 3) break;
      await new Promise(r => setTimeout(r, attempt * 1500));
    }
  }

  // Both approaches failed — return error (never fall back to description-only)
  return NextResponse.json({
    base64: '',
    applied: false,
    error: 'No se pudo aplicar el producto usando la foto de referencia. Intentá con otra imagen del producto o ajustá manualmente en la afinación.',
  });
}
