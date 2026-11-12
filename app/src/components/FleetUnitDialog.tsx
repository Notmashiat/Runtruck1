import { useEffect, useMemo, useRef, useState, type FocusEvent, type ReactNode } from 'react';
import {
  faArrowRight, faCheck, faChevronDown, faCircleCheck, faCircleExclamation, faExclamation, faFileSignature, faHashtag, faIdCard, faKey,
  faLink, faMagnifyingGlass, faSpinner, faTrailer, faTruck, faUserTie, faWandMagicSparkles, faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { faCalendar, faCircle, faLightbulb } from '@fortawesome/free-regular-svg-icons';
import { useAppShell } from '../context/AppShellContext';
import {
  TERMINALS, TRAILER_LENGTHS, TRAILER_MAKES, TRAILER_TYPES, TRUCK_MAKES, nextId, trailerFromForm, truckFromForm, type FleetTrailer, type FleetTruck,
  type FormValues,
} from '../data/fleet';
import { toast } from '../lib/toast';
import { decodeVin, vinProblem } from '../lib/vin';
import { Fa } from './Fa';
import { hl } from './highlight';
import { Combo, NlConfirm, Req, SecHead } from './nlParts';

// Add fleet unit / Edit unit (release 1.36), built from the AddFleet design:
// one popup for tractors and trailers — the unit and its type, the vehicle
// (with Decode VIN), ownership, and the trailer it pulls (or the tractor that
// pulls it) — with a section menu, a summary and the required details. The
// registration, inspection and insurance dates are kept by the safety team in
// Safety › Unit Documents.

export type UnitKind = 'truck' | 'trailer';

interface Values {
  unitNumber: string; type: string; length: string; vin: string; make: string; model: string; year: string;
  plateNumber: string; plateState: string; miles: string; ownership: string; lessor: string; leaseEnd: string;
}

const OWNERSHIP: { value: string; icon: typeof faKey }[] = [
  { value: 'Owned', icon: faKey }, { value: 'Leased', icon: faFileSignature }, { value: 'Rented', icon: faCalendar }, { value: 'Owner-operator', icon: faUserTie },
];
const LEASED = ['Leased', 'Rented', 'Lease-purchase'];
const SECTIONS = [
  { id: 'unit', label: 'Unit', icon: faHashtag },
  { id: 'vehicle', label: 'Vehicle details', icon: faIdCard },
  { id: 'ownership', label: 'Ownership', icon: faKey },
  { id: 'connect', label: 'Connect', icon: faLink },
] as const;
type SectionId = (typeof SECTIONS)[number]['id'];

const str = (v: FormValues, k: string) => (typeof v[k] === 'string' ? (v[k] as string) : '');
const digits = (s: string) => s.replace(/\D/g, '');
const withCommas = (s: string) => (digits(s) ? Number(digits(s)).toLocaleString('en-US') : '');
const reducedMotion = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
const later = (fn: () => void) => window.setTimeout(fn, 0);
const YEAR_MAX = new Date().getFullYear() + 1;

function valuesOf(details: FormValues | undefined, kind: UnitKind): Values {
  const d = details ?? {};
  return {
    unitNumber: str(d, 'unitNumber'), type: str(d, 'type'), length: str(d, 'length') || '53', vin: str(d, 'vin'), make: str(d, 'make'),
    model: str(d, 'model'), year: str(d, 'year'), plateNumber: str(d, 'plateNumber'), plateState: str(d, 'plateState'),
    miles: withCommas(str(d, kind === 'truck' ? 'odometer' : 'hubMiles')), ownership: str(d, 'ownership') || 'Owned', lessor: str(d, 'lessor'), leaseEnd: str(d, 'leaseEnd'),
  };
}

interface Rule { id: string; inputs: string[]; section: SectionId; m: string; bad?: string[] }

export function FleetUnitDialog({ kind: startKind, truck, trailer, onClose }: { kind: UnitKind; truck?: FleetTruck; trailer?: FleetTrailer; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const scrollRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const { trucks, trailers, saveTruck, saveTrailer, archiveTruck, archiveTrailer, deleteTruck, deleteTrailer } = useAppShell();
  const record = truck ?? trailer;
  const editing = Boolean(record);
  const [kind, setKind] = useState<UnitKind>(startKind);
  const isTractor = kind === 'truck';
  const [id] = useState(() => record?.id ?? (startKind === 'truck' ? nextId('TRK', trucks.map((t) => t.id)) : nextId('TRL', trailers.map((t) => t.id))));
  const [start] = useState<Values>(() => valuesOf(record?.details, startKind));
  const [f, setF] = useState<Values>(start);
  const startConnected = useMemo(
    () => (truck ? str(truck.details, 'trailer') : trailer ? trucks.find((t) => str(t.details, 'trailer') === trailer.unit)?.unit ?? '' : ''),
    // Only what it was connected to when the popup opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [connected, setConnected] = useState(startConnected);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [auto, setAuto] = useState<Set<keyof Values>>(() => new Set());
  const [decode, setDecode] = useState<'idle' | 'busy' | 'done'>('idle');
  const [decodeError, setDecodeError] = useState('');
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [submitted, setSubmitted] = useState(false);
  const [confirm, setConfirm] = useState<null | 'discard' | 'delete'>(null);
  const [current, setCurrent] = useState<SectionId>('unit');

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  const set = (k: keyof Values, value: string) => {
    setF((p) => ({ ...p, [k]: value }));
    setAuto((a) => {
      if (!a.has(k)) return a;
      const n = new Set(a);
      n.delete(k);
      return n;
    });
  };
  const touch = (...ids: string[]) => setTouched((t) => {
    const n = new Set(t);
    ids.forEach((x) => n.add(x));
    return n;
  });

  // — checks —
  const others = isTractor ? trucks.filter((t) => t.id !== id) : trailers.filter((t) => t.id !== id);
  const otherVins = [...trucks, ...trailers].filter((u) => u.id !== id).map((u) => str(u.details, 'vin').toUpperCase()).filter(Boolean);
  const unitUpper = f.unitNumber.trim().toUpperCase();
  const rules: Rule[] = [];
  if (!unitUpper) rules.push({ id: 'unit', inputs: ['f-unit'], section: 'unit', m: 'Enter a unit number.' });
  else if (others.some((u) => u.unit.toUpperCase() === unitUpper)) rules.push({ id: 'unit', inputs: ['f-unit'], section: 'unit', m: `Unit ${unitUpper} already exists. Use a different number.` });
  if (!isTractor && !f.type) rules.push({ id: 'ttype', inputs: ['f-ttype'], section: 'unit', m: 'Select the trailer type.' });
  const vinBad = vinProblem(f.vin) ?? (otherVins.includes(f.vin.trim().toUpperCase()) ? 'Another unit in the fleet already has this VIN.' : null);
  if (vinBad) rules.push({ id: 'vin', inputs: ['f-vin'], section: 'vehicle', m: vinBad });
  if (!f.make.trim()) rules.push({ id: 'make', inputs: ['f-make'], section: 'vehicle', m: 'Enter the make.' });
  if (!f.model.trim()) rules.push({ id: 'model', inputs: ['f-model'], section: 'vehicle', m: 'Enter the model.' });
  const y = Number(f.year);
  if (!(y >= 1980 && y <= YEAR_MAX)) rules.push({ id: 'year', inputs: ['f-year'], section: 'vehicle', m: `Enter a year between 1980 and ${YEAR_MAX}.` });
  const plateBad = [!f.plateNumber.trim() ? 'f-plate' : '', !/^[A-Za-z]{2}$/.test(f.plateState.trim()) ? 'f-pstate' : ''].filter(Boolean);
  if (plateBad.length) {
    rules.push({
      id: 'plate', inputs: ['f-plate', 'f-pstate'], section: 'vehicle', bad: plateBad,
      m: plateBad.length === 2 ? 'Enter the plate number and 2-letter state.' : plateBad[0] === 'f-plate' ? 'Enter the plate number.' : 'Use the 2-letter state code, e.g. TX.',
    });
  }
  const ruleById = new Map(rules.map((r) => [r.id, r]));
  const shown = (r?: Rule) => Boolean(r) && (submitted || touched.has(r!.id));
  const errFor = (ruleId: string) => {
    const r = ruleById.get(ruleId);
    return r && shown(r) ? <p id={`${ruleId}-err`} className="nl-err"><Fa icon={faCircleExclamation} /><span>{r.m}</span></p> : null;
  };
  const invalid = (input: string) => rules.some((r) => shown(r) && (r.bad ?? r.inputs).includes(input));
  const aria = (input: string, ruleId: string, desc?: string) => ({
    id: input, 'aria-invalid': (invalid(input) ? 'true' : 'false') as 'true' | 'false',
    'aria-describedby': [desc, shown(ruleById.get(ruleId)) ? `${ruleId}-err` : ''].filter(Boolean).join(' ') || undefined,
  });
  const onBlurCapture = (e: FocusEvent<HTMLFormElement>) => {
    const input = (e.target as HTMLElement).id;
    const next = (e.relatedTarget as HTMLElement | null)?.id ?? '';
    for (const r of [{ id: 'unit', inputs: ['f-unit'] }, { id: 'ttype', inputs: ['f-ttype'] }, { id: 'vin', inputs: ['f-vin'] }, { id: 'make', inputs: ['f-make'] },
      { id: 'model', inputs: ['f-model'] }, { id: 'year', inputs: ['f-year'] }, { id: 'plate', inputs: ['f-plate', 'f-pstate'] }]) {
      if (r.inputs.includes(input) && !r.inputs.includes(next)) touch(r.id);
    }
  };

  const sectionRules = (s: SectionId) => rules.filter((r) => r.section === s);
  const SECTION_TOTAL: Record<'unit' | 'vehicle', number> = { unit: isTractor ? 1 : 2, vehicle: 5 };
  const secDone = (['unit', 'vehicle'] as const).filter((s) => sectionRules(s).length === 0).length + 1; // ownership always has a choice
  const remaining = rules.length;
  const statusOf = (s: SectionId): ReactNode => {
    const done = <span className="nl-st-done"><Fa icon={faCheck} /><span className="nl-sr">complete</span></span>;
    if (s === 'ownership') return done;
    if (s === 'connect') return connected ? done : <span className="nl-st-opt">Optional</span>;
    const miss = sectionRules(s);
    if (!miss.length) return done;
    if (miss.some(shown)) return <span className="nl-st-err"><Fa icon={faExclamation} />{miss.length}</span>;
    return <span className="nl-st-count">{SECTION_TOTAL[s] - miss.length}/{SECTION_TOTAL[s]}</span>;
  };

  // — navigation —
  const goTo = (s: SectionId) => {
    const el = document.getElementById(`fu-sec-${s}`);
    const sc = scrollRef.current;
    if (el && sc) sc.scrollTo({ top: el.offsetTop - 16, behavior: reducedMotion() ? 'auto' : 'smooth' });
  };
  const spy = () => {
    const sc = scrollRef.current;
    if (!sc) return;
    let now: SectionId = 'unit';
    for (const s of SECTIONS) {
      const el = document.getElementById(`fu-sec-${s.id}`);
      if (el && el.offsetTop - sc.scrollTop <= 140) now = s.id;
    }
    if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4) now = 'connect';
    setCurrent(now);
  };
  const focusRule = (r: Rule) => later(() => {
    const el = document.getElementById((r.bad ?? r.inputs)[0]);
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
  });

  // — the type —
  const switchKind = (k: UnitKind) => {
    if (k === kind) return;
    if (connected) toast(`Connection removed — a ${k === 'truck' ? 'tractor connects to a trailer' : 'trailer connects to a tractor'}.`, 'info');
    setConnected('');
    setPicking(false);
    setKind(k);
    if (k === 'trailer') later(() => document.getElementById('f-ttype')?.focus());
  };

  // — Decode VIN —
  const runDecode = async () => {
    touch('vin');
    setDecodeError('');
    const problem = vinProblem(f.vin);
    if (problem) {
      later(() => document.getElementById('f-vin')?.focus());
      return;
    }
    setDecode('busy');
    const result = await decodeVin(f.vin);
    if ('error' in result) {
      setDecode('idle');
      setDecodeError(result.error);
      return;
    }
    const filled: (keyof Values)[] = [];
    setF((p) => {
      const next = { ...p };
      if (result.make) { next.make = result.make; filled.push('make'); }
      if (result.model) { next.model = result.model; filled.push('model'); }
      if (result.year) { next.year = result.year; filled.push('year'); }
      return next;
    });
    setAuto(new Set(filled));
    setDecode('done');
    toast('VIN decoded — make, model and year filled in.');
  };

  // — connect —
  const pool = isTractor ? trailers.filter((t) => !t.archived) : trucks.filter((t) => !t.archived && t.id !== id);
  const describe = (unit: string) => {
    if (isTractor) {
      const t = trailers.find((x) => x.unit === unit);
      if (!t) return { a: `Trailer ${unit}`, b: '' };
      const d = t.details;
      return { a: `Trailer ${t.unit} · ${str(d, 'length') ? `${str(d, 'length')} ft ` : ''}${str(d, 'type')}`, b: [[str(d, 'make'), str(d, 'model')].filter(Boolean).join(' '), str(d, 'year'), str(d, 'plateNumber') && `Plate ${str(d, 'plateNumber')} ${str(d, 'plateState')}`].filter(Boolean).join(' · ') };
    }
    const t = trucks.find((x) => x.unit === unit);
    if (!t) return { a: `Truck ${unit}`, b: '' };
    return { a: `Truck ${t.unit} · ${t.make}`, b: [t.driver && t.driver !== 'Unassigned' ? `Driver ${t.driver}` : 'No driver', t.plate && `Plate ${t.plate}`].filter(Boolean).join(' · ') };
  };
  const connectLabel = isTractor ? 'Connect trailer' : 'Connect to tractor';
  // The search opens with its list showing (the section gets room below it).
  const openPicker = () => {
    setPicking(true);
    setQuery('');
    later(() => {
      const el = document.getElementById('nl-fu-connect');
      el?.focus({ preventScroll: true });
      el?.click();
      const sc = scrollRef.current;
      if (sc) sc.scrollTo({ top: sc.scrollHeight, behavior: reducedMotion() ? 'auto' : 'smooth' });
    });
  };

  // — closing and saving —
  const dirty = JSON.stringify(f) !== JSON.stringify(start) || connected !== startConnected || kind !== startKind;
  const closeNow = () => {
    ref.current?.close();
    onClose();
  };
  const requestClose = () => {
    if (dirty) setConfirm('discard');
    else closeNow();
  };
  const save = () => {
    if (rules.length) {
      setSubmitted(true);
      focusRule(rules[0]);
      return;
    }
    const common: FormValues = {
      unitNumber: unitUpper, vin: f.vin.trim().toUpperCase(), make: f.make.trim(), model: f.model.trim(), year: f.year.trim(),
      plateNumber: f.plateNumber.trim().toUpperCase(), plateState: f.plateState.trim().toUpperCase(), ownership: f.ownership,
      lessor: LEASED.includes(f.ownership) ? f.lessor.trim() : '', leaseEnd: LEASED.includes(f.ownership) ? f.leaseEnd : '',
    };
    if (isTractor) {
      const details: FormValues = { ...(truck?.details ?? { status: 'In service', terminal: TERMINALS[0] ?? '', driver: '' }), ...common, odometer: digits(f.miles), trailer: connected };
      saveTruck(truckFromForm(details, id, truck));
      // A trailer is pulled by one tractor: take it off any other.
      if (connected) {
        for (const t of trucks.filter((x) => x.id !== id && str(x.details, 'trailer') === connected)) saveTruck(truckFromForm({ ...t.details, trailer: '' }, t.id, t));
      }
    } else {
      const details: FormValues = { ...(trailer?.details ?? { status: 'Empty', location: '' }), ...common, type: f.type, length: f.length, hubMiles: digits(f.miles) };
      saveTrailer(trailerFromForm(details, id, trailer));
      // The tractor that pulls it: this one now, and no other (also after a renumber).
      const names = [trailer?.unit, unitUpper].filter(Boolean) as string[];
      for (const t of trucks) {
        const has = names.includes(str(t.details, 'trailer'));
        if (t.unit === connected && str(t.details, 'trailer') !== unitUpper) saveTruck(truckFromForm({ ...t.details, trailer: unitUpper }, t.id, t));
        else if (has && t.unit !== connected) saveTruck(truckFromForm({ ...t.details, trailer: '' }, t.id, t));
      }
    }
    const name = `${isTractor ? 'Truck' : 'Trailer'} ${unitUpper}`;
    const conn = connected ? ` and connected to ${isTractor ? 'Trailer' : 'Truck'} ${connected}` : '';
    toast(editing ? `${name} saved${conn}.` : `${name} added to your fleet${conn}.`);
    closeNow();
  };
  const remove = () => {
    if (truck) deleteTruck(truck.id);
    if (trailer) deleteTrailer(trailer.id);
    toast(`${isTractor ? 'Truck' : 'Trailer'} ${record?.unit} deleted.`, 'info');
    closeNow();
  };
  const archive = () => {
    if (truck) archiveTruck(truck.id, !truck.archived);
    if (trailer) archiveTrailer(trailer.id, !trailer.archived);
    closeNow();
  };

  // — summary —
  const notSet = (t: string) => <span className="is-unset">{t}</span>;
  const vehicle = [f.year, f.make, f.model].filter((x) => x.trim()).join(' ');
  const checks = [
    { label: 'Unit number', rules: ['unit'] },
    ...(isTractor ? [] : [{ label: 'Trailer type', rules: ['ttype'] }]),
    { label: 'VIN', rules: ['vin'] },
    { label: 'Make, model & year', rules: ['make', 'model', 'year'] },
    { label: 'License plate & state', rules: ['plate'] },
  ];
  const checkDone = checks.filter((c) => c.rules.every((r) => !ruleById.has(r)));
  const milesLabel = isTractor ? 'Odometer' : 'Hub mileage';
  const conn = connected ? describe(connected) : null;

  const statusLine = remaining === 0
    ? <><Fa icon={faCircleCheck} className="is-ok" /><span className="is-ok-text">{editing ? 'Ready to save' : 'Ready to add'}</span></>
    : submitted
      ? <><Fa icon={faCircleExclamation} className="is-bad" /><span className="is-bad-text">Fix {remaining} field{remaining > 1 ? 's' : ''} to {editing ? 'save' : 'add'} this unit</span></>
      : <><span className="nl-req">*</span><span className="is-left">{remaining} required field{remaining > 1 ? 's' : ''} left</span></>;
  const ownershipOptions = OWNERSHIP.some((o) => o.value === f.ownership) || !f.ownership ? OWNERSHIP : [...OWNERSHIP, { value: f.ownership, icon: faFileSignature }];

  return (
    <dialog
      ref={ref}
      className="nl"
      aria-labelledby="fu-title"
      aria-describedby="fu-desc"
      onCancel={(e) => {
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        if (confirm) setConfirm(null);
        else requestClose();
      }}
      onClose={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !confirm) { e.preventDefault(); save(); }
      }}
    >
      <datalist id="fu-makes">{(isTractor ? TRUCK_MAKES : TRAILER_MAKES).map((m) => <option key={m} value={m} />)}</datalist>

      <header className="nl-head">
        <div className="nl-head-left">
          <div className="nl-head-ico"><Fa icon={isTractor ? faTruck : faTrailer} /></div>
          <div>
            <h1 id="fu-title" ref={titleRef} tabIndex={-1} className="nl-title">{editing ? `Edit ${isTractor ? 'truck' : 'trailer'} ${record?.unit}` : 'Add fleet unit'}</h1>
            <p id="fu-desc" className="nl-desc">{editing ? 'Change the unit’s details below.' : 'Add a tractor or trailer to your fleet.'} <span className="nl-req">*</span> Required.</p>
          </div>
        </div>
        <div className="nl-head-right">
          <div className="nl-progress">
            <div className="nl-progress-row"><span>Progress</span><span>{secDone} of 3 sections</span></div>
            <div className="nl-progress-track" role="progressbar" aria-label="Sections completed" aria-valuemin={0} aria-valuemax={3} aria-valuenow={secDone}>
              <div className="nl-progress-bar" style={{ width: `${(secDone / 3) * 100}%` }} />
            </div>
          </div>
          <button type="button" className="nl-x nl-fbtn" aria-label="Close and cancel" onClick={requestClose}><Fa icon={faXmark} /></button>
        </div>
      </header>

      <div className="nl-body">
        <aside className="nl-side">
          <nav aria-label="Form sections">
            <p className="nl-side-head">Sections</p>
            {SECTIONS.map((s) => (
              <button
                key={s.id} type="button" className={`nl-navlink nl-fbtn${current === s.id ? ' is-active' : ''}`}
                aria-current={current === s.id ? 'true' : undefined} onClick={() => goTo(s.id)}
              >
                <span className="nl-nav-ico"><Fa icon={s.icon} /></span>
                <span className="nl-nav-label">{s.id === 'connect' ? connectLabel : s.label}</span>
                <span className="nl-nav-status">{statusOf(s.id)}</span>
              </button>
            ))}
          </nav>
          <div className="nl-tip">
            <div className="nl-tip-head"><Fa icon={faLightbulb} /> Save time</div>
            <p>Enter the VIN and use <b>Decode VIN</b> to fill make, model and year.</p>
          </div>
        </aside>

        <main className="nl-main" ref={scrollRef} onScroll={spy}>
          <div className="nl-tabs">
            {SECTIONS.map((s) => (
              <button key={s.id} type="button" className={`nl-tab${current === s.id ? ' is-active' : ''}`} onClick={() => goTo(s.id)}>{s.id === 'connect' ? connectLabel : s.label}</button>
            ))}
          </div>

          <form className="nl-form" autoComplete="off" noValidate onSubmit={(e) => e.preventDefault()} onBlur={onBlurCapture}>
            {record?.archived && (
              <div className="nl-warn" style={{ marginTop: 0 }}>
                <Fa icon={faCircleExclamation} />
                <span>This unit is archived: hidden from lists and pickers but kept on file. Restore it to use it again.</span>
              </div>
            )}

            {/* 1. Unit */}
            <section id="fu-sec-unit" className="nl-sec">
              <SecHead title="Unit" sub="How this unit is identified in your fleet, and what it is." />
              <div className="nl-card nl-stack-5">
                <div className="nl-g sm-2">
                  <div>
                    <label className="nl-lbl" htmlFor="f-unit">Unit number <Req /></label>
                    <div className="nl-rel">
                      <span className="nl-in-ico is-12"><Fa icon={faHashtag} /></span>
                      <input
                        {...aria('f-unit', 'unit', 'unit-hint')} aria-required="true" className="nl-inp nl-pl-9 is-upper" placeholder="e.g. 128 or T-505"
                        value={f.unitNumber} onChange={(e) => set('unitNumber', e.target.value.toUpperCase())}
                      />
                    </div>
                    <p id="unit-hint" className="nl-hint">Must be unique. Shown on loads, dispatch texts and reports.</p>
                    {errFor('unit')}
                  </div>
                </div>
                <div>
                  <span id="fu-type-label" className="nl-lbl">Fleet type <Req /></span>
                  <div className="nl-g sm-2 gap-3" role="radiogroup" aria-labelledby="fu-type-label">
                    {([['truck', 'Tractor', 'Power unit that pulls a trailer', faTruck], ['trailer', 'Trailer', 'Van, reefer, flatbed and more', faTrailer]] as const).map(([k, title, sub, icon]) => (
                      <label key={k} className={editing && k !== kind ? 'fu-pick-off' : undefined}>
                        <input type="radio" name="fu-type" className="nl-sr-input" checked={kind === k} disabled={editing} onChange={() => switchKind(k)} />
                        <span className="fu-pick">
                          <span className="fu-pick-ico"><Fa icon={icon} /></span>
                          <span><span className="fu-pick-title">{title}</span><span className="fu-pick-sub">{sub}</span></span>
                        </span>
                      </label>
                    ))}
                  </div>
                  {editing && <p className="nl-hint">A unit stays a {isTractor ? 'tractor' : 'trailer'} once added.</p>}
                </div>
                {!isTractor && (
                  <div className="nl-g sm-2 fu-split">
                    <div>
                      <label className="nl-lbl" htmlFor="f-ttype">Trailer type <Req /></label>
                      <div className="nl-rel">
                        <select {...aria('f-ttype', 'ttype')} className="nl-inp" value={f.type} onChange={(e) => set('type', e.target.value)}>
                          <option value="">Select type</option>
                          {TRAILER_TYPES.map((t) => <option key={t}>{t}</option>)}
                          {f.type && !TRAILER_TYPES.includes(f.type) && <option>{f.type}</option>}
                        </select>
                        <span className="nl-chev"><Fa icon={faChevronDown} /></span>
                      </div>
                      {errFor('ttype')}
                    </div>
                    <div>
                      <label className="nl-lbl" htmlFor="f-tlength">Length</label>
                      <div className="nl-rel">
                        <select id="f-tlength" className="nl-inp" value={f.length} onChange={(e) => set('length', e.target.value)}>
                          {[...TRAILER_LENGTHS].reverse().map((l) => <option key={l} value={l}>{l} ft</option>)}
                        </select>
                        <span className="nl-chev"><Fa icon={faChevronDown} /></span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* 2. Vehicle details */}
            <section id="fu-sec-vehicle" className="nl-sec">
              <SecHead title="Vehicle details" sub="From the registration card. Decoding the VIN fills make, model and year." />
              <div className="nl-card nl-g sm-6">
                <div className="sm-span-6">
                  <label className="nl-lbl" htmlFor="f-vin">VIN <Req /></label>
                  <div className="fu-vin">
                    <input
                      {...aria('f-vin', 'vin', 'vin-count')} aria-required="true" maxLength={17} className="nl-inp fu-mono is-upper"
                      placeholder="17 characters, e.g. 1FUJHHDR2NLNA1234" value={f.vin}
                      onChange={(e) => { set('vin', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')); setDecode('idle'); setDecodeError(''); }}
                    />
                    <button type="button" className="nl-btn-line fu-decode nl-fbtn" disabled={decode === 'busy'} onClick={() => void runDecode()}>
                      {decode === 'busy' ? <><Fa icon={faSpinner} spin />Decoding…</> : decode === 'done' ? <><Fa icon={faCircleCheck} className="fu-ok" />Decoded</> : <><Fa icon={faWandMagicSparkles} />Decode VIN</>}
                    </button>
                  </div>
                  <p id="vin-count" className="nl-hint">{f.vin.length} / 17 characters</p>
                  {errFor('vin')}
                  {decodeError && <p className="nl-err" role="alert"><Fa icon={faCircleExclamation} /><span>{decodeError}</span></p>}
                </div>
                <div className="sm-span-2">
                  <label className="nl-lbl" htmlFor="f-make">Make <Req /></label>
                  <input {...aria('f-make', 'make')} aria-required="true" list="fu-makes" className={`nl-inp${auto.has('make') ? ' is-auto' : ''}`} placeholder={isTractor ? 'e.g. Freightliner' : 'e.g. Utility'} value={f.make} onChange={(e) => set('make', e.target.value)} />
                  {errFor('make')}
                </div>
                <div className="sm-span-2">
                  <label className="nl-lbl" htmlFor="f-model">Model <Req /></label>
                  <input {...aria('f-model', 'model')} aria-required="true" className={`nl-inp${auto.has('model') ? ' is-auto' : ''}`} placeholder={isTractor ? 'e.g. Cascadia' : 'e.g. 3000R'} value={f.model} onChange={(e) => set('model', e.target.value)} />
                  {errFor('model')}
                </div>
                <div className="sm-span-2">
                  <label className="nl-lbl" htmlFor="f-year">Year <Req /></label>
                  <input {...aria('f-year', 'year')} aria-required="true" inputMode="numeric" maxLength={4} className={`nl-inp${auto.has('year') ? ' is-auto' : ''}`} placeholder="YYYY" value={f.year} onChange={(e) => set('year', e.target.value.replace(/\D/g, ''))} />
                  {errFor('year')}
                </div>
                <div className="sm-span-4">
                  <div className="fu-plate">
                    <div>
                      <label className="nl-lbl" htmlFor="f-plate">License plate <Req /></label>
                      <input {...aria('f-plate', 'plate')} aria-required="true" maxLength={10} className="nl-inp is-upper" placeholder="e.g. AB12345" value={f.plateNumber} onChange={(e) => set('plateNumber', e.target.value.toUpperCase().replace(/[^A-Z0-9 -]/g, ''))} />
                    </div>
                    <div>
                      <label className="nl-lbl" htmlFor="f-pstate">State <Req /></label>
                      <input {...aria('f-pstate', 'plate')} aria-required="true" maxLength={2} className="nl-inp is-upper" placeholder="TX" value={f.plateState} onChange={(e) => set('plateState', e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} />
                    </div>
                  </div>
                  {errFor('plate')}
                </div>
                <div className="sm-span-2">
                  <label className="nl-lbl" htmlFor="f-miles">{milesLabel} <span className="nl-opt">(optional)</span></label>
                  <div className="nl-rel">
                    <input id="f-miles" inputMode="numeric" className="nl-inp fu-pr" placeholder="0" value={f.miles} onChange={(e) => set('miles', e.target.value.replace(/[^\d,]/g, ''))} onBlur={(e) => set('miles', withCommas(e.target.value))} />
                    <span className="fu-suffix">mi</span>
                  </div>
                </div>
              </div>
            </section>

            {/* 3. Ownership */}
            <section id="fu-sec-ownership" className="nl-sec">
              <SecHead title="Ownership" sub="Who owns this unit and on what terms." />
              <div className="nl-card nl-stack-5">
                <div>
                  <span id="fu-own-label" className="nl-lbl">Ownership status <Req /></span>
                  <div className="fu-own" role="radiogroup" aria-labelledby="fu-own-label">
                    {ownershipOptions.map((o) => (
                      <label key={o.value}>
                        <input type="radio" name="fu-own" className="nl-sr-input" checked={f.ownership === o.value} onChange={() => set('ownership', o.value)} />
                        <span className="fu-pick is-small">
                          <span className="fu-pick-ico"><Fa icon={o.icon} /></span>
                          <span className="fu-pick-title is-medium">{o.value}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
                {LEASED.includes(f.ownership) && (
                  <div className="nl-g sm-2 fu-split">
                    <div>
                      <label className="nl-lbl" htmlFor="f-lessor">{f.ownership === 'Rented' ? 'Rental company' : 'Leasing company'} <span className="nl-opt">(optional)</span></label>
                      <input id="f-lessor" className="nl-inp" placeholder="e.g. Penske, Ryder" value={f.lessor} onChange={(e) => set('lessor', e.target.value)} />
                    </div>
                    <div>
                      <label className="nl-lbl" htmlFor="f-term">Term ends <span className="nl-opt">(optional)</span></label>
                      <input id="f-term" type="date" max="9999-12-31" className="nl-inp" value={f.leaseEnd} onChange={(e) => set('leaseEnd', e.target.value)} />
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* 4. Connect */}
            <section id="fu-sec-connect" className={`nl-sec is-last${picking ? ' fu-picking' : ''}`}>
              <SecHead title={connectLabel} sub={isTractor ? 'Optional — link the trailer this tractor usually pulls. You can change it any time.' : 'Optional — link the tractor that usually pulls this trailer. You can change it any time.'} />
              <div className="nl-card">
                {!connected && !picking && (
                  <button type="button" className="fu-connect nl-fbtn" onClick={openPicker}>
                    <Fa icon={faLink} />{connectLabel}
                  </button>
                )}
                {picking && (
                  <div>
                    <div className="nl-row-between">
                      <label className="nl-lbl is-flush" htmlFor="nl-fu-connect">{isTractor ? 'Search trailers' : 'Search tractors'}</label>
                      <button type="button" className="nl-textbtn nl-fbtn" onClick={() => setPicking(false)}>Cancel</button>
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <Combo
                        id="fu-connect" value={query} onQuery={setQuery}
                        items={(q) => pool.filter((u) => `${u.unit} ${describe(u.unit).a} ${describe(u.unit).b}`.toLowerCase().includes(q.toLowerCase()))}
                        keyOf={(u) => u.id}
                        render={(u, q) => {
                          const d = describe(u.unit);
                          return (
                            <>
                              <span className="fu-opt-ico"><Fa icon={isTractor ? faTrailer : faTruck} /></span>
                              <span className="fu-opt-text"><span className="fu-opt-a">{hl(d.a, q)}</span><span className="fu-opt-b">{d.b}</span></span>
                            </>
                          );
                        }}
                        onPick={(u) => { setConnected(u.unit); setPicking(false); }}
                        placeholder={isTractor ? 'Search by unit #, type or make' : 'Search by unit #, make or driver'} listLabel={isTractor ? 'Trailers' : 'Tractors'}
                        icon={faMagnifyingGlass} none={(q) => `No ${isTractor ? 'trailers' : 'tractors'} match “${q}”.`}
                      />
                    </div>
                  </div>
                )}
                {connected && !picking && conn && (
                  <div>
                    <p className="nl-lbl">{isTractor ? 'Connected trailer' : 'Connected tractor'}</p>
                    <div className="fu-selected">
                      <div className="fu-selected-main">
                        <span className="fu-selected-ico"><Fa icon={isTractor ? faTrailer : faTruck} /></span>
                        <div>
                          <p className="fu-selected-a">{conn.a}</p>
                          <p className="fu-selected-b">{conn.b}</p>
                        </div>
                      </div>
                      <div className="fu-selected-btns">
                        <button type="button" className="nl-btn-white fu-small nl-fbtn" onClick={openPicker}>Change</button>
                        <button type="button" className="nl-btn-ghost fu-small nl-fbtn" onClick={() => setConnected('')}>Disconnect</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </form>
        </main>

        <aside className="nl-sum" aria-labelledby="fu-h-summary">
          <h3 id="fu-h-summary">Unit summary</h3>
          <div className="fu-sum-unit">
            <span className="fu-sum-ico"><Fa icon={isTractor ? faTruck : faTrailer} /></span>
            <div>
              <p className="fu-sum-name">{unitUpper ? `${isTractor ? 'Truck' : 'Trailer'} ${unitUpper}` : notSet('Unit # not set')}</p>
              <p className="fu-sum-type">{isTractor ? 'Tractor' : `Trailer${f.type ? ` · ${f.length} ft ${f.type}` : ''}`}</p>
            </div>
          </div>
          <dl className="fu-sum-list">
            <div><dt>Vehicle</dt><dd>{vehicle || notSet('Not set')}</dd></div>
            <div><dt>VIN</dt><dd className="fu-mono">{f.vin || notSet('Not set')}</dd></div>
            <div><dt>License plate</dt><dd>{f.plateNumber ? `${f.plateNumber}${f.plateState ? ` · ${f.plateState}` : ''}` : notSet('Not set')}</dd></div>
            <div><dt>{milesLabel}</dt><dd>{f.miles ? `${f.miles} mi` : notSet('Not set')}</dd></div>
            <div><dt>Ownership</dt><dd>{f.ownership}{LEASED.includes(f.ownership) && f.lessor.trim() && <span className="is-unset"> · {f.lessor.trim()}</span>}</dd></div>
            <div><dt>{isTractor ? 'Connected trailer' : 'Connected tractor'}</dt><dd>{conn ? <>{isTractor ? 'Trailer' : 'Truck'} {connected}<span className="nl-sum-sub">{conn.a.replace(/^(Trailer|Truck) \S+ · /, '')}</span></> : notSet('Not connected')}</dd></div>
          </dl>
          <div className="nl-check">
            <div className="nl-check-top"><h3>Required details</h3><span>{checkDone.length} of {checks.length}</span></div>
            <ul className="nl-checklist">
              {checks.map((c) => (c.rules.every((r) => !ruleById.has(r)) ? (
                <li key={c.label} className="nl-check-done"><Fa icon={faCircleCheck} /><span>{c.label}</span><span className="nl-sr">(complete)</span></li>
              ) : (
                <li key={c.label}>
                  <button type="button" className="nl-check-todo nl-fbtn" onClick={() => { touch(...c.rules); const first = c.rules.map((r) => ruleById.get(r)).find(Boolean); if (first) focusRule(first); }}>
                    <Fa icon={faCircle} className={`nl-c-ico${c.rules.some((r) => shown(ruleById.get(r))) ? ' is-red' : ''}`} />
                    <span className="nl-c-label">{c.label}</span>
                    <span className="nl-sr">(missing — go to field)</span>
                    <Fa icon={faArrowRight} className="nl-c-arrow" />
                  </button>
                </li>
              )))}
            </ul>
          </div>
        </aside>
      </div>

      <footer className="nl-foot">
        <div className="nl-foot-row">
          <div className="nl-foot-left">
            <p role="status" aria-live="polite" className="nl-status">{statusLine}</p>
            <span className="nl-keys"><kbd>Ctrl</kbd>+<kbd>Enter</kbd> save <span className="nl-bar">|</span> <kbd>Esc</kbd> cancel</span>
          </div>
          <div className="nl-foot-btns">
            {editing && <button type="button" className="nl-btn-danger-line nl-fbtn" onClick={() => setConfirm('delete')}>Delete</button>}
            {editing && <button type="button" className="nl-btn-white nl-fbtn" onClick={archive}>{record?.archived ? 'Restore' : 'Archive'}</button>}
            <button type="button" className="nl-btn-ghost nl-fbtn" onClick={requestClose}>Cancel</button>
            <button type="button" className="nl-btn-main nl-fbtn" onClick={save}>
              <span>{editing ? 'Save changes' : isTractor ? 'Add tractor' : 'Add trailer'}</span><Fa icon={faArrowRight} />
            </button>
          </div>
        </div>
      </footer>

      {confirm && (
        <NlConfirm
          danger={confirm === 'delete'}
          title={confirm === 'delete' ? `Delete ${isTractor ? 'truck' : 'trailer'} ${record?.unit}?` : 'Discard unsaved changes?'}
          body={confirm === 'delete'
            ? `It’s removed from the fleet for good${truck && truck.driver !== 'Unassigned' ? `, and ${truck.driver} is left without a truck` : ''}. Loads keep their history. To keep the record but hide it (sold or traded in), use Archive instead.`
            : editing ? `The changes you’ve made to ${record?.unit} won’t be saved.` : 'You’ve started adding this unit. If you cancel now, what you’ve entered won’t be saved.'}
          confirmLabel={confirm === 'delete' ? `Delete ${isTractor ? 'truck' : 'trailer'}` : 'Discard'}
          onConfirm={confirm === 'delete' ? remove : closeNow}
          onCancel={() => setConfirm(null)}
        />
      )}
    </dialog>
  );
}
