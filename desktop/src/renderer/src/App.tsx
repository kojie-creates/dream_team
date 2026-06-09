import { HashRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './lib/auth.tsx';
import { Shell } from './components/Shell.tsx';
import { Home } from './screens/Home.tsx';
import { Tickets } from './screens/Tickets.tsx';
import { TicketDetail } from './screens/TicketDetail.tsx';
import { Connectors } from './screens/Connectors.tsx';
import { Settings } from './screens/Settings.tsx';

// Phase B: the desktop is a routed SPA (HashRouter — works under file://). Screens
// read Supabase directly under the user's session (rehydrated by AuthProvider);
// runs are still dispatched to the governed runtime via IPC (Home → run:start).
export function App(): JSX.Element {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Home />} />
            <Route path="tickets" element={<Tickets />} />
            <Route path="tickets/:id" element={<TicketDetail />} />
            <Route path="connectors" element={<Connectors />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}
