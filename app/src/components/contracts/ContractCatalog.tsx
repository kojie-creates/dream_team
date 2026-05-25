import Link from 'next/link';
import type { ContractEntry } from '@/lib/contracts/catalog';

export function ContractCatalog({
  entries,
  linkPrefix,
}: {
  entries: ContractEntry[];
  linkPrefix: string;
}) {
  if (entries.length === 0) {
    return (
      <p className="rounded border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-400">
        No contracts available.
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {entries.map((c) => (
        <li key={c.slug}>
          <Link
            href={`${linkPrefix}/${encodeURIComponent(c.slug)}`}
            className="block h-full rounded border border-neutral-800 bg-neutral-950 p-4 transition hover:border-neutral-700"
          >
            <header className="flex items-start justify-between gap-2">
              <h2 className="text-sm font-semibold text-neutral-100">{c.title}</h2>
              <span className="rounded border border-neutral-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-neutral-500">
                Read-only
              </span>
            </header>
            {c.status ? (
              <p className="mt-2 text-[11px] text-neutral-500">
                <span className="text-neutral-400">Status:</span> {c.status}
              </p>
            ) : null}
            {c.excerpt ? (
              <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-neutral-400">
                {c.excerpt}
              </p>
            ) : null}
            <p className="mt-3 break-all text-[10px] text-neutral-600">
              <code>{c.sourcePath}</code>
            </p>
            <p className="mt-3 text-[11px] text-neutral-400">View source →</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
