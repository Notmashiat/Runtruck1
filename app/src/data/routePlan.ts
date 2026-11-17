// The route planner (release 1.41): each truck as a row across the days, with
// its loads as bars from pickup to delivery, open service orders, and the
// time a truck stands empty with no load booked. Pure functions — the page
// is components/RoutePlanner.tsx.
import type { FleetTrailer, FleetTruck } from './fleet';
import { LOAD_TAG } from './loads';
import type { Load } from './mock';
import { regionOf, roadMiles, type Region } from './geo';
import { cityState, loadEvents, windowOf } from './planner';
import type { WorkOrder } from './safetyRecords';

export type BarKind = 'done' | 'moving' | 'booked' | 'shop' | 'empty';

export interface PlanBar {
  id: string;
  kind: BarKind;
  // Milliseconds since 1970 (local time), like Date.getTime().
  start: number;
  end: number;
  lane: number;
  load?: Load;
  order?: WorkOrder;
  // For an empty spell: where the truck is, and whether a load is booked after it.
  place?: string;
  reload?: boolean;
  // For a load: its pickup and delivery windows, and whether the plan misses one.
  windows?: LoadWindows;
  late?: Late | null;
}

export type RowState = 'moving' | 'booked' | 'empty' | 'shop' | 'idle';

// Deadhead between two loads: the empty miles from one delivery to the next
// pickup, drawn between their bars.
export interface PlanDeadhead { id: string; at: number; lane: number; miles: number }

export interface PlanRow {
  truck: FleetTruck;
  driver: string;
  equipment: string;
  location: string;
  state: RowState;
  bars: PlanBar[];
  lanes: number;
  deadheads: PlanDeadhead[];
  // Empty now, or empty by the end of tomorrow with nothing booked after.
  alert: boolean;
  // The empty spell that needs a load (for Connect load).
  needs?: PlanBar;
  region: Region | null;
}

const HOUR = 3_600_000;
const DONE = ['Delivered', 'Needs POD', 'Invoiced', 'Paid', 'Complete'];
const MOVING = ['In transit', 'At pickup', 'Delayed'];
const SKIP = ['Cancelled', 'Draft'];
const OPEN_ORDER = ['Scheduled', 'In shop', 'Waiting on parts'];
// A truck counts as empty when nothing is booked within this long after its last load.
const EMPTY_AFTER = 12 * HOUR;

export const at = (iso: string, hhmm = '00:00') => new Date(`${iso}T${hhmm}:00`).getTime();

export function loadKind(l: Load): BarKind | null {
  if (SKIP.includes(l.status)) return null;
  if (DONE.includes(l.status)) return 'done';
  if (MOVING.includes(l.status)) return 'moving';
  return 'booked';
}

// When a load starts (first pickup window) and ends (last delivery window).
export function loadSpan(l: Load): { start: number; end: number } | null {
  // Stops with their own date: that date and the window written after it.
  const dated = (l.stops ?? []).filter((st) => st.date && /^\d{4}-\d{2}-\d{2}$/.test(st.date));
  if (dated.length && dated.length === (l.stops ?? []).length) {
    const times = dated.map((st) => {
      const [startT, endT] = windowOf(st.when.split(' · ')[1] ?? '');
      return { start: at(st.date as string, startT), end: at(st.date as string, endT) };
    });
    const start = Math.min(...times.map((t) => t.start));
    const end = Math.max(...times.map((t) => t.end));
    if (end > start) return { start, end };
  }
  const events = loadEvents([l]);
  if (!events.length) return null;
  const starts = events.map((e) => at(e.date, e.start ?? '08:00'));
  const ends = events.map((e) => at(e.endDate ?? e.date, e.end ?? '17:00'));
  const start = Math.min(...starts);
  const end = Math.max(...ends);
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? { start, end } : null;
}

// — appointment windows and the planned run (release 1.41) —
//
// A stop's window can be wide (pickup 8 AM–4 PM) while the drop before it is
// at 11 AM. Bars are drawn from when the truck can really be there — the drop
// before, the deadhead drive and an hour at each dock — not from the start of
// the window, so a truck's loads follow one another on one line. A load whose
// window the truck cannot make is marked late.

