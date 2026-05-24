'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { BrandKit } from '@/app/types';
import { useRequireAuth } from '@/app/lib/use-auth';
import { createSupabaseBrowser } from '@/app/lib/supabase-browser';
import Sidebar from '@/app/components/Sidebar';

async function extractTextFromPdf(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages = await Promise.all(
    Array.from({ length: pdf.numPages }, async (_, i) => {
      const page = await pdf.getPage(i + 1);
      const content = await page.getTextContent();
      return content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
    })
  );
  return pages.join('\n').slice(0, 12000);
}

const EMPTY_FORM: Omit<BrandKit, 'id'> = {
  name: '',
  primary1: '#000000',
  primary2: '#ffffff',
  primary3: '#cccccc',
  secondary1: '#888888',
  secondary2: '#aaaaaa',
  secondary3: '#eeeeee',
  typography: '',
  styleDescription: '',
  clientRequest: '',
  referencePiecesStyle: undefined,
  referencePiecesThumbnails: [],
  logoBase64: undefined,
  quickAdjustments: [],
};

const PRIMARY_LABELS = ['P1', 'P2', 'P3'];
const SECONDARY_LABELS = ['S1', 'S2', 'S3'];

export default function ConfigPage() {
  useRequireAuth();
  const supabase = createSupabaseBrowser();
  const [form, setForm] = useState(EMPTY_FORM);
  const [hasKit, setHasKit] = useState(false);
  const [kitLoading, setKitLoading] = useState(true);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [analyzingRefs, setAnalyzingRefs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [choiceMade, setChoiceMade] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('condimento_config_choice') === 'manual';
    return false;
  });

  useEffect(() => {
    fetch('/api/brand-kits').then(r => r.json()).then(kit => {
      if (kit && !kit.error) {
        setForm({ ...EMPTY_FORM, ...kit });
        setHasKit(true);
      } else {
        localStorage.removeItem('condimento_config_choice');
        setChoiceMade(false);
      }
    }).catch(console.error).finally(() => setKitLoading(false));
    fetch('/api/profile').then(r => r.json()).then(data => {
      setHasApiKey(!!data.openai_api_key);
    }).catch(() => setHasApiKey(false));
  }, []);

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExtracting(true);
    try {
      const text = await extractTextFromPdf(file);
      if (!text.trim()) throw new Error('El PDF no tiene texto extraíble');
      const res = await fetch('/api/extract-brand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(await res.text() || 'Error procesando el PDF');
      const data = await res.json();
      setForm(f => ({
        ...f,
        name: data.name || f.name,
        primary1: data.primary1 || f.primary1,
        primary2: data.primary2 || f.primary2,
        primary3: data.primary3 || f.primary3,
        secondary1: data.secondary1 || f.secondary1,
        secondary2: data.secondary2 || f.secondary2,
        secondary3: data.secondary3 || f.secondary3,
        typography: data.typography || f.typography,
        styleDescription: data.styleDescription || f.styleDescription,
      }));
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : 'No se pudo leer el PDF'}`);
    } finally {
      setExtracting(false);
      e.target.value = '';
    }
  };

  const compressImage = (file: File): Promise<string> =>
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
            const result = canvas.toDataURL('image/jpeg', 0.75);
            resolve(result.length > 100 ? result : dataUrl);
          } catch { resolve(dataUrl); }
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });

  const handleReferencePiecesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setAnalyzingRefs(true);
    try {
      const newImages: string[] = await Promise.all(files.slice(0, 5).map(file => compressImage(file)));
      const allImages = [...(form.referencePiecesThumbnails || []), ...newImages].slice(0, 5);
      const res = await fetch('/api/analyze-references', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: allImages }),
      });
      if (!res.ok) throw new Error('Error analizando piezas');
      const data = await res.json();
      setForm(f => ({ ...f, referencePiecesThumbnails: allImages, referencePiecesStyle: data.styleDescription }));
    } catch {
      alert('No se pudieron analizar las piezas. Intentá de nuevo.');
    } finally {
      setAnalyzingRefs(false);
      e.target.value = '';
    }
  };

  const removeReferencePiece = async (idx: number) => {
    const remaining = (form.referencePiecesThumbnails || []).filter((_, i) => i !== idx);
    if (remaining.length === 0) {
      setForm(f => ({ ...f, referencePiecesThumbnails: [], referencePiecesStyle: undefined }));
      return;
    }
    setAnalyzingRefs(true);
    try {
      const res = await fetch('/api/analyze-references', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: remaining }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error analizando piezas');
      setForm(f => ({ ...f, referencePiecesThumbnails: remaining, referencePiecesStyle: data.styleDescription }));
    } catch {
      alert('No se pudieron analizar las piezas restantes. Intentá de nuevo.');
    } finally {
      setAnalyzingRefs(false);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm(f => ({ ...f, logoBase64: reader.result as string, logoColorBase64: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.styleDescription.trim()) return;
    setSaving(true);
    setSaveError('');
    try {
      const kit: BrandKit = { ...form, id: 'user' };
      const res = await fetch('/api/brand-kits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(kit),
      });
      if (!res.ok) throw new Error('Error guardando la marca. Intentá de nuevo.');
      const isFirstKit = !hasKit;
      setHasKit(true);
      setSaved(true);
      if (isFirstKit) {
        setTimeout(() => { window.location.href = '/'; }, 1500);
      } else {
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Error guardando');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar active="/config" onLogout={handleLogout} />
      <div className="flex-1 md:ml-56 min-h-screen pt-12 md:pt-0">
      <main className="max-w-2xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-1">Mi marca</h1>
          <p className="text-gray-500 text-sm">Configurá el brand kit de tu marca. Se usará en todas tus generaciones.</p>
        </div>

        {/* Loading skeleton while fetching brand kit */}
        {kitLoading && (
          <div className="space-y-4 animate-pulse">
            <div className="h-10 bg-gray-100 rounded-xl w-1/2" />
            <div className="h-32 bg-gray-100 rounded-2xl" />
          </div>
        )}

        {/* Brand creation choice — only shown on first setup */}
        {!kitLoading && !hasKit && !choiceMade && (
          <div className="space-y-4 mb-8">
            <div className="bg-[#e42820]/5 border border-[#e42820]/20 rounded-2xl p-5 space-y-1 mb-6">
              <span className="bg-[#e42820] text-white text-xs font-bold px-2 py-0.5 rounded-md">Paso 2 de 2</span>
              <p className="text-sm font-semibold text-gray-900 mt-2">Configurá tu marca</p>
              <p className="text-xs text-gray-500">Condimento aplica tu identidad automáticamente en cada pieza que generés.</p>
            </div>
            <p className="text-sm font-medium text-gray-700">¿Cómo querés empezar?</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                onClick={() => { window.location.href = '/crear-marca'; }}
                className="group flex flex-col gap-3 bg-white border-2 border-[#e42820]/30 hover:border-[#e42820] rounded-2xl p-5 text-left transition-all hover:shadow-md"
              >
                <div className="w-10 h-10 rounded-xl bg-[#e42820]/10 flex items-center justify-center text-xl">✨</div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">Crear marca desde cero con IA</p>
                  <p className="text-xs text-gray-500 mt-1">Respondés unas preguntas y la IA genera nombre, paleta, estilo y logo. Ideal si todavía no tenés marca.</p>
                </div>
                <span className="text-xs text-[#e42820] font-medium group-hover:underline">Empezar →</span>
              </button>
              <button
                onClick={() => { setChoiceMade(true); localStorage.setItem('condimento_config_choice', 'manual'); }}
                className="group flex flex-col gap-3 bg-white border-2 border-gray-200 hover:border-gray-400 rounded-2xl p-5 text-left transition-all hover:shadow-md"
              >
                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-xl">📋</div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">Ya tengo marca, completar el formulario</p>
                  <p className="text-xs text-gray-500 mt-1">Cargás colores, tipografía, estilo y logo de tu marca existente.</p>
                </div>
                <span className="text-xs text-gray-500 font-medium group-hover:underline">Completar formulario →</span>
              </button>
            </div>
          </div>
        )}

        {hasApiKey === false && (
          <div className="mb-6 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-4 text-sm flex items-start gap-3">
            <span className="text-amber-400 text-base mt-0.5">⚠</span>
            <div>
              <p className="font-medium text-amber-400 mb-1">Primero configurá tu API key de OpenAI</p>
              <p className="text-gray-500 mb-3">La extracción automática desde PDF necesita tu API key. Podés completar el formulario manualmente, pero no podrás usar "Importar desde PDF" hasta configurarla.</p>
              <Link href="/perfil" className="inline-block bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold px-4 py-2 rounded-lg transition-colors">
                Ir a Perfil → agregar API key
              </Link>
            </div>
          </div>
        )}

        {!kitLoading && (hasKit || choiceMade) && <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-lg text-gray-900">{hasKit ? 'Editar brand kit' : 'Crear brand kit'}</h2>
            <label className={`cursor-pointer flex items-center gap-2 text-sm px-4 py-2 rounded-xl border transition-colors ${extracting ? 'opacity-50 cursor-not-allowed border-gray-200 text-gray-500' : 'border-[#e42820]/40 text-[#e42820] hover:bg-[#e42820]/10 hover:border-[#e42820]'}`}>
              {extracting ? (
                <><div className="w-4 h-4 border-2 border-[#e42820]/30 border-t-[#e42820] rounded-full animate-spin" />Leyendo manual...</>
              ) : (
                <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>Importar desde PDF</>
              )}
              <input type="file" accept=".pdf" onChange={handlePdfUpload} disabled={extracting} className="hidden" />
            </label>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <label className="text-sm text-gray-600">Nombre de la marca</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ej: Mi Tienda"
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#e42820] text-sm"
            />
          </div>

          {/* Colors */}
          <div className="space-y-3">
            <div>
              <label className="text-sm text-gray-600">Paleta primaria</label>
              <p className="text-xs text-gray-400 mt-0.5">Los 3 colores principales de tu marca</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {(['primary1', 'primary2', 'primary3'] as const).map((key, i) => (
                <div key={key} className="space-y-1.5">
                  <p className="text-xs text-gray-500">{PRIMARY_LABELS[i]}</p>
                  <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
                    <input type="color" value={form[key] as string} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent" />
                    <span className="text-xs text-gray-600 font-mono">{form[key] as string}</span>
                  </div>
                </div>
              ))}
            </div>
            <div>
              <label className="text-sm text-gray-600">Paleta secundaria</label>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {(['secondary1', 'secondary2', 'secondary3'] as const).map((key, i) => (
                <div key={key} className="space-y-1.5">
                  <p className="text-xs text-gray-500">{SECONDARY_LABELS[i]}</p>
                  <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
                    <input type="color" value={form[key] as string} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent" />
                    <span className="text-xs text-gray-600 font-mono">{form[key] as string}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Typography */}
          <div className="space-y-2">
            <label className="text-sm text-gray-600">Tipografía</label>
            <input
              type="text"
              value={form.typography}
              onChange={e => setForm(f => ({ ...f, typography: e.target.value }))}
              placeholder="Ej: Montserrat (principal), Playfair Display (acento)"
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#e42820] text-sm"
            />
          </div>

          {/* Business context */}
          <div className="space-y-2">
            <label className="text-sm text-gray-600">¿Qué vendés y a quién?</label>
            <p className="text-xs text-gray-400">Lo usan los módulos de RRSS y PDP para adaptar el contenido a tu negocio. Cuanto más específico, mejor.</p>
            <textarea
              value={form.clientRequest || ''}
              onChange={e => setForm(f => ({ ...f, clientRequest: e.target.value }))}
              placeholder="Ej: Vendemos proteínas y suplementos deportivos para hombres de 18-35 años que entrenan en gym. Nuestro diferencial es que somos nacionales, con sabores locales y sin sellos."
              rows={3}
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#e42820] resize-none text-sm leading-relaxed"
            />
          </div>

          {/* Style */}
          <div className="space-y-2">
            <label className="text-sm text-gray-600">Estilo y descripción de marca</label>
            <textarea
              value={form.styleDescription}
              onChange={e => setForm(f => ({ ...f, styleDescription: e.target.value }))}
              placeholder="Estilo visual, tono, audiencia, reglas de diseño, prohibiciones, aplicaciones en RRSS..."
              rows={5}
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#e42820] resize-none text-sm leading-relaxed"
            />
          </div>

          {/* Reference pieces */}
          <div className="space-y-3">
            <div>
              <label className="text-sm text-gray-600">Piezas anteriores aprobadas</label>
              <p className="text-xs text-gray-400 mt-0.5">GPT-4o analiza el estilo visual y lo usa como referencia. Máx 5 piezas.</p>
            </div>
            <div className="flex gap-3 flex-wrap">
              {(form.referencePiecesThumbnails || []).map((img, i) => (
                <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-gray-200">
                  <img src={img} alt={`ref ${i+1}`} className="w-full h-full object-cover" />
                  <button
                    onClick={() => removeReferencePiece(i)}
                    disabled={analyzingRefs}
                    className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center text-gray-900/80 hover:text-gray-900 text-xs"
                  >×</button>
                </div>
              ))}
              {(form.referencePiecesThumbnails || []).length < 5 && (
                <label className={`w-20 h-20 rounded-xl border border-dashed flex flex-col items-center justify-center gap-1 transition-colors ${analyzingRefs ? 'opacity-50 cursor-not-allowed border-gray-200' : 'border-gray-300 hover:border-white/40 cursor-pointer'}`}>
                  {analyzingRefs ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      <span className="text-xs text-gray-400">Pieza</span>
                    </>
                  )}
                  <input type="file" accept="image/*" multiple onChange={handleReferencePiecesUpload} disabled={analyzingRefs} className="hidden" />
                </label>
              )}
            </div>
            {form.referencePiecesStyle && (
              <div className="bg-[#e42820]/5 border border-[#e42820]/20 rounded-xl p-3">
                <p className="text-xs text-[#e42820] font-medium mb-1">Estilo extraído</p>
                <p className="text-xs text-gray-500 leading-relaxed line-clamp-3">{form.referencePiecesStyle}</p>
              </div>
            )}
          </div>

          {/* Logo */}
          <div className="space-y-3">
            <div>
              <label className="text-sm text-gray-600">Logo (opcional)</label>
              <p className="text-xs text-gray-400 mt-0.5">Logo principal en color — se usa como referencia visual en todas las piezas.</p>
            </div>
            <div className="flex items-center gap-4">
              {form.logoBase64 && (
                <img src={form.logoBase64} alt="Logo" className="w-16 h-16 rounded-xl object-contain bg-gray-50 border border-gray-200 p-2" />
              )}
              <label className="cursor-pointer bg-white/5 hover:bg-gray-100 border border-gray-200 hover:border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-600 hover:text-gray-900 transition-colors flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                {form.logoBase64 ? 'Cambiar logo' : 'Subir logo'}
                <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              </label>
              {form.logoBase64 && (
                <button onClick={() => setForm(f => ({ ...f, logoBase64: undefined }))} className="text-gray-400 hover:text-red-400 text-xs transition-colors">
                  Quitar
                </button>
              )}
            </div>

            {/* Logo variants from crear-marca */}
            {(form.logoWhiteBase64 || form.logoDarkBase64) && (
              <div className="space-y-2">
                <p className="text-xs text-gray-400">Versiones generadas con IA</p>
                <div className="flex gap-3">
                  {form.logoWhiteBase64 && (
                    <div className="space-y-1">
                      <div className="w-20 h-20 rounded-xl bg-black flex items-center justify-center border border-gray-200 overflow-hidden">
                        <img src={form.logoWhiteBase64} alt="Logo blanco" className="w-full h-full object-contain p-2" />
                      </div>
                      <p className="text-[10px] text-gray-400 text-center">Blanco</p>
                    </div>
                  )}
                  {form.logoDarkBase64 && (
                    <div className="space-y-1">
                      <div className="w-20 h-20 rounded-xl bg-white flex items-center justify-center border border-gray-200 overflow-hidden">
                        <img src={form.logoDarkBase64} alt="Logo oscuro" className="w-full h-full object-contain p-2" />
                      </div>
                      <p className="text-[10px] text-gray-400 text-center">Oscuro</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Save */}
          {saveError && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{saveError}</div>
          )}
          <button
            onClick={handleSave}
            disabled={!form.name.trim() || !form.styleDescription.trim() || saving}
            className={`w-full font-medium px-4 py-3 rounded-xl transition-all flex items-center justify-center gap-2 ${
              saved ? 'bg-emerald-600 text-gray-900' : 'bg-[#e42820] hover:bg-[#e42820] disabled:opacity-40 disabled:cursor-not-allowed text-gray-900'
            }`}
          >
            {saved ? (
              <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>Guardado</>
            ) : saving ? 'Guardando...' : hasKit ? 'Guardar cambios' : 'Crear brand kit'}
          </button>
        </div>}

        <Link
          href="/"
          className="flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-gray-900/80 transition-colors py-2 mt-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Volver al inicio
        </Link>
      </main>
      </div>
    </div>
  );
}
