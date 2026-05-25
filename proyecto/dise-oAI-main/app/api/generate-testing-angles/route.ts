import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { BrandKit } from '@/app/types';
import { buildBrandKitContext } from '@/app/lib/brandKitContext';
import { getUserContext } from '@/app/lib/get-user-context';

export const maxDuration = 300;

function getOpenAIErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes('401') || msg.includes('invalid_api_key'))
    return 'API key de OpenAI inválida. Verificá la clave en tu perfil.';
  if (msg.includes('429') || msg.includes('quota') || msg.includes('rate_limit'))
    return 'Límite de uso de OpenAI alcanzado. Esperá unos minutos o revisá tu plan.';
  if (msg.includes('insufficient_quota'))
    return 'Sin crédito en tu cuenta de OpenAI. Recargá saldo en platform.openai.com.';
  return 'Error al conectar con OpenAI. Intentá de nuevo.';
}

function isRefusal(text: string): boolean {
  if (!text || text.length < 30) return true;
  const lower = text.toLowerCase();
  return (
    lower.includes("i'm sorry") || lower.includes("i cannot") || lower.includes("i can't") ||
    lower.includes("lo siento") || lower.includes("no puedo") || lower.includes("no es posible")
  );
}

export interface MessageAngle {
  key: string;
  name: string;
  hook: string;
  emphasis: string;
}

const CLOTHING_TERMS = /\b(prenda|vestido|pantalón|remera|camiseta|camisa|campera|buzo|short|pollera|falda|indumentaria|calzado|zapatilla|zapato|tela|tejido|outfit|jean|jogger|bikini|traje|garment|clothing|apparel|fabric|dress|shirt|pants|jacket|hoodie|sneaker|shoe|top|blouse|skirt|coat|sleeve|collar|hem|knit|denim|cotton|polyester)\b/i;

const PRODUCT_DESCRIPTION_PROMPT_FASHION = `Sos un técnico de producto de moda de alta gama. Analizá esta prenda y describila con precisión quirúrgica para que pueda ser reproducida EXACTAMENTE por un modelo de IA generativa.

Describí en este orden exacto:
1. TIPO DE PRENDA: categoría (remera, pantalón, vestido, campera, etc.), silueta y corte (oversize, entallado, recto, cargo, etc.), largo
2. COLOR BASE — ES LO MÁS CRÍTICO: describí el color con máxima precisión. NO uses solo el nombre del color. Usá referencias concretas. Describí saturación, temperatura y cómo se comporta bajo la luz. Para neutros cálidos (beige, arena, tostado, crudo, khaki), aclará explícitamente que NO debe renderizarse como blanco ni gris.
3. ESTAMPADO / PRINT: describí CADA elemento gráfico. Si es color sólido, indicar "color sólido uniforme".
4. MATERIALES Y TEXTURA: acabado, tejido visible, peso visual, transparencia
5. DETALLES DE CONFECCIÓN: tiro, bolsillos, cintura, costuras decorativas, terminaciones
6. ELEMENTOS ÚNICOS: cualquier detalle que diferencie esta prenda de una genérica

CRÍTICO: NO menciones ninguna marca ni logo de terceros.`;

