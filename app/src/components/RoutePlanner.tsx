import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAppShell } from '../context/AppShellContext';
import type { FleetTruck } from '../data/fleet';
import { REGIONS, roadMiles as roadMilesSafe, type Region } from '../data/geo';
import { fmtDate } from '../data/invoicing';
import type { Load } from '../data/mock';
import { TODAY } from '../data/planner';
import {
  assignLoad, at, destination, loadSpan, milesOf, movable, origin, planFigures, planRows, rateOf, reloadsNear, truckWeek, weekStart,
  planFor, type BarKind, type Late, type PlanBar, type PlanRow, type RowState, type TruckWeek,
} from '../data/routePlan';
import { addDaysIso } from '../lib/isoDates';
import { useNow } from '../lib/clock';
import { usePersisted } from '../lib/persist';
import { matchesQuery } from '../lib/search';
import { toast } from '../lib/toast';
import { CountUp } from './CountUp';
import { useModal } from './FormBits';
import { Tag } from './Tag';

// The route planner (release 1.41): every truck as a row across the week, its
// loads as bars from pickup to delivery with the deadhead between them,
// service orders, and the time each truck stands empty — with a red dot and a
// Connect load box when that is today or tomorrow. A single-truck view shows
// one truck's week and how it compares with the week before. Built from the
// dispatch-matrix concept, in RunTruck's own look.

type Range = 7 | 14;
type Show = 'all' | 'empty' | 'moving' | 'shop';
type View = 'fleet' | 'truck';

const SHOW: { key: Show; label: string }[] = [
  { key: 'all', label: 'All trucks' },
  { key: 'empty', label: 'Need a load' },
  { key: 'moving', label: 'On the road' },
  { key: 'shop', label: 'In the shop' },
];
const STATE_LABEL: Record<RowState, string> = { moving: 'On the road', booked: 'Load booked', empty: 'Needs a load', shop: 'In the shop', idle: 'Available' };
const STATE_TAG: Record<RowState, string> = { moving: 'tag-accent', booked: 'tag-neutral', empty: 'tag-outline', shop: 'tag-outline', idle: 'tag-green' };
const LEGEND: { kind: BarKind; label: string }[] = [
  { kind: 'done', label: 'Delivered' },
  { kind: 'moving', label: 'On the road' },
  { kind: 'booked', label: 'Booked' },
  { kind: 'shop', label: 'Service' },
  { kind: 'empty', label: 'Empty' },
];
const DEADHEADS = [50, 100, 150, 250, 500];
const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
const DAYNUM = new Intl.DateTimeFormat('en-US', { day: 'numeric' });
const TIME = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const CLOCK = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
const DAY = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
// 'Thu, Nov 19 · 8:00 AM–4:00 PM' (or one time for an appointment).
function windowText([s, e]: [number, number]): string {
  if (e - s <= 60 * 60_000) return `${DAY.format(s)} · ${CLOCK.format(s)}`;
  return DAY.format(s) === DAY.format(e) ? `${DAY.format(s)} · ${CLOCK.format(s)}–${CLOCK.format(e)}` : `${TIME.format(s)} – ${TIME.format(e)}`;
}
const hours = (ms: number) => (ms < 60 * 60_000 ? `${Math.max(1, Math.round(ms / 60_000))} min` : `${(ms / 3_600_000).toFixed(ms < 10 * 3_600_000 ? 1 : 0)} h`);
const lateText = (late: Late) => `${hours(late.by)} late for the ${late.stop === 'pickup' ? 'pickup' : 'delivery'} window`;
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const miles = (n: number) => `${Math.round(n).toLocaleString('en-US')} mi`;
const perMile = (gross: number, mi: number) => (mi ? `$${(gross / mi).toFixed(2)}/mi` : '—');

function barText(b: PlanBar): { title: string; sub: string } {
  if (b.load) return { title: b.load.route, sub: `${b.load.id} · ${b.load.rate}` };
  if (b.order) return { title: b.order.type, sub: b.order.shop || b.order.status };
  return { title: `Empty in ${b.place ?? '—'}`, sub: `From ${TIME.format(b.start)}` };
}

