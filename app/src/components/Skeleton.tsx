// Skeleton loading (release 1.31): grey shapes in the layout of the page or
// popup that is on its way, shown while its code downloads, instead of the
// word "Loading…". They shimmer gently (not with reduced motion) and are
// announced once to screen readers as loading.

type Kind = 'dashboard' | 'list' | 'detail' | 'planner' | 'settings';

const Line = ({ w = '100%', h = 12 }: { w?: number | string; h?: number }) => <span className="sk" style={{ width: w, height: h }} />;

// Which layout a page has, from its address.
function skeletonKind(path: string): Kind {
  const p = path.toLowerCase().replace(/\/+$/, '');
  if (p === '/app' || p.startsWith('/app/dashboard')) return 'dashboard';
  if (p.startsWith('/app/planner')) return 'planner';
  if (p.startsWith('/app/settings')) return 'settings';
  if (/^\/app\/loads\/[^/]+/.test(p)) return 'detail';
  return 'list';
}

function ListCard({ rows = 7 }: { rows?: number }) {
  return (
    <div className="ui-card sk-card">
      <div className="sk-card-head"><Line w={160} h={14} /></div>
      <div className="sk-thead">{[90, 120, 140, 80, 70].map((w, i) => <Line key={i} w={w} h={10} />)}</div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="sk-row">{[70, 130, 170, 60, 80].map((w, j) => <Line key={j} w={w} />)}</div>
      ))}
    </div>
  );
}

function Tabs({ n = 3 }: { n?: number }) {
  return <div className="sk-tabs">{Array.from({ length: n }, (_, i) => <span key={i} className="sk sk-pill" />)}</div>;
}

// The page area while a page loads. `tabs` adds the pill bar (off when the
// section's own tabs are already on screen).
export function PageSkeleton({ path, tabs = true }: { path: string; tabs?: boolean }) {
  const kind = skeletonKind(path);
  return (
    <div className="sk-page" role="status" aria-busy="true" aria-label="Loading">
      {kind === 'dashboard' && (
        <div className="dash-island sk-dash">
          <div className="sk-dash-top">
            <div className="sk-stack"><Line w={220} h={20} /><Line w={280} h={11} /></div>
            <span className="sk sk-pill is-wide" />
            <span className="sk sk-pill" />
          </div>
          <div className="sk-grid is-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="ui-card sk-kpi"><Line w="60%" h={13} /><Line w="80%" h={10} /><Line w={90} h={26} /></div>)}</div>
          <div className="sk-grid is-8-4">
            <div className="ui-card sk-chart"><Line w={160} h={14} /><div className="sk-bars">{[55, 80, 40, 20, 90, 70, 30].map((h, i) => <span key={i} className="sk" style={{ height: `${h}%` }} />)}</div></div>
            <div className="ui-card sk-chart"><Line w={140} h={14} />{Array.from({ length: 5 }, (_, i) => <div key={i} className="sk-stack"><Line w="70%" h={11} /><Line h={6} /></div>)}</div>
          </div>
        </div>
      )}
      {kind === 'list' && (
        <>
          {tabs && <Tabs />}
          <ListCard />
        </>
      )}
      {kind === 'detail' && (
        <>
          <div className="ui-card sk-card sk-pad"><Line w={260} h={20} /><Line w={360} h={11} /></div>
          <div className="sk-grid is-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="ui-card sk-kpi is-short"><Line w="50%" h={11} /><Line w="70%" h={18} /></div>)}</div>
          <div className="sk-grid is-2">
            <div className="ui-card sk-card sk-pad sk-tall"><Line w={140} h={14} /><span className="sk sk-block" /></div>
            <div className="ui-card sk-card sk-pad">{Array.from({ length: 6 }, (_, i) => <Line key={i} w={`${90 - i * 8}%`} />)}</div>
          </div>
        </>
      )}
      {kind === 'planner' && (
        <>
          <div className="sk-dash-top"><Line w={200} h={20} /><span className="sk sk-pill is-wide" /><span className="sk sk-pill" /></div>
          <div className="ui-card sk-card sk-calendar">{Array.from({ length: 7 }, (_, i) => <span key={i} className="sk" />)}</div>
        </>
      )}
      {kind === 'settings' && (
        <div className="sk-grid is-settings">
          <div className="ui-card sk-card sk-pad">{Array.from({ length: 9 }, (_, i) => <Line key={i} w={`${70 + (i % 3) * 10}%`} h={14} />)}</div>
          <div className="sk-stack is-gap">
            <div className="sk-stack"><Line w={180} h={20} /><Line w={320} h={11} /></div>
            {Array.from({ length: 2 }, (_, i) => <div key={i} className="ui-card sk-card sk-pad">{Array.from({ length: 4 }, (_, j) => <Line key={j} w={`${85 - j * 12}%`} />)}</div>)}
          </div>
        </div>
      )}
    </div>
  );
}

// The whole app while its frame (menu, top bar) downloads.
export function ShellSkeleton({ path }: { path: string }) {
  return (
    <div className="ui-shell sk-shell" role="status" aria-busy="true" aria-label="Loading">
      <div className="ui-sidebar sk-sidebar">
        <Line w={120} h={16} />
        <span className="sk sk-block is-short" />
        {Array.from({ length: 10 }, (_, i) => <Line key={i} w={`${60 + (i % 4) * 9}%`} h={14} />)}
      </div>
      <div className="ui-column">
        <div className="ui-topbar sk-topbar"><span className="sk sk-pill is-search" /><div style={{ flex: 1 }} /><span className="sk sk-pill" /><span className="sk sk-pill is-wide" /></div>
        <div className="ui-main"><PageSkeleton path={path} /></div>
      </div>
    </div>
  );
}

// A popup on its way: the backdrop and a popup-shaped skeleton.
export function DialogSkeleton() {
  return (
    <div className="sk-overlay" role="status" aria-busy="true" aria-label="Loading">
      <div className="sk-dialog">
        <div className="sk-dialog-head"><span className="sk sk-square" /><div className="sk-stack"><Line w={200} h={18} /><Line w={280} h={11} /></div></div>
        <div className="sk-dialog-body">
          <div className="sk-dialog-side">{Array.from({ length: 6 }, (_, i) => <Line key={i} w="85%" h={14} />)}</div>
          <div className="sk-dialog-main">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="sk-stack is-gap">
                <Line w={160} h={15} />
                <div className="sk-grid is-2">{Array.from({ length: 4 }, (_, j) => <span key={j} className="sk sk-field" />)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
