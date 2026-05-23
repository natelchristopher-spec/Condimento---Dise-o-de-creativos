import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { BrandKit } from '@/app/types';
import { buildBrandKitContext } from '@/app/lib/brandKitContext';
import { getUserContext } from '@/app/lib/get-user-context';

export const maxDuration = 60;

type FunnelStage = 'TOFU' | 'MOFU' | 'BOFU';

export interface PostPlan {
  headline: string;
  subtext: string | null;
  image_direction: string;
  post_copy: {
    caption: string;
    hashtags: string;
  };
}

export async function POST(req: NextRequest) {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Configurá tu API key de OpenAI en el perfil.' }, { status: 401 });

  const { brandKit, title, hook, funnel }: {
    brandKit: BrandKit;
    title: string;
    hook: string;
    funnel: FunnelStage;
  } = await req.json();

  if (!brandKit || !title || !hook || !funnel) {
    return NextResponse.json({ error: 'Faltan datos requeridos.' }, { status: 400 });
  }

  const openai = new OpenAI({ apiKey: ctx.openaiApiKey });
  const brandKitContext = buildBrandKitContext(brandKit);

  const claimRule = funnel === 'BOFU'
    ? 'BOFU — PROHIBICIÓN ESTRICTA: no inventar precios, métricas, porcentajes, descuentos ni resultados numéricos. Solo usar datos del brand kit.'
    : funnel === 'MOFU'
    ? 'MOFU — usar solo datos del brand kit. No inventar specs técnicas ni comparativas sin base.'
    : 'TOFU — contenido educativo genérico del nicho. No mencionar el producto directamente.';

  const prompt = `Sos un director creativo para Instagram.

Planificá un post de imagen simple (feed cuadrado 1:1) para esta marca.

MARCA:
${brandKitContext}

TEMA: ${title}
HOOK: ${hook}
ETAPA DEL FUNNEL: ${funnel}
REGLA DE CLAIMS: ${claimRule}

ESTRUCTURA:
- headline: frase principal que va en la imagen. Máximo 8 palabras. Impactante, usa el hook como base.
- subtext: frase secundaria opcional que complementa. Máximo 6 palabras. Puede ser null.
- image_direction: instrucción breve en inglés para el generador de imágenes. Describí background, composición, mood tipográfico — NO describas el producto ni la marca específica.
- post_copy.caption: texto del post en Instagram. Conversacional, primera línea gancho. 2-3 párrafos cortos. Emojis estratégicos. En español. Tono adaptado al funnel: TOFU=educativo sin vender, MOFU=comparativo/beneficios, BOFU=urgencia/prueba social. NO inventar datos no presentes en el brand kit.
- post_copy.hashtags: string con 12-15 hashtags relevantes al nicho y tema. Sin símbolo # — solo palabras separadas por espacios.

Respondé SOLO con JSON válido:
{
  "headline": "...",
  "subtext": "..." | null,
  "image_direction": "...",
  "post_copy": {
    "caption": "...",
    "hashtags": "..."
  }
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 800,
      temperature: 0.8,
    });
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(response.choices[0].message.content || '{}');
    } catch {
      return NextResponse.json({ error: 'Error procesando respuesta. Intentá de nuevo.' }, { status: 500 });
    }
    return NextResponse.json(data as unknown as PostPlan);
  } catch {
    return NextResponse.json({ error: 'Error planificando el post. Intentá de nuevo.' }, { status: 500 });
  }
}
