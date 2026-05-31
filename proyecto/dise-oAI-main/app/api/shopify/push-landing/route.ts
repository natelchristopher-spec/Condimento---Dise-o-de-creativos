import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { supabase } from '@/app/lib/supabase';
import { cookies } from 'next/headers';

export const maxDuration = 30;

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await client.auth.getUser();
  return user?.id ?? null;
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('shopify_domain, shopify_admin_token')
    .eq('id', userId)
    .single();

  if (!profile?.shopify_domain || !profile?.shopify_admin_token) {
    return NextResponse.json({ error: 'Configurá tu tienda Shopify en Perfil primero.' }, { status: 400 });
  }

  const { liquidContent } = await req.json();
  if (!liquidContent) return NextResponse.json({ error: 'Template vacío.' }, { status: 400 });

  const shop = profile.shopify_domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const token = profile.shopify_admin_token;

  // Get active theme
  let activeThemeId: number;
  let activeThemeName: string;
  try {
    const res = await fetch(`https://${shop}/admin/api/2024-01/themes.json?role=main`, {
      headers: { 'X-Shopify-Access-Token': token },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Shopify respondió ${res.status}. Revisá el dominio y el token en Perfil.` },
        { status: 400 }
      );
    }
    const { themes } = await res.json();
    if (!themes?.length) return NextResponse.json({ error: 'No se encontró el tema activo.' }, { status: 400 });
    activeThemeId = themes[0].id;
    activeThemeName = themes[0].name;
  } catch {
    return NextResponse.json({ error: 'No se pudo conectar con Shopify. Revisá el dominio en Perfil.' }, { status: 400 });
  }

  // Push the .liquid section file
  try {
    const res = await fetch(`https://${shop}/admin/api/2024-01/themes/${activeThemeId}/assets.json`, {
      method: 'PUT',
      headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        asset: { key: 'sections/condimento-landing.liquid', value: liquidContent },
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { errors?: unknown };
      return NextResponse.json(
        { error: `Error al subir el archivo: ${JSON.stringify(err.errors ?? err)}` },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json({ error: 'Error de red al subir el template.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, themeName: activeThemeName });
}
