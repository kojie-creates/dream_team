'use client';

import { useActionState, useState } from 'react';
import { createBriefFromUpload, type UploadBriefState } from '@/app/actions/briefs';

const MAX_BYTES = 128 * 1024;
const ALLOWED_EXT = ['.txt', '.md', '.markdown'];
const initial: UploadBriefState = { error: null };

export function UploadBriefForm({ slug }: { slug: string }) {
  const [state, formAction, pending] = useActionState(createBriefFromUpload, initial);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setClientError(null);
    if (!f) return;
    const lower = f.name.toLowerCase();
    if (!ALLOWED_EXT.some((ext) => lower.endsWith(ext))) {
      setClientError('Only .txt, .md, or .markdown files are accepted.');
      return;
    }
    if (f.size === 0) {
      setClientError('File is empty.');
      return;
    }
    if (f.size > MAX_BYTES) {
      setClientError(`File over ${Math.floor(MAX_BYTES / 1024)} KB limit.`);
    }
  }

  const canSubmit = !pending && file != null && clientError === null && file.size > 0 && file.size <= MAX_BYTES;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />

      <label className="block space-y-1">
        <span className="text-xs uppercase tracking-wider text-neutral-400">Title</span>
        <input
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          placeholder="Optional — filename is used by default"
          className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs uppercase tracking-wider text-neutral-400">Brief file</span>
        <input
          name="file"
          type="file"
          accept=".txt,.md,.markdown,text/plain,text/markdown"
          onChange={onPick}
          required
          className="block w-full text-sm text-neutral-200 file:mr-3 file:rounded file:border file:border-neutral-700 file:bg-neutral-900 file:px-3 file:py-1.5 file:text-sm file:text-neutral-100 hover:file:bg-neutral-800"
        />
        <span className="block text-[11px] text-neutral-500">
          Plain text only. Accepted: .txt, .md, .markdown. Max {Math.floor(MAX_BYTES / 1024)} KB.
          No PDF, no images, no binary uploads in this phase.
        </span>
      </label>

      {file ? (
        <p className="text-[11px] text-neutral-400">
          <span className="font-mono text-neutral-200">{file.name}</span> · {file.size} bytes
          {file.type ? <> · {file.type}</> : null}
        </p>
      ) : null}

      {clientError ? (
        <p role="alert" className="text-xs text-amber-400">
          {clientError}
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-xs text-red-400">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? 'Uploading…' : 'Create ticket'}
        </button>
        <span className="text-xs text-neutral-500">
          File text becomes the brief. The orchestrator picks it up the same way as a paste.
        </span>
      </div>
    </form>
  );
}
