import { money } from '../data/accounting';
import type { BillDocument } from '../data/bills';
import { DOCUMENT_SLOTS, LOAD_TAG, normalizeLoad } from '../data/loads';
import { CARRIERS, stopsOf, USER, type Load } from '../data/mock';
import { isoFromText, shortDate } from '../lib/clock';
import { nextSerial } from '../lib/ids';
import { isLive } from '../lib/releases';

// What the load form edits (a Draft) and how it becomes a Load, for the New
// Load / Edit load popup (components/NewLoadDialog.tsx). Fields added for
// later layouts are optional on older saved entries; INITIAL fills them in.

export type Mode = 'FTL' | 'LTL' | 'Partial';
const DOCUMENTS = DOCUMENT_SLOTS;

export interface StopDraft {
  kind: 'Pickup' | 'Delivery';
  facility: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  date: string;
  from: string;
  to: string;
  number: string;
  contact: string;
  // From release 1.18 (the one-page form; older drafts do not have them):
  // the day the window closes when it is not the day it opens, the "City, ST"
  // text as typed, the actual arrival and departure (date and time), and two
  // PO numbers.
  toDate?: string;
  place?: string;
  actualFrom?: string;
  actualTo?: string;
  po1?: string;
  po2?: string;
  // From release 1.21: first come, first served (from–to) or an appointment
  // time, and the stop's own phone and notes. `number` is its Pickup # / P.O. #.
  sched?: 'fcfs' | 'appt';
  appt?: string;
  phone?: string;
  notes?: string;
}

// An accessorial charge on the rate (Detention, Lumper, …), release 1.21.
export interface ChargeLine {
  type: string;
  amount: string;
}

// A document added on the load, with the category it is filed under, release 1.21.
export interface DocLine {
  category: string;
  doc: BillDocument;
}

export interface Draft {
  customer: string;
  billTo: string;
  ref: string;
  po: string;
  mode: Mode;
  equipment: string;
  dispatcher: string;
  stops: StopDraft[];
  commodity: string;
  weight: string;
  pieces: string;
  packaging: string;
  value: string;
  temp: string;
  // The top of the temperature range (temp is the bottom), release 1.18.
  tempTo: string;
  hazmat: boolean;
  unNumber: string;
  // Every UN number, release 1.18 (unNumber keeps them as one line for the older form).
  unNumbers: string[];
  freightClass: string;
  nmfc: string;
  handlingUnits: string;
  length: string;
  width: string;
  height: string;
  stackable: boolean;
  services: string[];
  brokered: boolean;
  carrier: string;
  carrierMc: string;
  carrierDot: string;
  carrierContact: string;
  carrierPhone: string;
  carrierRate: string;
  driver: string;
  truck: string;
  trailer: string;
  lineHaul: string;
  fuel: string;
  accessorials: string;
  miles: string;
  driverPay: string;
  terms: string;
  // Document name → file name, and the stored file when it was attached
  // through the attach popup (so it can be opened from the load later).
  docs: Record<string, string>;
  files: Record<string, BillDocument>;
  instructions: string;
  internal: string;
  // Release 1.21 (the redesigned popup).
  customerId: string;
  contactName: string;
  contactEmail: string;
  tempOn: boolean;
  reeferMode: string;
  hzClass: string;
  hzPhone: string;
  palletExchange: boolean;
  trailerLength: string;
  team: boolean;
  charges: ChargeLine[];
  // The LTL load a partial rides with (its load ID).
  ltlLoad: string;
  directions: string;
  docList: DocLine[];
}

export function emptyStop(kind: StopDraft['kind']): StopDraft {
  return { kind, facility: '', address: '', city: '', state: '', zip: '', date: '', from: '', to: '', number: '', contact: '' };
}

