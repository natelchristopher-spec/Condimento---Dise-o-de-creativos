'use client';

import { useState } from 'react';
import { createSupabaseBrowser } from '@/app/lib/supabase-browser';

function BrandIcon() {
  return (
    <div className="w-12 h-12 rounded-2xl bg-[#e42820] flex items-center justify-center mx-auto mb-4">
      <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
        <path d="M18 6A8 8 0 1 0 18 18" />
      </svg>
    </div>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const supabase = createSupabaseBrowser();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/perfil` },
      });
      if (error) { setError(error.message); }
      else { setConfirmed(true); }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setError('Email o contraseña incorrectos.'); }
      else { window.location.href = '/'; }
    }

    setLoading(false);
  };

  if (confirmed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <BrandIcon />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Condimento</h1>
          <div className="mt-6 bg-emerald-50 border border-emerald-200 rounded-2xl px-6 py-8 space-y-3">
            <div className="text-3xl">📬</div>
            <p className="font-semibold text-gray-900">Revisá tu email</p>
            <p className="text-sm text-gray-500">
              Te enviamos un link de confirmación a <span className="font-medium text-gray-700">{email}</span>.
              Al hacer click empezás a configurar tu marca.
            </p>
          </div>
          <p className="text-xs text-gray-400 mt-4">¿No llegó? Revisá spam o esperá unos segundos.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <BrandIcon />
          <h1 className="text-2xl font-bold text-gray-900">Condimento</h1>
          <p className="text-gray-500 text-sm mt-1">
            {isSignUp ? 'Automatizá la producción de tu marca con IA' : 'Ingresá a tu cuenta'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu@email.com"
              required
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#e42820] text-sm"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1.5">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#e42820] text-sm"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#e42820] hover:bg-[#c41f18] disabled:opacity-50 text-white font-medium py-3 rounded-xl transition-colors text-sm"
          >
            {loading ? 'Cargando...' : isSignUp ? 'Crear cuenta' : 'Ingresar'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          {isSignUp ? '¿Ya tenés cuenta?' : '¿No tenés cuenta?'}{' '}
          <button
            onClick={() => { setIsSignUp(!isSignUp); setError(''); }}
            className="text-[#e42820] hover:text-[#c41f18] transition-colors"
          >
            {isSignUp ? 'Ingresá' : 'Registrate'}
          </button>
        </p>
      </div>
    </div>
  );
}
