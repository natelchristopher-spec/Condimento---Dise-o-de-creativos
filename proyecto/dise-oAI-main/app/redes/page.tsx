'use client';

import { useRequireAuth } from '@/app/lib/use-auth';
import { createSupabaseBrowser } from '@/app/lib/supabase-browser';
import Sidebar from '@/app/components/Sidebar';

export default function RedesPage() {
  useRequireAuth();
  const supabase = createSupabaseBrowser();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar active="/redes" onLogout={handleLogout} />
      <div className="flex-1 md:ml-56 min-h-screen pt-12 md:pt-0">
        <main className="max-w-3xl mx-auto px-6 py-20 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#e42820]/10 border border-[#e42820]/20 flex items-center justify-center mb-6">
            <svg className="w-8 h-8 text-[#e42820]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-3">Redes Sociales</h1>
          <p className="text-gray-500 text-base max-w-lg mb-2">
            Contenido orgánico para redes — un sistema completamente distinto al de anuncios, pensado para construir comunidad y consistencia de marca.
          </p>
          <p className="text-gray-400 text-sm mb-10">Próximamente disponible.</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full text-left">
            {[
              { icon: '📅', title: 'Calendario editorial', desc: 'Planificación de contenido semanal y mensual' },
              { icon: '🎨', title: 'Contenido orgánico', desc: 'Posts, carruseles y reels adaptados a cada plataforma' },
              { icon: '📊', title: 'Consistencia de marca', desc: 'Feed coherente con tu identidad visual' },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-2xl mb-2">{icon}</p>
                <p className="text-sm font-medium text-gray-900 mb-1">{title}</p>
                <p className="text-xs text-gray-500">{desc}</p>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
