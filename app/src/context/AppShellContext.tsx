import { createContext, useCallback, useContext, useDeferredValue, useEffect, useMemo, useState, type ReactNode } from 'react';
import { BATCH_SEED, INVOICE_SEED, invoiceSerial, type Batch, type InvoiceRecord } from '../data/invoicing';
import { BILL_SEED, reviveBills, type BillDocument, type BillRecord } from '../data/bills';
import { CONTRACT_SEED, ONBOARDING_SEED, reviveContracts, reviveOnboarding, type ContractRecord, type OnboardingRecord } from '../data/hrRecords';
import {
  CLAIM_SEED, REQUEST_SEED, VIOLATION_SEED, WORK_ORDER_SEED, reviveClaims, reviveDriverFiles, reviveRequests, reviveViolations, reviveWorkOrders,
  type ClaimRecord, type DocRequest, type DriverFile, type ViolationRecord, type WorkOrder,
} from '../data/safetyRecords';
import { EMPLOYEE_SEED, PAYRUN_SEED, reviveEmployees, reviveRuns, type Employee, type PayRun } from '../data/payroll';
import { AUTO_BY, AUTO_INACTIVE_DAYS, CUSTOMER_SEED, addDays, reviveCustomers, usageOf, type CustomerRecord } from '../data/customers';
import { readScoped } from '../lib/account';
import { todayIso } from '../lib/clock';
import { syncCustomers } from '../lib/customerSync';
import { reportError } from '../lib/errorLog';
import { pruneFiles } from '../lib/fileStore';
import { isLive } from '../lib/releases';
import { FACILITY_SEED, renameInLoad, sameName, type Facility } from '../data/facilities';
import { DRIVER_SEED, TRAILER_SEED, TRUCK_SEED, type FleetDriver, type FleetTrailer, type FleetTruck } from '../data/fleet';
import { loadFiles, normalizeLoad } from '../data/loads';
import { LOADS, type Load } from '../data/mock';
import { noteIds } from '../lib/ids';
import { bornAt, freeId } from '../lib/mergeLists';
import { hadLoadProblems, reviveList, usePersisted } from '../lib/persist';
import type { FilterMeta, FilterValue, FilterValues } from '../lib/tableTools';

export type LoadTab = 'Active' | 'Needs POD' | 'Delivered' | 'All';
export type DriverTab = 'All' | 'On duty' | 'Available';

