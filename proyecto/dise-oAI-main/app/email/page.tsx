'use client';

import { useRequireAuth } from '@/app/lib/use-auth';
import { createSupabaseBrowser } from '@/app/lib/supabase-browser';
import Sidebar from '@/app/components/Sidebar';

export default function EmailPage() {
  useRequireAuth();
  const supabase = createSupabaseBrowser();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar active="/email" onLogout={handleLogout} />
      <div className="flex-1 md:ml-56 min-h-screen pt-12 md:pt-0">
        <main className="max-w-3xl mx-auto px-6 py-20 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#e42820]/10 border border-[#e42820]/20 flex items-center justify-center mb-6">
            <svg className="w-8 h-8 text-[#e42820]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-3">Email Marketing</h1>
          <p className="text-gray-500 text-base max-w-lg mb-2">
            Diseño de piezas para email — headers, banners y módulos listos para exportar a tu plataforma de envío.
          </p>
          <p className="text-gray-400 text-sm mb-10">Próximamente disponible.</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full text-left">
            {[
              { icon: '📧', title: 'Templates de campaña', desc: 'Newsletters, promociones y lanzamientos' },
              { icon: '🖼️', title: 'Banners y headers', desc: 'Piezas optimizadas para email con dimensiones correctas' },
              { icon: '📱', title: 'Mobile first', desc: 'Diseño responsive para cualquier cliente de email' },
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
