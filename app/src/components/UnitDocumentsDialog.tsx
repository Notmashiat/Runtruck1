import { faClipboardCheck, faFileContract, faGasPump, faIdCard, faShieldHalved } from '@fortawesome/free-solid-svg-icons';
import { useAppShell } from '../context/AppShellContext';
import { YES_NO, trailerFromForm, truckFromForm, type FleetTrailer, type FleetTruck, type FormValues } from '../data/fleet';
import { fmtDate } from '../data/invoicing';
import { iftaExpiry, nextYear, type UnitKind } from '../data/unitDocuments';
import { toast } from '../lib/toast';
import { NlRecordDialog, SumRow } from './NlRecordDialog';
import type { SectionSpec } from './RecordDialog';

// Update a unit's paperwork (release 1.36): registration, the last annual
// inspection, insurance and the IFTA decal. Used by the safety team from
// Safety › Unit Documents; it saves onto the truck or trailer record.

const KEYS = ['registrationExpiry', 'apportioned', 'dotInspection', 'insuranceExpiry', 'iftaDecal'];
const val = (v: FormValues, k: string) => (typeof v[k] === 'string' ? (v[k] as string).trim() : '');
const notFuture = (value: string) => (value && value > new Date().toISOString().slice(0, 10) ? 'Use the date it was done, not a future date' : null);

function sections(kind: UnitKind): SectionSpec[] {
  return [
    {
      title: 'Registration', icon: faIdCard,
      help: 'The date on the cab card or registration.',
      fields: [
        { key: 'registrationExpiry', label: 'Registration expires', type: 'date', required: true },
        ...(kind === 'truck' ? [{ key: 'apportioned', label: 'IRP apportioned plate', type: 'select' as const, options: YES_NO, help: 'Runs in more than one state on an IRP cab card.' }] : []),
      ],
    },
    {
      title: 'Annual inspection', icon: faClipboardCheck,
      help: 'Every unit needs a DOT annual inspection every 12 months (49 CFR 396.17).',
      fields: [{ key: 'dotInspection', label: 'Last annual inspection', type: 'date', required: true, check: notFuture, help: 'The next one is due a year after this date.' }],
    },
    {
      title: 'Insurance', icon: faShieldHalved,
      help: 'When the policy covering this unit runs out.',
      fields: [{ key: 'insuranceExpiry', label: 'Insurance expires', type: 'date', required: true }],
    },
    ...(kind === 'truck' ? [{
      title: 'IFTA decal', icon: faGasPump,
      help: 'The fuel tax decal on the cab. Decals run to December 31 of their year.',
      fields: [{ key: 'iftaDecal', label: 'Decal number', upper: true, placeholder: 'e.g. CA 2026 118402', check: (value: string) => (iftaExpiry(value) ? null : 'Include the decal year, e.g. CA 2026 118402') }],
    }] : []),
  ];
}

export function UnitDocumentsDialog({ kind, truck, trailer, onClose }: { kind: UnitKind; truck?: FleetTruck; trailer?: FleetTrailer; onClose: () => void }) {
  const { saveTruck, saveTrailer } = useAppShell();
  const unit = truck ?? trailer;
  if (!unit) return null;
  const name = `${kind === 'truck' ? 'Truck' : 'Trailer'} ${unit.unit}`;
  const initial: FormValues = Object.fromEntries(KEYS.map((k) => [k, typeof unit.details[k] === 'string' ? unit.details[k] : '']));
  const date = (iso: string) => (iso ? fmtDate(iso) : '');

  return (
    <NlRecordDialog
      icon={faFileContract}
      heading={`${name} documents`}
      description="Keep the unit’s registration, inspection and insurance dates current."
      tip={{ title: 'Renewals', text: 'Units show as expiring in Safety › Unit Documents once a date is inside the renewal window (Settings › Operations).' }}
      summary={(v) => (
        <>
          <SumRow label="Unit" value={name} sub={kind === 'truck' ? truck?.make : trailer?.kind} />
          <SumRow label="Registration" value={date(val(v, 'registrationExpiry'))} sub={val(v, 'apportioned') === 'Yes' ? 'IRP apportioned' : undefined} />
          <SumRow label="Next annual inspection" value={date(nextYear(val(v, 'dotInspection')))} sub={val(v, 'dotInspection') ? `Last ${date(val(v, 'dotInspection'))}` : undefined} />
          <SumRow label="Insurance" value={date(val(v, 'insuranceExpiry'))} />
          {kind === 'truck' && <SumRow label="IFTA decal" value={val(v, 'iftaDecal')} sub={iftaExpiry(val(v, 'iftaDecal')) ? `Valid to ${date(iftaExpiry(val(v, 'iftaDecal')))}` : undefined} />}
        </>
      )}
      saveLabel="Save documents"
      sections={sections(kind)}
      initial={initial}
      isNew={false}
      recordLabel={name}
      noun="unit"
      deleteNote=""
      onSave={(v) => {
        const picked: FormValues = Object.fromEntries(KEYS.filter((k) => k in v).map((k) => [k, val(v, k)]));
        if (truck) saveTruck(truckFromForm({ ...truck.details, ...picked }, truck.id, truck));
        if (trailer) saveTrailer(trailerFromForm({ ...trailer.details, ...picked }, trailer.id, trailer));
        toast(`${name} documents saved.`);
      }}
      onClose={onClose}
    />
  );
}
