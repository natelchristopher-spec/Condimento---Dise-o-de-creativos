import { createServerClient } from '@supabase/ssr';
import { supabase } from '@/app/lib/supabase';
import { cookies } from 'next/headers';

export async function getUserContext(): Promise<{ userId: string; openaiApiKey: string } | null> {
  try {
    const cookieStore = await cookies();
    const client = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    );
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return null;

    const { data, error: dbError } = await supabase
      .from('profiles')
      .select('openai_api_key')
      .eq('id', user.id)
      .single();

    if (dbError || !data?.openai_api_key) return null;
    return { userId: user.id, openaiApiKey: data.openai_api_key };
  } catch {
    return null;
  }
}
