'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createSupabaseBrowser } from '@/app/lib/supabase-browser';
import { useRequireAuth } from '@/app/lib/use-auth';
import Sidebar from '@/app/components/Sidebar';
import { BrandKit } from '@/app/types';

const MODULES = [
  {
    href: '/anuncios',
    label: 'Anuncios',
    emoji: '🎯',
    tagline: 'Creativos para ads y redes',
    description: 'Describís el brief y la IA genera múltiples conceptos visuales listos para usar en Meta, TikTok o cualquier canal.',
    color: 'border-[#e42820]/30 hover:border-[#e42820]',
    badge: null,
  },
  {
    href: '/redes',
    label: 'Carruseles IG',
    emoji: '📱',
    tagline: '3 slides por carrusel',
    description: 'La IA planifica el contenido por etapa del funnel, escribe el copy del post con hashtags y genera las 3 imágenes del carrusel.',
    color: 'border-gray-200 hover:border-gray-400',
    badge: null,
  },
  {
    href: '/pdp',
    label: 'PDP',
    emoji: '🛍️',
    tagline: '6 imágenes de producto',
    description: 'Generá las 6 imágenes clave para tu ficha de e-commerce: pack shot, infografía, lifestyle, detalle, comparativa y cierre de marca.',
    color: 'border-gray-200 hover:border-gray-400',
    badge: null,
  },
];

export default function HomePage() {
  useRequireAuth();
  const [brandKit, setBrandKit] = useState<BrandKit | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [email, setEmail] = useState('');
  const supabase = createSupabaseBrowser();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setEmail(data.user.email || '');
    });
    fetch('/api/profile').then(r => r.json()).then(d => setHasApiKey(!!d.openai_api_key)).catch(() => setHasApiKey(false));
    fetch('/api/brand-kits').then(r => r.json()).then(d => { if (d && !d.error) setBrandKit(d); }).catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const ready = !!(hasApiKey && brandKit);

  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar active="/" onLogout={handleLogout} userEmail={email} />
      <div className="flex-1 md:ml-56 min-h-screen pt-12 md:pt-0">
        <main className="max-w-3xl mx-auto px-6 py-10 space-y-10">

          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {brandKit ? `Hola, ${brandKit.name}` : 'Condimento'}
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              {ready ? 'Elegí un módulo para empezar a producir.' : 'Completá el setup para empezar a generar creativos.'}
            </p>
          </div>

          {/* Setup checklist — only shown when incomplete */}
          {hasApiKey !== null && !ready && (
            <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
              <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">Configuración</p>

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
            </div>
          )}

          {/* Module cards */}
          <div className="space-y-4">
            <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">Módulos</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {MODULES.map(mod => (
                <div key={mod.href} className="relative group">
                  <Link
                    href={ready ? mod.href : '#'}
                    onClick={!ready ? (e: React.MouseEvent) => e.preventDefault() : undefined}
                    className={`flex flex-col gap-4 p-5 rounded-2xl border-2 bg-white transition-all h-full ${
                      ready ? `${mod.color} hover:shadow-md cursor-pointer` : 'border-gray-200 opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <span className="text-2xl">{mod.emoji}</span>
                      {mod.badge && (
                        <span className="text-[10px] font-bold bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded uppercase tracking-wide">{mod.badge}</span>
                      )}
                    </div>
                    <div className="space-y-1">
                      <p className="font-bold text-gray-900">{mod.label}</p>
                      <p className="text-xs text-[#e42820] font-medium">{mod.tagline}</p>
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed">{mod.description}</p>
                    {ready && (
                      <p className="text-xs font-semibold text-gray-400 group-hover:text-gray-700 transition-colors mt-auto">
                        Abrir →
                      </p>
                    )}
                  </Link>
                  {!ready && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      <span className="bg-gray-900/80 text-white text-[10px] rounded-md px-2 py-1 whitespace-nowrap">Completá el setup primero</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}
