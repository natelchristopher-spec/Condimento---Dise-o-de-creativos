'use client';

import { useState, useEffect, useRef } from 'react';
import { createSupabaseBrowser } from '@/app/lib/supabase-browser';
import { useRequireAuth } from '@/app/lib/use-auth';
import { BrandKit } from '@/app/types';
import Sidebar from '@/app/components/Sidebar';
import { CREATIVE_ANGLES } from '@/app/api/generate-testing-angles/route';

interface AngleResult {
  id: string;
  base64: string;
  angleKey: string;
  angleLabel: string;
  stage: string;
  stageKey: 'prospeccion' | 'evaluacion' | 'conversion';
}

const STAGE_COLORS: Record<string, string> = {
  prospeccion: 'bg-blue-50 border-blue-200 text-blue-700',
  evaluacion: 'bg-amber-50 border-amber-200 text-amber-700',
  conversion: 'bg-purple-50 border-purple-200 text-purple-700',
};

const readAsPng = (file: File): Promise<string> =>
  new Promise(resolve => {
    const blobUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(blobUrl);
      const tryAt = (maxDim: number, quality: number): string | null => {
        try {
          let { naturalWidth: w, naturalHeight: h } = img;
          if (!w || !h) return null;
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
          const out = canvas.toDataURL('image/jpeg', quality);
          return out.length > 100 ? out : null;
        } catch { return null; }
      };
      resolve(tryAt(1024, 0.82) || tryAt(768, 0.75) || tryAt(512, 0.65) || '');
    };
    img.onerror = () => { URL.revokeObjectURL(blobUrl); resolve(''); };
    img.src = blobUrl;
  });

