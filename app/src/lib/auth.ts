import { ALL_PERMS, permits, type AccountType } from '../data/accounts';
import { DEFAULT_SETTINGS } from '../data/settings';
import {
  COMPANY_ID, LOGIN_REQUIRED, MEMBER_ID, OWNER_COMPANY_ID, OWNER_MEMBER_ID, readRegistry, registryKey, sessionStores, storedSession,
} from './account';
import { accountByEmail, accountById, reloadAccounts, saveAccount } from './accountStore';
import { companyById, reloadCompanies } from './companyStore';
import { trialEnded, type ClientCompany } from '../data/companies';
import { todayIso } from './clock';
import { readJson, removeKey, writeJson } from './storage';
import { MIN_PASSWORD, makePasswordRecord, passwordFits, passwordProblems as problemsFor, type PasswordRecord } from './password';

// Logging in. There are two kinds of account:
// - RunTruck's owner (Account ID 100482731, Company ID 1). Until the password
//   is changed in Settings › Security it is the starting password below.
// - Accounts made in Developer › Create account (lib/accountStore.ts), each
//   with its own login email, password, Company ID and permissions.
// A session opens exactly one company's data (lib/account.ts). There is no
// server yet, so all of this lives in this browser: it is a gate in the
// browser, not server-side security.

export { MIN_PASSWORD };

// The owner's starting password fingerprint (the password itself is not in the code).
const STARTING: PasswordRecord = {
  salt: '10bd890a82a7af9eafb061e54ffa5ecb',
  hash: 'd330e5c7bf6ce5ba8851c4baf52495e9e2f5c0c0d4b5538d3d0d549707af9379',
  iterations: 210_000,
};

const OWNER_AUTH_KEY = registryKey('auth');
const OWNER_EMAIL_KEY = registryKey('login-email');
const SESSION_KEY = 'runtruck-session';
const FAILS_KEY = 'runtruck-login-fails';
const REMEMBER_DAYS = 30;
const SESSION_HOURS = 12;
const MAX_TRIES = 5;
const LOCK_SECONDS = 60;

export interface Session {
  companyId: string;
  memberId: string;
  email: string;
  started: string;
  expires: string;
  remember: boolean;
}

// — the owner account —

function ownerPassword(): PasswordRecord {
  const saved = readJson<PasswordRecord>(OWNER_AUTH_KEY);
  return saved && saved.salt && saved.hash && saved.iterations ? saved : STARTING;
}

interface LoginEmailRecord {
  email: string;
  changed: string;
}

function ownerEmailRecord(): LoginEmailRecord | null {
  const saved = readJson<LoginEmailRecord>(OWNER_EMAIL_KEY);
  return saved && typeof saved.email === 'string' && saved.email.includes('@') ? saved : null;
}

// The owner's login email: changed only in Settings › Security; until then
// the account's original email.
export function ownerEmail(): string {
  return ownerEmailRecord()?.email ?? DEFAULT_SETTINGS.profile.email;
}

