import { DomainCard } from './DomainCard';

const DOMAINS = [
  {
    title: 'Marketing',
    body: 'Positioning, messaging, content, campaigns.',
    example: '"Draft a launch plan for the v1 dashboard."',
  },
  {
    title: 'Operations',
    body: 'DevOps, infra, security, data pipelines, performance.',
    example: '"Audit our deploy pipeline for cold-start risk."',
  },
  {
    title: 'Research',
    body: 'Market intel, customer insight, idea generation.',
    example: '"Map three competitors and pull their pricing pages."',
  },
  {
    title: 'Development',
    body: 'Architecture, UX, code, QA, truth review.',
    example: '"Spec a CLI tool for JSON schema validation."',
  },
];

export function StarterDomains() {
  return (
    <section className="space-y-3">
      <header className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-neutral-200">Start with a domain</h2>
        <p className="text-xs text-neutral-500">Examples — click to prefill once Generate ships.</p>
      </header>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {DOMAINS.map((d) => (
          <DomainCard key={d.title} {...d} />
        ))}
      </div>
    </section>
  );
}