export default function TestingPage() {
  useRequireAuth();
  const supabase = createSupabaseBrowser();

  const [brandKit, setBrandKit] = useState<BrandKit | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);

  const [brief, setBrief] = useState('');
  const [productImage, setProductImage] = useState('');
  const [productPreview, setProductPreview] = useState('');
  const [count, setCount] = useState(6);

  const [step, setStep] = useState<'idle' | 'generating' | 'results'>('idle');
  const [results, setResults] = useState<AngleResult[]>([]);
  const [generatedCount, setGeneratedCount] = useState(0);
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (step === 'generating') {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [step]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const handleProductFile = async (file: File) => {
    const b64 = await readAsPng(file);
    if (b64) {
      setProductImage(b64);
      setProductPreview(b64);
    }
  };

  const handleGenerate = async () => {
    if (!brandKit) return;
    setError('');
    setResults([]);
    setGeneratedCount(0);
    setStep('generating');

    try {
      const res = await fetch('/api/generate-testing-angles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief, brandKit, productImage, count }),
      });

      if (!res.ok || !res.body) {
        setError('Error al conectar con la API. Intentá de nuevo.');
        setStep('idle');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const collected: AngleResult[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.error) { setError(data.error); setStep('idle'); return; }
            if (data.image) {
              collected.push(data.image);
              setGeneratedCount(collected.length);
              setResults([...collected]);
            }
            if (data.done) {
              setStep('results');
            }
          } catch { /* malformed chunk */ }
        }
      }

      if (collected.length > 0) setStep('results');
      else { setError('No se generaron imágenes. Intentá de nuevo.'); setStep('idle'); }
    } catch {
      setError('Error de conexión. Verificá tu red e intentá de nuevo.');
      setStep('idle');
    }
  };

  const downloadImage = (result: AngleResult) => {
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${result.base64}`;
    link.download = `${result.angleKey}-${Date.now()}.png`;
    link.click();
  };

  const downloadAll = () => results.forEach(r => downloadImage(r));

  const reset = () => {
    setStep('idle');
    setResults([]);
    setGeneratedCount(0);
    setError('');
  };

  const sortedResults = [...results].sort((a, b) => {
    const order = CREATIVE_ANGLES.map(a => a.key);
    return order.indexOf(a.angleKey) - order.indexOf(b.angleKey);
  });

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar active="/testing" userEmail={userEmail} onLogout={handleLogout} />

      <main className="flex-1 md:ml-56 overflow-y-auto">
        <div className="px-4 sm:px-6 py-8 sm:py-10 max-w-5xl mx-auto">

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Test de Ángulos</h1>
            <p className="mt-1 text-sm text-gray-500">
              Generá hasta 6 creativos con distintos ángulos de mensaje para encontrar el que mejor conecta con tu audiencia.
            </p>
          </div>

          {/* No brand kit warning */}
          {!brandKit && (
            <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
              Necesitás configurar tu marca antes de generar ángulos.{' '}
              <a href="/config" className="underline font-medium">Ir a Mi marca →</a>
            </div>
          )}

          {/* No API key warning */}
          {hasApiKey === false && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
              Configurá tu API key de OpenAI para usar este módulo.{' '}
              <a href="/perfil" className="underline font-medium">Ir a Perfil →</a>
            </div>
          )}

          {/* ── IDLE: Setup form ── */}
          {step === 'idle' && (
            <div className="space-y-6">
              {/* Angles preview */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Los 6 ángulos del sistema</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {CREATIVE_ANGLES.map(angle => (
                    <div key={angle.key} className="flex items-center gap-2 text-sm">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${STAGE_COLORS[angle.stageKey]}`}>
                        {angle.stage === 'Prospección' ? 'P' : angle.stage === 'Evaluación' ? 'E' : 'E/C'}
                      </span>
                      <span className="text-gray-700 truncate">{angle.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Product image */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Foto del producto</label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative border-2 border-dashed rounded-xl transition-all cursor-pointer
                    ${productPreview ? 'border-gray-200 bg-gray-50' : 'border-gray-300 hover:border-[#e42820]/50 hover:bg-[#e42820]/[0.02]'}`}
                >
                  {productPreview ? (
                    <div className="flex items-center gap-4 p-4">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={productPreview} alt="Producto" className="w-20 h-20 object-contain rounded-lg bg-white border border-gray-100" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">Foto cargada</p>
                        <p className="text-xs text-gray-500 mt-0.5">Clic para cambiar</p>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); setProductImage(''); setProductPreview(''); }}
                        className="ml-auto text-gray-400 hover:text-gray-700 p-1"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
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
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleProductFile(f); e.target.value = ''; }}
                />
              </div>

              {/* Brief */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Brief del producto</label>
                <textarea
                  value={brief}
                  onChange={e => setBrief(e.target.value)}
                  placeholder="Describí el producto: qué es, a quién va dirigido, beneficios clave, propuesta de valor..."
                  rows={4}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-[#e42820]/30 focus:border-[#e42820]/50"
                />
              </div>

              {/* Count selector */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Cantidad de ángulos</label>
                <div className="flex gap-2">
                  {[3, 4, 5, 6].map(n => (
                    <button
                      key={n}
                      onClick={() => setCount(n)}
                      className={`w-12 h-10 rounded-xl text-sm font-semibold border transition-all ${
                        count === n
                          ? 'bg-[#e42820] text-white border-[#e42820]'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1.5">Más ángulos = mayor costo de API y tiempo de generación</p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
              )}

              <button
                onClick={handleGenerate}
                disabled={!brandKit || hasApiKey === false || (!brief.trim() && !productImage)}
                className="w-full sm:w-auto px-8 py-3 bg-[#e42820] text-white font-semibold rounded-xl hover:bg-[#c41f18] disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm"
              >
                Generar {count} ángulos
              </button>
              {!brief.trim() && !productImage && (
                <p className="text-xs text-gray-400">Necesitás al menos una foto del producto o un brief.</p>
              )}
            </div>
          )}

          {/* ── GENERATING ── */}
          {step === 'generating' && (
            <div className="space-y-6">
              {/* Progress */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-gray-900">Generando ángulos...</p>
                  <span className="text-xs text-gray-400">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5 mb-3">
                  <div
                    className="bg-[#e42820] h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${(generatedCount / count) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500">{generatedCount} de {count} generados</p>
              </div>

              {/* Partial results as they stream in */}
              {results.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {sortedResults.map(result => (
                    <AngleCard key={result.id} result={result} onDownload={downloadImage} />
                  ))}
                  {/* Skeleton placeholders for remaining */}
                  {Array.from({ length: count - results.length }).map((_, i) => (
                    <div key={`sk-${i}`} className="bg-white border border-gray-200 rounded-xl overflow-hidden animate-pulse">
                      <div className="bg-gray-100" style={{ aspectRatio: '2/3' }} />
                      <div className="p-3 space-y-2">
                        <div className="h-3 bg-gray-100 rounded w-2/3" />
                        <div className="h-3 bg-gray-100 rounded w-1/3" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Initial skeleton before any result arrives */}
              {results.length === 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {Array.from({ length: count }).map((_, i) => (
                    <div key={i} className="bg-white border border-gray-200 rounded-xl overflow-hidden animate-pulse">
                      <div className="bg-gray-100" style={{ aspectRatio: '2/3' }} />
                      <div className="p-3 space-y-2">
                        <div className="h-3 bg-gray-100 rounded w-2/3" />
                        <div className="h-3 bg-gray-100 rounded w-1/3" />
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
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{results.length} ángulos generados</h2>
                  <p className="text-sm text-gray-500">Publicá cada uno por separado y medí cuál genera mejor performance.</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={downloadAll}
                    className="text-sm text-gray-700 hover:text-gray-900 border border-gray-300 hover:border-gray-400 px-4 py-2 rounded-xl transition-colors"
                  >
                    Descargar todos
                  </button>
                  <button
                    onClick={reset}
                    className="text-sm text-gray-700 hover:text-gray-900 border border-gray-300 hover:border-gray-400 px-4 py-2 rounded-xl transition-colors"
                  >
                    Nuevo test
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {sortedResults.map(result => (
                  <AngleCard key={result.id} result={result} onDownload={downloadImage} />
                ))}
              </div>

              {/* Hint */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
                <p className="font-semibold mb-1">Cómo usar estos resultados</p>
                <p>Publicá cada ángulo en una campaña de Prospección o Evaluación según su etapa (P / E / E·C). Después de 7 días, comparé el CTR y el costo por resultado de cada uno para identificar qué ángulo conecta mejor con tu audiencia.</p>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}

function AngleCard({ result, onDownload }: { result: AngleResult; onDownload: (r: AngleResult) => void }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden group hover:shadow-md transition-all">
      {/* Image */}
      <div className="relative overflow-hidden bg-gray-50" style={{ aspectRatio: '2/3' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:image/png;base64,${result.base64}`}
          alt={result.angleLabel}
          className="w-full h-full object-cover"
        />
        {/* Download overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-end justify-end p-2">
          <button
            onClick={() => onDownload(result)}
            className="opacity-0 group-hover:opacity-100 transition-opacity bg-white text-gray-900 rounded-lg p-1.5 shadow-md hover:bg-gray-50"
            title="Descargar"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="text-sm font-semibold text-gray-900 truncate">{result.angleLabel}</p>
        <div className="flex items-center gap-1.5 mt-1">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STAGE_COLORS[result.stageKey]}`}>
            {result.stageKey === 'prospeccion' ? 'P' : result.stageKey === 'evaluacion' ? 'E' : 'E·C'}
          </span>
          <span className="text-xs text-gray-500 truncate">{result.stage}</span>
        </div>
      </div>
    </div>
  );
}
