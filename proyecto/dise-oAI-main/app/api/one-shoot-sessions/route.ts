import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

async function getAuthClient() {
  const cookieStore = await cookies();
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await client.auth.getUser();
  return user ? { client, userId: user.id } : null;
}

export async function GET() {
  const auth = await getAuthClient();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await auth.client
    .from('one_shoot_sessions')
    .select('id, created_at, updated_at, status, brief, count, is_fashion_product, product_description, person_description, angles, winning_angle_keys, pec_results')
    .eq('user_id', auth.userId)
    .order('updated_at', { ascending: false });
  if (error) return NextResponse.json({ error: 'Error al cargar sesiones' }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Request inválido' }, { status: 400 }); }

  const { data, error } = await auth.client
    .from('one_shoot_sessions')
    .insert({
      user_id: auth.userId,
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
  if (error) return NextResponse.json({ error: 'Error al guardar sesión' }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
