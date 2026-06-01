'use client';

import { useState, useEffect, useCallback } from 'react';
import { createSupabaseBrowser } from '@/app/lib/supabase-browser';
import { useRequireAuth } from '@/app/lib/use-auth';
import Sidebar from '@/app/components/Sidebar';

type Tab = 'discover' | 'feed' | 'meta';

// ── Discover types ──────────────────────────────────────────────────────────
const NICHES = [
  { icon: '💊', label: 'Suplementos' },
  { icon: '🏋️', label: 'Fitness' },
  { icon: '🏠', label: 'Hogar' },
  { icon: '💄', label: 'Belleza' },
  { icon: '🐾', label: 'Mascotas' },
  { icon: '👶', label: 'Bebés' },
  { icon: '🍃', label: 'Bienestar' },
  { icon: '📱', label: 'Gadgets' },
];

interface Opportunity {
  keyword: string;
  need: string;
  audience: string;
  urgency: 'alta' | 'media';
}

interface Analysis {
  pain_quote: string;
  market_gap: string;
  validation: string;
  ad_angle: string;
  dropi_es: string;
  dropi_url: string;
  confidence: 'alta' | 'media' | 'baja';
  ml_product: { title: string; price: number; currency: string; permalink: string } | null;
  meta_signal: string | null;
}

type DiscoverStep = 'input' | 'scanning' | 'opportunities' | 'analyzing' | 'result';

interface ScannedProduct {
  id: number;
  title: string;
  handle: string;
  vendor: string;
  product_type: string;
  tags: string;
  price_min: number;
  price_max: number;
  variants_count: number;
  images_count: number;
  image: string | null;
  available: boolean;
  published_at: string;
  url: string;
  store_url: string;
  store_domain: string;
}

interface StoreEntry {
  url: string;
  domain: string;
  addedAt: number;
}

interface CacheEntry {
  products: ScannedProduct[];
  crawledAt: number;
}

const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
const LS_STORES_KEY = 'spy_stores_v1';
const LS_CACHE_KEY = 'spy_cache_v1';

const LATAM_COUNTRIES = [
  { code: 'AR', label: 'Argentina' },
  { code: 'MX', label: 'México' },
  { code: 'CO', label: 'Colombia' },
  { code: 'CL', label: 'Chile' },
  { code: 'PE', label: 'Perú' },
  { code: 'UY', label: 'Uruguay' },
];

const SUGGESTED_SEARCHES = [
  'organizador cocina', 'collar led perro', 'mascarilla facial',
  'soporte celular auto', 'cargador inalámbrico', 'funda iphone',
  'ropa deportiva mujer', 'luz led rgb', 'bolso impermeable',
  'comida para perro', 'suplemento proteína', 'taza térmica',
];

function loadStores(): StoreEntry[] {
  try { return JSON.parse(localStorage.getItem(LS_STORES_KEY) || '[]'); } catch { return []; }
}

function saveStores(stores: StoreEntry[]) {
  localStorage.setItem(LS_STORES_KEY, JSON.stringify(stores));
}

function loadCache(): Record<string, CacheEntry> {
  try { return JSON.parse(localStorage.getItem(LS_CACHE_KEY) || '{}'); } catch { return {}; }
}

function saveCache(cache: Record<string, CacheEntry>) {
  localStorage.setItem(LS_CACHE_KEY, JSON.stringify(cache));
}

