'use client';

import { useState } from 'react';
import { createSupabaseBrowser } from '@/app/lib/supabase-browser';
import { useRequireAuth } from '@/app/lib/use-auth';
import Sidebar from '@/app/components/Sidebar';

type Mode = 'scanner' | 'meta';

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
}

const LATAM_COUNTRIES: { code: string; label: string }[] = [
  { code: 'AR', label: 'Argentina' },
  { code: 'MX', label: 'México' },
  { code: 'CO', label: 'Colombia' },
  { code: 'CL', label: 'Chile' },
  { code: 'PE', label: 'Perú' },
  { code: 'UY', label: 'Uruguay' },
  { code: 'BO', label: 'Bolivia' },
  { code: 'PY', label: 'Paraguay' },
];

const AD_CATEGORIES = [
  { value: '', label: 'Todas las categorías' },
  { value: 'ECOMMERCE', label: 'E-commerce' },
  { value: 'BEAUTY', label: 'Belleza' },
  { value: 'FITNESS', label: 'Fitness' },
  { value: 'HOME', label: 'Hogar' },
  { value: 'FASHION', label: 'Moda' },
  { value: 'PETS', label: 'Mascotas' },
  { value: 'TECH', label: 'Tecnología' },
];

function formatPrice(n: number): string {
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 });
}

function buildMetaUrl(keyword: string, countries: string[]): string {
  const countryStr = countries.join(',');
  const q = encodeURIComponent(keyword);
  return `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${countryStr}&q=${q}&search_type=keyword_unordered&media_type=all`;
}

