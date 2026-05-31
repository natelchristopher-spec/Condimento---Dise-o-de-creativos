import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { supabase } from '@/app/lib/supabase';
import { cookies } from 'next/headers';

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

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('profiles')
    .select('openai_api_key, shopify_domain, shopify_admin_token')
    .eq('id', userId)
    .single();

  if (error && error.code === 'PGRST116') return NextResponse.json({ openai_api_key: null, shopify_domain: null, shopify_admin_token: null });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    openai_api_key: data.openai_api_key,
    shopify_domain: data.shopify_domain ?? null,
    shopify_admin_token: data.shopify_admin_token ?? null,
  });
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { openai_api_key, shopify_domain, shopify_admin_token } = body;

  const upsertData: Record<string, unknown> = {
    id: userId,
    updated_at: new Date().toISOString(),
  };
  if (openai_api_key !== undefined) upsertData.openai_api_key = openai_api_key;
  if (shopify_domain !== undefined) upsertData.shopify_domain = shopify_domain;
  if (shopify_admin_token !== undefined) upsertData.shopify_admin_token = shopify_admin_token;

  const { error } = await supabase.from('profiles').upsert(upsertData);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
