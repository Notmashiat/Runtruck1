// The messenger (release 1.42): private chats and group chats between the
// office and the drivers, and a group for each truck (its driver and the
// dispatchers) that Dispatch to driver posts the load summary to. This
// reference build has no server, so chats live in this browser
// (lib/messengerStore.ts), seeded with demo conversations in RunTruck's own
// workspace. The production build sends them over its backend.
import type { BillDocument } from './bills';

export type ChatKind = 'private' | 'group';

export interface Chat {
  id: string;
  kind: ChatKind;
  title: string;
  // Who is in it (names); the signed-in person is always a member.
  members: string[];
  // Each member's role, shown under their name ('Driver', 'Dispatcher'…).
  roles?: Record<string, string>;
  // The truck a truck group belongs to (its unit number).
  truck?: string;
  pinned?: boolean;
  muted?: boolean;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  from: string;
  at: string;
  text?: string;
  // A photo or a file, kept in this browser (lib/fileStore.ts).
  file?: BillDocument;
  // A load summary sent with Dispatch to driver (the load's number).
  load?: string;
}

export interface MessengerState {
  chats: Chat[];
  messages: ChatMessage[];
  // When each chat was last opened (ISO): messages after it are unread.
  read: Record<string, string>;
}

export interface Person { name: string; role: string }
export interface TruckLink { unit: string; driver: string; archived?: boolean }

export const DRIVER_ROLE = 'Driver';
export const isImage = (d: Pick<BillDocument, 'type'>) => /^image\/(png|jpe?g|gif|webp)$/i.test(d.type);
export const truckChatId = (unit: string) => `t-${unit.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
export const personChatId = (name: string) => `p-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
// 'Marcus Hale Truck T-114' (or 'Truck T-114' with no driver).
export const truckChatTitle = (t: TruckLink) => (t.driver ? `${t.driver} Truck ${t.unit}` : `Truck ${t.unit}`);
export const roleIn = (c: Chat, name: string) => c.roles?.[name] ?? '';

// Messages in a chat, oldest first.
export function messagesOf(state: MessengerState, chatId: string): ChatMessage[] {
  return state.messages.filter((m) => m.chatId === chatId).sort((a, b) => a.at.localeCompare(b.at));
}

export function lastOf(state: MessengerState, chatId: string): ChatMessage | undefined {
  const list = messagesOf(state, chatId);
  return list[list.length - 1];
}

export function unreadIn(state: MessengerState, chatId: string, me: string): number {
  const seen = state.read[chatId] ?? '';
  return state.messages.filter((m) => m.chatId === chatId && m.from !== me && m.at > seen).length;
}

export function totalUnread(state: MessengerState, me: string): number {
  return state.chats.filter((c) => !c.muted).reduce((sum, c) => sum + unreadIn(state, c.id, me), 0);
}

// What the chat list shows under a chat's name.
export function preview(m: ChatMessage | undefined, me: string, kind: ChatKind): { who: string; text: string } {
  if (!m) return { who: '', text: 'No messages yet' };
  const body = m.load ? `Load ${m.load} dispatched` : m.text?.trim() || (m.file ? (isImage(m.file) ? 'Photo' : m.file.name) : '');
  const who = m.from === me ? 'You' : kind === 'group' ? m.from.split(' ')[0] : '';
  return { who, text: body };
}

// Chats in list order: pinned first, then the newest message first.
export function chatOrder(state: MessengerState): Chat[] {
  const last = (c: Chat) => lastOf(state, c.id)?.at ?? '';
  return [...state.chats].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || last(b).localeCompare(last(a)));
}

// The other person in a private chat (or the group's title).
export const chatName = (c: Chat, me: string) => (c.kind === 'private' ? c.members.find((m) => m !== me) ?? c.title : c.title);

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';

// The same colour for a name every time (one of seven, as in most messengers).
export function toneOf(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 7;
}

