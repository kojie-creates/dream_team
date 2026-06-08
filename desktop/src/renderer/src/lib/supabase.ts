// Renderer-side Supabase client — used ONLY to sign the user in. The resulting
// session (access + refresh token) is handed to main and stored OS-encrypted
// (keystore:save-session); main is the session's source of truth, so this client
// does not persist or refresh on its own. URL + anon key are public (publishable).
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xmxozhibakbzsucvtucv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ZHEGGdbmUNEYJXcmt4ghUQ_-slMMpqL';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