export interface LoadWindows { pickup: [number, number]; delivery: [number, number] }
export interface Late { stop: 'pickup' | 'delivery'; by: number }
export interface Planned { start: number; end: number; windows: LoadWindows; late: Late | null }

// The first pickup's window and the last delivery's window.
export function loadWindows(l: Load): LoadWindows | null {
  const stops = l.stops ?? [];
  const dated = stops.length > 0 && stops.every((st) => st.date && /^\d{4}-\d{2}-\d{2}$/.test(st.date));
  const list = dated
    ? stops.map((st) => {
      const [a, b] = windowOf(st.when.split(' · ')[1] ?? '');
      return { pickup: st.kind === 'Pickup', s: at(st.date as string, a), e: at(st.date as string, b) };
    })
    : loadEvents([l]).map((e) => ({ pickup: e.category === 'pickup', s: at(e.date, e.start ?? '08:00'), e: at(e.endDate ?? e.date, e.end ?? '17:00') }));
  const pickups = list.filter((x) => x.pickup && Number.isFinite(x.s)).sort((a, b) => a.s - b.s);
  const drops = list.filter((x) => !x.pickup && Number.isFinite(x.s)).sort((a, b) => a.s - b.s);
  if (!pickups.length || !drops.length) return null;
  const p = pickups[0];
  const d = drops[drops.length - 1];
  return { pickup: [p.s, Math.max(p.e, p.s)], delivery: [d.s, Math.max(d.e, d.s)] };
}

// Driving at about 50 mph, with a 10-hour rest after every 11 hours behind the wheel.
const MPH = 50;
const DOCK = HOUR;
export function driveTime(miles: number): number {
  const h = miles / MPH;
  return (h + Math.floor(h / 11) * 10) * HOUR;
}

// When the truck reaches the pickup and the drop, if it is free at `ready`
// in `place` (no `place`: it is already there).
export function planTrip(l: Load, w: LoadWindows, ready = -Infinity, place?: string): Planned {
  const deadhead = place ? roadMiles(place, origin(l)) ?? 0 : 0;
  const arrive = Math.max(w.pickup[0], ready + driveTime(deadhead));
  const trip = driveTime(milesOf(l) || roadMiles(origin(l), destination(l)) || 0);
  const drop = Math.max(w.delivery[0], arrive + DOCK + trip);
  const late: Late | null = arrive > w.pickup[1] + 15 * 60_000 ? { stop: 'pickup', by: arrive - w.pickup[1] }
    : drop > w.delivery[1] + 15 * 60_000 ? { stop: 'delivery', by: drop - w.delivery[1] } : null;
  return { start: arrive, end: Math.max(drop + DOCK, arrive + DOCK), windows: w, late };
}

// A truck's loads one after another, in pickup order. Loads already
// delivered are never marked late.
export function planLoads(list: Load[]): Map<string, Planned> {
  const out = new Map<string, Planned>();
  const ordered = list.map((l) => ({ l, w: loadWindows(l) })).filter((x): x is { l: Load; w: LoadWindows } => x.w !== null).sort((a, b) => a.w.pickup[0] - b.w.pickup[0]);
  let ready = -Infinity;
  let place: string | undefined;
  for (const { l, w } of ordered) {
    const p = planTrip(l, w, ready, place);
    out.set(l.id, loadKind(l) === 'done' ? { ...p, late: null } : p);
    ready = p.end;
    place = destination(l);
  }
  return out;
}

// The planned run of every load on `unit`.
export function planFor(unit: string, loads: Load[]): Map<string, Planned> {
  return planLoads(loads.filter((l) => truckOf(l) === unit && loadKind(l) !== null));
}

// A load's truck and trailer are kept together ('T-114 / RF-88').
export const truckOf = (l: Load) => l.unit.split('/')[0].trim();
const trailerOf = (l: Load) => (l.unit.split('/')[1] ?? '').trim();

