import { useEffect, useMemo, useRef, useState, type DragEvent, type FocusEvent, type ReactNode } from 'react';
import {
  faArrowDown, faArrowRight, faArrowUp, faArrowUpFromBracket, faBox, faBoxOpen, faCheck, faChevronDown, faCircleCheck, faCircleExclamation,
  faCircleInfo, faCirclePlus, faCloudArrowUp, faDollarSign, faExclamation, faFolderOpen, faHashtag, faIdCard, faLayerGroup, faLocationDot, faLock,
  faMagnifyingGlass, faNoteSticky, faPlus, faSnowflake, faTriangleExclamation, faTruck, faWarehouse, faXmark, type IconDefinition,
} from '@fortawesome/free-solid-svg-icons';
import {
  faCircle, faFileImage, faFilePdf, faLightbulb, faMessage, faPaperPlane, faSnowflake as faSnowflakeRegular, faTrashCan,
} from '@fortawesome/free-regular-svg-icons';
import { useAppShell } from '../context/AppShellContext';
import type { BillDocument } from '../data/bills';
import type { CustomerRecord } from '../data/customers';
import { FACILITY_BLANK, facilityFor, facilityFromForm, isRoad, type Facility } from '../data/facilities';
import { nextId as nextRecordId, type FleetTrailer, type FleetTruck } from '../data/fleet';
import { CARRIERS, type Carrier, type Load } from '../data/mock';
import { fileSize, readAttachment } from '../lib/attachments';
import { usePersisted } from '../lib/persist';
import { toast } from '../lib/toast';
import { DispatchTextDialog } from './DispatchTextDialog';
import { hl } from './highlight';
import { Combo, Req, SecHead, Seg } from './nlParts';
import { Fa } from './Fa';
import { INITIAL, chargesTotal, draftFromLoad, emptyStop, nextId, toLoad, type Draft, type StopDraft } from './loadForm';
import { COUNTED, chargeProblem, checksFor, fmtDay, isPickup, rulesFor, schedOf, type Rule, type SectionId } from './newLoadRules';

// New Load / Edit load (release 1.21), built from the Loadpopupv_2 design:
// one scrolling form in sections (document, load details, pickup, delivery,
// freight & equipment, rate, LTL / partial, truck & driver, notes) with a
// section menu on the left and a live summary and checklist on the right.

const SECTIONS: { id: SectionId; label: string; icon: IconDefinition }[] = [
  { id: 'document', label: 'Document', icon: faCloudArrowUp },
  { id: 'load', label: 'Load details', icon: faHashtag },
  { id: 'pickup', label: 'Pickup', icon: faArrowUpFromBracket },
  { id: 'delivery', label: 'Delivery', icon: faLocationDot },
  { id: 'freight', label: 'Freight & equipment', icon: faBox },
  { id: 'rate', label: 'Rate', icon: faDollarSign },
  { id: 'ltl', label: 'LTL / Partial', icon: faLayerGroup },
  { id: 'truck', label: 'Truck & driver', icon: faTruck },
  { id: 'notes', label: 'Notes', icon: faNoteSticky },
];
const EQUIP_TYPES = ['Dry Van', 'Reefer', 'Flatbed', 'Step Deck', 'Conestoga', 'Power Only', 'Box Truck'];
const LENGTHS = ['53 ft', '48 ft', '40 ft', '26 ft'];
const QTY_UNITS = ['Pallets', 'Cases', 'Pieces', 'Crates'];
const HAZ_CLASSES = [
  '1 – Explosives', '2.1 – Flammable gas', '2.2 – Non-flammable gas', '2.3 – Toxic gas', '3 – Flammable liquid', '4 – Flammable solid',
  '5 – Oxidizer', '6 – Toxic / infectious', '7 – Radioactive', '8 – Corrosive', '9 – Miscellaneous',
];
const CHARGE_TYPES = ['Detention', 'Lumper', 'Layover', 'Stop-off', 'TONU', 'Driver assist', 'Tarp', 'Pallet exchange', 'Scale ticket', 'Other'];
const DOC_CATS = ['Rate confirmation', 'BOL', 'POD', 'Lumper receipt', 'Scale ticket', 'Detention receipt', 'Invoice', 'Customs', 'Other'];
const MAX_FILE = 10 * 1024 * 1024;
const ACCEPT = '.pdf,.png,.jpg,.jpeg';
const RATE_CON = 'Rate confirmation';

// — small helpers —

