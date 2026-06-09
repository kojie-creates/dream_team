import { useEffect, useState } from 'react';
import { invoke, type KeystoreStatus, type RunPrepResult, type RunStartReply } from './lib/ipc.ts';
import { supabase } from './lib/supabase.ts';

// The run enters at the orchestrator; the host derives the role's tools + prompt and
// the governed loop spawns down the org chart (orchestrator → coordinator →
// specialist). The renderer sends only the role + brief.
const ENTRY_ROLE = 'central-orchestrator';

// E0+E1 shell: secret status, Supabase sign-in (session stored OS-encrypted in main),
// and the BYOK Anthropic-key form. The run screen (E2) lands next.
export function App(): JSX.Element {
  const [status, setStatus] = useState<KeystoreStatus | null>(null);
  const [key, setKey] = useState('');
  const [savingKey, setSavingKey] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);

  const [brief, setBrief] = useState('Create a file at out/hello.txt containing exactly:\nhello from dream_team\n');
  const [running, setRunning] = useState(false);
  const [runOut, setRunOut] = useState<string | null>(null);
  const [runErr, setRunErr] = useState<string | null>(null);
  const [runRoot, setRunRoot] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    setStatus(await invoke<KeystoreStatus>('keystore:status'));
  }
  useEffect(() => {
    void refresh();
  }, []);

  async function signIn(): Promise<void> {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        setAuthError(error.message);
        return;
      }
      const session = data.session!;
      await invoke('keystore:save-session', JSON.stringify({
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
      }));
      setSignedInEmail(data.user?.email ?? email.trim());
      setPassword('');
      await refresh();
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : String(e));
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOut(): Promise<void> {
    setAuthBusy(true);
    try {
      await supabase.auth.signOut();
      await invoke('keystore:clear-session');
      setSignedInEmail(null);
      await refresh();
    } finally {
      setAuthBusy(false);
    }
  }

  async function runBrief(): Promise<void> {
    setRunning(true);
    setRunOut(null);
    setRunErr(null);
    setRunRoot(null);
    try {
      const prep = await invoke<RunPrepResult>('run:prepare', { title: brief.split('\n')[0] });
      setRunRoot(prep.workspaceRoot);
      const reply = await invoke<RunStartReply>('run:start', {
        workspaceId: prep.workspaceId,
        ticketId: prep.ticketId,
        role: ENTRY_ROLE,
        messages: [{ role: 'user', content: brief }],
        maxTokens: 2048,
        workspaceRoot: prep.workspaceRoot,
      });
      if (reply.ok) {
        setRunOut(
          `${reply.state} · ${reply.iterations} iteration(s) · $${reply.costUsd.toFixed(4)} · ticket ${prep.ticketId}`,
        );
      } else {
        setRunErr(`${reply.error}: ${reply.detail}`);
      }
    } catch (e) {
      setRunErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  async function saveKey(): Promise<void> {
    if (!key.trim()) return;
    setSavingKey(true);
    try {
      await invoke('keystore:save-key', key.trim());
      setKey('');
      await refresh();
    } finally {
      setSavingKey(false);
    }
  }

  const card = { marginTop: 16, padding: 16, border: '1px solid #ddd', borderRadius: 8 } as const;
  const inputStyle = { flex: 1, padding: 8, borderRadius: 6, border: '1px solid #ccc' } as const;

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 32, maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 4 }}>Dream Team</h1>
      <p style={{ color: '#666', marginTop: 0 }}>Governed agent runtime — desktop shell</p>

      <section style={card}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Status</h2>
        {status ? (
          <ul style={{ lineHeight: 1.7 }}>
            <li>OS encryption available: <b>{String(status.encryptionAvailable)}</b></li>
            <li>Anthropic key set: <b>{String(status.hasKey)}</b></li>
            <li>Signed in (Supabase session): <b>{String(status.hasSession)}</b></li>
          </ul>
        ) : (
          <p>loading…</p>
        )}
      </section>

      <section style={card}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Sign in</h2>
        {status?.hasSession ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span>Signed in{signedInEmail ? ` as ${signedInEmail}` : ''}.</span>
            <button onClick={() => void signOut()} disabled={authBusy} style={{ padding: '6px 14px' }}>
              Sign out
            </button>
          </div>
        ) : (
          <>
            <p style={{ color: '#666', fontSize: 13 }}>
              Your Supabase account. The session is stored OS-encrypted in main; all runs
              act as you under row-level security.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={inputStyle}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="password"
                  onKeyDown={(e) => { if (e.key === 'Enter') void signIn(); }}
                  style={inputStyle}
                />
                <button onClick={() => void signIn()} disabled={authBusy || !email.trim() || !password} style={{ padding: '8px 16px' }}>
                  {authBusy ? '…' : 'Sign in'}
                </button>
              </div>
              {authError && <p style={{ color: '#c0392b', fontSize: 13 }}>{authError}</p>}
            </div>
          </>
        )}
      </section>

      <section style={card}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Anthropic API key (BYOK)</h2>
        <p style={{ color: '#666', fontSize: 13 }}>
          Stored OS-encrypted (DPAPI) in main; never sent to the renderer after save.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="sk-ant-…"
            style={inputStyle}
          />
          <button onClick={() => void saveKey()} disabled={savingKey || !key.trim()} style={{ padding: '8px 16px' }}>
            {savingKey ? 'Saving…' : 'Save'}
          </button>
        </div>
      </section>

      <section style={card}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Run a brief</h2>
        {!(status?.hasKey && status?.hasSession) && (
          <p style={{ color: '#c0392b', fontSize: 13 }}>Set your API key and sign in first.</p>
        )}
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={5}
          style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ccc', fontFamily: 'ui-monospace, monospace', fontSize: 13, boxSizing: 'border-box' }}
        />
        <button
          onClick={() => void runBrief()}
          disabled={running || !brief.trim() || !(status?.hasKey && status?.hasSession)}
          style={{ marginTop: 8, padding: '8px 20px' }}
        >
          {running ? 'Running…' : 'Run'}
        </button>
        {runOut && (
          <div style={{ marginTop: 12, padding: 10, background: '#eafaf1', borderRadius: 6, fontSize: 13 }}>
            <div>✓ {runOut}</div>
            {runRoot && (
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                <code style={{ fontSize: 12, color: '#555', wordBreak: 'break-all' }}>{runRoot}</code>
                <button onClick={() => void invoke('shell:open-path', runRoot)} style={{ padding: '3px 10px', flexShrink: 0 }}>
                  Open folder
                </button>
              </div>
            )}
          </div>
        )}
        {runErr && (
          <p style={{ marginTop: 12, padding: 10, background: '#fdecea', borderRadius: 6, color: '#c0392b', fontSize: 13 }}>
            ✗ {runErr}
          </p>
        )}
      </section>
    </div>
  );
}
