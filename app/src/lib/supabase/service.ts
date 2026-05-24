// SERVER-ONLY. Never import from a client component.
// Uses the Supabase service-role key, which bypasses RLS. Callers MUST
// perform an RLS-gated authorization check via createSupabaseServerClient()
// before invoking this helper.

import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/env';

let cached: SupabaseClient | null = null;

export function createSupabaseServiceRoleClient(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
