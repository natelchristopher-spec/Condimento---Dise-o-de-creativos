'use client';

import { useState, useEffect } from 'react';
import { createSupabaseBrowser } from '@/app/lib/supabase-browser';
import { useRequireAuth } from '@/app/lib/use-auth';
import { BrandKit } from '@/app/types';
import Sidebar from '@/app/components/Sidebar';

type PdpStep = 'brief' | 'review' | 'generating' | 'done';
type PdpMode = 'product' | 'fashion';

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
  const [step, setStep] = useState<PdpStep>('brief');
  const [mode, setMode] = useState<PdpMode>('product');
  const [brief, setBrief] = useState('');
  const [productImages, setProductImages] = useState<string[]>([]);
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [pdpImages, setPdpImages] = useState<(PdpImage | null)[]>(Array(6).fill(null));
  const [generatedCount, setGeneratedCount] = useState(0);
  const [error, setError] = useState('');
  const [msgIdx, setMsgIdx] = useState(0);
  const [planLoading, setPlanLoading] = useState(false);
  const [plans, setPlans] = useState<PdpPlan[]>([]);
  const [productDescription, setProductDescription] = useState('');

  useEffect(() => {
    fetch('/api/brand-kits').then(r => r.json()).then(kit => {
      if (kit && !kit.error) setBrandKit(kit);
    }).catch(console.error);
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

  const compressToJpeg = (base64: string, maxDim = 1024, quality = 0.82): Promise<string> =>
    new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        let { naturalWidth: w, naturalHeight: h } = img;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
          else { w = Math.round(w * maxDim / h); h = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality).split(',')[1]);
      };
      img.onerror = () => resolve(base64);
      img.src = base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`;
    });

  const readAsDataUrl = (file: File): Promise<string> =>
    new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const imgEl = new Image();
        imgEl.onload = () => {
          const MAX = 1024;
          let { naturalWidth: w, naturalHeight: h } = imgEl;
          if (w > MAX || h > MAX) {
            if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
            else { w = Math.round(w * MAX / h); h = MAX; }
          }
          try {
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d')!.drawImage(imgEl, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.85));
          } catch { resolve(dataUrl); }
        };
        imgEl.onerror = () => resolve(dataUrl);
        imgEl.src = dataUrl;
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });

  const handleProductImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const slots = 3 - productImages.length;
    const imgs = await Promise.all(files.slice(0, slots).map(readAsDataUrl));
    setProductImages(prev => [...prev, ...imgs].slice(0, 3));
    e.target.value = '';
  };

  const handleReferenceImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const slots = 2 - referenceImages.length;
    const imgs = await Promise.all(files.slice(0, slots).map(readAsDataUrl));
    setReferenceImages(prev => [...prev, ...imgs].slice(0, 2));
    e.target.value = '';
  };

  const planPdp = async () => {
    if (!brandKit || !brief.trim()) return;
    setPlanLoading(true);
    setError('');

    try {
      const compressedProducts = await Promise.all(
        productImages.map(img => compressToJpeg(img.includes(',') ? img.split(',')[1] : img))
      );
      const compressedRefs = await Promise.all(
        referenceImages.map(img => compressToJpeg(img.includes(',') ? img.split(',')[1] : img))
      );

      const res = await fetch('/api/plan-pdp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief,
          brandKit,
          peopleMode: mode === 'fashion' ? 'real' : 'none',
          productImages: compressedProducts,
          referenceImages: compressedRefs,
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

    try {
      const compressedProducts = await Promise.all(
        productImages.map(img => compressToJpeg(img.includes(',') ? img.split(',')[1] : img))
      );
      const compressedRefs = await Promise.all(
        referenceImages.map(img => compressToJpeg(img.includes(',') ? img.split(',')[1] : img))
      );

      const res = await fetch('/api/generate-pdp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief,
          brandKit,
          peopleMode: mode === 'fashion' ? 'real' : 'none',
          productImages: compressedProducts,
          referenceImages: compressedRefs,
          plans,
          productDescription,
        }),
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
              setError(prev => prev ? `${prev} · ${data.error}` : data.error);
            }
            if (data.done) {
              setStep('done');
            }
          } catch { /* ignore malformed chunk */ }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error generando imágenes PDP');
      setStep('review');
    }
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

  const canPlan = !!brandKit && !!brief.trim() && hasApiKey && !planLoading;

  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar active="/pdp" onLogout={handleLogout} />
      <div className="flex-1 md:ml-56 min-h-screen pt-12 md:pt-0">
        <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Imágenes PDP</h1>
              <p className="text-sm text-gray-500">6 imágenes para el carrusel de tu página de producto · Shopify / Tienda Nube</p>
            </div>
            {step !== 'brief' && step !== 'review' && (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                {step === 'generating' && (
                  <div className="w-3.5 h-3.5 border-2 border-gray-200 border-t-[#e42820] rounded-full animate-spin" />
                )}
                <span>{step === 'generating' ? `${generatedCount}/6` : '6/6'}</span>
              </div>
            )}
          </div>

          {/* No brand kit warning */}
          {!brandKit && (
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

              {/* Mode selector */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">Tipo de contenido</label>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    {
                      key: 'product' as PdpMode,
                      label: 'Solo producto',
                      desc: 'Sin personas. Foco total en el producto.',
                      icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
                    },
                    {
                      key: 'fashion' as PdpMode,
                      label: 'Fashion / persona',
                      desc: 'Incluye personas usando el producto.',
                      icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
                    },
                  ] as const).map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => setMode(opt.key)}
                      className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${
                        mode === opt.key
                          ? 'border-[#e42820] bg-[#e42820]/5'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
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
                  <span className="font-normal text-gray-400 ml-1">(hasta 3)</span>
                </label>
                <p className="text-xs text-gray-400">Usá fotos claras del producto — fondo blanco o neutro funciona mejor.</p>
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

              {/* Person reference images (fashion mode) */}
              {mode === 'fashion' && (
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700">
                    Fotos de referencia de persona
                    <span className="font-normal text-gray-400 ml-1">(hasta 2, opcional)</span>
                  </label>
                  <p className="text-xs text-gray-400">Si tenés modelos o personas que querés usar de referencia de estilo.</p>
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
              )}

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

                      {hasItems && dc?.items && (
                        <div className="space-y-2">
                          {dc.items.map((item, itemIdx) => (
                            <div key={itemIdx} className="flex items-center gap-2">
                              <span className="text-xs text-gray-400 w-4 shrink-0">{itemIdx + 1}.</span>
                              <input
                                value={item}
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
                          <p className="text-xs text-gray-400">Tagline aspiracional <span className="text-gray-300">(opcional)</span></p>
                          <input
                            value={dc?.tagline || ''}
                            onChange={e => updatePlanCopy(planIdx, { tagline: e.target.value })}
                            placeholder="Ej: Cada detalle, pensado para vos."
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
                          <div className="grid grid-cols-2 gap-2">
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
                  className="text-sm text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300 px-5 py-3 rounded-xl transition-colors"
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
                    <p className="text-sm text-gray-500">Formato cuadrado 1:1 · Shopify / Tienda Nube</p>
                  </div>
                  <button
                    onClick={reset}
                    className="text-sm text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300 px-4 py-2 rounded-xl transition-colors"
                  >
                    Nuevo PDP
                  </button>
                </div>
              )}

              {/* 6 image grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {PDP_SLOTS.map((slot, i) => {
                  const img = pdpImages[i];
                  return (
                    <div key={slot.type} className="space-y-2">
                      <div className="aspect-square rounded-xl overflow-hidden border border-gray-200 bg-gray-100 relative">
                        {img ? (
                          <img
                            src={`data:image/png;base64,${img.base64}`}
                            alt={slot.label}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                            <div className="w-5 h-5 border-2 border-gray-200 border-t-[#e42820] rounded-full animate-spin" />
                            <p className="text-xs text-gray-400">Generando...</p>
                          </div>
                        )}
                      </div>

                      <div>
                        <p className="text-xs font-semibold text-gray-700">{slot.label}</p>
                        <p className="text-[11px] text-gray-400">{slot.desc}</p>
                      </div>

                      {img && step === 'done' && (
                        <button
                          onClick={() => downloadImage(img)}
                          className="w-full bg-white hover:bg-gray-50 border border-gray-200 text-gray-500 hover:text-gray-900 text-xs px-3 py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          Descargar
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

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
                    Descargar todas (6)
                  </button>
                  <button
                    onClick={reset}
                    className="text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300 px-5 py-3 rounded-xl text-sm transition-colors"
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