export const INITIAL: Draft = {
  customer: '', billTo: '', ref: '', po: '', mode: 'FTL', equipment: '', dispatcher: USER.name,
  stops: [emptyStop('Pickup'), emptyStop('Delivery')],
  commodity: '', weight: '', pieces: '', packaging: 'Pallets', value: '', temp: '', tempTo: '', hazmat: false, unNumber: '', unNumbers: [],
  freightClass: '', nmfc: '', handlingUnits: '', length: '', width: '', height: '', stackable: false, services: [],
  brokered: false, carrier: '', carrierMc: '', carrierDot: '', carrierContact: '', carrierPhone: '', carrierRate: '',
  driver: '', truck: '', trailer: '',
  lineHaul: '', fuel: '', accessorials: '', miles: '', driverPay: '', terms: 'Net 30',
  docs: {}, files: {}, instructions: '', internal: '',
  customerId: '', contactName: '', contactEmail: '', tempOn: false, reeferMode: 'Continuous', hzClass: '', hzPhone: '',
  palletExchange: false, trailerLength: '53 ft', team: false, charges: [], ltlLoad: '', directions: '', docList: [],
};

export const num = (s: string) => Number(s) || 0;

function signedMoney(n: number) {
  return n < 0 ? `-${money(-n)}` : money(n);
}

// Statuses a load is still "planned" in; editing its coverage there recomputes
// the status (a driver or carrier → Dispatched, none → Needs driver). Once it is
// moving, an edit keeps the status it has. From release 1.12 a covered load is
// 'Booked' until someone moves it to Dispatched (the driver has set off).
const PLANNED = ['Needs driver', 'Dispatched'];
const PLANNED_BOOKING = ['Needs driver', 'Booked'];
const coveredStatus = () => (isLive('load-pipeline-moves') ? 'Booked' : 'Dispatched');

// What each document category files under on the load: the usual slots where
// there is one, otherwise its own line (numbered when there are several).
const SLOT_OF: Record<string, string> = {
  'Rate confirmation': 'Rate confirmation', BOL: 'Bill of lading', POD: 'Proof of delivery', 'Lumper receipt': 'Lumper receipt',
};
function documentsOf(d: Draft) {
  const out: { name: string; file: string; doc?: BillDocument }[] = DOCUMENTS.map((name) => {
    const file = d.docs[name] ?? '';
    const doc = d.files[name];
    // The stored file goes with the slot only while it is the file named there.
    return { name, file, ...(file && doc && doc.name === file ? { doc } : {}) };
  });
  for (const line of d.docList ?? []) {
    const category = line.category.trim() || 'Other';
    const slot = SLOT_OF[category] ?? category;
    const free = out.find((x) => x.name === slot && !x.file);
    if (free) Object.assign(free, { file: line.doc.name, doc: line.doc });
    else {
      let name = slot;
      for (let n = 2; out.some((x) => x.name === name); n++) name = `${slot} (${n})`;
      out.push({ name, file: line.doc.name, doc: line.doc });
    }
  }
  return out;
}

// The accessorial charges: the lines typed, or the single total older entries kept.
export const chargesTotal = (d: Draft) =>
  d.charges?.length ? d.charges.reduce((sum, c) => sum + num(c.amount.replace(/,/g, '')), 0) : num(d.accessorials);

