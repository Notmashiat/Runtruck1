import { describe, expect, it } from 'vitest';
import type { FleetTrailer, FleetTruck } from './fleet';
import { docStatus, iftaExpiry, nextYear, unitDocs, unitDocumentRows, worst } from './unitDocuments';

const TODAY = '2026-11-12';
const truck = (details: Record<string, string>, extra: Partial<FleetTruck> = {}) =>
  ({ id: 'TRK-1', unit: '101', make: 'Volvo', plate: 'X', driver: '', odo: '', service: '', status: 'In service', tagClass: '', details, ...extra }) as FleetTruck;
const trailer = (details: Record<string, string>) =>
  ({ id: 'TRL-1', unit: 'RF-1', kind: 'Reefer · 53 ft', status: 'Empty', tagClass: '', where: '', details }) as FleetTrailer;

describe('unit document dates', () => {
  it('annual inspection is due a year after the last', () => expect(nextYear('2026-04-18')).toBe('2027-04-18'));
  it('ignores dates it cannot read', () => expect(nextYear('soon')).toBe(''));
  it('IFTA decals run to December 31 of their year', () => {
    expect(iftaExpiry('CA 2026 118402')).toBe('2026-12-31');
    expect(iftaExpiry('118402')).toBe('');
  });
  it('status by date', () => {
    expect(docStatus('', TODAY, 60)).toBe('Missing');
    expect(docStatus('2026-11-01', TODAY, 60)).toBe('Expired');
    expect(docStatus('2026-12-31', TODAY, 60)).toBe('Expiring');
    expect(docStatus('2027-06-01', TODAY, 60)).toBe('Valid');
  });
});

describe('unitDocs', () => {
  it('lists IFTA for trucks only', () => {
    const d = { registrationExpiry: '2027-03-31', dotInspection: '2026-08-11', insuranceExpiry: '2027-01-01', iftaDecal: 'CA 2026 1' };
    expect(unitDocs(truck(d), 'truck', TODAY, 60).map((x) => x.document)).toEqual(['Registration', 'Annual inspection', 'Insurance', 'IFTA decal']);
    expect(unitDocs(trailer(d), 'trailer', TODAY, 60).map((x) => x.document)).toEqual(['Registration', 'Annual inspection', 'Insurance']);
  });
  it('a unit is as bad as its worst document', () => {
    const docs = unitDocs(truck({ registrationExpiry: '2027-03-31', dotInspection: '2025-09-03', insuranceExpiry: '2027-01-01', iftaDecal: 'CA 2026 1' }), 'truck', TODAY, 60);
    expect(worst(docs)).toBe('Expired');
  });
  it('leaves out archived units', () => {
    const rows = unitDocumentRows([truck({}, { archived: true })], [trailer({})], TODAY, 60);
    expect(rows.map((r) => r.unit)).toEqual(['RF-1']);
    expect(rows[0].status).toBe('Missing');
  });
});
