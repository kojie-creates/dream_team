import Link from 'next/link';
import type { AgentCatalogGroup } from '@/lib/agents/catalog';

export function AgentCatalog({
  groups,
  total,
  linkPrefix,
}: {
  groups: AgentCatalogGroup[];
  total: number;
  linkPrefix: string;
}) {
  return (
    <div className="space-y-8">
      <p className="text-xs text-neutral-500">
        {total} agents across {groups.length} groups. Read-only catalog from{' '}
        <code className="text-neutral-400">agents/</code>. Click an agent to view its source profile.
      </p>

      {groups.map((g) => (
        <section key={g.group} className="space-y-3">
          <div className="flex items-baseline justify-between border-b border-neutral-800 pb-1">
            <h2 className="text-sm font-semibold tracking-wide text-neutral-200">{g.group}</h2>
            <span className="text-[11px] text-neutral-500">{g.agents.length}</span>
          </div>
          <ul className="space-y-2">
            {g.agents.map((a) => (
              <li
                key={a.sourcePath}
                className="rounded border border-neutral-800 bg-neutral-950 p-4 hover:border-neutral-700"
              >
                <Link
                  href={`${linkPrefix}/${encodeURIComponent(a.slug)}`}
                  className="block focus:outline-none"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-neutral-100">{a.name}</p>
                      <p className="truncate text-[11px] text-neutral-500">
                        <code>{a.slug}</code>
                      </p>
                    </div>
                    <span className="shrink-0 rounded border border-neutral-800 px-2 py-0.5 text-[10px] uppercase tracking-wider text-neutral-400">
                      Detail →
                    </span>
                  </div>
                  {a.description ? (
                    <p className="mt-2 text-xs leading-relaxed text-neutral-400">{a.description}</p>
                  ) : null}
                  <p className="mt-2 text-[10px] text-neutral-600">
                    <code>{a.sourcePath}</code>
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
