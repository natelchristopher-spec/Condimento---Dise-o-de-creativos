'use client';

import { useState, useEffect } from 'react';
import { createSupabaseBrowser } from '@/app/lib/supabase-browser';
import { useRequireAuth } from '@/app/lib/use-auth';
import { BrandKit } from '@/app/types';
import Sidebar from '@/app/components/Sidebar';
import Link from 'next/link';

type Step = 'input' | 'generating' | 'pick' | 'finalizing' | 'edit' | 'done';

interface BrandConcept {
  name: string;
  nameRationale: string;
  tagline: string;
  primary1: string; primary2: string; primary3: string;
  secondary1: string; secondary2: string; secondary3: string;
  typography: string;
  styleDescription: string;
  logoPrompt: string;
  logoColorBase64: string;
  logoWhiteBase64?: string;
  logoDarkBase64?: string;
}

const CATEGORIES = [
  { id: 'moda',        label: 'Moda',          emoji: '👕' },
  { id: 'skincare',    label: 'Skincare',       emoji: '✨' },
  { id: 'suplementos', label: 'Suplementos',    emoji: '💪' },
  { id: 'hogar',       label: 'Hogar / Deco',   emoji: '🏠' },
  { id: 'accesorios',  label: 'Accesorios',     emoji: '💍' },
  { id: 'electronica', label: 'Electro / Tech', emoji: '📱' },
  { id: 'mascotas',    label: 'Mascotas',       emoji: '🐾' },
  { id: 'food',        label: 'Food',           emoji: '🍕' },
  { id: 'otros',       label: 'Otros',          emoji: '📦' },
];

const GENERATING_MSGS = [
  'Analizando el mercado...',
  'Creando propuestas de marca...',
  'Definiendo paletas de color...',
  'Diseñando logos...',
  'Finalizando identidades...',
];

function ColorSwatch({ color, onChange }: { color: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <label className="relative cursor-pointer">
        <div className="w-8 h-8 rounded-lg border border-gray-200 shadow-sm" style={{ background: color }} />
        <input
          type="color"
          value={color}
          onChange={e => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
        />
      </label>
      <code className="text-[11px] text-gray-400 font-mono">{color}</code>
    </div>
  );
}

function LogoPlaceholder({ name }: { name: string }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className="w-full h-full flex items-center justify-center bg-gray-100">
      <span className="text-2xl font-bold text-gray-300">{initials || '?'}</span>
    </div>
  );
}

