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
