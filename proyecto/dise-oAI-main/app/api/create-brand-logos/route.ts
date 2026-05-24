import { NextRequest } from 'next/server';
import OpenAI, { toFile } from 'openai';
import { getUserContext } from '@/app/lib/get-user-context';

export const maxDuration = 120;

function getOpenAIErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes('insufficient_quota') || msg.includes('billing'))
    return 'Sin crédito en tu cuenta de OpenAI. Cargá saldo en platform.openai.com → Settings → Billing.';
  if (msg.includes('401') || msg.includes('invalid_api_key'))
    return 'API key inválida. Verificá en platform.openai.com → API Keys.';
  if (msg.includes('429') || msg.includes('rate_limit'))
    return 'Límite de requests alcanzado. Esperá unos segundos e intentá de nuevo.';
  return e instanceof Error ? e.message : 'Error generando logos';
}

export async function POST(req: NextRequest) {
  const ctx = await getUserContext();
  if (!ctx) {
    return new Response(JSON.stringify({ error: 'Configurá tu API key de OpenAI en el perfil.' }), { status: 401 });
  }

  const { logoPrompt, brandName = '', sourceB64 = '' }: { logoPrompt: string; brandName?: string; sourceB64?: string } = await req.json();
  const openai = new OpenAI({ apiKey: ctx.openaiApiKey });

  const nameAnchor = brandName
    ? `BRAND NAME — render this text EXACTLY as written, letter by letter, with zero modifications: "${brandName}". Do NOT add letters, remove letters, merge letters, or change capitalization. `
    : '';

  const encoder = new TextEncoder();

  // Build image file from base64 if available — used for edit-based variants
  const makeImageFile = async (b64: string) => {
    const buffer = Buffer.from(b64, 'base64');
    return toFile(buffer, 'logo.png', { type: 'image/png' });
  };

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const variants = [
        {
          key: 'white',
          // Edit prompt: change ONLY colors/background, preserve every design element
          editPrompt: `Keep the EXACT same logo design, icon shape, typography and composition. Change ONLY: background to solid black (#000000), all logo elements (icon, text, shapes) to pure white (#FFFFFF). Do not redesign, do not add or remove elements. Flat vector style.`,
          // Fallback prompt if no source image
          generatePrompt: `${nameAnchor}${logoPrompt} CRITICAL: render ALL text, symbols and graphic elements in pure white (#FFFFFF). Background must be solid black (#000000). Same layout and composition as the original logo. Flat vector style, no gradients.`,
        },
        {
          key: 'dark',
          editPrompt: `Keep the EXACT same logo design, icon shape, typography and composition. Change ONLY: background to pure white (#FFFFFF), all logo elements (icon, text, shapes) to solid dark charcoal (#1a1a1a). Do not redesign, do not add or remove elements. Flat vector style, monochrome.`,
          generatePrompt: `${nameAnchor}${logoPrompt} CRITICAL: render ALL text, symbols and graphic elements in solid dark charcoal (#1a1a1a). Background must be pure white (#FFFFFF). Same layout and composition as the original logo, monochrome dark version. Flat vector style, no gradients.`,
        },
      ];

      try {
        const promises = variants.map(async v => {
          try {
            let b64 = '';
            if (sourceB64) {
              // Use images.edit so the icon/typography stays identical — only colors change
              const imageFile = await makeImageFile(sourceB64);
              const result = await openai.images.edit({
                model: 'gpt-image-2',
                image: imageFile,
                prompt: v.editPrompt,
                size: '1024x1024',
                n: 1,
              });
              b64 = result.data?.[0]?.b64_json || '';
            }
            if (!b64) {
              // Fallback: generate from prompt (less consistent but better than nothing)
              const result = await openai.images.generate({
                model: 'gpt-image-2',
                prompt: v.generatePrompt,
                size: '1024x1024',
                quality: 'medium',
                n: 1,
              });
              b64 = result.data?.[0]?.b64_json || '';
            }
            send({ variant: v.key, b64 });
          } catch {
            send({ variant: v.key, b64: '' });
          }
        });

        await Promise.allSettled(promises);
        send({ done: true });
      } catch (err) {
        send({ error: getOpenAIErrorMessage(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
