import { useAppShell } from '../context/AppShellContext';
import {
  AMENITIES, BOOKING, CUSTOMER_SITE_TYPES, DOCK_TYPES, EQUIPMENT_ACCEPTED, FACILITY_BLANK, FACILITY_TYPES, LOAD_TYPES, LUMPER,
  MAX_LENGTHS, PARKING, PPE, RATINGS, ROAD_TYPES, SCHEDULING, SECURITY, SITE_OWNERSHIP, SITE_RULES, YARD_TYPES,
  facilityFromForm, sameName, stopsUsing, type Facility,
} from '../data/facilities';
import { nextId, YES_NO, type FormValues } from '../data/fleet';
import { CUSTOMERS } from '../data/mock';
import { NON_NEGATIVE, PHONE, POSITIVE, STATE, ZIP } from '../lib/rules';
import { getSettings } from '../lib/settingsStore';
import { RecordDialog, type SectionSpec } from './RecordDialog';

const val = (v: FormValues, k: string) => (typeof v[k] === 'string' ? (v[k] as string) : '');
const typeIn = (types: string[]) => (v: FormValues) => types.includes(val(v, 'type'));
const customerSite = typeIn(CUSTOMER_SITE_TYPES);
const notAllDay = (v: FormValues) => val(v, 'open24') !== 'Yes';
const withAppointments = (v: FormValues) => customerSite(v) && ['Appointment required', 'FCFS or appointment'].includes(val(v, 'scheduling'));

const between = (lo: number, hi: number, what: string) => (value: string) =>
  Number.isFinite(Number(value)) && Number(value) >= lo && Number(value) <= hi ? null : `${what} between ${lo} and ${hi}`;
// Both ends of a day's hours, or neither (closed).
const pairedWith = (other: string, label: string) => (_: string, v: FormValues) => (val(v, other) ? null : `Add the ${label} time too`);

