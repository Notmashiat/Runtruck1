import { money } from '../data/accounting';
import type { BillDocument } from '../data/bills';
import { facilityFor, type Facility } from '../data/facilities';
import { DOCUMENT_SLOTS, LOAD_TAG, normalizeLoad } from '../data/loads';
import { CARRIERS, stopsOf, USER, type Load } from '../data/mock';
import { isoFromText, shortDate } from '../lib/clock';
import { nextSerial } from '../lib/ids';
import { isLive } from '../lib/releases';
import { getSettings, numSetting } from '../lib/settingsStore';

// What the load form edits (a Draft) and how it becomes a Load. Shared by the
// New Load popup's two layouts (components/NewLoadDialog.tsx and, from release
// 1.18, components/LoadFormDialog.tsx).

export type Mode = 'FTL' | 'LTL' | 'Partial';
export const MODES: Mode[] = ['FTL', 'LTL', 'Partial'];
export const EQUIPMENT = ['Dry van, 53 ft', 'Reefer, 53 ft', 'Flatbed, 48 ft', 'Flatbed, tarped', 'Step deck, 48 ft', 'Power only', 'Box truck, 26 ft'];
export const PACKAGING = ['Pallets', 'Skids', 'Crates', 'Boxes', 'Drums', 'Totes', 'Loose'];
export const FREIGHT_CLASSES = ['50', '55', '60', '65', '70', '77.5', '85', '92.5', '100', '110', '125', '150', '175', '200', '250', '300', '400', '500'];
export const LTL_SERVICES = ['Liftgate at pickup', 'Liftgate at delivery', 'Residential delivery', 'Inside delivery', 'Delivery appointment', 'Limited access'];
export const TERMS = ['Net 15', 'Net 30', 'Net 45', 'Net 60', 'Quick pay'];
export const DOCUMENTS = DOCUMENT_SLOTS;

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
};

export const num = (s: string) => Number(s) || 0;
export const positive = (s: string) => Number(s) > 0;

export function signedMoney(n: number) {
  return n < 0 ? `-${money(-n)}` : money(n);
}

// Statuses a load is still "planned" in; editing its coverage there recomputes
// the status (a driver or carrier → Dispatched, none → Needs driver). Once it is
// moving, an edit keeps the status it has. From release 1.12 a covered load is
// 'Booked' until someone moves it to Dispatched (the driver has set off).
const PLANNED = ['Needs driver', 'Dispatched'];
const PLANNED_BOOKING = ['Needs driver', 'Booked'];
export const coveredStatus = () => (isLive('load-pipeline-moves') ? 'Booked' : 'Dispatched');

export function toLoad(d: Draft, id: string, prev?: Load): Load {
  const place = (s: StopDraft) => `${s.city.trim()}, ${s.state.trim().toUpperCase()}`;
  const street = (s: StopDraft) => `${s.address.trim()}, ${place(s)}`;
  const first = d.stops.find((s) => s.kind === 'Pickup') ?? d.stops[0];
  const last = [...d.stops].reverse().find((s) => s.kind === 'Delivery') ?? d.stops[d.stops.length - 1];
  const lineHaul = num(d.lineHaul);
  const miles = num(d.miles);
  const total = lineHaul + num(d.fuel) + num(d.accessorials);
  const cost = d.brokered ? num(d.carrierRate) : num(d.driverPay);
  // A partner carrier from the list, or one typed in (with its MC / DOT numbers).
  const carrier = d.brokered
    ? CARRIERS.slice(1).find((c) => c.name === d.carrier.trim()) ?? { name: d.carrier.trim(), mc: d.carrierMc.trim() || '—', dot: d.carrierDot.trim() || '—' }
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
    charges: { lineHaul, fuel: num(d.fuel), accessorials: num(d.accessorials) },
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
    equip: d.equipment || '—',
    temp: d.tempTo
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
    ltl: d.mode === 'LTL'
      ? [`Class ${d.freightClass}`, `${d.handlingUnits} ${d.packaging.toLowerCase()}`, ...d.services].join(' · ')
      : undefined,
    stops: d.stops.map((s) => ({
      kind: s.kind,
      name: s.facility.trim(),
      address: `${street(s)} ${s.zip.trim()}`.trim(),
      when: `${shortDate(s.date)} · ${windowText(s)}`,
      date: s.date,
    })),
    documents: DOCUMENTS.map((name) => {
      const file = d.docs[name] ?? '';
      const doc = d.files[name];
      // The stored file goes with the slot only while it is the file named there.
      return { name, file, ...(file && doc && doc.name === file ? { doc } : {}) };
    }),
    carrierRate: d.brokered ? money(num(d.carrierRate)) : undefined,
    notes: d.instructions.trim() || undefined,
    history: [...(prev?.history ?? []), { at: now, by: USER.name, what: prev ? 'Load edited' : 'Load created' }],
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

// Fuel surcharge on a line haul: the percentage in Settings › Invoicing.
export function fuelFor(lineHaul: number) {
  const pct = numSetting(getSettings().invoicing.fscPct, 0);
  return Math.round(lineHaul * pct) / 100;
}

// Road miles for the stops in order, estimated from the registered facilities'
// map positions (straight-line distance × 1.2 for the roads). Undefined when a
// stop is not a registered facility with a position.
const ROAD_FACTOR = 1.2;
export function estimateMiles(stops: StopDraft[], facilities: Facility[]): number | undefined {
  const points = stops.map((s) => {
    const f = facilityFor(facilities, s.facility);
    const lat = Number(f?.details.lat);
    const lng = Number(f?.details.lng);
    return f && f.details.lat !== '' && f.details.lng !== '' && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined;
  });
  if (points.length < 2 || points.some((p) => !p)) return undefined;
  let miles = 0;
  for (let i = 1; i < points.length; i++) miles += crowMiles(points[i - 1] as LatLng, points[i] as LatLng);
  return Math.round(miles * ROAD_FACTOR);
}

interface LatLng { lat: number; lng: number }
function crowMiles(a: LatLng, b: LatLng) {
  const rad = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(h));
}

export function isDraft(x: unknown): x is Draft {
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
