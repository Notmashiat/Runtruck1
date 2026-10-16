import { can } from '../lib/auth';
import { WIDGET_NEEDS } from '../data/dashboard';
import { useState } from 'react';
import {
  MAX_SHOWN, WIDGETS, defaultLayout, type ChartStyle, type CustomerPeriod, type DashLayout, type DashOptions, type Density, type WidgetGroup,
  type WidgetId,
} from '../data/dashboard';
import { isLive } from '../lib/releases';
import { Choice, useModal } from './FormBits';

const WIDTHS: { span: number; label: string }[] = [
  { span: 2, label: '1/6' }, { span: 3, label: '1/4' }, { span: 4, label: '1/3' }, { span: 6, label: '1/2' },
  { span: 8, label: '2/3' }, { span: 9, label: '3/4' }, { span: 12, label: 'Full' },
];
const GROUPS: WidgetGroup[] = ['Numbers', 'Analysis', 'Tables & lists'];
const COLUMNS: { key: keyof DashOptions['loadColumns']; label: string }[] = [
  { key: 'customer', label: 'Customer' }, { key: 'route', label: 'Route' }, { key: 'pickup', label: 'Pickup' },
  { key: 'driver', label: 'Driver' }, { key: 'rate', label: 'Rate' }, { key: 'status', label: 'Status' },
];

function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`dash-switch${on ? ' is-on' : ''}`} disabled={disabled} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

