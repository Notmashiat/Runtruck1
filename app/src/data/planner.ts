// Today's date, and each load's pickups and deliveries as timed stops (used by
// the route planner, data/routePlan.ts). Release 1.41: the calendar planner
// and its own events were replaced by the route planner.
import { isoFromText, todayIso } from '../lib/clock';
import type { Load } from './mock';

// Today, in the time zone chosen in Settings (lib/clock.ts). Everything that
// asks "what day is it" — planner, dashboard, accounting, safety — uses this.
export const TODAY = todayIso();

// A load's stop as a timed entry.
export interface PlannerEvent {
  id: string;
  title: string;
  category: string;
  date: string;
  // All-day events have no start/end; they may span to endDate.
  endDate?: string;
  start?: string;
  end?: string;
  // "City, ST" — what the event cards lead with by default.
  place?: string;
  notes?: string;
  people?: string[];
  loadId?: string;
  facility?: string;
  customer?: string;
  driver?: string;
  truck?: string;
  commodity?: string;
  // Derived from a load: shown, but edited on the load itself.
  readOnly?: boolean;
}

// '1855 E Greg St, Sparks, NV 89431' → 'Sparks, NV'.
export function cityState(address: string): string {
  const parts = address.replace(/\s+\d{5}(-\d{4})?$/, '').split(',').map((p) => p.trim()).filter(Boolean);
  return parts.slice(-2).join(', ');
}

const CLOCK = /^(\d{1,2}):(\d{2})$/;
const clock = (s: string) => {
  const m = CLOCK.exec(s.trim());
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
};

// A stop's appointment window ('08:00–10:00') as a start and an end on the
// calendar. A window with one time only ('14:30', or '14:30–') is shown as an
// hour from that time, not at 8 AM. A window that runs past midnight
// ('22:00–02:00') is shown to the end of its day. No time at all: 8 to 9 AM.
export function windowOf(window: string): [string, string] {
  const [a = '', b = ''] = window.split('–');
  const start = clock(a) || '08:00';
  const hourLater = `${String(Math.min(23, Number(start.slice(0, 2)) + 1)).padStart(2, '0')}:${Number(start.slice(0, 2)) >= 23 ? '59' : start.slice(3)}`;
  let end = clock(b) || hourLater;
  if (end <= start) end = '23:59';
  return [start, end];
}

// One pickup and one delivery per load (every stop for loads entered with New Load).
export function loadEvents(loads: Load[]): PlannerEvent[] {
  return loads.flatMap((l) => {
    const shared = {
      loadId: l.id, customer: l.customer, driver: l.driver, truck: l.unit === '—' ? '' : l.unit, commodity: l.commodity,
      people: [l.driver], readOnly: true,
    };
    if (l.stops) {
      return l.stops.flatMap((s, i): PlannerEvent[] => {
        const [day, window = ''] = s.when.split(' · ');
        const date = isoFromText(day);
        if (!date) return [];
        const [start, end] = windowOf(window);
        const place = cityState(s.address);
        return [{
          ...shared, id: `load:${l.id}:${i}`, title: `${l.id} · ${place}`, category: s.kind === 'Pickup' ? 'pickup' : 'delivery',
          date, start, end, place, facility: s.name, notes: `${s.name} · ${l.customer}`,
        }];
      });
    }
    // The mock loads only carry dates; spread their appointments over the
    // working day (stable per load number) instead of stacking them at 8 AM.
    const n = Number(l.id.slice(2)) || 0;
    const pHour = 6 + (n % 7) * 1.5;
    const dHour = 7 + ((n * 3) % 8) * 1.5;
    const hhmm = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${h % 1 ? '30' : '00'}`;
    const out: PlannerEvent[] = [];
    const p = isoFromText(l.pickup);
    const d = isoFromText(l.delivery);
    const [fromPlace = '', toPlace = ''] = l.route.split(' → ');
    if (p) out.push({ ...shared, id: `load:${l.id}:p`, title: `${l.id} · ${fromPlace}`, category: 'pickup', date: p, start: hhmm(pHour), end: hhmm(pHour + 2), place: fromPlace, facility: l.from, notes: `${l.from} · ${l.customer}` });
    if (d) out.push({ ...shared, id: `load:${l.id}:d`, title: `${l.id} · ${toPlace}`, category: 'delivery', date: d, start: hhmm(dHour), end: hhmm(dHour + 2), place: toPlace, facility: l.to, notes: `${l.to} · ${l.customer}` });
    return out;
  });
}
