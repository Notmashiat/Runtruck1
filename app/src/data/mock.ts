import { COMPANY_ID, IS_DEMO, MEMBER_ID } from '../lib/account';
import { shiftDemo } from '../lib/clock';
import { isLive } from '../lib/releases';
import { normalizeLoad, type LoadCharges, type LoadDocument, type LoadEvent } from './loads';

// Release 1.6: Payroll is HR's first tab instead of an Accounting tab. Fixed for
// the page load (a company's release only changes on the next login).
export const PAYROLL_IN_HR = isLive('payroll-in-hr');
export const PAYROLL_SECTION: ViewKey = PAYROLL_IN_HR ? 'hr' : 'accounting';
export const PAYROLL_PATH = `/app/${PAYROLL_SECTION}/payroll`;

// Mock data for the RunTruck app. Static in-memory data, matching the
// dataset defined in the original Claude Design prototype.

export interface NavGroup {
  group: string;
}
export interface NavLink {
  key: ViewKey;
  label: string;
}
export type NavEntry = NavGroup | NavLink;
export interface SectionTab {
  key: string;
  label: string;
}

export type ViewKey =
  | 'dashboard'
  | 'loads'
  | 'planner'
  | 'fleet'
  | 'crm'
  | 'facilities'
  | 'accounting'
  | 'hr'
  | 'safety'
  | 'developer';

export const NAV: NavEntry[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'loads', label: 'Loads' },
  { key: 'planner', label: 'Planner' },
  { key: 'fleet', label: 'Fleet' },
  { key: 'crm', label: 'CRM' },
  { key: 'facilities', label: 'Facilities' },
  { key: 'accounting', label: 'Accounting' },
  { key: 'hr', label: 'HR' },
  { key: 'safety', label: 'Safety' },
  // Super admins only (the Sidebar and the route check the role).
  { key: 'developer', label: 'Developer' },
];

// The signed-in user: shown at the foot of the sidebar and on Settings › Profile.
// The signed-in person. Filled from Settings as the app starts
// (lib/applySettings.ts); until then a client company's page has nobody's
// name in it, never the demo company's.
export const USER = {
  name: IS_DEMO ? 'Rosa Medina' : '',
  role: IS_DEMO ? 'Dispatch' : '',
  company: IS_DEMO ? 'Sunridge Freight' : '',
  email: IS_DEMO ? 'rosa.medina@sunridgefreight.com' : '',
  memberId: MEMBER_ID,
  companyId: COMPANY_ID,
};

export interface LoadStop {
  kind: 'Pickup' | 'Delivery';
  name: string;
  address: string;
  // As shown: 'Oct 1 · 08:00–12:00'. Rebuilt from `date` when loads are read.
  when: string;
  // The stop's day, ISO 'YYYY-MM-DD'.
  date?: string;
}

export interface Load {
  id: string;
  customer: string;
  route: string;
  pickup: string;
  delivery: string;
  driver: string;
  unit: string;
  rate: string;
  status: string;
  tagClass: string;
  miles: string;
  rpm: string;
  pay: string;
  margin: string;
  commodity: string;
  weight: string;
  equip: string;
  temp: string;
  ref: string;
  from: string;
  fromAddr: string;
  to: string;
  toAddr: string;
  carrier: string;
  carrierMc: string;
  carrierDot: string;
  // The real dates behind `pickup` and `delivery` (ISO 'YYYY-MM-DD'); the
  // short text is rebuilt from them (data/loads.ts). `deliveredOn` is the day
  // it was actually delivered, set when the status becomes Delivered.
  pickupDate?: string;
  deliveryDate?: string;
  deliveredOn?: string;
  // What the customer pays, as entered: `rate` shows the line haul only.
  charges?: LoadCharges;
  // Only on loads entered with the New Load form.
  mode?: string;
  ltl?: string;
  stops?: LoadStop[];
  documents?: LoadDocument[];
  carrierRate?: string;
  notes?: string;
  // Who did what and when (created, edited, status changes).
  history?: LoadEvent[];
  // Loads saved before `history` existed carry these as text.
  createdAt?: string;
  updatedAt?: string;
  // The load form's full entry, kept so Edit load reopens exactly what was typed.
  form?: unknown;
}