export default function CrearMarcaPage() {
  useRequireAuth();
  const supabase = createSupabaseBrowser();

  const [step, setStep] = useState<Step>('input');
  const [storeUrl, setStoreUrl] = useState('');
  const [scrapingUrl, setScrapingUrl] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [category, setCategory] = useState('');
  const [brief, setBrief] = useState('');
  const [concepts, setConcepts] = useState<BrandConcept[]>([]);
  const [selected, setSelected] = useState<BrandConcept | null>(null);
  const [msgIdx, setMsgIdx] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [logosLoading, setLogosLoading] = useState(false);
  const [logosFailed, setLogosFailed] = useState(false);

  // Edit fields
  const [eName, setEName] = useState('');
  const [eTagline, setETagline] = useState('');
  const [eP1, setEP1] = useState(''); const [eP2, setEP2] = useState(''); const [eP3, setEP3] = useState('');
  const [eS1, setES1] = useState(''); const [eS2, setES2] = useState(''); const [eS3, setES3] = useState('');
  const [eTypo, setETypo] = useState('');
  const [eStyle, setEStyle] = useState('');

  useEffect(() => {
    if (step !== 'generating') return;
    const id = setInterval(() => setMsgIdx(i => (i + 1) % GENERATING_MSGS.length), 2500);
    return () => clearInterval(id);
  }, [step]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const scrapeUrl = async () => {
    if (!storeUrl.trim()) return;
    setScrapingUrl(true);
    setError('');
    try {
      const res = await fetch('/api/scrape-brand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: storeUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al leer la URL');
      if (data.businessName) setBusinessName(data.businessName);
      if (data.category) setCategory(data.category);
      if (data.brief) setBrief(data.brief);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer la URL');
    } finally {
      setScrapingUrl(false);
    }
  };

  const generate = async () => {
    if (!category || !brief.trim()) return;
    setStep('generating');
    setMsgIdx(0);
    setError('');
    try {
      const res = await fetch('/api/create-brand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessName: businessName.trim(), category, brief: brief.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error generando marcas');
      setConcepts(data.concepts || []);
      setStep('pick');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error generando propuestas');
      setStep('input');
    }
  };

  const fetchVariantLogos = async (logoPrompt: string) => {
    setLogosLoading(true);
    setLogosFailed(false);
    try {
      const res = await fetch('/api/create-brand-logos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logoPrompt }),
      });
      if (!res.ok) throw new Error('error');
      const data = await res.json();
      setSelected(prev => prev ? { ...prev, logoWhiteBase64: data.logoWhiteBase64, logoDarkBase64: data.logoDarkBase64 } : prev);
    } catch {
      setLogosFailed(true);
    } finally {
      setLogosLoading(false);
    }
  };

  const pickConcept = (concept: BrandConcept) => {
    setSelected(concept);
    setEName(concept.name); setETagline(concept.tagline);
    setEP1(concept.primary1); setEP2(concept.primary2); setEP3(concept.primary3);
    setES1(concept.secondary1); setES2(concept.secondary2); setES3(concept.secondary3);
    setETypo(concept.typography); setEStyle(concept.styleDescription);
    setStep('edit');
    fetchVariantLogos(concept.logoPrompt);
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    setError('');
    const kit: BrandKit = {
      id: '',
      name: eName,
      primary1: eP1, primary2: eP2, primary3: eP3,
      secondary1: eS1, secondary2: eS2, secondary3: eS3,
      typography: eTypo,
      styleDescription: eStyle,
      logoBase64: selected.logoColorBase64,
      logoColorBase64: selected.logoColorBase64,
      logoWhiteBase64: selected.logoWhiteBase64,
      logoDarkBase64: selected.logoDarkBase64,
    };
    try {
      const res = await fetch('/api/brand-kits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(kit),
      });
      if (!res.ok) throw new Error('Error guardando la marca');
      setStep('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error guardando');
    } finally {
      setSaving(false);
    }
  };

  const canGenerate = !!category && !!brief.trim();

  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar active="/crear-marca" onLogout={handleLogout} />
      <div className="flex-1 md:ml-56 min-h-screen pt-12 md:pt-0">
        <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">

          {/* Header */}
          <div>
            <h1 className="text-xl font-bold text-gray-900">Crear Marca con IA</h1>
            <p className="text-sm text-gray-500 mt-0.5">Generá tu identidad visual completa — paleta, tipografía y logo — en minutos.</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          {/* ── INPUT ── */}
          {step === 'input' && (
            <div className="space-y-6">

              {/* URL import */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">
                  Ya tenés una tienda?
                  <span className="font-normal text-gray-400 ml-1">Pegá la URL y llenamos todo automáticamente</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={storeUrl}
                    onChange={e => setStoreUrl(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && scrapeUrl()}
                    placeholder="https://mitienda.com"
                    className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#e42820]"
                  />
                  <button
                    onClick={scrapeUrl}
                    disabled={!storeUrl.trim() || scrapingUrl}
                    className="bg-[#e42820] hover:bg-[#c41f18] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors flex items-center gap-2 shrink-0"
                  >
                    {scrapingUrl ? (
                      <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Leyendo...</>
                    ) : 'Escanear'}
                  </button>
                </div>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400">o completá manualmente</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              {/* Business name */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">
                  Nombre del negocio
                  <span className="font-normal text-gray-400 ml-1">(opcional — si no tenés, la IA propone opciones)</span>
                </label>
                <input
                  type="text"
                  value={businessName}
                  onChange={e => setBusinessName(e.target.value)}
                  placeholder="Ej: NOMADE, AuraStore, FlexFit..."
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#e42820]"
                />
              </div>

              {/* Category */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">Categoría del negocio</label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setCategory(cat.id)}
                      className={`flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border text-center transition-all ${
                        category === cat.id
                          ? 'border-[#e42820] bg-[#e42820]/5'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <span className="text-xl">{cat.emoji}</span>
                      <span className={`text-[11px] font-medium leading-tight ${category === cat.id ? 'text-[#e42820]' : 'text-gray-600'}`}>
                        {cat.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Brief */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">¿Qué vendés y a quién?</label>
                <p className="text-xs text-gray-400">Cuanto más específico, mejor será la propuesta. Incluí el tipo de producto y tu cliente ideal.</p>
                <textarea
                  value={brief}
                  onChange={e => setBrief(e.target.value)}
                  placeholder={'Ej: "Ropa de gym para mujeres jóvenes urbanas que buscan prendas funcionales con diseño editorial. Producto: calzas, tops, camperas de entrenamiento. Target: mujeres 22-35, fitness lifestyle, Buenos Aires."'}
                  rows={4}
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#e42820] resize-none leading-relaxed"
                />
              </div>

              <button
                onClick={generate}
                disabled={!canGenerate}
                className="w-full bg-[#e42820] hover:bg-[#c41f18] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-6 py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                Crear 3 propuestas de marca
              </button>
            </div>
          )}

          {/* ── GENERATING / FINALIZING ── */}
          {(step === 'generating' || step === 'finalizing') && (
            <div className="flex flex-col items-center justify-center py-24 space-y-6">
              <div className="w-14 h-14 rounded-2xl bg-[#e42820]/10 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-[#e42820]/20 border-t-[#e42820] rounded-full animate-spin" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-base font-semibold text-gray-900">{GENERATING_MSGS[msgIdx]}</p>
                <p className="text-sm text-gray-400">
                  {step === 'generating' ? 'Esto toma ~25 segundos' : 'Generando versiones de logo...'}
                </p>
              </div>
              {step === 'generating' && (
                <div className="flex gap-1.5">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="w-2 h-2 rounded-full bg-[#e42820]/30 animate-pulse" style={{ animationDelay: `${i * 200}ms` }} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── PICK ── */}
          {step === 'pick' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Elegí tu marca</h2>
                <p className="text-sm text-gray-500">Tres propuestas distintas. Hacé clic en la que más te gusta para editarla y guardarla.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {concepts.map((concept, i) => (
                  <button
                    key={i}
                    onClick={() => pickConcept(concept)}
                    className="bg-white border border-gray-200 hover:border-[#e42820] hover:shadow-md rounded-2xl overflow-hidden text-left transition-all group"
                  >
                    {/* Logo */}
                    <div className="aspect-square bg-gray-50 flex items-center justify-center overflow-hidden">
                      {concept.logoColorBase64 ? (
                        <img
                          src={`data:image/png;base64,${concept.logoColorBase64}`}
                          alt={concept.name}
                          className="w-full h-full object-contain p-4"
                        />
                      ) : (
                        <LogoPlaceholder name={concept.name} />
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-4 space-y-3">
                      <div>
                        <p className="font-bold text-gray-900 text-base leading-tight">{concept.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5 italic">"{concept.tagline}"</p>
                      </div>

                      {/* Color swatches */}
                      <div className="flex gap-1.5">
                        {[concept.primary1, concept.primary2, concept.primary3].map((c, j) => (
                          <div key={j} className="w-6 h-6 rounded-full border border-white shadow-sm" style={{ background: c }} title={c} />
                        ))}
                        <div className="w-px bg-gray-200 mx-0.5" />
                        {[concept.secondary1, concept.secondary2, concept.secondary3].map((c, j) => (
                          <div key={j} className="w-6 h-6 rounded-full border border-gray-200" style={{ background: c }} title={c} />
                        ))}
                      </div>

                      <p className="text-[11px] text-gray-400 leading-relaxed line-clamp-2">{concept.styleDescription}</p>

                      <div className="flex items-center gap-1 text-[#e42820] text-xs font-semibold group-hover:gap-2 transition-all">
                        Elegir esta
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <button
                onClick={() => { setStep('input'); setError(''); }}
                className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                ← Volver y cambiar el brief
              </button>
            </div>
          )}

          {/* ── EDIT ── */}
          {step === 'edit' && selected && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Revisá tu marca</h2>
                  <p className="text-sm text-gray-500">Editá lo que necesites antes de guardar.</p>
                </div>
                <button
                  onClick={() => setStep('pick')}
                  className="text-sm text-gray-400 hover:text-gray-600 border border-gray-200 hover:border-gray-300 px-4 py-2 rounded-xl transition-colors"
                >
                  Ver otras propuestas
                </button>
              </div>

              {/* Logos */}
              <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Versiones de logo</p>
                  {logosFailed && (
                    <button
                      onClick={() => selected && fetchVariantLogos(selected.logoPrompt)}
                      className="text-xs text-[#e42820] hover:underline font-medium"
                    >
                      ↺ Reintentar
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Color', bg: 'bg-white border border-gray-200', b64: selected.logoColorBase64, alwaysReady: true },
                    { label: 'Blanco', bg: 'bg-black', b64: selected.logoWhiteBase64, alwaysReady: false },
                    { label: 'Oscuro', bg: 'bg-white border border-gray-200', b64: selected.logoDarkBase64, alwaysReady: false },
                  ].map(v => (
                    <div key={v.label} className="space-y-2">
                      <div className={`aspect-square rounded-xl overflow-hidden flex items-center justify-center ${v.bg}`}>
                        {v.b64 ? (
                          <img src={`data:image/png;base64,${v.b64}`} alt={v.label} className="w-full h-full object-contain p-3" />
                        ) : v.alwaysReady ? (
                          <LogoPlaceholder name={selected.name} />
                        ) : logosFailed ? (
                          <p className="text-[10px] text-gray-400 text-center px-2">No generado</p>
                        ) : (
                          <div className="flex flex-col items-center gap-1">
                            <div className="w-4 h-4 border-2 border-gray-200 border-t-[#e42820] rounded-full animate-spin" />
                            <p className="text-[10px] text-gray-400">Generando...</p>
                          </div>
                        )}
                      </div>
                      <p className="text-[11px] text-center text-gray-400">{v.label}</p>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400">
                  Color → fondos claros · Blanco → fondos oscuros o sobre producto · Oscuro → fondos muy blancos
                </p>
              </div>

              {/* Brand info */}
              <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Identidad</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-600">Nombre</label>
                    <input
                      value={eName}
                      onChange={e => setEName(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#e42820]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-600">Tagline</label>
                    <input
                      value={eTagline}
                      onChange={e => setETagline(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#e42820]"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-600">Tipografía</label>
                  <input
                    value={eTypo}
                    onChange={e => setETypo(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#e42820]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-600">Personalidad de marca</label>
                  <textarea
                    value={eStyle}
                    onChange={e => setEStyle(e.target.value)}
                    rows={3}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#e42820] resize-none"
                  />
                </div>
              </div>

              {/* Colors */}
              <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Paleta</p>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-gray-500 mb-2">Primaria</p>
                    <div className="flex flex-wrap gap-4">
                      <ColorSwatch color={eP1} onChange={setEP1} />
                      <ColorSwatch color={eP2} onChange={setEP2} />
                      <ColorSwatch color={eP3} onChange={setEP3} />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-2">Secundaria</p>
                    <div className="flex flex-wrap gap-4">
                      <ColorSwatch color={eS1} onChange={setES1} />
                      <ColorSwatch color={eS2} onChange={setES2} />
                      <ColorSwatch color={eS3} onChange={setES3} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Save */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={save}
                  disabled={saving || logosLoading || !eName.trim()}
                  className="flex-1 bg-[#e42820] hover:bg-[#c41f18] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-6 py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Guardando...</>
                  ) : (
                    <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>Guardar como mi marca</>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ── DONE ── */}
          {step === 'done' && (
            <div className="flex flex-col items-center justify-center py-20 space-y-6 text-center">
              <div className="w-16 h-16 rounded-2xl bg-green-50 border border-green-200 flex items-center justify-center">
                <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-gray-900">¡Marca creada!</h2>
                <p className="text-sm text-gray-500">Tu identidad de marca ya está guardada y lista para usar en todos los módulos.</p>
              </div>
              <div className="flex gap-3">
                <Link
                  href="/"
                  className="bg-[#e42820] hover:bg-[#c41f18] text-white font-semibold px-6 py-3 rounded-xl transition-colors"
                >
                  Crear anuncios
                </Link>
                <Link
                  href="/config"
                  className="border border-gray-200 hover:border-gray-300 text-gray-600 hover:text-gray-900 font-medium px-6 py-3 rounded-xl transition-colors"
                >
                  Ver mi marca
                </Link>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
