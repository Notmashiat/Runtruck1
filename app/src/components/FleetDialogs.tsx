import { useAppShell } from '../context/AppShellContext';
import {
  CABS, CDL_CLASSES, DISPATCHERS, DOORS, DRIVER_STATUSES, DRIVER_TYPES, DRIVING_MODES, ENDORSEMENTS, FUELS, PAY_TYPES, REEFER_MAKES, SUSPENSIONS,
  TERMINALS, TRAILER_AXLES, TRAILER_LENGTHS, TRAILER_MAKES, TRAILER_OWNERSHIP, TRAILER_STATUSES, TRAILER_TYPES, TRUCK_AXLES,
  TRUCK_MAKES, TRUCK_OWNERSHIP, TRUCK_STATUSES, YES_NO,
  driverFromForm, drivingModeOf, nextId, trailerFromForm, truckFromForm,
  type FleetDriver, type FleetTrailer, type FleetTruck, type FormValues,
} from '../data/fleet';
import { USER } from '../data/mock';
import { NON_NEGATIVE, PHONE, POSITIVE, STATE, UNIQUE, VIN, YEAR, ZIP } from '../lib/rules';
import { RecordDialog, type SectionSpec } from './RecordDialog';
import { IS_DEMO } from '../lib/account';
import { isLive } from '../lib/releases';

// — form helpers —

const val = (v: FormValues, k: string) => (typeof v[k] === 'string' ? (v[k] as string) : '');
const has = (v: FormValues, k: string, option: string) => Array.isArray(v[k]) && (v[k] as string[]).includes(option);

// — driver —

