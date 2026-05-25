'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createSupabaseBrowser } from '@/app/lib/supabase-browser';
import { useRequireAuth } from '@/app/lib/use-auth';
import { BrandKit } from '@/app/types';
import Sidebar from '@/app/components/Sidebar';
import { MessageAngle } from '@/app/api/generate-testing-angles/route';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AngleImage {
  id: string;
  base64: string;
  angleKey: string;
  angleName: string;
  hook: string;
  emphasis: string;
}

interface PECCreative {
  id: string;
  angleKey: string;
  angleName: string;
  hook: string;
  stage: 'P' | 'E' | 'C';
  stageLabel: string;
  formatName: string;
  headline: string;
  subline: string;
  base64: string;
}

interface SessionRow {
  id: string;
  created_at: string;
  updated_at: string;
  status: 'paso1_done' | 'paso2_done';
  brief: string;
  count: number;
  is_fashion_product: boolean;
  angles: MessageAngle[];
  winning_angle_keys: string[];
  pec_results: Omit<PECCreative, 'base64'>[];
}

type OneShootView = 'sessions' | 'setup' | 'p1-generating' | 'p1-results' | 'p2-generating' | 'p2-results';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

const readAsJpeg = (file: File): Promise<string> =>
  new Promise(resolve => {
    const blobUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(blobUrl);
      try {
        let { naturalWidth: w, naturalHeight: h } = img;
        if (!w || !h) { resolve(''); return; }
        const maxDim = 1024;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
          else { w = Math.round(w * maxDim / h); h = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const out = canvas.toDataURL('image/jpeg', 0.82);
        resolve(out.length > 100 ? out : '');
      } catch { resolve(''); }
    };
    img.onerror = () => { URL.revokeObjectURL(blobUrl); resolve(''); };
    img.src = blobUrl;
  });

function downloadImage(base64: string, name: string) {
  const a = document.createElement('a');
  a.href = `data:image/png;base64,${base64}`;
  a.download = name;
  a.click();
}

const lsKey = (id: string) => `one_shoot_images_${id}`;

function saveLsImages(id: string, p1: AngleImage[], p2: PECCreative[]) {
  try {
    localStorage.setItem(lsKey(id), JSON.stringify({ p1, p2 }));
  } catch { /* storage full */ }
}

