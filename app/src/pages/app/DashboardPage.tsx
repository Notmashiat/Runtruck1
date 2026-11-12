import { can } from '../../lib/auth';
import { WIDGET_NEEDS } from '../../data/dashboard';
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardCustomize } from '../../components/DashboardCustomize';
import { cardFor, kpiFor, useDashboardData } from '../../components/DashboardWidgets';
import type { Period } from '../../data/insights';
import { PeriodMenu } from '../../components/PeriodMenu';
import { NavIcon } from '../../components/NavIcons';
import { MAX_SHOWN, defaultLayout, reviveLayout, widgetDef, type DashLayout, type LayoutItem, type WidgetId } from '../../data/dashboard';
import { USER } from '../../data/mock';
import { formatNow, hourNow, useNow } from '../../lib/clock';
import { isLive } from '../../lib/releases';
import { usePersisted } from '../../lib/persist';
import { CountUp } from '../../components/CountUp';

const ROW = 10; // grid row unit (px); widget heights snap to it
// Release 1.37: widgets are never squeezed below this share of their height
// (a very short window scrolls instead), so a card always has room to show
// what is in it.
const MIN_FIT = 0.65;
// The widgets count as filling the window when the tallest column ends this
// close to the bottom (the grid's spacing below the last widget).
const FILLED_WITHIN = 24;

