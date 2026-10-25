import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useAppShell } from '../context/AppShellContext';
import { money } from '../data/accounting';
import { facilityFor, isRoad, type Facility } from '../data/facilities';
import { CUSTOMERS, type Load } from '../data/mock';
import { isLive } from '../lib/releases';
import { AttachDialog } from './AttachDialog';
import { FacilityDialog } from './FacilityDialog';
import { Choice, ConfirmDelete, Field } from './LoadFormBits';
import { SearchSelect } from './SearchSelect';
import {
  DOCUMENTS, FREIGHT_CLASSES, INITIAL, LTL_SERVICES, MODES, PACKAGING, draftFromLoad, emptyStop, estimateMiles, fuelFor, nextId, num,
  positive, toLoad, type Draft, type StopDraft,
} from './loadForm';

// The New Load / Edit load popup from release 1.18: one Load Information page
// with the pickup, the delivery and the freight side by side, then Stops (the
// ones in between), LTL and Documents. The truck brings its driver with it
// (Fleet › Trucks), so there is no driver field. Fuel surcharge, miles and
// rate per mile are worked out, not typed.

type Page = 'Load info' | 'Stops' | 'LTL' | 'Documents';
const PAGES: Page[] = ['Load info', 'Stops', 'LTL', 'Documents'];
const PAGE_TITLE: Record<Page, string> = { 'Load info': 'Load Information', Stops: 'Stops', LTL: 'LTL', Documents: 'Documents' };

type Errors = Partial<Record<Page, string[]>>;

// "Fresno, CA" → city and state, split at the last comma.
function parsePlace(text: string) {
  const at = text.lastIndexOf(',');
  return at < 0 ? { city: text.trim(), state: '' } : { city: text.slice(0, at).trim(), state: text.slice(at + 1).trim().toUpperCase() };
}
const placeOf = (s: StopDraft) => s.place ?? (s.city && s.state ? `${s.city}, ${s.state}` : s.city);

// A stop's window as date-and-time fields: it opens on its date, and closes on
// toDate (or the same day).
const opens = (s: StopDraft) => (s.date ? `${s.date}T${s.from || '00:00'}` : '');
const closes = (s: StopDraft) => ((s.toDate || s.date) && s.to ? `${s.toDate || s.date}T${s.to}` : '');
const MAX_DT = '9999-12-31T23:59';

// "Nov 5th, 2026 - 02:00": the day a stop's window opens, and its time.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function whenText(s: StopDraft) {
  const [y, m, day] = s.date.split('-').map(Number);
  if (!y || !m || !day) return 'No date yet';
  const th = day % 100 >= 11 && day % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][day % 10] ?? 'th';
  return `${MONTHS[m - 1]} ${day}${th}, ${y}${s.from ? ` - ${s.from}` : ''}`;
}
// The date boxes have no calendar icon (see shell.css), so a click opens the picker.
const openPicker = (e: MouseEvent<HTMLInputElement>) => {
  try {
    e.currentTarget.showPicker();
  } catch {
    // Not supported, or already open: typing still works.
  }
};

// What has to be filled in, per page. The first stop and the last are the
// pickup and delivery on Load info; the ones between are on Stops.
function validate(d: Draft, editing: boolean): Errors {
  const e: Errors = {};
  const add = (p: Page, msg: string) => (e[p] ??= []).push(msg);
  const last = d.stops.length - 1;
  const nameOf = (i: number) => (i === 0 ? 'Pickup' : i === last ? 'Delivery' : `Stop ${i + 1}`);
  const pageOf = (i: number): Page => (i === 0 || i === last ? 'Load info' : 'Stops');

  if (!d.customer) add('Load info', 'Customer');
  d.stops.forEach((s, i) => {
    const n = nameOf(i);
    const p = pageOf(i);
    if (!s.facility.trim()) add(p, `${n} facility`);
    if (!s.address.trim()) add(p, `${n} address`);
    if (!s.city.trim() || !s.state.trim()) add(p, `${n} city and state`);
    if (!s.date) add(p, `${n} date`);
    if (closes(s) && opens(s) && closes(s) < opens(s)) add(p, `${n} window closes before it opens`);
    const prev = d.stops[i - 1];
    if (s.date && prev?.date && s.date < prev.date) add(p, `${n} date is before ${nameOf(i - 1).toLowerCase()}`);
  });
  if (!d.commodity.trim()) add('Load info', 'Commodity');
  if (!positive(d.weight)) add('Load info', 'Weight');
  if (!positive(d.lineHaul)) add('Load info', 'Rate');
  if (d.hazmat && !d.unNumbers.some((x) => x.trim()) && !(editing && d.unNumber.trim())) add('Load info', 'UN number');
  if (d.mode === 'LTL') {
    if (!d.freightClass) add('LTL', 'Freight class');
    if (!positive(d.handlingUnits)) add('LTL', 'Handling units');
  }
  return e;
}

