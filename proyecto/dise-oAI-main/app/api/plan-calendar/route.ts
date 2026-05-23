import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { BrandKit } from '@/app/types';
import { buildBrandKitContext } from '@/app/lib/brandKitContext';
import { getUserContext } from '@/app/lib/get-user-context';

export const maxDuration = 60;

type FunnelStage = 'TOFU' | 'MOFU' | 'BOFU';
type PostFormat = 'carousel' | 'image';

export interface CalendarPost {
  id: string;
  week: number;
  dayOfWeek: 'Lunes' | 'Miércoles' | 'Viernes' | 'Domingo';
  format: PostFormat;
  funnel: FunnelStage;
  title: string;
  hook: string;
  why: string;
}

export async function POST(req: NextRequest) {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Configurá tu API key de OpenAI en el perfil.' }, { status: 401 });

  const { brandKit, month, year }: {
    brandKit: BrandKit;
    month: number;
    year: number;
  } = await req.json();

  if (!brandKit) return NextResponse.json({ error: 'Falta el brand kit.' }, { status: 400 });

  const openai = new OpenAI({ apiKey: ctx.openaiApiKey });
  const brandKitContext = buildBrandKitContext(brandKit);

  const monthName = new Date(year, month - 1, 1).toLocaleString('es-AR', { month: 'long' });

  const prompt = `Sos un estratega de contenido para Instagram especializado en e-commerce y dropshipping.

Creá el plan de contenido para TODO el mes de ${monthName} ${year} para esta marca.

MARCA:
${brandKitContext}

ESTRUCTURA DEL MES:
- 4 semanas × 4 posts por semana = 16 posts totales
- Días fijos por semana: Lunes, Miércoles, Viernes, Domingo
- Formatos que se alternan: "carousel" (3 slides) y "image" (imagen simple cuadrada)
- Distribución de formato sugerida por semana:
  Lunes → carousel
  Miércoles → image
  Viernes → carousel
  Domingo → image
- Distribución de funnel en el mes debe ser equilibrada: aproximadamente 5-6 TOFU, 5-6 MOFU, 4-5 BOFU

REGLAS DE CONTENIDO:
- TOFU: educativo puro del nicho, sin mencionar el producto ni vender
- MOFU: comparativo, beneficios, diferenciales de la marca — solo datos del brand kit
- BOFU: urgencia, prueba social, conversión — NO inventar precios, métricas ni descuentos
- Los temas deben ser variados, no repetir el mismo ángulo dos veces seguidas
- Hooks deben ser diferentes entre sí — distintos estilos: pregunta, afirmación polémica, dato sorprendente, historia

Para cada post generá:
- week: número de semana (1 a 4)
- dayOfWeek: exactamente uno de "Lunes", "Miércoles", "Viernes", "Domingo"
- format: exactamente "carousel" o "image"
- funnel: exactamente "TOFU", "MOFU" o "BOFU"
- title: tema del post, máximo 10 palabras
- hook: frase gancho para el primer slide o imagen, máximo 10 palabras
- why: una oración explicando por qué este tema es relevante para la audiencia en este momento del funnel

Respondé SOLO con JSON válido:
{
  "posts": [
    {
      "week": 1,
      "dayOfWeek": "Lunes",
      "format": "carousel",
      "funnel": "TOFU",
      "title": "...",
      "hook": "...",
      "why": "..."
    },
    ...16 posts en total...
  ]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 2000,
      temperature: 0.85,
    });

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(response.choices[0].message.content || '{}');
    } catch {
      return NextResponse.json({ error: 'Error procesando el calendario. Intentá de nuevo.' }, { status: 500 });
    }

    const rawPosts = (data.posts as CalendarPost[]) || [];
    const posts: CalendarPost[] = rawPosts.map((p, i) => ({
      ...p,
      id: `post-${i + 1}-${Math.random().toString(36).slice(2, 7)}`,
    }));

    return NextResponse.json({ posts, month, year, monthName });
  } catch {
    return NextResponse.json({ error: 'Error generando el calendario. Intentá de nuevo.' }, { status: 500 });
  }
}
