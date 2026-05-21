'use client';

import { useRequireAuth } from '@/app/lib/use-auth';
import { createSupabaseBrowser } from '@/app/lib/supabase-browser';
import Sidebar from '@/app/components/Sidebar';

export default function PdpPage() {
  useRequireAuth();
  const supabase = createSupabaseBrowser();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen flex bg-[#0a0a0c]">
      <Sidebar active="/pdp" onLogout={handleLogout} />
      <div className="flex-1 md:ml-56 min-h-screen pt-12 md:pt-0">
        <main className="max-w-3xl mx-auto px-6 py-20 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#e42820]/10 border border-[#e42820]/20 flex items-center justify-center mb-6">
            <svg className="w-8 h-8 text-[#e42820]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">Imágenes para PDP</h1>
          <p className="text-white/50 text-base max-w-lg mb-2">
            Generación de imágenes optimizadas para páginas de producto en e-commerce — fondo blanco, múltiples ángulos, lifestyle shots y más.
          </p>
          <p className="text-white/30 text-sm mb-10">Próximamente disponible.</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full text-left">
            {[
              { icon: '🤍', title: 'Fondo blanco', desc: 'Imágenes limpias estilo Amazon / Mercado Libre' },
              { icon: '🎨', title: 'Lifestyle shots', desc: 'Producto en contexto de uso real' },
              { icon: '📐', title: 'Múltiples formatos', desc: 'Cuadrado, vertical y horizontal en un click' },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="bg-white/5 border border-white/10 rounded-xl p-4">
                <p className="text-2xl mb-2">{icon}</p>
                <p className="text-sm font-medium text-white mb-1">{title}</p>
                <p className="text-xs text-white/40">{desc}</p>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
