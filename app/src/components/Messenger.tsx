import { Suspense, lazy, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  faArrowLeft, faBoxOpen, faCheck, faCheckDouble, faChevronDown, faComments, faFile, faFileCirclePlus, faFolderOpen, faMagnifyingGlass,
  faPaperPlane, faPaperclip, faThumbtack, faTruck, faUserGroup,
} from '@fortawesome/free-solid-svg-icons';
import { faFaceSmile, faFloppyDisk } from '@fortawesome/free-regular-svg-icons';
import { useAppShell } from '../context/AppShellContext';
import type { BillDocument } from '../data/bills';
import type { Load } from '../data/mock';
import { USER } from '../data/mock';
import {
  DRIVER_ROLE, chatName, chatOrder, initials, isImage, lastOf, messagesOf, preview, roleIn, seedMessenger, syncTruckGroups, toneOf, totalUnread, unreadIn,
  type Chat, type ChatMessage, type MessengerState, type Person,
} from '../data/messenger';
import { IS_DEMO } from '../lib/account';
import { fileSize, openDocument, readAttachment } from '../lib/attachments';
import { demoBolPhoto, demoPodPdf } from '../lib/demoPaperwork';
import { getFile } from '../lib/fileStore';
import { getMessenger, newMessageId, setMessenger, updateMessenger, useMessenger } from '../lib/messengerStore';
import { matchesQuery } from '../lib/search';
import { getSettings } from '../lib/settingsStore';
import { Fa } from './Fa';
import { useModal } from './FormBits';
import { Tag } from './Tag';

// The New Load popup, loaded when it is first needed (it is large).
const NewLoadDialog = lazy(() => import('./NewLoadDialog').then((m) => ({ default: m.NewLoadDialog })));

// The messenger (release 1.42): a thin bar at the bottom right of every page;
// clicked, it opens upwards into a panel on the right, half the page tall,
// laid out like a desktop chat app — the chat list, then a chat with a back
// arrow at the top left. Each truck has a group (its driver and the
// dispatchers) that Dispatch to driver posts the load summary to, and a photo
// or PDF a driver sends can be saved to a load in two clicks.

const EMOJI = ['👍', '👌', '🙏', '😀', '😂', '😅', '😊', '😉', '😎', '🤔', '😬', '😴', '🙌', '👏', '💪', '🔥', '✅', '❌', '⚠️', '⏰',
  '🚚', '🚛', '⛽', '🛣️', '📍', '📦', '📄', '📸', '🧾', '💵', '🌧️', '❄️', '☀️', '🌙', '🍔', '☕', '❤️', '🎉', '👋', '🤝'];

const TIME = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
const SHORT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const LONG = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' });

const dayKey = (iso: string) => new Date(iso).toDateString();
function listTime(iso: string, now: number): string {
  const d = new Date(iso);
  if (d.toDateString() === new Date(now).toDateString()) return TIME.format(d);
  return now - d.getTime() < 6 * 86_400_000 ? WEEKDAY.format(d) : SHORT.format(d);
}
function dayLabel(iso: string, now: number): string {
  const d = new Date(iso);
  if (d.toDateString() === new Date(now).toDateString()) return 'Today';
  if (d.toDateString() === new Date(now - 86_400_000).toDateString()) return 'Yesterday';
  return LONG.format(d);
}

function Avatar({ name, group = false, truck = false, size = 'md' }: { name: string; group?: boolean; truck?: boolean; size?: 'md' | 'sm' }) {
  return (
    <span className={`ms-avatar is-${size} tone-${toneOf(name)}`} aria-hidden="true">
      {truck ? <Fa icon={faTruck} /> : group ? <Fa icon={faUserGroup} /> : initials(name)}
    </span>
  );
}

// The person signed in, with their role (from Settings › Team).
function whoAmI(): Person {
  const name = USER.name || 'You';
  const role = getSettings().team.find((t) => t.name === name)?.role ?? (USER.role || 'Dispatcher');
  return { name, role };
}

// The demo drivers' BOL photo and POD (never stops the chats from opening).
function demoFiles(linked: Load[]) {
  try {
    return { bol: linked[0] ? demoBolPhoto(linked[0].id, linked[0].route) : undefined, pod: linked[1] ? demoPodPdf(linked[1].id, linked[1].route) : undefined };
  } catch {
    return {};
  }
}

