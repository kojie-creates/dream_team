// Auth/session context for the renderer SPA. The renderer is the single token-refresh
// authority: supabase-js (autoRefreshToken) keeps the ~1h access token alive, and the
// onAuthStateChange listener syncs EVERY session (sign-in + background refresh) back to
// main's OS-encrypted keystore — so run-prep / run:start always read a fresh token and
// never hit "JWT expired". main holds the durable copy; this client doesn't persist.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { invoke, type KeystoreStatus } from './ipc.ts';
import { supabase } from './supabase.ts';

interface AuthValue {
  status: KeystoreStatus | null;
  signedInEmail: string | null;
  busy: boolean;
  error: string | null;
  ready: boolean;
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

  // Single refresh authority: every session (initial sign-in, the launch setSession,
  // and every background TOKEN_REFRESHED) is persisted to main + used for Realtime.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        void invoke('keystore:save-session', JSON.stringify({
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
        }));
        supabase.realtime.setAuth(session.access_token);
        setSignedInEmail(session.user?.email ?? null);
      } else {
        setSignedInEmail(null);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // On launch: load status + rehydrate the session from main. setSession with an
  // expired access token + a valid refresh token triggers an immediate refresh
  // (autoRefreshToken), which the listener above syncs back to the keystore.
  useEffect(() => {
    void (async () => {
      await refresh();
      const session = await invoke<{ accessToken: string; refreshToken: string } | null>('auth:get-session');
      if (session?.accessToken) {
        await supabase.auth.setSession({
          access_token: session.accessToken,
          refresh_token: session.refreshToken,
        });
      }
      setReady(true);
    })();
  }, []);

  async function signIn(email: string, password: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (e) {
        setError(e.message);
        return;
      }
      // The onAuthStateChange listener persists the session; refresh status here.
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
