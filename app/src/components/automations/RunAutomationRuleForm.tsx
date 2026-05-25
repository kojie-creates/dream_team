'use client';

import { useActionState } from 'react';
import { runAutomationRuleNow, type RunRuleState } from '@/app/actions/automations';

const initial: RunRuleState = { error: null, ok: null };

export function RunAutomationRuleForm({
  slug,
  ruleId,
}: {
  slug: string;
  ruleId: string;
}) {
  const [state, formAction, pending] = useActionState(runAutomationRuleNow, initial);

  return (
    <form action={formAction} className="space-y-1">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="rule_id" value={ruleId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-sky-900/60 bg-sky-950/40 px-2 py-1 text-[11px] text-sky-200 hover:bg-sky-950/60 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Running…' : 'Run now'}
      </button>
      {state.error ? (
        <p role="alert" className="text-[11px] text-rose-300">
          {state.error}
        </p>
      ) : null}
      {state.ok ? <p className="text-[11px] text-emerald-300">{state.ok}</p> : null}
    </form>
  );
}
