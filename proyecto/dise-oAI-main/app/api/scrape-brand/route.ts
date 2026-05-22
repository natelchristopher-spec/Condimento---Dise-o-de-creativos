import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getUserContext } from '@/app/lib/get-user-context';

export const maxDuration = 60;

const CATEGORIES = ['moda', 'skincare', 'suplementos', 'hogar', 'accesorios', 'electronica', 'mascotas', 'food', 'otros'];

function extractText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000);
}

export async function POST(req: NextRequest) {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Configurá tu API key de OpenAI en el perfil.' }, { status: 401 });

  const { url }: { url: string } = await req.json();
  if (!url?.startsWith('http')) return NextResponse.json({ error: 'URL inválida.' }, { status: 400 });

  let pageText = '';
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es-AR,es;q=0.9',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    pageText = extractText(await res.text());
  } catch (e) {
    return NextResponse.json({ error: `No se pudo acceder a la URL: ${e instanceof Error ? e.message : 'error de red'}` }, { status: 422 });
  }

  const openai = new OpenAI({ apiKey: ctx.openaiApiKey });

  try {
    const { choices } = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: `Analizá el contenido de esta tienda/negocio online y extraé información de la marca.

CONTENIDO:
${pageText}

Extraé:
- businessName: nombre exacto del negocio/marca (del título, header, logo alt text, og:title)
- category: categoría del negocio — elegí la más precisa de: ${CATEGORIES.join(', ')}
- brief: qué vende y a quién, en 2-3 oraciones directas (ej: "Ropa de gym para mujeres jóvenes urbanas. Prendas funcionales con diseño editorial.")

Respondé SOLO con JSON: { "businessName": "...", "category": "...", "brief": "..." }`,
      }],
      response_format: { type: 'json_object' },
      max_tokens: 300,
      temperature: 0.2,
    });

    const data = JSON.parse(choices[0].message.content || '{}');
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: `Error al analizar la página: ${e instanceof Error ? e.message : 'error desconocido'}` }, { status: 500 });
  }
}