interface AppShellState {
  // What the pages filter by. It follows `searchText` a moment behind when the
  // page is busy, so typing in the search box never waits for a long table.
  query: string;
  // What is typed in the search box, at once.
  searchText: string;
  setQuery: (q: string) => void;
  loadTab: LoadTab;
  setLoadTab: (t: LoadTab) => void;
  driverTab: DriverTab;
  setDriverTab: (t: DriverTab) => void;
  approved: boolean;
  approveAll: () => void;
  // Loads and the fleet are kept in this browser's storage (there is no back
  // end yet), so new, edited, archived and deleted records survive a reload.
  loads: Load[];
  // Returns the load's id (a new number if another tab has just used it).
  addLoad: (l: Load) => string;
  updateLoad: (l: Load) => void;
  deleteLoad: (id: string) => void;
  drivers: FleetDriver[];
  trucks: FleetTruck[];
  trailers: FleetTrailer[];
  saveDriver: (d: FleetDriver) => void;
  saveTruck: (t: FleetTruck) => void;
  saveTrailer: (t: FleetTrailer) => void;
  archiveDriver: (id: string, archived: boolean) => void;
  archiveTruck: (id: string, archived: boolean) => void;
  archiveTrailer: (id: string, archived: boolean) => void;
  deleteDriver: (id: string) => void;
  deleteTruck: (id: string) => void;
  deleteTrailer: (id: string) => void;
  facilities: Facility[];
  saveFacility: (f: Facility) => void;
  archiveFacility: (id: string, archived: boolean) => void;
  deleteFacility: (id: string) => void;
  invoices: InvoiceRecord[];
  saveInvoice: (inv: InvoiceRecord) => void;
  saveInvoices: (list: InvoiceRecord[]) => void;
  deleteInvoice: (id: string) => void;
  batches: Batch[];
  saveBatch: (b: Batch) => void;
  deleteBatch: (id: string) => void;
  bills: BillRecord[];
  saveBill: (b: BillRecord) => void;
  deleteBill: (id: string) => void;
  customers: CustomerRecord[];
  saveCustomer: (c: CustomerRecord) => void;
  deleteCustomer: (id: string) => void;
  employees: Employee[];
  saveEmployee: (e: Employee) => void;
  deleteEmployee: (id: string) => void;
  payRuns: PayRun[];
  savePayRun: (r: PayRun) => void;
  deletePayRun: (id: string) => void;
  contracts: ContractRecord[];
  saveContract: (c: ContractRecord) => void;
  deleteContract: (id: string) => void;
  onboardings: OnboardingRecord[];
  saveOnboarding: (o: OnboardingRecord) => void;
  deleteOnboarding: (id: string) => void;
  workOrders: WorkOrder[];
  saveWorkOrder: (w: WorkOrder) => void;
  deleteWorkOrder: (id: string) => void;
  violations: ViolationRecord[];
  saveViolation: (v: ViolationRecord) => void;
  deleteViolation: (id: string) => void;
  claims: ClaimRecord[];
  saveClaim: (c: ClaimRecord) => void;
  deleteClaim: (id: string) => void;
  docRequests: DocRequest[];
  saveDocRequest: (r: DocRequest) => void;
  driverFiles: DriverFile[];
  saveDriverFile: (f: DriverFile) => void;
  // Table filters, per page ('loads', 'fleet/drivers', …): what each page
  // offers (registered by the page) and what is chosen (kept while you move around).
  filterMeta: Record<string, FilterMeta[]>;
  registerFilters: (page: string, meta: FilterMeta[]) => void;
  filterValues: Record<string, FilterValues>;
  setFilter: (page: string, key: string, value: FilterValue | undefined) => void;
  clearFilters: (page: string) => void;
}

const AppShellContext = createContext<AppShellState | null>(null);

// Reading saved lists: each record is checked on its own (lib/persist.ts), so
// one damaged record is set aside instead of emptying the whole list, and
// fields added since a record was saved are filled in.
const text = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);

function reviveLoads(raw: unknown): Load[] | null {
  return reviveList<Load>('loads', raw, (l) => typeof l.id === 'string' && typeof l.route === 'string' && typeof l.carrier === 'string', (l) =>
    normalizeLoad({
      ...l,
      customer: text(l.customer), pickup: text(l.pickup), delivery: text(l.delivery), driver: text(l.driver, 'Unassigned'), unit: text(l.unit, '—'),
      rate: text(l.rate, '$0'), status: text(l.status, 'Dispatched'), tagClass: text(l.tagClass, 'tag-neutral'), miles: text(l.miles, '—'), rpm: text(l.rpm, '—'),
      pay: text(l.pay, '—'), margin: text(l.margin, '—'), commodity: text(l.commodity), weight: text(l.weight), equip: text(l.equip), temp: text(l.temp),
      ref: text(l.ref, '—'), from: text(l.from), fromAddr: text(l.fromAddr), to: text(l.to), toAddr: text(l.toAddr), carrierMc: text(l.carrierMc, '—'), carrierDot: text(l.carrierDot, '—'),
    }));
}

function reviveRecords<T>(list: string, raw: unknown): T[] | null {
  return reviveList<T>(list, raw, (r) => typeof r.id === 'string' && Boolean(r.details) && typeof r.details === 'object');
}