export function RoutePlanner() {
  const { trucks, trailers, loads, workOrders, query, updateLoad } = useAppShell();
  const now = useNow(60_000).getTime();
  const [view, setView] = useState<View>('fleet');
  const [unit, setUnit] = useState('');
  const [range, setRange] = useState<Range>(7);
  const [first, setFirst] = useState(() => weekStart(TODAY));
  const [show, setShow] = useState<Show>('all');
  const [equipment, setEquipment] = useState('');
  const [region, setRegion] = useState<Region | ''>('');
  const [search, setSearch] = useState('');
  const [radius, setRadius] = usePersisted<number>('runtruck-planner-deadhead', 150, (raw) => (typeof raw === 'number' && DEADHEADS.includes(raw) ? raw : null));
  const [picked, setPicked] = useState<{ unit: string; barId: string } | null>(null);
  const [connecting, setConnecting] = useState<{ truck: FleetTruck; place: string; from: number; until: number } | null>(null);

  const days = useMemo(() => Array.from({ length: range }, (_, i) => addDaysIso(first, i)), [first, range]);
  const from = at(days[0]);
  const to = at(addDaysIso(days[days.length - 1], 1));
  // Every truck in the fleet has a row, including one added a moment ago.
  const rowsAll = useMemo(() => planRows({ trucks, trailers, loads, orders: workOrders, from, to, now }), [trucks, trailers, loads, workOrders, from, to, now]);
  const figures = planFigures(rowsAll, loads, from, to);
  const equipments = [...new Set(rowsAll.map((r) => r.equipment))].sort();
  const rowText = (r: PlanRow) => ({
    unit: r.truck.unit, driver: r.driver, equip: r.equipment, place: r.location,
    loads: r.bars.map((b) => (b.load ? `${b.load.id} ${b.load.ref} ${b.load.route} ${b.load.customer}` : '')).join(' '),
  });
  const rows = rowsAll.filter((r) =>
    (show === 'all' || r.state === show)
    && (!equipment || r.equipment === equipment)
    && (!region || r.region === region)
    && matchesQuery(rowText(r), search) && matchesQuery(rowText(r), query));
  const counts: Record<Show, number> = {
    all: rowsAll.length, empty: rowsAll.filter((r) => r.state === 'empty').length,
    moving: rowsAll.filter((r) => r.state === 'moving').length, shop: rowsAll.filter((r) => r.state === 'shop').length,
  };
  const reloadCount = (r: PlanRow) => (r.needs ? reloadsNear(r.needs.place ?? r.location, loads, radius, r.needs.start).length : 0);

  const title = `${fmtDate(days[0], true)} – ${fmtDate(days[days.length - 1], true)}, ${days[days.length - 1].slice(0, 4)}`;
  const move = (n: number) => { setFirst((f) => addDaysIso(f, n * range)); setPicked(null); };
  const truckRow = rowsAll.find((r) => r.truck.unit === unit) ?? rowsAll[0];
  const pickedRow = picked ? rowsAll.find((r) => r.truck.unit === picked.unit) : undefined;
  const pickedBar = pickedRow?.bars.find((b) => b.id === picked?.barId);
  const openBar = (r: PlanRow, b: PlanBar) => {
    if (b.kind === 'empty') {
      setPicked(null);
      setConnecting({ truck: r.truck, place: b.place ?? r.location, from: b.start, until: b.reload ? b.end : Infinity });
    } else setPicked(picked?.barId === b.id ? null : { unit: r.truck.unit, barId: b.id });
  };

  // Give a load to another truck (dragged onto its row, or picked in the
  // load summary), with Undo on the message.
  const moveLoad = (l: Load, toUnit: string) => {
    const target = trucks.find((t) => t.unit === toUnit);
    if (!target || !movable(l)) return;
    const moved = assignLoad(l, target, loads.filter((x) => x.id !== l.id));
    updateLoad(moved);
    // What the new truck can no longer make in time.
    const plan = planFor(toUnit, loads.map((x) => (x.id === l.id ? moved : x)));
    const misses = [...plan.entries()].filter(([, p]) => p.late).map(([id, p]) => `${id} ${(p.late as Late).stop}`);
    const inShop = rowsAll.find((r) => r.truck.unit === toUnit)?.state === 'shop';
    const notes = [
      misses.length ? `can't make ${misses.join(', ')} in time` : '',
      inShop ? `${toUnit} is in the shop` : '',
      moved.driver === 'Unassigned' ? `${toUnit} has no driver` : '',
      l.status === 'Dispatched' && moved.status === 'Booked' ? 'dispatch it again' : '',
    ].filter(Boolean);
    toast(`${l.id} moved to ${toUnit}${moved.driver !== 'Unassigned' ? ` (${moved.driver})` : ''}${notes.length ? ` — ${notes.join('; ')}` : ''}.`, notes.length ? 'info' : 'done', { label: 'Undo', run: () => updateLoad(l) });
    setPicked(null);
  };

  const widgets = [
    { label: 'On the road', value: `${figures.moving}/${figures.active}`, note: 'Trucks on a load right now' },
    { label: 'Need a load', value: String(figures.needLoad), note: 'Empty today or tomorrow, nothing booked', alert: figures.needLoad > 0 },
    { label: 'In the shop', value: String(figures.inShop), note: 'Out for service or repairs' },
    { label: 'Booked revenue', value: money(figures.booked), note: `Loads picking up ${range === 7 ? 'this week' : 'in these two weeks'}` },
  ];

  return (
    <div className="rp">
      <div className="rp-bar">
        <div className="rp-bar-left">
          <nav className="ui-tabs" aria-label="View">
            {([['fleet', 'Fleet'], ['truck', 'Single truck']] as [View, string][]).map(([v, label]) => (
              <button key={v} type="button" className={`ui-tab ui-tab-btn${view === v ? ' is-active' : ''}`} aria-pressed={view === v} onClick={() => { setView(v); setPicked(null); }}>{label}</button>
            ))}
          </nav>
          {view === 'truck' && truckRow && (
            <select className="ui-input rp-select rp-truck-pick" aria-label="Truck" value={truckRow.truck.unit} onChange={(e) => setUnit(e.target.value)}>
              {rowsAll.map((r) => <option key={r.truck.id} value={r.truck.unit}>{r.truck.unit} · {r.driver}</option>)}
            </select>
          )}
        </div>
        <nav className="ui-tabs rp-range" aria-label="Days shown">
          {([7, 14] as Range[]).map((r) => (
            <button key={r} type="button" className={`ui-tab ui-tab-btn${range === r ? ' is-active' : ''}`} aria-pressed={range === r} onClick={() => { setRange(r); setPicked(null); }}>
              {r === 7 ? 'Week' : '2 weeks'}
            </button>
          ))}
        </nav>
        <div className="rp-week">
          <button type="button" className="ui-btn ui-btn-sm" onClick={() => { setFirst(weekStart(TODAY)); setPicked(null); }}>Today</button>
          <button type="button" className="rp-icon-btn" aria-label={`Previous ${range === 7 ? 'week' : 'two weeks'}`} onClick={() => move(-1)}>‹</button>
          <div className="rp-week-title">{title}</div>
          <button type="button" className="rp-icon-btn" aria-label={`Next ${range === 7 ? 'week' : 'two weeks'}`} onClick={() => move(1)}>›</button>
        </div>
      </div>

      {view === 'fleet' ? (
        <>
          <div className="rp-widgets">
            {widgets.map((w) => (
              <section key={w.label} className={`dash-card is-kpi rp-w${w.alert ? ' is-alert' : ''}`}>
                <div className="dash-kpi-label">{w.label}</div>
                <div className="dash-kpi-note">{w.note}</div>
                <div className="dash-kpi-value"><CountUp text={w.value} /></div>
              </section>
            ))}
          </div>

          <section className="ui-card rp-card">
            <div className="rp-card-head">
              <label className="rp-search">
                <span className="rp-search-ico" aria-hidden="true">⌕</span>
                <input type="search" className="ui-input" placeholder="Search truck #, driver, load #, city…" aria-label="Search the planner" value={search} onChange={(e) => setSearch(e.target.value)} />
              </label>
              <label className="rp-pick">
                <span>Region</span>
                <select className="ui-input rp-select" value={region} onChange={(e) => setRegion(e.target.value as Region | '')}>
                  <option value="">All regions</option>
                  {REGIONS.map((g) => <option key={g} value={g}>{g} ({rowsAll.filter((r) => r.region === g).length})</option>)}
                </select>
              </label>
              <label className="rp-pick">
                <span>Equipment</span>
                <select className="ui-input rp-select" value={equipment} onChange={(e) => setEquipment(e.target.value)}>
                  <option value="">All</option>
                  {equipments.map((e) => <option key={e}>{e}</option>)}
                </select>
              </label>
              <div className="ui-filter" role="group" aria-label="Show">
                {SHOW.map((s) => (
                  <button key={s.key} type="button" className={`ui-filter-opt${show === s.key ? ' is-active' : ''}`} aria-pressed={show === s.key} onClick={() => setShow(s.key)}>
                    {s.label} <span className="rp-count">{counts[s.key]}</span>
                  </button>
                ))}
              </div>
              <div className="rp-legend" aria-label="Key">
                {LEGEND.map((l) => <span key={l.kind}><i className={`rp-swatch is-${l.kind}`} />{l.label}</span>)}
              </div>
            </div>

            <div className="rp-scroll">
              <Schedule days={days} rows={rows} total={rowsAll.length} from={from} to={to} now={now} pickedId={picked?.barId} radius={radius} reloadCount={reloadCount} onBar={openBar} onConnect={(r) => r.needs && openBar(r, r.needs)} onMove={moveLoad} />
              {rows.length === 0 && <div className="ui-empty">{rowsAll.length ? 'No trucks match the search or filters.' : 'No trucks yet. Add them in Fleet › Trucks.'}</div>}
            </div>
          </section>
        </>
      ) : truckRow ? (
        <TruckView row={truckRow} loads={loads} days={days} from={from} to={to} now={now} range={range} pickedId={picked?.barId} radius={radius} reloadCount={reloadCount} onBar={openBar} />
      ) : (
        <section className="ui-card"><div className="ui-empty">No trucks yet. Add them in Fleet › Trucks.</div></section>
      )}

      {pickedRow && pickedBar && <LoadSheet row={pickedRow} bar={pickedBar} now={now} trucks={rowsAll.map((r) => r.truck)} onMove={moveLoad} onClose={() => setPicked(null)} />}
      {connecting && (
        <ConnectDialog
          truck={connecting.truck} place={connecting.place} from={connecting.from} until={connecting.until} radius={radius} onRadius={setRadius}
          onClose={() => setConnecting(null)}
        />
      )}
    </div>
  );
}

