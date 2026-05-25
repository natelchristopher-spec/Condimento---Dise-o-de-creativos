'use client';

import { useState, useEffect, useRef } from 'react';
import { createSupabaseBrowser } from '@/app/lib/supabase-browser';
import { useRequireAuth } from '@/app/lib/use-auth';
import { BrandKit } from '@/app/types';
import Sidebar from '@/app/components/Sidebar';
import { MessageAngle } from '@/app/api/generate-testing-angles/route';

interface AngleResult {
  id: string;
  base64: string;
  angleKey: string;
  angleName: string;
  hook: string;
  emphasis: string;
}

import { readAsImage, compressImage } from '@/app/lib/image-utils';


export default function TestingPage() {
  useRequireAuth();
  const supabase = createSupabaseBrowser();

  const [brandKit, setBrandKit] = useState<BrandKit | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);

  // Inputs
  const [brief, setBrief] = useState('');
  const [productUrl, setProductUrl] = useState('');
  const [scrapingUrl, setScrapingUrl] = useState(false);
  const [productImage, setProductImage] = useState('');
  const [productPreview, setProductPreview] = useState('');
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [count, setCount] = useState(4);

  // Generation state
  const [step, setStep] = useState<'idle' | 'generating' | 'applying' | 'results'>('idle');
  const [angles, setAngles] = useState<MessageAngle[]>([]);
  const [results, setResults] = useState<AngleResult[]>([]);
  const [generatedCount, setGeneratedCount] = useState(0);
  const [applyIndex, setApplyIndex] = useState(0);
  const [isFashionProduct, setIsFashionProduct] = useState(false);
  const [productDescription, setProductDescription] = useState('');
  const [personDescription, setPersonDescription] = useState('');
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const productFileRef = useRef<HTMLInputElement>(null);
  const referenceFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setUserEmail(session.user.email || '');
      fetch('/api/profile').then(r => r.json()).then(data => {
        setHasApiKey(!!data.openai_api_key);
      }).catch(() => setHasApiKey(false));
      fetch('/api/brand-kits').then(r => r.json()).then(kit => {
        if (kit && !kit.error) setBrandKit(kit as BrandKit);
      }).catch(console.error);
    };
    load();
  }, [supabase]);

  useEffect(() => {
    if (step === 'generating' || step === 'applying') {
      if (!timerRef.current) {
        setElapsed(0);
        timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
      }
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [step]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const scrapeProduct = async () => {
    if (!productUrl.trim()) return;
    setScrapingUrl(true);
    try {
      const res = await fetch('/api/scrape-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: productUrl }),
      });
      const data = await res.json();
      if (data.clientRequest) setBrief(data.clientRequest);
    } catch { /* keep existing brief */ }
    finally { setScrapingUrl(false); }
  };

  const handleProductFile = async (file: File) => {
    const b64 = await readAsImage(file);
    if (b64) { setProductImage(b64); setProductPreview(b64); }
  };

  const handleReferenceFile = async (file: File) => {
    const b64 = await readAsImage(file);
    if (b64) setReferenceImages([b64]);
  };

  // Apply product to a single angle result — same logic as enterRefine() in anuncios
  const applyProductToAngle = async (
    result: AngleResult,
    prodDesc: string,
    personDesc: string,
  ): Promise<AngleResult> => {
    if (!productImage) return result;
    try {
      const compressedConcept = await compressImage(result.base64);
      const compressedProduct = await compressImage(productImage);
      const res = await fetch('/api/apply-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conceptImageBase64: compressedConcept,
          productDetailImages: [compressedProduct],
          productDescription: prodDesc,
          peopleMode: 'real',
          personDescription: personDesc,
        }),
      });
      if (!res.ok) return result;
      const data = await res.json();
      return data.base64 ? { ...result, base64: data.base64 } : result;
    } catch {
      return result;
    }
  };

  const handleGenerate = async () => {
    if (!brandKit) return;
    setError('');
    setResults([]);
    setAngles([]);
    setGeneratedCount(0);
    setIsFashionProduct(false);
    setProductDescription('');
    setPersonDescription('');
    setStep('generating');

    try {
      const res = await fetch('/api/generate-testing-angles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief, brandKit, productImage, referenceImages, count }),
      });

      if (!res.ok || !res.body) {
        setError('Error al conectar con la API. Intentá de nuevo.');
        setStep('idle');
        return;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const collected: AngleResult[] = [];
      let fashionDetected = false;
      let prodDesc = '';
      let personDesc = '';

      try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          if (!part.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(part.slice(6));
            if (data.error) { setError(data.error); setStep('idle'); return; }
            if (data.angles) setAngles(data.angles);
            if (data.image) {
              collected.push(data.image);
              setGeneratedCount(collected.length);
              setResults([...collected]);
            }
            if (data.done) {
              fashionDetected = !!data.isFashionProduct;
              prodDesc = data.productDescription || '';
              personDesc = data.personDescription || '';
              setIsFashionProduct(fashionDetected);
              setProductDescription(prodDesc);
              setPersonDescription(personDesc);
            }
          } catch { /* malformed chunk */ }
        }
      }

      } finally {
        clearTimeout(timeout);
      }

      if (collected.length === 0) {
        setError('No se generaron imágenes. Intentá de nuevo.');
        setStep('idle');
        return;
      }

      // Apply-product step for fashion — same as enterRefine() in anuncios
      if (fashionDetected && productImage) {
        setStep('applying');
        const applied = [...collected];
        for (let i = 0; i < applied.length; i++) {
          setApplyIndex(i);
          applied[i] = await applyProductToAngle(applied[i], prodDesc, personDesc);
          setResults([...applied]);
        }
      }

      setStep('results');
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        setError('La generación tardó demasiado. Intentá de nuevo.');
      } else {
        setError('Error de conexión. Verificá tu red e intentá de nuevo.');
      }
      setStep('idle');
    }
  };

  const downloadImage = (result: AngleResult) => {
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${result.base64}`;
    link.download = `angulo-${result.angleName.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.png`;
    link.click();
  };

  const downloadAll = () => results.forEach(r => downloadImage(r));
  const reset = () => {
    setStep('idle'); setResults([]); setAngles([]);
    setGeneratedCount(0); setError(''); setApplyIndex(0);
  };

  const sortedResults = [...results].sort((a, b) => {
    const order = angles.map(a => a.key);
    return order.indexOf(a.angleKey) - order.indexOf(b.angleKey);
  });

  const totalSteps = isFashionProduct && productImage ? 2 : 1;
  const currentStepLabel = step === 'generating'
    ? `Paso 1 de ${totalSteps}: generando ángulos...`
    : step === 'applying'
      ? `Paso 2 de 2: aplicando prenda (${applyIndex + 1} de ${results.length})...`
      : '';

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar active="/testing" userEmail={userEmail} onLogout={handleLogout} />

      <main className="flex-1 md:ml-56 overflow-y-auto">
        <div className="px-4 sm:px-6 py-8 sm:py-10 max-w-5xl mx-auto">

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Test de Ángulos</h1>
            <p className="mt-1 text-sm text-gray-500">
              Mismo formato, distintos mensajes. Encontrá el ángulo que convierte antes de escalar en formatos.
            </p>
          </div>

          {!brandKit && (
            <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
              Necesitás configurar tu marca antes de generar ángulos.{' '}
              <a href="/config" className="underline font-medium">Ir a Mi marca →</a>
            </div>
          )}
          {hasApiKey === false && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
              Configurá tu API key de OpenAI para usar este módulo.{' '}
              <a href="/perfil" className="underline font-medium">Ir a Perfil →</a>
            </div>
          )}

          {/* ── IDLE ── */}
          {step === 'idle' && (
            <div className="space-y-6">

              {/* Format badge */}
              <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6h16M4 12h16M4 18h7" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Formato fijo: Directo</p>
                  <p className="text-xs text-gray-500">Lo que varía es el mensaje. Para ropa, la prenda se aplica automáticamente al concepto.</p>
                </div>
              </div>

              {/* Product image */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Foto del producto</label>
                <div
                  onClick={() => productFileRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl transition-all cursor-pointer
                    ${productPreview ? 'border-gray-200 bg-gray-50' : 'border-gray-300 hover:border-[#e42820]/50 hover:bg-[#e42820]/[0.02]'}`}
                >
                  {productPreview ? (
                    <div className="flex items-center gap-4 p-4">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={productPreview} alt="Producto" className="w-20 h-20 object-contain rounded-lg bg-white border border-gray-100" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">Foto cargada</p>
                        <p className="text-xs text-gray-500 mt-0.5">Clic para cambiar</p>
                      </div>
                      <button onClick={e => { e.stopPropagation(); setProductImage(''); setProductPreview(''); }} className="text-gray-400 hover:text-gray-700 p-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ) : (
                    <div className="py-10 text-center">
                      <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <p className="text-sm text-gray-500">Subí la foto del producto</p>
                      <p className="text-xs text-gray-400 mt-0.5">JPG o PNG — opcional pero recomendado</p>
                    </div>
                  )}
                </div>
                <input ref={productFileRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleProductFile(f); e.target.value = ''; }} />
              </div>

              {/* Reference person photo — shown as secondary option */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">
                  Foto de modelo <span className="text-xs font-normal text-gray-400">— opcional, solo para ropa</span>
                </label>
                <p className="text-xs text-gray-400 mb-2">Si el producto es una prenda, podés subir una foto de modelo de referencia para mejor resultado.</p>
                {referenceImages.length > 0 ? (
                  <div className="flex items-center gap-3 border border-gray-200 rounded-xl p-3 bg-gray-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={referenceImages[0].startsWith('data:') ? referenceImages[0] : `data:image/jpeg;base64,${referenceImages[0]}`}
                      alt="Modelo" className="w-12 h-12 object-cover rounded-lg" />
                    <p className="text-sm text-gray-700 flex-1">Foto de modelo cargada</p>
                    <button onClick={() => setReferenceImages([])} className="text-gray-400 hover:text-gray-700 p-1">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ) : (
                  <button onClick={() => referenceFileRef.current?.click()}
                    className="text-sm text-gray-500 border border-dashed border-gray-300 rounded-xl px-4 py-2.5 hover:border-gray-400 hover:text-gray-700 transition-all">
                    + Subir foto de modelo
                  </button>
                )}
                <input ref={referenceFileRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleReferenceFile(f); e.target.value = ''; }} />
              </div>

              {/* URL scraper */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  URL del producto <span className="text-xs font-normal text-gray-400">— opcional</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={productUrl}
                    onChange={e => setProductUrl(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && scrapeProduct()}
                    placeholder="https://tutienda.com/producto"
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#e42820]/30 focus:border-[#e42820]/50"
                  />
                  <button
                    onClick={scrapeProduct}
                    disabled={!productUrl.trim() || scrapingUrl}
                    className="px-4 py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all whitespace-nowrap"
                  >
                    {scrapingUrl ? 'Analizando...' : 'Importar brief'}
                  </button>
                </div>
              </div>

              {/* Brief */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Describí el producto, la categoría o la oferta
                </label>
                <textarea
                  value={brief}
                  onChange={e => setBrief(e.target.value)}
                  placeholder="Describí el producto: qué es, a quién va dirigido, beneficios clave, propuesta de valor..."
                  rows={4}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-[#e42820]/30 focus:border-[#e42820]/50"
                />
              </div>

              {/* Count */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Cantidad de ángulos</label>
                <div className="flex gap-2">
                  {[2, 3, 4, 5, 6].map(n => (
                    <button key={n} onClick={() => setCount(n)}
                      className={`w-12 h-10 rounded-xl text-sm font-semibold border transition-all ${
                        count === n ? 'bg-[#e42820] text-white border-[#e42820]' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                      }`}>{n}</button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1.5">Recomendado: 3-4 ángulos por test. Más ángulos = más costo de API.</p>
              </div>

              {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>}

              <button onClick={handleGenerate}
                disabled={!brandKit || hasApiKey === false || (!brief.trim() && !productImage)}
                className="w-full sm:w-auto px-8 py-3 bg-[#e42820] text-white font-semibold rounded-xl hover:bg-[#c41f18] disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm">
                Generar {count} ángulos
              </button>
              {!brief.trim() && !productImage && (
                <p className="text-xs text-gray-400">Necesitás al menos una foto del producto o un brief.</p>
              )}
            </div>
          )}

          {/* ── GENERATING / APPLYING ── */}
          {(step === 'generating' || step === 'applying') && (
            <div className="space-y-6">
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-gray-900">{currentStepLabel}</p>
                  <span className="text-xs text-gray-400">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5 mb-2">
                  <div className="bg-[#e42820] h-1.5 rounded-full transition-all duration-500"
                    style={{
                      width: step === 'generating'
                        ? `${angles.length === 0 ? 5 : (generatedCount / count) * 100}%`
                        : `${((applyIndex + 1) / results.length) * 100}%`,
                    }}
                  />
                </div>
                {step === 'applying' && (
                  <p className="text-xs text-gray-500">Aplicando la prenda al concepto {applyIndex + 1} de {results.length} — esto tarda ~30 segundos por imagen</p>
                )}
              </div>

              {/* Cards showing angle info + image as it streams */}
              {angles.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {angles.map((angle, i) => {
                    const result = results.find(r => r.angleKey === angle.key);
                    const isApplying = step === 'applying' && applyIndex === i && !result;
                    return (
                      <div key={angle.key} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                        <div className="flex gap-4 p-4">
                          <div className="w-24 shrink-0 rounded-lg overflow-hidden bg-gray-100 relative" style={{ aspectRatio: '2/3' }}>
                            {result ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={`data:image/png;base64,${result.base64}`} alt={angle.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                {isApplying ? (
                                  <svg className="w-5 h-5 text-[#e42820] animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                  </svg>
                                ) : (
                                  <div className="w-full h-full animate-pulse bg-gray-100" />
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0 py-1">
                            <p className="text-xs font-semibold text-[#e42820] uppercase tracking-wide mb-1">{angle.name}</p>
                            <p className="text-sm font-bold text-gray-900 leading-snug mb-2">&ldquo;{angle.hook}&rdquo;</p>
                            <p className="text-xs text-gray-500 leading-relaxed">{angle.emphasis}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {angles.length === 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {Array.from({ length: count }).map((_, i) => (
                    <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 animate-pulse">
                      <div className="flex gap-4">
                        <div className="w-24 rounded-lg bg-gray-100 shrink-0" style={{ aspectRatio: '2/3' }} />
                        <div className="flex-1 space-y-2 py-1">
                          <div className="h-3 bg-gray-100 rounded w-1/3" />
                          <div className="h-4 bg-gray-100 rounded w-3/4" />
                          <div className="h-3 bg-gray-100 rounded w-full" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── RESULTS ── */}
          {step === 'results' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{results.length} ángulos generados</h2>
                  <p className="text-sm text-gray-500">
                    {isFashionProduct
                      ? 'Formato Directo · prenda aplicada · listos para testear en Meta'
                      : 'Formato Directo · listos para testear en Meta'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={downloadAll} className="text-sm text-gray-700 hover:text-gray-900 border border-gray-300 hover:border-gray-400 px-4 py-2 rounded-xl transition-colors">
                    Descargar todos
                  </button>
                  <button onClick={reset} className="text-sm text-gray-700 hover:text-gray-900 border border-gray-300 hover:border-gray-400 px-4 py-2 rounded-xl transition-colors">
                    Nuevo test
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {sortedResults.map(result => (
                  <div key={result.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden group hover:shadow-md transition-all">
                    <div className="flex gap-4 p-4">
                      <div className="relative w-28 shrink-0 rounded-lg overflow-hidden" style={{ aspectRatio: '2/3' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`data:image/png;base64,${result.base64}`} alt={result.angleName} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-end justify-end p-1.5">
                          <button onClick={() => downloadImage(result)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity bg-white text-gray-900 rounded-lg p-1.5 shadow-md hover:bg-gray-50"
                            title="Descargar">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0 py-1">
                        <p className="text-xs font-semibold text-[#e42820] uppercase tracking-wide mb-1">{result.angleName}</p>
                        <p className="text-sm font-bold text-gray-900 leading-snug mb-2">&ldquo;{result.hook}&rdquo;</p>
                        <p className="text-xs text-gray-500 leading-relaxed mb-3">{result.emphasis}</p>
                        <button onClick={() => downloadImage(result)}
                          className="text-xs text-gray-400 hover:text-gray-700 flex items-center gap-1 transition-colors">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          Descargar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-700">
                <p className="font-semibold text-gray-900 mb-1">Cómo testear correctamente</p>
                <ul className="space-y-1 text-xs text-gray-600 list-disc list-inside">
                  <li>Publicá cada ángulo como un ad separado dentro de la misma campaña de Prospección</li>
                  <li>Mismo presupuesto, mismo público, mismo período (mínimo 7 días)</li>
                  <li>Mirá CTR y costo por resultado — el ángulo ganador es el que escala</li>
                  <li>Una vez que sabés qué mensaje funciona, producilo en todos los formatos</li>
                </ul>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