function sections(takenNames: string[]): SectionSpec[] {
  return [
    {
      title: 'Site',
      help: 'What the place is. Load stops link to a facility by this exact name.',
      fields: [
        {
          key: 'name', label: 'Facility name', required: true, wide: true, placeholder: 'e.g. Northgate Cold Storage',
          check: (value) => (takenNames.some((n) => sameName(n, value)) ? 'Another facility already has this name' : null),
        },
        { key: 'type', label: 'Type', type: 'select', required: true, options: FACILITY_TYPES },
        { key: 'customer', label: 'Customer account', type: 'select', options: CUSTOMERS.map((c) => c.name), show: customerSite, help: 'Whose freight moves through here.' },
        { key: 'siteCode', label: 'Site / location code', upper: true, placeholder: 'e.g. NGF-FRE-01' },
        { key: 'phone', label: 'Main phone', type: 'tel', check: PHONE },
      ],
    },
    {
      title: 'Address',
      help: 'Where the truck goes. The map point is used for arrival and departure times from the ELD.',
      fields: [
        { key: 'street', label: 'Street address', required: true, wide: true },
        { key: 'city', label: 'City', required: true },
        { key: 'state', label: 'State', required: true, maxLength: 2, upper: true, check: STATE, placeholder: 'CA' },
        { key: 'zip', label: 'ZIP', required: true, check: ZIP },
        { key: 'lat', label: 'Latitude', type: 'number', check: between(-90, 90, 'Latitude'), placeholder: '37.6280' },
        { key: 'lng', label: 'Longitude', type: 'number', check: between(-180, 180, 'Longitude'), placeholder: '-120.9580' },
        { key: 'directions', label: 'Truck directions and gate', type: 'textarea', placeholder: 'Truck route in, which gate, roads to avoid' },
      ],
    },
    {
      title: 'Hours & appointments',
      help: 'When trucks can be there, and how to get a slot. Leave a day blank if the site is closed.',
      fields: [
        { key: 'open24', label: 'Open 24 hours', type: 'select', required: true, options: YES_NO },
        { key: 'wkOpen', label: 'Mon–Fri opens', type: 'time', required: true, show: notAllDay },
        { key: 'wkClose', label: 'Mon–Fri closes', type: 'time', required: true, show: notAllDay },
        { key: 'satOpen', label: 'Saturday opens', type: 'time', show: notAllDay, check: pairedWith('satClose', 'closing') },
        { key: 'satClose', label: 'Saturday closes', type: 'time', show: notAllDay, check: pairedWith('satOpen', 'opening') },
        { key: 'sunOpen', label: 'Sunday opens', type: 'time', show: notAllDay, check: pairedWith('sunClose', 'closing') },
        { key: 'sunClose', label: 'Sunday closes', type: 'time', show: notAllDay, check: pairedWith('sunOpen', 'opening') },
        { key: 'scheduling', label: 'Scheduling', type: 'select', required: true, options: SCHEDULING, show: customerSite },
        { key: 'booking', label: 'How to book', type: 'select', required: true, options: BOOKING, show: withAppointments },
        {
          key: 'bookingPortal', label: 'Booking portal link', type: 'url', required: true, wide: true, placeholder: 'https://',
          show: (v) => withAppointments(v) && val(v, 'booking') === 'Online portal',
        },
        { key: 'leadTime', label: 'Book at least (hours ahead)', type: 'number', check: NON_NEGATIVE, show: withAppointments },
        { key: 'holidays', label: 'Holiday closures', wide: true, placeholder: 'e.g. Closed Thanksgiving and Christmas Day' },
      ],
    },
    {
      title: 'Dock & loading',
      help: 'What the driver will find at the door, and what waiting costs.',
      when: customerSite,
      naText: 'Dock and loading details are for customer sites (shippers, receivers, cross-docks and ports).',
      fields: [
        { key: 'loadType', label: 'Loading', type: 'select', required: true, options: LOAD_TYPES },
        { key: 'doors', label: 'Dock doors', type: 'number', check: NON_NEGATIVE },
        { key: 'dockTypes', label: 'Dock', type: 'checks', options: DOCK_TYPES },
        { key: 'equipment', label: 'Trailers accepted', type: 'checks', required: true, options: EQUIPMENT_ACCEPTED },
        { key: 'maxLength', label: 'Longest trailer', type: 'select', options: MAX_LENGTHS },
        { key: 'lumper', label: 'Lumper', type: 'select', required: true, options: LUMPER },
        { key: 'lumperFee', label: 'Typical lumper fee ($)', type: 'number', check: POSITIVE, show: (v) => val(v, 'lumper').startsWith('Lumper — carrier') },
        { key: 'dwell', label: 'Typical time on site (hours)', type: 'number', check: NON_NEGATIVE },
        { key: 'freeTime', label: 'Free time before detention (hours)', type: 'number', check: NON_NEGATIVE },
        { key: 'detentionRate', label: 'Detention rate ($/hour)', type: 'number', check: NON_NEGATIVE },
      ],
    },
    {
      title: 'Yard & services',
      help: 'Space, security and services at our yards and shops, and at stops on the road.',
      when: typeIn([...YARD_TYPES, ...ROAD_TYPES]),
      naText: 'Yard and service details are for our terminals, drop yards and shops, and for truck stops and scales.',
      fields: [
        { key: 'ownership', label: 'Ownership', type: 'select', required: true, options: SITE_OWNERSHIP, show: typeIn(YARD_TYPES) },
        { key: 'monthlyCost', label: 'Rent / cost per month ($)', type: 'number', check: NON_NEGATIVE, show: (v) => typeIn(YARD_TYPES)(v) && val(v, 'ownership') === 'Leased' },
        { key: 'truckSpots', label: 'Truck parking spaces', type: 'number', check: NON_NEGATIVE, show: typeIn(['Company terminal', 'Drop yard', 'Truck stop']) },
        { key: 'trailerSpots', label: 'Trailer spaces', type: 'number', check: NON_NEGATIVE, show: typeIn(['Company terminal', 'Drop yard']) },
        { key: 'bays', label: 'Shop bays', type: 'number', check: NON_NEGATIVE, show: typeIn(['Company terminal', 'Repair shop']) },
        { key: 'fuelOnSite', label: 'Fuel on site', type: 'select', options: YES_NO, show: typeIn(['Company terminal', 'Drop yard']) },
        { key: 'security', label: 'Security', type: 'checks', options: SECURITY, show: typeIn(YARD_TYPES) },
        { key: 'amenities', label: 'Services', type: 'checks', options: AMENITIES, show: typeIn(ROAD_TYPES) },
      ],
    },
    {
      title: 'Driver rules',
      help: 'What the driver needs to bring and do. It shows on the stop when a load goes here.',
      fields: [
        { key: 'ppe', label: 'PPE required', type: 'checks', options: PPE },
        { key: 'rules', label: 'Site rules', type: 'checks', options: SITE_RULES },
        { key: 'parking', label: 'Truck parking', type: 'select', options: PARKING },
        { key: 'checkIn', label: 'Check-in instructions', type: 'textarea' },
      ],
    },
    {
      title: 'Contacts',
      help: 'Who to call about this site.',
      fields: [
        { key: 'shipName', label: 'Main / shipping contact', wide: true },
        { key: 'shipPhone', label: 'Phone', type: 'tel', check: PHONE },
        { key: 'shipEmail', label: 'Email', type: 'email' },
        { key: 'recvName', label: 'Receiving contact', wide: true, show: customerSite },
        { key: 'recvPhone', label: 'Phone', type: 'tel', check: PHONE, show: customerSite },
        { key: 'recvEmail', label: 'Email', type: 'email', show: customerSite },
        { key: 'afterHours', label: 'After-hours phone', type: 'tel', check: PHONE },
      ],
    },
    {
      title: 'Notes',
      help: 'What drivers and dispatch have learned about this place.',
      fields: [
        { key: 'rating', label: 'Driver rating', type: 'select', options: RATINGS },
        { key: 'notes', label: 'Notes', type: 'textarea' },
      ],
    },
  ];
}

