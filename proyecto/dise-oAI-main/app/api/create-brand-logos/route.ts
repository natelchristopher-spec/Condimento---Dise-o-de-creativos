import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getUserContext } from '@/app/lib/get-user-context';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Configurá tu API key de OpenAI en el perfil.' }, { status: 401 });

  const { logoPrompt }: { logoPrompt: string } = await req.json();
  const openai = new OpenAI({ apiKey: ctx.openaiApiKey });

  const [whiteResult, darkResult] = await Promise.allSettled([
    openai.images.generate({
      model: 'gpt-image-2',
      prompt: `${logoPrompt} CRITICAL: render ALL text, symbols and graphic elements in pure white (#FFFFFF). Background must be solid black (#000000). Same layout and composition as the original logo, only every element becomes white on black. Flat vector style, no gradients.`,
      size: '1024x1024',
      quality: 'medium',
      n: 1,
    }),
    openai.images.generate({
      model: 'gpt-image-2',
      prompt: `${logoPrompt} CRITICAL: render ALL text, symbols and graphic elements in solid dark charcoal (#1a1a1a). Background must be pure white (#FFFFFF). Same layout and composition as the original logo, monochrome dark version. Flat vector style, no colors, no gradients.`,
      size: '1024x1024',
      quality: 'medium',
      n: 1,
    }),
  ]);

  const logoWhiteBase64 = whiteResult.status === 'fulfilled' ? (whiteResult.value.data?.[0]?.b64_json || '') : '';
  const logoDarkBase64 = darkResult.status === 'fulfilled' ? (darkResult.value.data?.[0]?.b64_json || '') : '';

  if (!logoWhiteBase64 && !logoDarkBase64) {
    return NextResponse.json({ error: 'No se pudieron generar las variantes de logo.' }, { status: 500 });
  }

  return NextResponse.json({ logoWhiteBase64, logoDarkBase64 });
}