// — the schedule: one row per truck —

// Dragging a booked load onto another truck's row gives it to that truck
// (release 1.41). The drag starts after the pointer moves a few pixels, so a
// plain click still opens the load.
interface Drag { loadId: string; fromUnit: string; x0: number; y0: number; dx: number; dy: number; moving: boolean; over: string | null }

function Schedule({ days, rows, total, from, to, now, pickedId, radius, reloadCount, onBar, onConnect, onMove, single = false }: {
  days: string[]; rows: PlanRow[]; total: number; from: number; to: number; now: number; pickedId?: string; radius: number;
  reloadCount: (r: PlanRow) => number; onBar: (r: PlanRow, b: PlanBar) => void; onConnect: (r: PlanRow) => void;
  onMove?: (load: Load, toUnit: string) => void; single?: boolean;
}) {
  const span = to - from;
  const pct = (t: number) => `${(Math.min(Math.max(t - from, 0), span) / span) * 100}%`;
  const nowIn = now >= from && now < to;
  // The load whose appointment windows are shown (hovered or focused).
  const [hover, setHover] = useState<string | null>(null);
  const [drag, setDragState] = useState<Drag | null>(null);
  // Read by the pointer handlers straight away (state lags a render behind).
  const live = useRef<Drag | null>(null);
  const setDrag = (d: Drag | null) => { live.current = d; setDragState(d); };
  const dragged = useRef(false);

  const rowUnder = (x: number, y: number, self: Element): string | null => {
    for (const el of document.elementsFromPoint(x, y)) {
      if (self.contains(el)) continue;
      const row = el.closest<HTMLElement>('[data-unit]');
      if (row) return row.dataset.unit ?? null;
    }
    return null;
  };
  const down = (e: ReactPointerEvent<HTMLButtonElement>, r: PlanRow, b: PlanBar) => {
    if (!onMove || !b.load || !movable(b.load) || (e.pointerType === 'mouse' && e.button !== 0)) return;
    dragged.current = false;
    // Keep hearing the pointer even if it leaves the bar quickly.
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ loadId: b.load.id, fromUnit: r.truck.unit, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, moving: false, over: null });
  };
  const move = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = live.current;
    if (!d) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (!d.moving && Math.hypot(dx, dy) < 6) return;
    // Near the top or bottom of the schedule, it scrolls to reach more trucks.
    const box = e.currentTarget.closest('.rp-scroll');
    if (box) {
      const rect = box.getBoundingClientRect();
      if (e.clientY < rect.top + 70) box.scrollTop -= 14;
      else if (e.clientY > rect.bottom - 40) box.scrollTop += 14;
    }
    setDrag({ ...d, dx, dy, moving: true, over: rowUnder(e.clientX, e.clientY, e.currentTarget) });
  };
  const up = (e: ReactPointerEvent<HTMLButtonElement>, b: PlanBar) => {
    const d = live.current;
    if (!d) return;
    const moving = d.moving || Math.hypot(e.clientX - d.x0, e.clientY - d.y0) >= 6;
    if (moving) {
      dragged.current = true;
      const over = rowUnder(e.clientX, e.clientY, e.currentTarget) ?? d.over;
      if (over && over !== d.fromUnit && b.load) onMove?.(b.load, over);
    }
    setDrag(null);
  };
  const cancel = () => setDrag(null);
  useEffect(() => {
    if (!drag?.moving) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { dragged.current = true; setDrag(null); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drag?.moving]);
  const dropOn = drag?.moving && drag.over && drag.over !== drag.fromUnit ? drag.over : null;

  return (
    <div className={`rp-grid${single ? ' is-single' : ''}${drag?.moving ? ' is-dragging' : ''}`} style={{ '--rp-days': days.length } as CSSProperties}>
      <div className="rp-head">
        <div className="rp-head-unit">Truck · driver {!single && <span>{rows.length} of {total}</span>}</div>
        <div className="rp-head-days">
          {days.map((d) => (
            <div key={d} className={`rp-day${d === TODAY ? ' is-today' : ''}`}>
              <span>{d === TODAY ? 'Today' : WEEKDAY.format(new Date(`${d}T12:00:00`))}</span>
              <b>{DAYNUM.format(new Date(`${d}T12:00:00`))}</b>
            </div>
          ))}
        </div>
      </div>
      {rows.map((r) => (
        <div key={r.truck.id} data-unit={r.truck.unit} className={`rp-row is-${r.state}${dropOn === r.truck.unit ? ' is-drop' : ''}`}>
          <div className="rp-unit">
            <div className="rp-unit-top">
              {r.alert && <span className="rp-alert-dot" role="img" aria-label="Needs a load today or tomorrow" title="Needs a load today or tomorrow" />}
              <Link to="/app/fleet/trucks" className="rp-unit-id">{r.truck.unit}</Link>
              <span className="rp-unit-driver">{r.driver}</span>
            </div>
            <div className="rp-unit-meta">{r.equipment} · {r.location}</div>
            {dropOn === r.truck.unit ? <span className="rp-drop-note">Drop to give it to {r.truck.unit}</span> : <Tag label={STATE_LABEL[r.state]} tagClass={STATE_TAG[r.state]} />}
          </div>
          <div className="rp-track" style={{ '--rp-lanes': r.lanes } as CSSProperties}>
            {days.map((d) => <div key={d} className={`rp-cell${d === TODAY ? ' is-today' : ''}`} />)}
            {r.bars.map((b) => {
              const style = { left: pct(b.start), width: `calc(${pct(b.end)} - ${pct(b.start)})`, '--rp-lane': b.lane } as CSSProperties;
              if (b.kind === 'empty' && r.needs?.id === b.id) {
                const n = reloadCount(r);
                return (
                  <div key={b.id} className="rp-connect" style={style}>
                    <button type="button" className="rp-connect-btn" onClick={() => onConnect(r)}>Connect load</button>
                    <div className="rp-connect-text">
                      <span className="rp-bar-title">Empty in {b.place}</span>
                      <span className="rp-bar-sub">{n ? `${n} load${n === 1 ? '' : 's'} within ${radius} mi` : `No booked loads within ${radius} mi`}</span>
                    </div>
                  </div>
                );
              }
              const t = barText(b);
              const on = pickedId === b.id;
              const canDrag = Boolean(onMove && b.load && movable(b.load));
              const lifting = drag?.moving && drag.loadId === b.load?.id;
              return (
                <button
                  key={b.id} type="button"
                  className={`rp-barx is-${b.kind}${on ? ' is-picked' : ''}${b.start < from ? ' is-cut-l' : ''}${b.end > to ? ' is-cut-r' : ''}${canDrag ? ' can-drag' : ''}${lifting ? ' is-lifted' : ''}${b.late ? ' is-late' : ''}`}
                  style={lifting && drag ? { ...style, transform: `translate(${drag.dx}px, ${drag.dy}px)` } : style}
                  aria-label={`${r.truck.unit}: ${t.title}, ${t.sub}${b.late ? `. ${lateText(b.late)}` : ''}${canDrag ? '. Drag to another truck to move it' : ''}`} aria-pressed={b.kind === 'empty' ? undefined : on}
                  title={b.late ? lateText(b.late) : undefined}
                  onPointerEnter={() => b.windows && setHover(b.id)} onPointerLeave={() => setHover((h) => (h === b.id ? null : h))}
                  onFocus={() => b.windows && setHover(b.id)} onBlur={() => setHover((h) => (h === b.id ? null : h))}
                  onPointerDown={(e) => down(e, r, b)} onPointerMove={move} onPointerUp={(e) => up(e, b)} onPointerCancel={cancel}
                  onClick={() => { if (dragged.current) { dragged.current = false; return; } onBar(r, b); }}
                >
                  <span className="rp-bar-title">{b.late && <span className="rp-late-badge" aria-hidden="true">!</span>}{t.title}</span>
                  <span className="rp-bar-sub">{t.sub}</span>
                </button>
              );
            })}
            {r.bars.filter((b) => b.windows && (b.id === hover || b.id === pickedId) && !drag?.moving).flatMap((b) => {
              const w = b.windows as NonNullable<PlanBar['windows']>;
              const bracket = (kind: 'pickup' | 'drop', [ws, we]: [number, number]) => (
                <div
                  key={`${b.id}:${kind}`} className={`rp-win is-${kind}`} aria-hidden="true"
                  style={{ left: pct(ws), width: `max(4px, calc(${pct(Math.max(we, ws + 30 * 60_000))} - ${pct(ws)}))`, '--rp-lane': b.lane } as CSSProperties}
                />
              );
              return [
                bracket('pickup', w.pickup), bracket('drop', w.delivery),
                <div key={`${b.id}:cap`} className="rp-win-cap" aria-hidden="true" style={{ left: pct(Math.min(b.start, w.pickup[0])), '--rp-lane': b.lane } as CSSProperties}>
                  <b className="is-pickup">Pickup</b> {windowText(w.pickup)} <span>→</span> <b className="is-drop">Drop</b> {windowText(w.delivery)}
                </div>,
              ];
            })}
            {r.deadheads.filter((d) => d.at > from && d.at < to).map((d) => (
              <span key={d.id} className="rp-dh" style={{ left: pct(d.at), '--rp-lane': d.lane } as CSSProperties} title="Estimated empty miles to the next pickup">
                {d.miles} mi DH
              </span>
            ))}
            {nowIn && <div className="rp-now" style={{ left: pct(now) }} aria-hidden="true" />}
          </div>
        </div>
      ))}
    </div>
  );
}

