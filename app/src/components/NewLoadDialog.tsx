import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAppShell } from '../context/AppShellContext';
import { money } from '../data/accounting';
import { facilityFor, isRoad, stopHint, type Facility } from '../data/facilities';
import { CARRIERS, CUSTOMERS, USER, type Load } from '../data/mock';
import { isLive } from '../lib/releases';
import { AttachDialog } from './AttachDialog';
import { LoadFormDialog } from './LoadFormDialog';
import { Choice, ConfirmDelete, Field, Head, Stat } from './LoadFormBits';
import {
  DOCUMENTS, EQUIPMENT, FREIGHT_CLASSES, INITIAL, LTL_SERVICES, MODES, PACKAGING, TERMS, coveredStatus, draftFromLoad, emptyStop, nextId,
  num, positive, signedMoney, toLoad, type Draft, type StopDraft,
} from './loadForm';

type Section = 'Load info' | 'Stops' | 'Freight' | 'LTL' | 'Carrier' | 'Driver & equipment' | 'Rates' | 'Documents' | 'Notes' | 'Review';
const SECTIONS: Section[] = ['Load info', 'Stops', 'Freight', 'LTL', 'Carrier', 'Driver & equipment', 'Rates', 'Documents', 'Notes', 'Review'];

type Errors = Partial<Record<Section, string[]>>;

// What still has to be filled in before the load can be created, per section.
function validate(d: Draft): Errors {
  const e: Errors = {};
  const add = (s: Section, msg: string) => (e[s] ??= []).push(msg);

  if (!d.customer) add('Load info', 'Customer');
  if (!d.equipment) add('Load info', 'Equipment');
  if (!d.stops.some((s) => s.kind === 'Pickup')) add('Stops', 'At least one pickup');
  if (!d.stops.some((s) => s.kind === 'Delivery')) add('Stops', 'At least one delivery');
  d.stops.forEach((s, i) => {
    const n = `Stop ${i + 1}`;
    if (!s.facility.trim()) add('Stops', `${n}: facility`);
    if (!s.address.trim() || !s.city.trim() || !s.state.trim()) add('Stops', `${n}: street, city and state`);
    if (!s.date) add('Stops', `${n}: date`);
    const prev = d.stops[i - 1];
    if (s.date && prev?.date && s.date < prev.date) add('Stops', `${n}: date is before stop ${i}`);
  });
  if (!d.commodity.trim()) add('Freight', 'Commodity');
  if (!positive(d.weight)) add('Freight', 'Weight');
  if (d.hazmat && !d.unNumber.trim()) add('Freight', 'UN number for hazmat');
  if (d.mode === 'LTL') {
    if (!d.freightClass) add('LTL', 'Freight class');
    if (!positive(d.handlingUnits)) add('LTL', 'Handling units');
  }
  if (d.brokered) {
    if (!d.carrier.trim()) add('Carrier', 'Carrier');
    if (!positive(d.carrierRate)) add('Carrier', 'Carrier rate');
  }
  if (!positive(d.lineHaul)) add('Rates', 'Line haul rate');
  return e;
}

export interface NewLoadDialogProps {
  // Given: the dialog edits this load (Save changes, Delete load). Absent: a new load.
  load?: Load;
  onClose: () => void;
  onSaved?: (id: string) => void;
  onDeleted?: () => void;
}

// The New Load / Edit load popup. From release 1.18 it is the one-page layout
// (LoadFormDialog); before that, the step-by-step one below.
export function NewLoadDialog(props: NewLoadDialogProps) {
  return isLive('load-form-v2') ? <LoadFormDialog {...props} /> : <ClassicLoadDialog {...props} />;
}

