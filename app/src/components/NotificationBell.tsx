import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { faBell, faTrashCan } from '@fortawesome/free-regular-svg-icons';
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
//
// Release 1.34: recent notifications can be cleared all at once (Clear all),
// or one at a time: slide one to the left (or press Delete on it) for a trash
// button, which turns into a red Delete to confirm. Urgent alerts stay until
// what they are about is dealt with.

// How far a notification slides to show its button, and how far a drag has
// to go before it stays open.
const TRASH_W = 56;
const CONFIRM_W = 84;
const OPEN_AFTER = 28;

type Reveal = 'trash' | 'confirm';

function NoticeRow({ n, time, isNew, reveal, onReveal, onDelete, onOpen }: {
  n: Notice; time: string; isNew: boolean; reveal: Reveal | null;
  onReveal: (r: Reveal | null) => void; onDelete: () => void; onOpen: () => void;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef<{ x: number; y: number; base: number; moved: boolean } | null>(null);
  const swipeable = !n.urgent;
  const base = reveal === 'confirm' ? -CONFIRM_W : reveal === 'trash' ? -TRASH_W : 0;
  const offset = drag ?? base;

  // Every row notices a drag (so a drag never opens it); only recent ones slide.
  const down = (e: PointerEvent<HTMLAnchorElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    start.current = { x: e.clientX, y: e.clientY, base, moved: false };
  };
  const move = (e: PointerEvent<HTMLAnchorElement>) => {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    // A sideways drag (not a scroll up or down the list) slides the row.
    if (!s.moved && (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(dy))) return;
    if (!s.moved) {
      s.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (swipeable) setDrag(Math.max(-CONFIRM_W, Math.min(0, s.base + dx)));
  };
  const up = () => {
    const s = start.current;
    if (s?.moved && drag !== null) onReveal(drag < -OPEN_AFTER ? (reveal === 'confirm' && drag < -TRASH_W ? 'confirm' : 'trash') : null);
    setDrag(null);
  };
  const click = (e: MouseEvent<HTMLAnchorElement>) => {
    // A slide is not a click; nor is a tap on a row that is open (it closes it).
    if (start.current?.moved || reveal) {
      e.preventDefault();
      if (!start.current?.moved) onReveal(null);
    } else onOpen();
    start.current = null;
  };
  const key = (e: KeyboardEvent<HTMLAnchorElement>) => {
    if (!swipeable) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      onReveal('confirm');
      window.setTimeout(() => (e.target as HTMLElement).closest('li')?.querySelector<HTMLButtonElement>('.ui-notice-delete')?.focus(), 0);
    }
  };

  return (
    <li className={`ui-notice-row${reveal ? ' is-open' : ''}`}>
      {swipeable && (
        <div className="ui-notice-actions" style={{ width: reveal === 'confirm' ? CONFIRM_W : TRASH_W }}>
          {reveal === 'confirm' ? (
            <button type="button" className="ui-notice-delete" onClick={onDelete} aria-label={`Delete notification: ${n.text}`}>Delete</button>
          ) : (
            <button
              type="button" className="ui-notice-trash" tabIndex={reveal ? 0 : -1} aria-label={`Delete notification: ${n.text}`}
              onClick={() => onReveal('confirm')}
            >
              <Fa icon={faTrashCan} />
            </button>
          )}
        </div>
      )}
      <Link
        to={n.to}
        className={`ui-notice is-${n.kind}${n.urgent ? ' is-urgent' : ''}${isNew ? ' is-new' : ''}${drag !== null ? ' is-dragging' : ''}`}
        style={offset ? { transform: `translateX(${offset}px)` } : undefined}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { setDrag(null); start.current = null; }}
        onClick={click} onKeyDown={key} draggable={false}
        aria-keyshortcuts={swipeable ? 'Delete' : undefined}
      >
        <span className="ui-notice-dot" aria-hidden="true" />
        <span className="ui-notice-text">{n.text}</span>
        <span className="ui-notice-time">{time}</span>
      </Link>
    </li>
  );
}

export function NotificationBell() {
  const { loads, invoices, drivers, workOrders } = useAppShell();
  const now = useNow(60_000);
  const today = todayIso();
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = usePersisted<string>('runtruck-notifications-seen', '');
  // Recent notifications the person has deleted or cleared (by key).
  const [deleted, setDeleted] = usePersisted<string[]>('runtruck-notifications-deleted', [], (raw) =>
    Array.isArray(raw) ? raw.filter((k): k is string => typeof k === 'string') : null,
  );
  const [revealed, setRevealed] = useState<{ key: string; as: Reveal } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    setRevealed(null);
  }, []);
  useDismiss(wrap, open, close, button);

  const all = useMemo(
    () => notifications({
      loads, invoices, drivers, workOrders, today,
      may: { loads: can('loads'), accounting: can('accounting/invoiced'), documents: can('safety/driver-documents') },
    }),
    [loads, invoices, drivers, workOrders, today],
  );
  const gone = useMemo(() => new Set(deleted), [deleted]);
  const list = all.filter((n) => n.urgent || !gone.has(n.key));
  // What counts as new is fixed while the list is open, so opening it does
  // not wipe the highlight before the person has read it.
  const [seenWhenOpened, setSeenWhenOpened] = useState(lastSeen);
  const unread = list.filter((n) => isUnread(n, lastSeen)).length;
  const urgent = list.filter((n) => n.urgent);
  const rest = list.filter((n) => !n.urgent);

  // Only keys still in the feed are kept, so the list does not grow forever.
  const forget = (keys: string[]) => {
    const current = new Set(all.map((n) => n.key));
    setDeleted((prev) => [...new Set([...prev, ...keys])].filter((k) => current.has(k)));
    setRevealed(null);
  };

  const toggle = () => {
    if (!open) {
      setSeenWhenOpened(lastSeen);
      setLastSeen(new Date().toISOString());
    }
    setRevealed(null);
    setOpen(!open);
  };

  const row = (n: Notice) => (
    <NoticeRow
      key={n.key} n={n} time={noticeTime(n, now, today)} isNew={!n.urgent && isUnread(n, seenWhenOpened)}
      reveal={revealed?.key === n.key ? revealed.as : null}
      onReveal={(r) => setRevealed(r ? { key: n.key, as: r } : null)}
      onDelete={() => forget([n.key])}
      onOpen={close}
    />
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
            <div className="ui-bell-empty">You’re all caught up.</div>
          ) : (
            <div className="ui-bell-body">
              {urgent.length > 0 && (
                <>
                  <div className="ui-bell-group">Urgent</div>
                  <ul>{urgent.map(row)}</ul>
                </>
              )}
              {rest.length > 0 && (
                <>
                  <div className="ui-bell-group is-row">
                    <span>Recent</span>
                    <button type="button" className="ui-bell-clear" onClick={() => forget(rest.map((n) => n.key))}>Clear all</button>
                  </div>
                  <ul>{rest.map(row)}</ul>
                  <p className="ui-bell-hint">Slide a notification left to delete it.</p>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
