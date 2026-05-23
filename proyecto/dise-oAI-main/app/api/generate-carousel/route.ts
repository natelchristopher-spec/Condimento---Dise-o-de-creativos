import { NextRequest } from 'next/server';
import OpenAI, { toFile } from 'openai';
import { BrandKit } from '@/app/types';
import { getUserContext } from '@/app/lib/get-user-context';
import type { CarouselSlide } from '../plan-carousel/route';

export const maxDuration = 300;

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

  const { brandKit, slides, productImages = [], funnel }: {
    brandKit: BrandKit;
    slides: CarouselSlide[];
    productImages: string[];
    funnel: string;
  } = await req.json();

  const openai = new OpenAI({ apiKey: ctx.openaiApiKey });

  const productDataUrls = productImages
    .map(img => img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`)
    .filter(url => url.length > 100);
  const hasProduct = productDataUrls.length > 0;

  const encoder = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController, data: object) =>
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

  const stream = new ReadableStream({
    async start(controller) {
      try {
        await Promise.allSettled(
          slides.map(async (slide) => {
            let copyText = '';
            if (slide.role === 'hook') {
              copyText = `TITLE: "${slide.title}"${slide.subtitle ? ` | SUBTITLE: "${slide.subtitle}"` : ''}`;
            } else if (slide.role === 'value') {
              copyText = `LIST ITEMS: ${(slide.items || []).map((it, i) => `${i + 1}. "${it}"`).join(' | ')}`;
            } else {
              copyText = `MAIN TEXT: "${slide.title}" | CTA: "${slide.cta}"`;
            }

            const fullPrompt = [
              `Instagram carousel — slide ${slide.index} of 3, role: ${slide.role.toUpperCase()}.`,
              slide.image_direction,
              `Brand: ${brandKit.name}. Primary color: ${brandKit.primary1 || '#000000'}. Secondary: ${brandKit.primary2 || '#ffffff'}. Typography: ${brandKit.typography || 'bold sans-serif'}.`,
              `EXACT TEXT TO DISPLAY — use verbatim, do NOT modify or translate: ${copyText}`,
              `Funnel: ${funnel}. Premium graphic design for Instagram, portrait 4:5. Large bold legible typography. Clean, conversion-focused.`,
              'ALL TEXT IN THE IMAGE MUST BE IN SPANISH. No invented prices, discounts, or trust badges.',
            ].join(' ');

            let base64 = '';
            let lastError = '';

            if (hasProduct) {
              try {
                const srcUrl = productDataUrls[0];
                const b64 = srcUrl.includes(',') ? srcUrl.split(',')[1] : srcUrl;
                const mimeType = srcUrl.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
                const productFile = await toFile(Buffer.from(b64, 'base64'), `product.${mimeType === 'image/png' ? 'png' : 'jpg'}`, { type: mimeType });
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const result = await (openai.images.edit as any)({
                  model: 'gpt-image-2',
                  image: productFile,
                  prompt: fullPrompt,
                  size: '1024x1536',
                  quality: 'low',
                  response_format: 'b64_json',
                  n: 1,
                });
                base64 = result.data?.[0]?.b64_json || '';
              } catch (err) {
                lastError = err instanceof Error ? err.message : String(err);
                console.error(`Carousel slide ${slide.index} images.edit failed:`, err);
              }
            }

            if (!base64) {
              try {
                const result = await openai.images.generate({
                  model: 'gpt-image-2',
                  prompt: fullPrompt,
                  size: '1024x1536',
                  quality: 'low',
                  n: 1,
                });
                base64 = result.data?.[0]?.b64_json || '';
              } catch (err) {
                lastError = err instanceof Error ? err.message : String(err);
                console.error(`Carousel slide ${slide.index} generate failed:`, err);
              }
            }

            if (base64) {
              send(controller, { slide: { id: Math.random().toString(36).slice(2), index: slide.index, role: slide.role, base64 } });
            } else {
              console.error(`Carousel slide ${slide.index} final error:`, lastError);
              send(controller, { error: `Slide ${slide.index}: no se pudo generar. Intentá de nuevo.` });
            }
          })
        );
      } finally {
        send(controller, { done: true });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' },
  });
}