// `events` are extra history lines (e.g. the load was texted to the driver).
export function toLoad(d: Draft, id: string, prev?: Load, events: string[] = []): Load {
  const place = (s: StopDraft) => `${s.city.trim()}, ${s.state.trim().toUpperCase()}`;
  const street = (s: StopDraft) => `${s.address.trim()}, ${place(s)}`;
  const first = d.stops.find((s) => s.kind === 'Pickup') ?? d.stops[0];
  const last = [...d.stops].reverse().find((s) => s.kind === 'Delivery') ?? d.stops[d.stops.length - 1];
  const lineHaul = num(d.lineHaul);
  const miles = num(d.miles);
  const accessorials = chargesTotal(d);
  const total = lineHaul + num(d.fuel) + accessorials;
  const cost = d.brokered ? num(d.carrierRate) : num(d.driverPay);
  // A partner carrier from the list, or one typed in (with its MC / DOT numbers).
  const carrier = d.brokered
    ? CARRIERS.slice(1).find((c) => c.name === d.carrier.trim()) ?? { name: d.carrier.trim(), mc: d.carrierMc.trim() ? (/^MC/i.test(d.carrierMc.trim()) ? d.carrierMc.trim() : `MC ${d.carrierMc.trim()}`) : '—', dot: d.carrierDot.trim() || '—' }
    : CARRIERS[0];
  const covered = d.brokered || Boolean(d.driver);
  const kept = prev && !(isLive('load-pipeline-moves') ? PLANNED_BOOKING : PLANNED).includes(prev.status) ? prev : undefined;
  const reefer = d.equipment.startsWith('Reefer');
  const status = kept ? kept.status : covered ? coveredStatus() : 'Needs driver';
  const now = new Date().toISOString();

  // normalizeLoad writes the short date text from the real dates.
  return normalizeLoad({
    id,
    customer: d.customer,
    route: `${place(first)} → ${place(last)}`,
    pickup: shortDate(first.date),
    delivery: shortDate(last.date),
    pickupDate: first.date,
    deliveryDate: last.date,
    deliveredOn: prev?.deliveredOn,
    charges: { lineHaul, fuel: num(d.fuel), accessorials },
    driver: d.driver.trim() || 'Unassigned',
    unit: [d.truck.trim(), d.trailer.trim()].filter(Boolean).join(' / ') || '—',
    rate: money(lineHaul),
    status,
    tagClass: kept ? kept.tagClass : LOAD_TAG[status],
    miles: miles > 0 ? miles.toLocaleString('en-US') : '—',
    rpm: miles > 0 ? `$${(lineHaul / miles).toFixed(2)}` : '—',
    pay: cost > 0 ? money(cost) : '—',
    margin: cost > 0 ? signedMoney(total - cost) : '—',
    commodity: d.commodity.trim(),
    weight: `${num(d.weight).toLocaleString('en-US')} lb`,
    // From 1.21 the type and trailer length are chosen apart ('Reefer' + '53 ft').
    equip: d.equipment ? (d.trailerLength && !/\bft\b/.test(d.equipment) ? `${d.equipment}, ${d.trailerLength}` : d.equipment) : '—',
    temp: d.tempOn
      ? `${d.temp} °F${d.reeferMode ? ` · ${d.reeferMode.toLowerCase()}` : ''}`
      : d.tempTo
        ? `${[d.temp, d.tempTo].filter(Boolean).join('–')} °F`
        : reefer ? (d.temp ? `${d.temp} °F` : 'Set at pickup') : d.temp ? `${d.temp} °F` : 'Ambient',
    ref: d.ref.trim() || d.po.trim() || first.po1?.trim() || '—',
    from: first.facility.trim(),
    fromAddr: street(first),
    to: last.facility.trim(),
    toAddr: street(last),
    carrier: carrier.name,
    carrierMc: carrier.mc,
    carrierDot: carrier.dot,
    mode: d.mode === 'FTL' ? 'Full truckload' : d.mode === 'LTL' ? 'Less than truckload' : 'Partial',
    ltl: d.mode === 'Partial' && d.ltlLoad
      ? `Rides with LTL load ${d.ltlLoad}`
      : d.mode === 'LTL'
        ? (d.freightClass ? [`Class ${d.freightClass}`, `${d.handlingUnits} ${d.packaging.toLowerCase()}`, ...d.services].join(' · ') : 'Picks up first, delivers last')
        : undefined,
    stops: d.stops.map((s) => ({
      kind: s.kind,
      name: s.facility.trim(),
      address: `${street(s)} ${s.zip.trim()}`.trim(),
      when: `${shortDate(s.date)} · ${s.sched === 'appt' ? `Appt ${s.appt || 'time not set'}` : windowText(s)}`,
      date: s.date,
    })),
    documents: documentsOf(d),
    carrierRate: d.brokered && num(d.carrierRate) > 0 ? money(num(d.carrierRate)) : undefined,
    notes: [d.instructions.trim(), d.directions?.trim() ? `Directions: ${d.directions.trim()}` : ''].filter(Boolean).join('\n\n') || undefined,
    history: [
      ...(prev?.history ?? []),
      { at: now, by: USER.name, what: prev ? 'Load edited' : 'Load created' },
      ...events.map((what) => ({ at: now, by: USER.name, what })),
    ],
    createdAt: prev?.createdAt,
    updatedAt: prev?.updatedAt,
    form: d,
  });
}