function driverSections(truckUnits: string[], takenIds: string[], takenNames: string[], otherDrivers: string[]): SectionSpec[] {
  // Release 1.15: how the driver runs, and a team driver's co-driver (shown on the driver card).
  const modes = isLive('driver-card')
    ? [
        { key: 'drivingMode', label: 'Runs as', type: 'select' as const, required: true, options: [...DRIVING_MODES], help: 'Strong solo: a solo driver who takes long, high-mile runs.' },
        { key: 'coDriver', label: 'Co-driver', type: 'select' as const, options: otherDrivers, show: (v: FormValues) => val(v, 'drivingMode') === 'Team', help: 'The other driver of the team.' },
      ]
    : [];
  return [
    {
      title: 'Personal',
      help: 'Who the driver is and how to reach them.',
      fields: [
        { key: 'firstName', label: 'First name', required: true },
        {
          key: 'lastName', label: 'Last name', required: true,
          // Trucks are linked to drivers by name, so two drivers cannot share one.
          check: (value, v) => (takenNames.includes(`${val(v, 'firstName').trim()} ${value.trim()}`.toLowerCase()) ? 'Another driver already has this name' : null),
        },
        { key: 'dob', label: 'Date of birth', type: 'date', required: true },
        { key: 'phone', label: 'Mobile phone', type: 'tel', required: true, check: PHONE, placeholder: '(209) 555-0147' },
        { key: 'email', label: 'Email', type: 'email', wide: true },
        { key: 'street', label: 'Street address', wide: true, required: true },
        { key: 'city', label: 'City', required: true },
        { key: 'state', label: 'State', required: true, maxLength: 2, upper: true, check: STATE, placeholder: 'CA' },
        { key: 'zip', label: 'ZIP', required: true, check: ZIP },
        { key: 'emergencyName', label: 'Emergency contact', required: true },
        { key: 'emergencyPhone', label: 'Emergency phone', type: 'tel', required: true, check: PHONE },
        { key: 'emergencyRelation', label: 'Relationship' },
      ],
    },
    {
      title: 'Employment',
      help: `How the driver works for ${USER.company || 'the company'}.`,
      fields: [
        { key: 'employeeId', label: 'Employee ID', required: true, upper: true, check: UNIQUE(takenIds, 'driver') },
        { key: 'driverType', label: 'Driver type', type: 'select', required: true, options: DRIVER_TYPES },
        ...modes,
        { key: 'status', label: 'Status', type: 'select', required: true, options: DRIVER_STATUSES },
        { key: 'hireDate', label: 'Hire date', type: 'date', required: true },
        { key: 'terminal', label: 'Home terminal', type: 'select', required: true, options: TERMINALS },
        { key: 'dispatcher', label: 'Dispatcher', type: 'select', options: DISPATCHERS },
      ],
    },
    {
      title: 'License',
      help: 'Commercial driver’s license. An expired CDL keeps the driver off dispatch.',
      fields: [
        { key: 'cdlNumber', label: 'CDL number', required: true, upper: true },
        { key: 'cdlState', label: 'Issuing state', required: true, maxLength: 2, upper: true, check: STATE },
        { key: 'cdlClass', label: 'Class', type: 'select', required: true, options: CDL_CLASSES },
        { key: 'cdlExpiry', label: 'CDL expires', type: 'date', required: true },
        { key: 'endorsements', label: 'Endorsements', type: 'checks', options: ENDORSEMENTS },
        { key: 'restrictions', label: 'Restrictions', wide: true, placeholder: 'e.g. Corrective lenses' },
        { key: 'hazmatExpiry', label: 'Hazmat endorsement expires', type: 'date', required: true, show: (v) => has(v, 'endorsements', ENDORSEMENTS[0]) || has(v, 'endorsements', ENDORSEMENTS[3]) },
        { key: 'twicExpiry', label: 'TWIC card expires', type: 'date', help: 'Needed for port and terminal access.' },
      ],
    },
    {
      title: 'Compliance',
      help: 'Driver qualification file dates. Safety › Driver Documents tracks what is coming due.',
      fields: [
        { key: 'medicalExpiry', label: 'Medical card expires', type: 'date', required: true },
        { key: 'mvrDate', label: 'Last MVR pulled', type: 'date', required: true },
        { key: 'annualReviewDate', label: 'Last annual review', type: 'date' },
        { key: 'drugTestDate', label: 'Pre-employment drug test', type: 'date', required: true },
        { key: 'clearinghouseDate', label: 'Last Clearinghouse query', type: 'date', required: true },
        { key: 'roadTestDate', label: 'Road test', type: 'date' },
      ],
    },
    {
      title: 'Equipment & pay',
      help: 'Assigning a truck here also updates that truck’s driver.',
      fields: [
        { key: 'truck', label: 'Assigned truck', type: 'select', options: truckUnits },
        { key: 'payType', label: 'Pay type', type: 'select', required: true, options: PAY_TYPES },
        {
          key: 'payRate', label: 'Pay rate', type: 'number', required: true, check: POSITIVE,
          help: 'Dollars per mile, per hour or per load; percent for % of line haul; yearly for salary.',
        },
        { key: 'fuelCard', label: 'Fuel card number' },
        { key: 'eldId', label: 'ELD login', upper: true },
      ],
    },
    {
      title: 'Notes',
      help: 'Anything dispatch or safety should know.',
      fields: [{ key: 'notes', label: 'Notes', type: 'textarea' }],
    },
  ];
}

export function DriverDialog({ driver, onClose }: { driver?: FleetDriver; onClose: () => void }) {
  const { drivers, trucks, saveDriver, archiveDriver, deleteDriver } = useAppShell();
  const id = driver?.id ?? nextId('DRV', drivers.map((d) => d.id));
  const truckUnits = trucks.filter((t) => !t.archived || t.unit === driver?.unit).map((t) => t.unit);
  const takenIds = drivers.filter((d) => d.id !== id).map((d) => val(d.details, 'employeeId') || d.id);
  // A driver saved before "Runs as" existed starts the form at what the card shows.
  const initial: FormValues = driver ? (isLive('driver-card') && !driver.details.drivingMode ? { ...driver.details, drivingMode: drivingModeOf(driver) } : driver.details) : {
    employeeId: id, driverType: DRIVER_TYPES[0], drivingMode: 'Solo', status: 'Available', terminal: TERMINALS[0], dispatcher: USER.name,
    cdlClass: 'A', endorsements: [], payType: 'Per mile',
  };

  return (
    <RecordDialog
      heading={driver ? `Edit driver — ${driver.name}` : 'New driver'}
      saveLabel={driver ? 'Save changes' : 'Add driver'}
      sections={driverSections(truckUnits, takenIds, drivers.filter((d) => d.id !== id).map((d) => d.name.toLowerCase()), drivers.filter((d) => d.id !== id && !d.archived).map((d) => d.name))}
      initial={initial}
      isNew={!driver}
      archived={driver?.archived}
      noun="driver"
      recordLabel={driver ? driver.name : 'this driver'}
      deleteNote={`${driver?.name ?? 'The driver'} is removed from the roster for good${driver && driver.unit !== '—' ? `, and ${driver.unit} becomes unassigned` : ''}. Loads and settlements keep their history. To keep the record but hide it, use Archive instead.`}
      onSave={(v) => saveDriver(driverFromForm({ ...v, firstName: val(v, 'firstName').trim(), lastName: val(v, 'lastName').trim() }, id, driver))}
      onArchive={(a) => archiveDriver(id, a)}
      onDelete={() => deleteDriver(id)}
      onClose={onClose}
    />
  );
}

