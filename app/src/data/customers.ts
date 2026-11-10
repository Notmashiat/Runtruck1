// CRM: the company's customers (shippers, brokers, 3PLs…), with contacts,
// billing, freight profile, documents and a log of what happened to the
// account. Stored per company (runtruck-<id>-customers). A customer goes
// inactive when someone moves it there, or by itself after a year with no
// loads or invoices; every move is logged with when, why and by whom.
import { nextSerial } from '../lib/ids';
import { addDaysIso } from '../lib/isoDates';
import { reviveList } from '../lib/persist';
import { IS_DEMO } from '../lib/account';
import { isoDateAt, shiftIso } from '../lib/clock';
import type { BillDocument } from './bills';
import type { FormValues } from './fleet';

export type CustomerStatus = 'Active' | 'Inactive';
export type Standing = 'Key account' | 'Growing' | 'New' | 'At risk';

export const CUSTOMER_TYPES = ['Shipper', 'Broker', '3PL', 'Freight forwarder', 'Manufacturer', 'Retailer', 'Distributor', 'Receiver / consignee', 'Other'];
export const INDUSTRIES = [
  'Food & beverage', 'Agriculture', 'Retail', 'Consumer goods', 'Building materials', 'Manufacturing', 'Automotive',
  'Chemicals', 'Paper & packaging', 'Home goods & furniture', 'Electronics', 'Other',
];
export const STANDINGS: Standing[] = ['Key account', 'Growing', 'New', 'At risk'];
export const STANDING_TAG: Record<Standing, string> = { 'Key account': 'tag-accent', Growing: 'tag-neutral', New: 'tag-green', 'At risk': 'tag-outline' };
export const CUSTOMER_TERMS = ['Due on receipt', 'Net 15', 'Net 30', 'Net 45', 'Net 60'];
// Whether accounting has approved the customer's credit. A load for a customer
// on credit hold can be created but not dispatched (release 1.21).
export const CREDIT_STATUSES = ['Approved', 'Credit hold'] as const;
export type CreditStatus = (typeof CREDIT_STATUSES)[number];
export const CUSTOMER_PAY = ['ACH', 'Check', 'Wire', 'Credit card', 'Through our factoring company'];
export const INVOICE_DELIVERY = ['Email', 'Customer AP portal', 'Mail', 'Through our factoring company'];
export const CUSTOMER_EQUIPMENT = ['Dry van', 'Reefer', 'Flatbed', 'Step deck', 'Conestoga', 'Tanker', 'Intermodal', 'Power only'];
export const CUSTOMER_NEEDS = ['Appointments required', 'Hazmat', 'TWIC / port access', 'Lumpers common', 'Driver assist / unload', 'Food-grade trailers', 'Team drivers', 'High value / security'];
export const ON_FILE = ['Signed shipping agreement', 'Credit application', 'W-9', 'Rate agreement', 'Certificate of insurance sent', 'Routing guide'];
export const INACTIVE_REASONS = ['No longer shipping with us', 'Went with another carrier', 'Credit or payment problems', 'Business closed or sold', 'Duplicate account', 'Other'];
export const AUTO_INACTIVE_DAYS = 365;
export const AUTO_BY = 'RunTruck (automatic)';

export interface CustomerLog {
  at: string;
  by: string;
  action: 'Created' | 'Moved to inactive' | 'Reactivated' | 'Edited';
  reason: string;
}

