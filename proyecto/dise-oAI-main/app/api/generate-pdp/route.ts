import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import type { ChatCompletionContentPart } from 'openai/resources/chat/completions';
import { BrandKit } from '@/app/types';
import { buildBrandKitContext } from '@/app/api/brandKitContext';
import { getUserContext } from '@/app/lib/get-user-context';

export const maxDuration = 300;

type PeopleMode = 'none' | 'real';

interface PdpImageItem {
  type: string;
  label: string;
  image_prompt: string;
}

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
  if (!ctx) {
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode('data: {"error":"Configurá tu API key de OpenAI en el perfil."}\n\n'));
        c.close();
      },
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
  }

  const {
    brief, brandKit, peopleMode = 'none',
    productImages = [], referenceImages = [],
    testimonialText = '', authorityText = '',
  }: {
    brief: string;
    brandKit: BrandKit;
    peopleMode: PeopleMode;
    productImages: string[];
    referenceImages: string[];
    testimonialText: string;
    authorityText: string;
  } = await req.json();

  const openai = new OpenAI({ apiKey: ctx.openaiApiKey });
  const brandKitContext = buildBrandKitContext(brandKit);
  const hasPeople = peopleMode === 'real';

  const lifestyleInstruction = hasPeople
    ? '3. LIFESTYLE IMAGE — una persona vistiendo / usando el producto en una situación cotidiana auténtica y aspiracional. La persona debe verse natural. Genera deseo y conexión emocional.'
    : '3. LIFESTYLE IMAGE — el producto integrado en su contexto natural de uso (escritorio, cocina, gym, etc.), sin personas. El ambiente rodea al producto de forma natural y cercana.';

  const systemPrompt = `Sos un director creativo senior especializado en PDPs de e-commerce (Shopify / Tienda Nube).
Dado un brief de producto y brand kit, generá exactamente 6 prompts de imagen — uno por cada tipo del sistema SPICY PDP.
Formato: cuadrado 1:1 (1024x1024), optimizado para carrusel de producto.

TIPOS DE IMAGEN (exactamente en este orden):
1. PRODUCT HERO — el producto llena el 80% del encuadre. Fondo blanco puro o color sólido del brand kit. Iluminación de estudio premium, sombras suaves. Sin copy salvo logo pequeño discreto. El usuario entiende en 1 segundo qué compra.
2. BENEFIT IMAGE — producto central + exactamente 3 beneficios clave con íconos simples y frases cortas en tipografía bold. Layout scannable. El usuario entiende el valor sin leer la PDP.
${lifestyleInstruction}
4. AUTHORITY IMAGE — closeup del producto destacando materiales, ingredientes o tecnología. Callouts visuales precisos sobre el producto. Justifica el precio y genera autoridad.
5. HOW TO USE IMAGE — exactamente 3 pasos de uso numerados, visuales y claros. Elimina la fricción pre-compra. Amigable, no técnico.
6. TESTIMONIAL IMAGE — producto + elemento de prueba social: cita breve de reseña, estrellas de rating, indicador de confianza. Si el brief no tiene testimonio, usá un estilo visual genérico pero creíble (ej: "★★★★★ · +2.000 clientes").

REGLAS:
- Colores: usá los hex exactos del brand kit
- Estilo PREMIUM, limpio, e-commerce de alta gama
- PROHIBIDO: botones CTA ("Compra ahora" etc.), precios inventados, descuentos no mencionados en el brief, métricas falsas
- ${hasPeople ? 'Modo fashion: la imagen LIFESTYLE debe incluir personas' : 'Modo producto: sin personas en ninguna imagen'}
- Cada image_prompt debe mencionar colores hex exactos, estilo de tipografía, y elementos concretos del producto

Respondé SOLO con JSON: { "pdp_images": [ { "type": "hero|benefit|lifestyle|authority|howto|testimonial", "label": "...", "image_prompt": "..." }, ... ] }`;

  const productDataUrls = productImages.map(img =>
    img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`
  );
  const referenceDataUrls = referenceImages.map(img =>
    img.startsWith('data:') ? img : `data:image/png;base64,${img}`
  );

  const userContent: ChatCompletionContentPart[] = [
    { type: 'text', text: `BRAND KIT:\n${brandKitContext}\n\nBRIEF DEL PRODUCTO:\n${brief}` },
    ...productDataUrls.slice(0, 2).map(url => ({
      type: 'image_url' as const,
      image_url: { url, detail: 'low' as const },
    })),
    ...(hasPeople ? referenceDataUrls.slice(0, 1).map(url => ({
      type: 'image_url' as const,
      image_url: { url, detail: 'low' as const },
    })) : []),
  ];

  // Step 1: GPT-4o plans the 6 prompts
  const conceptsResponse = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    response_format: { type: 'json_object' },
  });

  const parsed = JSON.parse(conceptsResponse.choices[0].message.content || '{}');
  const pdpItems: PdpImageItem[] = parsed.pdp_images || [];

  // Ensure all 6 types are present (fallback if GPT skipped any)
  const orderedItems = PDP_TYPES.map(t => {
    const found = pdpItems.find(item => item.type === t.type);
    const base = {
      type: t.type,
      label: t.label, // always use our fixed label, never GPT's (which can include the brand name)
      image_prompt: found?.image_prompt || `${t.label} for: ${brief.slice(0, 120)}. Brand colors: ${brandKit.primary1}, ${brandKit.primary2}. Square 1:1 e-commerce format, premium quality.`,
    };

    // Inject user-provided text verbatim so the AI can't invent it
    if (t.type === 'testimonial' && testimonialText) {
      return {
        ...base,
        image_prompt: `${base.image_prompt} IMPORTANT — use EXACTLY this testimonial text in the image, do not modify or invent alternative copy: "${testimonialText}"`,
      };
    }
    if (t.type === 'authority' && authorityText) {
      return {
        ...base,
        image_prompt: `${base.image_prompt} IMPORTANT — use EXACTLY these authority claims/specs as the text in the image, do not invent alternatives: "${authorityText}"`,
      };
    }
    return base;
  });

  // Step 2: generate all 6 images in parallel, stream as they complete
  const inputImages = [
    ...productDataUrls.slice(0, 2),
    ...(hasPeople ? referenceDataUrls.slice(0, 1) : []),
  ];

  const productHint = productImages.length > 0
    ? 'PRODUCT ACCURACY: The provided reference images show the exact product — replicate its color, texture, and shape faithfully.'
    : '';

  const encoder = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController, data: object) =>
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

  const stream = new ReadableStream({
    async start(controller) {
      try {
        await Promise.allSettled(
          orderedItems.map(async (item) => {
            const fullPrompt = [
              item.image_prompt,
              `Brand colors: ${brandKit.primary1}, ${brandKit.primary2}, ${brandKit.primary3}.`,
              `Typography: ${brandKit.typography || 'bold sans-serif'}.`,
              productHint,
              'Professional e-commerce product photography or high-end retail graphic design. Square 1:1 format for Shopify / Tienda Nube product carousel. Premium quality, clean, conversion-focused.',
              'do NOT include button-style CTAs ("Compra ahora", "Buy Now", etc.) in the image.',
              'do NOT include invented prices, discounts, or false metrics.',
            ].filter(Boolean).join(' ');

            let base64 = '';
            let lastError = '';

            // Primary: images.generate (same as generate-concepts fallback, proven reliable)
            try {
              const result = await openai.images.generate({
                model: 'gpt-image-2',
                prompt: fullPrompt,
                size: '1024x1024',
                quality: 'medium',
                n: 1,
              });
              base64 = result.data?.[0]?.b64_json || '';
            } catch (err) {
              lastError = err instanceof Error ? err.message : String(err);
              console.error(`PDP primary "${item.label}" failed:`, err);
            }

            // Fallback: Responses API with product images as reference
            if (!base64 && inputImages.length > 0) {
              try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const response = await (openai.responses.create as any)({
                  model: 'gpt-image-2',
                  input: [{
                    role: 'user',
                    content: [
                      ...inputImages.map(img => ({ type: 'input_image', image_url: img, detail: 'low' })),
                      { type: 'input_text', text: fullPrompt },
                    ],
                  }],
                  tools: [{
                    type: 'image_generation',
                    model: 'gpt-image-2',
                    quality: 'medium',
                    size: '1024x1024',
                  }],
                });
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                for (const block of (response.output || [])) {
                  if (block.type === 'image_generation_call' && block.result) {
                    base64 = block.result;
                    break;
                  }
                }
              } catch (err) {
                lastError = err instanceof Error ? err.message : String(err);
                console.error(`PDP fallback "${item.label}" failed:`, err);
              }
            }

            if (base64) {
              send(controller, {
                image: {
                  id: Math.random().toString(36).slice(2),
                  type: item.type,
                  label: item.label,
                  base64,
                },
              });
            } else {
              send(controller, { error: `${item.label}: ${lastError || 'sin imagen'}` });
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
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
