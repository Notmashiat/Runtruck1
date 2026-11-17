import { describe, expect, it } from 'vitest';
import type { FleetTrailer, FleetTruck } from './fleet';
import type { Load } from './mock';
import { assignLoad, at, clashes, driveTime, loadKind, planLoads, movable, planFigures, planRows, reloadsNear, truckOf, truckTrailer, truckWeek, weekStart } from './routePlan';

const truck = (unit: string, extra: Partial<FleetTruck> = {}) =>
  ({ id: `id-${unit}`, unit, make: 'Volvo', plate: '', driver: 'Ana Cortez', odo: '', service: '', status: 'In service', tagClass: '', details: { terminal: 'Modesto, CA — main yard' }, ...extra }) as FleetTruck;
const load = (id: string, unit: string, status: string, pickupDate: string, deliveryDate: string, route = 'Fresno, CA → Reno, NV', miles = '250') =>
  ({ id, unit, status, pickupDate, deliveryDate, pickup: '', delivery: '', route, from: '', to: '', fromAddr: '', toAddr: '', rate: '$2,000', miles,
    stops: [
      { kind: 'Pickup', name: 'A', address: 'Fresno, CA', when: '', date: pickupDate },
      { kind: 'Delivery', name: 'B', address: 'Reno, NV', when: '', date: deliveryDate },
    ] }) as unknown as Load;

const from = at('2026-11-16');
const to = at('2026-11-23');
const now = at('2026-11-17', '12:00');

