import { Suspense, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppShell } from '../context/AppShellContext';
import { NAV, PAYROLL_PATH, PAYROLL_SECTION, SECTION_TABS, type ViewKey } from '../data/mock';
import { formatNow, todayIso, useNow } from '../lib/clock';
import { isActive, pageKeyOf } from '../lib/tableTools';
import { can, isSuperAdmin } from '../lib/auth';
import { daysFrom, invoiceTotal } from '../data/invoicing';
import { billingByLoad, isCovered, pipelineSteps, stageOf, statusForStage, withStatus, type LoadStatus } from '../data/loads';
import { USER } from '../data/mock';
import { downloadCsv } from '../lib/csv';
import { isLive } from '../lib/releases';
import { lazyNamed } from '../lib/lazyPage';
import { ErrorBoundary } from './ErrorBoundary';
import { describe, FilterPanel } from './FilterPanel';
import { Fa } from './Fa';
import { ThemeSwitch } from './ThemeSwitch';
import { faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons';

// The forms the top bar opens. Each is downloaded when it is first needed
// (not with the app), and fetched ahead of time for the page that is open so
// its button responds at once.
const forms = {
  load: () => import('./NewLoadDialog'),
  loadStatus: () => import('./LoadDialogs'),
  message: () => import('./MessageDriverDialog'),
  fleet: () => import('./FleetDialogs'),
  facility: () => import('./FacilityDialog'),
  invoice: () => import('./InvoiceDialog'),
  batch: () => import('./BatchDialog'),
  reminders: () => import('./ReminderDialog'),
  bill: () => import('./BillDialogs'),
  customer: () => import('./CustomerDialogs'),
  payroll: () => import('./PayrollDialogs'),
  hr: () => import('./HrDialogs'),
  safety: () => import('./SafetyDialogs'),
  company: () => import('./CompanyDialog'),
  account: () => import('./AccountDialog'),
};
const NewLoadDialog = lazyNamed(forms.load, 'NewLoadDialog');
const LoadStatusDialog = lazyNamed(forms.loadStatus, 'LoadStatusDialog');
const MoveBackDialog = lazyNamed(forms.loadStatus, 'MoveBackDialog');
const MessageDriverDialog = lazyNamed(forms.message, 'MessageDriverDialog');
const DriverDialog = lazyNamed(forms.fleet, 'DriverDialog');
const TruckDialog = lazyNamed(forms.fleet, 'TruckDialog');
const TrailerDialog = lazyNamed(forms.fleet, 'TrailerDialog');
const FacilityDialog = lazyNamed(forms.facility, 'FacilityDialog');
const InvoiceDialog = lazyNamed(forms.invoice, 'InvoiceDialog');
const BatchDialog = lazyNamed(forms.batch, 'BatchDialog');
const ReminderDialog = lazyNamed(forms.reminders, 'ReminderDialog');
const BillDialog = lazyNamed(forms.bill, 'BillDialog');
const CustomerDialog = lazyNamed(forms.customer, 'CustomerDialog');
const EmployeeDialog = lazyNamed(forms.payroll, 'EmployeeDialog');
const PayRunDialog = lazyNamed(forms.payroll, 'PayRunDialog');
const ContractDialog = lazyNamed(forms.hr, 'ContractDialog');
const OnboardingDialog = lazyNamed(forms.hr, 'OnboardingDialog');
const WorkOrderDialog = lazyNamed(forms.safety, 'WorkOrderDialog');
const RequestDocDialog = lazyNamed(forms.safety, 'RequestDocDialog');
const ViolationDialog = lazyNamed(forms.safety, 'ViolationDialog');
const ClaimDialog = lazyNamed(forms.safety, 'ClaimDialog');
const CompanyDialog = lazyNamed(forms.company, 'CompanyDialog');
const AccountDialog = lazyNamed(forms.account, 'AccountDialog');

// Which forms each page's buttons open (the keys match actionsFor below).
const FORMS_FOR: Record<string, (keyof typeof forms)[]> = {
  dashboard: ['load'], loads: ['load'], loadDetail: ['load', 'loadStatus', 'message'],
  'fleet/drivers': ['fleet'], 'fleet/trucks': ['fleet', 'safety'], 'fleet/trailers': ['fleet'],
  crm: ['customer'], facilities: ['facility'],
  'accounting/uninvoiced': ['invoice'], 'accounting/invoiced': ['invoice'], 'accounting/batches': ['batch'], 'accounting/past-due': ['reminders'],
  'accounting/payroll': ['payroll'], 'hr/payroll': ['payroll'], 'accounting/bills': ['bill'],
  'hr/employee-contracts': ['hr'], 'hr/onboarding': ['hr'],
  'safety/maintenance': ['safety'], 'safety/driver-documents': ['safety'], 'safety/violations': ['safety'], 'safety/settlements': ['safety'],
  'developer/account-manager': ['account', 'company'], 'developer/clients': ['account', 'company'], 'developer/accounts': ['account', 'company'],
};
const PREFETCH_AFTER_MS = 600;

interface HeadAction {
  label: string;
  primary?: boolean;
  // A second highlighted action beside the primary one, in its own colour.
  tone?: 'teal';
  onClick?: () => void;
}

// Screens with nothing to filter get no Filters button.
const NO_FILTERS: ViewKey[] = ['dashboard', 'planner'];

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { searchText, setQuery, approveAll, loads, invoices, updateLoad, filterMeta, filterValues, setFilter, clearFilters } = useAppShell();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const now = useNow(15_000);
  const [newLoadOpen, setNewLoadOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [adding, setAdding] = useState<'driver' | 'truck' | 'trailer' | 'facility' | 'invoice' | 'batch' | 'reminders' | 'company' | 'account' | 'bill' | 'customer' | 'employee' | 'payrun' | 'contract' | 'onboarding' | 'workorder' | 'docrequest' | 'violation' | 'claim' | 'loadstatus' | 'message' | 'moveback' | null>(null);
  // The status Update status opens with (a move forward that needs a confirm).
  const [statusTo, setStatusTo] = useState<LoadStatus | null>(null);

  // Route matching is case-insensitive, so normalise before keying off the section.
  const segments = location.pathname.toLowerCase().split('/');
  const view = (segments[2] || 'dashboard') as ViewKey;
  const tab = SECTION_TABS[view] ? segments[3] : undefined;
  const onLoadDetail = view === 'loads' && Boolean(segments[3]);
  const detailLoad = onLoadDetail ? loads.find((l) => l.id.toLowerCase() === segments[3]) : undefined;

  // Release 1.13: on a load's page, the top bar moves the load along its
  // pipeline (forward on the right, back in orange on the left, after a
  // warning) instead of Update status.
  const detailMoves = Boolean(detailLoad) && isLive('load-detail-moves');
  const detailStage = detailLoad && detailMoves ? stageOf(detailLoad, billingByLoad(invoices)) : null;
  const detailSteps = detailStage ? pipelineSteps(detailStage) : { back: null, next: null };
  const forwardLabel = detailSteps.next === 'Invoiced' ? 'Create invoice →' : detailSteps.next === 'Complete' ? 'Record payment →' : detailSteps.next ? `Move to ${detailSteps.next} →` : '';
  const moveForward = () => {
    const next = detailSteps.next;
    if (!detailLoad || !next) return;
    // Invoiced and Complete follow the invoice: they are made in Accounting.
    if (next === 'Invoiced') return navigate('/app/accounting/uninvoiced');
    if (next === 'Complete') return navigate('/app/accounting/invoiced');
    const to = statusForStage(next, isCovered(detailLoad));
    if (!to) return;
    // Delivering asks for the day it was delivered, and a load nobody is
    // hauling cannot set off: both open Update status to finish the move.
    if (to === 'Delivered' || (to !== 'Needs driver' && to !== 'Booked' && !isCovered(detailLoad))) {
      setStatusTo(to);
      setAdding('loadstatus');
      return;
    }
    updateLoad(withStatus(detailLoad, to, USER.name));
  };

  // Every load as a spreadsheet.
  const exportLoads = () =>
    downloadCsv(`runtruck-loads-${todayIso()}.csv`, [
      ['Load', 'Status', 'Customer', 'Reference', 'Route', 'Pickup', 'Delivery', 'Driver', 'Truck', 'Carrier', 'Equipment', 'Commodity', 'Weight', 'Miles', 'Rate'],
      ...loads.map((l) => [l.id, l.status, l.customer, l.ref, l.route, l.pickup, l.delivery, l.driver, l.unit, l.carrier, l.equip, l.commodity, l.weight, l.miles, l.rate]),
    ]);

  // Every paid invoice as a spreadsheet, most recently paid first.
  const exportPaid = () =>
    downloadCsv(`runtruck-paid-invoices-${todayIso()}.csv`, [
      ['Invoice', 'Customer', 'Loads', 'Issued', 'Paid on', 'Paid via', 'Days to pay', 'Amount'],
      ...invoices
        .filter((i) => i.paid)
        .sort((a, b) => (b.paid?.date ?? '').localeCompare(a.paid?.date ?? ''))
        .map((i) => [i.id, i.customer, i.loads.join(' '), i.issued, i.paid?.date ?? '', i.paid?.via ?? '', i.issued && i.paid?.date ? Math.max(0, daysFrom(i.issued, i.paid.date)) : '', invoiceTotal(i)]),
    ]);

  // Keyed by section, or section/tab for the tabbed sections. A button with
  // no onClick belongs to a release the company has not been given yet.
  // Super admins only: nobody else gets the buttons or the forms, even for
  // the instant before a mistyped address is turned away.
  const superAdmin = isSuperAdmin();
  const developer: HeadAction[] = superAdmin
    ? [
        { label: '+ Create company', primary: true, onClick: () => setAdding('company') },
        { label: '+ Create account', tone: 'teal', onClick: () => setAdding('account') },
      ]
    : [];
  const inactiveView = view === 'crm' && new URLSearchParams(location.search).get('view') === 'inactive';
  const archivedView = tab === 'payroll' && new URLSearchParams(location.search).get('view') === 'archived';
  const actionsFor: Record<string, HeadAction[]> = {
    // New Load from the Dashboard only for accounts that may open Loads.
    dashboard: can('loads') ? [{ label: '+ New Load', primary: true, onClick: () => setNewLoadOpen(true) }] : [],
    loads: [
      // Release 1.1 added Export here; 1.2 moved it to Settings › Export data.
      ...(isLive('loads-export') && !isLive('loads-export-moved') ? [{ label: 'Export', onClick: exportLoads }] : []),
      { label: '+ New Load', primary: true, onClick: () => setNewLoadOpen(true) },
    ],
    loadDetail: [
      // Release 1.10: the message popup (the button did nothing before).
      { label: 'Message driver', onClick: detailLoad && isLive('driver-message') ? () => setAdding('message') : undefined },
      ...(detailLoad ? [{ label: 'Edit load', onClick: () => setEditOpen(true) }] : []),
      // Release 1.9: the status is changed here (it could not be changed at all before).
      ...(detailMoves
        ? (forwardLabel ? [{ label: forwardLabel, primary: true, onClick: moveForward }] : [])
        : [{ label: 'Update status', primary: true, onClick: detailLoad && isLive('load-tracking') ? () => setAdding('loadstatus') : undefined }]),
    ],
    'fleet/drivers': [{ label: '+ Add Driver', primary: true, onClick: () => setAdding('driver') }],
    // Release 1.10: Log service opens the work order form.
    'fleet/trucks': [{ label: 'Log service', onClick: isLive('fleet-log-service') ? () => setAdding('workorder') : undefined }, { label: '+ Add Unit', primary: true, onClick: () => setAdding('truck') }],
    'fleet/trailers': [{ label: '+ Add Trailer', primary: true, onClick: () => setAdding('trailer') }],
    // Release 1.4: the inactive list and the Add Customer form.
    crm: isLive('crm-customers')
      ? [
          inactiveView
            ? { label: '← Active customers', onClick: () => navigate('/app/crm') }
            : { label: 'Inactive customers', onClick: () => navigate('/app/crm?view=inactive') },
          { label: '+ Add Customer', primary: true, onClick: () => setAdding('customer') },
        ]
      : [{ label: '+ Add Customer', primary: true }],
    facilities: [{ label: '+ Add Facility', primary: true, onClick: () => setAdding('facility') }],
    'accounting/uninvoiced': [{ label: '+ New Invoice', primary: true, onClick: () => setAdding('invoice') }],
    'accounting/invoiced': [{ label: '+ New Invoice', primary: true, onClick: () => setAdding('invoice') }],
    'accounting/batches': [{ label: '+ New Batch', primary: true, onClick: () => setAdding('batch') }],
    'accounting/past-due': [{ label: 'Send reminders', primary: true, onClick: () => setAdding('reminders') }],
    // Release 1.10: Export downloads the paid invoices.
    'accounting/paid': [{ label: 'Export', onClick: isLive('paid-export') ? exportPaid : undefined }],
    // Release 1.5: employees, the archived list and pay runs.
    [`${PAYROLL_SECTION}/payroll`]: isLive('payroll')
      ? [
          archivedView
            ? { label: '← Active employees', onClick: () => navigate(PAYROLL_PATH) }
            : { label: 'Archived', onClick: () => navigate(`${PAYROLL_PATH}?view=archived`) },
          { label: '+ Add employee', onClick: () => setAdding('employee') },
          { label: '+ New pay run', primary: true, onClick: () => setAdding('payrun') },
        ]
      : [{ label: 'Run settlements', primary: true, onClick: () => approveAll() }],
    // Release 1.3: Add Bill opens the new bill form.
    'accounting/bills': [{ label: '+ Add Bill', primary: true, onClick: isLive('bills-manage') ? () => setAdding('bill') : undefined }],
    // Release 1.7: the contract and onboarding popups.
    'hr/employee-contracts': [{ label: '+ New Contract', primary: true, onClick: isLive('hr-contracts') ? () => setAdding('contract') : undefined }],
    'hr/onboarding': [{ label: '+ Start Onboarding', primary: true, onClick: isLive('hr-onboarding') ? () => setAdding('onboarding') : undefined }],
    // Release 1.8: the safety popups.
    'safety/maintenance': [{ label: '+ Log Service', primary: true, onClick: isLive('safety-maintenance') ? () => setAdding('workorder') : undefined }],
    'safety/driver-documents': [{ label: 'Request document', primary: true, onClick: isLive('safety-documents') ? () => setAdding('docrequest') : undefined }],
    'safety/violations': [{ label: '+ Log Violation', primary: true, onClick: isLive('safety-violations') ? () => setAdding('violation') : undefined }],
    'safety/settlements': [{ label: '+ New Claim', primary: true, onClick: isLive('safety-claims') ? () => setAdding('claim') : undefined }],
    'developer/account-manager': developer,
    'developer/clients': developer,
    'developer/accounts': developer,
  };
  const actionKey = onLoadDetail ? 'loadDetail' : tab ? `${view}/${tab}` : view;
  const headActions = actionsFor[actionKey] ?? [];
  // Fetch this page's forms once it has settled, so the buttons open them at once.
  useEffect(() => {
    const wanted = FORMS_FOR[actionKey];
    if (!wanted) return;
    const t = window.setTimeout(() => {
      // A failed prefetch is not an error: the form is fetched again when opened.
      for (const f of wanted) forms[f]().catch(() => undefined);
    }, PREFETCH_AFTER_MS);
    return () => window.clearTimeout(t);
  }, [actionKey]);
  const page = pageKeyOf(location.pathname);
  const meta = filterMeta[page] ?? [];
  const values = filterValues[page] ?? {};
  const activeFilters = meta.filter((m) => isActive(values[m.key]));
  const showFilters = !onLoadDetail && !NO_FILTERS.includes(view) && meta.length > 0;
  const navLabel = NAV.find((n) => 'key' in n && n.key === view);
  const pageTitle = [navLabel && 'label' in navLabel ? navLabel.label : view, tab ? SECTION_TABS[view]?.find((t) => t.key === tab)?.label : ''].filter(Boolean).join(' › ');

  return (
    <>
    <header className="ui-topbar">
      {/* Release 1.22: the search (or, on a load's page, the way back) and the
          clock, theme and page buttons each sit on their own floating card. */}
      {onLoadDetail ? (
        <div className="ui-island ui-topbar-left">
          <button onClick={() => navigate('/app/loads')} className="ui-btn" type="button">
            ← Loads
          </button>
          {detailMoves && detailSteps.back && (
            <button onClick={() => setAdding('moveback')} className="ui-btn ui-btn-orange" type="button">
              ← Back to {detailSteps.back}
            </button>
          )}
        </div>
      ) : (
        <label className="ui-island ui-topbar-left ui-search-island">
          <Fa icon={faMagnifyingGlass} className="ui-search-icon" />
          <input
            className="ui-search"
            value={searchText}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            aria-label="Search"
          />
        </label>
      )}
      <div className="ui-island ui-topbar-right">
        <time className="ui-clock" dateTime={now.toISOString()} title={formatNow(now, { dateStyle: 'full', timeStyle: 'long' })}>
          <span className="ui-clock-date">{formatNow(now, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
          <span>{formatNow(now, { hour: 'numeric', minute: '2-digit' })}</span>
        </time>
        <ThemeSwitch />
        {showFilters && (
          <button className={`ui-btn ui-filters-btn${activeFilters.length ? ' is-on' : ''}`} type="button" onClick={() => setFiltersOpen(true)} aria-haspopup="dialog">
            Filters{activeFilters.length > 0 && <span className="ui-filters-count">{activeFilters.length}</span>}
          </button>
        )}
        {headActions.map((a) => (
          <button key={a.label} onClick={a.onClick} className={`ui-btn${a.primary ? ' ui-btn-primary' : ''}${a.tone ? ` ui-btn-${a.tone}` : ''}`} type="button">
            {a.label}
          </button>
        ))}
      </div>
      {/* A form that fails closes into a one-line notice; the top bar stays. */}
      <ErrorBoundary where="Form" variant="strip" resetKey={`${adding}${newLoadOpen}${editOpen}`} onDismiss={() => { setAdding(null); setNewLoadOpen(false); setEditOpen(false); }}>
      <Suspense fallback={null}>
      {newLoadOpen && (
        <NewLoadDialog onClose={() => setNewLoadOpen(false)} onSaved={(id) => navigate(`/app/loads/${id}`)} />
      )}
      {editOpen && detailLoad && (
        <NewLoadDialog load={detailLoad} onClose={() => setEditOpen(false)} onDeleted={() => { setEditOpen(false); navigate('/app/loads'); }} />
      )}
      {adding === 'loadstatus' && detailLoad && <LoadStatusDialog load={detailLoad} to={statusTo ?? undefined} onClose={() => { setAdding(null); setStatusTo(null); }} />}
      {adding === 'moveback' && detailLoad && detailSteps.back && <MoveBackDialog load={detailLoad} back={detailSteps.back} onClose={() => setAdding(null)} />}
      {adding === 'message' && detailLoad && <MessageDriverDialog load={detailLoad} onClose={() => setAdding(null)} />}
      {adding === 'driver' && <DriverDialog onClose={() => setAdding(null)} />}
      {adding === 'truck' && <TruckDialog onClose={() => setAdding(null)} />}
      {adding === 'trailer' && <TrailerDialog onClose={() => setAdding(null)} />}
      {adding === 'facility' && <FacilityDialog onClose={() => setAdding(null)} />}
      {adding === 'invoice' && <InvoiceDialog onClose={() => setAdding(null)} />}
      {adding === 'batch' && <BatchDialog onClose={() => setAdding(null)} />}
      {adding === 'reminders' && <ReminderDialog onClose={() => setAdding(null)} />}
      {adding === 'bill' && <BillDialog onClose={() => setAdding(null)} />}
      {adding === 'customer' && <CustomerDialog onClose={() => setAdding(null)} />}
      {adding === 'employee' && <EmployeeDialog onClose={() => setAdding(null)} />}
      {adding === 'payrun' && <PayRunDialog onClose={() => setAdding(null)} onCreated={() => navigate(PAYROLL_PATH)} />}
      {adding === 'contract' && <ContractDialog onClose={() => setAdding(null)} />}
      {adding === 'workorder' && <WorkOrderDialog onClose={() => setAdding(null)} />}
      {adding === 'docrequest' && <RequestDocDialog onClose={() => setAdding(null)} />}
      {adding === 'violation' && <ViolationDialog onClose={() => setAdding(null)} />}
      {adding === 'claim' && <ClaimDialog onClose={() => setAdding(null)} />}
      {adding === 'onboarding' && <OnboardingDialog onClose={() => setAdding(null)} />}
      {superAdmin && adding === 'company' && <CompanyDialog onClose={() => setAdding(null)} />}
      {superAdmin && adding === 'account' && <AccountDialog onClose={() => setAdding(null)} />}
      </Suspense>
      </ErrorBoundary>
      {filtersOpen && <FilterPanel page={page} title={pageTitle} onClose={() => setFiltersOpen(false)} />}
    </header>
    {showFilters && activeFilters.length > 0 && (
      <div className="ui-filterbar" role="region" aria-label="Active filters">
        {activeFilters.map((m) => (
          <span key={m.key} className="ui-filter-chip">
            <button type="button" className="ui-filter-chip-text" onClick={() => setFiltersOpen(true)}>{describe(m, values[m.key])}</button>
            <button type="button" className="ui-filter-chip-x" aria-label={`Remove ${m.label} filter`} onClick={() => setFilter(page, m.key, undefined)}>×</button>
          </span>
        ))}
        <button type="button" className="ui-link" onClick={() => clearFilters(page)}>Clear all</button>
      </div>
    )}
    </>
  );
}
