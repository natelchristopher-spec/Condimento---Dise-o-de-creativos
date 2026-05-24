import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { getUserContext } from '@/app/lib/get-user-context';

export const maxDuration = 120;

function getOpenAIErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes('insufficient_quota') || msg.includes('billing'))
    return 'Sin crédito en tu cuenta de OpenAI. Cargá saldo en platform.openai.com → Settings → Billing.';
  if (msg.includes('401') || msg.includes('invalid_api_key'))
    return 'API key inválida. Verificá en platform.openai.com → API Keys.';
  if (msg.includes('429') || msg.includes('rate_limit'))
    return 'Límite de requests alcanzado. Esperá unos segundos e intentá de nuevo.';
  return e instanceof Error ? e.message : 'Error generando marcas';
}

interface RawConcept {
  name: string;
  name_rationale: string;
  tagline: string;
  primary1: string; primary2: string; primary3: string;
  secondary1: string; secondary2: string; secondary3: string;
  typography: string;
  style_description: string;
  logo_prompt: string;
}

async function generateColorLogo(openai: OpenAI, name: string, prompt: string): Promise<string> {
  try {
    const result = await openai.images.generate({
      model: 'gpt-image-2',
      prompt: `BRAND NAME — render this text EXACTLY as written, letter by letter, with zero modifications: "${name}". Do NOT add letters, remove letters, merge letters, or change capitalization. The word "${name}" must appear in the logo exactly as spelled. ${prompt} Pure white background. Flat minimal vector logo design, professional brand identity, clean lines, scalable, no photorealism, no shadows, no 3D effects.`,
      size: '1024x1024',
      quality: 'medium',
      n: 1,
    });
    return result.data?.[0]?.b64_json || '';
  } catch (err) {
    console.error('Logo generation failed:', err);
    return '';
  }
}

export async function POST(req: NextRequest) {
  const ctx = await getUserContext();
  if (!ctx) {
    return new Response(JSON.stringify({ error: 'Configurá tu API key de OpenAI en el perfil.' }), { status: 401 });
  }

  const { businessName, category, brief }: {
    businessName?: string;
    category: string;
    brief: string;
  } = await req.json();

  const openai = new OpenAI({ apiKey: ctx.openaiApiKey });

  const nameInstruction = businessName?.trim()
    ? `El negocio se llama "${businessName.trim()}" — usá ese nombre exacto en las 3 propuestas.`
    : 'El negocio no tiene nombre aún — proponé un nombre distinto y original en cada propuesta (1-2 palabras, memorable, apto para dominio web, no genérico).';

  const systemPrompt = `Sos un brand designer senior especializado en e-commerce latinoamericano.
Dado un brief de negocio, generá exactamente 3 propuestas de marca completamente distintas — NO variaciones del mismo concepto, sino 3 territorios de marca diferentes (ej: minimal premium vs bold/impactante vs natural/orgánico).

${nameInstruction}

Para cada propuesta devolvé:
- name: nombre de la marca
- name_rationale: 1 frase corta explicando por qué ese nombre funciona
- tagline: 4-6 palabras que resumen el posicionamiento
- primary1: color principal de marca (hex, ej: #E42820)
- primary2: color secundario/complementario (hex)
- primary3: color de acento o contraste (hex)
- secondary1: fondo principal — casi siempre blanco, crema o muy claro (hex)
- secondary2: gris medio o neutro (hex)
- secondary3: tercer neutro (hex)
- typography: descripción de tipografía para títulos y cuerpo (ej: "Playfair Display Bold para títulos, Inter Regular para cuerpo — elegante y legible")
- style_description: 3-4 líneas describiendo personalidad de marca, tono de comunicación, estilo visual y target
- logo_prompt: instrucción detallada para generar el logo. Incluir: nombre de la marca que debe aparecer escrito, tipo de logo (wordmark / lettermark / combinado con símbolo), descripción del símbolo o ícono si aplica, colores hex exactos a usar, estilo tipográfico, composición. El logo debe ser minimalista, vectorizable, profesional. NO fotorrealista, NO sombras 3D, NO degradados complejos.

REGLAS CRÍTICAS:
- Los 3 conceptos deben ser visualmente distintos — paletas distintas, enfoques distintos
- Colores apropiados para la categoría "${category}" — respetá la psicología del color por sector
- Los colores deben funcionar en publicidad digital (buenos contrastes, legibles en pantalla)
- NUNCA inventar marcas existentes ni copiar paletas conocidas

Respondé SOLO con JSON: { "concepts": [ {...}, {...}, {...} ] }`;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const conceptsRes = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `CATEGORÍA: ${category}\nBRIEF: ${brief}` },
          ],
          response_format: { type: 'json_object' },
        });

        const parsed = JSON.parse(conceptsRes.choices[0].message.content || '{}');
        const rawConcepts: RawConcept[] = (parsed.concepts || []).slice(0, 3);

        // Generate logos in parallel — stream each concept as its logo finishes
        const logoPromises = rawConcepts.map((c: RawConcept, i: number) =>
          generateColorLogo(openai, c.name, c.logo_prompt)
            .then(logoColorBase64 => {
              send({
                concept: {
                  index: i,
                  name: c.name,
                  nameRationale: c.name_rationale,
                  tagline: c.tagline,
                  primary1: c.primary1, primary2: c.primary2, primary3: c.primary3,
                  secondary1: c.secondary1, secondary2: c.secondary2, secondary3: c.secondary3,
                  typography: c.typography,
                  styleDescription: c.style_description,
                  logoPrompt: c.logo_prompt,
                  logoColorBase64,
                },
              });
            })
            .catch(() => {
              send({
                concept: {
                  index: i,
                  name: c.name,
                  nameRationale: c.name_rationale,
                  tagline: c.tagline,
                  primary1: c.primary1, primary2: c.primary2, primary3: c.primary3,
                  secondary1: c.secondary1, secondary2: c.secondary2, secondary3: c.secondary3,
                  typography: c.typography,
                  styleDescription: c.style_description,
                  logoPrompt: c.logo_prompt,
                  logoColorBase64: '',
                },
              });
            })
        );

        await Promise.allSettled(logoPromises);
        send({ done: true });
      } catch (err) {
        send({ error: getOpenAIErrorMessage(err) });
      } finally {
        controller.close();
      }
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
