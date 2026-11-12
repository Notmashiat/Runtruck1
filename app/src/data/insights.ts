// The Dashboard's insights (release 1.31): on-time delivery, revenue, profit,
// rate and cost per mile, lanes and customers, for a chosen period (year to
// date, one year, one month or one week) against the period before it.
//
// Worked out from delivered loads (revenue on the day each was delivered,
// with what the driver and any partner carrier were paid) and from bills
// (dated by when they were issued). Pure functions: the page passes the
// records in, which keeps them easy to test.
import type { BillRecord } from './bills';
import { loadTotal } from './loads';
import type { Load } from './mock';
import { addDaysIso, addMonthsIso, daysBetweenIso } from '../lib/isoDates';

export type Period = 'YTD' | '1Y' | '1M' | '1W';
export const PERIODS: { key: Period; label: string; short: string; previous: string }[] = [
  { key: 'YTD', label: 'YTD', short: 'year to date', previous: 'same time last year' },
  { key: '1Y', label: 'One year', short: 'last 12 months', previous: 'the 12 months before' },
  { key: '1M', label: 'One month', short: 'last 30 days', previous: 'the 30 days before' },
  { key: '1W', label: 'One week', short: 'last 7 days', previous: 'the week before' },
];
export const periodOf = (p: Period) => PERIODS.find((x) => x.key === p) ?? PERIODS[3];

export interface Range { from: string; to: string }

// The days a period covers, ending today.
export function periodRange(p: Period, today: string): Range {
  if (p === 'YTD') return { from: `${today.slice(0, 4)}-01-01`, to: today };
  if (p === '1Y') return { from: addDaysIso(addMonthsIso(today, -12), 1), to: today };
  if (p === '1M') return { from: addDaysIso(today, -29), to: today };
  return { from: addDaysIso(today, -6), to: today };
}

// The period it is compared with: the same length just before it (for year
// to date, the same days of last year).
export function previousRange(p: Period, today: string): Range {
  const r = periodRange(p, today);
  if (p === 'YTD') return { from: addMonthsIso(r.from, -12), to: addMonthsIso(r.to, -12) };
  const days = daysBetweenIso(r.from, r.to) + 1;
  return { from: addDaysIso(r.from, -days), to: addDaysIso(r.from, -1) };
}

// One delivered load, as the insights need it.
export interface Delivery {
  id: string;
  customer: string;
  lane: string;
  scheduled: string; // the delivery date it was booked for ('' if unknown)
  delivered: string; // the day it was delivered
  revenue: number;
  miles: number;
  driverPay: number;
  carrierPay: number;
}

// One cost from a bill (fuel, insurance, rent, parts…).
export interface Cost { date: string; amount: number; category: string }

const num = (s: string | undefined) => Number((s ?? '').replace(/[^\d.]/g, '')) || 0;

// The loads that have been delivered, from the app's load records.
export function deliveriesFromLoads(loads: Load[]): Delivery[] {
  return loads
    .filter((l) => l.deliveredOn)
    .map((l) => ({
      id: l.id,
      customer: l.customer,
      lane: l.route,
      scheduled: l.deliveryDate ?? '',
      delivered: l.deliveredOn as string,
      revenue: loadTotal(l),
      miles: num(l.miles),
      driverPay: num(l.pay),
      carrierPay: num(l.carrierRate),
    }));
}

export function costsFromBills(bills: BillRecord[]): Cost[] {
  return bills.filter((b) => b.issued && b.amount > 0).map((b) => ({ date: b.issued, amount: b.amount, category: b.category }));
}

const inRange = (d: string, r: Range) => d >= r.from && d <= r.to;
// Delivered on or before the day it was booked for.
export const onTime = (d: Delivery) => Boolean(d.scheduled) && d.delivered <= d.scheduled;
export const daysLate = (d: Delivery) => (d.scheduled && d.delivered > d.scheduled ? daysBetweenIso(d.scheduled, d.delivered) : 0);

export interface Summary {
  loads: number;
  timed: number; // loads with a booked delivery date (on-time is out of these)
  onTime: number;
  late: Delivery[];
  revenue: number;
  driverPay: number;
  carrierPay: number;
  bills: number;
  profit: number;
  margin: number; // profit ÷ revenue, 0–1 (0 with no revenue)
  miles: number;
  revenuePerMile: number;
  costPerMile: number;
}

export function summarize(deliveries: Delivery[], costs: Cost[], r: Range): Summary {
  const list = deliveries.filter((d) => inRange(d.delivered, r));
  const timed = list.filter((d) => d.scheduled);
  const revenue = list.reduce((s, d) => s + d.revenue, 0);
  const driverPay = list.reduce((s, d) => s + d.driverPay, 0);
  const carrierPay = list.reduce((s, d) => s + d.carrierPay, 0);
  const bills = costs.filter((c) => inRange(c.date, r)).reduce((s, c) => s + c.amount, 0);
  const profit = revenue - driverPay - carrierPay - bills;
  const miles = list.reduce((s, d) => s + d.miles, 0);
  return {
    loads: list.length,
    timed: timed.length,
    onTime: timed.filter(onTime).length,
    late: timed.filter((d) => !onTime(d)).sort((a, b) => b.delivered.localeCompare(a.delivered)),
    revenue, driverPay, carrierPay, bills, profit,
    margin: revenue > 0 ? profit / revenue : 0,
    miles,
    revenuePerMile: miles > 0 ? revenue / miles : 0,
    costPerMile: miles > 0 ? (driverPay + carrierPay + bills) / miles : 0,
  };
}

