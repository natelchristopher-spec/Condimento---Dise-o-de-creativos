import { NextRequest, NextResponse } from 'next/server';
import { getUserContext } from '@/app/lib/get-user-context';

export const maxDuration = 30;

interface ShopifyVariant {
  price: string;
  available: boolean;
}

interface ShopifyImage {
  src: string;
}

interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  vendor: string;
  product_type: string;
  tags: string;
  published_at: string;
  variants: ShopifyVariant[];
  images: ShopifyImage[];
}

export async function POST(req: NextRequest) {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { storeUrl } = await req.json();
  if (!storeUrl) return NextResponse.json({ error: 'URL requerida' }, { status: 400 });

  let base = storeUrl.trim().replace(/\/$/, '');
  if (!base.startsWith('http')) base = 'https://' + base;
  // Strip any path — only need the domain
  try { base = new URL(base).origin; } catch { /* keep as-is */ }

  try {
    const res = await fetch(`${base}/products.json?limit=250`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return NextResponse.json({
        error: 'No se pudo acceder. Verificá que sea una tienda Shopify activa y que la URL sea correcta.',
      }, { status: 400 });
    }

    const data = await res.json();

    if (!data.products || !Array.isArray(data.products)) {
      return NextResponse.json({ error: 'La tienda no expone productos públicamente.' }, { status: 400 });
    }

    const products = (data.products as ShopifyProduct[]).map(p => {
      const prices = p.variants.map(v => parseFloat(v.price)).filter(n => !isNaN(n));
      return {
        id: p.id,
        title: p.title,
        handle: p.handle,
        vendor: p.vendor,
        product_type: p.product_type,
        tags: p.tags,
        price_min: prices.length ? Math.min(...prices) : 0,
        price_max: prices.length ? Math.max(...prices) : 0,
        variants_count: p.variants.length,
        images_count: p.images.length,
        image: p.images[0]?.src ?? null,
        available: p.variants.some(v => v.available),
        published_at: p.published_at,
        url: `${base}/products/${p.handle}`,
      };
    });

    return NextResponse.json({ products, store_url: base, total: products.length });
  } catch (err) {
    if (err instanceof Error && (err.name === 'TimeoutError' || err.message.includes('timeout'))) {
      return NextResponse.json({ error: 'La tienda tardó demasiado en responder.' }, { status: 408 });
    }
    return NextResponse.json({ error: 'Error al conectar con la tienda.' }, { status: 500 });
  }
}