// — truck (power unit) —

function truckSections(driverNames: string[], takenUnits: string[], takenVins: string[], trailerUnits: string[]): SectionSpec[] {
  const leased = (v: FormValues) => ['Leased', 'Lease-purchase'].includes(val(v, 'ownership'));
  return [
    {
      title: 'Unit',
      help: 'How the truck is identified and who drives it. Assigning a driver here also updates the driver.',
      fields: [
        { key: 'unitNumber', label: 'Unit number', required: true, upper: true, placeholder: 'T-125', check: UNIQUE(takenUnits, 'truck') },
        { key: 'status', label: 'Status', type: 'select', required: true, options: TRUCK_STATUSES },
        { key: 'ownership', label: 'Ownership', type: 'select', required: true, options: TRUCK_OWNERSHIP },
        { key: 'driver', label: 'Assigned driver', type: 'select', options: driverNames },
        // Release 1.21: the trailer it pulls, shown when the truck is put on a load.
        { key: 'trailer', label: 'Assigned trailer', type: 'select', options: trailerUnits },
        { key: 'terminal', label: 'Home terminal', type: 'select', required: true, options: TERMINALS },
      ],
    },
    {
      title: 'Vehicle',
      help: 'From the title or registration card.',
      fields: [
        { key: 'vin', label: 'VIN', required: true, upper: true, maxLength: 17, wide: true, check: (value) => VIN(value) ?? UNIQUE(takenVins, 'vehicle')(value) },
        { key: 'year', label: 'Model year', type: 'number', required: true, check: YEAR },
        { key: 'make', label: 'Make', type: 'select', required: true, options: TRUCK_MAKES },
        { key: 'model', label: 'Model', required: true, placeholder: 'e.g. Cascadia' },
        { key: 'cab', label: 'Cab', type: 'select', required: true, options: CABS },
        { key: 'fuel', label: 'Fuel', type: 'select', required: true, options: FUELS },
        { key: 'engine', label: 'Engine', placeholder: 'e.g. Detroit DD15' },
        { key: 'gvwr', label: 'GVWR (lb)', type: 'number', check: POSITIVE },
        { key: 'axles', label: 'Axles', type: 'select', options: TRUCK_AXLES },
      ],
    },
    {
      title: 'Registration',
      help: 'Plates, permits, inspection and insurance.',
      fields: [
        { key: 'plateNumber', label: 'Plate number', required: true, upper: true },
        { key: 'plateState', label: 'Plate state', required: true, maxLength: 2, upper: true, check: STATE },
        { key: 'registrationExpiry', label: 'Registration expires', type: 'date', required: true },
        { key: 'apportioned', label: 'IRP apportioned', type: 'select', options: YES_NO },
        { key: 'iftaDecal', label: 'IFTA decal number' },
        { key: 'dotInspection', label: 'Last annual DOT inspection', type: 'date', required: true },
        { key: 'insuranceExpiry', label: 'Insurance expires', type: 'date', required: true },
      ],
    },
    {
      title: 'Maintenance',
      help: 'Odometer and service schedule. Safety › Maintenance holds the work orders.',
      fields: [
        { key: 'odometer', label: 'Odometer (mi)', type: 'number', required: true, check: NON_NEGATIVE },
        { key: 'pmInterval', label: 'PM interval (mi)', type: 'number', check: POSITIVE },
        {
          key: 'nextService', label: 'Next service at (mi)', type: 'number',
          check: (value, v) => (Number(value) > Number(val(v, 'odometer')) ? null : 'Must be above the current odometer'),
        },
        { key: 'lastServiceDate', label: 'Last service', type: 'date' },
        { key: 'eldSerial', label: 'ELD / telematics serial', upper: true },
        { key: 'tireSize', label: 'Tire size', placeholder: '295/75R22.5' },
      ],
    },
    {
      title: 'Purchase / lease',
      help: 'What the truck cost, or who it is leased from.',
      fields: [
        { key: 'purchaseDate', label: 'Purchase date', type: 'date', show: (v) => val(v, 'ownership') !== 'Leased' },
        { key: 'purchasePrice', label: 'Purchase price ($)', type: 'number', check: POSITIVE, show: (v) => val(v, 'ownership') !== 'Leased' },
        { key: 'lessor', label: 'Lessor', required: true, wide: true, show: leased },
        { key: 'leaseEnd', label: 'Lease ends', type: 'date', required: true, show: leased },
      ],
    },
    {
      title: 'Notes',
      help: 'Anything the shop or dispatch should know.',
      fields: [{ key: 'notes', label: 'Notes', type: 'textarea' }],
    },
  ];
}

