import { useCallback, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { faBell } from '@fortawesome/free-regular-svg-icons';
import { useAppShell } from '../context/AppShellContext';
import { isUnread, noticeTime, notifications, type Notice } from '../data/notifications';
import { can } from '../lib/auth';
import { todayIso, useNow } from '../lib/clock';
import { usePersisted } from '../lib/persist';
import { useDismiss } from '../lib/useDismiss';
import { Fa } from './Fa';

// The bell in the top bar (release 1.33): a red dot while something is
// urgent or new since the bell was last opened; a click shows the list below
// it, urgent alerts pinned to the top and the rest newest first.
export function NotificationBell() {
  const { loads, invoices, drivers, workOrders } = useAppShell();
  const now = useNow(60_000);
  const today = todayIso();
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = usePersisted<string>('runtruck-notifications-seen', '');
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(wrap, open, close, button);

  const list = useMemo(
    () => notifications({
      loads, invoices, drivers, workOrders, today,
      may: { loads: can('loads'), accounting: can('accounting/invoiced'), documents: can('safety/driver-documents') },
    }),
    [loads, invoices, drivers, workOrders, today],
  );
  // What counts as new is fixed while the list is open, so opening it does
  // not wipe the highlight before the person has read it.
  const [seenWhenOpened, setSeenWhenOpened] = useState(lastSeen);
  const unread = list.filter((n) => isUnread(n, lastSeen)).length;
  const urgent = list.filter((n) => n.urgent);
  const rest = list.filter((n) => !n.urgent);

  const toggle = () => {
    if (!open) {
      setSeenWhenOpened(lastSeen);
      setLastSeen(new Date().toISOString());
    }
    setOpen(!open);
  };

  const item = (n: Notice) => (
    <li key={n.key}>
      <Link to={n.to} className={`ui-notice is-${n.kind}${n.urgent ? ' is-urgent' : ''}${!n.urgent && isUnread(n, seenWhenOpened) ? ' is-new' : ''}`} onClick={close}>
        <span className="ui-notice-dot" aria-hidden="true" />
        <span className="ui-notice-text">{n.text}</span>
        <span className="ui-notice-time">{noticeTime(n, now, today)}</span>
      </Link>
    </li>
  );

  return (
    <div className="ui-bell-wrap" ref={wrap}>
      <button
        ref={button} type="button" className={`ui-bell${open ? ' is-open' : ''}`} onClick={toggle}
        aria-haspopup="dialog" aria-expanded={open} aria-label={unread ? `Notifications, ${unread} need${unread === 1 ? 's' : ''} attention` : 'Notifications'}
        title="Notifications"
      >
        <Fa icon={faBell} />
        {unread > 0 && <span className={`ui-bell-dot${urgent.length ? ' is-urgent' : ''}`} aria-hidden="true" />}
      </button>
      {open && (
        <div className="ui-bell-panel" role="dialog" aria-label="Notifications">
          <div className="ui-bell-head">
            <strong>Notifications</strong>
            {urgent.length > 0 && <span className="ui-bell-count">{urgent.length} urgent</span>}
          </div>
          {list.length === 0 ? (
            <div className="ui-bell-empty">You’re all caught up. Nothing in the last two weeks.</div>
          ) : (
            <div className="ui-bell-body">
              {urgent.length > 0 && (
                <>
                  <div className="ui-bell-group">Urgent</div>
                  <ul>{urgent.map(item)}</ul>
                </>
              )}
              {rest.length > 0 && (
                <>
                  <div className="ui-bell-group">Recent</div>
                  <ul>{rest.map(item)}</ul>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