export interface CustomerRecord {
  id: string;
  name: string;
  legalName: string;
  type: string;
  industry: string;
  standing: Standing;
  since: string;
  salesRep: string;
  mc: string;
  dot: string;
  ein: string;
  website: string;
  contact: string;
  contactTitle: string;
  email: string;
  phone: string;
  shippingContact: string;
  shippingPhone: string;
  afterHoursPhone: string;
  billTo: string;
  attn: string;
  billingEmail: string;
  billingPhone: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  terms: string;
  creditLimit: number;
  // Missing on customers saved before release 1.21: Approved.
  credit?: CreditStatus;
  payMethod: string;
  invoiceDelivery: string;
  podRequired: boolean;
  invoiceInstructions: string;
  equipment: string[];
  commodities: string;
  lanes: string;
  needs: string[];
  instructions: string;
  onFile: string[];
  notes: string;
  documents: BillDocument[];
  status: CustomerStatus;
  // Before RunTruck: loads, revenue and on-time rate carried over.
  history?: { loads: number; revenue: number; onTime: number };
  // When the customer last shipped before RunTruck, if earlier than any load here.
  lastUsedBefore?: string;
  log: CustomerLog[];
  created: string;
  updated?: string;
}

// — activity and the one-year rule —

export interface Usage {
  // The latest date anything happened with the customer, and what it was.
  lastUsed: string;
  why: string;
}

// The local day of a stored timestamp.
export const dayOf = (iso: string) => (/T12:00:00\.000Z$/.test(iso) ? iso.slice(0, 10) : isoDateAt(new Date(iso)));

const MONTHS: Record<string, string> = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
// 'Oct 1' / 'Oct 1, 2026' → ISO (this year when no year).
export function isoOfShort(s: string, year: string): string {
  const m = /([A-Z][a-z]{2}) (\d{1,2})(?:, (\d{4}))?/.exec(s);
  return m && MONTHS[m[1]] ? `${m[3] ?? year}-${MONTHS[m[1]]}-${m[2].padStart(2, '0')}` : '';
}

// The last time a customer was used: its latest load or invoice, when it was
// added or reactivated, or its last shipment before RunTruck.
export function usageOf(c: CustomerRecord, loads: { customer: string; pickup: string; delivery: string }[], invoices: { customer: string; issued: string }[], year: string): Usage {
  const dates: [string, string][] = [[dayOf(c.created), 'added to CRM']];
  if (c.lastUsedBefore) dates.push([c.lastUsedBefore, 'shipment before RunTruck']);
  for (const l of loads) if (l.customer === c.name) dates.push([isoOfShort(l.delivery, year) || isoOfShort(l.pickup, year), 'load']);
  for (const i of invoices) if (i.customer === c.name && i.issued) dates.push([i.issued, 'invoice']);
  for (const e of c.log) if (e.action === 'Reactivated') dates.push([dayOf(e.at), 'reactivated']);
  const best = dates.filter(([d]) => d).sort((a, b) => (a[0] < b[0] ? 1 : -1))[0];
  return { lastUsed: best[0], why: best[1] };
}

export const addDays = addDaysIso;

// The latest move to inactive (for the Inactive list).
export const lastInactive = (c: CustomerRecord) => [...c.log].reverse().find((e) => e.action === 'Moved to inactive');

export function nextCustomerId(list: CustomerRecord[]): string {
  return `CUS-${nextSerial('CUS', list.map((c) => c.id), 1000)}`;
}

// — the form —

const str = (v: FormValues, k: string) => (typeof v[k] === 'string' ? (v[k] as string).trim() : '');
const list = (v: FormValues, k: string) => (Array.isArray(v[k]) ? (v[k] as string[]) : []);

export function blankCustomerForm(today: string, rep: string): FormValues {
  return {
    name: '', legalName: '', type: 'Shipper', industry: '', standing: 'New', since: today, salesRep: rep, mc: '', dot: '', ein: '', website: '',
    contact: '', contactTitle: '', email: '', phone: '', shippingContact: '', shippingPhone: '', afterHoursPhone: '',
    billTo: '', attn: '', billingEmail: '', billingPhone: '', street: '', city: '', state: '', zip: '',
    terms: 'Net 30', creditLimit: '', credit: 'Approved', payMethod: 'ACH', invoiceDelivery: 'Email', podRequired: 'Yes', invoiceInstructions: '',
    equipment: [], commodities: '', lanes: '', needs: [], instructions: '', onFile: [], notes: '',
  };
}