function reviveInvoices(raw: unknown): InvoiceRecord[] | null {
  return reviveList<InvoiceRecord>('invoices', raw, (r) => typeof r.id === 'string' && Array.isArray(r.lines) && Boolean(r.billTo) && typeof r.billTo === 'object', (i) => ({
    ...i,
    draft: Boolean(i.draft), customer: text(i.customer), loads: Array.isArray(i.loads) ? i.loads : [], history: Array.isArray(i.history) ? i.history : [],
    ref: text(i.ref), bol: text(i.bol), route: text(i.route), pickup: text(i.pickup), delivery: text(i.delivery), equipment: text(i.equipment), commodity: text(i.commodity),
    weight: text(i.weight), miles: text(i.miles), issued: text(i.issued), terms: text(i.terms, 'Net 30'), due: text(i.due), memo: text(i.memo), internal: text(i.internal),
  }));
}

function reviveBatches(raw: unknown): Batch[] | null {
  return reviveList<Batch>('batches', raw, (r) => typeof r.id === 'string' && Array.isArray(r.invoiceIds));
}

// A load's form entry with some of its fields changed (a renamed customer,
// driver or unit), when the load was made with the form.
function withForm(l: Load, change: (form: Record<string, unknown>) => Record<string, unknown>): Load {
  return l.form && typeof l.form === 'object' ? { ...l, form: change(l.form as Record<string, unknown>) } : l;
}

// 'T-114 / RF-88' with the truck or the trailer renumbered.
function renumber(unit: string, from: string, to: string): string {
  return unit.split(' / ').map((u) => (u === from ? to : u)).join(' / ');
}

// Save a record into its list: replace the one with its id, or add it.
//
// A record made at a different moment from the one already under its id is
// a different record (its form was opened before another tab took that
// number), so it is added under the next free number rather than replacing
// the other one.
function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const at = list.findIndex((x) => x.id === item.id);
  if (at < 0) return [...list, item];
  const was = bornAt(list[at]);
  const now = bornAt(item);
  if (was && now && was !== now) return [...list, { ...item, id: freeId(item.id, list.map((x) => x.id)) }];
  return list.map((x, i) => (i === at ? item : x));
}

// Photos and files sent in the messenger (release 1.42), kept by the file cleanup.
function messengerFiles(): BillDocument[] {
  try {
    const saved = JSON.parse(readScoped('runtruck-messenger') ?? 'null') as { messages?: { file?: BillDocument }[] } | null;
    return Array.isArray(saved?.messages) ? saved.messages.flatMap((m) => (m.file ? [m.file] : [])) : [];
  } catch {
    return [];
  }
}

