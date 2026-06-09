// App shell — top nav + routed content. Mirrors the web app's workspace nav.
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth.tsx';

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/tickets', label: 'Tickets', end: false },
  { to: '/connectors', label: 'Connectors', end: false },
  { to: '/settings', label: 'Settings', end: false },
];

export function Shell(): JSX.Element {
  const { signedInEmail } = useAuth();
  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-200 bg-ink text-white">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-3">
          <div className="flex items-center gap-2">
            <span className="text-gold">●</span>
            <span className="font-semibold">Dream Team</span>
          </div>
          <nav className="flex gap-1">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `rounded px-3 py-1.5 text-sm ${isActive ? 'bg-white/15 text-white' : 'text-white/70 hover:text-white'}`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto text-xs text-white/60">{signedInEmail ?? 'not signed in'}</div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
