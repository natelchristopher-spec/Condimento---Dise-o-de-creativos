'use client';

import { useEffect } from 'react';
import { createSupabaseBrowser } from '@/app/lib/supabase-browser';

export function useRequireAuth() {
  useEffect(() => {
    const supabase = createSupabaseBrowser();
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        window.location.href = '/login';
      }
    });
  }, []);
}
