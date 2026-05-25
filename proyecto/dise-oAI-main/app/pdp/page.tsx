'use client';

import { useState, useEffect } from 'react';
import { createSupabaseBrowser } from '@/app/lib/supabase-browser';
import { useRequireAuth } from '@/app/lib/use-auth';
import { BrandKit } from '@/app/types';
import Sidebar from '@/app/components/Sidebar';
import { readAsImage, compressImage } from '@/app/lib/image-utils';

type PdpStep = 'brief' | 'review' | 'generating' | 'done';
type PdpMode = 'product' | 'product-use' | 'fashion';

interface SlideDisplayCopy {
  items?: string[];
  tagline?: string;
  quote?: string;
  author?: string;
  rating?: string;
}

interface PdpPlan {
  type: string;
  label: string;
  display_copy: SlideDisplayCopy | null;
  image_prompt: string;
}

interface PdpImage {
  id: string;
  type: string;
  label: string;
  base64: string;
}

const PDP_SLOTS = [
  { type: 'hero',        label: 'Product Hero',    desc: 'Protagonista absoluto del producto' },
  { type: 'benefit',     label: 'Benefit Image',   desc: '3 beneficios clave al instante' },
  { type: 'lifestyle',   label: 'Lifestyle Image', desc: 'Producto en contexto real de uso' },
  { type: 'authority',   label: 'Authority Image', desc: 'Materiales, tecnología, credibilidad' },
  { type: 'howto',       label: 'How to Use',      desc: 'Pasos simples para usar el producto' },
  { type: 'testimonial', label: 'Testimonial',     desc: 'Prueba social y reseñas' },
] as const;

const APPLY_MESSAGES = [
  'Analizando el producto...',
  'Diseñando composición...',
  'Generando imágenes...',
  'Aplicando estilo de marca...',
  'Finalizando detalles...',
];