export function customerToForm(c: CustomerRecord): FormValues {
  return {
    name: c.name, legalName: c.legalName, type: c.type, industry: c.industry, standing: c.standing, since: c.since, salesRep: c.salesRep,
    mc: c.mc, dot: c.dot, ein: c.ein, website: c.website, contact: c.contact, contactTitle: c.contactTitle, email: c.email, phone: c.phone,
    shippingContact: c.shippingContact, shippingPhone: c.shippingPhone, afterHoursPhone: c.afterHoursPhone,
    billTo: c.billTo, attn: c.attn, billingEmail: c.billingEmail, billingPhone: c.billingPhone, street: c.street, city: c.city, state: c.state, zip: c.zip,
    terms: c.terms, creditLimit: c.creditLimit ? String(c.creditLimit) : '', credit: c.credit ?? 'Approved', payMethod: c.payMethod, invoiceDelivery: c.invoiceDelivery,
    podRequired: c.podRequired ? 'Yes' : 'No', invoiceInstructions: c.invoiceInstructions,
    equipment: [...c.equipment], commodities: c.commodities, lanes: c.lanes, needs: [...c.needs], instructions: c.instructions, onFile: [...c.onFile], notes: c.notes,
  };
}

export function customerFromForm(v: FormValues, id: string, documents: BillDocument[], by: string, prev?: CustomerRecord): CustomerRecord {
  const now = new Date().toISOString();
  return {
    id,
    name: str(v, 'name'),
    legalName: str(v, 'legalName'),
    type: str(v, 'type'),
    industry: str(v, 'industry'),
    standing: (str(v, 'standing') || 'New') as Standing,
    since: str(v, 'since'),
    salesRep: str(v, 'salesRep'),
    mc: str(v, 'mc').replace(/\D/g, ''),
    dot: str(v, 'dot').replace(/\D/g, ''),
    ein: str(v, 'ein'),
    website: str(v, 'website'),
    contact: str(v, 'contact'),
    contactTitle: str(v, 'contactTitle'),
    email: str(v, 'email'),
    phone: str(v, 'phone'),
    shippingContact: str(v, 'shippingContact'),
    shippingPhone: str(v, 'shippingPhone'),
    afterHoursPhone: str(v, 'afterHoursPhone'),
    billTo: str(v, 'billTo') || str(v, 'name'),
    attn: str(v, 'attn'),
    billingEmail: str(v, 'billingEmail'),
    billingPhone: str(v, 'billingPhone'),
    street: str(v, 'street'),
    city: str(v, 'city'),
    state: str(v, 'state').toUpperCase(),
    zip: str(v, 'zip'),
    terms: str(v, 'terms'),
    creditLimit: Number(str(v, 'creditLimit').replace(/[$,]/g, '')) || 0,
    credit: str(v, 'credit') === 'Credit hold' ? 'Credit hold' : 'Approved',
    payMethod: str(v, 'payMethod'),
    invoiceDelivery: str(v, 'invoiceDelivery'),
    podRequired: str(v, 'podRequired') !== 'No',
    invoiceInstructions: str(v, 'invoiceInstructions'),
    equipment: list(v, 'equipment'),
    commodities: str(v, 'commodities'),
    lanes: str(v, 'lanes'),
    needs: list(v, 'needs'),
    instructions: str(v, 'instructions'),
    onFile: list(v, 'onFile'),
    notes: str(v, 'notes'),
    documents,
    status: prev?.status ?? 'Active',
    history: prev?.history,
    lastUsedBefore: prev?.lastUsedBefore,
    log: prev ? prev.log : [{ at: now, by, action: 'Created', reason: 'Added to CRM' }],
    created: prev?.created ?? now,
    updated: prev ? now : undefined,
  };
}

