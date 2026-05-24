import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getUserContext } from '@/app/lib/get-user-context';

export const maxDuration = 15;

export async function GET() {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ hasCredits: false, reason: 'no_key' });

  const openai = new OpenAI({ apiKey: ctx.openaiApiKey, timeout: 8000 });
  try {
    await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 1,
    });
    return NextResponse.json({ hasCredits: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('insufficient_quota') || msg.includes('billing'))
      return NextResponse.json({ hasCredits: false, reason: 'no_credits' });
    // Rate limit, timeout, OpenAI down — don't block
    return NextResponse.json({ hasCredits: true });
  }
}
