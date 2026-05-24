'use client';

import { useActionState, useState } from 'react';
import { createBriefFromPaste, type PasteBriefState } from '@/app/actions/briefs';

const MIN_LEN = 20;
const MAX_LEN = 10_000;
const initial: PasteBriefState = { error: null };

export function PasteBriefForm({ slug }: { slug: string }) {
  const [state, formAction, pending] = useActionState(createBriefFromPaste, initial);
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');

  const trimmedLen = text.trim().length;
  const tooShort = trimmedLen > 0 && trimmedLen < MIN_LEN;
  const tooLong = trimmedLen > MAX_LEN;
  const canSubmit = !pending && trimmedLen >= MIN_LEN && trimmedLen <= MAX_LEN;

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
          placeholder="Optional — a fallback is generated from the first line"
          className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs uppercase tracking-wider text-neutral-400">Brief text</span>
        <textarea
          name="raw_text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          required
          rows={14}
          placeholder="Paste the brief. Plain text. 20–10,000 characters."
          className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-sm text-neutral-100 placeholder:text-neutral-600"
        />
        <span className="flex justify-between text-[11px] text-neutral-500">
          <span>
            {trimmedLen.toLocaleString()} / {MAX_LEN.toLocaleString()} chars
          </span>
          <span>Minimum {MIN_LEN}</span>
        </span>
      </label>

      {tooShort ? (
        <p role="alert" className="text-xs text-amber-400">
          {MIN_LEN - trimmedLen} more character{MIN_LEN - trimmedLen === 1 ? '' : 's'} needed.
        </p>
      ) : null}
      {tooLong ? (
        <p role="alert" className="text-xs text-red-400">
          Over the {MAX_LEN.toLocaleString()} character limit.
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
          {pending ? 'Creating…' : 'Create ticket'}
        </button>
        <span className="text-xs text-neutral-500">
          A ticket opens immediately. Orchestrator routing arrives in the next phase.
        </span>
      </div>
    </form>
  );
}
