// What Settings › Export data can export: every table in RunTruck, as plain
// rows of text, with the date, driver, truck and customer each row is about
// (for the filters). Each set names the permission that opens it, so an
// account only ever sees the sets it has access to.
import { billStatus, type BillRecord } from '../data/bills';
import { driverDocuments } from '../data/compliance';
import type { Facility } from '../data/facilities';
import type { FleetDriver, FleetTrailer, FleetTruck, FormValues } from '../data/fleet';
import { CONTRACTS, ONBOARDING } from '../data/hr';
import { contractPay, contractState, currentEnd, progressOf, stageOf, type ContractRecord, type OnboardingRecord } from '../data/hrRecords';
import { isLive } from './releases';
import { batchStatus, batchTotal, billableLoads, invoiceTotal, statusOf, usd, type Batch, type InvoiceRecord } from '../data/invoicing';
import { PAYROLL_IN_HR, type Load } from '../data/mock';
import { payLabel, runTotals, type Employee, type PayRun } from '../data/payroll';
import type { CustomerRecord } from '../data/customers';
import { CLAIMS, MAINTENANCE, VIOLATIONS } from '../data/safety';
import { netCost, paidOf, recordable, woCost, type ClaimRecord, type ViolationRecord, type WorkOrder } from '../data/safetyRecords';
import { isoFromText } from './clock';

// Release 1.6 moves Payroll from Accounting to HR.
const PAYROLL_GROUP = PAYROLL_IN_HR ? 'HR' : 'Accounting';
const PAYROLL_PERM = PAYROLL_IN_HR ? 'hr/payroll' : 'accounting/payroll';

export interface ExportColumn {
  key: string;
  label: string;
  // Shown in the app's own table: ticked by default.
  main: boolean;
}

export interface ExportRow {
  values: Record<string, string>;
  date: string;
  drivers: string[];
  trucks: string[];
  customer: string;
  archived: boolean;
}

export interface ExportSet {
  key: string;
  label: string;
  group: string;
  perm: string;
  dateLabel?: string;
  columns: ExportColumn[];
  rows: ExportRow[];
}

export interface ExportSources {
  loads: Load[];
  drivers: FleetDriver[];
  trucks: FleetTruck[];
  trailers: FleetTrailer[];
  facilities: Facility[];
  invoices: InvoiceRecord[];
  batches: Batch[];
  bills: BillRecord[];
  customers: CustomerRecord[];
  employees: Employee[];
  contracts: ContractRecord[];
  onboardings: OnboardingRecord[];
  workOrders: WorkOrder[];
  violations: ViolationRecord[];
  claims: ClaimRecord[];
  payRuns: PayRun[];
}

// '2026-10-01', 'Oct 1', 'Thu Oct 1 · 08:00' → '2026-10-01' ('' when there is no date).
const MONTHS = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}(, \d{4})?/;
export function toIso(v: string | undefined): string {
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const m = MONTHS.exec(v);
  return m ? isoFromText(m[0]) : '';
}