interface LoadFormDialogProps {
  load?: Load;
  onClose: () => void;
  onSaved?: (id: string) => void;
  onDeleted?: () => void;
}

export function LoadFormDialog({ load, onClose, onSaved, onDeleted }: LoadFormDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLElement>(null);
  const { loads, addLoad, updateLoad, deleteLoad, trucks, facilities } = useAppShell();
  // Truck stops and scales are not pickup or delivery sites; archived records are not offered.
  const activeFacilities = facilities.filter((x) => !x.archived && !isRoad(x.type));
  const activeTrucks = trucks.filter((x) => !x.archived);
  const [initial] = useState<Draft>(() => {
    if (!load) return INITIAL;
    const d = draftFromLoad(load);
    // A load saved before release 1.18 has its UN numbers as one line.
    return d.unNumbers.length || !d.unNumber ? d : { ...d, unNumbers: d.unNumber.split(',').map((x) => x.trim()) };
  });
  const [d, setD] = useState<Draft>(initial);
  const [page, setPage] = useState<Page>('Load info');
  const [showErrors, setShowErrors] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [attachingDoc, setAttachingDoc] = useState<string | null>(null);
  // The stop open for editing on the Stops page.
  const [openStop, setOpenStop] = useState<number | null>(null);
  // From release 1.19: customer, truck and facility are searchable, and a
  // facility that is not on file yet is added from here (the stop it is for, and the name typed).
  const searchable = isLive('load-form-search');
  const [addingFacility, setAddingFacility] = useState<{ stop: number; name: string } | null>(null);
  const editing = Boolean(load);

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);

  const errors = validate(d, editing);
  const dirty = JSON.stringify(d) !== JSON.stringify(initial);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setD((prev) => ({ ...prev, [key]: value }));
  const setStop = (i: number, patch: Partial<StopDraft>) =>
    setD((prev) => ({ ...prev, stops: prev.stops.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const missing = (p: Page, msg: string) => showErrors && Boolean(errors[p]?.includes(msg));

  // Picking a registered facility fills in its address and site contact.
  const setFacility = (i: number, name: string) => {
    const f = facilityFor(activeFacilities, name);
    if (f) fillFacility(i, f);
    else setStop(i, { facility: name });
  };
  const fillFacility = (i: number, f: Facility) => {
    const t = (k: string) => (typeof f.details[k] === 'string' ? (f.details[k] as string).trim() : '');
    const pickup = d.stops[i].kind === 'Pickup';
    const who = (pickup ? t('shipName') : t('recvName')) || t('shipName');
    const phone = (pickup ? t('shipPhone') : t('recvPhone')) || t('shipPhone') || t('phone');
    setStop(i, {
      facility: f.name, address: t('street'), city: t('city'), state: t('state'), zip: t('zip'), place: undefined,
      contact: d.stops[i].contact || [who, phone].filter(Boolean).join(' · '),
    });
  };

  // The truck brings the driver it is assigned to in Fleet › Trucks.
  const setTruck = (unit: string) => {
    const truck = activeTrucks.find((x) => x.unit === unit);
    const driver = truck && truck.driver && truck.driver !== 'Unassigned' ? truck.driver : '';
    setD((prev) => ({ ...prev, truck: unit, driver: prev.brokered ? prev.driver : driver }));
  };

  // Worked out, not typed. An edited load keeps the fuel surcharge it was saved
  // with until its rate changes; miles need every stop to be a registered facility.
  const lineHaul = num(d.lineHaul);
  const fuel = editing && d.lineHaul === initial.lineHaul ? num(d.fuel) : fuelFor(lineHaul);
  const miles = estimateMiles(d.stops, activeFacilities) ?? (num(d.miles) || undefined);
  const rpm = miles && lineHaul > 0 ? `$${(lineHaul / miles).toFixed(2)}` : '—';

  const go = (p: Page) => {
    setPage(p);
    bodyRef.current?.scrollTo({ top: 0 });
  };

  // Close and tell the page right away rather than waiting for the dialog's
  // close event (which browsers deliver later, and not at all in hidden tabs).
  const closeNow = () => {
    ref.current?.close();
    onClose();
  };
  const requestClose = () => {
    const message = editing ? 'Discard your changes to this load?' : 'Discard this new load? What you entered will be lost.';
    if (!dirty || window.confirm(message)) closeNow();
  };

  const save = () => {
    const firstBad = PAGES.find((p) => errors[p]?.length);
    if (firstBad) {
      setShowErrors(true);
      go(firstBad);
      return;
    }
    const un = d.unNumbers.map((x) => x.trim()).filter(Boolean);
    const done: Draft = {
      ...d,
      fuel: String(fuel),
      miles: miles ? String(miles) : d.miles,
      unNumbers: un,
      unNumber: d.hazmat ? un.join(', ') || d.unNumber : '',
    };
    const saved = load ? toLoad(done, load.id, load) : toLoad(done, nextId(loads));
    let id = saved.id;
    if (load) updateLoad(saved);
    else id = addLoad(saved);
    closeNow();
    onSaved?.(id);
  };

  const remove = () => {
    if (!load) return;
    deleteLoad(load.id);
    setConfirmDelete(false);
    closeNow();
    onDeleted?.();
  };

  // One stop's fields: the pickup and delivery columns on Load info, and each
  // stop on the Stops page.
  const stopFields = (i: number, title: ReactNode) => {
    const s = d.stops[i];
    const p: Page = i === 0 || i === d.stops.length - 1 ? 'Load info' : 'Stops';
    const n = i === 0 ? 'Pickup' : i === d.stops.length - 1 ? 'Delivery' : `Stop ${i + 1}`;
    const bad = (what: string) => missing(p, `${n} ${what}`);
    const when = s.kind === 'Pickup' ? 'Pickup' : 'Delivery';
    return (
      <div className="nlf-col">
        <div className="nlf-title">{title}</div>
        <Field label="Facility Name" invalid={bad('facility')} group={searchable}>
          {searchable ? (
            <SearchSelect
              ariaLabel={`${n} facility`} value={s.facility} invalid={bad('facility')} placeholder="Search facilities"
              options={activeFacilities.map((f) => ({ value: f.name, hint: `${f.type} · ${f.city}, ${f.state}` }))}
              onChange={(name) => setFacility(i, name)}
              addLabel={(q) => (q ? `Add facility “${q}”` : 'Add facility')}
              onAdd={(q) => setAddingFacility({ stop: i, name: q })}
            />
          ) : (
            <input className="ui-input" list="nlf-facilities" value={s.facility} onChange={(e) => setFacility(i, e.target.value)} />
          )}
        </Field>
        <Field label="Address" invalid={bad('address')}>
          <input className="ui-input" value={s.address} onChange={(e) => setStop(i, { address: e.target.value })} />
        </Field>
        <div className="nlf-pair is-zip">
          <Field label="City, State" invalid={bad('city and state')}>
            <input
              className="ui-input" value={placeOf(s)} placeholder="Fresno, CA"
              onChange={(e) => setStop(i, { place: e.target.value, ...parsePlace(e.target.value) })}
            />
          </Field>
          <Field label="Zip">
            <input className="ui-input" value={s.zip} inputMode="numeric" onChange={(e) => setStop(i, { zip: e.target.value })} />
          </Field>
        </div>
        <div className="nlf-gap" />
        <div className="nlf-sub">{when} date, time</div>
        <div className="nlf-pair is-dates">
          <Field label="From" invalid={showErrors && (errors[p] ?? []).some((m) => m === `${n} date` || m.startsWith(`${n} date is before`))}>
            <input
              className="ui-input" type="datetime-local" max={MAX_DT} onClick={openPicker} value={opens(s)}
              onChange={(e) => setStop(i, { date: e.target.value.slice(0, 10), from: e.target.value.slice(11, 16) })}
            />
          </Field>
          <Field label="To" invalid={bad('window closes before it opens')}>
            <input
              className="ui-input" type="datetime-local" max={MAX_DT} onClick={openPicker} value={closes(s)}
              onChange={(e) => setStop(i, { toDate: e.target.value.slice(0, 10), to: e.target.value.slice(11, 16) })}
            />
          </Field>
        </div>
        <div className="nlf-sub">Actual</div>
        <div className="nlf-pair is-dates">
          <Field label="From">
            <input className="ui-input" type="datetime-local" max={MAX_DT} onClick={openPicker} value={s.actualFrom ?? ''} onChange={(e) => setStop(i, { actualFrom: e.target.value })} />
          </Field>
          <Field label="To">
            <input className="ui-input" type="datetime-local" max={MAX_DT} onClick={openPicker} value={s.actualTo ?? ''} onChange={(e) => setStop(i, { actualTo: e.target.value })} />
          </Field>
        </div>
        <div className="nlf-gap" />
        <Field label="PO#">
          <input className="ui-input" value={s.po1 ?? ''} onChange={(e) => setStop(i, { po1: e.target.value })} />
        </Field>
        <Field label="PO#">
          <input className="ui-input" value={s.po2 ?? ''} onChange={(e) => setStop(i, { po2: e.target.value })} />
        </Field>
      </div>
    );
  };

  const banner = (p: Page) => showErrors && errors[p]?.length ? <div className="ui-errors">Fill in: {errors[p]?.join(' · ')}</div> : null;
  const last = d.stops.length - 1;
  const nextPage = PAGES[PAGES.indexOf(page) + 1];

  const pages: Record<Page, ReactNode> = {
    'Load info': (
      <>
        {banner('Load info')}
        <div className="nlf-grid">
          <Field label="Customer" invalid={missing('Load info', 'Customer')} group={searchable}>
            <SearchSelect
              plain={!searchable} ariaLabel="Customer" value={d.customer} placeholder={searchable ? 'Search customers' : 'Select a customer'}
              invalid={missing('Load info', 'Customer')}
              options={CUSTOMERS.map((c) => ({ value: c.name, hint: c.contact }))}
              onChange={(name) => {
                const c = CUSTOMERS.find((x) => x.name === name);
                setD((prev) => ({ ...prev, customer: name, billTo: prev.billTo || name, terms: c?.terms ?? prev.terms }));
              }}
            />
          </Field>
          <Field label="Tender #">
            <input className="ui-input" value={d.ref} onChange={(e) => set('ref', e.target.value)} />
          </Field>
          <div className="ui-field" role="group" aria-label="Truck">
            <span className="ui-field-label">Truck</span>
            <SearchSelect
              plain={!searchable} ariaLabel="Truck" value={d.truck} emptyLabel="None yet" placeholder="Search trucks or drivers"
              // Searchable by its driver too, since that is who a dispatcher has in mind.
              options={activeTrucks.map((x) => ({ value: x.unit, hint: `${x.driver && x.driver !== 'Unassigned' ? x.driver : 'No driver'} · ${x.status}` }))}
              onChange={setTruck}
            />
            <span className="ui-field-help">
              {d.brokered ? `Partner carrier: ${d.carrier || '—'}` : d.truck ? `Driver: ${d.driver || 'none assigned to this truck'}` : 'Its driver comes with it'}
            </span>
          </div>

          {stopFields(0, 'Pickup Information')}
          {stopFields(last, 'Delivery Information')}

          <div className="nlf-col nlf-freight">
            <div className="nlf-title">Freight Information</div>
            <Field label="Commodity" invalid={missing('Load info', 'Commodity')}>
              <input className="ui-input" value={d.commodity} onChange={(e) => set('commodity', e.target.value)} />
            </Field>
            <div className="nlf-pair">
              <Field label="Weight (lb)" invalid={missing('Load info', 'Weight')}>
                <input className="ui-input" inputMode="decimal" value={d.weight} onChange={(e) => set('weight', e.target.value.replace(/[^0-9.]/g, ''))} />
              </Field>
              <Field label="Declared Value ($)">
                <input className="ui-input" inputMode="decimal" value={d.value} onChange={(e) => set('value', e.target.value.replace(/[^0-9.]/g, ''))} />
              </Field>
            </div>
            <div className="nlf-pair">
              <Field label="Pieces">
                <input className="ui-input" inputMode="numeric" value={d.pieces} onChange={(e) => set('pieces', e.target.value.replace(/[^0-9]/g, ''))} />
              </Field>
              <Field label="Packaging">
                <select className="ui-input" value={d.packaging} onChange={(e) => set('packaging', e.target.value)}>
                  {PACKAGING.map((x) => <option key={x}>{x}</option>)}
                </select>
              </Field>
            </div>
            <div className="nlf-gap" />
            <div className="nlf-pair">
              <Field label="Rate" invalid={missing('Load info', 'Rate')}>
                <span className="nlf-affix is-prefix">
                  <span aria-hidden="true">$</span>
                  <input className="ui-input nlf-num" inputMode="decimal" value={d.lineHaul} onChange={(e) => set('lineHaul', e.target.value.replace(/[^0-9.]/g, ''))} />
                </span>
              </Field>
              <dl className="nlf-facts">
                <div><dt>Fuel Surcharge</dt><dd>{lineHaul > 0 ? money(fuel) : '—'}</dd></div>
                <div title="Estimated road miles between the registered facilities"><dt>Total Miles</dt><dd>{miles ? miles.toLocaleString('en-US') : '—'}</dd></div>
                <div><dt>RPM</dt><dd>{rpm}</dd></div>
              </dl>
            </div>
            {!miles && <span className="ui-field-help">Miles are worked out once every stop is a registered facility.</span>}
            <div className="nlf-gap" />
            <div className="nlf-sub">Temperature Range</div>
            <div className="nlf-pair">
              <Field label="From">
                <span className="nlf-affix">
                  <input className="ui-input" inputMode="decimal" value={d.temp} onChange={(e) => set('temp', e.target.value.replace(/[^0-9.-]/g, ''))} />
                  <span aria-hidden="true">°F</span>
                </span>
              </Field>
              <Field label="To">
                <span className="nlf-affix">
                  <input className="ui-input" inputMode="decimal" value={d.tempTo} onChange={(e) => set('tempTo', e.target.value.replace(/[^0-9.-]/g, ''))} />
                  <span aria-hidden="true">°F</span>
                </span>
              </Field>
            </div>
            <label className="ui-check nlf-hazmat">
              <input type="checkbox" checked={d.hazmat} onChange={(e) => set('hazmat', e.target.checked)} />
              HazMat
            </label>
            <div className={`nlf-un${missing('Load info', 'UN number') ? ' is-invalid' : ''}`}>
              <div className="nlf-un-list">
              {(d.unNumbers.length >= 2 ? d.unNumbers : [...d.unNumbers, '', ''].slice(0, 2)).map((u, k) => (
                <input
                  key={k} className="ui-input" placeholder="UN" value={u} disabled={!d.hazmat} aria-label={`UN number ${k + 1}`}
                  onChange={(e) => {
                    const list = d.unNumbers.length >= 2 ? [...d.unNumbers] : [...d.unNumbers, '', ''].slice(0, 2);
                    list[k] = e.target.value.toUpperCase();
                    set('unNumbers', list);
                  }}
                />
              ))}
              </div>
              <button
                type="button" className="nlf-add" aria-label="Add a UN number" disabled={!d.hazmat}
                onClick={() => set('unNumbers', [...(d.unNumbers.length >= 2 ? d.unNumbers : [...d.unNumbers, '', ''].slice(0, 2)), ''])}
              >
                +
              </button>
            </div>
            {missing('Load info', 'UN number') && <span className="ui-field-error">At least one UN number</span>}
          </div>

          <Field label="Notes" wide>
            <textarea className="ui-input nlf-notes" value={d.instructions} onChange={(e) => set('instructions', e.target.value)} />
          </Field>
        </div>
      </>
    ),

    Stops: (
      <>
        {banner('Stops')}
        <div className="nlf-stops">
          {d.stops.map((s, i) => {
            const end = i === 0 || i === last;
            const open = openStop === i;
            return (
              <div key={i} className="nlf-stop-item">
                <div className="nlf-stop-head">
                  <span>Stop {i + 1} - {s.kind}</span>
                  <div style={{ flex: 1 }} />
                  {!end && <button type="button" className="ui-link" onClick={() => { set('stops', d.stops.filter((_, j) => j !== i)); setOpenStop(null); }}>Remove</button>}
                </div>
                <button type="button" className={`nlf-stop-card${open ? ' is-open' : ''}`} aria-expanded={open} onClick={() => setOpenStop(open ? null : i)}>
                  {s.facility.trim() ? (
                    <>
                      <strong>{s.facility}</strong>
                      {s.address.trim() && <span>{s.address}</span>}
                      {(s.city || s.state || s.zip) && <span>{[s.city, [s.state, s.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</span>}
                    </>
                  ) : (
                    <span className="nlf-stop-empty">No facility yet. Click to fill in.</span>
                  )}
                  <span className="nlf-stop-when">{whenText(s)}</span>
                </button>
                {open && (
                  <div className="nlf-stop-edit">
                    {!end && <Choice options={['Pickup', 'Delivery'] as StopDraft['kind'][]} value={s.kind} onChange={(v) => setStop(i, { kind: v })} />}
                    {stopFields(i, null)}
                    <button type="button" className="ui-link" style={{ alignSelf: 'flex-start' }} onClick={() => setOpenStop(null)}>Done</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <button
          type="button" className="ui-btn nlf-add-stop"
          onClick={() => { set('stops', [...d.stops.slice(0, -1), emptyStop('Delivery'), d.stops[last]]); setOpenStop(last); }}
        >
          Add Stop
        </button>
      </>
    ),

    LTL: (
      <>
        {banner('LTL')}
        <Field label="Shipment" group>
          <Choice options={MODES} value={d.mode} onChange={(v) => set('mode', v)} />
        </Field>
        {d.mode === 'LTL' ? (
          <>
            <div className="ui-form-grid">
              <Field label="Freight class" invalid={missing('LTL', 'Freight class')}>
                <select className="ui-input" value={d.freightClass} onChange={(e) => set('freightClass', e.target.value)}>
                  <option value="">Select a class</option>
                  {FREIGHT_CLASSES.map((x) => <option key={x}>{x}</option>)}
                </select>
              </Field>
              <Field label="NMFC #">
                <input className="ui-input" value={d.nmfc} onChange={(e) => set('nmfc', e.target.value)} />
              </Field>
              <Field label="Handling units" invalid={missing('LTL', 'Handling units')}>
                <input className="ui-input" type="number" min={0} value={d.handlingUnits} onChange={(e) => set('handlingUnits', e.target.value)} />
              </Field>
              <div className="ui-field" style={{ justifyContent: 'flex-end' }}>
                <label className="ui-check">
                  <input type="checkbox" checked={d.stackable} onChange={(e) => set('stackable', e.target.checked)} />
                  Stackable
                </label>
              </div>
            </div>
            <div className="ui-form-grid is-3">
              <Field label="Length (in)">
                <input className="ui-input" type="number" min={0} value={d.length} onChange={(e) => set('length', e.target.value)} />
              </Field>
              <Field label="Width (in)">
                <input className="ui-input" type="number" min={0} value={d.width} onChange={(e) => set('width', e.target.value)} />
              </Field>
              <Field label="Height (in)">
                <input className="ui-input" type="number" min={0} value={d.height} onChange={(e) => set('height', e.target.value)} />
              </Field>
            </div>
            <Field label="Services" group>
              <div className="ui-checks">
                {LTL_SERVICES.map((x) => (
                  <label key={x} className="ui-check">
                    <input type="checkbox" checked={d.services.includes(x)} onChange={(e) => set('services', e.target.checked ? [...d.services, x] : d.services.filter((y) => y !== x))} />
                    {x}
                  </label>
                ))}
              </div>
            </Field>
          </>
        ) : (
          <div className="ui-note">This load is {d.mode === 'FTL' ? 'a full truckload' : 'a partial'}. Choose LTL above for a less-than-truckload shipment.</div>
        )}
      </>
    ),

    Documents: (
      <>
        <p className="ui-p" style={{ margin: 0 }}>Attach what you have now; the rest can be added from the load later.</p>
        <div className="ui-panel" style={{ padding: '4px 18px' }}>
          {DOCUMENTS.map((name) => {
            const file = d.docs[name];
            return (
              <div key={name} className="ui-file-row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{name}</div>
                  <div className="ui-setting-help" style={{ overflowWrap: 'anywhere' }}>{file || 'Not attached'}</div>
                </div>
                {file && (
                  <button type="button" className="ui-link" onClick={() => setD((prev) => { const { [name]: _gone, ...files } = prev.files; return { ...prev, docs: { ...prev.docs, [name]: '' }, files }; })}>
                    Remove
                  </button>
                )}
                <button type="button" className="ui-btn ui-btn-sm" onClick={() => setAttachingDoc(name)}>{file ? 'Replace' : 'Attach'}</button>
              </div>
            );
          })}
        </div>
        {attachingDoc && (
          <AttachDialog
            title={load ? `Load ${load.id}` : 'New load'} only={attachingDoc} accept=".pdf,image/*"
            onAttach={(docs) => { const doc = docs[0]; if (doc) setD((prev) => ({ ...prev, docs: { ...prev.docs, [attachingDoc]: doc.name }, files: { ...prev.files, [attachingDoc]: doc } })); }}
            onClose={() => setAttachingDoc(null)}
          />
        )}
      </>
    ),
  };

  return (
    <dialog
      ref={ref}
      className="ui-dialog is-large nlf"
      aria-label={editing ? `Edit load ${load?.id}` : 'New load'}
      // React passes a nested dialog's close/cancel up to this one, so only
      // react to this dialog's own events (not the Delete load prompt's).
      onClose={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onCancel={(e) => {
        if (e.target !== e.currentTarget) return;
        // Escape: ask before throwing away a half-entered load.
        e.preventDefault();
        requestClose();
      }}
    >
      <datalist id="nlf-facilities">
        {activeFacilities.map((f) => <option key={f.id} value={f.name}>{`${f.type} · ${f.city}, ${f.state}`}</option>)}
      </datalist>
      <aside className="ui-dialog-nav">
        <div className="ui-dialog-title">{editing ? `Edit load ${load?.id}` : 'New Load'}</div>
        {PAGES.map((p) => {
          const n = showErrors ? errors[p]?.length ?? 0 : 0;
          return (
            <button key={p} type="button" className={`ui-dialog-nav-item${page === p ? ' is-active' : ''}`} onClick={() => go(p)}>
              <span>{p === 'Load info' ? 'Load Info' : p}</span>
              {n > 0 && <span className="ui-badge" aria-label={`${n} missing`}>{n}</span>}
            </button>
          );
        })}
      </aside>
      <div className="ui-dialog-main">
        <section className="ui-dialog-body" ref={bodyRef}>
          <button type="button" className="ui-dialog-close" onClick={requestClose} aria-label="Close">×</button>
          <h2 className="ui-h2" style={{ margin: 0 }}>{PAGE_TITLE[page]}</h2>
          {pages[page]}
        </section>
        <footer className="ui-dialog-foot nlf-foot">
          {editing && <button type="button" className="ui-btn ui-btn-danger" onClick={() => setConfirmDelete(true)}>Delete load</button>}
          <div style={{ flex: 1 }} />
          {nextPage && <button type="button" className="ui-btn" onClick={() => go(nextPage)}>Next</button>}
          <button type="button" className="ui-btn ui-btn-primary" onClick={save}>{editing ? 'Save changes' : 'Create Load'}</button>
        </footer>
      </div>
      {addingFacility && (
        <FacilityDialog
          prefill={(() => {
            const s = d.stops[addingFacility.stop];
            return {
              name: addingFacility.name, type: s.kind === 'Pickup' ? 'Shipper' : 'Receiver',
              street: s.address, city: s.city, state: s.state, zip: s.zip,
            };
          })()}
          onSaved={(f) => fillFacility(addingFacility.stop, f)}
          onClose={() => setAddingFacility(null)}
        />
      )}
      {confirmDelete && load && <ConfirmDelete load={load} onConfirm={remove} onClose={() => setConfirmDelete(false)} />}
    </dialog>
  );
}
