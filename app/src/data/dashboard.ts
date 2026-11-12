// The dashboard's layout and options: which widgets show, in what order, how
// wide (columns of a 12-column grid) and how tall (px), plus display
// settings and the period the insights cover. Kept in this browser's storage
// (runtruck-dashboard-v2; release 1.31 replaced every widget, so layouts saved
// before it are not carried over).

import type { Period } from './insights';

export type WidgetId =
  | 'kpi-revenue' | 'kpi-profit' | 'kpi-trucks' | 'kpi-delivered' | 'kpi-rpm'
  | 'ontime' | 'trend' | 'lanes' | 'ontime-customers' | 'late-loads';

export type WidgetGroup = 'Numbers' | 'Analysis' | 'Tables & lists';

export interface WidgetDef {
  id: WidgetId;
  title: string;
  about: string;
  group: WidgetGroup;
  minSpan: number;
  minH: number;
}

export const WIDGETS: WidgetDef[] = [
  { id: 'kpi-revenue', title: 'Revenue', about: 'Delivered in the period', group: 'Numbers', minSpan: 2, minH: 110 },
  { id: 'kpi-profit', title: 'Profit', about: 'Revenue less driver and carrier pay and bills', group: 'Numbers', minSpan: 2, minH: 110 },
  { id: 'kpi-trucks', title: 'Active trucks', about: 'Trucks on a load now, out of the fleet', group: 'Numbers', minSpan: 2, minH: 110 },
  { id: 'kpi-delivered', title: 'Loads delivered', about: 'How many loads, and how many were late', group: 'Numbers', minSpan: 2, minH: 110 },
  { id: 'kpi-rpm', title: 'Revenue per mile', about: 'Against what each mile cost', group: 'Numbers', minSpan: 2, minH: 110 },
  { id: 'trend', title: 'Total profit', about: 'Profit through the period against the one before, point by point', group: 'Analysis', minSpan: 4, minH: 200 },
  { id: 'ontime', title: 'On-time delivery', about: 'A gauge of loads delivered on or before their booked day, against a 95% target', group: 'Analysis', minSpan: 3, minH: 200 },
  { id: 'lanes', title: 'Top lanes by profit', about: 'What each lane earned after driver and carrier pay', group: 'Analysis', minSpan: 3, minH: 200 },
  { id: 'ontime-customers', title: 'On-time by customer', about: 'Each customer’s on-time delivery, worst first', group: 'Tables & lists', minSpan: 4, minH: 200 },
  { id: 'late-loads', title: 'Late deliveries', about: 'Loads delivered after their booked day', group: 'Tables & lists', minSpan: 3, minH: 180 },
];

// The section (or tab) each widget shows data from: an account without it
// does not get the widget.
export const WIDGET_NEEDS: Record<WidgetId, string> = {
  ontime: 'loads', 'kpi-revenue': 'accounting/invoiced', 'kpi-profit': 'accounting/invoiced', 'kpi-trucks': 'fleet/trucks',
  'kpi-delivered': 'loads', 'kpi-rpm': 'loads',
  trend: 'accounting/invoiced', lanes: 'loads', 'ontime-customers': 'loads', 'late-loads': 'loads',
};

export const widgetDef = (id: WidgetId) => WIDGETS.find((w) => w.id === id) as WidgetDef;

export interface LayoutItem {
  id: WidgetId;
  span: number;
  h: number;
  hidden: boolean;
}

export type Density = 'Comfortable' | 'Compact';

export interface DashOptions {
  density: Density;
  // Let smaller widgets fill gaps left by taller ones (may change the order slightly).
  packed: boolean;
  greeting: boolean;
  notes: boolean;
  // The period every insight covers (YTD, one year, one month, one week).
  period: Period;
}

export interface DashLayout {
  items: LayoutItem[];
  options: DashOptions;
}

const item = (id: WidgetId, span: number, h: number, hidden = false): LayoutItem => ({ id, span, h, hidden });

// From release 1.17 the dashboard shows at most this many widgets, and they
// are fitted to the window so the page never scrolls.
export const MAX_SHOWN = 7;

// The layout a new (or reset) dashboard starts from: three numbers, the
// profit graph beside the on-time gauge, then the best lanes beside on-time by
// customer (release 1.32).
const DEFAULT_LAYOUT: DashLayout = {
  items: [
    item('kpi-revenue', 4, 120), item('kpi-delivered', 4, 120), item('kpi-trucks', 4, 120),
    item('trend', 8, 300), item('ontime', 4, 300),
    item('lanes', 6, 280), item('ontime-customers', 6, 280),
    item('kpi-profit', 3, 120, true), item('kpi-rpm', 3, 120, true), item('late-loads', 6, 260, true),
  ],
  options: { density: 'Comfortable', packed: true, greeting: true, notes: true, period: '1W' },
};

export const defaultLayout = (): DashLayout => ({ items: DEFAULT_LAYOUT.items.map((i) => ({ ...i })), options: { ...DEFAULT_LAYOUT.options } });

const PERIOD_KEYS: Period[] = ['YTD', '1Y', '1M', '1W'];

// A saved layout, completed with anything added since it was saved (new
// widgets arrive hidden at the end; unknown ones are dropped).
export function reviveLayout(raw: unknown): DashLayout | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<DashLayout>;
  if (!Array.isArray(r.items)) return null;
  const known = new Set(WIDGETS.map((w) => w.id));
  const items = r.items.filter((i) => i && known.has(i.id) && typeof i.span === 'number' && typeof i.h === 'number');
  for (const d of DEFAULT_LAYOUT.items) if (!items.some((i) => i.id === d.id)) items.push({ ...d, hidden: true });
  const o = (r.options ?? {}) as Partial<DashOptions>;
  const options = { ...DEFAULT_LAYOUT.options, ...o };
  if (!PERIOD_KEYS.includes(options.period)) options.period = DEFAULT_LAYOUT.options.period;
  return { items, options };
}