// 'cdlExpiry' → 'CDL expiry'.
const ACRONYMS: Record<string, string> = {
  cdl: 'CDL', vin: 'VIN', dot: 'DOT', mc: 'MC', ein: 'EIN', hos: 'HOS', mvr: 'MVR', twic: 'TWIC', id: 'ID', zip: 'ZIP',
  pod: 'POD', rpm: 'RPM', fsc: 'FSC', eld: 'ELD', gvwr: 'GVWR', ifta: 'IFTA', irp: 'IRP', ssn: 'SSN', scac: 'SCAC', bol: 'BOL', po: 'PO',
};
export function humanize(key: string): string {
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase().split(' ').filter(Boolean);
  return words.map((w, i) => ACRONYMS[w] ?? (i === 0 ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
}

const text = (v: unknown): string => {
  if (v === undefined || v === null) return '';
  if (Array.isArray(v)) return v.map(text).filter(Boolean).join(', ');
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'object') return '';
  return String(v);
};

// [key, label, value, ticked by default (true unless false)]
// Placeholders that are not a driver or unit, so they are not offered as filters.
const NOBODY = ['Unassigned', '—', '-', 'TBD'];

type Main<T> = [key: string, label: string, get: (r: T) => unknown, main?: boolean][];

// A set from records: the main columns, then (unticked) every field of the
// records' full form ('details') not already shown.
function makeSet<T>(
  meta: Omit<ExportSet, 'columns' | 'rows'>,
  list: T[],
  main: Main<T>,
  about: (r: T) => Partial<Omit<ExportRow, 'values'>>,
  details?: (r: T) => FormValues | undefined,
): ExportSet {
  const mainKeys = new Set(main.map(([k]) => k));
  const extra: string[] = [];
  for (const r of list) {
    for (const [k, v] of Object.entries(details?.(r) ?? {})) {
      if (!mainKeys.has(k) && !extra.includes(k) && (typeof v === 'string' || Array.isArray(v))) extra.push(k);
    }
  }
  const columns: ExportColumn[] = [
    ...main.map(([key, label, , on]) => ({ key, label, main: on !== false })),
    ...extra.map((key) => ({ key, label: humanize(key), main: false })),
  ];
  const rows = list.map((r) => {
    const values: Record<string, string> = {};
    for (const [k, , get] of main) values[k] = text(get(r));
    const d = details?.(r) ?? {};
    for (const k of extra) values[k] = text(d[k]);
    const a = about(r);
    const real = (x: string) => Boolean(x) && !NOBODY.includes(x);
    return { values, date: a.date ?? '', drivers: (a.drivers ?? []).filter(real), trucks: (a.trucks ?? []).filter(real), customer: a.customer ?? '', archived: a.archived ?? false };
  });
  return { ...meta, columns, rows };
}

const units = (s: string) => s.split(/\s*\/\s*/).map((x) => x.trim()).filter((x) => x && x !== '—');
const money = (n: number) => usd(n);

export function buildExportSets(s: ExportSources): ExportSet[] {
  const { loads, drivers, trucks, trailers, facilities, invoices, batches, bills, customers, employees, payRuns, contracts, onboardings, workOrders, violations, claims } = s;
  const loadById = new Map(loads.map((l) => [l.id, l]));
  return [
    makeSet({ key: 'loads', label: 'Loads', group: 'Loads', perm: 'loads', dateLabel: 'pickup date' }, loads, [
      ['id', 'Load', (l) => l.id], ['status', 'Status', (l) => l.status], ['customer', 'Customer', (l) => l.customer], ['ref', 'Reference', (l) => l.ref],
      ['route', 'Route', (l) => l.route], ['pickup', 'Pickup', (l) => l.pickup], ['delivery', 'Delivery', (l) => l.delivery], ['driver', 'Driver', (l) => l.driver],
      ['unit', 'Truck / trailer', (l) => l.unit], ['carrier', 'Carrier', (l) => l.carrier], ['equip', 'Equipment', (l) => l.equip], ['commodity', 'Commodity', (l) => l.commodity],
      ['weight', 'Weight', (l) => l.weight], ['miles', 'Miles', (l) => l.miles], ['rate', 'Rate', (l) => l.rate],
      ['rpm', 'Rate per mile', (l) => l.rpm, false], ['pay', 'Driver pay', (l) => l.pay, false], ['margin', 'Margin', (l) => l.margin, false], ['temp', 'Temperature', (l) => l.temp, false],
      ['from', 'Shipper', (l) => l.from, false], ['fromAddr', 'Shipper address', (l) => l.fromAddr, false], ['to', 'Receiver', (l) => l.to, false], ['toAddr', 'Receiver address', (l) => l.toAddr, false],
      ['carrierMc', 'Carrier MC', (l) => l.carrierMc, false], ['carrierDot', 'Carrier DOT', (l) => l.carrierDot, false], ['notes', 'Notes', (l) => l.notes, false],
    ], (l) => ({ date: toIso(l.pickup), drivers: [l.driver], trucks: units(l.unit), customer: l.customer })),

    makeSet({ key: 'drivers', label: 'Drivers', group: 'Fleet', perm: 'fleet/drivers', dateLabel: 'hire date' }, drivers, [
      ['name', 'Driver', (d) => d.name], ['status', 'Status', (d) => d.status], ['unit', 'Truck', (d) => d.unit], ['load', 'Current load', (d) => d.load],
      ['hos', 'Hours left', (d) => d.hos], ['cdl', 'CDL expires', (d) => d.cdl], ['pay', 'Pay to date', (d) => d.pay], ['miles', 'Miles this week', (d) => d.miles],
    ], (d) => ({ date: toIso(text(d.details.hireDate)), drivers: [d.name], trucks: units(d.unit), archived: Boolean(d.archived) }), (d) => d.details),

    makeSet({ key: 'trucks', label: 'Trucks', group: 'Fleet', perm: 'fleet/trucks' }, trucks, [
      ['unit', 'Unit', (t) => t.unit], ['make', 'Make and year', (t) => t.make], ['plate', 'Plate', (t) => t.plate], ['driver', 'Driver', (t) => t.driver],
      ['odo', 'Odometer', (t) => t.odo], ['service', 'Next service', (t) => t.service], ['status', 'Status', (t) => t.status],
    ], (t) => ({ drivers: [t.driver === 'Unassigned' ? '' : t.driver], trucks: [t.unit], archived: Boolean(t.archived) }), (t) => t.details),

    makeSet({ key: 'trailers', label: 'Trailers', group: 'Fleet', perm: 'fleet/trailers' }, trailers, [
      ['unit', 'Unit', (t) => t.unit], ['kind', 'Type', (t) => t.kind], ['status', 'Status', (t) => t.status], ['where', 'Location', (t) => t.where],
    ], (t) => ({ trucks: [t.unit], archived: Boolean(t.archived) }), (t) => t.details),

    makeSet({ key: 'customers', label: 'Customers', group: 'CRM', perm: 'crm' }, customers, [
      ['name', 'Customer', (c) => c.name], ['status', 'Status', (c) => c.status], ['type', 'Type', (c) => c.type], ['contact', 'Contact', (c) => c.contact],
      ['email', 'Email', (c) => c.email], ['phone', 'Phone', (c) => c.phone], ['terms', 'Terms', (c) => c.terms], ['standing', 'Standing', (c) => c.standing],
      ['city', 'City', (c) => c.city], ['state', 'State', (c) => c.state],
      ['id', 'Customer ID', (c) => c.id, false], ['legalName', 'Legal name', (c) => c.legalName, false], ['industry', 'Industry', (c) => c.industry, false],
      ['billTo', 'Bill to', (c) => c.billTo, false], ['billingEmail', 'Billing email', (c) => c.billingEmail, false], ['street', 'Billing address', (c) => c.street, false],
      ['zip', 'ZIP', (c) => c.zip, false], ['creditLimit', 'Credit limit', (c) => (c.creditLimit ? money(c.creditLimit) : ''), false], ['payMethod', 'Pays by', (c) => c.payMethod, false],
      ['mc', 'MC', (c) => c.mc, false], ['dot', 'USDOT', (c) => c.dot, false], ['equipment', 'Equipment', (c) => c.equipment, false], ['commodities', 'Commodities', (c) => c.commodities, false],
      ['lanes', 'Lanes', (c) => c.lanes, false], ['onFile', 'On file', (c) => c.onFile, false], ['salesRep', 'Account owner', (c) => c.salesRep, false],
      ['documents', 'Documents', (c) => c.documents.map((d) => d.name), false], ['notes', 'Notes', (c) => c.notes, false],
    ], (c) => ({ customer: c.name, archived: c.status === 'Inactive' })),

    makeSet({ key: 'facilities', label: 'Facilities', group: 'Facilities', perm: 'facilities' }, facilities, [
      ['name', 'Facility', (f) => f.name], ['type', 'Type', (f) => f.type], ['city', 'City', (f) => f.city], ['state', 'State', (f) => f.state], ['customer', 'Customer', (f) => f.customer],
    ], (f) => ({ customer: f.customer, archived: Boolean(f.archived) }), (f) => f.details),

    makeSet({ key: 'uninvoiced', label: 'Loads to invoice', group: 'Accounting', perm: 'accounting/uninvoiced', dateLabel: 'delivery date' }, billableLoads(loads, invoices), [
      ['id', 'Load', (l) => l.id], ['customer', 'Customer', (l) => l.customer], ['route', 'Route', (l) => l.route], ['pickup', 'Picked up', (l) => l.pickup],
      ['delivered', 'Delivered', (l) => l.delivered], ['pod', 'POD', (l) => l.pod], ['amount', 'Amount', (l) => money(l.amount)], ['ref', 'Reference', (l) => l.ref],
      ['commodity', 'Commodity', (l) => l.commodity], ['weight', 'Weight', (l) => l.weight], ['miles', 'Miles', (l) => l.miles], ['equipment', 'Equipment', (l) => l.equipment],
    ], (l) => ({ date: l.delivered, customer: l.customer, drivers: [loadById.get(l.id)?.driver ?? ''], trucks: units(loadById.get(l.id)?.unit ?? '') })),

    makeSet({ key: 'invoices', label: 'Invoices', group: 'Accounting', perm: 'accounting/invoiced', dateLabel: 'issue date' }, invoices, [
      ['id', 'Invoice', (i) => i.id], ['status', 'Status', (i) => statusOf(i)], ['customer', 'Customer', (i) => i.customer], ['loads', 'Loads', (i) => i.loads],
      ['ref', 'Reference', (i) => i.ref], ['issued', 'Issued', (i) => i.issued], ['terms', 'Terms', (i) => i.terms], ['due', 'Due', (i) => i.due],
      ['total', 'Total', (i) => money(invoiceTotal(i))], ['paidOn', 'Paid on', (i) => i.paid?.date],
      ['route', 'Route', (i) => i.route, false], ['bol', 'BOL', (i) => i.bol, false], ['pickup', 'Pickup', (i) => i.pickup, false], ['delivery', 'Delivery', (i) => i.delivery, false],
      ['equipment', 'Equipment', (i) => i.equipment, false], ['commodity', 'Commodity', (i) => i.commodity, false], ['weight', 'Weight', (i) => i.weight, false], ['miles', 'Miles', (i) => i.miles, false],
      ['billTo', 'Bill to', (i) => i.billTo.name, false], ['billEmail', 'Billing email', (i) => i.billTo.email, false], ['paidVia', 'Paid via', (i) => i.paid?.via, false], ['memo', 'Memo', (i) => i.memo, false],
    ], (i) => {
      const onLoads = loads.filter((l) => i.loads.includes(l.id));
      return { date: i.issued, customer: i.customer, drivers: onLoads.map((l) => l.driver), trucks: onLoads.flatMap((l) => units(l.unit)) };
    }),

    makeSet({ key: 'batches', label: 'Invoice batches', group: 'Accounting', perm: 'accounting/batches', dateLabel: 'created date' }, batches, [
      ['id', 'Batch', (b) => b.id], ['created', 'Created', (b) => b.created], ['recipient', 'Sent to', (b) => b.recipient], ['method', 'Method', (b) => b.method],
      ['invoices', 'Invoices', (b) => b.invoiceIds], ['status', 'Status', (b) => batchStatus(b, invoices)], ['total', 'Total', (b) => money(batchTotal(b, invoices))],
      ['sentOn', 'Sent on', (b) => b.sentOn], ['notes', 'Notes', (b) => b.notes],
    ], (b) => ({ date: b.created })),

    makeSet({ key: 'payroll', label: 'Payroll (pay run lines)', group: PAYROLL_GROUP, perm: PAYROLL_PERM, dateLabel: 'pay date' },
      payRuns.flatMap((r) => r.lines.map((l) => ({ r, l }))), [
      ['run', 'Run', (x) => x.r.id], ['payDate', 'Pay date', (x) => x.r.payDate], ['name', 'Employee', (x) => x.l.name], ['role', 'Role', (x) => x.l.role],
      ['basis', 'Paid', (x) => x.l.basis], ['units', 'Units', (x) => (x.l.basis === 'Salary' ? '' : x.l.units)], ['gross', 'Gross', (x) => money(x.l.gross)],
      ['additions', 'Additions', (x) => money(x.l.items.filter((i) => i.kind !== 'Deduction').reduce((a, i) => a + i.amount, 0))],
      ['deductions', 'Deductions', (x) => money(x.l.items.filter((i) => i.kind === 'Deduction').reduce((a, i) => a + i.amount, 0))],
      ['tax', 'Tax withheld (est.)', (x) => money(x.l.tax)], ['net', 'Net', (x) => money(x.l.net)], ['status', 'Status', (x) => (x.l.hold ? 'On hold' : x.r.status)],
      ['period', 'Period', (x) => `${x.r.start} to ${x.r.end}`, false], ['group', 'Pay group', (x) => x.r.frequency, false], ['loads', 'Loads', (x) => x.l.loads, false],
      ['items', 'Items', (x) => x.l.items.map((i) => `${i.label} ${i.kind === 'Deduction' ? '-' : '+'}${i.amount}`), false], ['runNet', 'Run total net', (x) => money(runTotals(x.r).net), false],
    ], (x) => ({ date: x.r.payDate, drivers: [x.l.name] })),

    makeSet({ key: 'employees', label: 'Employees', group: PAYROLL_GROUP, perm: PAYROLL_PERM, dateLabel: 'start date' }, employees, [
      ['name', 'Employee', (e) => e.name], ['role', 'Role', (e) => e.role], ['workerType', 'Type', (e) => e.workerType], ['pay', 'Pay', (e) => payLabel(e)],
      ['frequency', 'Schedule', (e) => e.frequency], ['method', 'Paid by', (e) => e.method], ['status', 'Status', (e) => e.status], ['hired', 'Started', (e) => e.hired],
      ['id', 'Employee ID', (e) => e.id, false], ['email', 'Email', (e) => e.email, false], ['phone', 'Phone', (e) => e.phone, false],
      ['address', 'Address', (e) => [e.street, e.city, e.state, e.zip].filter(Boolean).join(', '), false], ['withholding', 'Withholding %', (e) => e.withholdingPct, false],
      ['recurring', 'Every pay', (e) => e.recurring.map((i) => `${i.label} ${i.kind === 'Deduction' ? '-' : '+'}${i.amount}`), false],
      ['documents', 'Documents', (e) => e.documents.map((d) => d.name), false], ['notes', 'Notes', (e) => e.notes, false],
    ], (e) => ({ date: e.hired, drivers: [e.name], archived: e.status === 'Archived' })),

    makeSet({ key: 'bills', label: 'Bills', group: 'Accounting', perm: 'accounting/bills', dateLabel: 'due date' }, bills, [
      ['vendor', 'Vendor', (b) => b.vendor], ['billNumber', 'Vendor invoice #', (b) => b.billNumber], ['category', 'Category', (b) => b.category],
      ['description', 'What it is for', (b) => b.description], ['issued', 'Bill date', (b) => b.issued], ['due', 'Due', (b) => b.due],
      ['amount', 'Amount', (b) => money(b.amount)], ['status', 'Status', (b) => billStatus(b)], ['repeats', 'Repeats', (b) => b.frequency ?? 'One-time'],
      ['paidOn', 'Paid on', (b) => b.paid?.date],
      ['id', 'Bill', (b) => b.id, false], ['terms', 'Terms', (b) => b.terms, false], ['truck', 'Truck', (b) => b.truck, false], ['trailer', 'Trailer', (b) => b.trailer, false],
      ['driver', 'Driver', (b) => b.driver, false], ['load', 'Load', (b) => b.load, false], ['terminal', 'Terminal', (b) => b.terminal, false],
      ['method', 'Pay by', (b) => b.method, false], ['paidRef', 'Payment reference', (b) => b.paid?.reference, false], ['scheduledFor', 'Scheduled for', (b) => b.scheduledFor, false],
      ['vendorAccount', 'Account with vendor', (b) => b.vendorAccount, false], ['documents', 'Documents', (b) => b.documents.map((d) => d.name), false], ['notes', 'Notes', (b) => b.notes, false],
    ], (b) => ({ date: b.due, drivers: [b.driver], trucks: [b.truck, b.trailer].filter(Boolean) })),

    // Release 1.7: the managed contracts and onboarding.
    ...(isLive('hr-contracts') ? [makeSet({ key: 'contracts', label: 'Employee contracts', group: 'HR', perm: 'hr/employee-contracts', dateLabel: 'start date' }, contracts, [
      ['person', 'Person', (c) => c.person], ['agreement', 'Agreement', (c) => c.agreement], ['role', 'Role', (c) => c.role], ['start', 'Start', (c) => c.start],
      ['end', 'Ends / renews', (c) => currentEnd(c)], ['pay', 'Pay', (c) => contractPay(c)], ['status', 'Status', (c) => contractState(c)],
      ['id', 'Contract', (c) => c.id, false], ['employment', 'Employment', (c) => c.employment, false], ['renewal', 'At the end', (c) => c.renewal, false],
      ['noticeDays', 'Notice (days)', (c) => c.noticeDays, false], ['benefits', 'Benefits', (c) => c.benefits, false], ['truck', 'Truck', (c) => c.truck, false],
      ['leasePayment', 'Lease payment', (c) => c.leasePayment, false], ['escrow', 'Escrow', (c) => c.escrow, false], ['clauses', 'Clauses', (c) => c.clauses, false],
      ['personSigned', 'Signed by person', (c) => c.personSigned, false], ['companySigned', 'Signed by company', (c) => c.companySigned, false],
      ['endedOn', 'Ended on', (c) => c.endedOn, false], ['endReason', 'Why ended', (c) => c.endReason, false], ['documents', 'Documents', (c) => c.documents.map((d) => d.name), false],
    ], (c) => ({ date: c.start, drivers: [c.person], trucks: [c.truck].filter(Boolean) }))] : [makeSet({ key: 'contracts', label: 'Employee contracts', group: 'HR', perm: 'hr/employee-contracts', dateLabel: 'start date' }, CONTRACTS, [
      ['employee', 'Employee', (c) => c.employee], ['role', 'Role', (c) => c.role], ['type', 'Type', (c) => c.type], ['start', 'Start', (c) => c.start],
      ['renews', 'Renews', (c) => c.renews], ['payBasis', 'Pay basis', (c) => c.payBasis], ['status', 'Status', (c) => c.status],
    ], (c) => ({ date: toIso(c.start), drivers: [c.employee] }))]),

    ...(isLive('hr-onboarding') ? [makeSet({ key: 'onboarding', label: 'Onboarding', group: 'HR', perm: 'hr/onboarding', dateLabel: 'applied date' }, onboardings, [
      ['name', 'Candidate', (o) => o.name], ['role', 'Role', (o) => o.role], ['stage', 'Stage', (o) => stageOf(o)], ['applied', 'Applied', (o) => o.applied],
      ['targetStart', 'Start', (o) => o.targetStart], ['manager', 'Hiring manager', (o) => o.manager], ['progress', 'Required steps done', (o) => `${progressOf(o).done}/${progressOf(o).total}`],
      ['id', 'Onboarding', (o) => o.id, false], ['workerType', 'Worker type', (o) => o.workerType, false], ['source', 'Source', (o) => o.source, false],
      ['email', 'Email', (o) => o.email, false], ['phone', 'Phone', (o) => o.phone, false], ['payOffer', 'Pay offered', (o) => o.payOffer, false],
      ['cdl', 'CDL', (o) => [o.cdlClass, o.cdlState, o.cdlExpiry].filter(Boolean).join(' '), false], ['medicalExpiry', 'Medical certificate expires', (o) => o.medicalExpiry, false],
      ['open', 'Open steps', (o) => o.steps.filter((x) => !x.done).map((x) => x.label), false], ['closedReason', 'Why closed', (o) => o.closedReason, false],
      ['documents', 'Documents', (o) => o.documents.map((d) => d.name), false],
    ], (o) => ({ date: o.applied, drivers: [o.name] }))] : [makeSet({ key: 'onboarding', label: 'Onboarding', group: 'HR', perm: 'hr/onboarding', dateLabel: 'start date' }, ONBOARDING, [
      ['candidate', 'Candidate', (o) => o.candidate], ['role', 'Role', (o) => o.role], ['stage', 'Stage', (o) => o.stage], ['started', 'Started', (o) => o.started],
      ['owner', 'Owner', (o) => o.owner], ['progress', 'Progress', (o) => `${o.progress}%`], ['nextStep', 'Next step', (o) => o.nextStep], ['docsPending', 'Documents pending', (o) => o.docsPending],
    ], (o) => ({ date: toIso(o.started), drivers: [o.candidate] }))]),

    // Release 1.8: the managed safety records.
    ...(isLive('safety-maintenance') ? [makeSet({ key: 'maintenance', label: 'Maintenance work orders', group: 'Safety', perm: 'safety/maintenance', dateLabel: 'due date' }, workOrders, [
      ['id', 'Work order', (w) => w.id], ['unit', 'Unit', (w) => w.unit], ['type', 'Service', (w) => w.type], ['description', 'Work', (w) => w.description],
      ['due', 'Due', (w) => w.dueDate], ['shop', 'Shop', (w) => w.shop], ['cost', 'Cost', (w) => money(woCost(w))], ['status', 'Status', (w) => w.status],
      ['priority', 'Priority', (w) => w.priority, false], ['dueOdometer', 'Due at odometer', (w) => w.dueOdometer || '', false], ['driver', 'Driver', (w) => w.driver, false],
      ['completed', 'Done on', (w) => w.completed?.date, false], ['parts', 'Parts', (w) => w.completed?.parts, false], ['labor', 'Labor', (w) => w.completed?.labor, false],
      ['invoice', 'Shop invoice', (w) => w.completed?.invoice, false], ['bill', 'Bill', (w) => w.billId, false], ['documents', 'Documents', (w) => w.documents.map((d) => d.name), false],
    ], (w) => ({ date: w.completed?.date || w.dueDate, drivers: [w.driver].filter(Boolean), trucks: [w.unit] }))] : [makeSet({ key: 'maintenance', label: 'Maintenance', group: 'Safety', perm: 'safety/maintenance', dateLabel: 'due date' }, MAINTENANCE, [
      ['unit', 'Unit', (w) => w.unit], ['item', 'Work', (w) => w.item], ['due', 'Due', (w) => w.due], ['shop', 'Shop', (w) => w.shop],
      ['estimate', 'Estimate', (w) => money(w.estimate)], ['status', 'Status', (w) => w.status],
    ], (w) => ({ date: toIso(w.due), trucks: [w.unit] }))]),

    makeSet({ key: 'documents', label: 'Driver documents', group: 'Safety', perm: 'safety/driver-documents', dateLabel: 'expiry date' }, driverDocuments(drivers), [
      ['driver', 'Driver', (d) => d.driver], ['document', 'Document', (d) => d.document], ['date', 'Date', (d) => d.date], ['status', 'Status', (d) => d.status],
    ], (d) => ({ date: d.date, drivers: [d.driver] })),

    ...(isLive('safety-violations') ? [makeSet({ key: 'violations', label: 'Inspections & violations', group: 'Safety', perm: 'safety/violations', dateLabel: 'inspection date' }, violations, [
      ['date', 'Date', (v) => v.date], ['driver', 'Driver', (v) => v.driver], ['truck', 'Truck', (v) => v.truck], ['basic', 'BASIC', (v) => v.basic],
      ['code', 'Code', (v) => v.code], ['description', 'Violation', (v) => v.description], ['severity', 'Severity', (v) => v.severity || ''], ['oos', 'Out of service', (v) => v.oos],
      ['status', 'Status', (v) => v.status], ['id', 'Inspection', (v) => v.id, false], ['level', 'Level', (v) => v.level, false], ['report', 'Report #', (v) => v.reportNumber, false],
      ['state', 'State', (v) => v.state, false], ['location', 'Location', (v) => v.location, false], ['trailer', 'Trailer', (v) => v.trailer, false], ['fine', 'Fine', (v) => v.fine || '', false],
      ['dataQs', 'DataQs', (v) => v.dataQs, false], ['resolution', 'Outcome', (v) => v.resolution, false], ['coached', 'Coached', (v) => v.coached, false],
    ], (v) => ({ date: v.date, drivers: [v.driver], trucks: [v.truck, v.trailer].filter(Boolean) }))] : [makeSet({ key: 'violations', label: 'Violations', group: 'Safety', perm: 'safety/violations', dateLabel: 'violation date' }, VIOLATIONS, [
      ['date', 'Date', (v) => v.date], ['driver', 'Driver', (v) => v.driver], ['unit', 'Unit', (v) => v.unit], ['type', 'Violation', (v) => v.type],
      ['severityPoints', 'Severity points', (v) => v.severityPoints], ['location', 'Location', (v) => v.location], ['status', 'Status', (v) => v.status],
    ], (v) => ({ date: toIso(v.date), drivers: [v.driver], trucks: units(v.unit) }))]),

    ...(isLive('safety-claims') ? [makeSet({ key: 'claims', label: 'Claims', group: 'Safety', perm: 'safety/settlements', dateLabel: 'incident date' }, claims, [
      ['id', 'Claim', (c) => c.id], ['type', 'Type', (c) => c.type], ['incidentDate', 'Incident', (c) => c.incidentDate], ['driver', 'Driver', (c) => c.driver],
      ['claimant', 'Claimant', (c) => c.claimant], ['claimed', 'Claimed', (c) => money(c.amountClaimed)], ['reserve', 'Reserve', (c) => money(c.reserve)],
      ['paid', 'Paid', (c) => money(paidOf(c))], ['status', 'Status', (c) => c.status],
      ['received', 'Received', (c) => c.received, false], ['load', 'Load', (c) => c.load, false], ['truck', 'Truck', (c) => c.truck, false], ['trailer', 'Trailer', (c) => c.trailer, false],
      ['location', 'Location', (c) => c.location, false], ['recordable', 'DOT recordable', (c) => recordable(c), false], ['preventable', 'Preventable', (c) => c.preventable, false],
      ['insurerClaimNo', 'Insurer claim #', (c) => c.insurerClaimNo, false], ['netCost', 'Cost to company', (c) => money(netCost(c)), false], ['closedReason', 'Why closed', (c) => c.closedReason, false],
    ], (c) => ({ date: c.incidentDate, drivers: [c.driver], trucks: [c.truck, c.trailer].filter(Boolean), customer: c.claimant }))] : [makeSet({ key: 'claims', label: 'Claims', group: 'Safety', perm: 'safety/settlements', dateLabel: 'claim date' }, CLAIMS, [
      ['id', 'Claim', (c) => c.id], ['date', 'Date', (c) => c.date], ['driver', 'Driver', (c) => c.driver], ['unit', 'Units', (c) => c.unit], ['type', 'Type', (c) => c.type],
      ['claimant', 'Claimant', (c) => c.claimant], ['reserved', 'Reserved', (c) => money(c.reserved)], ['paid', 'Paid', (c) => money(c.paid)], ['status', 'Status', (c) => c.status],
    ], (c) => ({ date: toIso(c.date), drivers: [c.driver], trucks: units(c.unit) }))]),
  ];
}

export interface ExportFilters {
  from: string;
  to: string;
  drivers: string[];
  trucks: string[];
  customers: string[];
  contains: string;
  archived: boolean;
}

// The rows of a set that pass the filters. A filter only applies to sets
// whose rows carry that kind of information (a date range does not empty
// the Trucks list, for example).
export function filterRows(set: ExportSet, f: ExportFilters): ExportRow[] {
  const hasDates = Boolean(set.dateLabel);
  const hasDrivers = set.rows.some((r) => r.drivers.length);
  const hasTrucks = set.rows.some((r) => r.trucks.length);
  const hasCustomers = set.rows.some((r) => r.customer);
  const needle = f.contains.trim().toLowerCase();
  return set.rows.filter((r) => {
    if (!f.archived && r.archived) return false;
    if (hasDates && (f.from || f.to)) {
      if (!r.date || (f.from && r.date < f.from) || (f.to && r.date > f.to)) return false;
    }
    if (hasDrivers && f.drivers.length && !r.drivers.some((d) => f.drivers.includes(d))) return false;
    if (hasTrucks && f.trucks.length && !r.trucks.some((t) => f.trucks.includes(t))) return false;
    if (hasCustomers && f.customers.length && !f.customers.includes(r.customer)) return false;
    if (needle && !Object.values(r.values).some((v) => v.toLowerCase().includes(needle))) return false;
    return true;
  });
}
