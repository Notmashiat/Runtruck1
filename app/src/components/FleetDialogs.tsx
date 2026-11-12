import { useAppShell } from '../context/AppShellContext';
import {
  CDL_CLASSES, DISPATCHERS, DRIVER_STATUSES, DRIVER_TYPES, DRIVING_MODES, ENDORSEMENTS, PAY_TYPES, TERMINALS,
  driverFromForm, drivingModeOf, nextId,
  type FleetDriver, type FleetTrailer, type FleetTruck, type FormValues,
} from '../data/fleet';
import { USER } from '../data/mock';
import { PHONE, POSITIVE, STATE, UNIQUE, ZIP } from '../lib/rules';
import { RecordDialog, type SectionSpec } from './RecordDialog';
import { FleetUnitDialog } from './FleetUnitDialog';
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

// Trucks and trailers use the Add fleet unit popup (release 1.36).
export function TruckDialog({ truck, onClose }: { truck?: FleetTruck; onClose: () => void }) {
  return <FleetUnitDialog kind="truck" truck={truck} onClose={onClose} />;
}

export function TrailerDialog({ trailer, onClose }: { trailer?: FleetTrailer; onClose: () => void }) {
  return <FleetUnitDialog kind="trailer" trailer={trailer} onClose={onClose} />;
}