// A truck group's members: its driver and the dispatchers (plus the person
// signed in), each with their role.
function truckMembers(t: TruckLink, me: Person, office: Person[]) {
  const dispatchers = office.filter((p) => /dispatch/i.test(p.role) && p.name !== me.name);
  const people: Person[] = [...(t.driver ? [{ name: t.driver, role: DRIVER_ROLE }] : []), me, ...dispatchers];
  return { members: people.map((p) => p.name), roles: Object.fromEntries(people.map((p) => [p.name, p.role])) };
}

// Every truck in the fleet has its group: a new truck gets one, and a group
// follows its truck's driver (new title and members; messages kept).
export function syncTruckGroups(state: MessengerState, trucks: TruckLink[], me: Person, office: Person[]): MessengerState {
  let changed = false;
  const chats = [...state.chats];
  for (const t of trucks.filter((x) => !x.archived)) {
    const id = truckChatId(t.unit);
    const want = { title: truckChatTitle(t), ...truckMembers(t, me, office) };
    const i = chats.findIndex((c) => c.id === id);
    if (i < 0) {
      chats.push({ id, kind: 'group', truck: t.unit, ...want });
      changed = true;
    } else if (chats[i].title !== want.title || JSON.stringify(chats[i].members) !== JSON.stringify(want.members) || JSON.stringify(chats[i].roles) !== JSON.stringify(want.roles)) {
      chats[i] = { ...chats[i], ...want, truck: t.unit };
      changed = true;
    }
  }
  return changed ? { ...state, chats } : state;
}

// The load summary text posted to a truck's group by Dispatch to driver.
export function dispatchMessage(text: string, notes: string): string {
  return text.trim() + (notes.trim() ? `\n\nNOTES: ${notes.trim()}` : '');
}

// — demo conversations —

const ago = (now: number, minutes: number) => new Date(now - minutes * 60_000).toISOString();

export interface DemoFiles { bol?: BillDocument; pod?: BillDocument }
export interface DemoLoad { unit: string; id: string; summary: string }

