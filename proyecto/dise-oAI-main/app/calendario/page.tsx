'use client';

import { useState, useEffect, useRef } from 'react';
import { createSupabaseBrowser } from '@/app/lib/supabase-browser';
import { useRequireAuth } from '@/app/lib/use-auth';
import { BrandKit } from '@/app/types';
import Sidebar from '@/app/components/Sidebar';

type FunnelStage = 'TOFU' | 'MOFU' | 'BOFU';
type PostFormat = 'carousel' | 'image';
type CalendarStep = 'setup' | 'loading' | 'calendar';
type GenerateStep = 'idle' | 'planning' | 'plan-review' | 'generating' | 'done';

interface CalendarPost {
  id: string;
  week: number;
  dayOfWeek: 'Lunes' | 'Miércoles' | 'Viernes' | 'Domingo';
  format: PostFormat;
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

interface PostPlan {
  headline: string;
  subtext: string | null;
  image_direction: string;
  post_copy: { caption: string; hashtags: string };
}

interface GeneratedImage {
  id: string;
  base64: string;
  type?: string;
}

interface PostResult {
  postId: string;
  images: GeneratedImage[];
  caption?: string;
  hashtags?: string;
}

const FUNNEL_CONFIG: Record<FunnelStage, { label: string; color: string; dot: string }> = {
  TOFU: { label: 'Awareness', color: 'bg-blue-50 border-blue-200 text-blue-700', dot: 'bg-blue-400' },
  MOFU: { label: 'Consideración', color: 'bg-amber-50 border-amber-200 text-amber-700', dot: 'bg-amber-400' },
  BOFU: { label: 'Conversión', color: 'bg-green-50 border-green-200 text-green-700', dot: 'bg-green-400' },
};

const DAY_ORDER = ['Lunes', 'Miércoles', 'Viernes', 'Domingo'] as const;

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const GENERATING_MSGS = [
  'Diseñando composición...',
  'Aplicando colores de marca...',
  'Generando tipografía...',
  'Finalizando imagen...',
];

function downloadBase64(base64: string, filename: string) {
  const a = document.createElement('a');
  a.href = `data:image/png;base64,${base64}`;
  a.download = filename;
  a.click();
}

export default function CalendarioPage() {
  useRequireAuth();
  const supabase = createSupabaseBrowser();

  const [brandKit, setBrandKit] = useState<BrandKit | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [calStep, setCalStep] = useState<CalendarStep>('setup');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [monthName, setMonthName] = useState('');
  const [posts, setPosts] = useState<CalendarPost[]>([]);
  const [calError, setCalError] = useState('');

  // Per-post generation state
  const [activePost, setActivePost] = useState<CalendarPost | null>(null);
  const [genStep, setGenStep] = useState<GenerateStep>('idle');
  const [genError, setGenError] = useState('');
  const [msgIdx, setMsgIdx] = useState(0);

  // Plan state (carousel or image)
  const [carouselSlides, setCarouselSlides] = useState<CarouselSlide[]>([]);
  const [carouselPostCopy, setCarouselPostCopy] = useState<{ caption: string; hashtags: string } | null>(null);
  const [postPlan, setPostPlan] = useState<PostPlan | null>(null);

  // Generated results
  const [results, setResults] = useState<Record<string, PostResult>>({});
  const [currentImages, setCurrentImages] = useState<GeneratedImage[]>([]);

  // Copy state
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [copiedHashtags, setCopiedHashtags] = useState(false);

  const msgIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch('/api/brand-kits').then(r => r.json()).then(kit => {
      if (kit && !kit.error) setBrandKit(kit);
    }).catch(console.error);
    fetch('/api/profile').then(r => r.json()).then(data => {
      setHasApiKey(!!data.openai_api_key);
    }).catch(() => setHasApiKey(false));
  }, []);

  useEffect(() => {
    if (genStep === 'generating') {
      msgIntervalRef.current = setInterval(() => setMsgIdx(i => (i + 1) % GENERATING_MSGS.length), 2800);
    } else {
      if (msgIntervalRef.current) clearInterval(msgIntervalRef.current);
    }
    return () => { if (msgIntervalRef.current) clearInterval(msgIntervalRef.current); };
  }, [genStep]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const generateCalendar = async () => {
    if (!brandKit) return;
    setCalStep('loading');
    setCalError('');
    try {
      const res = await fetch('/api/plan-calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandKit, month, year }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error generando el calendario');
      setPosts(data.posts || []);
      setMonthName(data.monthName || MONTHS[month - 1]);
      setResults({});
      setCalStep('calendar');
    } catch (e) {
      setCalError(e instanceof Error ? e.message : 'Error generando el calendario');
      setCalStep('setup');
    }
  };

  const openPost = (post: CalendarPost) => {
    setActivePost(post);
    setGenStep('idle');
    setGenError('');
    setCarouselSlides([]);
    setCarouselPostCopy(null);
    setPostPlan(null);
    setCurrentImages([]);
  };

  const closePost = () => {
    setActivePost(null);
    setGenStep('idle');
    setGenError('');
  };

  const planPost = async () => {
    if (!activePost || !brandKit) return;
    setGenStep('planning');
    setGenError('');
    try {
      if (activePost.format === 'carousel') {
        const res = await fetch('/api/plan-carousel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandKit, title: activePost.title, hook: activePost.hook, funnel: activePost.funnel }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error planificando carousel');
        setCarouselSlides(data.slides || []);
        setCarouselPostCopy(data.post_copy?.caption ? data.post_copy : null);
      } else {
        const res = await fetch('/api/plan-post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandKit, title: activePost.title, hook: activePost.hook, funnel: activePost.funnel }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error planificando el post');
        setPostPlan(data);
      }
      setGenStep('plan-review');
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Error en la planificación');
      setGenStep('idle');
    }
  };

  const generateImages = async () => {
    if (!activePost || !brandKit) return;
    setGenStep('generating');
    setGenError('');
    setCurrentImages([]);
    setMsgIdx(0);

    try {
      if (activePost.format === 'carousel') {
        const res = await fetch('/api/generate-carousel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandKit, slides: carouselSlides, productImages: [], funnel: activePost.funnel }),
        });
        if (!res.ok) throw new Error('Error generando carousel');
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        const imgs: GeneratedImage[] = [];
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
              if (data.slide) { imgs.push({ id: data.slide.id, base64: data.slide.base64, type: `slide-${data.slide.index}` }); setCurrentImages([...imgs]); }
              if (data.done) break;
            } catch { /* skip */ }
          }
        }
        const postId = activePost.id;
        const result: PostResult = { postId, images: imgs, caption: carouselPostCopy?.caption, hashtags: carouselPostCopy?.hashtags };
        setResults(prev => ({ ...prev, [postId]: result }));
        setGenStep('done');
      } else {
        if (!postPlan) return;
        const res = await fetch('/api/generate-post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brandKit,
            headline: postPlan.headline,
            subtext: postPlan.subtext,
            image_direction: postPlan.image_direction,
            productImages: [],
            funnel: activePost.funnel,
          }),
        });
        if (!res.ok) throw new Error('Error generando imagen');
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        let img: GeneratedImage | null = null;
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
              if (data.image) { img = { id: data.image.id, base64: data.image.base64 }; setCurrentImages([img]); }
              if (data.error) setGenError(data.error);
              if (data.done) break;
            } catch { /* skip */ }
          }
        }
        const postId = activePost.id;
        const images = img ? [img] : [];
        const result: PostResult = { postId, images, caption: postPlan.post_copy?.caption, hashtags: postPlan.post_copy?.hashtags };
        setResults(prev => ({ ...prev, [postId]: result }));
        setGenStep('done');
      }
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Error generando imágenes');
      setGenStep('plan-review');
    }
  };

  const postsByWeekAndDay = (week: number, day: typeof DAY_ORDER[number]) =>
    posts.find(p => p.week === week && p.dayOfWeek === day);

  const isNoBrandKit = !brandKit;
  const isNoApiKey = hasApiKey === false;

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar active="/calendario" onLogout={handleLogout} />

      <main className="md:pl-56 min-h-screen">
        <div className="max-w-5xl mx-auto px-4 py-8 md:py-10">

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Calendario de contenido</h1>
            <p className="text-sm text-gray-500 mt-1">Planificá un mes completo de Instagram: 16 posts en 4 semanas.</p>
          </div>

          {/* Warnings */}
          {isNoBrandKit && (
            <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <svg className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-sm text-amber-700">Necesitás configurar tu brand kit antes de generar el calendario. <a href="/config" className="underline font-medium">Ir a Mi marca →</a></p>
            </div>
          )}
          {isNoApiKey && (
            <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <svg className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-sm text-amber-700">Configurá tu API key de OpenAI en el perfil para usar esta función. <a href="/perfil" className="underline font-medium">Ir al perfil →</a></p>
            </div>
          )}

          {/* Setup step */}
          {calStep === 'setup' && (
            <div className="bg-white rounded-2xl border border-gray-200 p-6 max-w-md">
              <p className="text-sm font-semibold text-gray-700 mb-4">Seleccioná el mes a planificar</p>
              <div className="flex gap-3 mb-5">
                <select
                  value={month}
                  onChange={e => setMonth(Number(e.target.value))}
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#e42820]"
                >
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>{m}</option>
                  ))}
                </select>
                <select
                  value={year}
                  onChange={e => setYear(Number(e.target.value))}
                  className="w-28 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#e42820]"
                >
                  {[2025, 2026, 2027].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              {calError && <p className="text-sm text-red-500 mb-4">{calError}</p>}
              <button
                onClick={generateCalendar}
                disabled={isNoBrandKit || isNoApiKey}
                className="w-full bg-[#e42820] hover:bg-[#c41f18] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-6 py-3 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Generar calendario
              </button>
            </div>
          )}

          {/* Loading */}
          {calStep === 'loading' && (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-10 h-10 border-2 border-[#e42820] border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-500">Planificando {MONTHS[month - 1]} {year}...</p>
              <p className="text-xs text-gray-400">GPT-4o está creando 16 posts estratégicos para tu marca</p>
            </div>
          )}

          {/* Calendar grid */}
          {calStep === 'calendar' && (
            <div className="space-y-6">
              {/* Month header + regenerate */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 capitalize">{monthName} {year}</h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {Object.values(results).length} de 16 posts generados
                  </p>
                </div>
                <button
                  onClick={() => setCalStep('setup')}
                  className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 bg-white px-3 py-1.5 rounded-lg transition-colors"
                >
                  Cambiar mes
                </button>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#e42820] rounded-full transition-all duration-500"
                  style={{ width: `${(Object.values(results).length / 16) * 100}%` }}
                />
              </div>

              {/* Weeks */}
              {[1, 2, 3, 4].map(week => (
                <div key={week}>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Semana {week}</p>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {DAY_ORDER.map(day => {
                      const post = postsByWeekAndDay(week, day);
                      if (!post) return <div key={day} className="hidden lg:block" />;
                      const result = results[post.id];
                      const funnel = FUNNEL_CONFIG[post.funnel];
                      const isCarousel = post.format === 'carousel';
                      return (
                        <button
                          key={day}
                          onClick={() => openPost(post)}
                          className={`text-left rounded-xl border p-3.5 transition-all hover:shadow-sm ${
                            result
                              ? 'border-green-200 bg-green-50 hover:border-green-300'
                              : 'border-gray-200 bg-white hover:border-gray-300'
                          }`}
                        >
                          {/* Day + format */}
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">{day}</span>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
                              isCarousel ? 'bg-purple-50 text-purple-600' : 'bg-sky-50 text-sky-600'
                            }`}>
                              {isCarousel ? 'Carousel' : 'Imagen'}
                            </span>
                          </div>

                          {/* Funnel */}
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md border mb-2 ${funnel.color}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${funnel.dot}`} />
                            {funnel.label}
                          </span>

                          {/* Title */}
                          <p className="text-xs font-semibold text-gray-800 leading-tight line-clamp-2 mb-1.5">{post.title}</p>

                          {/* Hook */}
                          <p className="text-[11px] text-gray-400 italic leading-snug line-clamp-2 mb-2">{post.hook}</p>

                          {/* Status */}
                          {result ? (
                            <div className="flex items-center gap-1 text-[10px] font-semibold text-green-600">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                              </svg>
                              Generado — ver
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-[10px] font-medium text-[#e42820]">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                              </svg>
                              Generar
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Post generator overlay */}
      {activePost && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="bg-white w-full md:max-w-2xl md:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto flex flex-col">
            {/* Overlay header */}
            <div className="flex items-start justify-between p-5 border-b border-gray-100 shrink-0">
              <div className="flex-1 pr-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-md border ${FUNNEL_CONFIG[activePost.funnel].color}`}>
                    {FUNNEL_CONFIG[activePost.funnel].label}
                  </span>
                  <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-md ${
                    activePost.format === 'carousel' ? 'bg-purple-50 text-purple-600' : 'bg-sky-50 text-sky-600'
                  }`}>
                    {activePost.format === 'carousel' ? 'Carousel' : 'Imagen'}
                  </span>
                  <span className="text-[11px] text-gray-400">Semana {activePost.week} · {activePost.dayOfWeek}</span>
                </div>
                <p className="font-bold text-gray-900">{activePost.title}</p>
                <p className="text-sm text-gray-500 italic mt-0.5">{activePost.hook}</p>
              </div>
              <button
                onClick={closePost}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-5 flex-1">
              {/* Why this post */}
              <div className="bg-gray-50 rounded-xl p-3.5 mb-5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Por qué este post</p>
                <p className="text-sm text-gray-600 leading-relaxed">{activePost.why}</p>
              </div>

              {/* idle: Plan button */}
              {genStep === 'idle' && (
                <div className="space-y-3">
                  {results[activePost.id] && (
                    <div className="mb-4">
                      <p className="text-xs font-semibold text-green-600 mb-3 flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                        Post generado anteriormente
                      </p>
                      <div className={`grid gap-2 ${results[activePost.id].images.length > 1 ? 'grid-cols-3' : 'grid-cols-1 max-w-xs'}`}>
                        {results[activePost.id].images.map((img, i) => (
                          <div key={img.id} className="relative group">
                            <img
                              src={`data:image/png;base64,${img.base64}`}
                              alt={`Resultado ${i + 1}`}
                              className="w-full rounded-lg object-cover aspect-square"
                            />
                            <button
                              onClick={() => downloadBase64(img.base64, `${activePost.title.slice(0, 20)}-${i + 1}.png`)}
                              className="absolute inset-0 bg-black/40 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                            >
                              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <button
                    onClick={planPost}
                    className="w-full bg-[#e42820] hover:bg-[#c41f18] text-white font-semibold px-6 py-3 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    {results[activePost.id] ? 'Regenerar post' : 'Planificar y generar'}
                  </button>
                </div>
              )}

              {/* Planning spinner */}
              {genStep === 'planning' && (
                <div className="flex flex-col items-center py-10 gap-3">
                  <div className="w-8 h-8 border-2 border-[#e42820] border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-gray-500">GPT-4o planificando el contenido...</p>
                </div>
              )}

              {/* Plan review — carousel */}
              {genStep === 'plan-review' && activePost.format === 'carousel' && carouselSlides.length > 0 && (
                <div className="space-y-4">
                  <p className="text-sm font-semibold text-gray-700">Plan de slides</p>
                  {carouselSlides.map(slide => (
                    <div key={slide.index} className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-5 h-5 bg-[#e42820] text-white text-[10px] font-bold rounded-full flex items-center justify-center shrink-0">{slide.index}</span>
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          {slide.role === 'hook' ? 'Hook' : slide.role === 'value' ? 'Valor' : 'CTA'}
                        </span>
                      </div>
                      {slide.title && <p className="text-sm font-semibold text-gray-800 mb-1">{slide.title}</p>}
                      {slide.subtitle && <p className="text-sm text-gray-500 mb-1">{slide.subtitle}</p>}
                      {slide.items && (
                        <ul className="space-y-0.5">
                          {slide.items.map((it, i) => (
                            <li key={i} className="text-sm text-gray-700 flex gap-1.5"><span className="text-gray-400">{i + 1}.</span>{it}</li>
                          ))}
                        </ul>
                      )}
                      {slide.cta && <p className="text-sm font-semibold text-[#e42820]">CTA: {slide.cta}</p>}
                      <p className="text-xs text-gray-400 italic mt-2 leading-relaxed">{slide.image_direction}</p>
                    </div>
                  ))}
                  {carouselPostCopy && (
                    <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                      <p className="text-xs font-semibold text-blue-600 mb-2">Copy del post</p>
                      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{carouselPostCopy.caption}</p>
                    </div>
                  )}
                  {genError && <p className="text-sm text-red-500">{genError}</p>}
                  <button
                    onClick={generateImages}
                    className="w-full bg-[#e42820] hover:bg-[#c41f18] text-white font-semibold px-6 py-3 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Generar 3 slides
                  </button>
                </div>
              )}

              {/* Plan review — image */}
              {genStep === 'plan-review' && activePost.format === 'image' && postPlan && (
                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Texto en la imagen</p>
                    <p className="text-lg font-bold text-gray-900 leading-tight">{postPlan.headline}</p>
                    {postPlan.subtext && <p className="text-sm text-gray-600 mt-1">{postPlan.subtext}</p>}
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Dirección visual</p>
                    <p className="text-sm text-gray-700 italic leading-relaxed">{postPlan.image_direction}</p>
                  </div>
                  {postPlan.post_copy && (
                    <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                      <p className="text-xs font-semibold text-blue-600 mb-2">Copy del post</p>
                      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{postPlan.post_copy.caption}</p>
                    </div>
                  )}
                  {genError && <p className="text-sm text-red-500">{genError}</p>}
                  <button
                    onClick={generateImages}
                    className="w-full bg-[#e42820] hover:bg-[#c41f18] text-white font-semibold px-6 py-3 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Generar imagen
                  </button>
                </div>
              )}

              {/* Generating */}
              {genStep === 'generating' && (
                <div className="space-y-4">
                  <div className="flex flex-col items-center py-6 gap-3">
                    <div className="w-8 h-8 border-2 border-[#e42820] border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm text-gray-500">{GENERATING_MSGS[msgIdx]}</p>
                  </div>
                  {currentImages.length > 0 && (
                    <div className={`grid gap-2 ${currentImages.length > 1 ? 'grid-cols-3' : 'grid-cols-1 max-w-xs mx-auto'}`}>
                      {currentImages.map((img, i) => (
                        <img
                          key={img.id}
                          src={`data:image/png;base64,${img.base64}`}
                          alt={`Slide ${i + 1}`}
                          className="w-full rounded-lg object-cover aspect-square"
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Done */}
              {genStep === 'done' && activePost && results[activePost.id] && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-green-600">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    <p className="text-sm font-semibold">
                      {activePost.format === 'carousel' ? 'Carousel generado' : 'Imagen generada'}
                    </p>
                  </div>

                  {/* Images grid */}
                  <div className={`grid gap-2 ${results[activePost.id].images.length > 1 ? 'grid-cols-3' : 'grid-cols-1 max-w-xs'}`}>
                    {results[activePost.id].images.map((img, i) => (
                      <div key={img.id} className="relative group">
                        <img
                          src={`data:image/png;base64,${img.base64}`}
                          alt={`Resultado ${i + 1}`}
                          className="w-full rounded-lg object-cover aspect-square"
                        />
                        <button
                          onClick={() => downloadBase64(img.base64, `${activePost.title.slice(0, 20)}-${i + 1}.png`)}
                          className="absolute inset-0 bg-black/40 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                        >
                          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Download all */}
                  {results[activePost.id].images.length > 1 && (
                    <button
                      onClick={() => results[activePost!.id].images.forEach((img, i) =>
                        downloadBase64(img.base64, `${activePost!.title.slice(0, 20)}-slide-${i + 1}.png`)
                      )}
                      className="w-full border border-gray-200 text-gray-700 font-medium px-4 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Descargar todos los slides
                    </button>
                  )}

                  {/* Post copy */}
                  {results[activePost.id].caption && (
                    <div className="space-y-3">
                      <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Caption</p>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(results[activePost!.id].caption!);
                              setCopiedCaption(true);
                              setTimeout(() => setCopiedCaption(false), 2000);
                            }}
                            className="text-xs text-[#e42820] font-medium hover:underline flex items-center gap-1"
                          >
                            {copiedCaption ? '✓ Copiado' : 'Copiar'}
                          </button>
                        </div>
                        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                          {results[activePost.id].caption}
                        </p>
                      </div>

                      {results[activePost.id].hashtags && (
                        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Hashtags</p>
                            <button
                              onClick={() => {
                                const tags = results[activePost!.id].hashtags!.split(' ').map(h => `#${h}`).join(' ');
                                navigator.clipboard.writeText(tags);
                                setCopiedHashtags(true);
                                setTimeout(() => setCopiedHashtags(false), 2000);
                              }}
                              className="text-xs text-[#e42820] font-medium hover:underline flex items-center gap-1"
                            >
                              {copiedHashtags ? '✓ Copiado' : 'Copiar'}
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {results[activePost.id].hashtags!.split(' ').map((h, i) => (
                              <span key={i} className="text-xs bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full">#{h}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {genError && <p className="text-sm text-red-500">{genError}</p>}

                  <button
                    onClick={closePost}
                    className="w-full border border-gray-200 text-gray-700 font-medium px-4 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors"
                  >
                    Volver al calendario
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
