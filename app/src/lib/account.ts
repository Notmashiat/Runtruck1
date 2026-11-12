// Who is signed in, and whose data is open.
//
// Read once, as the app loads, from the saved session. Every record and
// setting is stored under the signed-in account's Company ID
// ('runtruck-<company ID>-loads', …), so an account only ever reads and
// writes its own company's data. Logging in or out reloads the page, so
// nothing from another company is left in memory.
//
// Company ID 1 is RunTruck itself: its super admins, and the built-in demo
// records. Client companies start with no records at all.
// No imports: other modules read this before anything else loads.

export const OWNER_COMPANY_ID = '1';
export const OWNER_COMPANY_NAME = 'RunTruck';
// RunTruck's owner account (the first super admin).
export const OWNER_MEMBER_ID = '100482731';

const SESSION_KEY = 'runtruck-session';

// Company IDs RunTruck's own workspace had before; what was saved under them
// moves to Company ID 1.
const FORMER_IDS = ['30017'];

// 'runtruck-30017-loads' → 'runtruck-1-loads'. Other keys are left alone.
export function currentKey(key: string): string {
  for (const id of FORMER_IDS) {
    const prefix = `runtruck-${id}-`;
    if (key.startsWith(prefix)) return `runtruck-${OWNER_COMPANY_ID}-${key.slice(prefix.length)}`;
  }
  return key;
}

// Runs once, as the app loads: records, settings, the changed password and
// the open session all carry over from a former ID.
function moveFormerKeys() {
  try {
    for (const k of Object.keys(localStorage)) {
      const to = currentKey(k);
      if (to === k) continue;
      const value = localStorage.getItem(k);
      if (value !== null && localStorage.getItem(to) === null) localStorage.setItem(to, value);
      localStorage.removeItem(k);
    }
    for (const store of [sessionStorage, localStorage]) {
      const raw = store.getItem(SESSION_KEY);
      const s = raw ? (JSON.parse(raw) as { companyId?: string } | null) : null;
      if (s && s.companyId && FORMER_IDS.includes(s.companyId)) store.setItem(SESSION_KEY, JSON.stringify({ ...s, companyId: OWNER_COMPANY_ID }));
    }
  } catch {
    // Storage blocked or damaged: nothing to move.
  }
}
moveFormerKeys();

// Where a session may be kept: this tab only (sessionStorage) or the browser
// (localStorage, "keep me signed in"). A browser set to block site data
// throws on merely touching them, so each is taken on its own.
export function sessionStores(): Storage[] {
  const out: Storage[] = [];
  try {
    out.push(sessionStorage);
  } catch {
    // Blocked.
  }
  try {
    out.push(localStorage);
  } catch {
    // Blocked.
  }
  return out;
}

// The account and company in the saved session (checked properly by
// lib/auth.ts; this only decides whose storage to open).
export function storedSession(): { companyId: string; memberId: string } | null {
  for (const store of sessionStores()) {
    try {
      const s = JSON.parse(store.getItem(SESSION_KEY) ?? 'null') as { companyId?: unknown; memberId?: unknown; expires?: unknown } | null;
      if (s && typeof s.companyId === 'string' && /^\d+$/.test(s.companyId) && typeof s.memberId === 'string' && Date.parse(String(s.expires)) > Date.now()) {
        return { companyId: s.companyId, memberId: s.memberId };
      }
    } catch {
      // Ignore a damaged session.
    }
  }
  return null;
}

// — logging in switched off —
//
// While false, RunTruck has no login page: opening the site with no session
// saved opens it as RunTruck's owner (a super admin, Company ID 1), and
// /login goes straight into the app. The accounts, passwords and sign-in
// code are all kept; set this back to true to bring the login page back.
// A session already saved in this browser (a client account that logged in
// before) is still used until it is logged out or runs out.
export const LOGIN_REQUIRED = false;

// Ten years: the owner's automatic session never runs out in practice.
const OWNER_SESSION_MS = 10 * 365 * 24 * 3_600_000;

// — one sign-in for every window (release 1.38) —
//
// A session kept for "this visit only" lives in one tab's sessionStorage,
// which a new window does not get. While a window is signed in that way it
// shares the session here and refreshes the time every few seconds
// (shareSession, from AppLayout); a window opened meanwhile takes it. Once
// every window is closed the time goes stale and the session ends, as
// before. Logging out marks the session ended, and the other windows log
// out too.
const SHARED_KEY = 'runtruck-session-shared';
// Background windows may only run timers once a minute: allow for that.
export const SHARED_FRESH_MS = 150_000;

interface Shared { session?: { started?: unknown; expires?: unknown }; beat?: unknown; ended?: unknown }

function readShared(): Shared | null {
  try {
    return JSON.parse(localStorage.getItem(SHARED_KEY) ?? 'null') as Shared | null;
  } catch {
    return null;
  }
}

