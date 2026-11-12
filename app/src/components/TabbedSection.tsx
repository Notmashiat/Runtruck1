import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { ErrorBoundary } from './ErrorBoundary';
import { SectionTabs } from './SectionTabs';
import { PageSkeleton } from './Skeleton';

// Layout for a sidebar section that is split into tabs: the pill bar, then
// whichever tab route is active. A tab that fails keeps the pill bar, so the
// other tabs are one click away.
export function TabbedSection() {
  const { pathname } = useLocation();
  return (
    <>
      <SectionTabs />
      <ErrorBoundary where="Tab" resetKey={pathname}>
        <Suspense fallback={<PageSkeleton path={pathname} tabs={false} />}>
          <Outlet />
        </Suspense>
      </ErrorBoundary>
    </>
  );
}