const LOADS_2026: Load[] = [
  { id: 'L-40218', customer: 'Northgate Foods', route: 'Fresno, CA → Reno, NV', pickup: 'Sep 3', delivery: 'Sep 4', driver: 'Marcus Hale', unit: 'T-114 / RF-88', rate: '$2,450', status: 'In transit', tagClass: 'tag-accent',
    miles: '478', rpm: '$5.13', pay: '$612', margin: '$1,214', commodity: 'Frozen produce', weight: '41,200 lb', equip: 'Reefer, 53 ft', temp: '-10 °F', ref: 'PO 88-41207',
    from: 'Northgate Cold Storage', fromAddr: '4120 S Golden State Blvd, Fresno, CA', to: 'Reno Grocers DC', toAddr: '1855 E Greg St, Sparks, NV', carrier: 'Sunridge Freight (own fleet)', carrierMc: 'MC 812044', carrierDot: 'DOT 2291176' },
  { id: 'L-40219', customer: 'Bayline Distribution', route: 'Stockton, CA → Salt Lake City, UT', pickup: 'Sep 3', delivery: 'Sep 5', driver: 'Dara Whitfield', unit: 'T-107 / DV-51', rate: '$3,180', status: 'At pickup', tagClass: 'tag-neutral',
    miles: '736', rpm: '$4.32', pay: '$795', margin: '$1,540', commodity: 'Palletized dry goods', weight: '38,500 lb', equip: 'Dry van, 53 ft', temp: 'Ambient', ref: 'PO 55-90114',
    from: 'Bayline DC 4', fromAddr: '2900 Navy Dr, Stockton, CA', to: 'Wasatch Crossdock', toAddr: '1740 S 4130 W, Salt Lake City, UT', carrier: 'Sunridge Freight (own fleet)', carrierMc: 'MC 812044', carrierDot: 'DOT 2291176' },
  { id: 'L-40220', customer: 'Cascade Building Supply', route: 'Sacramento, CA → Boise, ID', pickup: 'Sep 2', delivery: 'Sep 4', driver: 'Ellis Nakamura', unit: 'T-121 / FB-12', rate: '$2,910', status: 'Delayed', tagClass: 'tag-outline',
    miles: '602', rpm: '$4.83', pay: '$728', margin: '$1,388', commodity: 'Lumber', weight: '44,000 lb', equip: 'Flatbed, tarped', temp: 'Ambient', ref: 'SO 7741',
    from: 'Cascade Yard 2', fromAddr: '8300 Elder Creek Rd, Sacramento, CA', to: 'Boise Builders Depot', toAddr: '440 E Corporate Dr, Meridian, ID', carrier: 'Sunridge Freight (own fleet)', carrierMc: 'MC 812044', carrierDot: 'DOT 2291176' },
  { id: 'L-40221', customer: 'Harbor Point Retail', route: 'Oakland, CA → Portland, OR', pickup: 'Sep 4', delivery: 'Sep 6', driver: 'Unassigned', unit: '—', rate: '$3,540', status: 'Needs driver', tagClass: 'tag-outline',
    miles: '632', rpm: '$5.60', pay: '—', margin: '—', commodity: 'Consumer goods', weight: '30,100 lb', equip: 'Dry van, 53 ft', temp: 'Ambient', ref: 'PO 31-2280',
    from: 'Port of Oakland, Berth 22', fromAddr: '1599 Maritime St, Oakland, CA', to: 'Harbor Point DC', toAddr: '6200 N Basin Ave, Portland, OR', carrier: 'Not yet covered', carrierMc: '—', carrierDot: '—' },
  { id: 'L-40214', customer: 'Northgate Foods', route: 'Bakersfield, CA → Phoenix, AZ', pickup: 'Sep 1', delivery: 'Sep 2', driver: 'Priya Raman', unit: 'T-103 / RF-27', rate: '$1,980', status: 'Needs POD', tagClass: 'tag-outline',
    miles: '389', rpm: '$5.09', pay: '$495', margin: '$986', commodity: 'Dairy', weight: '36,800 lb', equip: 'Reefer, 53 ft', temp: '34 °F', ref: 'PO 88-41190',
    from: 'Northgate Creamery', fromAddr: '3011 Buck Owens Blvd, Bakersfield, CA', to: 'Valley Foods DC', toAddr: '2240 W Buckeye Rd, Phoenix, AZ', carrier: 'Sunridge Freight (own fleet)', carrierMc: 'MC 812044', carrierDot: 'DOT 2291176' },
  { id: 'L-40212', customer: 'Bayline Distribution', route: 'Los Angeles, CA → Las Vegas, NV', pickup: 'Aug 31', delivery: 'Sep 1', driver: 'Marcus Hale', unit: 'T-114 / DV-88', rate: '$1,640', status: 'Delivered', tagClass: 'tag-neutral',
    miles: '271', rpm: '$6.05', pay: '$410', margin: '$842', commodity: 'Beverages', weight: '42,000 lb', equip: 'Dry van, 53 ft', temp: 'Ambient', ref: 'PO 55-89902',
    from: 'Bayline LA Annex', fromAddr: '5200 S Boyle Ave, Vernon, CA', to: 'Sunset Beverage DC', toAddr: '3900 W Cheyenne Ave, North Las Vegas, NV', carrier: 'Sunridge Freight (own fleet)', carrierMc: 'MC 812044', carrierDot: 'DOT 2291176' },
  { id: 'L-40210', customer: 'Sierra Ag Partners', route: 'Modesto, CA → Denver, CO', pickup: 'Aug 29', delivery: 'Sep 1', driver: 'Tobias Frey', unit: 'T-118 / DV-14', rate: '$4,120', status: 'Delivered', tagClass: 'tag-neutral',
    miles: '1,142', rpm: '$3.61', pay: '$1,030', margin: '$1,904', commodity: 'Almonds', weight: '43,500 lb', equip: 'Dry van, 53 ft', temp: 'Ambient', ref: 'SO 2214',
    from: 'Sierra Ag Huller 3', fromAddr: '1901 Crows Landing Rd, Modesto, CA', to: 'Front Range Foods', toAddr: '5400 Havana St, Denver, CO', carrier: 'Sunridge Freight (own fleet)', carrierMc: 'MC 812044', carrierDot: 'DOT 2291176' },
  { id: 'L-40222', customer: 'Cascade Building Supply', route: 'Redding, CA → Seattle, WA', pickup: 'Sep 5', delivery: 'Sep 6', driver: 'Ana Cortez', unit: 'T-109 / FB-04', rate: '$2,760', status: 'Dispatched', tagClass: 'tag-neutral',
    miles: '578', rpm: '$4.78', pay: '$690', margin: '$1,312', commodity: 'Steel coil', weight: '46,000 lb', equip: 'Flatbed, 48 ft', temp: 'Ambient', ref: 'SO 7802',
    from: 'Cascade Mill', fromAddr: '3400 Airport Rd, Redding, CA', to: 'Duwamish Steel Yard', toAddr: '8100 E Marginal Way S, Seattle, WA', carrier: 'Sunridge Freight (own fleet)', carrierMc: 'MC 812044', carrierDot: 'DOT 2291176' },
];

