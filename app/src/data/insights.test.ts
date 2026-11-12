import { describe, expect, it } from 'vitest';
import { buildDemoHistory } from './demoHistory';
import {
  change, lanesByProfit, profitSeries, onTimeByCustomer, onTimeRate, periodRange, previousRange, summarize, trend, type Cost, type Delivery,
} from './insights';

const TODAY = '2026-11-11';
const d = (id: string, patch: Partial<Delivery>): Delivery => ({
  id, customer: 'Northgate Foods', lane: 'Fresno, CA → Reno, NV', scheduled: '2026-11-10', delivered: '2026-11-10',
  revenue: 2000, miles: 500, driverPay: 300, carrierPay: 0, ...patch,
});

describe('Dashboard periods', () => {
  it('cover the right days, and compare with the right days before', () => {
    expect(periodRange('1W', TODAY)).toEqual({ from: '2026-11-05', to: TODAY });
    expect(previousRange('1W', TODAY)).toEqual({ from: '2026-10-29', to: '2026-11-04' });
    expect(periodRange('1M', TODAY)).toEqual({ from: '2026-10-13', to: TODAY });
    expect(periodRange('1Y', TODAY)).toEqual({ from: '2025-11-12', to: TODAY });
    expect(periodRange('YTD', TODAY)).toEqual({ from: '2026-01-01', to: TODAY });
    expect(previousRange('YTD', TODAY)).toEqual({ from: '2025-01-01', to: '2025-11-11' });
  });
});

describe('Insights', () => {
  const deliveries = [
    d('A', {}),
    d('B', { scheduled: '2026-11-08', delivered: '2026-11-10', customer: 'Sierra Ag Partners', lane: 'Modesto, CA → Denver, CO', revenue: 3000, miles: 1000, driverPay: 0, carrierPay: 2500 }),
    d('C', { delivered: '2026-10-01', scheduled: '2026-10-01' }),
  ];
  const costs: Cost[] = [{ date: '2026-11-09', amount: 400, category: 'Fuel' }, { date: '2026-09-01', amount: 999, category: 'Insurance' }];

  it('profit is revenue less driver pay, carrier pay and bills in the period', () => {
    const s = summarize(deliveries, costs, periodRange('1W', TODAY));
    expect(s.loads).toBe(2);
    expect(s.revenue).toBe(5000);
    expect(s.profit).toBe(5000 - 300 - 2500 - 400);
    expect(s.margin).toBeCloseTo(1800 / 5000);
    expect(s.revenuePerMile).toBeCloseTo(5000 / 1500);
    expect(s.costPerMile).toBeCloseTo(3200 / 1500);
  });

  it('on-time counts loads delivered on or before their booked day', () => {
    const s = summarize(deliveries, costs, periodRange('1W', TODAY));
    expect([s.onTime, s.timed, s.late.map((l) => l.id)]).toEqual([1, 2, ['B']]);
    expect(onTimeRate(s)).toBe(0.5);
    expect(onTimeByCustomer(deliveries, periodRange('1W', TODAY))[0]).toEqual({ customer: 'Sierra Ag Partners', loads: 1, onTime: 0, late: 1, avgDaysLate: 2 });
  });

  it('lanes are ranked by what they earned after driver and carrier pay', () => {
    expect(lanesByProfit(deliveries, periodRange('1M', TODAY)).map((l) => [l.lane, l.profit])).toEqual([
      ['Fresno, CA → Reno, NV', 1700],
      ['Modesto, CA → Denver, CO', 500],
    ]);
  });

  it('the trend has a step per day for a week and per month for a year', () => {
    expect(trend(deliveries, costs, '1W', TODAY)).toHaveLength(7);
    expect(trend(deliveries, costs, '1Y', TODAY).map((s) => s.label)).toEqual(['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov']);
    expect(change(110, 100)).toBeCloseTo(0.1);
    expect(change(5, 0)).toBeNull();
  });
});

describe('Profit graph', () => {
  it('has a point a day for a week, a week a point for a year, each against the same point of the period before', () => {
    const list = [d('now', { delivered: '2026-11-10', scheduled: '2026-11-10', revenue: 1000, driverPay: 0 }), d('before', { delivered: '2026-11-03', scheduled: '2026-11-03', revenue: 400, driverPay: 0 })];
    const week = profitSeries(list, [], '1W', TODAY);
    expect(week).toHaveLength(7);
    expect(week[5]).toMatchObject({ axis: 'Nov 10', title: 'Nov 10, 2026', current: 1000, previous: 400 });
    const year = profitSeries(list, [], '1Y', TODAY);
    expect(year.length).toBeGreaterThanOrEqual(52);
    expect(year[year.length - 1].title).toMatch(/^Week of /);
  });
});

describe('Demo history', () => {
  it('is the same every time, ends before today, and covers two years', () => {
    const a = buildDemoHistory(TODAY, []);
    const b = buildDemoHistory(TODAY, []);
    expect(a.deliveries.length).toBe(b.deliveries.length);
    expect(a.deliveries[100]).toEqual(b.deliveries[100]);
    expect(a.deliveries.every((x) => x.delivered < TODAY)).toBe(true);
    expect(a.deliveries.some((x) => x.delivered < '2025-01-01')).toBe(true);
    const year = summarize(a.deliveries, a.costs, periodRange('1Y', TODAY));
    expect(year.margin).toBeGreaterThan(0.05);
    expect(year.margin).toBeLessThan(0.45);
  });
});
