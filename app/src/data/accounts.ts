// RunTruck login accounts: who they are, which Company ID they belong to and
// which parts of the app they may open. Every account has the Dashboard (and
// its own Profile, Security and Appearance settings); everything else is
// granted section by section, and tab by tab inside sections that have tabs.
// Super admins (Company ID 1 only) have everything, including Developer.
import type { FormValues } from './fleet';
import { NAV, PAYROLL_IN_HR, SECTION_TABS, type ViewKey } from './mock';
import { ITERATIONS, type PasswordRecord } from '../lib/password';

export type AccountType =
  | 'Super admin' | 'Company admin' | 'Dispatcher' | 'Broker / sales agent' | 'Accounting & billing'
  | 'Safety & compliance' | 'Fleet manager' | 'HR & recruiting' | 'Custom';
export type AccountStatus = 'Active' | 'Deactivated';

export interface Account {
  accountId: string;
  companyId: string;
  type: AccountType;
  name: string;
  title: string;
  phone: string;
  // The login email (unique across RunTruck). Only a super admin changes it.
  email: string;
  password: PasswordRecord & { by?: 'admin' | 'self' };
  perms: string[];
  status: AccountStatus;
  notes: string;
  created: string;
  createdBy: string;
  updated?: string;
  lastSignIn?: string;
  // While deactivated: when, by whom, whether on its own or with its company,
  // and the version it keeps (it gets no updates until reactivated).
  deactivatedAt?: string;
  deactivatedBy?: string;
  deactivatedWith?: 'account' | 'company';
  deactivatedVersion?: string;
}

// — what can be granted —

export interface PermNode {
  key: string;
  label: string;
  children: { key: string; label: string }[];
}

const navLabel = (key: ViewKey) => {
  const n = NAV.find((x) => 'key' in x && x.key === key);
  return n && 'label' in n ? n.label : key;
};

// Company settings an account may be given. Profile, Security and Appearance
// are personal and always available.
export const COMPANY_SETTINGS: { key: string; label: string }[] = [
  { key: 'company', label: 'Company' }, { key: 'invoicing', label: 'Invoicing' }, { key: 'messages', label: 'Messages' },
  { key: 'operations', label: 'Operations' }, { key: 'alerts', label: 'Alerts' }, { key: 'team', label: 'Team' }, { key: 'data', label: 'Data' },
];
// Export data is everyone's too: it only offers what the account may open.
export const PERSONAL_SETTINGS = ['profile', 'security', 'appearance', 'export'];

// The checklist, in sidebar order: each section, and its tabs where it has them.
const SECTIONS: ViewKey[] = ['loads', 'planner', 'fleet', 'crm', 'facilities', 'accounting', 'hr', 'safety'];
export const PERM_TREE: PermNode[] = [
  ...SECTIONS.map((s) => ({
    key: s,
    label: navLabel(s),
    children: (SECTION_TABS[s] ?? []).map((t) => ({ key: `${s}/${t.key}`, label: t.label })),
  })),
  { key: 'settings', label: 'Company settings', children: COMPANY_SETTINGS.map((c) => ({ key: `settings/${c.key}`, label: c.label })) },
];
export const ALL_PERMS = PERM_TREE.flatMap((n) => [n.key, ...n.children.map((c) => c.key)]);

const every = (section: string) => {
  const n = PERM_TREE.find((x) => x.key === section);
  return n ? [n.key, ...n.children.map((c) => c.key)] : [];
};
const some = (section: string, ...tabs: string[]) => [section, ...tabs.map((t) => `${section}/${t}`)];

export const ACCOUNT_TYPES: { type: AccountType; about: string; preset: string[] }[] = [
  { type: 'Super admin', about: 'Runs RunTruck: every section and setting, plus Developer. Always under Company ID 1 (RunTruck).', preset: ALL_PERMS },
  { type: 'Company admin', about: 'Runs their company’s RunTruck: every section and company setting.', preset: ALL_PERMS },
  { type: 'Dispatcher', about: 'Books and runs loads with the fleet.', preset: [...every('loads'), ...every('planner'), ...every('fleet'), 'crm', 'facilities'] },
  { type: 'Broker / sales agent', about: 'Finds freight and customers and books loads.', preset: ['loads', 'planner', 'crm', 'facilities'] },
  { type: 'Accounting & billing', about: 'Invoices, collections, payroll and bills.', preset: ['loads', 'crm', ...every('accounting'), ...(PAYROLL_IN_HR ? some('hr', 'payroll') : []), ...some('settings', 'invoicing', 'messages')] },
  { type: 'Safety & compliance', about: 'Driver files, maintenance, violations and claims.', preset: [...every('fleet'), ...every('safety')] },
  { type: 'Fleet manager', about: 'Trucks, trailers and their upkeep.', preset: [...every('fleet'), ...some('safety', 'maintenance', 'unit-documents'), 'facilities'] },
  // Pay details are not part of recruiting: Payroll is granted separately.
  { type: 'HR & recruiting', about: 'Hiring, onboarding and driver contracts.', preset: [...every('hr').filter((p) => p !== 'hr/payroll'), ...some('fleet', 'drivers'), ...some('safety', 'driver-documents')] },
  { type: 'Custom', about: 'Start from the Dashboard only and tick exactly what they need.', preset: [] },
];
export const TYPE_NAMES = ACCOUNT_TYPES.map((t) => t.type);
export const typeInfo = (type: AccountType) => ACCOUNT_TYPES.find((t) => t.type === type) ?? ACCOUNT_TYPES[ACCOUNT_TYPES.length - 1];

