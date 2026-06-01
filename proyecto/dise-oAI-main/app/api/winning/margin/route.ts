import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getUserContext } from '@/app/lib/get-user-context';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { dropiUrl, mlPrice, mlCurrency } = await req.json();
  if (!dropiUrl) return NextResponse.json({ error: 'URL requerida' }, { status: 400 });

  // Fetch Dropi product page
  let html = '';
  try {
    const res = await fetch(dropiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'es-419,es;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    if (!res.ok) return NextResponse.json({ error: `Dropi respondió ${res.status}. Verificá la URL.` }, { status: 400 });
    html = await res.text();
  } catch {
    return NextResponse.json({ error: 'No se pudo acceder a la URL. Verificá que sea correcta.' }, { status: 400 });
  }

  // Extract relevant price snippet — take a small window around price indicators
  // to avoid sending the entire HTML to the AI
  const priceSnippet = extractPriceSnippet(html);

  const openai = new OpenAI({ apiKey: ctx.openaiApiKey });

  const prompt = `Estás analizando el HTML de una página de producto en Dropi (plataforma de dropshipping LATAM).

Extracto del HTML:
${priceSnippet}

Extraé el precio del producto para el dropshipper (precio de costo, no el precio sugerido de venta si aparecen ambos).
Si hay un precio con descuento o precio especial para miembros, usá ese.

Respondé SOLO con JSON válido:
{
  "dropi_price": 12500,
  "dropi_currency": "ARS",
  "price_found": true,
  "product_name": "nombre del producto si está visible"
}

Si no podés extraer el precio con certeza: { "price_found": false }`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 200,
    });

    const data = JSON.parse(response.choices[0].message.content || '{}');

    if (!data.price_found || !data.dropi_price) {
      return NextResponse.json({ error: 'No se pudo detectar el precio. Verificá que la URL sea de un producto en Dropi.' }, { status: 422 });
    }

    // Normalize currencies for comparison
    // Both prices should be in the same currency (the user is buying from Dropi in their country)
    const dropiPrice: number = data.dropi_price;
    const sellPrice: number = mlPrice;

    let margin: number | null = null;
    let profitPerUnit: number | null = null;
    let marginNote = '';

    if (sellPrice && dropiPrice && data.dropi_currency === mlCurrency) {
      margin = Math.round(((sellPrice - dropiPrice) / sellPrice) * 100);
      profitPerUnit = Math.round(sellPrice - dropiPrice);
    } else if (sellPrice && dropiPrice) {
      // Different currencies — can't auto-convert, show raw numbers
      marginNote = 'Monedas distintas — convertí manualmente para calcular el margen real.';
    }

    return NextResponse.json({
      dropi_price: dropiPrice,
      dropi_currency: data.dropi_currency,
      product_name: data.product_name || null,
      sell_price: sellPrice,
      sell_currency: mlCurrency,
      margin_pct: margin,
      profit_per_unit: profitPerUnit,
      margin_note: marginNote,
    });
  } catch {
    return NextResponse.json({ error: 'Error al procesar el precio.' }, { status: 500 });
  }
}

function extractPriceSnippet(html: string): string {
  // Find sections likely to contain price info — look for currency symbols and numbers
  const patterns = [
    /(<[^>]*(?:price|precio|costo|cost|amount|valor)[^>]*>[\s\S]{0,500})/gi,
    /(\$[\s]*[\d.,]+[\s\S]{0,200})/g,
    /([\d.,]+[\s]*(?:USD|ARS|COP|MXN|CLP|PEN)[\s\S]{0,200})/gi,
  ];

  const snippets: string[] = [];
  for (const pattern of patterns) {
    const matches = html.match(pattern) || [];
    snippets.push(...matches.slice(0, 3));
    if (snippets.length >= 5) break;
  }

  if (!snippets.length) {
    // Fallback: take 3000 chars around "precio" or first occurrence of a number pattern
    const idx = html.toLowerCase().indexOf('precio');
    if (idx !== -1) return html.slice(Math.max(0, idx - 200), idx + 2000);
    return html.slice(0, 3000);
  }

  return snippets.join('\n---\n').slice(0, 3000);
}
