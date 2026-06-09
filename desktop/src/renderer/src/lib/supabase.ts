// Renderer-side Supabase client. It signs the user in AND is the single token-refresh
// authority: autoRefreshToken keeps the access token alive (the stored one is only
// ~1h), and every refresh is synced back to main's keystore (auth.tsx onAuthStateChange)
// so run-prep / run:start always read a fresh token. persistSession stays off — main
// holds the durable copy. URL + anon key are public (publishable).
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xmxozhibakbzsucvtucv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ZHEGGdbmUNEYJXcmt4ghUQ_-slMMpqL';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: true },
});
