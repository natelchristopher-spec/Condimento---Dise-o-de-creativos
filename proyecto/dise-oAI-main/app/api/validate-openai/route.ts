import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getUserContext } from '@/app/lib/get-user-context';

export const maxDuration = 15;

export async function POST(req: NextRequest) {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ valid: false, error: 'No autenticado.' }, { status: 401 });

  const { apiKey } = await req.json();
  if (!apiKey || !String(apiKey).startsWith('sk-')) {
    return NextResponse.json({ valid: false, error: 'La API key debe comenzar con sk-' });
  }

  const openai = new OpenAI({ apiKey, timeout: 10000 });

  try {
    await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 1,
    });
    return NextResponse.json({ valid: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('401') || msg.includes('Incorrect API key') || msg.includes('invalid_api_key')) {
      return NextResponse.json({ valid: false, error: 'API key inválida. Verificá que la copiaste correctamente desde platform.openai.com → API Keys.' });
    }
    if (msg.includes('insufficient_quota')) {
      return NextResponse.json({ valid: false, error: 'Sin crédito en tu cuenta de OpenAI. Cargá al menos $5 en platform.openai.com → Settings → Billing.' });
    }
    // Rate limit = key válida con cuota
    if (msg.includes('429') || msg.includes('rate_limit')) {
      return NextResponse.json({ valid: true });
    }
    // Timeout or OpenAI down — don't block the save
    if (msg.includes('timeout') || msg.includes('ECONNRESET') || msg.includes('ETIMEDOUT') || msg.includes('fetch failed')) {
      return NextResponse.json({ valid: true, warning: 'No se pudo verificar el crédito (OpenAI lento), pero se guardó la key.' });
    }
    return NextResponse.json({ valid: false, error: 'No se pudo verificar la API key. Intentá de nuevo.' });
  }
}
