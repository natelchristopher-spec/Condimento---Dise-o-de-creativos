import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { BrandKit } from '@/app/types';
import { buildBrandKitContext } from '@/app/lib/brandKitContext';
import { getUserContext } from '@/app/lib/get-user-context';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'Configurá tu API key de OpenAI en el perfil.' }, { status: 401 });

  const { clientRequest, brandKit }: { clientRequest: string; brandKit: BrandKit | null } = await req.json();

  const openai = new OpenAI({ apiKey: ctx.openaiApiKey });

  const brandContext = brandKit ? `\nBRAND KIT DEL CLIENTE:\n${buildBrandKitContext(brandKit)}` : '';

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Sos un director creativo senior especializado en retail, moda e industria. Tu tarea es transformar una solicitud informal de un cliente en un brief creativo estructurado y accionable para un equipo de diseño digital.

ESTRUCTURA el brief en dos bloques:

BLOQUE 1 — DATOS DEL PROYECTO (bullets cortos, solo lo que está en la solicitud):
• Campaña/Evento: nombre. Si hay múltiples eventos, listá cada uno con su nombre y fechas en sub-bullets.
• Piezas requeridas: cantidad, formatos y plataformas (web, email, redes, punto de venta, etc.)
• Mecánicas promocionales: listá TODAS las mecánicas mencionadas (descuentos, cuotas, envío gratis, retiro express, código promo, etc.) — una por línea.
• Segmento / público objetivo: a quién va dirigido (si se menciona).
• Paleta de colores: si el cliente especifica colores, listálos exactamente.
• Legal: si hay textos legales, condiciones o disclaimers con fechas, mencionálos.
• Referencias: archivos o imágenes de referencia que el cliente nombra pero no podés ver.
Omitir bullets que no tengan información en la solicitud.

BLOQUE 2 — DIRECCIÓN CREATIVA (1-2 párrafos):
Redactá la dirección visual: qué debe mostrar la pieza, elementos visuales que representen el segmento, jerarquía tipográfica (qué mensaje lidera, qué va secundario), mood y atmósfera, estilo gráfico. Si la paleta está dictada por el cliente, indicá cómo usarla. Debe ser específico para guiar generación de imágenes. No repitas los datos del bloque anterior.

Al final, si falta info crítica (% de descuento exacto, productos, canal), agregá: "Falta confirmar: [lista]"

Máximo 260 palabras totales. Escribí en español rioplatense.`,
        },
        {
          role: 'user',
          content: `SOLICITUD DEL CLIENTE:\n${clientRequest}${brandContext}`,
        },
      ],
      max_tokens: 450,
    });

    const brief = response.choices[0].message.content || '';
    return NextResponse.json({ brief });
  } catch (e) {
    return NextResponse.json({ error: getOpenAIErrorMessage(e) }, { status: 500 });
  }
}

function getOpenAIErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes('401') || msg.includes('Incorrect API key') || msg.includes('invalid_api_key'))
    return 'API key de OpenAI inválida. Verificá la clave en tu perfil.';
  if (msg.includes('429') || msg.includes('rate limit') || msg.includes('quota'))
    return 'Límite de uso de OpenAI alcanzado. Esperá unos minutos o revisá tu plan.';
  if (msg.includes('insufficient_quota'))
    return 'Sin crédito en tu cuenta de OpenAI. Recargá saldo en platform.openai.com.';
  return 'Error al conectar con OpenAI. Intentá de nuevo.';
}
