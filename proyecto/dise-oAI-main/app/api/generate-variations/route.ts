import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { BrandKit, GeneratedImage, PeopleMode } from '@/app/types';
import { buildBrandKitContext } from '@/app/lib/brandKitContext';
import { getUserContext } from '@/app/lib/get-user-context';

export const maxDuration = 300;

interface VariationItem {
  variation_name: string;
  image_prompt: string;
}

export async function POST(req: NextRequest) {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Configurá tu API key de OpenAI en el perfil.' }, { status: 401 });

  const { selectedConcept, brandKit, peopleMode = 'none' }: {
    selectedConcept: GeneratedImage;
    brandKit: BrandKit;
    peopleMode: PeopleMode;
  } = await req.json();
  const openai = new OpenAI({ apiKey: ctx.openaiApiKey });
  const brandKitContext = buildBrandKitContext(brandKit);
  const fashionSuffix = peopleMode !== 'none'
    ? 'Fashion editorial photography style, professional model, natural skin tones, soft studio lighting, 85mm lens bokeh, high-end fashion campaign, photorealistic, natural expressions.'
    : '';

  const variationsResponse = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `Sos un director creativo senior. Dado un concepto visual seleccionado y su prompt, generá 4 variaciones de ese concepto.
Las variaciones deben mantener la misma dirección visual pero explorar diferentes composiciones, énfasis de color, o diferencias estilísticas menores.
Es CRÍTICO que uses los colores exactos del brand kit y respetes todas las reglas de marca.
Respondé SOLO con JSON válido: { "variations": [ { "variation_name": "...", "image_prompt": "..." }, ... ] }`,
      },
      {
        role: 'user',
        content: `BRAND KIT COMPLETO:\n${brandKitContext}\n\nCONCEPTO SELECCIONADO: ${selectedConcept.conceptName}\nPROMPT ORIGINAL:\n${selectedConcept.prompt}\n\nGenerá 4 variaciones de este concepto.`,
      },
    ],
    response_format: { type: 'json_object' },
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(variationsResponse.choices[0].message.content || '{}');
  } catch {
    parsed = {};
  }
  const variations: VariationItem[] = (parsed.variations as VariationItem[]) || [];

  const imageResults = await Promise.allSettled(
    variations.map(async (variation: VariationItem) => {
      const prompt = `${variation.image_prompt} ${fashionSuffix}`.trim();
      const imageResponse = await openai.images.generate({
        model: 'gpt-image-2',
        prompt,
        size: '1024x1536',
        quality: 'high',
        n: 1,
      });
      return {
        id: Math.random().toString(36).slice(2),
        base64: imageResponse.data?.[0]?.b64_json || '',
        prompt: variation.image_prompt,
        conceptName: variation.variation_name,
      };
    })
  );

  const images = imageResults
    .filter((r): r is PromiseFulfilledResult<GeneratedImage> => r.status === 'fulfilled')
    .map(r => r.value);
  if (images.length === 0) {
    return NextResponse.json({ error: 'No se pudo generar ninguna variación. Intentá de nuevo.' }, { status: 500 });
  }
  return NextResponse.json({ images });
}
