// Everything on Settings: the signed-in person, the company, invoicing,
// message templates, operations thresholds, dashboard alerts, the team and
// appearance. Stored in this browser (runtruck-settings) by lib/settings.ts,
// which also applies them to the rest of the app.

export type TeamRole = 'Admin' | 'Dispatcher' | 'Accounting' | 'Safety & compliance' | 'Shop' | 'Read-only';
export const TEAM_ROLES: TeamRole[] = ['Admin', 'Dispatcher', 'Accounting', 'Safety & compliance', 'Shop', 'Read-only'];
export const ROLE_ABOUT: Record<TeamRole, string> = {
  Admin: 'Everything, including company settings and the team',
  Dispatcher: 'Loads, planner, drivers and trucks; listed as a dispatcher on driver records',
  Accounting: 'Invoices, batches, payments, payroll and bills',
  'Safety & compliance': 'Driver documents, maintenance, violations and claims',
  Shop: 'Trucks, trailers and maintenance work orders',
  'Read-only': 'Can look at everything, change nothing',
};

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: TeamRole;
  active: boolean;
}

export type AlertKey =
  | 'noDriver' | 'delayed' | 'pastDue' | 'docsExpired' | 'missingPod' | 'unbilledOld' | 'docsExpiring' | 'trucksShop' | 'lowHours' | 'drafts';

export const ALERTS: { key: AlertKey; label: string; about: string }[] = [
  { key: 'noDriver', label: 'Loads without a driver', about: 'Loads marked Needs driver' },
  { key: 'delayed', label: 'Delayed loads', about: 'Loads marked Delayed' },
  { key: 'pastDue', label: 'Past-due invoices', about: 'Invoices past their due date' },
  { key: 'docsExpired', label: 'Expired or missing driver documents', about: 'CDL, medical card, MVR and the rest' },
  { key: 'missingPod', label: 'Delivered loads missing a POD', about: 'Proof of delivery not attached' },
  { key: 'unbilledOld', label: 'Delivered loads not invoiced', about: 'Older than the “not invoiced after” days in Operations' },
  { key: 'docsExpiring', label: 'Driver documents due soon', about: 'Within the renewal window in Operations' },
  { key: 'trucksShop', label: 'Trucks in the shop or due for service', about: 'Any truck not In service' },
  { key: 'lowHours', label: 'Drivers low on hours', about: 'Below the hours-of-service warning in Operations' },
  { key: 'drafts', label: 'Draft invoices', about: 'Invoices saved but not issued' },
];

export type ThemeChoice = 'Light' | 'Dark' | 'System';
// Which dark mode Dark (and the top bar's moon) uses: Midnight is the
// near-black one (release 1.24), Classic the blue-grey one before it.
export type DarkStyle = 'Midnight' | 'Classic';
export const DARK_STYLES: DarkStyle[] = ['Midnight', 'Classic'];
export type Accent = 'Blue' | 'Teal' | 'Green' | 'Purple' | 'Orange' | 'Slate';
export type TextSize = 'Small' | 'Default' | 'Large';
export type Density = 'Comfortable' | 'Compact';
export type StartPage = 'dashboard' | 'loads' | 'planner' | 'fleet' | 'accounting';

export interface Settings {
  profile: { name: string; title: string; email: string; phone: string; timeZone: string };
  company: {
    name: string; legal: string; dot: string; mc: string; ein: string;
    street: string; city: string; state: string; zip: string; phone: string; email: string; website: string;
  };
  invoicing: {
    prefix: string; startAt: string; defaultTerms: string; fscPct: string; lateFeePct: string;
    bank: string; accountLast4: string; remit: string; paymentNote: string; footer: string;
    factoringName: string; factoringEmail: string;
  };
  messages: { invoiceSubject: string; invoiceBody: string; reminderBody: string; reminderText: string };
  operations: {
    terminals: string[]; hosWarnHours: string; renewWindowDays: string; unbilledDays: string;
    detentionFreeHours: string; detentionRate: string;
  };
  alerts: Record<AlertKey, boolean>;
  team: TeamMember[];
  appearance: { theme: ThemeChoice; darkStyle: DarkStyle; accent: Accent; textSize: TextSize; density: Density; startPage: StartPage };
  // Release 1.21: the company's own text-message provider (Twilio), used to
  // text loads to drivers. Empty until the company connects it.
  integrations: { twilioSid: string; twilioToken: string; twilioFrom: string };
}