export const destination = (l: Load) => l.route.split(' → ')[1] || cityState(l.toAddr) || l.to;
export const origin = (l: Load) => l.route.split(' → ')[0] || cityState(l.fromAddr) || l.from;
const num = (s: string) => Number(String(s).replace(/[^\d.]/g, '')) || 0;
export const rateOf = (l: Load) => num(l.rate);
export const milesOf = (l: Load) => num(l.miles);
// Not given to a truck yet.
export const unassigned = (l: Load) => !truckOf(l) || truckOf(l) === '—';
// The end of the day after the one `now` falls in.
export function endOfTomorrow(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 2);
  return d.getTime();
}

// Bars that overlap go on lanes one under the other.
function placeLanes(bars: PlanBar[]): number {
  const laneEnds: number[] = [];
  for (const b of [...bars].sort((x, y) => x.start - y.start)) {
    let lane = laneEnds.findIndex((e) => e <= b.start);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = b.end;
    b.lane = lane;
  }
  return Math.max(1, laneEnds.length);
}

export function planRows(opts: {
  trucks: FleetTruck[]; trailers: FleetTrailer[]; loads: Load[]; orders: WorkOrder[];
  from: number; to: number; now: number;
}): PlanRow[] {
  const { trucks, trailers, loads, orders, from, to, now } = opts;
  return trucks.filter((t) => !t.archived).map((truck) => {
    // Each load where the truck will really be: one after another.
    const plan = planFor(truck.unit, loads);
    const own = loads
      .filter((l) => truckOf(l) === truck.unit && plan.has(l.id))
      .map((l) => ({ l, kind: loadKind(l) as BarKind, span: plan.get(l.id) as Planned }))
      .sort((a, b) => a.span.start - b.span.start);

    const bars: PlanBar[] = own
      .filter((x) => x.span.end > from && x.span.start < to)
      .map((x) => ({ id: `load:${x.l.id}`, kind: x.kind, start: x.span.start, end: x.span.end, lane: 0, load: x.l, windows: x.span.windows, late: x.span.late }));

    for (const w of orders.filter((o) => o.unit === truck.unit && OPEN_ORDER.includes(o.status) && /^\d{4}-\d{2}-\d{2}$/.test(o.dueDate))) {
      // Booked: that day, 7 AM to 5 PM. In the shop now (no return date
      // kept): from the day it went in until a day from now.
      const scheduled = w.status === 'Scheduled';
      const start = scheduled ? at(w.dueDate, '07:00') : Math.min(at(w.dueDate, '07:00'), now - 2 * HOUR);
      const end = scheduled ? at(w.dueDate, '17:00') : Math.max(at(w.dueDate, '17:00'), now + 24 * HOUR);
      if (end > from && start < to) bars.push({ id: `wo:${w.id}`, kind: 'shop', start, end, lane: 0, order: w });
    }

    // Where the truck is: on its load now, at the end of its last one, or at its terminal.
    const current = own.find((x) => x.span.start <= now && x.span.end >= now);
    const last = [...own].reverse().find((x) => x.span.end <= now);
    const terminal = String(truck.details.terminal ?? '').split(' — ')[0];
    const location = current ? `${origin(current.l)} → ${destination(current.l)}` : last ? destination(last.l) : terminal || '—';

    // Empty from the end of its last load until the next one, from now on.
    const inShop = truck.status === 'In shop' || truck.status === 'Out of service' || bars.some((b) => b.kind === 'shop' && b.start <= now && b.end >= now);
    if (!inShop) {
      const future = own.filter((x) => x.span.end > now - EMPTY_AFTER);
      const startsAfter = (t: number) => future.find((x) => x.span.start >= t - HOUR);
      let cursor = current ? current.span.end : last ? Math.max(last.span.end, now) : now;
      for (let guard = 0; guard < 20 && cursor < to; guard++) {
        const next = startsAfter(cursor);
        const gapEnd = next ? next.span.start : to;
        if (gapEnd - cursor >= EMPTY_AFTER && gapEnd > from) {
          const place = [...own].reverse().find((x) => x.span.end <= cursor + HOUR);
          bars.push({ id: `empty:${truck.unit}:${cursor}`, kind: 'empty', start: Math.max(cursor, from), end: gapEnd, lane: 0, place: place ? destination(place.l) : location, reload: Boolean(next) });
        }
        if (!next) break;
        cursor = next.span.end;
      }
    }

    const lanes = placeLanes(bars);
    // Empty miles from each load's delivery to the next load's pickup, shown
    // just before that pickup (even when the load before is off screen).
    const deadheads: PlanDeadhead[] = [];
    for (let i = 1; i < own.length; i++) {
      const a = own[i - 1];
      const b = own[i];
      if (b.span.start <= from || b.span.start >= to) continue;
      const miles = roadMiles(destination(a.l), origin(b.l));
      if (miles === null) continue;
      const lane = bars.find((x) => x.load?.id === b.l.id)?.lane ?? 0;
      deadheads.push({ id: `dh:${a.l.id}:${b.l.id}`, at: b.span.start, lane, miles });
    }
    // Its trailer: the one connected to it, or the one on its latest load.
    const latest = current ?? last ?? own[own.length - 1];
    const trailer = trailers.find((t) => t.unit === String(truck.details.trailer ?? '')) ?? (latest ? trailers.find((t) => t.unit === trailerOf(latest.l)) : undefined);
    const nowBar = bars.find((b) => b.start <= now && b.end >= now);
    // Empty today or tomorrow with no load booked after it (a reload booked
    // later, even days later, means it has one).
    const needs = bars.find((b) => b.kind === 'empty' && !b.reload && b.start < endOfTomorrow(now) && b.end > now);
    const alert = !inShop && Boolean(needs);
    const state: RowState = inShop ? 'shop' : nowBar?.kind === 'moving' ? 'moving'
      : alert ? 'empty'
      : bars.some((b) => b.kind === 'booked' && b.end > now) ? 'booked' : 'idle';
    return {
      truck, driver: truck.driver && truck.driver !== 'Unassigned' ? truck.driver : 'No driver', equipment: trailer?.kind ?? 'No trailer',
      location, state, bars, lanes, deadheads, alert, needs: alert ? needs : undefined,
      region: regionOf(current ? destination(current.l) : last ? destination(last.l) : terminal),
    };
  });
}

