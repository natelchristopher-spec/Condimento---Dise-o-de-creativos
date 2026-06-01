import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getUserContext } from '@/app/lib/get-user-context';

export const maxDuration = 90;

const ML_SITES: Record<string, string> = {
  MX: 'MLM', CO: 'MCO', AR: 'MLA', CL: 'MLC', PE: 'MPE',
};

const GEO_NAMES: Record<string, string> = {
  MX: 'México', CO: 'Colombia', AR: 'Argentina', CL: 'Chile', PE: 'Perú',
};

const DROPI_DOMAINS: Record<string, string> = {
  MX: 'https://dropi.mx',
  CO: 'https://dropi.co',
  AR: 'https://dropi.ar',
  CL: 'https://dropi.cl',
  PE: 'https://dropi.pe',
};

interface MLItem {
  id: string;
  title: string;
  price: number;
  currency_id: string;
  sold_quantity: number;
  permalink: string;
}

async function getMercadoLibreData(keyword: string, geo: string) {
  const site = ML_SITES[geo] || 'MLM';
  try {
    const searchRes = await fetch(
      `https://api.mercadolibre.com/sites/${site}/search?q=${encodeURIComponent(keyword)}&sort=sold_quantity_desc&limit=3`,
      { next: { revalidate: 3600 } }
    );
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    const topItem: MLItem = searchData?.results?.[0];
    if (!topItem) return null;

    const [reviewsRes, questionsRes] = await Promise.allSettled([
      fetch(`https://api.mercadolibre.com/reviews/item/${topItem.id}?limit=50`),
      fetch(`https://api.mercadolibre.com/questions/search?item=${topItem.id}&status=answered&limit=20`),
    ]);

    type RawReview = { rating: number; content?: string };
    type RawQuestion = { text: string; answer?: { text: string } };

    let threeStarReviews: string[] = [];
    let negativeReviews: string[] = [];
    let questions: string[] = [];

    if (reviewsRes.status === 'fulfilled' && reviewsRes.value.ok) {
      const d = await reviewsRes.value.json();
      const reviews: RawReview[] = d?.reviews || [];
      threeStarReviews = reviews.filter(r => r.rating === 3).map(r => r.content || '').filter(Boolean).slice(0, 5);
      negativeReviews = reviews.filter(r => r.rating <= 2).map(r => r.content || '').filter(Boolean).slice(0, 3);
    }

    if (questionsRes.status === 'fulfilled' && questionsRes.value.ok) {
      const d = await questionsRes.value.json();
      questions = (d?.questions || [] as RawQuestion[]).map((q: RawQuestion) => q.text).slice(0, 10);
    }

    return {
      title: topItem.title,
      price: topItem.price,
      currency: topItem.currency_id,
      soldQuantity: topItem.sold_quantity,
      permalink: topItem.permalink,
      threeStarReviews,
      negativeReviews,
      questions,
    };
  } catch {
    return null;
  }
}

async function getMetaAdsSignal(keyword: string, geo: string): Promise<string> {
  try {
    const url = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${geo}&q=${encodeURIComponent(keyword)}&search_type=keyword_unordered`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'es-419,es;q=0.9',
      },
    });
    if (!res.ok) return '';
    const html = await res.text();
    const match = html.match(/"total_count"\s*:\s*(\d+)/) || html.match(/(\d[\d,]+)\s+results?/i);
    const count = match ? parseInt(match[1].replace(',', '')) : 0;
    if (count > 50) return `Más de 50 anuncios activos en ${GEO_NAMES[geo]} — mercado muy activo`;
    if (count > 10) return `${count} anuncios activos en ${GEO_NAMES[geo]}`;
    if (count > 0) return `${count} anuncios activos en ${GEO_NAMES[geo]} — nicho poco explotado`;
    return `Pocos anuncios activos en ${GEO_NAMES[geo]} — posible oportunidad temprana`;
  } catch {
    return '';
  }
}

export async function POST(req: NextRequest) {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { keyword, need, audience, geo = 'MX' } = await req.json();

  const [mlResult, metaSignal] = await Promise.allSettled([
    getMercadoLibreData(keyword, geo),
    getMetaAdsSignal(keyword, geo),
  ]);

  const ml = mlResult.status === 'fulfilled' ? mlResult.value : null;
  const meta = metaSignal.status === 'fulfilled' ? metaSignal.value : '';

  const mlContext = ml
    ? `PRODUCTO MÁS VENDIDO EN MERCADOLIBRE (${GEO_NAMES[geo]}):
Título: ${ml.title}
Precio: ${ml.currency} ${ml.price}
Unidades vendidas: ${ml.soldQuantity}

REVIEWS 3★ (lo que falla pero no es desastre):
${ml.threeStarReviews.length ? ml.threeStarReviews.map(r => `- "${r}"`).join('\n') : 'Sin datos'}

REVIEWS NEGATIVAS (1-2★):
${ml.negativeReviews.length ? ml.negativeReviews.map(r => `- "${r}"`).join('\n') : 'Sin datos'}

PREGUNTAS FRECUENTES ANTES DE COMPRAR:
${ml.questions.length ? ml.questions.map(q => `- "${q}"`).join('\n') : 'Sin datos'}`
    : 'Sin datos de MercadoLibre.';

  const openai = new OpenAI({ apiKey: ctx.openaiApiKey });

  const prompt = `Sos un experto en e-commerce y dropshipping para LATAM.

OPORTUNIDAD:
Keyword: "${keyword}"
Necesidad: "${need}"
Audiencia: "${audience}"
País: ${GEO_NAMES[geo]}

${mlContext}

${meta ? `META ADS: ${meta}` : ''}

Analizá y respondé SOLO con JSON válido:
{
  "pain_quote": "cita en primera persona que resume el dolor real usando lenguaje de los reviews si hay (máx 15 palabras, sin comillas externas)",
  "market_gap": "qué le falta al producto actual según los datos — sé específico (1-2 oraciones)",
  "validation": "resumen de validación de mercado en 1 línea",
  "ad_angle": "ángulo de anuncio que ataca el gap, listo para usar (máx 12 palabras, sin signos de exclamación)",
  "dropi_es": "término en español para buscar en Dropi (2-4 palabras específicas)",
  "confidence": "alta" | "media" | "baja",
  "ml_price_reference": ${ml ? `${ml.price}` : 'null'}
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 700,
    });

    const analysis = JSON.parse(response.choices[0].message.content || '{}');
    const dropiBase = DROPI_DOMAINS[geo] || 'https://www.dropi.co';
    const dropiUrl = `${dropiBase}/products?search=${encodeURIComponent(analysis.dropi_es || keyword)}`;

    return NextResponse.json({
      ...analysis,
      dropi_url: dropiUrl,
      ml_product: ml ? { title: ml.title, price: ml.price, currency: ml.currency, permalink: ml.permalink } : null,
      meta_signal: meta || null,
    });
  } catch {
    return NextResponse.json({ error: 'Error al generar el análisis.' }, { status: 500 });
  }
}
