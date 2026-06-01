import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getUserContext } from '@/app/lib/get-user-context';

export const maxDuration = 60;

const GEO_NAMES: Record<string, string> = {
  MX: 'México', CO: 'Colombia', AR: 'Argentina', CL: 'Chile', PE: 'Perú',
};

async function fetchGoogleTrends(geo: string): Promise<string[]> {
  const url = `https://trends.google.com/trends/api/dailytrends?hl=es&tz=-300&geo=${geo}&ns=15`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'es-419,es;q=0.9',
    },
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`Trends ${res.status}`);
  const text = await res.text();
  const start = text.indexOf('{');
  if (start === -1) throw new Error('Invalid trends response');
  const json = JSON.parse(text.slice(start));
  const days = json?.default?.trendingSearchesDays || [];
  if (!days.length) return [];
  return (days[0]?.trendingSearches || []).map((s: { title: { query: string } }) => s.title.query);
}

export async function POST(req: NextRequest) {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Configurá tu API key de OpenAI en Perfil.' }, { status: 401 });

  const { geo = 'MX', niche = '' } = await req.json();

  let keywords: string[] = [];
  try {
    keywords = await fetchGoogleTrends(geo);
  } catch {
    return NextResponse.json({ error: 'No se pudo obtener tendencias de Google. Intentá de nuevo.' }, { status: 500 });
  }

  if (!keywords.length) {
    return NextResponse.json({ error: 'Sin datos de tendencias para este país hoy.' }, { status: 404 });
  }

  const openai = new OpenAI({ apiKey: ctx.openaiApiKey });

  const prompt = `Sos un experto en e-commerce y dropshipping para LATAM.

Búsquedas tendencia en ${GEO_NAMES[geo] || geo} hoy:
${keywords.map((k, i) => `${i + 1}. ${k}`).join('\n')}

${niche ? `Nicho de interés: "${niche}". Priorizá tendencias relacionadas pero incluí otras con potencial comercial claro.` : ''}

Filtrá SOLO las que tienen intención de compra real para productos físicos dropshipeables.
Excluí: noticias, política, deportes, entretenimiento, celebridades, búsquedas informacionales puras.

Respondé SOLO con JSON válido:
{
  "opportunities": [
    {
      "keyword": "término original",
      "need": "el dolor o necesidad real en 1 oración (primera persona implícita, ej: 'Alivio para las rodillas sin pastillas')",
      "audience": "perfil breve del comprador (edad, contexto)",
      "urgency": "alta" | "media"
    }
  ]
}

Máximo 6 oportunidades. Solo las más sólidas.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 1000,
    });
    const data = JSON.parse(response.choices[0].message.content || '{}');
    return NextResponse.json({ opportunities: data.opportunities || [] });
  } catch {
    return NextResponse.json({ error: 'Error al analizar las tendencias.' }, { status: 500 });
  }
}
