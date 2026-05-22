import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { BrandKit } from '@/app/types';
import { buildBrandKitContext } from '@/app/lib/brandKitContext';
import { getUserContext } from '@/app/lib/get-user-context';

export const maxDuration = 60;

type FunnelStage = 'TOFU' | 'MOFU' | 'BOFU';

export interface CarouselSlide {
  index: number;
  role: 'hook' | 'value' | 'cta';
  title?: string;
  subtitle?: string | null;
  items?: string[];
  cta?: string;
  image_direction: string;
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

  const openai = new OpenAI({ apiKey: ctx.openaiApiKey });
  const brandKitContext = buildBrandKitContext(brandKit);

  const claimRule = funnel === 'BOFU'
    ? 'BOFU — PROHIBICIÓN ESTRICTA: no inventar precios, métricas, porcentajes, descuentos, resultados numéricos ni testimonios. Solo usar datos presentes en el brand kit o en el título del carousel.'
    : funnel === 'MOFU'
    ? 'MOFU — usar solo datos del brand kit. No inventar specs técnicas ni comparativas sin base en la información de la marca.'
    : 'TOFU — contenido educativo genérico del nicho. No mencionar el producto directamente. Solo conocimiento general.';

  const prompt = `Sos un copywriter y director creativo para Instagram.

Planificá un carrusel de EXACTAMENTE 3 slides para esta marca.

MARCA:
${brandKitContext}

TEMA: ${title}
HOOK: ${hook}
ETAPA DEL FUNNEL: ${funnel}
REGLA DE CLAIMS: ${claimRule}

ESTRUCTURA — seguila exactamente:

Slide 1 (HOOK): captura la atención, hace que la persona quiera ver más.
- title: máximo 8 palabras, impactante, usa el hook provisto como base
- subtitle: máximo 6 palabras, complementa el título. Puede ser null.
- image_direction: instrucción breve en inglés para el generador (describe background color, layout, typography mood — NO describas el producto ni la marca)

Slide 2 (VALOR): entrega el contenido prometido en el hook.
- items: exactamente 3 bullets o pasos numerados. Máximo 5 palabras cada uno.
- image_direction: ídem

Slide 3 (CIERRE): remata con la marca y un CTA suave.
- title: máximo 8 palabras, conecta con el tema y cierra el relato
- cta: máximo 3 palabras, acción específica (ej: "Seguinos", "Escribinos hoy", "Ver colección")
- image_direction: ídem

Respondé SOLO con JSON válido:
{
  "slides": [
    { "index": 1, "role": "hook", "title": "...", "subtitle": "..." | null, "image_direction": "..." },
    { "index": 2, "role": "value", "items": ["...", "...", "..."], "image_direction": "..." },
    { "index": 3, "role": "cta", "title": "...", "cta": "...", "image_direction": "..." }
  ]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 800,
    });
    const data = JSON.parse(response.choices[0].message.content || '{}');
    return NextResponse.json({ slides: (data.slides || []) as CarouselSlide[] });
  } catch {
    return NextResponse.json({ error: 'Error planificando carousel. Intentá de nuevo.' }, { status: 500 });
  }
}