function loadLsImages(id: string): { p1: AngleImage[]; p2: PECCreative[] } {
  try {
    const raw = localStorage.getItem(lsKey(id));
    if (!raw) return { p1: [], p2: [] };
    return JSON.parse(raw);
  } catch { return { p1: [], p2: [] }; }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function OneShootPage() {
  useRequireAuth();
  const supabase = createSupabaseBrowser();

  const [userEmail, setUserEmail] = useState('');
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [brandKit, setBrandKit] = useState<BrandKit | null>(null);

  // View
  const [view, setView] = useState<OneShootView>('sessions');

  // Sessions list
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);

  // Active session
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Setup
  const [brief, setBrief] = useState('');
  const [productImage, setProductImage] = useState('');
  const [productPreview, setProductPreview] = useState('');
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [count, setCount] = useState(4);
  const productFileRef = useRef<HTMLInputElement>(null);
  const referenceFileRef = useRef<HTMLInputElement>(null);

  // P1 generation
  const [p1Angles, setP1Angles] = useState<MessageAngle[]>([]);
  const [p1Images, setP1Images] = useState<AngleImage[]>([]);
  const [p1Done, setP1Done] = useState(0);
  const [p1Total, setP1Total] = useState(0);
  const [isFashionProduct, setIsFashionProduct] = useState(false);
  const [productDescription, setProductDescription] = useState('');
  const [personDescription, setPersonDescription] = useState('');
  const [p1Error, setP1Error] = useState('');
  const [p1Elapsed, setP1Elapsed] = useState(0);
  const p1TimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // P1 results — winner selection
  const [winnerKeys, setWinnerKeys] = useState<string[]>([]);

  // P2 generation
  const [p2Creatives, setP2Creatives] = useState<PECCreative[]>([]);
  const [p2Done, setP2Done] = useState(0);
  const [p2Total, setP2Total] = useState(0);
  const [p2Error, setP2Error] = useState('');
  const [p2Elapsed, setP2Elapsed] = useState(0);
  const p2TimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Error handling
  const [error, setError] = useState('');

  // ── Load profile ──────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setUserEmail(session.user.email || '');
      const { data: profile } = await supabase
        .from('profiles')
        .select('openai_api_key, brand_kit')
        .eq('id', session.user.id)
        .single();
      setHasApiKey(!!profile?.openai_api_key);
      if (profile?.brand_kit) setBrandKit(profile.brand_kit as BrandKit);
    };
    load();
  }, [supabase]);

  // ── Load sessions ─────────────────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const res = await fetch('/api/one-shoot-sessions');
      if (res.ok) setSessions(await res.json());
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // ── Timers ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (view === 'p1-generating') {
      setP1Elapsed(0);
      p1TimerRef.current = setInterval(() => setP1Elapsed(s => s + 1), 1000);
    } else {
      if (p1TimerRef.current) { clearInterval(p1TimerRef.current); p1TimerRef.current = null; }
    }
    return () => { if (p1TimerRef.current) clearInterval(p1TimerRef.current); };
  }, [view]);

  useEffect(() => {
    if (view === 'p2-generating') {
      setP2Elapsed(0);
      p2TimerRef.current = setInterval(() => setP2Elapsed(s => s + 1), 1000);
    } else {
      if (p2TimerRef.current) { clearInterval(p2TimerRef.current); p2TimerRef.current = null; }
    }
    return () => { if (p2TimerRef.current) clearInterval(p2TimerRef.current); };
  }, [view]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  // ── File handlers ─────────────────────────────────────────────────────────
  const handleProductFile = async (file: File) => {
    const b64 = await readAsJpeg(file);
    if (b64) { setProductImage(b64); setProductPreview(b64); }
  };

  const handleReferenceFile = async (file: File) => {
    const b64 = await readAsJpeg(file);
    if (b64) setReferenceImages(prev => [...prev.slice(0, 2), b64]);
  };

  // ── P1 Generation ─────────────────────────────────────────────────────────
  const generateP1 = async () => {
    if (!brandKit) { setError('Configurá tu marca en "Mi marca" antes de continuar.'); return; }
    if (!brief.trim()) { setError('Describí el producto antes de continuar.'); return; }

    setError('');
    setP1Angles([]);
    setP1Images([]);
    setP1Done(0);
    setP1Total(count);
    setP1Error('');
    setView('p1-generating');

    const productImageCompressed = productImage
      ? await compressToJpeg(productImage, 1024, 0.82)
      : '';
    const refImagesCompressed = await Promise.all(
      referenceImages.map(img => compressToJpeg(img, 768, 0.8))
    );

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000);

    try {
      const res = await fetch('/api/generate-testing-angles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          brief,
          brandKit,
          productImage: productImageCompressed,
          referenceImages: refImagesCompressed,
          count,
        }),
      });

      if (!res.ok || !res.body) {
        setP1Error('Error al conectar con el servidor.');
        setView('p1-results');
        return;
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buffer = '';
      let finalAngles: MessageAngle[] = [];
      const finalImages: AngleImage[] = [];
      let finalIsFashion = false;
      let finalProdDesc = '';
      let finalPersonDesc = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += dec.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const part of parts) {
          if (!part.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(part.slice(6));
            if (data.error) { setP1Error(data.error); }
            if (data.angles) {
              finalAngles = data.angles;
              setP1Angles(data.angles);
              setP1Total(data.angles.length);
            }
            if (data.image) {
              finalImages.push(data.image);
              setP1Images(prev => [...prev, data.image]);
              setP1Done(prev => prev + 1);
            }
            if (data.angleError) { setP1Done(prev => prev + 1); }
            if (data.done) {
              finalIsFashion = !!data.isFashionProduct;
              finalProdDesc = data.productDescription || '';
              finalPersonDesc = data.personDescription || '';
              setIsFashionProduct(finalIsFashion);
              setProductDescription(finalProdDesc);
              setPersonDescription(finalPersonDesc);
            }
          } catch { /* skip malformed */ }
        }
      }

      // Save session to Supabase
      if (finalAngles.length > 0) {
        const productImageForDb = productImageCompressed
          ? await compressToJpeg(productImageCompressed, 512, 0.7)
          : '';
        const refImagesForDb = await Promise.all(
          refImagesCompressed.slice(0, 1).map(img => compressToJpeg(img, 512, 0.7))
        );

        const saveRes = await fetch('/api/one-shoot-sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'paso1_done',
            brief,
            productImage: productImageForDb,
            referenceImages: refImagesForDb,
            count: finalAngles.length,
            isFashionProduct: finalIsFashion,
            productDescription: finalProdDesc,
            personDescription: finalPersonDesc,
            angles: finalAngles,
            winningAngleKeys: [],
            pecResults: [],
          }),
        });

        if (saveRes.ok) {
          const { id } = await saveRes.json();
          setSessionId(id);
          // Store images in localStorage
          const imgsToStore = Array.isArray(finalImages) ? finalImages : [];
          saveLsImages(id, imgsToStore, []);
          await loadSessions();
        }
      }

      setView('p1-results');
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        setP1Error('La generación tardó demasiado. Intentá de nuevo.');
      } else {
        setP1Error('Error inesperado. Intentá de nuevo.');
      }
      setView('p1-results');
    } finally {
      clearTimeout(timeout);
    }
  };

  // ── Resume session ────────────────────────────────────────────────────────
  const resumeSession = async (session: SessionRow) => {
    setSessionId(session.id);
    setBrief(session.brief);
    setIsFashionProduct(session.is_fashion_product);
    setP1Angles(session.angles);
    setWinnerKeys(session.winning_angle_keys || []);

    const stored = loadLsImages(session.id);
    setP1Images(stored.p1);

    if (session.status === 'paso2_done' && stored.p2.length > 0) {
      setP2Creatives(stored.p2);
      setView('p2-results');
    } else {
      setView('p1-results');
    }
  };

  // ── P2 Generation ─────────────────────────────────────────────────────────
  const generateP2 = async () => {
    if (winnerKeys.length === 0) return;
    if (!brandKit) return;

    const winners = p1Angles.filter(a => winnerKeys.includes(a.key));
    const totalCreatives = winners.length * 3;

    setP2Creatives([]);
    setP2Done(0);
    setP2Total(totalCreatives);
    setP2Error('');
    setView('p2-generating');

    // Save winner selection to Supabase
    if (sessionId) {
      await fetch(`/api/one-shoot-sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ winningAngleKeys: winnerKeys }),
      });
    }

    // Load product images from session or current state
    let prodImg = productImage;
    let refImgs = referenceImages;

    if (!prodImg && sessionId) {
      const sessRes = await fetch(`/api/one-shoot-sessions/${sessionId}`);
      if (sessRes.ok) {
        const sess = await sessRes.json();
        prodImg = sess.product_image || '';
        refImgs = sess.reference_images || [];
        setProductDescription(sess.product_description || '');
        setPersonDescription(sess.person_description || '');
      }
    }

    const productImageCompressed = prodImg ? await compressToJpeg(prodImg, 1024, 0.82) : '';
    const refImagesCompressed = await Promise.all(refImgs.map(img => compressToJpeg(img, 768, 0.8)));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8 * 60 * 1000);

    try {
      const res = await fetch('/api/generate-pec-creatives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          brief,
          productDescription,
          personDescription,
          isFashionProduct,
          winningAngles: winners,
          brandKit,
          productImageBase64: productImageCompressed,
          referenceImages: refImagesCompressed,
        }),
      });

      if (!res.ok || !res.body) {
        setP2Error('Error al conectar con el servidor.');
        setView('p2-results');
        return;
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buffer = '';
      const collectedCreatives: PECCreative[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += dec.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const part of parts) {
          if (!part.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(part.slice(6));
            if (data.error) { setP2Error(data.error); }
            if (data.creative) {
              collectedCreatives.push(data.creative);
              setP2Creatives(prev => [...prev, data.creative]);
              setP2Done(prev => prev + 1);
            }
            if (data.creativeError) { setP2Done(prev => prev + 1); }
            if (data.done) {
              // Save results to Supabase + localStorage
              if (sessionId) {
                const pecMeta = collectedCreatives.map(c => ({
                  id: c.id,
                  angleKey: c.angleKey,
                  angleName: c.angleName,
                  hook: c.hook,
                  stage: c.stage,
                  stageLabel: c.stageLabel,
                  formatName: c.formatName,
                  headline: c.headline,
                  subline: c.subline,
                }));
                await fetch(`/api/one-shoot-sessions/${sessionId}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ status: 'paso2_done', pecResults: pecMeta }),
                });
                const stored = loadLsImages(sessionId);
                saveLsImages(sessionId, stored.p1, collectedCreatives);
                await loadSessions();
              }
            }
          } catch { /* skip malformed */ }
        }
      }

      setView('p2-results');
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        setP2Error('La generación tardó demasiado. Intentá de nuevo.');
      } else {
        setP2Error('Error inesperado. Intentá de nuevo.');
      }
      setView('p2-results');
    } finally {
      clearTimeout(timeout);
    }
  };

  // ── Delete session ────────────────────────────────────────────────────────
  const deleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/one-shoot-sessions/${id}`, { method: 'DELETE' });
    try { localStorage.removeItem(lsKey(id)); } catch { /* ok */ }
    setSessions(prev => prev.filter(s => s.id !== id));
  };

  const resetToSetup = () => {
    setBrief('');
    setProductImage('');
    setProductPreview('');
    setReferenceImages([]);
    setCount(4);
    setP1Angles([]);
    setP1Images([]);
    setWinnerKeys([]);
    setP2Creatives([]);
    setSessionId(null);
    setIsFashionProduct(false);
    setProductDescription('');
    setPersonDescription('');
    setP1Error('');
    setP2Error('');
    setError('');
    setView('setup');
  };

  // ─── Render helpers ───────────────────────────────────────────────────────

  const fmtElapsed = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const STAGE_COLORS: Record<string, string> = {
    P: 'bg-purple-50 border-purple-200 text-purple-700',
    E: 'bg-blue-50 border-blue-200 text-blue-700',
    C: 'bg-green-50 border-green-200 text-green-700',
  };

  const STAGE_BG: Record<string, string> = {
    P: 'bg-purple-600',
    E: 'bg-blue-600',
    C: 'bg-green-600',
  };

  // ─── Views ────────────────────────────────────────────────────────────────

  // ── Sessions list ─────────────────────────────────────────────────────────
  if (view === 'sessions') {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar active="/one-shoot" onLogout={handleLogout} userEmail={userEmail} />
        <main className="flex-1 md:ml-56 pt-14 md:pt-0">
          <div className="max-w-3xl mx-auto px-4 py-8">
            {/* Header */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold uppercase tracking-widest text-[#e42820]">ONE SHOOT</span>
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Spicy Ad Formula</h1>
              <p className="text-gray-500 text-sm mt-1">Paso 1: testeá ángulos → Paso 2: escalá el ganador en campaña PEC</p>
            </div>

            {/* No API key warning */}
            {hasApiKey === false && (
              <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                Necesitás configurar tu API key de OpenAI en{' '}
                <a href="/perfil" className="underline font-medium">Perfil</a> para usar este módulo.
              </div>
            )}

            {/* New session button */}
            <button
              onClick={resetToSetup}
              className="w-full mb-6 flex items-center justify-center gap-2 bg-[#e42820] text-white font-semibold py-3 rounded-xl hover:bg-[#c82019] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Nueva sesión
            </button>

            {/* Sessions list */}
            {loadingSessions ? (
              <div className="text-center py-12 text-gray-400 text-sm">Cargando sesiones...</div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <p className="text-gray-500 font-medium">Ninguna sesión todavía</p>
                <p className="text-gray-400 text-sm mt-1">Creá tu primera sesión para empezar a testear</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sessions.map(session => (
                  <div
                    key={session.id}
                    onClick={() => resumeSession(session)}
                    className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:border-gray-300 hover:shadow-sm transition-all flex items-start gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          session.status === 'paso2_done'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-orange-100 text-orange-700'
                        }`}>
                          {session.status === 'paso2_done' ? 'Paso 2 listo' : 'Paso 1 listo'}
                        </span>
                        {session.is_fashion_product && (
                          <span className="text-[10px] font-medium text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">Fashion</span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-gray-900 truncate">{session.brief || 'Sin descripción'}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {session.angles?.length || 0} ángulos · {new Date(session.updated_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    <button
                      onClick={e => deleteSession(session.id, e)}
                      className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors shrink-0"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // ── Setup ─────────────────────────────────────────────────────────────────
  if (view === 'setup') {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar active="/one-shoot" onLogout={handleLogout} userEmail={userEmail} />
        <main className="flex-1 md:ml-56 pt-14 md:pt-0">
          <div className="max-w-xl mx-auto px-4 py-8">
            <button
              onClick={() => setView('sessions')}
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 mb-6 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Mis sesiones
            </button>

            <div className="mb-6">
              <span className="text-xs font-bold uppercase tracking-widest text-[#e42820]">ONE SHOOT · PASO 1</span>
              <h1 className="text-xl font-bold text-gray-900 mt-1">¿Qué producto querés testear?</h1>
              <p className="text-sm text-gray-500 mt-1">Una sesión = un producto. Describí qué es, para quién, y qué lo hace especial.</p>
            </div>

            {!brandKit && (
              <div className="mb-5 bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
                No encontramos tu marca.{' '}
                <a href="/config" className="underline font-medium">Configurala primero</a> para que los creativos reflejen tu identidad.
              </div>
            )}

            {error && (
              <div className="mb-5 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
            )}

            {/* Brief */}
            <div className="mb-5">
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Descripción del producto <span className="text-red-500">*</span>
              </label>
              <textarea
                value={brief}
                onChange={e => setBrief(e.target.value)}
                placeholder="Ej: Remera oversize de algodón orgánico, colores tierra, para mujer urbana 25-35 años. Diferencial: tela suave al tacto y corte favorecedor."
                rows={4}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#e42820]/20 focus:border-[#e42820] resize-none"
              />
            </div>

            {/* Product image */}
            <div className="mb-5">
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Foto del producto <span className="text-gray-400 font-normal">(recomendado)</span>
              </label>
              <div
                onClick={() => productFileRef.current?.click()}
                className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center cursor-pointer hover:border-gray-300 transition-colors"
              >
                {productPreview ? (
                  <div className="relative inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={productPreview}
                      alt="Producto"
                      className="max-h-40 rounded-lg object-cover mx-auto"
                    />
                    <button
                      onClick={e => { e.stopPropagation(); setProductImage(''); setProductPreview(''); }}
                      className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                    >×</button>
                  </div>
                ) : (
                  <div>
                    <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-sm text-gray-400">Subí una foto del producto</p>
                    <p className="text-xs text-gray-300 mt-0.5">JPG, PNG · hasta 10 MB</p>
                  </div>
                )}
              </div>
              <input ref={productFileRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleProductFile(f); e.target.value = ''; }} />
            </div>

            {/* Reference images (fashion) */}
            <div className="mb-5">
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Foto de referencia de persona <span className="text-gray-400 font-normal">(opcional, para marcas de indumentaria)</span>
              </label>
              <div className="flex gap-2">
                {referenceImages.map((img, i) => (
                  <div key={i} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img} alt="Ref" className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
                    <button
                      onClick={() => setReferenceImages(prev => prev.filter((_, j) => j !== i))}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center"
                    >×</button>
                  </div>
                ))}
                {referenceImages.length < 2 && (
                  <button
                    onClick={() => referenceFileRef.current?.click()}
                    className="w-16 h-16 border-2 border-dashed border-gray-200 rounded-lg flex flex-col items-center justify-center text-gray-300 hover:border-gray-300 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                )}
              </div>
              <input ref={referenceFileRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleReferenceFile(f); e.target.value = ''; }} />
            </div>

            {/* Count */}
            <div className="mb-7">
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Ángulos a testear: <span className="text-[#e42820]">{count}</span>
              </label>
              <input
                type="range" min={2} max={7} value={count}
                onChange={e => setCount(Number(e.target.value))}
                className="w-full accent-[#e42820]"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>2 · rápido</span>
                <span>7 · completo</span>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">Recomendado: 4-5 para un test de Meta en 7-10 días.</p>
            </div>

            <button
              onClick={generateP1}
              disabled={!brief.trim() || !brandKit}
              className="w-full bg-[#e42820] text-white font-semibold py-3 rounded-xl hover:bg-[#c82019] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Generar {count} ángulos de mensaje
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ── P1 Generating ─────────────────────────────────────────────────────────
  if (view === 'p1-generating') {
    const pct = p1Total > 0 ? Math.round((p1Done / p1Total) * 100) : 0;
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar active="/one-shoot" onLogout={handleLogout} userEmail={userEmail} />
        <main className="flex-1 md:ml-56 pt-14 md:pt-0 flex items-center justify-center">
          <div className="max-w-md w-full px-4 py-12 text-center">
            <div className="w-16 h-16 bg-[#e42820]/10 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <svg className="w-7 h-7 text-[#e42820] animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Generando Paso 1</h2>
            <p className="text-sm text-gray-500 mb-2">
              {p1Angles.length === 0
                ? 'Analizando producto y generando ángulos de mensaje...'
                : `Generando imágenes · ${p1Done} de ${p1Total}`}
            </p>
            <p className="text-xs text-gray-400 mb-6">{fmtElapsed(p1Elapsed)}</p>

            {p1Total > 0 && (
              <div className="w-full bg-gray-200 rounded-full h-2 mb-4 overflow-hidden">
                <div
                  className="h-2 bg-[#e42820] rounded-full transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}

            {/* Angle chips as they appear */}
            {p1Angles.length > 0 && (
              <div className="flex flex-wrap gap-2 justify-center mt-4">
                {p1Angles.map(a => (
                  <span key={a.key} className={`text-xs px-2.5 py-1 rounded-full border font-medium ${
                    p1Images.some(i => i.angleKey === a.key)
                      ? 'bg-[#e42820]/10 border-[#e42820]/30 text-[#e42820]'
                      : 'bg-gray-100 border-gray-200 text-gray-500'
                  }`}>
                    {a.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // ── P1 Results ────────────────────────────────────────────────────────────
  if (view === 'p1-results') {
    const winningAngles = p1Angles.filter(a => winnerKeys.includes(a.key));

    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar active="/one-shoot" onLogout={handleLogout} userEmail={userEmail} />
        <main className="flex-1 md:ml-56 pt-14 md:pt-0">
          <div className="max-w-4xl mx-auto px-4 py-8">
            {/* Header */}
            <div className="flex items-start justify-between mb-6 gap-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-widest text-[#e42820]">ONE SHOOT · PASO 1</span>
                <h1 className="text-xl font-bold text-gray-900 mt-0.5">Tus ángulos de mensaje</h1>
                <p className="text-sm text-gray-500 mt-0.5">Lanzá estas piezas en Meta. Cuando tengas resultados, volvé y elegí los ganadores.</p>
              </div>
              <button
                onClick={resetToSetup}
                className="shrink-0 text-xs text-gray-400 hover:text-gray-600 underline"
              >
                Nueva sesión
              </button>
            </div>

            {p1Error && (
              <div className="mb-5 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{p1Error}</div>
            )}

            {/* Info banner */}
            <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex gap-3">
              <svg className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm text-amber-800">
                <strong>Sesión guardada.</strong> Podés cerrar esta página y volver cuando tengas resultados de Meta. Los ángulos quedan guardados en tu cuenta.
              </div>
            </div>

            {/* Angle grid */}
            {p1Angles.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">No se generaron ángulos.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                {p1Angles.map(angle => {
                  const img = p1Images.find(i => i.angleKey === angle.key);
                  const isWinner = winnerKeys.includes(angle.key);
                  return (
                    <div
                      key={angle.key}
                      onClick={() => setWinnerKeys(prev =>
                        isWinner ? prev.filter(k => k !== angle.key) : [...prev, angle.key]
                      )}
                      className={`relative rounded-xl border-2 overflow-hidden cursor-pointer transition-all ${
                        isWinner
                          ? 'border-[#e42820] shadow-lg shadow-[#e42820]/10'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {/* Winner badge */}
                      {isWinner && (
                        <div className="absolute top-2 left-2 z-10 bg-[#e42820] text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          Ganador
                        </div>
                      )}

                      {/* Image */}
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`data:image/png;base64,${img.base64}`}
                          alt={angle.name}
                          className="w-full aspect-[2/3] object-cover"
                        />
                      ) : (
                        <div className="w-full aspect-[2/3] bg-gray-100 flex items-center justify-center">
                          <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}

                      {/* Info */}
                      <div className="p-3 bg-white">
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-0.5">{angle.name}</p>
                        <p className="text-sm font-semibold text-gray-900 leading-snug">&ldquo;{angle.hook}&rdquo;</p>
                        <p className="text-xs text-gray-400 mt-1 leading-relaxed">{angle.emphasis}</p>
                      </div>

                      {/* Download */}
                      {img && (
                        <button
                          onClick={e => { e.stopPropagation(); downloadImage(img.base64, `angulo-${angle.key}.png`); }}
                          className="absolute bottom-20 right-2 p-1.5 bg-white/90 backdrop-blur-sm rounded-lg text-gray-500 hover:text-gray-900 hover:bg-white transition-all shadow-sm"
                          title="Descargar"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Paso 2 CTA */}
            <div className="sticky bottom-4">
              <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-lg flex items-center gap-4">
                <div className="flex-1">
                  {winnerKeys.length === 0 ? (
                    <p className="text-sm text-gray-500">Tocá una o más piezas para marcarlas como ganadoras</p>
                  ) : (
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {winnerKeys.length} ángulo{winnerKeys.length > 1 ? 's' : ''} ganador{winnerKeys.length > 1 ? 'es' : ''} seleccionado{winnerKeys.length > 1 ? 's' : ''}
                      </p>
                      <p className="text-xs text-gray-400">Se generarán {winnerKeys.length * 3} creativos PEC</p>
                    </div>
                  )}
                </div>
                <button
                  onClick={generateP2}
                  disabled={winnerKeys.length === 0}
                  className="shrink-0 bg-[#e42820] text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-[#c82019] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm"
                >
                  Escalar con PEC →
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ── P2 Generating ─────────────────────────────────────────────────────────
  if (view === 'p2-generating') {
    const pct = p2Total > 0 ? Math.round((p2Done / p2Total) * 100) : 0;
    const winningAngles = p1Angles.filter(a => winnerKeys.includes(a.key));

    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar active="/one-shoot" onLogout={handleLogout} userEmail={userEmail} />
        <main className="flex-1 md:ml-56 pt-14 md:pt-0 flex items-center justify-center">
          <div className="max-w-md w-full px-4 py-12 text-center">
            <div className="w-16 h-16 bg-[#e42820]/10 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <svg className="w-7 h-7 text-[#e42820] animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Generando campaña PEC</h2>
            <p className="text-sm text-gray-500 mb-2">
              {p2Done} de {p2Total} creativos listos
            </p>
            <p className="text-xs text-gray-400 mb-6">{fmtElapsed(p2Elapsed)}</p>

            <div className="w-full bg-gray-200 rounded-full h-2 mb-6 overflow-hidden">
              <div
                className="h-2 bg-[#e42820] rounded-full transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>

            <div className="flex flex-wrap gap-2 justify-center">
              {winningAngles.map(a => (
                <div key={a.key} className="text-left">
                  <p className="text-xs font-bold text-gray-600 mb-1.5">{a.name}</p>
                  <div className="flex gap-1.5">
                    {(['P', 'E', 'C'] as const).map(stage => {
                      const isDone = p2Creatives.some(c => c.angleKey === a.key && c.stage === stage);
                      return (
                        <span key={stage} className={`text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors ${
                          isDone
                            ? stage === 'P' ? 'bg-purple-100 text-purple-700' : stage === 'E' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-400'
                        }`}>{stage}</span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ── P2 Results ────────────────────────────────────────────────────────────
  if (view === 'p2-results') {
    const stages: Array<{ code: 'P' | 'E' | 'C'; label: string; description: string }> = [
      { code: 'P', label: 'Prospección', description: 'Atraer nuevas audiencias que no te conocen' },
      { code: 'E', label: 'Evaluación', description: 'Convencer a quienes ya mostraron interés' },
      { code: 'C', label: 'Conversión', description: 'Cerrar la compra del que ya está convencido' },
    ];

    const winningAngles = p1Angles.filter(a => winnerKeys.includes(a.key));

    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar active="/one-shoot" onLogout={handleLogout} userEmail={userEmail} />
        <main className="flex-1 md:ml-56 pt-14 md:pt-0">
          <div className="max-w-5xl mx-auto px-4 py-8">
            {/* Header */}
            <div className="flex items-start justify-between mb-6 gap-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-widest text-[#e42820]">ONE SHOOT · PASO 2</span>
                <h1 className="text-xl font-bold text-gray-900 mt-0.5">Campaña PEC generada</h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  {winningAngles.length} ángulo{winningAngles.length > 1 ? 's' : ''} escalado{winningAngles.length > 1 ? 's' : ''} · {p2Creatives.length} creativos en total
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => setView('p1-results')}
                  className="text-xs text-gray-500 hover:text-gray-700 underline"
                >
                  Ver Paso 1
                </button>
                <button
                  onClick={resetToSetup}
                  className="text-xs bg-[#e42820] text-white px-3 py-1.5 rounded-lg hover:bg-[#c82019] transition-colors"
                >
                  Nueva sesión
                </button>
              </div>
            </div>

            {p2Error && (
              <div className="mb-5 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{p2Error}</div>
            )}

            {p2Creatives.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">No se generaron creativos.</div>
            ) : (
              <div className="space-y-10">
                {stages.map(stage => {
                  const stageCreatives = p2Creatives.filter(c => c.stage === stage.code);
                  if (stageCreatives.length === 0) return null;
                  return (
                    <div key={stage.code}>
                      {/* Stage header */}
                      <div className="flex items-center gap-3 mb-4">
                        <div className={`w-8 h-8 ${STAGE_BG[stage.code]} rounded-lg flex items-center justify-center shrink-0`}>
                          <span className="text-white text-xs font-bold">{stage.code}</span>
                        </div>
                        <div>
                          <h2 className="font-bold text-gray-900">{stage.label}</h2>
                          <p className="text-xs text-gray-400">{stage.description}</p>
                        </div>
                      </div>

                      {/* Creatives grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {stageCreatives.map(creative => (
                          <div key={creative.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`data:image/png;base64,${creative.base64}`}
                              alt={`${creative.angleName} · ${stage.label}`}
                              className="w-full aspect-[2/3] object-cover"
                            />
                            <div className="p-3">
                              <div className="flex items-center gap-1.5 mb-2">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STAGE_COLORS[stage.code]}`}>
                                  {creative.formatName}
                                </span>
                                <span className="text-[10px] text-gray-400">{creative.angleName}</span>
                              </div>
                              <p className="text-xs font-semibold text-gray-800 leading-snug">{creative.headline}</p>
                              {creative.subline && <p className="text-xs text-gray-400 mt-0.5">{creative.subline}</p>}
                              <button
                                onClick={() => downloadImage(creative.base64, `pec-${stage.code}-${creative.angleKey}.png`)}
                                className="mt-2 w-full text-xs text-gray-500 hover:text-gray-900 border border-gray-200 hover:border-gray-300 rounded-lg py-1.5 transition-colors flex items-center justify-center gap-1.5"
                              >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Descargar
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  return null;
}
