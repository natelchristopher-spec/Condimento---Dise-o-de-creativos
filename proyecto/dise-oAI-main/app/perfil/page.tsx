'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createSupabaseBrowser } from '@/app/lib/supabase-browser';
import { useRequireAuth } from '@/app/lib/use-auth';
import Sidebar from '@/app/components/Sidebar';

export default function PerfilPage() {
  const [apiKey, setApiKey] = useState('');
  const [savedKey, setSavedKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [email, setEmail] = useState('');
  const [showKey, setShowKey] = useState(false);

  useRequireAuth();
  const supabase = createSupabaseBrowser();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setEmail(data.user.email || '');
    });
    fetch('/api/profile').then(r => r.json()).then(data => {
      if (data.openai_api_key) { setApiKey(data.openai_api_key); setSavedKey(data.openai_api_key); }
    }).catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    const isFirstTime = !savedKey;
    try {
      await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openai_api_key: apiKey.trim() }),
      });
      setSavedKey(apiKey.trim());
      setSaved(true);
      if (isFirstTime) {
        setRedirecting(true);
        setTimeout(() => { window.location.href = '/config'; }, 1500);
      } else {
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  };

  const maskKey = (key: string) => {
    if (!key) return '';
    return key.slice(0, 7) + '•'.repeat(20) + key.slice(-4);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar active="/perfil" onLogout={handleLogout} userEmail={email} />
      <div className="flex-1 md:ml-56 min-h-screen pt-12 md:pt-0">
      <main className="max-w-lg mx-auto px-6 py-10 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Perfil</h1>
          <p className="text-gray-500 text-sm">{email}</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-1">API Key de OpenAI</h2>
            <p className="text-gray-500 text-xs">Las imágenes se generan con tu propia cuenta de OpenAI. Los costos van directamente a tu cuenta.</p>
          </div>

          {savedKey && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-emerald-700 text-sm font-mono">{maskKey(savedKey)}</span>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm text-gray-600">
              {savedKey ? 'Reemplazar API key' : 'Pegá tu API key'}
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="sk-proj-..."
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 pr-12 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#e42820] text-sm font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {showKey
                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    : <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></>
                  }
                </svg>
              </button>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={!apiKey.trim() || saving || apiKey === savedKey}
            className={`w-full font-medium px-4 py-3 rounded-xl transition-all flex items-center justify-center gap-2 text-sm ${
              saved ? 'bg-emerald-600 text-white' : 'bg-[#e42820] hover:bg-[#c41f18] disabled:opacity-40 disabled:cursor-not-allowed text-white'
            }`}
          >
            {saved ? (
              <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>{redirecting ? 'Guardada — configurando tu marca...' : 'Guardada'}</>
            ) : saving ? 'Guardando...' : 'Guardar API key'}
          </button>

          <div className="border-t border-gray-200 pt-4 space-y-2">
            <p className="text-xs text-gray-500 font-medium">¿Dónde obtengo mi API key?</p>
            <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside">
              <li>Entrá a platform.openai.com</li>
              <li>Menú izquierdo → API Keys</li>
              <li>Create new secret key</li>
              <li>Cargá crédito en Settings → Billing (mínimo $5)</li>
            </ol>
          </div>
        </div>

        <Link
          href="/"
          className="flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors py-2"
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
