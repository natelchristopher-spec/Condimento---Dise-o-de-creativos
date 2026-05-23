'use client';

import { useState, useEffect } from 'react';
import { createSupabaseBrowser } from '@/app/lib/supabase-browser';
import { useRequireAuth } from '@/app/lib/use-auth';
import { BrandKit } from '@/app/types';
import Sidebar from '@/app/components/Sidebar';

type CarouselStep = 'brief' | 'topics' | 'plan' | 'generating' | 'done';
type FunnelStage = 'TOFU' | 'MOFU' | 'BOFU';

interface CarouselTopic {
  funnel: FunnelStage;
  title: string;
  hook: string;
  why: string;
}

interface CarouselSlide {
  index: number;
  role: 'hook' | 'value' | 'cta';
  title?: string;
  subtitle?: string | null;
  items?: string[];
  cta?: string;
  image_direction: string;
}

interface GeneratedSlide {
  id: string;
  index: number;
  role: string;
  base64: string;
}

const FUNNEL_LABELS: Record<FunnelStage, { label: string; desc: string; color: string }> = {
  TOFU: { label: 'Awareness', desc: 'Atraer nuevas personas', color: 'bg-blue-50 border-blue-200 text-blue-700' },
  MOFU: { label: 'Consideración', desc: 'Convencer indecisos', color: 'bg-amber-50 border-amber-200 text-amber-700' },
  BOFU: { label: 'Conversión', desc: 'Cerrar la venta', color: 'bg-green-50 border-green-200 text-green-700' },
};

const GENERATING_MESSAGES = [
  'Diseñando composición...',
  'Aplicando colores de marca...',
  'Generando tipografía...',
  'Finalizando slides...',
];

