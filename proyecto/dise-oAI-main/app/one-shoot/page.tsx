'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createSupabaseBrowser } from '@/app/lib/supabase-browser';
import { useRequireAuth } from '@/app/lib/use-auth';
import { BrandKit } from '@/app/types';
import Sidebar from '@/app/components/Sidebar';
import { MessageAngle } from '@/app/api/generate-testing-angles/route';
import { readAsImage, compressImage } from '@/app/lib/image-utils';

// ─── Types ───────────────────────────────────────────────────────────────────

type OneShootView =
  | 'sessions'
  | 'setup'
  | 'p1-generating'
  | 'p1-live'
  | 'p1-review'
  | 'p2-generating'
  | 'p2-results'
  | 'p3';

type AngleStatus = 'active' | 'winner' | 'off';

interface AngleImage {
  id: string;
  base64: string;
  angleKey: string;
  angleName: string;
  hook: string;
  emphasis: string;
  level?: 'product' | 'category';
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
  product_description: string;
  person_description: string;
  angles: MessageAngle[];
  winning_angle_keys: string[];
  pec_results: Omit<PECCreative, 'base64'>[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function downloadImage(base64: string, name: string) {
  const a = document.createElement('a');
  a.href = `data:image/png;base64,${base64}`;
  a.download = name;
  a.click();
}

const lsKey = (id: string) => `one_shoot_images_${id}`;

interface LsData {
  p1: AngleImage[];
  p2: PECCreative[];
  angleStatuses: Record<string, AngleStatus>;
  launchDate: string;
}

function saveLsImages(
  id: string,
  p1: AngleImage[],
  p2: PECCreative[],
  angleStatuses: Record<string, AngleStatus> = {},
  launchDate = ''
) {
  try {
    localStorage.setItem(lsKey(id), JSON.stringify({ p1, p2, angleStatuses, launchDate }));
  } catch { /* storage full */ }
}

function loadLsImages(id: string): LsData {
  try {
    const raw = localStorage.getItem(lsKey(id));
    if (!raw) return { p1: [], p2: [], angleStatuses: {}, launchDate: '' };
    const parsed = JSON.parse(raw);
    return {
      p1: parsed.p1 || [],
      p2: parsed.p2 || [],
      angleStatuses: parsed.angleStatuses || {},
      launchDate: parsed.launchDate || '',
    };
  } catch { return { p1: [], p2: [], angleStatuses: {}, launchDate: '' }; }
}

// ─── Game Header Component ────────────────────────────────────────────────────

interface GameHeaderProps {
  view: OneShootView;
}

function GameHeader({ view }: GameHeaderProps) {
  const step1Done = ['p1-review', 'p2-generating', 'p2-results', 'p3'].includes(view);
  const step2Done = ['p2-results', 'p3'].includes(view);
  const step1Active = ['p1-generating', 'p1-live', 'p1-review'].includes(view);
  const step2Active = ['p2-generating', 'p2-results'].includes(view);
  const step3Active = view === 'p3';

  type StepState = 'done' | 'active' | 'locked';

  const getStepClasses = (state: StepState) => {
    if (state === 'done') return 'bg-green-500 text-white';
    if (state === 'active') return 'bg-[#e42820] text-white ring-2 ring-[#e42820]/30';
    return 'bg-gray-200 text-gray-400';
  };

  const getLabelClasses = (state: StepState) => {
    if (state === 'done') return 'text-green-600 font-semibold';
    if (state === 'active') return 'text-[#e42820] font-bold';
    return 'text-gray-400 font-medium';
  };

  const step1State: StepState = step1Done ? 'done' : step1Active ? 'active' : 'locked';
  const step2State: StepState = step2Done ? 'done' : step2Active ? 'active' : 'locked';
  const step3State: StepState = step3Active ? 'active' : 'locked';

  const line1Done = step1Done;
  const line2Done = step2Done;

  return (
    <div className="flex items-center justify-center gap-0 mb-6 px-2">
      {/* Step 1 */}
      <div className="flex flex-col items-center">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${getStepClasses(step1State)}`}>
          {step1State === 'done' ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          ) : '1'}
        </div>
        <span className={`text-[10px] mt-1 uppercase tracking-wide ${getLabelClasses(step1State)}`}>TEST</span>
      </div>

      {/* Line 1 */}
      <div className={`h-0.5 w-12 sm:w-20 mx-1 mt-[-10px] transition-colors ${line1Done ? 'bg-green-400' : 'bg-gray-200'}`} />

      {/* Step 2 */}
      <div className="flex flex-col items-center">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${getStepClasses(step2State)}`}>
          {step2State === 'done' ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          ) : '2'}
        </div>
        <span className={`text-[10px] mt-1 uppercase tracking-wide ${getLabelClasses(step2State)}`}>PEC</span>
      </div>

      {/* Line 2 */}
      <div className={`h-0.5 w-12 sm:w-20 mx-1 mt-[-10px] transition-colors ${line2Done ? 'bg-green-400' : 'bg-gray-200'}`} />

      {/* Step 3 (optional) */}
      <div className="flex flex-col items-center">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
          step3Active
            ? 'border-purple-400 bg-purple-50 text-purple-600 ring-2 ring-purple-400/30'
            : 'border-gray-200 bg-white text-gray-400'
        }`}>
          3
        </div>
        <span className={`text-[10px] mt-1 uppercase tracking-wide ${step3Active ? 'text-purple-600 font-bold' : 'text-gray-400 font-medium'}`}>
          FORMATOS*
        </span>
      </div>
    </div>
  );
}

// ─── Guidance logic ───────────────────────────────────────────────────────────

function getGuidanceMessage(days: number, purchases: number): { text: string; color: string } | null {
  if (isNaN(days) || isNaN(purchases)) return null;
  if (purchases === 0 && days < 15) {
    return { text: '⏳ Muy temprano. Esperá 15-20 días sin compras antes de decidir.', color: 'text-amber-700 bg-amber-50 border-amber-200' };
  }
  if (purchases === 0 && days >= 15) {
    return { text: '⚠️ Ningún ángulo convierte. Revisá producto, precio o audiencia.', color: 'text-red-700 bg-red-50 border-red-200' };
  }
  if (purchases > 0 && purchases < 40 && days < 7) {
    return { text: '⏳ Pocos datos. Esperá 7+ días y 40+ compras.', color: 'text-amber-700 bg-amber-50 border-amber-200' };
  }
  if (purchases >= 40 || (days >= 7 && purchases > 0)) {
    return { text: '✅ Tenés datos suficientes para decidir.', color: 'text-green-700 bg-green-50 border-green-200' };
  }
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function OneShootPage() {
  useRequireAuth();
  const supabase = createSupabaseBrowser();

  const [userEmail, setUserEmail] = useState('');
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [brandKit, setBrandKit] = useState<BrandKit | null>(null);
  const [brandKitLoaded, setBrandKitLoaded] = useState(false);

  // View
  const [view, setView] = useState<OneShootView>('sessions');

  // Sessions list
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);

  // Active session
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Setup
  const [brief, setBrief] = useState('');
  const [productUrl, setProductUrl] = useState('');
  const [scrapingUrl, setScrapingUrl] = useState(false);
  const [productImages, setProductImages] = useState<string[]>([]);
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [productCount, setProductCount] = useState(2);
  const [categoryCount, setCategoryCount] = useState(2);
  const [peopleMode, setPeopleMode] = useState<'none' | 'real'>('none');
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

  // P1 review
  const [angleStatuses, setAngleStatuses] = useState<Record<string, AngleStatus>>({});
  const [daysRunning, setDaysRunning] = useState('');
  const [totalPurchases, setTotalPurchases] = useState('');

  // Winners
  const [winnerKeys, setWinnerKeys] = useState<string[]>([]);

  // P2 generation
  const [p2Creatives, setP2Creatives] = useState<PECCreative[]>([]);
  const [p2Done, setP2Done] = useState(0);
  const [p2Total, setP2Total] = useState(0);
  const [p2Error, setP2Error] = useState('');
  const [p2Elapsed, setP2Elapsed] = useState(0);
  const p2TimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // P3 format adaptation
  const [p3AdaptFormats, setP3AdaptFormats] = useState<string[]>([]);
  const [p3AdaptSourceIds, setP3AdaptSourceIds] = useState<string[]>([]);
  const [p3AdaptedImages, setP3AdaptedImages] = useState<{ format: string; label: string; creativeId: string; base64: string }[]>([]);
  const [p3Generating, setP3Generating] = useState(false);

  // Error handling
  const [error, setError] = useState('');

  // ── Load profile ──────────────────────────────────────────────────────────
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
      }).catch(console.error).finally(() => setBrandKitLoaded(true));
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

  // ── Keep winnerKeys synced with angleStatuses ─────────────────────────────
  useEffect(() => {
    const winners = Object.entries(angleStatuses)
      .filter(([, status]) => status === 'winner')
      .map(([key]) => key);
    setWinnerKeys(winners);
  }, [angleStatuses]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  // ── File handlers ─────────────────────────────────────────────────────────
  const handleProductFile = async (file: File) => {
    const b64 = await readAsImage(file);
    if (b64) setProductImages(prev => [...prev, b64].slice(0, 3));
  };

  const handleReferenceFile = async (file: File) => {
    const b64 = await readAsImage(file);
    if (b64) setReferenceImages(prev => [...prev.slice(0, 2), b64]);
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

  // ── P1 Generation ─────────────────────────────────────────────────────────
  const generateP1 = async () => {
    if (!brandKit) { setError('Configurá tu marca en "Mi marca" antes de continuar.'); return; }
    if (!brief.trim()) { setError('Describí el producto antes de continuar.'); return; }

    const total = productCount + categoryCount;
    setError('');
    setP1Angles([]);
    setP1Images([]);
    setP1Done(0);
    setP1Total(total);
    setP1Error('');
    setAngleStatuses({});
    setDaysRunning('');
    setTotalPurchases('');
    setView('p1-generating');

    const productImagesCompressed = await Promise.all(productImages.map(img => compressImage(img, 1024)));
    const refImagesCompressed = await Promise.all(
      referenceImages.map(img => compressImage(img, 768))
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
          productImage: productImagesCompressed[0] || '',
          referenceImages: refImagesCompressed,
          productCount,
          categoryCount,
          peopleMode,
        }),
      });

      if (!res.ok || !res.body) {
        setP1Error('Error al conectar con el servidor.');
        setView('p1-live');
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

      // Save session to Supabase (no images in DB)
      if (finalAngles.length > 0) {
        const saveRes = await fetch('/api/one-shoot-sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'paso1_done',
            brief,
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
          // Store images + product/ref images in localStorage only
          saveLsImages(id, finalImages, [], {}, '');
          // Also store product/ref images for P2 generation
          try {
            if (productImagesCompressed.length > 0) {
              localStorage.setItem(`one_shoot_product_imgs_${id}`, JSON.stringify(productImagesCompressed));
            }
            if (refImagesCompressed.length > 0) {
              localStorage.setItem(`one_shoot_ref_imgs_${id}`, JSON.stringify(refImagesCompressed));
            }
          } catch { /* storage full */ }
          await loadSessions();
        }
      }

      setView('p1-live');
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        setP1Error('La generación tardó demasiado. Intentá de nuevo.');
      } else {
        setP1Error('Error inesperado. Intentá de nuevo.');
      }
      setView('p1-live');
    } finally {
      clearTimeout(timeout);
    }
  };

  // ── Resume session ────────────────────────────────────────────────────────
  const resumeSession = async (session: SessionRow) => {
    setSessionId(session.id);
    setBrief(session.brief);
    setIsFashionProduct(session.is_fashion_product);
    setProductDescription(session.product_description || '');
    setPersonDescription(session.person_description || '');
    setP1Angles(session.angles);
    setWinnerKeys(session.winning_angle_keys || []);

    const stored = loadLsImages(session.id);
    setP1Images(stored.p1);
    setAngleStatuses(stored.angleStatuses || {});

    // Restore product images from localStorage
    try {
      const prodImgs = localStorage.getItem(`one_shoot_product_imgs_${session.id}`);
      if (prodImgs) setProductImages(JSON.parse(prodImgs));
      else {
        const legacy = localStorage.getItem(`one_shoot_product_img_${session.id}`);
        if (legacy) setProductImages([legacy]);
      }
      const refImgs = localStorage.getItem(`one_shoot_ref_imgs_${session.id}`);
      if (refImgs) setReferenceImages(JSON.parse(refImgs));
    } catch { /* ok */ }

    if (session.status === 'paso2_done' && stored.p2.length > 0) {
      setP2Creatives(stored.p2);
      // Restore winner keys from angle statuses if possible
      const wk = Object.entries(stored.angleStatuses || {})
        .filter(([, s]) => s === 'winner')
        .map(([k]) => k);
      if (wk.length > 0) setWinnerKeys(wk);
      else setWinnerKeys(session.winning_angle_keys || []);
      setView('p2-results');
    } else {
      setView('p1-review');
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

    // Load product images from localStorage
    let prodImgs = productImages;
    let refImgs = referenceImages;

    if (prodImgs.length === 0 && sessionId) {
      try {
        const stored = localStorage.getItem(`one_shoot_product_imgs_${sessionId}`);
        if (stored) prodImgs = JSON.parse(stored);
        // legacy single-image key
        else {
          const storedSingle = localStorage.getItem(`one_shoot_product_img_${sessionId}`);
          if (storedSingle) prodImgs = [storedSingle];
        }
        const storedRef = localStorage.getItem(`one_shoot_ref_imgs_${sessionId}`);
        if (storedRef) refImgs = JSON.parse(storedRef);
      } catch { /* ok */ }
    }

    const prodImgsCompressed = await Promise.all(prodImgs.map(img => compressImage(img, 1024)));
    const refImagesCompressed = await Promise.all(refImgs.map(img => compressImage(img, 768)));

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
          productImageBase64: prodImgsCompressed[0] || '',
          productImages: prodImgsCompressed,
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
                saveLsImages(sessionId, stored.p1, collectedCreatives, stored.angleStatuses, stored.launchDate);
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
    try {
      localStorage.removeItem(lsKey(id));
      localStorage.removeItem(`one_shoot_product_img_${id}`);
      localStorage.removeItem(`one_shoot_ref_imgs_${id}`);
    } catch { /* ok */ }
    setSessions(prev => prev.filter(s => s.id !== id));
  };

  const resetToSetup = (keepBrief = false) => {
    if (!keepBrief) setBrief('');
    setProductImages([]);
    setReferenceImages([]);
    setProductCount(2);
    setCategoryCount(2);
    setPeopleMode('none');
    setP1Angles([]);
    setP1Images([]);
    setP1Done(0);
    setP1Total(0);
    setP2Done(0);
    setP2Total(0);
    setAngleStatuses({});
    setDaysRunning('');
    setTotalPurchases('');
    setWinnerKeys([]);
    setP2Creatives([]);
    setSessionId(null);
    setIsFashionProduct(false);
    setProductDescription('');
    setPersonDescription('');
    setProductImages([]);
    setP1Error('');
    setP2Error('');
    setError('');
    setView('setup');
  };

  // ── P3 Format Adaptation ─────────────────────────────────────────────────
  const generateP3Adaptations = async () => {
    const creativesToAdapt = p2Creatives.filter(c => p3AdaptSourceIds.includes(c.id));
    if (p3AdaptFormats.length === 0 || creativesToAdapt.length === 0) return;
    setP3Generating(true);
    const FORMAT_LABELS: Record<string, string> = {
      story: 'Story 9:16', feed45: 'Feed 4:5', square: 'Cuadrado 1:1', landscape: 'Landscape 16:9',
    };
    const allResults: { format: string; label: string; creativeId: string; base64: string }[] = [];
    try {
      for (const creative of creativesToAdapt) {
        const results = await Promise.all(
          p3AdaptFormats.map(async format => {
            for (let attempt = 0; attempt < 2; attempt++) {
              const res = await fetch('/api/adapt-size', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageBase64: creative.base64, format }),
              });
              if (res.ok) {
                const data = await res.json();
                return { format, label: FORMAT_LABELS[format] || format, creativeId: creative.id, base64: data.base64 };
              }
              if (attempt === 0) await new Promise(r => setTimeout(r, 1500));
            }
            return null;
          })
        );
        allResults.push(...(results.filter(Boolean) as { format: string; label: string; creativeId: string; base64: string }[]));
      }
      setP3AdaptedImages(allResults);
    } finally {
      setP3Generating(false);
    }
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
                <span className="text-xs font-bold uppercase tracking-widest text-[#e42820]">AD FORMULA</span>
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Spicy Ad Formula</h1>
              <p className="text-gray-500 text-sm mt-1">Paso 1: testeá ángulos de mensaje → Paso 2: escalá el ganador en campaña PEC</p>
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
              onClick={() => resetToSetup(false)}
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
    const totalAngles = productCount + categoryCount;
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

            <GameHeader view={view} />

            <div className="mb-6">
              <h1 className="text-xl font-bold text-gray-900">¿Qué querés testear?</h1>
              <p className="text-sm text-gray-500 mt-1">Una sesión = un producto o categoría. Encontrá el mensaje que convierte.</p>
            </div>

            {brandKitLoaded && !brandKit && (
              <div className="mb-5 bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
                No encontramos tu marca.{' '}
                <a href="/config" className="underline font-medium">Configurala primero</a> para que los creativos reflejen tu identidad.
              </div>
            )}

            {error && (
              <div className="mb-5 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
            )}

            {/* URL scraper */}
            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                URL del producto <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={productUrl}
                  onChange={e => setProductUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && scrapeProduct()}
                  placeholder="https://tutienda.com/producto"
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#e42820]/20 focus:border-[#e42820]"
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
            <div className="mb-5">
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Describí el producto, la categoría o la oferta <span className="text-red-500">*</span>
              </label>
              <textarea
                value={brief}
                onChange={e => setBrief(e.target.value)}
                placeholder="Ej: Remera oversize de algodón orgánico, colores tierra, para mujer urbana 25-35 años. Diferencial: tela suave al tacto y corte favorecedor."
                rows={4}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#e42820]/20 focus:border-[#e42820] resize-none"
              />
            </div>

            {/* Product images */}
            <div className="mb-5">
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Fotos del producto <span className="text-gray-400 font-normal">(opcional · hasta 3)</span>
              </label>
              <p className="text-xs text-gray-400 mb-2">Para ropa: subí frente, espalda y detalle del estampado para mejor fidelidad.</p>
              <div className="flex gap-2 flex-wrap">
                {productImages.map((img, i) => (
                  <div key={i} className="relative w-20 h-20">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`}
                      alt={`Producto ${i + 1}`}
                      className="w-20 h-20 object-cover rounded-xl border border-gray-200"
                    />
                    <button
                      onClick={() => setProductImages(prev => prev.filter((_, j) => j !== i))}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                    >×</button>
                  </div>
                ))}
                {productImages.length < 3 && (
                  <button
                    onClick={() => productFileRef.current?.click()}
                    className="w-20 h-20 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center text-gray-400 hover:border-gray-300 hover:text-gray-500 transition-colors"
                  >
                    <svg className="w-5 h-5 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    <span className="text-xs">Agregar</span>
                  </button>
                )}
              </div>
              <input ref={productFileRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleProductFile(f); e.target.value = ''; }} />
            </div>

            {/* People mode toggle */}
            <div className="mb-5">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                ¿Aparecen personas usando el producto?
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => { setPeopleMode('none'); setReferenceImages([]); }}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium border-2 transition-all ${
                    peopleMode === 'none'
                      ? 'border-[#e42820] bg-[#e42820]/10 text-[#e42820]'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  No — solo producto
                </button>
                <button
                  onClick={() => setPeopleMode('real')}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium border-2 transition-all ${
                    peopleMode === 'real'
                      ? 'border-[#e42820] bg-[#e42820]/10 text-[#e42820]'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  Sí — con modelo
                </button>
              </div>
            </div>

            {/* Reference images — only when peopleMode is real */}
            {peopleMode === 'real' && (
            <div className="mb-5">
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Foto de referencia de persona <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <p className="text-xs text-gray-400 mb-2">El sistema usará estas fotos para mantener el perfil de la persona en los creativos</p>
              <div className="flex gap-2">
                {referenceImages.map((img, i) => (
                  <div key={i} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`} alt="Ref" className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
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
            )}

            {/* Sliders */}
            <div className="mb-7 space-y-5">
              {/* Product angles slider */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-semibold text-blue-800">Ángulos de Producto</label>
                  <span className="text-lg font-bold text-blue-700">{productCount === 0 ? '0 — omitir' : productCount}</span>
                </div>
                <p className="text-xs text-blue-600 mb-3">El argumento habla del producto (características, materiales, precio)</p>
                <input
                  type="range" min={0} max={4} value={productCount}
                  onChange={e => setProductCount(Number(e.target.value))}
                  className="w-full accent-blue-600"
                />
                <div className="flex justify-between text-xs text-blue-400 mt-1">
                  <span>0</span><span>1</span><span>2</span><span>3</span><span>4</span>
                </div>
              </div>

              {/* Category angles slider */}
              <div className="bg-orange-50 border border-orange-100 rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-semibold text-orange-800">Ángulos de Categoría</label>
                  <span className="text-lg font-bold text-orange-700">{categoryCount === 0 ? '0 — omitir' : categoryCount}</span>
                </div>
                <p className="text-xs text-orange-600 mb-3">El argumento habla del contexto, necesidad o estilo de vida</p>
                <input
                  type="range" min={0} max={4} value={categoryCount}
                  onChange={e => setCategoryCount(Number(e.target.value))}
                  className="w-full accent-orange-500"
                />
                <div className="flex justify-between text-xs text-orange-400 mt-1">
                  <span>0</span><span>1</span><span>2</span><span>3</span><span>4</span>
                </div>
              </div>

              <div className="text-center text-sm text-gray-500 font-medium">
                Total: <span className="text-gray-900 font-bold">{totalAngles}</span> ángulos a testear
              </div>
            </div>

            <button
              onClick={generateP1}
              disabled={!brief.trim() || !brandKit || (productCount === 0 && categoryCount === 0)}
              className="w-full bg-[#e42820] text-white font-semibold py-3 rounded-xl hover:bg-[#c82019] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Generar ángulos
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ── P1 Generating ─────────────────────────────────────────────────────────
  if (view === 'p1-generating') {
    const pct = p1Total > 0 ? Math.round((p1Done / p1Total) * 100) : 0;
    const productAngles = p1Angles.filter(a => a.level === 'product');
    const categoryAngles = p1Angles.filter(a => a.level === 'category');

    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar active="/one-shoot" onLogout={handleLogout} userEmail={userEmail} />
        <main className="flex-1 md:ml-56 pt-14 md:pt-0 flex items-center justify-center">
          <div className="max-w-md w-full px-4 py-12 text-center">
            <GameHeader view={view} />
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

            <div className="w-full bg-gray-200 rounded-full h-2 mb-4 overflow-hidden">
              {p1Total > 0 ? (
                <div
                  className="h-2 bg-[#e42820] rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              ) : (
                <div className="h-2 bg-[#e42820]/60 rounded-full animate-pulse" style={{ width: '30%' }} />
              )}
            </div>

            {/* Angle chips — product (blue) and category (orange) */}
            {p1Angles.length > 0 && (
              <div className="mt-4 space-y-3">
                {productAngles.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Producto</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {productAngles.map(a => (
                        <span key={a.key} className={`text-xs px-2.5 py-1 rounded-full border font-medium ${
                          p1Images.some(i => i.angleKey === a.key)
                            ? 'bg-blue-100 border-blue-300 text-blue-700'
                            : 'bg-gray-100 border-gray-200 text-gray-500'
                        }`}>
                          {a.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {categoryAngles.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Categoría</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {categoryAngles.map(a => (
                        <span key={a.key} className={`text-xs px-2.5 py-1 rounded-full border font-medium ${
                          p1Images.some(i => i.angleKey === a.key)
                            ? 'bg-orange-100 border-orange-300 text-orange-700'
                            : 'bg-gray-100 border-gray-200 text-gray-500'
                        }`}>
                          {a.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // ── P1 Live ───────────────────────────────────────────────────────────────
  if (view === 'p1-live') {
    const productAngles = p1Angles.filter(a => a.level === 'product');
    const categoryAnglesArr = p1Angles.filter(a => a.level === 'category');

    const renderAngleGrid = (angles: MessageAngle[]) => (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {angles.map(angle => {
          const img = p1Images.find(i => i.angleKey === angle.key);
          return (
            <div key={angle.key} className="relative rounded-xl border border-gray-200 overflow-hidden bg-white">
              {img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`data:image/png;base64,${img.base64}`}
                  alt={angle.name}
                  className="w-full aspect-[2/3] object-cover"
                />
              ) : (
                <div className="w-full aspect-[2/3] bg-gray-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              )}
              <div className="p-2">
                <p className="text-xs font-semibold text-gray-700 truncate">{angle.name}</p>
                <p className="text-xs text-gray-400 truncate mt-0.5">&ldquo;{angle.hook}&rdquo;</p>
              </div>
              {img && (
                <button
                  onClick={() => downloadImage(img.base64, `angulo-${angle.key}.png`)}
                  className="absolute top-2 right-2 p-1 bg-white/90 rounded-lg text-gray-400 hover:text-gray-700 shadow-sm"
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
    );

    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar active="/one-shoot" onLogout={handleLogout} userEmail={userEmail} />
        <main className="flex-1 md:ml-56 pt-14 md:pt-0">
          <div className="max-w-4xl mx-auto px-4 py-8">
            <GameHeader view={view} />

            <div className="mb-6">
              <h1 className="text-xl font-bold text-gray-900">Tus ángulos están listos para lanzar</h1>
              <p className="text-sm text-gray-500 mt-1">Descargá las imágenes, subí a Meta y dejá correr el test.</p>
            </div>

            {p1Error && (
              <div className="mb-5 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{p1Error}</div>
            )}

            {/* Download all */}
            {p1Images.length > 0 && (
              <button
                onClick={() => p1Images.forEach(img => downloadImage(img.base64, `angulo-${img.angleKey}.png`))}
                className="mb-6 flex items-center gap-2 text-sm text-gray-600 border border-gray-200 rounded-xl px-4 py-2 hover:border-gray-300 hover:bg-white transition-all"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Descargar todas ({p1Images.length})
              </button>
            )}

            {/* Product angles section */}
            {productAngles.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xs font-bold uppercase tracking-wide bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full">Ángulos de Producto</span>
                </div>
                {renderAngleGrid(productAngles)}
              </div>
            )}

            {/* Category angles section */}
            {categoryAnglesArr.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xs font-bold uppercase tracking-wide bg-orange-100 text-orange-700 px-2.5 py-1 rounded-full">Ángulos de Categoría</span>
                </div>
                {renderAngleGrid(categoryAnglesArr)}
              </div>
            )}

            {/* Launch checklist */}
            <div className="mb-8 bg-white border border-gray-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 bg-[#e42820]/10 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-[#e42820]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                </div>
                <h2 className="font-bold text-gray-900 text-sm">Checklist de lanzamiento en Meta</h2>
              </div>
              <ol className="space-y-3">
                {[
                  'Subí las imágenes a Meta Ads Manager',
                  'Un ad set por ángulo con el mismo presupuesto',
                  'Audiencia fría: Intereses o Broad',
                  'Objetivo de campaña: Compras',
                  'Dejá correr al menos 7 días (o hasta 40+ compras)',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-gray-700">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-xs flex items-center justify-center font-bold mt-0.5">{i + 1}</span>
                    {item}
                  </li>
                ))}
              </ol>
            </div>

            {/* CTA */}
            <div className="sticky bottom-4">
              <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-lg flex items-center gap-4">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">¿Ya corriste el test?</p>
                  <p className="text-xs text-gray-400">Cuando tengas datos de Meta, analizá los resultados</p>
                </div>
                <button
                  onClick={() => setView('p1-review')}
                  className="shrink-0 bg-[#e42820] text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-[#c82019] transition-colors text-sm whitespace-nowrap"
                >
                  Ya tengo resultados →
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ── P1 Review ─────────────────────────────────────────────────────────────
  if (view === 'p1-review') {
    const productAngles = p1Angles.filter(a => a.level === 'product');
    const categoryAnglesArr = p1Angles.filter(a => a.level === 'category');
    const currentWinners = p1Angles.filter(a => (angleStatuses[a.key] || 'active') === 'winner');

    const daysNum = parseInt(daysRunning, 10);
    const purchasesNum = parseInt(totalPurchases, 10);
    const guidance = (daysRunning !== '' && totalPurchases !== '')
      ? getGuidanceMessage(isNaN(daysNum) ? 0 : daysNum, isNaN(purchasesNum) ? 0 : purchasesNum)
      : null;

    const setStatus = (key: string, status: AngleStatus) => {
      setAngleStatuses(prev => {
        const next = { ...prev, [key]: status };
        // Persist to localStorage
        if (sessionId) {
          const stored = loadLsImages(sessionId);
          saveLsImages(sessionId, stored.p1, stored.p2, next, stored.launchDate);
        }
        return next;
      });
    };

    const renderReviewCard = (angle: MessageAngle) => {
      const img = p1Images.find(i => i.angleKey === angle.key);
      const status = angleStatuses[angle.key] || 'active';
      const isWinner = status === 'winner';
      const isOff = status === 'off';
      const isProduct = angle.level === 'product';

      return (
        <div
          key={angle.key}
          className={`relative rounded-xl border-2 overflow-hidden bg-white transition-all ${
            isWinner
              ? 'border-green-400 shadow-lg shadow-green-400/20'
              : isOff
              ? 'border-gray-200 opacity-40'
              : 'border-gray-200'
          }`}
        >
          {/* Overlay for off state */}
          {isOff && (
            <div className="absolute inset-0 bg-gray-400/20 z-10 rounded-xl pointer-events-none" />
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

          {/* Card body */}
          <div className="p-3 relative z-20">
            <div className="flex items-center gap-1.5 mb-1">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                isProduct ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
              }`}>
                {isProduct ? 'Producto' : 'Categoría'}
              </span>
              <span className="text-xs text-gray-500 font-medium truncate">{angle.name}</span>
            </div>
            <p className={`text-sm font-semibold text-gray-900 leading-snug mb-3 ${isOff ? 'line-through text-gray-400' : ''}`}>
              &ldquo;{angle.hook}&rdquo;
            </p>

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => setStatus(angle.key, isWinner ? 'active' : 'winner')}
                className={`flex-1 text-xs font-semibold py-1.5 rounded-lg border transition-all flex items-center justify-center gap-1 ${
                  isWinner
                    ? 'bg-green-500 border-green-500 text-white'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-green-300 hover:text-green-700'
                }`}
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Ganador
              </button>
              <button
                onClick={() => setStatus(angle.key, isOff ? 'active' : 'off')}
                className={`flex-1 text-xs font-semibold py-1.5 rounded-lg border transition-all flex items-center justify-center gap-1 ${
                  isOff
                    ? 'bg-red-500 border-red-500 text-white'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-red-300 hover:text-red-600'
                }`}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Apagar
              </button>
            </div>
          </div>
        </div>
      );
    };

    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar active="/one-shoot" onLogout={handleLogout} userEmail={userEmail} />
        <main className="flex-1 md:ml-56 pt-14 md:pt-0 pb-32">
          <div className="max-w-4xl mx-auto px-4 py-8">
            <GameHeader view={view} />

            <div className="mb-6">
              <h1 className="text-xl font-bold text-gray-900">Analizá los resultados</h1>
              <p className="text-sm text-gray-500 mt-1">Marcá los ángulos ganadores según el rendimiento en Meta.</p>
            </div>

            {/* Stats panel */}
            <div className="mb-6 bg-white border border-gray-200 rounded-2xl p-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-3">Resultados de la campaña</h3>
              <div className="flex flex-wrap gap-4 items-end">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Días corriendo</label>
                  <input
                    type="number"
                    min={0}
                    value={daysRunning}
                    onChange={e => setDaysRunning(e.target.value)}
                    placeholder="0"
                    className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#e42820]/20 focus:border-[#e42820]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Compras totales</label>
                  <input
                    type="number"
                    min={0}
                    value={totalPurchases}
                    onChange={e => setTotalPurchases(e.target.value)}
                    placeholder="0"
                    className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#e42820]/20 focus:border-[#e42820]"
                  />
                </div>
              </div>
              {guidance && (
                <div className={`mt-3 text-sm px-3 py-2 rounded-lg border ${guidance.color}`}>
                  {guidance.text}
                </div>
              )}
            </div>

            {/* Product angles */}
            {productAngles.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xs font-bold uppercase tracking-wide bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full">Ángulos de Producto</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {productAngles.map(renderReviewCard)}
                </div>
              </div>
            )}

            {/* Category angles */}
            {categoryAnglesArr.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xs font-bold uppercase tracking-wide bg-orange-100 text-orange-700 px-2.5 py-1 rounded-full">Ángulos de Categoría</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {categoryAnglesArr.map(renderReviewCard)}
                </div>
              </div>
            )}
          </div>

          {/* Sticky bottom bar */}
          <div className="fixed bottom-0 left-0 right-0 md:left-56 z-30 p-4 bg-white border-t border-gray-200 shadow-lg">
            <div className="max-w-4xl mx-auto flex items-center gap-4">
              {currentWinners.length > 0 ? (
                <>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900">
                      {currentWinners.length} ganador{currentWinners.length > 1 ? 'es' : ''} seleccionado{currentWinners.length > 1 ? 's' : ''}
                    </p>
                    <p className="text-xs text-gray-400">Se generarán {currentWinners.length * 3} creativos PEC</p>
                  </div>
                  <button
                    onClick={generateP2}
                    className="shrink-0 bg-[#e42820] text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-[#c82019] transition-colors text-sm"
                  >
                    Escalar al Paso 2 →
                  </button>
                </>
              ) : (
                <>
                  <div className="flex-1">
                    <p className="text-sm text-gray-500">Marcá al menos un ángulo ganador para continuar</p>
                  </div>
                  <button
                    onClick={() => resetToSetup(true)}
                    className="shrink-0 text-sm font-semibold px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 hover:border-gray-400 hover:bg-gray-50 transition-colors"
                  >
                    Generar más ángulos
                  </button>
                </>
              )}
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
            <GameHeader view={view} />
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

            <div className="flex flex-wrap gap-4 justify-center">
              {winningAngles.map(a => (
                <div key={a.key} className="text-left">
                  <p className="text-xs font-bold text-gray-600 mb-1.5">{a.name}</p>
                  <div className="flex gap-1.5">
                    {(['P', 'E', 'C'] as const).map(stage => {
                      const isDone = p2Creatives.some(c => c.angleKey === a.key && c.stage === stage);
                      return (
                        <span key={stage} className={`text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors ${
                          isDone
                            ? stage === 'P' ? 'bg-purple-100 text-purple-700'
                            : stage === 'E' ? 'bg-blue-100 text-blue-700'
                            : 'bg-green-100 text-green-700'
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
            <GameHeader view={view} />

            {/* Header */}
            <div className="flex items-start justify-between mb-6 gap-4">
              <div>
                <h1 className="text-xl font-bold text-gray-900">Campaña PEC lista</h1>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {winningAngles.map(a => (
                    <span key={a.key} className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      a.level === 'product' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                    }`}>
                      {a.name}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => setView('p1-review')}
                  className="text-xs text-gray-500 hover:text-gray-700 underline"
                >
                  Ver Paso 1
                </button>
                <button
                  onClick={() => resetToSetup(false)}
                  className="text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200 transition-colors"
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
                      <div className="flex items-center gap-3 mb-4">
                        <div className={`w-8 h-8 ${STAGE_BG[stage.code]} rounded-lg flex items-center justify-center shrink-0`}>
                          <span className="text-white text-xs font-bold">{stage.code}</span>
                        </div>
                        <div>
                          <h2 className="font-bold text-gray-900">{stage.label}</h2>
                          <p className="text-xs text-gray-400">{stage.description}</p>
                        </div>
                      </div>

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

            {/* Go to Paso 3 */}
            {p2Creatives.length > 0 && (
              <div className="mt-10 flex justify-center">
                <button
                  onClick={() => {
                    setP3AdaptSourceIds(p2Creatives.map(c => c.id));
                    setP3AdaptFormats([]);
                    setP3AdaptedImages([]);
                    setView('p3');
                  }}
                  className="flex items-center gap-2 bg-white border border-purple-200 text-purple-700 font-semibold px-6 py-3 rounded-xl hover:bg-purple-50 transition-colors text-sm"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                  </svg>
                  <span>Adaptar formatos</span>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // ── Paso 3 — Format Adaptation ───────────────────────────────────────────
  if (view === 'p3') {
    const FORMAT_GROUPS = [
      { group: 'RRSS', items: [
        { key: 'story', label: 'Story 9:16', desc: 'Instagram / TikTok' },
        { key: 'feed45', label: 'Feed 4:5', desc: 'Instagram / Facebook' },
        { key: 'square', label: 'Cuadrado 1:1', desc: 'Instagram / Facebook' },
        { key: 'landscape', label: 'Landscape 16:9', desc: 'Facebook / YouTube' },
      ]},
    ];

    const stages: Array<{ code: 'P' | 'E' | 'C'; label: string }> = [
      { code: 'P', label: 'Prospección' },
      { code: 'E', label: 'Evaluación' },
      { code: 'C', label: 'Conversión' },
    ];

    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar active="/one-shoot" onLogout={handleLogout} userEmail={userEmail} />
        <main className="flex-1 md:ml-56 pt-14 md:pt-0">
          <div className="max-w-4xl mx-auto px-4 py-8">
            <GameHeader view={view} />

            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-xl font-bold text-gray-900">Adaptá los formatos</h1>
                <p className="text-sm text-gray-500 mt-1">Seleccioná los creativos y formatos que querés adaptar.</p>
              </div>
              <button
                onClick={() => setView('p2-results')}
                className="text-sm text-gray-400 hover:text-gray-700 flex items-center gap-1.5 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Volver a PEC
              </button>
            </div>

            {/* Creative selector */}
            <div className="mb-6">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Creativos a adaptar</p>
              <div className="space-y-4">
                {stages.map(stage => {
                  const stageCreatives = p2Creatives.filter(c => c.stage === stage.code);
                  if (stageCreatives.length === 0) return null;
                  return (
                    <div key={stage.code}>
                      <p className="text-xs text-gray-400 mb-2 flex items-center gap-1.5">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${STAGE_BG[stage.code]} text-white`}>{stage.code}</span>
                        {stage.label}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {stageCreatives.map(c => {
                          const isSelected = p3AdaptSourceIds.includes(c.id);
                          return (
                            <button
                              key={c.id}
                              onClick={() => setP3AdaptSourceIds(prev =>
                                isSelected && prev.length > 1
                                  ? prev.filter(x => x !== c.id)
                                  : isSelected ? prev : [...prev, c.id]
                              )}
                              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all ${
                                isSelected ? 'border-[#e42820] bg-[#e42820]/10' : 'border-gray-200 bg-white opacity-50 hover:opacity-80'
                              }`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={`data:image/png;base64,${c.base64}`} alt="" className="w-8 h-10 rounded object-cover shrink-0" />
                              <span className="text-xs font-medium text-gray-700 max-w-[90px] truncate">{c.angleName} · {c.formatName}</span>
                              {isSelected && (
                                <svg className="w-3.5 h-3.5 text-[#e42820] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Format selector */}
            <div className="mb-6">
              {FORMAT_GROUPS.map(({ group, items }) => (
                <div key={group}>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{group}</p>
                  <div className="flex flex-wrap gap-3">
                    {items.map(f => (
                      <button
                        key={f.key}
                        onClick={() => setP3AdaptFormats(prev => prev.includes(f.key) ? prev.filter(x => x !== f.key) : [...prev, f.key])}
                        className={`px-4 py-2.5 rounded-xl border text-left transition-all ${
                          p3AdaptFormats.includes(f.key)
                            ? 'border-[#e42820] bg-[#e42820]/10'
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                      >
                        <p className="text-sm font-medium text-gray-900">{f.label}</p>
                        <p className="text-xs text-gray-500">{f.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Generate button */}
            <button
              onClick={generateP3Adaptations}
              disabled={p3AdaptFormats.length === 0 || p3AdaptSourceIds.length === 0 || p3Generating}
              className="mb-8 bg-[#e42820] text-white font-semibold px-6 py-3 rounded-xl hover:bg-[#c82019] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2 text-sm"
            >
              {p3Generating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Generando adaptaciones...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                  </svg>
                  {p3AdaptFormats.length > 0
                    ? `Generar ${p3AdaptFormats.length} formato${p3AdaptFormats.length > 1 ? 's' : ''} × ${p3AdaptSourceIds.length} creativo${p3AdaptSourceIds.length > 1 ? 's' : ''}`
                    : 'Seleccioná al menos un formato'}
                </>
              )}
            </button>

            {/* Adapted images */}
            {p3AdaptedImages.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Adaptaciones generadas ({p3AdaptedImages.length})</p>
                  <button
                    onClick={() => {
                      p3AdaptedImages.forEach((img, i) => {
                        const creative = p2Creatives.find(c => c.id === img.creativeId);
                        const a = document.createElement('a');
                        a.href = `data:image/png;base64,${img.base64}`;
                        a.download = `pec-${creative?.stage || ''}-${img.label.replace(/\s+/g, '-')}-${i + 1}.png`;
                        a.click();
                      });
                    }}
                    className="flex items-center gap-1.5 text-xs text-[#e42820] hover:text-[#c82019] font-medium transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Descargar todas
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {p3AdaptedImages.map((img, i) => {
                    const creative = p2Creatives.find(c => c.id === img.creativeId);
                    return (
                      <div key={i} className="space-y-2">
                        <div className="rounded-xl overflow-hidden border border-gray-200">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`data:image/png;base64,${img.base64}`} alt={img.label} className="w-full" />
                        </div>
                        <p className="text-xs text-gray-500 text-center leading-snug">
                          {img.label}<br />
                          <span className="text-gray-400">{creative?.stage} · {creative?.angleName}</span>
                        </p>
                        <button
                          onClick={() => downloadImage(img.base64, `pec-${creative?.stage || ''}-${img.label.replace(/\s+/g, '-')}-${i + 1}.png`)}
                          className="w-full bg-white hover:bg-gray-100 border border-gray-200 text-gray-500 hover:text-gray-900 text-xs px-3 py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

            {/* Bottom CTAs */}
            <div className="mt-10 flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => resetToSetup(false)}
                className="flex-1 bg-white border border-gray-200 text-gray-700 font-semibold py-3 rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-colors text-sm"
              >
                Nueva sesión
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return null;
}
