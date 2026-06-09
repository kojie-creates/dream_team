import { useState } from 'react';
import { useAuth } from '../lib/auth.tsx';
import { Card, ErrorNote } from '../components/ui.tsx';

export function Settings(): JSX.Element {
  const { status, signedInEmail, busy, error, signIn, signOut, saveKey } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [key, setKey] = useState('');
  const [savingKey, setSavingKey] = useState(false);

  const input = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm';
  const btn = 'rounded-md bg-ink px-4 py-2 text-sm text-white disabled:opacity-50';

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-ink">Settings</h1>

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-ink">Status</h2>
        {status ? (
          <ul className="space-y-1 text-sm text-gray-700">
            <li>OS encryption available: <b>{String(status.encryptionAvailable)}</b></li>
            <li>Anthropic key set: <b>{String(status.hasKey)}</b></li>
            <li>Signed in: <b>{String(status.hasSession)}</b></li>
          </ul>
        ) : (
          <p className="text-sm text-gray-500">loading…</p>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-ink">Account</h2>
        {status?.hasSession ? (
          <div className="flex items-center gap-3 text-sm">
            <span>Signed in{signedInEmail ? ` as ${signedInEmail}` : ''}.</span>
            <button onClick={() => void signOut()} disabled={busy} className={btn}>Sign out</button>
          </div>
        ) : (
          <div className="space-y-2">
            <input className={input} type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <div className="flex gap-2">
              <input
                className={input}
                type="password"
                placeholder="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void signIn(email, password); }}
              />
              <button onClick={() => void signIn(email, password)} disabled={busy || !email.trim() || !password} className={btn}>
                {busy ? '…' : 'Sign in'}
              </button>
            </div>
            {error && <ErrorNote>{error}</ErrorNote>}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-ink">Anthropic API key (BYOK)</h2>
        <p className="mb-2 text-xs text-gray-500">Stored OS-encrypted in main; never sent back to the renderer.</p>
        <div className="flex gap-2">
          <input className={input} type="password" placeholder="sk-ant-…" value={key} onChange={(e) => setKey(e.target.value)} />
          <button
            onClick={async () => { setSavingKey(true); try { await saveKey(key); setKey(''); } finally { setSavingKey(false); } }}
            disabled={savingKey || !key.trim()}
            className={btn}
          >
            {savingKey ? 'Saving…' : 'Save'}
          </button>
        </div>
      </Card>
    </div>
  );
}
