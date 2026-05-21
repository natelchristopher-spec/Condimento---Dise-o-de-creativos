'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { createSupabaseBrowser } from '@/app/lib/supabase-browser';
import { useRequireAuth } from '@/app/lib/use-auth';
import { BrandKit, GeneratedImage, Step, PeopleMode } from './types';
import ImageCard from './components/ImageCard';
import StepIndicator from './components/StepIndicator';
import LoadingGrid from './components/LoadingGrid';

export default function Home() {
  const [brandKit, setBrandKit] = useState<BrandKit | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [brief, setBrief] = useState('');
  const [clientRequest, setClientRequest] = useState('');
  const [generatingBrief, setGeneratingBrief] = useState(false);

  const [adaptFormats, setAdaptFormats] = useState<string[]>([]);
  const [adaptedImages, setAdaptedImages] = useState<{ format: string; label: string; conceptId: string; base64: string }[]>([]);
  const [generatingAdaptations, setGeneratingAdaptations] = useState(false);
  const [step, setStep] = useState<Step>('brief');
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [elapsedSec, setElapsedSec] = useState(0);
  const loadingStartRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [error, setError] = useState('');

  const [conceptCount, setConceptCount] = useState(3);
  const [peopleMode, setPeopleMode] = useState<PeopleMode>('none');
  const [productDetailImages, setProductDetailImages] = useState<string[]>([]);
  const [referenceImages, setReferenceImages] = useState<string[]>([]);


  const [concepts, setConcepts] = useState<GeneratedImage[]>([]);
  const [generatingCount, setGeneratingCount] = useState(0);
  const [selectedConcepts, setSelectedConcepts] = useState<GeneratedImage[]>([]);
  const [refineIndex, setRefineIndex] = useState(0);
  const [productDescription, setProductDescription] = useState('');
  const [personDescription, setPersonDescription] = useState('');

  const [refineImage, setRefineImage] = useState<GeneratedImage | null>(null);
  const [refineInput, setRefineInput] = useState('');
  const [refineHistory, setRefineHistory] = useState<string[]>([]);
  const [refineImageHistory, setRefineImageHistory] = useState<string[]>([]);
  const refineInputRef = useRef<HTMLInputElement>(null);

  useRequireAuth();
  const supabase = createSupabaseBrowser();

  const startLoading = (msg: string) => {
    setLoading(true);
    setLoadingMsg(msg);
    setElapsedSec(0);
    loadingStartRef.current = setInterval(() => setElapsedSec(s => s + 1), 1000);
  };

  const stopLoading = () => {
    setLoading(false);
    setLoadingMsg('');
    setElapsedSec(0);
    if (loadingStartRef.current) { clearInterval(loadingStartRef.current); loadingStartRef.current = null; }
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserEmail(data.user.email || '');
    });
    fetch('/api/brand-kits').then(r => r.json()).then(kit => {
      if (kit && !kit.error) setBrandKit(kit);
    }).catch(console.error);
    fetch('/api/profile').then(r => r.json()).then(data => {
      setHasApiKey(!!data.openai_api_key);
    }).catch(() => setHasApiKey(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const readAsPng = (file: File): Promise<string> =>
    new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const img = new Image();
        img.onload = () => {
          const MAX = 1024;
          let { naturalWidth: w, naturalHeight: h } = img;
          if (!w || !h) { resolve(dataUrl); return; }
          if (w > MAX || h > MAX) {
            if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
            else { w = Math.round(w * MAX / h); h = MAX; }
          }
          try {
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/png'));
          } catch { resolve(dataUrl); }
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });

  const handleProductDetailUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const imgs = await Promise.all(files.slice(0, 2 - productDetailImages.length).map(readAsPng));
    setProductDetailImages(prev => [...prev, ...imgs.map(d => d.split(',')[1] || d)].slice(0, 2));
    e.target.value = '';
  };

  const handleReferenceImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const imgs = await Promise.all(files.slice(0, 2 - referenceImages.length).map(readAsPng));
    setReferenceImages(prev => [...prev, ...imgs.map(d => d.startsWith('data:') ? d : `data:image/png;base64,${d}`)].slice(0, 2));
    e.target.value = '';
  };

  const generateBrief = async () => {
    if (!clientRequest.trim()) return;
    setGeneratingBrief(true);
    try {
      const res = await fetch('/api/generate-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientRequest, brandKit }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { brief: generated } = await res.json();
      setBrief(generated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error generando brief');
    } finally {
      setGeneratingBrief(false);
    }
  };

  const parseConceptStream = async (res: Response, onImage: (img: GeneratedImage) => void) => {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let productDesc = '';
    let personDesc = '';
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
          if (data.image) onImage(data.image);
          if (data.done) { productDesc = data.productDescription || ''; personDesc = data.personDescription || ''; }
        } catch { /* ignore malformed chunk */ }
      }
    }
    return { productDescription: productDesc, personDescription: personDesc };
  };

  const generateConcepts = async () => {
    if (!brandKit || !brief.trim()) return;
    const count = conceptCount;
    setGeneratingCount(count);
    setConcepts([]);
    setSelectedConcepts([]);
    setProductDescription('');
    setPersonDescription('');
    setStep('concepts');
    startLoading('Generando conceptos...');
    setError('');
    try {
      const res = await fetch('/api/generate-concepts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief,
          brandKit,
          peopleMode,
          productDetailImages,
          referenceImages,
          count,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { productDescription: pd, personDescription: prd } = await parseConceptStream(res, img =>
        setConcepts(prev => [...prev, img])
      );
      setProductDescription(pd);
      setPersonDescription(prd);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error generando conceptos');
      setStep('brief');
    } finally {
      stopLoading();
    }
  };

  const generateSimilar = async () => {
    if (selectedConcepts.length === 0 || !brandKit || !brief.trim()) return;
    const newCount = conceptCount - selectedConcepts.length;
    if (newCount <= 0) return;
    const pinned = [...selectedConcepts];
    setGeneratingCount(conceptCount);
    setConcepts([...pinned]);
    startLoading(`Generando ${newCount} similar${newCount > 1 ? 'es' : ''}...`);
    setError('');
    try {
      const res = await fetch('/api/generate-concepts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief,
          brandKit,
          peopleMode,
          productDetailImages,
          referenceImages,
          styleReferenceImages: pinned.map(c => c.base64),
          count: newCount,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { productDescription: pd } = await parseConceptStream(res, img =>
        setConcepts(prev => [...prev, img])
      );
      if (pd && !productDescription) setProductDescription(pd);
      setSelectedConcepts([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error generando similares');
    } finally {
      stopLoading();
    }
  };

  const toggleConceptSelection = (img: GeneratedImage) => {
    setSelectedConcepts(prev => {
      const exists = prev.find(c => c.id === img.id);
      if (exists) return prev.filter(c => c.id !== img.id);
      if (prev.length >= 3) return prev;
      return [...prev, img];
    });
  };

  const applyRefinement = async () => {
    if (!refineInput.trim() || !refineImage || !brandKit) return;
    const instruction = refineInput.trim();
    setRefineInput('');
    startLoading('Aplicando ajuste...');
    setError('');
    try {
      const res = await fetch('/api/adjust-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: refineImage.base64,
          instruction,
          productDetailImages,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { base64, error: apiError } = await res.json();
      if (apiError) throw new Error(apiError);
      setRefineImageHistory(prev => [...prev, refineImage.base64]);
      setRefineHistory(prev => [...prev, instruction]);
      const updated = { ...refineImage, base64 };
      setRefineImage(updated);
      setSelectedConcepts(prev => prev.map(c => c.id === refineImage.id ? updated : c));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error aplicando ajuste');
    } finally {
      stopLoading();
      setTimeout(() => refineInputRef.current?.focus(), 50);
    }
  };

  const undoRefinement = () => {
    if (!refineImageHistory.length || !refineImage) return;
    const prev = refineImageHistory[refineImageHistory.length - 1];
    setRefineImageHistory(h => h.slice(0, -1));
    setRefineHistory(h => h.slice(0, -1));
    const restored = { ...refineImage, base64: prev };
    setRefineImage(restored);
    setSelectedConcepts(prev2 => prev2.map(c => c.id === refineImage.id ? restored : c));
  };

  const enterRefine = async () => {
    if (selectedConcepts.length === 0 || !brandKit) return;
    const first = selectedConcepts[0];
    setRefineIndex(0);
    setRefineHistory([]);
    setRefineImageHistory([]);
    setRefineInput('');

    if (productDetailImages.length > 0 && peopleMode !== 'real') {
      startLoading('Aplicando producto...');
      setError('');
      try {
        const res = await fetch('/api/apply-product', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conceptImageBase64: first.base64,
            productDetailImages,
            productDescription,
            peopleMode,
            personDescription,
          }),
        });
        const { base64 } = await res.json();
        const updated = base64 ? { ...first, base64 } : first;
        setRefineImage(updated);
        setSelectedConcepts(prev => prev.map(c => c.id === first.id ? updated : c));
      } catch {
        setRefineImage(first);
      } finally {
        stopLoading();
      }
    } else {
      setRefineImage(first);
    }
    setStep('refine');
  };

  const saveRefinedAndNext = () => {
    const nextIndex = refineIndex + 1;
    const next = selectedConcepts[nextIndex];
    setRefineIndex(nextIndex);
    setRefineHistory([]);
    setRefineImageHistory([]);
    setRefineInput('');
    setRefineImage(next);
  };

  const finishRefine = () => setStep('done');

  const downloadAllSelected = () => {
    selectedConcepts.forEach((img, i) => {
      const a = document.createElement('a');
      a.href = `data:image/png;base64,${img.base64}`;
      a.download = `${brandKit?.name || 'concepto'}-${i + 1}-${img.conceptName.replace(/\s+/g, '-')}.png`;
      a.click();
    });
  };

  const generateAdaptations = async () => {
    if (adaptFormats.length === 0 || selectedConcepts.length === 0) return;
    setGeneratingAdaptations(true);
    try {
      const results = await Promise.all(
        selectedConcepts.flatMap(concept =>
          adaptFormats.map(async format => {
            const res = await fetch('/api/adapt-size', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ imageBase64: concept.base64, format }),
            });
            if (!res.ok) return null;
            const data = await res.json();
            const FORMAT_LABELS: Record<string, string> = {
              story: 'Story 9:16', feed45: 'Feed 4:5', square: 'Cuadrado 1:1', landscape: 'Landscape 16:9',
              pmax_square: 'PMax 1:1', pmax_landscape: 'PMax 1.91:1', pmax_portrait: 'PMax 4:5',
              banner_desktop: 'Banner Desktop', banner_mobile: 'Banner Mobile', webpush: 'Webpush', mailing: 'Mailing',
            };
            return { format, label: FORMAT_LABELS[format] || format, conceptId: concept.id, base64: data.base64 };
          })
        )
      );
      setAdaptedImages(results.filter(Boolean) as { format: string; label: string; conceptId: string; base64: string }[]);
    } finally {
      setGeneratingAdaptations(false);
    }
  };

  const reset = () => {
    setStep('brief');
    setBrief('');
    setClientRequest('');
    setConcepts([]);
    setSelectedConcepts([]);
    setRefineIndex(0);
    setProductDescription('');
    setPersonDescription('');
    setRefineImage(null);
    setRefineHistory([]);
    setRefineImageHistory([]);
    setRefineInput('');
    setError('');
    setPeopleMode('none');
    setProductDetailImages([]);
    setReferenceImages([]);
    setAdaptFormats([]);
    setAdaptedImages([]);
  };

  const regenerateConcepts = async () => {
    setSelectedConcepts([]);
    setRefineIndex(0);
    await generateConcepts();
  };

  return (
    <div className="min-h-screen bg-[#F0EBE3]">
      {/* Header */}
      <header className="bg-[#111111] border-b border-white/10 px-6 py-4 flex items-center justify-between text-white">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#e42820] flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <span className="font-semibold text-lg">Condimento</span>
          </div>
          {/* Main nav */}
          <nav className="hidden sm:flex items-center gap-1">
            <Link href="/" className="text-sm font-medium px-3 py-1.5 rounded-lg bg-white/10 text-white">
              Creativos
            </Link>
            <Link href="/pdp" className="text-sm font-medium px-3 py-1.5 rounded-lg text-white/50 hover:text-white/80 hover:bg-white/5 transition-colors">
              Imágenes PDP
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <StepIndicator currentStep={step} />
          <Link
            href="/config"
            className="text-sm text-white/50 hover:text-white/80 transition-colors border border-white/10 hover:border-white/20 px-3 py-1.5 rounded-lg"
          >
            Mi marca
          </Link>
          <Link
            href="/perfil"
            className="text-sm text-white/50 hover:text-white/80 transition-colors border border-white/10 hover:border-white/20 px-3 py-1.5 rounded-lg"
          >
            Perfil
          </Link>
          <button
            onClick={handleLogout}
            className="text-sm text-white/40 hover:text-white/70 transition-colors px-2 py-1.5 rounded-lg"
            title={userEmail}
          >
            Salir
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-10">

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm flex items-start gap-2">
            <span className="mt-0.5">⚠</span>
            <span>{error}</span>
          </div>
        )}

        {/* Onboarding wizard — shown when setup is incomplete */}
        {step === 'brief' && hasApiKey !== null && (!hasApiKey || !brandKit) && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
            <div>
              <h2 className="font-semibold text-base">Configuración inicial</h2>
              <p className="text-sm text-white/50 mt-0.5">Completá estos dos pasos antes de empezar a generar.</p>
            </div>
            <div className="space-y-3">
              {/* Step 1: API key */}
              <div className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
                hasApiKey ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-[#e42820]/40 bg-[#e42820]/5'
              }`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                  hasApiKey ? 'bg-emerald-500/20 text-emerald-400' : 'bg-[#e42820]/20 text-[#e42820]'
                }`}>
                  {hasApiKey ? '✓' : '1'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${hasApiKey ? 'text-emerald-400' : 'text-white'}`}>
                    {hasApiKey ? 'API key de OpenAI configurada' : 'Agregá tu API key de OpenAI'}
                  </p>
                  {!hasApiKey && (
                    <p className="text-xs text-white/40 mt-0.5">La necesitás para generar imágenes con IA.</p>
                  )}
                </div>
                {!hasApiKey && (
                  <Link href="/perfil" className="shrink-0 bg-[#e42820] text-white text-xs font-medium px-4 py-2 rounded-lg hover:bg-[#c41f18] transition-colors">
                    Configurar
                  </Link>
                )}
              </div>

              {/* Step 2: Brand kit */}
              <div className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
                brandKit ? 'border-emerald-500/30 bg-emerald-500/5' :
                hasApiKey ? 'border-[#e42820]/40 bg-[#e42820]/5' : 'border-white/10 bg-white/5 opacity-50'
              }`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                  brandKit ? 'bg-emerald-500/20 text-emerald-400' :
                  hasApiKey ? 'bg-[#e42820]/20 text-[#e42820]' : 'bg-white/10 text-white/40'
                }`}>
                  {brandKit ? '✓' : '2'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${brandKit ? 'text-emerald-400' : hasApiKey ? 'text-white' : 'text-white/40'}`}>
                    {brandKit ? 'Brand kit configurado' : 'Configurá tu brand kit'}
                  </p>
                  {!brandKit && hasApiKey && (
                    <p className="text-xs text-white/40 mt-0.5">Subí tu manual de marca o completalo manualmente.</p>
                  )}
                </div>
                {!brandKit && hasApiKey && (
                  <Link href="/config" className="shrink-0 bg-[#e42820] text-white text-xs font-medium px-4 py-2 rounded-lg hover:bg-[#c41f18] transition-colors">
                    Configurar
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Step: BRIEF */}
        {step === 'brief' && (
          <div className="space-y-8">
            <div>
              <h1 className="text-3xl font-bold mb-2">Nueva pieza</h1>
              <p className="text-white/50">Escribí el brief de la campaña y generá tus creativos.</p>
            </div>

            {/* Brief generator */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-white/70">Solicitud del cliente</label>
              <div className="flex gap-2 items-start">
                <textarea
                  value={clientRequest}
                  onChange={e => setClientRequest(e.target.value)}
                  placeholder="Pegá el mensaje del cliente tal como llegó. Ej: 'Necesito algo para el lanzamiento de nuestra colección de verano...'"
                  rows={3}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/25 focus:outline-none focus:border-[#e42820] resize-none text-sm leading-relaxed"
                />
                <button
                  onClick={generateBrief}
                  disabled={!clientRequest.trim() || generatingBrief}
                  className="shrink-0 bg-[#e42820]/80 hover:bg-[#e42820] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-3 rounded-xl transition-colors flex items-center gap-2 whitespace-nowrap"
                >
                  {generatingBrief ? (
                    <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Generando...</>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Generar brief
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Brief input */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-white/70">Brief de campaña</label>
              <textarea
                value={brief}
                onChange={e => setBrief(e.target.value)}
                placeholder="El brief aparecerá acá. También podés escribirlo directamente."
                rows={5}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/25 focus:outline-none focus:border-[#e42820] resize-none text-sm leading-relaxed"
              />
            </div>

            {/* Concept count selector */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-white/70">¿Cuántos conceptos querés generar?</label>
              <div className="flex gap-3">
                {[1, 2, 3, 4].map(n => (
                  <button
                    key={n}
                    onClick={() => setConceptCount(n)}
                    className={`w-14 h-14 rounded-xl border text-lg font-semibold transition-all ${
                      conceptCount === n
                        ? 'border-[#e42820] bg-[#e42820]/10 text-[#e42820]'
                        : 'border-white/10 hover:border-white/20 bg-white/5 text-white/60'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-xs text-white/30">Más conceptos = más tiempo y más crédito de OpenAI.</p>
            </div>

            {/* People mode */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-white/70">Tipo de imagen</label>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { value: 'none', label: 'PRODUCTO', desc: 'Anuncio alrededor del producto', icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
                  { value: 'real', label: 'FASHION', desc: 'Personas usando el producto', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
                ] as const).map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => { setPeopleMode(opt.value); if (opt.value !== 'real') setReferenceImages([]); setProductDetailImages([]); }}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      peopleMode === opt.value
                        ? 'border-[#e42820] bg-[#e42820]/10'
                        : 'border-white/10 hover:border-white/20 bg-white/5'
                    }`}
                  >
                    <svg className={`w-5 h-5 mb-2 ${peopleMode === opt.value ? 'text-[#e42820]' : 'text-white/40'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={opt.icon} />
                    </svg>
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="text-xs text-white/40 mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-white/60">Foto del producto / estampado en detalle</p>
                <p className="text-xs text-white/30">Primer plano sobre fondo neutro — más detalle = mejor resultado.</p>
                <div className="flex gap-3 flex-wrap">
                  {productDetailImages.map((img, i) => (
                    <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-white/10">
                      <img src={`data:image/png;base64,${img}`} alt={`prod ${i+1}`} className="w-full h-full object-cover" />
                      <button
                        onClick={() => setProductDetailImages(prev => prev.filter((_, idx) => idx !== i))}
                        className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center text-white/80 hover:text-white text-xs"
                      >×</button>
                    </div>
                  ))}
                  {productDetailImages.length < 2 && (
                    <label className="w-20 h-20 rounded-xl border border-dashed border-white/20 hover:border-white/40 flex flex-col items-center justify-center cursor-pointer transition-colors gap-1">
                      <svg className="w-5 h-5 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      <span className="text-xs text-white/30">Foto</span>
                      <input type="file" accept="image/*" multiple onChange={handleProductDetailUpload} className="hidden" />
                    </label>
                  )}
                </div>
              </div>

              {peopleMode === 'real' && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-white/60">Foto de la persona usando el producto</p>
                  <div className="flex gap-3 flex-wrap">
                    {referenceImages.map((img, i) => (
                      <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-white/10">
                        <img src={img} alt={`ref ${i+1}`} className="w-full h-full object-cover" />
                        <button
                          onClick={() => setReferenceImages(prev => prev.filter((_, idx) => idx !== i))}
                          className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center text-white/80 hover:text-white text-xs"
                        >×</button>
                      </div>
                    ))}
                    {referenceImages.length < 2 && (
                      <label className="w-20 h-20 rounded-xl border border-dashed border-white/20 hover:border-white/40 flex flex-col items-center justify-center cursor-pointer transition-colors gap-1">
                        <svg className="w-5 h-5 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span className="text-xs text-white/30">Foto</span>
                        <input type="file" accept="image/*" multiple onChange={handleReferenceImageUpload} className="hidden" />
                      </label>
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={generateConcepts}
              disabled={!brandKit || !brief.trim() || loading}
              className="bg-[#e42820] hover:bg-[#e42820] disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium px-6 py-3 rounded-xl transition-colors flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {loadingMsg}{elapsedSec > 5 ? ` · ${elapsedSec}s` : ''}
                </>
              ) : (
                <>
                  Generar {conceptCount} concepto{conceptCount > 1 ? 's' : ''}
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </>
              )}
            </button>
          </div>
        )}

        {/* Step: CONCEPTS */}
        {step === 'concepts' && (
          <div className="space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold mb-1">Elegí hasta 3 conceptos</h2>
                <p className="text-white/50 text-sm">Seleccioná los que más te gustan para afinarlos</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={regenerateConcepts}
                  disabled={loading}
                  className="text-sm text-white/50 hover:text-white/80 transition-colors border border-white/10 hover:border-white/20 px-3 py-1.5 rounded-lg disabled:opacity-40 flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Regenerar
                </button>
                <button onClick={reset} className="text-white/40 hover:text-white/70 text-sm transition-colors">
                  ← Volver
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {concepts.map(img => {
                const selIdx = selectedConcepts.findIndex(c => c.id === img.id);
                const isSelected = selIdx !== -1;
                return (
                  <div key={img.id} className="relative">
                    <ImageCard image={img} selected={isSelected} onClick={() => toggleConceptSelection(img)} />
                    {isSelected && (
                      <div className="absolute top-2 left-2 w-6 h-6 bg-[#e42820] rounded-full flex items-center justify-center text-xs font-bold text-white">
                        {selIdx + 1}
                      </div>
                    )}
                  </div>
                );
              })}
              {loading && Array.from({ length: Math.max(0, generatingCount - concepts.length) }).map((_, i) => (
                <div key={`skeleton-${i}`} className="aspect-[2/3] rounded-xl border border-white/10 bg-white/5 animate-pulse flex flex-col justify-end p-3 gap-2">
                  <div className="flex items-center justify-center flex-1">
                    <div className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                  </div>
                  <div className="h-2.5 bg-white/20 rounded-full w-2/3" />
                </div>
              ))}
            </div>

            {productDetailImages.length > 0 && peopleMode !== 'none' && (
              <div className="space-y-2 border border-[#e42820]/20 bg-[#e42820]/5 rounded-xl p-4">
                <p className="text-xs font-medium text-[#e42820]">Descripción del producto — editala para mejorar la fidelidad</p>
                <textarea
                  value={productDescription}
                  onChange={e => setProductDescription(e.target.value)}
                  rows={5}
                  placeholder="Describí el producto: tipo de prenda, color, estampado, detalles..."
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-xs leading-relaxed focus:outline-none focus:border-[#e42820] resize-none placeholder-white/20"
                />
              </div>
            )}

            <div className="flex items-center justify-between pt-2 flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <p className="text-white/40 text-sm">
                  {selectedConcepts.length === 0 ? 'Hacé click para seleccionar' : `${selectedConcepts.length} seleccionado${selectedConcepts.length > 1 ? 's' : ''}`}
                </p>
                {selectedConcepts.length > 0 && (
                  <button
                    onClick={downloadAllSelected}
                    className="text-white/50 hover:text-white/80 text-sm border border-white/10 hover:border-white/20 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Descargar todos
                  </button>
                )}
                {selectedConcepts.length > 0 && selectedConcepts.length < conceptCount && (
                  <button
                    onClick={generateSimilar}
                    disabled={loading}
                    className="text-white/50 hover:text-[#e42820] text-sm border border-white/10 hover:border-[#e42820]/50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40 flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {loading ? `${elapsedSec > 0 ? `${elapsedSec}s...` : 'Generando...'}` : `Generar ${conceptCount - selectedConcepts.length} similares`}
                  </button>
                )}
              </div>
              <button
                onClick={enterRefine}
                disabled={selectedConcepts.length === 0 || loading}
                className="bg-[#e42820] hover:bg-[#e42820] disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium px-6 py-3 rounded-xl transition-colors flex items-center gap-2"
              >
                {loading ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />{loadingMsg}{elapsedSec > 5 ? ` · ${elapsedSec}s` : ''}</>
                ) : (
                  <>Afinar {selectedConcepts.length > 1 ? `${selectedConcepts.length} conceptos` : 'concepto'}<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg></>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step: REFINE */}
        {step === 'refine' && refineImage && (
          <div className="space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold mb-1">
                  Afiná el concepto
                  {selectedConcepts.length > 1 && (
                    <span className="ml-3 text-base font-normal text-[#e42820]">{refineIndex + 1} de {selectedConcepts.length}</span>
                  )}
                </h2>
                <p className="text-white/50 text-sm">{refineImage.conceptName}</p>
              </div>
              <button onClick={() => setStep('concepts')} className="text-white/40 hover:text-white/70 text-sm transition-colors">
                ← Volver
              </button>
            </div>

            <div className="grid md:grid-cols-2 gap-8 items-start">
              <div className="space-y-3">
                <div className="rounded-xl overflow-hidden border border-white/10 relative">
                  <img
                    src={`data:image/png;base64,${refineImage.base64}`}
                    alt="Concepto"
                    className={`w-full transition-all duration-300 ${loading ? 'blur-sm scale-[1.02]' : ''}`}
                  />
                  {loading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 backdrop-blur-[2px]">
                      <div className="w-8 h-8 border-3 border-white/30 border-t-white rounded-full animate-spin mb-2" style={{ borderWidth: '3px' }} />
                      <p className="text-white text-sm font-medium">{loadingMsg || 'Aplicando...'}</p>
                      {elapsedSec > 3 && <p className="text-white/60 text-xs mt-1">{elapsedSec}s</p>}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    const a = document.createElement('a');
                    a.href = `data:image/png;base64,${refineImage.base64}`;
                    a.download = `${brandKit?.name || 'concepto'}-${refineImage.conceptName.replace(/\s+/g, '-')}.png`;
                    a.click();
                  }}
                  className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white text-sm px-4 py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Descargar este concepto
                </button>
              </div>

              <div className="space-y-4">
                {refineHistory.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-white/40 font-medium uppercase tracking-wider">Aplicados</p>
                    <div className="space-y-1.5 max-h-32 overflow-y-auto">
                      {refineHistory.map((h, i) => (
                        <div key={i} className="bg-white/5 rounded-lg px-3 py-2 text-sm text-white/60 flex items-start gap-2">
                          <span className="text-[#e42820] mt-0.5">✓</span>{h}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-xs text-white/40 font-medium uppercase tracking-wider">Ajustes rápidos</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      ...(brandKit?.quickAdjustments || []),
                      ...(productDetailImages.length > 0 && peopleMode === 'none'
                        ? ['Fondo más oscuro', 'Fondo blanco limpio', 'Fondo con textura industrial', 'Más contraste', 'Producto más grande', 'Producto centrado', 'Agregar sombra al producto', 'Composición más minimalista', 'Colores más vibrantes']
                        : ['Fondo más oscuro', 'Fondo blanco limpio', 'Más contraste', 'Iluminación más suave', 'Colores más vibrantes', 'Modelo mujer joven', 'Modelo hombre joven', 'Solo producto flat lay', 'Agregar texto de marca']
                      ),
                    ].map((preset, i) => {
                      const isClientPreset = i < (brandKit?.quickAdjustments?.length || 0);
                      return (
                        <button
                          key={`${preset}-${i}`}
                          onClick={() => setRefineInput(preset)}
                          className={`text-xs px-3 py-1.5 rounded-lg transition-colors border ${
                            isClientPreset
                              ? 'bg-[#e42820]/10 border-[#e42820]/30 text-[#e42820] hover:bg-[#e42820]/20'
                              : 'bg-white/5 hover:bg-white/10 border-white/10 hover:border-[#e42820]/50 text-white/60 hover:text-white'
                          }`}
                        >
                          {preset}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <input
                    ref={refineInputRef}
                    type="text"
                    value={refineInput}
                    onChange={e => setRefineInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !loading && applyRefinement()}
                    placeholder="O escribí tu ajuste..."
                    disabled={loading}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/25 focus:outline-none focus:border-[#e42820] text-sm disabled:opacity-50"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={applyRefinement}
                      disabled={!refineInput.trim() || loading}
                      className="flex-1 bg-white/10 hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium px-4 py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
                    >
                      {loading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />{elapsedSec > 0 ? `${elapsedSec}s...` : 'Aplicando...'}</> : 'Aplicar'}
                    </button>
                    {refineImageHistory.length > 0 && (
                      <button
                        onClick={undoRefinement}
                        disabled={loading}
                        className="bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-40 text-white/60 hover:text-white px-3 py-3 rounded-xl transition-colors flex items-center gap-1.5 text-sm"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                        </svg>
                        Deshacer
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex gap-3 pt-1">
                  {refineIndex < selectedConcepts.length - 1 ? (
                    <button
                      onClick={saveRefinedAndNext}
                      disabled={loading}
                      className="flex-1 bg-[#e42820] hover:bg-[#e42820] disabled:opacity-40 text-white font-medium px-4 py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
                    >
                      Guardar y siguiente
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </button>
                  ) : (
                    <button
                      onClick={finishRefine}
                      disabled={loading}
                      className="flex-1 bg-[#e42820] hover:bg-[#e42820] disabled:opacity-40 text-white font-medium px-4 py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
                    >
                      Finalizar
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step: DONE */}
        {step === 'done' && (
          <div className="space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold mb-1">¡Listos para descargar!</h2>
                <p className="text-white/50 text-sm">{selectedConcepts.length} concepto{selectedConcepts.length > 1 ? 's' : ''} finalizado{selectedConcepts.length > 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setStep('refine')} className="text-white/40 hover:text-white/70 text-sm transition-colors">
                ← Volver a afinación
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {selectedConcepts.map((img, i) => (
                <div key={img.id} className="space-y-2">
                  <div className="rounded-xl overflow-hidden border border-white/10">
                    <img src={`data:image/png;base64,${img.base64}`} alt={img.conceptName} className="w-full" />
                  </div>
                  <p className="text-xs text-white/50 text-center truncate">{img.conceptName}</p>
                  <button
                    onClick={() => {
                      const a = document.createElement('a');
                      a.href = `data:image/png;base64,${img.base64}`;
                      a.download = `${brandKit?.name || 'concepto'}-${i + 1}-${img.conceptName.replace(/\s+/g, '-')}.png`;
                      a.click();
                    }}
                    className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white text-xs px-3 py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Descargar
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={downloadAllSelected}
                className="bg-[#e42820] hover:bg-[#e42820] text-white font-medium px-6 py-3 rounded-xl transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Descargar todos ({selectedConcepts.length})
              </button>
              <button
                onClick={reset}
                className="text-white/40 hover:text-white/70 text-sm transition-colors border border-white/10 hover:border-white/20 px-4 py-3 rounded-xl"
              >
                Nueva campaña
              </button>
            </div>

            {/* Adaptaciones de tamaño */}
            <div className="border-t border-white/10 pt-6 space-y-4">
              <div>
                <h3 className="text-base font-semibold mb-1">Adaptaciones de tamaño</h3>
                <p className="text-white/40 text-sm">Generá los mismos conceptos en otros formatos.</p>
              </div>
              {[
                { group: 'RRSS', items: [
                  { key: 'story', label: 'Story 9:16', desc: 'Instagram / TikTok' },
                  { key: 'feed45', label: 'Feed 4:5', desc: 'Instagram / Facebook' },
                  { key: 'square', label: 'Cuadrado 1:1', desc: 'Instagram / Facebook' },
                  { key: 'landscape', label: 'Landscape 16:9', desc: 'Facebook / YouTube' },
                ]},
                { group: 'Google Ads / PMax', items: [
                  { key: 'pmax_square', label: '1:1', desc: 'PMax · Display' },
                  { key: 'pmax_landscape', label: '1.91:1', desc: 'PMax · Display' },
                  { key: 'pmax_portrait', label: '4:5', desc: 'PMax · Display' },
                ]},
                { group: 'Banners & Email', items: [
                  { key: 'banner_desktop', label: 'Banner Desktop', desc: '1950×450' },
                  { key: 'banner_mobile', label: 'Banner Mobile', desc: '800×800' },
                  { key: 'webpush', label: 'Webpush', desc: '720×360' },
                  { key: 'mailing', label: 'Mailing', desc: '600×alto email' },
                ]},
              ].map(({ group, items }) => (
                <div key={group} className="space-y-2">
                  <p className="text-xs text-white/40 font-medium uppercase tracking-wider">{group}</p>
                  <div className="flex flex-wrap gap-3">
                    {items.map(f => (
                      <button
                        key={f.key}
                        onClick={() => setAdaptFormats(prev => prev.includes(f.key) ? prev.filter(x => x !== f.key) : [...prev, f.key])}
                        className={`px-4 py-2.5 rounded-xl border text-left transition-all ${
                          adaptFormats.includes(f.key)
                            ? 'border-[#e42820] bg-[#e42820]/10'
                            : 'border-white/10 hover:border-white/20 bg-white/5'
                        }`}
                      >
                        <p className="text-sm font-medium">{f.label}</p>
                        <p className="text-xs text-white/40">{f.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <button
                onClick={generateAdaptations}
                disabled={adaptFormats.length === 0 || generatingAdaptations}
                className="bg-white/10 hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium px-5 py-2.5 rounded-xl transition-colors flex items-center gap-2 text-sm"
              >
                {generatingAdaptations ? (
                  <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Generando adaptaciones...</>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                    </svg>
                    Generar {adaptFormats.length > 0 ? `${adaptFormats.length} formato${adaptFormats.length > 1 ? 's' : ''} × ${selectedConcepts.length} concepto${selectedConcepts.length > 1 ? 's' : ''}` : 'adaptaciones'}
                  </>
                )}
              </button>

              {adaptedImages.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs text-white/40 font-medium uppercase tracking-wider">Adaptaciones generadas</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {adaptedImages.map((img, i) => {
                      const concept = selectedConcepts.find(c => c.id === img.conceptId);
                      return (
                        <div key={i} className="space-y-2">
                          <div className="rounded-xl overflow-hidden border border-white/10">
                            <img src={`data:image/png;base64,${img.base64}`} alt={img.label} className="w-full" />
                          </div>
                          <p className="text-xs text-white/50 text-center">{img.label} · {concept?.conceptName || ''}</p>
                          <button
                            onClick={() => {
                              const url = URL.createObjectURL(new Blob([Uint8Array.from(atob(img.base64), c => c.charCodeAt(0))], { type: 'image/png' }));
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `${brandKit?.name || 'concepto'}-${img.label.replace(/\s+/g, '-')}-${i + 1}.png`;
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                              setTimeout(() => URL.revokeObjectURL(url), 5000);
                            }}
                            className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white text-xs px-3 py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Descargar
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