// A session another open window is using, if any (null when none is fresh).
export function openSessionElsewhere(shared: Shared | null, now: number): string | null {
  const s = shared?.session;
  if (!s || typeof shared?.beat !== 'number' || now - shared.beat > SHARED_FRESH_MS) return null;
  if (Date.parse(String(s.expires)) <= now) return null;
  return JSON.stringify(s);
}

function adoptOpenSession() {
  if (storedSession()) return;
  const session = openSessionElsewhere(readShared(), Date.now());
  if (!session) return;
  try {
    sessionStorage.setItem(SESSION_KEY, session);
  } catch {
    // Storage blocked: this window opens as if alone.
  }
}

// This window's visit-only session, as stored (null when it has none).
function visitSession(): { started?: string } | null {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null') as { started?: string } | null;
  } catch {
    return null;
  }
}

export function shareSession() {
  const s = visitSession();
  if (!s) return;
  const shared = readShared();
  // Logged out in another window: do not bring it back.
  if (shared?.ended === s.started) return;
  try {
    localStorage.setItem(SHARED_KEY, JSON.stringify({ session: s, beat: Date.now() }));
  } catch {
    // Storage blocked or full: other windows sign in on their own.
  }
}

export function endSharedSession() {
  const s = visitSession();
  try {
    if (s?.started) localStorage.setItem(SHARED_KEY, JSON.stringify({ ended: s.started, at: Date.now() }));
    else if (readShared()?.session) localStorage.removeItem(SHARED_KEY);
  } catch {
    // Nothing to mark.
  }
}

// Whether another window logged out of the session this window uses.
export function loggedOutElsewhere(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const shared = JSON.parse(raw) as Shared;
    return typeof shared.ended === 'string' && shared.ended === visitSession()?.started;
  } catch {
    return false;
  }
}
export const SHARED_SESSION_KEY = SHARED_KEY;

function openOwnerSessionIfNoLogin() {
  if (LOGIN_REQUIRED || storedSession()) return;
  const now = Date.now();
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      companyId: OWNER_COMPANY_ID, memberId: OWNER_MEMBER_ID, email: '',
      started: new Date(now).toISOString(), expires: new Date(now + OWNER_SESSION_MS).toISOString(), remember: false,
    }));
  } catch {
    // Storage blocked: the page still opens as the owner (the defaults below).
  }
}
adoptOpenSession();
openOwnerSessionIfNoLogin();

const signedIn = storedSession();
// The company whose data this page shows, and the account using it. Fixed
// for the life of the page.
export const COMPANY_ID = signedIn?.companyId ?? OWNER_COMPANY_ID;
export const MEMBER_ID = signedIn?.memberId ?? OWNER_MEMBER_ID;
// Only RunTruck's own workspace has the demo records.
export const IS_DEMO = COMPANY_ID === OWNER_COMPANY_ID;

// Demo records in RunTruck's workspace; nothing in a client company's.
export function demoOnly<T>(value: T, empty: T): T {
  return IS_DEMO ? value : empty;
}

// 'runtruck-loads' → 'runtruck-<company ID>-loads'. Keys that are not per
// company (the theme, the login session) are left alone.
const GLOBAL = new Set(['runtruck-theme', SESSION_KEY, 'runtruck-login-fails']);

export function scopedKey(key: string): string {
  if (GLOBAL.has(key) || !key.startsWith('runtruck-') || key.startsWith(`runtruck-${COMPANY_ID}-`)) return key;
  return key.replace(/^runtruck-/, `runtruck-${COMPANY_ID}-`);
}

// Whether a stored key belongs to the open company (or is not per company).
export function isOwnKey(key: string): boolean {
  return GLOBAL.has(key) || key.startsWith(`runtruck-${COMPANY_ID}-`);
}

// Read a company key. In RunTruck's workspace, anything saved before keys
// were per company moves over on first read.
export function readScoped(key: string): string | null {
  const scoped = scopedKey(key);
  try {
    const value = localStorage.getItem(scoped);
    if (value !== null || scoped === key || !IS_DEMO) return value;
    const legacy = localStorage.getItem(key);
    if (legacy !== null) {
      localStorage.setItem(scoped, legacy);
      localStorage.removeItem(key);
    }
    return legacy;
  } catch {
    return null;
  }
}

// RunTruck's own registers (client companies, accounts) live under Company
// ID 1 whichever account is signed in: 'accounts' → 'runtruck-1-accounts'.
export function registryKey(name: string): string {
  return `runtruck-${OWNER_COMPANY_ID}-${name}`;
}

export function readRegistry<T>(name: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(registryKey(name)) ?? 'null') as T | null;
  } catch {
    return null;
  }
}