// The room the grid has to leave at the bottom of the page: the padding (and
// edge) of everything around it, up to and including the page's main area.
function spaceBelow(grid: HTMLElement, main: HTMLElement): number {
  let space = 0;
  for (let el = grid.parentElement; el; el = el.parentElement) {
    const cs = getComputedStyle(el);
    space += parseFloat(cs.paddingBottom) + (el === main ? 0 : parseFloat(cs.borderBottomWidth));
    if (el === main) break;
  }
  return space;
}
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function greeting() {
  const h = hourNow();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

// The dashboard: a 12-column grid of widgets the person arranges. Customize
// turns on edit mode — drag a widget's handle to move it, its corner to make
// it wider/narrower and taller/shorter, × to hide it — and Widgets & options
// adds widgets and changes display settings. The layout is remembered.
// From release 1.17 it holds at most MAX_SHOWN widgets, and their heights are
// scaled down together so they fit the window without the page scrolling.
export function DashboardPage() {
  const navigate = useNavigate();
  const fit = isLive('dashboard-fit');
  // Release 1.31 replaced every widget: layouts saved before it start over.
  const [layout, setLayout] = usePersisted<DashLayout>('runtruck-dashboard-v2', defaultLayout(), reviveLayout);
  const data = useDashboardData(layout.options.period);
  const setPeriod = (period: Period) => setLayout((p) => ({ ...p, options: { ...p.options, period } }));
  const [editing, setEditing] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [dragId, setDragId] = useState<WidgetId | null>(null);
  const [sizing, setSizing] = useState<WidgetId | null>(null);
  const [cols, setCols] = useState(12);
  // How much the widgets' heights are scaled to fit the window (1 = as set).
  const [scale, setScale] = useState(1);
  const shownScale = useRef(1);
  const gridRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: WidgetId; lastOver?: string; lx: number; ly: number } | null>(null);
  const resize = useRef<{ id: WidgetId; x: number; y: number; w: number; h: number; colW: number; minSpan: number; minH: number } | null>(null);

  const o = layout.options;
  const gap = o.density === 'Compact' ? 12 : 20;

  // Fewer columns when the dashboard is narrow (small window, open sidebar).
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      setCols(w < 620 ? 1 : w < 960 ? 6 : 12);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fit to the window: the room left under the top of the grid, against the
  // grid's height at full size (its height now, divided by the scale it is
  // drawn at). One column (a phone) scrolls as before.
  const fitting = fit && cols > 1;
  const drawn = fitting ? scale : 1;
  // Updated before the browser lays the page out, so a measurement always
  // knows the scale the grid it measured was drawn at.
  useLayoutEffect(() => {
    shownScale.current = drawn;
  }, [drawn]);
  useEffect(() => {
    const grid = gridRef.current;
    const main = grid?.closest<HTMLElement>('.ui-main');
    if (!grid || !main || !fitting) return;
    const measure = () => {
      // On-screen positions are scaled by the text size (Settings › Appearance);
      // sizes such as clientHeight are not. Measure in the page's own pixels.
      const ratio = main.getBoundingClientRect().height / main.offsetHeight || 1;
      const top = (grid.getBoundingClientRect().top - main.getBoundingClientRect().top) / ratio + main.scrollTop;
      const room = main.clientHeight - top - spaceBelow(grid, main) - 1;
      const full = grid.offsetHeight / shownScale.current;
      setScale(full > 0 ? Math.max(MIN_FIT, Math.min(1, Math.floor((room / full) * 1000) / 1000)) : 1);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(main);
    ro.observe(grid);
    // The greeting line above the grid changes the room left.
    if (grid.previousElementSibling) ro.observe(grid.previousElementSibling);
    return () => ro.disconnect();
  }, [fitting]);

  const effSpan = (it: LayoutItem) => (cols === 12 ? it.span : cols === 6 ? (it.span <= 4 ? 3 : 6) : 1);
  const setItem = (id: WidgetId, patch: Partial<LayoutItem>) =>
    setLayout((p) => ({ ...p, items: p.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));

  // — move: drag the handle over another widget to take its place —
  const moveDown = (id: WidgetId) => (e: ReactPointerEvent<HTMLElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id, lx: e.clientX, ly: e.clientY };
    setDragId(id);
  };
  const moveMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-widget]')?.getAttribute('data-widget') as WidgetId | undefined;
    if (!over || over === d.id) return;
    // After a swap, wait for the pointer to travel before swapping with the same widget again.
    if (over === d.lastOver && Math.hypot(e.clientX - d.lx, e.clientY - d.ly) < 40) return;
    d.lastOver = over;
    d.lx = e.clientX;
    d.ly = e.clientY;
    setLayout((p) => {
      const items = [...p.items];
      const from = items.findIndex((i) => i.id === d.id);
      const to = items.findIndex((i) => i.id === over);
      const [m] = items.splice(from, 1);
      items.splice(to, 0, m);
      return { ...p, items };
    });
  };
  const moveUp = () => {
    drag.current = null;
    setDragId(null);
  };

  // — resize: drag the corner; width snaps to grid columns, height to 10 px —
  const sizeDown = (it: LayoutItem) => (e: ReactPointerEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const card = e.currentTarget.closest('[data-widget]') as HTMLElement;
    const gridW = gridRef.current?.clientWidth ?? 1200;
    const def = widgetDef(it.id);
    resize.current = {
      id: it.id, x: e.clientX, y: e.clientY, w: card.getBoundingClientRect().width, h: it.h,
      colW: (gridW - gap * (cols - 1)) / cols, minSpan: def.minSpan, minH: def.minH,
    };
    setSizing(it.id);
  };
  const sizeMove = (e: ReactPointerEvent<HTMLElement>) => {
    const r = resize.current;
    if (!r) return;
    // The pointer moves in drawn pixels; the height is kept at full size.
    const h = clamp(Math.round((r.h + (e.clientY - r.y) / drawn) / ROW) * ROW, r.minH, 1200);
    const patch: Partial<LayoutItem> = { h };
    if (cols === 12) patch.span = clamp(Math.round((r.w + e.clientX - r.x + gap) / (r.colW + gap)), r.minSpan, 12);
    setItem(r.id, patch);
  };
  const sizeUp = () => {
    resize.current = null;
    setSizing(null);
  };

  const shown = layout.items.filter((i) => !i.hidden && can(WIDGET_NEEDS[i.id]));
  const visible = fit ? shown.slice(0, MAX_SHOWN) : shown;

  // Release 1.26: when the widgets fill the window (the tallest column
  // reaches the bottom), the widget at the bottom of each shorter column
  // reaches down too, so they all end level with the sidebar. A dashboard
  // with room to spare is left as it is, and so is one being customised
  // (where the heights shown are the ones set).
  const [stretch, setStretch] = useState<Record<string, number>>({});
  const fillDown = fitting && !editing;
  const heights = visible.map((it) => `${it.id}:${it.h}:${it.span}`).join(',');
  useEffect(() => {
    const grid = gridRef.current;
    const main = grid?.closest<HTMLElement>('.ui-main');
    if (!grid || !main) return;
    const compute = () => {
      const next: Record<string, number> = {};
      let windowFull = false;
      if (fillDown) {
        // Positions on screen are scaled by the text size; heights are not.
        const ratio = main.getBoundingClientRect().height / main.offsetHeight || 1;
        // 1 px short of the island's inner edge, so rounding can never push a
        // widget over it.
        const bottom = main.getBoundingClientRect().top + (main.clientHeight - spaceBelow(grid, main) - 1) * ratio;
        const hOf = new Map(heights.split(',').map((x) => { const [id, h] = x.split(':'); return [id, Number(h)] as const; }));
        const items = [...grid.querySelectorAll<HTMLElement>('[data-widget]')].map((el) => ({ id: el.dataset.widget ?? '', r: el.getBoundingClientRect() }));
        // Where each widget ends at its set height. Not the box on screen: that
        // already includes any stretch, and measuring it would hide the
        // widget underneath and stretch it too (the overlap in release 1.28).
        const ends = items.map((a) => a.r.top + (hOf.get(a.id) ?? 0) * shownScale.current * ratio);
        const filled = ends.length > 0 && (bottom - Math.max(...ends)) / ratio <= FILLED_WITHIN;
        windowFull = filled;
        items.forEach((a, i) => {
          const below = items.some((b) => b !== a && b.r.top >= ends[i] - 1 && b.r.left < a.r.right - 1 && b.r.right > a.r.left + 1);
          const extra = Math.floor((bottom - ends[i]) / ratio);
          if (filled && !below && extra > 0) next[a.id] = extra;
        });
      }
      // The island runs to the bottom too, level with the sidebar, when the widgets fill it.
      grid.closest('.dash-island')?.classList.toggle('is-filled', windowFull);
      setStretch((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    // Runs once when it starts watching, then whenever anything that moves the
    // widgets changes size: the window, the grid, the island, and the greeting
    // above the grid (its date line can rewrap as the clock ticks, or when the
    // font arrives, and that moves every widget down without resizing the grid).
    const ro = new ResizeObserver(compute);
    ro.observe(main);
    ro.observe(grid);
    const island = grid.closest('.dash-island');
    if (island) ro.observe(island);
    if (grid.previousElementSibling) ro.observe(grid.previousElementSibling);
    let alive = true;
    void document.fonts?.ready.then(() => { if (alive) compute(); });
    return () => {
      alive = false;
      ro.disconnect();
    };
  }, [fillDown, heights, cols, drawn]);
  // A layout saved with more widgets than the dashboard holds keeps the first ones.
  const extra = fit ? shown.slice(MAX_SHOWN).map((i) => i.id).join() : '';
  useEffect(() => {
    if (!extra) return;
    const drop = new Set(extra.split(','));
    setLayout((p) => ({ ...p, items: p.items.map((i) => (drop.has(i.id) ? { ...i, hidden: true } : i)) }));
  }, [extra, setLayout]);
  // The real date and time, in the time zone from Settings › Profile; ticks every 30 s.
  const now = useNow();
  const today = `${formatNow(now, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · ${formatNow(now, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}`;

  return (
    <>
      {/* Release 1.28: the greeting, Customize and every widget on one floating island. */}
      <section className="dash-island" aria-label="Dashboard">
      <div className={`dash-top${editing ? ' is-editing' : ''}`}>
        {o.greeting && !editing && (
          <div>
            <div className="dash-hello">{greeting()}, {USER.name.split(' ')[0]}</div>
            <div className="dash-today">{today}</div>
          </div>
        )}
        {editing && (
          <div className="dash-hint">
            <strong>Customizing</strong> · drag <span className="dash-hint-icon">⠿</span> to move, drag the corner to resize, × to hide
          </div>
        )}
        <div style={{ flex: 1 }} />
        {editing ? (
          <>
            <button type="button" className="ui-btn" onClick={() => setOptionsOpen(true)}>Widgets &amp; options</button>
            <button type="button" className="ui-btn" onClick={() => { if (window.confirm('Put the dashboard back to the standard layout and settings?')) setLayout(defaultLayout()); }}>Reset</button>
            <button type="button" className="ui-btn ui-btn-primary" onClick={() => setEditing(false)}>Done</button>
          </>
        ) : (
          <>
            {/* The period every insight covers (release 1.31; a dropdown from 1.33). */}
            <PeriodMenu value={o.period} onChange={setPeriod} />
            <button type="button" className="ui-btn dash-customize" onClick={() => setEditing(true)}>
              <NavIcon name="settings" size={16} /> Customize
            </button>
          </>
        )}
      </div>

      <div
        ref={gridRef}
        className={`dash-grid${editing ? ' is-editing' : ''}${o.density === 'Compact' ? ' is-compact' : ''}`}
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, columnGap: gap, gridAutoRows: ROW * drawn, gridAutoFlow: o.packed ? 'row dense' : 'row' }}
      >
        {visible.map((it) => {
          const kpi = kpiFor(it.id, data);
          const card = kpi ? null : cardFor(it.id, data);
          const title = widgetDef(it.id).title;
          const height = it.h * drawn;
          // A number widget shrunk to fit the window lays itself out tighter.
          const fitClass = kpi ? (height < 72 ? ' is-short is-tiny' : height < 100 ? ' is-short' : '') : '';
          return (
            <div
              key={it.id}
              data-widget={it.id}
              className={`dash-item${dragId === it.id ? ' is-dragging' : ''}${sizing === it.id ? ' is-sizing' : ''}`}
              style={{ gridColumn: `span ${effSpan(it)}`, gridRow: `span ${Math.ceil((it.h + gap) / ROW)}` }}
            >
              <section
                className={`dash-card${kpi ? ' is-kpi' : ''}${fitClass}`}
                style={{ height: height + (stretch[it.id] ?? 0) }}
                onClick={kpi && !editing ? () => navigate(kpi.to) : undefined}
                role={kpi && !editing ? 'link' : undefined}
                tabIndex={kpi && !editing ? 0 : undefined}
                onKeyDown={kpi && !editing ? (e) => { if (e.key === 'Enter') navigate(kpi.to); } : undefined}
              >
                {kpi && (
                  <>
                    <div className="dash-kpi-label">{kpi.label}</div>
                    {o.notes && <div className="dash-kpi-note">{kpi.note}</div>}
                    <div className="dash-kpi-foot">
                      {kpi.delta && <span className={`dash-kpi-delta${kpi.delta.good ? ' is-good' : ' is-bad'}`} title={kpi.delta.title}>{kpi.delta.text}</span>}
                      <div className="dash-kpi-value"><CountUp text={kpi.value} /></div>
                    </div>
                  </>
                )}
                {card && (
                  <>
                    <div className="dash-card-head">
                      <div className="dash-card-title">{card.title}</div>
                      <div style={{ flex: 1 }} />
                      {!editing && card.action}
                    </div>
                    <div className={`dash-card-body${card.flush ? ' is-flush' : ''}`}>{card.body}</div>
                  </>
                )}

                {editing && (
                  <>
                    <button
                      type="button" className="dash-handle" aria-label={`Move ${title}`} title="Drag to move"
                      onPointerDown={moveDown(it.id)} onPointerMove={moveMove} onPointerUp={moveUp} onPointerCancel={moveUp}
                    >
                      ⠿
                    </button>
                    <button type="button" className="dash-hide" aria-label={`Hide ${title}`} title="Hide" onClick={() => setItem(it.id, { hidden: true })}>×</button>
                    <div
                      className="dash-resize" role="separator" aria-label={`Resize ${title}`} title="Drag to resize"
                      onPointerDown={sizeDown(it)} onPointerMove={sizeMove} onPointerUp={sizeUp} onPointerCancel={sizeUp}
                    />
                    {sizing === it.id && <div className="dash-size-badge">{cols === 12 ? `${it.span}/12 · ` : ''}{it.h}px</div>}
                  </>
                )}
              </section>
            </div>
          );
        })}
        {visible.length === 0 && (
          <div className="dash-empty-all" style={{ gridColumn: '1 / -1' }}>
            Every widget is hidden. <button type="button" className="ui-link" onClick={() => setOptionsOpen(true)}>Choose widgets</button>
          </div>
        )}
      </div>
      </section>

      {optionsOpen && <DashboardCustomize layout={layout} onChange={setLayout} onClose={() => setOptionsOpen(false)} />}
    </>
  );
}