export function TruckDialog({ truck, onClose }: { truck?: FleetTruck; onClose: () => void }) {
  const { drivers, trucks, trailers, saveTruck, archiveTruck, deleteTruck } = useAppShell();
  const id = truck?.id ?? nextId('TRK', trucks.map((t) => t.id));
  const driverNames = drivers.filter((d) => !d.archived || d.name === truck?.driver).map((d) => d.name);
  const others = trucks.filter((t) => t.id !== id);
  const takenVins = [...others.map((t) => val(t.details, 'vin')), ...trailers.map((t) => val(t.details, 'vin'))].filter(Boolean);
  const initial: FormValues = truck?.details ?? {
    status: 'In service', ownership: 'Owned', terminal: TERMINALS[0], cab: 'Sleeper', fuel: 'Diesel', axles: TRUCK_AXLES[0],
    apportioned: 'Yes', pmInterval: '25000',
  };

  return (
    <RecordDialog
      heading={truck ? `Edit unit ${truck.unit}` : 'New unit'}
      saveLabel={truck ? 'Save changes' : 'Add unit'}
      sections={truckSections(driverNames, others.map((t) => t.unit), takenVins, trailers.filter((t) => !t.archived || t.unit === val(truck?.details ?? {}, 'trailer')).map((t) => t.unit))}
      initial={initial}
      isNew={!truck}
      archived={truck?.archived}
      noun="unit"
      recordLabel={truck ? truck.unit : 'this unit'}
      deleteNote={`${truck?.unit ?? 'The unit'} is removed from the fleet for good${truck && truck.driver !== 'Unassigned' ? `, and ${truck.driver} is left without a truck` : ''}. Loads keep their history. To keep the record but hide it (sold or traded in), use Archive instead.`}
      onSave={(v) => saveTruck(truckFromForm(v, id, truck))}
      onArchive={(a) => archiveTruck(id, a)}
      onDelete={() => deleteTruck(id)}
      onClose={onClose}
    />
  );
}

// — trailer —