// Add or edit a facility. `prefill` starts a new one from a load stop.
// `onSaved` gets the facility as saved (New Load adds one without leaving the load).
export function FacilityDialog({ facility, prefill, onSaved, onClose }: { facility?: Facility; prefill?: FormValues; onSaved?: (f: Facility) => void; onClose: () => void }) {
  const { facilities, loads, saveFacility, archiveFacility, deleteFacility } = useAppShell();
  const id = facility?.id ?? nextId('FAC', facilities.map((f) => f.id));
  const ops = getSettings().operations;
  const initial: FormValues = facility
    ? { ...FACILITY_BLANK, ...facility.details }
    : { ...FACILITY_BLANK, type: 'Shipper', freeTime: ops.detentionFreeHours, detentionRate: ops.detentionRate, ...prefill };
  const onLoads = facility ? stopsUsing(loads, facility.name).length : 0;

  return (
    <RecordDialog
      heading={facility ? `Edit — ${facility.name}` : 'New facility'}
      saveLabel={facility ? 'Save changes' : 'Add facility'}
      sections={sections(facilities.filter((f) => f.id !== id).map((f) => f.name))}
      initial={initial}
      isNew={!facility}
      archived={facility?.archived}
      noun="facility"
      recordLabel={facility ? facility.name : 'this facility'}
      deleteNote={`${facility?.name ?? 'The facility'} is removed from the register for good.${onLoads ? ` Its ${onLoads} load stop${onLoads === 1 ? '' : 's'} keep the name and address but lose the site details.` : ''} To keep it on file but out of the way, use Archive instead.`}
      onSave={(v) => {
        const saved = facilityFromForm(v, id, facility);
        saveFacility(saved);
        onSaved?.(saved);
      }}
      onArchive={(a) => archiveFacility(id, a)}
      onDelete={() => deleteFacility(id)}
      onClose={onClose}
    />
  );
}