// The New Load / Edit load popup: the same shell as Settings, sized for a full
// load entry. Required fields are checked when the load is saved; sections with
// something missing get a count in the menu and the dialog jumps to the first.
function ClassicLoadDialog({ load, onClose, onSaved, onDeleted }: NewLoadDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLElement>(null);
  const { loads, addLoad, updateLoad, deleteLoad, drivers, trucks, trailers, facilities } = useAppShell();
  // Truck stops and scales are not pickup or delivery sites.
  const activeFacilities = facilities.filter((x) => !x.archived && !isRoad(x.type));
  // Archived fleet records are kept on file but are not offered for new work.
  const activeDrivers = drivers.filter((x) => !x.archived);
  const activeTrucks = trucks.filter((x) => !x.archived);
  const activeTrailers = trailers.filter((x) => !x.archived);
  const [initial] = useState<Draft>(() => (load ? draftFromLoad(load) : INITIAL));
  const [d, setD] = useState<Draft>(initial);
  const [section, setSection] = useState<Section>('Load info');
  const [showErrors, setShowErrors] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const editing = Boolean(load);

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);

  const errors = validate(d);
  const dirty = JSON.stringify(d) !== JSON.stringify(initial);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setD((prev) => ({ ...prev, [key]: value }));
  // The document the attach popup is for.
  const [attachingDoc, setAttachingDoc] = useState<string | null>(null);
  const setStop = (i: number, patch: Partial<StopDraft>) =>
    setD((prev) => ({ ...prev, stops: prev.stops.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const missing = (s: Section, msg: string) => showErrors && Boolean(errors[s]?.includes(msg));
  // Picking a registered facility fills the stop's address and site contact.
  const setFacility = (i: number, name: string) => {
    const f = facilityFor(activeFacilities, name);
    if (!f) {
      setStop(i, { facility: name });
      return;
    }
    const t = (k: string) => (typeof f.details[k] === 'string' ? (f.details[k] as string).trim() : '');
    const pickup = d.stops[i].kind === 'Pickup';
    const who = (pickup ? t('shipName') : t('recvName')) || t('shipName');
    const phone = (pickup ? t('shipPhone') : t('recvPhone')) || t('shipPhone') || t('phone');
    setStop(i, {
      facility: f.name, address: t('street'), city: t('city'), state: t('state'), zip: t('zip'),
      contact: d.stops[i].contact || [who, phone].filter(Boolean).join(' · '),
    });
  };
  const knownFacility = (name: string): Facility | undefined => facilityFor(activeFacilities, name);

  const go = (s: Section) => {
    setSection(s);
    bodyRef.current?.scrollTo({ top: 0 });
  };
  // Back / Next skip LTL unless the load is LTL.
  const step = (dir: 1 | -1) => {
    let i = SECTIONS.indexOf(section) + dir;
    if (SECTIONS[i] === 'LTL' && d.mode !== 'LTL') i += dir;
    if (SECTIONS[i]) go(SECTIONS[i]);
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
    const firstBad = SECTIONS.find((s) => errors[s]?.length);
    if (firstBad) {
      setShowErrors(true);
      go(firstBad);
      return;
    }
    const saved = load ? toLoad(d, load.id, load) : toLoad(d, nextId(loads));
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

  const total = num(d.lineHaul) + num(d.fuel) + num(d.accessorials);
  const cost = d.brokered ? num(d.carrierRate) : num(d.driverPay);
  const reefer = d.equipment.startsWith('Reefer');
  const errorCount = Object.values(errors).reduce((n, list) => n + (list?.length ?? 0), 0);

  const pages: Record<Section, ReactNode> = {
    'Load info': (
      <>
        <Head title="Load information" help="Who the load is for and how it moves." />
        <div className="ui-form-grid">
          <Field label="Customer" required invalid={missing('Load info', 'Customer')}>
            <select
              className="ui-input"
              value={d.customer}
              onChange={(e) => {
                const c = CUSTOMERS.find((x) => x.name === e.target.value);
                setD((prev) => ({ ...prev, customer: e.target.value, billTo: prev.billTo || e.target.value, terms: c?.terms ?? prev.terms }));
              }}
            >
              <option value="">Select a customer</option>
              {CUSTOMERS.map((c) => <option key={c.name}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Bill to">
            <select className="ui-input" value={d.billTo} onChange={(e) => set('billTo', e.target.value)}>
              <option value="">Same as customer</option>
              {CUSTOMERS.map((c) => <option key={c.name}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Tender / reference #">
            <input className="ui-input" value={d.ref} onChange={(e) => set('ref', e.target.value)} placeholder="e.g. PO 88-41230" />
          </Field>
          <Field label="Customer PO #">
            <input className="ui-input" value={d.po} onChange={(e) => set('po', e.target.value)} />
          </Field>
          <Field label="Mode" group>
            <Choice options={MODES} value={d.mode} onChange={(v) => set('mode', v)} />
          </Field>
          <Field label="Equipment" required invalid={missing('Load info', 'Equipment')}>
            <select className="ui-input" value={d.equipment} onChange={(e) => set('equipment', e.target.value)}>
              <option value="">Select equipment</option>
              {EQUIPMENT.map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>
          <Field label="Dispatcher">
            <input className="ui-input" value={d.dispatcher} onChange={(e) => set('dispatcher', e.target.value)} />
          </Field>
        </div>
      </>
    ),

    Stops: (
      <>
        <Head title="Stops" help="In the order the truck runs them. Add more for multi-stop loads." />
        {showErrors && errors.Stops && <div className="ui-errors">{errors.Stops.join(' · ')}</div>}
        <datalist id="ui-facility-options">
          {activeFacilities.map((f) => <option key={f.id} value={f.name}>{`${f.type} · ${f.city}, ${f.state}`}</option>)}
        </datalist>
        {d.stops.map((s, i) => (
          <div key={i} className="ui-panel">
            <div className="ui-panel-head">
              <span className={`ui-stop-kind ${s.kind === 'Pickup' ? 'pickup' : 'delivery'}`}>Stop {i + 1}</span>
              <Choice options={['Pickup', 'Delivery'] as StopDraft['kind'][]} value={s.kind} onChange={(v) => setStop(i, { kind: v })} />
              <div style={{ flex: 1 }} />
              {d.stops.length > 2 && (
                <button type="button" className="ui-link" onClick={() => set('stops', d.stops.filter((_, j) => j !== i))}>
                  Remove
                </button>
              )}
            </div>
            <div className="ui-form-grid">
              <Field label="Facility" required wide invalid={showErrors && !s.facility.trim()}>
                <input className="ui-input" list="ui-facility-options" value={s.facility} onChange={(e) => setFacility(i, e.target.value)} placeholder="Start typing — registered facilities fill in the address" />
              </Field>
              <Field label="Street address" required wide invalid={showErrors && !s.address.trim()}>
                <input className="ui-input" value={s.address} onChange={(e) => setStop(i, { address: e.target.value })} />
              </Field>
            </div>
            <div className="ui-form-grid is-3" style={{ marginTop: 16 }}>
              <Field label="City" required invalid={showErrors && !s.city.trim()}>
                <input className="ui-input" value={s.city} onChange={(e) => setStop(i, { city: e.target.value })} />
              </Field>
              <Field label="State" required invalid={showErrors && !s.state.trim()}>
                <input className="ui-input" value={s.state} maxLength={2} onChange={(e) => setStop(i, { state: e.target.value })} placeholder="CA" />
              </Field>
              <Field label="ZIP">
                <input className="ui-input" value={s.zip} inputMode="numeric" onChange={(e) => setStop(i, { zip: e.target.value })} />
              </Field>
              <Field label="Date" required invalid={showErrors && !s.date}>
                <input className="ui-input" type="date" max="9999-12-31" value={s.date} onChange={(e) => setStop(i, { date: e.target.value })} />
              </Field>
              <Field label="Window opens">
                <input className="ui-input" type="time" value={s.from} onChange={(e) => setStop(i, { from: e.target.value })} />
              </Field>
              <Field label="Window closes">
                <input className="ui-input" type="time" value={s.to} onChange={(e) => setStop(i, { to: e.target.value })} />
              </Field>
              <Field label={`${s.kind} #`}>
                <input className="ui-input" value={s.number} onChange={(e) => setStop(i, { number: e.target.value })} />
              </Field>
              <Field label="Site contact" wide>
                <input className="ui-input" value={s.contact} onChange={(e) => setStop(i, { contact: e.target.value })} placeholder="Name and phone" />
              </Field>
            </div>
            {knownFacility(s.facility) && (
              <div className="ui-note" style={{ marginTop: 14 }}>
                <strong>Registered facility.</strong> {stopHint(knownFacility(s.facility) as Facility)}
              </div>
            )}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="ui-btn" onClick={() => set('stops', [...d.stops.slice(0, -1), emptyStop('Pickup'), d.stops[d.stops.length - 1]])}>
            + Add pickup
          </button>
          <button type="button" className="ui-btn" onClick={() => set('stops', [...d.stops, emptyStop('Delivery')])}>
            + Add delivery
          </button>
        </div>
      </>
    ),

    Freight: (
      <>
        <Head title="Freight" help="What is on the trailer." />
        <div className="ui-form-grid">
          <Field label="Commodity" required wide invalid={missing('Freight', 'Commodity')}>
            <input className="ui-input" value={d.commodity} onChange={(e) => set('commodity', e.target.value)} placeholder="e.g. Frozen produce" />
          </Field>
          <Field label="Weight (lb)" required invalid={missing('Freight', 'Weight')}>
            <input className="ui-input" type="number" min={0} value={d.weight} onChange={(e) => set('weight', e.target.value)} />
          </Field>
          <Field label="Declared value ($)">
            <input className="ui-input" type="number" min={0} value={d.value} onChange={(e) => set('value', e.target.value)} />
          </Field>
          <Field label="Pieces">
            <input className="ui-input" type="number" min={0} value={d.pieces} onChange={(e) => set('pieces', e.target.value)} />
          </Field>
          <Field label="Packaging">
            <select className="ui-input" value={d.packaging} onChange={(e) => set('packaging', e.target.value)}>
              {PACKAGING.map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>
          {reefer && (
            <Field label="Temperature (°F)">
              <input className="ui-input" type="number" value={d.temp} onChange={(e) => set('temp', e.target.value)} placeholder="e.g. -10" />
            </Field>
          )}
          <div className="ui-field is-wide">
            <label className="ui-check">
              <input type="checkbox" checked={d.hazmat} onChange={(e) => set('hazmat', e.target.checked)} />
              Hazardous materials
            </label>
          </div>
          {d.hazmat && (
            <Field label="UN number" required invalid={missing('Freight', 'UN number for hazmat')}>
              <input className="ui-input" value={d.unNumber} onChange={(e) => set('unNumber', e.target.value)} placeholder="e.g. UN1203" />
            </Field>
          )}
        </div>
      </>
    ),

    LTL: d.mode === 'LTL' ? (
      <>
        <Head title="LTL details" help="Needed to rate and class a less-than-truckload shipment." />
        <div className="ui-form-grid">
          <Field label="Freight class" required invalid={missing('LTL', 'Freight class')}>
            <select className="ui-input" value={d.freightClass} onChange={(e) => set('freightClass', e.target.value)}>
              <option value="">Select a class</option>
              {FREIGHT_CLASSES.map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>
          <Field label="NMFC #">
            <input className="ui-input" value={d.nmfc} onChange={(e) => set('nmfc', e.target.value)} />
          </Field>
          <Field label="Handling units" required invalid={missing('LTL', 'Handling units')}>
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
                <input
                  type="checkbox"
                  checked={d.services.includes(x)}
                  onChange={(e) => set('services', e.target.checked ? [...d.services, x] : d.services.filter((y) => y !== x))}
                />
                {x}
              </label>
            ))}
          </div>
        </Field>
      </>
    ) : (
      <>
        <Head title="LTL details" help="Only needed for less-than-truckload shipments." />
        <div className="ui-note">
          This load is {d.mode === 'FTL' ? 'a full truckload' : 'a partial'}, so there is nothing to fill in here.{' '}
          <button type="button" className="ui-link" onClick={() => set('mode', 'LTL')}>Make it an LTL load</button>
        </div>
      </>
    ),

    Carrier: (
      <>
        <Head title="Carrier" help={`Haul it with the ${USER.company || 'own'} fleet, or broker it to a partner carrier.`} />
        <Field label="Hauled by" group>
          <Choice
            options={['Own fleet', 'Partner carrier']}
            value={d.brokered ? 'Partner carrier' : 'Own fleet'}
            // Switching who hauls it clears the assignment; clicking the choice it already has changes nothing.
            onChange={(v) => setD((prev) => (prev.brokered === (v === 'Partner carrier') ? prev : { ...prev, brokered: v === 'Partner carrier', driver: '', truck: '', trailer: '' }))}
          />
        </Field>
        {d.brokered ? (
          <div className="ui-form-grid">
            <Field label="Carrier" required invalid={missing('Carrier', 'Carrier')}>
              <input
                className="ui-input" list="ui-carrier-options" value={d.carrier} placeholder="Carrier name"
                onChange={(e) => {
                  // A carrier used before fills in its MC and DOT numbers.
                  const known = CARRIERS.slice(1).find((c) => c.name === e.target.value);
                  setD((prev) => ({ ...prev, carrier: e.target.value, ...(known ? { carrierMc: known.mc, carrierDot: known.dot } : {}) }));
                }}
              />
              <datalist id="ui-carrier-options">
                {CARRIERS.slice(1).map((c) => <option key={c.name} value={c.name}>{c.mc}</option>)}
              </datalist>
            </Field>
            <Field label="MC #">
              <input className="ui-input" value={d.carrierMc} onChange={(e) => set('carrierMc', e.target.value)} placeholder="e.g. MC 604117" />
            </Field>
            <Field label="DOT #">
              <input className="ui-input" value={d.carrierDot} onChange={(e) => set('carrierDot', e.target.value)} placeholder="e.g. DOT 1780342" />
            </Field>
            <Field label="Carrier rate ($)" required invalid={missing('Carrier', 'Carrier rate')}>
              <input className="ui-input" type="number" min={0} value={d.carrierRate} onChange={(e) => set('carrierRate', e.target.value)} />
            </Field>
            <Field label="Carrier dispatcher">
              <input className="ui-input" value={d.carrierContact} onChange={(e) => set('carrierContact', e.target.value)} />
            </Field>
            <Field label="Carrier phone">
              <input className="ui-input" type="tel" value={d.carrierPhone} onChange={(e) => set('carrierPhone', e.target.value)} />
            </Field>
          </div>
        ) : (
          <div className="ui-note">
            {CARRIERS[0].name} · {CARRIERS[0].mc} · {CARRIERS[0].dot}. Assign the driver, truck and trailer in Driver &amp; equipment.
          </div>
        )}
      </>
    ),

    'Driver & equipment': (
      <>
        <Head
          title="Driver & equipment"
          help={d.brokered ? 'The partner carrier’s driver and units, if you have them yet.' : 'Leave the driver empty to put the load on the board as Needs driver.'}
        />
        {d.brokered ? (
          <div className="ui-form-grid is-3">
            <Field label="Driver name">
              <input className="ui-input" value={d.driver} onChange={(e) => set('driver', e.target.value)} />
            </Field>
            <Field label="Truck #">
              <input className="ui-input" value={d.truck} onChange={(e) => set('truck', e.target.value)} />
            </Field>
            <Field label="Trailer #">
              <input className="ui-input" value={d.trailer} onChange={(e) => set('trailer', e.target.value)} />
            </Field>
          </div>
        ) : (
          <div className="ui-form-grid is-3">
            <Field label="Driver">
              <select
                className="ui-input"
                value={d.driver}
                onChange={(e) => {
                  const drv = activeDrivers.find((x) => x.name === e.target.value);
                  const unit = drv && drv.unit !== '—' ? drv.unit : '';
                  setD((prev) => ({ ...prev, driver: e.target.value, truck: prev.truck || unit }));
                }}
              >
                <option value="">Unassigned</option>
                {activeDrivers.map((x) => <option key={x.id} value={x.name}>{x.name} · {x.status}</option>)}
                {d.driver && !activeDrivers.some((x) => x.name === d.driver) && <option value={d.driver}>{d.driver}</option>}
              </select>
            </Field>
            <Field label="Truck">
              <select className="ui-input" value={d.truck} onChange={(e) => set('truck', e.target.value)}>
                <option value="">None</option>
                {activeTrucks.map((x) => <option key={x.id} value={x.unit}>{x.unit} · {x.status}</option>)}
                {d.truck && !activeTrucks.some((x) => x.unit === d.truck) && <option value={d.truck}>{d.truck}</option>}
              </select>
            </Field>
            <Field label="Trailer">
              <select className="ui-input" value={d.trailer} onChange={(e) => set('trailer', e.target.value)}>
                <option value="">None</option>
                {activeTrailers.map((x) => <option key={x.id} value={x.unit}>{x.unit} · {x.kind}</option>)}
                {d.trailer && !activeTrailers.some((x) => x.unit === d.trailer) && <option value={d.trailer}>{d.trailer}</option>}
              </select>
            </Field>
          </div>
        )}
      </>
    ),

    Rates: (
      <>
        <Head title="Rates" help="What the customer pays and what the load costs." />
        <div className="ui-form-grid">
          <Field label="Line haul ($)" required invalid={missing('Rates', 'Line haul rate')}>
            <input className="ui-input" type="number" min={0} value={d.lineHaul} onChange={(e) => set('lineHaul', e.target.value)} />
          </Field>
          <Field label="Fuel surcharge ($)">
            <input className="ui-input" type="number" min={0} value={d.fuel} onChange={(e) => set('fuel', e.target.value)} />
          </Field>
          <Field label="Accessorial charges ($)">
            <input className="ui-input" type="number" min={0} value={d.accessorials} onChange={(e) => set('accessorials', e.target.value)} />
          </Field>
          <Field label="Loaded miles">
            <input className="ui-input" type="number" min={0} value={d.miles} onChange={(e) => set('miles', e.target.value)} />
          </Field>
          {!d.brokered && (
            <Field label="Driver pay ($)">
              <input className="ui-input" type="number" min={0} value={d.driverPay} onChange={(e) => set('driverPay', e.target.value)} />
            </Field>
          )}
          <Field label="Payment terms">
            <select className="ui-input" value={d.terms} onChange={(e) => set('terms', e.target.value)}>
              {TERMS.map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>
        </div>
        <div className="ui-summary">
          <Stat label="Total to customer" value={money(total)} />
          <Stat label="Rate / mile" value={num(d.miles) > 0 ? `$${(num(d.lineHaul) / num(d.miles)).toFixed(2)}` : '—'} />
          <Stat label={d.brokered ? 'Carrier cost' : 'Driver pay'} value={cost > 0 ? money(cost) : '—'} />
          <Stat label="Margin" value={cost > 0 ? signedMoney(total - cost) : '—'} />
        </div>
      </>
    ),

    Documents: (
      <>
        <Head title="Documents" help="Attach what you have now; the rest can be added from the load later." />
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
                {isLive('attach-popup') ? (
                  <button type="button" className="ui-btn ui-btn-sm" onClick={() => setAttachingDoc(name)}>{file ? 'Replace' : 'Attach'}</button>
                ) : (
                  <label className="ui-btn ui-btn-sm">
                    {file ? 'Replace' : 'Attach'}
                    <input
                      className="ui-file-input"
                      type="file"
                      accept=".pdf,image/*"
                      onChange={(e) => set('docs', { ...d.docs, [name]: e.target.files?.[0]?.name ?? '' })}
                    />
                  </label>
                )}
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

    Notes: (
      <>
        <Head title="Notes" help="Instructions go to the driver with the load; internal notes stay in the office." />
        <div className="ui-form-grid">
          <Field label="Driver instructions" wide>
            <textarea className="ui-input" value={d.instructions} onChange={(e) => set('instructions', e.target.value)} placeholder="Check in at gate 3, 2-hour free time, no touch freight…" />
          </Field>
          <Field label="Internal notes" wide>
            <textarea className="ui-input" value={d.internal} onChange={(e) => set('internal', e.target.value)} />
          </Field>
        </div>
      </>
    ),

    Review: (
      <>
        <Head title="Review" help="Check the load before it goes on the board." />
        {errorCount > 0 ? (
          <div className="ui-errors">
            <strong>{errorCount} {errorCount === 1 ? 'thing' : 'things'} left to fill in</strong>
            {SECTIONS.filter((s) => errors[s]?.length).map((s) => (
              <div key={s} style={{ marginTop: 6 }}>
                <button type="button" className="ui-link" onClick={() => { setShowErrors(true); go(s); }}>{s}</button>
                {' — '}{errors[s]?.join(', ')}
              </div>
            ))}
          </div>
        ) : (
          <div className="ui-note">
            {editing
              ? `Everything required is filled in. Save changes updates ${load?.id} on the board, its load page and the planner.`
              : `Everything required is filled in. It goes on the board as ${d.brokered || d.driver ? coveredStatus() : 'Needs driver'}.`}
          </div>
        )}
        <div className="ui-summary">
          <Stat label="Customer" value={d.customer || '—'} />
          <Stat label="Mode · equipment" value={`${d.mode} · ${d.equipment || '—'}`} />
          <Stat label="Stops" value={`${d.stops.filter((s) => s.kind === 'Pickup').length} pickup · ${d.stops.filter((s) => s.kind === 'Delivery').length} delivery`} />
          <Stat label="Route" value={d.stops[0].city && d.stops[d.stops.length - 1].city ? `${d.stops[0].city} → ${d.stops[d.stops.length - 1].city}` : '—'} />
          <Stat label="Freight" value={d.commodity ? `${d.commodity}${d.weight ? ` · ${num(d.weight).toLocaleString('en-US')} lb` : ''}` : '—'} />
          <Stat label="Carrier" value={d.brokered ? d.carrier || '—' : CARRIERS[0].name} />
          <Stat label="Driver" value={d.driver || 'Unassigned'} />
          <Stat label="Total to customer" value={money(total)} />
        </div>
      </>
    ),
  };

  return (
    <dialog
      ref={ref}
      className="ui-dialog is-large"
      aria-label={editing ? `Edit load ${load?.id}` : 'New load'}
      // React passes a nested dialog's close/cancel up to this one, so only
      // react to this dialog's own events (not the Delete load prompt's).
      onClose={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onCancel={(e) => {
        if (e.target !== e.currentTarget) return;
        // Escape: ask before throwing away a half-entered load.
        e.preventDefault();
        requestClose();
      }}
    >
      <aside className="ui-dialog-nav">
        <div className="ui-dialog-title">{editing ? `Edit load ${load?.id}` : 'New load'}</div>
        {SECTIONS.map((s) => {
          const n = showErrors ? errors[s]?.length ?? 0 : 0;
          return (
            <button key={s} type="button" className={`ui-dialog-nav-item${section === s ? ' is-active' : ''}`} onClick={() => go(s)}>
              <span>{s}</span>
              {n > 0 && <span className="ui-badge" aria-label={`${n} missing`}>{n}</span>}
              {n === 0 && s === 'LTL' && d.mode !== 'LTL' && <span className="ui-nav-note">N/A</span>}
            </button>
          );
        })}
      </aside>
      <div className="ui-dialog-main">
        <section className="ui-dialog-body" ref={bodyRef}>
          <button type="button" className="ui-dialog-close" onClick={requestClose} aria-label="Close">
            ×
          </button>
          {pages[section]}
        </section>
        <footer className="ui-dialog-foot">
          <button type="button" className="ui-btn" onClick={requestClose}>Cancel</button>
          {editing && (
            <button type="button" className="ui-btn ui-btn-danger" onClick={() => setConfirmDelete(true)}>Delete load</button>
          )}
          <div style={{ flex: 1 }} />
          {section !== SECTIONS[0] && <button type="button" className="ui-btn" onClick={() => step(-1)}>Back</button>}
          {section !== 'Review' && <button type="button" className="ui-btn" onClick={() => step(1)}>Next</button>}
          <button type="button" className="ui-btn ui-btn-primary" onClick={save}>{editing ? 'Save changes' : 'Create load'}</button>
        </footer>
      </div>
      {confirmDelete && load && <ConfirmDelete load={load} onConfirm={remove} onClose={() => setConfirmDelete(false)} />}
    </dialog>
  );
}
