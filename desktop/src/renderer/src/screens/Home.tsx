import { useState } from 'react';
import { Link } from 'react-router-dom';
import { invoke, type RunPrepResult, type RunStartReply } from '../lib/ipc.ts';
import { useAuth } from '../lib/auth.tsx';
import { Card, ErrorNote } from '../components/ui.tsx';

const ENTRY_ROLE = 'central-orchestrator';

export function Home(): JSX.Element {
  const { status } = useAuth();
  const ready = !!(status?.hasKey && status?.hasSession);
  const [brief, setBrief] = useState(
    'Create a file at out/hello.txt containing exactly:\nhello from the dream team\n',
  );
  const [running, setRunning] = useState(false);
  const [out, setOut] = useState<{ line: string; root: string | null; ticketId: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(): Promise<void> {
    setRunning(true);
    setOut(null);
    setErr(null);
    try {
      const prep = await invoke<RunPrepResult>('run:prepare', { title: brief.split('\n')[0] });
      const reply = await invoke<RunStartReply>('run:start', {
        workspaceId: prep.workspaceId,
        ticketId: prep.ticketId,
        role: ENTRY_ROLE,
        messages: [{ role: 'user', content: brief }],
        maxTokens: 2048,
        workspaceRoot: prep.workspaceRoot,
      });
      if (reply.ok) {
        setOut({
          line: `${reply.state} · ${reply.iterations} iteration(s) · $${reply.costUsd.toFixed(4)}`,
          root: prep.workspaceRoot,
          ticketId: prep.ticketId,
        });
      } else {
        setErr(`${reply.error}: ${reply.detail}`);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Run a brief</h1>
        <p className="text-sm text-gray-500">
          Enters at the orchestrator and self-dispatches down the org chart. Watch it work in the ticket view.
        </p>
      </div>

      <Card>
        {!ready && <ErrorNote>Set your API key and sign in (Settings) first.</ErrorNote>}
        <textarea
          className="mt-1 w-full rounded-md border border-gray-300 p-3 font-mono text-sm"
          rows={6}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
        />
        <button
          onClick={() => void run()}
          disabled={running || !brief.trim() || !ready}
          className="mt-2 rounded-md bg-ink px-5 py-2 text-sm text-white disabled:opacity-50"
        >
          {running ? 'Running…' : 'Run'}
        </button>

        {out && (
          <div className="mt-3 rounded-md bg-green-50 p-3 text-sm">
            <div>✓ {out.line}</div>
            <div className="mt-2 flex items-center gap-3">
              <Link to={`/tickets/${out.ticketId}`} className="text-ink underline">Open ticket</Link>
              {out.root && (
                <button onClick={() => void invoke('shell:open-path', out.root)} className="text-gray-600 underline">
                  Open folder
                </button>
              )}
            </div>
          </div>
        )}
        {err && <div className="mt-3"><ErrorNote>{err}</ErrorNote></div>}
      </Card>
    </div>
  );
}
