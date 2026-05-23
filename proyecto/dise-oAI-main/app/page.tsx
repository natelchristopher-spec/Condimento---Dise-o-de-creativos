'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { createSupabaseBrowser } from '@/app/lib/supabase-browser';
import { useRequireAuth } from '@/app/lib/use-auth';
import { BrandKit, GeneratedImage, Step, PeopleMode } from './types';
import ImageCard from './components/ImageCard';
import StepIndicator from './components/StepIndicator';
import LoadingGrid from './components/LoadingGrid';
import Sidebar from './components/Sidebar';

export default function Home() {
  const [brandKit, setBrandKit] = useState<BrandKit | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [brief, setBrief] = useState('');
  const [clientRequest, setClientRequest] = useState('');
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const [productUrl, setProductUrl] = useState('');
  const [scrapingUrl, setScrapingUrl] = useState(false);

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
  const [applyProgress, setApplyProgress] = useState<{ current: number; total: number } | null>(null);
  const [productDescription, setProductDescription] = useState('');
  const [personDescription, setPersonDescription] = useState('');

  const [refineImage, setRefineImage] = useState<GeneratedImage | null>(null);
  const [refineInput, setRefineInput] = useState('');
  const [refineHistory, setRefineHistory] = useState<string[]>([]);
  const [refineImageHistory, setRefineImageHistory] = useState<string[]>([]);
  const refineInputRef = useRef<HTMLInputElement>(null);

  const [applyStatuses, setApplyStatuses] = useState<Array<'pending' | 'applying' | 'done'>>([]);
  const [refineInputs, setRefineInputs] = useState<string[]>([]);
  const [refineHistories, setRefineHistories] = useState<string[][]>([]);
  const [refineImageHistories, setRefineImageHistories] = useState<string[][]>([]);
  const [refiningIndex, setRefiningIndex] = useState<number | null>(null);
  const [applyElapsed, setApplyElapsed] = useState(0);
  const applyTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useRequireAuth();
  const supabase = createSupabaseBrowser();

  useEffect(() => {
    const isApplyingAny = applyStatuses.some(s => s === 'applying');
    if (isApplyingAny) {
      if (!applyTimerRef.current) {
        setApplyElapsed(0);
        applyTimerRef.current = setInterval(() => setApplyElapsed(s => s + 1), 1000);
      }
    } else {
      if (applyTimerRef.current) {
        clearInterval(applyTimerRef.current);
        applyTimerRef.current = null;
      }
    }
  }, [applyStatuses]);

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
      img.src = base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`;
    });

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
    setProductDetailImages(prev => [...prev, ...imgs].slice(0, 2));
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
      if (!res.ok) throw new Error(data.error || 'Error al scrapear');
      setClientRequest(data.clientRequest);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer la URL');
    } finally {
      setScrapingUrl(false);
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000); // 5 min
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
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(await res.text());
      const { productDescription: pd, personDescription: prd } = await parseConceptStream(res, img =>
        setConcepts(prev => [...prev, img])
      );
      setProductDescription(pd);
      setPersonDescription(prd);
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        setError('La generación tardó demasiado. Intentá con menos conceptos.');
      } else {
        setError(e instanceof Error ? e.message : 'Error generando conceptos');
      }
      setStep('brief');
    } finally {
      clearTimeout(timeout);
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000); // 5 min
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
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(await res.text());
      const { productDescription: pd } = await parseConceptStream(res, img =>
        setConcepts(prev => [...prev, img])
      );
      if (pd && !productDescription) setProductDescription(pd);
      setSelectedConcepts([]);
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        setError('La generación tardó demasiado. Intentá con menos conceptos.');
      } else {
        setError(e instanceof Error ? e.message : 'Error generando similares');
      }
    } finally {
      clearTimeout(timeout);
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

  const applyRefinement = async (conceptIndex: number) => {
    const input = refineInputs[conceptIndex]?.trim();
    if (!input || !brandKit) return;
    setRefiningIndex(conceptIndex);
    setRefineInputs(prev => { const n = [...prev]; n[conceptIndex] = ''; return n; });
    setError('');
    try {
      const concept = selectedConcepts[conceptIndex];
      const res = await fetch('/api/adjust-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: concept.base64,
          instruction: input,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { base64, error: apiError } = await res.json();
      if (apiError) throw new Error(apiError);
      setRefineImageHistories(prev => {
        const n = prev.map(h => [...h]);
        n[conceptIndex] = [...n[conceptIndex], concept.base64];
        return n;
      });
      setRefineHistories(prev => {
        const n = prev.map(h => [...h]);
        n[conceptIndex] = [...n[conceptIndex], input];
        return n;
      });
      setSelectedConcepts(prev => prev.map((c, i) => i === conceptIndex ? { ...c, base64 } : c));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error aplicando ajuste');
    } finally {
      setRefiningIndex(null);
    }
  };

  const undoRefinement = (conceptIndex: number) => {
    const imageHistory = refineImageHistories[conceptIndex];
    if (!imageHistory?.length) return;
    const prevBase64 = imageHistory[imageHistory.length - 1];
    setRefineImageHistories(prev => {
      const n = prev.map(h => [...h]);
      n[conceptIndex] = n[conceptIndex].slice(0, -1);
      return n;
    });
    setRefineHistories(prev => {
      const n = prev.map(h => [...h]);
      n[conceptIndex] = n[conceptIndex].slice(0, -1);
      return n;
    });
    setSelectedConcepts(prev => prev.map((c, i) => i === conceptIndex ? { ...c, base64: prevBase64 } : c));
  };

  const enterRefine = async () => {
    if (selectedConcepts.length === 0 || !brandKit) return;
    const n = selectedConcepts.length;
    setRefineInputs(Array(n).fill(''));
    setRefineHistories(Array(n).fill([]));
    setRefineImageHistories(Array(n).fill([]));
    setRefiningIndex(null);
    setError('');

    if (productDetailImages.length > 0 && peopleMode === 'real') {
      const statuses: Array<'pending' | 'applying' | 'done'> = Array(n).fill('pending');
      setApplyStatuses([...statuses]);
      setStep('refine');

      const applied = [...selectedConcepts];
      for (let i = 0; i < n; i++) {
        statuses[i] = 'applying';
        setApplyStatuses([...statuses]);
        try {
          const compressedConcept = await compressToJpeg(applied[i].base64);
          const compressedProducts = await Promise.all(productDetailImages.map(img => compressToJpeg(img)));
          const res = await fetch('/api/apply-product', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              conceptImageBase64: compressedConcept,
              productDetailImages: compressedProducts,
              productDescription,
              peopleMode,
              personDescription,
            }),
          });
          const { base64, error: apiError } = await res.json();
          if (apiError) setError(`Concepto ${i + 1}: ${apiError}`);
          if (base64) {
            applied[i] = { ...applied[i], base64 };
            setSelectedConcepts(prev => prev.map((c, idx) => idx === i ? applied[i] : c));
          }
        } catch { /* keep original */ }
        statuses[i] = 'done';
        setApplyStatuses([...statuses]);
      }
    } else {
      setApplyStatuses(Array(n).fill('done'));
      setStep('refine');
    }
  };

  const saveRefinedAndNext = () => {
    const nextIndex = refineIndex + 1;
    setRefineIndex(nextIndex);
    setRefineHistory([]);
    setRefineImageHistory([]);
    setRefineInput('');
    setRefineImage(selectedConcepts[nextIndex]);
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
    setProductUrl('');
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
    setApplyStatuses([]);
    setRefineInputs([]);
    setRefineHistories([]);
    setRefineImageHistories([]);
    setRefiningIndex(null);
  };

  const regenerateConcepts = async () => {
    setSelectedConcepts([]);
    setRefineIndex(0);
    await generateConcepts();
  };

  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar active="/" onLogout={handleLogout} userEmail={userEmail} />
      <div className="flex-1 md:ml-56 min-h-screen flex flex-col pt-12 md:pt-0">
        {step !== 'brief' && (
          <div className="border-b border-gray-200 px-6 py-3 flex items-center gap-4 bg-white">
            <StepIndicator currentStep={step} />
            <button onClick={reset} className="ml-auto text-xs text-gray-400 hover:text-gray-500 transition-colors">
              Nueva campaña
            </button>
          </div>
        )}
      <main className="max-w-5xl mx-auto w-full px-6 py-10 space-y-10">

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm flex items-start gap-2">
            <span className="mt-0.5">⚠</span>
            <span>{error}</span>
          </div>
        )}

        {/* Step: BRIEF / DASHBOARD */}
        {step === 'brief' && (
          <div className="space-y-8">

            {/* Skeleton mientras carga el estado inicial */}
            {hasApiKey === null && (
              <div className="space-y-5 animate-pulse">
                <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
                  <div className="h-3 w-24 bg-gray-200 rounded-full" />
                  <div className="h-12 bg-gray-100 rounded-xl" />
                  <div className="h-12 bg-gray-100 rounded-xl" />
                </div>
                <div className="h-3 w-16 bg-gray-200 rounded-full" />
                <div className="grid grid-cols-3 gap-3">
                  {[1,2,3].map(i => <div key={i} className="h-20 bg-white border border-gray-200 rounded-xl" />)}
                </div>
              </div>
            )}

            {/* ── DASHBOARD: setup + modules ── */}
            {hasApiKey !== null && (
              <div className="space-y-5">

                {/* Setup checklist — only shown when something is missing */}
                {!(hasApiKey && brandKit) && <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Configuración</p>
                  {/* API Key */}
                  <div className={`flex items-center gap-3 p-3.5 rounded-xl border ${hasApiKey ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${hasApiKey ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-700'}`}>
                      {hasApiKey ? '✓' : '1'}
                    </div>
                    <p className={`flex-1 text-sm font-medium ${hasApiKey ? 'text-emerald-700' : 'text-amber-800'}`}>
                      {hasApiKey ? 'API key de OpenAI conectada' : 'Conectá tu API key de OpenAI'}
                    </p>
                    {!hasApiKey && (
                      <Link href="/perfil" className="shrink-0 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                        Configurar
                      </Link>
                    )}
                  </div>
                  {/* Brand kit */}
                  <div className={`flex items-center gap-3 p-3.5 rounded-xl border ${brandKit ? 'border-emerald-200 bg-emerald-50' : hasApiKey ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-gray-50'}`}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${brandKit ? 'bg-emerald-100 text-emerald-600' : hasApiKey ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-400'}`}>
                      {brandKit ? '✓' : '2'}
                    </div>
                    <p className={`flex-1 text-sm font-medium ${brandKit ? 'text-emerald-700' : hasApiKey ? 'text-amber-800' : 'text-gray-400'}`}>
                      {brandKit ? `Marca: ${brandKit.name}` : 'Configurá tu marca'}
                    </p>
                    {!brandKit && hasApiKey && (
                      <Link href="/config" className="shrink-0 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                        Configurar
                      </Link>
                    )}
                  </div>
                </div>}

                {/* Module cards */}
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Módulos</p>
                  <div className="grid grid-cols-3 gap-3">
                    {([
                      { href: '/', label: 'Anuncios', desc: 'Conceptos para redes y ads', current: true },
                      { href: '/pdp', label: 'PDP', desc: '6 imágenes de producto' },
                      { href: '/redes', label: 'Carruseles IG', desc: '3 slides por carrusel' },
                    ] as { href: string; label: string; desc: string; current?: boolean }[]).map(mod => {
                      const enabled = !!(hasApiKey && brandKit);
                      return (
                        <div key={mod.href} className="relative group">
                          <Link
                            href={enabled ? mod.href : '#'}
                            onClick={!enabled ? (e: React.MouseEvent) => e.preventDefault() : undefined}
                            className={`block p-4 rounded-xl border transition-all text-left ${
                              mod.current && enabled
                                ? 'border-[#e42820]/40 bg-[#e42820]/5'
                                : enabled
                                  ? 'border-gray-200 bg-white hover:border-[#e42820]/40 hover:bg-[#e42820]/[0.02]'
                                  : 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                            }`}
                          >
                            <p className={`text-sm font-semibold ${mod.current && enabled ? 'text-[#e42820]' : 'text-gray-900'}`}>{mod.label}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{mod.desc}</p>
                          </Link>
                          {!enabled && (
                            <div className="absolute inset-0 flex items-end justify-center pb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                              <span className="bg-gray-900/80 text-white text-[10px] rounded-md px-2 py-1 whitespace-nowrap">Completá el setup primero</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ── ANUNCIOS FORM — only when setup complete ── */}
            {hasApiKey && brandKit && (
            <div className="space-y-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-1">Anuncios</h1>
              <p className="text-gray-500 text-sm">Describí lo que necesitás y la IA generará tus creativos y adaptaciones.</p>
            </div>

            {/* URL scraper */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Importar desde URL de producto</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={productUrl}
                  onChange={e => setProductUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !scrapingUrl && scrapeProduct()}
                  placeholder="https://tienda.com/producto/..."
                  className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 placeholder-gray-300 focus:outline-none focus:border-[#e42820] text-sm"
                />
                <button
                  onClick={scrapeProduct}
                  disabled={!productUrl.trim() || scrapingUrl}
                  className="shrink-0 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed border border-gray-200 hover:border-gray-300 text-gray-600 hover:text-gray-900 text-sm font-medium px-4 py-2.5 rounded-xl transition-all flex items-center gap-2"
                >
                  {scrapingUrl ? (
                    <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Leyendo...</>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                      Leer producto
                    </>
                  )}
                </button>
              </div>
              <p className="text-[11px] text-gray-400">Pegá la URL del producto y la IA extrae precio, descuentos, cuotas y arma la solicitud automáticamente.</p>
            </div>

            {/* Brief generator */}
            <div className="space-y-3">
              <div>
                <label className="text-sm font-semibold text-gray-700">¿Dime que quieres que diseñe para ti?</label>
                <p className="text-xs text-gray-900/35 mt-1">Sé específico: ¿hay descuentos? ¿Es un lanzamiento, una sale o una campaña de marca? Incluí fechas, productos destacados, mecánicas (cuotas, envío gratis) y cualquier detalle relevante.</p>
              </div>
              <div className="flex gap-2 items-start">
                <textarea
                  value={clientRequest}
                  onChange={e => setClientRequest(e.target.value)}
                  placeholder="Ej: 'Quiero lanzar la campaña de verano con 30% OFF en toda la colección. Los productos estrella son vestidos y trajes de baño. Público: mujeres 25-40. Paleta cálida, colores coral y turquesa. Termina el 31 de enero.'"
                  rows={4}
                  className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#e42820] resize-none text-sm leading-relaxed"
                />
                <button
                  onClick={generateBrief}
                  disabled={!clientRequest.trim() || generatingBrief}
                  className="shrink-0 bg-[#e42820]/80 hover:bg-[#e42820] disabled:opacity-40 disabled:cursor-not-allowed text-gray-900 text-sm font-medium px-4 py-3 rounded-xl transition-colors flex items-center gap-2 whitespace-nowrap"
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
              <label className="text-sm font-medium text-gray-600">Brief de campaña</label>
              <textarea
                value={brief}
                onChange={e => setBrief(e.target.value)}
                placeholder="El brief aparecerá acá. También podés escribirlo directamente."
                rows={5}
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#e42820] resize-none text-sm leading-relaxed"
              />
            </div>

            {/* Concept count selector */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-600">¿Cuántos conceptos querés generar?</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5, 6].map(n => (
                  <button
                    key={n}
                    onClick={() => setConceptCount(n)}
                    className={`w-12 h-12 rounded-xl border text-base font-semibold transition-all ${
                      conceptCount === n
                        ? 'border-[#e42820] bg-[#e42820]/10 text-[#e42820]'
                        : 'border-gray-200 hover:border-gray-300 bg-white text-gray-500'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400">Cada número corresponde a un framework distinto. Más conceptos = más tiempo y crédito de OpenAI.</p>
            </div>

            {/* People mode */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-600">Tipo de imagen</label>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { value: 'none', label: 'PRODUCTO', desc: 'Hero · Oferta · Beneficio · Feature · Problema/Solución · Uso cotidiano', icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
                  { value: 'real', label: 'FASHION', desc: 'Oferta · Lifestyle · Aspiracional · Transformación · Uso diario · Detalle', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
                ] as const).map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => { setPeopleMode(opt.value); if (opt.value !== 'real') setReferenceImages([]); setProductDetailImages([]); }}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      peopleMode === opt.value
                        ? 'border-[#e42820] bg-[#e42820]/10'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <svg className={`w-5 h-5 mb-2 ${peopleMode === opt.value ? 'text-[#e42820]' : 'text-gray-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={opt.icon} />
                    </svg>
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-500">Foto del producto / estampado en detalle</p>
                <p className="text-xs text-gray-400">Primer plano sobre fondo neutro — más detalle = mejor resultado.</p>
                <div className="flex gap-3 flex-wrap">
                  {productDetailImages.map((img, i) => (
                    <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-gray-200">
                      <img src={img} alt={`prod ${i+1}`} className="w-full h-full object-cover" />
                      <button
                        onClick={() => setProductDetailImages(prev => prev.filter((_, idx) => idx !== i))}
                        className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center text-gray-700 hover:text-gray-900 text-xs"
                      >×</button>
                    </div>
                  ))}
                  {productDetailImages.length < 2 && (
                    <label className="w-20 h-20 rounded-xl border border-dashed border-gray-300 hover:border-white/40 flex flex-col items-center justify-center cursor-pointer transition-colors gap-1">
                      <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      <span className="text-xs text-gray-400">Foto</span>
                      <input type="file" accept="image/*" multiple onChange={handleProductDetailUpload} className="hidden" />
                    </label>
                  )}
                </div>
              </div>

              {peopleMode === 'real' && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-500">Foto de la persona usando el producto</p>
                  <div className="flex gap-3 flex-wrap">
                    {referenceImages.map((img, i) => (
                      <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-gray-200">
                        <img src={img} alt={`ref ${i+1}`} className="w-full h-full object-cover" />
                        <button
                          onClick={() => setReferenceImages(prev => prev.filter((_, idx) => idx !== i))}
                          className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center text-gray-700 hover:text-gray-900 text-xs"
                        >×</button>
                      </div>
                    ))}
                    {referenceImages.length < 2 && (
                      <label className="w-20 h-20 rounded-xl border border-dashed border-gray-300 hover:border-white/40 flex flex-col items-center justify-center cursor-pointer transition-colors gap-1">
                        <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span className="text-xs text-gray-400">Foto</span>
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
              className="bg-[#e42820] hover:bg-[#e42820] disabled:opacity-40 disabled:cursor-not-allowed text-gray-900 font-medium px-6 py-3 rounded-xl transition-colors flex items-center gap-2"
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

          </div>
        )}

        {/* Step: CONCEPTS */}
        {step === 'concepts' && (
          <div className="space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold mb-1">Elegí hasta 3 conceptos</h2>
                <p className="text-gray-500 text-sm">Seleccioná los que más te gustan para afinarlos</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={regenerateConcepts}
                  disabled={loading}
                  className="text-sm text-gray-500 hover:text-gray-700 transition-colors border border-gray-200 hover:border-gray-300 px-3 py-1.5 rounded-lg disabled:opacity-40 flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Regenerar
                </button>
                <button onClick={reset} className="text-gray-500 hover:text-gray-600 text-sm transition-colors">
                  ← Volver
                </button>
              </div>
            </div>

            {loading && (
              <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 space-y-2">
                {applyProgress ? (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-700 font-medium">
                        Aplicando producto — concepto {applyProgress.current} de {applyProgress.total}
                      </span>
                      <span className="text-gray-400 text-xs tabular-nums">{elapsedSec}s</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div
                        className="bg-[#e42820] h-1.5 rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(95, Math.max(8, ((applyProgress.current - 1) / applyProgress.total) * 100 + (elapsedSec / 90) * (100 / applyProgress.total)))  }%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400">
                      {elapsedSec < 20 ? 'Cada concepto tarda entre 30 y 90 segundos — esto es normal.' :
                       elapsedSec < 60 ? `${elapsedSec}s — procesando...` :
                       elapsedSec < 100 ? `${elapsedSec}s — casi listo...` :
                       `${elapsedSec}s — tardando más de lo usual, aguantá`}
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600 font-medium">
                        {concepts.length === 0
                          ? 'Preparando conceptos...'
                          : `${concepts.length} de ${generatingCount} concepto${generatingCount > 1 ? 's' : ''} listo${concepts.length > 1 ? 's' : ''}`}
                      </span>
                      <span className="text-gray-400 text-xs tabular-nums">{elapsedSec}s</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div
                        className="bg-[#e42820] h-1.5 rounded-full transition-all duration-500"
                        style={{ width: `${generatingCount > 0 ? Math.max(5, (concepts.length / generatingCount) * 100) : 5}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400">
                      {elapsedSec < 15 ? 'Cada imagen tarda entre 20 y 40 segundos — se van mostrando a medida que llegan.' :
                       elapsedSec < 45 ? 'Ya casi... la IA está renderizando los detalles.' :
                       'Tardando un poco más de lo usual, pero vienen bien.'}
                    </p>
                  </>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {concepts.map(img => {
                const selIdx = selectedConcepts.findIndex(c => c.id === img.id);
                const isSelected = selIdx !== -1;
                return (
                  <div key={img.id} className="relative">
                    <ImageCard image={img} selected={isSelected} onClick={() => toggleConceptSelection(img)} />
                    {isSelected && (
                      <div className="absolute top-2 left-2 w-6 h-6 bg-[#e42820] rounded-full flex items-center justify-center text-xs font-bold text-gray-900">
                        {selIdx + 1}
                      </div>
                    )}
                  </div>
                );
              })}
              {loading && Array.from({ length: Math.max(0, generatingCount - concepts.length) }).map((_, i) => (
                <div key={`skeleton-${i}`} className="aspect-[2/3] rounded-xl border border-gray-200 bg-white animate-pulse flex flex-col justify-end p-3 gap-2">
                  <div className="flex items-center justify-center flex-1">
                    <div className="w-6 h-6 border-2 border-gray-300 border-t-white/60 rounded-full animate-spin" />
                  </div>
                  <div className="h-2.5 bg-gray-300 rounded-full w-2/3" />
                </div>
              ))}
            </div>


            <div className="flex items-center justify-between pt-2 flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <p className="text-gray-500 text-sm">
                  {selectedConcepts.length === 0 ? 'Hacé click para seleccionar' : `${selectedConcepts.length} seleccionado${selectedConcepts.length > 1 ? 's' : ''}`}
                </p>
                {selectedConcepts.length > 0 && (
                  <button
                    onClick={downloadAllSelected}
                    className="text-gray-500 hover:text-gray-700 text-sm border border-gray-200 hover:border-gray-300 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
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
                    className="text-gray-500 hover:text-[#e42820] text-sm border border-gray-200 hover:border-[#e42820]/50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40 flex items-center gap-1.5"
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
                className="bg-[#e42820] hover:bg-[#e42820] disabled:opacity-40 disabled:cursor-not-allowed text-gray-900 font-medium px-6 py-3 rounded-xl transition-colors flex items-center gap-2"
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
        {step === 'refine' && (
          <div className="space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold mb-1">Afiná los conceptos</h2>
                <p className="text-gray-500 text-sm">
                  {applyStatuses.some(s => s !== 'done')
                    ? 'Aplicando producto — los conceptos se van desbloqueando a medida que están listos'
                    : 'Editá cada concepto directamente'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setStep('concepts')} className="text-gray-500 hover:text-gray-600 text-sm transition-colors">← Volver</button>
                <button
                  onClick={finishRefine}
                  disabled={applyStatuses.some(s => s !== 'done')}
                  className="bg-[#e42820] hover:bg-[#c41f18] disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium px-4 py-2 rounded-xl transition-colors text-sm flex items-center gap-2"
                >
                  Finalizar
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                </button>
              </div>
            </div>

            <div className="space-y-6">
              {selectedConcepts.map((concept, i) => {
                const status = applyStatuses[i] ?? 'done';
                const isApplying = status === 'pending' || status === 'applying';
                const isRefining = refiningIndex === i;
                const busy = isApplying || isRefining;
                const history = refineHistories[i] || [];
                const imageHistory = refineImageHistories[i] || [];
                const input = refineInputs[i] || '';

                return (
                  <div key={concept.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                    <div className="flex flex-col md:flex-row gap-0">
                      {/* Image */}
                      <div className="relative md:w-72 shrink-0">
                        <img
                          src={`data:image/png;base64,${concept.base64}`}
                          alt={concept.conceptName}
                          className={`w-full h-full object-cover transition-all duration-300 ${isRefining ? 'blur-sm' : ''}`}
                          style={{ maxHeight: '520px', objectFit: 'cover' }}
                        />
                        {isApplying && (
                          <div className="absolute inset-0 bg-white/90 flex flex-col items-center justify-center gap-3 px-6 text-center">
                            {status === 'applying' ? (
                              <>
                                <div className="w-8 h-8 border-[3px] border-[#e42820] border-t-transparent rounded-full animate-spin" />
                                <p className="text-sm text-gray-800 font-semibold">
                                  {applyElapsed < 15 ? 'Analizando el producto...' :
                                   applyElapsed < 35 ? 'Aplicando al concepto...' :
                                   applyElapsed < 55 ? 'Refinando detalles...' :
                                   applyElapsed < 80 ? 'Casi listo...' :
                                   'Un poco más, aguantá...'}
                                </p>
                                <div className="w-full max-w-[160px] bg-gray-200 rounded-full h-1.5">
                                  <div
                                    className="bg-[#e42820] h-1.5 rounded-full transition-all duration-1000"
                                    style={{ width: `${Math.min(92, Math.max(4, (applyElapsed / 90) * 100))}%` }}
                                  />
                                </div>
                                <p className="text-xs text-gray-400 tabular-nums">{applyElapsed}s</p>
                              </>
                            ) : (
                              <>
                                <div className="w-6 h-6 rounded-full border-2 border-gray-300 flex items-center justify-center">
                                  <div className="w-2 h-2 rounded-full bg-gray-300" />
                                </div>
                                <p className="text-xs text-gray-400">En cola...</p>
                              </>
                            )}
                          </div>
                        )}
                        {isRefining && (
                          <div className="absolute inset-0 bg-white/70 flex flex-col items-center justify-center gap-3">
                            <div className="w-8 h-8 border-[3px] border-[#e42820] border-t-transparent rounded-full animate-spin" />
                            <p className="text-sm text-gray-700 font-medium">Aplicando ajuste...</p>
                          </div>
                        )}
                      </div>

                      {/* Controls */}
                      <div className="flex-1 p-5 space-y-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-semibold text-gray-900 text-sm">{concept.conceptName}</p>
                            <p className="text-xs text-gray-400">{i + 1} de {selectedConcepts.length}</p>
                          </div>
                          <button
                            onClick={() => {
                              const a = document.createElement('a');
                              a.href = `data:image/png;base64,${concept.base64}`;
                              a.download = `${brandKit?.name || 'concepto'}-${i + 1}-${concept.conceptName.replace(/\s+/g, '-')}.png`;
                              a.click();
                            }}
                            disabled={isApplying}
                            className="text-gray-400 hover:text-gray-600 disabled:opacity-30 transition-colors"
                            title="Descargar"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                          </button>
                        </div>

                        {history.length > 0 && (
                          <div className="space-y-1 max-h-20 overflow-y-auto">
                            {history.map((h, j) => (
                              <div key={j} className="bg-gray-50 rounded-lg px-3 py-1.5 text-xs text-gray-500 flex items-start gap-1.5">
                                <span className="text-[#e42820] mt-0.5">✓</span>{h}
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="space-y-2">
                          <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Ajustes rápidos</p>
                          <div className="flex flex-wrap gap-1.5">
                            {[
                              ...(brandKit?.quickAdjustments || []),
                              ...(productDetailImages.length > 0 && peopleMode === 'none'
                                ? ['Fondo más oscuro', 'Fondo blanco limpio', 'Más contraste', 'Producto más grande', 'Colores más vibrantes']
                                : ['Fondo más oscuro', 'Fondo blanco limpio', 'Más contraste', 'Iluminación más suave', 'Colores más vibrantes', 'Modelo mujer joven', 'Modelo hombre joven', 'Solo producto flat lay', 'Agregar texto de marca']
                              ),
                            ].map((preset, j) => {
                              const isClientPreset = j < (brandKit?.quickAdjustments?.length || 0);
                              return (
                                <button
                                  key={`${preset}-${j}`}
                                  onClick={() => {
                                    if (!busy) setRefineInputs(prev => { const n = [...prev]; n[i] = preset; return n; });
                                  }}
                                  disabled={busy}
                                  className={`text-xs px-2.5 py-1 rounded-lg transition-colors border disabled:opacity-40 ${
                                    isClientPreset
                                      ? 'bg-[#e42820]/10 border-[#e42820]/30 text-[#e42820] hover:bg-[#e42820]/20'
                                      : 'bg-white hover:bg-gray-100 border-gray-200 text-gray-500 hover:text-gray-900'
                                  }`}
                                >
                                  {preset}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={input}
                            onChange={e => { if (!busy) setRefineInputs(prev => { const n = [...prev]; n[i] = e.target.value; return n; }); }}
                            onKeyDown={e => { if (e.key === 'Enter' && !busy && input.trim()) applyRefinement(i); }}
                            placeholder="O escribí tu ajuste..."
                            disabled={busy}
                            className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#e42820] text-sm disabled:opacity-50"
                          />
                          <button
                            onClick={() => applyRefinement(i)}
                            disabled={!input.trim() || busy}
                            className="bg-[#e42820] hover:bg-[#c41f18] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-4 py-2.5 rounded-xl transition-colors text-sm whitespace-nowrap"
                          >
                            {isRefining ? 'Aplicando...' : 'Aplicar'}
                          </button>
                          {imageHistory.length > 0 && (
                            <button
                              onClick={() => undoRefinement(i)}
                              disabled={busy}
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
                );
              })}
            </div>
          </div>
        )}

        {/* Step: DONE */}
        {step === 'done' && (
          <div className="space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold mb-1">¡Listos para descargar!</h2>
                <p className="text-gray-500 text-sm">{selectedConcepts.length} concepto{selectedConcepts.length > 1 ? 's' : ''} finalizado{selectedConcepts.length > 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setStep('refine')} className="text-gray-500 hover:text-gray-600 text-sm transition-colors">
                ← Volver a afinación
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {selectedConcepts.map((img, i) => (
                <div key={img.id} className="space-y-2">
                  <div className="rounded-xl overflow-hidden border border-gray-200">
                    <img src={`data:image/png;base64,${img.base64}`} alt={img.conceptName} className="w-full" />
                  </div>
                  <p className="text-xs text-gray-500 text-center truncate">{img.conceptName}</p>
                  <button
                    onClick={() => {
                      const a = document.createElement('a');
                      a.href = `data:image/png;base64,${img.base64}`;
                      a.download = `${brandKit?.name || 'concepto'}-${i + 1}-${img.conceptName.replace(/\s+/g, '-')}.png`;
                      a.click();
                    }}
                    className="w-full bg-white hover:bg-gray-100 border border-gray-200 text-gray-500 hover:text-gray-900 text-xs px-3 py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5"
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
                className="bg-[#e42820] hover:bg-[#e42820] text-gray-900 font-medium px-6 py-3 rounded-xl transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Descargar todos ({selectedConcepts.length})
              </button>
              <button
                onClick={reset}
                className="text-gray-500 hover:text-gray-600 text-sm transition-colors border border-gray-200 hover:border-gray-300 px-4 py-3 rounded-xl"
              >
                Nueva campaña
              </button>
            </div>

            {/* Adaptaciones de tamaño */}
            <div className="border-t border-gray-200 pt-6 space-y-4">
              <div>
                <h3 className="text-base font-semibold mb-1">Adaptaciones de tamaño</h3>
                <p className="text-gray-500 text-sm">Generá los mismos conceptos en otros formatos.</p>
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
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">{group}</p>
                  <div className="flex flex-wrap gap-3">
                    {items.map(f => (
                      <button
                        key={f.key}
                        onClick={() => setAdaptFormats(prev => prev.includes(f.key) ? prev.filter(x => x !== f.key) : [...prev, f.key])}
                        className={`px-4 py-2.5 rounded-xl border text-left transition-all ${
                          adaptFormats.includes(f.key)
                            ? 'border-[#e42820] bg-[#e42820]/10'
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                      >
                        <p className="text-sm font-medium">{f.label}</p>
                        <p className="text-xs text-gray-500">{f.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <button
                onClick={generateAdaptations}
                disabled={adaptFormats.length === 0 || generatingAdaptations}
                className="bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed text-gray-900 font-medium px-5 py-2.5 rounded-xl transition-colors flex items-center gap-2 text-sm"
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
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Adaptaciones generadas</p>
                    <button
                      onClick={() => {
                        adaptedImages.forEach((img, i) => {
                          const concept = selectedConcepts.find(c => c.id === img.conceptId);
                          const url = URL.createObjectURL(new Blob([Uint8Array.from(atob(img.base64), c => c.charCodeAt(0))], { type: 'image/png' }));
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `${brandKit?.name || 'concepto'}-${img.label.replace(/\s+/g, '-')}-${concept?.conceptName?.replace(/\s+/g, '-') || i + 1}.png`;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          setTimeout(() => URL.revokeObjectURL(url), 5000);
                        });
                      }}
                      className="flex items-center gap-1.5 text-xs text-[#e42820] hover:text-[#c41f18] font-medium transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Descargar todas ({adaptedImages.length})
                    </button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {adaptedImages.map((img, i) => {
                      const concept = selectedConcepts.find(c => c.id === img.conceptId);
                      return (
                        <div key={i} className="space-y-2">
                          <div className="rounded-xl overflow-hidden border border-gray-200">
                            <img src={`data:image/png;base64,${img.base64}`} alt={img.label} className="w-full" />
                          </div>
                          <p className="text-xs text-gray-500 text-center">{img.label} · {concept?.conceptName || ''}</p>
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
                            className="w-full bg-white hover:bg-gray-100 border border-gray-200 text-gray-500 hover:text-gray-900 text-xs px-3 py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5"
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
    </div>
  );
}
