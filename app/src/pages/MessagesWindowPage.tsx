import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { Messenger } from '../components/Messenger';
import { Toaster } from '../components/Toaster';
import { AppShellProvider } from '../context/AppShellContext';
import { currentSession } from '../lib/auth';
import { useSettings } from '../lib/settingsStore';

// Messages popped out into a window of its own (release 1.43): the messenger
// alone, filling a slim window. Opened from the messenger's pop-out button
// (lib/messengerWindow.ts); chats stay in step with the RunTruck window.
export function MessagesWindowPage() {
  useSettings();
  useEffect(() => {
    const before = document.title;
    document.title = 'Messages · RunTruck';
    return () => { document.title = before; };
  }, []);
  if (!currentSession()) return <Navigate to="/login" replace state={{ from: '/messages' }} />;
  return (
    <AppShellProvider>
      <ErrorBoundary where="Messages window">
        <Messenger mode="window" />
      </ErrorBoundary>
      <Toaster />
    </AppShellProvider>
  );
}
