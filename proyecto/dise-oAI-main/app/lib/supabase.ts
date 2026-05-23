import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!_client) {
    _client = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return _client;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    const client = getClient();
    const val = (client as unknown as Record<string | symbol, unknown>)[prop];
    return typeof val === 'function' ? (val as Function).bind(client) : val;
  },
});