type Saving = { doc: BillDocument; from: string } & ({ step: 'choose' } | { step: 'find' } | { step: 'new' } | { step: 'edit'; load: Load });

export function Messenger() {
  const { drivers, trucks, loads } = useAppShell();
  const me = useMemo(whoAmI, []);
  const state = useMessenger();
  const [open, setOpen] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  const [info, setInfo] = useState(false);
  const [search, setSearch] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [saving, setSaving] = useState<Saving | null>(null);
  const bar = useRef<HTMLButtonElement>(null);

  const office = useMemo(() => getSettings().team.filter((t) => t.active).map((t) => ({ name: t.name, role: t.role })), []);
  const truckLinks = useMemo(() => trucks.map((t) => ({ unit: t.unit, driver: t.driver && t.driver !== 'Unassigned' ? t.driver : '', archived: t.archived })), [trucks]);

  // The first time: demo chats (RunTruck's own workspace) or empty ones.
  useEffect(() => {
    if (getMessenger()) return;
    const linked = loads.filter((l) => /^T-/.test(l.unit)).slice(0, 2);
    setMessenger(seedMessenger(me, drivers.filter((d) => !d.archived).map((d) => d.name), office, {
      demo: IS_DEMO, trucks: truckLinks,
      loads: linked.map((l) => ({ unit: l.unit.split('/')[0].trim(), id: l.id, summary: `Load #${l.id} – ${l.customer}\n${l.route}\nPickup ${l.pickup} · Delivery ${l.delivery}\nRate ${l.rate} · ${l.miles} mi` })),
      files: demoFiles(linked),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Every truck keeps its group: a new truck gets one, a new driver joins it.
  useEffect(() => {
    const s = getMessenger();
    if (s) {
      const next = syncTruckGroups(s, truckLinks, me, office);
      if (next !== s) setMessenger(next);
    }
  }, [truckLinks, me, office]);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const close = () => { setOpen(false); setInfo(false); window.setTimeout(() => bar.current?.focus(), 0); };
  // Esc: from a member list or a chat back to the list, then closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return;
      if (info) setInfo(false);
      else if (chatId) setChatId(null);
      else close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!state) return null;
  const chat = state.chats.find((c) => c.id === chatId) ?? null;
  const unread = totalUnread(state, me.name);
  const online = (name: string) => drivers.find((d) => d.name === name)?.status === 'On duty';
  const markRead = (id: string) => updateMessenger((s) => ({ ...s, read: { ...s.read, [id]: new Date().toISOString() } }));
  const send = (m: Omit<ChatMessage, 'id' | 'at' | 'from'>) => {
    const at = new Date().toISOString();
    updateMessenger((s) => ({ ...s, messages: [...s.messages, { ...m, id: newMessageId(), at, from: me.name }], read: { ...s.read, [m.chatId]: at } }));
  };

  return (
    <>
      {!open ? (
        <button ref={bar} type="button" className="ms-bar" onClick={() => setOpen(true)} aria-label={unread ? `Messages, ${unread} unread` : 'Messages'}>
          <Fa icon={faComments} />
          <span>Messages</span>
          {unread > 0 && <b className="ms-badge">{unread > 99 ? '99+' : unread}</b>}
        </button>
      ) : (
        <div className="ms-panel" role="dialog" aria-label="Messages">
          {chat && info ? (
            <Members chat={chat} me={me.name} online={online} onBack={() => setInfo(false)} onClose={close} />
          ) : chat ? (
            <ChatView
              chat={chat} me={me} state={state} now={now} online={online} onBack={() => setChatId(null)} onInfo={() => setInfo(true)} onClose={close}
              onSend={send} onSeen={() => markRead(chat.id)} onSave={(doc, from) => setSaving({ doc, from, step: 'choose' })}
            />
          ) : (
            <ChatList state={state} me={me.name} now={now} search={search} onSearch={setSearch} online={online} onOpen={(c) => { setChatId(c.id); setInfo(false); markRead(c.id); }} onClose={close} />
          )}
        </div>
      )}

      {saving?.step === 'choose' && (
        <SaveChoiceDialog doc={saving.doc} from={saving.from} onNew={() => setSaving({ ...saving, step: 'new' })} onExisting={() => setSaving({ ...saving, step: 'find' })} onClose={() => setSaving(null)} />
      )}
      {saving?.step === 'find' && (
        <LoadFinder doc={saving.doc} loads={loads} onPick={(load) => setSaving({ ...saving, step: 'edit', load })} onBack={() => setSaving({ ...saving, step: 'choose' })} onClose={() => setSaving(null)} />
      )}
      {(saving?.step === 'new' || saving?.step === 'edit') && (
        <Suspense fallback={null}>
          <NewLoadDialog load={saving.step === 'edit' ? saving.load : undefined} attach={{ doc: saving.doc, from: saving.from }} onClose={() => setSaving(null)} />
        </Suspense>
      )}
    </>
  );
}

function ChatList({ state, me, now, search, onSearch, online, onOpen, onClose }: {
  state: MessengerState; me: string; now: number; search: string; onSearch: (s: string) => void; online: (name: string) => boolean;
  onOpen: (c: Chat) => void; onClose: () => void;
}) {
  const q = search.trim().toLowerCase();
  const chats = chatOrder(state).filter((c) => !q || chatName(c, me).toLowerCase().includes(q) || messagesOf(state, c.id).some((m) => m.text?.toLowerCase().includes(q)));
  return (
    <>
      <div className="ms-head">
        <div className="ms-head-title">Messages</div>
        <button type="button" className="ms-icon" aria-label="Close messages" onClick={onClose}><Fa icon={faChevronDown} /></button>
      </div>
      <label className="ms-search">
        <Fa icon={faMagnifyingGlass} />
        <input type="search" placeholder="Search" value={search} onChange={(e) => onSearch(e.target.value)} aria-label="Search chats" autoFocus />
      </label>
      <ul className="ms-list">
        {chats.map((c) => {
          const name = chatName(c, me);
          const last = lastOf(state, c.id);
          const p = preview(last, me, c.kind);
          const n = unreadIn(state, c.id, me);
          return (
            <li key={c.id}>
              <button type="button" className="ms-row" onClick={() => onOpen(c)}>
                <span className="ms-avatar-wrap">
                  <Avatar name={name} group={c.kind === 'group'} truck={Boolean(c.truck)} />
                  {c.kind === 'private' && online(name) && <i className="ms-online" aria-label="online" />}
                </span>
                <span className="ms-row-main">
                  <span className="ms-row-top">
                    <span className="ms-row-name">{c.kind === 'group' && <Fa icon={c.truck ? faTruck : faUserGroup} className="ms-row-kind" />}{name}</span>
                    {last && <span className={`ms-row-time${n ? ' is-unread' : ''}`}>{last.from === me && <Fa icon={faCheckDouble} className="ms-tick" />}{listTime(last.at, now)}</span>}
                  </span>
                  <span className="ms-row-bottom">
                    <span className="ms-row-text">{p.who && <b>{p.who}: </b>}{p.text}</span>
                    {n > 0 ? <span className={`ms-count${c.muted ? ' is-muted' : ''}`}>{n}</span> : c.pinned ? <Fa icon={faThumbtack} className="ms-pin" /> : null}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
        {chats.length === 0 && <li className="ms-empty">No chats match “{search}”.</li>}
      </ul>
    </>
  );
}

// A group's members, each with their role under their name.
function Members({ chat, me, online, onBack, onClose }: { chat: Chat; me: string; online: (name: string) => boolean; onBack: () => void; onClose: () => void }) {
  const people = [...chat.members].sort((a, b) => Number(roleIn(chat, b) === DRIVER_ROLE) - Number(roleIn(chat, a) === DRIVER_ROLE) || a.localeCompare(b));
  return (
    <>
      <div className="ms-head is-chat">
        <button type="button" className="ms-icon" aria-label="Back to the chat" onClick={onBack}><Fa icon={faArrowLeft} /></button>
        <div className="ms-head-who"><div className="ms-head-name">Group info</div></div>
        <button type="button" className="ms-icon" aria-label="Close messages" onClick={onClose}><Fa icon={faChevronDown} /></button>
      </div>
      <div className="ms-info">
        <div className="ms-info-top">
          <Avatar name={chat.title} group truck={Boolean(chat.truck)} />
          <div>
            <div className="ms-info-title">{chat.title}</div>
            <div className="ms-head-sub">{chat.members.length} members{chat.truck ? ` · Truck ${chat.truck}` : ''}</div>
          </div>
        </div>
        {chat.truck && <Link className="ms-info-link" to="/app/fleet/trucks"><Fa icon={faTruck} />Open truck {chat.truck} in Fleet</Link>}
        <div className="ms-info-label">Members</div>
        <ul className="ms-members">
          {people.map((p) => (
            <li key={p} className="ms-member">
              <span className="ms-avatar-wrap"><Avatar name={p} size="sm" />{online(p) && <i className="ms-online is-sm" aria-label="online" />}</span>
              <span className="ms-member-text">
                <b>{p}{p === me ? ' (you)' : ''}</b>
                <span>{roleIn(chat, p) || 'Member'}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

// A photo kept in this browser, shown from IndexedDB (or the record itself).
function Photo({ m, onLoad }: { m: ChatMessage; onLoad: () => void }) {
  const [stored, setStored] = useState<string | null>(null);
  useEffect(() => {
    if (!m.file?.stored) return;
    let url = '';
    let gone = false;
    void getFile(m.file.id).then((b) => {
      if (b && !gone) { url = URL.createObjectURL(b); setStored(url); }
    });
    return () => { gone = true; if (url) URL.revokeObjectURL(url); };
  }, [m.file]);
  const src = m.file?.stored ? stored : m.file?.data ?? null;
  return (
    <button type="button" className="ms-photo" onClick={() => m.file && void openDocument(m.file)} aria-label={`Open photo ${m.file?.name ?? ''}`}>
      {src ? <img src={src} alt={m.file?.name ?? 'Photo'} onLoad={onLoad} /> : <span className="ms-photo-missing">Photo not in this browser</span>}
    </button>
  );
}

function ChatView({ chat, me, state, now, online, onBack, onInfo, onClose, onSend, onSeen, onSave }: {
  chat: Chat; me: Person; state: MessengerState; now: number; online: (name: string) => boolean;
  onBack: () => void; onInfo: () => void; onClose: () => void; onSend: (m: Omit<ChatMessage, 'id' | 'at' | 'from'>) => void; onSeen: () => void;
  onSave: (doc: BillDocument, from: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const [emoji, setEmoji] = useState(false);
  const [problem, setProblem] = useState('');
  const scroll = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const list = messagesOf(state, chat.id);
  const name = chatName(chat, me.name);
  const sub = chat.kind === 'group' ? `${chat.truck ? `Truck ${chat.truck} · ` : ''}${chat.members.length} members` : online(name) ? 'online' : 'last seen recently';
  // People who are not drivers can save a driver's paperwork to a load.
  const canSave = me.role !== DRIVER_ROLE;

  // Opens at the newest message, and follows new ones (and photos as they load).
  const toEnd = () => {
    const el = scroll.current;
    if (el) el.scrollTop = el.scrollHeight;
  };
  useEffect(() => {
    toEnd();
    onSeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length, chat.id]);
  useEffect(() => { input.current?.focus(); }, [chat.id]);

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    onSend({ chatId: chat.id, text });
    setDraft('');
    setEmoji(false);
    input.current?.focus();
  };
  const onKey = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  };
  const attach = async (picked: FileList | null) => {
    setProblem('');
    for (const f of Array.from(picked ?? [])) {
      const doc = await readAttachment(f);
      if (typeof doc === 'string') setProblem(doc);
      else onSend({ chatId: chat.id, file: doc });
    }
    if (files.current) files.current.value = '';
  };
  const who = (
    <>
      <span className="ms-avatar-wrap"><Avatar name={name} group={chat.kind === 'group'} truck={Boolean(chat.truck)} size="sm" /></span>
      <div className="ms-head-who">
        <div className="ms-head-name">{name}</div>
        <div className={`ms-head-sub${sub === 'online' ? ' is-online' : ''}`}>{sub}</div>
      </div>
    </>
  );

  return (
    <>
      <div className="ms-head is-chat">
        <button type="button" className="ms-icon" aria-label="Back to chats" onClick={onBack}><Fa icon={faArrowLeft} /></button>
        {chat.kind === 'group' ? <button type="button" className="ms-head-btn" onClick={onInfo} aria-label={`${name}: members`}>{who}</button> : who}
        <button type="button" className="ms-icon" aria-label="Close messages" onClick={onClose}><Fa icon={faChevronDown} /></button>
      </div>

      <div ref={scroll} className="ms-wall" role="log" aria-label={`Messages with ${name}`}>
        {list.length === 0 && <div className="ms-pill is-empty">No messages here yet. Say hello 👋</div>}
        {list.map((m, i) => {
          const mine = m.from === me.name;
          const prev = list[i - 1];
          const next = list[i + 1];
          const newDay = !prev || dayKey(prev.at) !== dayKey(m.at);
          const firstOfRun = newDay || !prev || prev.from !== m.from;
          const lastOfRun = !next || next.from !== m.from || dayKey(next.at) !== dayKey(m.at);
          const photo = m.file && isImage(m.file);
          const role = roleIn(chat, m.from);
          const saveable = Boolean(m.file) && canSave && role === DRIVER_ROLE && !mine;
          return (
            <div key={m.id}>
              {newDay && <div className="ms-pill">{dayLabel(m.at, now)}</div>}
              <div className={`ms-line${mine ? ' is-mine' : ''}${lastOfRun ? ' has-tail' : ''}`}>
                {chat.kind === 'group' && !mine && (lastOfRun ? <Avatar name={m.from} size="sm" /> : <span className="ms-avatar-gap" />)}
                <div className={`ms-bubble${photo ? ' is-photo' : ''}${m.load ? ' is-load' : ''}`}>
                  {chat.kind === 'group' && !mine && firstOfRun && (
                    <div className={`ms-from tone-${toneOf(m.from)}`}>{m.from}{role && <span className="ms-role">{role}</span>}</div>
                  )}
                  {m.load && (
                    <div className="ms-load">
                      <div className="ms-load-head"><Fa icon={faBoxOpen} /><b>Load {m.load} dispatched</b></div>
                      <pre className="ms-load-text">{m.text}</pre>
                      <Link className="ms-load-open" to={`/app/loads/${m.load}`}>Open load →</Link>
                    </div>
                  )}
                  {photo && <Photo m={m} onLoad={toEnd} />}
                  {m.file && !photo && (
                    <button type="button" className="ms-file" onClick={() => m.file && void openDocument(m.file)}>
                      <span className="ms-file-ico"><Fa icon={faFile} /></span>
                      <span className="ms-file-text"><b>{m.file.name}</b><span>{fileSize(m.file.size)}</span></span>
                    </button>
                  )}
                  {m.text && !m.load && <span className="ms-text">{m.text}</span>}
                  <span className="ms-meta">
                    {TIME.format(new Date(m.at))}
                    {mine && <Fa icon={now - Date.parse(m.at) > 60_000 ? faCheckDouble : faCheck} className="ms-tick" />}
                  </span>
                </div>
                {saveable && m.file && (
                  <button type="button" className="ms-save" title="Save to a load" aria-label={`Save ${m.file.name} to a load`} onClick={() => m.file && onSave(m.file, m.from)}>
                    <Fa icon={faFloppyDisk} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {emoji && (
        <div className="ms-emoji" role="listbox" aria-label="Emoji">
          {EMOJI.map((e) => (
            <button key={e} type="button" role="option" aria-selected={false} onClick={() => { setDraft((d) => d + e); input.current?.focus(); }}>{e}</button>
          ))}
        </div>
      )}
      {problem && <div className="ms-problem" role="alert">{problem}</div>}
      <div className="ms-compose">
        <button type="button" className={`ms-icon${emoji ? ' is-on' : ''}`} aria-label="Emoji" aria-pressed={emoji} onClick={() => setEmoji((v) => !v)}><Fa icon={faFaceSmile} /></button>
        <textarea ref={input} rows={1} className="ms-input" placeholder="Message" value={draft} aria-label="Message" onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} />
        <button type="button" className="ms-icon" aria-label="Attach a photo or file" onClick={() => files.current?.click()}><Fa icon={faPaperclip} /></button>
        <input ref={files} type="file" multiple hidden onChange={(e) => void attach(e.target.files)} />
        <button type="button" className={`ms-send${draft.trim() ? ' is-ready' : ''}`} aria-label="Send" disabled={!draft.trim()} onClick={submit}><Fa icon={faPaperPlane} /></button>
      </div>
    </>
  );
}

// — saving a driver's attachment to a load —

function SaveChoiceDialog({ doc, from, onNew, onExisting, onClose }: { doc: BillDocument; from: string; onNew: () => void; onExisting: () => void; onClose: () => void }) {
  const { ref, closeNow, ownEvent } = useModal(onClose);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => { first.current?.focus(); }, []);
  return (
    <dialog ref={ref} className="ui-dialog is-compact ms-save-dialog" aria-label={`Save ${doc.name} to a load`} onClose={(e) => { if (ownEvent(e)) onClose(); }} onCancel={(e) => ownEvent(e)}>
      <div className="ui-dialog-main">
        <section className="ui-dialog-body">
          <button type="button" className="ui-dialog-close" onClick={closeNow} aria-label="Close">×</button>
          <div>
            <div className="ui-label">Save attachment</div>
            <h2 className="ui-h2" style={{ margin: '2px 0 0' }}>{doc.name}</h2>
            <p className="ui-p" style={{ marginTop: 4 }}>Sent by {from} · {fileSize(doc.size)}. Where should it go?</p>
          </div>
          <div className="ms-save-choices">
            <button ref={first} type="button" className="ms-save-choice" onClick={onExisting}>
              <span className="ms-save-ico"><Fa icon={faFolderOpen} /></span>
              <span><b>Attach to an existing load</b><span>Find the load, check the change, then save.</span></span>
            </button>
            <button type="button" className="ms-save-choice" onClick={onNew}>
              <span className="ms-save-ico"><Fa icon={faFileCirclePlus} /></span>
              <span><b>Attach to a new load</b><span>Opens New Load with it already attached.</span></span>
            </button>
          </div>
        </section>
      </div>
    </dialog>
  );
}

// Find a load to attach to: type a load #, tender #, customer, city, truck or driver.
function LoadFinder({ doc, loads, onPick, onBack, onClose }: { doc: BillDocument; loads: Load[]; onPick: (l: Load) => void; onBack: () => void; onClose: () => void }) {
  const { ref, closeNow, ownEvent } = useModal(onClose);
  const field = useRef<HTMLInputElement>(null);
  // After the popup opens (it puts the focus on its first button).
  useEffect(() => { field.current?.focus(); }, []);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const hits = loads.filter((l) => matchesQuery({ id: l.id, ref: l.ref, customer: l.customer, route: l.route, unit: l.unit, driver: l.driver }, q)).slice(0, 8);
  const shown = Math.min(active, Math.max(0, hits.length - 1));
  return (
    <dialog ref={ref} className="ui-dialog is-compact ms-save-dialog" aria-label="Find the load" onClose={(e) => { if (ownEvent(e)) onClose(); }} onCancel={(e) => ownEvent(e)}>
      <div className="ui-dialog-main">
        <section className="ui-dialog-body">
          <button type="button" className="ui-dialog-close" onClick={closeNow} aria-label="Close">×</button>
          <div>
            <div className="ui-label">Attach {doc.name} to</div>
            <h2 className="ui-h2" style={{ margin: '2px 0 0' }}>Find the load</h2>
          </div>
          <label className="ms-finder">
            <Fa icon={faMagnifyingGlass} />
            <input
              ref={field} type="search" role="combobox" aria-expanded aria-controls="ms-finder-list" aria-autocomplete="list"
              aria-activedescendant={hits[shown] ? `ms-finder-${hits[shown].id}` : undefined}
              placeholder="Load #, tender #, customer, city, truck or driver" value={q}
              onChange={(e) => { setQ(e.target.value); setActive(0); }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                else if (e.key === 'Enter' && hits[shown]) { e.preventDefault(); onPick(hits[shown]); }
              }}
            />
          </label>
          <ul id="ms-finder-list" role="listbox" className="ms-finder-list" aria-label="Loads">
            {hits.map((l, i) => (
              <li key={l.id} id={`ms-finder-${l.id}`} role="option" aria-selected={i === shown} className={`ms-finder-row${i === shown ? ' is-active' : ''}`} onMouseEnter={() => setActive(i)} onClick={() => onPick(l)}>
                <span className="ms-finder-main"><span className="ms-finder-top"><b>{l.id}</b> · {l.route}</span><span>{l.customer} · {l.unit === '—' ? 'no truck' : l.unit} · {l.pickup}</span></span>
                <Tag label={l.status} tagClass={l.tagClass} />
              </li>
            ))}
            {hits.length === 0 && <li className="ms-empty">No loads match “{q}”.</li>}
          </ul>
        </section>
        <footer className="ui-dialog-foot">
          <button type="button" className="ui-btn" onClick={onBack}>← Back</button>
          <div style={{ flex: 1 }} />
        </footer>
      </div>
    </dialog>
  );
}