// — single truck —

function TruckView({ row, loads, days, from, to, now, range, pickedId, radius, reloadCount, onBar }: {
  row: PlanRow; loads: Load[]; days: string[]; from: number; to: number; now: number; range: Range; pickedId?: string; radius: number;
  reloadCount: (r: PlanRow) => number; onBar: (r: PlanRow, b: PlanBar) => void;
}) {
  const week = truckWeek(row.truck.unit, loads, from, to);
  const before = truckWeek(row.truck.unit, loads, from - (to - from), from);
  const word = range === 7 ? 'last week' : 'the 2 weeks before';
  const stats: { label: string; value: string; now: number; then: number; lowerIsBetter?: boolean }[] = [
    { label: 'Total miles', value: miles(week.totalMiles), now: week.totalMiles, then: before.totalMiles },
    { label: 'Loads booked', value: String(week.count), now: week.count, then: before.count },
    { label: 'Total gross', value: money(week.gross), now: week.gross, then: before.gross },
    { label: 'Average RPM', value: perMile(week.gross, week.loadedMiles), now: week.rpm, then: before.rpm },
    { label: 'Loaded miles', value: miles(week.loadedMiles), now: week.loadedMiles, then: before.loadedMiles },
    { label: 'Deadhead miles', value: miles(week.deadheadMiles), now: week.deadheadMiles, then: before.deadheadMiles, lowerIsBetter: true },
  ];
  return (
    <>
      <div className="rp-stats">
        {stats.map((s) => {
          const diff = s.now - s.then;
          const pctChange = s.then ? Math.round((diff / s.then) * 100) : null;
          const good = s.lowerIsBetter ? diff <= 0 : diff >= 0;
          const text = !s.then && !s.now ? `Same as ${word}` : pctChange === null ? `New · none ${word}` : diff === 0 ? `Same as ${word}` : `${diff > 0 ? '▲' : '▼'} ${Math.abs(pctChange)}% vs ${word}`;
          return (
            <section key={s.label} className="dash-card is-kpi rp-w rp-stat">
              <div className="dash-kpi-label">{s.label}</div>
              <div className="dash-kpi-value"><CountUp text={s.value} /></div>
              <div className={`rp-delta${diff === 0 || pctChange === null ? '' : good ? ' is-good' : ' is-bad'}`}>{text}</div>
            </section>
          );
        })}
      </div>
      <section className="ui-card rp-card">
        <div className="rp-scroll">
          <Schedule days={days} rows={[row]} total={1} from={from} to={to} now={now} pickedId={pickedId} radius={radius} reloadCount={reloadCount} onBar={onBar} onConnect={(r) => r.needs && onBar(r, r.needs)} single />
          <TruckLoads week={week} loads={loads} unit={row.truck.unit} />
        </div>
      </section>
    </>
  );
}

