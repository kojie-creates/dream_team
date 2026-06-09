// Auth/session context for the renderer SPA. Holds keystore status, signs the user
// in (storing the session OS-encrypted in main), and — crucially for Phase B —
// rehydrates the renderer Supabase client's session on launch (auth:get-session) so
// RLS reads + Realtime are authenticated as the user.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { invoke, type KeystoreStatus } from './ipc.ts';
import { supabase } from './supabase.ts';

interface AuthValue {
  status: KeystoreStatus | null;
  signedInEmail: string | null;
  busy: boolean;
  error: string | null;
  ready: boolean; // session rehydration attempted
  refresh(): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  saveKey(key: string): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [status, setStatus] = useState<KeystoreStatus | null>(null);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  async function refresh(): Promise<void> {
    setStatus(await invoke<KeystoreStatus>('keystore:status'));
  }

  // On launch: load status + rehydrate the Supabase session from main so reads work.
  useEffect(() => {
    void (async () => {
      await refresh();
      const session = await invoke<{ accessToken: string; refreshToken: string } | null>('auth:get-session');
      if (session?.accessToken) {
        await supabase.auth.setSession({
          access_token: session.accessToken,
          refresh_token: session.refreshToken,
        });
        supabase.realtime.setAuth(session.accessToken); // RLS-scoped Realtime
        const { data } = await supabase.auth.getUser();
        setSignedInEmail(data.user?.email ?? null);
      }
      setReady(true);
    })();
  }, []);

  async function signIn(email: string, password: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const { data, error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (e) {
        setError(e.message);
        return;
      }
      const s = data.session!;
      await invoke('keystore:save-session', JSON.stringify({ accessToken: s.access_token, refreshToken: s.refresh_token }));
      await supabase.auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token });
      supabase.realtime.setAuth(s.access_token); // RLS-scoped Realtime
      setSignedInEmail(data.user?.email ?? email.trim());
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function signOut(): Promise<void> {
    setBusy(true);
    try {
      await supabase.auth.signOut();
      await invoke('keystore:clear-session');
      setSignedInEmail(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function saveKey(key: string): Promise<void> {
    if (!key.trim()) return;
    await invoke('keystore:save-key', key.trim());
    await refresh();
  }

  return (
    <AuthContext.Provider value={{ status, signedInEmail, busy, error, ready, refresh, signIn, signOut, saveKey }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth must be used within AuthProvider');
  return v;
}
