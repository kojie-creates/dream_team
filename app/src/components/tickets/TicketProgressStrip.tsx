// Phase 2 T5 — compact progress strip derived from existing rows.
//
// No new state. Each step is computed from `trace_events` + `artifacts` the
// page already loads. "complete" means the corresponding row exists; "next"
// is the first non-complete step the user can act on right now; the rest
// render as "waiting".
//
// This is server-rendered: no client component needed for the strip itself.

export type ProgressStepKey =
  | 'brief'
  | 'orchestrator'
  | 'coordinator'
  | 'specialist'
  | 'qa'
  | 'truth';

export type ProgressStep = {
  key: ProgressStepKey;
  label: string;
  state: 'complete' | 'next' | 'waiting';
};

export type ProgressInput = {
  hasBrief: boolean;
  hasClassifiedEvent: boolean;
  hasCoordinatorEvent: boolean;
  hasSpecialistEvent: boolean;
  hasArtifact: boolean;
  hasQaEvent: boolean;
  hasTruthEvent: boolean;
};

export function computeProgress(input: ProgressInput): ProgressStep[] {
  const completion: Record<ProgressStepKey, boolean> = {
    brief: input.hasBrief,
    orchestrator: input.hasClassifiedEvent,
    coordinator: input.hasCoordinatorEvent,
    specialist: input.hasSpecialistEvent && input.hasArtifact,
    qa: input.hasQaEvent,
    truth: input.hasTruthEvent,
  };

  const order: { key: ProgressStepKey; label: string }[] = [
    { key: 'brief', label: 'Brief' },
    { key: 'orchestrator', label: 'Orchestrator' },
    { key: 'coordinator', label: 'Coordinator' },
    { key: 'specialist', label: 'Specialist' },
    { key: 'qa', label: 'QA' },
    { key: 'truth', label: 'Truth' },
  ];

  let nextAssigned = false;
  return order.map(({ key, label }) => {
    if (completion[key]) return { key, label, state: 'complete' as const };
    if (!nextAssigned) {
      nextAssigned = true;
      return { key, label, state: 'next' as const };
    }
    return { key, label, state: 'waiting' as const };
  });
}

const STATE_STYLES: Record<ProgressStep['state'], string> = {
  complete: 'border-emerald-700 bg-emerald-900/30 text-emerald-200',
  next: 'border-neutral-400 bg-neutral-100 text-neutral-900',
  waiting: 'border-neutral-800 bg-neutral-950 text-neutral-500',
};

const STATE_LABEL: Record<ProgressStep['state'], string> = {
  complete: 'done',
  next: 'next',
  waiting: 'waiting',
};

export function TicketProgressStrip({ input }: { input: ProgressInput }) {
  const steps = computeProgress(input);
  return (
    <section
      aria-label="Ticket progress"
      className="flex flex-wrap items-center gap-2 rounded border border-neutral-800 bg-neutral-950 p-3"
    >
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2">
          <span
            className={`flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] font-medium ${STATE_STYLES[s.state]}`}
            title={`${s.label}: ${STATE_LABEL[s.state]}`}
          >
            <span aria-hidden className="font-mono">
              {s.state === 'complete' ? '✓' : s.state === 'next' ? '•' : '○'}
            </span>
            {s.label}
          </span>
          {i < steps.length - 1 ? (
            <span aria-hidden className="text-neutral-700">
              ›
            </span>
          ) : null}
        </div>
      ))}
    </section>
  );
}