// A load's stops: the ones entered on the New Load form, or for the mock loads
// the pickup and delivery with their usual windows.
export function stopsOf(l: Load): LoadStop[] {
  return l.stops ?? [
    { kind: 'Pickup', name: l.from, address: l.fromAddr, when: `${l.pickup} · 08:00–14:00` },
    { kind: 'Delivery', name: l.to, address: l.toAddr, when: `${l.delivery} · 06:00–12:00` },
  ];
}

// The first entry is Sunridge's own authority; the rest are partner carriers
// that brokered loads can be tendered to.
export interface Carrier {
  name: string;
  mc: string;
  dot: string;
}

// Demo records exist only in RunTruck's own workspace (Company ID 1); a client company starts empty.
// A client company's own fleet is filled in from Settings › Company.
export const CARRIERS: Carrier[] = !IS_DEMO ? [{ name: 'Own fleet', mc: '', dot: '' }] : [
  { name: 'Sunridge Freight (own fleet)', mc: 'MC 812044', dot: 'DOT 2291176' },
  { name: 'Valley Line Transport', mc: 'MC 604117', dot: 'DOT 1780342' },
  { name: 'Cascade Reefer Express', mc: 'MC 733905', dot: 'DOT 2014588' },
  { name: 'High Desert Hauling', mc: 'MC 581230', dot: 'DOT 1655901' },
  { name: 'Golden State Flatbed', mc: 'MC 690452', dot: 'DOT 1893027' },
];