// Payroll moved from Accounting to HR in release 1.6: a Payroll tick saved under
// either section opens Payroll wherever it is for this company.
function withPayroll(perms: string[]): string[] {
  const [from, to] = PAYROLL_IN_HR ? ['accounting', 'hr'] : ['hr', 'accounting'];
  return perms.includes(`${from}/payroll`) && perms.includes(from) && !perms.includes(`${to}/payroll`) ? [...perms, to, `${to}/payroll`] : perms;
}

// Whether a set of permissions opens a section or tab ('fleet', 'fleet/trucks').
// A section with tabs needs at least one of its tabs.
export function permits(given: string[], key: string): boolean {
  if (key === 'dashboard' || PERSONAL_SETTINGS.includes(key.replace(/^settings\//, ''))) return true;
  const perms = withPayroll(given);
  const [section] = key.split('/');
  if (!perms.includes(section)) return false;
  if (key.includes('/')) return perms.includes(key);
  const node = PERM_TREE.find((n) => n.key === section);
  return !node || node.children.length === 0 || node.children.some((c) => perms.includes(c.key));
}

// "Loads, Fleet (Drivers, Trucks), Accounting (all)" for lists.
export function describePerms(given: string[]): string {
  const perms = withPayroll(given);
  const parts = PERM_TREE.filter((n) => permits(perms, n.key)).map((n) => {
    if (n.children.length === 0) return n.label;
    const on = n.children.filter((c) => perms.includes(c.key));
    return on.length === n.children.length ? `${n.label} (all)` : `${n.label} (${on.map((c) => c.label).join(', ')})`;
  });
  return parts.length ? `Dashboard, ${parts.join(', ')}` : 'Dashboard only';
}

// — the Create account form —
// Sections are one checklist ('sections'); each section with tabs has its own
// checklist ('tabs-fleet', …) that shows once the section is ticked.

export const sectionField = 'sections';
export const tabsField = (section: string) => `tabs-${section}`;

export function permsToForm(given: string[]): FormValues {
  const perms = withPayroll(given);
  const v: FormValues = { [sectionField]: PERM_TREE.filter((n) => perms.includes(n.key)).map((n) => n.label) };
  for (const n of PERM_TREE) {
    if (n.children.length) v[tabsField(n.key)] = n.children.filter((c) => perms.includes(c.key)).map((c) => c.label);
  }
  return v;
}

export function permsFromForm(v: FormValues): string[] {
  const chosen = Array.isArray(v[sectionField]) ? (v[sectionField] as string[]) : [];
  const out: string[] = [];
  for (const n of PERM_TREE) {
    if (!chosen.includes(n.label)) continue;
    out.push(n.key);
    const tabs = Array.isArray(v[tabsField(n.key)]) ? (v[tabsField(n.key)] as string[]) : [];
    for (const c of n.children) if (tabs.includes(c.label)) out.push(c.key);
  }
  return out;
}

// Ticking a section ticks all its tabs (the usual case); unticking clears them.
export function syncTabs(prev: FormValues, next: FormValues): FormValues {
  const before = Array.isArray(prev[sectionField]) ? (prev[sectionField] as string[]) : [];
  const after = Array.isArray(next[sectionField]) ? (next[sectionField] as string[]) : [];
  const out = { ...next };
  for (const n of PERM_TREE) {
    if (!n.children.length) continue;
    if (after.includes(n.label) && !before.includes(n.label)) out[tabsField(n.key)] = n.children.map((c) => c.label);
    if (!after.includes(n.label) && before.includes(n.label)) out[tabsField(n.key)] = [];
  }
  return out;
}

export function reviveAccount(raw: unknown): Account | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<Account>;
  if (typeof r.accountId !== 'string' || typeof r.companyId !== 'string' || typeof r.email !== 'string') return null;
  if (!r.password || typeof r.password.hash !== 'string' || typeof r.password.salt !== 'string') return null;
  return {
    accountId: r.accountId,
    companyId: r.companyId,
    type: TYPE_NAMES.includes(r.type as AccountType) ? (r.type as AccountType) : 'Custom',
    name: typeof r.name === 'string' ? r.name : '',
    title: typeof r.title === 'string' ? r.title : '',
    phone: typeof r.phone === 'string' ? r.phone : '',
    email: r.email,
    password: { ...r.password, iterations: typeof r.password.iterations === 'number' && r.password.iterations > 0 ? r.password.iterations : ITERATIONS },
    // Kept as saved, whatever release this page runs. Payroll is 'accounting/payroll'
    // before release 1.6 and 'hr/payroll' from it; filtering to this page's own list
    // would drop the other one and then save the loss back for every company.
    perms: Array.isArray(r.perms) ? r.perms.filter((p): p is string => typeof p === 'string') : [],
    // 'Disabled' is what deactivated accounts were saved as before.
    status: r.status === 'Active' || r.status === undefined ? 'Active' : 'Deactivated',
    notes: typeof r.notes === 'string' ? r.notes : '',
    created: typeof r.created === 'string' ? r.created : new Date().toISOString(),
    createdBy: typeof r.createdBy === 'string' ? r.createdBy : '',
    updated: r.updated,
    lastSignIn: r.lastSignIn,
    deactivatedAt: r.deactivatedAt,
    deactivatedBy: r.deactivatedBy,
    deactivatedWith: r.deactivatedWith,
    deactivatedVersion: r.deactivatedVersion,
  };
}
