// A year of sample history for the demo company only (release 1.31), so the
// Dashboard's year-to-date, one-year and one-month insights have something to
// show. It is generated the same way every time (a seeded random sequence,
// dated back from today), is kept apart from the real records, and never
// appears in Loads, Accounting or any client company.
import type { BillRecord } from './bills';
import { TODAY } from './planner';
import type { Cost, Delivery } from './insights';
import { IS_DEMO } from '../lib/account';
import { addDaysIso } from '../lib/isoDates';

// Lanes the demo company runs: miles and a usual rate per mile.
const LANES: { lane: string; miles: number; rpm: number }[] = [
  { lane: 'Fresno, CA → Reno, NV', miles: 478, rpm: 3.35 },
  { lane: 'Stockton, CA → Salt Lake City, UT', miles: 736, rpm: 2.95 },
  { lane: 'Sacramento, CA → Boise, ID', miles: 645, rpm: 3.05 },
  { lane: 'Oakland, CA → Portland, OR', miles: 640, rpm: 3.2 },
  { lane: 'Bakersfield, CA → Phoenix, AZ', miles: 470, rpm: 3.1 },
  { lane: 'Los Angeles, CA → Las Vegas, NV', miles: 270, rpm: 3.9 },
  { lane: 'Modesto, CA → Denver, CO', miles: 1180, rpm: 2.7 },
  { lane: 'Redding, CA → Seattle, WA', miles: 610, rpm: 3.0 },
  { lane: 'San Jose, CA → Tucson, AZ', miles: 860, rpm: 2.75 },
  { lane: 'Visalia, CA → Albuquerque, NM', miles: 900, rpm: 2.6 },
];

// Customers, how often they ship, and how often their loads run late.
const CUSTOMERS: { name: string; weight: number; lateRate: number }[] = [
  { name: 'Northgate Foods', weight: 30, lateRate: 0.04 },
  { name: 'Bayline Distribution', weight: 24, lateRate: 0.06 },
  { name: 'Cascade Building Supply', weight: 14, lateRate: 0.09 },
  { name: 'Harbor Point Retail', weight: 10, lateRate: 0.11 },
  { name: 'Sierra Ag Partners', weight: 12, lateRate: 0.18 },
  { name: 'Vantage Home Goods', weight: 10, lateRate: 0.07 },
];

// Two years and a little more, so a year can be compared with the one before.
const DAYS = 760;
const DRIVER_PAY_PER_MILE = 0.65;
const FUEL_PER_MILE = 0.68;

// A small seeded random sequence (mulberry32): the same history every time.
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T extends { weight: number }>(list: T[], r: number): T {
  const total = list.reduce((s, x) => s + x.weight, 0);
  let n = r * total;
  for (const x of list) {
    n -= x.weight;
    if (n <= 0) return x;
  }
  return list[list.length - 1];
}

const round = (n: number) => Math.round(n);

function build(today: string, liveBills: BillRecord[]): { deliveries: Delivery[]; costs: Cost[] } {
  const rnd = random(40218);
  const deliveries: Delivery[] = [];
  const fuelByWeek = new Map<string, number>();
  let n = 1;
  for (let i = DAYS; i >= 1; i--) {
    const day = addDaysIso(today, -i);
    const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
    const month = Number(day.slice(5, 7));
    // Fewer deliveries at weekends; a busier autumn, a quieter January.
    const base = dow === 0 ? 0.4 : dow === 6 ? 0.9 : 2.6;
    const season = month >= 9 && month <= 11 ? 1.2 : month === 1 ? 0.75 : 1;
    const count = Math.floor(base * season + rnd());
    for (let k = 0; k < count; k++) {
      const lane = LANES[Math.floor(rnd() * LANES.length)];
      const customer = pick(CUSTOMERS, rnd());
      const miles = round(lane.miles * (0.95 + rnd() * 0.1));
      const revenue = round(miles * lane.rpm * season ** 0.3 * (0.9 + rnd() * 0.2));
      const brokered = rnd() < 0.14;
      const late = rnd() < customer.lateRate;
      const id = `H-${String(n++).padStart(5, '0')}`;
      deliveries.push({
        id, customer: customer.name, lane: lane.lane,
        scheduled: late ? addDaysIso(day, -(1 + Math.floor(rnd() * 2))) : day,
        delivered: day,
        revenue, miles,
        driverPay: brokered ? 0 : round(miles * DRIVER_PAY_PER_MILE),
        carrierPay: brokered ? round(revenue * (0.8 + rnd() * 0.06)) : 0,
      });
      if (!brokered) {
        const monday = addDaysIso(day, -((dow + 6) % 7));
        fuelByWeek.set(monday, (fuelByWeek.get(monday) ?? 0) + miles * FUEL_PER_MILE);
      }
    }
  }

  // Bills: fuel each week (by the miles driven), and the monthly overheads.
  // A category the company already has a real bill for within two weeks is
  // left out, so the two are not counted twice.
  const covered = (category: string, date: string) =>
    liveBills.some((b) => b.category === category && Math.abs(new Date(b.issued).getTime() - new Date(date).getTime()) <= 14 * 86_400_000);
  const costs: Cost[] = [];
  for (const [monday, fuel] of fuelByWeek) {
    const date = addDaysIso(monday, 6);
    if (date < today && !covered('Fuel', date)) costs.push({ date, amount: round(fuel), category: 'Fuel' });
  }
  // Overheads billed weekly in the sample (insurance, truck and trailer
  // payments, rent, telematics), so a single week's profit is not swung by a
  // month's bills landing on one day; parts now and then.
  const WEEKLY: { category: string; amount: number }[] = [
    { category: 'Insurance', amount: 1570 },
    { category: 'Truck lease / payments', amount: 2910 },
    { category: 'Trailer lease / rental', amount: 670 },
    { category: 'Facilities & rent', amount: 740 },
    { category: 'ELD & telematics', amount: 97 },
  ];
  for (const monday of fuelByWeek.keys()) {
    const date = addDaysIso(monday, 4);
    if (date >= today) continue;
    for (const c of WEEKLY) if (!covered(c.category, date)) costs.push({ date, amount: c.amount, category: c.category });
    if (rnd() < 0.3) {
      const partsDay = addDaysIso(monday, 2);
      if (partsDay < today && !covered('Parts', partsDay)) costs.push({ date: partsDay, amount: round(600 + rnd() * 2400), category: 'Parts' });
    }
  }
  return { deliveries, costs };
}

let cache: { key: string; value: { deliveries: Delivery[]; costs: Cost[] } } | null = null;

// The demo company's sample history (nothing for any other company).
export function demoHistory(liveBills: BillRecord[]): { deliveries: Delivery[]; costs: Cost[] } {
  if (!IS_DEMO) return { deliveries: [], costs: [] };
  const key = `${TODAY}|${liveBills.map((b) => `${b.category}:${b.issued}`).join(',')}`;
  if (cache?.key !== key) cache = { key, value: build(TODAY, liveBills) };
  return cache.value;
}

export const buildDemoHistory = build;