export interface Driver {
  name: string;
  status: string;
  tagClass: string;
  unit: string;
  load: string;
  hos: string;
  cdl: string;
  pay: string;
  miles: number;
}

const DRIVERS_2026: Driver[] = [
  { name: 'Marcus Hale', status: 'On duty', tagClass: 'tag-accent', unit: 'T-114', load: 'L-40218 · Fresno → Reno', hos: '6h 20m', cdl: '04/2028', pay: '$61,400', miles: 2140 },
  { name: 'Dara Whitfield', status: 'On duty', tagClass: 'tag-accent', unit: 'T-107', load: 'L-40219 · Stockton → SLC', hos: '9h 05m', cdl: '11/2027', pay: '$58,900', miles: 1980 },
  { name: 'Ellis Nakamura', status: 'On duty', tagClass: 'tag-accent', unit: 'T-121', load: 'L-40220 · Sacramento → Boise', hos: '1h 45m', cdl: '02/2027', pay: '$55,120', miles: 1760 },
  { name: 'Priya Raman', status: 'Available', tagClass: 'tag-neutral', unit: 'T-103', load: '—', hos: '11h 00m', cdl: '07/2026', pay: '$52,480', miles: 1420 },
  { name: 'Ana Cortez', status: 'Available', tagClass: 'tag-neutral', unit: 'T-109', load: 'L-40222 · Sep 5', hos: '11h 00m', cdl: '09/2029', pay: '$48,300', miles: 1180 },
  { name: 'Tobias Frey', status: 'Home time', tagClass: 'tag-neutral', unit: 'T-118', load: '—', hos: '—', cdl: '01/2028', pay: '$63,750', miles: 640 },
];

export interface Truck {
  unit: string;
  make: string;
  plate: string;
  driver: string;
  odo: string;
  service: string;
  status: string;
  tagClass: string;
}

export const TRUCKS: Truck[] = !IS_DEMO ? [] : [
  { unit: 'T-103', make: 'Freightliner Cascadia · 2022', plate: 'CA 8HJ2019', driver: 'Priya Raman', odo: '318,440', service: '342,000', status: 'In service', tagClass: 'tag-accent' },
  { unit: 'T-107', make: 'Volvo VNL 760 · 2021', plate: 'CA 7RD8842', driver: 'Dara Whitfield', odo: '402,190', service: '425,000', status: 'In service', tagClass: 'tag-accent' },
  { unit: 'T-109', make: 'Kenworth T680 · 2023', plate: 'CA 9KM1174', driver: 'Ana Cortez', odo: '141,220', service: '165,000', status: 'In service', tagClass: 'tag-accent' },
  { unit: 'T-114', make: 'Peterbilt 579 · 2020', plate: 'CA 6PL4408', driver: 'Marcus Hale', odo: '528,900', service: '529,800', status: 'Service due', tagClass: 'tag-outline' },
  { unit: 'T-118', make: 'Freightliner Cascadia · 2019', plate: 'CA 5TT9930', driver: 'Tobias Frey', odo: '611,780', service: '—', status: 'In shop', tagClass: 'tag-outline' },
  { unit: 'T-121', make: 'International LT · 2022', plate: 'CA 8WQ2251', driver: 'Ellis Nakamura', odo: '275,610', service: '298,000', status: 'In service', tagClass: 'tag-accent' },
];

export interface Trailer {
  unit: string;
  kind: string;
  status: string;
  tagClass: string;
  where: string;
}

