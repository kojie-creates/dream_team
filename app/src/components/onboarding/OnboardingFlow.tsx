'use client';

import { useState, useActionState } from 'react';
import { completeOnboarding, type OnboardingState } from '@/app/actions/onboarding';
import { StepIndicator } from './StepIndicator';

const LOOP = [
  { label: 'Brief', body: 'Capture the goal in plain language.' },
  { label: 'Ticket', body: 'A unit of work the Orchestrator can route.' },
  { label: 'Workflow', body: 'Coordinator picks specialists; work flows down the layers.' },
  { label: 'Truth Review', body: 'Truth Agent verifies claims and evidence before closure.' },
  { label: 'Closure', body: 'Ticket closes, artifact lands, dashboard updates.' },
];

const DOMAINS = [
  {
    id: 'marketing',
    title: 'Marketing',
    body: 'Positioning, messaging, content, campaigns, community.',
  },
  {
    id: 'operations',
    title: 'Operations',
    body: 'DevOps, security, data pipelines, performance.',
  },
  {
    id: 'research',
    title: 'Research',
    body: 'Market intel, customer insight, idea generation.',
  },
  {
    id: 'development',
    title: 'Development',
    body: 'Architecture, UX, code, QA, truth review.',
  },
];

const initial: OnboardingState = { error: null };

export function OnboardingFlow({ defaultName }: { defaultName: string }) {
  const [step, setStep] = useState(1);
  const [domain, setDomain] = useState<string | null>(null);
  const [name, setName] = useState(defaultName);
  const [state, formAction, pending] = useActionState(completeOnboarding, initial);

  return (
    <div className="mx-auto w-full max-w-xl space-y-6">
      <StepIndicator current={step} total={3} />

      {step === 1 ? (
        <section className="space-y-4">
          <header className="space-y-1">
            <h1 className="text-xl font-semibold text-neutral-100">Welcome to Dream Team</h1>
            <p className="text-sm text-neutral-400">
              An AI team that routes work through five layers, validates its own claims, and closes tickets
              with traceable evidence. Here is the loop every task follows:
            </p>
          </header>
          <ol className="space-y-2">
            {LOOP.map((s, i) => (
              <li key={s.label} className="flex gap-3 rounded border border-neutral-800 bg-neutral-900 p-3">
                <span className="mt-0.5 text-xs text-neutral-500">{i + 1}</span>
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-neutral-100">{s.label}</p>
                  <p className="text-xs text-neutral-400">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="rounded bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900"
            >
              Continue
            </button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="space-y-4">
          <header className="space-y-1">
            <h1 className="text-xl font-semibold text-neutral-100">Pick a starting focus</h1>
            <p className="text-sm text-neutral-400">
              We will surface example briefs from this domain on your Home. You can switch later.
            </p>
          </header>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {DOMAINS.map((d) => {
              const selected = domain === d.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDomain(d.id)}
                  className={[
                    'rounded border p-3 text-left transition-colors',
                    selected
                      ? 'border-neutral-100 bg-neutral-800'
                      : 'border-neutral-800 bg-neutral-900 hover:border-neutral-700',
                  ].join(' ')}
                  aria-pressed={selected}
                >
                  <p className="text-sm font-medium text-neutral-100">{d.title}</p>
                  <p className="mt-1 text-xs text-neutral-400">{d.body}</p>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-neutral-500">
            Connectors (Gmail, Calendar, Drive, Slack) come later — focus is all you need today.
          </p>
          <div className="flex justify-between pt-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded border border-neutral-700 px-3 py-2 text-sm text-neutral-200"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              disabled={!domain}
              className="rounded bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 disabled:opacity-60"
            >
              Continue
            </button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="space-y-4">
          <header className="space-y-1">
            <h1 className="text-xl font-semibold text-neutral-100">Name your workspace</h1>
            <p className="text-sm text-neutral-400">
              This is where your team will work. You can rename it from settings later.
            </p>
          </header>
          <form action={formAction} className="space-y-3">
            <label className="block">
              <span className="text-xs text-neutral-300">Workspace name</span>
              <input
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={60}
                placeholder="Acme Studio"
                className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
              />
            </label>
            <input type="hidden" name="domain" value={domain ?? ''} />
            {state.error ? (
              <p role="alert" className="text-xs text-red-400">
                {state.error}
              </p>
            ) : null}
            <div className="flex justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="rounded border border-neutral-700 px-3 py-2 text-sm text-neutral-200"
                disabled={pending}
              >
                Back
              </button>
              <button
                type="submit"
                disabled={pending || !name.trim()}
                className="rounded bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 disabled:opacity-60"
              >
                {pending ? 'Creating…' : 'Create workspace'}
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}