export const TIME_ZONES = [
  'This device’s time zone', 'Pacific Time (Los Angeles)', 'Mountain Time (Denver)', 'Arizona (Phoenix)', 'Central Time (Chicago)', 'Eastern Time (New York)',
  'Alaska Time (Anchorage)', 'Hawaii Time (Honolulu)',
];
export const START_PAGES: { key: StartPage; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' }, { key: 'loads', label: 'Loads' }, { key: 'planner', label: 'Planner' },
  { key: 'fleet', label: 'Fleet' }, { key: 'accounting', label: 'Accounting' },
];

export const DEFAULT_SETTINGS: Settings = {
  profile: { name: 'Rosa Medina', title: 'Dispatch', email: 'rosa.medina@sunridgefreight.com', phone: '(209) 555-0101', timeZone: TIME_ZONES[0] },
  company: {
    name: 'Sunridge Freight', legal: 'Sunridge Freight LLC', dot: '2291176', mc: '812044', ein: '',
    street: '2250 Finch Rd', city: 'Modesto', state: 'CA', zip: '95354', phone: '(209) 555-0100', email: 'billing@sunridgefreight.com',
    website: 'sunridgefreight.com',
  },
  invoicing: {
    prefix: 'INV-', startAt: '8846', defaultTerms: 'Net 30', fscPct: '12', lateFeePct: '1.5',
    bank: 'Valley Commerce Bank', accountLast4: '4417', remit: 'PO Box 1187, Modesto, CA 95353',
    paymentNote: 'Please include the invoice number with your payment.', footer: 'Thank you for your business.',
    factoringName: 'TriPoint Capital', factoringEmail: 'submissions@tripointcapital.example',
  },
  messages: {
    invoiceSubject: 'Invoice {invoice} from {company} — {amount} due {due}',
    invoiceBody: [
      'Hello,',
      '',
      'Please find attached invoice {invoice} for {loads}{route}.',
      '',
      'Amount due: {amount}',
      'Due date: {due} ({terms})',
      'Your reference: {reference}',
      '',
      'Remit {payment}.',
      '',
      'Thank you for your business,',
      '{sender}',
      '{company} · {phone} · {email}',
    ].join('\n'),
    reminderBody: [
      'Hello {customer} team,',
      '',
      'Our records show the following invoice(s) from {company} are past due:',
      '',
      '{invoices}',
      '',
      'Balance due: {balance}',
      '',
      'Please remit {payment}. If payment is already on its way, reply with the remittance details and we will apply it.',
      '',
      'Thank you,',
      '{sender}',
      '{company} · {phone}',
    ].join('\n'),
    reminderText: '{company}: {count} past due, balance {balance}. Questions: {phone}',
  },
  operations: {
    terminals: ['Modesto, CA — main yard', 'Fresno, CA — drop yard', 'Sacramento, CA — drop yard'],
    hosWarnHours: '2', renewWindowDays: '60', unbilledDays: '3', detentionFreeHours: '2', detentionRate: '75',
  },
  alerts: {
    noDriver: true, delayed: true, pastDue: true, docsExpired: true, missingPod: true,
    unbilledOld: true, docsExpiring: true, trucksShop: true, lowHours: true, drafts: true,
  },
  team: [
    { id: 'U-1', name: 'Rosa Medina', email: 'rosa.medina@sunridgefreight.com', phone: '(209) 555-0101', role: 'Admin', active: true },
    { id: 'U-2', name: 'Evan Brooks', email: 'evan.brooks@sunridgefreight.com', phone: '(209) 555-0105', role: 'Dispatcher', active: true },
    { id: 'U-3', name: 'Luis Ortega', email: 'shop@sunridgefreight.com', phone: '(209) 555-0103', role: 'Shop', active: true },
    { id: 'U-4', name: 'Grace Whitman', email: 'grace.whitman@sunridgefreight.com', phone: '(209) 555-0107', role: 'Accounting', active: true },
    { id: 'U-5', name: 'Daniel Soto', email: 'daniel.soto@sunridgefreight.com', phone: '(209) 555-0108', role: 'Safety & compliance', active: true },
  ],
  appearance: { theme: 'Light', darkStyle: 'Midnight', accent: 'Blue', textSize: 'Default', density: 'Comfortable', startPage: 'dashboard' },
  integrations: { twilioSid: '', twilioToken: '', twilioFrom: '' },
};