// Widgets & options: show or hide each widget, set its width and order, and
// the display settings. Changes apply as you make them.
export function DashboardCustomize({ layout, onChange, onClose }: { layout: DashLayout; onChange: (l: DashLayout) => void; onClose: () => void }) {
  const { ref, closeNow, ownEvent } = useModal(onClose);
  const [tab, setTab] = useState<'Widgets' | 'Display'>('Widgets');
  const o = layout.options;
  const setItem = (id: WidgetId, patch: Partial<DashLayout['items'][number]>) =>
    onChange({ ...layout, items: layout.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
  const setOpt = <K extends keyof DashOptions>(k: K, v: DashOptions[K]) => onChange({ ...layout, options: { ...o, [k]: v } });
  const move = (id: WidgetId, dir: -1 | 1) => {
    // Swap with the next widget this account can see (not one hidden from it by permissions).
    const visible = layout.items.filter((i) => !i.hidden && can(WIDGET_NEEDS[i.id]));
    const at = visible.findIndex((i) => i.id === id);
    const other = visible[at + dir];
    if (!other) return;
    const items = [...layout.items];
    const a = items.findIndex((i) => i.id === id);
    const b = items.findIndex((i) => i.id === other.id);
    [items[a], items[b]] = [items[b], items[a]];
    onChange({ ...layout, items });
  };
  const allowed = layout.items.filter((i) => can(WIDGET_NEEDS[i.id]));
  const shown = allowed.filter((i) => !i.hidden).length;
  // From release 1.17 the dashboard holds MAX_SHOWN widgets: once full, one has to be hidden before another is shown.
  const full = isLive('dashboard-fit') && shown >= MAX_SHOWN;

  return (
    <dialog ref={ref} className="ui-dialog is-medium" aria-label="Customize dashboard" onClose={(e) => { if (ownEvent(e)) onClose(); }} onCancel={(e) => ownEvent(e)}>
      <div className="ui-dialog-main">
        <section className="ui-dialog-body">
          <button type="button" className="ui-dialog-close" onClick={closeNow} aria-label="Close">×</button>
          <div>
            <h2 className="ui-h2" style={{ margin: 0 }}>Customize dashboard</h2>
            <p className="ui-p" style={{ marginTop: 4 }}>Changes apply as you go. On the dashboard, drag a widget’s handle to move it and its corner to resize it.</p>
          </div>
          <Choice options={['Widgets', 'Display'] as ('Widgets' | 'Display')[]} value={tab} onChange={setTab} />

          {tab === 'Widgets' && GROUPS.map((g) => (
            <div key={g}>
              <div className="ui-label" style={{ marginBottom: 8 }}>{g}</div>
              <div className="dash-lib">
                {WIDGETS.filter((w) => w.group === g && can(WIDGET_NEEDS[w.id])).map((w) => {
                  const it = layout.items.find((i) => i.id === w.id);
                  if (!it) return null;
                  return (
                    <div key={w.id} className={`dash-lib-row${it.hidden ? ' is-off' : ''}`}>
                      <Switch on={!it.hidden} onChange={(on) => setItem(w.id, { hidden: !on })} label={`Show ${w.title}`} disabled={full && it.hidden} />
                      <div className="dash-lib-text">
                        <strong>{w.title}</strong>
                        <span>{w.about}</span>
                      </div>
                      <select
                        className="ui-input dash-lib-size" aria-label={`${w.title} width`} value={it.span} disabled={it.hidden}
                        onChange={(e) => setItem(w.id, { span: Number(e.target.value) })}
                      >
                        {WIDTHS.filter((x) => x.span >= w.minSpan).map((x) => <option key={x.span} value={x.span}>{x.label}</option>)}
                        {!WIDTHS.some((x) => x.span === it.span) && <option value={it.span}>{it.span}/12</option>}
                      </select>
                      <div className="dash-lib-move">
                        <button type="button" className="ui-icon-btn" aria-label={`Move ${w.title} earlier`} disabled={it.hidden} onClick={() => move(w.id, -1)}>↑</button>
                        <button type="button" className="ui-icon-btn" aria-label={`Move ${w.title} later`} disabled={it.hidden} onClick={() => move(w.id, 1)}>↓</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {tab === 'Display' && (
            <div className="dash-opts">
              <div className="dash-opt">
                <div><strong>Spacing</strong><span>Room between widgets and inside them.</span></div>
                <Choice options={['Comfortable', 'Compact'] as Density[]} value={o.density} onChange={(v) => setOpt('density', v)} />
              </div>
              <div className="dash-opt">
                <div><strong>Fill gaps automatically</strong><span>Smaller widgets move up into empty space. Turn off to keep the exact order.</span></div>
                <Switch on={o.packed} onChange={(v) => setOpt('packed', v)} label="Fill gaps automatically" />
              </div>
              <div className="dash-opt">
                <div><strong>Greeting and date</strong><span>The line above the widgets.</span></div>
                <Switch on={o.greeting} onChange={(v) => setOpt('greeting', v)} label="Greeting and date" />
              </div>
              <div className="dash-opt">
                <div><strong>Notes under numbers</strong><span>The small line of detail in each number widget.</span></div>
                <Switch on={o.notes} onChange={(v) => setOpt('notes', v)} label="Notes under numbers" />
              </div>
              <div className="dash-opt">
                <div><strong>Revenue chart period</strong><span>How many days the revenue chart covers.</span></div>
                <Choice options={['7', '14', '30']} value={String(o.revenueDays)} onChange={(v) => setOpt('revenueDays', Number(v) as DashOptions['revenueDays'])} />
              </div>
              <div className="dash-opt">
                <div><strong>Revenue chart style</strong><span>Bars per day, or a trend line.</span></div>
                <Choice options={['Bars', 'Line'] as ChartStyle[]} value={o.chartStyle} onChange={(v) => setOpt('chartStyle', v)} />
              </div>
              <div className="dash-opt">
                <div><strong>Values on bars</strong><span>Each day’s amount above its bar (7 and 14 days).</span></div>
                <Switch on={o.chartValues} onChange={(v) => setOpt('chartValues', v)} label="Values on bars" />
              </div>
              <div className="dash-opt">
                <div><strong>Revenue by customer</strong><span>The period the customer breakdown covers.</span></div>
                <Choice options={['This week', 'Last 30 days', 'All time'] as CustomerPeriod[]} value={o.customerPeriod} onChange={(v) => setOpt('customerPeriod', v)} />
              </div>
              <div className="dash-opt is-column">
                <div><strong>Active loads columns</strong><span>Load number always shows. Drag the table’s corner to show more or fewer rows.</span></div>
                <div className="dash-cols">
                  {COLUMNS.map((c) => (
                    <label key={c.key} className="ui-check">
                      <input type="checkbox" checked={o.loadColumns[c.key]} onChange={(e) => setOpt('loadColumns', { ...o.loadColumns, [c.key]: e.target.checked })} />
                      {c.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
        <footer className="ui-dialog-foot">
          <button
            type="button" className="ui-btn"
            onClick={() => { if (window.confirm('Put the dashboard back to the standard layout and settings?')) onChange(defaultLayout()); }}
          >
            Reset to default
          </button>
          <div style={{ flex: 1 }} />
          <span className="muted" style={{ fontSize: 13 }}>
            {full ? `${shown} of ${MAX_SHOWN} shown, the most the dashboard holds. Hide one to add another.` : `${shown} of ${isLive('dashboard-fit') ? MAX_SHOWN : allowed.length} widgets shown`}
          </span>
          <button type="button" className="ui-btn ui-btn-primary" onClick={closeNow}>Done</button>
        </footer>
      </div>
    </dialog>
  );
}
