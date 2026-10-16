// The dashboard's layout and options: which widgets show, in what order, how
// wide (columns of a 12-column grid) and how tall (px), plus display
// settings. Kept in this browser's storage (runtruck-dashboard).

import { isLive } from '../lib/releases';

export type WidgetId =
  | 'kpi-active' | 'kpi-revenue' | 'kpi-rpm' | 'kpi-unbilled' | 'kpi-overdue' | 'kpi-drivers' | 'kpi-trucks' | 'kpi-docs'
  | 'attention' | 'revenue' | 'active-loads' | 'drivers' | 'ar-aging' | 'by-customer' | 'lanes' | 'upcoming' | 'fleet' | 'cash';

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
  { id: 'kpi-active', title: 'Active loads', about: 'Loads still in progress', group: 'Numbers', minSpan: 2, minH: 110 },
  { id: 'kpi-revenue', title: 'Revenue this week', about: 'Delivered since Monday', group: 'Numbers', minSpan: 2, minH: 110 },
  { id: 'kpi-rpm', title: 'Rate per mile', about: 'This week’s revenue per loaded mile', group: 'Numbers', minSpan: 2, minH: 110 },
  { id: 'kpi-unbilled', title: 'Unbilled loads', about: 'Delivered, no invoice yet', group: 'Numbers', minSpan: 2, minH: 110 },
  { id: 'kpi-overdue', title: 'Past-due AR', about: 'Invoices past their due date', group: 'Numbers', minSpan: 2, minH: 110 },
  { id: 'kpi-drivers', title: 'Drivers available', about: 'Ready for a load now', group: 'Numbers', minSpan: 2, minH: 110 },
  { id: 'kpi-trucks', title: 'Trucks in service', about: 'Power units able to run', group: 'Numbers', minSpan: 2, minH: 110 },
  { id: 'kpi-docs', title: 'Docs to renew', about: 'Expired or due within 60 days', group: 'Numbers', minSpan: 2, minH: 110 },
  { id: 'attention', title: 'Needs attention', about: 'Everything waiting on someone, most urgent first', group: 'Analysis', minSpan: 3, minH: 180 },
  { id: 'revenue', title: 'Revenue delivered', about: 'Revenue by delivery day', group: 'Analysis', minSpan: 3, minH: 200 },
  { id: 'ar-aging', title: 'Receivables aging', about: 'Unpaid invoices by how late they are', group: 'Analysis', minSpan: 3, minH: 200 },
  { id: 'by-customer', title: 'Revenue by customer', about: 'Who the revenue comes from', group: 'Analysis', minSpan: 3, minH: 200 },
  { id: 'lanes', title: 'Top lanes', about: 'Best-paying routes and their rate per mile', group: 'Analysis', minSpan: 3, minH: 200 },
  { id: 'cash', title: 'Cash, next 14 days', about: 'Invoices coming due against bills to pay', group: 'Analysis', minSpan: 3, minH: 180 },
  { id: 'fleet', title: 'Fleet status', about: 'Trucks, trailers and drivers by status', group: 'Analysis', minSpan: 3, minH: 200 },
  { id: 'active-loads', title: 'Active loads', about: 'Table of loads in progress', group: 'Tables & lists', minSpan: 4, minH: 200 },
  { id: 'drivers', title: 'Drivers', about: 'Who is on duty, available or off', group: 'Tables & lists', minSpan: 3, minH: 180 },
  { id: 'upcoming', title: 'Next 7 days', about: 'Upcoming pickups and deliveries', group: 'Tables & lists', minSpan: 3, minH: 200 },
];

// The section (or tab) each widget shows data from: an account without it
// does not get the widget.
export const WIDGET_NEEDS: Record<WidgetId, string> = {
  'kpi-active': 'loads', 'kpi-revenue': 'accounting/invoiced', 'kpi-rpm': 'loads', 'kpi-unbilled': 'accounting/uninvoiced',
  'kpi-overdue': 'accounting/past-due', 'kpi-drivers': 'fleet/drivers', 'kpi-trucks': 'fleet/trucks', 'kpi-docs': 'safety/driver-documents',
  attention: 'dashboard', revenue: 'accounting/invoiced', 'ar-aging': 'accounting/invoiced', 'by-customer': 'accounting/invoiced',
  lanes: 'loads', cash: 'accounting/bills', fleet: 'fleet', 'active-loads': 'loads', drivers: 'fleet/drivers', upcoming: 'loads',
};