// What a client company's settings start from: its entry in the client
// register (data/companies.ts) and the signed-in account (data/accounts.ts).
export interface StartingCompany {
  companyId: string; name: string; legal: string; dot: string; mc: string; ein: string; street: string; city: string;
  state: string; zip: string; phone: string; contactEmail: string; website: string; timeZone: string;
}
export interface StartingPerson {
  accountId: string; name: string; title: string; phone: string; email: string; type: string;
}

// How settings start. RunTruck's workspace keeps the demo company; any other
// company starts from its own details and nobody else's (no demo team,
// terminals, bank or factoring company).
export function startingSettings(company: Partial<StartingCompany> | null, person: Partial<StartingPerson> | null, demo: boolean): Settings {
  const d = structuredCopy(DEFAULT_SETTINGS);
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  if (!demo) {
    const c = company ?? {};
    d.company = {
      name: str(c.name), legal: str(c.legal), dot: str(c.dot), mc: str(c.mc), ein: str(c.ein), street: str(c.street), city: str(c.city),
      state: str(c.state), zip: str(c.zip), phone: str(c.phone), email: str(c.contactEmail), website: str(c.website),
    };
    // Numbering from 1001, and no fuel surcharge or late fee until the company sets its own.
    d.invoicing = { ...d.invoicing, startAt: '1001', fscPct: '0', lateFeePct: '0', bank: '', accountLast4: '', remit: '', factoringName: '', factoringEmail: '' };
    d.operations = { ...d.operations, terminals: [] };
    d.team = [];
  }
  if (person) {
    const zone = str(company?.timeZone);
    d.profile = {
      name: str(person.name), title: str(person.title) || str(person.type), email: str(person.email), phone: str(person.phone),
      timeZone: TIME_ZONES.includes(zone) ? zone : TIME_ZONES[0],
    };
  }
  return d;
}

// A stored copy, completed with anything added since it was saved.
export function mergeSettings(raw: unknown, d: Settings = DEFAULT_SETTINGS): Settings {
  if (!raw || typeof raw !== 'object') return structuredCopy(d);
  const r = raw as Partial<Settings>;
  // A saved section over its defaults. A saved value of the wrong kind (a
  // number where text belongs, from a hand-edited backup) is dropped for the
  // default, so the rest of the app can rely on every setting's type.
  const obj = <T extends object>(def: T, v: unknown): T => {
    const out = { ...def } as Record<string, unknown>;
    if (v && typeof v === 'object') {
      for (const [k, value] of Object.entries(v as Record<string, unknown>)) {
        const d0 = (def as Record<string, unknown>)[k];
        if (d0 === undefined || (typeof value === typeof d0 && Array.isArray(value) === Array.isArray(d0))) out[k] = value;
      }
    }
    return out as T;
  };
  const textList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  const ops = obj(d.operations, r.operations);
  return {
    profile: obj(d.profile, r.profile),
    company: obj(d.company, r.company),
    invoicing: obj(d.invoicing, r.invoicing),
    messages: obj(d.messages, r.messages),
    operations: { ...ops, terminals: textList(ops.terminals).length ? textList(ops.terminals) : [...d.operations.terminals] },
    alerts: obj(d.alerts, r.alerts),
    team: Array.isArray(r.team) ? r.team.filter((m) => m && typeof m.id === 'string' && typeof m.name === 'string' && typeof m.email === 'string' && typeof m.role === 'string') : d.team.map((m) => ({ ...m })),
    appearance: obj(d.appearance, r.appearance),
    integrations: obj(d.integrations, r.integrations),
  };
}

export function structuredCopy<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