export interface PlanFigures { moving: number; active: number; needLoad: number; inShop: number; booked: number }

// The four figures over the planner, for the days on screen.
export function planFigures(rows: PlanRow[], loads: Load[], from: number, to: number): PlanFigures {
  const rate = (l: Load) => Number(String(l.rate).replace(/[^\d.]/g, '')) || 0;
  const booked = loads.filter((l) => {
    if (loadKind(l) === null || !truckOf(l) || truckOf(l) === '—') return false;
    const s = loadSpan(l);
    return s !== null && s.start >= from && s.start < to;
  }).reduce((sum, l) => sum + rate(l), 0);
  return {
    moving: rows.filter((r) => r.state === 'moving').length,
    active: rows.filter((r) => r.state !== 'shop').length,
    needLoad: rows.filter((r) => r.state === 'empty').length,
    inShop: rows.filter((r) => r.state === 'shop').length,
    booked,
  };
}

// Monday of the week a day falls in (ISO date).
export function weekStart(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

// — Connect load —

export interface Reload { load: Load; deadhead: number; start: number }

// Booked loads with no truck yet, whose pickup the truck can make in time,
// within `radius` road miles of
// `place` (where the truck will be empty), nearest first, that fit before
// `until` (the truck's next booked pickup). Loads already picked
// up or more than two weeks out are left out.
export function reloadsNear(place: string, loads: Load[], radius: number, from: number, until = Infinity): Reload[] {
  const out: Reload[] = [];
  for (const l of loads) {
    if (!unassigned(l) || loadKind(l) !== 'booked' || l.status === 'Dispatched') continue;
    const w = loadWindows(l);
    if (!w || w.pickup[0] > from + 14 * 24 * HOUR) continue;
    const deadhead = roadMiles(place, origin(l));
    if (deadhead === null || deadhead > radius) continue;
    // The truck must reach the pickup in its window, and deliver before its
    // next booked load picks up.
    const run = planTrip(l, w, from, place);
    if (run.late?.stop === 'pickup' || run.end > until) continue;
    out.push({ load: l, deadhead, start: run.start });
  }
  return out.sort((a, b) => a.deadhead - b.deadhead || a.start - b.start);
}

// — Single truck —

export interface TruckWeek {
  loads: Load[];
  count: number;
  loadedMiles: number;
  deadheadMiles: number;
  totalMiles: number;
  gross: number;
  // Gross over loaded miles (0 when no miles are known).
  rpm: number;
}

// A truck's loads picking up between `from` and `to`, and their totals. The
// deadhead to each load runs from the delivery of the load before it.
export function truckWeek(unit: string, loads: Load[], from: number, to: number): TruckWeek {
  const own = loads
    .filter((l) => truckOf(l) === unit && loadKind(l) !== null)
    .map((l) => ({ l, span: loadSpan(l) }))
    .filter((x): x is { l: Load; span: { start: number; end: number } } => x.span !== null)
    .sort((a, b) => a.span.start - b.span.start);
  const inWeek = own.filter((x) => x.span.start >= from && x.span.start < to);
  let deadheadMiles = 0;
  for (const x of inWeek) {
    const before = [...own].reverse().find((y) => y.span.start < x.span.start);
    if (!before) continue;
    deadheadMiles += roadMiles(destination(before.l), origin(x.l)) ?? 0;
  }
  const loadedMiles = inWeek.reduce((sum, x) => sum + milesOf(x.l), 0);
  const gross = inWeek.reduce((sum, x) => sum + rateOf(x.l), 0);
  return {
    loads: inWeek.map((x) => x.l), count: inWeek.length, loadedMiles, deadheadMiles, totalMiles: loadedMiles + deadheadMiles,
    gross, rpm: loadedMiles ? gross / loadedMiles : 0,
  };
}

// — giving a load to a truck (Connect load, and dragging a load to another
// truck's row) —

// The trailer a truck pulls: the one connected to it, or else the one on its
// most recent load.
export function truckTrailer(truck: FleetTruck, loads: Load[]): string {
  const connected = String(truck.details.trailer ?? '');
  if (connected) return connected;
  const own = loads.filter((x) => truckOf(x) === truck.unit && trailerOf(x)).map((x) => ({ x, s: loadSpan(x)?.start ?? 0 })).sort((a, b) => b.s - a.s);
  return own.length ? trailerOf(own[0].x) : '';
}

// Loads that may still change truck: booked, not yet picked up.
export const movable = (l: Load) => loadKind(l) === 'booked';

// The load with `truck` (and its driver) on it. The truck's connected trailer
// goes with it (or the one on its latest load); with none, the load keeps
// the trailer it had. A load that was
// dispatched goes back to Booked: the new driver has not been dispatched yet.
export function assignLoad(l: Load, truck: FleetTruck, loads: Load[] = []): Load {
  const trailer = truckTrailer(truck, loads) || trailerOf(l);
  const driver = truck.driver && truck.driver !== 'Unassigned' ? truck.driver : '';
  const status = !driver ? 'Needs driver' : l.status === 'Needs driver' || l.status === 'Dispatched' ? 'Booked' : l.status;
  return { ...l, unit: trailer ? `${truck.unit} / ${trailer}` : truck.unit, driver: driver || 'Unassigned', status, tagClass: LOAD_TAG[status] ?? l.tagClass };
}

// Loads already on `unit` whose times overlap `l`.
export function clashes(l: Load, unit: string, loads: Load[]): Load[] {
  const s = loadSpan(l);
  if (!s) return [];
  return loads.filter((x) => x.id !== l.id && truckOf(x) === unit && loadKind(x) !== null).filter((x) => {
    const t = loadSpan(x);
    return t !== null && t.start < s.end && t.end > s.start;
  });
}