function buildMetaUrl(keyword: string, countries: string[]): string {
  return `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${countries.join(',')}&q=${encodeURIComponent(keyword)}&search_type=keyword_unordered&media_type=all`;
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function normalizeDomain(url: string): string {
  try { return new URL(url.startsWith('http') ? url : 'https://' + url).hostname; } catch { return url; }
}

function normalizeUrl(url: string): string {
  const u = url.startsWith('http') ? url : 'https://' + url;
  try { return new URL(u).origin; } catch { return u; }
}

export default function WinningProductsPage() {
  useRequireAuth();
  const supabase = createSupabaseBrowser();

  const [tab, setTab] = useState<Tab>('discover');

  // ── Discover state ─────────────────────────────────────────────────────────
  const [discoverStep, setDiscoverStep] = useState<DiscoverStep>('input');
  const [niche, setNiche] = useState('');
  const [customNiche, setCustomNiche] = useState('');
  const [discoverGeo, setDiscoverGeo] = useState('MX');
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [discoverError, setDiscoverError] = useState('');

  // ── Store tracker state ────────────────────────────────────────────────────
  const [stores, setStores] = useState<StoreEntry[]>([]);
  const [products, setProducts] = useState<ScannedProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingStores, setLoadingStores] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [addUrl, setAddUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'price_desc' | 'price_asc' | 'variants'>('newest');
  const [filterAvailable, setFilterAvailable] = useState(false);
  const [metaKeyword, setMetaKeyword] = useState('');
  const [selectedCountries, setSelectedCountries] = useState<string[]>(['AR']);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const crawlStore = useCallback(async (storeUrl: string, forceRefresh = false): Promise<ScannedProduct[]> => {
    const cache = loadCache();
    const cached = cache[storeUrl];
    if (!forceRefresh && cached && Date.now() - cached.crawledAt < CACHE_TTL) {
      return cached.products;
    }

    const res = await fetch('/api/scan-store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeUrl }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Error al escanear');

    const domain = normalizeDomain(storeUrl);
    const enriched: ScannedProduct[] = (data.products || []).map((p: Omit<ScannedProduct, 'store_url' | 'store_domain'>) => ({
      ...p,
      store_url: storeUrl,
      store_domain: domain,
    }));

    const newCache = loadCache();
    newCache[storeUrl] = { products: enriched, crawledAt: Date.now() };
    saveCache(newCache);
    return enriched;
  }, []);

  const loadAllProducts = useCallback(async (storeList: StoreEntry[], forceRefresh = false) => {
    if (storeList.length === 0) return;
    setLoading(true);
    setErrors({});

    const newErrors: Record<string, string> = {};
    const allProducts: ScannedProduct[] = [];

    await Promise.allSettled(
      storeList.map(async (s) => {
        setLoadingStores(prev => new Set(prev).add(s.url));
        try {
          const prods = await crawlStore(s.url, forceRefresh);
          allProducts.push(...prods);
        } catch (e) {
          newErrors[s.url] = e instanceof Error ? e.message : 'Error';
        } finally {
          setLoadingStores(prev => { const n = new Set(prev); n.delete(s.url); return n; });
        }
      })
    );

    setProducts(allProducts);
    setErrors(newErrors);
    setLastRefresh(new Date());
    setLoading(false);
  }, [crawlStore]);

  // Load from localStorage on mount and auto-crawl
  useEffect(() => {
    const savedStores = loadStores();
    setStores(savedStores);
    if (savedStores.length > 0) {
      loadAllProducts(savedStores);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const addStore = async () => {
    if (!addUrl.trim()) return;
    setAdding(true);
    setAddError('');
    const url = normalizeUrl(addUrl.trim());
    const domain = normalizeDomain(url);

    const existing = loadStores();
    if (existing.some(s => s.url === url)) {
      setAddError('Esa tienda ya está en tu lista.');
      setAdding(false);
      return;
    }

    try {
      const prods = await crawlStore(url);
      if (prods.length === 0) {
        setAddError('La tienda existe pero no tiene productos públicos.');
        setAdding(false);
        return;
      }
      const newEntry: StoreEntry = { url, domain, addedAt: Date.now() };
      const updated = [...existing, newEntry];
      saveStores(updated);
      setStores(updated);
      setProducts(prev => [...prev, ...prods]);
      setAddUrl('');
      setTab('feed');
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'No se pudo conectar con la tienda.');
    } finally {
      setAdding(false);
    }
  };

  const removeStore = (url: string) => {
    const updated = stores.filter(s => s.url !== url);
    saveStores(updated);
    setStores(updated);
    setProducts(prev => prev.filter(p => p.store_url !== url));
    const cache = loadCache();
    delete cache[url];
    saveCache(cache);
  };

  const refresh = () => loadAllProducts(stores, true);

  // ── Discover handlers ──────────────────────────────────────────────────────
  const activeNiche = customNiche.trim() || niche;

  const scanTrends = async () => {
    if (!activeNiche) return;
    setDiscoverStep('scanning');
    setDiscoverError('');
    try {
      const res = await fetch('/api/winning/trends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geo: discoverGeo, niche: activeNiche }),
      });
      const data: { opportunities?: Opportunity[]; error?: string } = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Error al escanear');
      if (!data.opportunities?.length) throw new Error('No se encontraron oportunidades hoy. Probá otro nicho o país.');
      setOpportunities(data.opportunities);
      setDiscoverStep('opportunities');
    } catch (e) {
      setDiscoverError(e instanceof Error ? e.message : 'Error inesperado');
      setDiscoverStep('input');
    }
  };

  const analyzeOpportunity = async (opp: Opportunity) => {
    setSelectedOpp(opp);
    setDiscoverStep('analyzing');
    setDiscoverError('');
    try {
      const res = await fetch('/api/winning/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: opp.keyword, need: opp.need, audience: opp.audience, geo: discoverGeo }),
      });
      const data: Analysis & { error?: string } = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Error al analizar');
      setAnalysis(data);
      setDiscoverStep('result');
    } catch (e) {
      setDiscoverError(e instanceof Error ? e.message : 'Error inesperado');
      setDiscoverStep('opportunities');
    }
  };

  const resetDiscover = () => {
    setDiscoverStep('input');
    setOpportunities([]);
    setSelectedOpp(null);
    setAnalysis(null);
    setDiscoverError('');
  };

  const goToLanding = () => {
    if (!analysis || !selectedOpp) return;
    const brief = `Necesidad: ${selectedOpp.need}\nAudiencia: ${selectedOpp.audience}\nÁngulo: ${analysis.ad_angle}\nGap del mercado: ${analysis.market_gap}`;
    sessionStorage.setItem('winning_brief', brief);
    window.location.href = '/landing-builder';
  };

  const confidenceColor: Record<string, string> = {
    alta: 'bg-emerald-100 text-emerald-700',
    media: 'bg-amber-100 text-amber-700',
    baja: 'bg-gray-100 text-gray-500',
  };

  const sortedProducts = [...products]
    .filter(p => !filterAvailable || p.available)
    .sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
      if (sortBy === 'price_desc') return b.price_min - a.price_min;
      if (sortBy === 'price_asc') return a.price_min - b.price_min;
      if (sortBy === 'variants') return b.variants_count - a.variants_count;
      return 0;
    });

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar active="/winning-products" onLogout={handleLogout} />

      <main className="flex-1 md:ml-56 pt-16 md:pt-0">
        <div className="max-w-5xl mx-auto px-4 py-8">

          {/* Header */}
          <div className="flex items-start justify-between mb-6 gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Producto Spy</h1>
              <p className="text-sm text-gray-500 mt-1">
                {stores.length > 0
                  ? `${stores.length} tienda${stores.length > 1 ? 's' : ''} rastreada${stores.length > 1 ? 's' : ''} · ${products.length} productos`
                  : 'Rastreá tiendas Shopify y encontrá productos ganadores en LATAM'}
              </p>
            </div>
            {stores.length > 0 && (
              <button
                onClick={refresh}
                disabled={loading}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-40 transition-all"
              >
                <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {loading ? 'Actualizando...' : 'Actualizar'}
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit mb-6">
            {([
              { id: 'discover' as Tab, label: '🔍  Descubrí' },
              { id: 'feed' as Tab, label: '📦  Tiendas' },
              { id: 'meta' as Tab, label: '📣  Meta Ads' },
            ]).map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ── DISCOVER TAB ── */}
          {tab === 'discover' && (
            <div className="max-w-2xl space-y-4">

              {/* INPUT */}
              {discoverStep === 'input' && (
                <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-3">¿En qué nicho?</label>
                    <div className="grid grid-cols-4 gap-2 mb-3">
                      {NICHES.map(n => (
                        <button key={n.label} onClick={() => { setNiche(n.label); setCustomNiche(''); }}
                          className={`flex flex-col items-center gap-1 py-3 rounded-xl border text-xs font-medium transition-all ${
                            niche === n.label && !customNiche
                              ? 'border-[#e42820] bg-[#e42820]/5 text-[#e42820]'
                              : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                          }`}>
                          <span className="text-lg">{n.icon}</span>{n.label}
                        </button>
                      ))}
                    </div>
                    <input value={customNiche} onChange={e => { setCustomNiche(e.target.value); setNiche(''); }}
                      placeholder="O escribí el tuyo: ropa deportiva, cocina, yoga..."
                      className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#e42820]/20 focus:border-[#e42820]" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-3">País</label>
                    <div className="flex gap-2 flex-wrap">
                      {LATAM_COUNTRIES.map(c => (
                        <button key={c.code} onClick={() => setDiscoverGeo(c.code)}
                          className={`px-4 py-2 rounded-xl border text-sm font-medium transition-all ${
                            discoverGeo === c.code
                              ? 'border-[#e42820] bg-[#e42820]/5 text-[#e42820]'
                              : 'border-gray-200 text-gray-600 hover:border-gray-300'
                          }`}>
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {discoverError && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">{discoverError}</div>}
                  <button onClick={scanTrends} disabled={!activeNiche}
                    className="w-full py-3 bg-[#e42820] text-white rounded-xl text-sm font-semibold disabled:opacity-40 hover:bg-[#c92218] transition-colors">
                    Detectar oportunidades →
                  </button>
                </div>
              )}

              {/* SCANNING */}
              {discoverStep === 'scanning' && (
                <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
                  <div className="w-12 h-12 rounded-full border-2 border-[#e42820] border-t-transparent animate-spin mx-auto mb-4" />
                  <p className="text-sm font-semibold text-gray-700">Escaneando tendencias en {LATAM_COUNTRIES.find(c => c.code === discoverGeo)?.label}...</p>
                  <p className="text-xs text-gray-400 mt-2">Google Trends → filtro de intención de compra → IA</p>
                </div>
              )}

              {/* OPPORTUNITIES */}
              {discoverStep === 'opportunities' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm text-gray-500"><span className="font-semibold text-gray-900">{opportunities.length} oportunidades</span> en {LATAM_COUNTRIES.find(c => c.code === discoverGeo)?.label} — {activeNiche}</p>
                    <button onClick={resetDiscover} className="text-xs text-gray-400 hover:text-gray-600">← Nueva búsqueda</button>
                  </div>
                  {discoverError && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">{discoverError}</div>}
                  {opportunities.map((opp, i) => (
                    <div key={i} className="bg-white rounded-2xl border border-gray-200 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full mb-2 ${opp.urgency === 'alta' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
                            {opp.urgency === 'alta' ? '🔴 Alta intención' : '🟡 Media intención'}
                          </span>
                          <p className="text-xs text-gray-400 font-mono mb-1">"{opp.keyword}"</p>
                          <p className="text-sm font-semibold text-gray-900 mb-1">{opp.need}</p>
                          <p className="text-xs text-gray-500">{opp.audience}</p>
                        </div>
                        <button onClick={() => analyzeOpportunity(opp)}
                          className="shrink-0 px-4 py-2 bg-gray-900 text-white rounded-xl text-xs font-semibold hover:bg-gray-700 transition-colors whitespace-nowrap">
                          Analizar →
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ANALYZING */}
              {discoverStep === 'analyzing' && selectedOpp && (
                <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
                  <div className="w-12 h-12 rounded-full border-2 border-[#e42820] border-t-transparent animate-spin mx-auto mb-4" />
                  <p className="text-sm font-semibold text-gray-700">Analizando "{selectedOpp.keyword}"...</p>
                  <p className="text-xs text-gray-400 mt-2">MercadoLibre reviews · Meta Ads · síntesis IA</p>
                </div>
              )}

              {/* RESULT */}
              {discoverStep === 'result' && analysis && selectedOpp && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <button onClick={() => setDiscoverStep('opportunities')} className="text-xs text-gray-400 hover:text-gray-600">← Volver</button>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${confidenceColor[analysis.confidence]}`}>Confianza {analysis.confidence}</span>
                  </div>
                  {discoverError && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">{discoverError}</div>}

                  <div className="bg-gray-900 rounded-2xl p-6">
                    <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-3">Lo que dice el comprador</p>
                    <p className="text-white text-lg font-semibold leading-snug">&ldquo;{analysis.pain_quote}&rdquo;</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white rounded-2xl border border-gray-200 p-4">
                      <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">Gap del mercado</p>
                      <p className="text-sm text-gray-700 leading-relaxed">{analysis.market_gap}</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-200 p-4">
                      <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">Validación</p>
                      <p className="text-sm text-gray-700 leading-relaxed">{analysis.validation}</p>
                      {analysis.meta_signal && <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-100">{analysis.meta_signal}</p>}
                    </div>
                  </div>

                  <div className="bg-[#e42820]/5 border border-[#e42820]/20 rounded-2xl p-5">
                    <p className="text-xs text-[#e42820] font-semibold uppercase tracking-wider mb-2">Ángulo de ad listo</p>
                    <p className="text-lg font-bold text-gray-900">&ldquo;{analysis.ad_angle}&rdquo;</p>
                  </div>

                  {analysis.ml_product && (
                    <div className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">Precio de venta referencia (ML)</p>
                        <p className="text-sm text-gray-700 font-medium truncate">{analysis.ml_product.title}</p>
                        <p className="text-base font-bold text-gray-900 mt-0.5">{analysis.ml_product.currency} {analysis.ml_product.price.toLocaleString()}</p>
                        <p className="text-xs text-gray-400 mt-0.5">Precio al que hoy lo vende la competencia</p>
                      </div>
                      <a href={analysis.ml_product.permalink} target="_blank" rel="noopener" className="shrink-0 text-xs text-gray-400 hover:text-gray-700 underline">Ver →</a>
                    </div>
                  )}

                  <div className="bg-white rounded-2xl border border-gray-200 p-5">
                    <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-3">Buscar proveedor</p>
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Término de búsqueda</p>
                        <p className="text-sm font-bold text-gray-900 font-mono">&ldquo;{analysis.dropi_es}&rdquo;</p>
                      </div>
                      <a href={analysis.dropi_url} target="_blank" rel="noopener"
                        className="shrink-0 flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition-colors">
                        Buscar en Dropi ↗
                      </a>
                    </div>
                  </div>

                  <button onClick={goToLanding}
                    className="w-full py-3 bg-[#e42820] text-white rounded-xl text-sm font-semibold hover:bg-[#c92218] transition-colors">
                    Crear landing con este brief →
                  </button>
                  <button onClick={resetDiscover}
                    className="w-full py-3 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50 transition-colors">
                    Nueva búsqueda
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── FEED TAB ── */}
          {tab === 'feed' && (
            <div>
              {/* Add store bar — always visible */}
              <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Agregar tienda para rastrear
                </p>
                <div className="flex gap-2">
                  <input
                    value={addUrl}
                    onChange={e => setAddUrl(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addStore()}
                    placeholder="URL de tienda Shopify — ej: superdogs.myshopify.com"
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#e42820]/20 focus:border-[#e42820]"
                  />
                  <button
                    onClick={addStore}
                    disabled={adding || !addUrl.trim()}
                    className="px-4 py-2 bg-[#e42820] text-white text-sm font-semibold rounded-xl disabled:opacity-40 hover:opacity-90 transition-opacity whitespace-nowrap"
                  >
                    {adding ? '...' : 'Agregar'}
                  </button>
                </div>
                {addError && (
                  <p className="mt-2 text-xs text-red-600">{addError}</p>
                )}
                <p className="mt-2 text-xs text-gray-400">
                  Encontrá URLs desde la pestaña Meta Ads — hacé click en un ad, copiá la URL de la tienda y pegala acá.
                </p>
              </div>

              {/* Tracked stores chips */}
              {stores.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-5">
                  {stores.map(s => (
                    <div
                      key={s.url}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                        loadingStores.has(s.url)
                          ? 'bg-gray-50 border-gray-200 text-gray-400'
                          : errors[s.url]
                          ? 'bg-red-50 border-red-200 text-red-600'
                          : 'bg-white border-gray-200 text-gray-700'
                      }`}
                    >
                      {loadingStores.has(s.url) && (
                        <span className="w-2 h-2 rounded-full bg-gray-300 animate-pulse shrink-0" />
                      )}
                      {errors[s.url] && (
                        <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                      )}
                      {!loadingStores.has(s.url) && !errors[s.url] && (
                        <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                      )}
                      <span className="max-w-[140px] truncate">{s.domain}</span>
                      <button
                        onClick={() => removeStore(s.url)}
                        className="text-gray-300 hover:text-red-400 transition-colors ml-0.5"
                        aria-label="Eliminar"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Empty state */}
              {stores.length === 0 && (
                <div className="text-center py-20">
                  <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Todavía no rastreás ninguna tienda</h3>
                  <p className="text-xs text-gray-400 max-w-xs mx-auto mb-6 leading-relaxed">
                    Andá a la pestaña <strong>Meta Ads LATAM</strong>, buscá productos por keyword, hacé click en algún ad para ver la tienda y pegá la URL arriba.
                  </p>
                  <button
                    onClick={() => setTab('meta')}
                    className="px-5 py-2.5 bg-[#1877f2] text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity"
                  >
                    Buscar en Meta Ads →
                  </button>
                </div>
              )}

              {/* Loading state */}
              {loading && stores.length > 0 && products.length === 0 && (
                <div className="flex flex-col items-center py-16 gap-3">
                  <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-[#e42820] animate-spin" />
                  <p className="text-sm text-gray-400">Cargando productos...</p>
                </div>
              )}

              {/* Product grid */}
              {products.length > 0 && (
                <>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                    <div>
                      {lastRefresh && (
                        <p className="text-xs text-gray-400">
                          Actualizado {lastRefresh.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filterAvailable}
                          onChange={e => setFilterAvailable(e.target.checked)}
                          className="rounded"
                        />
                        Solo con stock
                      </label>
                      <select
                        value={sortBy}
                        onChange={e => setSortBy(e.target.value as typeof sortBy)}
                        className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none"
                      >
                        <option value="newest">Más nuevos</option>
                        <option value="price_desc">Mayor precio</option>
                        <option value="price_asc">Menor precio</option>
                        <option value="variants">Más variantes</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {sortedProducts.map(p => (
                      <div key={`${p.store_url}-${p.id}`} className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow group">
                        {/* Image */}
                        <div className="aspect-square bg-gray-50 overflow-hidden relative">
                          {p.image ? (
                            <img
                              src={p.image}
                              alt={p.title}
                              className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <svg className="w-10 h-10 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                          )}
                          {/* Days badge */}
                          <div className="absolute top-1.5 right-1.5">
                            <span className="text-[10px] font-bold bg-black/55 text-white px-1.5 py-0.5 rounded-full">
                              {daysSince(p.published_at)}d
                            </span>
                          </div>
                          {!p.available && (
                            <div className="absolute top-1.5 left-1.5">
                              <span className="text-[10px] font-bold bg-gray-700/80 text-white px-1.5 py-0.5 rounded-full">
                                Sin stock
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="p-2.5">
                          <p className="text-xs text-gray-400 truncate mb-0.5">{p.store_domain}</p>
                          <p className="text-xs font-semibold text-gray-900 leading-tight line-clamp-2 mb-1.5">
                            {p.title}
                          </p>
                          <div className="flex items-center justify-between mb-2.5">
                            <span className="text-sm font-bold text-gray-900">
                              ${p.price_min.toLocaleString('es-AR')}
                            </span>
                            {p.variants_count > 1 && (
                              <span className="text-[10px] text-gray-400">{p.variants_count}v</span>
                            )}
                          </div>
                          <div className="flex gap-1.5">
                            <a
                              href={p.url}
                              target="_blank"
                              rel="noopener"
                              className="flex-1 text-center text-[11px] font-medium py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                            >
                              Ver
                            </a>
                            <a
                              href={buildMetaUrl(p.title, ['AR', 'MX', 'CO', 'CL'])}
                              target="_blank"
                              rel="noopener"
                              className="flex-1 text-center text-[11px] font-medium py-1.5 bg-[#1877f2] text-white rounded-lg hover:opacity-90 transition-opacity"
                            >
                              Meta
                            </a>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── META ADS TAB ── */}
          {tab === 'meta' && (
            <div className="space-y-5">
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">Buscar ads activos en Meta Ad Library</h2>

                <div className="mb-4">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Keyword</label>
                  <input
                    value={metaKeyword}
                    onChange={e => setMetaKeyword(e.target.value)}
                    placeholder="ej: mascarilla facial, ropa deportiva, collar perro..."
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1877f2]/20 focus:border-[#1877f2]"
                  />
                </div>

                <div className="mb-5">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Países LATAM</label>
                  <div className="flex flex-wrap gap-2">
                    {LATAM_COUNTRIES.map(c => (
                      <button
                        key={c.code}
                        onClick={() => setSelectedCountries(prev =>
                          prev.includes(c.code) ? prev.filter(x => x !== c.code) : [...prev, c.code]
                        )}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                          selectedCountries.includes(c.code)
                            ? 'bg-[#1877f2] text-white border-[#1877f2]'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                <a
                  href={metaKeyword && selectedCountries.length > 0
                    ? buildMetaUrl(metaKeyword, selectedCountries)
                    : '#'}
                  target="_blank"
                  rel="noopener"
                  className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold transition-all ${
                    metaKeyword && selectedCountries.length > 0
                      ? 'bg-[#1877f2] text-white hover:opacity-90'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed pointer-events-none'
                  }`}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                  Abrir en Meta Ad Library
                </a>
              </div>

              {/* Búsquedas sugeridas */}
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <h3 className="text-sm font-bold text-gray-700 mb-3">Búsquedas populares en LATAM</h3>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED_SEARCHES.map(term => (
                    <button
                      key={term}
                      onClick={() => setMetaKeyword(term)}
                      className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs rounded-lg transition-colors"
                    >
                      {term}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cómo agregar tiendas */}
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
                <h3 className="text-sm font-bold text-amber-800 mb-3">Cómo encontrar tiendas para rastrear</h3>
                <ol className="space-y-3 text-xs text-amber-700">
                  <li className="flex gap-2.5">
                    <span className="font-bold w-4 shrink-0">1.</span>
                    <span>Buscá una keyword arriba y abrí Meta Ad Library. Filtrá por <strong>activos</strong> y ordená por <strong>fecha más antigua</strong> — esos llevan más tiempo corriendo y probablemente estén convirtiendo.</span>
                  </li>
                  <li className="flex gap-2.5">
                    <span className="font-bold w-4 shrink-0">2.</span>
                    <span>Hacé click en un ad que te llame la atención. Te lleva a la landing del producto. Copiá la URL de la tienda (solo el dominio).</span>
                  </li>
                  <li className="flex gap-2.5">
                    <span className="font-bold w-4 shrink-0">3.</span>
                    <span>Andá a la pestaña <strong>Productos</strong> y pegá la URL en el campo "Agregar tienda". El módulo la escanea y la agrega al feed automáticamente.</span>
                  </li>
                  <li className="flex gap-2.5">
                    <span className="font-bold w-4 shrink-0">4.</span>
                    <span>A partir de ahí, cada vez que abras el módulo, se actualizan solas cada 6 horas. Ves todos los productos nuevos de las tiendas que seguís.</span>
                  </li>
                </ol>
                <button
                  onClick={() => setTab('feed')}
                  className="mt-4 text-xs font-semibold text-amber-800 underline underline-offset-2"
                >
                  Ir a Productos →
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
