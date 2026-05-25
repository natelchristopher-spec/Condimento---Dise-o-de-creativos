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
    .from('one_shoot_sessions')
    .select('id, created_at, updated_at, status, brief, count, is_fashion_product, angles, winning_angle_keys, pec_results')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { data, error } = await supabase
    .from('one_shoot_sessions')
    .insert({
      user_id: userId,
      status: body.status ?? 'paso1_done',
      brief: body.brief ?? '',
      count: body.count ?? 4,
      is_fashion_product: body.isFashionProduct ?? false,
      product_description: body.productDescription ?? '',
      person_description: body.personDescription ?? '',
      angles: body.angles ?? [],
      winning_angle_keys: body.winningAngleKeys ?? [],
      pec_results: body.pecResults ?? [],
      // NOTE: product_image and reference_images are intentionally omitted —
      // they are stored in localStorage only, never in the database.
    })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