export default function PdpPage() {
  useRequireAuth();
  const supabase = createSupabaseBrowser();

  const [brandKit, setBrandKit] = useState<BrandKit | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [kitLoading, setKitLoading] = useState(true);
  const [step, setStep] = useState<PdpStep>('brief');
  const [mode, setMode] = useState<PdpMode>('product');
  const [brief, setBrief] = useState('');
  const [productImages, setProductImages] = useState<string[]>([]);
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [personDescription, setPersonDescription] = useState('');
  const [pdpImages, setPdpImages] = useState<(PdpImage | null)[]>(Array(6).fill(null));
  const [generatedCount, setGeneratedCount] = useState(0);
  const [error, setError] = useState('');
  const [msgIdx, setMsgIdx] = useState(0);
  const [refineOpenIdx, setRefineOpenIdx] = useState<number | null>(null);
  const [refineInputs, setRefineInputs] = useState<string[]>(Array(6).fill(''));
  const [refineHistories, setRefineHistories] = useState<string[][]>(Array.from({ length: 6 }, () => []));
  const [refineImageHistories, setRefineImageHistories] = useState<string[][]>(Array.from({ length: 6 }, () => []));
  const [refiningIdx, setRefiningIdx] = useState<number | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [plans, setPlans] = useState<PdpPlan[]>([]);
  const [productDescription, setProductDescription] = useState('');
  const [productUrl, setProductUrl] = useState('');
  const [scrapingUrl, setScrapingUrl] = useState(false);

  useEffect(() => {
    fetch('/api/brand-kits').then(r => r.json()).then(kit => {
      if (kit && !kit.error) setBrandKit(kit);
    }).catch(console.error).finally(() => setKitLoading(false));
    fetch('/api/profile').then(r => r.json()).then(data => {
      setHasApiKey(!!data.openai_api_key);
    }).catch(() => setHasApiKey(false));
  }, []);

  useEffect(() => {
    if (step !== 'generating') return;
    const id = setInterval(() => setMsgIdx(i => (i + 1) % APPLY_MESSAGES.length), 3500);
    return () => clearInterval(id);
  }, [step]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const handleProductImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const slots = 3 - productImages.length;
    const imgs = await Promise.all(files.slice(0, slots).map(readAsImage));
    setProductImages(prev => [...prev, ...imgs].slice(0, 3));
    e.target.value = '';
  };

  const handleReferenceImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const slots = 2 - referenceImages.length;
    const imgs = await Promise.all(files.slice(0, slots).map(readAsImage));
    setReferenceImages(prev => [...prev, ...imgs].slice(0, 2));
    e.target.value = '';
  };

  const scrapeProduct = async () => {
    if (!productUrl.trim()) return;
    setScrapingUrl(true);
    setError('');
    try {
      const res = await fetch('/api/scrape-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: productUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al leer la URL');
      if (data.clientRequest) setBrief(data.clientRequest);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer la URL del producto');
    } finally {
      setScrapingUrl(false);
    }
  };

  const planPdp = async () => {
    if (!brandKit || !brief.trim()) return;
    setPlanLoading(true);
    setError('');

    try {
      const compressedProducts = await Promise.all(
        productImages.map(img => compressImage(img.includes(',') ? img.split(',')[1] : img))
      );
      const compressedRefs = await Promise.all(
        referenceImages.map(img => compressImage(img.includes(',') ? img.split(',')[1] : img))
      );

      const res = await fetch('/api/plan-pdp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief,
          brandKit,
          pdpMode: mode === 'fashion' ? 'fashion' : 'product',
          peopleMode: mode === 'product' ? 'none' : 'real',
          productImages: compressedProducts,
          referenceImages: compressedRefs,
          personDescription: personDescription.trim(),
        }),
      });

      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setProductDescription(data.productDescription || brief);
      setPlans(data.plans || []);
      setStep('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error planificando imágenes PDP');
    } finally {
      setPlanLoading(false);
    }
  };

  const updatePlanItem = (planIdx: number, itemIdx: number, value: string) => {
    setPlans(prev => prev.map((p, i) => {
      if (i !== planIdx) return p;
      const items = [...(p.display_copy?.items || [])];
      items[itemIdx] = value;
      return { ...p, display_copy: { ...p.display_copy, items } };
    }));
  };

  const updatePlanCopy = (planIdx: number, updates: Partial<SlideDisplayCopy>) => {
    setPlans(prev => prev.map((p, i) =>
      i === planIdx ? { ...p, display_copy: { ...p.display_copy, ...updates } } : p
    ));
  };

  const generateFromPlans = async () => {
    setPdpImages(Array(6).fill(null));
    setGeneratedCount(0);
    setError('');
    setMsgIdx(0);
    setStep('generating');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000); // 5 min
    try {
      const compressedProducts = await Promise.all(
        productImages.map(img => compressImage(img.includes(',') ? img.split(',')[1] : img))
      );
      const compressedRefs = await Promise.all(
        referenceImages.map(img => compressImage(img.includes(',') ? img.split(',')[1] : img))
      );

      const res = await fetch('/api/generate-pdp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief,
          brandKit,
          pdpMode: mode === 'fashion' ? 'fashion' : 'product',
          peopleMode: mode === 'product' ? 'none' : 'real',
          productImages: compressedProducts,
          referenceImages: compressedRefs,
          plans,
          productDescription,
          personDescription: personDescription.trim(),
        }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(await res.text());

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      const images: (PdpImage | null)[] = Array(6).fill(null);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() || '';
        for (const part of parts) {
          if (!part.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(part.slice(6));
            if (data.image) {
              const typeIdx = PDP_SLOTS.findIndex(t => t.type === data.image.type);
              const idx = typeIdx >= 0 ? typeIdx : images.findIndex(i => !i);
              if (idx >= 0) {
                images[idx] = data.image;
                setPdpImages([...images]);
                setGeneratedCount(images.filter(Boolean).length);
              }
            }
            if (data.error) {
              const isInternalError = data.error.includes('403') || data.error.includes('organization') || data.error.includes('API key') || data.error.includes('model `');
              const label = data.error.split(':')[0] || 'Imagen';
              const userMsg = isInternalError ? `${label}: no se pudo generar. Intentá de nuevo.` : data.error;
              setError(prev => prev ? `${prev} · ${userMsg}` : userMsg);
            }
            if (data.done) {
              setStep('done');
            }
          } catch { /* ignore malformed chunk */ }
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        setError('La generación tardó demasiado. Intentá con menos conceptos.');
      } else {
        setError(e instanceof Error ? e.message : 'Error generando imágenes PDP');
      }
      setStep('review');
    } finally {
      clearTimeout(timeout);
    }
  };

  const applyPdpRefinement = async (slotIdx: number) => {
    const input = refineInputs[slotIdx]?.trim();
    const img = pdpImages[slotIdx];
    if (!input || !img) return;
    setRefiningIdx(slotIdx);
    setRefineInputs(prev => { const n = [...prev]; n[slotIdx] = ''; return n; });
    setError('');
    try {
      const compressedProducts = await Promise.all(
        productImages.map(i => compressImage(i.includes(',') ? i.split(',')[1] : i))
      );
      const res = await fetch('/api/adjust-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: img.base64,
          instruction: input,
          productDetailImages: compressedProducts,
          size: '1024x1024',
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { base64, error: apiError } = await res.json();
      if (apiError) throw new Error(apiError);
      setRefineImageHistories(prev => {
        const n = prev.map(h => [...h]);
        n[slotIdx] = [...n[slotIdx], img.base64];
        return n;
      });
      setRefineHistories(prev => {
        const n = prev.map(h => [...h]);
        n[slotIdx] = [...n[slotIdx], input];
        return n;
      });
      setPdpImages(prev => prev.map((p, i) => i === slotIdx && p ? { ...p, base64 } : p));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error aplicando ajuste');
    } finally {
      setRefiningIdx(null);
    }
  };

  const undoPdpRefinement = (slotIdx: number) => {
    const imageHistory = refineImageHistories[slotIdx];
    if (!imageHistory?.length) return;
    const prevBase64 = imageHistory[imageHistory.length - 1];
    setRefineImageHistories(prev => {
      const n = prev.map(h => [...h]);
      n[slotIdx] = n[slotIdx].slice(0, -1);
      return n;
    });
    setRefineHistories(prev => {
      const n = prev.map(h => [...h]);
      n[slotIdx] = n[slotIdx].slice(0, -1);
      return n;
    });
    setPdpImages(prev => prev.map((p, i) => i === slotIdx && p ? { ...p, base64: prevBase64 } : p));
  };

  const reset = () => {
    setStep('brief');
    setBrief('');
    setProductImages([]);
    setReferenceImages([]);
    setPdpImages(Array(6).fill(null));
    setGeneratedCount(0);
    setError('');
    setPlans([]);
    setProductDescription('');
    setRefineOpenIdx(null);
    setRefineInputs(Array(6).fill(''));
    setRefineHistories(Array.from({ length: 6 }, () => []));
    setRefineImageHistories(Array.from({ length: 6 }, () => []));
    setRefiningIdx(null);
  };

  const downloadImage = (img: PdpImage) => {
    const a = document.createElement('a');
    a.href = `data:image/png;base64,${img.base64}`;
    a.download = `${brandKit?.name || 'pdp'}-${img.type}.png`;
    a.click();
  };

  const downloadAll = () => {
    pdpImages.filter(Boolean).forEach(img => img && downloadImage(img));
  };

  const canPlan = !!brandKit && !!brief.trim() && hasApiKey && !planLoading && productImages.length > 0;

  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar active="/pdp" onLogout={handleLogout} />
      <div className="flex-1 md:ml-56 min-h-screen pt-12 md:pt-0">
        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-8">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Imágenes PDP</h1>
              <p className="text-sm text-gray-500">6 imágenes para el carrusel de tu página de producto</p>
            </div>
            {step !== 'brief' && step !== 'review' && (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                {step === 'generating' && (
                  <div className="w-3.5 h-3.5 border-2 border-gray-200 border-t-[#e42820] rounded-full animate-spin" />
                )}
                <span>{step === 'generating' ? `${generatedCount}/6` : `${pdpImages.filter(Boolean).length}/6`}</span>
              </div>
            )}
          </div>

          {/* No brand kit warning */}
          {!kitLoading && !brandKit && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
              Configurá tu marca en{' '}
              <a href="/config" className="font-semibold underline">Mi marca</a>
              {' '}antes de generar imágenes PDP.
            </div>
          )}

          {/* No API key warning */}
          {hasApiKey === false && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
              Configurá tu API key de OpenAI en{' '}
              <a href="/perfil" className="font-semibold underline">Perfil</a>.
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* ── BRIEF STEP ── */}
          {step === 'brief' && (
            <div className="space-y-6">

              {/* Modo de presentación */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">Modo de presentación</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {([
                    {
                      key: 'product' as PdpMode,
                      label: 'Producto',
                      desc: 'Solo el producto en fondos limpios. Sin personas.',
                      icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
                    },
                    {
                      key: 'product-use' as PdpMode,
                      label: 'Producto en uso',
                      desc: 'Lifestyle y how-to con persona usando el producto.',
                      icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
                    },
                    {
                      key: 'fashion' as PdpMode,
                      label: 'Indumentaria',
                      desc: 'La prenda puesta. Hero, benefit y lifestyle con persona.',
                      icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z',
                    },
                  ] as const).map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => setMode(opt.key)}
                      className={`flex flex-col gap-2 p-4 rounded-xl border text-left transition-all ${
                        mode === opt.key
                          ? 'border-[#e42820] bg-[#e42820]/5'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        mode === opt.key ? 'bg-[#e42820]/10' : 'bg-gray-100'
                      }`}>
                        <svg className={`w-3.5 h-3.5 ${mode === opt.key ? 'text-[#e42820]' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={opt.icon} />
                        </svg>
                      </div>
                      <div>
                        <p className={`text-sm font-semibold ${mode === opt.key ? 'text-gray-900' : 'text-gray-600'}`}>{opt.label}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Product images */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">
                  Fotos del producto
                  <span className="text-[#e42820] ml-1">*</span>
                  <span className="font-normal text-gray-400 ml-1">(hasta 3, JPG o PNG)</span>
                </label>
                <p className="text-xs text-gray-400">Requerido. Usá fotos claras del producto — fondo blanco o neutro funciona mejor.</p>
                {mode === 'fashion' && (
                  <div className="flex gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5">
                    <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-xs text-amber-700">
                      <span className="font-semibold">Para indumentaria:</span> subí fotos donde se vean todas las partes de la prenda — frente, espalda y detalles del estampado. Cuanto más completa la vista, mejor el modelo captura colores, corte y print.
                    </p>
                  </div>
                )}
                <div className="flex flex-wrap gap-3">
                  {productImages.map((img, i) => (
                    <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-gray-200 bg-gray-100">
                      <img src={img} alt="" className="w-full h-full object-cover" />
                      <button
                        onClick={() => setProductImages(prev => prev.filter((_, j) => j !== i))}
                        className="absolute top-1 right-1 w-5 h-5 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center"
                      >
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  {productImages.length < 3 && (
                    <label className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 hover:border-[#e42820]/50 bg-white flex flex-col items-center justify-center cursor-pointer transition-colors">
                      <svg className="w-5 h-5 text-gray-300 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                      </svg>
                      <span className="text-[10px] text-gray-300">Foto</span>
                      <input type="file" accept="image/*" multiple onChange={handleProductImageUpload} className="hidden" />
                    </label>
                  )}
                </div>
              </div>

              {/* Person reference images (product-use and fashion modes) */}
              {mode !== 'product' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-semibold text-gray-700">
                      Persona
                    </label>
                    <p className="text-xs text-gray-400 mt-0.5">{mode === 'fashion' ? 'Subí una foto del modelo o describí cómo querés que sea.' : 'Subí una foto de referencia o describí la persona para lifestyle y how-to.'}</p>
                  </div>

                  {/* Photo upload */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-gray-500">Foto de referencia <span className="font-normal text-gray-400">(hasta 2, opcional)</span></p>
                    <div className="flex flex-wrap gap-3">
                      {referenceImages.map((img, i) => (
                        <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-gray-200 bg-gray-100">
                          <img src={img} alt="" className="w-full h-full object-cover" />
                          <button
                            onClick={() => setReferenceImages(prev => prev.filter((_, j) => j !== i))}
                            className="absolute top-1 right-1 w-5 h-5 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center"
                          >
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                      {referenceImages.length < 2 && (
                        <label className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 hover:border-[#e42820]/50 bg-white flex flex-col items-center justify-center cursor-pointer transition-colors">
                          <svg className="w-5 h-5 text-gray-300 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                          </svg>
                          <span className="text-[10px] text-gray-300">Foto</span>
                          <input type="file" accept="image/*" multiple onChange={handleReferenceImageUpload} className="hidden" />
                        </label>
                      )}
                    </div>
                  </div>

                  {/* Text description */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-gray-500">
                      {referenceImages.length > 0 ? 'Descripción adicional (opcional)' : 'O describí la persona'}
                    </p>
                    <textarea
                      value={personDescription}
                      onChange={e => setPersonDescription(e.target.value)}
                      placeholder={mode === 'fashion'
                        ? 'Ej: Mujer 25-35 años, piel morena, cabello oscuro lacio, estilo minimalista'
                        : 'Ej: Hombre 30-40 años, contexto gym, ropa deportiva, piel clara'}
                      rows={2}
                      className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#e42820] resize-none"
                    />
                    {referenceImages.length === 0 && !personDescription.trim() && (
                      <p className="text-[11px] text-amber-500">Sin foto ni descripción la IA generará una persona genérica.</p>
                    )}
                    {referenceImages.length > 0 && personDescription.trim() && (
                      <p className="text-[11px] text-gray-400">La foto se usa como referencia visual, la descripción complementa el prompt.</p>
                    )}
                  </div>
                </div>
              )}

              {/* URL import */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">
                  Importar desde URL
                  <span className="font-normal text-gray-400 ml-1">(opcional)</span>
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="url"
                    value={productUrl}
                    onChange={e => setProductUrl(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && scrapeProduct()}
                    placeholder="https://tienda.com/producto/remera-pima"
                    className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#e42820]"
                  />
                  <button
                    onClick={scrapeProduct}
                    disabled={!productUrl.trim() || scrapingUrl}
                    className="bg-gray-900 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 sm:shrink-0"
                  >
                    {scrapingUrl ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Leyendo...
                      </>
                    ) : 'Leer producto'}
                  </button>
                </div>
                <p className="text-xs text-gray-400">Pegá la URL y la IA extrae la descripción, beneficios y specs automáticamente.</p>
              </div>

              {/* Brief textarea */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">Descripción del producto</label>
                <p className="text-xs text-gray-400">
                  Describí el producto con detalle: ¿qué es? ¿Cuáles son sus 3 beneficios principales? ¿De qué está hecho o qué tecnología usa? ¿Cómo se usa? ¿Tenés reseñas o resultados para mostrar?
                </p>
                <textarea
                  value={brief}
                  onChange={e => setBrief(e.target.value)}
                  placeholder={`Ej: "Remera de algodón pima 100% extra soft. Beneficios: ultra suave al tacto, no encoge, dura muchos lavados. Disponible en 8 colores. Cómo usar: lavado a máquina 30°, no secar en secadora. Reseña: 'La remera más cómoda que tuve en mi vida — @usuario_real ★★★★★'"`}
                  rows={6}
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#e42820] resize-none text-sm leading-relaxed"
                />
              </div>

              {/* What will be generated */}
              <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Se van a generar 6 imágenes</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {PDP_SLOTS.map(slot => (
                    <div key={slot.type} className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#e42820] mt-1.5 shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-gray-700">{slot.label}</p>
                        <p className="text-[11px] text-gray-400">{slot.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Plan button */}
              <button
                onClick={planPdp}
                disabled={!canPlan}
                className="w-full bg-[#e42820] hover:bg-[#c41f18] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-6 py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {planLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Planificando...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    Planificar imágenes PDP
                  </>
                )}
              </button>
            </div>
          )}

          {/* ── REVIEW STEP ── */}
          {step === 'review' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Revisá el copy antes de generar</h2>
                <p className="text-sm text-gray-500">
                  Estos son los textos que aparecerán en cada imagen. Editá lo que necesites — especialmente Authority y Testimonial.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {plans.map((plan, planIdx) => {
                  const dc = plan.display_copy;
                  const isHero = plan.type === 'hero';
                  const isTestimonial = plan.type === 'testimonial';
                  const isLifestyle = plan.type === 'lifestyle';
                  const hasItems = ['benefit', 'authority', 'howto'].includes(plan.type);

                  const typeLabels: Record<string, string> = {
                    hero: '1 · Product Hero',
                    benefit: '2 · Benefit Image',
                    lifestyle: '3 · Lifestyle Image',
                    authority: '4 · Authority Image',
                    howto: '5 · How to Use',
                    testimonial: '6 · Testimonial',
                  };
                  const itemLabels: Record<string, string[]> = {
                    benefit: ['Beneficio 1', 'Beneficio 2', 'Beneficio 3'],
                    authority: ['Spec / material 1', 'Spec / material 2', 'Spec / material 3'],
                    howto: ['Paso 1', 'Paso 2', 'Paso 3'],
                  };

                  return (
                    <div key={plan.type} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                        {typeLabels[plan.type] || plan.label}
                      </p>

                      {isHero && (
                        <div className="flex items-center gap-2 text-xs text-gray-400 py-1">
                          <svg className="w-3.5 h-3.5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Solo producto, sin texto en la imagen.
                        </div>
                      )}

                      {hasItems && (
                        <div className="space-y-2">
                          {[0, 1, 2].map((itemIdx) => (
                            <div key={itemIdx} className="flex items-center gap-2">
                              <span className="text-xs text-gray-400 w-4 shrink-0">{itemIdx + 1}.</span>
                              <input
                                value={dc?.items?.[itemIdx] || ''}
                                onChange={e => updatePlanItem(planIdx, itemIdx, e.target.value)}
                                placeholder={itemLabels[plan.type]?.[itemIdx] || `Item ${itemIdx + 1}`}
                                className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#e42820]"
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {isLifestyle && (
                        <div className="space-y-1.5">
                          <p className="text-xs text-gray-400">Tagline aspiracional</p>
                          <input
                            value={dc?.tagline || ''}
                            onChange={e => updatePlanCopy(planIdx, { tagline: e.target.value })}
                            placeholder="Ej: Entrená sin límites."
                            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#e42820]"
                          />
                        </div>
                      )}

                      {isTestimonial && (
                        <div className="space-y-2">
                          <div className="space-y-1.5">
                            <p className="text-xs font-medium text-gray-500">Reseña</p>
                            <textarea
                              value={dc?.quote || ''}
                              onChange={e => updatePlanCopy(planIdx, { quote: e.target.value })}
                              placeholder="Ej: La mejor compra que hice. Se nota la calidad desde el primer uso."
                              rows={2}
                              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#e42820] resize-none"
                            />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <p className="text-xs text-gray-400">Autor</p>
                              <input
                                value={dc?.author || ''}
                                onChange={e => updatePlanCopy(planIdx, { author: e.target.value })}
                                placeholder="María G."
                                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#e42820]"
                              />
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs text-gray-400">Rating</p>
                              <input
                                value={dc?.rating || ''}
                                onChange={e => updatePlanCopy(planIdx, { rating: e.target.value })}
                                placeholder="★★★★★"
                                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#e42820]"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setStep('brief')}
                  className="text-sm text-gray-700 hover:text-gray-900 border border-gray-300 hover:border-gray-400 px-5 py-3 rounded-xl transition-colors"
                >
                  Volver
                </button>
                <button
                  onClick={generateFromPlans}
                  className="flex-1 bg-[#e42820] hover:bg-[#c41f18] text-white font-semibold px-6 py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Confirmar y generar 6 imágenes
                </button>
              </div>
            </div>
          )}

          {/* ── GENERATING / DONE STEP ── */}
          {(step === 'generating' || step === 'done') && (
            <div className="space-y-6">
              {/* Status bar while generating */}
              {step === 'generating' && (
                <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3">
                  <div className="w-4 h-4 border-2 border-gray-200 border-t-[#e42820] rounded-full animate-spin shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700">{APPLY_MESSAGES[msgIdx]}</p>
                    <div className="mt-1.5 h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#e42820] rounded-full transition-all duration-500"
                        style={{ width: `${(generatedCount / 6) * 100}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-sm text-gray-400 shrink-0">{generatedCount}/6</span>
                </div>
              )}

              {/* Done header */}
              {step === 'done' && (
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">¡Listo! 6 imágenes PDP generadas</h2>
                    <p className="text-sm text-gray-500">Formato cuadrado 1:1</p>
                  </div>
                  <button
                    onClick={reset}
                    className="text-sm text-gray-700 hover:text-gray-900 border border-gray-300 hover:border-gray-400 px-4 py-2 rounded-xl transition-colors"
                  >
                    Nuevo PDP
                  </button>
                </div>
              )}

              {/* 6 image grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {PDP_SLOTS.map((slot, i) => {
                  const img = pdpImages[i];
                  const isRefining = refiningIdx === i;
                  const isOpen = refineOpenIdx === i;
                  return (
                    <div key={slot.type} className="space-y-2">
                      <div className={`aspect-square rounded-xl overflow-hidden border bg-gray-100 relative transition-all ${isOpen ? 'border-[#e42820] ring-2 ring-[#e42820]/20' : 'border-gray-200'}`}>
                        {img ? (
                          <img
                            src={`data:image/png;base64,${img.base64}`}
                            alt={slot.label}
                            className={`w-full h-full object-cover transition-all duration-300 ${isRefining ? 'blur-sm' : ''}`}
                          />
                        ) : (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                            <div className="w-5 h-5 border-2 border-gray-200 border-t-[#e42820] rounded-full animate-spin" />
                            <p className="text-xs text-gray-400">Generando...</p>
                          </div>
                        )}
                        {isRefining && (
                          <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                            <div className="w-6 h-6 border-2 border-[#e42820] border-t-transparent rounded-full animate-spin" />
                          </div>
                        )}
                      </div>

                      <div>
                        <p className="text-xs font-semibold text-gray-700">{slot.label}</p>
                        <p className="text-[11px] text-gray-400">{slot.desc}</p>
                      </div>

                      {img && step === 'done' && (
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => downloadImage(img)}
                            className="flex-1 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 hover:text-gray-900 text-xs px-2 py-2 rounded-lg transition-colors flex items-center justify-center gap-1"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Descargar
                          </button>
                          <button
                            onClick={() => setRefineOpenIdx(isOpen ? null : i)}
                            className={`flex-1 border text-xs px-2 py-2 rounded-lg transition-colors flex items-center justify-center gap-1 ${isOpen ? 'bg-[#e42820]/10 border-[#e42820]/30 text-[#e42820]' : 'bg-white hover:bg-gray-50 border-gray-200 text-gray-700'}`}
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Afinar
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Inline refinement panel */}
              {refineOpenIdx !== null && pdpImages[refineOpenIdx] && step === 'done' && (() => {
                const slotIdx = refineOpenIdx;
                const img = pdpImages[slotIdx]!;
                const slot = PDP_SLOTS[slotIdx];
                const isBusy = refiningIdx === slotIdx;
                const history = refineHistories[slotIdx] || [];
                const imageHistory = refineImageHistories[slotIdx] || [];
                const input = refineInputs[slotIdx] || '';
                const pdpPresets = ['Fondo más oscuro', 'Fondo blanco limpio', 'Más contraste', 'Iluminación más suave', 'Colores más vibrantes', 'Producto más grande'];
                const allPresets = [...(brandKit?.quickAdjustments || []), ...pdpPresets];
                const clientPresetCount = brandKit?.quickAdjustments?.length || 0;
                return (
                  <div className="bg-white border border-[#e42820]/30 rounded-2xl overflow-hidden">
                    <div className="flex flex-col md:flex-row">
                      {/* Image preview */}
                      <div className="relative md:w-48 shrink-0">
                        <img
                          src={`data:image/png;base64,${img.base64}`}
                          alt={slot.label}
                          className={`w-full h-full object-cover transition-all duration-300 ${isBusy ? 'blur-sm' : ''}`}
                          style={{ maxHeight: '260px' }}
                        />
                        {isBusy && (
                          <div className="absolute inset-0 bg-white/70 flex flex-col items-center justify-center gap-2">
                            <div className="w-7 h-7 border-[3px] border-[#e42820] border-t-transparent rounded-full animate-spin" />
                            <p className="text-xs text-gray-600 font-medium">Aplicando...</p>
                          </div>
                        )}
                      </div>

                      {/* Controls */}
                      <div className="flex-1 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="font-semibold text-gray-900 text-sm">{slot.label}</p>
                          <button
                            onClick={() => setRefineOpenIdx(null)}
                            className="text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>

                        {history.length > 0 && (
                          <div className="space-y-1 max-h-14 overflow-y-auto">
                            {history.map((h, j) => (
                              <div key={j} className="bg-gray-50 rounded-lg px-3 py-1 text-xs text-gray-500 flex items-center gap-1.5">
                                <span className="text-[#e42820]">✓</span>{h}
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="space-y-1.5">
                          <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Ajustes rápidos</p>
                          <div className="flex flex-wrap gap-1.5">
                            {allPresets.map((preset, j) => {
                              const isClientPreset = j < clientPresetCount;
                              return (
                                <button
                                  key={`${preset}-${j}`}
                                  onClick={() => { if (!isBusy) setRefineInputs(prev => { const n = [...prev]; n[slotIdx] = preset; return n; }); }}
                                  disabled={isBusy}
                                  className={`text-xs px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-40 ${isClientPreset ? 'bg-[#e42820]/10 border-[#e42820]/30 text-[#e42820] hover:bg-[#e42820]/20' : 'bg-white hover:bg-gray-100 border-gray-200 text-gray-500 hover:text-gray-900'}`}
                                >
                                  {preset}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="text"
                            value={input}
                            onChange={e => { if (!isBusy) setRefineInputs(prev => { const n = [...prev]; n[slotIdx] = e.target.value; return n; }); }}
                            onKeyDown={e => { if (e.key === 'Enter' && !isBusy && input.trim()) applyPdpRefinement(slotIdx); }}
                            placeholder="O escribí tu ajuste..."
                            disabled={isBusy}
                            className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#e42820] text-sm disabled:opacity-50"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => applyPdpRefinement(slotIdx)}
                              disabled={!input.trim() || isBusy}
                              className="flex-1 sm:flex-none bg-[#e42820] hover:bg-[#c41f18] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-4 py-2.5 rounded-xl transition-colors text-sm"
                            >
                              {isBusy ? 'Aplicando...' : 'Aplicar'}
                            </button>
                            {imageHistory.length > 0 && (
                              <button
                                onClick={() => undoPdpRefinement(slotIdx)}
                                disabled={isBusy}
                                className="bg-white hover:bg-gray-100 border border-gray-200 disabled:opacity-40 text-gray-500 hover:text-gray-900 px-3 py-2.5 rounded-xl transition-colors"
                                title="Deshacer"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Download all */}
              {step === 'done' && (
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={downloadAll}
                    className="bg-[#e42820] hover:bg-[#c41f18] text-white font-semibold px-6 py-3 rounded-xl transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Descargar todas ({pdpImages.filter(Boolean).length})
                  </button>
                  <button
                    onClick={reset}
                    className="text-gray-700 hover:text-gray-900 border border-gray-300 hover:border-gray-400 px-5 py-3 rounded-xl text-sm transition-colors"
                  >
                    Nuevo PDP
                  </button>
                </div>
              )}
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