export default function RedesPage() {
  useRequireAuth();
  const supabase = createSupabaseBrowser();

  const [brandKit, setBrandKit] = useState<BrandKit | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [step, setStep] = useState<CarouselStep>('brief');
  const [topicHint, setTopicHint] = useState('');
  const [productImages, setProductImages] = useState<string[]>([]);
  const [topics, setTopics] = useState<CarouselTopic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<CarouselTopic | null>(null);
  const [slides, setSlides] = useState<CarouselSlide[]>([]);
  const [generatedSlides, setGeneratedSlides] = useState<(GeneratedSlide | null)[]>([null, null, null]);
  const [generatedCount, setGeneratedCount] = useState(0);
  const [postCopy, setPostCopy] = useState<{ caption: string; hashtags: string } | null>(null);
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [copiedHashtags, setCopiedHashtags] = useState(false);
  const [error, setError] = useState('');
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [msgIdx, setMsgIdx] = useState(0);
  const [planCache, setPlanCache] = useState<Record<string, { slides: CarouselSlide[]; post_copy: { caption: string; hashtags: string } | null }>>({});

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
    const id = setInterval(() => setMsgIdx(i => (i + 1) % GENERATING_MESSAGES.length), 3000);
    return () => clearInterval(id);
  }, [step]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const readAsDataUrl = (file: File): Promise<string> =>
    new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const img = new Image();
        img.onload = () => {
          const MAX = 1024;
          let { naturalWidth: w, naturalHeight: h } = img;
          if (w > MAX || h > MAX) {
            if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
            else { w = Math.round(w * MAX / h); h = MAX; }
          }
          try {
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.85));
          } catch { resolve(dataUrl); }
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });

  const handleProductImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const imgs = await Promise.all(files.slice(0, 1).map(readAsDataUrl));
    setProductImages(imgs.filter(Boolean));
    e.target.value = '';
  };

  const suggestTopics = async () => {
    if (!brandKit) return;
    setLoadingTopics(true);
    setError('');
    try {
      const res = await fetch('/api/research-carousel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandKit, topicHint }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error generando temas');
      setTopics(data.topics || []);
      setStep('topics');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error generando temas');
    } finally {
      setLoadingTopics(false);
    }
  };

  const selectTopic = async (topic: CarouselTopic) => {
    setSelectedTopic(topic);
    setError('');
    setStep('plan');

    // Use cached plan if available — avoids redundant API call and instant UX
    if (planCache[topic.title]) {
      setSlides(planCache[topic.title].slides);
      setPostCopy(planCache[topic.title].post_copy);
      return;
    }

    setLoadingPlan(true);
    try {
      const res = await fetch('/api/plan-carousel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandKit, title: topic.title, hook: topic.hook, funnel: topic.funnel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error planificando carousel');
      const slides = data.slides || [];
      const post_copy = data.post_copy || null;
      setSlides(slides);
      setPostCopy(post_copy);
      setPlanCache(prev => ({ ...prev, [topic.title]: { slides, post_copy } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error planificando carousel');
      setStep('topics');
    } finally {
      setLoadingPlan(false);
    }
  };

  const updateSlideField = (index: number, field: string, value: string) => {
    setSlides(prev => prev.map(s => s.index === index ? { ...s, [field]: value } : s));
  };

  const updateSlideItem = (slideIndex: number, itemIndex: number, value: string) => {
    setSlides(prev => prev.map(s => {
      if (s.index !== slideIndex) return s;
      const items = [...(s.items || [])];
      items[itemIndex] = value;
      return { ...s, items };
    }));
  };

  const generateCarousel = async () => {
    if (!brandKit || slides.length === 0) return;
    setGeneratedSlides([null, null, null]);
    setGeneratedCount(0);
    setError('');
    setMsgIdx(0);
    setStep('generating');

    try {
      const compressedProducts = productImages.map(img => img.includes(',') ? img.split(',')[1] : img);
      const res = await fetch('/api/generate-carousel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandKit,
          slides,
          productImages: compressedProducts,
          funnel: selectedTopic?.funnel || 'TOFU',
        }),
      });

      if (!res.ok) throw new Error(await res.text());

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      const generated: (GeneratedSlide | null)[] = [null, null, null];

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
            if (data.slide) {
              const idx = data.slide.index - 1;
              if (idx >= 0 && idx < 3) {
                generated[idx] = data.slide;
                setGeneratedSlides([...generated]);
                setGeneratedCount(generated.filter(Boolean).length);
              }
            }
            if (data.error) setError(prev => prev ? `${prev} · ${data.error}` : data.error);
            if (data.done) setStep('done');
          } catch { /* ignore malformed chunk */ }
        }
      }
      // Ensure we exit generating state even if server closed without sending done
      setStep('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error generando carousel');
      setStep('plan');
    }
  };

  const downloadSlide = (slide: GeneratedSlide) => {
    const a = document.createElement('a');
    a.href = `data:image/png;base64,${slide.base64}`;
    a.download = `${brandKit?.name || 'carousel'}-slide-${slide.index}.png`;
    a.click();
  };

  const reset = () => {
    setStep('brief');
    setTopicHint('');
    setTopics([]);
    setSelectedTopic(null);
    setSlides([]);
    setGeneratedSlides([null, null, null]);
    setGeneratedCount(0);
    setPostCopy(null);
    setCopiedCaption(false);
    setCopiedHashtags(false);
    setError('');
    setPlanCache({});
  };

  const canSuggest = !!brandKit && !!hasApiKey && !loadingTopics;

  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar active="/redes" onLogout={handleLogout} />
      <div className="flex-1 md:ml-56 min-h-screen pt-12 md:pt-0">
        <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Carruseles IG</h1>
              <p className="text-sm text-gray-500">3 slides por carrusel · Contenido orgánico para Instagram</p>
            </div>
            {(step === 'generating' || step === 'done') && (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                {step === 'generating' && <div className="w-3.5 h-3.5 border-2 border-gray-200 border-t-[#e42820] rounded-full animate-spin" />}
                <span>{generatedCount}/3</span>
              </div>
            )}
          </div>

          {/* Warnings */}
          {!brandKit && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
              Configurá tu marca en <a href="/config" className="font-semibold underline">Mi marca</a> antes de continuar.
            </div>
          )}
          {brandKit && !brandKit.clientRequest && step === 'brief' && (
            <div className="flex gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-amber-700">
                Tu marca no tiene descripción de negocio. Los temas sugeridos serán más genéricos.{' '}
                <a href="/config" className="font-semibold underline">Completá "¿Qué vendés y a quién?"</a>{' '}
                en Mi Marca para mejores resultados.
              </p>
            </div>
          )}
          {hasApiKey === false && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
              Configurá tu API key de OpenAI en <a href="/perfil" className="font-semibold underline">Perfil</a>.
            </div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          {/* ── BRIEF STEP ── */}
          {step === 'brief' && (
            <div className="space-y-6">
              <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700">¿Sobre qué querés hablar? <span className="font-normal text-gray-400">(opcional)</span></label>
                  <p className="text-xs text-gray-400">Si dejás todo vacío, la IA analiza tu marca, detecta tendencias del mercado y propone ideas orgánicas adaptadas a tu nicho. O escribí un tema y filtrá las ideas en esa dirección.</p>
                  <input
                    value={topicHint}
                    onChange={e => setTopicHint(e.target.value)}
                    placeholder='Ej: "lanzamiento de nueva colección", "beneficios de la proteína", "skincare para verano"'
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#e42820]"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700">Foto del producto <span className="font-normal text-gray-400">(opcional)</span></label>
                  <p className="text-xs text-gray-400">Si el carousel va a mostrar el producto, subí una foto para que aparezca en las imágenes.</p>
                  <div className="flex gap-3 flex-wrap">
                    {productImages.map((img, i) => (
                      <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-gray-200">
                        <img src={img} alt="" className="w-full h-full object-cover" />
                        <button onClick={() => setProductImages([])} className="absolute top-1 right-1 w-5 h-5 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center">
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ))}
                    {productImages.length === 0 && (
                      <label className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 hover:border-[#e42820]/50 bg-white flex flex-col items-center justify-center cursor-pointer transition-colors">
                        <svg className="w-5 h-5 text-gray-300 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" /></svg>
                        <span className="text-[10px] text-gray-300">Foto</span>
                        <input type="file" accept="image/*" onChange={handleProductImageUpload} className="hidden" />
                      </label>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Cómo funciona</p>
                <div className="space-y-2">
                  {[
                    { n: '1', t: 'Sugerí temas', d: 'La IA propone 9 ideas de carruseles organizadas por etapa del funnel' },
                    { n: '2', t: 'Elegí uno', d: 'Seleccionás el tema que más te interese' },
                    { n: '3', t: 'Revisá el copy', d: 'Ves el texto exacto de cada slide antes de generar' },
                    { n: '4', t: 'Generá', d: '3 imágenes listas para publicar en Instagram' },
                  ].map(({ n, t, d }) => (
                    <div key={n} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-[#e42820]/10 text-[#e42820] text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{n}</div>
                      <div><p className="text-xs font-medium text-gray-700">{t}</p><p className="text-[11px] text-gray-400">{d}</p></div>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={suggestTopics}
                disabled={!canSuggest}
                className="w-full bg-[#e42820] hover:bg-[#c41f18] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-6 py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {loadingTopics ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Generando ideas...</>
                ) : (
                  <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>Sugerir temas</>
                )}
              </button>
            </div>
          )}

          {/* ── TOPICS STEP ── */}
          {step === 'topics' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Elegí un tema</h2>
                  <p className="text-sm text-gray-500">9 ideas organizadas por etapa del funnel. Hacé clic para planificar el carousel.</p>
                </div>
                <button onClick={() => setStep('brief')} className="text-sm text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300 px-4 py-2 rounded-xl transition-colors">Volver</button>
              </div>

              {(['TOFU', 'MOFU', 'BOFU'] as FunnelStage[]).map(stage => {
                const stageTopics = topics.filter(t => t.funnel === stage);
                const { label, desc, color } = FUNNEL_LABELS[stage];
                return (
                  <div key={stage} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${color}`}>{stage}</span>
                      <span className="text-xs text-gray-500">{label} — {desc}</span>
                    </div>
                    <div className="space-y-2">
                      {stageTopics.map((topic, i) => (
                        <button
                          key={i}
                          onClick={() => selectTopic(topic)}
                          disabled={loadingPlan}
                          className="w-full text-left bg-white border border-gray-200 hover:border-[#e42820]/40 hover:bg-[#e42820]/[0.02] rounded-xl p-4 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-900 group-hover:text-[#e42820] transition-colors">{topic.title}</p>
                              <p className="text-xs text-gray-500 mt-0.5 italic">&ldquo;{topic.hook}&rdquo;</p>
                              <p className="text-xs text-gray-400 mt-1">{topic.why}</p>
                            </div>
                            <svg className="w-4 h-4 text-gray-300 group-hover:text-[#e42820] shrink-0 mt-0.5 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── PLAN STEP ── */}
          {step === 'plan' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Revisá el copy</h2>
                  <p className="text-sm text-gray-500">Editá el texto de cada slide antes de generar. Lo que ves acá es lo que va a aparecer en la imagen.</p>
                </div>
                <button onClick={() => setStep('topics')} className="text-sm text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300 px-4 py-2 rounded-xl transition-colors">Volver</button>
              </div>

              {selectedTopic && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${FUNNEL_LABELS[selectedTopic.funnel].color}`}>{selectedTopic.funnel}</span>
                  <span className="text-sm font-semibold text-gray-700">{selectedTopic.title}</span>
                </div>
              )}

              {loadingPlan ? (
                <div className="bg-white border border-gray-200 rounded-xl p-8 flex items-center justify-center gap-3">
                  <div className="w-4 h-4 border-2 border-gray-200 border-t-[#e42820] rounded-full animate-spin" />
                  <span className="text-sm text-gray-500">Planificando slides...</span>
                </div>
              ) : (
                <div className="space-y-4">
                  {slides.map((slide) => (
                    <div key={slide.index} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-[#e42820]/10 text-[#e42820] text-xs font-bold flex items-center justify-center shrink-0">{slide.index}</div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                          {slide.role === 'hook' ? 'Hook — Captura la atención' : slide.role === 'value' ? 'Valor — El contenido' : 'Cierre — CTA'}
                        </p>
                      </div>

                      {slide.role === 'hook' && (
                        <div className="space-y-2">
                          <div className="space-y-1">
                            <p className="text-xs text-gray-400">Título</p>
                            <input value={slide.title || ''} onChange={e => updateSlideField(slide.index, 'title', e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#e42820]" />
                          </div>
                          {slide.subtitle !== null && (
                            <div className="space-y-1">
                              <p className="text-xs text-gray-400">Subtítulo <span className="text-gray-300">(opcional)</span></p>
                              <input value={slide.subtitle || ''} onChange={e => updateSlideField(slide.index, 'subtitle', e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#e42820]" placeholder="Dejar vacío para omitir" />
                            </div>
                          )}
                        </div>
                      )}

                      {slide.role === 'value' && (
                        <div className="space-y-2">
                          {[0, 1, 2].map(i => (
                            <div key={i} className="flex items-center gap-2">
                              <span className="text-xs text-gray-400 w-4 shrink-0">{i + 1}.</span>
                              <input value={slide.items?.[i] || ''} onChange={e => updateSlideItem(slide.index, i, e.target.value)} placeholder={`Item ${i + 1}`} className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#e42820]" />
                            </div>
                          ))}
                        </div>
                      )}

                      {slide.role === 'cta' && (
                        <div className="space-y-2">
                          <div className="space-y-1">
                            <p className="text-xs text-gray-400">Texto principal</p>
                            <input value={slide.title || ''} onChange={e => updateSlideField(slide.index, 'title', e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#e42820]" />
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs text-gray-400">CTA</p>
                            <input value={slide.cta || ''} onChange={e => updateSlideField(slide.index, 'cta', e.target.value)} placeholder="Ej: Seguinos, Ver más" className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#e42820]" />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {!loadingPlan && slides.length > 0 && (
                <button
                  onClick={generateCarousel}
                  className="w-full bg-[#e42820] hover:bg-[#c41f18] text-white font-semibold px-6 py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  Confirmar y generar 3 slides
                </button>
              )}
            </div>
          )}

          {/* ── GENERATING / DONE ── */}
          {(step === 'generating' || step === 'done') && (
            <div className="space-y-6">
              {step === 'generating' && (
                <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3">
                  <div className="w-4 h-4 border-2 border-gray-200 border-t-[#e42820] rounded-full animate-spin shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700">{GENERATING_MESSAGES[msgIdx]}</p>
                    <div className="mt-1.5 h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-[#e42820] rounded-full transition-all duration-500" style={{ width: `${(generatedCount / 3) * 100}%` }} />
                    </div>
                  </div>
                  <span className="text-sm text-gray-400 shrink-0">{generatedCount}/3</span>
                </div>
              )}

              {step === 'done' && (
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Carrusel generado</h2>
                    <p className="text-sm text-gray-500">3 slides · Formato 4:5 · Instagram feed</p>
                  </div>
                  <button onClick={reset} className="text-sm text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300 px-4 py-2 rounded-xl transition-colors">Nuevo carrusel</button>
                </div>
              )}

              <div className="grid grid-cols-3 gap-4">
                {[0, 1, 2].map(i => {
                  const slide = generatedSlides[i];
                  const labels = ['Hook', 'Valor', 'Cierre'];
                  return (
                    <div key={i} className="space-y-2">
                      <div className="aspect-[4/5] rounded-xl overflow-hidden border border-gray-200 bg-gray-100 relative">
                        {slide ? (
                          <img src={`data:image/png;base64,${slide.base64}`} alt={labels[i]} className="w-full h-full object-cover" />
                        ) : step === 'done' ? (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
                            <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <p className="text-xs text-gray-400">No se pudo generar</p>
                          </div>
                        ) : (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                            <div className="w-5 h-5 border-2 border-gray-200 border-t-[#e42820] rounded-full animate-spin" />
                            <p className="text-xs text-gray-400">Generando...</p>
                          </div>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-gray-600 text-center">{i + 1} · {labels[i]}</p>
                      {slide && step === 'done' && (
                        <button onClick={() => downloadSlide(slide)} className="w-full bg-white hover:bg-gray-50 border border-gray-200 text-gray-500 hover:text-gray-900 text-xs px-3 py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                          Descargar
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {step === 'done' && (
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => generatedSlides.filter(Boolean).forEach(s => s && downloadSlide(s))}
                    className="bg-[#e42820] hover:bg-[#c41f18] text-white font-semibold px-6 py-3 rounded-xl transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Descargar los 3
                  </button>
                  <button onClick={reset} className="text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300 px-5 py-3 rounded-xl text-sm transition-colors">Nuevo carrusel</button>
                </div>
              )}

              {step === 'done' && postCopy && (
                <div className="border border-gray-200 rounded-xl overflow-hidden mt-2">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-700">Copy del post</h3>
                    <p className="text-xs text-gray-400 mt-0.5">Listo para pegar en Instagram</p>
                  </div>
                  <div className="p-4 space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Caption</span>
                        <button
                          onClick={() => { navigator.clipboard.writeText(postCopy.caption); setCopiedCaption(true); setTimeout(() => setCopiedCaption(false), 2000); }}
                          className="text-xs text-[#e42820] hover:text-[#c41f18] font-medium transition-colors"
                        >
                          {copiedCaption ? '¡Copiado!' : 'Copiar'}
                        </button>
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed bg-gray-50 rounded-lg p-3">{postCopy.caption}</p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Hashtags</span>
                        <button
                          onClick={() => { navigator.clipboard.writeText(postCopy.hashtags.split(' ').map(h => `#${h}`).join(' ')); setCopiedHashtags(true); setTimeout(() => setCopiedHashtags(false), 2000); }}
                          className="text-xs text-[#e42820] hover:text-[#c41f18] font-medium transition-colors"
                        >
                          {copiedHashtags ? '¡Copiado!' : 'Copiar'}
                        </button>
                      </div>
                      <p className="text-sm text-gray-500 leading-relaxed bg-gray-50 rounded-lg p-3">
                        {postCopy.hashtags.split(' ').map((h, i) => (
                          <span key={i} className="text-blue-500 mr-1">#{h}</span>
                        ))}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