export const TRAILERS: Trailer[] = !IS_DEMO ? [] : [
  { unit: 'RF-27', kind: 'Reefer · 53 ft', status: 'Loaded', tagClass: 'tag-accent', where: 'Bakersfield, CA' },
  { unit: 'RF-09', kind: 'Reefer · 53 ft', status: 'Empty', tagClass: 'tag-neutral', where: 'Yard · Modesto' },
  { unit: 'RF-88', kind: 'Reefer · 53 ft', status: 'Loaded', tagClass: 'tag-accent', where: 'En route · I-80' },
  { unit: 'DV-51', kind: 'Dry van · 53 ft', status: 'Loaded', tagClass: 'tag-accent', where: 'Stockton, CA' },
  { unit: 'DV-88', kind: 'Dry van · 53 ft', status: 'Empty', tagClass: 'tag-neutral', where: 'Yard · Modesto' },
  { unit: 'DV-14', kind: 'Dry van · 53 ft', status: 'Empty', tagClass: 'tag-neutral', where: 'Las Vegas, NV' },
  { unit: 'FB-04', kind: 'Flatbed · 48 ft', status: 'Loaded', tagClass: 'tag-accent', where: 'Redding, CA' },
  { unit: 'FB-12', kind: 'Flatbed · 48 ft', status: 'Inspection', tagClass: 'tag-outline', where: 'Yard · Modesto' },
];

export interface Customer {
  name: string;
  contact: string;
  loads: string;
  revenue: string;
  onTime: string;
  terms: string;
  ar: string;
  tier: string;
  tagClass: string;
}

export const CUSTOMERS: Customer[] = !IS_DEMO ? [] : [
  { name: 'Northgate Foods', contact: 'Dana Ruiz', loads: '184', revenue: '$412K', onTime: '96%', terms: 'Net 30', ar: '$18,400', tier: 'Key account', tagClass: 'tag-accent' },
  { name: 'Bayline Distribution', contact: 'Owen Petrakis', loads: '151', revenue: '$338K', onTime: '94%', terms: 'Net 30', ar: '$12,900', tier: 'Key account', tagClass: 'tag-accent' },
  { name: 'Cascade Building Supply', contact: 'Marta Lind', loads: '77', revenue: '$196K', onTime: '91%', terms: 'Net 45', ar: '$21,300', tier: 'Growing', tagClass: 'tag-neutral' },
  { name: 'Harbor Point Retail', contact: 'Jules Amari', loads: '44', revenue: '$121K', onTime: '89%', terms: 'Net 30', ar: '$6,100', tier: 'Growing', tagClass: 'tag-neutral' },
  { name: 'Sierra Ag Partners', contact: 'Ben Okafor', loads: '62', revenue: '$154K', onTime: '82%', terms: 'Net 60', ar: '$29,300', tier: 'At risk', tagClass: 'tag-outline' },
  { name: 'Vantage Home Goods', contact: 'Iris Chen', loads: '29', revenue: '$74K', onTime: '93%', terms: 'Net 30', ar: '$3,850', tier: 'Growing', tagClass: 'tag-neutral' },
];

export interface TopAccount {
  tier: string;
  name: string;
  contact: string;
  loads: string;
  revenue: string;
  onTime: string;
}

export const TOP_ACCOUNTS: TopAccount[] = !IS_DEMO ? [] : [
  { tier: 'Key account', name: 'Northgate Foods', contact: 'Dana Ruiz · dana@northgate.com', loads: '184', revenue: '$412K', onTime: '96%' },
  { tier: 'Key account', name: 'Bayline Distribution', contact: 'Owen Petrakis · ops@bayline.co', loads: '151', revenue: '$338K', onTime: '94%' },
  { tier: 'At risk', name: 'Sierra Ag Partners', contact: 'Ben Okafor · ben@sierraag.com', loads: '62', revenue: '$154K', onTime: '82%' },
];

export interface Invoice {
  id: string;
  customer: string;
  load: string;
  issued: string;
  amount: string;
  age: string;
  status: string;
  tagClass: string;
}

export const INVOICES: Invoice[] = !IS_DEMO ? [] : [
  { id: 'INV-8845', customer: 'Northgate Foods', load: 'L-40218', issued: '—', amount: '$2,450', age: '—', status: 'Draft', tagClass: 'tag-outline' },
  { id: 'INV-8841', customer: 'Northgate Foods', load: 'L-40214', issued: 'Sep 1', amount: '$1,980', age: '2 d', status: 'Sent', tagClass: 'tag-accent' },
  { id: 'INV-8840', customer: 'Bayline Distribution', load: 'L-40212', issued: 'Aug 31', amount: '$1,640', age: '3 d', status: 'Sent', tagClass: 'tag-accent' },
  { id: 'INV-8829', customer: 'Cascade Building Supply', load: 'L-40198', issued: 'Aug 16', amount: '$2,880', age: '18 d', status: 'Sent', tagClass: 'tag-accent' },
  { id: 'INV-8824', customer: 'Harbor Point Retail', load: 'L-40191', issued: 'Aug 7', amount: '$3,410', age: '27 d', status: 'Paid', tagClass: 'tag-green' },
  { id: 'INV-8836', customer: 'Sierra Ag Partners', load: 'L-40210', issued: 'Jul 24', amount: '$4,120', age: '41 d', status: 'Overdue', tagClass: 'tag-outline' },
];