const strOf = (v: unknown) => (typeof v === 'string' ? v : '');
const amountOf = (s: string) => parseFloat(s.replace(/[^\d.-]/g, '')) || 0;
const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtMoney = (s: string) => { const n = parseFloat(s.replace(/[^\d.]/g, '')); return Number.isNaN(n) ? '' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
const fmtInt = (s: string) => { const n = parseFloat(s.replace(/[^\d.]/g, '')); return Number.isNaN(n) ? '' : Math.round(n).toLocaleString('en-US'); };
const plain = (s: string) => { const n = parseFloat(s.replace(/[^\d.-]/g, '')); return Number.isNaN(n) ? '' : String(n); };
const isImage = (name: string) => /\.(png|jpe?g)$/i.test(name);
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function guessCat(name: string) {
  const n = name.toLowerCase();
  if (/bol|lading/.test(n)) return 'BOL';
  if (/pod|proof/.test(n)) return 'POD';
  if (/lumper/.test(n)) return 'Lumper receipt';
  if (/scale/.test(n)) return 'Scale ticket';
  if (/detention/.test(n)) return 'Detention receipt';
  if (/invoice/.test(n)) return 'Invoice';
  if (/rate.?con/.test(n)) return 'Rate confirmation';
  return '';
}

// A trailer's kind as the design shows it: 'Reefer · 53 ft' → '53 Feet Reefer'.
function trailerParts(t?: FleetTrailer) {
  if (!t) return { type: '', text: '' };
  const [type = '', size = ''] = t.kind.split('·').map((x) => x.trim());
  const ft = size.match(/(\d+)\s*ft/i);
  return { type, text: ft ? `${ft[1]} Feet ${type}` : t.kind };
}

// An older load's equipment ('Dry van, 53 ft') as the design's type and length.
function splitEquipment(equip: string) {
  if (!equip || equip === '—') return { type: '', length: '' };
  const first = equip.split(',')[0].trim().toLowerCase();
  const type = EQUIP_TYPES.find((t) => t.toLowerCase() === first) ?? EQUIP_TYPES.find((t) => first.startsWith(t.toLowerCase().split(' ')[0])) ?? '';
  const ft = equip.match(/(\d+)\s*ft/i);
  return { type, length: ft ? `${ft[1]} ft` : '' };
}

// The entry the popup starts from: blank, or the load being edited (numbers
// shown formatted, older fields mapped onto the design's).
function startingDraft(load: Load | undefined, customers: CustomerRecord[]): Draft {
  if (!load) return { ...INITIAL, stops: [{ ...emptyStop('Pickup'), sched: 'fcfs' }, { ...emptyStop('Delivery'), sched: 'fcfs' }], charges: [], docList: [] };
  const d = draftFromLoad(load);
  const eq = splitEquipment(d.equipment);
  const equipment = EQUIP_TYPES.includes(d.equipment) ? d.equipment : eq.type;
  const customer = customers.find((c) => c.id === d.customerId) ?? customers.find((c) => c.name === d.customer);
  return {
    ...d,
    customerId: customer?.id ?? '',
    equipment,
    trailerLength: eq.length || d.trailerLength || '53 ft',
    tempOn: d.tempOn || (/^reefer/i.test(d.equipment) && d.temp.trim() !== ''),
    temp: d.temp.replace(/[^\d.-]/g, ''),
    weight: fmtInt(d.weight),
    value: fmtInt(d.value),
    lineHaul: fmtMoney(d.lineHaul),
    fuel: fmtMoney(d.fuel),
    unNumber: d.unNumber.replace(/\D/g, '').slice(0, 4),
    stops: d.stops.map((s) => ({ ...s, sched: s.sched ?? (s.appt ? 'appt' : 'fcfs') })),
    charges: d.charges ?? [],
    docList: d.docList ?? [],
  };
}

// — the popup —

interface NewLoadDialogProps {
  // Given: the popup edits this load (Save changes, Delete load). Absent: a new load.
  load?: Load;
  onClose: () => void;
  onSaved?: (id: string) => void;
  onDeleted?: () => void;
}

export function NewLoadDialog({ load, onClose, onSaved, onDeleted }: NewLoadDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const scrollRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const shell = useAppShell();
  const { loads, addLoad, updateLoad, deleteLoad, trucks, trailers, drivers, facilities, saveFacility } = shell;
  const editing = Boolean(load);
  const customers = useMemo(() => shell.customers.filter((c) => c.status !== 'Inactive' || c.name === load?.customer), [shell.customers, load?.customer]);
  const siteFacilities = facilities.filter((f) => !f.archived && !isRoad(f.type));
  const activeTrucks = trucks.filter((t) => !t.archived);
  const [savedCarriers, setSavedCarriers] = usePersisted<Carrier[]>('runtruck-carriers', [], (raw) =>
    Array.isArray(raw) ? raw.filter((c): c is Carrier => Boolean(c) && typeof c.name === 'string' && typeof c.mc === 'string') : null);
  const carrierList = useMemo(() => {
    const seen = new Set<string>();
    return [...CARRIERS.slice(1), ...savedCarriers].filter((c) => {
      const k = c.name.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [savedCarriers]);

  const [loadNo] = useState(() => load?.id ?? nextId(loads));
  const [initial] = useState(() => startingDraft(load, customers));
  const [d, setD] = useState<Draft>(initial);
  // Fields filled in for the user (tinted until edited).
  const [auto, setAuto] = useState<Set<string>>(() => new Set());
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [submitted, setSubmitted] = useState(false);
  const [confirm, setConfirm] = useState<null | 'discard' | 'delete'>(null);
  const [carrierOpen, setCarrierOpen] = useState(initial.brokered);
  const [carrierNew, setCarrierNew] = useState(false);
  const [truckQuery, setTruckQuery] = useState('');
  const [ltlQuery, setLtlQuery] = useState('');
  const [dispatching, setDispatching] = useState(false);
  const [textedAt, setTextedAt] = useState('');
  const [events, setEvents] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState('');
  const [over, setOver] = useState<'' | 'main' | 'more'>('');
  const [current, setCurrent] = useState<SectionId>(editing ? 'load' : 'document');

  const sections = SECTIONS.filter((s) => !editing || s.id !== 'document');

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  // — updating the entry —
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const setStop = (i: number, patch: Partial<StopDraft>) => setD((p) => ({ ...p, stops: p.stops.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const unauto = (...keys: string[]) => setAuto((a) => {
    if (!keys.some((k) => a.has(k))) return a;
    const n = new Set(a);
    keys.forEach((k) => n.delete(k));
    return n;
  });
  const touch = (...ids: string[]) => setTouched((t) => {
    const n = new Set(t);
    ids.forEach((x) => n.add(x));
    return n;
  });
  const cls = (key: string, base = 'nl-inp') => `${base}${auto.has(key) ? ' is-auto' : ''}`;

  // — rules —
  const customerPicked = Boolean(d.customerId && customers.some((c) => c.id === d.customerId));
  const rules = rulesFor(d, { customerPicked });
  const ruleById = new Map(rules.map((r) => [r.id, r]));
  const shown = (r: Rule) => Boolean(r.result) && (submitted || touched.has(r.id));
  const ruleOfInput = (key: string) => rules.find((r) => r.inputs.includes(key));
  const invalid = (key: string) => {
    const r = ruleOfInput(key);
    return Boolean(r && shown(r) && (r.result?.bad ?? r.inputs).includes(key));
  };
  const errFor = (ruleId: string) => {
    const r = ruleById.get(ruleId);
    return r && shown(r) && r.result ? (
      <p id={`nl-${ruleId}-err`} className="nl-err"><Fa icon={faCircleExclamation} /><span>{r.result.m}</span></p>
    ) : null;
  };
  const describe = (key: string) => {
    const r = ruleOfInput(key);
    return r && shown(r) ? `nl-${r.id}-err` : undefined;
  };
  // Leaving a field marks its rule as touched (unless focus moves within the same rule).
  const onBlurCapture = (e: FocusEvent<HTMLFormElement>) => {
    const key = (e.target as HTMLElement).id?.replace(/^nl-/, '');
    if (!key) return;
    const next = (e.relatedTarget as HTMLElement | null)?.id?.replace(/^nl-/, '') ?? '';
    const r = ruleOfInput(key);
    if (r && !r.inputs.includes(next)) touch(r.id);
  };

  // — derived —
  const customer = customers.find((c) => c.id === d.customerId);
  const truck = activeTrucks.find((t) => t.unit === d.truck) ?? trucks.find((t) => t.unit === d.truck);
  const trailerOf = (t?: FleetTruck) => (t ? trailers.find((x) => x.unit === strOf(t.details.trailer)) : undefined);
  const truckTrailer = trailerParts(trailerOf(truck));
  const phoneOf = (name: string) => (name ? strOf(drivers.find((x) => x.name === name)?.details.phone) : '');
  const truckDriver = truck && truck.driver && truck.driver !== 'Unassigned' ? truck.driver : '';
  const driverName = d.driver || truckDriver;
  const charges = d.charges;
  const chargeSum = chargesTotal(d);
  const total = amountOf(d.lineHaul) + amountOf(d.fuel) + chargeSum;
  const pickups = d.stops.map((s, i) => ({ s, i })).filter((x) => isPickup(x.s));
  const deliveries = d.stops.map((s, i) => ({ s, i })).filter((x) => !isPickup(x.s));
  const rateCon = d.files[RATE_CON] && d.docs[RATE_CON] === d.files[RATE_CON].name ? d.files[RATE_CON] : undefined;
  const docsShown = Boolean(rateCon) || d.docList.length > 0;

  // LTL loads a partial can ride with, and the space they have used.
  const ltlLoads = useMemo(() => {
    const pallets = (l: Load) => {
      const f = l.form as Partial<Draft> | undefined;
      return f && (f.packaging ?? 'Pallets') === 'Pallets' ? Math.round(amountOf(String(f.pieces ?? ''))) : 0;
    };
    return loads
      .filter((l) => l.mode === 'Less than truckload' && l.id !== load?.id && !['Delivered', 'Needs POD'].includes(l.status))
      .map((l) => {
        const f = l.form as Partial<Draft> | undefined;
        const ft = Number((f?.trailerLength || l.equip).match(/(\d+)\s*ft/i)?.[1] ?? 53);
        const cap = Math.max(1, Math.round((26 * ft) / 53));
        const used = pallets(l) + loads.filter((x) => x.id !== load?.id && (x.form as Partial<Draft> | undefined)?.ltlLoad === l.id).reduce((n, x) => n + pallets(x), 0);
        return { load: l, space: `${used} of ${cap} pallets used`, date: l.pickupDate ? fmtDay(l.pickupDate) : l.pickup };
      });
  }, [loads, load?.id]);
  const ltlLinked = ltlLoads.find((x) => x.load.id === d.ltlLoad);
  const ltlGone = d.ltlLoad && !ltlLinked ? loads.find((l) => l.id === d.ltlLoad) : undefined;

  // — sections: status, progress, checklist —
  const counted = COUNTED.map((sec) => {
    const rs = rules.filter((r) => r.section === sec);
    const miss = rs.filter((r) => r.result);
    return { sec, total: rs.length, miss: miss.length, err: miss.some(shown) };
  });
  const secDone = counted.filter((c) => c.miss === 0).length;
  const remaining = counted.reduce((n, c) => n + c.miss, 0);
  const checks = checksFor(d, rules);
  const isDone = (ids: string[]) => ids.every((id) => !ruleById.get(id)?.result);
  const checkDone = checks.filter((c) => isDone(c.rules));
  const shownCheck = (ids: string[]) => ids.some((id) => { const r = ruleById.get(id); return r ? shown(r) : false; });

  const statusOf = (id: SectionId): ReactNode => {
    const done = <span className="nl-st-done"><Fa icon={faCheck} /><span className="nl-sr">complete</span></span>;
    const opt = <span className="nl-st-opt">Optional</span>;
    if (id === 'document') return docsShown ? done : opt;
    if (id === 'notes') return opt;
    if (id === 'truck') return d.truck ? <span className="nl-st-done"><Fa icon={faCheck} /><span className="nl-sr">connected</span></span> : opt;
    const c = counted.find((x) => x.sec === id);
    if (!c || c.miss === 0) return done;
    if (c.err) return <span className="nl-st-err"><Fa icon={faExclamation} />{c.miss}</span>;
    return <span className="nl-st-count">{c.total - c.miss}/{c.total}</span>;
  };

  // — navigation —
  const goTo = (id: SectionId) => {
    const el = document.getElementById(`nl-sec-${id}`);
    const sc = scrollRef.current;
    if (el && sc) sc.scrollTo({ top: el.offsetTop - 16, behavior: reducedMotion() ? 'auto' : 'smooth' });
  };
  const spy = () => {
    const sc = scrollRef.current;
    if (!sc) return;
    let now: SectionId = sections[0].id;
    for (const s of sections) {
      const el = document.getElementById(`nl-sec-${s.id}`);
      if (el && el.offsetTop - sc.scrollTop <= 140) now = s.id;
    }
    if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4) now = 'notes';
    setCurrent(now);
  };
  const focusKey = (key: string) => {
    const el = document.getElementById(`nl-${key}`);
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
  };
  const focusRule = (r: Rule) => focusKey(r.result?.bad?.[0] ?? r.inputs[0]);
  const later = (fn: () => void) => window.setTimeout(fn, 0);
  // Opens a search box's list from outside (Change, Add carrier, clearing it):
  // once it is on screen, focus it and click it as a person would.
  const openCombo = (id: string) => later(() => {
    const el = document.getElementById(`nl-${id}`);
    el?.focus();
    el?.click();
  });

  // — customer —
  const pickCustomer = (c: CustomerRecord) => {
    const filled: string[] = [];
    if (!d.contactName.trim() && c.contact) filled.push('f-contact');
    if (!d.contactEmail.trim() && c.email) filled.push('f-email');
    setD((p) => ({
      ...p, customer: c.name, customerId: c.id, terms: c.terms || p.terms, billTo: p.billTo || c.name,
      contactName: p.contactName.trim() ? p.contactName : c.contact, contactEmail: p.contactEmail.trim() ? p.contactEmail : c.email,
    }));
    setAuto((a) => { const n = new Set(a); filled.forEach((k) => n.add(k)); return n; });
    touch('customer');
    later(() => focusKey(`s${pickups[0]?.i ?? 0}-facility`));
  };
  const customerBadge = (c: CustomerRecord) => (c.credit === 'Credit hold'
    ? <span className="nl-badge-hold"><Fa icon={faTriangleExclamation} />Credit hold</span>
    : <span className="nl-badge-ok"><Fa icon={faCircleCheck} />Approved</span>);
  const placeOf = (c: CustomerRecord) => [c.city, c.state].filter(Boolean).join(', ');

  // — facility —
  const setFacility = (i: number, name: string) => {
    const f = facilityFor(siteFacilities, name);
    if (f && f.name === name) {
      const t = (k: string) => strOf(f.details[k]).trim();
      setStop(i, { facility: name, address: t('street'), city: t('city'), state: t('state').toUpperCase(), zip: t('zip') });
      setAuto((a) => { const n = new Set(a); ['street', 'city', 'state', 'zip'].forEach((k) => n.add(`s${i}-${k}`)); return n; });
      touch(`s${i}-street`, `s${i}-csz`);
      if (!d.stops[i].date) later(() => focusKey(`s${i}-date`));
    } else setStop(i, { facility: name });
  };
  const addStop = (kind: StopDraft['kind']) => setD((p) => {
    const stops = [...p.stops];
    if (kind === 'Pickup') {
      const lastPu = stops.reduce((n, s, i) => (isPickup(s) ? i : n), -1);
      stops.splice(lastPu + 1, 0, { ...emptyStop('Pickup'), sched: 'fcfs' });
    } else stops.push({ ...emptyStop('Delivery'), sched: 'fcfs' });
    return { ...p, stops };
  });
  const removeStop = (i: number) => setD((p) => ({ ...p, stops: p.stops.filter((_, j) => j !== i) }));

  // — documents —
  const fileProblem = (f: File) => (!/\.(pdf|png|jpe?g)$/i.test(f.name) ? `${f.name}: only PDF, PNG or JPG files.` : f.size > MAX_FILE ? `${f.name} is larger than 10 MB.` : '');
  const attachRateCon = async (f: File | undefined) => {
    if (!f) return;
    const problem = fileProblem(f);
    if (problem) { setUploadError(problem); return; }
    setUploadError('');
    const doc = await readAttachment(f, RATE_CON);
    if (typeof doc === 'string') { setUploadError(doc); return; }
    setD((p) => ({ ...p, docs: { ...p.docs, [RATE_CON]: doc.name }, files: { ...p.files, [RATE_CON]: doc } }));
  };
  const removeRateCon = () => setD((p) => {
    const files = { ...p.files };
    delete files[RATE_CON];
    return { ...p, docs: { ...p.docs, [RATE_CON]: '' }, files };
  });
  const addDocs = async (list: FileList | File[]) => {
    const problems: string[] = [];
    const added: { category: string; doc: BillDocument }[] = [];
    for (const f of Array.from(list)) {
      const problem = fileProblem(f);
      if (problem) { problems.push(problem); continue; }
      const doc = await readAttachment(f);
      if (typeof doc === 'string') problems.push(doc);
      else added.push({ category: guessCat(f.name), doc });
    }
    setUploadError(problems.join(' '));
    if (added.length) {
      setD((p) => ({ ...p, docList: [...p.docList, ...added] }));
      setAuto((a) => { const n = new Set(a); added.forEach((x) => { if (x.category) n.add(`doc-${x.doc.id}`); }); return n; });
    }
  };
  const dropProps = (zone: 'main' | 'more', onFiles: (files: FileList) => void) => ({
    onDragOver: (e: DragEvent) => { e.preventDefault(); setOver(zone); },
    onDragEnter: (e: DragEvent) => { e.preventDefault(); setOver(zone); },
    onDragLeave: (e: DragEvent) => { e.preventDefault(); setOver(''); },
    onDrop: (e: DragEvent) => { e.preventDefault(); setOver(''); if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files); },
  });

  // — truck —
  const pickTruck = (t: FleetTruck) => {
    const driver = t.driver && t.driver !== 'Unassigned' ? t.driver : '';
    setD((p) => ({ ...p, truck: t.unit, driver, trailer: strOf(t.details.trailer) }));
    setTruckQuery('');
    setTextedAt('');
    later(() => document.getElementById('nl-truck-change')?.focus());
  };
  const truckWarning = (() => {
    if (!truck || !truckTrailer.type) return '';
    const type = truckTrailer.type;
    if (d.tempOn && type.toLowerCase() !== 'reefer') return `Truck ${truck.unit} pulls a ${type}, but this freight is temperature-controlled.`;
    if (d.equipment && d.equipment.toLowerCase() !== type.toLowerCase()) return `This load needs a ${d.equipment}; Truck ${truck.unit} pulls a ${type}.`;
    return '';
  })();

  // — the text to the driver —
  const stopText = (s: StopDraft, kind: 'pu' | 'del') => {
    const addr = [s.address.trim(), s.city.trim(), `${s.state.trim().toUpperCase()} ${s.zip.trim()}`.trim()].filter(Boolean).join(', ');
    const t = schedOf(s) === 'fcfs' ? (s.from && s.to ? `${s.from}–${s.to} FCFS` : '') : s.appt ? `Appt ${s.appt}` : '';
    const ref = s.number.trim();
    return `${s.facility.trim() || 'Facility TBD'}${addr ? `, ${addr}` : ''}\n${s.date ? fmtDay(s.date) : 'Date TBD'} · ${t || 'Time TBD'}${ref ? ` · ${kind === 'pu' ? 'PU#' : 'PO#'} ${ref}` : ''}`;
  };
  const buildSummary = () => {
    const w = amountOf(d.weight);
    const fr = [
      d.commodity.trim() || 'Commodity TBD', w ? `${w.toLocaleString('en-US')} lbs` : '',
      d.tempOn && d.temp.trim() !== '' ? `Reefer ${d.temp.trim()}°F ${d.reeferMode.toLowerCase()}` : '',
      d.hazmat ? `HAZMAT${d.unNumber ? ` UN${d.unNumber}` : ''}${d.hzClass ? ` Class ${d.hzClass.split(' ')[0]}` : ''}` : '',
    ].filter(Boolean).join(' · ');
    return [
      `Load #${loadNo}${d.ref.trim() ? ` (Tender ${d.ref.trim()})` : ''}${customerPicked ? ` – ${d.customer}` : ''}`, '',
      ...pickups.flatMap(({ s }) => [`PICKUP: ${stopText(s, 'pu')}`, '']),
      ...deliveries.flatMap(({ s }) => [`DELIVERY: ${stopText(s, 'del')}`, '']),
      `FREIGHT: ${fr}`,
      `TRUCK: ${d.truck}${truckTrailer.text ? ` · Trailer ${truckTrailer.text}` : ''}`,
    ].join('\n');
  };

  // — saving —
  const closeNow = () => {
    ref.current?.close();
    onClose();
  };
  const extraProblem = () => {
    const firstDoc = d.docList.find((x) => !x.category.trim());
    if (firstDoc) return `doc-${firstDoc.doc.id}`;
    const ci = charges.findIndex((c) => chargeProblem(c.type, c.amount));
    if (ci >= 0) return `chg-${ci}-${chargeProblem(charges[ci].type, charges[ci].amount)?.field}`;
    return '';
  };
  const create = () => {
    setSubmitted(true);
    const firstBad = rules.find((r) => r.result);
    if (firstBad) { later(() => focusRule(firstBad)); return; }
    const extra = extraProblem();
    if (extra) { later(() => focusKey(extra)); return; }

    // New facilities typed on the stops go into Facilities too.
    const known: Facility[] = [...facilities];
    const ids = facilities.map((f) => f.id);
    for (const s of d.stops) {
      const name = s.facility.trim();
      if (!name || facilityFor(known, name)) continue;
      const id = nextRecordId('FAC', ids);
      ids.push(id);
      const pickup = isPickup(s);
      const f = facilityFromForm({
        ...FACILITY_BLANK, name, type: pickup ? 'Shipper' : 'Receiver', street: s.address.trim(), city: s.city.trim(), state: s.state.trim().toUpperCase(),
        zip: s.zip.trim(), ...(pickup ? { shipName: s.contact.trim(), shipPhone: (s.phone ?? '').trim() } : { recvName: s.contact.trim(), recvPhone: (s.phone ?? '').trim() }),
      }, id);
      saveFacility(f);
      known.push(f);
    }
    // A carrier typed in is added to the carrier list.
    if (d.brokered && carrierNew && d.carrier.trim() && !carrierList.some((c) => c.name.toLowerCase() === d.carrier.trim().toLowerCase())) {
      setSavedCarriers((list) => [...list, { name: d.carrier.trim(), mc: '', dot: '' }]);
    }

    const final: Draft = {
      ...d,
      customer: d.customer.trim(),
      driver: driverName,
      weight: plain(d.weight), value: plain(d.value), lineHaul: plain(d.lineHaul), fuel: plain(d.fuel), pieces: plain(d.pieces),
      accessorials: String(chargeSum),
      unNumbers: d.hazmat && d.unNumber ? [d.unNumber] : [],
      unNumber: d.hazmat ? d.unNumber : '',
      hzClass: d.hazmat ? d.hzClass : '',
      ltlLoad: d.mode === 'Partial' ? d.ltlLoad : '',
      stops: d.stops.map((s) => ({ ...s, state: s.state.trim().toUpperCase() })),
    };
    const saved = load ? toLoad(final, load.id, load, events) : toLoad(final, loadNo, undefined, events);
    let id = saved.id;
    if (load) updateLoad(saved);
    else id = addLoad(saved);
    toast(load ? `Load ${id} saved.` : `Load #${id} created for ${final.customer}.`);
    closeNow();
    onSaved?.(id);
  };

  const requestClose = () => setConfirm('discard');
  const keepEditing = () => {
    setConfirm(null);
    later(() => document.getElementById('nl-btn-cancel')?.focus());
  };
  const discard = () => {
    toast(editing ? 'Changes discarded.' : 'Load discarded.', 'info');
    closeNow();
  };
  const remove = () => {
    if (!load) return;
    deleteLoad(load.id);
    toast(`Load ${load.id} deleted.`, 'info');
    closeNow();
    onDeleted?.();
  };
  useEffect(() => {
    if (confirm) document.getElementById('nl-btn-keep')?.focus();
  }, [confirm]);

  // — summary pieces —
  const unset = (t: string) => <span className="is-unset">{t}</span>;
  const placeText = (s: StopDraft, label: string) => {
    const loc = s.city.trim() ? `${s.city.trim()}${s.state.trim() ? `, ${s.state.trim().toUpperCase()}` : ''}` : '';
    const f = s.facility.trim();
    if (!f && !loc) return <span className="is-unset">{label} not set</span>;
    return <>{loc || f}{loc && f && <span className="nl-sum-sub">{f}</span>}</>;
  };
  const whenText = (s: StopDraft) => {
    const t = schedOf(s) === 'fcfs' ? (s.from && s.to ? `${s.from}–${s.to} FCFS` : 'FCFS window not set') : s.appt ? `Appt ${s.appt}` : 'Appt time not set';
    return `${s.date ? fmtDay(s.date) : 'Date not set'} · ${t}`;
  };
  const weightNum = amountOf(d.weight);
  const freightParts = [d.commodity.trim(), weightNum ? `${weightNum.toLocaleString('en-US')} lbs` : '', d.pieces.trim() ? `${d.pieces.trim()} ${d.packaging.toLowerCase()}` : ''].filter(Boolean);

  const statusLine = remaining === 0
    ? <><Fa icon={faCircleCheck} className="is-ok" /><span className="is-ok-text">{editing ? 'Ready to save' : 'Ready to create'}</span></>
    : submitted
      ? <><Fa icon={faCircleExclamation} className="is-bad" /><span className="is-bad-text">Fix {remaining} field{remaining > 1 ? 's' : ''} to {editing ? 'save' : 'create'} this load</span></>
      : <><span className="nl-req">*</span><span className="is-left">{remaining} required field{remaining > 1 ? 's' : ''} left</span></>;

  const field = (key: string) => ({
    'aria-invalid': (invalid(key) ? 'true' : 'false') as 'true' | 'false',
    'aria-describedby': describe(key),
  });

  // — one stop card —
  const stopCard = (s: StopDraft, i: number, extra: boolean) => {
    const p = `s${i}`;
    const pu = isPickup(s);
    const fcfs = schedOf(s) === 'fcfs';
    const word = pu ? 'Pickup' : 'Delivery';
    return (
      <div className="nl-card" key={i}>
        <div className="nl-stop-head">
          <span className={`nl-stop-dot ${pu ? 'is-pu' : 'is-del'}`}><Fa icon={pu ? faArrowUp : faArrowDown} /></span>
          <span className="nl-stop-title">Stop {i + 1} · {word}</span>
          {extra && <button type="button" className="nl-textbtn nl-fbtn" onClick={() => removeStop(i)}>Remove</button>}
        </div>
        <div className="nl-g sm-6">
          <div className="sm-span-3">
            <label className="nl-lbl" htmlFor={`nl-${p}-facility`}>Facility name <Req /></label>
            <div className="nl-rel">
              <span className="nl-in-ico is-12"><Fa icon={faWarehouse} /></span>
              <input
                id={`nl-${p}-facility`} list="nl-facility-options" aria-required="true" className={`${cls(`${p}-facility`)} nl-pl-9`} placeholder="Search saved or type new"
                value={s.facility} {...field(`${p}-facility`)} onChange={(e) => setFacility(i, e.target.value)}
              />
            </div>
            {errFor(`${p}-facility`)}
          </div>
          <div className="sm-span-3">
            <label className="nl-lbl" htmlFor={`nl-${p}-street`}>Street address <Req /></label>
            <input
              id={`nl-${p}-street`} aria-required="true" className={cls(`${p}-street`)} placeholder="Street and number" value={s.address} {...field(`${p}-street`)}
              onChange={(e) => { unauto(`${p}-street`); setStop(i, { address: e.target.value }); }}
            />
            {errFor(`${p}-street`)}
          </div>
          <div className="sm-span-4">
            <div className="nl-csz">
              <div>
                <label className="nl-lbl" htmlFor={`nl-${p}-city`}>City <Req /></label>
                <input id={`nl-${p}-city`} aria-required="true" className={cls(`${p}-city`)} placeholder="City" value={s.city} {...field(`${p}-city`)}
                  onChange={(e) => { unauto(`${p}-city`); setStop(i, { city: e.target.value }); }} />
              </div>
              <div>
                <label className="nl-lbl" htmlFor={`nl-${p}-state`}>State <Req /></label>
                <input id={`nl-${p}-state`} maxLength={2} aria-required="true" className={`${cls(`${p}-state`)} is-upper`} placeholder={pu ? 'NC' : 'IL'} value={s.state} {...field(`${p}-state`)}
                  onChange={(e) => { unauto(`${p}-state`); setStop(i, { state: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') }); }} />
              </div>
              <div>
                <label className="nl-lbl" htmlFor={`nl-${p}-zip`}>ZIP <Req /></label>
                <input id={`nl-${p}-zip`} inputMode="numeric" maxLength={5} aria-required="true" className={cls(`${p}-zip`)} placeholder="00000" value={s.zip} {...field(`${p}-zip`)}
                  onChange={(e) => { unauto(`${p}-zip`); setStop(i, { zip: e.target.value.replace(/\D/g, '') }); }} />
              </div>
            </div>
            {errFor(`${p}-csz`)}
          </div>
          <div className="sm-span-2">
            <label className="nl-lbl" htmlFor={`nl-${p}-date`}>Date <Req /></label>
            <input id={`nl-${p}-date`} type="date" max="9999-12-31" aria-required="true" className={cls(`${p}-date`)} value={s.date} {...field(`${p}-date`)}
              onChange={(e) => setStop(i, { date: e.target.value })} />
            {errFor(`${p}-date`)}
          </div>
          <div className="sm-span-2">
            <span id={`nl-${p}-sched-label`} className="nl-lbl">Scheduling <Req /></span>
            <Seg
              name={`nl-${p}-sched`} label={`nl-${p}-sched-label`} value={schedOf(s)}
              options={[{ value: 'fcfs', label: 'FCFS', aria: 'First come, first served' }, { value: 'appt', label: 'Appt', aria: 'By appointment' }]}
              onChange={(v) => { setStop(i, { sched: v as 'fcfs' | 'appt' }); setTouched((t) => { const n = new Set(t); n.delete(`${p}-time`); return n; }); }}
            />
          </div>
          <div className="sm-span-4">
            {fcfs ? (
              <div>
                <span className="nl-lbl">Window <Req /> <span className="nl-opt">· first come, first served</span></span>
                <div className="nl-window">
                  <input id={`nl-${p}-from`} type="time" aria-label={`${word} window opens`} className={cls(`${p}-from`)} value={s.from} {...field(`${p}-from`)}
                    onChange={(e) => setStop(i, { from: e.target.value })} />
                  <span>to</span>
                  <input id={`nl-${p}-to`} type="time" aria-label={`${word} window closes`} className={cls(`${p}-to`)} value={s.to} {...field(`${p}-to`)}
                    onChange={(e) => setStop(i, { to: e.target.value })} />
                </div>
                {errFor(`${p}-time`)}
              </div>
            ) : (
              <div>
                <label className="nl-lbl" htmlFor={`nl-${p}-appt`}>Appointment time <Req /></label>
                <input id={`nl-${p}-appt`} type="time" className={cls(`${p}-appt`)} value={s.appt ?? ''} {...field(`${p}-appt`)}
                  onChange={(e) => setStop(i, { appt: e.target.value })} />
                {errFor(`${p}-time`)}
              </div>
            )}
          </div>
          <div className="sm-span-2">
            <label className="nl-lbl" htmlFor={`nl-${p}-ref`}>{pu ? 'Pickup #' : 'P.O. #'} <span className="nl-opt">(optional)</span></label>
            <input id={`nl-${p}-ref`} className="nl-inp" placeholder={pu ? 'e.g. PU-55120' : 'e.g. 4500-2291'} value={s.number} onChange={(e) => setStop(i, { number: e.target.value })} />
          </div>
          <div className="sm-span-2">
            <label className="nl-lbl" htmlFor={`nl-${p}-contact`}>Contact</label>
            <input id={`nl-${p}-contact`} className="nl-inp" placeholder={pu ? 'Shipping desk' : 'Receiving desk'} value={s.contact} onChange={(e) => setStop(i, { contact: e.target.value })} />
          </div>
          <div className="sm-span-2">
            <label className="nl-lbl" htmlFor={`nl-${p}-phone`}>Phone</label>
            <input id={`nl-${p}-phone`} type="tel" className="nl-inp" placeholder="(555) 000-0000" value={s.phone ?? ''} onChange={(e) => setStop(i, { phone: e.target.value })} />
          </div>
          <div className="sm-span-6">
            <label className="nl-lbl" htmlFor={`nl-${p}-notes`}>{word} notes</label>
            <input id={`nl-${p}-notes`} className="nl-inp" placeholder={pu ? 'Dock, gate code, check-in…' : 'Dock, appointment, lumper…'} value={s.notes ?? ''} onChange={(e) => setStop(i, { notes: e.target.value })} />
          </div>
        </div>
      </div>
    );
  };

  const moneyInput = (key: 'f-linehaul' | 'f-fuel', name: 'lineHaul' | 'fuel', required: boolean) => (
    <div className="nl-rel">
      <span className="nl-pre">$</span>
      <input
        id={`nl-${key}`} inputMode="decimal" aria-required={required || undefined} className={`${cls(key)} nl-pl-7`} placeholder="0.00" value={d[name]} {...field(key)}
        onChange={(e) => { unauto(key); set(name, e.target.value.replace(/[^\d.,]/g, '')); }}
        onBlur={(e) => set(name, fmtMoney(e.target.value))}
      />
    </div>
  );
  const yesNo = [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }];

  return (
    <dialog
      ref={ref}
      className="nl"
      aria-labelledby="nl-title"
      aria-describedby="nl-desc"
      onCancel={(e) => {
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        if (confirm) keepEditing();
        else requestClose();
      }}
      onClose={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !dispatching && !confirm) { e.preventDefault(); create(); }
      }}
    >
      <datalist id="nl-facility-options">{siteFacilities.map((f) => <option key={f.id} value={f.name} />)}</datalist>
      <datalist id="nl-charge-types">{CHARGE_TYPES.map((c) => <option key={c} value={c} />)}</datalist>
      <datalist id="nl-doc-cats">{DOC_CATS.map((c) => <option key={c} value={c} />)}</datalist>

      {/* Header */}
      <header className="nl-head">
        <div className="nl-head-left">
          <div className="nl-head-ico"><Fa icon={faBoxOpen} /></div>
          <div>
            <h1 id="nl-title" ref={titleRef} tabIndex={-1} className="nl-title">{editing ? `Edit load ${loadNo}` : 'Create new load'}</h1>
            <p id="nl-desc" className="nl-desc">
              {editing ? 'Change the load’s details below.' : 'Attach the rate confirmation and enter the load’s details.'} <span className="nl-req">*</span> Required.
            </p>
          </div>
        </div>
        <div className="nl-head-right">
          <div className="nl-progress">
            <div className="nl-progress-row"><span>Progress</span><span>{secDone} of {COUNTED.length} sections</span></div>
            <div className="nl-progress-track" role="progressbar" aria-label="Sections completed" aria-valuemin={0} aria-valuemax={COUNTED.length} aria-valuenow={secDone}>
              <div className="nl-progress-bar" style={{ width: `${(secDone / COUNTED.length) * 100}%` }} />
            </div>
          </div>
          <button type="button" className="nl-x nl-fbtn" aria-label="Close and cancel" onClick={requestClose}><Fa icon={faXmark} /></button>
        </div>
      </header>

      <div className="nl-body">
        {/* Left sidebar */}
        <aside className="nl-side">
          <nav aria-label="Form sections">
            <p className="nl-side-head">Sections</p>
            {sections.map((s) => (
              <button
                key={s.id} type="button" className={`nl-navlink nl-fbtn${current === s.id ? ' is-active' : ''}`}
                aria-current={current === s.id ? 'true' : undefined} onClick={() => goTo(s.id)}
              >
                <span className="nl-nav-ico"><Fa icon={s.icon} /></span>
                <span className="nl-nav-label">{s.label}</span>
                <span className="nl-nav-status">{statusOf(s.id)}</span>
              </button>
            ))}
          </nav>
          {!editing && (
            <div className="nl-tip">
              <div className="nl-tip-head"><Fa icon={faLightbulb} /> Keep it together</div>
              <p>Attach the rate confirmation and other paperwork here, so it's filed with the load.</p>
            </div>
          )}
        </aside>

        {/* Main form */}
        <main className="nl-main" ref={scrollRef} onScroll={spy}>
          <div className="nl-tabs">
            {sections.map((s) => (
              <button key={s.id} type="button" className={`nl-tab${current === s.id ? ' is-active' : ''}`} onClick={() => goTo(s.id)}>{s.label}</button>
            ))}
          </div>

          <form className="nl-form" autoComplete="off" noValidate onSubmit={(e) => e.preventDefault()} onBlur={onBlurCapture}>
            {/* 1. Document */}
            {!editing && (
              <section id="nl-sec-document" className="nl-sec">
                <SecHead title="Upload rate confirmation" sub="Optional — attach it here, then add BOLs, PODs and receipts." />
                {!rateCon ? (
                  <div className={`nl-drop${over === 'main' ? ' is-over' : ''}`} {...dropProps('main', (files) => void attachRateCon(files[0]))}>
                    <div className="nl-drop-ico"><Fa icon={faCloudArrowUp} /></div>
                    <p className="nl-drop-title">Drag & drop your rate confirmation here</p>
                    <p className="nl-drop-sub">PDF, PNG or JPG · up to 10 MB</p>
                    <div className="nl-drop-btns">
                      <label htmlFor="nl-file-input" className="nl-browse"><Fa icon={faFolderOpen} /> Browse files</label>
                    </div>
                    <input id="nl-file-input" type="file" accept={ACCEPT} className="nl-file-input" onChange={(e) => { void attachRateCon(e.target.files?.[0]); e.target.value = ''; }} />
                  </div>
                ) : (
                  <div className="nl-filecard">
                    <div className="nl-filecard-row">
                      <div className={`nl-file-ico${isImage(rateCon.name) ? ' is-img' : ''}`}><Fa icon={isImage(rateCon.name) ? faFileImage : faFilePdf} /></div>
                      <div className="nl-file-main">
                        <div className="nl-file-top">
                          <p className="nl-file-name">{rateCon.name}</p>
                          <button type="button" className="nl-file-remove nl-fbtn" onClick={removeRateCon}><Fa icon={faXmark} />Remove</button>
                        </div>
                        <div className="nl-file-status">{fileSize(rateCon.size)} · <span className="is-ok">Attached</span> · <b>Rate confirmation</b></div>
                      </div>
                    </div>
                  </div>
                )}
                {uploadError && <p className="nl-err" role="alert"><Fa icon={faCircleExclamation} /><span>{uploadError}</span></p>}

                {docsShown && (
                  <div className="nl-docs">
                    <div className="nl-docs-top">
                      <p id="nl-docs-label" className="nl-docs-title">Other documents <span>{d.docList.length ? `(${d.docList.length})` : ''}</span></p>
                      <p>Give each file a category so it's filed correctly.</p>
                    </div>
                    <ul className="nl-doc-list" aria-labelledby="nl-docs-label">
                      {d.docList.map((x, k) => {
                        const key = `doc-${x.doc.id}`;
                        const bad = submitted && !x.category.trim();
                        const img = isImage(x.doc.name);
                        return (
                          <li key={x.doc.id} className="nl-doc">
                            <div className="nl-doc-row">
                              <span className={`nl-doc-ico${img ? ' is-img' : ''}`}><Fa icon={img ? faFileImage : faFilePdf} /></span>
                              <div className="nl-doc-main">
                                <p className="nl-file-name">{x.doc.name}</p>
                                <p className="nl-doc-meta">{fileSize(x.doc.size)}{auto.has(key) ? ' · category suggested from file name' : ''}</p>
                              </div>
                              <div className="nl-doc-cat">
                                <input
                                  id={`nl-${key}`} list="nl-doc-cats" className={`${cls(key)} is-sm`} placeholder="Select or type category" aria-label={`Category for ${x.doc.name}`}
                                  aria-invalid={bad ? 'true' : 'false'} aria-describedby={bad ? `nl-${key}-err` : undefined} value={x.category}
                                  onChange={(e) => { unauto(key); set('docList', d.docList.map((y, j) => (j === k ? { ...y, category: e.target.value } : y))); }}
                                />
                              </div>
                              <button
                                type="button" className="nl-icon-btn is-36 nl-fbtn" aria-label={`Remove ${x.doc.name}`}
                                onClick={() => set('docList', d.docList.filter((_, j) => j !== k))}
                              >
                                <Fa icon={faTrashCan} />
                              </button>
                            </div>
                            {bad && <p id={`nl-${key}-err`} className="nl-err"><Fa icon={faCircleExclamation} /><span>Choose a category for this document, e.g. BOL or POD.</span></p>}
                          </li>
                        );
                      })}
                    </ul>
                    <div className={`nl-drop-more${over === 'more' ? ' is-over' : ''}`} {...dropProps('more', (files) => void addDocs(files))}>
                      <div className="nl-drop-more-left">
                        <span className="nl-drop-more-ico"><Fa icon={faCloudArrowUp} /></span>
                        <div>
                          <p className="nl-drop-more-title">Drag & drop more documents</p>
                          <p className="nl-drop-more-sub">BOL, POD, lumper receipts… PDF, PNG or JPG · up to 10 MB each</p>
                        </div>
                      </div>
                      <label htmlFor="nl-file-more" className="nl-browse is-sm"><Fa icon={faFolderOpen} /> Add files</label>
                      <input id="nl-file-more" type="file" multiple accept={ACCEPT} className="nl-file-input" onChange={(e) => { if (e.target.files) void addDocs(e.target.files); e.target.value = ''; }} />
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* 2. Load details */}
            <section id="nl-sec-load" className="nl-sec">
              <SecHead
                title="Load details" sub="Who tendered the load and how to reach them."
                right={(
                  <p className="nl-loadno" title="Assigned automatically — can't be changed">
                    <Fa icon={faLock} /><span className="nl-sr">System-assigned load number, read only:</span>Load #<span className="nl-num">{loadNo}</span>
                  </p>
                )}
              />
              <div className="nl-card nl-g sm-2">
                <div>
                  <label className="nl-lbl" htmlFor="nl-customer-search">Broker / customer <Req /></label>
                  <Combo<CustomerRecord>
                    id="customer-search" value={d.customer} required extraClass="nl-pr-10"
                    invalid={invalid('customer-search')} describedBy={describe('customer-search')}
                    onQuery={(q) => setD((p) => ({ ...p, customer: q, customerId: '' }))}
                    searchFromValue={!customerPicked}
                    items={(q) => customers.filter((c) => `${c.name} ${c.id} ${placeOf(c)}`.toLowerCase().includes(q.toLowerCase()))}
                    keyOf={(c) => c.id} between
                    render={(c, q) => (
                      <>
                        <div className="nl-opt-main">
                          <div className="nl-opt-name">{hl(c.name, q)}</div>
                          <div className="nl-opt-sub">{hl(c.id, q)} · {placeOf(c)} · {c.terms}</div>
                        </div>
                        {customerBadge(c)}
                      </>
                    )}
                    onPick={pickCustomer} placeholder="Search by name, ID or city" listLabel="Customers" icon={faMagnifyingGlass}
                    none={(q) => `No customers match “${q}”. Try a customer ID or city.`}
                    after={d.customer ? (
                      <button
                        type="button" className="nl-clear nl-fbtn" aria-label="Clear customer"
                        onClick={() => { setD((p) => ({ ...p, customer: '', customerId: '' })); openCombo('customer-search'); }}
                      >
                        <Fa icon={faXmark} />
                      </button>
                    ) : null}
                  />
                  {errFor('customer')}
                  {customer && customerPicked && (
                    <p className="nl-info">
                      <span>{customer.id}</span><span className="nl-sep" aria-hidden="true">|</span>
                      <span>{placeOf(customer)}</span><span className="nl-sep" aria-hidden="true">|</span>
                      <span>{customer.terms}</span>
                      {customer.credit !== 'Credit hold' && (<><span className="nl-sep" aria-hidden="true">|</span><span className="nl-ok"><Fa icon={faCircleCheck} />Credit approved</span></>)}
                    </p>
                  )}
                  {customer && customerPicked && customer.credit === 'Credit hold' && (
                    <div className="nl-warn">
                      <Fa icon={faTriangleExclamation} />
                      <span><strong>Credit hold.</strong> You can create this load, but it can't be dispatched until accounting approves credit.</span>
                    </div>
                  )}
                </div>
                <div>
                  <label className="nl-lbl" htmlFor="nl-f-tender">Tender number <Req /></label>
                  <input
                    id="nl-f-tender" aria-required="true" className={cls('f-tender')} placeholder="From the rate con, e.g. 1098219" value={d.ref} {...field('f-tender')}
                    onChange={(e) => set('ref', e.target.value)}
                  />
                  {errFor('tender')}
                </div>
                <div>
                  <label className="nl-lbl" htmlFor="nl-f-contact">Contact name</label>
                  <input id="nl-f-contact" className={cls('f-contact')} placeholder="Full name" value={d.contactName} onChange={(e) => { unauto('f-contact'); set('contactName', e.target.value); }} />
                </div>
                <div>
                  <label className="nl-lbl" htmlFor="nl-f-email">Contact email</label>
                  <input id="nl-f-email" type="email" className={cls('f-email')} placeholder="name@company.com" value={d.contactEmail} onChange={(e) => { unauto('f-email'); set('contactEmail', e.target.value); }} />
                </div>
                <p className="nl-note" style={{ gridColumn: '1 / -1' }}>Contact details fill in from the customer profile when you pick a customer.</p>
                <div style={{ gridColumn: '1 / -1' }}>
                  {!carrierOpen ? (
                    <button type="button" className="nl-addlink nl-fbtn" onClick={() => { setCarrierOpen(true); openCombo('carrier-search'); }}>
                      <Fa icon={faPlus} />Add carrier
                    </button>
                  ) : (
                    <div className="nl-carrier nl-g sm-2">
                      <div>
                        <div className="nl-row-between">
                          <label className="nl-lbl is-flush" htmlFor="nl-carrier-search">Carrier <span className="nl-opt">(optional)</span></label>
                          <button
                            type="button" className="nl-textbtn nl-fbtn"
                            onClick={() => { setD((p) => ({ ...p, brokered: false, carrier: '', carrierMc: '', carrierDot: '' })); setCarrierNew(false); setCarrierOpen(false); }}
                          >
                            Remove
                          </button>
                        </div>
                        <Combo<Carrier & { isNew?: boolean }>
                          id="carrier-search" value={d.carrier}
                          onQuery={(q) => { setD((p) => ({ ...p, carrier: q, brokered: false, carrierMc: '', carrierDot: '' })); setCarrierNew(false); }}
                          items={(q) => {
                            const ql = q.toLowerCase();
                            const list: (Carrier & { isNew?: boolean })[] = carrierList.filter((c) => `${c.name} ${c.mc} ${c.dot}`.toLowerCase().includes(ql));
                            if (q && !carrierList.some((c) => c.name.toLowerCase() === ql)) list.push({ name: q, mc: '', dot: '', isNew: true });
                            return list;
                          }}
                          keyOf={(c) => (c.isNew ? `new:${c.name}` : c.name)}
                          render={(c) => (c.isNew ? (
                            <>
                              <span className="nl-opt-ico is-new"><Fa icon={faPlus} /></span>
                              <div className="nl-opt-main"><div className="nl-opt-name is-new">Add new carrier “{c.name}”</div><div className="nl-opt-sub">Create it now — add MC # and insurance later</div></div>
                            </>
                          ) : (
                            <>
                              <span className="nl-opt-ico"><Fa icon={faIdCard} /></span>
                              <div className="nl-opt-main"><div className="nl-opt-name">{c.name}</div><div className="nl-opt-sub">{[c.mc, c.dot].filter((x) => x && x !== '—').join(' · ') || 'No MC # yet'}</div></div>
                            </>
                          ))}
                          onPick={(c) => {
                            setD((p) => ({ ...p, carrier: c.name, brokered: true, carrierMc: c.mc, carrierDot: c.dot }));
                            setCarrierNew(Boolean(c.isNew));
                          }}
                          placeholder="Search by name or MC #, or type a new carrier" listLabel="Carriers" icon={faMagnifyingGlass} none={(q) => `No matches for “${q}”.`}
                        />
                        {d.brokered && (
                          <p className="nl-info">
                            {carrierNew
                              ? <span className="nl-new"><Fa icon={faCirclePlus} />New carrier — will be added to your carrier list</span>
                              : [d.carrierMc, d.carrierDot].filter((x) => x && x !== '—').map((x, k) => (
                                <span key={x}>{k > 0 && <span className="nl-sep" aria-hidden="true">| </span>}{x}</span>
                              ))}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* 3. Pickup */}
            <section id="nl-sec-pickup" className="nl-sec">
              <SecHead title="Pickup" sub="Where and when the freight is loaded." />
              {pickups.map(({ s, i }, k) => stopCard(s, i, k > 0))}
              <button type="button" className="nl-addstop nl-fbtn" onClick={() => addStop('Pickup')}><Fa icon={faPlus} /> Add another pickup</button>
            </section>

            {/* 4. Delivery */}
            <section id="nl-sec-delivery" className="nl-sec">
              <SecHead title="Delivery" sub="Where and when the freight is dropped off." />
              {deliveries.map(({ s, i }, k) => stopCard(s, i, k > 0))}
              <button type="button" className="nl-addstop nl-fbtn" onClick={() => addStop('Delivery')}><Fa icon={faPlus} /> Add another delivery</button>
            </section>

            {/* 5. Freight & equipment */}
            <section id="nl-sec-freight" className="nl-sec">
              <SecHead title="Freight & equipment" sub="What's being shipped, special handling, and the truck it needs." />
              <div className="nl-card nl-stack-5">
                <div className="nl-g sm-2 lg-4">
                  <div className="sm-span-2">
                    <label className="nl-lbl" htmlFor="nl-f-commodity">Commodity <Req /></label>
                    <input id="nl-f-commodity" aria-required="true" className={cls('f-commodity')} placeholder="e.g. Packaged chemicals" value={d.commodity} {...field('f-commodity')}
                      onChange={(e) => set('commodity', e.target.value)} />
                    {errFor('commodity')}
                  </div>
                  <div>
                    <label className="nl-lbl" htmlFor="nl-f-weight">Weight <Req /></label>
                    <div className="nl-rel">
                      <input id="nl-f-weight" inputMode="numeric" aria-required="true" className={`${cls('f-weight')} nl-pr-12`} placeholder="0" value={d.weight} {...field('f-weight')}
                        onChange={(e) => set('weight', e.target.value.replace(/[^\d.,]/g, ''))}
                        onBlur={(e) => set('weight', fmtInt(e.target.value))} />
                      <span className="nl-suf">lbs</span>
                    </div>
                    {errFor('weight')}
                  </div>
                  <div>
                    <label className="nl-lbl" htmlFor="nl-f-insurance">Value <span className="nl-opt">(optional)</span></label>
                    <div className="nl-rel">
                      <span className="nl-pre">$</span>
                      <input id="nl-f-insurance" inputMode="numeric" className={`${cls('f-insurance')} nl-pl-7`} placeholder="0" value={d.value}
                        onChange={(e) => set('value', e.target.value.replace(/[^\d.,]/g, ''))}
                        onBlur={(e) => set('value', fmtInt(e.target.value))} />
                    </div>
                  </div>
                  <div className="sm-span-2">
                    <span id="nl-qty-label" className="nl-lbl">Quantity <span className="nl-opt">(optional)</span></span>
                    <div className="nl-qty" role="group" aria-labelledby="nl-qty-label">
                      <input id="nl-f-qty" inputMode="numeric" aria-label="Quantity" className="nl-inp" placeholder="0" value={d.pieces} onChange={(e) => set('pieces', e.target.value.replace(/\D/g, ''))} />
                      <div className="nl-rel">
                        <select id="nl-f-qty-unit" aria-label="Unit" className="nl-inp" value={d.packaging} onChange={(e) => set('packaging', e.target.value)}>
                          {QTY_UNITS.map((u) => <option key={u}>{u}</option>)}
                          {!QTY_UNITS.includes(d.packaging) && <option>{d.packaging}</option>}
                        </select>
                        <span className="nl-chev"><Fa icon={faChevronDown} /></span>
                      </div>
                    </div>
                  </div>
                  <div className="sm-span-2">
                    <span id="nl-pallet-label" className="nl-lbl">Pallet exchange</span>
                    <Seg name="nl-pallet" label="nl-pallet-label" className="w-132" value={d.palletExchange ? 'yes' : 'no'} options={yesNo} onChange={(v) => set('palletExchange', v === 'yes')} />
                  </div>
                </div>

                <div className="nl-g gap-3 md-2">
                  <div className="nl-toggle">
                    <div className="nl-toggle-row">
                      <div>
                        <p id="nl-temp-label" className="nl-toggle-title"><Fa icon={faSnowflakeRegular} />Temperature controlled</p>
                        <p className="nl-toggle-sub">Requires a reefer and setpoint</p>
                      </div>
                      <Seg name="nl-temp" label="nl-temp-label" className="w-120 is-white" value={d.tempOn ? 'yes' : 'no'} options={yesNo}
                        onChange={(v) => { set('tempOn', v === 'yes'); if (v === 'yes') later(() => focusKey('f-temp')); }} />
                    </div>
                    {d.tempOn && (
                      <div className="nl-toggle-fields nl-g2">
                        <div>
                          <label className="nl-lbl" htmlFor="nl-f-temp">Setpoint <Req /></label>
                          <div className="nl-rel">
                            <input id="nl-f-temp" inputMode="numeric" className={`${cls('f-temp')} nl-pr-10`} placeholder="e.g. 34" value={d.temp} {...field('f-temp')}
                              onChange={(e) => set('temp', e.target.value.replace(/[^\d.-]/g, ''))} />
                            <span className="nl-suf">°F</span>
                          </div>
                          {errFor('temp')}
                        </div>
                        <div>
                          <label className="nl-lbl" htmlFor="nl-f-temp-mode">Reefer mode</label>
                          <div className="nl-rel">
                            <select id="nl-f-temp-mode" className="nl-inp" value={d.reeferMode} onChange={(e) => set('reeferMode', e.target.value)}>
                              <option>Continuous</option><option>Cycle</option>
                            </select>
                            <span className="nl-chev"><Fa icon={faChevronDown} /></span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="nl-toggle">
                    <div className="nl-toggle-row">
                      <div>
                        <p id="nl-hz-label" className="nl-toggle-title"><Fa icon={faTriangleExclamation} />Hazmat</p>
                        <p className="nl-toggle-sub">Needs placards and an endorsed driver</p>
                      </div>
                      <Seg name="nl-hazmat" label="nl-hz-label" className="w-120 is-white" value={d.hazmat ? 'yes' : 'no'} options={yesNo}
                        onChange={(v) => { set('hazmat', v === 'yes'); if (v === 'yes') later(() => focusKey('f-un')); }} />
                    </div>
                    {d.hazmat && (
                      <div className="nl-toggle-fields nl-g2">
                        <div>
                          <label className="nl-lbl" htmlFor="nl-f-un">UN number <Req /></label>
                          <div className="nl-rel">
                            <span className="nl-pre is-13">UN</span>
                            <input id="nl-f-un" inputMode="numeric" maxLength={4} className={`${cls('f-un')} nl-pl-11`} placeholder="1203" value={d.unNumber} {...field('f-un')}
                              onChange={(e) => set('unNumber', e.target.value.replace(/\D/g, ''))} />
                          </div>
                          {errFor('un')}
                        </div>
                        <div>
                          <label className="nl-lbl" htmlFor="nl-f-hzclass">Hazard class <Req /></label>
                          <div className="nl-rel">
                            <select id="nl-f-hzclass" className={cls('f-hzclass')} value={d.hzClass} {...field('f-hzclass')} onChange={(e) => set('hzClass', e.target.value)}>
                              <option value="">Select</option>
                              {HAZ_CLASSES.map((c) => <option key={c}>{c}</option>)}
                            </select>
                            <span className="nl-chev"><Fa icon={faChevronDown} /></span>
                          </div>
                          {errFor('hzclass')}
                        </div>
                        <div className="nl-span-2">
                          <label className="nl-lbl" htmlFor="nl-f-hzphone">24-hr emergency phone <span className="nl-opt">(optional)</span></label>
                          <input id="nl-f-hzphone" type="tel" className="nl-inp" placeholder="(800) 000-0000" value={d.hzPhone} onChange={(e) => set('hzPhone', e.target.value)} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="nl-subsec">
                  <p className="nl-subsec-title">Equipment</p>
                  <div className="nl-g sm-3">
                    <div>
                      <label className="nl-lbl" htmlFor="nl-f-equipment">Equipment type <Req /></label>
                      <div className="nl-rel">
                        <select id="nl-f-equipment" aria-required="true" className={cls('f-equipment')} value={d.equipment} {...field('f-equipment')}
                          onChange={(e) => set('equipment', e.target.value)}>
                          <option value="">Select type</option>
                          {EQUIP_TYPES.map((t) => <option key={t}>{t}</option>)}
                        </select>
                        <span className="nl-chev"><Fa icon={faChevronDown} /></span>
                      </div>
                      {errFor('equipment')}
                    </div>
                    <div>
                      <label className="nl-lbl" htmlFor="nl-f-length">Trailer length</label>
                      <div className="nl-rel">
                        <select id="nl-f-length" className="nl-inp" value={d.trailerLength} onChange={(e) => set('trailerLength', e.target.value)}>
                          {LENGTHS.map((x) => <option key={x}>{x}</option>)}
                          {!LENGTHS.includes(d.trailerLength) && <option>{d.trailerLength}</option>}
                        </select>
                        <span className="nl-chev"><Fa icon={faChevronDown} /></span>
                      </div>
                    </div>
                    <div>
                      <span id="nl-team-label" className="nl-lbl">Team service</span>
                      <Seg name="nl-team" label="nl-team-label" className="w-132" value={d.team ? 'yes' : 'no'} options={yesNo} onChange={(v) => set('team', v === 'yes')} />
                    </div>
                  </div>
                  {d.tempOn && d.equipment !== 'Reefer' && (
                    <div className="nl-reefer">
                      <span><Fa icon={faCircleInfo} />Temperature-controlled freight needs a Reefer.</span>
                      <button type="button" className="nl-fbtn" onClick={() => { set('equipment', 'Reefer'); later(() => focusKey('f-equipment')); }}>Switch to Reefer</button>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* 6. Rate */}
            <section id="nl-sec-rate" className="nl-sec">
              <SecHead title="Rate" sub="What the carrier is paid for this load, in USD." />
              <div className="nl-card nl-stack-5">
                <div className="nl-g sm-3">
                  <div>
                    <label className="nl-lbl" htmlFor="nl-f-linehaul">Linehaul <Req /></label>
                    {moneyInput('f-linehaul', 'lineHaul', true)}
                    {errFor('linehaul')}
                  </div>
                  <div>
                    <label className="nl-lbl" htmlFor="nl-f-fuel">Fuel surcharge</label>
                    {moneyInput('f-fuel', 'fuel', false)}
                  </div>
                  <div>
                    <p className="nl-lbl">Total rate</p>
                    <div className="nl-total"><output aria-live="polite">{money(total)}</output></div>
                    <p className="nl-hint">{charges.length ? `Includes ${charges.length} charge${charges.length > 1 ? 's' : ''} · ${money(chargeSum)}` : 'Linehaul + fuel + charges'}</p>
                  </div>
                </div>
                <div className="nl-subsec">
                  <div className="nl-charges-top">
                    <div>
                      <p id="nl-charges-label" className="nl-charges-title">Charges</p>
                      <p className="nl-toggle-sub">Detention, lumper, layover, stop-off and other accessorials.</p>
                    </div>
                    <button
                      id="nl-btn-add-charge" type="button" className="nl-btn-line nl-fbtn"
                      onClick={() => { set('charges', [...charges, { type: '', amount: '' }]); later(() => focusKey(`chg-${charges.length}-type`)); }}
                    >
                      <Fa icon={faPlus} />Add charge
                    </button>
                  </div>
                  {charges.length > 0 && (
                    <div className="nl-charge-grid nl-charge-head" aria-hidden="true"><span>Charge type</span><span>Amount</span><span /></div>
                  )}
                  <ul className="nl-charge-list" aria-labelledby="nl-charges-label">
                    {charges.map((c, k) => {
                      const prob = submitted ? chargeProblem(c.type, c.amount) : null;
                      const setC = (patch: Partial<typeof c>) => set('charges', charges.map((x, j) => (j === k ? { ...x, ...patch } : x)));
                      return (
                        <li key={k}>
                          <div className="nl-charge-grid">
                            <div>
                              <label className="nl-sr" htmlFor={`nl-chg-${k}-type`}>Charge type</label>
                              <input id={`nl-chg-${k}-type`} list="nl-charge-types" className="nl-inp" placeholder="Select or type a charge" value={c.type}
                                aria-invalid={prob?.field === 'type' ? 'true' : 'false'} aria-describedby={prob?.field === 'type' ? `nl-chg-${k}-err` : undefined}
                                onChange={(e) => setC({ type: e.target.value })} />
                            </div>
                            <div className="nl-rel">
                              <label className="nl-sr" htmlFor={`nl-chg-${k}-amount`}>Amount</label>
                              <span className="nl-pre">$</span>
                              <input id={`nl-chg-${k}-amount`} inputMode="decimal" className="nl-inp nl-pl-7" placeholder="0.00" value={c.amount}
                                aria-invalid={prob?.field === 'amount' ? 'true' : 'false'} aria-describedby={prob?.field === 'amount' ? `nl-chg-${k}-err` : undefined}
                                onChange={(e) => setC({ amount: e.target.value.replace(/[^\d.,]/g, '') })} onBlur={(e) => setC({ amount: fmtMoney(e.target.value) })} />
                            </div>
                            <button
                              type="button" className="nl-icon-btn nl-fbtn" aria-label="Remove charge"
                              onClick={() => {
                                set('charges', charges.filter((_, j) => j !== k));
                                later(() => focusKey(charges.length > 1 ? `chg-${Math.min(k, charges.length - 2)}-type` : 'btn-add-charge'));
                              }}
                            >
                              <Fa icon={faXmark} />
                            </button>
                          </div>
                          {prob && <p id={`nl-chg-${k}-err`} className="nl-err"><Fa icon={faCircleExclamation} /><span>{prob.m}</span></p>}
                        </li>
                      );
                    })}
                  </ul>
                  {charges.length === 0 && (
                    <p className="nl-empty">No charges added. Use <span>Add charge</span> for anything beyond linehaul and fuel.</p>
                  )}
                </div>
              </div>
            </section>

            {/* 6b. LTL / Partial */}
            <section id="nl-sec-ltl" className="nl-sec">
              <SecHead title="LTL / Partial" sub="Whether this load has the truck to itself or shares it with other loads." />
              <div className="nl-card nl-stack-4">
                <div>
                  <span id="nl-mode-label" className="nl-lbl">Load type</span>
                  <Seg
                    name="nl-mode" label="nl-mode-label" className="is-3" value={d.mode}
                    options={[{ value: 'FTL', label: 'FTL', aria: 'FTL, full truckload' }, { value: 'LTL', label: 'LTL', aria: 'LTL, less than truckload' }, { value: 'Partial', label: 'Partial', aria: 'Partial' }]}
                    onChange={(v) => {
                      setD((p) => ({ ...p, mode: v as Draft['mode'], ltlLoad: v === 'Partial' ? p.ltlLoad : '' }));
                      setLtlQuery('');
                      if (v === 'Partial' && !d.ltlLoad) later(() => focusKey('ltl-search'));
                    }}
                  />
                </div>
                {d.mode === 'LTL' && (
                  <div className="nl-blue-note">
                    <Fa icon={faCircleInfo} />
                    <span>LTL loads can be combined with partial loads. Choose LTL only when this load is to be picked up first and delivered last.</span>
                  </div>
                )}
                {d.mode === 'Partial' && (
                  <div>
                    {!d.ltlLoad ? (
                      <div>
                        <label className="nl-lbl" htmlFor="nl-ltl-search">Connect to LTL load <Req /></label>
                        <Combo<(typeof ltlLoads)[number]>
                          id="ltl-search" value={ltlQuery} onQuery={setLtlQuery}
                          invalid={invalid('ltl-search')} describedBy={describe('ltl-search')}
                          items={(q) => ltlLoads.filter((x) => `${x.load.id} ${x.load.customer} ${x.load.route}`.toLowerCase().includes(q.toLowerCase()))}
                          keyOf={(x) => x.load.id}
                          render={(x) => (
                            <>
                              <span className="nl-opt-ico"><Fa icon={faLayerGroup} /></span>
                              <div className="nl-opt-main">
                                <div className="nl-opt-name">Load #{x.load.id} · LTL <span className="nl-opt-light">· {x.load.customer}</span></div>
                                <div className="nl-opt-sub is-trunc">{x.load.route} · {x.date} · {x.space}</div>
                              </div>
                            </>
                          )}
                          onPick={(x) => { set('ltlLoad', x.load.id); touch('ltl-link'); later(() => document.getElementById('nl-ltl-change')?.focus()); }}
                          placeholder="Search LTL loads by load #, customer or city" listLabel="LTL loads" icon={faMagnifyingGlass}
                          none={(q) => (ltlLoads.length ? `No matches for “${q}”.` : 'There are no LTL loads to connect to yet.')}
                        />
                        {errFor('ltl-link')}
                      </div>
                    ) : (
                      <div>
                        <p className="nl-lbl">Connected LTL load</p>
                        <div className="nl-picked is-wrap">
                          <div className="nl-picked-left">
                            <span className="nl-picked-ico"><Fa icon={faLayerGroup} /></span>
                            <div style={{ minWidth: 0 }}>
                              <p className="nl-picked-1">Load #{d.ltlLoad} · LTL</p>
                              <p className="nl-picked-2">
                                {ltlLinked ? [ltlLinked.load.customer, ltlLinked.load.route, ltlLinked.date, ltlLinked.space].join(' · ')
                                  : ltlGone ? [ltlGone.customer, ltlGone.route].join(' · ') : 'This load is no longer on the board.'}
                              </p>
                            </div>
                          </div>
                          <button id="nl-ltl-change" type="button" className="nl-change nl-fbtn" onClick={() => { set('ltlLoad', ''); setLtlQuery(''); openCombo('ltl-search'); }}>Change</button>
                        </div>
                      </div>
                    )}
                    <div className="nl-blue-note mt-3">
                      <Fa icon={faCircleInfo} />
                      <span>Partial loads can only be connected to a LTL load. Choose partial only if this load is to be picked up last and delivered first.</span>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* 7. Truck & driver */}
            <section id="nl-sec-truck" className="nl-sec">
              <SecHead title="Truck & driver" sub="Optional — connect one of your trucks to assign it and its driver to this load." />
              <div className="nl-card">
                {!d.truck ? (
                  <div>
                    <label className="nl-lbl" htmlFor="nl-truck-search">Connect truck <span className="nl-opt">(optional)</span></label>
                    <Combo<FleetTruck>
                      id="truck-search" value={truckQuery} onQuery={setTruckQuery} padLeft="nl-pl-10"
                      items={(q) => activeTrucks.filter((t) => `truck ${t.unit} ${trailerParts(trailerOf(t)).text} ${t.driver}`.toLowerCase().includes(q.toLowerCase()))}
                      keyOf={(t) => t.id}
                      render={(t) => {
                        const tr = trailerParts(trailerOf(t));
                        const dr = t.driver && t.driver !== 'Unassigned' ? t.driver : '';
                        return (
                          <>
                            <span className="nl-opt-ico"><Fa icon={faTruck} /></span>
                            <div className="nl-opt-main">
                              <div className="nl-opt-name">Truck {t.unit} · {tr.text ? `Trailer ${tr.text}` : 'No trailer assigned'}</div>
                              <div className="nl-opt-sub">{dr ? [dr, phoneOf(dr)].filter(Boolean).join(' · ') : 'No driver assigned'}</div>
                            </div>
                          </>
                        );
                      }}
                      onPick={pickTruck} placeholder="Search by truck #, driver or trailer type" listLabel="Trucks" icon={faTruck}
                      none={(q) => `No trucks match “${q}”. Try a truck # or driver name.`}
                    />
                  </div>
                ) : (
                  <div>
                    <p className="nl-lbl">Connected truck</p>
                    <div className="nl-picked">
                      <div className="nl-picked-left">
                        <span className="nl-picked-ico"><Fa icon={faTruck} /></span>
                        <div style={{ minWidth: 0 }}>
                          <p className="nl-picked-1">Truck {d.truck}, {truckTrailer.text ? `Trailer ${truckTrailer.text}` : 'no trailer assigned'}</p>
                          <p className="nl-picked-2">Driver: <b>{driverName || 'none assigned'}</b>, Contact phone: <b>{phoneOf(driverName) || 'not on file'}</b></p>
                        </div>
                      </div>
                      <button
                        id="nl-truck-change" type="button" className="nl-change nl-fbtn"
                        onClick={() => { setD((p) => ({ ...p, truck: '', driver: '', trailer: '' })); setTextedAt(''); setTruckQuery(''); openCombo('truck-search'); }}
                      >
                        Change
                      </button>
                    </div>
                    <div className="nl-dispatch-row">
                      <p role="status" className="nl-dispatch-status">
                        {textedAt
                          ? <><Fa icon={faCircleCheck} className="is-ok" /><b>Texted to {driverName} at {textedAt}</b></>
                          : <><Fa icon={faMessage} />Not sent to driver yet</>}
                      </p>
                      {driverName && (
                        <button type="button" className="nl-dispatch-btn nl-fbtn" onClick={() => setDispatching(true)}>
                          <Fa icon={faPaperPlane} /><span>{textedAt ? 'Resend to driver' : 'Dispatch to driver'}</span>
                        </button>
                      )}
                    </div>
                    {truckWarning && <div className="nl-warn mt-3"><Fa icon={faTriangleExclamation} /><span>{truckWarning}</span></div>}
                  </div>
                )}
              </div>
            </section>

            {/* 8. Notes */}
            <section id="nl-sec-notes" className="nl-sec is-last">
              <SecHead title="Notes & directions" sub="Optional — anything the carrier or driver should know." />
              <div className="nl-card nl-g sm-2">
                <div>
                  <label className="nl-lbl" htmlFor="nl-f-notes">Notes to carrier</label>
                  <textarea id="nl-f-notes" rows={4} className="nl-inp" placeholder="e.g. Minimum 2 load locks, keep seal intact until receiver…" value={d.instructions}
                    onChange={(e) => set('instructions', e.target.value)} />
                </div>
                <div>
                  <label className="nl-lbl" htmlFor="nl-f-directions">Directions</label>
                  <textarea id="nl-f-directions" rows={4} className="nl-inp" placeholder="Route or facility directions" value={d.directions} onChange={(e) => set('directions', e.target.value)} />
                </div>
              </div>
            </section>
          </form>
        </main>

        {/* Right: load summary */}
        <aside className="nl-sum" aria-labelledby="nl-h-summary">
          <h3 id="nl-h-summary">Load summary</h3>
          <dl>
            <div className="nl-sum-ids">
              <div><dt>Load #</dt><dd>{loadNo}</dd></div>
              <div><dt>Tender #</dt><dd className="is-med">{d.ref.trim() || <span className="is-unset-14">Not set</span>}</dd></div>
            </div>
            <div><dt>Customer</dt><dd className="is-strong">{customerPicked ? d.customer : unset('Not selected')}</dd></div>
            <div>
              <dt>Carrier</dt>
              <dd>{d.brokered ? <>{d.carrier}{d.carrierMc && d.carrierMc !== '—' ? <span className="is-unset"> · {d.carrierMc}</span> : carrierNew ? <span className="is-unset"> · new</span> : null}</> : unset('Not added')}</dd>
            </div>
            <div>
              <dt>Route</dt>
              <dd>
                <ol className="nl-route">
                  {[...pickups, ...deliveries].map(({ s, i }) => (
                    <li key={i}>
                      <span className={`nl-route-dot ${isPickup(s) ? 'is-pu' : 'is-del'}`} aria-hidden="true" />
                      <span className="nl-sr">{isPickup(s) ? 'Pickup' : 'Delivery'}: </span>
                      <p>{placeText(s, isPickup(s) ? 'Pickup' : 'Delivery')}</p>
                      <p className="nl-route-when">{whenText(s)}</p>
                    </li>
                  ))}
                </ol>
              </dd>
            </div>
            <div>
              <dt>Truck & driver</dt>
              <dd>
                {d.truck
                  ? <>Truck {d.truck}{truckTrailer.text ? ` · ${truckTrailer.text}` : ''}<span className="nl-sum-sub">{[driverName || 'No driver', phoneOf(driverName)].filter(Boolean).join(' · ')}</span></>
                  : unset('Not connected')}
              </dd>
            </div>
            <div>
              <dt>Freight</dt>
              <dd>
                {freightParts.length ? freightParts.join(' · ') : unset('Not set')}
                {(d.tempOn || d.hazmat) && (
                  <div className="nl-chips">
                    {d.tempOn && <span className="nl-chip"><Fa icon={faSnowflake} className="is-cold" />{d.temp.trim() !== '' ? `${d.temp.trim()}°F` : 'Temp'}</span>}
                    {d.hazmat && <span className="nl-chip"><Fa icon={faTriangleExclamation} className="is-haz" />Hazmat{d.hzClass ? ` ${d.hzClass.split(' ')[0]}` : ''}</span>}
                  </div>
                )}
              </dd>
            </div>
            <div><dt>Equipment</dt><dd>{d.equipment || unset('Type not set')} · {d.trailerLength} · {d.team ? 'Team' : 'Solo'}</dd></div>
            <div>
              <dt>Load type</dt>
              <dd>
                {d.mode === 'FTL' ? 'FTL'
                  : d.mode === 'LTL' ? <>LTL <span className="is-unset">· picks up first, delivers last</span></>
                    : <>Partial <span className="is-unset">· {d.ltlLoad ? `with Load #${d.ltlLoad}` : 'LTL load not connected'}</span></>}
              </dd>
            </div>
            <div className="nl-sum-total"><dt>Total rate</dt><dd>{money(total)}</dd></div>
          </dl>
          <div className="nl-check">
            <div className="nl-check-top"><h3>Required details</h3><span>{checkDone.length} of {checks.length}</span></div>
            <ul className="nl-checklist">
              {checks.map((c) => (isDone(c.rules) ? (
                <li key={c.label} className="nl-check-done"><Fa icon={faCircleCheck} /><span>{c.label}</span><span className="nl-sr">(complete)</span></li>
              ) : (
                <li key={c.label}>
                  <button
                    type="button" className="nl-check-todo nl-fbtn"
                    onClick={() => { touch(...c.rules); const first = c.rules.map((id) => ruleById.get(id)).find((r) => r?.result); if (first) focusRule(first); }}
                  >
                    <Fa icon={faCircle} className={`nl-c-ico${shownCheck(c.rules) ? ' is-red' : ''}`} />
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

      {/* Footer */}
      <footer className="nl-foot">
        {!confirm ? (
          <div className="nl-foot-row">
            <div className="nl-foot-left">
              <p role="status" aria-live="polite" className="nl-status">{statusLine}</p>
              <span className="nl-keys"><kbd>Ctrl</kbd>+<kbd>Enter</kbd> {editing ? 'save' : 'create'} <span className="nl-bar">|</span> <kbd>Esc</kbd> cancel</span>
            </div>
            <div className="nl-foot-btns">
              {editing && <button type="button" className="nl-btn-danger-line nl-fbtn" onClick={() => setConfirm('delete')}>Delete load</button>}
              <button id="nl-btn-cancel" type="button" className="nl-btn-ghost nl-fbtn" onClick={requestClose}>Cancel</button>
              <button type="button" className="nl-btn-main nl-fbtn" onClick={create}>
                <span>{editing ? 'Save changes' : 'Create load'}</span><Fa icon={faArrowRight} />
              </button>
            </div>
          </div>
        ) : (
          <div className="nl-foot-row" role="alertdialog" aria-labelledby="nl-confirm-title" aria-describedby="nl-confirm-desc">
            <p className="nl-confirm-text">
              <Fa icon={faTriangleExclamation} />
              <span>
                <strong id="nl-confirm-title">{confirm === 'delete' ? `Delete load ${loadNo}?` : editing ? 'Discard your changes?' : 'Discard this load?'}</strong>{' '}
                <span id="nl-confirm-desc">
                  {confirm === 'delete' ? 'It’s removed from the board, its load page and the planner. This can’t be undone.' : editing ? 'The changes you’ve made will be lost.' : 'The details you’ve entered will be lost.'}
                </span>
              </span>
            </p>
            <div className="nl-foot-btns">
              <button id="nl-btn-keep" type="button" className="nl-btn-white nl-fbtn" onClick={keepEditing}>Keep editing</button>
              <button type="button" className="nl-btn-red" onClick={confirm === 'delete' ? remove : discard}>{confirm === 'delete' ? 'Delete load' : 'Discard'}</button>
            </div>
          </div>
        )}
      </footer>

      {dispatching && (
        <DispatchTextDialog
          driver={driverName} phone={phoneOf(driverName)} summary={buildSummary}
          notes={[d.instructions.trim(), d.directions.trim()].filter(Boolean).join('\n')}
          incomplete={[pickups[0]?.s.facility, pickups[0]?.s.date, deliveries[0]?.s.facility, deliveries[0]?.s.date, d.commodity].some((x) => !x?.trim())}
          onSent={() => {
            const time = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            setTextedAt(time);
            setEvents((ev) => [...ev, `Load summary texted to ${driverName}`]);
            toast(`Load summary texted to ${driverName}.`);
          }}
          onClose={() => { setDispatching(false); later(() => document.querySelector<HTMLButtonElement>('.nl-dispatch-btn')?.focus()); }}
        />
      )}
    </dialog>
  );
}