export const onTimeRate = (s: Pick<Summary, 'onTime' | 'timed'>) => (s.timed > 0 ? s.onTime / s.timed : 0);

// Change against the previous period, as a share (0.08 = up 8%); null when
// there is nothing to compare with.
export function change(now: number, before: number): number | null {
  if (!before) return null;
  return (now - before) / Math.abs(before);
}

// Revenue and profit in steps across the period: days for a week or a month,
// months for a year. Each step's profit takes its loads' pay and the bills
// dated in it.
export interface Step { key: string; label: string; from: string; to: string; revenue: number; profit: number }
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function trend(deliveries: Delivery[], costs: Cost[], p: Period, today: string): Step[] {
  const r = periodRange(p, today);
  const steps: { from: string; to: string; label: string }[] = [];
  if (p === '1W' || p === '1M') {
    for (let d = r.from; d <= r.to; d = addDaysIso(d, 1)) {
      const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
      steps.push({ from: d, to: d, label: p === '1W' ? WEEKDAY[dow] : `${MONTH[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8))}` });
    }
  } else {
    let start = `${r.from.slice(0, 7)}-01`;
    while (start <= r.to) {
      const next = addMonthsIso(start, 1);
      steps.push({ from: start < r.from ? r.from : start, to: addDaysIso(next, -1) > r.to ? r.to : addDaysIso(next, -1), label: MONTH[Number(start.slice(5, 7)) - 1] });
      start = next;
    }
  }
  return steps.map((s) => {
    const sum = summarize(deliveries, costs, s);
    return { key: s.from, label: s.label, from: s.from, to: s.to, revenue: sum.revenue, profit: sum.profit };
  });
}

// Lanes ranked by what they earned after the driver and carrier were paid
// (bills are company-wide, so they are not shared out to lanes).
export interface LaneRow { lane: string; loads: number; revenue: number; profit: number; miles: number }
export function lanesByProfit(deliveries: Delivery[], r: Range): LaneRow[] {
  const map = new Map<string, LaneRow>();
  for (const d of deliveries) {
    if (!inRange(d.delivered, r) || !d.lane) continue;
    const row = map.get(d.lane) ?? { lane: d.lane, loads: 0, revenue: 0, profit: 0, miles: 0 };
    row.loads += 1;
    row.revenue += d.revenue;
    row.profit += d.revenue - d.driverPay - d.carrierPay;
    row.miles += d.miles;
    map.set(d.lane, row);
  }
  return [...map.values()].sort((a, b) => b.profit - a.profit);
}

// On-time delivery for each customer, worst first.
export interface CustomerRow { customer: string; loads: number; onTime: number; late: number; avgDaysLate: number }
export function onTimeByCustomer(deliveries: Delivery[], r: Range): CustomerRow[] {
  const map = new Map<string, CustomerRow & { lateDays: number }>();
  for (const d of deliveries) {
    if (!inRange(d.delivered, r) || !d.scheduled) continue;
    const row = map.get(d.customer) ?? { customer: d.customer, loads: 0, onTime: 0, late: 0, avgDaysLate: 0, lateDays: 0 };
    row.loads += 1;
    if (onTime(d)) row.onTime += 1;
    else { row.late += 1; row.lateDays += daysLate(d); }
    map.set(d.customer, row);
  }
  return [...map.values()]
    .map(({ lateDays, ...row }) => ({ ...row, avgDaysLate: row.late ? lateDays / row.late : 0 }))
    .sort((a, b) => a.onTime / a.loads - b.onTime / b.loads || b.loads - a.loads);
}

// Profit through the period against the period before (release 1.32's
// profit graph): a point a day for a week or a month, a point a week for a
// year or year to date. Point i of the previous period is the same distance
// into it as point i of this one.
export interface ProfitPoint { key: string; axis: string; title: string; current: number; previous: number }

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel = (iso: string) => `${MONTH_SHORT[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8))}`;

function stepsOf(r: Range, days: number): Range[] {
  // Back from the end, `days` at a time; the first step may be shorter.
  const out: Range[] = [];
  let end = r.to;
  while (end >= r.from) {
    const start = addDaysIso(end, -(days - 1));
    out.unshift({ from: start < r.from ? r.from : start, to: end });
    end = addDaysIso(start, -1);
  }
  return out;
}

export function profitSeries(deliveries: Delivery[], costs: Cost[], p: Period, today: string): ProfitPoint[] {
  const days = p === '1W' || p === '1M' ? 1 : 7;
  const now = stepsOf(periodRange(p, today), days);
  const before = stepsOf(previousRange(p, today), days);
  // Line the previous period up from the end, like this one.
  const offset = before.length - now.length;
  const profitIn = (s: Range | undefined) => (s ? summarize(deliveries, costs, s).profit : 0);
  return now.map((s, i) => ({
    key: s.from,
    axis: dayLabel(s.from),
    title: days === 1 ? `${dayLabel(s.from)}, ${s.from.slice(0, 4)}` : `Week of ${dayLabel(s.from)}, ${s.from.slice(0, 4)}`,
    current: profitIn(s),
    previous: profitIn(before[i + offset]),
  }));
}

// The on-time target the gauge is measured against.
export const ON_TIME_TARGET = 0.95;