export function reviveCustomers(raw: unknown): CustomerRecord[] | null {
  return reviveList<CustomerRecord>('customers', raw, (c) => typeof c.id === 'string' && typeof c.name === 'string' && Array.isArray(c.log), (c) => ({
    ...c, documents: Array.isArray(c.documents) ? c.documents : [], equipment: c.equipment ?? [], needs: c.needs ?? [], onFile: c.onFile ?? [],
  }));
}

// — demo customers (RunTruck's own workspace only) —

const blank: Omit<CustomerRecord, 'id' | 'name' | 'contact' | 'terms' | 'standing' | 'created' | 'log'> = {
  legalName: '', type: 'Shipper', industry: '', since: '', salesRep: 'Rosa Medina', mc: '', dot: '', ein: '', website: '',
  contactTitle: '', email: '', phone: '', shippingContact: '', shippingPhone: '', afterHoursPhone: '',
  billTo: '', attn: '', billingEmail: '', billingPhone: '', street: '', city: '', state: '', zip: '',
  creditLimit: 0, payMethod: 'ACH', invoiceDelivery: 'Email', podRequired: true, invoiceInstructions: '',
  equipment: [], commodities: '', lanes: '', needs: [], instructions: '', onFile: [], notes: '', documents: [], status: 'Active',
};

const made = (iso: string) => `${iso}T12:00:00.000Z`;

