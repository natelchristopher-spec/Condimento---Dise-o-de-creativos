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

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthClient();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const { data, error } = await auth.client
    .from('one_shoot_sessions')
    .select('*')
    .eq('id', id)
    .eq('user_id', auth.userId)
    .single();
  if (error) return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthClient();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Request inválido' }, { status: 400 }); }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.status !== undefined) update.status = body.status;
  if (body.brief !== undefined) update.brief = body.brief;
  if (body.count !== undefined) update.count = body.count;
  if (body.angles !== undefined) update.angles = body.angles;
  if (body.winningAngleKeys !== undefined) update.winning_angle_keys = body.winningAngleKeys;
  if (body.pecResults !== undefined) update.pec_results = body.pecResults;
  if (body.isFashionProduct !== undefined) update.is_fashion_product = body.isFashionProduct;
  if (body.productDescription !== undefined) update.product_description = body.productDescription;
  if (body.personDescription !== undefined) update.person_description = body.personDescription;

  const { error } = await auth.client
    .from('one_shoot_sessions')
    .update(update)
    .eq('id', id)
    .eq('user_id', auth.userId);
  if (error) return NextResponse.json({ error: 'Error al actualizar sesión' }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthClient();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const { error } = await auth.client
    .from('one_shoot_sessions')
    .delete()
    .eq('id', id)
    .eq('user_id', auth.userId);
  if (error) return NextResponse.json({ error: 'Error al eliminar sesión' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
