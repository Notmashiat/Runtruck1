// Truck and trailer paperwork (release 1.36): registration, the annual DOT
// inspection, insurance and, for tractors, the IFTA decal — worked out from the
// dates on each unit. Kept by the safety team in Safety › Unit Documents; the
// Add fleet unit popup no longer asks for them.
import { DOC_TAG, renewWindow, type DocStatus } from './compliance';
import type { FleetTrailer, FleetTruck } from './fleet';
import { TODAY, daysFrom } from './invoicing';

export type UnitKind = 'truck' | 'trailer';

export interface UnitDoc {
  document: string;
  // When it runs out ('' when there is no date).
  date: string;
  status: DocStatus;
  tagClass: string;
  rule: string;
}

export interface UnitDocRow {
  id: string;
  unit: string;
  kind: UnitKind;
  label: string;
  docs: UnitDoc[];
  // The worst of its documents.
  status: DocStatus;
}

const ORDER: Record<DocStatus, number> = { Expired: 0, Missing: 1, Expiring: 2, Valid: 3 };

// The annual inspection is due a year after the last one (49 CFR 396.17).
export const nextYear = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${Number(iso.slice(0, 4)) + 1}${iso.slice(4)}` : '');

// IFTA decals run to December 31 of the year printed on them ('CA 2026 118402').
export function iftaExpiry(decal: string): string {
  const y = decal.match(/\b(20\d{2})\b/)?.[1];
  return y ? `${y}-12-31` : '';
}

export function docStatus(date: string, today = TODAY, window = renewWindow()): DocStatus {
  if (!date) return 'Missing';
  const left = daysFrom(today, date);
  return left < 0 ? 'Expired' : left <= window ? 'Expiring' : 'Valid';
}

type Unit = Pick<FleetTruck, 'id' | 'unit' | 'details' | 'archived'>;

export function unitDocs(u: Unit, kind: UnitKind, today = TODAY, window = renewWindow()): UnitDoc[] {
  const s = (k: string) => (typeof u.details[k] === 'string' ? (u.details[k] as string).trim() : '');
  const doc = (document: string, date: string, rule: string): UnitDoc => {
    const status = docStatus(date, today, window);
    return { document, date, status, tagClass: DOC_TAG[status], rule };
  };
  const out = [
    doc('Registration', s('registrationExpiry'), s('apportioned') === 'Yes' ? 'IRP apportioned plate' : 'State registration'),
    doc('Annual inspection', nextYear(s('dotInspection')), '49 CFR 396.17 · every 12 months'),
    doc('Insurance', s('insuranceExpiry'), 'Auto liability / physical damage'),
  ];
  if (kind === 'truck') out.push(doc('IFTA decal', iftaExpiry(s('iftaDecal')), s('iftaDecal') || 'Fuel tax decal, renewed each year'));
  return out;
}

export function worst(docs: UnitDoc[]): DocStatus {
  return docs.reduce<DocStatus>((w, d) => (ORDER[d.status] < ORDER[w] ? d.status : w), 'Valid');
}

export function unitDocumentRows(trucks: FleetTruck[], trailers: FleetTrailer[], today = TODAY, window = renewWindow()): UnitDocRow[] {
  const row = (u: FleetTruck | FleetTrailer, kind: UnitKind, label: string): UnitDocRow => {
    const docs = unitDocs(u, kind, today, window);
    return { id: u.id, unit: u.unit, kind, label, docs, status: worst(docs) };
  };
  return [
    ...trucks.filter((t) => !t.archived).map((t) => row(t, 'truck', [t.make, t.plate].filter(Boolean).join(' · '))),
    ...trailers.filter((t) => !t.archived).map((t) => row(t, 'trailer', t.kind)),
  ];
}

export const STATUS_ORDER = (s: DocStatus) => ORDER[s];
