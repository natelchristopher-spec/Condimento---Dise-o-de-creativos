import { createServerClient } from '@supabase/ssr';
import { supabase } from '@/app/lib/supabase';
import { cookies } from 'next/headers';

export async function getUserContext(): Promise<{ userId: string; openaiApiKey: string } | null> {
  const cookieStore = await cookies();
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('openai_api_key')
    .eq('id', user.id)
    .single();

  if (!data?.openai_api_key) return null;
  return { userId: user.id, openaiApiKey: data.openai_api_key };
}
