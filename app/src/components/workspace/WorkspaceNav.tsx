'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavItem = { label: string; href: string; match: (path: string) => boolean };

export function WorkspaceNav({ slug }: { slug: string }) {
  const pathname = usePathname() ?? '';
  const base = `/w/${slug}`;

  const items: NavItem[] = [
    {
      label: 'Home',
      href: base,
      match: (p) => p === base || p === `${base}/`,
    },
    {
      label: 'Tickets',
      href: `${base}/tickets`,
      match: (p) => p === `${base}/tickets` || p.startsWith(`${base}/tickets/`) || p.startsWith(`${base}/new/`),
    },
    {
      label: 'Agents',
      href: `${base}/agents`,
      match: (p) => p === `${base}/agents` || p.startsWith(`${base}/agents/`),
    },
    {
      label: 'Contracts',
      href: `${base}/contracts`,
      match: (p) => p === `${base}/contracts` || p.startsWith(`${base}/contracts/`),
    },
    {
      label: 'History',
      href: `${base}/history`,
      match: (p) => p === `${base}/history` || p.startsWith(`${base}/history/`),
    },
    {
      label: 'Settings',
      href: `${base}/settings`,
      match: (p) => p === `${base}/settings` || p.startsWith(`${base}/settings/`),
    },
  ];

  return (
    <nav
      aria-label="Workspace"
      className="border-b border-neutral-800 bg-neutral-950"
    >
      <div className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-2 py-1 text-sm">
        {items.map((it) => {
          const active = it.match(pathname);
          return (
            <Link
              key={it.href}
              href={it.href}
              aria-current={active ? 'page' : undefined}
              className={[
                'rounded px-3 py-1.5 whitespace-nowrap',
                active
                  ? 'bg-neutral-800 text-neutral-100'
                  : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200',
              ].join(' ')}
            >
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