export interface Settlement {
  name: string;
  basis: string;
  loads: string;
  miles: string;
  gross: string;
  ded: string;
  net: string;
  status: string;
}

export const SETTLEMENTS: Settlement[] = !IS_DEMO ? [] : [
  { name: 'Marcus Hale', basis: '$0.62 / mi', loads: '4', miles: '2,140', gross: '$1,326', ded: '-$142', net: '$1,184', status: 'Ready' },
  { name: 'Dara Whitfield', basis: '$0.60 / mi', loads: '3', miles: '1,980', gross: '$1,188', ded: '-$96', net: '$1,092', status: 'Ready' },
  { name: 'Ellis Nakamura', basis: '25% of line haul', loads: '3', miles: '1,760', gross: '$1,455', ded: '-$210', net: '$1,245', status: 'Hold · fuel' },
  { name: 'Priya Raman', basis: '$0.58 / mi', loads: '2', miles: '1,420', gross: '$824', ded: '-$64', net: '$760', status: 'Ready' },
  { name: 'Ana Cortez', basis: '$0.58 / mi', loads: '2', miles: '1,180', gross: '$684', ded: '—', net: '$684', status: 'Paid' },
];

export const SETTLE_TAG: Record<string, string> = {
  Ready: 'tag-accent',
  Paid: 'tag-green',
  Approved: 'tag-accent',
  'Hold · fuel': 'tag-outline',
};

export const ACTIVE_STATUSES = ['In transit', 'At pickup', 'Dispatched', 'Delayed', 'Booked', 'Needs driver'];

// Sections split into tabs; each tab is a route under /app/<section>/<key>.
export const SECTION_TABS: Partial<Record<ViewKey, SectionTab[]>> = {
  fleet: [
    { key: 'drivers', label: 'Drivers' },
    { key: 'trucks', label: 'Trucks' },
    { key: 'trailers', label: 'Trailers' },
  ],
  accounting: [
    { key: 'uninvoiced', label: 'Uninvoiced' },
    { key: 'invoiced', label: 'Invoiced' },
    { key: 'batches', label: 'Batches' },
    { key: 'past-due', label: 'Past Due' },
    { key: 'paid', label: 'Paid' },
    ...(PAYROLL_IN_HR ? [] : [{ key: 'payroll', label: 'Payroll' }]),
    { key: 'bills', label: 'Bills' },
  ],
  hr: [
    ...(PAYROLL_IN_HR ? [{ key: 'payroll', label: 'Payroll' }] : []),
    { key: 'employee-contracts', label: 'Employee Contracts' },
    { key: 'onboarding', label: 'Onboarding' },
  ],
  safety: [
    { key: 'maintenance', label: 'Maintenance' },
    { key: 'driver-documents', label: 'Driver Documents' },
    { key: 'unit-documents', label: 'Unit Documents' },
    { key: 'violations', label: 'Violations' },
    { key: 'settlements', label: 'Settlements' },
  ],
  developer: [
    { key: 'account-manager', label: 'Account manager' },
    { key: 'clients', label: 'Clients' },
    { key: 'accounts', label: 'Accounts' },
    { key: 'deactivated', label: 'Deactivated' },
    { key: 'releases', label: 'Releases' },
    { key: 'errors', label: 'Error log' },
  ],
};

// The demo loads and drivers, moved to today's date (lib/clock.ts).
export const LOADS: Load[] = !IS_DEMO ? [] : shiftDemo(LOADS_2026).map(normalizeLoad);
export const DRIVERS: Driver[] = !IS_DEMO ? [] : shiftDemo(DRIVERS_2026);