export function seedMessenger(me: Person, drivers: string[], office: Person[], opts: {
  now?: number; demo?: boolean; trucks?: TruckLink[]; loads?: DemoLoad[]; files?: DemoFiles;
} = {}): MessengerState {
  const { now = Date.now(), demo = true, trucks = [], loads = [], files = {} } = opts;
  const people = [...new Set(drivers.filter(Boolean))];
  const staff = office.filter((p) => p.name && p.name !== me.name);
  const roles = Object.fromEntries([...people.map((p) => [p, DRIVER_ROLE]), [me.name, me.role], ...staff.map((p) => [p.name, p.role])]);
  const chats: Chat[] = [];
  if (people.length) chats.push({ id: 'g-drivers', kind: 'group', title: 'All drivers', members: [me.name, ...people, ...staff.map((p) => p.name)], roles, pinned: true });
  if (staff.length) chats.push({ id: 'g-office', kind: 'group', title: 'Office team', members: [me.name, ...staff.map((p) => p.name)], roles });
  for (const p of [...people, ...staff.map((s) => s.name)]) chats.push({ id: personChatId(p), kind: 'private', title: p, members: [me.name, p], roles });
  const base = syncTruckGroups({ chats, messages: [], read: {} }, trucks, me, office);
  if (!demo) return base;

  const say = (chatId: string, from: string, minutes: number, extra: Partial<ChatMessage>): ChatMessage => ({ id: `m-${chatId}-${minutes}`, chatId, from, at: ago(now, minutes), ...extra });
  const text = (chatId: string, from: string, minutes: number, t: string) => say(chatId, from, minutes, { text: t });
  const [d1, d2, d3, d4] = people;
  const [s1, s2] = staff.map((s) => s.name);
  const m = me.name;
  const messages: ChatMessage[] = [];
  if (people.length) {
    messages.push(
      text('g-drivers', m, 26 * 60, 'Morning everyone — weather advisory on I-80 over Donner Pass today. Chains may be required, check before you roll.'),
      ...(d2 ? [text('g-drivers', d2, 25 * 60 + 40, 'Copy that 👍')] : []),
      ...(d1 ? [text('g-drivers', d1, 3 * 60, 'Fuel card working again at the Pilot in Lodi, thanks office')] : []),
      text('g-drivers', m, 2 * 60 + 50, 'Reminder: PODs in the app within an hour of delivery please.'),
    );
  }
  if (d1) messages.push(text(personChatId(d1), d1, 95, 'At the shipper in Fresno, door 14. They say about 2 hours to load.'), text(personChatId(d1), m, 90, 'Thanks — I\'ll tell the customer. Send the BOL photo when you have it.'), text(personChatId(d1), d1, 12, 'Loaded and sealed, seal #48812. Rolling to Reno.'));
  if (d2) messages.push(text(personChatId(d2), m, 6 * 60, 'Can you take a reload out of Salt Lake on Thursday? 640 mi, $2,900.'), text(personChatId(d2), d2, 5 * 60 + 30, 'Yes I can do it. Home time starts Saturday though.'), text(personChatId(d2), m, 5 * 60 + 20, 'Perfect, you\'ll be home Friday night. Booking it now.'));
  if (d3) messages.push(text(personChatId(d3), d3, 40, 'Running 30 min late to Redding, traffic at the Sacramento bypass'));
  if (d4) messages.push(text(personChatId(d4), m, 2 * 24 * 60, 'Your settlement for last week is in. Let me know if anything looks off.'), text(personChatId(d4), d4, 2 * 24 * 60 - 30, 'All good, thank you!'));
  if (s1) messages.push(text('g-office', s1, 70, 'Uncovered load L-40221 Oakland → Portland still needs a truck for tomorrow.'));
  if (s2) messages.push(text(personChatId(s2), s2, 4 * 60, 'Invoice batch for Northgate is ready for your review.'));

  // Truck groups: a dispatched load, and the driver's paperwork back.
  const withDriver = trucks.filter((t) => t.driver && !t.archived);
  loads.forEach((l, i) => {
    const t = withDriver.find((x) => x.unit === l.unit);
    if (!t) return;
    const id = truckChatId(t.unit);
    const at = 8 * 60 - i * 90;
    messages.push(say(id, m, at, { load: l.id, text: l.summary }));
    messages.push(text(id, t.driver, at - 15, 'Got it 👍 On my way to the shipper.'));
    const file = i === 0 ? files.bol : i === 1 ? files.pod : undefined;
    if (file) messages.push(say(id, t.driver, at - 70, { file, text: i === 0 ? 'Loaded — BOL attached' : 'Delivered, POD signed' }));
  });

  // Opened before the newest messages, so a few show as unread.
  const read: Record<string, string> = {};
  for (const c of base.chats) read[c.id] = ago(now, 60);
  read['g-drivers'] = ago(now, 2 * 60);
  for (const t of withDriver) read[truckChatId(t.unit)] = ago(now, 9 * 60);
  return { ...base, messages, read };
}

// — the panel's size (release 1.45) —

export interface PanelSize { w: number; h: number }
const MIN_W = 320;
const MIN_H = 380;
const MARGIN = 32;

// A size that fits: at least the minimum, and inside the window.
export function fitSize(s: PanelSize, viewport: PanelSize): PanelSize {
  const maxW = Math.max(MIN_W, viewport.w - MARGIN);
  const maxH = Math.max(MIN_H, viewport.h - MARGIN);
  return { w: Math.round(Math.min(maxW, Math.max(MIN_W, s.w))), h: Math.round(Math.min(maxH, Math.max(MIN_H, s.h))) };
}

// — where the panel sits (release 1.46): its distance from the window's right
// and bottom edges, so resizing from its left and top edges keeps working —

export interface PanelPlace { r: number; b: number }
export const HOME_PLACE: PanelPlace = { r: 20, b: 16 };
const EDGE = 8;

// A place that keeps the whole panel (of `size`) on screen.
export function fitPlace(p: PanelPlace, size: PanelSize, viewport: PanelSize): PanelPlace {
  const maxR = Math.max(EDGE, viewport.w - size.w - EDGE);
  const maxB = Math.max(EDGE, viewport.h - size.h - EDGE);
  return { r: Math.round(Math.min(maxR, Math.max(EDGE, p.r))), b: Math.round(Math.min(maxB, Math.max(EDGE, p.b))) };
}