const PRODUCT_DESCRIPTION_PROMPT_GENERIC = `Sos un experto en descripción de productos para generación de imágenes IA. Analizá este producto y describilo con precisión máxima. La persona que lea tu descripción no puede ver la foto.

PRIMERO determiná si el producto tiene packaging/envase o si es un producto sin packaging.

Para PRODUCTOS CON PACKAGING:
1. TIPO: nombre exacto, categoría, variante visible
2. ENVASE: tipo, tamaño relativo
3. COLORES — CRÍTICO: color exacto del cuerpo y etiqueta. Para oscuros: NO debe renderizarse más claro.
4. DISEÑO GRÁFICO: estilo tipográfico, elementos visuales principales
5. TEXTO VISIBLE: nombre del producto, variante, claims
6. ELEMENTOS ÚNICOS: detalles que distinguen este packaging

Para PRODUCTOS SIN PACKAGING:
1. TIPO: nombre exacto, categoría, función
2. FORMA: silueta, proporciones
3. COLORES — CRÍTICO: color exacto de cada componente.
4. MATERIALES Y ACABADOS
5. DETALLES CONSTRUCTIVOS
6. ELEMENTOS ÚNICOS

CRÍTICO: NO menciones ninguna marca ni logo de terceros.`;

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
    brief = '',
    brandKit,
    productImage = '',
    referenceImages = [],
    count = 4,
  }: {
    brief?: string;
    brandKit: BrandKit;
    productImage?: string;
    referenceImages?: string[];
    count?: number;
  } = await req.json();

  const openai = new OpenAI({ apiKey: ctx.openaiApiKey });
  const brandKitContext = buildBrandKitContext(brandKit);
  const targetCount = Math.max(2, Math.min(count, 6));

  const productDataUrl = productImage
    ? (productImage.startsWith('data:') ? productImage : `data:image/jpeg;base64,${productImage}`)
    : '';

  const encoder = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController, data: object) =>
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

  // Step 0: detect if fashion product (text + vision)
  const isFashionBrief = CLOTHING_TERMS.test(brief + ' ' + (brandKit.styleDescription || ''));
  let isFashionProduct = isFashionBrief;

  if (productDataUrl && productDataUrl.length > 100) {
    try {
      const classifyRes = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Is this product a clothing item, garment, shoe, or wearable fashion accessory worn on the body? Answer only YES or NO.' },
            { type: 'image_url', image_url: { url: productDataUrl, detail: 'low' } },
          ],
        }],
        max_tokens: 5,
      });
      const answer = (classifyRes.choices[0].message.content || '').trim().toUpperCase();
      isFashionProduct = answer.startsWith('YES');
    } catch {
      // fallback to text-based detection
    }
  }

  // Step 1: describe the product
  let productDescription = brief;
  if (productDataUrl && productDataUrl.length > 100) {
    const descPrompt = isFashionProduct ? PRODUCT_DESCRIPTION_PROMPT_FASHION : PRODUCT_DESCRIPTION_PROMPT_GENERIC;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const descResponse = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: descPrompt },
              { type: 'image_url', image_url: { url: productDataUrl, detail: 'high' } },
            ],
          }],
          max_tokens: 700,
        });
        const desc = descResponse.choices[0].message.content || '';
        if (!isRefusal(desc)) { productDescription = desc; break; }
      } catch (err) {
        console.error(`testing-angles describe attempt ${attempt + 1}:`, err);
      }
    }
  }

  // Step 2: describe reference person (fashion only)
  let personDescription = '';
  if (isFashionProduct && referenceImages.length > 0) {
    try {
      const personRes = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Describí brevemente las características físicas de las personas en estas imágenes: tono de piel, cabello, complexión, edad aproximada. Máximo 2 oraciones.' },
            ...referenceImages.map(img => ({
              type: 'image_url' as const,
              image_url: { url: img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`, detail: 'low' as const },
            })),
          ],
        }],
        max_tokens: 150,
      });
      personDescription = personRes.choices[0].message.content || '';
    } catch (err) {
      console.error('testing-angles person describe failed:', err);
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Step 3: generate N message angles (text only) with GPT-4o
        const anglesPrompt = `Sos un estratega de publicidad directa para e-commerce.
Analizá este producto y generá exactamente ${targetCount} ángulos de mensaje distintos para anuncios de respuesta directa.

PRODUCTO: ${productDescription}
BRIEF: ${brief || '(sin brief adicional)'}
MARCA: ${brandKit.name}${brandKit.clientRequest ? ` — ${brandKit.clientRequest}` : ''}

Cada ángulo debe:
- Apuntar a una motivación, problema o segmento de audiencia DIFERENTE
- Tener un hook que detiene el scroll (max 8 palabras, en español, directo y concreto)
- Enfatizar una razón de compra distinta — NO repetir el mismo argumento con otra redacción
- Ser honesto — PROHIBIDO inventar precios, métricas, descuentos o resultados que no estén en el brief

Respondé SOLO con JSON:
{
  "angles": [
    { "name": "nombre corto del ángulo (3-4 palabras)", "hook": "titular que detiene el scroll", "emphasis": "qué beneficio o razón de compra enfatiza en una oración" }
  ]
}`;

        let angles: MessageAngle[] = [];
        try {
          const anglesRes = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{ role: 'user', content: anglesPrompt }],
            response_format: { type: 'json_object' },
            max_tokens: 800,
            temperature: 0.9,
          });
          const parsed = JSON.parse(anglesRes.choices[0].message.content || '{}');
          angles = (parsed.angles || []).slice(0, targetCount).map((a: Omit<MessageAngle, 'key'>, i: number) => ({
            key: `angle-${i}`,
            name: a.name || `Ángulo ${i + 1}`,
            hook: a.hook || '',
            emphasis: a.emphasis || '',
          }));
        } catch (err) {
          console.error('testing-angles: angle generation failed:', err);
          send(controller, { error: 'Error al generar ángulos. Intentá de nuevo.' });
          return;
        }

        if (angles.length === 0) {
          send(controller, { error: 'No se pudieron generar ángulos. Agregá más contexto en el brief.' });
          return;
        }

        // Stream angles immediately so UI shows labels while images generate
        send(controller, { angles });

        // Step 4: generate one image per angle in Directo format
        const compositionInstruction = isFashionProduct
          ? `CREATIVE FORMAT: Directo fashion. A person wearing the exact garment in a direct-response style — aspirational and confident, not pure editorial. The garment must be the visual hero. Clean background or minimal setting. ONE bold headline displaying the hook, large and prominent.`
          : `CREATIVE FORMAT: Directo. Product occupies 60-70% of the frame, prominent and clear. No lifestyle, no editorial — pure direct response. ONE bold headline displaying the hook, large and prominent. One short supporting subline.`;

        const productConstraint = productDataUrl && productDataUrl.length > 100
          ? `THE REFERENCE PHOTO SHOWS THE EXACT PRODUCT — reproduce it with zero modifications: same shape, same color, same packaging, same proportions. Supplementary description: ${productDescription}`
          : `PRODUCT: ${productDescription}.`;

        await Promise.allSettled(
          angles.map(async (angle) => {
            const fullPrompt = [
              productConstraint,
              compositionInstruction,
              `HEADLINE (display this exact text, large and bold): "${angle.hook}"`,
              `MESSAGE EMPHASIS: ${angle.emphasis}.`,
              `Brand: ${brandKit.name}. Colors: ${brandKit.primary1}, ${brandKit.primary2}, ${brandKit.primary3}. Typography: ${brandKit.typography || 'bold sans-serif'}.`,
              isFashionProduct
                ? `COLOR ACCURACY CRITICAL: replicate the exact garment color from the reference photo — do NOT shift, lighten, darken, or desaturate. For warm neutrals (beige, sand, khaki): preserve the warm undertone, never render as white or gray.`
                : `COLOR ACCURACY CRITICAL: reproduce the product color exactly — do NOT shift, lighten, darken, or desaturate.`,
              `Brand context: ${brandKitContext}`,
              'Portrait 1024x1536. ALL text in Spanish. Professional agency quality.',
              'ANTI-HALLUCINATION: Do NOT invent prices, discounts, metrics, phone numbers, URLs, or statistics not in the brief.',
              'Do NOT include button-style CTAs in the image.',
            ].filter(Boolean).join(' ');

            let base64 = '';

            const inputImages = [
              ...(productDataUrl && productDataUrl.length > 100 ? [productDataUrl] : []),
              ...(isFashionProduct && referenceImages.length > 0
                ? referenceImages.slice(0, 1).map(img => img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`)
                : []),
            ];

            const inputContent = [
              ...inputImages.map(url => ({ type: 'input_image', image_url: url, detail: 'high' })),
              { type: 'input_text', text: fullPrompt },
            ];

            for (let attempt = 1; attempt <= 2; attempt++) {
              try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const response = await (openai.responses.create as any)({
                  model: 'gpt-image-2',
                  input: [{ role: 'user', content: inputContent }],
                  tools: [{
                    type: 'image_generation',
                    model: 'gpt-image-2',
                    quality: 'medium',
                    size: '1024x1536',
                  }],
                });
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                for (const block of (response.output || [])) {
                  if (block.type === 'image_generation_call' && block.result) {
                    base64 = block.result;
                    break;
                  }
                }
                if (base64) break;
              } catch (err) {
                console.error(`testing-angles "${angle.name}" attempt ${attempt} failed:`, err);
                if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
              }
            }

            if (!base64) {
              try {
                const fallback = await openai.images.generate({
                  model: 'gpt-image-2',
                  prompt: `Direct response ad for ${brandKit.name}. ${productDescription.slice(0, 200)}. Headline: "${angle.hook}". Colors: ${brandKit.primary1}. Portrait. Spanish text only.`,
                  size: '1024x1536',
                  quality: 'low',
                  n: 1,
                });
                base64 = fallback.data?.[0]?.b64_json || '';
              } catch (err) {
                console.error(`testing-angles "${angle.name}" fallback failed:`, err);
              }
            }

            if (base64) {
              send(controller, {
                image: {
                  id: Math.random().toString(36).slice(2),
                  base64,
                  angleKey: angle.key,
                  angleName: angle.name,
                  hook: angle.hook,
                  emphasis: angle.emphasis,
                },
              });
            } else {
              send(controller, { angleError: angle.key });
            }
          })
        );

        // Return metadata for the apply-product step on the frontend
        send(controller, { done: true, isFashionProduct, productDescription, personDescription });
      } catch (err) {
        send(controller, { error: getOpenAIErrorMessage(err) });
      } finally {
        if (!controller.desiredSize === null) {
          try { controller.close(); } catch { /* already closed */ }
        }
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
