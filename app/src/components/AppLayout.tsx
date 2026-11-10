import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ErrorBoundary } from './ErrorBoundary';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { Toaster } from './Toaster';
import { StorageBanner, TrialBanner } from './StatusBanners';
import { AppShellProvider } from '../context/AppShellContext';
import { Suspense, useEffect } from 'react';
import { TODAY } from '../data/planner';
import { currentSession, sessionChanged } from '../lib/auth';
import { todayIso } from '../lib/clock';
import { useSettings } from '../lib/settingsStore';

export function AppLayout() {
  useSettings();
  const location = useLocation();
  // After midnight, reload once nothing is open so every "today" in the app
  // (dashboard, planner, due dates, demo records) moves to the new day.
  useEffect(() => {
    const t = window.setInterval(() => {
      if (todayIso() !== TODAY && !document.querySelector('dialog[open]')) window.location.reload();
      // A session that runs out while the app is open goes back to the login.
      if (!currentSession()) window.location.assign('/login');
    }, 60_000);
    return () => window.clearInterval(t);
  }, []);
  // Logging in or out in another tab changes whose data this tab may show:
  // reload so it opens the right company (or the login), never a mix.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if ((e.key === 'runtruck-session' || e.key === null) && (sessionChanged() || !currentSession())) window.location.reload();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  if (sessionChanged()) {
    window.location.reload();
    return null;
  }

  // Not signed in: log in first, then come back here.
  if (!currentSession()) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  // Each part has its own error boundary, so a fault in the page leaves the
  // menu and top bar working (and the other way round). Moving to another
  // address clears a page fault by itself.
  return (
    <AppShellProvider>
      <div className="ui-shell">
        <ErrorBoundary where="Menu" variant="strip">
          <Sidebar />
        </ErrorBoundary>
        <div className="ui-column">
          <ErrorBoundary where="Top bar" variant="strip" resetKey={location.pathname}>
            <Header />
          </ErrorBoundary>
          <StorageBanner />
          <TrialBanner />
          <main className="ui-main">
            <ErrorBoundary where="Page" resetKey={location.pathname}>
              <Suspense fallback={<div className="ui-empty">Loading…</div>}>
                <Outlet />
              </Suspense>
            </ErrorBoundary>
          </main>
        </div>
        <Toaster />
      </div>
    </AppShellProvider>
  );
}
