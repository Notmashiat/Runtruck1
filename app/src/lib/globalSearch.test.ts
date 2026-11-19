import { describe, expect, it } from 'vitest';
import type { CustomerRecord } from '../data/customers';
import type { Facility } from '../data/facilities';
import type { FleetDriver, FleetTrailer, FleetTruck } from '../data/fleet';
import type { Load } from '../data/mock';
import { isSearchShortcut, scoreOf, searchAll, type SearchData } from './globalSearch';

const load = (id: string, extra: Partial<Load> = {}) => ({
  id, ref: `PO-${id}`, customer: 'Northgate Foods', route: 'Fresno, CA → Reno, NV', from: 'Fresno, CA', to: 'Reno, NV',
  unit: 'T-114', driver: 'Marcus Hale', carrier: 'Sunridge Freight', status: 'In transit', ...extra,
}) as unknown as Load;

const data = (over: Partial<SearchData> = {}): SearchData => ({
  loads: [load('L-40218'), load('L-40212', { customer: 'Bayline Distribution', route: 'Los Angeles, CA → Las Vegas, NV', from: 'Los Angeles, CA', to: 'Las Vegas, NV', unit: '—', driver: 'Unassigned' })],
  trucks: [
    { id: 'TRK-1', unit: 'T-114', driver: 'Marcus Hale', make: 'Peterbilt 579', plate: 'CA 8ZT114' },
    { id: 'TRK-2', unit: 'T-120', driver: 'Unassigned', make: 'Volvo VNL', plate: '', archived: true },
  ] as unknown as FleetTruck[],
  trailers: [{ id: 'TRL-1', unit: 'RF-88', kind: 'Reefer', where: 'Fresno yard' }] as unknown as FleetTrailer[],
  drivers: [{ id: 'DRV-1', name: 'Marcus Hale', unit: 'T-114', status: 'On load', details: { phone: '(559) 555-0142' } }] as unknown as FleetDriver[],
  customers: [
    { id: 'C-1', name: 'Northgate Foods', mc: '445120', type: 'Broker', status: 'Active' },
    { id: 'C-2', name: 'Old Pine Logistics', mc: '', type: 'Shipper', status: 'Inactive' },
  ] as unknown as CustomerRecord[],
  facilities: [{ id: 'FAC-1', name: 'Northgate Cold Storage', type: 'Shipper', city: 'Fresno', state: 'CA' }] as unknown as Facility[],
  ...over,
});

describe('scoreOf', () => {
  it('ranks a match at the start of the first field highest', () => {
    expect(scoreOf('l-402', ['L-40218', 'x'])).toBe(3);
    expect(scoreOf('hale', ['L-1', 'Marcus Hale'])).toBe(2);
    expect(scoreOf('arcu', ['L-1', 'Marcus Hale'])).toBe(1);
    expect(scoreOf('zz', ['L-1', 'Marcus Hale'])).toBe(0);
  });
  it('matches numbers without their dashes, spaces or #', () => {
    expect(scoreOf('40218', ['L-40218'])).toBe(3);
    expect(scoreOf('#40218', ['L-40218'])).toBe(3);
    expect(scoreOf('t114', ['T-114'])).toBe(3);
  });
  it('needs every word to match somewhere', () => {
    expect(scoreOf('fresno reno', ['L-1', 'Fresno, CA → Reno, NV'])).toBeGreaterThan(0);
    expect(scoreOf('fresno boise', ['L-1', 'Fresno, CA → Reno, NV'])).toBe(0);
    expect(scoreOf('   ', ['L-1'])).toBe(0);
  });
});

describe('searchAll', () => {
  it('finds nothing for an empty search', () => {
    expect(searchAll('  ', data())).toEqual([]);
  });
  it('finds a load by its number, with or without the dash', () => {
    const [hit] = searchAll('40218', data());
    expect(hit).toMatchObject({ kind: 'load', to: '/app/loads/L-40218', filter: '' });
  });
  it('puts the truck first for a truck number, opening Fleet filtered to it', () => {
    const hits = searchAll('T-114', data());
    expect(hits[0]).toMatchObject({ kind: 'truck', title: 'Truck T-114', to: '/app/fleet/trucks', filter: 'T-114' });
    expect(hits.some((h) => h.kind === 'load')).toBe(true);
  });
  it('leaves out archived trucks', () => {
    expect(searchAll('T-120', data()).some((h) => h.kind === 'truck')).toBe(false);
  });
  it('finds brokers by name or MC number, and inactive ones open the inactive list', () => {
    expect(searchAll('445120', data())[0]).toMatchObject({ kind: 'customer', title: 'Northgate Foods', to: '/app/crm' });
    expect(searchAll('old pine', data())[0]).toMatchObject({ kind: 'customer', to: '/app/crm?view=inactive' });
  });
  it('finds drivers by phone, trailers by number and facilities by name', () => {
    expect(searchAll('555-0142', data())[0]).toMatchObject({ kind: 'driver', filter: 'Marcus Hale', to: '/app/fleet/drivers' });
    expect(searchAll('RF-88', data())[0]).toMatchObject({ kind: 'trailer', filter: 'RF-88' });
    expect(searchAll('cold storage', data())[0]).toMatchObject({ kind: 'facility', to: '/app/facilities?open=FAC-1' });
  });
  it('keeps to the limit', () => {
    expect(searchAll('a', data(), 3)).toHaveLength(3);
  });
});

describe('isSearchShortcut', () => {
  const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, ...mods });
  const el = (inField: boolean) => ({ closest: () => (inField ? {} : null) }) as unknown as EventTarget;
  it('opens on / outside a field', () => {
    expect(isSearchShortcut(key('/'), el(false))).toBe(true);
    expect(isSearchShortcut(key('/'), null)).toBe(true);
  });
  it('lets / be typed in a field, and ignores other keys and shortcuts', () => {
    expect(isSearchShortcut(key('/'), el(true))).toBe(false);
    expect(isSearchShortcut(key('a'), el(false))).toBe(false);
    expect(isSearchShortcut(key('/', { metaKey: true }), el(false))).toBe(false);
    expect(isSearchShortcut(key('/', { ctrlKey: true }), el(false))).toBe(false);
  });
});
