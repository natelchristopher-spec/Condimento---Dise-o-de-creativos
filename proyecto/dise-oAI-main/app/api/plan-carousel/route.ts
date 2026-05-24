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

Planificá un carrusel de EXACTAMENTE 3 slides para esta marca Y el copy del post que lo acompaña.

MARCA:
${brandKitContext}

TEMA: ${title}
HOOK: ${hook}
ETAPA DEL FUNNEL: ${funnel}
REGLA DE CLAIMS: ${claimRule}

ESTILO VISUAL UNIFICADO — definilo UNA SOLA VEZ antes de las slides:
Las 3 slides deben verse como parte de una misma serie diseñada por un solo director creativo. Decidí: un color de fondo dominante (de la paleta de la marca), un mood tipográfico (bold/clean/editorial), y un tratamiento visual general (minimalista, dinámico, fotográfico, etc.). Ese estilo se aplica IGUAL en las 3 slides. Solo varía la composición de contenido, nunca el estilo.

ESTRUCTURA DE SLIDES — seguila exactamente:

Slide 1 (HOOK): captura la atención, hace que la persona quiera ver más.
- title: máximo 8 palabras, impactante, usa el hook provisto como base
- subtitle: máximo 6 palabras, complementa el título. Puede ser null.
- image_direction: instrucción en inglés para el generador. DEBE comenzar con el estilo visual unificado definido arriba, luego especificar solo la variación de esta slide. Ejemplo: "Dark red background, bold white typography — Slide 1: large centered headline, minimal elements."

Slide 2 (VALOR): entrega el contenido prometido en el hook.
- items: exactamente 3 bullets o pasos numerados. Máximo 5 palabras cada uno.
- image_direction: MISMO estilo base que slide 1, solo varía la composición. Ejemplo: "Dark red background, bold white typography — Slide 2: structured list layout with icons or numbers."

Slide 3 (CIERRE): slide de marca que cierra el relato — sin CTA explícito, solo branding.
- title: máximo 8 palabras, frase de cierre que conecta con el tema y refuerza la marca
- image_direction: MISMO estilo base que slides 1 y 2. Ejemplo: "Dark red background, bold white typography — Slide 3: centered brand closing, clean and premium."

COPY DEL POST DE INSTAGRAM:
- caption: texto que acompaña el carrusel en el feed. Tono conversacional, primera línea gancho para que expandan. 2-3 párrafos cortos. Emojis estratégicos. En español. Adaptado a la etapa del funnel: TOFU=educativo sin vender, MOFU=comparativo/beneficios, BOFU=urgencia/prueba social. NO inventar precios, métricas ni descuentos que no estén en el brand kit.
- hashtags: string con 12-15 hashtags relevantes al nicho y tema. Mezcla de alcance alto, medio y nicho. Sin el símbolo # en cada uno — solo las palabras separadas por espacios.

Respondé SOLO con JSON válido:
{
  "slides": [
    { "index": 1, "role": "hook", "title": "...", "subtitle": "..." | null, "image_direction": "..." },
    { "index": 2, "role": "value", "items": ["...", "...", "..."], "image_direction": "..." },
    { "index": 3, "role": "cta", "title": "...", "image_direction": "..." }
  ],
  "post_copy": {
    "caption": "...",
    "hashtags": "..."
  }
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 1200,
    });
    const data = JSON.parse(response.choices[0].message.content || '{}');
    return NextResponse.json({
      slides: (data.slides || []) as CarouselSlide[],
      post_copy: data.post_copy || null,
    });
  } catch {
    return NextResponse.json({ error: 'Error planificando carousel. Intentá de nuevo.' }, { status: 500 });
  }
}