function TruckLoads({ week, loads, unit }: { week: TruckWeek; loads: Load[]; unit: string }) {
  if (!week.loads.length) return <div className="ui-empty">No loads for {unit} in these days.</div>;
  const all = loads.filter((l) => l.unit.split('/')[0].trim() === unit).map((l) => ({ l, s: loadSpan(l) })).filter((x) => x.s).sort((a, b) => (a.s?.start ?? 0) - (b.s?.start ?? 0));
  return (
    <table className="ui-table rp-truck-table">
      <thead>
        <tr><th>Load #</th><th>Route</th><th>Pickup</th><th>Delivery</th><th className="num">Deadhead</th><th className="num">Miles</th><th className="num">Rate</th><th className="num">RPM</th><th className="num">Status</th></tr>
      </thead>
      <tbody>
        {week.loads.map((l) => {
          const s = loadSpan(l);
          const i = all.findIndex((x) => x.l.id === l.id);
          const prev = i > 0 ? all[i - 1].l : null;
          const dh = prev ? roadMilesSafe(destination(prev), origin(l)) : null;
          return (
            <tr key={l.id}>
              <td className="strong"><Link className="ui-link" to={`/app/loads/${l.id}`}>{l.id}</Link></td>
              <td>{l.route}<div className="ui-stop-meta">{l.customer}</div></td>
              <td>{s ? TIME.format(s.start) : l.pickup}</td>
              <td>{s ? TIME.format(s.end) : l.delivery}</td>
              <td className="num">{dh === null ? '—' : miles(dh)}</td>
              <td className="num">{milesOf(l) ? miles(milesOf(l)) : '—'}</td>
              <td className="num">{l.rate}</td>
              <td className="num">{perMile(rateOf(l), milesOf(l))}</td>
              <td className="num"><Tag label={l.status} tagClass={l.tagClass} /></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}


// — a load (or service) summary, popping up at the bottom of the page —

function LoadSheet({ row, bar, now, trucks, onMove, onClose }: {
  row: PlanRow; bar: PlanBar; now: number; trucks: FleetTruck[]; onMove: (l: Load, toUnit: string) => void; onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const l = bar.load;
  const w = bar.order;
  const done = bar.kind === 'moving' ? Math.min(1, Math.max(0, (now - bar.start) / (bar.end - bar.start))) : bar.kind === 'done' ? 1 : 0;
  return (
    <div className="rp-sheet" role="dialog" aria-label={l ? `Load ${l.id}` : 'Service'}>
      <div className="rp-sheet-head">
        <span className={`rp-swatch is-${bar.kind}`} />
        <div className="rp-sheet-title">
          <h3>{l ? l.route : `${row.truck.unit} · ${w?.type ?? 'Service'}`}</h3>
          <p>{l ? `${l.id}${l.ref ? ` · ${l.ref}` : ''} · ${row.truck.unit} · ${row.driver}` : `${row.truck.unit} · ${row.driver}`}</p>
        </div>
        {l && <Tag label={l.status} tagClass={l.tagClass} />}
        <button type="button" className="rp-icon-btn" aria-label="Close" onClick={onClose}>×</button>
      </div>
      {l ? (
        <>
          <div className="rp-sheet-facts">
            <div><span>Customer</span><b>{l.customer}</b></div>
            <div><span>Pickup</span><b>{bar.windows ? windowText(bar.windows.pickup) : TIME.format(bar.start)}</b><em>{bar.windows ? `Truck there ~${CLOCK.format(bar.start)} · ` : ''}{l.from}</em></div>
            <div><span>Delivery</span><b>{bar.windows ? windowText(bar.windows.delivery) : TIME.format(bar.end)}</b><em>{bar.windows ? `Truck there ~${CLOCK.format(bar.end - 60 * 60_000)} · ` : ''}{l.to}</em></div>
            <div><span>Rate</span><b>{l.rate}</b><em>{perMile(rateOf(l), milesOf(l))}</em></div>
            <div><span>Miles</span><b>{milesOf(l) ? miles(milesOf(l)) : '—'}</b></div>
            <div><span>Equipment</span><b>{l.equip || row.equipment}</b>{l.temp && <em>{l.temp}</em>}</div>
          </div>
          <div className="rp-sheet-foot">
            {bar.kind !== 'booked' && (
              <div className="rp-progress" aria-label={`${Math.round(done * 100)}% of the trip's time`}>
                <div className="rp-progress-top"><span>Trip</span><span>{Math.round(done * 100)}%</span></div>
                <div className="rp-progress-track"><span style={{ width: `${done * 100}%` }} /></div>
              </div>
            )}
            <div style={{ flex: 1 }} />
            {movable(l) && (
              <label className="rp-pick rp-move">
                <span>Move to</span>
                <select className="ui-input rp-select" value="" onChange={(e) => { if (e.target.value) onMove(l, e.target.value); }}>
                  <option value="">Another truck…</option>
                  {trucks.filter((t) => t.unit !== row.truck.unit).map((t) => <option key={t.id} value={t.unit}>{t.unit} · {t.driver && t.driver !== 'Unassigned' ? t.driver : 'No driver'}</option>)}
                </select>
              </label>
            )}
            <Link className="ui-btn ui-btn-primary" to={`/app/loads/${l.id}`}>Open load</Link>
          </div>
          {bar.late && <p className="rp-sheet-late" role="alert">⚠ The plan has {row.truck.unit} {lateText(bar.late)}. Move the load to another truck or ask for a new appointment.</p>}
        </>
      ) : w ? (
        <>
          <div className="rp-sheet-facts">
            <div><span>Service</span><b>{w.type}</b></div>
            <div><span>Shop</span><b>{w.shop || '—'}</b></div>
            <div><span>Booked for</span><b>{fmtDate(w.dueDate, true)}</b></div>
            <div><span>Status</span><b>{w.status}{w.outOfService ? ' · out of service' : ''}</b></div>
          </div>
          <div className="rp-sheet-foot"><div style={{ flex: 1 }} /><Link className="ui-btn" to="/app/safety/maintenance">Open in Maintenance</Link></div>
        </>
      ) : null}
    </div>
  );
}

// — Connect load: booked loads with no truck, near where this one empties —

function ConnectDialog({ truck, place, from, until, radius, onRadius, onClose }: {
  truck: FleetTruck; place: string; from: number; until: number; radius: number; onRadius: (n: number) => void; onClose: () => void;
}) {
  const { loads, updateLoad } = useAppShell();
  const { ref, closeNow, ownEvent } = useModal(onClose);
  const found = reloadsNear(place, loads, radius, from, until);
  const driver = truck.driver && truck.driver !== 'Unassigned' ? truck.driver : '';
  const connect = (l: Load) => {
    updateLoad(assignLoad(l, truck, loads.filter((x) => x.id !== l.id)));
    toast(`${l.id} connected to ${truck.unit}${driver ? ` (${driver})` : ''}.`, 'done', { label: 'Undo', run: () => updateLoad(l) });
    closeNow();
  };
  return (
    <dialog ref={ref} className="ui-dialog rp-connect-dialog" aria-label={`Connect a load to ${truck.unit}`} onClose={(e) => { if (ownEvent(e)) onClose(); }} onCancel={(e) => ownEvent(e)}>
      <div className="ui-dialog-main">
        <section className="ui-dialog-body">
          <button type="button" className="ui-dialog-close" onClick={closeNow} aria-label="Close">×</button>
          <div>
            <div className="ui-label">Connect load</div>
            <h2 className="ui-h2" style={{ margin: '2px 0 0' }}>{truck.unit}{driver ? ` · ${driver}` : ''}</h2>
            <p className="ui-p" style={{ marginTop: 4 }}>
              Empty in <b>{place}</b> from {TIME.format(from)}{Number.isFinite(until) ? `, next load picks up ${TIME.format(until)}` : ''}. Booked loads with no truck yet, picking up within the deadhead range{Number.isFinite(until) ? ' and delivered before then' : ''} — nearest first.
            </p>
          </div>
          <label className="rp-pick">
            <span>Deadhead range</span>
            <select className="ui-input rp-select" value={radius} onChange={(e) => onRadius(Number(e.target.value))}>
              {DEADHEADS.map((n) => <option key={n} value={n}>{n} miles</option>)}
            </select>
          </label>
          {found.length === 0 ? (
            <div className="ui-empty">No booked loads without a truck pick up within {radius} miles of {place}. Try a wider range, or book one in Loads.</div>
          ) : (
            <ul className="rp-reloads">
              {found.map((x) => (
                <li key={x.load.id} className="rp-reload">
                  <div className="rp-reload-main">
                    <div className="rp-reload-route">{x.load.route}</div>
                    <div className="ui-stop-meta">{x.load.id} · {x.load.customer} · picks up {TIME.format(x.start)}</div>
                  </div>
                  <div className="rp-reload-figs">
                    <span><b>{x.deadhead} mi</b> deadhead</span>
                    <span><b>{milesOf(x.load) ? miles(milesOf(x.load)) : '—'}</b> loaded</span>
                    <span><b>{x.load.rate}</b> {perMile(rateOf(x.load), milesOf(x.load))}</span>
                  </div>
                  <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" onClick={() => connect(x.load)}>Connect</button>
                </li>
              ))}
            </ul>
          )}
          <p className="rp-fine">Miles are estimated from the cities on each load.</p>
        </section>
      </div>
    </dialog>
  );
}