function daysSince(dateStr: string): number {
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export default function WinningProductsPage() {
  useRequireAuth();
  const supabase = createSupabaseBrowser();

  const [mode, setMode] = useState<Mode>('scanner');

  // Scanner state
  const [storeUrl, setStoreUrl] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [products, setProducts] = useState<ScannedProduct[]>([]);
  const [storeBase, setStoreBase] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'price_asc' | 'price_desc' | 'variants'>('newest');
  const [filterAvailable, setFilterAvailable] = useState(false);

  // Meta state
  const [metaKeyword, setMetaKeyword] = useState('');
  const [selectedCountries, setSelectedCountries] = useState<string[]>(['AR']);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const scanStore = async () => {
    if (!storeUrl.trim()) return;
    setScanning(true);
    setScanError('');
    setProducts([]);
    try {
      const res = await fetch('/api/scan-store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeUrl: storeUrl.trim() }),
      });
      let data: { products?: ScannedProduct[]; store_url?: string; total?: number; error?: string };
      try { data = await res.json(); } catch { throw new Error('Respuesta inesperada del servidor.'); }
      if (!res.ok || data.error) throw new Error(data.error || 'Error al escanear');
      setProducts(data.products || []);
      setStoreBase(data.store_url || '');
    } catch (e) {
      setScanError(e instanceof Error ? e.message : 'Error inesperado');
    } finally {
      setScanning(false);
    }
  };

  const toggleCountry = (code: string) => {
    setSelectedCountries(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  const sortedProducts = [...products]
    .filter(p => !filterAvailable || p.available)
    .sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
      if (sortBy === 'price_asc') return a.price_min - b.price_min;
      if (sortBy === 'price_desc') return b.price_min - a.price_min;
      if (sortBy === 'variants') return b.variants_count - a.variants_count;
      return 0;
    });

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar active="/winning-products" onLogout={handleLogout} />

      <main className="flex-1 md:ml-56 pt-16 md:pt-0">
        <div className="max-w-5xl mx-auto px-4 py-8">

          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Producto Spy</h1>
            <p className="text-sm text-gray-500 mt-1">Escaneá tiendas Shopify y encontrá oportunidades en Meta Ads LATAM</p>
          </div>

          {/* Mode tabs */}
          <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit mb-6">
            {([
              { id: 'scanner', label: '🔍  Escanear tienda', icon: '' },
              { id: 'meta', label: '📣  Meta Ads LATAM', icon: '' },
            ] as { id: Mode; label: string; icon: string }[]).map(tab => (
              <button
                key={tab.id}
                onClick={() => setMode(tab.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  mode === tab.id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── SCANNER MODE ── */}
          {mode === 'scanner' && (
            <div>
              {/* URL input */}
              <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-3">
                  URL de la tienda Shopify
                </label>
                <div className="flex gap-3">
                  <input
                    value={storeUrl}
                    onChange={e => setStoreUrl(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && scanStore()}
                    placeholder="ej: sutienda.myshopify.com  o  www.sutienda.com"
                    className="flex-1 px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#e42820]/20 focus:border-[#e42820]"
                  />
                  <button
                    onClick={scanStore}
                    disabled={scanning || !storeUrl.trim()}
                    className="px-5 py-2.5 bg-[#e42820] text-white text-sm font-semibold rounded-xl disabled:opacity-40 transition-opacity hover:opacity-90"
                  >
                    {scanning ? 'Escaneando...' : 'Escanear'}
                  </button>
                </div>
                {scanError && (
                  <p className="mt-3 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{scanError}</p>
                )}
                <p className="mt-2.5 text-xs text-gray-400">
                  Funciona con cualquier tienda Shopify que tenga productos públicos. No requiere credenciales.
                </p>
              </div>

              {/* Scanning spinner */}
              {scanning && (
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                  <div className="w-10 h-10 rounded-full border-2 border-gray-200 border-t-[#e42820] animate-spin" />
                  <p className="text-sm text-gray-400">Escaneando productos...</p>
                </div>
              )}

              {/* Results */}
              {products.length > 0 && !scanning && (
                <>
                  {/* Toolbar */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {products.length} productos en{' '}
                        <a href={storeBase} target="_blank" rel="noopener" className="text-[#e42820] hover:underline">
                          {new URL(storeBase).hostname}
                        </a>
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {products.filter(p => p.available).length} disponibles •{' '}
                        {products.filter(p => p.images_count >= 4).length} con 4+ imágenes
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filterAvailable}
                          onChange={e => setFilterAvailable(e.target.checked)}
                          className="rounded"
                        />
                        Solo disponibles
                      </label>
                      <select
                        value={sortBy}
                        onChange={e => setSortBy(e.target.value as typeof sortBy)}
                        className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none"
                      >
                        <option value="newest">Más nuevos</option>
                        <option value="price_desc">Mayor precio</option>
                        <option value="price_asc">Menor precio</option>
                        <option value="variants">Más variantes</option>
                      </select>
                    </div>
                  </div>

                  {/* Product grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sortedProducts.map(p => (
                      <div key={p.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                        {/* Image */}
                        <div className="aspect-square bg-gray-50 relative overflow-hidden">
                          {p.image ? (
                            <img
                              src={p.image}
                              alt={p.title}
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <svg className="w-12 h-12 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                          )}
                          {/* Badges */}
                          <div className="absolute top-2 left-2 flex flex-col gap-1">
                            {!p.available && (
                              <span className="text-[10px] font-bold bg-gray-800/80 text-white px-2 py-0.5 rounded-full">
                                Sin stock
                              </span>
                            )}
                            {p.images_count >= 4 && (
                              <span className="text-[10px] font-bold bg-emerald-500/90 text-white px-2 py-0.5 rounded-full">
                                {p.images_count} fotos
                              </span>
                            )}
                          </div>
                          {/* Days badge */}
                          <div className="absolute top-2 right-2">
                            <span className="text-[10px] font-bold bg-black/60 text-white px-2 py-0.5 rounded-full">
                              {daysSince(p.published_at)}d
                            </span>
                          </div>
                        </div>

                        {/* Info */}
                        <div className="p-3.5">
                          <p className="text-sm font-semibold text-gray-900 leading-tight line-clamp-2 mb-1">
                            {p.title}
                          </p>
                          {p.vendor && (
                            <p className="text-xs text-gray-400 mb-2">{p.vendor}</p>
                          )}
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-base font-bold text-gray-900">
                              ${p.price_min.toLocaleString('es-AR')}
                              {p.price_max > p.price_min && (
                                <span className="text-xs font-normal text-gray-400 ml-1">
                                  – ${p.price_max.toLocaleString('es-AR')}
                                </span>
                              )}
                            </span>
                            {p.variants_count > 1 && (
                              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                                {p.variants_count} variantes
                              </span>
                            )}
                          </div>

                          {/* Action buttons */}
                          <div className="flex gap-2">
                            <a
                              href={p.url}
                              target="_blank"
                              rel="noopener"
                              className="flex-1 text-center text-xs font-medium py-2 px-3 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                            >
                              Ver producto
                            </a>
                            <a
                              href={buildMetaUrl(p.title, ['AR', 'MX', 'CO', 'CL'])}
                              target="_blank"
                              rel="noopener"
                              className="flex-1 text-center text-xs font-medium py-2 px-3 bg-[#1877f2] text-white rounded-lg hover:opacity-90 transition-opacity"
                            >
                              Meta Ads
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

          {/* ── META ADS MODE ── */}
          {mode === 'meta' && (
            <div className="space-y-5">
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">Construir búsqueda en Meta Ad Library</h2>

                {/* Keyword */}
                <div className="mb-4">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Keyword / producto
                  </label>
                  <input
                    value={metaKeyword}
                    onChange={e => setMetaKeyword(e.target.value)}
                    placeholder="ej: mascarilla facial, ropa deportiva, collar perro..."
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1877f2]/20 focus:border-[#1877f2]"
                  />
                </div>

                {/* Countries */}
                <div className="mb-5">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Países LATAM
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {LATAM_COUNTRIES.map(c => (
                      <button
                        key={c.code}
                        onClick={() => toggleCountry(c.code)}
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

                {/* Preview URL */}
                {metaKeyword && selectedCountries.length > 0 && (
                  <div className="bg-gray-50 rounded-xl p-3 mb-4">
                    <p className="text-xs text-gray-400 mb-1 font-medium">Vista previa del link:</p>
                    <p className="text-xs text-gray-600 break-all font-mono leading-relaxed">
                      {buildMetaUrl(metaKeyword, selectedCountries)}
                    </p>
                  </div>
                )}

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

              {/* Tips */}
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
                <h3 className="text-sm font-bold text-amber-800 mb-3">Cómo leer los ads para encontrar ganadores</h3>
                <ul className="space-y-2.5 text-xs text-amber-700">
                  <li className="flex gap-2">
                    <span className="font-bold shrink-0">1.</span>
                    <span><strong>Filtrá por "Active"</strong> — ads activos son los que están convirtiendo. Si alguien sigue pagando, es porque funciona.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold shrink-0">2.</span>
                    <span><strong>Revisá la fecha de inicio</strong> — un ad corriendo hace más de 30 días es señal fuerte de que está generando retorno.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold shrink-0">3.</span>
                    <span><strong>Múltiples creativos del mismo anunciante</strong> — si tienen 5+ variantes del mismo ad, están haciendo A/B testing serio = están escalando.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold shrink-0">4.</span>
                    <span><strong>Hacé click en el ad</strong> — te lleva a la landing del producto. Copiá la URL y escaneala en "Escanear tienda" para ver todos sus productos.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold shrink-0">5.</span>
                    <span><strong>Mirá el call to action</strong> — "Shop Now" y "Buy Now" indican venta directa. "Learn More" suele ser awareness o lead gen.</span>
                  </li>
                </ul>
              </div>

              {/* Useful searches */}
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <h3 className="text-sm font-bold text-gray-700 mb-3">Búsquedas populares en LATAM</h3>
                <div className="flex flex-wrap gap-2">
                  {[
                    'organizador cocina', 'collar led perro', 'mascarilla facial',
                    'soporte celular auto', 'cargador inalámbrico', 'cepillo masajeador',
                    'ropa deportiva mujer', 'luz led habitación', 'bolsa impermeable',
                    'comida para perro', 'funda silicona', 'taza térmica',
                  ].map(term => (
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
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