// Until a login email is set, the owner's Profile email also works (it used
// to be the login email). It is read from storage, so the answer is the
// same whoever is signed in.
function ownerAlias(): string {
  if (ownerEmailRecord()) return '';
  type Saved = { profile?: { email?: unknown } } | null;
  const own = readRegistry<Saved>(`member-${OWNER_MEMBER_ID}-settings`);
  const shared = readRegistry<Saved>('settings');
  const email = own?.profile?.email ?? shared?.profile?.email;
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// — the signed-in account —

export interface Me {
  accountId: string;
  companyId: string;
  type: AccountType;
  email: string;
  perms: string[];
  owner: boolean;
}

function meFor(memberId: string, companyId: string): Me | null {
  if (memberId === OWNER_MEMBER_ID) {
    return companyId === OWNER_COMPANY_ID
      ? { accountId: OWNER_MEMBER_ID, companyId, type: 'Super admin', email: ownerEmail(), perms: ALL_PERMS, owner: true }
      : null;
  }
  const a = accountById(memberId);
  if (!a || a.status !== 'Active' || a.companyId !== companyId) return null;
  if (a.companyId !== OWNER_COMPANY_ID && companyBlocked(companyById(a.companyId))) return null;
  return { accountId: a.accountId, companyId: a.companyId, type: a.type, email: a.email, perms: a.type === 'Super admin' ? ALL_PERMS : a.perms, owner: false };
}

// A client company whose accounts may not use RunTruck: removed, deactivated,
// paused, cancelled, or on a free trial that has ended. The same rule decides
// who may log in and whose open session keeps working, so pausing a company
// (or a trial running out) takes effect at once.
function companyBlocked(c: ClientCompany | undefined): boolean {
  return !c || Boolean(c.deactivated) || c.status === 'Paused' || c.status === 'Cancelled' || trialEnded(c, todayIso());
}

// The account this page was opened for (null when signed out).
export function me(): Me | null {
  return currentSession() ? meFor(MEMBER_ID, COMPANY_ID) : null;
}

// A super admin: RunTruck staff under Company ID 1. Only they see Developer.
export function isSuperAdmin(): boolean {
  const m = me();
  return Boolean(m && m.type === 'Super admin' && m.companyId === OWNER_COMPANY_ID);
}

// Whether the signed-in account may open a section or tab ('loads',
// 'fleet/trucks', 'settings/company'). Everyone has the Dashboard, Settings
// (their own Profile, Security and Appearance); Developer is super admins only.
export function can(key: string): boolean {
  const m = me();
  if (!m) return false;
  if (key === 'developer' || key.startsWith('developer/')) return isSuperAdmin();
  if (m.type === 'Super admin') return true;
  if (key === 'settings') return true;
  return permits(m.perms, key);
}

// '/app/accounting/past-due' → can('accounting/past-due').
export function canPath(path: string): boolean {
  const [, , section = 'dashboard', tab] = path.toLowerCase().split('/');
  if (section === 'loads') return can('loads');
  return can(tab ? `${section}/${tab}` : section);
}

// — too many tries —

// Wrong tries are counted per email and kept for the browser (not the tab),
// so opening a new tab, or logging in to another account, does not reset
// the count for the email being guessed at.
type Fails = Record<string, { count: number; until: number }>;

function fails(): Fails {
  const saved = readJson<Fails>(FAILS_KEY);
  return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
}

const failKey = (email: string) => email.trim().toLowerCase();

// Seconds left before another try is allowed (0 = go ahead): for one email,
// or the longest wait of any when none is given.
export function lockedFor(email?: string): number {
  const all = fails();
  const untils = email === undefined ? Object.values(all).map((f) => f?.until ?? 0) : [all[failKey(email)]?.until ?? 0];
  return Math.max(0, Math.ceil((Math.max(0, ...untils) - Date.now()) / 1000));
}

function noteFail(email: string) {
  const all = fails();
  // Forget counts whose lock has run out, so the record stays small.
  for (const [k, f] of Object.entries(all)) if (!f || (f.until > 0 && f.until < Date.now())) delete all[k];
  const count = (all[failKey(email)]?.count ?? 0) + 1;
  all[failKey(email)] = count >= MAX_TRIES ? { count: 0, until: Date.now() + LOCK_SECONDS * 1000 } : { count, until: 0 };
  writeJson(FAILS_KEY, all);
}

function clearFails(email: string) {
  const all = fails();
  if (!(failKey(email) in all)) return;
  delete all[failKey(email)];
  if (Object.keys(all).length) writeJson(FAILS_KEY, all);
  else removeKey(FAILS_KEY);
}

// — logging in and out —

export type LoginResult =
  | { ok: true }
  | { ok: false; reason: 'locked' | 'email' | 'password' | 'disabled' | 'company' | 'trial' | 'storage'; seconds?: number; company?: string; ended?: string };

function openSession(companyId: string, memberId: string, email: string, remember: boolean): boolean {
  const now = Date.now();
  const session: Session = {
    companyId,
    memberId,
    email,
    started: new Date(now).toISOString(),
    expires: new Date(now + (remember ? REMEMBER_DAYS * 86_400_000 : SESSION_HOURS * 3_600_000)).toISOString(),
    remember,
  };
  logOut();
  try {
    (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify(session));
    return true;
  } catch {
    // Storage blocked: there is nowhere to keep the session.
    return false;
  }
}

// Check the email and password and open a session. The caller then reloads
// the app, so it opens with that account's company and nothing else.
export async function logIn(email: string, password: string, remember: boolean): Promise<LoginResult> {
  if (lockedFor(email) > 0) return { ok: false, reason: 'locked', seconds: lockedFor(email) };
  // Spaces copied around a password are not part of it.
  const typed = password.trim();
  const fail = (reason: 'email' | 'password'): LoginResult => {
    noteFail(email);
    return lockedFor(email) > 0 ? { ok: false, reason: 'locked', seconds: lockedFor(email) } : { ok: false, reason };
  };
  // A login page left open may be behind: use the accounts and companies as
  // they are saved now, not as they were when this tab loaded.
  reloadAccounts();
  reloadCompanies();

  // An account's login email wins over the owner's old Profile-email alias.
  const a = accountByEmail(email);
  let opened: boolean;
  if (same(email, ownerEmail()) || (!a && ownerAlias() !== '' && same(email, ownerAlias()))) {
    if (!(await passwordFits(typed, ownerPassword()))) return fail('password');
    opened = openSession(OWNER_COMPANY_ID, OWNER_MEMBER_ID, ownerEmail(), remember);
  } else {
    if (!a) return fail('email');
    if (!(await passwordFits(typed, a.password))) return fail('password');
    if (a.status !== 'Active') return { ok: false, reason: 'disabled' };
    if (a.companyId !== OWNER_COMPANY_ID) {
      const c = companyById(a.companyId);
      if (c && !c.deactivated && trialEnded(c, todayIso())) return { ok: false, reason: 'trial', company: c.name, ended: c.trialEnds };
      if (companyBlocked(c)) return { ok: false, reason: 'company', company: c ? `${c.name} (${c.deactivated ? 'deactivated' : c.status.toLowerCase()})` : 'This company' };
    }
    saveAccount({ ...a, lastSignIn: new Date().toISOString() });
    opened = openSession(a.companyId, a.accountId, a.email, remember);
  }
  if (!opened) return { ok: false, reason: 'storage' };
  clearFails(email);
  return { ok: true };
}

// The session this page runs on: it must still be valid, for an account that
// is active, and for the company this page opened. A session for a different
// account (from another tab) does not count: see sessionChanged().
export function currentSession(): Session | null {
  for (const store of sessionStores()) {
    try {
      const s = JSON.parse(store.getItem(SESSION_KEY) ?? 'null') as Session | null;
      if (s && s.companyId === COMPANY_ID && s.memberId === MEMBER_ID && Date.parse(s.expires) > Date.now() && meFor(s.memberId, s.companyId)) return s;
    } catch {
      // Ignore a damaged session.
    }
  }
  return null;
}

// Someone logged in as a different account in another tab: this page holds
// the other company's data, so it must reload before showing anything.
export function sessionChanged(): boolean {
  const s = storedSession();
  return Boolean(s && (s.companyId !== COMPANY_ID || s.memberId !== MEMBER_ID));
}

export function logOut() {
  for (const store of sessionStores()) {
    try {
      store.removeItem(SESSION_KEY);
    } catch {
      // Nothing to remove.
    }
  }
}

// Log out and reload on the login page, so no company data stays in memory.
// With logging in switched off there is no login page: it reloads the app,
// which opens as the owner.
export function logOutAndLeave() {
  logOut();
  window.location.replace(LOGIN_REQUIRED ? '/login' : '/app');
}

// Whether "Log out" means anything: not for the owner while logging in is
// switched off (there is nobody else to be).
export const canLogOut = (): boolean => LOGIN_REQUIRED || !me()?.owner;

// — the signed-in account's own login —

export function accountEmail(): string {
  return me()?.email ?? ownerEmail();
}

export function passwordChangedOn(): string | undefined {
  const m = me();
  if (!m) return undefined;
  return m.owner ? ownerPassword().changed : accountById(m.accountId)?.password.changed;
}

export function loginEmailChangedOn(): string | undefined {
  const m = me();
  if (!m) return undefined;
  return m.owner ? ownerEmailRecord()?.changed : accountById(m.accountId)?.updated;
}

export const passwordProblems = (next: string) => problemsFor(next, accountEmail());

async function currentFits(current: string): Promise<boolean> {
  const m = me();
  if (!m) return false;
  if (m.owner) return passwordFits(current, ownerPassword());
  const a = accountById(m.accountId);
  return Boolean(a && (await passwordFits(current, a.password)));
}

// Every account can change its own password.
export async function changePassword(current: string, next: string): Promise<'ok' | 'wrong-current' | 'weak' | 'not-saved'> {
  if (!(await currentFits(current))) return 'wrong-current';
  if (passwordProblems(next).length) return 'weak';
  const record = await makePasswordRecord(next);
  const m = me();
  if (m?.owner) {
    if (!writeJson(OWNER_AUTH_KEY, record)) return 'not-saved';
  } else if (m) {
    const a = accountById(m.accountId);
    if (a) saveAccount({ ...a, password: { ...record, by: 'self' } });
  }
  return 'ok';
}

// Whether a login email is free (no other account, owner included, uses it).
export function emailTaken(email: string, exceptId?: string): boolean {
  const e = email.trim().toLowerCase();
  // The owner's login email, and (until one is set) the Profile email that also logs the owner in.
  if (exceptId !== OWNER_MEMBER_ID && (ownerEmail().toLowerCase() === e || ownerAlias() === e)) return true;
  const other = accountByEmail(e);
  return Boolean(other && other.accountId !== exceptId);
}

// Only super admins change a login email (their own here; anyone's in
// Developer). Everyone else asks a RunTruck super admin.
export async function changeLoginEmail(current: string, next: string): Promise<'ok' | 'wrong-current' | 'invalid' | 'taken' | 'not-allowed' | 'not-saved'> {
  const m = me();
  if (!m || !isSuperAdmin()) return 'not-allowed';
  if (!(await currentFits(current))) return 'wrong-current';
  const email = next.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'invalid';
  if (emailTaken(email, m.accountId)) return 'taken';
  if (m.owner) {
    if (!writeJson(OWNER_EMAIL_KEY, { email, changed: new Date().toISOString() } satisfies LoginEmailRecord)) return 'not-saved';
  } else {
    const a = accountById(m.accountId);
    if (a) saveAccount({ ...a, email, updated: new Date().toISOString() });
  }
  // The open session now shows the new email.
  for (const store of sessionStores()) {
    try {
      const s = JSON.parse(store.getItem(SESSION_KEY) ?? 'null') as Session | null;
      if (s) store.setItem(SESSION_KEY, JSON.stringify({ ...s, email }));
    } catch {
      // Ignore a damaged session.
    }
  }
  return 'ok';
}