// A stop's window after its date: '08:00–12:00', or with the day it closes
// when that is a later day ('10:00 – Aug 23 16:00').
function windowText(s: StopDraft) {
  if (s.toDate && s.toDate !== s.date && s.to) return `${s.from || 'Any time'} – ${shortDate(s.toDate)} ${s.to}`;
  return s.from && s.to ? `${s.from}–${s.to}` : s.from || s.to || 'Any time';
}

function isDraft(x: unknown): x is Draft {
  return Boolean(x) && typeof x === 'object' && Array.isArray((x as Draft).stops) && typeof (x as Draft).customer === 'string';
}

// The form entry for an existing load: what was typed, if it was made or edited
// with this form; otherwise rebuilt from the load's fields (the demo loads).
export function draftFromLoad(l: Load): Draft {
  if (isDraft(l.form)) return { ...INITIAL, ...l.form };
  const digits = (s: string) => s.replace(/[^0-9.-]/g, '');
  const stops: StopDraft[] = stopsOf(l).map((s) => {
    // 'addr, City, ST 93725' and 'Sep 8 · 08:00–12:00'
    const parts = s.address.split(',').map((p) => p.trim());
    const [state = '', zip = ''] = (parts.pop() ?? '').split(/\s+/);
    const city = parts.pop() ?? '';
    const [day, window = ''] = s.when.split(' · ');
    const [from = '', to = ''] = window.includes('–') ? window.split('–') : [];
    return {
      ...emptyStop(s.kind), facility: s.name, address: parts.join(', '), city, state, zip,
      date: isoFromText(day), from, to,
    };
  });
  const [truck = '', trailer = ''] = l.unit === '—' ? [] : l.unit.split(' / ');
  const partner = CARRIERS.slice(1).find((c) => c.name === l.carrier);
  return {
    ...INITIAL,
    customer: l.customer,
    ref: l.ref === '—' ? '' : l.ref,
    mode: l.mode === 'Less than truckload' ? 'LTL' : l.mode === 'Partial' ? 'Partial' : 'FTL',
    equipment: l.equip,
    stops,
    commodity: l.commodity,
    weight: digits(l.weight),
    temp: digits(l.temp),
    brokered: Boolean(partner),
    carrier: partner?.name ?? '',
    carrierMc: partner?.mc ?? '',
    carrierDot: partner?.dot ?? '',
    carrierRate: partner ? digits(l.carrierRate ?? l.pay) : '',
    driver: l.driver === 'Unassigned' ? '' : l.driver,
    truck,
    trailer,
    lineHaul: digits(l.rate),
    miles: digits(l.miles),
    driverPay: partner ? '' : digits(l.pay),
    docs: Object.fromEntries((l.documents ?? []).filter((x) => x.file).map((x) => [x.name, x.file])),
    files: Object.fromEntries((l.documents ?? []).flatMap((x) => (x.file && x.doc ? [[x.name, x.doc]] : []))),
    instructions: l.notes ?? '',
  };
}

// The next load number: one more than the highest ever used, so a deleted
// load's number is never given to a different load (lib/ids.ts).
export function nextId(loads: Load[]) {
  return `L-${nextSerial('L', loads.map((l) => l.id))}`;
}
