import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { getUserContext } from '@/app/lib/get-user-context';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const ctx = await getUserContext();
  if (!ctx) {
    return new Response(JSON.stringify({ error: 'Configurá tu API key de OpenAI en el perfil.' }), { status: 401 });
  }

  const { logoPrompt, brandName = '' }: { logoPrompt: string; brandName?: string } = await req.json();
  const openai = new OpenAI({ apiKey: ctx.openaiApiKey });

  const nameAnchor = brandName
    ? `BRAND NAME — render this text EXACTLY as written, letter by letter, with zero modifications: "${brandName}". Do NOT add letters, remove letters, merge letters, or change capitalization. `
    : '';

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const variants = [
        {
          key: 'white',
          prompt: `${nameAnchor}${logoPrompt} CRITICAL: render ALL text, symbols and graphic elements in pure white (#FFFFFF). Background must be solid black (#000000). Same layout and composition as the original logo, only every element becomes white on black. Flat vector style, no gradients.`,
        },
        {
          key: 'dark',
          prompt: `${nameAnchor}${logoPrompt} CRITICAL: render ALL text, symbols and graphic elements in solid dark charcoal (#1a1a1a). Background must be pure white (#FFFFFF). Same layout and composition as the original logo, monochrome dark version. Flat vector style, no colors, no gradients.`,
        },
      ];

      const promises = variants.map(v =>
        openai.images.generate({
          model: 'gpt-image-2',
          prompt: v.prompt,
          size: '1024x1024',
          quality: 'medium',
          n: 1,
        })
          .then(result => send({ variant: v.key, b64: result.data?.[0]?.b64_json || '' }))
          .catch(() => send({ variant: v.key, b64: '' }))
      );

      await Promise.allSettled(promises);
      send({ done: true });
      controller.close();
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
