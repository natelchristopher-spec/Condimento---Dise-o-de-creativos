import { NextRequest } from 'next/server';
import OpenAI, { toFile } from 'openai';
import { BrandKit } from '@/app/types';
import { getUserContext } from '@/app/lib/get-user-context';
import type { CarouselSlide } from '../plan-carousel/route';

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
              copyText = `CLOSING TEXT: "${slide.title}"`;
            }

            const fullPrompt = [
              `Instagram carousel — slide ${slide.index} of 3, role: ${slide.role.toUpperCase()}.`,
              slide.image_direction,
              hasProduct ? `PRODUCT REFERENCE: a product photo is provided — incorporate the product naturally into the composition. The product must be recognizable and visually present. Do NOT modify the product's color, shape, or packaging. Place it in a way that feels natural for the slide role: hook slide = product as supporting element in composition; value slide = product subtly visible; closing slide = product prominently featured.` : '',
              `Brand: ${brandKit.name}. Primary color: ${brandKit.primary1 || '#000000'}. Secondary: ${brandKit.primary2 || '#ffffff'}. Typography: ${brandKit.typography || 'bold sans-serif'}.`,
              `EXACT TEXT TO DISPLAY — use verbatim, do NOT modify or translate: ${copyText}`,
              `Premium graphic design for Instagram, portrait 4:5. Large bold legible typography. Clean, conversion-focused. Do NOT include funnel stage labels or internal tags as visible text.`,
              'IDIOMA — CRÍTICO: TODO el texto generado (beneficios, features, claims, CTAs, etiquetas) debe estar en ESPAÑOL. Solo se permite inglés si es parte del nombre de marca o nombre de producto. NUNCA generar copy descriptivo en inglés.',
              `CARRUSEL VISUAL COHERENTE: Esta es la slide ${slide.index} de 3. Las 3 slides DEBEN compartir idéntica paleta de colores, mismo peso tipográfico y mismo tratamiento visual general. Se ven como diseñadas por el mismo director creativo en la misma sesión de diseño.`,
              'ANTI-HALLUCINATION — do NOT invent or add any data not in the brief: phone numbers, URLs, social handles, QR codes, star ratings, testimonials, customer counts, certifications, ingredient/material claims, deadlines, discounts, promotional mechanics, awards, or any statistics. Only use what is explicitly in the brief.',
              `BRAND LOGO RULE: Do NOT generate any logo, icon, symbol, or graphic brand element. If brand identification is needed, write only the brand name "${brandKit.name}" as plain text — no decoration, no icon, no invented wordmark.`,
            ].filter(Boolean).join(' ');

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

            if (!base64) {
              try {
                const primary1 = brandKit.primary1 || '#000000';
                const primary2 = brandKit.primary2 || '#ffffff';
                const simplifiedPrompt = `Premium advertising slide for ${brandKit.name}, slide ${slide.index} of 3. Brand colors: ${primary1}, ${primary2}. Clean typography, Spanish text only. Portrait 4:5, clean composition.`;
                const result = await openai.images.generate({
                  model: 'gpt-image-2',
                  prompt: simplifiedPrompt,
                  size: '1024x1536',
                  quality: 'low',
                  n: 1,
                });
                base64 = result.data?.[0]?.b64_json || '';
              } catch (err) {
                lastError = err instanceof Error ? err.message : String(err);
                console.error(`Carousel slide ${slide.index} simplified retry failed:`, err);
              }
            }

            if (base64) {
              send(controller, { slide: { id: Math.random().toString(36).slice(2), index: slide.index, role: slide.role, base64 } });
            } else {
              console.error(`Carousel slide ${slide.index} final error:`, lastError);
              const errMsg = lastError
                ? getOpenAIErrorMessage(new Error(lastError))
                : `Slide ${slide.index}: no se pudo generar. Intentá de nuevo.`;
              send(controller, { error: errMsg });
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
