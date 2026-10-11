import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { urgentAlerts } from '../data/alerts';
import { NAV, USER, type ViewKey } from '../data/mock';
import { useAppShell } from '../context/AppShellContext';
import { can, canLogOut, isSuperAdmin, logOutAndLeave, me } from '../lib/auth';
import { usePersisted } from '../lib/persist';
import { todayIso } from '../lib/clock';
import { isLive, pendingVersions, useReleaseState } from '../lib/releases';
import { NavIcon } from './NavIcons';

const NARROW = '(max-width: 760px)';
const isNarrow = () => typeof window !== 'undefined' && window.matchMedia?.(NARROW).matches;
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

// A bell, for the notification bar.
function AlertIcon() {
  return (
    <svg className="ui-alert-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

// The app's left navigation. It collapses to an icon rail (the choice is
// remembered); collapsed, each icon shows its name on hover. On narrow
// screens it starts collapsed and opens over the page.
export function Sidebar() {
  const location = useLocation();
  const { setQuery, loads, workOrders, drivers } = useAppShell();
  const navigate = useNavigate();
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

  // Release 1.14: the notification bar for urgent alerts (data/alerts.ts),
  // for accounts that may open Loads.
  const showAlerts = isLive('sidebar-alerts');
  const alerts = useMemo(
    () => (showAlerts && can('loads') ? urgentAlerts(loads, workOrders, drivers, todayIso()) : []),
    [showAlerts, loads, workOrders, drivers],
  );
  const [alertsOpen, setAlertsOpen] = useState(false);
  // One alert: go straight to it. Several: list them under the bar.
  const openAlerts = () => {
    if (collapsed) {
      setCollapsed(false);
      setAlertsOpen(true);
    } else if (alerts.length === 1) {
      navigate(alerts[0].to);
      navigated();
    } else setAlertsOpen(!alertsOpen);
  };

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

        {showAlerts && (
          <div className="ui-alerts" role="region" aria-label="Urgent alerts">
            {alerts.length === 0 ? (
              <div className="ui-alert-bar is-calm" data-tip={tip('No urgent alerts')}>
                <AlertIcon />
                <span className="ui-alert-text">No urgent alerts</span>
              </div>
            ) : (
              <button
                type="button"
                className="ui-alert-bar"
                onClick={openAlerts}
                aria-expanded={alerts.length > 1 ? alertsOpen : undefined}
                data-tip={tip(`${alerts.length} urgent alert${alerts.length === 1 ? '' : 's'}`)}
                title={alerts[0].text}
              >
                <AlertIcon />
                <span className="ui-alert-text">{alerts[0].text}</span>
                {alerts.length > 1 && <span className="ui-alert-more">+{alerts.length - 1}</span>}
                <span className="ui-alert-dot" aria-label="Needs attention" />
              </button>
            )}
            {alertsOpen && !collapsed && alerts.length > 1 && (
              <ul className="ui-alert-list">
                {alerts.map((a) => (
                  <li key={a.key}>
                    <Link to={a.to} onClick={() => { setAlertsOpen(false); navigated(); }}>{a.text}</Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

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