export function AppShellProvider({ children }: { children: ReactNode }) {
  const [searchText, setQuery] = useState('');
  const query = useDeferredValue(searchText);
  const [loadTab, setLoadTab] = useState<LoadTab>('Active');
  const [driverTab, setDriverTab] = useState<DriverTab>('All');
  const [approved, setApproved] = useState(false);
  const [loads, setLoads] = usePersisted<Load[]>('runtruck-loads', LOADS, reviveLoads);
  const [drivers, setDrivers] = usePersisted<FleetDriver[]>('runtruck-drivers', DRIVER_SEED, (raw) => reviveRecords<FleetDriver>('drivers', raw));
  const [trucks, setTrucks] = usePersisted<FleetTruck[]>('runtruck-trucks', TRUCK_SEED, (raw) => reviveRecords<FleetTruck>('trucks', raw));
  const [trailers, setTrailers] = usePersisted<FleetTrailer[]>('runtruck-trailers', TRAILER_SEED, (raw) => reviveRecords<FleetTrailer>('trailers', raw));
  const [invoices, setInvoices] = usePersisted<InvoiceRecord[]>('runtruck-invoices', INVOICE_SEED, (raw) => reviveInvoices(raw));
  const [batches, setBatches] = usePersisted<Batch[]>('runtruck-batches', BATCH_SEED, (raw) => reviveBatches(raw));
  const [bills, setBills] = usePersisted<BillRecord[]>('runtruck-bills', BILL_SEED, reviveBills);
  const [customers, setCustomers] = usePersisted<CustomerRecord[]>('runtruck-customers', CUSTOMER_SEED, reviveCustomers);
  const [employees, setEmployees] = usePersisted<Employee[]>('runtruck-employees', EMPLOYEE_SEED, reviveEmployees);
  const [payRuns, setPayRuns] = usePersisted<PayRun[]>('runtruck-payruns', PAYRUN_SEED, reviveRuns);
  const [contracts, setContracts] = usePersisted<ContractRecord[]>('runtruck-contracts', CONTRACT_SEED, reviveContracts);
  const [onboardings, setOnboardings] = usePersisted<OnboardingRecord[]>('runtruck-onboarding', ONBOARDING_SEED, reviveOnboarding);
  const [workOrders, setWorkOrders] = usePersisted<WorkOrder[]>('runtruck-workorders', WORK_ORDER_SEED, reviveWorkOrders);
  const [violations, setViolations] = usePersisted<ViolationRecord[]>('runtruck-violations', VIOLATION_SEED, reviveViolations);
  const [claims, setClaims] = usePersisted<ClaimRecord[]>('runtruck-claims', CLAIM_SEED, reviveClaims);
  const [docRequests, setDocRequests] = usePersisted<DocRequest[]>('runtruck-docrequests', REQUEST_SEED, reviveRequests);
  const [driverFiles, setDriverFiles] = usePersisted<DriverFile[]>('runtruck-driverfiles', [], reviveDriverFiles);
  // The pickers and invoice billing details follow the CRM.
  useMemo(() => syncCustomers(customers), [customers]);
  const [filterMeta, setFilterMeta] = useState<Record<string, FilterMeta[]>>({});
  const [filterValues, setFilterValues] = useState<Record<string, FilterValues>>({});
  const registerFilters = useCallback((page: string, meta: FilterMeta[]) =>
    setFilterMeta((prev) => (JSON.stringify(prev[page]) === JSON.stringify(meta) ? prev : { ...prev, [page]: meta })), []);
  const setFilter = useCallback((page: string, key: string, value: FilterValue | undefined) =>
    setFilterValues((prev) => {
      const next = { ...(prev[page] ?? {}) };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return { ...prev, [page]: next };
    }), []);
  const clearFilters = useCallback((page: string) => setFilterValues((prev) => ({ ...prev, [page]: {} })), []);
  const [facilities, setFacilities] = usePersisted<Facility[]>('runtruck-facilities', FACILITY_SEED, (raw) => reviveRecords<Facility>('facilities', raw));

  // A driver's truck and a truck's driver describe the same assignment, so
  // saving either side updates the other (and frees whatever it replaced).
  const setTruckDriver = (unit: string, name: string, previousName?: string) =>
    setTrucks((list) =>
      list.map((t) => {
        const holdsDriver = t.driver === name || (previousName !== undefined && t.driver === previousName);
        if (t.unit === unit && unit) return { ...t, driver: name, details: { ...t.details, driver: name } };
        if (holdsDriver) return { ...t, driver: 'Unassigned', details: { ...t.details, driver: '' } };
        return t;
      }),
    );

  // Stored files that no record points to any more are removed once, as the
  // app opens (deleted records, cancelled forms). Not when some saved data
  // could not be read: the records pointing at the files may be among it.
  // Files added in the last day are always kept (lib/fileStore.ts), so a form
  // still open in another tab does not lose what was just attached.
  useEffect(() => {
    if (hadLoadProblems()) return;
    const keep = [...loads.flatMap(loadFiles), ...bills.flatMap((b) => b.documents), ...customers.flatMap((c) => c.documents), ...employees.flatMap((e) => e.documents), ...contracts.flatMap((c) => c.documents), ...onboardings.flatMap((o) => o.documents),
      ...workOrders.flatMap((w) => w.documents), ...violations.flatMap((v) => v.documents), ...claims.flatMap((c) => c.documents), ...driverFiles.flatMap((f) => f.files),
      ...messengerFiles()].filter((d) => d.stored).map((d) => d.id);
    pruneFiles(keep).catch((error: unknown) => reportError(error, { kind: 'storage', where: 'Cleaning up attached files' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Remember the highest number used by each kind of record, so a number is
  // never given to a second record after the first is deleted (lib/ids.ts).
  useEffect(() => noteIds('L', loads.map((x) => x.id)), [loads]);
  useEffect(() => noteIds('DRV', drivers.map((x) => x.id)), [drivers]);
  useEffect(() => noteIds('TRK', trucks.map((x) => x.id)), [trucks]);
  useEffect(() => noteIds('TRL', trailers.map((x) => x.id)), [trailers]);
  useEffect(() => noteIds('FAC', facilities.map((x) => x.id)), [facilities]);
  useEffect(() => noteIds('INV', invoices.map((x) => x.id), invoiceSerial), [invoices]);
  useEffect(() => noteIds('B', batches.map((x) => x.id)), [batches]);
  useEffect(() => noteIds('BILL', bills.map((x) => x.id)), [bills]);
  useEffect(() => noteIds('CUS', customers.map((x) => x.id)), [customers]);
  useEffect(() => noteIds('EMP', employees.map((x) => x.id)), [employees]);
  useEffect(() => noteIds('PR', payRuns.map((x) => x.id)), [payRuns]);
  useEffect(() => noteIds('CT', contracts.map((x) => x.id)), [contracts]);
  useEffect(() => noteIds('ON', onboardings.map((x) => x.id)), [onboardings]);
  useEffect(() => noteIds('WO', workOrders.map((x) => x.id)), [workOrders]);
  useEffect(() => noteIds('INS', violations.map((x) => x.id)), [violations]);
  useEffect(() => noteIds('CLM', claims.map((x) => x.id)), [claims]);
  useEffect(() => noteIds('DR', docRequests.map((x) => x.id)), [docRequests]);

  // Release 1.4: a customer with no loads or invoices for over a year moves to
  // inactive by itself, logged on the day it passed the year.
  useEffect(() => {
    if (!isLive('crm-customers')) return;
    const today = todayIso();
    setCustomers((list) => {
      let changed = false;
      const next = list.map((c) => {
        if (c.status !== 'Active') return c;
        const u = usageOf(c, loads, invoices, today.slice(0, 4));
        const due = addDays(u.lastUsed, AUTO_INACTIVE_DAYS);
        // No usable "last used" date: leave the customer alone.
        if (!due || due >= today) return c;
        changed = true;
        const last = new Date(`${u.lastUsed}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
        return {
          ...c, status: 'Inactive' as const,
          log: [...c.log, { at: `${due}T12:00:00.000Z`, by: AUTO_BY, action: 'Moved to inactive' as const, reason: `Not used for over a year (last activity: ${u.why}, ${last})` }],
        };
      });
      return changed ? next : list;
    });
    // Once, as the app opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: AppShellState = {
    query,
    searchText,
    setQuery,
    loadTab,
    setLoadTab,
    driverTab,
    setDriverTab,
    approved,
    approveAll: () => setApproved(true),
    loads,
    addLoad: (l) => {
      const id = loads.some((x) => x.id === l.id) ? freeId(l.id, loads.map((x) => x.id)) : l.id;
      setLoads((prev) => [{ ...l, id: prev.some((x) => x.id === id) ? freeId(id, prev.map((x) => x.id)) : id }, ...prev]);
      return id;
    },
    updateLoad: (l) => setLoads((prev) => prev.map((x) => (x.id === l.id ? l : x))),
    deleteLoad: (id) => setLoads((prev) => prev.filter((x) => x.id !== id)),
    drivers,
    trucks,
    trailers,
    saveDriver: (d) => {
      const prev = drivers.find((x) => x.id === d.id);
      const unit = d.unit === '—' ? '' : d.unit;
      // Taking a truck frees it from whichever driver had it.
      setDrivers((list) => upsert(list, d).map((x) => (x.id !== d.id && unit && x.unit === unit ? { ...x, unit: '—', details: { ...x.details, truck: '' } } : x)));
      if (!prev || prev.unit !== d.unit || prev.name !== d.name) setTruckDriver(unit, d.name, prev?.name);
      // A renamed driver keeps their loads, pay and safety records: everything
      // that names them is renamed with them. (Payroll counts a driver's
      // delivered loads by name.)
      if (prev && prev.name !== d.name && prev.name) {
        const was = prev.name;
        const now = d.name;
        setLoads((list) => list.map((l) => (l.driver === was ? withForm({ ...l, driver: now }, (f) => (f.driver === was ? { ...f, driver: now } : f)) : l)));
        setEmployees((list) => list.map((e) => (e.driver === was ? { ...e, driver: now } : e)));
        setWorkOrders((list) => list.map((w) => (w.driver === was ? { ...w, driver: now } : w)));
        setViolations((list) => list.map((v) => (v.driver === was ? { ...v, driver: now } : v)));
        setClaims((list) => list.map((c) => (c.driver === was ? { ...c, driver: now } : c)));
        setDocRequests((list) => list.map((r) => (r.driverId === d.id ? { ...r, driver: now } : r)));
        setBills((list) => list.map((b) => (b.driver === was ? { ...b, driver: now } : b)));
      }
    },
    saveTruck: (t) => {
      const prev = trucks.find((x) => x.id === t.id);
      const name = t.driver === 'Unassigned' ? '' : t.driver;
      // A driver drives one truck: assigning them here frees their old one.
      setTrucks((list) => upsert(list, t).map((x) => (x.id !== t.id && name && x.driver === name ? { ...x, driver: 'Unassigned', details: { ...x.details, driver: '' } } : x)));
      if (!prev || prev.driver !== t.driver || prev.unit !== t.unit) {
        setDrivers((list) =>
          list.map((d) => {
            if (name && d.name === name) return { ...d, unit: t.unit, details: { ...d.details, truck: t.unit } };
            if (d.unit === t.unit || (prev && d.unit === prev.unit)) return { ...d, unit: '—', details: { ...d.details, truck: '' } };
            return d;
          }),
        );
      }
      // A renumbered truck keeps its loads, work orders and other records.
      if (prev && prev.unit !== t.unit && prev.unit) {
        const was = prev.unit;
        const now = t.unit;
        setLoads((list) => list.map((l) => (l.unit.split(' / ').includes(was) ? withForm({ ...l, unit: renumber(l.unit, was, now) }, (f) => (f.truck === was ? { ...f, truck: now } : f)) : l)));
        setWorkOrders((list) => list.map((w) => (w.unit === was ? { ...w, unit: now } : w)));
        setViolations((list) => list.map((v) => (v.truck === was ? { ...v, truck: now } : v)));
        setClaims((list) => list.map((c) => (c.truck === was ? { ...c, truck: now } : c)));
        setContracts((list) => list.map((c) => (c.truck === was ? { ...c, truck: now } : c)));
        setBills((list) => list.map((b) => (b.truck === was ? { ...b, truck: now } : b)));
      }
    },
    saveTrailer: (t) => {
      const prev = trailers.find((x) => x.id === t.id);
      setTrailers((list) => upsert(list, t));
      // A renumbered trailer keeps its loads, work orders and other records.
      if (prev && prev.unit !== t.unit && prev.unit) {
        const was = prev.unit;
        const now = t.unit;
        setLoads((list) => list.map((l) => (l.unit.split(' / ').includes(was) ? withForm({ ...l, unit: renumber(l.unit, was, now) }, (f) => (f.trailer === was ? { ...f, trailer: now } : f)) : l)));
        setWorkOrders((list) => list.map((w) => (w.unit === was ? { ...w, unit: now } : w)));
        setViolations((list) => list.map((v) => (v.trailer === was ? { ...v, trailer: now } : v)));
        setClaims((list) => list.map((c) => (c.trailer === was ? { ...c, trailer: now } : c)));
        setBills((list) => list.map((b) => (b.trailer === was ? { ...b, trailer: now } : b)));
      }
    },
    // Archiving frees the other side of an assignment (an archived driver is
    // not driving anything); restoring does not reassign it.
    archiveDriver: (id, archived) => {
      const d = drivers.find((x) => x.id === id);
      setDrivers((list) => list.map((x) => (x.id === id ? { ...x, archived, ...(archived ? { unit: '—', details: { ...x.details, truck: '' } } : {}) } : x)));
      if (d && archived) setTrucks((list) => list.map((t) => (t.driver === d.name ? { ...t, driver: 'Unassigned', details: { ...t.details, driver: '' } } : t)));
    },
    archiveTruck: (id, archived) => {
      const t = trucks.find((x) => x.id === id);
      setTrucks((list) => list.map((x) => (x.id === id ? { ...x, archived, ...(archived ? { driver: 'Unassigned', details: { ...x.details, driver: '' } } : {}) } : x)));
      if (t && archived) setDrivers((list) => list.map((d) => (d.unit === t.unit ? { ...d, unit: '—', details: { ...d.details, truck: '' } } : d)));
    },
    archiveTrailer: (id, archived) => setTrailers((list) => list.map((t) => (t.id === id ? { ...t, archived } : t))),
    deleteDriver: (id) => {
      const gone = drivers.find((d) => d.id === id);
      setDrivers((list) => list.filter((d) => d.id !== id));
      // Their qualification files and open document requests go with them.
      setDriverFiles((list) => list.filter((f) => f.driverId !== id));
      setDocRequests((list) => list.filter((r) => r.driverId !== id));
      setOnboardings((list) => list.map((o) => (o.driverId === id ? { ...o, driverId: '' } : o)));
      if (gone) setTrucks((list) => list.map((t) => (t.driver === gone.name ? { ...t, driver: 'Unassigned', details: { ...t.details, driver: '' } } : t)));
    },
    deleteTruck: (id) => {
      const gone = trucks.find((t) => t.id === id);
      setTrucks((list) => list.filter((t) => t.id !== id));
      if (gone) setDrivers((list) => list.map((d) => (d.unit === gone.unit ? { ...d, unit: '—', details: { ...d.details, truck: '' } } : d)));
    },
    deleteTrailer: (id) => setTrailers((list) => list.filter((t) => t.id !== id)),
    facilities,
    // Loads name their stops, so renaming a facility renames it on its loads.
    saveFacility: (f) => {
      const prev = facilities.find((x) => x.id === f.id);
      setFacilities((list) => upsert(list, f));
      if (prev && !sameName(prev.name, f.name)) setLoads((list) => list.map((l) => renameInLoad(l, prev.name, f.name)));
    },
    archiveFacility: (id, archived) => setFacilities((list) => list.map((f) => (f.id === id ? { ...f, archived } : f))),
    deleteFacility: (id) => setFacilities((list) => list.filter((f) => f.id !== id)),
    invoices,
    saveInvoice: (inv) => setInvoices((list) => upsert(list, inv)),
    saveInvoices: (changed) => setInvoices((list) => changed.reduce((acc, inv) => upsert(acc, inv), list)),
    // A deleted invoice also leaves any batch it was in.
    deleteInvoice: (id) => {
      setInvoices((list) => list.filter((i) => i.id !== id));
      setBatches((list) => list.map((b) => (b.invoiceIds.includes(id) ? { ...b, invoiceIds: b.invoiceIds.filter((x) => x !== id) } : b)));
    },
    batches,
    saveBatch: (b) => setBatches((list) => upsert(list, b)),
    deleteBatch: (id) => setBatches((list) => list.filter((b) => b.id !== id)),
    bills,
    saveBill: (b) => setBills((list) => upsert(list, b)),
    deleteBill: (id) => {
      setBills((list) => list.filter((b) => b.id !== id));
      setWorkOrders((list) => list.map((w) => (w.billId === id ? { ...w, billId: '' } : w)));
    },
    customers,
    saveCustomer: (given) => {
      const prev = customers.find((x) => x.id === given.id);
      const renamed = Boolean(prev && prev.name !== given.name);
      // "Bill to" that simply repeated the old name follows the new one.
      const c = renamed && prev && given.billTo === prev.name ? { ...given, billTo: given.name } : given;
      setCustomers((list) => upsert(list, c));
      // A renamed customer keeps its loads, invoices, batches and facilities.
      if (renamed && prev) {
        const was = prev.name;
        const now = c.name;
        setLoads((list) => list.map((l) => {
          const form = l.form as { customer?: unknown; billTo?: unknown } | undefined;
          if (l.customer !== was && form?.customer !== was && form?.billTo !== was) return l;
          return withForm({ ...l, customer: l.customer === was ? now : l.customer }, (f) => ({ ...f, customer: f.customer === was ? now : f.customer, billTo: f.billTo === was ? now : f.billTo }));
        }));
        setInvoices((list) => list.map((i) => (i.customer === was ? { ...i, customer: now } : i)));
        setBatches((list) => list.map((b) => (b.recipient === was ? { ...b, recipient: now } : b)));
        setFacilities((list) => list.map((f) => (f.customer === was ? { ...f, customer: now, details: { ...f.details, customer: now } } : f)));
        setClaims((list) => list.map((x) => (x.claimant === was ? { ...x, claimant: now } : x)));
      }
    },
    deleteCustomer: (id) => setCustomers((list) => list.filter((c) => c.id !== id)),
    employees,
    saveEmployee: (e) => setEmployees((list) => upsert(list, e)),
    // Deleting clears what pointed at the record, so a link never dangles.
    deleteEmployee: (id) => {
      setEmployees((list) => list.filter((e) => e.id !== id));
      setOnboardings((list) => list.map((o) => (o.employeeId === id ? { ...o, employeeId: '' } : o)));
      setContracts((list) => list.map((c) => (c.employeeId === id ? { ...c, employeeId: '' } : c)));
    },
    payRuns,
    savePayRun: (r) => setPayRuns((list) => upsert(list, r)),
    deletePayRun: (id) => setPayRuns((list) => list.filter((r) => r.id !== id)),
    contracts,
    saveContract: (c) => setContracts((list) => upsert(list, c)),
    deleteContract: (id) => {
      setContracts((list) => list.filter((c) => c.id !== id));
      setOnboardings((list) => list.map((o) => (o.contractId === id ? { ...o, contractId: '' } : o)));
    },
    onboardings,
    saveOnboarding: (o) => setOnboardings((list) => upsert(list, o)),
    deleteOnboarding: (id) => setOnboardings((list) => list.filter((o) => o.id !== id)),
    workOrders,
    saveWorkOrder: (w) => setWorkOrders((list) => upsert(list, w)),
    deleteWorkOrder: (id) => {
      setWorkOrders((list) => list.filter((w) => w.id !== id));
      setViolations((list) => list.map((v) => (v.workOrderId === id ? { ...v, workOrderId: '' } : v)));
    },
    violations,
    saveViolation: (v) => setViolations((list) => upsert(list, v)),
    deleteViolation: (id) => setViolations((list) => list.filter((v) => v.id !== id)),
    claims,
    saveClaim: (c) => setClaims((list) => upsert(list, c)),
    deleteClaim: (id) => setClaims((list) => list.filter((c) => c.id !== id)),
    docRequests,
    saveDocRequest: (r) => setDocRequests((list) => upsert(list, r)),
    driverFiles,
    saveDriverFile: (f) => setDriverFiles((list) => upsert(list, f)),
    filterMeta,
    registerFilters,
    filterValues,
    setFilter,
    clearFilters,
  };

  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
}

export function useAppShell() {
  const ctx = useContext(AppShellContext);
  if (!ctx) throw new Error('useAppShell must be used within AppShellProvider');
  return ctx;
}
