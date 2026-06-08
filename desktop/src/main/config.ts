// Public Supabase config for the desktop client. The URL and the PUBLISHABLE
// (anon) key are designed to ship in client code — they are NOT secrets. The
// service-role key is never present in the desktop app (ADR Decision 7 §3); the
// runtime's only DB identity is the logged-in user's session.
export const SUPABASE_URL = 'https://xmxozhibakbzsucvtucv.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_ZHEGGdbmUNEYJXcmt4ghUQ_-slMMpqL';
