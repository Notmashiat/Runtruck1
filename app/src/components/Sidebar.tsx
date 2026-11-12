import { Link, useLocation } from 'react-router-dom';
import { NAV, USER, type ViewKey } from '../data/mock';
import { useAppShell } from '../context/AppShellContext';
import { can, canLogOut, isSuperAdmin, logOutAndLeave, me } from '../lib/auth';
import { usePersisted } from '../lib/persist';
import { pendingVersions, useReleaseState } from '../lib/releases';
import { NavIcon } from './NavIcons';

const NARROW = '(max-width: 760px)';
const isNarrow = () => typeof window !== 'undefined' && window.matchMedia?.(NARROW).matches;
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

// The app's left navigation. It collapses to an icon rail (the choice is
// remembered); collapsed, each icon shows its name on hover. On narrow
// screens it starts collapsed and opens over the page.
export function Sidebar() {
  const location = useLocation();
  const { setQuery } = useAppShell();
  const [collapsed, setCollapsed] = usePersisted<boolean>('runtruck-sidebar-collapsed', Boolean(isNarrow()), (raw) =>
    typeof raw === 'boolean' ? raw : null,
  );
  const superAdmin = isSuperAdmin();
  // Releases written but not deployed to clients yet, flagged on Developer.
  const waiting = pendingVersions(useReleaseState()).length;
  const activeKey = (location.pathname.toLowerCase().split('/')[2] || 'dashboard') as ViewKey | 'settings';

  // Picking a page on a phone closes the overlay again.
  const navigated = () => {
    setQuery('');
    if (isNarrow()) setCollapsed(true);
  };
  // Collapsed, the name moves into a hover tip and the accessible label.
  const tip = (label: string) => (collapsed ? label : undefined);

  return (
    <>
      {!collapsed && <div className="ui-sidebar-scrim" onClick={() => setCollapsed(true)} aria-hidden="true" />}
      <aside id="app-sidebar" className={`ui-sidebar${collapsed ? ' is-collapsed' : ''}`}>
        <div className="ui-brand">
          <span className="ui-brand-mark" />
          <span className="ui-brand-name">RunTruck</span>
          <button
            type="button"
            className="ui-collapse"
            onClick={() => setCollapsed(!collapsed)}
            aria-controls="app-sidebar"
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <NavIcon name={collapsed ? 'expand' : 'collapse'} size={18} />
          </button>
        </div>

        <nav className="ui-nav" aria-label="Sections">
          {NAV.filter((n) => !('key' in n) || can(n.key)).map((n, i) =>
            'group' in n ? (
              <div key={`group-${i}`} className="ui-nav-group">
                {n.group}
              </div>
            ) : (
              <Link
                key={n.key}
                to={`/app/${n.key}`}
                onClick={navigated}
                className={`ui-nav-item${n.key === activeKey ? ' is-active' : ''}`}
                aria-current={n.key === activeKey ? 'page' : undefined}
                data-tip={tip(n.label)}
                aria-label={tip(n.label)}
              >
                <NavIcon name={n.key} />
                <span className="ui-nav-label">{n.label}</span>
                {n.key === 'developer' && superAdmin && waiting > 0 && (
                  <span className="ui-badge ui-nav-badge" title={`${waiting} version${waiting === 1 ? '' : 's'} ready to deploy`}>{waiting}</span>
                )}
              </Link>
            ),
          )}
        </nav>

        <div className="ui-sidebar-foot">
          <div className="ui-user" data-tip={tip(`${USER.name} · ${USER.company}`)}>
            <span className="ui-avatar" aria-hidden="true">{initials(USER.name)}</span>
            <div className="ui-user-text">
              <div className="ui-user-name">{USER.name}</div>
              <div className="ui-user-meta">{superAdmin ? 'Super admin · RunTruck' : `${me()?.type ?? USER.role} · ${USER.company}`}</div>
            </div>
          </div>
          <Link
            to="/app/settings"
            onClick={navigated}
            className={`ui-nav-item${activeKey === 'settings' ? ' is-active' : ''}`}
            aria-current={activeKey === 'settings' ? 'page' : undefined}
            data-tip={tip('Settings')}
            aria-label={tip('Settings')}
          >
            <NavIcon name="settings" />
            <span className="ui-nav-label">Settings</span>
          </Link>
          {canLogOut() && (
            <button type="button" className="ui-nav-item" data-tip={tip('Log out')} aria-label={tip('Log out')} onClick={logOutAndLeave}>
              <NavIcon name="logout" />
              <span className="ui-nav-label">Log out</span>
            </button>
          )}
        </div>

      </aside>
    </>
  );
}