const DEMO = (): CustomerRecord[] => [
  {
    ...blank, id: 'CUS-1001', name: 'Northgate Foods', legalName: 'Northgate Foods, Inc.', industry: 'Food & beverage', standing: 'Key account', since: '2021-03-01',
    contact: 'Dana Ruiz', contactTitle: 'Logistics manager', email: 'dana.ruiz@northgatefoods.example', phone: '(559) 555-0100',
    shippingContact: 'Fresno DC shipping desk', shippingPhone: '(559) 555-0109', afterHoursPhone: '(559) 555-0199',
    billTo: 'Northgate Foods', attn: 'Accounts Payable · Dana Ruiz', billingEmail: 'ap@northgatefoods.example', billingPhone: '(559) 555-0101',
    street: '1200 N Blackstone Ave', city: 'Fresno', state: 'CA', zip: '93703', terms: 'Net 30', creditLimit: 60000,
    invoiceInstructions: 'PO number on every invoice; attach signed POD.', equipment: ['Reefer', 'Dry van'], commodities: 'Frozen produce, dairy',
    lanes: 'Fresno → Reno, Bakersfield → Phoenix', needs: ['Appointments required', 'Food-grade trailers'], instructions: 'Reefer pre-cooled to -10°F; continuous run.',
    onFile: ['Signed shipping agreement', 'Credit application', 'W-9', 'Rate agreement'], history: { loads: 184, revenue: 412000, onTime: 96 },
    created: made(shiftIso('2026-01-05')), log: [{ at: made(shiftIso('2026-01-05')), by: 'Rosa Medina', action: 'Created', reason: 'Imported into RunTruck' }],
  },
  {
    ...blank, id: 'CUS-1002', name: 'Bayline Distribution', legalName: 'Bayline Distribution LLC', type: 'Distributor', industry: 'Consumer goods', standing: 'Key account', since: '2021-09-15',
    contact: 'Owen Petrakis', contactTitle: 'Transportation lead', email: 'owen@bayline.example', phone: '(209) 555-0131',
    billTo: 'Bayline Distribution', attn: 'Owen Petrakis, Payables', billingEmail: 'payables@bayline.example', billingPhone: '(209) 555-0130',
    street: '455 W Weber Ave', city: 'Stockton', state: 'CA', zip: '95203', terms: 'Net 30', creditLimit: 45000, invoiceDelivery: 'Customer AP portal',
    equipment: ['Dry van'], commodities: 'Palletized dry goods, beverages', lanes: 'Stockton → Salt Lake City, Fresno → Portland', needs: ['Appointments required'],
    onFile: ['Signed shipping agreement', 'W-9'], history: { loads: 151, revenue: 338000, onTime: 94 },
    created: made(shiftIso('2026-01-05')), log: [{ at: made(shiftIso('2026-01-05')), by: 'Rosa Medina', action: 'Created', reason: 'Imported into RunTruck' }],
  },
  {
    ...blank, id: 'CUS-1003', name: 'Cascade Building Supply', legalName: 'Cascade Building Supply Co.', type: 'Distributor', industry: 'Building materials', standing: 'Growing', since: '2023-02-10',
    contact: 'Marta Lind', contactTitle: 'Yard operations', email: 'marta.lind@cascadebuild.example', phone: '(916) 555-0111',
    billTo: 'Cascade Building Supply', attn: 'Marta Lind, Accounts Payable', billingEmail: 'ap@cascadebuild.example', billingPhone: '(916) 555-0110',
    street: '9100 Folsom Blvd', city: 'Sacramento', state: 'CA', zip: '95826', terms: 'Net 45', creditLimit: 30000,
    equipment: ['Flatbed', 'Step deck'], commodities: 'Lumber, steel coil', lanes: 'Sacramento → Boise, Redding → Seattle', needs: ['Driver assist / unload'],
    instructions: 'Tarps and 8 straps minimum on lumber.', onFile: ['Signed shipping agreement', 'W-9'], history: { loads: 77, revenue: 196000, onTime: 91 },
    created: made(shiftIso('2026-01-05')), log: [{ at: made(shiftIso('2026-01-05')), by: 'Rosa Medina', action: 'Created', reason: 'Imported into RunTruck' }],
  },
  {
    ...blank, id: 'CUS-1004', name: 'Harbor Point Retail', legalName: 'Harbor Point Retail Group', type: 'Retailer', industry: 'Retail', standing: 'Growing', since: '2024-05-20',
    contact: 'Jules Amari', contactTitle: 'Freight payables', email: 'jules.amari@harborpoint.example', phone: '(510) 555-0151',
    billTo: 'Harbor Point Retail', attn: 'Jules Amari, Freight Payables', billingEmail: 'invoices@harborpoint.example', billingPhone: '(510) 555-0150',
    street: '1 Harbor Point Plaza', city: 'Oakland', state: 'CA', zip: '94607', terms: 'Net 30', creditLimit: 20000, invoiceDelivery: 'Customer AP portal',
    equipment: ['Dry van'], commodities: 'Consumer goods', lanes: 'Oakland → Portland', needs: ['Appointments required', 'TWIC / port access'],
    onFile: ['Signed shipping agreement', 'Routing guide'], history: { loads: 44, revenue: 121000, onTime: 89 },
    created: made(shiftIso('2026-01-05')), log: [{ at: made(shiftIso('2026-01-05')), by: 'Rosa Medina', action: 'Created', reason: 'Imported into RunTruck' }],
  },
  {
    ...blank, id: 'CUS-1005', name: 'Sierra Ag Partners', legalName: 'Sierra Agricultural Partners', industry: 'Agriculture', standing: 'At risk', since: '2022-08-01',
    contact: 'Ben Okafor', contactTitle: 'Accounting', email: 'ben.okafor@sierraag.example', phone: '(209) 555-0161',
    billTo: 'Sierra Ag Partners', attn: 'Ben Okafor, Accounting', billingEmail: 'accounting@sierraag.example', billingPhone: '(209) 555-0160',
    street: '4300 Kiernan Ave', city: 'Modesto', state: 'CA', zip: '95356', terms: 'Net 60', creditLimit: 25000, payMethod: 'Check', invoiceDelivery: 'Mail',
    equipment: ['Dry van', 'Reefer'], commodities: 'Almonds, walnuts', lanes: 'Modesto → Denver, Modesto → Salt Lake City',
    notes: 'Pays late; keep under the credit limit.', onFile: ['Credit application', 'W-9'], history: { loads: 62, revenue: 154000, onTime: 82 },
    created: made(shiftIso('2026-01-05')), log: [{ at: made(shiftIso('2026-01-05')), by: 'Rosa Medina', action: 'Created', reason: 'Imported into RunTruck' }],
  },
  {
    ...blank, id: 'CUS-1006', name: 'Vantage Home Goods', legalName: 'Vantage Home Goods Inc.', type: 'Retailer', industry: 'Home goods & furniture', standing: 'Growing', since: '2025-01-15',
    contact: 'Iris Chen', contactTitle: 'Accounts payable', email: 'iris.chen@vantagehome.example', phone: '(775) 555-0171',
    billTo: 'Vantage Home Goods', attn: 'Iris Chen, Accounts Payable', billingEmail: 'ap@vantagehome.example', billingPhone: '(775) 555-0170',
    street: '2750 Lakeside Dr', city: 'Reno', state: 'NV', zip: '89509', terms: 'Net 30', creditLimit: 15000,
    equipment: ['Dry van'], commodities: 'Furniture, home goods', lanes: 'Stockton → Las Vegas, Sacramento → Denver', onFile: ['W-9'],
    history: { loads: 29, revenue: 74000, onTime: 93 },
    created: made(shiftIso('2026-01-05')), log: [{ at: made(shiftIso('2026-01-05')), by: 'Rosa Medina', action: 'Created', reason: 'Imported into RunTruck' }],
  },
  // Moved to inactive by a user.
  {
    ...blank, id: 'CUS-1007', name: 'Pacific Crest Paper', legalName: 'Pacific Crest Paper Co.', type: 'Manufacturer', industry: 'Paper & packaging', standing: 'Growing', since: '2022-04-11',
    contact: 'Alan Brooks', email: 'alan.brooks@pacificcrest.example', phone: '(541) 555-0182', billTo: 'Pacific Crest Paper', billingEmail: 'ap@pacificcrest.example',
    street: '88 Mill Rd', city: 'Eugene', state: 'OR', zip: '97402', terms: 'Net 30', equipment: ['Dry van'], commodities: 'Paper rolls',
    history: { loads: 38, revenue: 91000, onTime: 95 }, status: 'Inactive', lastUsedBefore: shiftIso('2026-05-30'),
    created: made(shiftIso('2026-01-05')),
    log: [
      { at: made(shiftIso('2026-01-05')), by: 'Rosa Medina', action: 'Created', reason: 'Imported into RunTruck' },
      { at: made(shiftIso('2026-06-12')), by: 'Rosa Medina', action: 'Moved to inactive', reason: 'Went with another carrier · Moved their Oregon freight to an in-house fleet.' },
    ],
  },
  // Not used for over a year: RunTruck moves it to inactive by itself.
  {
    ...blank, id: 'CUS-1008', name: 'Desert Sun Produce', legalName: 'Desert Sun Produce LLC', industry: 'Agriculture', standing: 'Growing', since: '2023-06-01',
    contact: 'Maria Soto', email: 'maria@desertsun.example', phone: '(760) 555-0190', billTo: 'Desert Sun Produce', billingEmail: 'ap@desertsun.example',
    street: '410 Date Palm Dr', city: 'Indio', state: 'CA', zip: '92201', terms: 'Net 15', equipment: ['Reefer'], commodities: 'Citrus, melons',
    history: { loads: 21, revenue: 47000, onTime: 90 }, lastUsedBefore: shiftIso('2025-07-18'),
    created: `${shiftIso('2025-07-18')}T12:00:00.000Z`, log: [{ at: `${shiftIso('2025-07-18')}T12:00:00.000Z`, by: 'Rosa Medina', action: 'Created', reason: 'Imported into RunTruck' }],
  },
];

export const CUSTOMER_SEED: CustomerRecord[] = !IS_DEMO ? [] : DEMO();