describe('route plan', () => {
  it('reads the truck out of "truck / trailer"', () => expect(truckOf({ unit: 'T-114 / RF-88' } as Load)).toBe('T-114'));
  it('weeks start on Monday', () => {
    expect(weekStart('2026-11-19')).toBe('2026-11-16');
    expect(weekStart('2026-11-22')).toBe('2026-11-16');
  });
  it('sorts loads into delivered, on the road and booked', () => {
    expect(loadKind({ status: 'Delivered' } as Load)).toBe('done');
    expect(loadKind({ status: 'In transit' } as Load)).toBe('moving');
    expect(loadKind({ status: 'Dispatched' } as Load)).toBe('booked');
    expect(loadKind({ status: 'Cancelled' } as Load)).toBeNull();
  });
  it('shows a truck on the road, then empty once its load is delivered', () => {
    const rows = planRows({ trucks: [truck('T-1')], trailers: [] as FleetTrailer[], loads: [load('L-1', 'T-1 / RF-1', 'In transit', '2026-11-16', '2026-11-18')], orders: [], from, to, now });
    expect(rows[0].state).toBe('moving');
    const kinds = rows[0].bars.map((b) => b.kind);
    expect(kinds).toContain('moving');
    expect(kinds).toContain('empty');
    expect(rows[0].bars.find((b) => b.kind === 'empty')?.place).toBe('Reno, NV');
  });
  it('a truck with nothing booked needs a load', () => {
    const rows = planRows({ trucks: [truck('T-2')], trailers: [], loads: [], orders: [], from, to, now });
    expect(rows[0].state).toBe('empty');
    expect(planFigures(rows, [], from, to).needLoad).toBe(1);
  });
  it('a truck in the shop is not counted as needing a load', () => {
    const rows = planRows({ trucks: [truck('T-3', { status: 'In shop' })], trailers: [], loads: [], orders: [], from, to, now });
    expect(rows[0].state).toBe('shop');
    expect(rows[0].bars.some((b) => b.kind === 'empty')).toBe(false);
  });
  it('adds up the loads picking up in the days shown', () => {
    const loads = [load('L-1', 'T-1', 'Dispatched', '2026-11-18', '2026-11-19'), load('L-2', 'T-1', 'Dispatched', '2026-11-25', '2026-11-26')];
    const rows = planRows({ trucks: [truck('T-1')], trailers: [], loads, orders: [], from, to, now });
    expect(planFigures(rows, loads, from, to).booked).toBe(2000);
  });
  it('a red dot only when nothing is booked after the truck empties', () => {
    const rows = planRows({ trucks: [truck('T-4')], trailers: [], loads: [load('L-1', 'T-4', 'In transit', '2026-11-16', '2026-11-17')], orders: [], from, to, now });
    expect(rows[0].alert).toBe(true);
    const booked = planRows({ trucks: [truck('T-4')], trailers: [], loads: [load('L-1', 'T-4', 'In transit', '2026-11-16', '2026-11-17'), load('L-2', 'T-4', 'Dispatched', '2026-11-20', '2026-11-21', 'Reno, NV → Boise, ID')], orders: [], from, to, now });
    expect(booked[0].alert).toBe(false);
  });
  it('deadhead runs from one delivery to the next pickup', () => {
    const rows = planRows({ trucks: [truck('T-5')], trailers: [], loads: [load('L-1', 'T-5', 'Delivered', '2026-11-16', '2026-11-16'), load('L-2', 'T-5', 'Dispatched', '2026-11-18', '2026-11-19', 'Sacramento, CA → Boise, ID')], orders: [], from, to, now });
    expect(rows[0].deadheads).toHaveLength(1);
    expect(rows[0].deadheads[0].miles).toBeGreaterThan(100);
  });
  it('finds unassigned booked loads within the deadhead range that fit', () => {
    const loads = [
      load('L-1', '—', 'Needs driver', '2026-11-18', '2026-11-19', 'Sparks, NV → Boise, ID'),
      load('L-2', '—', 'Needs driver', '2026-11-18', '2026-11-19', 'Atlanta, GA → Macon, GA'),
      load('L-3', 'T-9', 'Booked', '2026-11-18', '2026-11-19', 'Reno, NV → Boise, ID'),
      load('L-4', '—', 'Needs driver', '2026-11-22', '2026-11-23', 'Reno, NV → Elko, NV'),
    ];
    expect(reloadsNear('Reno, NV', loads, 150, now).map((r) => r.load.id)).toEqual(['L-4', 'L-1']);
    expect(reloadsNear('Reno, NV', loads, 150, now, at('2026-11-21')).map((r) => r.load.id)).toEqual(['L-1']);
  });
  it('adds up a truck’s week', () => {
    const loads = [load('L-1', 'T-6', 'Delivered', '2026-11-16', '2026-11-16'), load('L-2', 'T-6', 'Dispatched', '2026-11-18', '2026-11-19', 'Reno, NV → Boise, ID', '420')];
    const w = truckWeek('T-6', loads, from, to);
    expect(w.count).toBe(2);
    expect(w.loadedMiles).toBe(670);
    expect(w.gross).toBe(4000);
    expect(w.deadheadMiles).toBe(0);
    expect(w.totalMiles).toBe(670);
    expect(w.rpm).toBeCloseTo(4000 / 670);
  });
  it('only booked loads can change truck', () => {
    expect(movable({ status: 'Dispatched' } as Load)).toBe(true);
    expect(movable({ status: 'In transit' } as Load)).toBe(false);
    expect(movable({ status: 'Delivered' } as Load)).toBe(false);
  });
  it('giving a load to a truck brings its driver and trailer', () => {
    const l = load('L-1', 'T-1 / RF-1', 'Dispatched', '2026-11-18', '2026-11-19');
    const moved = assignLoad(l, truck('T-2', { driver: 'Dara Whitfield', details: { trailer: 'DV-9' } }));
    expect(moved).toMatchObject({ unit: 'T-2 / DV-9', driver: 'Dara Whitfield', status: 'Booked' });
    // No trailer connected: the one on its latest load, else the load's own.
    const pulls = [load('L-0', 'T-3 / DV-3', 'Delivered', '2026-11-16', '2026-11-16')];
    expect(truckTrailer(truck('T-3'), pulls)).toBe('DV-3');
    expect(assignLoad(l, truck('T-3'), pulls).unit).toBe('T-3 / DV-3');
    expect(assignLoad(l, truck('T-4')).unit).toBe('T-4 / RF-1');
    // No driver on the truck: the load needs one.
    expect(assignLoad(l, truck('T-5', { driver: 'Unassigned' }))).toMatchObject({ driver: 'Unassigned', status: 'Needs driver' });
  });
  it('finds loads that overlap on the new truck', () => {
    const a = load('L-1', 'T-1', 'Dispatched', '2026-11-18', '2026-11-19');
    const b = load('L-2', 'T-2', 'Booked', '2026-11-19', '2026-11-20');
    const c = load('L-3', 'T-2', 'Booked', '2026-11-21', '2026-11-22');
    expect(clashes(a, 'T-2', [a, b, c]).map((x) => x.id)).toEqual(['L-2']);
  });
  it('a wide pickup window after a drop follows it on one line', () => {
    const stop = (kind: 'Pickup' | 'Delivery', place: string, date: string, window: string) => ({ kind, name: place, address: place, when: `x · ${window}`, date });
    const first = { ...load('L-1', 'T-7', 'Dispatched', '2026-11-18', '2026-11-18', 'Fresno, CA → Reno, NV', '0'),
      stops: [stop('Pickup', 'Fresno, CA', '2026-11-18', '05:00–06:00'), stop('Delivery', 'Reno, NV', '2026-11-18', '11:00')] } as Load;
    const second = { ...load('L-2', 'T-7', 'Dispatched', '2026-11-18', '2026-11-19', 'Sparks, NV → Boise, ID', '420'),
      stops: [stop('Pickup', 'Sparks, NV', '2026-11-18', '08:00–16:00'), stop('Delivery', 'Boise, ID', '2026-11-19', '08:00–17:00')] } as Load;
    const plan = planLoads([second, first]);
    const a = plan.get('L-1');
    const b = plan.get('L-2');
    expect(a?.end).toBe(at('2026-11-18', '12:00'));
    // About 12 PM in Sparks: inside 8 AM–4 PM, after the drop, not stacked over it.
    expect(b?.start).toBeGreaterThanOrEqual(a?.end ?? 0);
    expect(b?.start).toBeLessThan(at('2026-11-18', '12:30'));
    expect(b?.late).toBeNull();
    const rows = planRows({ trucks: [truck('T-7')], trailers: [], loads: [first, second], orders: [], from, to, now });
    expect(rows[0].lanes).toBe(1);
  });
  it('marks a pickup the truck cannot reach in its window', () => {
    const stop = (kind: 'Pickup' | 'Delivery', place: string, date: string, window: string) => ({ kind, name: place, address: place, when: `x · ${window}`, date });
    const first = { ...load('L-1', 'T-8', 'Dispatched', '2026-11-18', '2026-11-18', 'Fresno, CA → Reno, NV', '0'),
      stops: [stop('Pickup', 'Fresno, CA', '2026-11-18', '05:00'), stop('Delivery', 'Reno, NV', '2026-11-18', '14:00')] } as Load;
    const second = { ...load('L-2', 'T-8', 'Dispatched', '2026-11-18', '2026-11-19', 'Sparks, NV → Boise, ID', '420'),
      stops: [stop('Pickup', 'Sparks, NV', '2026-11-18', '08:00–12:00'), stop('Delivery', 'Boise, ID', '2026-11-19', '08:00–17:00')] } as Load;
    expect(planLoads([first, second]).get('L-2')?.late?.stop).toBe('pickup');
  });
  it('drives at about 50 mph with a rest every 11 hours', () => {
    expect(driveTime(100)).toBe(2 * 3_600_000);
    expect(driveTime(600)).toBe((12 + 10) * 3_600_000);
  });
});