export const widgetDef = (id: WidgetId) => WIDGETS.find((w) => w.id === id) as WidgetDef;

export interface LayoutItem {
  id: WidgetId;
  span: number;
  h: number;
  hidden: boolean;
}

export type Density = 'Comfortable' | 'Compact';
export type ChartStyle = 'Bars' | 'Line';
export type CustomerPeriod = 'This week' | 'Last 30 days' | 'All time';

export interface DashOptions {
  density: Density;
  // Let smaller widgets fill gaps left by taller ones (may change the order slightly).
  packed: boolean;
  greeting: boolean;
  notes: boolean;
  revenueDays: 7 | 14 | 30;
  chartStyle: ChartStyle;
  chartValues: boolean;
  customerPeriod: CustomerPeriod;
  loadColumns: { customer: boolean; route: boolean; driver: boolean; pickup: boolean; rate: boolean; status: boolean };
}

export interface DashLayout {
  items: LayoutItem[];
  options: DashOptions;
}

const item = (id: WidgetId, span: number, h: number, hidden = false): LayoutItem => ({ id, span, h, hidden });

export const DEFAULT_LAYOUT: DashLayout = {
  items: [
    item('kpi-active', 3, 130), item('kpi-revenue', 3, 130), item('kpi-rpm', 3, 130), item('kpi-unbilled', 3, 130),
    item('revenue', 8, 290), item('attention', 4, 290),
    item('active-loads', 8, 360), item('drivers', 4, 360),
    item('ar-aging', 6, 260), item('by-customer', 6, 260),
    item('kpi-overdue', 3, 130, true), item('kpi-drivers', 3, 130, true), item('kpi-trucks', 3, 130, true), item('kpi-docs', 3, 130, true),
    item('lanes', 6, 280, true), item('cash', 4, 230, true), item('fleet', 6, 300, true), item('upcoming', 4, 320, true),
  ],
  options: {
    density: 'Comfortable',
    packed: true,
    greeting: true,
    notes: true,
    revenueDays: 7,
    chartStyle: 'Bars',
    chartValues: true,
    customerPeriod: 'Last 30 days',
    loadColumns: { customer: true, route: true, driver: false, pickup: false, rate: true, status: true },
  },
};

// From release 1.17 the dashboard shows at most this many widgets, and they
// are fitted to the window so the page never scrolls.
export const MAX_SHOWN = 7;

// The standard layout from release 1.17: seven widgets in three rows.
const FIT_LAYOUT: DashLayout = {
  items: [
    item('kpi-active', 3, 120), item('kpi-revenue', 3, 120), item('kpi-rpm', 3, 120), item('kpi-unbilled', 3, 120),
    item('revenue', 8, 260), item('attention', 4, 260),
    item('active-loads', 12, 300),
    item('drivers', 4, 360, true), item('ar-aging', 6, 260, true), item('by-customer', 6, 260, true),
    item('kpi-overdue', 3, 120, true), item('kpi-drivers', 3, 120, true), item('kpi-trucks', 3, 120, true), item('kpi-docs', 3, 120, true),
    item('lanes', 6, 280, true), item('cash', 4, 230, true), item('fleet', 6, 300, true), item('upcoming', 4, 320, true),
  ],
  options: DEFAULT_LAYOUT.options,
};

// The layout a new (or reset) dashboard starts from.
export const defaultLayout = () => (isLive('dashboard-fit') ? FIT_LAYOUT : DEFAULT_LAYOUT);

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
  return {
    items,
    options: { ...DEFAULT_LAYOUT.options, ...o, loadColumns: { ...DEFAULT_LAYOUT.options.loadColumns, ...(o.loadColumns ?? {}) } },
  };
}