function trailerSections(takenUnits: string[], takenVins: string[]): SectionSpec[] {
  const hasDoors = (v: FormValues) => ['Reefer', 'Dry van'].includes(val(v, 'type'));
  return [
    {
      title: 'Unit',
      help: 'How the trailer is identified and where it is.',
      fields: [
        { key: 'unitNumber', label: 'Trailer number', required: true, upper: true, placeholder: 'DV-90', check: UNIQUE(takenUnits, 'trailer') },
        { key: 'type', label: 'Type', type: 'select', required: true, options: TRAILER_TYPES },
        { key: 'length', label: 'Length (ft)', type: 'select', required: true, options: TRAILER_LENGTHS },
        { key: 'status', label: 'Status', type: 'select', required: true, options: TRAILER_STATUSES },
        { key: 'location', label: 'Current location', required: true, placeholder: 'e.g. Yard · Modesto' },
        { key: 'ownership', label: 'Ownership', type: 'select', required: true, options: TRAILER_OWNERSHIP },
      ],
    },
    {
      title: 'Vehicle',
      help: 'From the title or registration card.',
      fields: [
        { key: 'vin', label: 'VIN', required: true, upper: true, maxLength: 17, wide: true, check: (value) => VIN(value) ?? UNIQUE(takenVins, 'vehicle')(value) },
        { key: 'year', label: 'Model year', type: 'number', required: true, check: YEAR },
        { key: 'make', label: 'Make', type: 'select', required: true, options: TRAILER_MAKES },
        { key: 'model', label: 'Model', placeholder: 'e.g. 3000R' },
        { key: 'axles', label: 'Axles', type: 'select', required: true, options: TRAILER_AXLES },
        { key: 'suspension', label: 'Suspension', type: 'select', options: SUSPENSIONS },
        { key: 'doors', label: 'Rear doors', type: 'select', options: DOORS, show: hasDoors },
        { key: 'maxPayload', label: 'Max payload (lb)', type: 'number', check: POSITIVE },
      ],
    },
    {
      title: 'Reefer unit',
      help: 'The refrigeration unit on a reefer trailer.',
      when: (v) => val(v, 'type') === 'Reefer',
      naText: 'Only reefer trailers have a refrigeration unit. Set the type to Reefer in Unit to fill this in.',
      fields: [
        { key: 'reeferMake', label: 'Reefer make', type: 'select', required: true, options: REEFER_MAKES },
        { key: 'reeferModel', label: 'Reefer model', required: true, placeholder: 'e.g. Precedent S-610M' },
        { key: 'reeferHours', label: 'Engine hours', type: 'number', check: NON_NEGATIVE },
        { key: 'reeferSerial', label: 'Serial number', upper: true },
      ],
    },
    {
      title: 'Registration',
      help: 'Plates, inspection and insurance.',
      fields: [
        { key: 'plateNumber', label: 'Plate number', required: true, upper: true },
        { key: 'plateState', label: 'Plate state', required: true, maxLength: 2, upper: true, check: STATE },
        { key: 'registrationExpiry', label: 'Registration expires', type: 'date', required: true },
        { key: 'dotInspection', label: 'Last annual DOT inspection', type: 'date', required: true },
        { key: 'insuranceExpiry', label: 'Insurance expires', type: 'date' },
      ],
    },
    {
      title: 'Maintenance',
      help: 'Service history. Safety › Maintenance holds the work orders.',
      fields: [
        { key: 'lastServiceDate', label: 'Last service', type: 'date' },
        { key: 'lastTireCheck', label: 'Last tire and brake check', type: 'date' },
      ],
    },
    {
      title: 'Notes',
      help: 'Anything dispatch or the shop should know.',
      fields: [{ key: 'notes', label: 'Notes', type: 'textarea' }],
    },
  ];
}

export function TrailerDialog({ trailer, onClose }: { trailer?: FleetTrailer; onClose: () => void }) {
  const { trucks, trailers, saveTrailer, archiveTrailer, deleteTrailer } = useAppShell();
  const id = trailer?.id ?? nextId('TRL', trailers.map((t) => t.id));
  const others = trailers.filter((t) => t.id !== id);
  const takenVins = [...others.map((t) => val(t.details, 'vin')), ...trucks.map((t) => val(t.details, 'vin'))].filter(Boolean);
  const initial: FormValues = trailer?.details ?? {
    type: 'Dry van', length: '53', status: 'Empty', location: IS_DEMO ? 'Yard · Modesto' : '', ownership: 'Owned', axles: 'Tandem', suspension: 'Air ride',
  };

  return (
    <RecordDialog
      heading={trailer ? `Edit trailer ${trailer.unit}` : 'New trailer'}
      saveLabel={trailer ? 'Save changes' : 'Add trailer'}
      sections={trailerSections(others.map((t) => t.unit), takenVins)}
      initial={initial}
      isNew={!trailer}
      archived={trailer?.archived}
      noun="trailer"
      recordLabel={trailer ? trailer.unit : 'this trailer'}
      deleteNote={`${trailer?.unit ?? 'The trailer'} is removed from the fleet for good. Loads keep their history. To keep the record but hide it (sold or returned), use Archive instead.`}
      onSave={(v) => saveTrailer(trailerFromForm(v, id, trailer))}
      onArchive={(a) => archiveTrailer(id, a)}
      onDelete={() => deleteTrailer(id)}
      onClose={onClose}
    />
  );
}
