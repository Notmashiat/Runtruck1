// The top bar's search (release 1.48): as you type, the loads, trucks,
// trailers, drivers, customers and brokers, and facilities that match —
// by load #, tender #, truck or trailer number, driver, broker or customer,
// city or MC number. Picking one opens it.
import type { CustomerRecord } from '../data/customers';
import type { Facility } from '../data/facilities';
import type { FleetDriver, FleetTrailer, FleetTruck } from '../data/fleet';
import type { Load } from '../data/mock';

export type HitKind = 'load' | 'truck' | 'trailer' | 'driver' | 'customer' | 'facility';

export interface Hit {
  key: string;
  kind: HitKind;
  title: string;
  sub: string;
  // Where it opens, and the page search to apply there ('' for none).
  to: string;
  filter: string;
  score: number;
}

export const HIT_LABEL: Record<HitKind, string> = {
  load: 'Loads', truck: 'Trucks', trailer: 'Trailers', driver: 'Drivers', customer: 'Customers & brokers', facility: 'Facilities',
};

const norm = (s: string) => s.toLowerCase().replace(/[\s#-]+/g, '');

// How well `fields` match `q`: 3 the first field starts with it, 2 any field
// starts with it, 1 any field contains it, 0 not at all. Numbers match with or
// without dashes and spaces ('40218' finds 'L-40218').
export function scoreOf(q: string, fields: string[]): number {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return 0;
  const hay = fields.map((f) => f.toLowerCase());
  const flat = fields.map(norm);
  if (!words.every((w) => hay.some((h) => h.includes(w)) || flat.some((h) => h.includes(norm(w))))) return 0;
  const first = words[0];
  if (hay[0]?.startsWith(first) || flat[0]?.startsWith(norm(first)) || flat[0]?.endsWith(norm(first))) return 3;
  if (hay.some((h) => h.startsWith(first) || h.split(/[\s,·→/]+/).some((part) => part.startsWith(first)))) return 2;
  return 1;
}

export interface SearchData {
  loads: Load[];
  trucks: FleetTruck[];
  trailers: FleetTrailer[];
  drivers: FleetDriver[];
  customers: CustomerRecord[];
  facilities: Facility[];
}

// The best matches, up to `limit`, best first (loads first among equals).
export function searchAll(q: string, d: SearchData, limit = 8): Hit[] {
  const query = q.trim();
  if (!query) return [];
  const out: Hit[] = [];
  const add = (h: Omit<Hit, 'score'>, fields: string[], bonus = 0) => {
    const score = scoreOf(query, fields);
    if (score) out.push({ ...h, score: score * 10 + bonus });
  };
  for (const l of d.loads) {
    add({ key: `load:${l.id}`, kind: 'load', title: `${l.id} · ${l.route}`, sub: [l.customer, l.unit !== '—' ? l.unit : 'no truck', l.driver !== 'Unassigned' ? l.driver : '', l.status].filter(Boolean).join(' · '), to: `/app/loads/${l.id}`, filter: '' },
      [l.id, l.ref, l.customer, l.route, l.unit, l.driver, l.from, l.to, l.carrier], 5);
  }
  for (const t of d.trucks.filter((x) => !x.archived)) {
    add({ key: `truck:${t.id}`, kind: 'truck', title: `Truck ${t.unit}`, sub: [t.make, t.driver !== 'Unassigned' ? t.driver : 'no driver', t.plate].filter(Boolean).join(' · '), to: '/app/fleet/trucks', filter: t.unit },
      [t.unit, t.driver, t.make, t.plate], 4);
  }
  for (const t of d.trailers.filter((x) => !x.archived)) {
    add({ key: `trailer:${t.id}`, kind: 'trailer', title: `Trailer ${t.unit}`, sub: [t.kind, t.where].filter(Boolean).join(' · '), to: '/app/fleet/trailers', filter: t.unit }, [t.unit, t.kind, t.where], 3);
  }
  for (const dr of d.drivers.filter((x) => !x.archived)) {
    add({ key: `driver:${dr.id}`, kind: 'driver', title: dr.name, sub: ['Driver', dr.unit && dr.unit !== '—' ? dr.unit : '', dr.status].filter(Boolean).join(' · '), to: '/app/fleet/drivers', filter: dr.name }, [dr.name, dr.unit, String(dr.details.phone ?? '')], 3);
  }
  for (const c of d.customers) {
    add({ key: `customer:${c.id}`, kind: 'customer', title: c.name, sub: [c.type, c.mc ? `MC ${c.mc}` : '', c.status].filter(Boolean).join(' · '), to: c.status === 'Inactive' ? '/app/crm?view=inactive' : '/app/crm', filter: c.name },
      [c.name, c.mc, c.type, c.contact ?? ''], 2);
  }
  for (const f of d.facilities.filter((x) => !x.archived)) {
    add({ key: `facility:${f.id}`, kind: 'facility', title: f.name, sub: [f.type, f.city && f.state ? `${f.city}, ${f.state}` : f.city].filter(Boolean).join(' · '), to: `/app/facilities?open=${encodeURIComponent(f.id)}`, filter: '' },
      [f.name, f.city ?? '', f.state ?? ''], 1);
  }
  return out.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, limit);
}

// Typing '/' anywhere outside a field opens the search.
export function isSearchShortcut(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>, target: EventTarget | null): boolean {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return false;
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return true;
  return !el.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]');
}
